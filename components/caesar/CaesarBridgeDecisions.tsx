"use client";

/**
 * What the bridge's own server-side engine is computing right now — read-only, next to (never
 * instead of) the browser's own Stream tabs.
 *
 * WHY THIS EXISTS. Arbitrage and PairFlux already run server-side, in shadow: the bridge computes
 * the same candidates and positions the browser tab does, but until now there was no way to SEE
 * that computation — only a flat, already-decided intent log
 * (CaesarPlanController.Engine/GET api/stream/caesar/engine). This panel is the first real window
 * onto the bridge's live screen: the same rows a Stream tab renders for itself, sourced from the
 * bridge instead of computed a second time in this tab.
 *
 * WHAT THIS DOES NOT DO. It does not change who dispatches. Shadow mode, AutoEnabled and the
 * browser-vs-bridge dispatch-ownership handshake (StreamStrategyRegistry) are all untouched by
 * this panel — it only reads GET api/stream/caesar/engine/{arbitrage,pairflux}. Cutting a strategy
 * over to the bridge for real stays a separate, deliberate step for later.
 */

import React, { useEffect, useMemo, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import { getLiveStrategyByBridgeId } from "@/lib/strategies/registry";

type StreamCandidateRow = {
  ticker: string;
  pairKey: string | null;
  side: string;
  signal: number | null;
  spread: number | null;
  netEdge: number;
  status: string;
  reason: string;
  latched: boolean;
  qualifiedSinceMinuteIdx: number | null;
  readyToEnter: boolean;
  /**
   * Status/Reason above come from signal-vs-filter logic alone and have no idea what time it is,
   * so a row can sit at EntryReady/"signal passes filters" long after the session's entry cutoff
   * has passed and dispatch has already stopped picking anything. readyToEnter already folds this
   * in (false once blocked); this field is for saying WHY — and specifically that it's the LATE
   * gate, not the EARLY one below (an operator caught these two collapsed into one misleading
   * "past cutoff" label on 2026-09-17, for a row that was actually blocked for the opposite reason).
   */
  entryCutoffBlocked: boolean;
  /** Same idea, opposite gate: the session hasn't started yet. Not a problem, just a wait. */
  entryBeforeSessionStart: boolean;
};

type StreamOpenPosition = {
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  side: string;
  priority: number;
  entryDispatched: boolean;
  entrySignal: number | null;
  entryCount: number;
  openedAtUtc: string;
  lastReason: string;
  /** OpenDoor family only: the absolute instant this position's fixed exit lands at. */
  fixedExitAtUtc: string | null;
  /** The ratings-table stats behind the position — see TrackedPosition's own doc comment on the bridge. */
  beta: number | null;
  corr: number | null;
  sigma: number | null;
};

type StreamEngineSnapshot = {
  strategyId: string;
  asOfUtc: string | null;
  asOfMinuteIdx: number | null;
  candidates: StreamCandidateRow[];
  positions: StreamOpenPosition[];
  /**
   * Why the last tick found zero candidates, or null once it found any — see
   * ServerStrategyRunner.MarkOutOfPlan / RecordNoData. The exact string below is the one MarkOutOfPlan
   * sets when the operator's own plan toggle for this strategy is off (or the clock left its
   * segment) — everything else that can land here is a real "ticked, found nothing" reading, not a
   * disabled state, so only this one string drives the grayed-out treatment.
   */
  noDataReason: string | null;
  /**
   * How many more positions dispatch will actually open right now — MaxOpenPositions minus open
   * positions, null meaning uncapped. Nothing else on this screen says so: a full book silently
   * refuses every new candidate (adds to what's already open are unaffected, since they don't need
   * a new slot), and a row that is Status=EntryReady / readyToEnter=true can still just sit there
   * forever with no per-row marker — dispatch hands slots out alphabetically by ticker until they
   * run out, in ServerStrategyRunner's own selection, not per candidate. This count is the whole
   * story: 0 explains a screen full of ready-looking rows that never moved (operator-reported
   * incident, 2026-09-17 — Arbitrage candidates piling up at 7am while only adds kept firing).
   */
  entrySlotsFree: number | null;
};

const OUT_OF_PLAN_REASON = "not currently assigned/enabled by the Caesar plan";

type SnapshotResponse = { ok: boolean; snapshot: StreamEngineSnapshot };
type AllPositionsResponse = { ok: boolean; positions: StreamOpenPosition[] };

// Tightened from 6s: the backend now force-re-evaluates immediately on a plan edit, schedule
// toggle, or Start/Stop (ServerStrategyRunner.ForceReEvaluate) — this poll is the other half of
// "the operator sees it right away". A plain GET against an already-computed snapshot (no strategy
// evaluation happens here), so tightening it costs one small request more per cycle, not more work.
const POLL_MS = 2_000;

/** Countdown/target-time for a fixed exit — "in Ns" while pending, "Ns ago" once past (queued, not yet dispatched). */
function fmtFixedExit(fixedExitAtUtc: string | null): { text: string; tone: string } {
  if (fixedExitAtUtc == null) return { text: "—", tone: "text-zinc-600" };
  const deltaSeconds = (new Date(fixedExitAtUtc).getTime() - Date.now()) / 1000;
  if (deltaSeconds <= 0) return { text: `${fmt(-deltaSeconds, 0)}s ago`, tone: "text-amber-300" };
  if (deltaSeconds < 3600) return { text: `in ${fmt(deltaSeconds, 0)}s`, tone: "text-zinc-300" };
  return { text: `in ${fmt(deltaSeconds / 60, 0)}m`, tone: "text-zinc-400" };
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function sideTone(side: string): string {
  return side === "Short" ? "text-rose-300" : "text-emerald-300";
}

function statusTone(status: string): string {
  return status === "EntryReady" ? "text-emerald-300" : "text-zinc-500";
}

/**
 * Fixed Tailwind hex classes, not a CSS-variable-driven token — Caesar forces a dark surface in
 * every theme already (see CaesarSchedule.tsx's own note on why), but the point of using these
 * specific classes rather than a themed one is that a sign always reads the same regardless of
 * where this ever renders.
 */
function signTone(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "text-zinc-500";
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-500";
}

/** One strategy's live snapshot, polled independently so one strategy's fetch failure never blanks the other. */
function useStreamEngineSnapshot(strategy: "arbitrage" | "pairflux") {
  const [snapshot, setSnapshot] = useState<StreamEngineSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchSnapshot = () =>
      fetchWithTimeout(bridgeUrl(`/api/stream/caesar/engine/${strategy}`), { cache: "no-store" })
        .then((res) => res.json() as Promise<SnapshotResponse>)
        .then((body) => body.snapshot);
    const unsubscribe = subscribeSharedPoll(`bridge-${strategy}-decisions`, fetchSnapshot, POLL_MS, (value, err) => {
      if (!alive) return;
      if (err) {
        setError(err);
      } else {
        setSnapshot(value);
        setError(null);
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, [strategy]);

  return { snapshot, error };
}

/**
 * Every strategy's open positions in one flat list — the only window onto the OpenDoor family
 * (OpenDoor/DayTwo/OpenFade/OpenRide), which has no candidate screen of its own: entry, then a
 * fixed-time exit, nothing in between.
 */
function useAllPositions() {
  const [positions, setPositions] = useState<StreamOpenPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asOfUtc, setAsOfUtc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchAll = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<AllPositionsResponse>)
        .then((body) => body.positions);
    const unsubscribe = subscribeSharedPoll("bridge-all-positions", fetchAll, POLL_MS, (value, err) => {
      if (!alive) return;
      if (err) {
        setError(err);
      } else {
        setPositions(value);
        setAsOfUtc(new Date().toISOString());
        setError(null);
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  return { positions, error, asOfUtc };
}

type CaesarPlanRunningResponse = { ok: boolean; running: Record<string, boolean> };

/**
 * Which strategy ids the Caesar plan currently assigns and enables for the segment the clock is
 * in right now — the same `ShouldRun` verdict CaesarPlanController.GetPlan already computes, keyed
 * by bridge strategy id (e.g. "stream.opendoor"). Used to show only the OpenDoor-family strategies
 * that are actually live on this segment, instead of all four all the time.
 */
function useCaesarPlanRunning() {
  const [running, setRunning] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchRunning = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/plan"), { cache: "no-store" })
        .then((res) => res.json() as Promise<CaesarPlanRunningResponse>)
        .then((body) => body.running ?? {});
    const unsubscribe = subscribeSharedPoll("bridge-caesar-plan-running", fetchRunning, POLL_MS, (value, err) => {
      if (!alive) return;
      if (err) {
        setError(err);
      } else {
        setRunning(value);
        setError(null);
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  return { running, error };
}

function AgeBadge({ asOfUtc }: { asOfUtc: string | null }) {
  // Absolute timestamp, not a server-computed age — recomputed from Date.now() on every poll tick
  // (6s granularity), close enough to tell "live" from "stalled" without a per-second re-render.
  if (asOfUtc == null) {
    return (
      <span className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
        never ticked
      </span>
    );
  }
  const ageSeconds = (Date.now() - new Date(asOfUtc).getTime()) / 1000;
  const stale = ageSeconds > 90;
  return (
    <span
      className={
        "rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-widest " +
        (stale
          ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
          : "border-white/[0.06] bg-black/25 text-zinc-500")
      }
    >
      {fmt(ageSeconds, 0)}s ago
    </span>
  );
}

// Same visual language as the Stream tab's own ACTIVE/SIGNALS cards (ArbitrageStreamView.tsx's
// StreamDecisionTable): a rounded card, a header bar with a mono uppercase title plus a count
// badge, a sticky grid header row where every column carries its own accent color, and zebra-
// striped body rows. Caesar's own columns differ (Pair/Latch/Reason instead of Stream's
// add-ladder fields), so this is the same TREATMENT applied to Caesar's own data, not a literal
// copy of Stream's column set.
const CANDIDATES_GRID_COLS =
  "minmax(0,0.7fr) minmax(0,0.9fr) minmax(0,0.6fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,1.3fr)";
const POSITIONS_GRID_COLS =
  "minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,1.5fr)";

// Same fixed height + internal scroll as the Stream tab's own ACTIVE/SIGNALS cards
// (ArbitrageStreamView.tsx's STREAM_PANEL_HEIGHT) — the card itself never grows with row count,
// the row list scrolls inside it instead.
const PANEL_HEIGHT = "h-[320px]";

function PanelCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`scanner-panel-surface flex flex-col overflow-hidden rounded-xl bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${PANEL_HEIGHT}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 bg-[#0a0a0a]/40 px-3 py-2 backdrop-blur-xl">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">{title}</div>
        <div className="font-mono text-[10px] uppercase text-zinc-500">{count}</div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function CandidatesTable({ rows }: { rows: StreamCandidateRow[] }) {
  return (
    <PanelCard title="Signals" count={rows.length}>
      <div
        className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-xs font-mono text-zinc-300 backdrop-blur-xl [&>div]:min-w-0 [&>div]:overflow-hidden [&>div]:whitespace-nowrap"
        style={{ display: "grid", gridTemplateColumns: CANDIDATES_GRID_COLS }}
      >
        <div className="px-2 py-2.5 text-left text-zinc-200">Ticker</div>
        <div className="px-2 py-2.5 text-left text-sky-300/70">Pair</div>
        <div className="px-2 py-2.5 text-left text-violet-300/80">Side</div>
        <div className="px-2 py-2.5 text-right text-violet-300">Signal</div>
        <div className="px-2 py-2.5 text-right text-amber-400/80">Spread</div>
        <div className="px-2 py-2.5 text-right text-emerald-300/80">Net Edge</div>
        <div className="px-2 py-2.5 text-left text-teal-300/80">Status</div>
        <div className="px-2 py-2.5 text-left text-pink-400/80">Latch</div>
        <div className="px-2 py-2.5 text-left text-zinc-500">Reason</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs font-mono text-zinc-500">no candidates this minute</div>
      ) : (
        <div className="text-xs font-mono">
          {rows.map((r, i) => (
            <div
              key={`${r.ticker}|${r.pairKey ?? ""}|${i}`}
              className={`items-center border-t border-white/5 transition-colors [&>div]:min-w-0 [&>div]:overflow-hidden [&>div]:whitespace-nowrap ${i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"} hover:bg-white/[0.03]`}
              style={{ display: "grid", gridTemplateColumns: CANDIDATES_GRID_COLS }}
            >
              <div className="px-2 py-2.5 font-semibold text-zinc-100">{r.ticker}</div>
              <div className="px-2 py-2.5 text-zinc-400">{r.pairKey ?? "—"}</div>
              <div className={`px-2 py-2.5 ${sideTone(r.side)}`}>{r.side}</div>
              <div className={`px-2 py-2.5 text-right tabular-nums ${signTone(r.signal)}`}>{fmt(r.signal)}</div>
              <div className="px-2 py-2.5 text-right tabular-nums text-zinc-200">{fmt(r.spread)}</div>
              <div className="px-2 py-2.5 text-right tabular-nums text-zinc-200">{fmt(r.netEdge)}</div>
              <div className={`px-2 py-2.5 ${statusTone(r.status)}`}>{r.status}</div>
              <div
                className={`px-2 py-2.5 ${
                  r.entryCutoffBlocked
                    ? "text-rose-300/80"
                    : r.entryBeforeSessionStart
                    ? "text-sky-300/70"
                    : r.readyToEnter
                    ? "text-emerald-300"
                    : r.latched
                    ? "text-amber-300"
                    : "text-zinc-600"
                }`}
                title={
                  r.entryCutoffBlocked
                    ? "Session's entry cutoff has passed — this will never be picked, no matter the status above."
                    : r.entryBeforeSessionStart
                    ? "Session hasn't started yet — not a problem, just a wait."
                    : undefined
                }
              >
                {r.entryCutoffBlocked ? "past cutoff" : r.entryBeforeSessionStart ? "not started" : r.readyToEnter ? "ready" : r.latched ? "holding" : "—"}
              </div>
              <div className="px-2 py-2.5 text-zinc-600">{r.reason}</div>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function PositionsTable({ rows }: { rows: StreamOpenPosition[] }) {
  return (
    <PanelCard title="Positions" count={rows.length}>
      <div
        className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-xs font-mono text-zinc-300 backdrop-blur-xl [&>div]:min-w-0 [&>div]:overflow-hidden [&>div]:whitespace-nowrap"
        style={{ display: "grid", gridTemplateColumns: POSITIONS_GRID_COLS }}
      >
        <div className="px-2 py-2.5 text-left text-zinc-200">Ticker</div>
        <div className="px-2 py-2.5 text-left text-sky-300/70">Pair</div>
        <div className="px-2 py-2.5 text-left text-violet-300/80">Side</div>
        <div className="px-2 py-2.5 text-right text-amber-400/80">Adds</div>
        <div className="px-2 py-2.5 text-left text-emerald-300/80">Dispatched</div>
        <div className="px-2 py-2.5 text-left text-teal-300/80">Fixed exit</div>
        <div className="px-2 py-2.5 text-left text-zinc-500">Last reason</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs font-mono text-zinc-500">no open positions</div>
      ) : (
        <div className="text-xs font-mono">
          {rows.map((p, i) => {
            const fixedExit = fmtFixedExit(p.fixedExitAtUtc);
            return (
              <div
                key={`${p.ticker}|${p.pairKey ?? ""}|${i}`}
                className={`items-center border-t border-white/5 transition-colors [&>div]:min-w-0 [&>div]:overflow-hidden [&>div]:whitespace-nowrap ${i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"} hover:bg-white/[0.03]`}
                style={{ display: "grid", gridTemplateColumns: POSITIONS_GRID_COLS }}
              >
                <div className="px-2 py-2.5 font-semibold text-zinc-100">{p.ticker}</div>
                <div className="px-2 py-2.5 text-zinc-400">{p.pairKey ?? "—"}</div>
                <div className={`px-2 py-2.5 ${sideTone(p.side)}`}>{p.side}</div>
                <div className="px-2 py-2.5 text-right tabular-nums text-zinc-300">{Math.max(0, p.entryCount - 1)}</div>
                <div className={`px-2 py-2.5 ${p.entryDispatched ? "text-zinc-400" : "text-amber-300"}`}>
                  {p.entryDispatched ? "yes" : "shadow only"}
                </div>
                <div className={`px-2 py-2.5 ${fixedExit.tone}`}>{fixedExit.text}</div>
                <div className="px-2 py-2.5 text-zinc-600">{p.lastReason}</div>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

/**
 * The one header every strategy card in this window uses — label, an optional "disabled" badge,
 * and the age badge on the right. Every strategy (Arbitrage/PairFlux with a candidate screen, the
 * OpenDoor family with only positions) renders this exact row so the cards read as one family of
 * tiles rather than two different components glued together.
 */
function StrategyCardHeader({
  label,
  outOfPlan,
  asOfUtc,
  entrySlotsFree,
}: {
  label: string;
  outOfPlan: boolean;
  asOfUtc: string | null;
  /** Undefined where the concept doesn't apply (the OpenDoor family has no candidate screen). */
  entrySlotsFree?: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        {outOfPlan && (
          <span className="rounded border border-zinc-600/40 bg-zinc-800/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            disabled — nothing sent
          </span>
        )}
        {entrySlotsFree != null && (
          <span
            className={
              "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
              (entrySlotsFree === 0
                ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-300"
                : "border-white/[0.06] bg-black/25 text-zinc-500")
            }
            title="Free entry slots (MaxOpenPositions minus open positions) — 0 silently refuses every new candidate; adds to already-open positions are unaffected."
          >
            {entrySlotsFree === 0 ? "0 slots free" : `${entrySlotsFree} slots free`}
          </span>
        )}
        <AgeBadge asOfUtc={asOfUtc} />
      </div>
    </div>
  );
}

/** Same identity PositionsTable/CandidatesTable key their rows by: ticker, or ticker+pair. */
function legIdentity(ticker: string, pairKey: string | null): string {
  return `${ticker.trim().toUpperCase()}|${(pairKey ?? "").trim().toUpperCase()}`;
}

function StrategySection({ strategy, label }: { strategy: "arbitrage" | "pairflux"; label: string }) {
  const { snapshot, error } = useStreamEngineSnapshot(strategy);
  // Only this exact reason means "the operator's own plan toggle is off" — any other noDataReason
  // is a real "ticked, found nothing" answer and must not read as disabled.
  const outOfPlan = snapshot?.noDataReason === OUT_OF_PLAN_REASON;

  // A candidate that already opened is now a POSITION, not a signal — the row belongs in the
  // table below, once, not in both at the same time. The engine itself keeps computing a signal
  // reading for it (an open position still needs its own live number for adds/exits), so this is
  // purely a display decision, not a change to what the bridge tracks.
  const openIdentities = new Set(
    (snapshot?.positions ?? []).map((p) => legIdentity(p.ticker, p.pairKey)),
  );
  const candidateRows = (snapshot?.candidates ?? []).filter(
    (c) => !openIdentities.has(legIdentity(c.ticker, c.pairKey)),
  );

  return (
    <div
      className={
        "scanner-glass-card min-w-0 space-y-2 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 p-3 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80" +
        (outOfPlan ? " opacity-40 grayscale" : "")
      }
    >
      <StrategyCardHeader
        label={label}
        outOfPlan={outOfPlan}
        asOfUtc={snapshot?.asOfUtc ?? null}
        entrySlotsFree={snapshot?.entrySlotsFree}
      />

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {!error && (
        <div className="space-y-2">
          <CandidatesTable rows={candidateRows} />
          <PositionsTable rows={snapshot?.positions ?? []} />
        </div>
      )}
    </div>
  );
}

const OPEN_DOOR_FAMILY: Record<string, string> = {
  "stream.opendoor": "OpenDoor",
  "stream.daytwo": "Day Two",
  "stream.openfade": "OpenFade",
  "stream.openride": "OpenRide",
};

/**
 * OpenDoor/DayTwo/OpenFade/OpenRide: no candidate screen (entry is a single snapshot, not a
 * continuously re-evaluated deviation), so positions are the whole live picture for this family.
 * One shared poll, grouped by strategy, rather than four separate per-strategy sections — none of
 * the four has anything else to show.
 *
 * Only shown once the Caesar plan actually assigns+enables it on the current segment (or it still
 * holds an open position, so an exit is never hidden just because the segment moved on) — a
 * strategy that is off the plan is not a "0 open" row here, it is simply absent, same treatment as
 * Arbitrage/PairFlux going gray for the same reason above.
 */
function OpenDoorFamilySection() {
  const { positions, error, asOfUtc } = useAllPositions();
  const { running } = useCaesarPlanRunning();
  const family = (positions ?? []).filter((p) => p.strategyId in OPEN_DOOR_FAMILY);
  const grouped = Object.keys(OPEN_DOOR_FAMILY)
    .map((strategyId) => ({
      strategyId,
      label: OPEN_DOOR_FAMILY[strategyId],
      rows: family.filter((p) => p.strategyId === strategyId),
    }))
    .filter((g) => g.rows.length > 0 || running?.[g.strategyId] === true);

  return (
    <div className="mt-3">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {!error && positions == null && (
        <div className="px-3 py-4 text-center font-mono text-[11px] text-zinc-600">loading…</div>
      )}

      {!error && positions != null && (
        grouped.length === 0 ? (
          <div className="px-3 py-4 text-center font-mono text-[11px] text-zinc-600">
            nothing assigned to the current segment
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {grouped.map(({ strategyId, label, rows }) => {
              // Grayed the same way Arbitrage/PairFlux are above: shown (because it still holds a
              // position) but the plan is not currently sending it anything new.
              const outOfPlan = running?.[strategyId] !== true;
              return (
                <div
                  key={strategyId}
                  className={
                    "scanner-glass-card min-w-0 space-y-2 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 p-3 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80" +
                    (outOfPlan ? " opacity-40 grayscale" : "")
                  }
                >
                  <StrategyCardHeader label={label} outOfPlan={outOfPlan} asOfUtc={asOfUtc} />
                  <PositionsTable rows={rows} />
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

/** One position as the account itself reports it — same shape CaesarPositions.tsx reads. */
type AccountPosition = {
  ticker?: string | null;
  openPnL?: number | null;
  closedPnL?: number | null;
  isFlat?: boolean | null;
};

/**
 * Ticker -> the account's own realised+unrealised total, straight from TradingApp — the money
 * ServerPositionTracker itself never carries (it tracks a signal, not a fill price). Shares
 * CaesarPositions'/CaesarCharts' identical poll under the same key rather than running a fourth
 * independent one against the same endpoint.
 */
function useAccountPnlByTicker() {
  const [byTicker, setByTicker] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let alive = true;
    const fetchPositions = () =>
      fetchWithTimeout(bridgeUrl("/api/execution/tradingapp/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ positions?: AccountPosition[] }>);
    const unsubscribe = subscribeSharedPoll("account-positions", fetchPositions, POLL_MS, (json, err) => {
      if (!alive || err || !json) return;
      const map = new Map<string, number>();
      for (const p of json.positions ?? []) {
        const ticker = (p.ticker ?? "").trim().toUpperCase();
        if (!ticker) continue;
        const openPnl = p.isFlat ? 0 : p.openPnL ?? 0;
        const closedPnl = p.closedPnL ?? 0;
        map.set(ticker, openPnl + closedPnl);
      }
      setByTicker(map);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  return byTicker;
}

type SituationRow = {
  key: string;
  label: string;
  strategyId: string;
  side: string;
  entryCount: number;
  /** Null for a single-leg (Arbitrage/OpenDoor-family) row — there is no second leg to show. */
  legAPnl: number;
  legBPnl: number | null;
  totalPnl: number;
  signal: number | null;
  beta: number | null;
  corr: number | null;
  sigma: number | null;
};

/** Fixed per-strategy colour, not the position-in-list palette the charts above use — a strategy
    reads the same colour everywhere on this table regardless of what else is open right now. */
const STRATEGY_COLORS: Record<string, string> = {
  arbitrage: "#a78bfa",
  pairflux: "#fb923c",
  opendoor: "#22d3ee",
  daytwo: "#facc15",
  openfade: "#60a5fa",
  openride: "#818cf8",
};
function strategyColor(key: string): string {
  return STRATEGY_COLORS[key.toLowerCase()] ?? "#9ca3af";
}

/**
 * Every open situation across every strategy. PairFlux always shows as one row per pair — both
 * legs' own P&L plus their sum, never split back into two unrelated-looking rows — the operator's
 * own request (2026-09-18): watching two legs as two rows hides that they are one bet. Arbitrage
 * (and the OpenDoor family) has no second leg, so that column simply reads "—" for it.
 *
 * A ticker legging two pairs at once (PairFlux can do that — ServerPositionTracker.FindAll's own
 * doc comment) will show its own account P&L inside BOTH pairs' own rows; the account gives one
 * blended number for the ticker, so each pair's row is showing the true current number for it,
 * not a double-counted one. The header TOTAL does not have this problem — it sums each ticker's
 * own P&L once, straight from the account, never once per row it happens to appear in.
 */
function AllSituationsSection() {
  const { positions } = useAllPositions();
  const accountPnlByTicker = useAccountPnlByTicker();
  const [strategySort, setStrategySort] = useState<0 | 1 | -1>(0);

  const rows = useMemo<SituationRow[]>(() => {
    const list = positions ?? [];
    const byPairKey = new Map<string, StreamOpenPosition[]>();
    const singles: StreamOpenPosition[] = [];
    for (const p of list) {
      if (p.pairKey) {
        const arr = byPairKey.get(p.pairKey) ?? [];
        arr.push(p);
        byPairKey.set(p.pairKey, arr);
      } else {
        singles.push(p);
      }
    }

    // How many currently-open pairs a ticker is legging at once. PairFlux enters every leg at
    // equal size (never β-weighted the way Arbitrage's hedge is — see the strategy's own sizing
    // rule), so the account's one blended number for a ticker legging N pairs splits evenly N
    // ways rather than being credited whole to each pair it happens to sit in (the operator's own
    // correction, 2026-09-18) — for a ticker in only one pair this divides by 1 and changes
    // nothing.
    const pairCountByTicker = new Map<string, number>();
    for (const legs of byPairKey.values()) {
      for (const leg of legs) {
        const t = leg.ticker.trim().toUpperCase();
        pairCountByTicker.set(t, (pairCountByTicker.get(t) ?? 0) + 1);
      }
    }
    const tickerPnl = (ticker: string) => {
      const t = ticker.trim().toUpperCase();
      const raw = accountPnlByTicker.get(t) ?? 0;
      const shareCount = pairCountByTicker.get(t) ?? 1;
      return shareCount > 0 ? raw / shareCount : raw;
    };

    const out: SituationRow[] = [];
    for (const [pairKey, legs] of byPairKey) {
      const [legA, legB] = legs;
      const legAPnl = legA ? tickerPnl(legA.ticker) : 0;
      const legBPnl = legB ? tickerPnl(legB.ticker) : null;
      out.push({
        key: `pair:${pairKey}`,
        label: legs.map((l) => l.ticker).join(" / "),
        strategyId: legA?.strategyId ?? "",
        side: legs.map((l) => l.side).join(" / "),
        entryCount: Math.max(1, ...legs.map((l) => l.entryCount)),
        legAPnl,
        legBPnl,
        totalPnl: legAPnl + (legBPnl ?? 0),
        // PairFlux's own signal/beta/corr/sigma are pair-level — the same value on both legs
        // (see PairFluxServerStrategy), so either leg's own copy of it is the pair's.
        signal: legA?.entrySignal ?? null,
        beta: legA?.beta ?? null,
        corr: legA?.corr ?? null,
        sigma: legA?.sigma ?? null,
      });
    }
    for (const p of singles) {
      // No divisor here — pairCountByTicker only counts PairFlux pair legs, and a single-leg
      // position (Arbitrage, OpenDoor family) reports its own account P&L in full regardless of
      // whether some unrelated ticker symbol happens to also be legging a PairFlux pair right now.
      const pnl = accountPnlByTicker.get(p.ticker.trim().toUpperCase()) ?? 0;
      out.push({
        key: `single:${p.strategyId}:${p.ticker}`,
        label: p.ticker,
        strategyId: p.strategyId,
        side: p.side,
        entryCount: p.entryCount,
        legAPnl: pnl,
        legBPnl: null,
        totalPnl: pnl,
        signal: p.entrySignal,
        beta: p.beta,
        corr: p.corr,
        sigma: p.sigma,
      });
    }

    return out;
  }, [positions, accountPnlByTicker]);

  // Each ticker counted once, straight from the account — not a sum of row.totalPnl, which would
  // double-count a ticker legging two pairs at once (see the section's own doc comment).
  const grandTotal = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const p of positions ?? []) {
      const t = p.ticker.trim().toUpperCase();
      if (seen.has(t)) continue;
      seen.add(t);
      sum += accountPnlByTicker.get(t) ?? 0;
    }
    return sum;
  }, [positions, accountPnlByTicker]);

  const strategyKeyOf = (r: SituationRow) => (getLiveStrategyByBridgeId(r.strategyId)?.key ?? r.strategyId).toUpperCase();

  const sortedRows = useMemo(() => {
    if (strategySort === 0) return [...rows].sort((a, b) => b.totalPnl - a.totalPnl);
    return [...rows].sort((a, b) =>
      strategySort * strategyKeyOf(a).localeCompare(strategyKeyOf(b)) || b.totalPnl - a.totalPnl
    );
  }, [rows, strategySort]);

  const pnlTone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-500");

  return (
    <div className="scanner-glass-card mt-3 min-w-0 space-y-2 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 p-3 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">All situations</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">{rows.length} open</span>
          <span className={`font-mono text-[14px] font-bold tabular-nums ${pnlTone(grandTotal)}`}>
            {grandTotal >= 0 ? "+" : ""}{fmt(grandTotal)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.05]">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-black/20 text-left font-mono text-[11px] uppercase tracking-widest text-zinc-500">
              <th className="px-2 py-2">Ticker / Pair</th>
              <th
                className="cursor-pointer select-none px-2 py-2 text-sky-300/70 hover:text-sky-200"
                onClick={() => setStrategySort((s) => (s === 0 ? 1 : s === 1 ? -1 : 0))}
                title="Sort by strategy"
              >
                Strategy {strategySort === 1 ? "▲" : strategySort === -1 ? "▼" : ""}
              </th>
              <th className="px-2 py-2">Side</th>
              <th className="px-2 py-2 text-right">Signal</th>
              <th className="px-2 py-2 text-right">Beta</th>
              <th className="px-2 py-2 text-right">Corr</th>
              <th className="px-2 py-2 text-right">Sigma</th>
              <th className="px-2 py-2 text-right">Adds</th>
              <th className="px-2 py-2 text-right">Leg A P&amp;L</th>
              <th className="px-2 py-2 text-right">Leg B P&amp;L</th>
              <th className="px-2 py-2 text-right">Total P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center font-mono text-[12px] text-zinc-600">
                  no open situations
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.key} className="border-b border-white/[0.03] font-mono text-[13px]">
                  <td className="px-2 py-2 font-bold text-zinc-200">{r.label}</td>
                  <td className="px-2 py-2 font-bold" style={{ color: strategyColor(strategyKeyOf(r)) }}>
                    {strategyKeyOf(r)}
                  </td>
                  <td className={r.side.includes("Short") && !r.side.includes("Long") ? "px-2 py-2 text-rose-300" : "px-2 py-2 text-emerald-300"}>
                    {r.side}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmt(r.signal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-fuchsia-200/70">{fmt(r.beta)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-fuchsia-200/70">{fmt(r.corr)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-fuchsia-200/70">{fmt(r.sigma)}</td>
                  <td className="px-2 py-2 text-right text-zinc-400">{Math.max(0, r.entryCount - 1)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${pnlTone(r.legAPnl)}`}>
                    {r.legAPnl >= 0 ? "+" : ""}{fmt(r.legAPnl)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.legBPnl == null ? "text-zinc-700" : pnlTone(r.legBPnl)}`}>
                    {r.legBPnl == null ? "—" : `${r.legBPnl >= 0 ? "+" : ""}${fmt(r.legBPnl)}`}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums font-bold ${pnlTone(r.totalPnl)}`}>
                    {r.totalPnl >= 0 ? "+" : ""}{fmt(r.totalPnl)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CaesarBridgeDecisions() {
  return (
    <div className="mt-3">
      {/* Bare label, no card of its own — the blocks below carry their own frames now, the same
          way the strategy cards on /main do under their own plain "Active Strategies" heading. */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: "#a78bfa", boxShadow: "0 0 8px #a78bfa80" }}
        />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-300">
          Bridge Decisions
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          what the server engine sees
        </span>
      </div>

      {/* Side by side — the two strategies an operator watches together, so neither has to scroll
          past the other to see both at once. Each is now its own card rather than two halves of
          one shared strip, so a narrow screen can stack them without a lingering divider that no
          longer separates anything. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StrategySection strategy="arbitrage" label="Arbitrage" />
        <StrategySection strategy="pairflux" label="PairFlux" />
      </div>
      <OpenDoorFamilySection />
      <AllSituationsSection />
    </div>
  );
}
