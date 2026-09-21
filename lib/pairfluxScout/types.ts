/**
 * PairFlux Scout — wire types and the page's own vocabulary.
 *
 * The pair analogue of lib/scout/types.ts (Arbitrage Scout) — see that file for the full design
 * rationale, which this mirrors point for point. Two structural differences, both real, not
 * incidental:
 *
 *   - a row is a PAIR (a, b, bench), not a single ticker.
 *   - there are 3 classes (PRE/OPEN/INTRA, no POST), and PairFlux's exit time is genuinely
 *     per-episode data (confirmed convergence or a forced end-of-day exit) — never a fixed
 *     class-close constant the way Arbitrage's is.
 *
 * `mode` has 4 variants: "pct" (raw |entry_dev|, always available) and "sigma"/"gamma"/"alpha"
 * (a MULTIPLE of the pair's own published level for the CURRENT class — joined server-side from
 * PairFluxRatingsService's summary.csv parse, see PairFluxScoutService's class doc comment for
 * the forward-vs-mirrored trap that join has to avoid). Unlike Arbitrage's gamma/delta, PairFlux's
 * levels are per (pair, CLASS) only — never split by sign — because the notebook's own per-class
 * row publishes one alpha/sigma/gamma covering both directions.
 */

import type { ScoutRanges } from "../scout/types";

export type PfScoutClass = "pre" | "open" | "intra";
export type PfScoutSign = "pos" | "neg";

/** Which direction the user is looking at. pos = leg A ran ahead of its B-implied value at entry. */
export type PfScoutSide = "pos" | "neg" | "both";

export type PfScoutMode = "pct" | "sigma" | "gamma" | "alpha";

export type PfScoutWindow = 5 | 20 | 40 | 65;
export type PfScoutCurveMode = "daily" | "trade";

export type PfScoutSortKey =
  | "pair"
  | "rating"
  | "hard"
  | "soft"
  | "start"
  | "entryTime"
  | "trades"
  | "pnl"
  | "avgPnl"
  | "win";

export type PfScoutMetaWire = {
  ok: boolean;
  meta: {
    version: string | null;
    generatedAt: string | null;
    mostRecentSession: string | null;
    sessionsSeen: number;
    positionUsd: number;
    startBinStep: number;
    startBinMax: number;
    pnlBasis: string | null;
    levelsAvailable: boolean;
    windowsDays: number[];
    /** Oldest → newest. An episode's date index points into this list. */
    recentDates: string[];
  };
  /** Row order == the pair index every episode slice refers to. */
  pairs: Array<{
    a: string;
    b: string;
    bench: string | null;
    /** per-class sigma/gamma/alpha, FORWARD (a,b) direction only; absent class = never published */
    lv?: Partial<Record<PfScoutClass, {
      s?: number | null; g?: number | null; a?: number | null;
      /** the pair's correlation (5-bar returns) and hedge beta for this class, forward (a,b) direction */
      c?: number | null; bt?: number | null;
      /** PUBLISHED all-history rating per direction: [rate, total] (summary.csv long_/short_ columns) */
      rp?: number[]; rn?: number[];
    }>>;
  }>;
};

export type PfScoutSliceWire = {
  ok: boolean;
  cls: PfScoutClass;
  sign: PfScoutSign;
  n: number;
  /** pair index */
  p: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 none, 1 soft, 2 hard */
  st: number[];
  /** |entry_dev| at the confirmed entry, pp */
  ed: Array<number | null>;
  /** peak |dev| for the episode, pp; null = unknown */
  pk: Array<number | null>;
  /** capture, pp, signed positive = profit; null = unknown */
  cp: Array<number | null>;
  /** NY session-minute at the confirmed entry/exit row, PRE-wrapped; null = unknown */
  em: Array<number | null>;
  xm: Array<number | null>;
};

/** Columnar episode log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type PfScoutSlice = {
  cls: PfScoutClass;
  sign: PfScoutSign;
  n: number;
  pair: Int32Array;
  date: Uint8Array;
  status: Uint8Array;
  entryDev: Float64Array;
  peak: Float64Array; // NaN = unknown
  capture: Float64Array; // NaN = unknown
  entryMinute: Float64Array;
  exitMinute: Float64Array;
};

/** rate = converged / total over the pair's whole history for a class and direction. */
export type PfScoutRating = { rate: number; total: number };

export type PfScoutLevels = { sigma: number; gamma: number; alpha: number; corr: number; beta: number };

export type PfScoutPair = {
  a: string;
  b: string;
  bench: string | null;
  /** per-class levels, NaN-filled where the notebook never published one for that class */
  levels: Record<PfScoutClass, PfScoutLevels>;
  /** PUBLISHED rating per class and direction - general for the class, NOT recomputed per day-window */
  rating: Record<PfScoutClass, { pos: PfScoutRating | null; neg: PfScoutRating | null }>;
};

export type PfScoutMeta = {
  generatedAt: string | null;
  mostRecentSession: string | null;
  positionUsd: number;
  levelsAvailable: boolean;
  pnlBasis: string | null;
  recentDates: string[];
  pairs: PfScoutPair[];
};

export type PfScoutParams = {
  window: PfScoutWindow;
  mode: PfScoutMode;
  /** lower bound, in `mode` units; 0 = no bound */
  start: number;
  /** upper bound, in `mode` units; 0 (or <= start) = no bound */
  to: number;
  minRate: number;
  minTotal: number;
  /** ρ/β/σ/α of the PAIR for the episode's own class; a set bound rejects a pair with no such number */
  ranges: ScoutRanges;
  /** true = drop episodes born just after, or alive across, the feed's 00:00 / 04:00 rollover */
  excludeRollover: boolean;
  /** |capture| above this (percentage points) is a data fault, not an episode; 0 = keep everything */
  capPct: number;
  sizeUsd: number;
};

export type PfScoutPairRow = {
  /** pair index into PfScoutMeta.pairs */
  i: number;
  trades: number;
  hard: number;
  soft: number;
  /** PUBLISHED rating of the directions in scope, pooled by total; NaN = unrated */
  rating: number;
  ratingTotal: number;
  hardRate: number;
  softRate: number;
  /** mean start value, in the CURRENT mode's unit */
  start: number;
  /** mean entry clock time, NY session-minute (PRE-wrapped); NaN if unavailable */
  entryMinuteIdx: number;
  pnlN: number;
  pnlUsd: number;
  avgPnlPct: number;
  win: number;
};

export type PfScoutCurvePoint = { key: string; equity: number; pnl: number };

/**
 * One episode, shaped to structurally satisfy the Scanner's `PaperArbClosedDto` so the shared
 * "by time" chart components (components/scanner/shared/charts.tsx) render it unmodified.
 * `peakMinuteIdx` is NOT real data here — PairFlux's episode log carries the peak's VALUE but not
 * its row position, so it is set equal to `startMinuteIdx` as a harmless placeholder. This means
 * only the charts that read `startMinuteIdx`/`endMinuteIdx` (StartsEndsByTimeChart,
 * StartsByTimeChart) are valid for PairFlux; PeakStrengthByTimeChart/PeakReversionTwoThirdsChart
 * are deliberately NOT used on this page (see PairFluxScout.tsx).
 */
export type PfScoutEpisode = {
  ticker: string; // "A/B"
  benchTicker: string;
  side: "short" | "long";
  startMinuteIdx: number;
  peakMinuteIdx: number;
  endMinuteIdx: number;
  peakMetricAbs: number | null;
  endMetricAbs: number | null;
  totalPnlUsd: number | null;
};

/** One episode, for the per-trade detail table (date/entry/exit/entry-dev/peak/capture/direction). */
export type PfScoutTradeRow = {
  a: string;
  b: string;
  side: "pos" | "neg";
  status: "none" | "soft" | "hard";
  date: number;
  entryMinuteIdx: number;
  exitMinuteIdx: number;
  entryDev: number;
  peak: number; // NaN = unknown
  capture: number; // NaN = unknown
  pnlUsd: number; // NaN = unknown
};

/**
 * The Scanner's "analytics summary" card block, ported to PairFlux's episode-row shape — see
 * `ScoutAnalyticsSummary` (lib/scout/types.ts) for the full formula rationale, which this mirrors
 * exactly except for direction: PairFlux has no long/short leg the way a single ticker does, so
 * `posCount`/`negCount` count `dir` ("pos"/"neg") instead of "LONGS"/"SHORTS".
 */
export type PfScoutAnalyticsSummary = {
  situations: number;
  trades: number;
  moneyflowUsd: number;
  totalPnlUsd: number;
  winRate: number;
  maxWinUsd: number;
  maxLossUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  top2WinShare: number | null;
  top2LossShare: number | null;
  avgTradeUsd: number;
  profitFactor: number | null;
  expectancyUsd: number;
  medianTradeUsd: number;
  medianDayUsd: number;
  dayCount: number;
  posCount: number;
  negCount: number;
};

export type PfScoutResult = {
  /** published rating of the gated pairs, pooled by published total */
  rating: number;
  rows: PfScoutPairRow[];
  episodes: PfScoutEpisode[];
  tradeRows: PfScoutTradeRow[];
  /** episodes that survived every filter, before the per-pair MINRATE/MINTOTAL gate */
  tradesInScope: number;
  /** episodes dropped by the |capture| cap */
  cappedOut: number;
  pairsInScope: number;
  /** episodes of the pairs that passed the gate */
  trades: number;
  hard: number;
  soft: number;
  pnlN: number;
  winN: number;
  pnlUsd: number;
  /** P&L $ per session (index = date index, NOT cumulative), gated pairs only */
  dailyUsd: Float64Array;
  /** per-episode $ in chronological (date-major) order, gated pairs only */
  tradeSeriesUsd: Float64Array;
  tradeSeriesDate: Uint8Array;
};
