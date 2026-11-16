/**
 * STRETCH-RIDE Scout — wire types and the page's own vocabulary.
 *
 * Mirrors lib/reversalScout/types.ts (Reversal) 1-to-1 in shape — same "no benchmark, alpha+sigma+
 * win-rate" data family, same reason there is no corr/beta/bench here either. What is genuinely
 * DIFFERENT about STRETCH-RIDE's own data, not a styling choice:
 *   - 3 classes (EXIT0945/EXIT1000/EXIT1030), not 5 — all three exit the SAME trading morning
 *     (signal 09:15-09:21, entry on the triggering minute itself, exit at the 09:30 open), not an afternoon/evening span.
 *   - ALPHA here is the modal |09:15-09:21 ZAP SIG| (not a 15:50 one), split alphaPos/alphaNeg by
 *     the sign of the deviation; GAMMA is the ticker's own best reversal-entry level, per (class,
 *     sign). SIGMA is the same static per-ticker dispersion figure every other strategy publishes.
 *   - LAMBDA: per-ticker std(ddof=1) of the raw 09:30-open-print reading — unrelated to
 *     alpha/sigma, its own unit-bar mode and range box once wired.
 *   - no hard/soft split — a trade is WIN or LOSS, same as Reversal.
 *   - SIGN → SIDE is STRETCH•FADE's own exact opposite (operator, 2026-11-16: "позитивне
 *     відхилення це бай"). StretchRideGate.cs's `isLong = d > 0`: a POSITIVE 09:15-09:21 ZAP SIG
 *     (stretched up) is BOUGHT (Long), a NEGATIVE one (stretched down) is SOLD (Short).
 *     pos → LONG, neg → SHORT here — the reverse of STRETCH•FADE's pos → SHORT, neg → LONG.
 */

/** ONE class. The notebook publishes EXIT0930 alone (the operator: "клас лише 1 - 9:30"), and it
 * is the EXIT: the entry is whichever minute inside 09:15-09:21 triggered, which varies per ticker
 * per morning and is therefore not a class at all. The union is kept as a union so every consumer
 * that keys on a class string compiles unchanged, and a second exit can be added later. */
export type StretchRideClass = "exit0930";
export type StretchRideSign = "pos" | "neg";

/** pos = the stock stretched UP away from its benchmark at the 09:15-09:21 trigger → SHORT it (sell the strength); neg = WEAK
 * → LONG it (buy the weakness). Same mapping as Reversal's own pos/neg → side; OPPOSITE of
 * OPG-Continuum's — see this file's header comment. */
export type StretchRideSide = "short" | "long" | "both";

/**
 * What the START / TO thresholds are measured in. THREE, NOT FOUR, and the missing one is not an
 * omission: this strategy's signal is ZAP SIG (final.parquet's `dev_sig`), which is ALREADY a
 * deviation over a dispersion.
 *
 *   sig   = the raw ZAP SIG reading, in sigmas. The natural unit, and what "pct" is on a pp axis.
 *   alpha = that reading over the ticker's sign-matched alpha, which the notebook also publishes
 *           in sigmas (compute_alpha runs over the signal readings), so the ratio is dimensionless.
 *   gamma = the same over the published (class, sign) gamma, also in sigmas.
 *
 * There is deliberately no "pct" (there are no percentage points on this axis to show) and no
 * sigma-as-a-DIVISOR (that would divide by sigma twice — and the published static sigma is not even
 * dev_sig's own denominator, which is the rolling sigma_day). Same three-way split as the Scanner's
 * own unit strip and StretchRideThresholdUnit on the bridge.
 */
export type StretchRideMode = "sig" | "alpha" | "gamma";

export type StretchRideWindow = 5 | 20 | 40 | 65;
export type StretchRideCurveMode = "daily" | "trade";
/**
 * Which kind of night a trade's own session followed, from SPY+QQQ over 16:00 -> 09:30
 * (OvernightRegimeService on the bridge publishes one label per session).
 *
 * "unk" is a REAL bucket, not a synonym for flat: a third of sessions have no usable midnight
 * print, and the two answers "nobody measured this night" and "this night did not move" must not
 * be merged. "all" is the only setting that does no filtering at all.
 */
export type StretchRideRegime = "all" | "up" | "down" | "flat" | "mixed" | "unk";


export type StretchRideSortKey = "ticker" | "alpha" | "rating" | "start" | "entryTime" | "trades" | "pnl" | "avgPnl" | "win";

export type StretchRideMetaWire = {
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
    /** modal |09:15-09:21 ZAP SIG| on POSITIVE deviations — pairs with the "pos" sign / LONG side */
    alphaPos: number | null;
    /** same, on NEGATIVE deviations — pairs with the "neg" sign / SHORT side */
    alphaNeg: number | null;
    /** static per-ticker dispersion figure (same "sigma" every other strategy already has), unrelated to alpha */
    sigma: number | null;
    /** std(ddof=1) of the raw 09:30-open-print reading — unrelated to alpha/sigma */
    lambda: number | null;
    /** every (class, sign) this ticker has a published rating for */
    rt?: Array<{
      cls: StretchRideClass; sign: StretchRideSign;
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

export type StretchRideSliceWire = {
  ok: boolean;
  cls: StretchRideClass;
  sign: StretchRideSign;
  n: number;
  /** ticker index */
  t: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 loss, 1 win */
  st: number[];
  /** |09:15-09:21 ZAP SIG|, IN SIGMAS (final.parquet's dev_sig), never percentage points */
  ed: number[];
  /** pnl, percentage points; null = unknown */
  p: Array<number | null>;
  /** NY minute-of-day on the notebook's own session axis — no midnight wrap for this family (signal
   * 09:15-09:21, entry 555-561 too, exit 570, all the same calendar morning). */
  sm: Array<number | null>;
  em: Array<number | null>;
  xm: Array<number | null>;
};

/** Columnar trade log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type StretchRideSlice = {
  cls: StretchRideClass;
  sign: StretchRideSign;
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

export type StretchRideRating = {
  total: number; wins: number;
  winRate: number; winRateLb: number;
  meanPnl: number; pnlLb: number;
  gamma: number; gammaN: number; gammaRate: number;
};

export type StretchRideTicker = {
  t: string;
  /** modal |09:15-09:21 ZAP SIG| on POSITIVE deviations — pairs with "pos" sign / LONG side */
  alphaPos: number;
  /** same, on NEGATIVE deviations — pairs with "neg" sign / SHORT side */
  alphaNeg: number;
  /** static per-ticker dispersion figure, unrelated to alpha; parsed, not yet a unit-bar mode */
  sigma: number;
  /** std(ddof=1) of the raw 09:30-open-print reading — parsed, not yet a unit-bar mode */
  lambda: number;
  /** PUBLISHED rating+gamma per class and side — general for the class, NOT recomputed per day-window */
  rating: Record<StretchRideClass, { pos: StretchRideRating | null; neg: StretchRideRating | null }>;
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

export type StretchRideMeta = {
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
   * strictly-earlier 16:00 -> 09:30 set for that case. "UNKNOWN" where it could not be measured -
   * a real bucket, never folded into FLAT.
   */
  regimes: string[];
  tickers: StretchRideTicker[];
};

export type StretchRideBound = { min: number | null; max: number | null };
/** The α/σ range boxes. α is a constant of the TICKER's SIGN (the modal |09:15-09:21 ZAP SIG|),
 * sign-matched against alphaPos/alphaNeg the same way the α unit mode is; σ is the ticker's
 * published static dispersion figure (unrelated to sign). */
export type StretchRideRanges = { alpha: StretchRideBound; sigma: StretchRideBound; gamma: StretchRideBound };

export type StretchRideParams = {
  window: StretchRideWindow;
  /** Keep only the sessions whose 16:00->00:00 night carried this label; "all" = no gate. */
  regime: StretchRideRegime;
  mode: StretchRideMode;
  start: number;
  to: number;
  minRate: number;
  minTotal: number;
  /** UNIVERSE: drop the MINRATE/MINTOTAL gate. The gamma RANGE is a level filter and stays. */
  ignoreRatings: boolean;
  ranges: StretchRideRanges;
  /** |pnl| above this (percentage points) is a data fault, not a trade; 0 = keep everything */
  capPct: number;
  sizeUsd: number;
  excludeEtf: boolean;
  /**
   * The rest of the tape-sourced toggle row. Each follows ITS OWN established rule for an unknown
   * value, which is not the same rule for all of them and must not be "tidied" into one:
   *   - ITB/HARD read `etb` through lib/filters/borrow.ts, where a MISSING borrow status is also
   *     dropped ("unknown is not freely borrowable" — stated there as absolute across surfaces).
   *   - the others follow this page's existing `excludeEtf` convention, where a ticker the tape has
   *     no answer for still passes, so a cold tape does not empty the table.
   */
  excludeItb: boolean;
  excludeHard: boolean;
  excludePtp: boolean;
  excludeSsr: boolean;
  excludeCrap: boolean;
  excludeNews: boolean;
  excludeReport: boolean;
  /** Region shortcuts over the same `country` field COUNTRY filters on. Both off means no
   * region constraint; either on means the ticker must be in one of the enabled regions. */
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

export type StretchRideTickerRow = {
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

export type StretchRideCurvePoint = { key: string; equity: number; pnl: number };

/** One trade, for the per-trade detail table. */
export type StretchRideTradeRow = {
  ticker: string;
  date: number;
  cls: StretchRideClass;
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
export type StretchRideAnalyticsSummary = {
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

export type StretchRideResult = {
  /** published rating of the gated tickers, pooled by published total */
  rating: number;
  rows: StretchRideTickerRow[];
  tradeRows: StretchRideTradeRow[];
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
