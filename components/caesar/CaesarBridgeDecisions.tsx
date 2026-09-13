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

import React, { useEffect, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import CaesarPanel from "./CaesarPanel";

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
};

type StreamEngineSnapshot = {
  strategyId: string;
  asOfUtc: string | null;
  asOfMinuteIdx: number | null;
  candidates: StreamCandidateRow[];
  positions: StreamOpenPosition[];
};

type SnapshotResponse = { ok: boolean; snapshot: StreamEngineSnapshot };
type AllPositionsResponse = { ok: boolean; positions: StreamOpenPosition[] };

const POLL_MS = 6_000;

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

function CandidatesTable({ rows }: { rows: StreamCandidateRow[] }) {
  if (rows.length === 0) {
    return <div className="px-3 py-6 text-center font-mono text-[11px] text-zinc-600">no candidates this minute</div>;
  }
  return (
    <table className="w-full min-w-[640px] text-xs font-mono">
      <thead className="bg-[#0a0a0a]/55 text-zinc-500">
        <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.12em]">
          <th>Ticker</th>
          <th>Pair</th>
          <th>Side</th>
          <th className="text-right">Signal</th>
          <th className="text-right">Spread</th>
          <th className="text-right">Net edge</th>
          <th>Status</th>
          <th>Latch</th>
          <th className="truncate">Reason</th>
        </tr>
      </thead>
      <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-1">
        {rows.map((r, i) => (
          <tr key={`${r.ticker}|${r.pairKey ?? ""}|${i}`} className="border-t border-white/[0.04]">
            <td className="font-bold text-zinc-200">{r.ticker}</td>
            <td className="text-zinc-500">{r.pairKey ?? "—"}</td>
            <td className={sideTone(r.side)}>{r.side}</td>
            <td className="text-right tabular-nums text-zinc-300">{fmt(r.signal)}</td>
            <td className="text-right tabular-nums text-zinc-400">{fmt(r.spread)}</td>
            <td className="text-right tabular-nums text-zinc-300">{fmt(r.netEdge)}</td>
            <td className={statusTone(r.status)}>{r.status}</td>
            <td className={r.readyToEnter ? "text-emerald-300" : r.latched ? "text-amber-300" : "text-zinc-600"}>
              {r.readyToEnter ? "ready" : r.latched ? "holding" : "—"}
            </td>
            <td className="truncate text-zinc-600">{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PositionsTable({ rows }: { rows: StreamOpenPosition[] }) {
  if (rows.length === 0) {
    return <div className="px-3 py-4 text-center font-mono text-[11px] text-zinc-600">no open positions</div>;
  }
  return (
    <table className="w-full min-w-[560px] text-xs font-mono">
      <thead className="bg-[#0a0a0a]/55 text-zinc-500">
        <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.12em]">
          <th>Ticker</th>
          <th>Pair</th>
          <th>Side</th>
          <th className="text-right">Adds</th>
          <th>Dispatched</th>
          <th>Fixed exit</th>
          <th>Last reason</th>
        </tr>
      </thead>
      <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-1">
        {rows.map((p, i) => {
          const fixedExit = fmtFixedExit(p.fixedExitAtUtc);
          return (
            <tr key={`${p.ticker}|${p.pairKey ?? ""}|${i}`} className="border-t border-white/[0.04]">
              <td className="font-bold text-zinc-200">{p.ticker}</td>
              <td className="text-zinc-500">{p.pairKey ?? "—"}</td>
              <td className={sideTone(p.side)}>{p.side}</td>
              <td className="text-right tabular-nums text-zinc-400">{Math.max(0, p.entryCount - 1)}</td>
              <td className={p.entryDispatched ? "text-zinc-400" : "text-amber-300"}>
                {p.entryDispatched ? "yes" : "shadow only"}
              </td>
              <td className={fixedExit.tone}>{fixedExit.text}</td>
              <td className="truncate text-zinc-600">{p.lastReason}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StrategySection({ strategy, label }: { strategy: "arbitrage" | "pairflux"; label: string }) {
  const { snapshot, error } = useStreamEngineSnapshot(strategy);

  return (
    <div className="border-t border-white/[0.05] first:border-t-0">
      <div className="flex items-center justify-between gap-3 bg-[#0a0a0a]/30 px-3 py-1.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
          {snapshot && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {snapshot.candidates.length} candidates · {snapshot.positions.length} open
            </span>
          )}
          <AgeBadge asOfUtc={snapshot?.asOfUtc ?? null} />
        </div>
      </div>

      {error && (
        <div className="mx-3 my-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {!error && (
        <div className="overflow-x-auto">
          <CandidatesTable rows={snapshot?.candidates ?? []} />
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
 */
function OpenDoorFamilySection() {
  const { positions, error, asOfUtc } = useAllPositions();
  const family = (positions ?? []).filter((p) => p.strategyId in OPEN_DOOR_FAMILY);
  const grouped = Object.keys(OPEN_DOOR_FAMILY).map((strategyId) => ({
    strategyId,
    label: OPEN_DOOR_FAMILY[strategyId],
    rows: family.filter((p) => p.strategyId === strategyId),
  }));

  return (
    <div className="border-t border-white/[0.05]">
      <div className="flex items-center justify-between gap-3 bg-[#0a0a0a]/30 px-3 py-1.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          OpenDoor family — entry + fixed-time exit
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {family.length} open
          </span>
          <AgeBadge asOfUtc={asOfUtc} />
        </div>
      </div>

      {error && (
        <div className="mx-3 my-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {!error && positions == null && (
        <div className="px-3 py-4 text-center font-mono text-[11px] text-zinc-600">loading…</div>
      )}

      {!error && positions != null && (
        <div className="overflow-x-auto">
          {grouped.map(({ strategyId, label, rows }) => (
            <div key={strategyId} className="border-t border-white/[0.03] first:border-t-0">
              <div className="px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
              <PositionsTable rows={rows} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CaesarBridgeDecisions() {
  return (
    <CaesarPanel title="Bridge Decisions" subtitle="what the server engine sees" accent="#a78bfa" terminal className="mt-3">
      <StrategySection strategy="arbitrage" label="Arbitrage" />
      <StrategySection strategy="pairflux" label="PairFlux" />
      <OpenDoorFamilySection />
    </CaesarPanel>
  );
}
