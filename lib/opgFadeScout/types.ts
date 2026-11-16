/**
 * OPG-Fade Scout — wire types and the page's own vocabulary.
 *
 * Mirrors lib/reversalScout/types.ts (Reversal) 1-to-1 in shape — same "no benchmark, alpha+sigma+
 * win-rate" data family, same reason there is no corr/beta/bench here either. What is genuinely
 * DIFFERENT about OPG-Fade's own data, not a styling choice:
 *   - 3 classes (EXIT0945/EXIT1000/EXIT1030), not 5 — all three exit the SAME trading morning
 *     (signal 09:20-09:25, entry at the 09:30 open), not an afternoon/evening span.
 *   - ALPHA here is the modal |09:20-09:25 reading| (not a 15:50 one), split alphaPos/alphaNeg by
 *     the sign of the deviation; GAMMA is the ticker's own best reversal-entry level, per (class,
 *     sign). SIGMA is the same static per-ticker dispersion figure every other strategy publishes.
 *   - LAMBDA: per-ticker std(ddof=1) of the raw 09:30-open-print reading — unrelated to
 *     alpha/sigma, its own unit-bar mode and range box once wired.
 *   - no hard/soft split — a trade is WIN or LOSS, same as Reversal.
 *   - SIGN → SIDE matches Reversal's own mapping (NOT OPG-Continuum's, which is flipped — see
 *     that file's own note). OPGFadeGate.cs's `isLong = d < 0`: the operator's own thesis
 *     ("слабкий брати в Лонг а сильний продавати" — buy the weak one, sell the strong one) means a
 *     NEGATIVE 09:20-09:25 reading (weak) is BOUGHT (Long), a POSITIVE one (strong) is SOLD
 *     (Short). pos → SHORT, neg → LONG here.
 */

export type OPGFadeClass = "exit0945" | "exit1000" | "exit1030";
export type OPGFadeSign = "pos" | "neg";

/** pos = the stack was STRONG at the 09:20-09:25 signal → SHORT it (sell the strength); neg = WEAK
 * → LONG it (buy the weakness). Same mapping as Reversal's own pos/neg → side; OPPOSITE of
 * OPG-Continuum's — see this file's header comment. */
export type OPGFadeSide = "short" | "long" | "both";

/** What the START / TO thresholds are measured in — pct = raw pp of the signal reading; sigma/alpha/gamma
 * = that reading divided by the ticker's published static sigma / sign-matched alpha / (class,sign) gamma. */
export type OPGFadeMode = "pct" | "sigma" | "alpha" | "gamma";

export type OPGFadeWindow = 5 | 20 | 40 | 65;
export type OPGFadeCurveMode = "daily" | "trade";
/**
 * Which kind of night a trade's own session followed, from SPY+QQQ over 16:00 -> 00:00
 * (OvernightRegimeService on the bridge publishes one label per session).
 *
 * "unk" is a REAL bucket, not a synonym for flat: a third of sessions have no usable midnight
 * print, and the two answers "nobody measured this night" and "this night did not move" must not
 * be merged. "all" is the only setting that does no filtering at all.
 */
export type OPGFadeRegime = "all" | "up" | "down" | "flat" | "mixed" | "unk";


export type OPGFadeSortKey = "ticker" | "alpha" | "rating" | "start" | "entryTime" | "trades" | "pnl" | "avgPnl" | "win";

export type OPGFadeMetaWire = {
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
    /** modal |09:20-09:25 signal reading| on POSITIVE deviations — pairs with the "pos" sign / SHORT side */
    alphaPos: number | null;
    /** same, on NEGATIVE deviations — pairs with the "neg" sign / LONG side */
    alphaNeg: number | null;
    /** static per-ticker dispersion figure (same "sigma" every other strategy already has), unrelated to alpha */
    sigma: number | null;
    /** std(ddof=1) of the raw 09:30-open-print reading — unrelated to alpha/sigma */
    lambda: number | null;
    /** every (class, sign) this ticker has a published rating for */
    rt?: Array<{
      cls: OPGFadeClass; sign: OPGFadeSign;
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

export type OPGFadeSliceWire = {
  ok: boolean;
  cls: OPGFadeClass;
  sign: OPGFadeSign;
  n: number;
  /** ticker index */
  t: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 loss, 1 win */
  st: number[];
  /** |09:20-09:25 signal reading|, percentage points */
  ed: number[];
  /** pnl, percentage points; null = unknown */
  p: Array<number | null>;
  /** NY minute-of-day on the notebook's own session axis — no midnight wrap for this family (signal
   * 09:20-09:25, entry 09:30, exits 09:45/10:00/10:30, all the same calendar morning). */
  sm: Array<number | null>;
  em: Array<number | null>;
  xm: Array<number | null>;
};

/** Columnar trade log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type OPGFadeSlice = {
  cls: OPGFadeClass;
  sign: OPGFadeSign;
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

export type OPGFadeRating = {
  total: number; wins: number;
  winRate: number; winRateLb: number;
  meanPnl: number; pnlLb: number;
  gamma: number; gammaN: number; gammaRate: number;
};

export type OPGFadeTicker = {
  t: string;
  /** modal |09:20-09:25 signal reading| on POSITIVE deviations — pairs with "pos" sign / SHORT side */
  alphaPos: number;
  /** same, on NEGATIVE deviations — pairs with "neg" sign / LONG side */
  alphaNeg: number;
  /** static per-ticker dispersion figure, unrelated to alpha; parsed, not yet a unit-bar mode */
  sigma: number;
  /** std(ddof=1) of the raw 09:30-open-print reading — parsed, not yet a unit-bar mode */
  lambda: number;
  /** PUBLISHED rating+gamma per class and side — general for the class, NOT recomputed per day-window */
  rating: Record<OPGFadeClass, { pos: OPGFadeRating | null; neg: OPGFadeRating | null }>;
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

export type OPGFadeMeta = {
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
  tickers: OPGFadeTicker[];
};

export type OPGFadeBound = { min: number | null; max: number | null };
/** The α/σ range boxes. α is a constant of the TICKER's SIGN (the modal |09:20-09:25 signal reading|),
 * sign-matched against alphaPos/alphaNeg the same way the α unit mode is; σ is the ticker's
 * published static dispersion figure (unrelated to sign). */
export type OPGFadeRanges = { alpha: OPGFadeBound; sigma: OPGFadeBound; gamma: OPGFadeBound };

export type OPGFadeParams = {
  window: OPGFadeWindow;
  /** Keep only the sessions whose 16:00->00:00 night carried this label; "all" = no gate. */
  regime: OPGFadeRegime;
  mode: OPGFadeMode;
  start: number;
  to: number;
  minRate: number;
  minTotal: number;
  /** UNIVERSE: drop the MINRATE/MINTOTAL gate. The gamma RANGE is a level filter and stays. */
  ignoreRatings: boolean;
  ranges: OPGFadeRanges;
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

export type OPGFadeTickerRow = {
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

export type OPGFadeCurvePoint = { key: string; equity: number; pnl: number };

/** One trade, for the per-trade detail table. */
export type OPGFadeTradeRow = {
  ticker: string;
  date: number;
  cls: OPGFadeClass;
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
export type OPGFadeAnalyticsSummary = {
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

export type OPGFadeResult = {
  /** published rating of the gated tickers, pooled by published total */
  rating: number;
  rows: OPGFadeTickerRow[];
  tradeRows: OPGFadeTradeRow[];
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
