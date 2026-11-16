/**
 * Reversal Scout — wire types and the page's own vocabulary.
 *
 * Mirrors lib/scout/types.ts (Arbitrage) 1-to-1 in shape. What is genuinely DIFFERENT about
 * Reversal's own data, not a styling choice:
 *   - 5 classes (EXIT18/EXIT21/EXIT04/EXIT07/PRINT), not 4 — the exit time, not a birth window.
 *   - no beta/corr/delta per ticker — ALPHA (the modal |15:50 reading|, split alphaPos/alphaNeg by
 *     the sign of the deviation) and, per (class, sign), GAMMA (the ticker's own reversal-entry
 *     level). v2 also carries a static per-ticker SIGMA (dispersion, read straight off final.parquet's
 *     own "sigma" column), unrelated to alpha — its own unit-bar mode and range box, same as α.
 *   - no hard/soft split — a trade is WIN or LOSS. RATING (published, all-history) and WIN (of the
 *     trades currently in scope) both exist, same as Arbitrage, they are just win rates, not
 *     hard+soft shares.
 *   - no birth/peak/gap concept (one snapshot at 15:50, one entry, one exit) — so there is no
 *     "by time" peak/reversion chart group; only the equity curve, same as the others.
 */

export type ReversalClass = "exit18" | "exit21" | "exit04" | "exit07" | "print";
export type ReversalSign = "pos" | "neg";

/** pos = the stack was HIGH at 15:50 → SHORT it; neg = LOW at 15:50 → LONG it. */
export type ReversalSide = "short" | "long" | "both";

/** What the START / TO thresholds are measured in — pct = raw pp of the 15:50 reading; sigma/alpha/gamma
 * = that reading divided by the ticker's published static sigma / sign-matched alpha / (class,sign) gamma. */
export type ReversalMode = "pct" | "sigma" | "alpha" | "gamma";

export type ReversalWindow = 5 | 20 | 40 | 65;
export type ReversalCurveMode = "daily" | "trade";
/**
 * Which kind of night a trade's own session followed, from SPY+QQQ over 16:00 -> 00:00
 * (OvernightRegimeService on the bridge publishes one label per session).
 *
 * "unk" is a REAL bucket, not a synonym for flat: a third of sessions have no usable midnight
 * print, and the two answers "nobody measured this night" and "this night did not move" must not
 * be merged. "all" is the only setting that does no filtering at all.
 */
export type ReversalRegime = "all" | "up" | "down" | "flat" | "mixed" | "unk";


export type ReversalSortKey = "ticker" | "alpha" | "rating" | "start" | "entryTime" | "trades" | "pnl" | "avgPnl" | "win";

export type ReversalMetaWire = {
  ok: boolean;
  meta: {
    version: string | null;
    generatedAt: string | null;
    mostRecentSession: string | null;
    sessionsSeen: number;
    positionUsd: number;
    minDev: number;
    pnlBasis: string | null;
    windowsDays: number[];
    /** Oldest → newest. A trade's date index points into this list. */
    recentDates: string[];
    /**
     * One label per entry of `recentDates`, same order and length. Absent on a bridge that
     * predates the overnight-regime file; then every session reads as UNKNOWN.
     */
    regimes?: string[];
  };
  /** Row order == the ticker index every trade slice refers to. */
  tickers: Array<{
    t: string;
    /** modal |15:50 reading| on POSITIVE deviations — pairs with the "pos" sign / SHORT side */
    alphaPos: number | null;
    /** same, on NEGATIVE deviations — pairs with the "neg" sign / LONG side */
    alphaNeg: number | null;
    /** static per-ticker dispersion figure (same "sigma" every other strategy already has), unrelated to alpha */
    sigma: number | null;
    /** every (class, sign) this ticker has a published rating for */
    rt?: Array<{
      cls: ReversalClass; sign: ReversalSign;
      total: number; wins: number;
      winRate: number | null; winRateLb: number | null;
      meanPnl: number | null; pnlLb: number | null;
      gamma: number | null; gammaN: number | null; gammaRate: number | null;
    }>;
    etf?: boolean | null;
    country?: string | null;
    sector?: string | null;
    /** listing venue, same two sources as country/sector */
    exchange?: string | null;
    /** Session constants off the tape's static sidecar: PTP, the OUTSIDE-HOURS short-sale flag,
     * the sub-price marker and the day's report marker. Absent when the tape never saw the ticker. */
    ptp?: boolean | null;
    ssrOut?: boolean | null;
    crap?: boolean | null;
    rep?: boolean | null;
    /** Borrow status, raw YES/NO/ITB, AS OF the newest tape day that knows the ticker - a day
     * snapshot, not a property of it (~2% of tickers change it intraday). ITB/HARD read it through
     * lib/filters/borrow.ts so every surface shares one reader. */
    etb?: string | null;
    /** Whether that day carried any news marker. The COUNT is not served: it moves all session. */
    news?: boolean | null;
  }>;
};

export type ReversalSliceWire = {
  ok: boolean;
  cls: ReversalClass;
  sign: ReversalSign;
  n: number;
  /** ticker index */
  t: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 loss, 1 win */
  st: number[];
  /** |15:50 reading|, percentage points */
  ed: number[];
  /** pnl, percentage points; null = unknown */
  p: Array<number | null>;
  /** NY minute-of-day on the notebook's own session axis (15:00 split; a prior-evening reading is negative) */
  sm: Array<number | null>;
  em: Array<number | null>;
  xm: Array<number | null>;
};

/** Columnar trade log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type ReversalSlice = {
  cls: ReversalClass;
  sign: ReversalSign;
  n: number;
  ticker: Int32Array;
  date: Uint8Array;
  status: Uint8Array;
  entryDev: Float64Array;
  pnl: Float64Array; // NaN = unknown
  signalMinuteIdx: Float64Array;
  entryMinuteIdx: Float64Array;
  exitMinuteIdx: Float64Array;
};

export type ReversalRating = {
  total: number; wins: number;
  winRate: number; winRateLb: number;
  meanPnl: number; pnlLb: number;
  gamma: number; gammaN: number; gammaRate: number;
};

export type ReversalTicker = {
  t: string;
  /** modal |15:50 reading| on POSITIVE deviations — pairs with "pos" sign / SHORT side */
  alphaPos: number;
  /** same, on NEGATIVE deviations — pairs with "neg" sign / LONG side */
  alphaNeg: number;
  /** static per-ticker dispersion figure, unrelated to alpha; parsed, not yet a unit-bar mode */
  sigma: number;
  /** PUBLISHED rating+gamma per class and side — general for the class, NOT recomputed per day-window */
  rating: Record<ReversalClass, { pos: ReversalRating | null; neg: ReversalRating | null }>;
  etf: boolean | null;
  country: string | null;
  sector: string | null;
  exchange: string | null;
  ptp: boolean | null;
  ssrOut: boolean | null;
  crap: boolean | null;
  rep: boolean | null;
  /** raw YES / NO / ITB as of the newest tape day; null when the tape has never seen the ticker */
  etb: string | null;
  news: boolean | null;
};

export type ReversalMeta = {
  generatedAt: string | null;
  mostRecentSession: string | null;
  positionUsd: number;
  minDev: number;
  pnlBasis: string | null;
  recentDates: string[];
  /**
   * Parallel to recentDates: entry i is how the market stood when session i OPENED - SPY+QQQ over
   * 16:00 -> 09:30. The window ends at that session's own open, so there is no offset and, for
   * anything entering at or after 09:30, the label is strictly known before entry. For a PRE class
   * that TRADES 21:00 -> 09:30 it overlaps the trade's own window; the published file carries a
   * strictly-earlier 16:00 -> 00:00 set for that case. "UNKNOWN" where it could not be measured -
   * a real bucket, never folded into FLAT.
   */
  regimes: string[];
  tickers: ReversalTicker[];
};

export type ReversalBound = { min: number | null; max: number | null };
/** The α/σ range boxes. α is a constant of the TICKER's SIGN (the modal |15:50 reading|),
 * sign-matched against alphaPos/alphaNeg the same way the α unit mode is; σ is the ticker's
 * published static dispersion figure (unrelated to sign). */
export type ReversalRanges = { alpha: ReversalBound; sigma: ReversalBound; gamma: ReversalBound };

export type ReversalParams = {
  window: ReversalWindow;
  /** Keep only the sessions whose 16:00->00:00 night carried this label; "all" = no gate. */
  regime: ReversalRegime;
  mode: ReversalMode;
  start: number;
  to: number;
  minRate: number;
  minTotal: number;
  /** UNIVERSE: drop the MINRATE/MINTOTAL gate. The gamma RANGE is a level filter and stays. */
  ignoreRatings: boolean;
  ranges: ReversalRanges;
  /** |pnl| above this (percentage points) is a data fault, not a trade; 0 = keep everything */
  capPct: number;
  sizeUsd: number;
  excludeEtf: boolean;
  /**
   * The rest of the tape-sourced toggle row. Each keeps ITS OWN rule for an unknown value:
   * ITB/HARD go through lib/filters/borrow.ts, where a MISSING borrow status is also dropped
   * ("unknown is not freely borrowable"); the others follow this page's existing excludeEtf
   * convention, where a ticker the tape has no answer for still passes, so a cold tape does
   * not empty the table. Region flags read the same `country` field COUNTRY filters on.
   */
  excludeItb: boolean;
  excludeHard: boolean;
  excludePtp: boolean;
  excludeSsr: boolean;
  excludeCrap: boolean;
  excludeNews: boolean;
  excludeReport: boolean;
  includeUsa: boolean;
  includeChina: boolean;
  /** Here to mirror the Sonar's row exactly; no tape field backs either yet, so both
   * hold state and reject nothing (see the pills' own tooltips). */
  excludeDividend: boolean;
  excludeAnom: boolean;
  exchangeMode: "off" | "include" | "exclude";
  exchanges: Set<string>;
  countryMode: "off" | "include" | "exclude";
  countries: Set<string>;
  sectorMode: "off" | "include" | "exclude";
  sectors: Set<string>;
};

export type ReversalTickerRow = {
  i: number;
  trades: number;
  /** PUBLISHED rating (all history) of the sides in scope, pooled by total; NaN = unrated */
  rating: number;
  ratingTotal: number;
  /** mean entry deviation, in the CURRENT mode's unit */
  start: number;
  entryMinuteIdx: number;
  exitMinuteIdx: number;
  pnlN: number;
  pnlUsd: number;
  avgPnlPct: number;
  win: number;
};

export type ReversalCurvePoint = { key: string; equity: number; pnl: number };

/** One trade, for the per-trade detail table. */
export type ReversalTradeRow = {
  ticker: string;
  date: number;
  cls: ReversalClass;
  side: "short" | "long";
  status: "win" | "loss";
  signalMinuteIdx: number;
  entryMinuteIdx: number;
  exitMinuteIdx: number;
  pnlPct: number;
  pnlUsd: number;
  devPct: number;
  devAlpha: number;
  devSigma: number;
  devGamma: number;
};

/** Ported from ArbitrageScanner's analyticsSummary / lib/scout's ScoutAnalyticsSummary. */
export type ReversalAnalyticsSummary = {
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
  longs: number;
  shorts: number;
};

export type ReversalResult = {
  /** published rating of the gated tickers, pooled by published total */
  rating: number;
  rows: ReversalTickerRow[];
  tradeRows: ReversalTradeRow[];
  tradesInScope: number;
  cappedOut: number;
  tickersInScope: number;
  trades: number;
  pnlN: number;
  winN: number;
  pnlUsd: number;
  /** P&L $ per session (index = date index, NOT cumulative), gated tickers only */
  dailyUsd: Float64Array;
  tradeSeriesUsd: Float64Array;
  tradeSeriesDate: Uint8Array;
};
