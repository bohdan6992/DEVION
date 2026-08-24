/**
 * The one place a strategy is declared.
 *
 * Before this file, the same facts were written out in four places that had to be kept in sync by
 * hand — and were not:
 *
 *   lib/strategyCatalog.ts          key, name, icon, description
 *   lib/caesar/schedule.ts          nav, bridgeStrategyId, window, priority  ("keep in sync with…")
 *   defineScannerStrategy(…)        nav, window, ratingClasses, apiBase, lsKeyPrefix
 *   lib/filters/activeTicker.ts     a STORAGE_KEYS map AND a hardcoded "arbitrage" | "opendoor" union
 *   plus nav hrefs as prop defaults in four components and again in each page
 *
 * They had already drifted: Caesar carried Arbitrage's window as 1200 while the scanner descriptor
 * said 1199, and Caesar linked Arbitrage's SONAR at `/sonar` — which renders BridgeSonarSignals, a
 * different component from the Sonar you are on.
 *
 * ## Why this matters more than tidiness
 *
 * Caesar is meant to launch the streams of ARBITRARY strategies: its plan assigns a strategy to a
 * session segment, and the server engine (`IServerStrategy`, per-strategy shadow mode, priority
 * arbitration) is already built to run several at once. Every one of those needs the same four
 * facts — which bridge id, which window, which priority, which pages — and a strategy that is
 * missing from any one of the four old registries is a strategy Caesar can schedule but not reach.
 *
 * So: adding a strategy is adding an entry HERE. Everything else derives.
 *
 * ## Conventions
 *
 * `tradingWindow` is minuteIdx, **half-open [from, to)**, negatives counting back into the previous
 * calendar day (-180 = 21:00, matching TapeArbClasses.PreFrom). Half-open is the one convention:
 * the scanner descriptors used to write Arbitrage's end as 1199 inclusive and OpenDoor's as 600
 * exclusive, and Caesar had to normalise both by hand or report OpenDoor as overlapping INTRA by a
 * minute.
 *
 * `priority` is the tie-breaker when two strategies claim the same ticker on the same minute
 * boundary — **HIGHER WINS**. Keep them distinct, or the tie falls back to whichever HTTP claim
 * landed first, i.e. network jitter.
 */

export type StrategyNav = {
  stream: string;
  scanner: string;
  sonar: string;
};

export type StrategyRatingClasses = {
  /** Short name of the dimension, for UI copy — e.g. "SESSION" or "EXIT". */
  dimension: string;
  /** Class keys exactly as they appear in this strategy's ratings payload. */
  keys: readonly string[];
  /** Display label per key. */
  labels: Readonly<Record<string, string>>;
};

export type LiveStrategy = {
  /** UI key, matches STRATEGY_CATALOG. */
  key: string;
  /**
   * Identity the BRIDGE knows this strategy by (`StreamInstance.strategyId`, `IServerStrategy
   * .StrategyId`). NOT the UI key: the UI says "opendoor", the bridge says "stream.opendoor".
   * The Caesar plan and the server engine's per-strategy shadow flag are both keyed on this.
   */
  bridgeStrategyId: string;
  nav: StrategyNav;
  /** Half-open [from, to) in minuteIdx. See the header. */
  tradingWindow: { fromMinuteIdx: number; toMinuteIdx: number };
  /** HIGHER WINS. See the header. */
  priority: number;
  api: {
    /** Paper endpoints, e.g. `/api/paper/arbitrage`. No trailing slash. */
    paperBase: string;
    /**
     * Signals endpoint family. Both strategies currently point at `/api/arbitrage`: OpenDoor uses
     * it as a raw universe feed and re-gates client-side, because `/api/opendoor/signals` returns
     * a much thinner payload (11 of SignalItemDto's 54 fields, and a 4-key Meta where the shared
     * shape carries the whole live field block). Repointing OpenDoor needs that handler to emit
     * the shared shape first — see lib/signals/url.ts.
     */
    signalsBase: string;
  };
  storage: {
    /** Scanner filter state, e.g. `paper.arb`. */
    scannerPrefix: string;
    /** Sonar ticker lists / UI state, e.g. `bridge.arb`. */
    sonarPrefix: string;
    /** Stream automation config, e.g. `stream.arbitrage`. */
    streamPrefix: string;
  };
  ratingClasses: StrategyRatingClasses;
};

/**
 * Strategies with a live surface. Everything else in STRATEGY_CATALOG is still assignable in a
 * Caesar plan — planning ahead of the implementation is the point — but has no stream to link to.
 */
export const LIVE_STRATEGIES: Readonly<Record<string, LiveStrategy>> = {
  arbitrage: {
    key: "arbitrage",
    bridgeStrategyId: "stream.arbitrage",
    nav: {
      stream: "/stream/arbitrage",
      scanner: "/paper/arbitrage",
      // `/signals/arbitrage`, NOT `/sonar`. The latter renders BridgeSonarSignals — a separate
      // diagnostic component — so the old value sent the SONAR button somewhere else entirely.
      sonar: "/signals/arbitrage",
    },
    // Full session: PRE starts at -180 (21:00 the evening before) and POST ends at 19:59, i.e.
    // 1200 exclusive.
    tradingWindow: { fromMinuteIdx: -180, toMinuteIdx: 1200 },
    priority: 100,
    api: { paperBase: "/api/paper/arbitrage", signalsBase: "/api/arbitrage" },
    storage: { scannerPrefix: "paper.arb", sonarPrefix: "bridge.arb", streamPrefix: "stream.arbitrage" },
    ratingClasses: {
      dimension: "SESSION",
      keys: ["blue", "pre", "ark", "open", "intra", "print", "post", "global"],
      labels: {
        blue: "BLUE", pre: "PRE", ark: "ARK", open: "OPEN",
        intra: "INTRA", print: "PRINT", post: "POST", global: "GLOBAL",
      },
    },
  },

  opendoor: {
    key: "opendoor",
    bridgeStrategyId: "stream.opendoor",
    nav: {
      stream: "/opendoor/stream",
      scanner: "/opendoor/scanner",
      sonar: "/opendoor/sonar",
    },
    // One entry at 09:20 (±5min), one exit at 09:40 ("10m") or 10:00 ("30m"), per
    // TapeOpenDoorEngine. Nothing outside 09:00–10:00 is of any use to this strategy.
    tradingWindow: { fromMinuteIdx: 9 * 60, toMinuteIdx: 10 * 60 },
    priority: 50,
    api: { paperBase: "/api/paper/opendoor", signalsBase: "/api/arbitrage" },
    storage: { scannerPrefix: "paper.opendoor", sonarPrefix: "bridge.opendoor", streamPrefix: "stream.opendoor" },
    // OpenDoor's own rating classes: the two exit horizons from ExitTargetMinByClass. They play
    // exactly the role Arbitrage's session bands play — class x direction -> {rate, total} gated by
    // minRate/minTotal — and are read from /api/opendoor/summary, not from sigma_peak_bins.
    ratingClasses: {
      dimension: "EXIT",
      keys: ["10m", "30m"],
      labels: { "10m": "10M", "30m": "30M" },
    },
  },

  daytwo: {
    key: "daytwo",
    bridgeStrategyId: "stream.daytwo",
    nav: {
      stream: "/daytwo/stream",
      scanner: "/daytwo/scanner",
      sonar: "/daytwo/sonar",
    },
    // Day Two's own rule: orders go out 15:50-15:55 and the position opens at 16:00, so the
    // surfaces are live across the afternoon rather than the OpenDoor hour they were copied from.
    tradingWindow: { fromMinuteIdx: 15 * 60 + 45, toMinuteIdx: 16 * 60 + 5 },
    priority: 25,
    // Its own endpoints now: /api/paper/daytwo reads signals/daytwo and rates the five Day Two
    // exit classes. Pointing at OpenDoor's meant selecting tickers on bins measured for a 09:20
    // entry, which describe nothing about a position opened at 16:00.
    api: { paperBase: "/api/paper/daytwo", signalsBase: "/api/arbitrage" },
    // Storage IS separate from the start: sharing it would have Day Two and OpenDoor overwrite each
    // other's filters and presets the first time both are open.
    storage: { scannerPrefix: "paper.daytwo", sonarPrefix: "bridge.daytwo", streamPrefix: "stream.daytwo" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["10m", "30m"],
      labels: { "10m": "10M", "30m": "30M" },
    },
  },
};

export type LiveStrategyKey = keyof typeof LIVE_STRATEGIES & string;

/** Every strategy that has a live surface, in declaration order. */
export const LIVE_STRATEGY_LIST: readonly LiveStrategy[] = Object.values(LIVE_STRATEGIES);

/** Lookup that does not lie: undefined for a catalog-only strategy, never a silent fallback. */
export function getLiveStrategy(key: string | null | undefined): LiveStrategy | undefined {
  const k = (key ?? "").trim().toLowerCase();
  return k ? LIVE_STRATEGIES[k] : undefined;
}

/** Bridge id -> strategy, for anything that arrives keyed the way the bridge names things. */
export function getLiveStrategyByBridgeId(bridgeStrategyId: string | null | undefined): LiveStrategy | undefined {
  const id = (bridgeStrategyId ?? "").trim().toLowerCase();
  return id ? LIVE_STRATEGY_LIST.find((s) => s.bridgeStrategyId.toLowerCase() === id) : undefined;
}

/**
 * Priorities must stay distinct — equal ones make ticker arbitration depend on which HTTP claim
 * landed first. Checked at module load so a copy-pasted entry fails loudly rather than at 09:20.
 */
const seenPriorities = new Map<number, string>();
for (const s of LIVE_STRATEGY_LIST) {
  const clash = seenPriorities.get(s.priority);
  if (clash) {
    throw new Error(
      `[strategies] "${s.key}" and "${clash}" both use priority ${s.priority}; ` +
        `priorities arbitrate ticker claims and must be distinct`
    );
  }
  seenPriorities.set(s.priority, s.key);
}
