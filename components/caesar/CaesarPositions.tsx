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
import { CAESAR_PANEL_SURFACE } from "./CaesarPanel";

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

/**
 * beta/corr/sigma live OUTSIDE `position` on purpose: StreamPosition is the shared browser type
 * (components/stream/streamEngine.ts) and extending it would ripple into every stream page that
 * uses it, for three fields only this panel ever reads.
 */
type Claim = {
  strategyKey: string;
  position: StreamPosition;
  beta: number | null;
  corr: number | null;
  sigma: number | null;
  /** Sent to TradingApp but not in the account yet (the bridge keeps it on its book for a few minutes). */
  awaitingFill?: boolean;
};

/** One of the bridge's own tracked positions — see CaesarPlanController's StreamOpenPositionDto. */
type BridgeTrackedPosition = {
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  side: "Long" | "Short";
  entryDispatched: boolean;
  awaitingFill?: boolean;
  entrySignal: number | null;
  entryCount: number;
  openedAtUtc: string;
  lastReason: string;
  /** The ratings-table stats behind the position — see TrackedPosition's own doc comment on the bridge. */
  beta: number | null;
  corr: number | null;
  sigma: number | null;
};

/** Ticker -> strategy id(s) that closed it today — see ServerPositionTracker.GetClosedOwners. */
type ClosedOwners = Record<string, string[]>;

/** Why the bridge stopped tracking a position — see ServerPositionTracker.GetPruneEvents. */
type PruneEvent = {
  atUtc: string;
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  reason: string;
  wasEverSeenLive: boolean;
  exitEmitted: boolean;
};

type BridgeTrackedPositionsResponse = {
  ok: boolean;
  positions: BridgeTrackedPosition[];
  closedOwners?: ClosedOwners;
  prunes?: PruneEvent[];
};

/** One Caesar segment (pre/open/intra/post) — see CaesarPlanController's own segment-pnl routes. */
type SegmentInfo = { segmentKey: string; fromMinuteIdx: number; toMinuteIdx: number; hasData: boolean };

/**
 * A synthetic claim for a ticker the bridge no longer tracks (it closed) but remembers who
 * traded it. Only `strategyKey` and `status`/`reason` are ever actually read for a closed row —
 * see the Ent/Status/Reason columns below — so this does not need real add-grid numbers, which
 * the bridge does not keep past the close anyway.
 */
function closedClaim(): StreamPosition {
  const now = Date.now();
  return {
    ticker: "",
    pairKey: null,
    benchmark: "",
    side: "Long",
    entrySignal: null,
    lastSignal: null,
    lastScaleSignal: null,
    spread: null,
    spreadBidPct: null,
    status: "CLOSED",
    reason: "closed — attributed from the bridge's own memory of who traded it",
    entryCount: 1,
    belowThresholdTicks: 0,
    lockedForPrint: false,
    pendingIntent: null,
    entryDispatchedAt: null,
    lastDispatchedAt: null,
    lastConfirmedActiveAt: null,
    lastAboveAddCapAt: null,
    openedAt: now,
    updatedAt: now,
  };
}

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
  /**
   * The account still holds it, but the bridge has stopped tracking it: the owner is only
   * remembered from a close (closedClaim), so nothing is managing adds or exits for it any more.
   * Shown as UNTRACKED rather than CLOSED — it is not closed, it is unmanaged.
   */
  untracked: boolean;
};

/** Long/Short as the ACCOUNT holds it: a negative size is a short, whatever a placeholder claim says. */
function accountSide(p: BridgePosition, fallback: string): string {
  const size = p.posSize ?? 0;
  if (size < 0) return "Short";
  if (size > 0) return "Long";
  return fallback;
}

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
  const [closedOwners, setClosedOwners] = useState<ClosedOwners>({});
  const [prunes, setPrunes] = useState<PruneEvent[]>([]);
  /**
   * 0 = the table's own default order (open first, then ticker/strategy — see `view.rows`'s own
   * sort). 1/-1 = sorted by strategy, ascending/descending; a third click on the header returns
   * to the default rather than only ever flipping between the two directions.
   */
  const [strategySort, setStrategySort] = useState<0 | 1 | -1>(0);
  /** Clicking a strategy card narrows the list below to just its own rows; clicking the header (or the same card again) clears it. */
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  // ---- segment switcher: which Caesar segment's own closed-position data is shown ------------
  //
  // null = LIVE, the panel exactly as it always was. A segment key narrows the CLOSED column (and
  // only that column — TradingApp's ClosedPnL is a running per-ticker total for the whole day, not
  // per-trade events, so a segment's own share of it is a boundary-to-boundary delta computed on
  // the bridge — see SegmentPnlLedgerService) to just what that segment itself contributed, reset
  // to zero the instant the segment starts and frozen forever once the next one begins.
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [segmentPnl, setSegmentPnl] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive2 = true;
    const load = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/segment-pnl/segments"), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ ok: boolean; segments: SegmentInfo[] }>)
        .then((body) => { if (alive2) setSegments(body.segments ?? []); })
        .catch(() => {});
    void load();
    // Segments only change when the operator edits the Caesar schedule — this just needs to
    // notice that eventually, not track it live.
    const interval = window.setInterval(load, 30_000);
    return () => { alive2 = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!selectedSegment) { setSegmentPnl({}); return; }
    let alive3 = true;
    const load = () =>
      fetchWithTimeout(bridgeUrl(`/api/stream/caesar/segment-pnl?segment=${encodeURIComponent(selectedSegment)}`), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ ok: boolean; pnlByTicker: Record<string, number> }>)
        .then((body) => { if (alive3) setSegmentPnl(body.pnlByTicker ?? {}); })
        .catch(() => {});
    void load();
    // Same cadence as the account poll below — a segment still running should visibly grow.
    const interval = window.setInterval(load, POLL_MS);
    return () => { alive3 = false; window.clearInterval(interval); };
  }, [selectedSegment]);

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
  useEffect(() => {
    let alive = true;
    // NOT the full response body: CaesarBridgeDecisions/CaesarCharts already subscribe to this
    // exact key expecting the fetcher to resolve to `positions` alone — subscribeSharedPoll runs
    // only the FIRST subscriber's fetcher for a given key, so changing this component's shape
    // here would silently hand the other two a value they do not expect, or vice versa depending
    // on mount order. closedOwners rides the same endpoint but its OWN poll key below instead.
    const fetchAll = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<BridgeTrackedPositionsResponse>)
        .then((body) => body.positions);
    const unsubscribe = subscribeSharedPoll("bridge-all-positions", fetchAll, 2000, (value, err) => {
      if (!alive || err || !value) return;
      setClaims(
        value.flatMap((p) => {
          const strategy = getLiveStrategyByBridgeId(p.strategyId);
          return strategy
            ? [{ strategyKey: strategy.key, position: positionFromBridge(p), beta: p.beta, corr: p.corr, sigma: p.sigma, awaitingFill: p.awaitingFill === true }]
            : [];
        }),
      );
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  /**
   * Who closed a ticker today — a SEPARATE poll key from the one above, even though it is the
   * exact same URL: subscribeSharedPoll runs only the first subscriber's fetcher for a given key,
   * so this cannot ride "bridge-all-positions" without also changing what that key resolves to
   * for CaesarBridgeDecisions/CaesarCharts. One extra request every 2s is the cost of that safety.
   *
   * Without this, a position that CLOSES drops out of `/positions` entirely — the only thing the
   * claims poll above reads — so a closed ticker read UNCLAIMED no matter how sure the operator
   * was which strategy had traded it (2026-09-16: GDXU, a closed PairFlux trade).
   */
  useEffect(() => {
    let alive = true;
    const fetchClosedOwners = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<BridgeTrackedPositionsResponse>)
        .then((body) => ({ closedOwners: body.closedOwners ?? {}, prunes: body.prunes ?? [] }));
    const unsubscribe = subscribeSharedPoll("bridge-closed-owners", fetchClosedOwners, 2000, (value, err) => {
      if (!alive || err || !value) return;
      setClosedOwners(value.closedOwners);
      setPrunes(value.prunes);
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

    // Filled in only for a ticker with NO live claim above — an open position's own claim is
    // always the truth; this is what is left once the bridge has forgotten the open one.
    for (const [ticker, strategyKeys] of Object.entries(closedOwners)) {
      const t = ticker.trim().toUpperCase();
      if (!t || claimsByTicker.has(t)) continue;
      const claimed = strategyKeys.flatMap((id) => {
        const strategy = getLiveStrategyByBridgeId(id);
        return strategy ? [{ strategyKey: strategy.key, position: closedClaim(), beta: null, corr: null, sigma: null }] : [];
      });
      if (claimed.length > 0) claimsByTicker.set(t, claimed);
    }

    const relevant = (snapshot?.positions ?? []).filter(isRelevant);
    const seen = new Set<string>();

    const rows: Row[] = relevant
      .flatMap((p): Row[] => {
        const t = (p.ticker ?? "").trim().toUpperCase();
        seen.add(t);
        const owners = claimsByTicker.get(t) ?? [];
        const open = isOpen(p);
        // SHARED means two DIFFERENT strategies hold this ticker, not "more than one claim" —
        // PairFlux alone can produce two claims for the same ticker (it legs one ticker into
        // more than one pair at once, see ServerPositionTracker.FindAll's own doc comment), and
        // treating that as "shared" pulled the ticker's whole P&L out of PairFlux's own total and
        // into the neutral shared bucket while the grand total still counted it — the strategy
        // card and the grand total disagreeing by exactly that ticker's P&L (reported 2026-09-18).
        const shared = new Set(owners.map((o) => o.strategyKey)).size > 1;
        if (owners.length === 0) {
          return [{ bridge: p, claim: null, ticker: t, open, shared: false, untracked: false }];
        }
        // One row each: entry count, status and reason belong to the strategy, not the account.
        return owners.map((claim) => ({
          bridge: p, claim, ticker: t, open, shared,
          untracked: open && claim.position.status === "CLOSED",
        }));
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
      open: number; untracked: number; long: number; short: number; adds: number; priority: number;
      openPnl: number; closedPnl: number; closedCount: number;
    };
    const perStrategy = new Map<string, Agg>();
    for (const inst of instances) {
      perStrategy.set(inst.key, {
        open: 0, untracked: 0, long: 0, short: 0, adds: 0, priority: inst.priority,
        openPnl: 0, closedPnl: 0, closedCount: 0,
      });
    }
    let unclaimedCount = 0;
    let unclaimedOpenPnl = 0;
    let unclaimedClosedPnl = 0;
    let openCount = 0;
    let untrackedCount = 0;

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
        if (r.untracked) untrackedCount += 1;
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
      if (r.untracked) {
        // Held in the account, but the bridge has stopped managing it: counted apart, and never
        // as a tracked Long/Short (the placeholder claim's side is not real).
        agg.untracked += 1;
      } else if (r.open) {
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
      openCount, untrackedCount, rowCount: countedTickers.size,
    };
  }, [claims, closedOwners, snapshot, instances]);

  const pnlTone = (value: number) => value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-zinc-500";

  const grandTotal = view.grandOpenPnl + view.grandClosedPnl;

  // ---- segment view: this segment's own closed-position rows, from segmentPnl's boundary-delta
  // map rather than the account's raw ClosedPnL. Deliberately does not reuse `view.rows` — that is
  // built from the LIVE account snapshot, which is not what a past segment's own frozen numbers
  // should track. Ownership still comes from closedOwners: the segment ledger only knows deltas
  // per ticker, not who traded them, and closedOwners is the exact same "who closed this today"
  // record the LIVE panel already falls back to for a ticker no longer open.
  const segmentView = useMemo(() => {
    if (!selectedSegment) return null;

    type SegRow = { ticker: string; pnl: number; strategyKey: string | null; shared: boolean };
    const rows: SegRow[] = Object.entries(segmentPnl)
      .filter(([, pnl]) => pnl !== 0)
      .map(([ticker, pnl]) => {
        const ownerIds = closedOwners[ticker] ?? [];
        const owners = ownerIds.flatMap((id) => {
          const s = getLiveStrategyByBridgeId(id);
          return s ? [s.key] : [];
        });
        return {
          ticker,
          pnl,
          strategyKey: owners.length === 1 ? owners[0] : null,
          shared: owners.length > 1,
        };
      })
      .sort((a, b) => b.pnl - a.pnl || a.ticker.localeCompare(b.ticker));

    const perStrategy = new Map<string, number>();
    let unclaimed = 0;
    let shared = 0;
    for (const r of rows) {
      if (r.shared) shared += r.pnl;
      else if (r.strategyKey) perStrategy.set(r.strategyKey, (perStrategy.get(r.strategyKey) ?? 0) + r.pnl);
      else unclaimed += r.pnl;
    }
    const total = rows.reduce((sum, r) => sum + r.pnl, 0);

    return { rows, perStrategy, unclaimed, shared, total };
  }, [selectedSegment, segmentPnl, closedOwners]);

  // UNCLAIMED always sorts to the bottom regardless of direction — it is not "before" or "after"
  // a real strategy name alphabetically, it is a separate category the operator checks last.
  const sortedRows = useMemo(() => {
    const rows = cardFilter ? view.rows.filter((r) => r.claim?.strategyKey === cardFilter) : view.rows;
    if (strategySort === 0) return rows;
    const withOrder = rows.map((r, i) => ({ r, i }));
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

  return (
    <div className={CAESAR_PANEL_SURFACE + " mt-3"}>
      {/*
        Segment switcher. LIVE (selectedSegment === null) leaves everything below completely
        untouched — this row only exists once the plan actually defines segments to switch between.
      */}
      {segments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-[#0a0a0a]/30 px-3 py-2">
          <button
            type="button"
            onClick={() => setSelectedSegment(null)}
            className={
              "rounded px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors " +
              (selectedSegment === null ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")
            }
          >
            Live
          </button>
          {segments.map((s) => (
            <button
              key={s.segmentKey}
              type="button"
              onClick={() => setSelectedSegment(s.segmentKey)}
              title={s.hasData ? undefined : "This segment has not started yet today"}
              className={
                "rounded px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors " +
                (selectedSegment === s.segmentKey
                  ? "bg-white/10 text-zinc-100"
                  : s.hasData
                    ? "text-zinc-500 hover:text-zinc-300"
                    : "text-zinc-700")
              }
            >
              {s.segmentKey}
            </button>
          ))}
        </div>
      )}

      {selectedSegment && segmentView ? (
        <SegmentClosedPanel segmentKey={selectedSegment} view={segmentView} pnlTone={pnlTone} instances={instances} />
      ) : (
      <>
      {/*
        ONE BLOCK. Used to be two — a "Strategy P&L" section and a separately-framed "Active"
        panel right under it, each with its own idea of a header (one had per-strategy totals in
        its OWN title bar's `right` slot, duplicating the cards a few pixels above it). Merged: one
        header (click it to clear the filter below), one row of clickable cards (click one to see
        only ITS rows in the table), one table.
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCardFilter(null)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCardFilter(null); }}
        title="Click to clear the strategy filter and show every situation"
        className="flex flex-wrap items-baseline justify-between gap-4 bg-[#0a0a0a]/40 px-3 py-2.5 backdrop-blur-xl transition-colors hover:bg-white/[0.02]"
      >
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Active
          <span className="ml-2 font-normal tracking-normal text-zinc-600">
            {snapshot?.account ? `acct ${snapshot.account} · ` : ""}
            {view.openCount} open across the account
            {view.untrackedCount > 0 && (
              <span
                className="text-amber-300/90"
                title="Held in the account, but the bridge stopped tracking them (they are not closed). Nothing is managing their adds or exits."
              > · {view.untrackedCount} not tracked by the bridge</span>
            )}
            {cardFilter && <> · filtered to {cardFilter}</>}
          </span>
        </div>
        <div className="flex items-baseline gap-6">
          <HeaderMetric label="Total" value={grandTotal} tone={pnlTone(grandTotal)} />
          <HeaderMetric label="Open" value={view.grandOpenPnl} tone={pnlTone(view.grandOpenPnl)} />
          <HeaderMetric label="Closed" value={view.grandClosedPnl} tone={pnlTone(view.grandClosedPnl)} />
        </div>
      </div>

      <div className="grid gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from(view.perStrategy.entries())
          // Idle — nothing open, nothing realised today — is not worth its own card. instances
          // (and so perStrategy) still covers every registered strategy regardless of the
          // current segment, on purpose (a position can close long after its segment ends), so
          // filtering HERE — what to show — rather than upstream — what to track — is what keeps
          // that intact while still decluttering a card grid that used to list four strategies
          // at "0 · +0.00" next to the two actually doing anything.
          .filter(([, strategy]) => strategy.open > 0 || strategy.untracked > 0 || strategy.closedCount > 0)
          .map(([key, strategy]) => {
            const total = strategy.openPnl + strategy.closedPnl;
            const active = cardFilter === key;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setCardFilter((f) => (f === key ? null : key)); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setCardFilter((f) => (f === key ? null : key)); } }}
                title={active ? `Click to show every strategy again` : `Click to show only ${key}'s own situations`}
                className={
                  "scanner-glass-card cursor-pointer rounded-2xl border px-3 py-2.5 shadow-xl transition-all duration-300 " +
                  (active
                    ? "border-white/30 bg-[#0a0a0a]/80"
                    : "border-white/[0.06] bg-[#0a0a0a]/60 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80")
                }
              >
                <div className="flex items-baseline justify-between gap-2 font-mono">
                  <div className="flex items-baseline gap-2.5 overflow-hidden">
                    <span className="text-[16px] font-bold uppercase tracking-[0.1em] text-zinc-100">{key}</span>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {strategy.open} open <span className="ml-1 text-emerald-300/80">{strategy.long}L</span><span className="ml-1 text-rose-300/80">{strategy.short}S</span>
                      {strategy.untracked > 0 && (
                        <span
                          className="ml-2 text-amber-300/90"
                          title="Still held in the account, but the bridge no longer tracks them — nothing is managing their adds or exits."
                        >
                          · {strategy.untracked} untracked
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-600">#{strategy.priority}</span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5 font-mono tabular-nums">
                  <Metric label="Total" value={total} tone={pnlTone(total)} />
                  <Metric label="Open" value={strategy.openPnl} tone={pnlTone(strategy.openPnl)} />
                  <Metric label="Closed" value={strategy.closedPnl} tone={pnlTone(strategy.closedPnl)} />
                </div>
              </div>
            );
          })}
      </div>

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

      {/* ---- the table ---- */}
      <div className="max-h-[320px] overflow-auto border-t border-white/[0.06]">
        <table className="w-full min-w-[1180px] text-xs font-mono">
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
              <th className="text-right text-sky-300/80">Signal</th>
              <th className="text-right text-fuchsia-300/70">Beta</th>
              <th className="text-right text-fuchsia-300/70">Corr</th>
              <th className="text-right text-fuchsia-300/70">Sigma</th>
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
                <td colSpan={14} className="px-3 py-8 text-center text-zinc-600">
                  Nothing open.
                </td>
              </tr>
            ) : null}

            {sortedRows.map((r, index) => {
              const openPnl = r.open ? r.bridge.openPnL ?? 0 : null;
              // null (field absent) contributes nothing rather than a fabricated zero.
      const closedPnl = r.bridge.closedPnL ?? 0;
              const side = r.untracked
                ? accountSide(r.bridge, (r.bridge.side ?? "").toString())
                : (r.claim?.position.side ?? r.bridge.side ?? "").toString();
              // Why the bridge dropped it, from its own prune log — the newest event for this ticker + strategy.
              const prune = r.untracked && r.claim
                ? [...prunes].reverse().find((e) =>
                    e.ticker.toUpperCase() === r.ticker &&
                    getLiveStrategyByBridgeId(e.strategyId)?.key === r.claim?.strategyKey)
                : undefined;
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
                    {!r.claim && (
                      <span
                        className="ml-1.5 rounded bg-amber-500/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-300"
                        title="The account holds it, no strategy admits to it — manual, or left from a session whose engine is no longer mounted."
                      >
                        unclaimed
                      </span>
                    )}
                  </td>
                  <td className={r.claim ? "text-zinc-300" : "text-amber-300"}>
                    {r.claim ? r.claim.strategyKey.toUpperCase() : "UNCLAIMED"}
                  </td>
                  <td className={side === "Short" ? "text-rose-300" : "text-emerald-300"}>
                    {r.open ? side || "—" : <span className="text-zinc-600">flat</span>}
                  </td>
                  {/*
                    SIGNAL/BETA/CORR/SIGMA — the strategy's own ratings-table stats behind this
                    exact position, not a generic market number: Arbitrage's own vs its benchmark,
                    PairFlux's own pair-level (same value on both legs). Null (not "0") when the
                    bridge itself has never seen a reading with them, e.g. right after an entry.
                  */}
                  <td className="text-right tabular-nums text-zinc-400">{fmt(r.claim?.position.entrySignal)}</td>
                  <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(r.claim?.beta)}</td>
                  <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(r.claim?.corr)}</td>
                  <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(r.claim?.sigma)}</td>
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
                  <td className={r.untracked ? "font-bold text-amber-300" : "text-zinc-400"}>
                    {r.untracked ? "UNTRACKED" : r.open ? r.claim?.position.status ?? r.bridge.status ?? "—" : "CLOSED"}
                  </td>
                  <td
                    className={"truncate " + (r.untracked ? "text-amber-300/70" : "text-zinc-600")}
                    title={r.untracked ? prune?.reason : undefined}
                  >
                    {r.untracked
                      ? `still held in the account — the bridge stopped tracking it${prune ? `: ${prune.reason}` : " (only remembers who traded it)"}`
                      : r.claim?.position.reason ?? ""}
                  </td>
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
                <td className="text-right tabular-nums text-zinc-400">{fmt(c.position.entrySignal)}</td>
                <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(c.beta)}</td>
                <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(c.corr)}</td>
                <td className="text-right tabular-nums text-fuchsia-200/70">{fmt(c.sigma)}</td>
                <td className={c.awaitingFill ? "text-right text-amber-300" : "text-right text-rose-300"}>
                  {c.awaitingFill ? "sent · waiting for fill" : "not in account"}
                </td>
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
      </>
      )}
    </div>
  );
}

/**
 * One segment's own closed-position data — the operator's own requested view: reset to zero the
 * instant the segment starts, frozen forever once the next one begins. See segmentView's own doc
 * comment in CaesarPositions for how `view` is built from the bridge's boundary-delta ledger.
 */
function SegmentClosedPanel({
  segmentKey,
  view,
  pnlTone,
  instances,
}: {
  segmentKey: string;
  view: {
    rows: { ticker: string; pnl: number; strategyKey: string | null; shared: boolean }[];
    perStrategy: Map<string, number>;
    unclaimed: number;
    shared: number;
    total: number;
  };
  pnlTone: (value: number) => string;
  instances: CaesarPositionsProps["instances"];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 bg-[#0a0a0a]/40 px-3 py-2.5 backdrop-blur-xl">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Closed — {segmentKey}
          <span className="ml-2 font-normal tracking-normal text-zinc-600">
            {view.rows.length} ticker{view.rows.length === 1 ? "" : "s"} closed this segment
          </span>
        </div>
        <HeaderMetric label="Closed" value={view.total} tone={pnlTone(view.total)} />
      </div>

      <div className="grid gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-2 xl:grid-cols-3">
        {instances
          .filter((inst) => (view.perStrategy.get(inst.key) ?? 0) !== 0)
          .map((inst) => {
            const value = view.perStrategy.get(inst.key) ?? 0;
            return (
              <div key={inst.key} className="scanner-glass-card rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 px-3 py-2.5 shadow-xl">
                <div className="flex items-baseline justify-between gap-2 font-mono">
                  <span className="text-[16px] font-bold uppercase tracking-[0.1em] text-zinc-100">{inst.key}</span>
                  <span className="shrink-0 text-[10px] text-zinc-600">#{inst.priority}</span>
                </div>
                <div className="mt-2.5 border-t border-white/[0.06] pt-2.5 font-mono tabular-nums">
                  <Metric label="Closed" value={value} tone={pnlTone(value)} />
                </div>
              </div>
            );
          })}
      </div>

      {(view.unclaimed !== 0 || view.shared !== 0) && (
        <div className="mx-3 mb-3 flex gap-4 font-mono text-[10px] text-zinc-500">
          {view.unclaimed !== 0 && <span>unclaimed: <span className={pnlTone(view.unclaimed)}>{view.unclaimed >= 0 ? "+" : ""}{fmt(view.unclaimed)}</span></span>}
          {view.shared !== 0 && <span>shared: <span className={pnlTone(view.shared)}>{view.shared >= 0 ? "+" : ""}{fmt(view.shared)}</span></span>}
        </div>
      )}

      <div className="max-h-[320px] overflow-auto border-t border-white/[0.06]">
        <table className="w-full min-w-[420px] text-xs font-mono">
          <thead className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-zinc-300 backdrop-blur-xl">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.14em]">
              <th className="text-left text-zinc-200">Ticker</th>
              <th className="text-left text-sky-300/70">Strategy</th>
              <th className="text-right text-pink-400/80">Closed P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-zinc-600">
                  Nothing closed in this segment yet.
                </td>
              </tr>
            ) : view.rows.map((r) => (
              <tr key={r.ticker} className="border-t border-white/5 [&>td]:px-3 [&>td]:py-2.5">
                <td className="font-bold text-zinc-200">
                  {r.ticker}
                  {r.shared && (
                    <span className="ml-1.5 rounded bg-sky-500/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-sky-300">shared</span>
                  )}
                </td>
                <td className={r.strategyKey ? "text-zinc-300" : "text-amber-300"}>
                  {r.shared ? "SHARED" : r.strategyKey?.toUpperCase() ?? "UNCLAIMED"}
                </td>
                <td className={"text-right tabular-nums " + pnlTone(r.pnl)}>
                  {r.pnl >= 0 ? "+" : ""}{fmt(r.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-widest text-zinc-600">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${tone}`}>{value >= 0 ? "+" : ""}{fmt(value)}</div>
    </div>
  );
}

/** Metric's larger twin, for the Grand Total figures sitting beside the section's own header. */
function HeaderMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-widest text-violet-200/50">{label}</div>
      <div className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${tone}`}>{value >= 0 ? "+" : ""}{fmt(value)}</div>
    </div>
  );
}
