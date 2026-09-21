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
  /** Only strategies that have a Scout page (rolling 5/20/40-session performance) set this. */
  scout?: string;
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
  /**
   * Where this strategy's stream engine RUNS.
   *
   * "bridge" — an IServerStrategy exists, so the bridge decides and dispatches on its own and the
   *            browser is only a view. Closing every tab changes nothing.
   * "browser" — the decisions are made by useStreamEngine inside a mounted page. Nothing happens
   *            while no tab hosts it, which is why Caesar mounts these itself rather than leaving
   *            the day to whether someone remembered to keep a tab open.
   *
   * Not derivable from anything else here: it is a fact about the bridge's DI registration
   * (Program.cs, AddSingleton<IServerStrategy, …>), and getting it wrong means either a strategy
   * nobody runs or one that runs twice.
   */
  streamEngine: "bridge" | "browser";
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
      scout: "/arbitrage/scout",
    },
    // Full session: PRE starts at -180 (21:00 the evening before) and POST ends at 19:59, i.e.
    // 1200 exclusive.
    tradingWindow: { fromMinuteIdx: -180, toMinuteIdx: 1200 },
    priority: 100,
    api: { paperBase: "/api/paper/arbitrage", signalsBase: "/api/arbitrage" },
    // Flipped from "browser" 2026-09-15: ArbitrageServerStrategy is a real IServerStrategy
    // (Program.cs) and shadow is off — the bridge decides and dispatches on its own now, so Caesar
    // no longer needs to mount the full browser engine just to have something to host.
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.arb", sonarPrefix: "bridge.arb", streamPrefix: "stream.arbitrage" },
    // v13 notebook (2026-09-20): BLUE/ARK folded into PRE, PRINT folded into INTRA, GLOBAL removed
    // as a gate (the bridge still answers a "global" lookup as a display-only best-of-classes
    // aggregate, never something to filter on). The bridge's own class reader folds a legacy
    // blue/ark/print value onto its new home, so an old saved selection degrades gracefully rather
    // than returning nothing - this list is what the UI now offers going forward.
    ratingClasses: {
      dimension: "SESSION",
      keys: ["pre", "open", "intra", "post"],
      labels: { pre: "PRE", open: "OPEN", intra: "INTRA", post: "POST" },
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
    streamEngine: "bridge",
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
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.daytwo", sonarPrefix: "bridge.daytwo", streamPrefix: "stream.daytwo" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["10m", "30m"],
      labels: { "10m": "10M", "30m": "30M" },
    },
  },

  openfade: {
    key: "openfade",
    bridgeStrategyId: "stream.openfade",
    nav: {
      stream: "/openfade/stream",
      scanner: "/openfade/scanner",
      sonar: "/openfade/sonar",
    },
    // OpenDoor's clock: the band is evaluated 09:20-09:25 and the exits land 09:40 / 10:00. Written
    // out here rather than shared so that changing it cannot move OpenDoor.
    tradingWindow: { fromMinuteIdx: 9 * 60, toMinuteIdx: 10 * 60 },
    priority: 20,
    // Its own endpoints from the start. Day Two spent weeks reading OpenDoor's ratings because the
    // copy pointed at OpenDoor's routes and nothing said so out loud.
    api: { paperBase: "/api/paper/openfade", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.openfade", sonarPrefix: "bridge.openfade", streamPrefix: "stream.openfade" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["10m", "30m"],
      labels: { "10m": "10M", "30m": "30M" },
    },
  },

  // OpenRide: OpenFade's mirror. Identical clock, classes and band; the sign is read the other way,
  // so a negative deviation sells here and buys there. Everything addressable is separate — routes,
  // paper base, storage prefixes — because the two run on the same morning and a shared key would
  // have one strategy restore the other's toolbar and read the other's cached days.
  openride: {
    key: "openride",
    bridgeStrategyId: "stream.openride",
    nav: {
      stream: "/openride/stream",
      scanner: "/openride/scanner",
      sonar: "/openride/sonar",
    },
    tradingWindow: { fromMinuteIdx: 9 * 60, toMinuteIdx: 10 * 60 },
    // Below OpenFade's 20, and this is the one pair where the number does real work: the two run
    // the same minutes on the same universe and can name the same ticker on OPPOSITE sides, so
    // whoever wins the claim decides which way the position goes. OpenFade is the established
    // strategy and wins by default; swap the two numbers to hand a contested ticker to OpenRide.
    priority: 15,
    api: { paperBase: "/api/paper/openride", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.openride", sonarPrefix: "bridge.openride", streamPrefix: "stream.openride" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["10m", "30m"],
      labels: { "10m": "10M", "30m": "30M" },
    },
  },
  pairflux: {
    key: "pairflux",
    bridgeStrategyId: "stream.pairflux",
    nav: {
      stream: "/pairflux/stream",
      scanner: "/pairflux/scanner",
      sonar: "/pairflux/sonar",
      scout: "/pairflux/scout",
    },
    // The union of the three PairFlux classes: PRE opens at 21:00 the evening before (-180) and
    // INTRA ends at 16:00. OPEN (09:00-10:00) sits inside that span, so the window is one range
    // rather than three. Half-open, so 960 is exclusive.
    tradingWindow: { fromMinuteIdx: -180, toMinuteIdx: 960 },
    // Below every single-ticker strategy on purpose. PairFlux holds TWO legs, so a ticker it has
    // claimed is one it cannot hand over without leaving the other leg naked; letting the
    // directional strategies win the claim instead keeps that case from arising at all.
    priority: 10,
    api: { paperBase: "/api/paper/pairflux", signalsBase: "/api/arbitrage" },
    // Flipped from "browser" 2026-09-15: PairFluxServerStrategy is a real IServerStrategy
    // (Program.cs) and shadow is off — the bridge decides and dispatches on its own now, so Caesar
    // no longer needs to mount the full browser engine just to have something to host.
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.pairflux", sonarPrefix: "bridge.pairflux", streamPrefix: "stream.pairflux" },
    // PairFlux rates a pair per class the notebook cuts (see OriON-strategies/notebooks/
    // PairFlux.ipynb): PRE 21:00-09:30, OPEN 09:00-10:00, INTRA 10:00-16:00. Same
    // `class x direction -> {rate, total}` shape as everything else; direction here is the SIGN OF
    // THE SPREAD (dev > 0 = this row's ticker is the one that ran ahead), not a long/short call.
    ratingClasses: {
      dimension: "CLASS",
      keys: ["pre", "open", "intra"],
      labels: { pre: "PRE", open: "OPEN", intra: "INTRA" },
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
