/**
 * LaunchEvening Scout — wire types and the page's own vocabulary.
 *
 * Mirrors lib/morLaunchScout/types.ts (and so, transitively, lib/opgRootationScout's and
 * lib/reversalScout's) 1-to-1 in shape — same "no benchmark, alpha+sigma+win-rate" data family,
 * same reason there is no corr/beta/bench here either. LaunchEvening is literally MorLaunch's own
 * scheme moved to the 16:00 transition (operator, 2026-10-24: "все те саме просто для іншого
 * часу" — see LaunchEveningTiming.cs/LaunchEveningGate.cs's own header comments), so most of this
 * is a straight timing swap, NOT a different data shape:
 *   - ONE class, "eve1600" (the 16:00 jump), not three — same single-class shape as MorLaunch's
 *     "gap0930", just a different clock. There is therefore no class selector on this page — every
 *     control that would read a `cls` is hardcoded to `"eve1600"`.
 *   - ALPHA here is the modal |one-minute move inside 15:50-16:20| (MorLaunch's own 3:50-4:20
 *     window, moved), split alphaPos/alphaNeg by the sign of the move; GAMMA is the ticker's own
 *     best reversal-entry level for the one class/sign. SIGMA is the same static per-ticker
 *     dispersion figure every other strategy publishes.
 *   - LAMBDA: per-ticker std(ddof=1) of the raw 16:00 entry-checkpoint print — unrelated to
 *     alpha/sigma, its own unit-bar mode and range box once wired.
 *   - WIN/LOSS here is a REVERSION, not a pnl outcome (checked LaunchEveningRatingsService.cs's own
 *     doc comment and the published file's own `pnl_basis` string directly): a trade "wins" when
 *     the 16:00 move was given back >= 90% by the 16:01/16:02 close. There is therefore NO live
 *     exit dispatch for this strategy at all (LaunchEveningTiming.cs: "nothing live exits an
 *     evening position... the basket's fills are closed by hand") — exitMinuteIdx below is a
 *     BACKTEST checkpoint (16:01 or 16:02), never something the bridge itself fires.
 *   - no hard/soft split — a trade is WIN or LOSS, same as Reversal/MorLaunch.
 *   - SIGN → SIDE: checked `LaunchEveningGate.cs` directly rather than assumed — `isLong = d < 0`,
 *     the SAME convention as MorLaunch/OPG-Fade/OPG-Reversal/OPG-Rootation, the OPPOSITE of
 *     OPG-Continuum/OPG-Ride's `isLong = d > 0`. A POSITIVE 15:50-16:20 move is SOLD (Short), a
 *     NEGATIVE one is BOUGHT (Long). pos → SHORT, neg → LONG here.
 */

export type LaunchEveningClass = "eve1600";
export type LaunchEveningSign = "pos" | "neg";

/** pos → SHORT, neg → LONG. Same mapping as OPG-Fade/OPG-Reversal's own pos/neg → side; OPPOSITE
 * of OPG-Continuum/OPG-Ride's — see this file's header comment. */
export type LaunchEveningSide = "short" | "long" | "both";

/** What the START / TO thresholds are measured in — pct = raw pp of the signal reading; sigma/alpha/gamma
 * = that reading divided by the ticker's published static sigma / sign-matched alpha / (class,sign) gamma. */
export type LaunchEveningMode = "pct" | "sigma" | "alpha" | "gamma";

export type LaunchEveningWindow = 5 | 20 | 40 | 65;
export type LaunchEveningCurveMode = "daily" | "trade";
/**
 * Which kind of night a trade's own session followed, from SPY+QQQ over 16:00 -> 00:00
 * (OvernightRegimeService on the bridge publishes one label per session).
 *
 * "unk" is a REAL bucket, not a synonym for flat: a third of sessions have no usable midnight
 * print, and the two answers "nobody measured this night" and "this night did not move" must not
 * be merged. "all" is the only setting that does no filtering at all.
 */
export type LaunchEveningRegime = "all" | "up" | "down" | "flat" | "mixed" | "unk";


export type LaunchEveningSortKey = "ticker" | "alpha" | "rating" | "start" | "entryTime" | "trades" | "pnl" | "avgPnl" | "win";

export type LaunchEveningMetaWire = {
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
    /** modal |one-minute move inside 15:50-16:20| on POSITIVE deviations — pairs with the "pos" sign / SHORT side */
    alphaPos: number | null;
    /** same, on NEGATIVE deviations — pairs with the "neg" sign / LONG side */
    alphaNeg: number | null;
    /** static per-ticker dispersion figure (same "sigma" every other strategy already has), unrelated to alpha */
    sigma: number | null;
    /** std(ddof=1) of the raw 16:00 entry-checkpoint print — unrelated to alpha/sigma */
    lambda: number | null;
    /** every (class, sign) this ticker has a published rating for */
    rt?: Array<{
      cls: LaunchEveningClass; sign: LaunchEveningSign;
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

export type LaunchEveningSliceWire = {
  ok: boolean;
  cls: LaunchEveningClass;
  sign: LaunchEveningSign;
  n: number;
  /** ticker index */
  t: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 loss, 1 win */
  st: number[];
  /** |15:50-16:20 one-minute move|, percentage points */
  ed: number[];
  /** pnl, percentage points; null = unknown */
  p: Array<number | null>;
  /** NY minute-of-day on the notebook's own session axis — no midnight wrap for this family (signal
   * 15:50-16:20, entry at the 16:00 jump, backtest exit checkpoint 16:01/16:02 — the live strategy
   * dispatches no exit at all, see this file's header comment). */
  sm: Array<number | null>;
  em: Array<number | null>;
  xm: Array<number | null>;
};

/** Columnar trade log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type LaunchEveningSlice = {
  cls: LaunchEveningClass;
  sign: LaunchEveningSign;
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

export type LaunchEveningRating = {
  total: number; wins: number;
  winRate: number; winRateLb: number;
  meanPnl: number; pnlLb: number;
  gamma: number; gammaN: number; gammaRate: number;
};

export type LaunchEveningTicker = {
  t: string;
  /** modal |one-minute move inside 15:50-16:20| on POSITIVE deviations — pairs with "pos" sign / SHORT side */
  alphaPos: number;
  /** same, on NEGATIVE deviations — pairs with "neg" sign / LONG side */
  alphaNeg: number;
  /** static per-ticker dispersion figure, unrelated to alpha; parsed, not yet a unit-bar mode */
  sigma: number;
  /** std(ddof=1) of the raw 16:00 entry-checkpoint print — parsed, not yet a unit-bar mode */
  lambda: number;
  /** PUBLISHED rating+gamma per class and side — general for the class, NOT recomputed per day-window */
  rating: Record<LaunchEveningClass, { pos: LaunchEveningRating | null; neg: LaunchEveningRating | null }>;
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

export type LaunchEveningMeta = {
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
  tickers: LaunchEveningTicker[];
};

export type LaunchEveningBound = { min: number | null; max: number | null };
/** The α/σ range boxes. α is a constant of the TICKER's SIGN (the modal |15:50-16:20 move|),
 * sign-matched against alphaPos/alphaNeg the same way the α unit mode is; σ is the ticker's
 * published static dispersion figure (unrelated to sign). */
export type LaunchEveningRanges = { alpha: LaunchEveningBound; sigma: LaunchEveningBound; gamma: LaunchEveningBound };

export type LaunchEveningParams = {
  window: LaunchEveningWindow;
  /** Keep only the sessions whose 16:00->00:00 night carried this label; "all" = no gate. */
  regime: LaunchEveningRegime;
  mode: LaunchEveningMode;
  start: number;
  to: number;
  minRate: number;
  minTotal: number;
  /** UNIVERSE: drop the MINRATE/MINTOTAL gate. The gamma RANGE is a level filter and stays. */
  ignoreRatings: boolean;
  ranges: LaunchEveningRanges;
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

export type LaunchEveningTickerRow = {
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

export type LaunchEveningCurvePoint = { key: string; equity: number; pnl: number };

/** One trade, for the per-trade detail table. */
export type LaunchEveningTradeRow = {
  ticker: string;
  date: number;
  cls: LaunchEveningClass;
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
export type LaunchEveningAnalyticsSummary = {
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

export type LaunchEveningResult = {
  /** published rating of the gated tickers, pooled by published total */
  rating: number;
  rows: LaunchEveningTickerRow[];
  tradeRows: LaunchEveningTradeRow[];
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
