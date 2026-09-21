// =========================
// TYPES (Paper Arbitrage)
// =========================
export type PrimaryPanelKey = "stream" | "scanner";

export type TabKey = "active" | "episodes" | "analytics";

export type DateMode = "day" | "last" | "range";

export type PaperListMode = "off" | "ignore" | "apply" | "pin";

// "delta" is ALPHA and "gamma" is GAMMA — the names are historical on the first, deliberate on
// the second. See LivePairUnit for what each divides by.
export type ZapMode = "off" | "zap" | "sigma" | "delta" | "gamma" | "alpha";

export type SortDir = "asc" | "desc";

export type EpisodeSortKey =
  | "ticker"
  | "bench"
  | "side"
  | "startTime"
  | "peakTime"
  | "endTime"
  | "startAbs"
  | "peakAbs"
  | "endAbs"
  | "total"
  | "raw"
  | "benchPnl"
  | "hedged"
  | "closeMode"
  | "minHold";

// GammaZap / AlphaZap divide the percentage reading by the ticker's own published constant.
// The tape has no column for either; the bridge supplies the divisors with the run.
export type PaperArbMetric = "SigmaZap" | "ZapPct" | "GammaZap" | "AlphaZap";

export type PaperArbSession = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "POST" | "NIGHT" | "GLOB";

export type PaperArbCloseMode = "Active" | "Passive";

/**
 * How a closed trade ACTUALLY left, which is not the same alphabet as the close-mode REQUESTED.
 *
 * Arbitrage answers in its request's own words; PairFlux reports which of three things happened —
 * the opposite-side spread came back inside the exit threshold, the position was unwound at the
 * class's terminal print (Gap = the 09:30 open, Cls = the 16:00 close), or neither happened and the
 * window simply ended. The request stays PaperArbCloseMode.
 */
export type PaperClosedExit = PaperArbCloseMode | "Converged" | "Gap" | "Cls" | "Forced";

export type PaperArbPnlMode = "RawOnly" | "Hedged";

export type PaperArbPriceMode = "LastPrint" | "BidAsk";

export type PaperArbSizingMode = "Tier" | "Notional";

export type PaperArbDilutionMode = "Undiluted" | "Diluted";

// rating (best_params gates)
export type PaperArbRatingBand = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";

export type PaperArbRatingType = "any" | "hard" | "soft";

export type PaperArbRatingMode = "SESSION" | "BIN" | "BINS";

/**
 * How the SCOPE optimizer cuts a parameter's observed range into bins.
 *
 * "trades" — equal NUMBER OF TRADES per bin. Every bin carries the same weight of evidence, so one
 * bin's result is comparable to its neighbour's. The cost: a region where the damage is
 * concentrated gets no more resolution than a quiet one, and a sharp cut point averages out inside
 * a wide bucket.
 *
 * "harm" — equal LOSS per bin: each bin absorbs ~1/N of the sample's total negative P&L no matter
 * how many situations that takes. Bins go narrow where losses cluster and wide where trades are
 * harmless, which is what makes the cut point visible.
 *
 * Either way only the tail views (<= x and >= x) are actionable: the filters are min/max cutoffs,
 * so a slice out of the MIDDLE of a range cannot be expressed as a filter.
 */
export type ScopeOptimizerBinMode = "trades" | "harm" | "gain" | "width";

/** Hard ceiling on optimizer bins, shared by every scanner and the bridge. */
export const SCOPE_OPTIMIZER_MAX_BINS = 24;
export const SCOPE_OPTIMIZER_MIN_BINS = 3;

export type TriMode = "off" | "include" | "exclude";

export type PaperArbRatingRule = {
  band: PaperArbRatingBand;
  minRate: number;
  minTotal: number;
};

export type TapeArbSide = "Long" | "Short" | number | string;

// Active snapshots are "Start/Peak/Last" with MinuteIdx + Metric + MetricAbs + (LastPrint fields)
export type PaperArbSnap = {
  minuteIdx: number;
  metric?: number | null;
  metricAbs?: number | null;

  // Quote-space fields used by arbitrage math
  bidPct?: number | null;
  askPct?: number | null;
  benchBidPct?: number | null;
  benchAskPct?: number | null;

  // LastPrint fields kept for fallback/debug
  lstPrcLstClsPct?: number | null;
  benchLstPrcLstClsPct?: number | null;
};

export type PaperArbActiveRow = {
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;

  start: PaperArbSnap;
  peak: PaperArbSnap;
  last: PaperArbSnap;

  rating?: number | null;
  ratingTotal?: number | null;

  // config echoed back (optional but we show if present)
  closeMode?: PaperArbCloseMode;
  minHoldCandles?: number;
  tierBp?: number | null;
  beta?: number | null;
  positionNotionalUsd?: number | null;
  entryCount?: number | null;
  entrySnaps?: PaperArbSnap[] | null;
  rawPnlUsd?: number | null;
  benchPnlUsd?: number | null;
  hedgedPnlUsd?: number | null;
  totalPnlUsd?: number | null;
  lstPrcL?: number | null;
  lstCls?: number | null;
  yCls?: number | null;
  gapPct?: number | null;
  benchGapPct?: number | null;
  startClass?: string | null;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
};

export type PaperArbClosedDto = {
  episodeId?: string | null;
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;
  dateNy?: string | null;
  date?: string | null;
  day?: string | null;
  tradeDate?: string | null;
  tradeDateNy?: string | null;
  sessionDate?: string | null;
  sessionDateNy?: string | null;
  startTsNy?: string | null;
  peakTsNy?: string | null;
  endTsNy?: string | null;

  startMinuteIdx: number;
  peakMinuteIdx: number;
  endMinuteIdx: number;

  startMetric?: number | null;
  startMetricAbs?: number | null;
  peakMetric?: number | null;
  peakMetricAbs?: number | null;
  endMetric?: number | null;
  endMetricAbs?: number | null;
  // OPPOSITE-side ZAP metric abs at the close minute — the value actually compared against
  // EndAbs for an Active-mode threshold close (endMetricAbs above stays same-side/entry-side
  // for Start/Peak/End tracking, so it generally will NOT equal EndAbs on a threshold close;
  // this field is the one that does). Null for WindowEnd/EndOfDay closes.
  exitMetricAbs?: number | null;

  closeMode?: PaperClosedExit;
  minHoldCandles?: number;

  rawPnlUsd?: number | null;
  benchPnlUsd?: number | null;
  hedgedPnlUsd?: number | null;
  totalPnlUsd?: number | null; // depends on pnlMode on server, but server returns it already
  rating?: number | null;
  ratingTotal?: number | null;
  corr?: number | null;
  beta?: number | null;
  sigma?: number | null;
  /**
   * Deviation of the stack from its benchmark AT ENTRY, in sigmas. This is OpenFade's whole
   * selection rule (the sign picks the side, |value| must fall inside the band) and OpenDoor's
   * DevSig gate parameter. Null for Arbitrage, which never records one.
   *
   * Always sigmas, even when OpenFade's band was set to measure percent — the percent twin is
   * this times `sigma`, which is why the research layer derives it rather than asking the wire
   * for a second field.
   */
  entryDevSig?: number | null;
  /** Entry-to-exit move in percent, on the traded side's prices. */
  move?: number | null;
  tierBp?: number | null;
  positionNotionalUsd?: number | null;
  entryCount?: number | null;
  entryMinuteIdxs?: number[] | null;
  entryMetrics?: Array<number | null> | null;
  entryMetricAbs?: Array<number | null> | null;
  best_params?: any;

  adv20?: number | null;
  adv20NF?: number | null;
  adv90?: number | null;
  adv90NF?: number | null;
  avPreMhv?: number | null;
  roundLot?: number | null;
  vwap?: number | null;
  spread?: number | null;
  spreadBidPct?: number | null;
  lstPrcL?: number | null;
  lstCls?: number | null;
  yCls?: number | null;
  tCls?: number | null;
  clsToClsPct?: number | null;
  /**
   * The four prices a PAIR trade was made of, percent against each leg's own previous close.
   * Absent on single-ticker strategies. A is `ticker`, B is `benchTicker`, and `side` is A's side:
   *
   *   N    = positionNotionalUsd                 (already leg notional x entryCount)
   *   aLeg = (side==="Short" ? aIn - aOut : aOut - aIn) / 100 * N
   *   bLeg = (side==="Short" ? bOut - bIn : bIn - bOut) / 100 * N
   *   total = aLeg + bLeg
   */
  aLegEntryPct?: number | null;
  aLegExitPct?: number | null;
  bLegEntryPct?: number | null;
  bLegExitPct?: number | null;
  gapPct?: number | null;
  lo?: number | null;
  newsCnt?: number | null;
  marketCapM?: number | null;
  preMktVolNF?: number | null;
  volNFfromLstCls?: number | null;
  avPostMhVol90NF?: number | null;
  avPreMhVol90NF?: number | null;
  avPreMhValue20NF?: number | null;
  avPreMhValue90NF?: number | null;
  avgDailyValue20?: number | null;
  avgDailyValue90?: number | null;
  volatility20?: number | null;
  volatility90?: number | null;
  preMhMDV20NF?: number | null;
  preMhMDV90NF?: number | null;
  volRel?: number | null;
  preMhBidLstPrcPct?: number | null;
  preMhLoLstPrcPct?: number | null;
  preMhHiLstClsPct?: number | null;
  preMhLoLstClsPct?: number | null;
  lstPrcLstClsPct?: number | null;
  peakLstPrcLstClsPct?: number | null;
  endLstPrcLstClsPct?: number | null;
  startBenchLstPrcLstClsPct?: number | null;
  peakBenchLstPrcLstClsPct?: number | null;
  endBenchLstPrcLstClsPct?: number | null;
  startBidPct?: number | null;
  startAskPct?: number | null;
  peakBidPct?: number | null;
  peakAskPct?: number | null;
  endBidPct?: number | null;
  endAskPct?: number | null;
  imbExch925?: number | null;
  imbExch1555?: number | null;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
  // Raw vendor markers, carried verbatim so the Scanner can apply the same REP/ITB/HARD rules the
  // Sonar and Stream use instead of a coarse boolean. `b5Etb` is how C#'s `B5Etb` camel-cases;
  // read it through `readBorrowStatus` rather than by property, since the live surfaces spell the
  // same field `B5ETB`.
  report?: string | null;
  b5Etb?: string | null;
  country?: string | null;
  exchange?: string | null;
  sectorL3?: string | null;
  sectorL4?: string | null;
  sectorL5?: string | null;
};

export type ScannerLogContext = {
  startAbsNeg?: number | null;
  session: string;
  ruleBand: string;
  metric: string;
  closeMode: string;
  priceMode: string;
  pnlMode: string;
  scopeMode: string;
  topN: number;
  offset: number;
  startAbs: number;
  startAbsMax: string;
  endAbs: number;
  minHoldCandles: number;
  startCutoffMinuteIdx: number | null;
  preStartMinuteIdx: number | null;
  dilutionMode: string;
  dilutionStep: number;
  maxAdds: number;
  zapMode: string;
};

// Big request: Analytics + EpisodesSearch
export type PaperArbAnalyticsRequest = {
  dateFrom: string;
  dateTo: string;

  metric?: PaperArbMetric;
  startAbs?: number;
  usePrintMedianDelta?: boolean;
  /**
   * The unit StartAbs / StartAbsMax / EndAbs are expressed in: "pp" | "sigma" | "alpha".
   *
   * Only PairFlux sends it. `metric` cannot carry this, because its two values name Arbitrage's
   * ZAP variants and there is no third one for alpha; a bridge that gets both prefers this.
   */
  unit?: string | null;
  startAbsMax?: number | null;
  /**
   * Separate start threshold for NEGATIVE deviations (a Long entry); `startAbs` is then the positive
   * one (a Short entry). Null / absent = one threshold for both, as it always was.
   */
  startAbsNeg?: number | null;
  endAbs?: number;
  session?: PaperArbSession;
  closeMode?: PaperArbCloseMode;
  minHoldCandles?: number;
  startCutoffMinuteIdx?: number | null;
  preStartMinuteIdx?: number | null;
  priceMode?: PaperArbPriceMode;
  pnlMode?: PaperArbPnlMode;
  sizingMode?: PaperArbSizingMode;
  sizeValue?: number | null;
  dilutionMode?: PaperArbDilutionMode;
  dilutionStep?: number | null;
  maxAdds?: number | null;
  addDelayMinutes?: number | null;
  exitConfirmCandles?: number | null;

  // rating rules
  ratingType?: PaperArbRatingType | string | null;
  ratingRules?: PaperArbRatingRule[] | null;
  ratingFilters?: any[] | null; // legacy/compat

  // lists
  tickers?: string[] | null;
  excludeTickers?: string[] | null;
  benchTickers?: string[] | null;
  side?: "Long" | "Short" | null;

  exchanges?: string[] | null;
  countries?: string[] | null;
  sectorsL3?: string[] | null;
  excludeExchanges?: string[] | null;
  excludeCountries?: string[] | null;
  excludeSectorsL3?: string[] | null;

  // ranges
  minTierBp?: number | null;
  maxTierBp?: number | null;

  minCorr?: number | null;
  maxCorr?: number | null;
  minBeta?: number | null;
  maxBeta?: number | null;
  minSigma?: number | null;
  maxSigma?: number | null;
  /** The pair's ALPHA. Only PairFlux publishes one; other strategies leave it null. */
  minAlpha?: number | null;
  maxAlpha?: number | null;

  minMarketCapM?: number | null;
  maxMarketCapM?: number | null;

  minRoundLot?: number | null;
  maxRoundLot?: number | null;

  minAdv20?: number | null;
  maxAdv20?: number | null;
  minAdv20NF?: number | null;
  maxAdv20NF?: number | null;

  minAdv90?: number | null;
  maxAdv90?: number | null;
  minAdv90NF?: number | null;
  maxAdv90NF?: number | null;

  minPreMktVol?: number | null;
  maxPreMktVol?: number | null;
  minPreMktVolNF?: number | null;
  maxPreMktVolNF?: number | null;

  minSpread?: number | null;
  maxSpread?: number | null;
  minSpreadBidPct?: number | null;
  maxSpreadBidPct?: number | null;
  minSpreadBps?: number | null;
  maxSpreadBps?: number | null;

  minGap?: number | null;
  maxGap?: number | null;
  minGapPct?: number | null;
  maxGapPct?: number | null;

  minClsToClsPct?: number | null;
  maxClsToClsPct?: number | null;

  minVWAP?: number | null;
  maxVWAP?: number | null;

  minLo?: number | null;
  maxLo?: number | null;

  // news/flags
  requireHasNews?: boolean | null;
  excludeHasNews?: boolean | null;
  requireHasReport?: boolean | null;
  excludeHasReport?: boolean | null;
  minNewsCnt?: number | null;
  maxNewsCnt?: number | null;

  requireIsPTP?: boolean | null;
  requireIsSSR?: boolean | null;
  requireIsETF?: boolean | null;
  requireIsCrap?: boolean | null;

  excludeDividend?: boolean | null;
  excludePTP?: boolean | null;
  excludeSSR?: boolean | null;
  excludeETF?: boolean | null;
  excludeCrap?: boolean | null;
  includeUSA?: boolean | null;
  includeChina?: boolean | null;

  // medians
  minMdnPreMhVol90?: number | null;
  maxMdnPreMhVol90?: number | null;

  minPreMhMDV90NF?: number | null;
  maxPreMhMDV90NF?: number | null;

  minPreMhMDV20NF?: number | null;
  maxPreMhMDV20NF?: number | null;

  minMdnPostMhVol90NF?: number | null;
  maxMdnPostMhVol90NF?: number | null;
  minAvPostMhVol90NF?: number | null;
  maxAvPostMhVol90NF?: number | null;
  minAvPreMhVol90NF?: number | null;
  maxAvPreMhVol90NF?: number | null;
  minAvPreMhValue20NF?: number | null;
  maxAvPreMhValue20NF?: number | null;
  minAvPreMhValue90NF?: number | null;
  maxAvPreMhValue90NF?: number | null;
  minAvgDailyValue20?: number | null;
  maxAvgDailyValue20?: number | null;
  minAvgDailyValue90?: number | null;
  maxAvgDailyValue90?: number | null;
  minVolatility20?: number | null;
  maxVolatility20?: number | null;
  minVolatility90?: number | null;
  maxVolatility90?: number | null;
  minVolRel?: number | null;
  maxVolRel?: number | null;
  minPreMhBidLstPrcPct?: number | null;
  maxPreMhBidLstPrcPct?: number | null;
  minPreMhLoLstPrcPct?: number | null;
  maxPreMhLoLstPrcPct?: number | null;
  minPreMhHiLstClsPct?: number | null;
  maxPreMhHiLstClsPct?: number | null;
  minPreMhLoLstClsPct?: number | null;
  maxPreMhLoLstClsPct?: number | null;
  minLstPrcLstClsPct?: number | null;
  maxLstPrcLstClsPct?: number | null;
  minImbExch925?: number | null;
  maxImbExch925?: number | null;
  minImbExch1555?: number | null;
  maxImbExch1555?: number | null;

  // extra shared filters (compatible if server ignores unknown keys)
  minAvPreMhv?: number | null;
  maxAvPreMhv?: number | null;
  minLstPrcL?: number | null;
  maxLstPrcL?: number | null;
  minLstCls?: number | null;
  maxLstCls?: number | null;
  minYCls?: number | null;
  maxYCls?: number | null;
  minTCls?: number | null;
  maxTCls?: number | null;
  minLstClsNewsCnt?: number | null;
  maxLstClsNewsCnt?: number | null;
  minPreMhVolNF?: number | null;
  maxPreMhVolNF?: number | null;
  minVolNFfromLstCls?: number | null;
  maxVolNFfromLstCls?: number | null;

  // imbalance
  imbExchs?: string[] | null;
  minImbARCA?: number | null;
  maxImbARCA?: number | null;
  minImbExchValue?: number | null;
  maxImbExchValue?: number | null;

  // analytics-only output knobs
  includeEquityCurve?: boolean;
  equityCurveMode?: "Daily" | "Trade";
  /** OpenFade: which reading the band measures — "sigma" or "pct". */
  fadeMetric?: "sigma" | "pct" | null;
  /** OpenFade: the |sigma| band a stack must fall inside; the sign picks the side. */
  fadeMinAbs?: number | null;
  fadeMaxAbs?: number | null;
  /** OpenDoor/DayTwo backtest: explicit entry levels for the enabled params. */
  useManualEntry?: boolean | null;
  stackMin?: number | null;
  stackMax?: number | null;
  benchMin?: number | null;
  benchMax?: number | null;
  devSigMin?: number | null;
  devSigMax?: number | null;
  /** OpenDoor/DayTwo backtest: drop the rating gate and simulate the whole universe. */
  ignoreRatings?: boolean | null;
  optimizerBucketCount?: number | null;
  /** How the optimizer cuts a parameter's range. See ScopeOptimizerBinMode. */
  optimizerBinMode?: ScopeOptimizerBinMode | null;
  optimizerGroups?: string[] | null;
  optimizerParameterKeys?: string[] | null;

  topN?: number;

  // priceMode intentionally omitted (server forces LastPrint)
};

export type PaperArbEquityPointDto = {
  key: string; // "YYYY-MM-DD" or "YYYY-MM-DD minuteIdx"
  equity: number;
  pnl: number;
};

export type PaperArbTickerStatsDto = {
  ticker: string;
  trades: number;
  winRate?: number | null;
  totalPnlUsd?: number | null;
  profitFactor?: number | null;
  avgPnlUsd?: number | null;
  avgWinUsd?: number | null;
  avgLossUsd?: number | null;

  wins?: number | null;
  losses?: number | null;
};

export type PaperArbAnalyticsResponse = {
  trades?: number | null;
  totalPnlUsd?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  avgPnlUsd?: number | null;
  avgWinUsd?: number | null;
  avgLossUsd?: number | null;
  maxWinUsd?: number | null;
  maxLossUsd?: number | null;
  expectancyUsd?: number | null;
  maxDrawdownUsd?: number | null;

  equityCurve?: PaperArbEquityPointDto[] | null;
  topTickers?: PaperArbTickerStatsDto[] | null;
};

export type PaperArbOptimizerRangeBucketDto = {
  bucketId: string;
  label: string;
  fromValue?: number | null;
  toValue?: number | null;
  trades: number;
  wins: number;
  losses: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  score: number;
  coveragePct: number;
};

export type PaperArbOptimizerParameterDto = {
  key: string;
  group: string;
  label: string;
  observedMin?: number | null;
  observedMax?: number | null;
  valueCount: number;
  baseTrades: number;
  baseWins: number;
  baseLosses: number;
  baseTotalPnlUsd: number;
  baseAvgPnlUsd: number;
  baseWinRate: number;
  buckets: PaperArbOptimizerRangeBucketDto[];
  lowerTailBuckets: PaperArbOptimizerRangeBucketDto[];
  upperTailBuckets: PaperArbOptimizerRangeBucketDto[];
};

export type PaperArbOptimizerRangesResponse = {
  dateFrom: string;
  dateTo: string;
  metric: string;
  session: string;
  closeMode: string;
  pnlMode: string;
  bucketCount: number;
  parametersAnalyzed: number;
  parameters: PaperArbOptimizerParameterDto[];
};

export type EpisodeScanResult = {
  startAbs: number;
  endAbs: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
};

export type OptimizerScenario = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  apply: (req: PaperArbAnalyticsRequest) => void;
};

export type OptimizerResultRow = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  score: number;
};

export type ScopeBatchScenarioRequest = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  request: PaperArbAnalyticsRequest;
};

export type ScopeBatchResponse = {
  rows?: OptimizerResultRow[] | null;
};

export type OptimizerImpactRow = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  impactLevel: "STRONG" | "MEDIUM" | "LIGHT";
  impactPct: number;
  deltaScore: number;
  deltaPnlUsd: number;
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
};

export type OptimizerRangeRankMetric = "avgPnlUsd" | "totalPnlUsd" | "winRate" | "score" | "tailDamage";

export type OptimizerRangeGroupKey = "RATING GATES" | "ZAP THRESHOLDS" | "TAPE FILTERS";

export type OptimizerRangeGroupStatus = { loading: boolean; error: string | null; partial: boolean };

export type ScopeParameterDefinition = {
  key: string;
  label: string;
  group: OptimizerRangeGroupKey;
  scenarioParameter?: string | null;
  optimizerApiKey?: string | null;
  // categorical = client-side grouping (sector/bench), no API range call
  kind?: "numeric" | "categorical";
};

export type ScopeResearchChartType =
  | "simple_box"
  | "beauty_violin"
  | "results_by_bins"
  | "results_more_less_parameter"
  | "distribution"
  | "scatter_by_date"
  | "cumsum_chart"
  | "trade_performance";

export type ScopeResearchThresholdMode = "less_than" | "more_than";

export type ScopeResearchValueFormat = "number" | "currency" | "clock" | "minutes" | "percent";

export type ScopeResearchParameterKey =
  | "startMinuteIdx"
  | "peakMinuteIdx"
  | "endMinuteIdx"
  | "timeToPeak"
  | "timeToClose"
  | "startMetricAbs"
  | "peakMetricAbs"
  | "endMetricAbs"
  | "reversionAbs"
  | "reversionPct"
  | "minHoldCandles"
  | "entryDevSig"
  | "entryDevPct"
  | "rating"
  | "ratingTotal"
  | "corr"
  | "beta"
  | "sigma"
  | "adv20"
  | "adv20NF"
  | "adv90"
  | "adv90NF"
  | "avPreMhv"
  | "roundLot"
  | "vwap"
  | "spread"
  | "lstPrcL"
  | "lstCls"
  | "yCls"
  | "tCls"
  | "clsToClsPct"
  | "lo"
  | "newsCnt"
  | "marketCapM"
  | "preMktVolNF"
  | "avPostMhVol90NF"
  | "avPreMhVol90NF"
  | "avPreMhValue20NF"
  | "avPreMhValue90NF"
  | "avgDailyValue20"
  | "avgDailyValue90"
  | "volatility20"
  | "volatility90"
  | "preMhMDV20NF"
  | "preMhMDV90NF"
  | "volRel"
  | "preMhBidLstPrcPct"
  | "preMhLoLstPrcPct"
  | "preMhHiLstClsPct"
  | "preMhLoLstClsPct"
  | "lstPrcLstClsPct"
  | "volNFfromLstCls"
  | "imbExch925"
  | "imbExch1555";

export type ScopeResearchResultKey =
  | "avgPnlUsd"
  | "totalPnlUsd"
  | "winRate"
  | "score"
  | "rawPnlUsd"
  | "benchPnlUsd"
  | "hedgedPnlUsd"
  | "peakMetricAbs"
  | "endMetricAbs";

export type ScopeResearchOption<T extends string> = {
  value: T;
  label: string;
  format: ScopeResearchValueFormat;
};

export type GlassSelectOption = { value: string; label: string; disabled?: boolean };

export type GlassSelectGroup = { label: string; options: GlassSelectOption[] };

export type ScopeResearchExtraFilterSelection = {
  id: string;
  parameterKey: ScopeResearchParameterKey;
  from: number | null;
  to: number | null;
};

export type ScopeResearchExtraFilterDraft = {
  id: string;
  parameterKey: ScopeResearchParameterKey;
  from: string;
  to: string;
};

export type ScopeResearchParallelFilterSelection = ScopeResearchExtraFilterSelection;

export type ScopeResearchParallelFilterDraft = ScopeResearchExtraFilterDraft;

export type ScopeResearchSelection = {
  chartType: ScopeResearchChartType;
  parameterKey: ScopeResearchParameterKey;
  resultKey: ScopeResearchResultKey;
  bucketCount: number;
  minSamples: number;
  thresholdMode: ScopeResearchThresholdMode;
  domainFrom: number | null;
  domainTo: number | null;
  extraFilters: ScopeResearchExtraFilterSelection[];
  parallelFilters: ScopeResearchParallelFilterSelection[];
};

export type ScopeResearchDraft = Omit<ScopeResearchSelection, "domainFrom" | "domainTo"> & {
  domainFrom: string;
  domainTo: string;
  extraFilters: ScopeResearchExtraFilterDraft[];
  parallelFilters: ScopeResearchParallelFilterDraft[];
};

export type ScopePanelKey = "left" | "right";

export type ScopeResearchStats = {
  count: number;
  total: number;
  avg: number;
  median: number;
  winRate: number;
  score: number;
  q1: number;
  q3: number;
  lowerFence: number;
  upperFence: number;
  min: number;
  max: number;
};

export type ScopeResearchBinRow = ScopeResearchStats & {
  label: string;
  from: number;
  to: number;
  values: number[];
};

export type ScopeResearchThresholdRow = ScopeResearchStats & {
  label: string;
  threshold: number;
};

export type ScopeResearchPoint = {
  row: PaperArbClosedDto;
  parameter: number;
  result: number;
  dateKey: string;
  sortKey: number;
};

export type ScopeResearchComputed = {
  selection: ScopeResearchSelection;
  parameter: ScopeResearchOption<ScopeResearchParameterKey>;
  result: ScopeResearchOption<ScopeResearchResultKey>;
  sourceResult: ScopeResearchOption<ScopeResearchResultKey>;
  sourceCount: number;
  points: ScopeResearchPoint[];
  bins: ScopeResearchBinRow[];
  thresholds: ScopeResearchThresholdRow[];
  bestBin: ScopeResearchBinRow | null;
  bestThreshold: ScopeResearchThresholdRow | null;
  bestBox: ScopeResearchBinRow | null;
  parallelSeries: Array<{
    id: string;
    label: string;
    rows: Array<ScopeResearchBinRow | ScopeResearchThresholdRow>;
  }>;
  parallelPointSeries: Array<{
    id: string;
    label: string;
    points: ScopeResearchPoint[];
  }>;
};

export type ScopeChartTooltipData = {
  x: number;
  y: number;
  title: string;
  lines: string[];
  accent?: "emerald" | "amber" | "cyan" | "fuchsia";
};

export type SharedRangeFilterKey =
  | "corr"
  | "beta"
  | "sigma"
  | "adv20"
  | "adv20nf"
  | "adv90"
  | "adv90nf"
  | "avpremhv"
  | "roundlot"
  | "vwap"
  | "spread"
  | "lstprcl"
  | "lstcls"
  | "ycls"
  | "tcls"
  | "clstocls"
  | "lo"
  | "lstclsnewscnt"
  | "marketcapm"
  | "premhvolnf"
  | "volnffromlstcls"
  | "avpostmhvol90nf"
  | "avpremhvol90nf"
  | "avpremhvalue20nf"
  | "avpremhvalue90nf"
  | "avgdailyvalue20"
  | "avgdailyvalue90"
  | "volatility20"
  | "volatility90"
  | "premhmdv20nf"
  | "premhmdv90nf"
  | "volrel"
  | "premhbidlstprc"
  | "premhlolstprc"
  | "premhhilstcls"
  | "premhlolstcls"
  | "lstprclstcls"
  | "imbexch925"
  | "imbexch1555";

export type SharedRangeFilterMode = "on" | "off";

export type ProblemDetails = {
  title?: string;
  detail?: string;
  status?: number;
  type?: string;
  instance?: string;
};
