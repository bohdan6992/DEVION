"use client";

/**
 * The positions terminal: what is actually open, and which strategy opened it.
 *
 * Two sources, deliberately not one:
 *
 *   THE BRIDGE is ground truth. TradingAppPositionsService reads the account itself, so it knows
 *   about every position — including ones no strategy here opened, and ones a strategy thinks it
 *   closed but did not.
 *
 *   EACH ENGINE knows what IT did. The per-instance position store is the strategy's own record of
 *   the tickers it entered and why.
 *
 * Joining them on the ticker is the whole point. Agreement is unremarkable; the two ways they can
 * disagree are the reason this panel exists:
 *
 *   UNCLAIMED — the account holds it, no strategy admits to it. Manual, or left from a session
 *               whose engine is no longer mounted. On a two-strategy day this is the row you want
 *               to see immediately, because nothing here will manage it.
 *   MISSING   — a strategy believes it is open, the account does not have it. The order never
 *               filled, or it was closed by hand.
 *
 * Money comes from the bridge only. The engine tracks a signal, not a fill price, so any P&L it
 * could offer would be a model of the trade rather than the trade.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import { getLiveStrategyByBridgeId } from "@/lib/strategies/registry";
import type { StreamPosition } from "@/components/stream/streamEngine";
import CaesarPanel from "./CaesarPanel";

type BridgePosition = {
  ticker: string;
  side: string | null;
  status: string | null;
  posSize: number | null;
  posAvgPrc: number | null;
  positionBp: number | null;
  openOrders: number | null;
  hasWorkingOrder: boolean | null;
  isFlat: boolean | null;
  totalPnL: number | null;
  /** Marked at the last price. Exists only while the position does. */
  openPnL: number | null;
  /** Realised on this ticker today. Survives the close — this is what keeps the score. */
  closedPnL: number | null;
  netClosedPnL: number | null;
};

type BridgeSnapshot = {
  account: string | null;
  ageSeconds: number;
  count: number;
  /** The P&L keys the pipe actually delivered. Empty while there are no positions to inspect. */
  pnlFieldsSeen?: string[];
  positions: BridgePosition[];
};

export type CaesarPositionsProps = {
  /** The strategies Caesar is hosting: label -> the instanceId their stores are keyed by. */
  instances: readonly { key: string; instanceId: string; priority: number }[];
};

type Claim = { strategyKey: string; position: StreamPosition };

/** One of the bridge's own tracked positions — see CaesarPlanController's StreamOpenPositionDto. */
type BridgeTrackedPosition = {
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  side: "Long" | "Short";
  entryDispatched: boolean;
  entrySignal: number | null;
  entryCount: number;
  openedAtUtc: string;
  lastReason: string;
};

type BridgeTrackedPositionsResponse = { ok: boolean; positions: BridgeTrackedPosition[] };

/**
 * A bridge-tracked position, as this panel's STRATEGY join needs it. Only the fields the table
 * below actually reads are filled from real data; everything else here is add-grid bookkeeping
 * this panel never shows, so a fixed, honest placeholder is more honest than inventing one.
 */
function positionFromBridge(p: BridgeTrackedPosition): StreamPosition {
  const openedAt = Date.parse(p.openedAtUtc) || Date.now();
  return {
    ticker: p.ticker,
    pairKey: p.pairKey,
    benchmark: "",
    side: p.side,
    entrySignal: p.entrySignal,
    lastSignal: p.entrySignal,
    lastScaleSignal: p.entrySignal,
    spread: null,
    spreadBidPct: null,
    status: "OPEN",
    reason: p.lastReason || (p.entryDispatched ? "tracked by the bridge" : "shadow only"),
    entryCount: p.entryCount,
    belowThresholdTicks: 0,
    lockedForPrint: false,
    pendingIntent: null,
    entryDispatchedAt: p.entryDispatched ? openedAt : null,
    lastDispatchedAt: openedAt,
    lastConfirmedActiveAt: openedAt,
    lastAboveAddCapAt: null,
    openedAt,
    updatedAt: openedAt,
  };
}

/** One line of the terminal: an account position, and the strategy claiming it (if any). */
type Row = {
  bridge: BridgePosition;
  claim: Claim | null;
  ticker: string;
  open: boolean;
  /** The ticker is held by more than one strategy, so its money belongs to neither alone. */
  shared: boolean;
};

// See useMarketMakerWindow's POLL_MS comment — the account snapshot matters more for freshness
// than the MM bind does, so this only backs off moderately rather than as far.
const POLL_MS = 6_000;

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Carrying size right now. */
function isOpen(p: BridgePosition): boolean {
  if (p.isFlat === true) return false;
  // PositionBp is the account's strategy-facing activity signal. Some broker snapshots can have
  // a transient zero PosSize while PositionBp is already non-zero, so hiding that row makes
  // Caesar disagree with the same rule STREAM uses for add/entry protection.
  return (p.positionBp ?? 0) !== 0;
}

/**
 * Worth a row: either still open, or flat with something realised on it today.
 *
 * Filtering on size alone was the bug this fixes. A strategy that opened and closed a ticker went
 * flat, dropped out of the view, and took its whole result with it — by the close the day looked
 * empty no matter how it had gone.
 */
function isRelevant(p: BridgePosition): boolean {
  return isOpen(p) || (p.closedPnL ?? 0) !== 0;
}

export default function CaesarPositions({ instances }: CaesarPositionsProps) {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  /**
   * 0 = the table's own default order (open first, then ticker/strategy — see `view.rows`'s own
   * sort). 1/-1 = sorted by strategy, ascending/descending; a third click on the header returns
   * to the default rather than only ever flipping between the two directions.
   */
  const [strategySort, setStrategySort] = useState<0 | 1 | -1>(0);

  // ---- the account, polled -------------------------------------------------------------------
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    // ONE poll of /positions shared with CaesarCharts (both used to run their own independent 4s
    // interval against the same endpoint) — see sharedPoll.ts's doc comment: too many independent
    // pollers on one origin is what pushed requests past Chrome's 6-connections-per-origin cap.
    const fetchPositions = () =>
      fetchWithTimeout(bridgeUrl("/api/execution/tradingapp/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<BridgeSnapshot>);
    const unsubscribe = subscribeSharedPoll("account-positions", fetchPositions, POLL_MS, (value, err) => {
      if (!alive.current) return;
      if (err) {
        setError(err);
      } else {
        setSnapshot(value);
        setError(null);
      }
    });
    return () => { alive.current = false; unsubscribe(); };
  }, []);

  // ---- which strategy holds what, straight from the bridge's own tracker ----------------------
  //
  // Used to read this from each mounted engine's own browser-local store. That store is empty for
  // every strategy that runs server-side — which by now is all six the plan can assign — so this
  // panel's STRATEGY column read UNCLAIMED for everything, always, regardless of what actually
  // opened the position. Shares CaesarBridgeDecisions'/CaesarCharts' identical poll under the same
  // key rather than running a fourth independent one against the same endpoint.
  //
  // CLOSED positions are NOT reconstructed here (the old browser action-log fallback is gone with
  // it): the bridge only tracks currently-open positions, so a closed ticker's claim is lost the
  // moment it closes, same as it already was — this fixes the STRATEGY column for what is open,
  // not money attribution after a close, which was never sourced from here either.
  useEffect(() => {
    let alive = true;
    const fetchAll = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<BridgeTrackedPositionsResponse>)
        .then((body) => body.positions);
    const unsubscribe = subscribeSharedPoll("bridge-all-positions", fetchAll, 2000, (value, err) => {
      if (!alive || err || !value) return;
      setClaims(
        value.flatMap((p) => {
          const strategy = getLiveStrategyByBridgeId(p.strategyId);
          return strategy ? [{ strategyKey: strategy.key, position: positionFromBridge(p) }] : [];
        }),
      );
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // ---- the join --------------------------------------------------------------------------------
  const view = useMemo(() => {
    // A LIST per ticker, not one claim.
    //
    // This was a Map<ticker, Claim>, so the second strategy holding a name silently overwrote the
    // first and the account's position was attributed to whichever happened to be iterated last.
    // Arbitrage shorting AXTI on its own signal then read as PairFlux's position, and PairFlux's
    // own row vanished. Two strategies sharing a ticker on the same side is now something the
    // bridge deliberately allows, so the display has to represent it rather than pick a winner.
    const claimsByTicker = new Map<string, Claim[]>();
    for (const c of claims) {
      const t = c.position.ticker.trim().toUpperCase();
      if (!t) continue;
      const list = claimsByTicker.get(t);
      if (list) list.push(c);
      else claimsByTicker.set(t, [c]);
    }

    const relevant = (snapshot?.positions ?? []).filter(isRelevant);
    const seen = new Set<string>();

    const rows: Row[] = relevant
      .flatMap((p): Row[] => {
        const t = (p.ticker ?? "").trim().toUpperCase();
        seen.add(t);
        const owners = claimsByTicker.get(t) ?? [];
        const open = isOpen(p);
        const shared = owners.length > 1;
        if (owners.length === 0) {
          return [{ bridge: p, claim: null, ticker: t, open, shared: false }];
        }
        // One row each: entry count, status and reason belong to the strategy, not the account.
        return owners.map((claim) => ({ bridge: p, claim, ticker: t, open, shared }));
      })
      // Open first, then the realised ones — what is still at risk reads above what is settled.
      .sort((a, b) =>
        a.open === b.open
          ? a.ticker.localeCompare(b.ticker) ||
            (a.claim?.strategyKey ?? "").localeCompare(b.claim?.strategyKey ?? "")
          : a.open
            ? -1
            : 1,
      );

    // A strategy holds it OPEN, the account has neither size nor a realised result on it.
    const missing = claims.filter(
      (c) => c.position.status !== "CLOSED" && !seen.has(c.position.ticker.trim().toUpperCase()),
    );

    type Agg = {
      open: number; long: number; short: number; adds: number; priority: number;
      openPnl: number; closedPnl: number; closedCount: number;
    };
    const perStrategy = new Map<string, Agg>();
    for (const inst of instances) {
      perStrategy.set(inst.key, {
        open: 0, long: 0, short: 0, adds: 0, priority: inst.priority,
        openPnl: 0, closedPnl: 0, closedCount: 0,
      });
    }
    let unclaimedCount = 0;
    let unclaimedOpenPnl = 0;
    let unclaimedClosedPnl = 0;
    let openCount = 0;

    // The account reports ONE P&L per ticker and does not say who owns which part of it, so a
    // shared ticker's money is counted once into a shared bucket rather than added to both
    // strategies or split down the middle. A split would be a number nobody measured.
    const countedTickers = new Set<string>();
    let sharedOpenPnl = 0;
    let sharedClosedPnl = 0;
    let sharedCount = 0;

    for (const r of rows) {
      const firstForTicker = !countedTickers.has(r.ticker);
      if (firstForTicker) {
        countedTickers.add(r.ticker);
        if (r.open) openCount += 1;
      }

      const openPnl = r.open ? r.bridge.openPnL ?? 0 : 0;
      // null (field absent) contributes nothing rather than a fabricated zero.
      const closedPnl = r.bridge.closedPnL ?? 0;

      if (!r.claim) {
        if (firstForTicker) {
          unclaimedCount += 1;
          unclaimedOpenPnl += openPnl;
          unclaimedClosedPnl += closedPnl;
        }
        continue;
      }

      const agg = perStrategy.get(r.claim.strategyKey);
      if (!agg) continue;

      // Counts are per strategy: both really do hold the position.
      if (r.open) {
        agg.open += 1;
        if (r.claim.position.side === "Short") agg.short += 1;
        else agg.long += 1;
        agg.adds += Math.max(0, (r.claim.position.entryCount ?? 1) - 1);
      } else if (closedPnl !== 0) {
        agg.closedCount += 1;
      }

      // Money is per ticker, and only once.
      if (!firstForTicker) continue;
      if (r.shared) {
        sharedCount += 1;
        sharedOpenPnl += openPnl;
        sharedClosedPnl += closedPnl;
      } else {
        agg.openPnl += openPnl;
        agg.closedPnl += closedPnl;
      }
    }

    // Everything the account reports, added up once: every strategy's own bucket, the shared
    // ticker(s), and the unclaimed ones — nobody's money is left out of this number.
    let grandOpenPnl = unclaimedOpenPnl + sharedOpenPnl;
    let grandClosedPnl = unclaimedClosedPnl + sharedClosedPnl;
    for (const agg of perStrategy.values()) {
      grandOpenPnl += agg.openPnl;
      grandClosedPnl += agg.closedPnl;
    }

    return {
      rows, missing, perStrategy,
      unclaimedCount, unclaimedOpenPnl, unclaimedClosedPnl,
      sharedCount, sharedOpenPnl, sharedClosedPnl,
      grandOpenPnl, grandClosedPnl,
      openCount, rowCount: countedTickers.size,
    };
  }, [claims, snapshot, instances]);

  const age = snapshot?.ageSeconds;
  const stale = age != null && age >= 0 && age > 30;
  const pnlTone = (value: number) => value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-zinc-500";

  const grandTotal = view.grandOpenPnl + view.grandClosedPnl;

  // UNCLAIMED always sorts to the bottom regardless of direction — it is not "before" or "after"
  // a real strategy name alphabetically, it is a separate category the operator checks last.
  const sortedRows = useMemo(() => {
    if (strategySort === 0) return view.rows;
    const withOrder = view.rows.map((r, i) => ({ r, i }));
    withOrder.sort((a, b) => {
      const ak = a.r.claim?.strategyKey ?? "";
      const bk = b.r.claim?.strategyKey ?? "";
      if (!ak && bk) return 1;
      if (ak && !bk) return -1;
      if (!ak && !bk) return a.i - b.i;
      return strategySort * ak.localeCompare(bk) || a.i - b.i;
    });
    return withOrder.map((x) => x.r);
  }, [view.rows, strategySort]);

  const strategyTotals = (
    <section className="mt-3 space-y-3">
      {/*
        GRAND TOTAL, AS ITS OWN HEADER. Every strategy's own bucket, plus the shared and unclaimed
        tickers no single strategy's card counts — the one number that answers "how is the whole
        account doing" without adding up the cards below by hand, so it gets top billing (its own
        banner, bigger type) rather than sitting inside the card grid as one more tile.
      */}
      <div className="rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/[0.07] px-5 py-4 shadow-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-violet-200">
            Grand Total
          </span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-violet-200/50">
            {view.openCount} open across the account
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 border-t border-[#a78bfa]/20 pt-3">
          <BigMetric label="Total" value={grandTotal} tone={pnlTone(grandTotal)} />
          <BigMetric label="Open" value={view.grandOpenPnl} tone={pnlTone(view.grandOpenPnl)} />
          <BigMetric label="Closed" value={view.grandClosedPnl} tone={pnlTone(view.grandClosedPnl)} />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">Strategy P&amp;L</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from(view.perStrategy.entries())
            // Idle — nothing open, nothing realised today — is not worth its own card. instances
            // (and so perStrategy) still covers every registered strategy regardless of the
            // current segment, on purpose (a position can close long after its segment ends), so
            // filtering HERE — what to show — rather than upstream — what to track — is what keeps
            // that intact while still decluttering a card grid that used to list four strategies
            // at "0 · +0.00" next to the two actually doing anything.
            .filter(([, strategy]) => strategy.open > 0 || strategy.closedCount > 0)
            .map(([key, strategy]) => {
              const total = strategy.openPnl + strategy.closedPnl;
              return (
                <div key={key} className="scanner-glass-card rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 px-3 py-2 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">{key}</span>
                    <span className="text-[10px] text-zinc-600">#{strategy.priority}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {strategy.open} open <span className="ml-2 text-emerald-300/80">{strategy.long}L</span><span className="ml-2 text-rose-300/80">{strategy.short}S</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2 font-mono tabular-nums">
                    <Metric label="Total" value={total} tone={pnlTone(total)} />
                    <Metric label="Open" value={strategy.openPnl} tone={pnlTone(strategy.openPnl)} />
                    <Metric label="Closed" value={strategy.closedPnl} tone={pnlTone(strategy.closedPnl)} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );

  return (
    <>
      {strategyTotals}
    <CaesarPanel
      title="Active"
      subtitle={snapshot?.account ? `acct ${snapshot.account}` : "account —"}
      accent="#fb923c"
      terminal
      className="mt-3"
      right={
        <>
          {Array.from(view.perStrategy.entries()).map(([key, strategy]) => {
            const total = strategy.openPnl + strategy.closedPnl;
            return (
              <span
                key={key}
                className={
                  "font-mono text-[10px] uppercase tracking-widest " +
                  (total > 0 ? "text-emerald-300" : total < 0 ? "text-rose-300" : "text-zinc-500")
                }
              >
                {key} {total >= 0 ? "+" : ""}{fmt(total)}
              </span>
            );
          })}
          <span
            className={
              "rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-widest " +
              (stale
                ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
                : "border-white/[0.06] bg-black/25 text-zinc-500")
            }
          >
            {age == null ? "no read yet" : age < 0 ? "never read" : `read ${fmt(age, 0)}s ago`}
          </span>
          <span className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {view.openCount} open · {view.rowCount - view.openCount} closed
          </span>
        </>
      }
    >
      {error && (
        <div className="mx-3 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {/*
        Only meaningful once there IS a position to inspect: with a flat book the pipe sends no rows
        and there are no keys to report, which is not the same as the field being missing.
      */}
      {!error && snapshot != null && (snapshot.positions?.length ?? 0) > 0 &&
        !(snapshot.pnlFieldsSeen ?? []).some((f) => /closedpnl/i.test(f)) && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 font-mono text-[11px] text-amber-200">
          The positions pipe is not sending a ClosedPnL field — realised results cannot be attributed.
          {(snapshot.pnlFieldsSeen ?? []).length > 0 && (
            <span className="text-amber-200/60"> Seen: {(snapshot.pnlFieldsSeen ?? []).join(", ")}</span>
          )}
        </div>
      )}

      {/* ---- distribution by strategy ---- */}
      <section className="hidden">
        <div className="px-1 pb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          Strategy P&amp;L
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {instances.length === 0 ? (
          <span className="font-mono text-[11px] text-zinc-600">No strategy hosted on this segment.</span>
        ) : (
          Array.from(view.perStrategy.entries()).map(([key, s]) => (
            <div
              key={key}
              className="scanner-glass-card min-w-[190px] flex-1 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 px-3 py-2 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80"
            >
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">{key}</span>
                <span className="text-[10px] text-zinc-600">#{s.priority}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-3 font-mono text-[11px]">
                <span className="text-zinc-300">{s.open} open</span>
                <span className="text-emerald-300/80">{s.long}L</span>
                <span className="text-rose-300/80">{s.short}S</span>
                {s.adds > 0 && <span className="text-sky-300/70">+{s.adds} adds</span>}
                {s.closedCount > 0 && <span className="text-zinc-500">{s.closedCount} closed</span>}
              </div>
              {/*
                TOTAL is what the strategy has made today: realised plus what is still at risk.
                The two are also shown apart, because they are not the same claim — one is banked,
                the other is a mark that moves every tick.
              */}
              <div
                className={
                  "mt-2 font-mono text-[15px] font-bold tabular-nums " +
                  (s.openPnl + s.closedPnl > 0
                    ? "text-emerald-400"
                    : s.openPnl + s.closedPnl < 0
                      ? "text-rose-400"
                      : "text-zinc-500")
                }
              >
                <span className="mr-2 text-[8px] font-normal uppercase tracking-widest text-zinc-600">total</span>
                {s.openPnl + s.closedPnl >= 0 ? "+" : ""}
                {fmt(s.openPnl + s.closedPnl)}
              </div>
              <div className="mt-0.5 flex items-baseline gap-3 font-mono text-[10px] tabular-nums">
                <span className="text-zinc-600">
                  open{" "}
                  <span className={s.openPnl > 0 ? "text-emerald-400/80" : s.openPnl < 0 ? "text-rose-400/80" : "text-zinc-500"}>
                    {s.openPnl >= 0 ? "+" : ""}{fmt(s.openPnl)}
                  </span>
                </span>
                <span className="text-zinc-600">
                  closed{" "}
                  <span className={s.closedPnl > 0 ? "text-emerald-400/80" : s.closedPnl < 0 ? "text-rose-400/80" : "text-zinc-500"}>
                    {s.closedPnl >= 0 ? "+" : ""}{fmt(s.closedPnl)}
                  </span>
                </span>
              </div>
            </div>
          ))
        )}

        {view.sharedCount > 0 && (
          <div className="scanner-glass-card min-w-[190px] flex-1 rounded-2xl border border-[#2dd4bf]/25 bg-[#2dd4bf]/[0.07] px-3 py-2 shadow-xl transition-all duration-300 hover:border-[#2dd4bf]/45">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200">
              Shared
            </div>
            <div className="mt-1 font-mono text-[11px] text-sky-200/70">
              {view.sharedCount} ticker{view.sharedCount === 1 ? "" : "s"} held by more than one strategy
            </div>
            <div
              className={
                "mt-0.5 font-mono text-[15px] font-bold tabular-nums " +
                (view.sharedOpenPnl + view.sharedClosedPnl >= 0 ? "text-emerald-400" : "text-rose-400")
              }
            >
              {view.sharedOpenPnl + view.sharedClosedPnl >= 0 ? "+" : ""}
              {fmt(view.sharedOpenPnl + view.sharedClosedPnl)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-sky-200/50">
              open {fmt(view.sharedOpenPnl)} · closed {fmt(view.sharedClosedPnl)}
            </div>
          </div>
        )}

        {view.unclaimedCount > 0 && (
          <div className="scanner-glass-card min-w-[190px] flex-1 rounded-2xl border border-[#fb923c]/25 bg-[#fb923c]/[0.07] px-3 py-2 shadow-xl transition-all duration-300 hover:border-[#fb923c]/45">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
              Unclaimed
            </div>
            <div className="mt-1 font-mono text-[11px] text-amber-200/70">
              {view.unclaimedCount} ticker{view.unclaimedCount === 1 ? "" : "s"} — no hosted strategy owns these
            </div>
            <div
              className={
                "mt-0.5 font-mono text-[15px] font-bold tabular-nums " +
                (view.unclaimedOpenPnl + view.unclaimedClosedPnl >= 0 ? "text-emerald-400" : "text-rose-400")
              }
            >
              {view.unclaimedOpenPnl + view.unclaimedClosedPnl >= 0 ? "+" : ""}
              {fmt(view.unclaimedOpenPnl + view.unclaimedClosedPnl)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-amber-200/50">
              open {fmt(view.unclaimedOpenPnl)} · closed {fmt(view.unclaimedClosedPnl)}
            </div>
          </div>
        )}
        </div>
      </section>

      {/* ---- the terminal ---- */}
      <div className="mt-3 max-h-[320px] overflow-auto">
        <table className="w-full min-w-[860px] text-xs font-mono">
          <thead className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-zinc-300 backdrop-blur-xl">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.14em]">
              <th className="text-left text-zinc-200">Ticker</th>
              <th
                className="cursor-pointer select-none text-left text-sky-300/70 hover:text-sky-200"
                onClick={() => setStrategySort((s) => (s === 0 ? 1 : s === 1 ? -1 : 0))}
                title="Sort by strategy"
              >
                Strategy {strategySort === 1 ? "▲" : strategySort === -1 ? "▼" : ""}
              </th>
              <th className="text-left text-violet-300/80">Side</th>
              <th className="text-right text-violet-300">Size</th>
              <th className="text-right text-amber-400/80">Avg</th>
              <th className="text-right text-emerald-300/80">Open P&amp;L</th>
              <th className="text-right text-pink-400/80">Closed P&amp;L</th>
              <th className="text-right text-amber-300/80">Ent</th>
              <th className="text-left text-teal-300/80">Status</th>
              <th className="text-left text-zinc-300">Reason</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.length === 0 && view.missing.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-600">
                  Nothing open.
                </td>
              </tr>
            ) : null}

            {sortedRows.map((r, index) => {
              const openPnl = r.open ? r.bridge.openPnL ?? 0 : null;
              // null (field absent) contributes nothing rather than a fabricated zero.
      const closedPnl = r.bridge.closedPnL ?? 0;
              const side = (r.claim?.position.side ?? r.bridge.side ?? "").toString();
              const money = (v: number | null) =>
                v == null
                  ? "text-zinc-700"
                  : v > 0
                    ? "text-emerald-400"
                    : v < 0
                      ? "text-rose-400"
                      : "text-zinc-500";
              return (
                <tr
                  key={`${r.ticker}-${r.claim?.strategyKey ?? "unclaimed"}`}
                  className={
                    "border-t border-white/5 transition-colors [&>td]:px-2 [&>td]:py-3.5 " +
                    (index % 2 === 0 ? "bg-white/[0.01] hover:bg-white/[0.03] " : "bg-transparent hover:bg-white/[0.03] ") +
                    (!r.claim ? "bg-amber-500/[0.05]" : r.open ? "" : "opacity-70")
                  }
                >
                  <td className="font-bold text-zinc-200">
                    {r.ticker}
                    {r.shared && (
                      <span
                        className="ml-1.5 rounded bg-sky-500/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-sky-300"
                        title="Held by more than one strategy. The account reports one size and one P&L for it, so those columns describe the whole ticker, not this strategy's share."
                      >
                        shared
                      </span>
                    )}
                  </td>
                  <td className={r.claim ? "text-zinc-300" : "text-amber-300"}>
                    {r.claim ? r.claim.strategyKey.toUpperCase() : "UNCLAIMED"}
                  </td>
                  <td className={side === "Short" ? "text-rose-300" : "text-emerald-300"}>
                    {r.open ? side || "—" : <span className="text-zinc-600">flat</span>}
                  </td>
                  <td className="text-right tabular-nums text-zinc-300">
                    {r.open ? fmtInt(r.bridge.posSize) : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="text-right tabular-nums text-zinc-400">
                    {r.open ? fmt(r.bridge.posAvgPrc) : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className={"text-right tabular-nums " + money(openPnl)}>
                    {openPnl == null ? "—" : `${openPnl >= 0 ? "+" : ""}${fmt(openPnl)}`}
                  </td>
                  {/*
                    A null is "the pipe did not send this field" and a 0 is "nothing was realised".
                    Rendering both as a dash would hide a plumbing fault behind a normal-looking day,
                    so an absent value says so.
                  */}
                  <td
                    className={
                      "text-right tabular-nums " +
                      (r.bridge.closedPnL == null ? "text-amber-400/60" : money(closedPnl))
                    }
                    title={r.bridge.closedPnL == null ? "ClosedPnL absent from the positions pipe" : undefined}
                  >
                    {r.bridge.closedPnL == null
                      ? "n/a"
                      : `${closedPnl >= 0 ? "+" : ""}${fmt(closedPnl)}`}
                  </td>
                  <td className="text-right tabular-nums text-zinc-400">
                    {r.claim ? r.claim.position.entryCount : "—"}
                  </td>
                  <td className="text-zinc-400">
                    {r.open ? r.claim?.position.status ?? r.bridge.status ?? "—" : "CLOSED"}
                  </td>
                  <td className="truncate text-zinc-600">{r.claim?.position.reason ?? ""}</td>
                </tr>
              );
            })}

            {view.missing.map((c) => (
              <tr
                key={`missing-${c.strategyKey}-${c.position.ticker}`}
                className="border-t border-white/[0.04] bg-rose-500/[0.05] [&>td]:px-3 [&>td]:py-3"
              >
                <td className="font-bold text-zinc-200">{c.position.ticker}</td>
                <td className="text-zinc-300">{c.strategyKey.toUpperCase()}</td>
                <td className={c.position.side === "Short" ? "text-rose-300" : "text-emerald-300"}>
                  {c.position.side}
                </td>
                <td className="text-right text-rose-300">not in account</td>
                <td className="text-right text-zinc-600">—</td>
                <td className="text-right text-zinc-600">—</td>
                <td className="text-right text-zinc-600">—</td>
                <td className="text-right tabular-nums text-zinc-400">{c.position.entryCount}</td>
                <td className="text-zinc-400">{c.position.status}</td>
                <td className="truncate text-zinc-600">{c.position.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hidden">
        Size, average and both P&amp;L columns come from the account —{" "}
        <span className="font-mono text-white/40">LstPrcOpenPnL</span> while the position is open and{" "}
        <span className="font-mono text-white/40">ClosedPnL</span> once it is not, so a ticker keeps its
        result after it goes flat. Strategy, entry count and reason come from the engine that opened it. An <span className="text-amber-300/70">UNCLAIMED</span> row is held by
        the account and managed by nothing here; a <span className="text-rose-300/70">not in account</span>{" "}
        row is a strategy holding a position the account does not have. A{" "}
        <span className="text-sky-300/70">shared</span> ticker is held by two strategies at once —
        legitimate when both went the same way — and its size and P&amp;L describe the whole ticker,
        so they are counted once into SHARED rather than added to either strategy.
      </div>
    </CaesarPanel>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-widest text-zinc-600">{label}</div>
      <div className={`mt-0.5 text-[13px] font-bold ${tone}`}>{value >= 0 ? "+" : ""}{fmt(value)}</div>
    </div>
  );
}

/** Metric's larger twin, for the Grand Total banner — the one number worth reading from across the room. */
function BigMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-violet-200/50">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-bold tabular-nums ${tone}`}>{value >= 0 ? "+" : ""}{fmt(value)}</div>
    </div>
  );
}
