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
  /**
   * Enters at the 16:00 close and exits on a LATER trading day (Day Two, Reversal), so its book is
   * still held when the Caesar day rolls at 21:00. Caesar gives these their own category on every
   * chart in every segment: their positions, P&L and entries do not belong to whichever segment
   * the clock happens to be in, and scoping them to the segment they were sent in hid them the
   * morning they exit (the donut read them as UNCLAIMED, the P&L lines dropped them).
   */
  holdsOvernight?: boolean;
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
    holdsOvernight: true,
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

  // Reversal: fade a stack extreme at 15:50, entry 16:00, exit at one of five clock-time classes
  // (18:00 / 21:00 / 04:00+1 / 07:00+1 / PRINT 09:30+1) — see ReversalTiming.Default and
  // ReversalGate.cs. Flipped to "bridge" (2026-09-22): ReversalServerStrategy is now a real
  // IServerStrategy (Program.cs), the same flip Arbitrage got 2026-09-15 — see that entry's own
  // comment. Its live dispatch is registered but NOT live: StreamAutomationControlService's
  // AutoEnabled defaults false for "stream.reversal" (nobody has ever turned it on), and
  // TradingAppOrderIntentType.ReversalEnterLong/Short still has no real TradingApp hotkey bound
  // (see that enum member's own doc comment) — an operator has two separate, deliberate steps left
  // before this can ever send a real order, not one. The live-params PUSH from this page is still
  // not wired (see ReversalScanner.tsx's own note by its entryIntentTypes) — the bridge's
  // ReversalLiveParamsService (api/stream/reversal/params) runs on its own defaults until that
  // exists. priority 24 — one below Day Two's 25, deliberately: the two strategies share almost the
  // same 15:45-16:05 trading window, and there is no reason for Reversal to win a contested ticker
  // over the already-live Day Two before it has traded for real even once.
  reversal: {
    key: "reversal",
    bridgeStrategyId: "stream.reversal",
    nav: {
      stream: "/reversal/stream",
      scanner: "/reversal/scanner",
      sonar: "/reversal/sonar",
      scout: "/reversal/scout",
    },
    tradingWindow: { fromMinuteIdx: 15 * 60 + 45, toMinuteIdx: 16 * 60 + 5 },
    priority: 24,
    holdsOvernight: true,
    api: { paperBase: "/api/paper/reversal", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.reversal", sonarPrefix: "bridge.reversal", streamPrefix: "stream.reversal" },
    // Reversal's own rating classes: the five clock-time exits from ReversalTiming.Default's
    // ExitTargetMinByClass, read from /api/paper/reversal's gamma table (a single gamma per
    // ticker x class x sign, not a rate/total bin like OpenDoor/Day Two).
    ratingClasses: {
      dimension: "EXIT",
      keys: ["exit18", "exit21", "exit04", "exit07", "print"],
      labels: { exit18: "18:00", exit21: "21:00", exit04: "04:00+1", exit07: "07:00+1", print: "PRINT" },
    },
  },

  // Continuum: the mirror-image bet to Reversal on the SAME 15:50 signal / 16:00 entry / five
  // clock-time exits (18:00 / 21:00 / 04:00+1 / 07:00+1 / PRINT 09:30+1) — see ContinuumTiming.Default
  // and ContinuumGate.cs. Reversal fades the extreme (isLong = d < 0); Continuum bets the extreme
  // keeps moving (isLong = d > 0). Added 2026-09-30 (the operator's own instruction: "CONRINUUM повна
  // протилежність... очікує продовження зміни"); its own ratings file is a deliberate placeholder
  // (ContinuumRatingsService.LoadAsync always returns an empty table) until the operator's own
  // notebook publishes continuum_rolling_perf.json.gz — see that service's own doc comment. Only the
  // Scanner half is wired so far: no ContinuumServerStrategy, no ContinuumLiveParamsService, no
  // TradingApp hotkey — this entry exists so the Scanner page has routes/storage/window to read, the
  // same staged rollout Reversal itself went through. priority 23 — one below Reversal's 24, for the
  // same reason Reversal sits below Day Two: it has not traded for real even once yet.
  continuum: {
    key: "continuum",
    bridgeStrategyId: "stream.continuum",
    nav: {
      stream: "/continuum/stream",
      scanner: "/continuum/scanner",
      sonar: "/continuum/sonar",
      scout: "/continuum/scout",
    },
    tradingWindow: { fromMinuteIdx: 15 * 60 + 45, toMinuteIdx: 16 * 60 + 5 },
    priority: 23,
    holdsOvernight: true,
    api: { paperBase: "/api/paper/continuum", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.continuum", sonarPrefix: "bridge.continuum", streamPrefix: "stream.continuum" },
    // Continuum's own rating classes: same five clock-time exits as Reversal's ExitTargetMinByClass,
    // read from /api/paper/continuum's own (currently empty) gamma table.
    ratingClasses: {
      dimension: "EXIT",
      keys: ["exit18", "exit21", "exit04", "exit07", "print"],
      labels: { exit18: "18:00", exit21: "21:00", exit04: "04:00+1", exit07: "07:00+1", print: "PRINT" },
    },
  },

  // OPG•Reversal: Reversal's own mean-reversion thesis (unchanged — see AXION-app's
  // OPGReversalGate.cs), a different clock entirely. Signal 9:20-9:25, a special "enters at the
  // open" order fills at 9:30 regardless of when inside that window it was sent, three same-day
  // exits (9:45/10:00/10:30). PNL is gap-anchored at ENTRY (the settled opening Gap%), not at exit
  // the way Reversal's own print class works — see TapeOPGReversalEngine.cs's own header comment.
  // Added 2026-10-01 (the operator's own instruction). OPGReversalServerStrategy now exists
  // (Sonar/Stream/Live backend wired 2026-10-01); Hotkeys.OPGReversalBuy/Sell default to Ctrl+F7/
  // Ctrl+F8 (bound 2026-10-02, the same chord OpenFade/OpenRide already use). AutoEnabled still
  // defaults false — no real order can go out until the operator explicitly enables the strategy.
  // holdsOvernight is false: every exit lands same calendar day, well before the close.
  // priority 19 — one below openfade (20): OPG's own signal window (9:20-9:25) overlaps the
  // OpenDoor family's own 9:20-10:00 window, and an unproven new strategy should not outrank one
  // already live there, the same reasoning Reversal/Continuum's own priorities follow relative to
  // Day Two.
  opgreversal: {
    key: "opgreversal",
    bridgeStrategyId: "stream.opgreversal",
    nav: {
      stream: "/opg-reversal/stream",
      scanner: "/opg-reversal/scanner",
      sonar: "/opg-reversal/sonar",
    },
    tradingWindow: { fromMinuteIdx: 9 * 60 + 20, toMinuteIdx: 9 * 60 + 35 },
    priority: 19,
    holdsOvernight: false,
    api: { paperBase: "/api/paper/opgreversal", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.opgreversal", sonarPrefix: "bridge.opgreversal", streamPrefix: "stream.opgreversal" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["exit0945", "exit1000", "exit1030"],
      labels: { exit0945: "09:45", exit1000: "10:00", exit1030: "10:30" },
    },
  },

  // OPG•Continuum: OPG•Reversal's own mirror — Continuum's unchanged thesis (isLong = d > 0, see
  // AXION-app's OPGContinuumGate.cs) on the SAME OPG clock as OPG•Reversal (signal 9:20-9:25,
  // open-anchored entry at 9:30, three same-day exits 9:45/10:00/10:30) and the SAME gap-anchored-
  // ENTRY pricing — see TapeOPGContinuumEngine.cs's own header comment. Added 2026-10-01 (the
  // operator's own instruction, "Я скопіював файли CONTINUUM, тепер займатись і переробки їх під
  // OPG•CONTINUUM"). Full Scanner/Sonar/Stream/Live backend wired the same session.
  // Hotkeys.OPGContinuumBuy/Sell default to the SAME Ctrl+F7/Ctrl+F8 chord as OPGReversal's own
  // (bound 2026-10-02). AutoEnabled still defaults false — no real order can go out until the
  // operator explicitly enables the strategy. holdsOvernight
  // is false: every exit lands same calendar day. priority 18 — one below opgreversal (19), the same
  // "has not traded for real even once, and the two read the identical signal with opposite signs"
  // reasoning Reversal/Continuum's own priorities follow relative to each other.
  opgcontinuum: {
    key: "opgcontinuum",
    bridgeStrategyId: "stream.opgcontinuum",
    nav: {
      stream: "/opg-continuum/stream",
      scanner: "/opg-continuum/scanner",
      sonar: "/opg-continuum/sonar",
    },
    tradingWindow: { fromMinuteIdx: 9 * 60 + 20, toMinuteIdx: 9 * 60 + 35 },
    priority: 18,
    holdsOvernight: false,
    api: { paperBase: "/api/paper/opgcontinuum", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.opgcontinuum", sonarPrefix: "bridge.opgcontinuum", streamPrefix: "stream.opgcontinuum" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["exit0945", "exit1000", "exit1030"],
      labels: { exit0945: "09:45", exit1000: "10:00", exit1030: "10:30" },
    },
  },

  // VWAP Bounce: intraday residual-reversal fade (spec: OriON-strategies/notebooks/VWAPBounce.ipynb).
  // FRONTEND-ONLY for now (2026-10-05): scanner/sonar/stream pages are wired, but there is no bridge
  // backend (no tape engine, gate, ratings or server strategy), so the paper/stream endpoints under
  // these routes do not exist yet and the pages show no data. Exits are TARGET/STOP/EOD per trade
  // (not clock classes). Window 10:00-15:55 decision points. holdsOvernight false (EOD flat).
  vwapbounce: {
    key: "vwapbounce",
    bridgeStrategyId: "stream.vwapbounce",
    nav: {
      stream: "/vwap-bounce/stream",
      scanner: "/vwap-bounce/scanner",
      sonar: "/vwap-bounce/sonar",
    },
    tradingWindow: { fromMinuteIdx: 10 * 60, toMinuteIdx: 15 * 60 + 56 },
    priority: 17,
    holdsOvernight: false,
    api: { paperBase: "/api/paper/vwapbounce", signalsBase: "/api/arbitrage" },
    streamEngine: "bridge",
    storage: { scannerPrefix: "paper.vwapbounce", sonarPrefix: "bridge.vwapbounce", streamPrefix: "stream.vwapbounce" },
    ratingClasses: {
      dimension: "EXIT",
      keys: ["target", "stop", "eod"],
      labels: { target: "TARGET", stop: "STOP", eod: "EOD" },
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
