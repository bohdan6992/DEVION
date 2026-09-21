/**
 * Arbitrage Scout — wire types and the page's own vocabulary.
 *
 * The bridge parses the 162 MB rolling_perf.json.gz once and serves two small documents
 * (`/api/arbitrage/scout/meta`, `/api/arbitrage/scout/trades`). Everything the page shows — the
 * start threshold in any unit, the window, the rating gates, the sort — is computed HERE from those,
 * so no control ever goes back to the bridge.
 */

import type { TriMode } from "../scanner/types";

export type ScoutClass = "pre" | "open" | "intra" | "post";
export type ScoutSign = "pos" | "neg";

/** Deviation direction the user is looking at. pos = stack ran ahead of its bench → SHORT trade. */
export type ScoutSide = "short" | "long" | "both";

/**
 * What the START / TO thresholds are measured in ("запас"):
 *  - pct   — raw Stack%−Bench% gap at birth, in percentage points
 *  - sigma — |dev_sig| at birth (the unit the whole pipeline triggers on)
 *  - gamma — a MULTIPLE of the ticker's own gamma level (its best reversal-entry deviation)
 *  - delta — a MULTIPLE of the ticker's own |delta| (median dev_sig at the 09:30 open, last 5 days)
 */
export type ScoutMode = "pct" | "sigma" | "gamma" | "delta";

export type ScoutWindow = 5 | 20 | 40 | 65;
export type ScoutCurveMode = "daily" | "trade";

export type ScoutSortKey =
  | "ticker"
  | "beta"
  | "rating"
  | "hard"
  | "soft"
  | "start"
  | "entryTime"
  | "trades"
  | "pnl"
  | "avgPnl"
  | "win"
  | "corr"
  | "sigma";

export type ScoutMetaWire = {
  ok: boolean;
  meta: {
    version: string | null;
    generatedAt: string | null;
    mostRecentSession: string | null;
    sessionsSeen: number;
    positionUsd: number;
    devThr: number;
    normThr: number;
    softRatio: number;
    pnlBasis: string | null;
    levelsAvailable: boolean;
    /** the published file carries the 04:02 PRE track */
    model0402?: boolean;
    windowsDays: number[];
    /** Oldest → newest. A trade's date index points into this list. */
    recentDates: string[];
  };
  /** Row order == the ticker index every trade slice refers to. */
  tickers: Array<{
    t: string;
    bench: string | null;
    corr: number | null;
    beta: number | null;
    sigma: number | null;
    /** gamma level per sign (dev_sig units) — null when the ticker has none */
    gp?: number | null;
    gn?: number | null;
    /** delta per sign — signed median dev_sig at the open */
    dp?: number | null;
    dn?: number | null;
    /** alpha per sign */
    ap?: number | null;
    an?: number | null;
    /** DailyStaticStore - same source the live Scanner's ETF/COUNTRY/SECTOR filters read from.
     * Absent (not just null) whenever that store has not filled today's D1 window yet. */
    etf?: boolean | null;
    country?: string | null;
    sector?: string | null;
    /** PUBLISHED all-history rating per class and sign: [rate, total, hard, soft] (best_params ratings). */
    rt?: Partial<Record<ScoutClass, { p?: number[]; n?: number[] }>>;
  }>;
};

export type ScoutSliceWire = {
  ok: boolean;
  cls: ScoutClass;
  sign: ScoutSign;
  n: number;
  /** ticker index */
  t: number[];
  /** date index (into meta.recentDates) */
  d: number[];
  /** 0 none, 1 soft, 2 hard */
  st: number[];
  /** |dev_sig| at birth */
  sd: number[];
  /** Stack%−Bench% at birth, signed; null = unknown */
  gp: Array<number | null>;
  /** pnl in percentage points, entry → class window close; null = unknown */
  p: Array<number | null>;
  /**
   * NY minute-of-day, PRE-wrapped (a prior-day 21:00-23:59 birth is negative: h*60+m-1440, matching
   * sessionTimeChartRange). Absent on a file published before these existed - decodeSlice reads a
   * missing array as all-null, which becomes all-NaN, which the by-time charts render as "no data".
   */
  sm?: Array<number | null>;
  pm?: Array<number | null>;
  /** |dev_sig| at the peak tick / at the window-close mark; null = unknown */
  pa?: Array<number | null>;
  ea?: Array<number | null>;
  /** Stack%−Bench% at the window-close mark - start_gap_pct's companion (NOT pnl: pnl is built
   * from stock price alone, this also moves with the bench); null = unknown */
  eg?: Array<number | null>;
  /** minute the exit mark was actually printed (PRE-wrapped); minutes of silence before birth */
  xm?: Array<number | null>;
  bg?: Array<number | null>;
  /** 1 = a trade of the 04:02 PRE track; absent when the slice has none */
  al?: number[];
};

/** Columnar trade log, decoded once into typed arrays so the per-keystroke passes stay allocation-free. */
export type ScoutSlice = {
  cls: ScoutClass;
  sign: ScoutSign;
  n: number;
  ticker: Int32Array;
  date: Uint8Array;
  status: Uint8Array;
  // Float64, not Float32: the wire carries 3 decimals, and a Float32 0.7 reads back as 0.69999998
  // — which would silently drop a trade sitting exactly on a START/TO threshold.
  startDev: Float64Array;
  gap: Float64Array; // NaN = unknown
  pnl: Float64Array; // NaN = unknown
  /** NY minute-of-day (PRE-wrapped); NaN on a file published before these existed. */
  startMinuteIdx: Float64Array;
  peakMinuteIdx: Float64Array;
  peakDevAbs: Float64Array; // NaN = unknown
  endDevAbs: Float64Array; // NaN = unknown
  endGapPct: Float64Array; // NaN = unknown
  /** when the exit mark was really printed; NaN on an older file (then the class close is assumed) */
  exitMinuteIdx: Float64Array;
  /** minutes without a print before the run that became this trade; NaN = unknown */
  birthGapMin: Float64Array;
  /** 1 = a trade of the 04:02 PRE track (0 for the ordinary 21:00 model and for every other class) */
  alt: Uint8Array;
};

/** One published rating: rate = (hard+soft)/total over the ticker's whole history for a class and side. */
export type ScoutRating = { rate: number; total: number; hard: number; soft: number };

export type ScoutTicker = {
  t: string;
  bench: string | null;
  corr: number;
  beta: number;
  sigma: number;
  /** [pos, neg] — NaN when the ticker has no published level */
  gamma: [number, number];
  delta: [number, number];
  alpha: [number, number];
  /** PUBLISHED rating per class and side — general for the class, NOT recomputed per day-window */
  rating: Record<ScoutClass, { pos: ScoutRating | null; neg: ScoutRating | null }>;
  /** null = unknown (DailyStaticStore has not filled today's D1 window yet) */
  etf: boolean | null;
  country: string | null;
  sector: string | null;
};

export type ScoutMeta = {
  generatedAt: string | null;
  mostRecentSession: string | null;
  positionUsd: number;
  levelsAvailable: boolean;
  /** the published file carries the 04:02 PRE track (else the FROM 04:02 toggle is disabled) */
  model0402: boolean;
  pnlBasis: string | null;
  recentDates: string[];
  tickers: ScoutTicker[];
};

/** One min/max box; null = that end is not set. */
export type ScoutBound = { min: number | null; max: number | null };
/**
 * The ρ/β/σ/α range boxes. Constants of the TICKER against its benchmark (α: of the trade's own
 * side), so they gate whole tickers, not single trades. A set bound REJECTS a ticker that has no
 * such number — the same rule every other filter follows.
 */
export type ScoutRanges = { corr: ScoutBound; beta: ScoutBound; sigma: ScoutBound; alpha: ScoutBound };

export type ScoutParams = {
  window: ScoutWindow;
  mode: ScoutMode;
  /** lower bound in `mode` units; 0 = no bound */
  start: number;
  /** upper bound in `mode` units; 0 (or ≤ start) = no bound */
  to: number;
  minRate: number;
  minTotal: number;
  ranges: ScoutRanges;
  /** |pnl| above this (percentage points) is a data fault, not a trade; 0 = keep everything */
  capPct: number;
  sizeUsd: number;
  /** true = drop every ticker DailyStaticStore says is an ETF (unknown ETF status still passes) */
  excludeEtf: boolean;
  /**
   * true = the "trading only STARTS at 04:02" model: PRE shows the notebook's second track (births only from 04:02, every
   * deviation already open then picked up at its 04:02 price) INSTEAD of the 21:00 one. Other classes are unaffected.
   */
  model0402: boolean;
  countryMode: TriMode;
  countries: Set<string>;
  sectorMode: TriMode;
  sectors: Set<string>;
};

export type ScoutTickerRow = {
  /** ticker index into ScoutMeta.tickers */
  i: number;
  trades: number;
  hard: number;
  soft: number;
  /** PUBLISHED rating (all history) of the sides in scope, pooled by total; NaN = unrated */
  rating: number;
  /** published total behind `rating` */
  ratingTotal: number;
  hardRate: number;
  softRate: number;
  /** mean start value, in the CURRENT mode's unit */
  start: number;
  /** mean entry clock time, NY minute-of-day (PRE-wrapped); NaN if the file has no timing data */
  entryMinuteIdx: number;
  /** mean minute the exit mark was really printed (falls back to the class close on an old file) */
  exitMinuteIdx: number;
  pnlN: number;
  pnlUsd: number;
  avgPnlPct: number;
  win: number;
};

export type ScoutCurvePoint = { key: string; equity: number; pnl: number };

/**
 * One trade, shaped exactly like the Scanner's `PaperArbClosedDto` (lib/scanner/types.ts) so the
 * SAME "by time" chart components (components/scanner/shared/charts.tsx) render Scout's data
 * unmodified. `endMinuteIdx` is a constant per class (the window-close mark), not per-trade data.
 */
export type ScoutEpisode = {
  ticker: string;
  benchTicker: string;
  side: "short" | "long";
  startMinuteIdx: number;
  peakMinuteIdx: number;
  endMinuteIdx: number;
  peakMetricAbs: number | null;
  endMetricAbs: number | null;
  totalPnlUsd: number | null;
};

/**
 * One trade, for the per-trade detail table (date/entry/exit/start%/end%/sum%/direction/deviation
 * in every unit) — distinct from {@link ScoutEpisode}, which only carries what the shared "by
 * time" charts read.
 */
export type ScoutTradeRow = {
  ticker: string;
  /** index into ScoutMeta.recentDates */
  date: number;
  side: "short" | "long";
  status: "none" | "soft" | "hard";
  entryMinuteIdx: number;
  exitMinuteIdx: number;
  /** minutes of silence before the trade's first qualifying tick; NaN = unknown */
  birthGapMin: number;
  /** Stack%−Bench%, signed, at birth and at the window-close mark */
  startGapPct: number;
  endGapPct: number;
  /** entry → class window-close, percentage points (already signed for the traded side) */
  pnlPct: number;
  pnlUsd: number;
  /** the entry deviation in every unit the START/TO threshold can be set in */
  devPct: number;
  devSigma: number;
  devGamma: number;
  devDelta: number;
};

/**
 * The Scanner's "analytics summary" card block (TOTAL PNL / SITUATIONS / TRADES / MONEYFLOW /
 * WIN RATE / MAX WIN / AVG WIN / TOP2 WIN % / AVG TRADE / PROFIT FACTOR / LONGS / SHORTS /
 * MAX DRAWDOWN / EXPECTANCY / MAX LOSS / AVG LOSS / TOP2 LOSS % / MEDIAN TRADE / MEDIAN DAY),
 * ported to Scout's trade-row shape (components/scanner/ArbitrageScanner.tsx's own
 * `analyticsSummary`). One real adaptation: Scanner's SITUATIONS/TRADES differ because one
 * episode can scale into several entries or carry a hedge leg; Scout's trade log has no such
 * concept (each row already IS one atomic entry), so SITUATIONS here is the distinct-ticker count
 * and TRADES is the trade-row count — two genuinely different, still-honest numbers, not a
 * re-labelled duplicate of the same one.
 */
export type ScoutAnalyticsSummary = {
  situations: number;
  trades: number;
  moneyflowUsd: number;
  totalPnlUsd: number;
  winRate: number;
  maxWinUsd: number;
  maxLossUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  /** share of the same-sign gross carried by the two biggest trades; null below 3 of that sign */
  top2WinShare: number | null;
  top2LossShare: number | null;
  avgTradeUsd: number;
  profitFactor: number | null;
  expectancyUsd: number;
  medianTradeUsd: number;
  /** median day P&L; 0 when dayCount is 0 (nothing to render "-" is decided by the caller) */
  medianDayUsd: number;
  dayCount: number;
  longs: number;
  shorts: number;
};

export type ScoutResult = {
  /** published rating / hard / soft shares of the gated tickers, pooled by published total */
  rating: number;
  ratingHard: number;
  ratingSoft: number;
  rows: ScoutTickerRow[];
  /** trades of the tickers that passed the gate, in the shape the shared "by time" charts read */
  episodes: ScoutEpisode[];
  /** the same trades, for the per-trade detail table (date/entry/exit/start%/end%/sum%/direction) */
  tradeRows: ScoutTradeRow[];
  /** trades that survived every filter, before the per-ticker MINRATE/MINTOTAL gate */
  tradesInScope: number;
  /** trades dropped by the |pnl| cap */
  cappedOut: number;
  tickersInScope: number;
  /** trades of the tickers that passed the gate */
  trades: number;
  hard: number;
  soft: number;
  pnlN: number;
  winN: number;
  pnlUsd: number;
  /** P&L $ per session (index = date index, NOT cumulative), gated tickers only */
  dailyUsd: Float64Array;
  /** per-trade $ in chronological (date-major) order, gated tickers only */
  tradeSeriesUsd: Float64Array;
  tradeSeriesDate: Uint8Array;
};
