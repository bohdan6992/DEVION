import type { GlassSelectGroup, GlassSelectOption, OptimizerRangeGroupKey, ScopePanelKey, ScopeParameterDefinition, ScopeResearchChartType, ScopeResearchDraft, ScopeResearchOption, ScopeResearchParameterKey, ScopeResearchResultKey, SharedRangeFilterKey, SharedRangeFilterMode } from "./types";

export const DEFAULT_SHARED_RANGE_FILTER_MODES: Record<SharedRangeFilterKey, SharedRangeFilterMode> = {
  corr: "on",
  beta: "on",
  sigma: "on",
  adv20: "on",
  adv20nf: "on",
  adv90: "on",
  adv90nf: "on",
  avpremhv: "on",
  roundlot: "on",
  vwap: "on",
  spread: "on",
  lstprcl: "on",
  lstcls: "on",
  ycls: "on",
  tcls: "on",
  clstocls: "on",
  lo: "on",
  lstclsnewscnt: "on",
  marketcapm: "on",
  premhvolnf: "on",
  volnffromlstcls: "on",
  avpostmhvol90nf: "on",
  avpremhvol90nf: "on",
  avpremhvalue20nf: "on",
  avpremhvalue90nf: "on",
  avgdailyvalue20: "on",
  avgdailyvalue90: "on",
  volatility20: "on",
  volatility90: "on",
  premhmdv20nf: "on",
  premhmdv90nf: "on",
  volrel: "on",
  premhbidlstprc: "on",
  premhlolstprc: "on",
  premhhilstcls: "on",
  premhlolstcls: "on",
  lstprclstcls: "on",
  imbexch925: "on",
  imbexch1555: "on",
};

// The full catalogue of research axes. A strategy that cannot produce some of them (OpenDoor has
// no sigma metric, no peak and no hedge leg) narrows this list via createScannerScopeCatalog()
// rather than keeping its own copy — see ScannerStrategy.scope in ./strategy.
export const SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL: Array<ScopeResearchOption<ScopeResearchParameterKey>> = [
  { value: "startMinuteIdx", label: "Start Time", format: "clock" },
  { value: "peakMinuteIdx", label: "Peak Time", format: "clock" },
  { value: "endMinuteIdx", label: "End Time", format: "clock" },
  { value: "timeToPeak", label: "Time To Peak", format: "minutes" },
  { value: "timeToClose", label: "Time To Close", format: "minutes" },
  { value: "startMetricAbs", label: "Start Abs", format: "number" },
  { value: "peakMetricAbs", label: "Peak Abs", format: "number" },
  { value: "endMetricAbs", label: "End Abs", format: "number" },
  { value: "reversionAbs", label: "Peak-End Abs", format: "number" },
  { value: "reversionPct", label: "Reversion %", format: "percent" },
  { value: "minHoldCandles", label: "Min Hold", format: "minutes" },
  { value: "entryDevSig", label: "DEV σ", format: "number" },
  { value: "entryDevPct", label: "DEV %", format: "number" },
  { value: "rating", label: "Rating", format: "number" },
  { value: "ratingTotal", label: "Rating Total", format: "number" },
  { value: "corr", label: "CORR", format: "number" },
  { value: "beta", label: "BETA", format: "number" },
  { value: "sigma", label: "SIGMA", format: "number" },
  { value: "adv20", label: "ADV20", format: "number" },
  { value: "adv20NF", label: "ADV20NF", format: "number" },
  { value: "adv90", label: "ADV90", format: "number" },
  { value: "adv90NF", label: "ADV90NF", format: "number" },
  { value: "avPreMhv", label: "AvPreMhv", format: "number" },
  { value: "roundLot", label: "RoundLot", format: "number" },
  { value: "vwap", label: "VWAP", format: "number" },
  { value: "spread", label: "SpreadBid%", format: "number" },
  { value: "lstPrcL", label: "LstPrcL", format: "number" },
  { value: "lstCls", label: "LstCls", format: "number" },
  { value: "yCls", label: "YCls", format: "number" },
  { value: "tCls", label: "TCls", format: "number" },
  { value: "clsToClsPct", label: "ClsToCls%", format: "percent" },
  { value: "lo", label: "Lo", format: "number" },
  { value: "newsCnt", label: "LstClsNewsCnt", format: "number" },
  { value: "marketCapM", label: "MarketCapM", format: "number" },
  { value: "preMktVolNF", label: "PreMhVolNF", format: "number" },
  { value: "volNFfromLstCls", label: "VolNFfromLstCls", format: "number" },
  { value: "avPostMhVol90NF", label: "AvPostMhVol90NF", format: "number" },
  { value: "avPreMhVol90NF", label: "AvPreMhVol90NF", format: "number" },
  { value: "avPreMhValue20NF", label: "AvPreMhValue20NF", format: "number" },
  { value: "avPreMhValue90NF", label: "AvPreMhValue90NF", format: "number" },
  { value: "avgDailyValue20", label: "AvgDailyValue20", format: "number" },
  { value: "avgDailyValue90", label: "AvgDailyValue90", format: "number" },
  { value: "volatility20", label: "Volatility20", format: "percent" },
  { value: "volatility90", label: "Volatility90", format: "percent" },
  { value: "preMhMDV20NF", label: "PreMhMDV20NF", format: "number" },
  { value: "preMhMDV90NF", label: "PreMhMDV90NF", format: "number" },
  { value: "volRel", label: "VolRel", format: "number" },
  { value: "preMhBidLstPrcPct", label: "PreMhBidLstPrc%", format: "percent" },
  { value: "preMhLoLstPrcPct", label: "PreMhLoLstPrc%", format: "percent" },
  { value: "preMhHiLstClsPct", label: "PreMhHiLstCls%", format: "percent" },
  { value: "preMhLoLstClsPct", label: "PreMhLoLstCls%", format: "percent" },
  { value: "lstPrcLstClsPct", label: "LstPrcLstCls%", format: "percent" },
  { value: "imbExch925", label: "ImbExch925", format: "number" },
  { value: "imbExch1555", label: "ImbExch1555", format: "number" },
];

function buildParameterSelectGroups(
  parameterOptions: Array<ScopeResearchOption<ScopeResearchParameterKey>>
): GlassSelectGroup[] {
  return [
  {
    label: "OPTION FILTERS",
    options: parameterOptions.filter((option) =>
      [
        "startMinuteIdx",
        "peakMinuteIdx",
        "endMinuteIdx",
        "timeToPeak",
        "timeToClose",
        "startMetricAbs",
        "peakMetricAbs",
        "endMetricAbs",
        "reversionAbs",
        "reversionPct",
        "minHoldCandles",
        "entryDevSig",
        "entryDevPct",
      ].includes(option.value)
    ).map((option) => ({ value: option.value, label: option.label })),
  },
  {
    label: "RATING FILTERS",
    options: parameterOptions.filter((option) =>
      ["rating", "ratingTotal", "corr", "beta", "sigma"].includes(option.value)
    ).map((option) => ({ value: option.value, label: option.label })),
  },
  {
    label: "TAPE FILTERS",
    options: parameterOptions.filter((option) =>
      [
        "adv20",
        "adv20NF",
        "adv90",
        "adv90NF",
        "avPreMhv",
        "roundLot",
        "vwap",
        "spread",
        "lstPrcL",
        "lstCls",
        "yCls",
        "tCls",
        "clsToClsPct",
        "lo",
        "newsCnt",
        "marketCapM",
        "preMktVolNF",
        "volNFfromLstCls",
        "avPostMhVol90NF",
        "avPreMhVol90NF",
        "avPreMhValue20NF",
        "avPreMhValue90NF",
        "avgDailyValue20",
        "avgDailyValue90",
        "volatility20",
        "volatility90",
        "preMhMDV20NF",
        "preMhMDV90NF",
        "volRel",
        "preMhBidLstPrcPct",
        "preMhLoLstPrcPct",
        "preMhHiLstClsPct",
        "preMhLoLstClsPct",
        "lstPrcLstClsPct",
        "imbExch925",
        "imbExch1555",
      ].includes(option.value)
    ).map((option) => ({ value: option.value, label: option.label })),
    },
  ];
}

export const SCOPE_RESEARCH_RESULT_OPTIONS_ALL: Array<ScopeResearchOption<ScopeResearchResultKey>> = [
  { value: "avgPnlUsd", label: "Avg/Trade", format: "number" },
  { value: "totalPnlUsd", label: "TotalPnL", format: "currency" },
  { value: "winRate", label: "WinRate", format: "percent" },
  { value: "score", label: "Score", format: "number" },
  { value: "rawPnlUsd", label: "Raw PnL", format: "currency" },
  { value: "benchPnlUsd", label: "Bench PnL", format: "currency" },
  { value: "hedgedPnlUsd", label: "Hedged PnL", format: "currency" },
  { value: "peakMetricAbs", label: "Peak Abs", format: "number" },
  { value: "endMetricAbs", label: "End Abs", format: "number" },
];

/**
 * The set of research axes one strategy can actually plot, plus the derived <GlassSelect> option
 * lists. Built once per strategy (see ./strategy) instead of living in module scope: the select
 * caches below are keyed only by chart type, so a single shared cache would hand OpenDoor the
 * option list Arbitrage happened to build first.
 */
export type ScannerScopeCatalog = {
  parameterOptions: Array<ScopeResearchOption<ScopeResearchParameterKey>>;
  parameterSelectGroups: GlassSelectGroup[];
  resultOptions: Array<ScopeResearchOption<ScopeResearchResultKey>>;
  resultOptionsForChart: (chartType: ScopeResearchChartType) => Array<ScopeResearchOption<ScopeResearchResultKey>>;
  resultSelectOptions: (chartType: ScopeResearchChartType) => GlassSelectOption[];
  normalizeResultKey: (chartType: ScopeResearchChartType, resultKey: ScopeResearchResultKey) => ScopeResearchResultKey;
};

export function createScannerScopeCatalog(options?: {
  /** Axes this strategy never populates — dropped from every dropdown. */
  excludeParameters?: Iterable<ScopeResearchParameterKey>;
  /** Result metrics this strategy always leaves null (e.g. no hedge leg). */
  excludeResults?: Iterable<ScopeResearchResultKey>;
}): ScannerScopeCatalog {
  const excludedParameters = new Set(options?.excludeParameters ?? []);
  const excludedResults = new Set(options?.excludeResults ?? []);

  const parameterOptions = excludedParameters.size
    ? SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL.filter((option) => !excludedParameters.has(option.value))
    : SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL;
  const resultOptions = excludedResults.size
    ? SCOPE_RESEARCH_RESULT_OPTIONS_ALL.filter((option) => !excludedResults.has(option.value))
    : SCOPE_RESEARCH_RESULT_OPTIONS_ALL;

  // Per-chart-type lists are pure functions of the chart type, so memoise them. Building them
  // inline in JSX produced a fresh array of fresh objects on every render and defeated
  // GlassSelect's React.memo.
  const forChartCache = new Map<ScopeResearchChartType, Array<ScopeResearchOption<ScopeResearchResultKey>>>();
  const selectCache = new Map<ScopeResearchChartType, GlassSelectOption[]>();

  const resultOptionsForChart = (chartType: ScopeResearchChartType) => {
    const cached = forChartCache.get(chartType);
    if (cached) return cached;
    const built =
      chartType === "results_by_bins" || chartType === "results_more_less_parameter"
        ? resultOptions
        : resultOptions.filter(
            (option) => option.value !== "avgPnlUsd" && option.value !== "winRate" && option.value !== "score"
          );
    forChartCache.set(chartType, built);
    return built;
  };

  return {
    parameterOptions,
    parameterSelectGroups: buildParameterSelectGroups(parameterOptions),
    resultOptions,
    resultOptionsForChart,
    resultSelectOptions: (chartType) => {
      const cached = selectCache.get(chartType);
      if (cached) return cached;
      const built = resultOptionsForChart(chartType).map((option) => ({
        value: option.value,
        label: option.label,
      }));
      selectCache.set(chartType, built);
      return built;
    },
    normalizeResultKey: (chartType, resultKey) =>
      resultOptionsForChart(chartType).some((option) => option.value === resultKey) ? resultKey : "totalPnlUsd",
  };
}

// Static <GlassSelect> option lists. Hoisted out of JSX so GlassSelect's React.memo sees a stable
// `options` reference — an inline array literal is a new reference on every parent render and would
// re-render the dropdown (and rebuild its portal panel) on every keystroke elsewhere in the page.
export const STREAM_SORT_KEY_OPTIONS: GlassSelectOption[] = [
  { value: "alpha", label: "ABC" },
  { value: "sigma", label: "SIG" },
  { value: "netEdge", label: "EDGE" },
];

export const RANGE_PRESET_OPTIONS: GlassSelectOption[] = [
  { value: "3d", label: "3 DAYS" },
  { value: "5d", label: "5 DAYS" },
  { value: "10d", label: "10 DAYS" },
  { value: "15d", label: "15 DAYS" },
  { value: "20d", label: "20 DAYS" },
  { value: "30d", label: "30 DAYS" },
];

export const OPTIMIZER_RANK_METRIC_OPTIONS: GlassSelectOption[] = [
  { value: "avgPnlUsd", label: "Avg/Trade" },
  { value: "totalPnlUsd", label: "TotalPnL" },
  { value: "winRate", label: "WinRate" },
  { value: "score", label: "Score" },
  { value: "tailDamage", label: "Tail Dmg ↓" },
];

/**
 * How the SCOPE optimizer cuts a parameter's range. See ScopeOptimizerBinMode and the bridge's
 * BuildBinCuts — harm and gain are the two halves of one question, so they sit next to each other.
 */
export const SCOPE_BIN_MODE_OPTIONS: GlassSelectOption[] = [
  { value: "trades", label: "Trades" },
  { value: "harm", label: "Harm ↓" },
  { value: "gain", label: "Gain ↑" },
  { value: "width", label: "Width" },
];

export const SCOPE_THRESHOLD_MODE_OPTIONS: GlassSelectOption[] = [
  { value: "more_than", label: ">= x" },
  { value: "less_than", label: "<= x" },
];

export const OPTIMIZER_GROUP_DISPLAY_LABELS: Record<OptimizerRangeGroupKey, string> = {
  "RATING GATES": "RATING FILTERS",
  "ZAP THRESHOLDS": "ZAP FILTERS",
  "TAPE FILTERS": "TAPE FILTERS",
};

export const SCOPE_PARAMETER_DEFINITIONS: ScopeParameterDefinition[] = [
  { key: "minrate", label: "MINRATE", group: "RATING GATES", scenarioParameter: "MINRATE" },
  { key: "mintotal", label: "MINTOTAL", group: "RATING GATES", scenarioParameter: "MINTOTAL" },
  { key: "corr", label: "CORR", group: "RATING GATES", scenarioParameter: "CORR", optimizerApiKey: "CORR" },
  { key: "beta", label: "BETA", group: "RATING GATES", scenarioParameter: "BETA", optimizerApiKey: "BETA" },
  { key: "sigma", label: "SIGMA", group: "RATING GATES", scenarioParameter: "SIGMA", optimizerApiKey: "SIGMA" },
  // The fourth pair statistic. Published for PairFlux only; other strategies return no card
  // for it, exactly as they return none for the pair-level SIGMA above.
  { key: "alpha", label: "ALPHA", group: "RATING GATES", scenarioParameter: null },
  { key: "sector", label: "SECTOR L3", group: "RATING GATES", kind: "categorical" },
  { key: "sectorL4", label: "SECTOR L4", group: "RATING GATES", kind: "categorical" },
  { key: "sectorL5", label: "SECTOR L5", group: "RATING GATES", kind: "categorical" },
  { key: "bench", label: "BENCH", group: "RATING GATES", kind: "categorical" },
  { key: "startabs", label: "START", group: "ZAP THRESHOLDS", scenarioParameter: null },
  // PairFlux measures a pair through its whole life, so it reports four moments where a
  // single-ticker strategy reports two: the entry, the widest point, the detection reading at the
  // exit bar, and the OPPOSITE-side reading the exit threshold was actually compared against.
  // These were returned by the bridge and simply missing from this list, so they rendered once
  // requested but could never be picked. HOLD is the same case.
  { key: "peakabs", label: "PEAK", group: "ZAP THRESHOLDS", scenarioParameter: null },
  { key: "endabs", label: "END", group: "ZAP THRESHOLDS", scenarioParameter: "END" },
  { key: "exitabs", label: "EXIT", group: "ZAP THRESHOLDS", scenarioParameter: null },
  { key: "hold", label: "HOLD", group: "ZAP THRESHOLDS", scenarioParameter: null },
  // OpenFade picks its trades on nothing else, and OpenDoor gates on the same reading, so
  // without these two the optimizer could rank every incidental tape field EXCEPT the one
  // the strategy actually acts on. START/END above stay null for both (no peak tracking).
  { key: "devsig", label: "DEV σ", group: "ZAP THRESHOLDS", scenarioParameter: null },
  { key: "devpct", label: "DEV %", group: "ZAP THRESHOLDS", scenarioParameter: null },
  { key: "adv20", label: "ADV20", group: "TAPE FILTERS", scenarioParameter: "ADV20" },
  { key: "adv20nf", label: "ADV20NF", group: "TAPE FILTERS", scenarioParameter: "ADV20NF" },
  { key: "adv90", label: "ADV90", group: "TAPE FILTERS", scenarioParameter: "ADV90" },
  { key: "adv90nf", label: "ADV90NF", group: "TAPE FILTERS", scenarioParameter: "ADV90NF" },
  { key: "avpremhv", label: "AvPreMhv", group: "TAPE FILTERS", scenarioParameter: "AvPreMhv" },
  { key: "roundlot", label: "RoundLot", group: "TAPE FILTERS", scenarioParameter: "RoundLot" },
  { key: "vwap", label: "VWAP", group: "TAPE FILTERS", scenarioParameter: "VWAP" },
  { key: "spread", label: "SpreadBid%", group: "TAPE FILTERS", scenarioParameter: "SpreadBidPct" },
  { key: "lstprcl", label: "LstPrcL", group: "TAPE FILTERS", scenarioParameter: "LstPrcL" },
  { key: "lstcls", label: "LstCls", group: "TAPE FILTERS", scenarioParameter: "LstCls" },
  { key: "ycls", label: "YCls", group: "TAPE FILTERS", scenarioParameter: "YCls" },
  { key: "tcls", label: "TCls", group: "TAPE FILTERS", scenarioParameter: "TCls" },
  { key: "clstocls", label: "ClsToCls%", group: "TAPE FILTERS", scenarioParameter: "ClsToCls%" },
  { key: "lo", label: "Lo", group: "TAPE FILTERS", scenarioParameter: "Lo" },
  { key: "lstclsnewscnt", label: "LstClsNewsCnt", group: "TAPE FILTERS", scenarioParameter: "LstClsNewsCnt" },
  { key: "marketcapm", label: "MarketCapM", group: "TAPE FILTERS", scenarioParameter: "MarketCapM" },
  { key: "premhvolnf", label: "PreMhVolNF", group: "TAPE FILTERS", scenarioParameter: "PreMhVolNF" },
  { key: "volnffromlstcls", label: "VolNFfromLstCls", group: "TAPE FILTERS", scenarioParameter: "VolNFfromLstCls" },
  { key: "avpostmhvol90nf", label: "AvPostMhVol90NF", group: "TAPE FILTERS", scenarioParameter: "AvPostMhVol90NF" },
  { key: "avpremhvol90nf", label: "AvPreMhVol90NF", group: "TAPE FILTERS", scenarioParameter: "AvPreMhVol90NF" },
  { key: "avpremhvalue20nf", label: "AvPreMhValue20NF", group: "TAPE FILTERS", scenarioParameter: "AvPreMhValue20NF" },
  { key: "avpremhvalue90nf", label: "AvPreMhValue90NF", group: "TAPE FILTERS", scenarioParameter: "AvPreMhValue90NF" },
  { key: "avgdailyvalue20", label: "AvgDailyValue20", group: "TAPE FILTERS", scenarioParameter: "AvgDailyValue20" },
  { key: "avgdailyvalue90", label: "AvgDailyValue90", group: "TAPE FILTERS", scenarioParameter: "AvgDailyValue90" },
  { key: "volatility20", label: "Volatility20", group: "TAPE FILTERS", scenarioParameter: "Volatility20" },
  { key: "volatility90", label: "Volatility90", group: "TAPE FILTERS", scenarioParameter: "Volatility90" },
  { key: "premhmdv20nf", label: "PreMhMDV20NF", group: "TAPE FILTERS", scenarioParameter: "PreMhMDV20NF" },
  { key: "premhmdv90nf", label: "PreMhMDV90NF", group: "TAPE FILTERS", scenarioParameter: "PreMhMDV90NF" },
  { key: "volrel", label: "VolRel", group: "TAPE FILTERS", scenarioParameter: "VolRel" },
  { key: "premhbidlstprc", label: "PreMhHiLstPrc%", group: "TAPE FILTERS", scenarioParameter: "PreMhHiLstPrc%" },
  { key: "premhlolstprc", label: "PreMhLoLstPrc%", group: "TAPE FILTERS", scenarioParameter: "PreMhLoLstPrc%" },
  { key: "premhhilstcls", label: "PreMhHiLstCls%", group: "TAPE FILTERS", scenarioParameter: "PreMhHiLstCls%" },
  { key: "premhlolstcls", label: "PreMhLoLstCls%", group: "TAPE FILTERS", scenarioParameter: "PreMhLoLstCls%" },
  { key: "lstprclstcls", label: "LstPrcLstCls%", group: "TAPE FILTERS", scenarioParameter: "LstPrcLstCls%" },
  { key: "imbexch925", label: "ImbExch9:25", group: "TAPE FILTERS", scenarioParameter: "ImbExch9:25" },
  { key: "imbexch1555", label: "ImbExch15:55", group: "TAPE FILTERS", scenarioParameter: "ImbExch15:55" },
];

export const SCOPE_PARAMETER_BY_KEY = new Map(SCOPE_PARAMETER_DEFINITIONS.map((item) => [item.key, item]));

export const SCOPE_PARAMETER_SELECT_GROUPS: GlassSelectGroup[] = (["RATING GATES", "ZAP THRESHOLDS", "TAPE FILTERS"] as OptimizerRangeGroupKey[]).map((group) => ({
  label: OPTIMIZER_GROUP_DISPLAY_LABELS[group],
  options: SCOPE_PARAMETER_DEFINITIONS
    .filter((item) => item.group === group)
    .map((item) => ({ value: item.key, label: item.label })),
}));

/**
 * Panel defaults. Only the starting axis differs per strategy — a strategy whose scope catalog
 * excludes `peakMetricAbs`/`startMetricAbs` must override these or the panel opens on an axis its
 * own dropdown does not offer.
 */
export function createDefaultScopeResearchDrafts(
  axes?: Partial<Record<ScopePanelKey, ScopeResearchParameterKey>>
): Record<ScopePanelKey, ScopeResearchDraft> {
  const drafts = structuredClone(DEFAULT_SCOPE_RESEARCH_DRAFTS);
  if (axes?.left) drafts.left.parameterKey = axes.left;
  if (axes?.right) drafts.right.parameterKey = axes.right;
  return drafts;
}

const DEFAULT_SCOPE_RESEARCH_DRAFTS: Record<ScopePanelKey, ScopeResearchDraft> = {
  left: {
    chartType: "results_by_bins",
    parameterKey: "peakMetricAbs",
    resultKey: "totalPnlUsd",
    bucketCount: 8,
    minSamples: 12,
    thresholdMode: "more_than",
    domainFrom: "",
    domainTo: "",
    extraFilters: [],
    parallelFilters: [],
  },
  right: {
    chartType: "scatter_by_date",
    parameterKey: "startMetricAbs",
    resultKey: "totalPnlUsd",
    bucketCount: 8,
    minSamples: 12,
    thresholdMode: "more_than",
    domainFrom: "",
    domainTo: "",
    extraFilters: [],
    parallelFilters: [],
  },
};
