"use client";

import { useCallback, useState } from "react";
import type { PresetDto } from "../../types/presets";
import { todayNyYmd } from "../time";
import { normalizeDilutionStepValue, normalizeMaxAddsValue } from "./format";
import { ratingBandFromSession } from "./rating";
import { DEFAULT_SHARED_RANGE_FILTER_MODES } from "./scopeParameters";
import type { ScannerStrategy } from "./strategy";
import type { ScopeOptimizerBinMode } from "./types";
import type { DateMode, EpisodeScanResult, EpisodeSortKey, OptimizerRangeGroupKey, OptimizerRangeGroupStatus, OptimizerRangeRankMetric, OptimizerResultRow, PaperArbActiveRow, PaperArbAnalyticsResponse, PaperArbCloseMode, PaperArbClosedDto, PaperArbDilutionMode, PaperArbMetric, PaperArbOptimizerRangesResponse, PaperArbPnlMode, PaperArbPriceMode, PaperArbRatingBand, PaperArbRatingMode, PaperArbRatingRule, PaperArbRatingType, PaperArbSession, PaperArbSizingMode, PaperListMode, ScopePanelKey, ScopeResearchDraft, ScopeResearchSelection, SharedRangeFilterKey, SharedRangeFilterMode, SortDir, TabKey, TriMode, ZapMode } from "./types";
import type { ScannerFilterSetters, ScannerFilterState } from "./filterState";

export type ScannerFiltersOptions = {
  /** The strategy being scanned; seeds the scope-research panels from its catalog. */
  strategy?: ScannerStrategy;
  /**
   * Stream automation can pre-seed the dilution and timing controls. Passed in rather than
   * read here so this hook stays independent of the shell's props.
   */
  streamAutomationConfigOverride?: {
    startCutoffTime?: string;
    preStartTime?: string;
    scaleMode?: string;
    dilutionStep?: number;
    maxAdds?: number;
    addDelayMinutes?: number;
  } | null;
  /** The one shared default that differs per strategy: 0.1 for Arbitrage, 0 for OpenDoor. */
  startAbsDefault?: number;
  /**
   * The sessions this strategy actually has statistics for, most-preferred first.
   *
   * Omit it and nothing changes: the session defaults to GLOB and the band to GLOBAL, which is
   * Arbitrage's eight-band world. Pass it and both defaults come from the list instead, and any
   * attempt to set a session outside it is refused.
   *
   * PairFlux is why this exists. It rates three classes, but it started on GLOB — a class its
   * ratings endpoint answers with zero rows. The result was a scanner that looked configured,
   * highlighted no band at all (GLOBAL is not one of its three buttons), fetched an empty pair
   * universe and produced no signals, with nothing anywhere saying why.
   */
  sessions?: readonly PaperArbSession[];
};

/**
 * The scanner's shared state, in one place.
 *
 * These 226 fields were declared identically in both scanner components — every one of them,
 * with a single default differing (startAbs). A strategy's own knobs are NOT here; they belong
 * to `ScannerStrategyParams.use` on the descriptor.
 *
 * Returned as one flat bag whose keys match the names the components already use, so adopting
 * it is a destructure rather than a rewrite of several thousand references.
 */
export function useScannerFilters(
  options: ScannerFiltersOptions = {}
): ScannerFilterState & ScannerFilterSetters {
  const [internalTab, setInternalTab] = useState<TabKey>("active");
  // The strategy's own first class when it declared a list, else Arbitrage's historical default.
  const allowedSessions = options.sessions;
  const defaultSession: PaperArbSession = allowedSessions?.[0] ?? "GLOB";
  const [internalRuleBand, setInternalRuleBand] = useState<PaperArbRatingBand>(
    allowedSessions?.[0] ? ratingBandFromSession(allowedSessions[0]) : "GLOBAL",
  );
  const [zapMode, setZapMode] = useState<ZapMode>("zap");
  const [showSharedMinMax, setShowSharedMinMax] = useState<boolean>(true);
  const [days, setDays] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<DateMode>("day");
  const [dateNy, setDateNy] = useState<string>(todayNyYmd());
  const [dateFrom, setDateFrom] = useState<string>(todayNyYmd());
  const [dateTo, setDateTo] = useState<string>(todayNyYmd());
  const [rangePreset, setRangePreset] = useState<"3d" | "5d" | "10d" | "15d" | "20d" | "30d">("5d");
  const [internalSession, setInternalSessionRaw] = useState<PaperArbSession>(defaultSession);
  /**
   * Refuses a session the strategy has no ratings for.
   *
   * The blocked paths are the quiet ones — a layout saved before the list existed, or one carried
   * over from another strategy's stored shape. Both restore a class that fetches nothing.
   */
  const setInternalSession = useCallback((next: PaperArbSession) => {
    if (allowedSessions && !allowedSessions.includes(next)) return;
    setInternalSessionRaw(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedSessions]);
  const [metric, setMetric] = useState<PaperArbMetric>("SigmaZap");
  const [closeMode, setCloseMode] = useState<PaperArbCloseMode>("Active");
  const [startAbs, setStartAbs] = useState<number>(options.startAbsDefault ?? 0.1);
  const [startAbsMax, setStartAbsMax] = useState<string>("");
  const [endAbs, setEndAbs] = useState<number>(0.05);
  const [minHoldCandles, setMinHoldCandles] = useState<number>(0);
  const [startCutoffTime, setStartCutoffTime] = useState<string>(() => options.streamAutomationConfigOverride?.startCutoffTime ?? "09:20");
  const [preStartTime, setPreStartTime] = useState<string>(() => options.streamAutomationConfigOverride?.preStartTime ?? "21:00");
  const [pnlMode, setPnlMode] = useState<PaperArbPnlMode>("Hedged");
  const [priceMode, setPriceMode] = useState<PaperArbPriceMode>("LastPrint");
  const [sizingMode, setSizingMode] = useState<PaperArbSizingMode>("Notional");
  const [sizeValue, setSizeValue] = useState<number>(1000);
  const [dilutionMode, setDilutionMode] = useState<PaperArbDilutionMode>(() => options.streamAutomationConfigOverride?.scaleMode === "single" ? "Undiluted" : "Diluted");
  const [dilutionStep, setDilutionStep] = useState<number>(() => normalizeDilutionStepValue(options.streamAutomationConfigOverride?.dilutionStep ?? 0.3));
  const [maxAdds, setMaxAdds] = useState<number>(() => normalizeMaxAddsValue(options.streamAutomationConfigOverride?.maxAdds ?? 3));
  const [addDelayMinutes, setAddDelayMinutes] = useState<number>(() => Math.max(0, Math.trunc(options.streamAutomationConfigOverride?.addDelayMinutes ?? 0)));
  const [includeEquityCurve, setIncludeEquityCurve] = useState<boolean>(true);
  const [equityCurveMode, setEquityCurveMode] = useState<"Daily" | "Trade">("Daily");
  const [topN, setTopN] = useState<number>(1000);
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  const [offset, setOffset] = useState<number>(0);
  const [qTicker, setQTicker] = useState<string>("");
  const [qSide, setQSide] = useState<"" | "Long" | "Short">("");
  const [streamSortKey, setStreamSortKey] = useState<"alpha" | "sigma" | "netEdge">("alpha");
  const [activeRows, setActiveRows] = useState<PaperArbActiveRow[]>([]);
  const [episodesRows, setEpisodesRows] = useState<PaperArbClosedDto[]>([]);
  const [analytics, setAnalytics] = useState<PaperArbAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [listMode, setListMode] = useState<PaperListMode>("off");
  const [showIgnore, setShowIgnore] = useState<boolean>(false);
  const [showApply, setShowApply] = useState<boolean>(false);
  const [showPin, setShowPin] = useState<boolean>(false);
  const [showPresets, setShowPresets] = useState<boolean>(false);
  const [scannerPresets, setScannerPresets] = useState<PresetDto[]>([]);
  const [scannerPresetBusy, setScannerPresetBusy] = useState<boolean>(false);
  const [scannerPresetSaveMode, setScannerPresetSaveMode] = useState<boolean>(false);
  const [scannerPresetDraftName, setScannerPresetDraftName] = useState<string>("");
  const [scannerPresetStatus, setScannerPresetStatus] = useState<string>("");
  const [episodesSort, setEpisodesSort] = useState<{ key: EpisodeSortKey; dir: SortDir }>({
    key: "total",
    dir: "desc",
  });
  const [analyticsSort, setAnalyticsSort] = useState<{ key: EpisodeSortKey; dir: SortDir }>({
    key: "total",
    dir: "desc",
  });
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [ratingMode, setRatingMode] = useState<PaperArbRatingMode>("SESSION");
  const [topMode, setTopMode] = useState<boolean>(false);
  const [topSigmaOn, setTopSigmaOn] = useState<boolean>(true);
  const [topBenchOn, setTopBenchOn] = useState<boolean>(false);
  const [topTimeOn, setTopTimeOn] = useState<boolean>(false);
  const [ratingType, setRatingType] = useState<PaperArbRatingType>("any");
  const [ratingRules, setRatingRules] = useState<PaperArbRatingRule[]>([
    { band: "BLUE", minRate: 0, minTotal: 0 },
    { band: "ARK", minRate: 0, minTotal: 0 },
    { band: "PRE", minRate: 0, minTotal: 0 },
    { band: "OPEN", minRate: 0, minTotal: 0 },
    { band: "INTRA", minRate: 0, minTotal: 0 },
    { band: "PRINT", minRate: 0, minTotal: 0 },
    { band: "POST", minRate: 0, minTotal: 0 },
    { band: "GLOBAL", minRate: 0, minTotal: 0 },
  ]);
  const [ratingEnabledBands, setRatingEnabledBands] = useState<Record<PaperArbRatingBand, boolean>>({
    BLUE: false,
    ARK: false,
    PRE: false,
    OPEN: false,
    INTRA: false,
    PRINT: false,
    POST: false,
    GLOBAL: true,
  });
  const [ignoreTickersText, setIgnoreTickersText] = useState<string>("");
  const [tickersText, setTickersText] = useState<string>("");
  const [benchTickersText, setBenchTickersText] = useState<string>("");
  const [sideFilter, setSideFilter] = useState<"" | "Long" | "Short">("");
  const [selExchanges, setSelExchanges] = useState<Set<string>>(new Set());
  const [selCountries, setSelCountries] = useState<Set<string>>(new Set());
  const [selSectors, setSelSectors] = useState<Set<string>>(new Set());
  const [countryEnabled, setCountryEnabled] = useState<TriMode>("off");
  const [exchangeEnabled, setExchangeEnabled] = useState<TriMode>("off");
  const [sectorEnabled, setSectorEnabled] = useState<TriMode>("off");
  const [scopeBenchText, setScopeBenchText] = useState<string>("");
  const [imbExchsText, setImbExchsText] = useState<string>("");
  const [minTierBp, setMinTierBp] = useState<string>("");
  const [maxTierBp, setMaxTierBp] = useState<string>("");
  const [minCorr, setMinCorr] = useState<string>("");
  const [maxCorr, setMaxCorr] = useState<string>("");
  const [minBeta, setMinBeta] = useState<string>("");
  const [maxBeta, setMaxBeta] = useState<string>("");
  const [minSigma, setMinSigma] = useState<string>("");
  const [maxSigma, setMaxSigma] = useState<string>("");
  const [minMarketCapM, setMinMarketCapM] = useState<string>("1000");
  const [maxMarketCapM, setMaxMarketCapM] = useState<string>("");
  const [minRoundLot, setMinRoundLot] = useState<string>("");
  const [maxRoundLot, setMaxRoundLot] = useState<string>("");
  const [minAdv20, setMinAdv20] = useState<string>("");
  const [maxAdv20, setMaxAdv20] = useState<string>("");
  const [minAdv20NF, setMinAdv20NF] = useState<string>("");
  const [maxAdv20NF, setMaxAdv20NF] = useState<string>("");
  const [minAdv90, setMinAdv90] = useState<string>("");
  const [maxAdv90, setMaxAdv90] = useState<string>("");
  const [minAdv90NF, setMinAdv90NF] = useState<string>("10000000");
  const [maxAdv90NF, setMaxAdv90NF] = useState<string>("");
  const [minPreMktVol, setMinPreMktVol] = useState<string>("");
  const [maxPreMktVol, setMaxPreMktVol] = useState<string>("");
  const [minPreMktVolNF, setMinPreMktVolNF] = useState<string>("");
  const [maxPreMktVolNF, setMaxPreMktVolNF] = useState<string>("");
  const [minSpread, setMinSpread] = useState<string>("");
  const [maxSpread, setMaxSpread] = useState<string>("");
  const [minSpreadBps, setMinSpreadBps] = useState<string>("");
  const [maxSpreadBps, setMaxSpreadBps] = useState<string>("");
  const [minGap, setMinGap] = useState<string>("");
  const [maxGap, setMaxGap] = useState<string>("");
  const [minGapPct, setMinGapPct] = useState<string>("");
  const [maxGapPct, setMaxGapPct] = useState<string>("");
  const [minClsToClsPct, setMinClsToClsPct] = useState<string>("");
  const [maxClsToClsPct, setMaxClsToClsPct] = useState<string>("");
  const [minVWAP, setMinVWAP] = useState<string>("");
  const [maxVWAP, setMaxVWAP] = useState<string>("");
  const [minLo, setMinLo] = useState<string>("");
  const [maxLo, setMaxLo] = useState<string>("");
  const [minAvPreMhv, setMinAvPreMhv] = useState<string>("");
  const [maxAvPreMhv, setMaxAvPreMhv] = useState<string>("");
  const [minLstPrcL, setMinLstPrcL] = useState<string>("");
  const [maxLstPrcL, setMaxLstPrcL] = useState<string>("");
  const [minLstCls, setMinLstCls] = useState<string>("");
  const [maxLstCls, setMaxLstCls] = useState<string>("");
  const [minYCls, setMinYCls] = useState<string>("");
  const [maxYCls, setMaxYCls] = useState<string>("");
  const [minTCls, setMinTCls] = useState<string>("");
  const [maxTCls, setMaxTCls] = useState<string>("");
  const [minLstClsNewsCnt, setMinLstClsNewsCnt] = useState<string>("");
  const [maxLstClsNewsCnt, setMaxLstClsNewsCnt] = useState<string>("");
  const [minVolNFfromLstCls, setMinVolNFfromLstCls] = useState<string>("");
  const [maxVolNFfromLstCls, setMaxVolNFfromLstCls] = useState<string>("");
  const [minAvPostMhVol90NF, setMinAvPostMhVol90NF] = useState<string>("");
  const [maxAvPostMhVol90NF, setMaxAvPostMhVol90NF] = useState<string>("");
  const [minVolRel, setMinVolRel] = useState<string>("");
  const [maxVolRel, setMaxVolRel] = useState<string>("");
  const [minPreMhBidLstPrcPct, setMinPreMhBidLstPrcPct] = useState<string>("");
  const [maxPreMhBidLstPrcPct, setMaxPreMhBidLstPrcPct] = useState<string>("");
  const [minPreMhLoLstPrcPct, setMinPreMhLoLstPrcPct] = useState<string>("");
  const [maxPreMhLoLstPrcPct, setMaxPreMhLoLstPrcPct] = useState<string>("");
  const [minPreMhHiLstClsPct, setMinPreMhHiLstClsPct] = useState<string>("");
  const [maxPreMhHiLstClsPct, setMaxPreMhHiLstClsPct] = useState<string>("");
  const [minPreMhLoLstClsPct, setMinPreMhLoLstClsPct] = useState<string>("");
  const [maxPreMhLoLstClsPct, setMaxPreMhLoLstClsPct] = useState<string>("");
  const [minLstPrcLstClsPct, setMinLstPrcLstClsPct] = useState<string>("");
  const [maxLstPrcLstClsPct, setMaxLstPrcLstClsPct] = useState<string>("");
  const [minImbExch925, setMinImbExch925] = useState<string>("");
  const [maxImbExch925, setMaxImbExch925] = useState<string>("");
  const [minImbExch1555, setMinImbExch1555] = useState<string>("");
  const [maxImbExch1555, setMaxImbExch1555] = useState<string>("");
  const [requireHasNews, setRequireHasNews] = useState<boolean>(false);
  const [excludeHasNews, setExcludeHasNews] = useState<boolean>(false);
  const [requireHasReport, setRequireHasReport] = useState<boolean>(false);
  const [excludeHasReport, setExcludeHasReport] = useState<boolean>(false);
  const [minNewsCnt, setMinNewsCnt] = useState<string>("");
  const [maxNewsCnt, setMaxNewsCnt] = useState<string>("");
  const [requireIsPTP, setRequireIsPTP] = useState<boolean>(false);
  const [requireIsSSR, setRequireIsSSR] = useState<boolean>(false);
  const [requireIsETF, setRequireIsETF] = useState<boolean>(false);
  const [requireIsCrap, setRequireIsCrap] = useState<boolean>(false);
  const [excludeDividend, setExcludeDividend] = useState<boolean>(false);
  const [excludePTP, setExcludePTP] = useState<boolean>(false);
  const [excludeSSR, setExcludeSSR] = useState<boolean>(false);
  const [excludeETF, setExcludeETF] = useState<boolean>(false);
  const [excludeCrap, setExcludeCrap] = useState<boolean>(false);
  // Borrow availability, from the B5ETB column. Three observed values: YES (available),
  // ITB, and NO (hard to borrow). ITB drops the "ITB" rows, HARD drops the "NO" rows;
  // "YES" is untouched by either.
  const [excludeItb, setExcludeItb] = useState<boolean>(false);
  const [excludeHard, setExcludeHard] = useState<boolean>(false);
  // Toggle only for now — no filter rule is wired to it yet, by request.
  const [excludeCorr, setExcludeCorr] = useState<boolean>(false);
  const [includeUSA, setIncludeUSA] = useState<boolean>(false);
  const [includeChina, setIncludeChina] = useState<boolean>(false);
  const [minMdnPreMhVol90, setMinMdnPreMhVol90] = useState<string>("");
  const [maxMdnPreMhVol90, setMaxMdnPreMhVol90] = useState<string>("");
  const [minPreMhMDV90NF, setMinPreMhMDV90NF] = useState<string>("");
  const [maxPreMhMDV90NF, setMaxPreMhMDV90NF] = useState<string>("");
  const [minPreMhMDV20NF, setMinPreMhMDV20NF] = useState<string>("");
  const [maxPreMhMDV20NF, setMaxPreMhMDV20NF] = useState<string>("");
  const [minMdnPostMhVol90NF, setMinMdnPostMhVol90NF] = useState<string>("");
  const [maxMdnPostMhVol90NF, setMaxMdnPostMhVol90NF] = useState<string>("");
  const [minAvPreMhVol90NF, setMinAvPreMhVol90NF] = useState<string>("");
  const [maxAvPreMhVol90NF, setMaxAvPreMhVol90NF] = useState<string>("");
  const [minAvPreMhValue20NF, setMinAvPreMhValue20NF] = useState<string>("");
  const [maxAvPreMhValue20NF, setMaxAvPreMhValue20NF] = useState<string>("");
  const [minAvPreMhValue90NF, setMinAvPreMhValue90NF] = useState<string>("");
  const [maxAvPreMhValue90NF, setMaxAvPreMhValue90NF] = useState<string>("");
  const [minAvgDailyValue20, setMinAvgDailyValue20] = useState<string>("");
  const [maxAvgDailyValue20, setMaxAvgDailyValue20] = useState<string>("");
  const [minAvgDailyValue90, setMinAvgDailyValue90] = useState<string>("");
  const [maxAvgDailyValue90, setMaxAvgDailyValue90] = useState<string>("");
  const [minVolatility20, setMinVolatility20] = useState<string>("");
  const [maxVolatility20, setMaxVolatility20] = useState<string>("");
  const [minVolatility90, setMinVolatility90] = useState<string>("");
  const [maxVolatility90, setMaxVolatility90] = useState<string>("");
  const [minImbARCA, setMinImbARCA] = useState<string>("");
  const [maxImbARCA, setMaxImbARCA] = useState<string>("");
  const [minImbExchValue, setMinImbExchValue] = useState<string>("");
  const [maxImbExchValue, setMaxImbExchValue] = useState<string>("");
  const [sharedRangeFilterModes, setSharedRangeFilterModes] = useState<Record<SharedRangeFilterKey, SharedRangeFilterMode>>(DEFAULT_SHARED_RANGE_FILTER_MODES);
  const [scanStartMin, setScanStartMin] = useState<number>(0.05);
  const [scanStartMax, setScanStartMax] = useState<number>(0.2);
  const [scanStartStep, setScanStartStep] = useState<number>(0.01);
  const [scanEndMin, setScanEndMin] = useState<number>(0.01);
  const [scanEndMax, setScanEndMax] = useState<number>(0.1);
  const [scanEndStep, setScanEndStep] = useState<number>(0.01);
  const [scanObjective, setScanObjective] = useState<"pnl" | "winrate">("pnl");
  const [scanTopK, setScanTopK] = useState<number>(20);
  const [scanRows, setScanRows] = useState<EpisodeScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [optimizerRows, setOptimizerRows] = useState<OptimizerResultRow[]>([]);
  const [optimizerLoading, setOptimizerLoading] = useState<boolean>(false);
  const [optimizerErr, setOptimizerErr] = useState<string | null>(null);
  const [optimizerProgress, setOptimizerProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [optimizerRanges, setOptimizerRanges] = useState<PaperArbOptimizerRangesResponse | null>(null);
  const [optimizerRangesLoading, setOptimizerRangesLoading] = useState<boolean>(false);
  const [optimizerRangesErr, setOptimizerRangesErr] = useState<string | null>(null);
  const [optimizerRangeGroupStatus, setOptimizerRangeGroupStatus] = useState<Record<OptimizerRangeGroupKey, OptimizerRangeGroupStatus>>({
    "RATING GATES": { loading: false, error: null, partial: false },
    "ZAP THRESHOLDS": { loading: false, error: null, partial: false },
    "TAPE FILTERS": { loading: false, error: null, partial: false },
  });
  const [optimizerRangeGroupHidden, setOptimizerRangeGroupHidden] = useState<Record<OptimizerRangeGroupKey, boolean>>({
    "RATING GATES": true,
    "ZAP THRESHOLDS": true,
    "TAPE FILTERS": true,
  });
  const [optimizerStatsHidden, setOptimizerStatsHidden] = useState<boolean>(true);
  const [scopeSelectedParameterKeys, setScopeSelectedParameterKeys] = useState<string[]>([]);
  const [scopeParameterGroupExpanded, setScopeParameterGroupExpanded] = useState<Record<string, boolean>>({});
  const [optimizerRangeRankMetric, setOptimizerRangeRankMetric] = useState<OptimizerRangeRankMetric>("avgPnlUsd");
  const [optimizerRangeMinTrades, setOptimizerRangeMinTrades] = useState<number>(25);
  const [optimizerBucketCount, setOptimizerBucketCount] = useState<number>(8);
  // How those bins are cut — equal trades (default) or equal loss. See ScopeOptimizerBinMode.
  const [optimizerBinMode, setOptimizerBinMode] = useState<ScopeOptimizerBinMode>("trades");
  const [scopeResearchDrafts, setScopeResearchDrafts] = useState<Record<ScopePanelKey, ScopeResearchDraft>>(options.strategy?.defaultScopeDrafts ?? ({} as Record<ScopePanelKey, ScopeResearchDraft>));
  const [scopeResearchSelections, setScopeResearchSelections] = useState<Record<ScopePanelKey, ScopeResearchSelection | null>>({
    left: null,
    right: null,
  });
  const [scopeFullscreenPanel, setScopeFullscreenPanel] = useState<ScopePanelKey | null>(null);
  const [scopeResearchFiltersHidden, setScopeResearchFiltersHidden] = useState<
    Record<ScopePanelKey, { extra: boolean; parallel: boolean }>
  >({
    left: { extra: false, parallel: false },
    right: { extra: false, parallel: false },
  });
  const [arbitrageTickerMetaByTicker, setArbitrageTickerMetaByTicker] = useState<
    Record<string, { corr?: number | null; beta?: number | null; sigma?: number | null; sectorL3?: string | null; benchTicker?: string | null }>
  >({});
  const [arbitrageTickerMetaLoading, setArbitrageTickerMetaLoading] = useState<boolean>(false);
  const [streamAutoStartLocked, setStreamAutoStartLocked] = useState<boolean>(false);
  const [streamAutomationTogglePending, setStreamAutomationTogglePending] = useState<null | "start" | "stop">(null);
  const [streamWindowCaptureBusy, setStreamWindowCaptureBusy] = useState<boolean>(false);

  return {
    internalTab, setInternalTab,
    internalRuleBand, setInternalRuleBand,
    zapMode, setZapMode,
    showSharedMinMax, setShowSharedMinMax,
    days, setDays,
    dateMode, setDateMode,
    dateNy, setDateNy,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    rangePreset, setRangePreset,
    internalSession, setInternalSession,
    metric, setMetric,
    closeMode, setCloseMode,
    startAbs, setStartAbs,
    startAbsMax, setStartAbsMax,
    endAbs, setEndAbs,
    minHoldCandles, setMinHoldCandles,
    startCutoffTime, setStartCutoffTime,
    preStartTime, setPreStartTime,
    pnlMode, setPnlMode,
    priceMode, setPriceMode,
    sizingMode, setSizingMode,
    sizeValue, setSizeValue,
    dilutionMode, setDilutionMode,
    dilutionStep, setDilutionStep,
    maxAdds, setMaxAdds,
    addDelayMinutes, setAddDelayMinutes,
    includeEquityCurve, setIncludeEquityCurve,
    equityCurveMode, setEquityCurveMode,
    topN, setTopN,
    scopeMode, setScopeMode,
    offset, setOffset,
    qTicker, setQTicker,
    qSide, setQSide,
    streamSortKey, setStreamSortKey,
    activeRows, setActiveRows,
    episodesRows, setEpisodesRows,
    analytics, setAnalytics,
    loading, setLoading,
    err, setErr,
    updatedAt, setUpdatedAt,
    listMode, setListMode,
    showIgnore, setShowIgnore,
    showApply, setShowApply,
    showPin, setShowPin,
    showPresets, setShowPresets,
    scannerPresets, setScannerPresets,
    scannerPresetBusy, setScannerPresetBusy,
    scannerPresetSaveMode, setScannerPresetSaveMode,
    scannerPresetDraftName, setScannerPresetDraftName,
    scannerPresetStatus, setScannerPresetStatus,
    episodesSort, setEpisodesSort,
    analyticsSort, setAnalyticsSort,
    showAdvanced, setShowAdvanced,
    ratingMode, setRatingMode,
    topMode, setTopMode,
    topSigmaOn, setTopSigmaOn,
    topBenchOn, setTopBenchOn,
    topTimeOn, setTopTimeOn,
    ratingType, setRatingType,
    ratingRules, setRatingRules,
    ratingEnabledBands, setRatingEnabledBands,
    ignoreTickersText, setIgnoreTickersText,
    tickersText, setTickersText,
    benchTickersText, setBenchTickersText,
    sideFilter, setSideFilter,
    selExchanges, setSelExchanges,
    selCountries, setSelCountries,
    selSectors, setSelSectors,
    countryEnabled, setCountryEnabled,
    exchangeEnabled, setExchangeEnabled,
    sectorEnabled, setSectorEnabled,
    scopeBenchText, setScopeBenchText,
    imbExchsText, setImbExchsText,
    minTierBp, setMinTierBp,
    maxTierBp, setMaxTierBp,
    minCorr, setMinCorr,
    maxCorr, setMaxCorr,
    minBeta, setMinBeta,
    maxBeta, setMaxBeta,
    minSigma, setMinSigma,
    maxSigma, setMaxSigma,
    minMarketCapM, setMinMarketCapM,
    maxMarketCapM, setMaxMarketCapM,
    minRoundLot, setMinRoundLot,
    maxRoundLot, setMaxRoundLot,
    minAdv20, setMinAdv20,
    maxAdv20, setMaxAdv20,
    minAdv20NF, setMinAdv20NF,
    maxAdv20NF, setMaxAdv20NF,
    minAdv90, setMinAdv90,
    maxAdv90, setMaxAdv90,
    minAdv90NF, setMinAdv90NF,
    maxAdv90NF, setMaxAdv90NF,
    minPreMktVol, setMinPreMktVol,
    maxPreMktVol, setMaxPreMktVol,
    minPreMktVolNF, setMinPreMktVolNF,
    maxPreMktVolNF, setMaxPreMktVolNF,
    minSpread, setMinSpread,
    maxSpread, setMaxSpread,
    minSpreadBps, setMinSpreadBps,
    maxSpreadBps, setMaxSpreadBps,
    minGap, setMinGap,
    maxGap, setMaxGap,
    minGapPct, setMinGapPct,
    maxGapPct, setMaxGapPct,
    minClsToClsPct, setMinClsToClsPct,
    maxClsToClsPct, setMaxClsToClsPct,
    minVWAP, setMinVWAP,
    maxVWAP, setMaxVWAP,
    minLo, setMinLo,
    maxLo, setMaxLo,
    minAvPreMhv, setMinAvPreMhv,
    maxAvPreMhv, setMaxAvPreMhv,
    minLstPrcL, setMinLstPrcL,
    maxLstPrcL, setMaxLstPrcL,
    minLstCls, setMinLstCls,
    maxLstCls, setMaxLstCls,
    minYCls, setMinYCls,
    maxYCls, setMaxYCls,
    minTCls, setMinTCls,
    maxTCls, setMaxTCls,
    minLstClsNewsCnt, setMinLstClsNewsCnt,
    maxLstClsNewsCnt, setMaxLstClsNewsCnt,
    minVolNFfromLstCls, setMinVolNFfromLstCls,
    maxVolNFfromLstCls, setMaxVolNFfromLstCls,
    minAvPostMhVol90NF, setMinAvPostMhVol90NF,
    maxAvPostMhVol90NF, setMaxAvPostMhVol90NF,
    minVolRel, setMinVolRel,
    maxVolRel, setMaxVolRel,
    minPreMhBidLstPrcPct, setMinPreMhBidLstPrcPct,
    maxPreMhBidLstPrcPct, setMaxPreMhBidLstPrcPct,
    minPreMhLoLstPrcPct, setMinPreMhLoLstPrcPct,
    maxPreMhLoLstPrcPct, setMaxPreMhLoLstPrcPct,
    minPreMhHiLstClsPct, setMinPreMhHiLstClsPct,
    maxPreMhHiLstClsPct, setMaxPreMhHiLstClsPct,
    minPreMhLoLstClsPct, setMinPreMhLoLstClsPct,
    maxPreMhLoLstClsPct, setMaxPreMhLoLstClsPct,
    minLstPrcLstClsPct, setMinLstPrcLstClsPct,
    maxLstPrcLstClsPct, setMaxLstPrcLstClsPct,
    minImbExch925, setMinImbExch925,
    maxImbExch925, setMaxImbExch925,
    minImbExch1555, setMinImbExch1555,
    maxImbExch1555, setMaxImbExch1555,
    requireHasNews, setRequireHasNews,
    excludeHasNews, setExcludeHasNews,
    requireHasReport, setRequireHasReport,
    excludeHasReport, setExcludeHasReport,
    minNewsCnt, setMinNewsCnt,
    maxNewsCnt, setMaxNewsCnt,
    requireIsPTP, setRequireIsPTP,
    requireIsSSR, setRequireIsSSR,
    requireIsETF, setRequireIsETF,
    requireIsCrap, setRequireIsCrap,
    excludeDividend, setExcludeDividend,
    excludePTP, setExcludePTP,
    excludeSSR, setExcludeSSR,
    excludeETF, setExcludeETF,
    excludeCrap, setExcludeCrap,
    excludeItb, setExcludeItb,
    excludeHard, setExcludeHard,
    excludeCorr, setExcludeCorr,
    includeUSA, setIncludeUSA,
    includeChina, setIncludeChina,
    minMdnPreMhVol90, setMinMdnPreMhVol90,
    maxMdnPreMhVol90, setMaxMdnPreMhVol90,
    minPreMhMDV90NF, setMinPreMhMDV90NF,
    maxPreMhMDV90NF, setMaxPreMhMDV90NF,
    minPreMhMDV20NF, setMinPreMhMDV20NF,
    maxPreMhMDV20NF, setMaxPreMhMDV20NF,
    minMdnPostMhVol90NF, setMinMdnPostMhVol90NF,
    maxMdnPostMhVol90NF, setMaxMdnPostMhVol90NF,
    minAvPreMhVol90NF, setMinAvPreMhVol90NF,
    maxAvPreMhVol90NF, setMaxAvPreMhVol90NF,
    minAvPreMhValue20NF, setMinAvPreMhValue20NF,
    maxAvPreMhValue20NF, setMaxAvPreMhValue20NF,
    minAvPreMhValue90NF, setMinAvPreMhValue90NF,
    maxAvPreMhValue90NF, setMaxAvPreMhValue90NF,
    minAvgDailyValue20, setMinAvgDailyValue20,
    maxAvgDailyValue20, setMaxAvgDailyValue20,
    minAvgDailyValue90, setMinAvgDailyValue90,
    maxAvgDailyValue90, setMaxAvgDailyValue90,
    minVolatility20, setMinVolatility20,
    maxVolatility20, setMaxVolatility20,
    minVolatility90, setMinVolatility90,
    maxVolatility90, setMaxVolatility90,
    minImbARCA, setMinImbARCA,
    maxImbARCA, setMaxImbARCA,
    minImbExchValue, setMinImbExchValue,
    maxImbExchValue, setMaxImbExchValue,
    sharedRangeFilterModes, setSharedRangeFilterModes,
    scanStartMin, setScanStartMin,
    scanStartMax, setScanStartMax,
    scanStartStep, setScanStartStep,
    scanEndMin, setScanEndMin,
    scanEndMax, setScanEndMax,
    scanEndStep, setScanEndStep,
    scanObjective, setScanObjective,
    scanTopK, setScanTopK,
    scanRows, setScanRows,
    scanLoading, setScanLoading,
    scanErr, setScanErr,
    scanProgress, setScanProgress,
    optimizerRows, setOptimizerRows,
    optimizerLoading, setOptimizerLoading,
    optimizerErr, setOptimizerErr,
    optimizerProgress, setOptimizerProgress,
    optimizerRanges, setOptimizerRanges,
    optimizerRangesLoading, setOptimizerRangesLoading,
    optimizerRangesErr, setOptimizerRangesErr,
    optimizerRangeGroupStatus, setOptimizerRangeGroupStatus,
    optimizerRangeGroupHidden, setOptimizerRangeGroupHidden,
    optimizerStatsHidden, setOptimizerStatsHidden,
    scopeSelectedParameterKeys, setScopeSelectedParameterKeys,
    scopeParameterGroupExpanded, setScopeParameterGroupExpanded,
    optimizerRangeRankMetric, setOptimizerRangeRankMetric,
    optimizerRangeMinTrades, setOptimizerRangeMinTrades,
    optimizerBucketCount, setOptimizerBucketCount,
    optimizerBinMode, setOptimizerBinMode,
    scopeResearchDrafts, setScopeResearchDrafts,
    scopeResearchSelections, setScopeResearchSelections,
    scopeFullscreenPanel, setScopeFullscreenPanel,
    scopeResearchFiltersHidden, setScopeResearchFiltersHidden,
    arbitrageTickerMetaByTicker, setArbitrageTickerMetaByTicker,
    arbitrageTickerMetaLoading, setArbitrageTickerMetaLoading,
    streamAutoStartLocked, setStreamAutoStartLocked,
    streamAutomationTogglePending, setStreamAutomationTogglePending,
    streamWindowCaptureBusy, setStreamWindowCaptureBusy,
  };
}
