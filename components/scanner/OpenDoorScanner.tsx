"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { todayNyYmd } from "../../lib/time";
import { useScannerFilters } from "../../lib/scanner/useScannerFilters";
import { usePersistedFilters } from "../../lib/scanner/usePersistedFilters";
import { useFilterRestore } from "../../lib/scanner/useFilterRestore";
import { useEpisodesSearchCache } from "../../lib/scanner/useEpisodesSearchCache";
import { getToken } from "../../lib/authClient";
import { bridgeUrl, getBridgeBaseUrl } from "../../lib/bridgeBase";
import { getArbitrageList, getOpendoorList } from "../../lib/trapClient";
import { pushOpenDoorLiveParams, toOpenDoorLiveFilters } from "../../lib/opendoor/liveParamsClient";
import { useUi } from "../UiProvider";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND, SHARED_FILTER_PRESET_FIELDS, isSharedFilterPreset } from "../../lib/presets/sharedFilterPreset";
import { SHARED_FILTER_PRESETS_CHANGED_EVENT, deleteSharedFilterLocalPreset, getSharedFilterLocalPreset, listSharedFilterLocalPresets, saveSharedFilterLocalPreset } from "../../lib/presets/sharedFilterLocalPresets";
import type { PresetDto } from "../../types/presets";
import type { ArbitrageFilterConfigV1 } from "../../lib/filters/arbitrageFilterConfigV1";
import OpenDoorStreamView from "../stream/OpenDoorStream";
import { useStreamExecutionSnapshot } from "../stream/streamExecutionStore";
import { useStreamPositionMeta } from "../stream/streamPositionStore";
import { useStreamSignalMeta } from "../stream/streamSignalStore";
import { buildStreamFilterConfig, toPreRelativeMinutes, type StreamAutomationConfig, type StreamExecutionDescriptor, useStreamEngine } from "../stream/streamEngine";
import { passesStreamRatingFilter } from "../../lib/arbitrage/ratingFilter";
import { downloadFilterPassLog, useStreamFilterPassLogCount } from "../stream/streamFilterPassLogStore";
import { useStreamStores } from "../stream/streamStoreRegistry";
import { useStreamInstance } from "../stream/streamInstance";
import { matchOpenDoorGate, readOpenDoorGateValues } from "@/lib/opendoor/gate";

// OpenDoor evaluates CLEAN data: no Arbitrage rating floor anywhere in the path. The only rating
// that may reject a ticker is OpenDoor's own per-bin table from its summary.csv (lib/opendoor/gate).
// cls still selects which class the server attaches `best` values from, but with a zero floor it
// cannot reject anything — it only labels.
const OPEN_DOOR_CLS = "global";
const OPEN_DOOR_NO_ARB_RATE = 0;
const OPEN_DOOR_NO_ARB_TOTAL = 0;
import type { SonarExactFilterSnapshot } from "../sonar/OpenDoorSonar";
import { useTapeMeta } from "./tapeMetaStore";
import { GlitchTitle } from "../ui/GlitchTitle";
import clsx from "clsx";
import { parseSessionDay, rowReportAffectsSession } from "../../lib/filters/reportTiming";
import { rowExcludedByBorrow } from "../../lib/filters/borrow";
import {
  SECTOR_CORR_DEFAULT,
  SECTOR_CORR_MAX,
  SECTOR_CORR_MIN,
  clampSectorCorrThreshold,
  parseSectorCorrThreshold,
  rowExcludedByCorr,
  useSectorCorrExclusion,
} from "../../lib/filters/sectorCorr";

import { EPISODES_SEARCH_CACHE_MAX, EPISODES_SEARCH_CACHE_TTL_MS, apiGet, apiPost, apiPostWithTimeout, apiUrl, buildPaperQuery, loadDaysApi, normalizeRows, normalizeRowsWithBestParams } from "../../lib/scanner/api";
import { downloadEpisodesCsv } from "../../lib/scanner/csv";
import { buildRangeValues, clampInt, clampNumber, fmtHms, formatDilutionStepValue, formatScannerSizeValue, intn, minuteIdxToClockLabel, normalizeDilutionStepValue, normalizeMaxAddsValue, normalizeScannerSizeValue, normalizeSide, num, numOrNull, numSpaced, optNumOrNull, parseTickersFromCsv, splitListUpper, stepDilutionStepValue, stepScannerSizeValue, tickerKey, toYmd } from "../../lib/scanner/format";
import { scannerRealtimePnlUsd, scannerTickerAmountUsd } from "../../lib/scanner/pnl";
import { PAPER_ARB_RATING_BANDS, normalizePaperArbRatingRules, passesDeltaZapGate, passesScannerBinRatingFilter, ratingBandFromSession, scannerBinFilterEnabled, scannerCurrentTimeBand, scannerSigBinSnapshot, scannerTopWindowSnapshot } from "../../lib/scanner/rating";
import { buildScopeResearchSelectionFromDraft, computeScopeResearch, getEpisodeDateKey, scopeResearchFormatValue, scopeResearchMetricValue, scopeResearchOptionByValue, scopeResearchParameterValue, scopeResearchSummarize } from "../../lib/scanner/scopeCompute";
import { buildCategoricalOptimizerParameter, buildFallbackBinRatingOptimizerParameter, buildFallbackOptimizerParameter, buildFallbackScopeOptimizerParameter, getOptimizerFallbackValue, optimizerKeyToScopeResearchParameterKey, scoreTailDamage } from "../../lib/scanner/scopeOptimizer";
import { DEFAULT_SHARED_RANGE_FILTER_MODES, OPTIMIZER_GROUP_DISPLAY_LABELS, SCOPE_BIN_MODE_OPTIONS, SCOPE_PARAMETER_BY_KEY, SCOPE_PARAMETER_DEFINITIONS, SCOPE_PARAMETER_SELECT_GROUPS, STREAM_SORT_KEY_OPTIONS } from "../../lib/scanner/scopeParameters";
import { SCOPE_OPTIMIZER_MAX_BINS, SCOPE_OPTIMIZER_MIN_BINS } from "../../lib/scanner/types";
import type { DateMode, EpisodeScanResult, EpisodeSortKey, OptimizerImpactRow, OptimizerRangeGroupKey, OptimizerRangeGroupStatus, OptimizerRangeRankMetric, OptimizerResultRow, OptimizerScenario, PaperArbActiveRow, PaperArbAnalyticsRequest, PaperArbAnalyticsResponse, PaperArbCloseMode, PaperArbClosedDto, PaperArbDilutionMode, PaperArbEquityPointDto, PaperArbMetric, PaperArbOptimizerParameterDto, PaperArbOptimizerRangeBucketDto, PaperArbOptimizerRangesResponse, PaperArbPnlMode, PaperArbPriceMode, PaperArbRatingBand, PaperArbRatingMode, PaperArbRatingRule, PaperArbRatingType, PaperArbSession, PaperArbSizingMode, PaperListMode, PrimaryPanelKey, ScopeBatchResponse, ScopeBatchScenarioRequest, ScopePanelKey, ScopeOptimizerBinMode, ScopeParameterDefinition, ScopeResearchChartType, ScopeResearchComputed, ScopeResearchDraft, ScopeResearchParameterKey, ScopeResearchResultKey, ScopeResearchSelection, ScopeResearchThresholdMode, SharedRangeFilterKey, SharedRangeFilterMode, SortDir, TabKey, TriMode, ZapMode } from "../../lib/scanner/types";
import { EquityChart, OptimizerDualMetricChart, OptimizerParameterRangeCard, ScopeResearchBoxChart, ScopeResearchCumsumChart, ScopeResearchDistributionChart, ScopeResearchScatterByDateChart, ScopeResearchSeriesChart, ScopeResearchTradePerformanceChart, ScopeResearchViolinChart } from "./shared/charts";
import { SCANNER_EYE_BUTTON, SCANNER_PANEL_SURFACE, SOFT_LOSS_TEXT_CLASS, STREAM_FIXED_ACTIVE_SOFT, STREAM_FIXED_ACTIVE_TEXT, STREAM_FIXED_ICON_GREEN } from "./shared/styles";
import { BookLevelsIcon, CrosshairIcon, EyeToggleIcon, GlassCard, GlassInput, GlassSelect, LockToggleIcon, MinMaxRow, MultiSelectFilter, SummaryMetricCard } from "./shared/ui";
import { defineScannerStrategy } from "../../lib/scanner/strategy";
import { ScannerTableStyles, ScannerThemeStyles } from "./shared/ScannerGlobalStyles";
import ScannerHeader from "./shell/panels/ScannerHeader";
import ActiveTickerCard from "../shared/filters/ActiveTickerCard";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { useActiveTickerSelection, useActiveTickerSnapshot } from "../../lib/filters/activeTicker";
import SharedMinMaxPanel from "./shell/panels/SharedMinMaxPanel";
import TickerListDrawers from "./shell/panels/TickerListDrawers";
import ExecutionSettingsPanel from "./shell/panels/ExecutionSettingsPanel";
import OpenDoorGatesRow, { EMPTY_ENTRY_BOUNDS, type OpenDoorEntryBounds } from "./shell/panels/OpenDoorGatesRow";
// OpenDoor tracks no sigma metric and no peak (the mapper leaves those slots null and
// MinHoldCandles is a constant 0), and it has no hedge leg — so those research axes and result
// metrics are excluded rather than rendering empty charts that look like a bug.
const STRATEGY = defineScannerStrategy({
  key: "opendoor",
  excludeScopeParameters: [
    "startMetricAbs", "peakMetricAbs", "endMetricAbs",
    "reversionAbs", "reversionPct",
    "peakMinuteIdx", "timeToPeak",
    "minHoldCandles",
  ],
  excludeScopeResults: ["benchPnlUsd", "hedgedPnlUsd", "peakMetricAbs", "endMetricAbs"],
  defaultScopeAxes: { left: "rating", right: "spread" },
  // OpenDoor has no |sigma| to look a bin up by, so the RATING GATES axes read the rate/total the
  // gate already resolved onto the episode — which is the traded side's, so long and short share
  // one field. With the default "sigma-bin" source those two axes were silently empty.
  ratingBinSource: "episode",
});

// =========================
// MAIN PAGE
// =========================
type ArbitrageScannerProps = {
  initialPrimaryPanel?: PrimaryPanelKey;
  shellMode?: "full" | "streamOnly";
  controlledTab?: TabKey;
  onControlledTabChange?: (tab: TabKey) => void;
  controlledSession?: PaperArbSession;
  onControlledSessionChange?: (session: PaperArbSession) => void;
  controlledRuleBand?: PaperArbRatingBand;
  onControlledRuleBandChange?: (band: PaperArbRatingBand) => void;
  streamExecutionDescriptorOverride?: StreamExecutionDescriptor;
  streamAutomationConfigOverride?: StreamAutomationConfig;
  streamAutoStartEnabledOverride?: boolean;
  streamAutoEnabledOverride?: boolean;
  streamViewModeOverride?: "stream" | "auto" | "stream-auto-tab";
  onStreamAutomationConfigChange?: (patch: Partial<StreamAutomationConfig>) => void;
  onStreamAutoEnabledChange?: (enabled: boolean) => void;
  headerTitleOverride?: string;
  headerBadgeValuesOverride?: string[];
  headerMetaLabelOverride?: string;
  headerMinimal?: boolean;
  activeTabLabelOverride?: string;
  episodesTabLabelOverride?: string;
  analyticsTabLabelOverride?: string;
  onStreamShellStatsChange?: (stats: {
    signals: number;
    ready: number;
    open: number;
    autoEnabled: boolean;
  }) => void;
  onSharedRatingRulesChange?: (rules: Array<{ band: PaperArbRatingBand; minRate: number; minTotal: number }>) => void;
  lsKeyPrefix?: string;
  navStreamHref?: string;
  navScannerHref?: string;
  navSonarHref?: string;
};

const ACTIVE_TICKER_STRATEGY = "opendoor" as const;

export default function OpenDoorScanner({
  initialPrimaryPanel = "scanner",
  shellMode = "full",
  controlledTab,
  onControlledTabChange,
  controlledSession,
  onControlledSessionChange,
  controlledRuleBand,
  onControlledRuleBandChange,
  streamExecutionDescriptorOverride,
  streamAutomationConfigOverride,
  streamAutoStartEnabledOverride,
  streamAutoEnabledOverride,
  streamViewModeOverride,
  onStreamAutomationConfigChange,
  onStreamAutoEnabledChange,
  headerTitleOverride,
  headerBadgeValuesOverride,
  headerMetaLabelOverride,
  headerMinimal,
  activeTabLabelOverride,
  episodesTabLabelOverride,
  analyticsTabLabelOverride,
  onStreamShellStatsChange,
  onSharedRatingRulesChange,
  lsKeyPrefix = STRATEGY.lsKeyPrefix,
  // Routes come from the registry entry, not from literals repeated per component.
  navStreamHref = STRATEGY.nav.stream,
  navScannerHref = STRATEGY.nav.scanner,
  navSonarHref = STRATEGY.nav.sonar,
}: ArbitrageScannerProps) {
  const filtersLsKey = `${lsKeyPrefix}.filters.v1`;
  const presetIdLsKey = `${lsKeyPrefix}.shared-preset.active-id`;
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const [primaryPanel, setPrimaryPanel] = useState<PrimaryPanelKey>(() => {
    if (initialPrimaryPanel === "stream" || initialPrimaryPanel === "scanner") return initialPrimaryPanel;
    if (typeof window === "undefined") return "scanner";
    try {
      const qs = new URLSearchParams(window.location.search);
      return qs.get("panel") === "stream" ? "stream" : "scanner";
    } catch {
      return "scanner";
    }
  });
  // Shared with ArbitrageScanner and defined once in useScannerFilters. Destructured so the
  // references throughout this file stay as they were. OpenDoor's own knobs (exit class, the
  // three gates, up/down levels) stay declared below - they are this strategy's, not the shell's.
  const scannerFilters = useScannerFilters({
    strategy: STRATEGY,
    streamAutomationConfigOverride,
    startAbsDefault: 0,
  });
  const {
    internalTab,
    setInternalTab,
    internalRuleBand,
    setInternalRuleBand,
    zapMode,
    setZapMode,
    showSharedMinMax,
    setShowSharedMinMax,
    days,
    setDays,
    dateMode,
    setDateMode,
    dateNy,
    setDateNy,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    rangePreset,
    setRangePreset,
    internalSession,
    setInternalSession,
    metric,
    setMetric,
    closeMode,
    setCloseMode,
    startAbs,
    setStartAbs,
    startAbsMax,
    setStartAbsMax,
    endAbs,
    setEndAbs,
    minHoldCandles,
    setMinHoldCandles,
    startCutoffTime,
    setStartCutoffTime,
    preStartTime,
    setPreStartTime,
    pnlMode,
    setPnlMode,
    priceMode,
    setPriceMode,
    sizingMode,
    setSizingMode,
    sizeValue,
    setSizeValue,
    dilutionMode,
    setDilutionMode,
    dilutionStep,
    setDilutionStep,
    maxAdds,
    setMaxAdds,
    addDelayMinutes,
    setAddDelayMinutes,
    includeEquityCurve,
    setIncludeEquityCurve,
    equityCurveMode,
    setEquityCurveMode,
    topN,
    setTopN,
    scopeMode,
    setScopeMode,
    offset,
    setOffset,
    qTicker,
    setQTicker,
    qSide,
    setQSide,
    streamSortKey,
    setStreamSortKey,
    activeRows,
    setActiveRows,
    episodesRows,
    setEpisodesRows,
    analytics,
    setAnalytics,
    loading,
    setLoading,
    err,
    setErr,
    updatedAt,
    setUpdatedAt,
    listMode,
    setListMode,
    showIgnore,
    setShowIgnore,
    showApply,
    setShowApply,
    showPin,
    setShowPin,
    showPresets,
    setShowPresets,
    scannerPresets,
    setScannerPresets,
    scannerPresetBusy,
    setScannerPresetBusy,
    scannerPresetSaveMode,
    setScannerPresetSaveMode,
    scannerPresetDraftName,
    setScannerPresetDraftName,
    scannerPresetStatus,
    setScannerPresetStatus,
    episodesSort,
    setEpisodesSort,
    analyticsSort,
    setAnalyticsSort,
    showAdvanced,
    setShowAdvanced,
    ratingMode,
    setRatingMode,
    topMode,
    setTopMode,
    topSigmaOn,
    setTopSigmaOn,
    topBenchOn,
    setTopBenchOn,
    topTimeOn,
    setTopTimeOn,
    ratingType,
    setRatingType,
    ratingRules,
    setRatingRules,
    ratingEnabledBands,
    setRatingEnabledBands,
    ignoreTickersText,
    setIgnoreTickersText,
    tickersText,
    setTickersText,
    benchTickersText,
    setBenchTickersText,
    sideFilter,
    setSideFilter,
    selExchanges,
    setSelExchanges,
    selCountries,
    setSelCountries,
    selSectors,
    setSelSectors,
    countryEnabled,
    setCountryEnabled,
    exchangeEnabled,
    setExchangeEnabled,
    sectorEnabled,
    setSectorEnabled,
    scopeBenchText,
    setScopeBenchText,
    imbExchsText,
    setImbExchsText,
    minTierBp,
    setMinTierBp,
    maxTierBp,
    setMaxTierBp,
    minCorr,
    setMinCorr,
    maxCorr,
    setMaxCorr,
    minBeta,
    setMinBeta,
    maxBeta,
    setMaxBeta,
    minSigma,
    setMinSigma,
    maxSigma,
    setMaxSigma,
    minMarketCapM,
    setMinMarketCapM,
    maxMarketCapM,
    setMaxMarketCapM,
    minRoundLot,
    setMinRoundLot,
    maxRoundLot,
    setMaxRoundLot,
    minAdv20,
    setMinAdv20,
    maxAdv20,
    setMaxAdv20,
    minAdv20NF,
    setMinAdv20NF,
    maxAdv20NF,
    setMaxAdv20NF,
    minAdv90,
    setMinAdv90,
    maxAdv90,
    setMaxAdv90,
    minAdv90NF,
    setMinAdv90NF,
    maxAdv90NF,
    setMaxAdv90NF,
    minPreMktVol,
    setMinPreMktVol,
    maxPreMktVol,
    setMaxPreMktVol,
    minPreMktVolNF,
    setMinPreMktVolNF,
    maxPreMktVolNF,
    setMaxPreMktVolNF,
    minSpread,
    setMinSpread,
    maxSpread,
    setMaxSpread,
    minSpreadBps,
    setMinSpreadBps,
    maxSpreadBps,
    setMaxSpreadBps,
    minGap,
    setMinGap,
    maxGap,
    setMaxGap,
    minGapPct,
    setMinGapPct,
    maxGapPct,
    setMaxGapPct,
    minClsToClsPct,
    setMinClsToClsPct,
    maxClsToClsPct,
    setMaxClsToClsPct,
    minVWAP,
    setMinVWAP,
    maxVWAP,
    setMaxVWAP,
    minLo,
    setMinLo,
    maxLo,
    setMaxLo,
    minAvPreMhv,
    setMinAvPreMhv,
    maxAvPreMhv,
    setMaxAvPreMhv,
    minLstPrcL,
    setMinLstPrcL,
    maxLstPrcL,
    setMaxLstPrcL,
    minLstCls,
    setMinLstCls,
    maxLstCls,
    setMaxLstCls,
    minYCls,
    setMinYCls,
    maxYCls,
    setMaxYCls,
    minTCls,
    setMinTCls,
    maxTCls,
    setMaxTCls,
    minLstClsNewsCnt,
    setMinLstClsNewsCnt,
    maxLstClsNewsCnt,
    setMaxLstClsNewsCnt,
    minVolNFfromLstCls,
    setMinVolNFfromLstCls,
    maxVolNFfromLstCls,
    setMaxVolNFfromLstCls,
    minAvPostMhVol90NF,
    setMinAvPostMhVol90NF,
    maxAvPostMhVol90NF,
    setMaxAvPostMhVol90NF,
    minVolRel,
    setMinVolRel,
    maxVolRel,
    setMaxVolRel,
    minPreMhBidLstPrcPct,
    setMinPreMhBidLstPrcPct,
    maxPreMhBidLstPrcPct,
    setMaxPreMhBidLstPrcPct,
    minPreMhLoLstPrcPct,
    setMinPreMhLoLstPrcPct,
    maxPreMhLoLstPrcPct,
    setMaxPreMhLoLstPrcPct,
    minPreMhHiLstClsPct,
    setMinPreMhHiLstClsPct,
    maxPreMhHiLstClsPct,
    setMaxPreMhHiLstClsPct,
    minPreMhLoLstClsPct,
    setMinPreMhLoLstClsPct,
    maxPreMhLoLstClsPct,
    setMaxPreMhLoLstClsPct,
    minLstPrcLstClsPct,
    setMinLstPrcLstClsPct,
    maxLstPrcLstClsPct,
    setMaxLstPrcLstClsPct,
    minImbExch925,
    setMinImbExch925,
    maxImbExch925,
    setMaxImbExch925,
    minImbExch1555,
    setMinImbExch1555,
    maxImbExch1555,
    setMaxImbExch1555,
    requireHasNews,
    setRequireHasNews,
    excludeHasNews,
    setExcludeHasNews,
    requireHasReport,
    setRequireHasReport,
    excludeHasReport,
    setExcludeHasReport,
    minNewsCnt,
    setMinNewsCnt,
    maxNewsCnt,
    setMaxNewsCnt,
    requireIsPTP,
    setRequireIsPTP,
    requireIsSSR,
    setRequireIsSSR,
    requireIsETF,
    setRequireIsETF,
    requireIsCrap,
    setRequireIsCrap,
    excludeDividend,
    setExcludeDividend,
    excludePTP,
    setExcludePTP,
    excludeSSR,
    setExcludeSSR,
    excludeETF,
    setExcludeETF,
    excludeCrap,
    excludeItb, setExcludeItb,
    excludeHard, setExcludeHard,
    excludeCorr, setExcludeCorr,
    setExcludeCrap,
    includeUSA,
    setIncludeUSA,
    includeChina,
    setIncludeChina,
    minMdnPreMhVol90,
    setMinMdnPreMhVol90,
    maxMdnPreMhVol90,
    setMaxMdnPreMhVol90,
    minPreMhMDV90NF,
    setMinPreMhMDV90NF,
    maxPreMhMDV90NF,
    setMaxPreMhMDV90NF,
    minPreMhMDV20NF,
    setMinPreMhMDV20NF,
    maxPreMhMDV20NF,
    setMaxPreMhMDV20NF,
    minMdnPostMhVol90NF,
    setMinMdnPostMhVol90NF,
    maxMdnPostMhVol90NF,
    setMaxMdnPostMhVol90NF,
    minAvPreMhVol90NF,
    setMinAvPreMhVol90NF,
    maxAvPreMhVol90NF,
    setMaxAvPreMhVol90NF,
    minAvPreMhValue20NF,
    setMinAvPreMhValue20NF,
    maxAvPreMhValue20NF,
    setMaxAvPreMhValue20NF,
    minAvPreMhValue90NF,
    setMinAvPreMhValue90NF,
    maxAvPreMhValue90NF,
    setMaxAvPreMhValue90NF,
    minAvgDailyValue20,
    setMinAvgDailyValue20,
    maxAvgDailyValue20,
    setMaxAvgDailyValue20,
    minAvgDailyValue90,
    setMinAvgDailyValue90,
    maxAvgDailyValue90,
    setMaxAvgDailyValue90,
    minVolatility20,
    setMinVolatility20,
    maxVolatility20,
    setMaxVolatility20,
    minVolatility90,
    setMinVolatility90,
    maxVolatility90,
    setMaxVolatility90,
    minImbARCA,
    setMinImbARCA,
    maxImbARCA,
    setMaxImbARCA,
    minImbExchValue,
    setMinImbExchValue,
    maxImbExchValue,
    setMaxImbExchValue,
    sharedRangeFilterModes,
    setSharedRangeFilterModes,
    scanStartMin,
    setScanStartMin,
    scanStartMax,
    setScanStartMax,
    scanStartStep,
    setScanStartStep,
    scanEndMin,
    setScanEndMin,
    scanEndMax,
    setScanEndMax,
    scanEndStep,
    setScanEndStep,
    scanObjective,
    setScanObjective,
    scanTopK,
    setScanTopK,
    scanRows,
    setScanRows,
    scanLoading,
    setScanLoading,
    scanErr,
    setScanErr,
    scanProgress,
    setScanProgress,
    optimizerRows,
    setOptimizerRows,
    optimizerLoading,
    setOptimizerLoading,
    optimizerErr,
    setOptimizerErr,
    optimizerProgress,
    setOptimizerProgress,
    optimizerRanges,
    setOptimizerRanges,
    optimizerRangesLoading,
    setOptimizerRangesLoading,
    optimizerRangesErr,
    setOptimizerRangesErr,
    optimizerRangeGroupStatus,
    setOptimizerRangeGroupStatus,
    optimizerRangeGroupHidden,
    setOptimizerRangeGroupHidden,
    optimizerStatsHidden,
    setOptimizerStatsHidden,
    scopeSelectedParameterKeys,
    setScopeSelectedParameterKeys,
    scopeParameterGroupExpanded,
    setScopeParameterGroupExpanded,
    optimizerRangeRankMetric,
    setOptimizerRangeRankMetric,
    optimizerRangeMinTrades,
    setOptimizerRangeMinTrades,
    optimizerBucketCount,
    setOptimizerBucketCount,
    optimizerBinMode,
    setOptimizerBinMode,
    scopeResearchDrafts,
    setScopeResearchDrafts,
    scopeResearchSelections,
    setScopeResearchSelections,
    scopeFullscreenPanel,
    setScopeFullscreenPanel,
    scopeResearchFiltersHidden,
    setScopeResearchFiltersHidden,
    arbitrageTickerMetaByTicker,
    setArbitrageTickerMetaByTicker,
    arbitrageTickerMetaLoading,
    setArbitrageTickerMetaLoading,
    streamAutoStartLocked,
    setStreamAutoStartLocked,
    streamAutomationTogglePending,
    setStreamAutomationTogglePending,
    streamWindowCaptureBusy,
    setStreamWindowCaptureBusy,
  } = scannerFilters;

  // The ticker box drives a full re-filter of every row. Deferring it keeps the input responsive:
  // React renders the typed character immediately and re-runs the filters at lower priority. Same
  // fix already shipped in ArbitrageScanner.tsx/PairFluxScanner.tsx; this fork never got it.
  const deferredQTicker = React.useDeferredValue(qTicker);

  // OpenDoor exit class — replaces the inherited Arbitrage session-band selector (GLOB/BLUE/
  // PRE/ARK/PRINT/OPEN/INTRA/POST) with the two exit horizons OpenDoor.ipynb actually computes
  // (9:20 entry -> 9:40 "10m" / 10:00 "30m"). Deliberately independent from ruleBand/session,
  // which stay wired to the old Arbitrage-inherited plumbing elsewhere in this file untouched.
  // Range analysis runs entirely client-side for OpenDoor: optimizerRangeParameters buckets the
  // episodes already on screen, so no /optimizer/ranges call is needed (the Arbitrage endpoint
  // buckets Arbitrage episodes by Arbitrage-only axes and is deliberately not used).
  const OPEN_DOOR_OPTIMIZER_ENABLED = true;

  // Scenario runs are on too — see runEpisodesOptimizer, which evaluates them off the range
  // buckets client-side rather than calling /scope/evaluate.
  const OPEN_DOOR_SCENARIO_RUNNER_ENABLED = true;

  const [openDoorExitClass, setOpenDoorExitClass] = useState<"10m" | "30m">("10m");
  // OpenDoor bin-rating gates: MINRATE (up_rate/down_rate), MINTOTAL (situation count), and
  // MINMOVE (avg_up_move/avg_down_move magnitude) — independent per direction, matching the
  // two-column UP/DOWN layout. Deliberately fresh state, not the shared Arbitrage `activeRule`.
  // Backtest escape hatch: best_params publishes no bin under rate 0.60 / total 10, so the region
  // below the floor cannot be reached by lowering the thresholds — only by removing the gate.
  const [openDoorIgnoreRatings, setOpenDoorIgnoreRatings] = useState(false);
  // Explicit entry levels: with the gate off there is no bin to define the situation, so this is
  // what replaces it; with the gate on it narrows the rated level instead of replacing it.
  const [openDoorUseManualEntry, setOpenDoorUseManualEntry] = useState(false);
  const [openDoorEntryBounds, setOpenDoorEntryBounds] = useState<OpenDoorEntryBounds>(EMPTY_ENTRY_BOUNDS);
  const [openDoorUpMinRate, setOpenDoorUpMinRate] = useState(0.6);
  const [openDoorUpMinTotal, setOpenDoorUpMinTotal] = useState(20);
  const [openDoorUpMinMove, setOpenDoorUpMinMove] = useState(0);
  const [openDoorDownMinRate, setOpenDoorDownMinRate] = useState(0.6);
  const [openDoorDownMinTotal, setOpenDoorDownMinTotal] = useState(20);
  const [openDoorDownMinMove, setOpenDoorDownMinMove] = useState(0);
  // Which of the 3 OpenDoor parameters (Stack%, Bench%, DevSig) to check against live data.
  // Independently toggleable — if all 3 are on, all 3 are checked in real time (per spec).
  const [openDoorUseStack, setOpenDoorUseStack] = useState(true);
  const [openDoorUseBench, setOpenDoorUseBench] = useState(true);
  const [openDoorUseDevSig, setOpenDoorUseDevSig] = useState(true);
  // Historical P&L research (summary.csv only — no live paper-trading backend needed): for the
  // selected exit class, "would we have made money buying/selling EVERY historical candidate
  // whose entry-side bin cleared the MINRATE/MINTOTAL/MINMOVE bar?" rate/total/avg_move already
  // ARE that answer per {param}x{class}x{direction} bin, computed once by OpenDoor.ipynb — no
  // per-day replay data is needed, just the existing best-bin columns from /api/opendoor/summary.
  const [openDoorRatingByTicker, setOpenDoorRatingByTicker] = useState<Record<string, Record<string, string>>>({});
  const [openDoorRatingLoading, setOpenDoorRatingLoading] = useState(false);
  const [openDoorRatingError, setOpenDoorRatingError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setOpenDoorRatingLoading(true);
      try {
        const rows = await getOpendoorList();
        if (cancelled) return;
        const byTicker: Record<string, Record<string, string>> = {};
        for (const row of rows) {
          const t = String(row.ticker ?? "").toUpperCase().trim();
          if (t) byTicker[t] = row;
        }
        setOpenDoorRatingByTicker(byTicker);
        setOpenDoorRatingError(null);
      } catch (e: any) {
        if (!cancelled) setOpenDoorRatingError(e?.message || "Failed to load OpenDoor ratings");
      } finally {
        if (!cancelled) setOpenDoorRatingLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const openDoorResearch = useMemo(() => {
    const odNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    const cls = openDoorExitClass;
    const paramToggles: Array<{ param: "stack" | "bench" | "devsig"; on: boolean }> = [
      { param: "stack", on: openDoorUseStack },
      { param: "bench", on: openDoorUseBench },
      { param: "devsig", on: openDoorUseDevSig },
    ];
    const enabledParams = paramToggles.filter((p) => p.on).map((p) => p.param);

    type Candidate = {
      ticker: string;
      byParam: Record<string, { rate: number; total: number; avgMove: number | null }>;
      avgMove: number | null; // simple average of the enabled params' avg_move (same underlying Stack%-move outcome)
      minRate: number;
      minTotal: number;
    };

    const buildSide = (
      dir: "long" | "short",
      minRateGate: number,
      minTotalGate: number,
      minMoveGate: number
    ): { candidates: Candidate[]; totalObs: number; weightedRate: number | null; weightedAvgMove: number | null } => {
      const candidates: Candidate[] = [];
      if (enabledParams.length === 0) {
        return { candidates, totalObs: 0, weightedRate: null, weightedAvgMove: null };
      }

      for (const [ticker, row] of Object.entries(openDoorRatingByTicker)) {
        const byParam: Candidate["byParam"] = {};
        let passesAll = true;

        for (const param of enabledParams) {
          const rate = odNum(row[`${param}_${cls}_best_${dir}_rate`]);
          const total = odNum(row[`${param}_${cls}_best_${dir}_total`]);
          const avgMove = odNum(row[`${param}_${cls}_best_${dir}_avg_move`]);

          if (rate == null || total == null) { passesAll = false; break; }
          if (rate < minRateGate) { passesAll = false; break; }
          if (total < minTotalGate) { passesAll = false; break; }
          if (avgMove != null && Math.abs(avgMove) < minMoveGate) { passesAll = false; break; }

          byParam[param] = { rate, total, avgMove };
        }

        if (!passesAll) continue;

        const moves = enabledParams.map((p) => byParam[p]?.avgMove).filter((v): v is number => v != null);
        const avgMove = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null;
        const minRate = Math.min(...enabledParams.map((p) => byParam[p].rate));
        const minTotal = Math.min(...enabledParams.map((p) => byParam[p].total));

        candidates.push({ ticker, byParam, avgMove, minRate, minTotal });
      }

      candidates.sort((a, b) => b.minRate - a.minRate || b.minTotal - a.minTotal);

      const totalObs = candidates.reduce((sum, c) => sum + c.minTotal, 0);
      const weightedRate = totalObs > 0
        ? candidates.reduce((sum, c) => sum + c.minRate * c.minTotal, 0) / totalObs
        : null;
      const moveWeighted = candidates.filter((c) => c.avgMove != null);
      const moveWeightedTotal = moveWeighted.reduce((sum, c) => sum + c.minTotal, 0);
      const weightedAvgMove = moveWeightedTotal > 0
        ? moveWeighted.reduce((sum, c) => sum + (c.avgMove as number) * c.minTotal, 0) / moveWeightedTotal
        : null;

      return { candidates, totalObs, weightedRate, weightedAvgMove };
    };

    return {
      enabledParams,
      long: buildSide("long", openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove),
      short: buildSide("short", openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove),
    };
  }, [
    openDoorRatingByTicker, openDoorExitClass,
    openDoorUseStack, openDoorUseBench, openDoorUseDevSig,
    openDoorIgnoreRatings, openDoorUseManualEntry, openDoorEntryBounds,
    openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove,
    openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove,
  ]);

  // Combined LONG+SHORT view for the ACTIVE-tab KPI row / table — the Arbitrage-scanner analog,
  // but built purely from summary.csv best-bin stats (no live position engine exists for
  // OpenDoor). P&L per candidate is sign-corrected: a SHORT profits when Stack% FALLS, so its
  // avg_short_move (already negative, e.g. -0.68) is negated into a positive per-trade P&L.
  // rate/total/avg_move are already "did the situation resolve in the traded direction" stats,
  // so `rate` IS the win rate and no separate outcome classification is needed. There is no
  // per-day trade sequence available (the notebook only persists bin aggregates), so sequence-
  // dependent metrics like Max Drawdown / equity curve are not computable and are omitted
  // rather than fabricated.
  const openDoorCombined = useMemo(() => {
    type Row = {
      ticker: string;
      side: "LONG" | "SHORT";
      rate: number;
      total: number;
      avgMove: number | null; // raw Stack% move (signed, as recorded)
      pnl: number | null;     // sign-corrected per-trade P&L (positive avgMove for both sides = profit)
      byParam: Record<string, { rate: number; total: number; avgMove: number | null }>;
    };

    const rows: Row[] = [
      ...openDoorResearch.long.candidates.map((c): Row => ({
        ticker: c.ticker, side: "LONG", rate: c.minRate, total: c.minTotal,
        avgMove: c.avgMove, pnl: c.avgMove, byParam: c.byParam,
      })),
      ...openDoorResearch.short.candidates.map((c): Row => ({
        ticker: c.ticker, side: "SHORT", rate: c.minRate, total: c.minTotal,
        avgMove: c.avgMove, pnl: c.avgMove != null ? -c.avgMove : null, byParam: c.byParam,
      })),
    ];
    rows.sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));

    const withPnl = rows.filter((r) => r.pnl != null) as Array<Row & { pnl: number }>;
    const wins = withPnl.filter((r) => r.pnl > 0);
    const losses = withPnl.filter((r) => r.pnl < 0);

    const totalObs = rows.reduce((s, r) => s + r.total, 0);
    const totalPnl = withPnl.reduce((s, r) => s + r.pnl * r.total, 0);
    const weightedRate = totalObs > 0 ? rows.reduce((s, r) => s + r.rate * r.total, 0) / totalObs : 0;
    const avgTrade = totalObs > 0 ? totalPnl / totalObs : 0;
    const maxWin = wins.length ? Math.max(...wins.map((r) => r.pnl)) : 0;
    const maxLoss = losses.length ? Math.min(...losses.map((r) => r.pnl)) : 0;
    const avgWin = wins.length ? wins.reduce((s, r) => s + r.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, r) => s + r.pnl, 0) / losses.length : 0;
    const grossWin = wins.reduce((s, r) => s + r.pnl * r.total, 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + r.pnl * r.total, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const expectancy = weightedRate * avgWin + (1 - weightedRate) * avgLoss;

    return { rows, tickers: rows.length, totalObs, totalPnl, weightedRate, avgTrade, maxWin, maxLoss, avgWin, avgLoss, profitFactor, expectancy };
  }, [openDoorResearch]);





  // days + date mode






  const routeLocksPrimaryPanel = initialPrimaryPanel === "stream" || initialPrimaryPanel === "scanner";
  const isStreamOnlyShell = shellMode === "streamOnly";
  const tab = controlledTab ?? internalTab;

  const session = controlledSession ?? internalSession;
  const ruleBand = controlledRuleBand ?? internalRuleBand;
  const setTab = useCallback((nextTab: TabKey) => {
    if (controlledTab != null) {
      onControlledTabChange?.(nextTab);
      return;
    }
    setInternalTab(nextTab);
  }, [controlledTab, onControlledTabChange]);
  const setRuleBand = useCallback((nextBand: PaperArbRatingBand) => {
    if (controlledRuleBand != null) {
      onControlledRuleBandChange?.(nextBand);
      return;
    }
    setInternalRuleBand(nextBand);
  }, [controlledRuleBand, onControlledRuleBandChange]);
  const setSession = useCallback((nextSession: PaperArbSession) => {
    if (controlledSession != null) {
      onControlledSessionChange?.(nextSession);
      return;
    }
    setInternalSession(nextSession);
  }, [controlledSession, onControlledSessionChange]);
  const daySelectWrapperRef = useRef<HTMLDivElement | null>(null);
  const rangePresetWrapperRef = useRef<HTMLDivElement | null>(null);
  const dateFromSelectWrapperRef = useRef<HTMLDivElement | null>(null);
  const dateToSelectWrapperRef = useRef<HTMLDivElement | null>(null);

  // global filters (variant)


  // OpenDoor does not pre-gate its situation list on deviation — candidate selection is entirely
  // STACK/BENCH/DEV plus the UP/DOWN MINRATE/MINTOTAL/MINMOVE gates, and any further narrowing is
  // done in the UI on top of the full list. 0 is the backend's "no start-deviation gate" value.















  // Every dilution/scale-in control must push its value into the stream automation engine, not
  // just local state — otherwise the engine keeps running on streamAutomationConfigOverride's own
  // defaults while the toolbar shows something else.
  const applyDilutionMode = useCallback((nextMode: PaperArbDilutionMode) => {
    setDilutionMode(nextMode);
    onStreamAutomationConfigChange?.({
      scaleMode: nextMode === "Diluted" ? "scale_in" : "single",
    });
  }, [onStreamAutomationConfigChange]);

  const applyDilutionStep = useCallback((nextValue: number) => {
    const normalized = normalizeDilutionStepValue(nextValue);
    setDilutionStep(normalized);
    onStreamAutomationConfigChange?.({ dilutionStep: normalized });
  }, [onStreamAutomationConfigChange]);

  const applyMaxAdds = useCallback((nextValue: number) => {
    const normalized = normalizeMaxAddsValue(nextValue);
    setMaxAdds(normalized);
    onStreamAutomationConfigChange?.({ maxAdds: normalized });
  }, [onStreamAutomationConfigChange]);

  const applyAddDelayMinutes = useCallback((nextValue: number) => {
    const normalized = Math.max(0, Math.min(60, Math.trunc(nextValue || 0)));
    setAddDelayMinutes(normalized);
    onStreamAutomationConfigChange?.({ addDelayMinutes: normalized });
  }, [onStreamAutomationConfigChange]);

  // analytics options






  // table sub-filters (client-side)




  // data




  // ui state









  const [scannerPresetId, setScannerPresetId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(presetIdLsKey) ?? "";
    } catch {
      return "";
    }
  });







  // episodes: advanced POST search toggle + advanced panel
  const [episodesUseSearch, setEpisodesUseSearch] = useState<boolean>(false);


  // ===== Advanced filters (ALL switches)
  // rating









  // lists



  const ignoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const applyFileInputRef = useRef<HTMLInputElement | null>(null);
  const pinFileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionSelectWrapperRef = useRef<HTMLDivElement | null>(null);












  // numeric ranges (as strings for easy empty/null)

















































































  // news flags







  // require flags





  // exclude flags








  // medians


























  // imbalance





  const zeroCoverageFilterKeys = useMemo(() => {
    if (!episodesRows.length) return new Set<SharedRangeFilterKey>();

    const fieldCoverageChecks: Array<[SharedRangeFilterKey, keyof PaperArbClosedDto]> = [
      ["volnffromlstcls", "volNFfromLstCls"],
      ["avpremhvalue20nf", "avPreMhValue20NF"],
      ["avpremhvalue90nf", "avPreMhValue90NF"],
      ["avgdailyvalue20", "avgDailyValue20"],
      ["avgdailyvalue90", "avgDailyValue90"],
      ["volatility20", "volatility20"],
      ["volatility90", "volatility90"],
      ["premhmdv20nf", "preMhMDV20NF"],
      ["premhmdv90nf", "preMhMDV90NF"],
      ["volrel", "volRel"],
      ["premhbidlstprc", "preMhBidLstPrcPct"],
      ["premhlolstprc", "preMhLoLstPrcPct"],
      ["premhhilstcls", "preMhHiLstClsPct"],
      ["premhlolstcls", "preMhLoLstClsPct"],
      ["lstprclstcls", "lstPrcLstClsPct"],
      ["imbexch925", "imbExch925"],
      ["imbexch1555", "imbExch1555"],
    ];

    const active = fieldCoverageChecks.filter(([key]) => sharedRangeFilterModes[key] === "on");
    if (!active.length) return new Set<SharedRangeFilterKey>();

    const uncovered = new Set(active.map(([, field]) => field));
    for (const row of episodesRows) {
      for (const [, field] of active) {
        if (uncovered.has(field) && row[field] != null) uncovered.delete(field);
      }
      if (!uncovered.size) break;
    }

    const next = new Set<SharedRangeFilterKey>();
    for (const [key, field] of active) {
      if (uncovered.has(field)) next.add(key);
    }
    return next;
  }, [episodesRows, sharedRangeFilterModes]);
  const filtersHydratedRef = useRef(false);
  const filtersRestoringRef = useRef(false);
  // Keyed on count AND split mode: both change what the bridge returns, so both must re-fetch.
  const optimizerBucketReloadRef = useRef<string | null>(null);
















  // Result of the last run-button press. Empty until then, so nothing is computed in the background.
  const [optimizerRangeParameters, setOptimizerRangeParameters] = useState<PaperArbOptimizerParameterDto[]>([]);



















  const arbitrageTickerMetaLoadedRef = useRef(false);

  const episodesSearchCache = useEpisodesSearchCache<PaperArbClosedDto>();

  useEffect(() => {
    setScopeSelectedParameterKeys((prev) => {
      if (!prev.length) return prev;
      const hasLegacyRatingGate = prev.includes("minrate") || prev.includes("mintotal");
      if (!hasLegacyRatingGate) return prev;

      const requiredKeys = ["corr", "beta", "sigma"];
      const missingKeys = requiredKeys.filter((key) => !prev.includes(key));
      if (!missingKeys.length) return prev;

      return [...prev, ...missingKeys];
    });
  }, []);

  const toggleSharedRangeFilterMode = (key: SharedRangeFilterKey) => {
    setSharedRangeFilterModes((prev) => ({
      ...prev,
      [key]: prev[key] === "off" ? "on" : "off",
    }));
  };

  const rangeValueOrNull = (key: SharedRangeFilterKey, value: string) =>
    sharedRangeFilterModes[key] === "off" ? null : optNumOrNull(value);

  // ========= Derived: variant (for display)
  const variantString = useMemo(() => {
    // EndAbs always participates in variant (even if Passive ignores for closing)
    return [
      `metric=${metric}`,
      `startAbs=${startAbs}`,
      `deltaPrint=${zapMode === "delta" ? "on" : "off"}`,
      `startAbsMax=${startAbsMax || "off"}`,
      `endAbs=${endAbs}`,
      `session=${session}`,
      `scope=${scopeMode}`,
      `limit=${scopeMode === "ALL" ? 1000 : topN}`,
      `offset=${offset}`,
      `closeMode=${closeMode}`,
      `minHoldCandles=${minHoldCandles}`,
      `priceMode=${priceMode}`,
      `pnlMode=${pnlMode}`,
      `maxAdds=${maxAdds}`,
    ].join(" | ");
  }, [metric, startAbs, startAbsMax, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, priceMode, pnlMode, maxAdds, zapMode]);

  const variantShort = useMemo(() => {
    // small stable hash-ish label without bringing crypto
    const s = `${metric}|${startAbs}|${zapMode === "delta" ? 1 : 0}|${startAbsMax}|${endAbs}|${session}|${scopeMode}|${scopeMode === "ALL" ? 1000 : topN}|${offset}|${closeMode}|${minHoldCandles}|${pnlMode}|${maxAdds}|${priceMode}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `v${h.toString(16).slice(0, 8)}`;
  }, [metric, startAbs, startAbsMax, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, priceMode, pnlMode, maxAdds, zapMode]);

  const forceEpisodesSearch = useMemo(() => {
    const has = (v: string) => String(v ?? "").trim().length > 0;
    const startAbsMaxNum = optNumOrNull(startAbsMax);
    const hasValidStartAbsMax = startAbsMaxNum != null && startAbsMaxNum > 0 && (zapMode === "delta" || startAbsMaxNum >= startAbs);
    return (
      has(minCorr) || has(maxCorr) ||
      has(minBeta) || has(maxBeta) ||
      has(minSigma) || has(maxSigma) ||
      has(minAdv20) || has(maxAdv20) ||
      has(minAdv20NF) || has(maxAdv20NF) ||
      has(minAdv90) || has(maxAdv90) ||
      has(minAdv90NF) || has(maxAdv90NF) ||
      has(minAvPreMhv) || has(maxAvPreMhv) ||
      has(minRoundLot) || has(maxRoundLot) ||
      has(minVWAP) || has(maxVWAP) ||
      has(minSpread) || has(maxSpread) ||
      has(minLstPrcL) || has(maxLstPrcL) ||
      has(minLstCls) || has(maxLstCls) ||
      has(minYCls) || has(maxYCls) ||
      has(minTCls) || has(maxTCls) ||
      has(minClsToClsPct) || has(maxClsToClsPct) ||
      has(minLo) || has(maxLo) ||
      has(minLstClsNewsCnt) || has(maxLstClsNewsCnt) ||
      has(minMarketCapM) || has(maxMarketCapM) ||
      has(minPreMktVolNF) || has(maxPreMktVolNF) ||
      has(minVolNFfromLstCls) || has(maxVolNFfromLstCls) ||
      has(minAvPostMhVol90NF) || has(maxAvPostMhVol90NF) ||
      has(minAvPreMhVol90NF) || has(maxAvPreMhVol90NF) ||
      has(minAvPreMhValue20NF) || has(maxAvPreMhValue20NF) ||
      has(minAvPreMhValue90NF) || has(maxAvPreMhValue90NF) ||
      has(minAvgDailyValue20) || has(maxAvgDailyValue20) ||
      has(minAvgDailyValue90) || has(maxAvgDailyValue90) ||
      has(minVolatility20) || has(maxVolatility20) ||
      has(minVolatility90) || has(maxVolatility90) ||
      has(minPreMhMDV20NF) || has(maxPreMhMDV20NF) ||
      has(minPreMhMDV90NF) || has(maxPreMhMDV90NF) ||
      has(minVolRel) || has(maxVolRel) ||
      has(minPreMhBidLstPrcPct) || has(maxPreMhBidLstPrcPct) ||
      has(minPreMhLoLstPrcPct) || has(maxPreMhLoLstPrcPct) ||
      has(minPreMhHiLstClsPct) || has(maxPreMhHiLstClsPct) ||
      has(minPreMhLoLstClsPct) || has(maxPreMhLoLstClsPct) ||
      has(minLstPrcLstClsPct) || has(maxLstPrcLstClsPct) ||
      has(minImbExch925) || has(maxImbExch925) ||
      has(minImbExch1555) || has(maxImbExch1555) ||
      hasValidStartAbsMax ||
      has(minNewsCnt) || has(maxNewsCnt) ||
      requireHasNews || excludeHasNews || requireHasReport || excludeHasReport ||
      includeUSA || includeChina ||
      requireIsPTP || requireIsSSR || requireIsETF || requireIsCrap ||
      excludeDividend || excludePTP || excludeSSR || excludeETF || excludeCrap
    );
  }, [
    minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma,
    minAdv20, maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF,
    minAvPreMhv, maxAvPreMhv, minRoundLot, maxRoundLot, minVWAP, maxVWAP, minSpread, maxSpread,
    minLstPrcL, maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls,
    minClsToClsPct, maxClsToClsPct, minLo, maxLo, minLstClsNewsCnt, maxLstClsNewsCnt,
    minMarketCapM, maxMarketCapM, minPreMktVolNF, maxPreMktVolNF, minVolNFfromLstCls, maxVolNFfromLstCls,
    minAvPostMhVol90NF, maxAvPostMhVol90NF, minAvPreMhVol90NF, maxAvPreMhVol90NF,
    minAvPreMhValue20NF, maxAvPreMhValue20NF, minAvPreMhValue90NF, maxAvPreMhValue90NF,
    minAvgDailyValue20, maxAvgDailyValue20, minAvgDailyValue90, maxAvgDailyValue90,
    minVolatility20, maxVolatility20, minVolatility90, maxVolatility90,
    minPreMhMDV20NF, maxPreMhMDV20NF, minPreMhMDV90NF, maxPreMhMDV90NF, minVolRel, maxVolRel,
    minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct, minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct,
    minPreMhHiLstClsPct, maxPreMhHiLstClsPct, minPreMhLoLstClsPct, maxPreMhLoLstClsPct,
    minLstPrcLstClsPct, maxLstPrcLstClsPct, minImbExch925, maxImbExch925, minImbExch1555, maxImbExch1555,
    startAbsMax, startAbs, zapMode,
    minNewsCnt, maxNewsCnt,
    requireHasNews, excludeHasNews, requireHasReport, excludeHasReport, includeUSA, includeChina,
    requireIsPTP, requireIsSSR, requireIsETF, requireIsCrap,
    excludeDividend, excludePTP, excludeSSR, excludeETF, excludeCrap,
  ]);

  // ========= Preflight validation
  const validationErrors = useMemo(() => {
    const e: string[] = [];

    const needsRange = dateMode !== "day";

    if (!needsRange) {
      if (!toYmd(dateNy)) e.push("dateNy must be YYYY-MM-DD");
    } else {
      if (!toYmd(dateFrom)) e.push("dateFrom must be YYYY-MM-DD");
      if (!toYmd(dateTo)) e.push("dateTo must be YYYY-MM-DD");
      if (toYmd(dateFrom) && toYmd(dateTo) && dateFrom > dateTo) e.push("dateFrom must be <= dateTo");
    }

    if (!(startAbs >= 0)) e.push("startAbs must be >= 0");
    if (!(endAbs >= 0)) e.push("endAbs must be >= 0");
    // With startAbs = 0 the start gate is off, so "close tighter than you entered" is vacuous.
    if (zapMode !== "delta" && startAbs > 0 && endAbs > startAbs) e.push("endAbs must be <= startAbs");

    if (minHoldCandles < 0) e.push("minHoldCandles must be >= 0");

    return e;
  }, [dateMode, dateNy, dateFrom, dateTo, startAbs, endAbs, minHoldCandles, zapMode]);

  const canRun = validationErrors.length === 0 && !loading;
  const episodesUseSearchEffective = episodesUseSearch || forceEpisodesSearch;
  const bumpStartAbsMax = (delta: number) => {
    setStartAbsMax((prev) => {
      const raw = String(prev ?? "").trim();
      const parsed = Number(raw.replace(",", "."));
      const cur = Number.isFinite(parsed) ? parsed : startAbs;
      const next = Math.max(0, +(cur + delta).toFixed(4));
      return String(next);
    });
  };

  // ========= Tab/date mode behavior rules
  useEffect(() => {
    // active => day always
    if (tab === "active") {
      if (dateMode !== "day") {
        setDateMode("day");
        setDateNy(dateFrom || dateNy);
      }
      return;
    }

    // episodes:
    // - legacy GET => day only
    // - search POST => day/last/range are allowed
    if (tab === "episodes") {
      if (!(episodesUseSearch || forceEpisodesSearch)) {
        if (dateMode !== "day") {
          setDateMode("day");
          setDateNy(dateFrom || dateNy);
        }
      } else {
        if (dateMode === "day" && toYmd(dateNy)) {
          setDateFrom(dateNy);
          setDateTo(dateNy);
        }
      }
      return;
    }

    // analytics allows day/last/range
    if (tab === "analytics") {
      if (dateMode === "day" && toYmd(dateNy)) {
        setDateFrom(dateNy);
        setDateTo(dateNy);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateMode, episodesUseSearch, forceEpisodesSearch, dateNy, dateFrom]);

  // ========= OpenDoor SNAPSHOT: live per-day tape replay (architecturally mirrors Arbitrage's
  // SNAPSHOT tab — POST .../episodes/search, per-day cache, day-range build — but hits
  // /api/paper/opendoor/episodes/search, gated by OpenDoor's own summary.csv ratings and using
  // TapeOpenDoorEngine's fixed 09:20-entry/09:40-or-10:00-exit rule instead of Arbitrage's
  // hedge engine. Real per-day accuracy: each row is an ACTUALLY realized trade, not a bin average.
  type OpenDoorPaperClosed = {
    ticker: string;
    benchTicker?: string | null;
    side: "Long" | "Short";
    entryMinuteIdx: number;
    exitMinuteIdx: number;
    entryStack?: number | null;
    exitStack?: number | null;
    move?: number | null;
    pnl?: number | null;
    entryDevSig?: number | null;
    entryBench?: number | null;
    gateRate?: number | null;
    gateTotal?: number | null;
  };
  const [openDoorSnapshotLoading, setOpenDoorSnapshotLoading] = useState(false);
  const [openDoorSnapshotError, setOpenDoorSnapshotError] = useState<string | null>(null);

  // Entering the tab loads the day; the SNAPSHOT numbers are then derived from those very rows
  // (openDoorSnapshotRows, defined after filteredEpisodes further down). This used to be a second,
  // independent fetch whose body carried only the exit class, the three source toggles, the six
  // gates and sizeValue - so the whole filter toolbar (the shared min/max ranges, IGN/APP/PIN, the
  // flag row, the country/exchange/sector selects) changed nothing in the P&L, trade count and win
  // rate on this screen, while the charts beside them, fed by filteredEpisodes, honoured all of it.
  // One fetch, one set of rows, one answer.
  useEffect(() => {
    // Must mirror the SNAPSHOT block's own render condition exactly - in a streamOnly shell the
    // table renders under the "episodes" tab, so gating the fetch on "analytics" alone left it
    // permanently empty there.
    if (!(primaryPanel === "scanner" && (tab === "analytics" || (isStreamOnlyShell && tab === "episodes")))) return;
    if (!toYmd(dateFrom) || !toYmd(dateTo)) return;

    let cancelled = false;
    (async () => {
      setOpenDoorSnapshotLoading(true);
      try {
        // Same call RUN makes on this tab, and episodesSearchCache keys on the request body, so
        // the two no longer hit the bridge twice for the same day.
        const rows = await fetchEpisodesSearchRows(buildPostRequest(dateFrom, dateTo));
        if (cancelled) return;
        setEpisodesRows(rows);
        setOpenDoorSnapshotError(null);
      } catch (e: any) {
        if (!cancelled) setOpenDoorSnapshotError(e?.message || "Failed to load OpenDoor snapshot");
      } finally {
        if (!cancelled) setOpenDoorSnapshotLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    primaryPanel, tab, isStreamOnlyShell, dateFrom, dateTo, openDoorExitClass,
    openDoorUseStack, openDoorUseBench, openDoorUseDevSig,
    openDoorIgnoreRatings, openDoorUseManualEntry, openDoorEntryBounds,
    openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove,
    openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove,
    sizeValue,
  ]);

  // ========= Drop loaded rows as soon as the selected date changes
  //
  // Rows answer for the date they were fetched with, and plenty is derived from them: the IGN
  // ticker scope, the scope-research panels, the equity curve. Leaving the previous day's rows on
  // screen while the header already shows a new date let that derived state answer for the wrong
  // day.
  const loadedForDateKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = dateMode === "day" ? `day:${dateNy}` : `${dateMode}:${dateFrom}..${dateTo}`;
    if (loadedForDateKeyRef.current === key) return;
    loadedForDateKeyRef.current = key;
    setActiveRows([]);
    setEpisodesRows([]);
    setAnalytics(null);
    setUpdatedAt(null);
  }, [dateMode, dateNy, dateFrom, dateTo]);

  // ========= Load available days on mount
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const d = await loadDaysApi(STRATEGY.api.daysEndpoint);
        setDays(d);
        if (d.length && !d.includes(dateNy)) {
          setDateNy(d[0]);
          setDateFrom(d[0]);
          setDateTo(d[0]);
        }
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteDay = async (d: string) => {
    try {
      const res = await fetch(`/api/tape/day?dateNy=${encodeURIComponent(d)}`, { method: "DELETE" });
      if (!res.ok) return;
      const fresh = await loadDaysApi(STRATEGY.api.daysEndpoint);
      setDays(fresh);
      if (dateNy === d) {
        const next = fresh[0] ?? "";
        setDateNy(next);
        setDateFrom(next);
        setDateTo(next);
      }
    } catch {
      // silently ignore
    }
  };

  const sortedDaysAsc = useMemo(() => {
    return [...(days ?? [])].filter((d) => toYmd(d)).sort((a, b) => a.localeCompare(b));
  }, [days]);
  const sortedDaysDesc = useMemo(() => {
    return [...sortedDaysAsc].sort((a, b) => b.localeCompare(a));
  }, [sortedDaysAsc]);
  const fromDayOptions = useMemo(() => {
    const pool = sortedDaysDesc.length ? sortedDaysDesc : [dateFrom, dateTo].filter(toYmd);
    return pool.filter((d) => !toYmd(dateTo) || d <= dateTo).map((d) => ({ value: d, label: d }));
  }, [sortedDaysDesc, dateFrom, dateTo]);
  const toDayOptions = useMemo(() => {
    const pool = sortedDaysDesc.length ? sortedDaysDesc : [dateFrom, dateTo].filter(toYmd);
    return pool.filter((d) => !toYmd(dateFrom) || d >= dateFrom).map((d) => ({ value: d, label: d }));
  }, [sortedDaysDesc, dateFrom, dateTo]);

  const applyRangePreset = (preset: "3d" | "5d" | "10d" | "15d" | "20d" | "30d") => {
    setDateMode("last");
    if (tab === "episodes") setEpisodesUseSearch(true);
    setRangePreset(preset);
    const n =
      preset === "3d" ? 3 :
      preset === "5d" ? 5 :
      preset === "10d" ? 10 :
      preset === "15d" ? 15 :
      preset === "20d" ? 20 : 30;
    const end = sortedDaysAsc[sortedDaysAsc.length - 1] ?? todayNyYmd();
    if (!sortedDaysAsc.length) {
      setDateTo(end);
      setDateFrom(end);
      return;
    }
    const eligible = sortedDaysAsc.filter((d) => d <= end);
    const src = eligible.length ? eligible : sortedDaysAsc;
    const slice = src.slice(Math.max(0, src.length - n));
    const from = slice[0] ?? src[0];
    const to = slice[slice.length - 1] ?? src[src.length - 1];
    setDateFrom(from);
    setDateTo(to);
  };

  // ========= Persist/restore filters (like reference terminal)
  useFilterRestore(filtersLsKey, filtersHydratedRef, filtersRestoringRef, (s) => {

        if (!routeLocksPrimaryPanel && (s.primaryPanel === "stream" || s.primaryPanel === "scanner")) setPrimaryPanel(s.primaryPanel);
        if (controlledTab == null && (s.tab === "active" || s.tab === "episodes" || s.tab === "analytics")) setInternalTab(s.tab);
        if (controlledRuleBand == null && (s.ruleBand === "BLUE" || s.ruleBand === "ARK" || s.ruleBand === "PRE" || s.ruleBand === "OPEN" || s.ruleBand === "INTRA" || s.ruleBand === "PRINT" || s.ruleBand === "POST" || s.ruleBand === "GLOBAL")) setInternalRuleBand(s.ruleBand);
        // zapMode is deliberately NOT restored, for the same reason as startAbs below: the %/σ/Δ ZAP
        // toggle is an Arbitrage-only control and does not exist in the OpenDoor toolbar. A stale
        // "delta" persisted by an older build would set UsePrintMedianDelta on the requests, and the
        // engine then computes GetEffectiveStartAbs = printMedian + startAbs — reinstating a ~0.1
        // deviation gate despite startAbs being 0, with nothing in the UI to reveal it.
        if (typeof s.showSharedMinMax === "boolean") setShowSharedMinMax(s.showSharedMinMax);

        if (s.dateMode === "day" || s.dateMode === "last" || s.dateMode === "range") setDateMode(s.dateMode);
        if (typeof s.dateNy === "string") setDateNy(s.dateNy);
        if (typeof s.dateFrom === "string") setDateFrom(s.dateFrom);
        if (typeof s.dateTo === "string") setDateTo(s.dateTo);

        if (controlledSession == null && (s.session === "BLUE" || s.session === "ARK" || s.session === "PRE" || s.session === "OPEN" || s.session === "INTRA" || s.session === "POST" || s.session === "NIGHT" || s.session === "GLOB")) {
          setSession(s.session);
          const restoredBand = ratingBandFromSession(s.session);
          if (controlledRuleBand != null) {
            onControlledRuleBandChange?.(restoredBand);
          } else {
            setInternalRuleBand(restoredBand);
          }
        }
        if (s.metric === "SigmaZap" || s.metric === "ZapPct") setMetric(s.metric);
        if (s.closeMode === "Active" || s.closeMode === "Passive") setCloseMode(s.closeMode);
        // startAbs is deliberately NOT restored: the control was removed from the OpenDoor toolbar,
        // so a value persisted by an older build (0.1) would silently switch the start-deviation
        // gate back on with no way to see or clear it.
        if (typeof s.startAbsMax === "string") setStartAbsMax(s.startAbsMax);
        if (typeof s.endAbs === "number") setEndAbs(s.endAbs);
        if (typeof s.minHoldCandles === "number") setMinHoldCandles(s.minHoldCandles);
        if (typeof s.startCutoffMinuteIdx === "number" && s.startCutoffMinuteIdx >= 0) {
          const h = Math.floor(s.startCutoffMinuteIdx / 60);
          const m = s.startCutoffMinuteIdx % 60;
          const restoredCutoffTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          setStartCutoffTime(restoredCutoffTime);
          onStreamAutomationConfigChange?.({ startCutoffTime: restoredCutoffTime });
        }
        if (typeof s.preStartMinuteIdx === "number" && s.preStartMinuteIdx >= -180 && s.preStartMinuteIdx <= 570) {
          const clock = s.preStartMinuteIdx < 0 ? s.preStartMinuteIdx + 1440 : s.preStartMinuteIdx;
          const h = Math.floor(clock / 60);
          const m = clock % 60;
          const restoredPreStartTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          setPreStartTime(restoredPreStartTime);
          onStreamAutomationConfigChange?.({ preStartTime: restoredPreStartTime });
        }
        if (s.pnlMode === "RawOnly" || s.pnlMode === "Hedged") setPnlMode(s.pnlMode);
        if (s.priceMode === "LastPrint" || s.priceMode === "BidAsk") setPriceMode(s.priceMode);
        if (s.sizingMode === "Tier" || s.sizingMode === "Notional") setSizingMode(s.sizingMode);
        if (typeof s.sizeValue === "number") setSizeValue(normalizeScannerSizeValue(s.sizingMode === "Tier" ? "Tier" : "Notional", s.sizeValue));

        // OpenDoor gate settings. Restored here rather than left at their defaults so the toolbar
        // shows what is actually being traded after a reload — and so the copy pushed to the
        // bridge (see the effect below) is the operator's, not a fresh page's.
        if (s.openDoorExitClass === "10m" || s.openDoorExitClass === "30m") setOpenDoorExitClass(s.openDoorExitClass);
        if (typeof s.openDoorUseStack === "boolean") setOpenDoorUseStack(s.openDoorUseStack);
        if (typeof s.openDoorUseBench === "boolean") setOpenDoorUseBench(s.openDoorUseBench);
        if (typeof s.openDoorUseDevSig === "boolean") setOpenDoorUseDevSig(s.openDoorUseDevSig);
        if (typeof s.openDoorIgnoreRatings === "boolean") setOpenDoorIgnoreRatings(s.openDoorIgnoreRatings);
        if (typeof s.openDoorUseManualEntry === "boolean") setOpenDoorUseManualEntry(s.openDoorUseManualEntry);
        if (s.openDoorEntryBounds && typeof s.openDoorEntryBounds === "object") setOpenDoorEntryBounds({ ...EMPTY_ENTRY_BOUNDS, ...s.openDoorEntryBounds });
        if (typeof s.openDoorUpMinRate === "number") setOpenDoorUpMinRate(s.openDoorUpMinRate);
        if (typeof s.openDoorUpMinTotal === "number") setOpenDoorUpMinTotal(s.openDoorUpMinTotal);
        if (typeof s.openDoorUpMinMove === "number") setOpenDoorUpMinMove(s.openDoorUpMinMove);
        if (typeof s.openDoorDownMinRate === "number") setOpenDoorDownMinRate(s.openDoorDownMinRate);
        if (typeof s.openDoorDownMinTotal === "number") setOpenDoorDownMinTotal(s.openDoorDownMinTotal);
        if (typeof s.openDoorDownMinMove === "number") setOpenDoorDownMinMove(s.openDoorDownMinMove);
        const preferStreamAutomationDilution =
          isStreamOnlyShell && streamAutomationConfigOverride != null;
        if (!preferStreamAutomationDilution && (s.dilutionMode === "Undiluted" || s.dilutionMode === "Diluted")) {
          setDilutionMode(s.dilutionMode);
          onStreamAutomationConfigChange?.({
            scaleMode: s.dilutionMode === "Diluted" ? "scale_in" : "single",
          });
        }
        if (!preferStreamAutomationDilution && typeof s.dilutionStep === "number") {
          const restoredDilutionStep = normalizeDilutionStepValue(s.dilutionStep);
          setDilutionStep(restoredDilutionStep);
          onStreamAutomationConfigChange?.({ dilutionStep: restoredDilutionStep });
        }
        if (!preferStreamAutomationDilution && typeof s.maxAdds === "number") {
          const restoredMaxAdds = normalizeMaxAddsValue(s.maxAdds);
          setMaxAdds(restoredMaxAdds);
          onStreamAutomationConfigChange?.({ maxAdds: restoredMaxAdds });
        }
        if (!preferStreamAutomationDilution && typeof s.addDelayMinutes === "number") {
          const restoredAddDelayMinutes = Math.max(0, Math.trunc(s.addDelayMinutes));
          setAddDelayMinutes(restoredAddDelayMinutes);
          onStreamAutomationConfigChange?.({ addDelayMinutes: restoredAddDelayMinutes });
        }
        if (s.optimizerRangeRankMetric === "avgPnlUsd" || s.optimizerRangeRankMetric === "totalPnlUsd" || s.optimizerRangeRankMetric === "winRate" || s.optimizerRangeRankMetric === "score" || s.optimizerRangeRankMetric === "tailDamage") {
          setOptimizerRangeRankMetric(s.optimizerRangeRankMetric);
        }
        if (typeof s.optimizerRangeMinTrades === "number") setOptimizerRangeMinTrades(Math.max(0, Math.trunc(s.optimizerRangeMinTrades)));
        if (typeof s.optimizerBucketCount === "number") setOptimizerBucketCount(Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, Math.trunc(s.optimizerBucketCount))));
        if (s.optimizerBinMode === "trades" || s.optimizerBinMode === "harm" || s.optimizerBinMode === "gain" || s.optimizerBinMode === "width") setOptimizerBinMode(s.optimizerBinMode);

        if (typeof s.includeEquityCurve === "boolean") setIncludeEquityCurve(s.includeEquityCurve);
        if (s.equityCurveMode === "Daily" || s.equityCurveMode === "Trade") setEquityCurveMode(s.equityCurveMode);
        if (s.sharedRangeFilterModes && typeof s.sharedRangeFilterModes === "object") {
          const normalizedModes = Object.fromEntries(
            Object.entries(s.sharedRangeFilterModes).map(([k, v]) => [
              k,
              v === "off" || v === "hold" ? "off" : "on",
            ])
          );
          setSharedRangeFilterModes({
            ...DEFAULT_SHARED_RANGE_FILTER_MODES,
            ...normalizedModes,
          });
        }
        if (typeof s.topN === "number") setTopN(s.topN);
        if (s.scopeMode === "ALL" || s.scopeMode === "TOP") setScopeMode(s.scopeMode);
        if (typeof s.offset === "number") setOffset(s.offset);

        if (typeof s.qTicker === "string") setQTicker(s.qTicker);
        if (s.qSide === "" || s.qSide === "Long" || s.qSide === "Short") setQSide(s.qSide);

        if (s.listMode === "off" || s.listMode === "ignore" || s.listMode === "apply" || s.listMode === "pin") setListMode(s.listMode);
        if (typeof s.showIgnore === "boolean") setShowIgnore(s.showIgnore);
        if (typeof s.showApply === "boolean") setShowApply(s.showApply);
        if (typeof s.showPin === "boolean") setShowPin(s.showPin);
        if (typeof s.episodesUseSearch === "boolean") setEpisodesUseSearch(s.episodesUseSearch);
        if (typeof s.showAdvanced === "boolean") setShowAdvanced(s.showAdvanced);

        if (s.ratingMode === "SESSION" || s.ratingMode === "BIN" || s.ratingMode === "BINS") setRatingMode(s.ratingMode);
        if (typeof s.topMode === "boolean") setTopMode(s.topMode);
        if (typeof s.topSigmaOn === "boolean") setTopSigmaOn(s.topSigmaOn);
        if (typeof s.topBenchOn === "boolean") setTopBenchOn(s.topBenchOn);
        if (typeof s.topTimeOn === "boolean") setTopTimeOn(s.topTimeOn);
        if (s.ratingType === "any" || s.ratingType === "hard" || s.ratingType === "soft") setRatingType(s.ratingType);
        if (Array.isArray(s.ratingRules)) {
          const rr = s.ratingRules
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              band: x.band as PaperArbRatingBand,
              minRate: Number(x.minRate) || 0,
              minTotal: Number(x.minTotal) || 0,
            }))
            .filter((x) => PAPER_ARB_RATING_BANDS.includes(x.band));
          if (rr.length) setRatingRules(normalizePaperArbRatingRules(rr));
        }
        if (s.ratingEnabledBands && typeof s.ratingEnabledBands === "object") {
          setRatingEnabledBands((prev) => {
            const next = {
              ...prev,
              BLUE: Boolean(s.ratingEnabledBands.BLUE),
              ARK: Boolean(s.ratingEnabledBands.ARK),
              PRE: Boolean(s.ratingEnabledBands.PRE),
              OPEN: Boolean(s.ratingEnabledBands.OPEN),
              INTRA: Boolean(s.ratingEnabledBands.INTRA),
              PRINT: Boolean(s.ratingEnabledBands.PRINT),
              POST: Boolean(s.ratingEnabledBands.POST),
              GLOBAL: Boolean(s.ratingEnabledBands.GLOBAL),
            };

            const hasAnyEnabled =
              next.BLUE || next.ARK || next.PRE || next.OPEN || next.INTRA || next.PRINT || next.POST || next.GLOBAL;

            // Backward-compat for old saved state where all bands were false.
            if (!hasAnyEnabled) next.GLOBAL = true;

            return next;
          });
        }

        if (typeof s.ignoreTickersText === "string") setIgnoreTickersText(s.ignoreTickersText);
        if (typeof s.tickersText === "string") setTickersText(s.tickersText);
        if (typeof s.benchTickersText === "string") setBenchTickersText(s.benchTickersText);
        if (s.sideFilter === "" || s.sideFilter === "Long" || s.sideFilter === "Short") setSideFilter(s.sideFilter);
        if (Array.isArray(s.exchangesText)) setSelExchanges(new Set(s.exchangesText));
        else if (typeof s.exchangesText === "string") setSelExchanges(new Set(splitListUpper(s.exchangesText)));
        if (Array.isArray(s.countriesText)) setSelCountries(new Set(s.countriesText));
        else if (typeof s.countriesText === "string") setSelCountries(new Set(splitListUpper(s.countriesText)));
        if (Array.isArray(s.sectorsL3Text)) setSelSectors(new Set(s.sectorsL3Text));
        else if (typeof s.sectorsL3Text === "string") setSelSectors(new Set(splitListUpper(s.sectorsL3Text)));
        const validTriMode = (v: unknown): v is TriMode => v === "off" || v === "include" || v === "exclude";
        if (validTriMode(s.countryEnabled)) setCountryEnabled(s.countryEnabled);
        if (validTriMode(s.exchangeEnabled)) setExchangeEnabled(s.exchangeEnabled);
        if (validTriMode(s.sectorEnabled)) setSectorEnabled(s.sectorEnabled);
        if (typeof s.scopeBenchText === "string") setScopeBenchText(s.scopeBenchText);
        if (typeof s.imbExchsText === "string") setImbExchsText(s.imbExchsText);

        const applyStr = (v: any, setter: (x: string) => void) => {
          if (typeof v === "string") setter(v);
        };
        applyStr(s.minTierBp, setMinTierBp); applyStr(s.maxTierBp, setMaxTierBp);
        applyStr(s.minCorr, setMinCorr); applyStr(s.maxCorr, setMaxCorr);
        applyStr(s.minBeta, setMinBeta); applyStr(s.maxBeta, setMaxBeta);
        applyStr(s.minSigma, setMinSigma); applyStr(s.maxSigma, setMaxSigma);
        applyStr(s.minMarketCapM, setMinMarketCapM); applyStr(s.maxMarketCapM, setMaxMarketCapM);
        applyStr(s.minRoundLot, setMinRoundLot); applyStr(s.maxRoundLot, setMaxRoundLot);
        applyStr(s.minAdv20, setMinAdv20); applyStr(s.maxAdv20, setMaxAdv20);
        applyStr(s.minAdv20NF, setMinAdv20NF); applyStr(s.maxAdv20NF, setMaxAdv20NF);
        applyStr(s.minAdv90, setMinAdv90); applyStr(s.maxAdv90, setMaxAdv90);
        applyStr(s.minAdv90NF, setMinAdv90NF); applyStr(s.maxAdv90NF, setMaxAdv90NF);
        applyStr(s.minPreMktVol, setMinPreMktVol); applyStr(s.maxPreMktVol, setMaxPreMktVol);
        applyStr(s.minPreMktVolNF, setMinPreMktVolNF); applyStr(s.maxPreMktVolNF, setMaxPreMktVolNF);
        applyStr(s.minSpread, setMinSpread); applyStr(s.maxSpread, setMaxSpread);
        // Payloads written before the persist key was corrected carry the value as a number under
        // the request-shaped name, so the setting is recoverable rather than lost on first load.
        if (typeof s.minSpread !== "string" && typeof s.minSpreadBidPct === "number") setMinSpread(String(s.minSpreadBidPct));
        if (typeof s.maxSpread !== "string" && typeof s.maxSpreadBidPct === "number") setMaxSpread(String(s.maxSpreadBidPct));
        applyStr(s.minSpreadBps, setMinSpreadBps); applyStr(s.maxSpreadBps, setMaxSpreadBps);
        applyStr(s.minGap, setMinGap); applyStr(s.maxGap, setMaxGap);
        applyStr(s.minGapPct, setMinGapPct); applyStr(s.maxGapPct, setMaxGapPct);
        applyStr(s.minClsToClsPct, setMinClsToClsPct); applyStr(s.maxClsToClsPct, setMaxClsToClsPct);
        applyStr(s.minVWAP, setMinVWAP); applyStr(s.maxVWAP, setMaxVWAP);
        applyStr(s.minLo, setMinLo); applyStr(s.maxLo, setMaxLo);
        applyStr(s.minAvPreMhv, setMinAvPreMhv); applyStr(s.maxAvPreMhv, setMaxAvPreMhv);
        applyStr(s.minLstPrcL, setMinLstPrcL); applyStr(s.maxLstPrcL, setMaxLstPrcL);
        applyStr(s.minLstCls, setMinLstCls); applyStr(s.maxLstCls, setMaxLstCls);
        applyStr(s.minYCls, setMinYCls); applyStr(s.maxYCls, setMaxYCls);
        applyStr(s.minTCls, setMinTCls); applyStr(s.maxTCls, setMaxTCls);
        applyStr(s.minLstClsNewsCnt, setMinLstClsNewsCnt); applyStr(s.maxLstClsNewsCnt, setMaxLstClsNewsCnt);
        if (typeof s.minLstClsNewsCnt !== "string" && typeof s.minNewsCnt === "string") setMinLstClsNewsCnt(s.minNewsCnt);
        if (typeof s.maxLstClsNewsCnt !== "string" && typeof s.maxNewsCnt === "string") setMaxLstClsNewsCnt(s.maxNewsCnt);
        applyStr(s.minVolNFfromLstCls, setMinVolNFfromLstCls); applyStr(s.maxVolNFfromLstCls, setMaxVolNFfromLstCls);
        applyStr(s.minNewsCnt, setMinNewsCnt); applyStr(s.maxNewsCnt, setMaxNewsCnt);
        applyStr(s.minMdnPreMhVol90, setMinMdnPreMhVol90); applyStr(s.maxMdnPreMhVol90, setMaxMdnPreMhVol90);
        applyStr(s.minPreMhMDV90NF, setMinPreMhMDV90NF); applyStr(s.maxPreMhMDV90NF, setMaxPreMhMDV90NF);
        applyStr(s.minPreMhMDV20NF, setMinPreMhMDV20NF); applyStr(s.maxPreMhMDV20NF, setMaxPreMhMDV20NF);
        applyStr(s.minMdnPostMhVol90NF, setMinMdnPostMhVol90NF); applyStr(s.maxMdnPostMhVol90NF, setMaxMdnPostMhVol90NF);
        applyStr(s.minAvPostMhVol90NF, setMinAvPostMhVol90NF); applyStr(s.maxAvPostMhVol90NF, setMaxAvPostMhVol90NF);
        applyStr(s.minAvPreMhVol90NF, setMinAvPreMhVol90NF); applyStr(s.maxAvPreMhVol90NF, setMaxAvPreMhVol90NF);
        applyStr(s.minAvPreMhValue20NF, setMinAvPreMhValue20NF); applyStr(s.maxAvPreMhValue20NF, setMaxAvPreMhValue20NF);
        applyStr(s.minAvPreMhValue90NF, setMinAvPreMhValue90NF); applyStr(s.maxAvPreMhValue90NF, setMaxAvPreMhValue90NF);
        applyStr(s.minAvgDailyValue20, setMinAvgDailyValue20); applyStr(s.maxAvgDailyValue20, setMaxAvgDailyValue20);
        applyStr(s.minAvgDailyValue90, setMinAvgDailyValue90); applyStr(s.maxAvgDailyValue90, setMaxAvgDailyValue90);
        applyStr(s.minVolatility20, setMinVolatility20); applyStr(s.maxVolatility20, setMaxVolatility20);
        applyStr(s.minVolatility90, setMinVolatility90); applyStr(s.maxVolatility90, setMaxVolatility90);
        applyStr(s.minVolRel, setMinVolRel); applyStr(s.maxVolRel, setMaxVolRel);
        applyStr(s.minPreMhBidLstPrcPct, setMinPreMhBidLstPrcPct); applyStr(s.maxPreMhBidLstPrcPct, setMaxPreMhBidLstPrcPct);
        applyStr(s.minPreMhLoLstPrcPct, setMinPreMhLoLstPrcPct); applyStr(s.maxPreMhLoLstPrcPct, setMaxPreMhLoLstPrcPct);
        applyStr(s.minPreMhHiLstClsPct, setMinPreMhHiLstClsPct); applyStr(s.maxPreMhHiLstClsPct, setMaxPreMhHiLstClsPct);
        applyStr(s.minPreMhLoLstClsPct, setMinPreMhLoLstClsPct); applyStr(s.maxPreMhLoLstClsPct, setMaxPreMhLoLstClsPct);
        applyStr(s.minLstPrcLstClsPct, setMinLstPrcLstClsPct); applyStr(s.maxLstPrcLstClsPct, setMaxLstPrcLstClsPct);
        applyStr(s.minImbExch925, setMinImbExch925); applyStr(s.maxImbExch925, setMaxImbExch925);
        applyStr(s.minImbExch1555, setMinImbExch1555); applyStr(s.maxImbExch1555, setMaxImbExch1555);
        applyStr(s.minImbARCA, setMinImbARCA); applyStr(s.maxImbARCA, setMaxImbARCA);
        applyStr(s.minImbExchValue, setMinImbExchValue); applyStr(s.maxImbExchValue, setMaxImbExchValue);

        if (typeof s.requireHasNews === "boolean") setRequireHasNews(s.requireHasNews);
        if (typeof s.excludeHasNews === "boolean") setExcludeHasNews(s.excludeHasNews);
        if (typeof s.requireHasReport === "boolean") setRequireHasReport(s.requireHasReport);
        if (typeof s.excludeHasReport === "boolean") setExcludeHasReport(s.excludeHasReport);
        if (typeof s.requireIsPTP === "boolean") setRequireIsPTP(s.requireIsPTP);
        if (typeof s.requireIsSSR === "boolean") setRequireIsSSR(s.requireIsSSR);
        if (typeof s.requireIsETF === "boolean") setRequireIsETF(s.requireIsETF);
        if (typeof s.requireIsCrap === "boolean") setRequireIsCrap(s.requireIsCrap);
        if (typeof s.excludeDividend === "boolean") setExcludeDividend(s.excludeDividend);
        if (typeof s.excludePTP === "boolean") setExcludePTP(s.excludePTP);
        if (typeof s.excludeSSR === "boolean") setExcludeSSR(s.excludeSSR);
        if (typeof s.excludeETF === "boolean") setExcludeETF(s.excludeETF);
        if (typeof s.excludeCrap === "boolean") setExcludeCrap(s.excludeCrap);
        // ITB/HARD/CORR reached the shared FilterFlagsRow but never the persistence, so these
        // three were the only toolbar toggles that silently reset on every reload.
        if (typeof s.excludeItb === "boolean") setExcludeItb(s.excludeItb);
        if (typeof s.excludeHard === "boolean") setExcludeHard(s.excludeHard);
        if (typeof s.excludeCorr === "boolean") setExcludeCorr(s.excludeCorr);
        // The raw input, not the clamped number: corrThreshold is derived from it.
        if (typeof s.corrThresholdInput === "string") setCorrThresholdInput(s.corrThresholdInput);
        if (typeof s.includeUSA === "boolean") setIncludeUSA(s.includeUSA);
        if (typeof s.includeChina === "boolean") setIncludeChina(s.includeChina);
    // useFilterRestore documents itself as a ONE-TIME read before first paint. These deps used to
    // include the controlled-mode props, which meant every PRE/OPEN/INTRA click on the Stream page
    // (session is controlled from there) re-ran the whole ~200-field restore and could stomp a
    // just-changed control (e.g. the DEV-unit button) with the last value written to storage,
    // if that write hadn't landed yet — the saved state "jumping" back after an unrelated click.
  }, []);

  // Declared here rather than beside the CORR memo below: persistedFilters reads it during
  // render, so it has to exist before that.
  const [corrThresholdInput, setCorrThresholdInput] = useState(String(SECTOR_CORR_DEFAULT));

  const persistedFilters = useMemo(
    () => ({
      primaryPanel,
      tab,
      ruleBand,
      zapMode,
      showSharedMinMax,
      dateMode,
      dateNy,
      dateFrom,
      dateTo,
      session,
      metric,
      closeMode,
      startAbs,
      startAbsMax,
      endAbs,
      minHoldCandles,
      startCutoffMinuteIdx: parseTimeToMinuteIdx(startCutoffTime),
      preStartMinuteIdx: preStartToMinuteIdx(),
      pnlMode,
      priceMode,
      sizingMode,
      sizeValue,
      // OpenDoor's own gate settings. These used to be plain component state that reset on every
      // reload, so "the filters I trade with" existed only until the tab was refreshed — and the
      // server engine, which reads them from the bridge, had nothing to read.
      openDoorExitClass,
      openDoorUseStack,
      openDoorUseBench,
      openDoorUseDevSig,
      openDoorIgnoreRatings,
      openDoorUseManualEntry,
      openDoorEntryBounds,
      openDoorUpMinRate,
      openDoorUpMinTotal,
      openDoorUpMinMove,
      openDoorDownMinRate,
      openDoorDownMinTotal,
      openDoorDownMinMove,
      dilutionMode,
      dilutionStep,
      maxAdds,
      addDelayMinutes,
      optimizerRangeRankMetric,
      optimizerRangeMinTrades,
      optimizerBucketCount,
      optimizerBinMode,
      includeEquityCurve,
      equityCurveMode,
      sharedRangeFilterModes,
      topN,
      scopeMode,
      offset,
      qTicker,
      qSide,
      listMode,
      showIgnore,
      showApply,
      showPin,
      episodesUseSearch,
      showAdvanced,
      ratingMode,
      topMode, topSigmaOn, topBenchOn, topTimeOn,
      ratingType,
      ratingRules,
      ratingEnabledBands,
      ignoreTickersText,
      tickersText,
      benchTickersText,
      sideFilter,
      exchangesText: Array.from(selExchanges),
      countriesText: Array.from(selCountries),
      sectorsL3Text: Array.from(selSectors),
      countryEnabled,
      exchangeEnabled,
      sectorEnabled,
      scopeBenchText,
      imbExchsText,
      minTierBp,
      maxTierBp,
      minCorr,
      maxCorr,
      minBeta,
      maxBeta,
      minSigma,
      maxSigma,
      minMarketCapM,
      maxMarketCapM,
      minRoundLot,
      maxRoundLot,
      minAdv20,
      maxAdv20,
      minAdv20NF,
      maxAdv20NF,
      minAdv90,
      maxAdv90,
      minAdv90NF,
      maxAdv90NF,
      minPreMktVol,
      maxPreMktVol,
      minPreMktVolNF,
      maxPreMktVolNF,
      // Stored under the state's own names: this object is read back by the restore effect and by
      // the shared-filter preset builder, both of which look for minSpread/maxSpread. Writing the
      // request-shaped minSpreadBidPct/maxSpreadBidPct instead meant the spread filter survived
      // neither a reload nor a saved preset.
      minSpread,
      maxSpread,
      minSpreadBps,
      maxSpreadBps,
      minGap,
      maxGap,
      minGapPct,
      maxGapPct,
      minClsToClsPct,
      maxClsToClsPct,
      minVWAP,
      maxVWAP,
      minLo,
      maxLo,
      minAvPreMhv,
      maxAvPreMhv,
      minLstPrcL,
      maxLstPrcL,
      minLstCls,
      maxLstCls,
      minYCls,
      maxYCls,
      minTCls,
      maxTCls,
      minLstClsNewsCnt,
      maxLstClsNewsCnt,
      minVolNFfromLstCls,
      maxVolNFfromLstCls,
      requireHasNews,
      excludeHasNews,
      // These were nulled here back when this object doubled as the request body. It is storage
      // only now — the request builders carry their own copies — so nulling just lost both report
      // toggles on every reload.
      requireHasReport,
      excludeHasReport,
      minNewsCnt,
      maxNewsCnt,
      requireIsPTP,
      requireIsSSR,
      requireIsETF,
      requireIsCrap,
      excludeDividend,
      excludePTP,
      excludeSSR,
      excludeETF,
      excludeCrap,
      excludeItb,
      excludeHard,
      excludeCorr,
      corrThresholdInput,
      includeUSA,
      includeChina,
      minMdnPreMhVol90,
      maxMdnPreMhVol90,
      minPreMhMDV90NF,
      maxPreMhMDV90NF,
      minPreMhMDV20NF,
      maxPreMhMDV20NF,
      minMdnPostMhVol90NF,
      maxMdnPostMhVol90NF,
      minAvPostMhVol90NF,
      maxAvPostMhVol90NF,
      minAvPreMhVol90NF,
      maxAvPreMhVol90NF,
      minAvPreMhValue20NF,
      maxAvPreMhValue20NF,
      minAvPreMhValue90NF,
      maxAvPreMhValue90NF,
      minAvgDailyValue20,
      maxAvgDailyValue20,
      minAvgDailyValue90,
      maxAvgDailyValue90,
      minVolatility20,
      maxVolatility20,
      minVolatility90,
      maxVolatility90,
      minVolRel,
      maxVolRel,
      minPreMhBidLstPrcPct,
      maxPreMhBidLstPrcPct,
      minPreMhLoLstPrcPct,
      maxPreMhLoLstPrcPct,
      minPreMhHiLstClsPct,
      maxPreMhHiLstClsPct,
      minPreMhLoLstClsPct,
      maxPreMhLoLstClsPct,
      minLstPrcLstClsPct,
      maxLstPrcLstClsPct,
      minImbExch925,
      maxImbExch925,
      minImbExch1555,
      maxImbExch1555,
      minImbARCA,
      maxImbARCA,
      minImbExchValue,
      maxImbExchValue,
    }),
    [
      primaryPanel, tab, ruleBand, zapMode, showSharedMinMax, dateMode, dateNy, dateFrom, dateTo,
      session, metric, closeMode, startAbs, startAbsMax, endAbs, minHoldCandles, startCutoffTime, preStartTime, priceMode, pnlMode,
      // Sizing/dilution/TOP/optimizer are read by the object above but were missing here, so
      // changing any of them left persistedFilters identical and the debounced write never fired —
      // they reached localStorage only by accident, whenever some other field changed next. On
      // OpenDoor sizeValue also goes to the server and is part of its cache variant key.
      sizingMode, sizeValue, dilutionMode, dilutionStep, maxAdds, addDelayMinutes,
      optimizerRangeRankMetric, optimizerRangeMinTrades, optimizerBucketCount, optimizerBinMode,
      topMode, topSigmaOn, topBenchOn, topTimeOn,
      includeEquityCurve, equityCurveMode, sharedRangeFilterModes, topN, scopeMode, offset,
      qTicker, qSide, listMode, showIgnore, showApply, showPin, episodesUseSearch, showAdvanced,
      ratingMode, ratingType, ratingRules, ratingEnabledBands, ignoreTickersText, tickersText, benchTickersText, sideFilter,
      selExchanges, selCountries, selSectors, countryEnabled, exchangeEnabled, sectorEnabled, scopeBenchText, imbExchsText, minTierBp, maxTierBp,
      minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma, minMarketCapM, maxMarketCapM, minRoundLot, maxRoundLot, minAdv20,
      maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF,
      minPreMktVol, maxPreMktVol, minPreMktVolNF, maxPreMktVolNF, minSpread, maxSpread,
      minSpreadBps, maxSpreadBps, minGap, maxGap, minGapPct, maxGapPct, minClsToClsPct,
      maxClsToClsPct, minVWAP, maxVWAP, minLo, maxLo, minAvPreMhv, maxAvPreMhv, minLstPrcL,
      maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls,
      minLstClsNewsCnt, maxLstClsNewsCnt, minVolNFfromLstCls, maxVolNFfromLstCls, requireHasNews, excludeHasNews, requireHasReport, excludeHasReport, minNewsCnt,
      maxNewsCnt, requireIsPTP, requireIsSSR, requireIsETF, requireIsCrap, excludeDividend, excludePTP,
      excludeSSR, excludeETF, excludeCrap, excludeItb, excludeHard, excludeCorr, corrThresholdInput, minMdnPreMhVol90, maxMdnPreMhVol90,
      includeUSA, includeChina,
      minPreMhMDV90NF, maxPreMhMDV90NF, minPreMhMDV20NF, maxPreMhMDV20NF,
      minMdnPostMhVol90NF, maxMdnPostMhVol90NF,
      minAvPostMhVol90NF, maxAvPostMhVol90NF,
      minAvPreMhVol90NF, maxAvPreMhVol90NF,
      minAvPreMhValue20NF, maxAvPreMhValue20NF, minAvPreMhValue90NF, maxAvPreMhValue90NF,
      minAvgDailyValue20, maxAvgDailyValue20, minAvgDailyValue90, maxAvgDailyValue90,
      minVolatility20, maxVolatility20, minVolatility90, maxVolatility90,
      minVolRel, maxVolRel,
      minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct, minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct,
      minPreMhHiLstClsPct, maxPreMhHiLstClsPct, minPreMhLoLstClsPct, maxPreMhLoLstClsPct,
      minLstPrcLstClsPct, maxLstPrcLstClsPct, minImbExch925, maxImbExch925, minImbExch1555, maxImbExch1555,
      minImbARCA, maxImbARCA,
      minImbExchValue, maxImbExchValue,
      openDoorExitClass, openDoorUseStack, openDoorUseBench, openDoorUseDevSig,
      openDoorIgnoreRatings, openDoorUseManualEntry, openDoorEntryBounds,
    openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove,
      openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    function loadScannerPresets() {
      try {
        const items = listSharedFilterLocalPresets()
          .filter((x) => {
            if (x.scope !== "BOTH") return false;
            try {
              return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
            } catch {
              return false;
            }
          });
        if (cancelled) return;
        setScannerPresets(items);
        setScannerPresetId((prev) => {
          const candidate = prev || (() => {
            try {
              return localStorage.getItem(presetIdLsKey) ?? "";
            } catch {
              return "";
            }
          })();
          if (candidate === "") return "";
          return items.some((x) => x.id === candidate) ? candidate : "";
        });
      } catch {
        if (!cancelled) setScannerPresets([]);
      }
    }

    loadScannerPresets();
    window.addEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, loadScannerPresets as EventListener);
    window.addEventListener("focus", loadScannerPresets);
    return () => {
      cancelled = true;
      window.removeEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, loadScannerPresets as EventListener);
      window.removeEventListener("focus", loadScannerPresets);
    };
  }, []);

  const buildScannerSharedFilterPresetJson = () =>
    JSON.stringify({
      version: 1,
      presetType: "shared-filters",
      filters: Object.fromEntries(
        SHARED_FILTER_PRESET_FIELDS.map(({ key, scannerMin, scannerMax }) => [
          key,
          {
            mode: sharedRangeFilterModes[key] === "off" ? "off" : "on",
            min: String((persistedFilters as Record<string, any>)[scannerMin] ?? ""),
            max: String((persistedFilters as Record<string, any>)[scannerMax] ?? ""),
          },
        ])
      ),
    });

  useEffect(() => {
    try {
      if (scannerPresetId) {
        localStorage.setItem(presetIdLsKey, scannerPresetId);
      } else {
        localStorage.removeItem(presetIdLsKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [scannerPresetId]);

  const scannerSharedFilterSetters = {
    minCorr: setMinCorr,
    maxCorr: setMaxCorr,
    minBeta: setMinBeta,
    maxBeta: setMaxBeta,
    minSigma: setMinSigma,
    maxSigma: setMaxSigma,
    minAdv20: setMinAdv20,
    maxAdv20: setMaxAdv20,
    minAdv20NF: setMinAdv20NF,
    maxAdv20NF: setMaxAdv20NF,
    minAdv90: setMinAdv90,
    maxAdv90: setMaxAdv90,
    minAdv90NF: setMinAdv90NF,
    maxAdv90NF: setMaxAdv90NF,
    minAvPreMhv: setMinAvPreMhv,
    maxAvPreMhv: setMaxAvPreMhv,
    minRoundLot: setMinRoundLot,
    maxRoundLot: setMaxRoundLot,
    minVWAP: setMinVWAP,
    maxVWAP: setMaxVWAP,
    minSpread: setMinSpread,
    maxSpread: setMaxSpread,
    minLstPrcL: setMinLstPrcL,
    maxLstPrcL: setMaxLstPrcL,
    minLstCls: setMinLstCls,
    maxLstCls: setMaxLstCls,
    minYCls: setMinYCls,
    maxYCls: setMaxYCls,
    minTCls: setMinTCls,
    maxTCls: setMaxTCls,
    minClsToClsPct: setMinClsToClsPct,
    maxClsToClsPct: setMaxClsToClsPct,
    minLo: setMinLo,
    maxLo: setMaxLo,
    minLstClsNewsCnt: setMinLstClsNewsCnt,
    maxLstClsNewsCnt: setMaxLstClsNewsCnt,
    minMarketCapM: setMinMarketCapM,
    maxMarketCapM: setMaxMarketCapM,
    minPreMktVolNF: setMinPreMktVolNF,
    maxPreMktVolNF: setMaxPreMktVolNF,
    minVolNFfromLstCls: setMinVolNFfromLstCls,
    maxVolNFfromLstCls: setMaxVolNFfromLstCls,
    minAvPostMhVol90NF: setMinAvPostMhVol90NF,
    maxAvPostMhVol90NF: setMaxAvPostMhVol90NF,
    minAvPreMhVol90NF: setMinAvPreMhVol90NF,
    maxAvPreMhVol90NF: setMaxAvPreMhVol90NF,
    minAvPreMhValue20NF: setMinAvPreMhValue20NF,
    maxAvPreMhValue20NF: setMaxAvPreMhValue20NF,
    minAvPreMhValue90NF: setMinAvPreMhValue90NF,
    maxAvPreMhValue90NF: setMaxAvPreMhValue90NF,
    minAvgDailyValue20: setMinAvgDailyValue20,
    maxAvgDailyValue20: setMaxAvgDailyValue20,
    minAvgDailyValue90: setMinAvgDailyValue90,
    maxAvgDailyValue90: setMaxAvgDailyValue90,
    minVolatility20: setMinVolatility20,
    maxVolatility20: setMaxVolatility20,
    minVolatility90: setMinVolatility90,
    maxVolatility90: setMaxVolatility90,
    minPreMhMDV20NF: setMinPreMhMDV20NF,
    maxPreMhMDV20NF: setMaxPreMhMDV20NF,
    minPreMhMDV90NF: setMinPreMhMDV90NF,
    maxPreMhMDV90NF: setMaxPreMhMDV90NF,
    minVolRel: setMinVolRel,
    maxVolRel: setMaxVolRel,
    minPreMhBidLstPrcPct: setMinPreMhBidLstPrcPct,
    maxPreMhBidLstPrcPct: setMaxPreMhBidLstPrcPct,
    minPreMhLoLstPrcPct: setMinPreMhLoLstPrcPct,
    maxPreMhLoLstPrcPct: setMaxPreMhLoLstPrcPct,
    minPreMhHiLstClsPct: setMinPreMhHiLstClsPct,
    maxPreMhHiLstClsPct: setMaxPreMhHiLstClsPct,
    minPreMhLoLstClsPct: setMinPreMhLoLstClsPct,
    maxPreMhLoLstClsPct: setMaxPreMhLoLstClsPct,
    minLstPrcLstClsPct: setMinLstPrcLstClsPct,
    maxLstPrcLstClsPct: setMaxLstPrcLstClsPct,
    minImbExch925: setMinImbExch925,
    maxImbExch925: setMaxImbExch925,
    minImbExch1555: setMinImbExch1555,
    maxImbExch1555: setMaxImbExch1555,
  } as const;

  const clearScannerSharedFilters = () => {
    setScannerPresetId("");
    setScannerPresetStatus("");
    const base = {
      ...persistedFilters,
      sharedRangeFilterModes: { ...DEFAULT_SHARED_RANGE_FILTER_MODES },
    } as Record<string, any>;

    for (const { scannerMin, scannerMax } of SHARED_FILTER_PRESET_FIELDS) {
      base[scannerMin] = "";
      base[scannerMax] = "";
      scannerSharedFilterSetters[scannerMin]("");
      scannerSharedFilterSetters[scannerMax]("");
    }
    setSharedRangeFilterModes({ ...DEFAULT_SHARED_RANGE_FILTER_MODES });

    try {
      localStorage.setItem(filtersLsKey, JSON.stringify(base));
      setScannerPresetStatus("Cleared");
    } catch {
      setScannerPresetStatus("Clear failed");
    }
  };

  const applyScannerPreset = (preset: PresetDto) => {
    try {
      const parsed = JSON.parse(preset.configJson ?? "{}");
      if (!isSharedFilterPreset(parsed)) return false;
      let base: Record<string, any> = {};
      try {
        base = JSON.parse(localStorage.getItem(filtersLsKey) ?? JSON.stringify(persistedFilters));
      } catch {
        base = { ...persistedFilters };
      }
      const next = {
        ...base,
        sharedRangeFilterModes: {
          ...DEFAULT_SHARED_RANGE_FILTER_MODES,
          ...(base?.sharedRangeFilterModes && typeof base.sharedRangeFilterModes === "object" ? base.sharedRangeFilterModes : {}),
        },
      } as Record<string, any>;

      for (const { key, scannerMin, scannerMax } of SHARED_FILTER_PRESET_FIELDS) {
        const filter = parsed.filters?.[key];
        if (!filter || typeof filter !== "object") continue;
        next.sharedRangeFilterModes[key] = filter.mode === "off" ? "off" : "on";
        next[scannerMin] = typeof filter.min === "string" ? filter.min : String(filter.min ?? "");
        next[scannerMax] = typeof filter.max === "string" ? filter.max : String(filter.max ?? "");
      }

      localStorage.setItem(filtersLsKey, JSON.stringify(next));
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  };

  const saveCurrentScannerPreset = async (presetName?: string) => {
    const name = presetName?.trim();
    if (!name) return;

    setScannerPresetBusy(true);
    setScannerPresetStatus("");
    try {
      saveSharedFilterLocalPreset(name, buildScannerSharedFilterPresetJson());
      const items = listSharedFilterLocalPresets()
        .filter((x) => {
          if (x.scope !== "BOTH") return false;
          try {
            return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
          } catch {
            return false;
          }
        });
      setScannerPresets(items);
      setScannerPresetId(items[0]?.id ?? "");
      setScannerPresetDraftName("");
      setScannerPresetSaveMode(false);
      setScannerPresetStatus("Shared filters saved");
    } catch {
      setScannerPresetStatus("Save failed");
    } finally {
      setScannerPresetBusy(false);
    }
  };

  // Debounced write + unmount flush, shared with the other scanners. OpenDoor wrote
  // synchronously on every change and never flushed on unmount - it never received the
  // debounce Arbitrage got, so a ~200-field payload was serialised on each keystroke.
  usePersistedFilters(filtersLsKey, persistedFilters, filtersHydratedRef, filtersRestoringRef);

  const derivedStreamSignalClass = useMemo(() => {
    if (ruleBand === "GLOBAL") return "global";
    return ruleBand.toLowerCase();
  }, [ruleBand]);
  const streamSignalClass = streamExecutionDescriptorOverride?.signalClass ?? derivedStreamSignalClass;

  const derivedStreamRatingRule = useMemo(() => {
    return ratingRules.find((r) => r.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 };
  }, [ratingRules, ruleBand]);
  const streamRatingRule = streamExecutionDescriptorOverride?.ratingRule ?? derivedStreamRatingRule;

  const streamFilterConfig = useMemo<ArbitrageFilterConfigV1>(() => {
    const mm = (minRaw: string, maxRaw: string) => {
      const min = optNumOrNull(minRaw);
      const max = optNumOrNull(maxRaw);
      if (min == null && max == null) return undefined;
      return {
        ...(min != null ? { min } : {}),
        ...(max != null ? { max } : {}),
      };
    };

    const applyTickers = splitListUpper(tickersText);
    const ignoreTickers = splitListUpper(ignoreTickersText);
    const pinnedTickers = splitListUpper(benchTickersText);
    const countries = Array.from(selCountries);
    const exchanges = Array.from(selExchanges);
    const sectors = Array.from(selSectors);

    return buildStreamFilterConfig({
      signalClass: streamSignalClass,
      ratingType,
      minRate: streamRatingRule.minRate,
      minTotal: streamRatingRule.minTotal,
      listMode,
      ignoreTickers,
      applyTickers,
      pinnedTickers,
      bounds: {
        ADV20: mm(minAdv20, maxAdv20),
        ADV20NF: mm(minAdv20NF, maxAdv20NF),
        ADV90: mm(minAdv90, maxAdv90),
        ADV90NF: mm(minAdv90NF, maxAdv90NF),
        AvPreMhv: mm(minAvPreMhv, maxAvPreMhv),
        RoundLot: mm(minRoundLot, maxRoundLot),
        VWAP: mm(minVWAP, maxVWAP),
        SpreadBidPct: mm(minSpread, maxSpread),
        LstPrcL: mm(minLstPrcL, maxLstPrcL),
        LstCls: mm(minLstCls, maxLstCls),
        YCls: mm(minYCls, maxYCls),
        TCls: mm(minTCls, maxTCls),
        ClsToClsPct: mm(minClsToClsPct, maxClsToClsPct),
        Lo: mm(minLo, maxLo),
        LstClsNewsCnt: mm(minLstClsNewsCnt, maxLstClsNewsCnt),
        MarketCapM: mm(minMarketCapM, maxMarketCapM),
        PreMhVolNF: mm(minPreMktVolNF, maxPreMktVolNF),
        VolNFfromLstCls: mm(minVolNFfromLstCls, maxVolNFfromLstCls),
        AvPostMhVol90NF: mm(minAvPostMhVol90NF, maxAvPostMhVol90NF),
        AvPreMhVol90NF: mm(minAvPreMhVol90NF, maxAvPreMhVol90NF),
        AvPreMhValue20NF: mm(minAvPreMhValue20NF, maxAvPreMhValue20NF),
        AvPreMhValue90NF: mm(minAvPreMhValue90NF, maxAvPreMhValue90NF),
        AvgDailyValue20: mm(minAvgDailyValue20, maxAvgDailyValue20),
        AvgDailyValue90: mm(minAvgDailyValue90, maxAvgDailyValue90),
        Volatility20: mm(minVolatility20, maxVolatility20),
        Volatility90: mm(minVolatility90, maxVolatility90),
        PreMhMDV20NF: mm(minPreMhMDV20NF, maxPreMhMDV20NF),
        PreMhMDV90NF: mm(minPreMhMDV90NF, maxPreMhMDV90NF),
        VolRel: mm(minVolRel, maxVolRel),
      },
      exclude: {
        dividend: excludeDividend,
        news: excludeHasNews,
        ptp: excludePTP,
        ssr: excludeSSR,
        report: excludeHasReport,
        etf: excludeETF,
        crap: excludeCrap,
      },
      include: {
        usaOnly: includeUSA,
        chinaOnly: includeChina,
      },
      multi: {
        countries,
        exchanges,
        sectors,
      },
      reportMode: requireHasReport ? "YES" : excludeHasReport ? "NO" : "ALL",
      zapMode: metric === "SigmaZap" ? "sigma" : "zap",
      zapThresholdAbs: startAbs,
    });
  }, [
    streamSignalClass,
    ratingType,
    streamRatingRule,
    listMode,
    scopeMode,
    ignoreTickersText,
    tickersText,
    benchTickersText,
    minAdv20, maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF,
    minAvPreMhv, maxAvPreMhv, minRoundLot, maxRoundLot, minVWAP, maxVWAP, minSpread, maxSpread,
    minLstPrcL, maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls,
    minClsToClsPct, maxClsToClsPct, minLo, maxLo, minLstClsNewsCnt, maxLstClsNewsCnt,
    minMarketCapM, maxMarketCapM, minPreMktVolNF, maxPreMktVolNF, minVolNFfromLstCls, maxVolNFfromLstCls,
    minAvPostMhVol90NF, maxAvPostMhVol90NF, minAvPreMhVol90NF, maxAvPreMhVol90NF,
    minAvPreMhValue20NF, maxAvPreMhValue20NF, minAvPreMhValue90NF, maxAvPreMhValue90NF,
    minAvgDailyValue20, maxAvgDailyValue20, minAvgDailyValue90, maxAvgDailyValue90,
    minVolatility20, maxVolatility20, minVolatility90, maxVolatility90, minVolRel, maxVolRel,
    minPreMhMDV20NF, maxPreMhMDV20NF, minPreMhMDV90NF, maxPreMhMDV90NF,
    excludeDividend, excludeHasNews, excludePTP, excludeSSR, excludeHasReport, excludeETF, excludeCrap,
    includeUSA, includeChina, selCountries, selExchanges, selSectors, metric, startAbs,
  ]);

  // Mirror the operator's saved filter state onto the bridge, which is where the server-side engine
  // reads it at 09:20 — it has to gate on the tuned values, not on descriptor defaults, and it must
  // keep doing so with no tab open. Both halves go in one PUT: the rating-gate values AND the rest
  // of the toolbar (`streamFilterConfig`, the very config the browser engine filters live rows
  // with), so the two can never drift apart on the server.
  //
  // Debounced because these are steppers and text boxes: typing a MINRATE or a bound would
  // otherwise be one PUT per keystroke.
  //
  // Only the hydration guard, deliberately: unlike the localStorage write this must also fire ONCE
  // on mount, or a bridge that has never been pushed to would keep running on defaults until the
  // operator happened to touch a control. The debounce is what makes that safe — the restore's own
  // re-render cancels the pending timer before it can send pre-restore values.
  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void pushOpenDoorLiveParams({
        exitClass: openDoorExitClass,
        useStack: openDoorUseStack,
        useBench: openDoorUseBench,
        useDevSig: openDoorUseDevSig,
        upMinRate: openDoorUpMinRate,
        upMinTotal: openDoorUpMinTotal,
        upMinMove: openDoorUpMinMove,
        downMinRate: openDoorDownMinRate,
        downMinTotal: openDoorDownMinTotal,
        downMinMove: openDoorDownMinMove,
        sizeValue: normalizeScannerSizeValue(sizingMode, sizeValue),
        filters: toOpenDoorLiveFilters(streamFilterConfig, {
          countries: countryEnabled,
          exchanges: exchangeEnabled,
          sectors: sectorEnabled,
        }),
        source: "opendoor-scanner",
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    openDoorExitClass, openDoorUseStack, openDoorUseBench, openDoorUseDevSig,
    openDoorIgnoreRatings, openDoorUseManualEntry, openDoorEntryBounds,
    openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove,
    openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove,
    sizingMode, sizeValue, streamFilterConfig,
    countryEnabled, exchangeEnabled, sectorEnabled,
  ]);

  // Which session a row's report marker is judged against. The marker carries only day/month, so
  // it only means anything relative to a date: for the Scanner that is the tape day the row came
  // from, never "today". Rows carry their own `dateNy`; the selected day is the fallback for any
  // row that predates the server projecting it.
  const fallbackSessionDay = useMemo(
    () => parseSessionDay(dateMode === "day" ? dateNy : dateTo || dateFrom || dateNy),
    [dateMode, dateNy, dateFrom, dateTo]
  );
  const reportSessionForRow = useCallback(
    (row: any) => parseSessionDay(row?.dateNy ?? row?.date ?? row?.tradeDateNy) ?? fallbackSessionDay,
    [fallbackSessionDay]
  );

  // CORR: drop names correlated with today's reporting tickers. Seeds are the whole sample this
  // surface knows about — episodes plus the live active set — evaluated with the same report rule
  // the REP button uses. The correlation table itself lives on the bridge (86 MB).
  const corrThreshold = useMemo(
    () => clampSectorCorrThreshold(parseSectorCorrThreshold(corrThresholdInput) ?? SECTOR_CORR_DEFAULT),
    [corrThresholdInput]
  );
  // Active-ticker card: read-only follower of the Sonar's selection. See lib/filters/activeTicker.
  const activeSelection = useActiveTickerSelection(ACTIVE_TICKER_STRATEGY);
  const activeSnapshot = useActiveTickerSnapshot(activeSelection.ticker);
  const activeCardStats = useMemo(() => {
    const f = activeSnapshot.fields ?? {};
    const pick = (key: string) => {
      const v = (f as any)[key];
      return v == null || String(v).trim() === "" ? "-" : String(v);
    };
    return [
      { label: "Exchange", value: pick("Exchange") },
      { label: "Bench", value: pick("Bench") },
      { label: "Beta", value: pick("Beta") },
      { label: "Sig", value: pick("Sig") },
      { label: "SpreadBid%", value: pick("SpreadBid%") },
    ];
  }, [activeSnapshot.fields]);

  const corrSeedRows = useMemo(
    () => [...(episodesRows as any[]), ...(activeRows as any[])],
    [episodesRows, activeRows]
  );
  const sectorCorr = useSectorCorrExclusion(corrSeedRows, excludeCorr, corrThreshold, reportSessionForRow);

  const streamExactSonarFilterSnapshot = useMemo<SonarExactFilterSnapshot>(() => {
    const mm = (key: SharedRangeFilterKey, minRaw: string, maxRaw: string) => ({
      min: rangeValueOrNull(key, minRaw),
      max: rangeValueOrNull(key, maxRaw),
    });
    const scopeModeForSnapshot = scopeMode === "TOP" ? "top" : "all";

      const pinMap = Object.fromEntries(splitListUpper(benchTickersText).map((ticker) => [ticker, "cyan"]));

      return {
        // No Arbitrage rating anywhere: zero floors so neither the server nor the client filter
        // can reject on it, plus the explicit skip so the BIN/BINS lookups (which reject a ticker
        // merely for having no Arbitrage bin data) never run either.
        cls: OPEN_DOOR_CLS,
        type: ratingType ?? "any",
        mode: scopeModeForSnapshot,
        ratingMode,
        skipArbitrageRating: true,
        minRate: OPEN_DOOR_NO_ARB_RATE,
        minTotal: OPEN_DOOR_NO_ARB_TOTAL,
        tickersFilterNorm: splitListUpper(tickersText).join(","),
        listMode,
        ignoreSet: new Set(splitListUpper(ignoreTickersText)),
        applySet: new Set(splitListUpper(tickersText)),
        pinMap,
        bounds: {
        Corr: mm("corr", minCorr, maxCorr),
        Beta: mm("beta", minBeta, maxBeta),
        Sigma: mm("sigma", minSigma, maxSigma),
        ADV20: mm("adv20", minAdv20, maxAdv20),
        ADV20NF: mm("adv20nf", minAdv20NF, maxAdv20NF),
        ADV90: mm("adv90", minAdv90, maxAdv90),
        ADV90NF: mm("adv90nf", minAdv90NF, maxAdv90NF),
        AvPreMhv: mm("avpremhv", minAvPreMhv, maxAvPreMhv),
        RoundLot: mm("roundlot", minRoundLot, maxRoundLot),
        VWAP: mm("vwap", minVWAP, maxVWAP),
        SpreadBidPct: mm("spread", minSpread, maxSpread),
        LstPrcL: mm("lstprcl", minLstPrcL, maxLstPrcL),
        LstCls: mm("lstcls", minLstCls, maxLstCls),
        YCls: mm("ycls", minYCls, maxYCls),
        TCls: mm("tcls", minTCls, maxTCls),
        ClsToClsPct: mm("clstocls", minClsToClsPct, maxClsToClsPct),
        Lo: mm("lo", minLo, maxLo),
        LstClsNewsCnt: mm("lstclsnewscnt", minLstClsNewsCnt, maxLstClsNewsCnt),
        MarketCapM: mm("marketcapm", minMarketCapM, maxMarketCapM),
        PreMhVolNF: mm("premhvolnf", minPreMktVolNF, maxPreMktVolNF),
        VolNFfromLstCls: mm("volnffromlstcls", minVolNFfromLstCls, maxVolNFfromLstCls),
        AvPostMhVol90NF: mm("avpostmhvol90nf", minAvPostMhVol90NF, maxAvPostMhVol90NF),
        AvPreMhVol90NF: mm("avpremhvol90nf", minAvPreMhVol90NF, maxAvPreMhVol90NF),
        AvPreMhValue20NF: mm("avpremhvalue20nf", minAvPreMhValue20NF, maxAvPreMhValue20NF),
        AvPreMhValue90NF: mm("avpremhvalue90nf", minAvPreMhValue90NF, maxAvPreMhValue90NF),
        AvgDailyValue20: mm("avgdailyvalue20", minAvgDailyValue20, maxAvgDailyValue20),
        AvgDailyValue90: mm("avgdailyvalue90", minAvgDailyValue90, maxAvgDailyValue90),
        Volatility20: mm("volatility20", minVolatility20, maxVolatility20),
        Volatility90: mm("volatility90", minVolatility90, maxVolatility90),
        PreMhMDV20NF: mm("premhmdv20nf", minPreMhMDV20NF, maxPreMhMDV20NF),
        PreMhMDV90NF: mm("premhmdv90nf", minPreMhMDV90NF, maxPreMhMDV90NF),
        VolRel: mm("volrel", minVolRel, maxVolRel),
        PreMhBidLstPrcPct: mm("premhbidlstprc", minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct),
        PreMhLoLstPrcPct: mm("premhlolstprc", minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct),
        PreMhHiLstClsPct: mm("premhhilstcls", minPreMhHiLstClsPct, maxPreMhHiLstClsPct),
        PreMhLoLstClsPct: mm("premhlolstcls", minPreMhLoLstClsPct, maxPreMhLoLstClsPct),
        LstPrcLstClsPct: mm("lstprclstcls", minLstPrcLstClsPct, maxLstPrcLstClsPct),
        ImbExch925: mm("imbexch925", minImbExch925, maxImbExch925),
        ImbExch1555: mm("imbexch1555", minImbExch1555, maxImbExch1555),
      },
      excludeDividend: excludeDividend,
      excludeNews: excludeHasNews,
      excludePTP: excludePTP,
      excludeSSR: excludeSSR,
      excludeReport: excludeHasReport,
      excludeETF: excludeETF,
      excludeCrap: excludeCrap,
      excludeItb: excludeItb,
      excludeHard: excludeHard,
      excludeCorr: excludeCorr,
      corrExcluded: sectorCorr.excluded,
      activeMode: "off",
      includeUSA: includeUSA,
      includeChina: includeChina,
      selCountries: selCountries,
      countryEnabled,
      selExchanges: selExchanges,
      exchangeEnabled,
      selSectors: selSectors,
      sectorEnabled,
      filterReport: requireHasReport ? "YES" : excludeHasReport ? "NO" : "ALL",
      equityType: "",
      corrMin: minCorr,
      corrMax: maxCorr,
      betaMin: minBeta,
      betaMax: maxBeta,
      sigmaMin: minSigma,
      sigmaMax: maxSigma,
      zapMode: zapMode,
      zapShowAbs: startAbs,
      zapSilverAbs: optNumOrNull(startAbsMax) ?? 0,
      zapGoldAbs: Math.max(0, Number(endAbs) || 0),
      topMode,
      topSigmaOn,
      topBenchOn,
      topTimeOn,
    };
  }, [
      benchTickersText,
      topMode, topSigmaOn, topBenchOn, topTimeOn,
      selCountries, countryEnabled,
      selExchanges, exchangeEnabled,
      selSectors, sectorEnabled,
      endAbs,
      excludeDividend,
      excludeCrap,
      excludeItb,
      excludeHard,
      excludeCorr,
      sectorCorr.excluded,
      excludeETF,
      excludeHasNews,
      excludeHasReport,
      excludePTP,
      excludeSSR,
      includeChina,
      includeUSA,
      ignoreTickersText,
      listMode,
      maxAdv20,
      maxAdv20NF,
      maxAdv90,
      maxAdv90NF,
      maxAvgDailyValue20,
      maxAvgDailyValue90,
      maxAvPostMhVol90NF,
      maxAvPreMhValue20NF,
      maxAvPreMhValue90NF,
      maxAvPreMhVol90NF,
      maxAvPreMhv,
      maxBeta,
      maxCorr,
      maxImbExch1555,
      maxImbExch925,
      maxLo,
      maxLstCls,
      maxLstClsNewsCnt,
      maxLstPrcL,
      maxLstPrcLstClsPct,
    maxMarketCapM,
    maxPreMhBidLstPrcPct,
    maxPreMhHiLstClsPct,
    maxPreMhLoLstClsPct,
    maxPreMhLoLstPrcPct,
    maxPreMhMDV20NF,
    maxPreMhMDV90NF,
    maxPreMktVolNF,
    maxRoundLot,
    maxSigma,
    maxSpread,
    maxTCls,
    maxVolNFfromLstCls,
    maxVolRel,
    maxVolatility20,
    maxVolatility90,
    maxVWAP,
    maxYCls,
    metric,
    ratingMode,
    minAdv20,
    minAdv20NF,
    minAdv90,
    minAdv90NF,
    minAvgDailyValue20,
    minAvgDailyValue90,
    minAvPostMhVol90NF,
    minAvPreMhValue20NF,
    minAvPreMhValue90NF,
    minAvPreMhVol90NF,
    minAvPreMhv,
    minBeta,
    minCorr,
    minImbExch1555,
    minImbExch925,
    minLo,
    minLstCls,
    minLstClsNewsCnt,
    minLstPrcL,
    minLstPrcLstClsPct,
    minMarketCapM,
    minPreMhBidLstPrcPct,
    minPreMhHiLstClsPct,
    minPreMhLoLstClsPct,
    minPreMhLoLstPrcPct,
    minPreMhMDV20NF,
    minPreMhMDV90NF,
    minPreMktVolNF,
    minRoundLot,
    minSigma,
    minSpread,
    minTCls,
    minVolNFfromLstCls,
    minVolRel,
    minVolatility20,
    minVolatility90,
    minVWAP,
    minYCls,
      streamRatingRule.minRate,
      streamRatingRule.minTotal,
      streamSignalClass,
      ratingType,
      startAbs,
      tickersText,
      zapMode,
      sharedRangeFilterModes,
    ]);

  const effectiveStreamAutomationConfig = useMemo<StreamAutomationConfig>(() => ({
    strategyModeEnabled: streamAutomationConfigOverride?.strategyModeEnabled ?? false,
    minNetEdge: streamAutomationConfigOverride?.minNetEdge ?? 0,
    endSignalThreshold: streamAutomationConfigOverride?.endSignalThreshold ?? Math.max(0, Number(endAbs) || 0),
    maxOpenPositions: streamAutomationConfigOverride?.maxOpenPositions ?? 10,
    // Unconditional — see ArbitrageScanner.tsx for why: maxAdds must always reflect the visible
    // shared toolbar field, never streamAutomationConfigOverride's own isolated default.
    maxAdds,
    queueDelayMinSeconds: streamAutomationConfigOverride?.queueDelayMinSeconds ?? 0,
    queueDelayMaxSeconds: streamAutomationConfigOverride?.queueDelayMaxSeconds ?? 0,
    exitExecutionMode: closeMode === "Passive" ? "passive" : "active",
    hedgeMode: pnlMode === "Hedged" ? "hedged" : "unhedged",
    scaleMode: dilutionMode === "Diluted" ? "scale_in" : "single",
    sizingMode: sizingMode === "Tier" ? "TIER" : "USD",
    sizeValue,
    dilutionStep,
    addDelayMinutes,
    minHoldMinutes: minHoldCandles,
    exitMode: streamAutomationConfigOverride?.exitMode ?? "normalize",
    printStartTime: streamAutomationConfigOverride?.printStartTime ?? "09:20",
    printCloseTime: streamAutomationConfigOverride?.printCloseTime ?? "09:30",
    noSpreadExit: streamAutomationConfigOverride?.noSpreadExit ?? true,
    betaMode: streamAutomationConfigOverride?.betaMode ?? false,
    startCutoffTime,
    entryStopTime: streamAutomationConfigOverride?.entryStopTime,
    preStartTime,
  }), [
    addDelayMinutes,
    closeMode,
    dilutionMode,
    dilutionStep,
    endAbs,
    maxAdds,
    minHoldCandles,
    streamAutomationConfigOverride,
    pnlMode,
    sizeValue,
    sizingMode,
    startCutoffTime,
    preStartTime,
  ]);

  const streamTrackedSignalsEnabled =
    !isStreamOnlyShell ||
    tab !== "active" ||
    streamViewModeOverride === "auto" ||
    Boolean(streamAutoEnabledOverride) ||
    Boolean(streamAutoStartEnabledOverride) ||
    Boolean(effectiveStreamAutomationConfig.strategyModeEnabled);

  // The OpenDoor stream must receive the SAME universe OpenDoor Sonar does, or the shared gate
  // still judges different sets of tickers. Sonar asks the server with cls="global", minRate=0.3,
  // minTotal=1 and — critically — NO startAbs: its entry rule is the per-bin gate, not a sigma
  // floor, so a server-side sigma threshold would silently narrow the universe before the gate
  // ever sees it. These mirror OpenDoorSonar's own defaults and must be changed together with it.
  const openDoorSignalsRequest = useMemo(() => ({
    cls: OPEN_DOOR_CLS,
    minRate: OPEN_DOOR_NO_ARB_RATE,
    minTotal: OPEN_DOOR_NO_ARB_TOTAL,
    omitStartAbs: true,
  }), []);

  // Same rule, same function, same rows as OpenDoor Sonar — see lib/opendoor/gate.ts for why it
  // is not duplicated here. The scanner has no ADVANCED toggle (that is a Sonar-only view), so
  // the standard 09:20 bin columns are always the ones read.
  const openDoorStreamGate = useCallback(
    (signal: any) => matchOpenDoorGate(
      openDoorRatingByTicker[String(signal?.ticker ?? "").toUpperCase().trim()],
      readOpenDoorGateValues(signal),
      {
        exitClass: openDoorExitClass,
        advancedMode: false,
        useStack: openDoorUseStack,
        useBench: openDoorUseBench,
        useDevSig: openDoorUseDevSig,
        upMinRate: openDoorUpMinRate,
        upMinTotal: openDoorUpMinTotal,
        upMinMove: openDoorUpMinMove,
        downMinRate: openDoorDownMinRate,
        downMinTotal: openDoorDownMinTotal,
        downMinMove: openDoorDownMinMove,
      }
    ),
    [openDoorRatingByTicker, openDoorExitClass, openDoorUseStack, openDoorUseBench, openDoorUseDevSig,
     openDoorIgnoreRatings, openDoorUseManualEntry, openDoorEntryBounds,
    openDoorUpMinRate, openDoorUpMinTotal, openDoorUpMinMove,
     openDoorDownMinRate, openDoorDownMinTotal, openDoorDownMinMove]
  );

  const {
    streamEntryReadyCount,
    streamAutoEnabled,
    streamSessionStartedAt,
    streamSessionStoppedAt,
    streamSentOrdersCount,
    setStreamAutoEnabled,
    streamManualExecutionBusy,
    bindStreamWindows,
    clearStreamBoundWindow,
    streamBookReading,
    setStreamBookReading,
    refreshStreamBookReading,
    captureStreamTickerPoint,
    captureStreamTickerPointDelayed,
    clearStreamTickerPoint,
    toggleStreamPanicOff,
    startStreamAutomation,
    clearStreamExecutionQueue,
    stopStreamAutomation,
    resetStreamAutomationState,
    dismissStreamActivePositions,
    submitManualStreamOrders,
    refresh: refreshStreamSignals,
  } = useStreamEngine({
    // OpenDoor's real gate is per-bin, per-direction, at the selected exit horizon — a rule the
    // Arbitrage-shaped session rating cannot express, which is why the stream tab used to show
    // hundreds of candidates where Sonar showed single digits. This runs the SAME function Sonar
    // filters with (lib/opendoor/gate.ts) over the SAME SSE rows, so the two agree exactly.
    signalGate: openDoorStreamGate,
    // OpenDoor ends its session with a single Ctrl+E at CUTOFF, not Arbitrage's Ctrl+Q -> Ctrl+O.
    cutoffAction: "exit-all" as const,
    signalsRequest: openDoorSignalsRequest,
    enabled: primaryPanel === "stream",
    ocrEnabled: streamViewModeOverride === "auto" || (streamViewModeOverride === "stream-auto-tab" && (tab === "analytics" || tab === "episodes")),
    trackedSignalsEnabled: streamTrackedSignalsEnabled,
    initialAutoEnabled: streamAutoStartEnabledOverride ?? (streamViewModeOverride === "auto"),
    signalClass: streamSignalClass,
    ruleBand,
    ratingType,
    metric,
    ratingRule: { minRate: streamRatingRule.minRate, minTotal: streamRatingRule.minTotal },
    startAbs,
    startAbsMax: optNumOrNull(startAbsMax),
    endAbs,
    closeMode,
    minHoldCandles,
    ratingMode,
    session,
    ratingMinRate: streamRatingRule.minRate,
    ratingMinTotal: streamRatingRule.minTotal,
    tickersCsv: splitListUpper(tickersText).join(",") || undefined,
    minCorr: optNumOrNull(minCorr),
    maxCorr: optNumOrNull(maxCorr),
    minBeta: optNumOrNull(minBeta),
    maxBeta: optNumOrNull(maxBeta),
    minSigma: optNumOrNull(minSigma),
    maxSigma: optNumOrNull(maxSigma),
    sideFilter: sideFilter || undefined,
    filterConfig: streamFilterConfig,
    exactSonarFilterSnapshot: streamExactSonarFilterSnapshot,
    maxSpreadValue: maxSpread,
    automationConfig: effectiveStreamAutomationConfig,
    activeScannerTickers: activeRows.map((r) => ({
      ticker: r.ticker,
      side: normalizeSide(r.side).isLong ? "Long" : "Short" as "Long" | "Short",
    })),
    onFetchActiveTickers: async () => {
      const qs = buildPaperQuery(buildOpenDoorGetParams(dateNy));
      const j = await apiGet<any>(`${STRATEGY.api.base}/active${qs}`);
      const rows = normalizeRows<PaperArbActiveRow>(j) ?? [];
      return rows.map((r) => ({
        ticker: r.ticker,
        side: normalizeSide(r.side).isLong ? "Long" : "Short" as "Long" | "Short",
      }));
    },
    onUpdated: isStreamOnlyShell ? undefined : () => setUpdatedAt(new Date()),
    onError: (message) => setErr(message),
  });
  const streamInstance = useStreamInstance();
  const filterPassLogStore = useStreamStores().filterPassLog;
  const streamSignalMeta = useStreamSignalMeta();
  const tapeMeta = useTapeMeta();
  const streamPositionMeta = useStreamPositionMeta();
  const streamFilterPassLogCount = useStreamFilterPassLogCount();



  const streamAutomationLaunchEnabled = streamViewModeOverride === "auto" || streamViewModeOverride === "stream-auto-tab";
  const streamStrategyModeEnabled = effectiveStreamAutomationConfig.strategyModeEnabled;
  const effectiveStreamAutoEnabled = typeof streamAutoEnabledOverride === "boolean" ? streamAutoEnabledOverride : streamAutoEnabled;
  const applyStreamAutoEnabled = useCallback((enabled: boolean) => {
    setStreamAutoEnabled(enabled);
    onStreamAutoEnabledChange?.(enabled);
  }, [onStreamAutoEnabledChange, setStreamAutoEnabled]);
  const streamAutomationEnabled = effectiveStreamAutoEnabled && streamStrategyModeEnabled;
  const streamAutomationRunning = streamAutomationTogglePending === "start"
    ? true
    : streamAutomationTogglePending === "stop"
      ? false
      : streamAutomationEnabled;
  const streamAutomationToggleBusy = streamAutomationTogglePending !== null;
  const streamExecutionSnapshot = useStreamExecutionSnapshot();
  const streamWindowsBound = Boolean(streamExecutionSnapshot?.boundWindow?.isBound && streamExecutionSnapshot?.mainWindow?.isBound);

  useEffect(() => {
    if (typeof streamAutoEnabledOverride !== "boolean") return;
    if (streamAutoEnabled !== streamAutoEnabledOverride) {
      setStreamAutoEnabled(streamAutoEnabledOverride);
    }
  }, [streamAutoEnabled, streamAutoEnabledOverride, setStreamAutoEnabled]);

  const streamCountries = useMemo(() => {
    const s = new Set<string>([...tapeMeta.countries, ...streamSignalMeta.countries]);
    for (const row of episodesRows) {
      const v = row.country?.trim().toUpperCase();
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  }, [tapeMeta.countries, streamSignalMeta.countries, episodesRows]);

  const streamExchanges = useMemo(() => {
    const s = new Set<string>([...tapeMeta.exchanges, ...streamSignalMeta.exchanges]);
    for (const row of episodesRows) {
      const v = row.exchange?.trim().toUpperCase();
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  }, [tapeMeta.exchanges, streamSignalMeta.exchanges, episodesRows]);

  const streamSectors = useMemo(() => {
    const s = new Set<string>([...tapeMeta.sectors, ...streamSignalMeta.sectors]);
    for (const row of episodesRows) {
      const v = row.sectorL3?.trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  }, [tapeMeta.sectors, streamSignalMeta.sectors, episodesRows]);

  const toggleStreamAutomationRunFromHeader = async () => {
    if (!streamAutomationLaunchEnabled) return;
    if (streamAutomationToggleBusy) return;
    if (streamAutoStartLocked && !streamAutomationRunning) return;

    if (streamAutomationRunning) {
      setStreamAutomationTogglePending("stop");
      try {
        const response = await fetch(apiUrl("/api/stream/automation/stop"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "scanner-header",
            // Stop only THIS strategy. Omitting strategyId means the operator panic-stop, which
            // halts every strategy and clears the whole shared queue.
            strategyId: streamInstance.strategyId,
          }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.ok === false) {
          throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
        }
      } finally {
        try {
          // Only THIS strategy's pending orders. The queue is shared with every other
          // strategy running on this machine, and an unscoped clear aborted theirs too.
          await clearStreamExecutionQueue({ thisStrategyOnly: true });
        } catch {
          // best effort cleanup
        }
        onStreamAutomationConfigChange?.({ strategyModeEnabled: false });
        applyStreamAutoEnabled(false);
        resetStreamAutomationState();
        setStreamAutomationTogglePending(null);
      }
      return;
    }

    setStreamAutomationTogglePending("start");
    try {
      resetStreamAutomationState();
      const response = await fetch(apiUrl("/api/stream/automation/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "scanner-header",
          strategyId: streamInstance.strategyId,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
      }
      onStreamAutomationConfigChange?.({ strategyModeEnabled: true });
      applyStreamAutoEnabled(true);
    } finally {
      setStreamAutomationTogglePending(null);
    }
  };

  const [streamBookToggleBusy, setStreamBookToggleBusy] = useState(false);

  // The switch lives on the bridge, so a reloaded page must ask rather than assume it is off.
  useEffect(() => {
    void refreshStreamBookReading();
  }, [refreshStreamBookReading]);

  /** The crosshair binds the window; this decides whether its book is scraped. See streamEngine. */
  const toggleStreamBookReadingFromHeader = async () => {
    if (streamBookToggleBusy) return;
    setStreamBookToggleBusy(true);
    try {
      setErr(null);
      await setStreamBookReading(!streamBookReading);
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    } finally {
      setStreamBookToggleBusy(false);
    }
  };

  const captureStreamWindowsFromHeader = async () => {
    if (streamWindowCaptureBusy) return;
    setStreamWindowCaptureBusy(true);
    try {
      setErr(null);
      if (streamWindowsBound) {
        await clearStreamBoundWindow();
      } else {
        await bindStreamWindows();
      }
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    } finally {
      setStreamWindowCaptureBusy(false);
    }
  };

  // ========= Build query params for GET /active & /episodes
  // ---- OpenDoor request shape ----
  // The inherited buildGetParams/buildPostRequest below describe an Arbitrage episode search
  // (deviation thresholds, hold windows, close modes). OpenDoor's engine takes none of that: entry
  // and exit are fixed by the clock, so the only inputs are the exit class, which of the three
  // parameters gate, the UP/DOWN gate levels and the per-trade notional.
  function buildOpenDoorParams() {
    const reqTickers = requestScopedTickers;
    return {
      exitClass: openDoorExitClass,
      ignoreRatings: openDoorIgnoreRatings,
      useManualEntry: openDoorUseManualEntry,
      stackMin: openDoorEntryBounds.stackMin,
      stackMax: openDoorEntryBounds.stackMax,
      benchMin: openDoorEntryBounds.benchMin,
      benchMax: openDoorEntryBounds.benchMax,
      devSigMin: openDoorEntryBounds.devSigMin,
      devSigMax: openDoorEntryBounds.devSigMax,
      useStack: openDoorUseStack,
      useBench: openDoorUseBench,
      useDevSig: openDoorUseDevSig,
      upMinRate: openDoorUpMinRate,
      upMinTotal: openDoorUpMinTotal,
      upMinMove: openDoorUpMinMove,
      downMinRate: openDoorDownMinRate,
      downMinTotal: openDoorDownMinTotal,
      downMinMove: openDoorDownMinMove,
      tickers: reqTickers.length ? reqTickers : null,
      excludeTickers: requestExcludedTickers.length ? requestExcludedTickers : null,
      sizeValue: normalizeScannerSizeValue(sizingMode, sizeValue),

      // Toolbar flag/multi-select filters, mirroring what the Arbitrage scanner sends. Enforced
      // server-side in PaperOpenDoorController.PassesToolbarFilters, after the per-day cache.
      // REP is absent on purpose: it stays client-side, where the shared date/time report rule is.
      requireHasNews: requireHasNews ? true : null,
      excludeHasNews: excludeHasNews ? true : null,
      requireIsPTP: requireIsPTP ? true : null,
      requireIsSSR: requireIsSSR ? true : null,
      requireIsETF: requireIsETF ? true : null,
      requireIsCrap: requireIsCrap ? true : null,
      excludePTP: excludePTP ? true : null,
      excludeSSR: excludeSSR ? true : null,
      excludeETF: excludeETF ? true : null,
      excludeCrap: excludeCrap ? true : null,

      // USA / CHINA. PaperFilters.PassesStaticMetaFilters has matched on these all along (it reads
      // the country string, so "UNITED STATES"/"US" and CHINA/"HONG KONG" both land); they were
      // simply never put in this body, which left both buttons inert on OpenDoor.
      includeUSA: includeUSA ? true : null,
      includeChina: includeChina ? true : null,

      exchanges: exchangeEnabled === "include" && selExchanges.size ? Array.from(selExchanges) : null,
      countries: countryEnabled === "include" && selCountries.size ? Array.from(selCountries) : null,
      sectorsL3: sectorEnabled === "include" && selSectors.size ? Array.from(selSectors) : null,
      excludeExchanges: exchangeEnabled === "exclude" && selExchanges.size ? Array.from(selExchanges) : null,
      excludeCountries: countryEnabled === "exclude" && selCountries.size ? Array.from(selCountries) : null,
      excludeSectorsL3: sectorEnabled === "exclude" && selSectors.size ? Array.from(selSectors) : null,
    };
  }

  function buildOpenDoorGetParams(d: string) {
    return { dateNy: d, ...buildOpenDoorParams() };
  }

  function buildOpenDoorPostRequest(from: string, to: string) {
    return { dateFrom: from, dateTo: to, ...buildOpenDoorParams() };
  }

  function buildGetParams(d: string) {
    const mh = Math.max(0, Math.min(180, clampInt(minHoldCandles, 0)));
    const reqTickers = requestScopedTickers;

    return {
      dateNy: d,
      metric,
      startAbs,
      usePrintMedianDelta: zapMode === "delta" ? true : undefined,
      startAbsMax: optNumOrNull(startAbsMax),
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      priceMode,
      pnlMode,
      sizingMode,
      sizeValue: normalizeScannerSizeValue(sizingMode, sizeValue),
      dilutionMode,
      dilutionStep: normalizeDilutionStepValue(dilutionStep),
      maxAdds,
      addDelayMinutes,
      exitConfirmCandles: mh + 1,
      ratingType: ratingType ?? "any",

      tickers: reqTickers.length ? reqTickers : null,
      benchTickers: splitListUpper(scopeBenchText).length ? splitListUpper(scopeBenchText) : null,
      side: sideFilter ? sideFilter : null,

      exchanges: exchangeEnabled === "include" && selExchanges.size ? Array.from(selExchanges) : null,
      countries: countryEnabled === "include" && selCountries.size ? Array.from(selCountries) : null,
      sectorsL3: sectorEnabled === "include" && selSectors.size ? Array.from(selSectors) : null,
      excludeExchanges: exchangeEnabled === "exclude" && selExchanges.size ? Array.from(selExchanges) : null,
      excludeCountries: countryEnabled === "exclude" && selCountries.size ? Array.from(selCountries) : null,
      excludeSectorsL3: sectorEnabled === "exclude" && selSectors.size ? Array.from(selSectors) : null,

      minTierBp: optNumOrNull(minTierBp),
      maxTierBp: optNumOrNull(maxTierBp),
      minCorr: optNumOrNull(minCorr),
      maxCorr: optNumOrNull(maxCorr),
      minBeta: optNumOrNull(minBeta),
      maxBeta: optNumOrNull(maxBeta),
      minSigma: optNumOrNull(minSigma),
      maxSigma: optNumOrNull(maxSigma),

      // shared min/max filters
      minAdv20: rangeValueOrNull("adv20", minAdv20),
      maxAdv20: rangeValueOrNull("adv20", maxAdv20),
      minAdv20NF: rangeValueOrNull("adv20nf", minAdv20NF),
      maxAdv20NF: rangeValueOrNull("adv20nf", maxAdv20NF),
      minAdv90: rangeValueOrNull("adv90", minAdv90),
      maxAdv90: rangeValueOrNull("adv90", maxAdv90),
      minAdv90NF: rangeValueOrNull("adv90nf", minAdv90NF),
      maxAdv90NF: rangeValueOrNull("adv90nf", maxAdv90NF),
      minAvPreMhv: rangeValueOrNull("avpremhv", minAvPreMhv),
      maxAvPreMhv: rangeValueOrNull("avpremhv", maxAvPreMhv),
      minRoundLot: rangeValueOrNull("roundlot", minRoundLot),
      maxRoundLot: rangeValueOrNull("roundlot", maxRoundLot),
      minVWAP: rangeValueOrNull("vwap", minVWAP),
      maxVWAP: rangeValueOrNull("vwap", maxVWAP),
      minSpread: rangeValueOrNull("spread", minSpread),
      maxSpread: rangeValueOrNull("spread", maxSpread),
      minLstPrcL: rangeValueOrNull("lstprcl", minLstPrcL),
      maxLstPrcL: rangeValueOrNull("lstprcl", maxLstPrcL),
      minLstCls: rangeValueOrNull("lstcls", minLstCls),
      maxLstCls: rangeValueOrNull("lstcls", maxLstCls),
      minYCls: rangeValueOrNull("ycls", minYCls),
      maxYCls: rangeValueOrNull("ycls", maxYCls),
      minTCls: rangeValueOrNull("tcls", minTCls),
      maxTCls: rangeValueOrNull("tcls", maxTCls),
      minClsToClsPct: rangeValueOrNull("clstocls", minClsToClsPct),
      maxClsToClsPct: rangeValueOrNull("clstocls", maxClsToClsPct),
      minLo: rangeValueOrNull("lo", minLo),
      maxLo: rangeValueOrNull("lo", maxLo),
      minLstClsNewsCnt: rangeValueOrNull("lstclsnewscnt", minLstClsNewsCnt),
      maxLstClsNewsCnt: rangeValueOrNull("lstclsnewscnt", maxLstClsNewsCnt),
      minMarketCapM: rangeValueOrNull("marketcapm", minMarketCapM),
      maxMarketCapM: rangeValueOrNull("marketcapm", maxMarketCapM),
      minPreMhVolNF: rangeValueOrNull("premhvolnf", minPreMktVolNF),
      maxPreMhVolNF: rangeValueOrNull("premhvolnf", maxPreMktVolNF),
      minVolNFfromLstCls: rangeValueOrNull("volnffromlstcls", minVolNFfromLstCls),
      maxVolNFfromLstCls: rangeValueOrNull("volnffromlstcls", maxVolNFfromLstCls),
      minAvPostMhVol90NF: rangeValueOrNull("avpostmhvol90nf", minAvPostMhVol90NF),
      maxAvPostMhVol90NF: rangeValueOrNull("avpostmhvol90nf", maxAvPostMhVol90NF),
      minAvPreMhVol90NF: rangeValueOrNull("avpremhvol90nf", minAvPreMhVol90NF),
      maxAvPreMhVol90NF: rangeValueOrNull("avpremhvol90nf", maxAvPreMhVol90NF),
      minAvPreMhValue20NF: rangeValueOrNull("avpremhvalue20nf", minAvPreMhValue20NF),
      maxAvPreMhValue20NF: rangeValueOrNull("avpremhvalue20nf", maxAvPreMhValue20NF),
      minAvPreMhValue90NF: rangeValueOrNull("avpremhvalue90nf", minAvPreMhValue90NF),
      maxAvPreMhValue90NF: rangeValueOrNull("avpremhvalue90nf", maxAvPreMhValue90NF),
      minAvgDailyValue20: rangeValueOrNull("avgdailyvalue20", minAvgDailyValue20),
      maxAvgDailyValue20: rangeValueOrNull("avgdailyvalue20", maxAvgDailyValue20),
      minAvgDailyValue90: rangeValueOrNull("avgdailyvalue90", minAvgDailyValue90),
      maxAvgDailyValue90: rangeValueOrNull("avgdailyvalue90", maxAvgDailyValue90),
      minVolatility20: rangeValueOrNull("volatility20", minVolatility20),
      maxVolatility20: rangeValueOrNull("volatility20", maxVolatility20),
      minVolatility90: rangeValueOrNull("volatility90", minVolatility90),
      maxVolatility90: rangeValueOrNull("volatility90", maxVolatility90),
      minVolRel: rangeValueOrNull("volrel", minVolRel),
      maxVolRel: rangeValueOrNull("volrel", maxVolRel),
      minPreMhBidLstPrcPct: rangeValueOrNull("premhbidlstprc", minPreMhBidLstPrcPct),
      maxPreMhBidLstPrcPct: rangeValueOrNull("premhbidlstprc", maxPreMhBidLstPrcPct),
      minPreMhLoLstPrcPct: rangeValueOrNull("premhlolstprc", minPreMhLoLstPrcPct),
      maxPreMhLoLstPrcPct: rangeValueOrNull("premhlolstprc", maxPreMhLoLstPrcPct),
      minPreMhHiLstClsPct: rangeValueOrNull("premhhilstcls", minPreMhHiLstClsPct),
      maxPreMhHiLstClsPct: rangeValueOrNull("premhhilstcls", maxPreMhHiLstClsPct),
      minPreMhLoLstClsPct: rangeValueOrNull("premhlolstcls", minPreMhLoLstClsPct),
      maxPreMhLoLstClsPct: rangeValueOrNull("premhlolstcls", maxPreMhLoLstClsPct),
      minLstPrcLstClsPct: rangeValueOrNull("lstprclstcls", minLstPrcLstClsPct),
      maxLstPrcLstClsPct: rangeValueOrNull("lstprclstcls", maxLstPrcLstClsPct),
      minImbExch925: rangeValueOrNull("imbexch925", minImbExch925),
      maxImbExch925: rangeValueOrNull("imbexch925", maxImbExch925),
      minImbExch1555: rangeValueOrNull("imbexch1555", minImbExch1555),
      maxImbExch1555: rangeValueOrNull("imbexch1555", maxImbExch1555),

      requireHasNews: requireHasNews ? true : null,
      excludeHasNews: excludeHasNews ? true : null,
      requireHasReport: requireHasReport ? true : null,
      excludeHasReport: excludeHasReport ? true : null,
      minNewsCnt: optNumOrNull(minNewsCnt),
      maxNewsCnt: optNumOrNull(maxNewsCnt),

      requireIsPTP: requireIsPTP ? true : null,
      requireIsSSR: requireIsSSR ? true : null,
      requireIsETF: requireIsETF ? true : null,
      requireIsCrap: requireIsCrap ? true : null,
      excludeDividend: excludeDividend ? true : null,
      excludePTP: excludePTP ? true : null,
      excludeSSR: excludeSSR ? true : null,
      excludeETF: excludeETF ? true : null,
      excludeCrap: excludeCrap ? true : null,
      includeUSA: includeUSA ? true : null,
      includeChina: includeChina ? true : null,

      minMdnPreMhVol90: optNumOrNull(minMdnPreMhVol90),
      maxMdnPreMhVol90: optNumOrNull(maxMdnPreMhVol90),
      minMdnPostMhVol90NF: optNumOrNull(minMdnPostMhVol90NF),
      maxMdnPostMhVol90NF: optNumOrNull(maxMdnPostMhVol90NF),
      minImbARCA: optNumOrNull(minImbARCA),
      maxImbARCA: optNumOrNull(maxImbARCA),
      minImbExchValue: optNumOrNull(minImbExchValue),
      maxImbExchValue: optNumOrNull(maxImbExchValue),
      imbExchs: splitListUpper(imbExchsText).length ? splitListUpper(imbExchsText) : null,
    };
  }

  function parseTimeToMinuteIdx(time: string): number | null {
    if (!time) return null;
    const parts = time.split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1] ?? 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  // PRE's START field (position-taking start time, default 21:00) uses the same negative/
  // non-negative relative-minute axis as TapeArbClasses.PreFrom on the backend — see
  // toPreRelativeMinutes in streamEngine.ts for the full convention.
  function preStartToMinuteIdx(): number {
    const clock = parseTimeToMinuteIdx(preStartTime);
    return clock == null ? -180 : (toPreRelativeMinutes(clock) ?? -180);
  }

  function buildPostRequest(from: string, to: string): PaperArbAnalyticsRequest {
    const mh = Math.max(0, Math.min(180, clampInt(minHoldCandles, 0)));
    const startAbsMaxNum = optNumOrNull(startAbsMax);
    const startAbsMaxEff = startAbsMaxNum != null && startAbsMaxNum > 0 && (zapMode === "delta" || startAbsMaxNum >= startAbs) ? startAbsMaxNum : null;
    const reqTickers = requestScopedTickers;

    const sessionBand = ratingBandFromSession(session);
    const sessionRule = ratingRules.find((r) => r.band === sessionBand) ?? { band: sessionBand, minRate: 0, minTotal: 0 };
    const rrForRequest = [{
      band: sessionRule.band,
      minRate: Math.max(0, Number(sessionRule.minRate) || 0),
      minTotal: Math.max(0, clampInt(sessionRule.minTotal, 0)),
    }];
    const req: PaperArbAnalyticsRequest = {
      dateFrom: from,
      dateTo: to,

      metric,
      startAbs,
      usePrintMedianDelta: zapMode === "delta" ? true : undefined,
      startAbsMax: startAbsMaxEff,
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      startCutoffMinuteIdx: parseTimeToMinuteIdx(startCutoffTime),
      preStartMinuteIdx: preStartToMinuteIdx(),
      priceMode,
      pnlMode,
      sizingMode,
      sizeValue: normalizeScannerSizeValue(sizingMode, sizeValue),
      dilutionMode,
      dilutionStep: normalizeDilutionStepValue(dilutionStep),
      maxAdds,
      addDelayMinutes,
      exitConfirmCandles: mh + 1,

      ratingType: ratingType ?? "any",
      ratingRules: ratingMode === "SESSION" ? rrForRequest : null,

      tickers: reqTickers.length ? reqTickers : null,
      excludeTickers: requestExcludedTickers.length ? requestExcludedTickers : null,
      benchTickers: splitListUpper(scopeBenchText).length ? splitListUpper(scopeBenchText) : null,
      side: sideFilter ? sideFilter : null,

      exchanges: exchangeEnabled === "include" && selExchanges.size ? Array.from(selExchanges) : null,
      countries: countryEnabled === "include" && selCountries.size ? Array.from(selCountries) : null,
      sectorsL3: sectorEnabled === "include" && selSectors.size ? Array.from(selSectors) : null,
      excludeExchanges: exchangeEnabled === "exclude" && selExchanges.size ? Array.from(selExchanges) : null,
      excludeCountries: countryEnabled === "exclude" && selCountries.size ? Array.from(selCountries) : null,
      excludeSectorsL3: sectorEnabled === "exclude" && selSectors.size ? Array.from(selSectors) : null,

      minTierBp: optNumOrNull(minTierBp),
      maxTierBp: optNumOrNull(maxTierBp),
      minCorr: optNumOrNull(minCorr),
      maxCorr: optNumOrNull(maxCorr),
      minBeta: optNumOrNull(minBeta),
      maxBeta: optNumOrNull(maxBeta),
      minSigma: optNumOrNull(minSigma),
      maxSigma: optNumOrNull(maxSigma),

      minMarketCapM: rangeValueOrNull("marketcapm", minMarketCapM),
      maxMarketCapM: rangeValueOrNull("marketcapm", maxMarketCapM),

      minRoundLot: rangeValueOrNull("roundlot", minRoundLot),
      maxRoundLot: rangeValueOrNull("roundlot", maxRoundLot),

      minAdv20: rangeValueOrNull("adv20", minAdv20),
      maxAdv20: rangeValueOrNull("adv20", maxAdv20),
      minAdv20NF: rangeValueOrNull("adv20nf", minAdv20NF),
      maxAdv20NF: rangeValueOrNull("adv20nf", maxAdv20NF),

      minAdv90: rangeValueOrNull("adv90", minAdv90),
      maxAdv90: rangeValueOrNull("adv90", maxAdv90),
      minAdv90NF: rangeValueOrNull("adv90nf", minAdv90NF),
      maxAdv90NF: rangeValueOrNull("adv90nf", maxAdv90NF),

      minPreMktVol: optNumOrNull(minPreMktVol),
      maxPreMktVol: optNumOrNull(maxPreMktVol),
      minPreMktVolNF: rangeValueOrNull("premhvolnf", minPreMktVolNF),
      maxPreMktVolNF: rangeValueOrNull("premhvolnf", maxPreMktVolNF),

      minSpread: rangeValueOrNull("spread", minSpread),
      maxSpread: rangeValueOrNull("spread", maxSpread),
      minSpreadBps: optNumOrNull(minSpreadBps),
      maxSpreadBps: optNumOrNull(maxSpreadBps),

      minGap: optNumOrNull(minGap),
      maxGap: optNumOrNull(maxGap),
      minGapPct: optNumOrNull(minGapPct),
      maxGapPct: optNumOrNull(maxGapPct),

      minClsToClsPct: rangeValueOrNull("clstocls", minClsToClsPct),
      maxClsToClsPct: rangeValueOrNull("clstocls", maxClsToClsPct),

      minVWAP: rangeValueOrNull("vwap", minVWAP),
      maxVWAP: rangeValueOrNull("vwap", maxVWAP),

      minLo: rangeValueOrNull("lo", minLo),
      maxLo: rangeValueOrNull("lo", maxLo),

      requireHasNews: requireHasNews ? true : null,
      excludeHasNews: excludeHasNews ? true : null,
      requireHasReport: requireHasReport ? true : null,
      excludeHasReport: excludeHasReport ? true : null,
      minNewsCnt: optNumOrNull(minNewsCnt),
      maxNewsCnt: optNumOrNull(maxNewsCnt),

      requireIsPTP: requireIsPTP ? true : null,
      requireIsSSR: requireIsSSR ? true : null,
      requireIsETF: requireIsETF ? true : null,
      requireIsCrap: requireIsCrap ? true : null,

      excludeDividend: excludeDividend ? true : null,
      excludePTP: excludePTP ? true : null,
      excludeSSR: excludeSSR ? true : null,
      excludeETF: excludeETF ? true : null,
      excludeCrap: excludeCrap ? true : null,
      includeUSA: includeUSA ? true : null,
      includeChina: includeChina ? true : null,

      minMdnPreMhVol90: optNumOrNull(minMdnPreMhVol90),
      maxMdnPreMhVol90: optNumOrNull(maxMdnPreMhVol90),

      minMdnPostMhVol90NF: optNumOrNull(minMdnPostMhVol90NF),
      maxMdnPostMhVol90NF: optNumOrNull(maxMdnPostMhVol90NF),

      minAvPreMhv: rangeValueOrNull("avpremhv", minAvPreMhv),
      maxAvPreMhv: rangeValueOrNull("avpremhv", maxAvPreMhv),
      minLstPrcL: rangeValueOrNull("lstprcl", minLstPrcL),
      maxLstPrcL: rangeValueOrNull("lstprcl", maxLstPrcL),
      minLstCls: rangeValueOrNull("lstcls", minLstCls),
      maxLstCls: rangeValueOrNull("lstcls", maxLstCls),
      minYCls: rangeValueOrNull("ycls", minYCls),
      maxYCls: rangeValueOrNull("ycls", maxYCls),
      minTCls: rangeValueOrNull("tcls", minTCls),
      maxTCls: rangeValueOrNull("tcls", maxTCls),
      minLstClsNewsCnt: rangeValueOrNull("lstclsnewscnt", minLstClsNewsCnt),
      maxLstClsNewsCnt: rangeValueOrNull("lstclsnewscnt", maxLstClsNewsCnt),
      minPreMhVolNF: rangeValueOrNull("premhvolnf", minPreMktVolNF),
      maxPreMhVolNF: rangeValueOrNull("premhvolnf", maxPreMktVolNF),
      minVolNFfromLstCls: rangeValueOrNull("volnffromlstcls", minVolNFfromLstCls),
      maxVolNFfromLstCls: rangeValueOrNull("volnffromlstcls", maxVolNFfromLstCls),
      minAvPostMhVol90NF: rangeValueOrNull("avpostmhvol90nf", minAvPostMhVol90NF),
      maxAvPostMhVol90NF: rangeValueOrNull("avpostmhvol90nf", maxAvPostMhVol90NF),
      minAvPreMhVol90NF: rangeValueOrNull("avpremhvol90nf", minAvPreMhVol90NF),
      maxAvPreMhVol90NF: rangeValueOrNull("avpremhvol90nf", maxAvPreMhVol90NF),
      minAvPreMhValue20NF: rangeValueOrNull("avpremhvalue20nf", minAvPreMhValue20NF),
      maxAvPreMhValue20NF: rangeValueOrNull("avpremhvalue20nf", maxAvPreMhValue20NF),
      minAvPreMhValue90NF: rangeValueOrNull("avpremhvalue90nf", minAvPreMhValue90NF),
      maxAvPreMhValue90NF: rangeValueOrNull("avpremhvalue90nf", maxAvPreMhValue90NF),
      minAvgDailyValue20: rangeValueOrNull("avgdailyvalue20", minAvgDailyValue20),
      maxAvgDailyValue20: rangeValueOrNull("avgdailyvalue20", maxAvgDailyValue20),
      minAvgDailyValue90: rangeValueOrNull("avgdailyvalue90", minAvgDailyValue90),
      maxAvgDailyValue90: rangeValueOrNull("avgdailyvalue90", maxAvgDailyValue90),
      minVolatility20: rangeValueOrNull("volatility20", minVolatility20),
      maxVolatility20: rangeValueOrNull("volatility20", maxVolatility20),
      minVolatility90: rangeValueOrNull("volatility90", minVolatility90),
      maxVolatility90: rangeValueOrNull("volatility90", maxVolatility90),
      minPreMhMDV20NF: rangeValueOrNull("premhmdv20nf", minPreMhMDV20NF),
      maxPreMhMDV20NF: rangeValueOrNull("premhmdv20nf", maxPreMhMDV20NF),
      minPreMhMDV90NF: rangeValueOrNull("premhmdv90nf", minPreMhMDV90NF),
      maxPreMhMDV90NF: rangeValueOrNull("premhmdv90nf", maxPreMhMDV90NF),
      minVolRel: rangeValueOrNull("volrel", minVolRel),
      maxVolRel: rangeValueOrNull("volrel", maxVolRel),
      minPreMhBidLstPrcPct: rangeValueOrNull("premhbidlstprc", minPreMhBidLstPrcPct),
      maxPreMhBidLstPrcPct: rangeValueOrNull("premhbidlstprc", maxPreMhBidLstPrcPct),
      minPreMhLoLstPrcPct: rangeValueOrNull("premhlolstprc", minPreMhLoLstPrcPct),
      maxPreMhLoLstPrcPct: rangeValueOrNull("premhlolstprc", maxPreMhLoLstPrcPct),
      minPreMhHiLstClsPct: rangeValueOrNull("premhhilstcls", minPreMhHiLstClsPct),
      maxPreMhHiLstClsPct: rangeValueOrNull("premhhilstcls", maxPreMhHiLstClsPct),
      minPreMhLoLstClsPct: rangeValueOrNull("premhlolstcls", minPreMhLoLstClsPct),
      maxPreMhLoLstClsPct: rangeValueOrNull("premhlolstcls", maxPreMhLoLstClsPct),
      minLstPrcLstClsPct: rangeValueOrNull("lstprclstcls", minLstPrcLstClsPct),
      maxLstPrcLstClsPct: rangeValueOrNull("lstprclstcls", maxLstPrcLstClsPct),
      minImbExch925: rangeValueOrNull("imbexch925", minImbExch925),
      maxImbExch925: rangeValueOrNull("imbexch925", maxImbExch925),
      minImbExch1555: rangeValueOrNull("imbexch1555", minImbExch1555),
      maxImbExch1555: rangeValueOrNull("imbexch1555", maxImbExch1555),

      imbExchs: splitListUpper(imbExchsText).length ? splitListUpper(imbExchsText) : null,
      minImbARCA: optNumOrNull(minImbARCA),
      maxImbARCA: optNumOrNull(maxImbARCA),
      minImbExchValue: optNumOrNull(minImbExchValue),
      maxImbExchValue: optNumOrNull(maxImbExchValue),
    };

    return req;
  }

  async function fetchEpisodesSearchRows(req: PaperArbAnalyticsRequest): Promise<PaperArbClosedDto[]> {
    // Callers still hand over the inherited Arbitrage request object (it also drives the analytics
    // endpoint), but the OpenDoor search takes an entirely different body - only the date range is
    // shared. Translating here keeps every call site untouched.
    const body = buildOpenDoorPostRequest(req.dateFrom, req.dateTo ?? req.dateFrom);
    const key = JSON.stringify(body);
    return episodesSearchCache.get(key, () =>
      // See the same call in ArbitrageScanner: ask for best_params once per ticker rather than on
      // every row, and reattach it as a shared reference.
      apiPost<any>(`${STRATEGY.api.base}/episodes/search`, { ...body, includeBestParams: false })
        .then((j) => normalizeRowsWithBestParams<PaperArbClosedDto>(j) ?? [])
    );
  }

  // ========= Run handler
  async function run() {
    if (!canRun) return;

    setLoading(true);
    setErr(null);

    try {
      if (primaryPanel === "stream") {
        await refreshStreamSignals();
        return;
      }
      if (tab === "active") {
        setAnalytics(null);
        const qs = buildPaperQuery(buildOpenDoorGetParams(dateNy));
        const j = await apiGet<any>(`${STRATEGY.api.base}/active${qs}`);
        const rows = normalizeRows<PaperArbActiveRow>(j);
        setActiveRows(rows ?? []);
      } else if (tab === "episodes") {
        setAnalytics(null);
        if (!(episodesUseSearch || forceEpisodesSearch)) {
          const qs = buildPaperQuery(buildOpenDoorGetParams(dateNy));
          const j = await apiGet<any>(`${STRATEGY.api.base}/episodes${qs}`);
          const rows = normalizeRows<PaperArbClosedDto>(j);
          setEpisodesRows(rows ?? []);
        } else {
          const req = buildPostRequest(dateFrom, dateTo);
          const rows = await fetchEpisodesSearchRows(req);
          setEpisodesRows(rows);
        }
      } else {
        // No /analytics call here on purpose. Its response was only ever rendered by the inherited
        // Arbitrage ANALYTICS block, which OpenDoor does not use — every aggregate this scanner
        // shows (analyticsSummary, the equity curve, scope-research) is derived client-side from
        // filteredEpisodes. Calling the Arbitrage endpoint would have recomputed the same day with
        // the hedge engine and reported numbers that contradict the rows underneath them.
        const req = buildPostRequest(dateFrom, dateTo);
        const rows = await fetchEpisodesSearchRows(req);
        setEpisodesRows(rows);
      }
      setUpdatedAt(new Date());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runEpisodesAutoScan() {
    if (scanLoading) return;
    const from = dateMode === "day" ? dateNy : dateFrom;
    const to = dateMode === "day" ? dateNy : dateTo;
    if (!toYmd(from) || !toYmd(to) || from > to) {
      setScanErr("Invalid date range for scan.");
      return;
    }

    const starts = buildRangeValues(scanStartMin, scanStartMax, scanStartStep).filter((x) => x > 0);
    const ends = buildRangeValues(scanEndMin, scanEndMax, scanEndStep).filter((x) => x >= 0);
    const combos: Array<{ s: number; e: number }> = [];
    for (const s of starts) {
      for (const e of ends) {
        if (e <= s) combos.push({ s, e });
      }
    }
    if (!combos.length) {
      setScanErr("No valid StartAbs/EndAbs combinations (need EndAbs <= StartAbs).");
      return;
    }

    setScanLoading(true);
    setScanErr(null);
    setScanProgress({ done: 0, total: combos.length });

    const out: EpisodeScanResult[] = [];
    try {
      for (let i = 0; i < combos.length; i++) {
        const c = combos[i];
        const req = buildPostRequest(from, to);
        req.startAbs = c.s;
        req.startAbsMax = null;
        req.endAbs = c.e;
        const j = await apiPost<any>(
          `${STRATEGY.api.base}/episodes/search`,
          buildOpenDoorPostRequest(req.dateFrom, req.dateTo ?? req.dateFrom)
        );
        const rows = normalizeRows<PaperArbClosedDto>(j) ?? [];
        const total = rows.reduce((acc, r) => acc + (r.totalPnlUsd ?? 0), 0);
        const wins = rows.filter((r) => (r.totalPnlUsd ?? 0) > 0).length;
        const losses = rows.filter((r) => (r.totalPnlUsd ?? 0) < 0).length;
        const trades = rows.length;
        const winRate = trades > 0 ? wins / trades : 0;
        out.push({
          startAbs: c.s,
          endAbs: c.e,
          trades,
          wins,
          losses,
          winRate,
          totalPnlUsd: total,
          avgPnlUsd: trades > 0 ? total / trades : 0,
        });
        setScanProgress({ done: i + 1, total: combos.length });
      }

      const sorted = [...out].sort((a, b) => {
        if (scanObjective === "winrate") {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          return b.totalPnlUsd - a.totalPnlUsd;
        }
        if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
        return b.winRate - a.winRate;
      });
      const top = Math.max(1, Math.min(200, clampInt(scanTopK, 20)));
      setScanRows(sorted.slice(0, top));
    } catch (e: any) {
      setScanErr(e?.message ?? String(e));
    } finally {
      setScanLoading(false);
    }
  }

  const applyOptimizerRatingRule = (req: PaperArbAnalyticsRequest, patch: Partial<PaperArbRatingRule> = {}) => {
    if (scannerBinFilterEnabled({ ratingMode, metric })) {
      req.ratingRules = null;
      return;
    }
    const currentRatingRule = ratingRules.find((r) => r.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 };
    req.ratingRules = [{
      band: currentRatingRule.band,
      minRate: Math.max(0, Number(patch.minRate ?? currentRatingRule.minRate ?? 0) || 0),
      minTotal: Math.max(0, clampInt(patch.minTotal ?? currentRatingRule.minTotal ?? 0, 0)),
    }];
  };

  const optimizerScenarios = useMemo<OptimizerScenario[]>(() => {
    const scenarios: OptimizerScenario[] = [];
    const currentRatingRule = ratingRules.find((r) => r.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 };
    const useBinRatingFilter = scannerBinFilterEnabled({ ratingMode, metric });
    const pushRangeScenarios = (
      key: SharedRangeFilterKey,
      label: string,
      minValue: string,
      maxValue: string,
      reqMinKey: keyof PaperArbAnalyticsRequest,
      reqMaxKey: keyof PaperArbAnalyticsRequest,
      aliasMinKey?: keyof PaperArbAnalyticsRequest,
      aliasMaxKey?: keyof PaperArbAnalyticsRequest
    ) => {
      if (sharedRangeFilterModes[key] !== "on") return;
      const minNum = optNumOrNull(minValue);
      const maxNum = optNumOrNull(maxValue);
      if (minNum == null && maxNum == null) return;

      if (minNum != null) {
        scenarios.push({
          id: `${key}-min`,
          parameter: label,
          variant: "MIN",
          summary: `min >= ${num(minNum, 2)}`,
          apply: (req) => {
            (req as any)[reqMinKey] = minNum;
            if (aliasMinKey) (req as any)[aliasMinKey] = minNum;
          },
        });
      }
      if (maxNum != null) {
        scenarios.push({
          id: `${key}-max`,
          parameter: label,
          variant: "MAX",
          summary: `max <= ${num(maxNum, 2)}`,
          apply: (req) => {
            (req as any)[reqMaxKey] = maxNum;
            if (aliasMaxKey) (req as any)[aliasMaxKey] = maxNum;
          },
        });
      }
      if (minNum != null && maxNum != null) {
        scenarios.push({
          id: `${key}-range`,
          parameter: label,
          variant: "RANGE",
          summary: `${num(minNum, 2)} .. ${num(maxNum, 2)}`,
          apply: (req) => {
            (req as any)[reqMinKey] = minNum;
            (req as any)[reqMaxKey] = maxNum;
            if (aliasMinKey) (req as any)[aliasMinKey] = minNum;
            if (aliasMaxKey) (req as any)[aliasMaxKey] = maxNum;
          },
        });
      }
    };

    scenarios.push({
      id: "baseline",
      parameter: "BASE",
      variant: "OFF",
      summary: "Manual inputs only",
      apply: () => {},
    });

    pushRangeScenarios("corr", "CORR", minCorr, maxCorr, "minCorr", "maxCorr");
    pushRangeScenarios("beta", "BETA", minBeta, maxBeta, "minBeta", "maxBeta");
    pushRangeScenarios("sigma", "SIGMA", minSigma, maxSigma, "minSigma", "maxSigma");
    pushRangeScenarios("adv20", "ADV20", minAdv20, maxAdv20, "minAdv20", "maxAdv20");
    pushRangeScenarios("adv20nf", "ADV20NF", minAdv20NF, maxAdv20NF, "minAdv20NF", "maxAdv20NF");
    pushRangeScenarios("adv90", "ADV90", minAdv90, maxAdv90, "minAdv90", "maxAdv90");
    pushRangeScenarios("adv90nf", "ADV90NF", minAdv90NF, maxAdv90NF, "minAdv90NF", "maxAdv90NF");
    pushRangeScenarios("avpremhv", "AvPreMhv", minAvPreMhv, maxAvPreMhv, "minAvPreMhv", "maxAvPreMhv");
    pushRangeScenarios("roundlot", "RoundLot", minRoundLot, maxRoundLot, "minRoundLot", "maxRoundLot");
    pushRangeScenarios("vwap", "VWAP", minVWAP, maxVWAP, "minVWAP", "maxVWAP");
    pushRangeScenarios("spread", "SpreadBid%", minSpread, maxSpread, "minSpread", "maxSpread");
    pushRangeScenarios("lstprcl", "LstPrcL", minLstPrcL, maxLstPrcL, "minLstPrcL", "maxLstPrcL");
    pushRangeScenarios("lstcls", "LstCls", minLstCls, maxLstCls, "minLstCls", "maxLstCls");
    pushRangeScenarios("ycls", "YCls", minYCls, maxYCls, "minYCls", "maxYCls");
    pushRangeScenarios("tcls", "TCls", minTCls, maxTCls, "minTCls", "maxTCls");
    pushRangeScenarios("clstocls", "ClsToCls%", minClsToClsPct, maxClsToClsPct, "minClsToClsPct", "maxClsToClsPct");
    pushRangeScenarios("lo", "Lo", minLo, maxLo, "minLo", "maxLo");
    pushRangeScenarios("lstclsnewscnt", "LstClsNewsCnt", minLstClsNewsCnt, maxLstClsNewsCnt, "minLstClsNewsCnt", "maxLstClsNewsCnt");
    pushRangeScenarios("marketcapm", "MarketCapM", minMarketCapM, maxMarketCapM, "minMarketCapM", "maxMarketCapM");
    pushRangeScenarios("premhvolnf", "PreMhVolNF", minPreMktVolNF, maxPreMktVolNF, "minPreMhVolNF", "maxPreMhVolNF", "minPreMktVolNF", "maxPreMktVolNF");
    pushRangeScenarios("volnffromlstcls", "VolNFfromLstCls", minVolNFfromLstCls, maxVolNFfromLstCls, "minVolNFfromLstCls", "maxVolNFfromLstCls");
    pushRangeScenarios("avpostmhvol90nf", "AvPostMhVol90NF", minAvPostMhVol90NF, maxAvPostMhVol90NF, "minAvPostMhVol90NF", "maxAvPostMhVol90NF");
    pushRangeScenarios("avpremhvol90nf", "AvPreMhVol90NF", minAvPreMhVol90NF, maxAvPreMhVol90NF, "minAvPreMhVol90NF", "maxAvPreMhVol90NF");
    pushRangeScenarios("avpremhvalue20nf", "AvPreMhValue20NF", minAvPreMhValue20NF, maxAvPreMhValue20NF, "minAvPreMhValue20NF", "maxAvPreMhValue20NF");
    pushRangeScenarios("avpremhvalue90nf", "AvPreMhValue90NF", minAvPreMhValue90NF, maxAvPreMhValue90NF, "minAvPreMhValue90NF", "maxAvPreMhValue90NF");
    pushRangeScenarios("avgdailyvalue20", "AvgDailyValue20", minAvgDailyValue20, maxAvgDailyValue20, "minAvgDailyValue20", "maxAvgDailyValue20");
    pushRangeScenarios("avgdailyvalue90", "AvgDailyValue90", minAvgDailyValue90, maxAvgDailyValue90, "minAvgDailyValue90", "maxAvgDailyValue90");
    pushRangeScenarios("volatility20", "Volatility20", minVolatility20, maxVolatility20, "minVolatility20", "maxVolatility20");
    pushRangeScenarios("volatility90", "Volatility90", minVolatility90, maxVolatility90, "minVolatility90", "maxVolatility90");
    pushRangeScenarios("premhmdv20nf", "PreMhMDV20NF", minPreMhMDV20NF, maxPreMhMDV20NF, "minPreMhMDV20NF", "maxPreMhMDV20NF");
    pushRangeScenarios("premhmdv90nf", "PreMhMDV90NF", minPreMhMDV90NF, maxPreMhMDV90NF, "minPreMhMDV90NF", "maxPreMhMDV90NF");
    pushRangeScenarios("volrel", "VolRel", minVolRel, maxVolRel, "minVolRel", "maxVolRel");
    pushRangeScenarios("premhbidlstprc", "PreMhHiLstPrc%", minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct, "minPreMhBidLstPrcPct", "maxPreMhBidLstPrcPct");
    pushRangeScenarios("premhlolstprc", "PreMhLoLstPrc%", minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct, "minPreMhLoLstPrcPct", "maxPreMhLoLstPrcPct");
    pushRangeScenarios("premhhilstcls", "PreMhHiLstCls%", minPreMhHiLstClsPct, maxPreMhHiLstClsPct, "minPreMhHiLstClsPct", "maxPreMhHiLstClsPct");
    pushRangeScenarios("premhlolstcls", "PreMhLoLstCls%", minPreMhLoLstClsPct, maxPreMhLoLstClsPct, "minPreMhLoLstClsPct", "maxPreMhLoLstClsPct");
    pushRangeScenarios("lstprclstcls", "LstPrcLstCls%", minLstPrcLstClsPct, maxLstPrcLstClsPct, "minLstPrcLstClsPct", "maxLstPrcLstClsPct");
    pushRangeScenarios("imbexch925", "ImbExch9:25", minImbExch925, maxImbExch925, "minImbExch925", "maxImbExch925");
    pushRangeScenarios("imbexch1555", "ImbExch15:55", minImbExch1555, maxImbExch1555, "minImbExch1555", "maxImbExch1555");

    if (!useBinRatingFilter && currentRatingRule.minRate > 0) {
      scenarios.push({
        id: "minrate",
        parameter: "MINRATE",
        variant: "ON",
        summary: `minRate >= ${num(currentRatingRule.minRate, 2)}`,
        apply: (req) => {
          applyOptimizerRatingRule(req, { minRate: currentRatingRule.minRate, minTotal: 0 });
        },
      });
    }
    if (!useBinRatingFilter && currentRatingRule.minTotal > 0) {
      scenarios.push({
        id: "mintotal",
        parameter: "MINTOTAL",
        variant: "ON",
        summary: `minTotal >= ${intn(currentRatingRule.minTotal)}`,
        apply: (req) => {
          applyOptimizerRatingRule(req, { minRate: 0, minTotal: currentRatingRule.minTotal });
        },
      });
    }

    const startAbsMaxNum = optNumOrNull(startAbsMax);
    if (startAbsMaxNum != null && startAbsMaxNum > 0) {
      scenarios.push({
        id: "startabsmax",
        parameter: "START MAX",
        variant: "ON",
        summary: `startMax <= ${num(startAbsMaxNum, 2)}`,
        apply: (req) => {
          req.startAbsMax = startAbsMaxNum;
        },
      });
    }
    if (endAbs > 0) {
      scenarios.push({
        id: "endabs",
        parameter: "END",
        variant: "ON",
        summary: `end <= ${num(endAbs, 2)}`,
        apply: (req) => {
          req.endAbs = endAbs;
        },
      });
    }

    const hasCurrentStack = scenarios.length > 1;
    if (hasCurrentStack) {
      scenarios.push({
        id: "current-stack",
        parameter: "STACK",
        variant: "CURRENT",
        summary: "All current ON values",
        apply: (req) => {
          const current = buildPostRequest(dateMode === "day" ? dateNy : dateFrom, dateMode === "day" ? dateNy : dateTo);
          Object.assign(req, current);
        },
      });
    }

    return scenarios;
  }, [
    dateMode,
    dateNy,
    dateFrom,
    dateTo,
    endAbs,
    ratingMode,
    metric,
    maxCorr,
    maxBeta,
    maxSigma,
    maxAdv20,
    maxAdv20NF,
    maxAdv90,
    maxAdv90NF,
    maxAvPreMhv,
    maxClsToClsPct,
    maxLo,
    maxLstCls,
    maxLstClsNewsCnt,
    maxLstPrcL,
    maxMarketCapM,
    maxPreMktVolNF,
    maxRoundLot,
    maxSpread,
    maxTCls,
    maxVolNFfromLstCls,
    maxVWAP,
    maxYCls,
    minAdv20,
    minAdv20NF,
    minAdv90,
    minAdv90NF,
    minCorr,
    minBeta,
    minSigma,
    minAvPreMhv,
    minClsToClsPct,
    minLo,
    minLstCls,
    minLstClsNewsCnt,
    minLstPrcL,
    minMarketCapM,
    minPreMktVolNF,
    minRoundLot,
    minSpread,
    minTCls,
    minVolNFfromLstCls,
    minVWAP,
    minYCls,
    ratingRules,
    ruleBand,
    sharedRangeFilterModes,
    startAbsMax,
    zapMode,
  ]);

  const clearOptimizerFields = (req: PaperArbAnalyticsRequest) => {
    req.minCorr = null; req.maxCorr = null;
    req.minBeta = null; req.maxBeta = null;
    req.minSigma = null; req.maxSigma = null;
    req.minAdv20 = null; req.maxAdv20 = null;
    req.minAdv20NF = null; req.maxAdv20NF = null;
    req.minAdv90 = null; req.maxAdv90 = null;
    req.minAdv90NF = null; req.maxAdv90NF = null;
    req.minAvPreMhv = null; req.maxAvPreMhv = null;
    req.minRoundLot = null; req.maxRoundLot = null;
    req.minVWAP = null; req.maxVWAP = null;
    req.minSpread = null; req.maxSpread = null;
    req.minLstPrcL = null; req.maxLstPrcL = null;
    req.minLstCls = null; req.maxLstCls = null;
    req.minYCls = null; req.maxYCls = null;
    req.minTCls = null; req.maxTCls = null;
    req.minClsToClsPct = null; req.maxClsToClsPct = null;
    req.minLo = null; req.maxLo = null;
    req.minLstClsNewsCnt = null; req.maxLstClsNewsCnt = null;
    req.minMarketCapM = null; req.maxMarketCapM = null;
    req.minPreMhVolNF = null; req.maxPreMhVolNF = null;
    req.minPreMktVolNF = null; req.maxPreMktVolNF = null;
    req.minVolNFfromLstCls = null; req.maxVolNFfromLstCls = null;
    req.minAvPostMhVol90NF = null; req.maxAvPostMhVol90NF = null;
    req.minAvPreMhVol90NF = null; req.maxAvPreMhVol90NF = null;
    req.minAvPreMhValue20NF = null; req.maxAvPreMhValue20NF = null;
    req.minAvPreMhValue90NF = null; req.maxAvPreMhValue90NF = null;
    req.minAvgDailyValue20 = null; req.maxAvgDailyValue20 = null;
    req.minAvgDailyValue90 = null; req.maxAvgDailyValue90 = null;
    req.minVolatility20 = null; req.maxVolatility20 = null;
    req.minVolatility90 = null; req.maxVolatility90 = null;
    req.minPreMhMDV20NF = null; req.maxPreMhMDV20NF = null;
    req.minPreMhMDV90NF = null; req.maxPreMhMDV90NF = null;
    req.minVolRel = null; req.maxVolRel = null;
    req.minPreMhBidLstPrcPct = null; req.maxPreMhBidLstPrcPct = null;
    req.minPreMhLoLstPrcPct = null; req.maxPreMhLoLstPrcPct = null;
    req.minPreMhHiLstClsPct = null; req.maxPreMhHiLstClsPct = null;
    req.minPreMhLoLstClsPct = null; req.maxPreMhLoLstClsPct = null;
    req.minLstPrcLstClsPct = null; req.maxLstPrcLstClsPct = null;
    req.minImbExch925 = null; req.maxImbExch925 = null;
    req.minImbExch1555 = null; req.maxImbExch1555 = null;
    req.startAbsMax = null;
    req.ratingRules = scannerBinFilterEnabled({ ratingMode, metric }) ? null : [{ band: ruleBand, minRate: 0, minTotal: 0 }];
  };

  async function loadOptimizerRangesByGroup(from: string, to: string) {
    // Same reason as runEpisodesOptimizer: /optimizer/ranges buckets ARBITRAGE episodes by
    // Arbitrage-only parameters (sigma thresholds, rating gates), none of which describe a
    // fixed 09:20 -> 09:40/10:00 trade. Left inert rather than feeding the panel wrong ranges.
    setOptimizerRanges(null);
    setOptimizerRangesErr(null);
    setOptimizerRangesLoading(false);
    return;
  }

  async function loadOptimizerRangesByGroupArbitrageLegacy(from: string, to: string) {
    if (scannerBinFilterEnabled({ ratingMode, metric })) {
      setOptimizerRanges(null);
      setOptimizerRangesErr(null);
      setOptimizerRangesLoading(false);
      setOptimizerRangeGroupStatus({
        "RATING GATES": { loading: false, error: null, partial: false },
        "ZAP THRESHOLDS": { loading: false, error: null, partial: false },
        "TAPE FILTERS": { loading: false, error: null, partial: false },
      });
      return;
    }

    const effectiveScopeKeys = scopeSelectedParameterKeys.length
      ? scopeSelectedParameterKeys
      : SCOPE_PARAMETER_DEFINITIONS.map((item) => item.key);
    const loadAllScopeKeys = effectiveScopeKeys.length >= SCOPE_PARAMETER_DEFINITIONS.length;
    const requestedGroups = new Map<OptimizerRangeGroupKey, string[]>();
    for (const key of effectiveScopeKeys) {
      const def = SCOPE_PARAMETER_BY_KEY.get(key);
      if (!def) continue;
      const list = requestedGroups.get(def.group) ?? [];
      list.push(def.optimizerApiKey ?? def.scenarioParameter ?? def.key);
      requestedGroups.set(def.group, list);
    }
    const chunkKeys = (keys: string[], size: number) => {
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += size) chunks.push(keys.slice(i, i + size));
      return chunks;
    };
    const tasks: Array<{
      group: OptimizerRangeGroupKey;
      parameterKeys?: string[];
      timeoutMs: number;
      bucketCount?: number;
    }> = [];
    for (const group of ["TAPE FILTERS", "RATING GATES", "ZAP THRESHOLDS"] as OptimizerRangeGroupKey[]) {
      if (scannerBinFilterEnabled({ ratingMode, metric }) && group === "RATING GATES") continue;
      if (!loadAllScopeKeys && !requestedGroups.has(group)) continue;
      const groupKeys = loadAllScopeKeys
        ? SCOPE_PARAMETER_DEFINITIONS
            .filter((item) => item.group === group)
            .map((item) => item.optimizerApiKey ?? item.scenarioParameter ?? item.key)
        : requestedGroups.get(group) ?? [];

      if (group === "TAPE FILTERS") {
        const tapeChunks = chunkKeys(groupKeys, 4);
        for (const parameterKeys of tapeChunks) {
          tasks.push({
            group,
            parameterKeys,
            timeoutMs: 120000,
          });
        }
        continue;
      }

      tasks.push({
        group,
        parameterKeys: loadAllScopeKeys ? undefined : groupKeys,
        timeoutMs: group === "ZAP THRESHOLDS" ? 180000 : 180000,
        bucketCount: group === "ZAP THRESHOLDS" ? 6 : undefined,
      });
    }

    if (!tasks.length) {
      setOptimizerRanges(null);
      setOptimizerRangesErr(null);
      setOptimizerRangesLoading(false);
      setOptimizerRangeGroupStatus({
        "RATING GATES": { loading: false, error: null, partial: false },
        "ZAP THRESHOLDS": { loading: false, error: null, partial: false },
        "TAPE FILTERS": { loading: false, error: null, partial: false },
      });
      return;
    }
    const groupPending = tasks.reduce<Record<OptimizerRangeGroupKey, number>>(
      (acc, task) => {
        acc[task.group] += 1;
        return acc;
      },
      { "RATING GATES": 0, "ZAP THRESHOLDS": 0, "TAPE FILTERS": 0 }
    );
    const groupErrors: Record<OptimizerRangeGroupKey, string[]> = {
      "RATING GATES": [],
      "ZAP THRESHOLDS": [],
      "TAPE FILTERS": [],
    };
    const groupSuccesses: Record<OptimizerRangeGroupKey, number> = {
      "RATING GATES": 0,
      "ZAP THRESHOLDS": 0,
      "TAPE FILTERS": 0,
    };

    setOptimizerRanges(null);
    setOptimizerRangesErr(null);
    setOptimizerRangesLoading(true);
    setOptimizerRangeGroupStatus({
      "RATING GATES": { loading: groupPending["RATING GATES"] > 0, error: null, partial: false },
      "ZAP THRESHOLDS": { loading: groupPending["ZAP THRESHOLDS"] > 0, error: null, partial: false },
      "TAPE FILTERS": { loading: groupPending["TAPE FILTERS"] > 0, error: null, partial: false },
    });
    let anyGroupReady = false;
    const failedGroups: string[] = [];

    const executeTask = async (task: {
      group: OptimizerRangeGroupKey;
      parameterKeys?: string[];
      timeoutMs: number;
      bucketCount?: number;
    }) => {
        const { group, parameterKeys, timeoutMs, bucketCount } = task;
        const groupReq = buildPostRequest(from, to);
        applyOptimizerRatingRule(groupReq);
        groupReq.optimizerBucketCount = bucketCount ?? Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, Math.trunc(optimizerBucketCount)));
        groupReq.optimizerBinMode = optimizerBinMode;
        groupReq.optimizerGroups = [group];
        groupReq.optimizerParameterKeys = parameterKeys ?? null;
        try {
          const resp = await apiPostWithTimeout<PaperArbOptimizerRangesResponse>(
            "/api/paper/arbitrage/optimizer/ranges",
            groupReq,
            timeoutMs
          );

          setOptimizerRanges((prev) => ({
            dateFrom: resp?.dateFrom ?? prev?.dateFrom ?? from,
            dateTo: resp?.dateTo ?? prev?.dateTo ?? to,
            metric: resp?.metric ?? prev?.metric ?? metric,
            session: resp?.session ?? prev?.session ?? session,
            closeMode: resp?.closeMode ?? prev?.closeMode ?? closeMode,
            pnlMode: resp?.pnlMode ?? prev?.pnlMode ?? pnlMode,
            bucketCount: resp?.bucketCount ?? prev?.bucketCount ?? optimizerBucketCount,
            parametersAnalyzed: new Map(
              [...(prev?.parameters ?? []), ...(resp?.parameters ?? [])].map((parameter) => [parameter.key, parameter])
            ).size,
            parameters: [...new Map(
              [...(prev?.parameters ?? []), ...(resp?.parameters ?? [])].map((parameter) => [parameter.key, parameter])
            ).values()],
          }));
          anyGroupReady = true;
          groupSuccesses[group] += 1;
          groupPending[group] = Math.max(0, groupPending[group] - 1);
          setOptimizerRangeGroupStatus((prev) => ({
            ...prev,
            [group]: {
              loading: groupPending[group] > 0,
              error: groupSuccesses[group] > 0 ? null : groupErrors[group][0] ?? null,
              partial: groupSuccesses[group] > 0 && groupErrors[group].length > 0,
            },
          }));
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          failedGroups.push(`${group}: ${msg}`);
          groupErrors[group].push(msg);
          groupPending[group] = Math.max(0, groupPending[group] - 1);
          setOptimizerRangeGroupStatus((prev) => ({
            ...prev,
            [group]: {
              loading: groupPending[group] > 0,
              error: groupSuccesses[group] > 0 ? null : groupErrors[group][0] ?? null,
              partial: groupSuccesses[group] > 0 && groupErrors[group].length > 0,
            },
          }));
        }
      };

    const tapeTasks = tasks.filter((task) => task.group === "TAPE FILTERS");
    const nonTapeTasks = tasks.filter((task) => task.group !== "TAPE FILTERS");

    await Promise.all(nonTapeTasks.map((task) => executeTask(task)));
    for (const task of tapeTasks) {
      await executeTask(task);
    }

    setOptimizerRangesErr(!anyGroupReady && failedGroups.length ? failedGroups[0] : null);
    setOptimizerRangesLoading(false);
  }

  // OpenDoor evaluates optimizer scenarios client-side instead of calling /scope/evaluate.
  //
  // Arbitrage needs the server because narrowing a filter there changes which EPISODES EXIST — the
  // hedge engine has to replay the day under the new thresholds. OpenDoor has no such feedback
  // loop: entry and exit are fixed by the clock, so a filter can only ever keep or drop trades that
  // already happened. That makes "what if I restricted parameter X to range Y" a pure partition of
  // the rows on screen — which optimizerRangeParameters has already computed, bucket by bucket.
  // So the scenarios are read straight off those buckets rather than recomputed.
  async function runEpisodesOptimizer() {
    if (optimizerLoading) return;
    setOptimizerLoading(true);
    setOptimizerErr(null);

    try {
      const rows: OptimizerResultRow[] = [];

      const pnls = filteredEpisodes.map((r) => r.totalPnlUsd ?? 0);
      const baseTrades = pnls.length;
      const baseWins = pnls.filter((v) => v > 0).length;
      const baseLosses = pnls.filter((v) => v < 0).length;
      const baseTotal = pnls.reduce((sum, v) => sum + v, 0);
      const baseAvg = baseTrades > 0 ? baseTotal / baseTrades : 0;

      rows.push({
        id: "baseline",
        parameter: "BASE",
        variant: "all",
        summary: `all ${intn(baseTrades)} episodes`,
        trades: baseTrades,
        wins: baseWins,
        losses: baseLosses,
        winRate: baseTrades > 0 ? baseWins / baseTrades : 0,
        totalPnlUsd: baseTotal,
        avgPnlUsd: baseAvg,
        score: baseAvg,
      });

      const parameters = buildOptimizerRangeParameters();
      setOptimizerRangeParameters(parameters);

      for (const parameter of parameters) {
        const buckets = [
          ...(parameter.buckets ?? []),
          ...(parameter.lowerTailBuckets ?? []),
          ...(parameter.upperTailBuckets ?? []),
        ];
        for (const bucket of buckets) {
          if (!bucket || bucket.trades <= 0) continue;
          rows.push({
            id: `${parameter.key}|${bucket.bucketId}`,
            parameter: parameter.label,
            variant: bucket.label,
            summary: `${parameter.label} in ${bucket.label}`,
            trades: bucket.trades,
            wins: bucket.wins,
            losses: bucket.losses,
            winRate: bucket.winRate,
            totalPnlUsd: bucket.totalPnlUsd,
            avgPnlUsd: bucket.avgPnlUsd,
            score: bucket.score,
          });
        }
      }

      rows.sort((a, b) => {
        if (a.id === "baseline") return -1;
        if (b.id === "baseline") return 1;
        return b.score - a.score;
      });

      setOptimizerRows(rows);
      // Pair overlay compares two parameters at once; it has no client-side equivalent yet.
      setOptimizerErr(
        rows.length <= 1
          ? "No episodes on screen to optimize over — run a date with results first."
          : null
      );
    } catch (e: any) {
      setOptimizerErr(e?.message ?? String(e));
    } finally {
      setOptimizerLoading(false);
    }
  }

  async function runEpisodesOptimizerArbitrageLegacy() {
    if (optimizerLoading) return;
    const from = dateMode === "day" ? dateNy : dateFrom;
    const to = dateMode === "day" ? dateNy : dateTo;
    if (!toYmd(from) || !toYmd(to) || from > to) {
      setOptimizerErr("Invalid date range for optimizer.");
      return;
    }
    if (!optimizerScenarios.length) {
      setOptimizerErr("No optimizer scenarios configured.");
      return;
    }
    if (!scopeSelectedParameters.length) {
      setOptimizerErr("Select at least one parameter in SCOPE.");
      return;
    }

    setOptimizerLoading(true);
    setOptimizerErr(null);
    setScopeResearchSelections({
      left: null,
      right: null,
    });

    try {
      const buildScopeScenarioRequest = (
        id: string,
        parameter: string,
        variant: string,
        summary: string,
        apply: (req: PaperArbAnalyticsRequest) => void
      ): ScopeBatchScenarioRequest => {
        const req = buildPostRequest(from, to);
        clearOptimizerFields(req);
        apply(req);
        return {
          id,
          parameter,
          variant,
          summary,
          request: req,
        };
      };

      const scopeScenarioRows = optimizerScenarios.filter((scenario) => {
        if (scenario.id === "baseline" || scenario.id === "current-stack" || scenario.parameter === "BASE" || scenario.parameter === "STACK") {
          return true;
        }
        return scopeSelectedScenarioParameterLabels.includes(scenario.parameter);
      });

      const singleScenarioCount = scopeScenarioRows.length;
      setOptimizerProgress({ done: 0, total: singleScenarioCount });

      const baseRequest = buildPostRequest(from, to);
      clearOptimizerFields(baseRequest);

      const rowRequests = scopeScenarioRows.map((scenario) =>
        buildScopeScenarioRequest(scenario.id, scenario.parameter, scenario.variant, scenario.summary, scenario.apply)
      );
      const resp = await apiPostWithTimeout<ScopeBatchResponse>(
        "/api/paper/arbitrage/scope/evaluate",
        {
          baseRequest,
          rows: rowRequests,
        },
        180_000
      );

      const out = [...(resp?.rows ?? [])].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
        return b.trades - a.trades;
      });
      setOptimizerRows(out);
      setOptimizerProgress({ done: singleScenarioCount, total: singleScenarioCount });
      void loadOptimizerRangesByGroup(from, to);
    } catch (e: any) {
      setOptimizerErr(e?.message ?? String(e));
    } finally {
      setOptimizerLoading(false);
    }
  }

  useEffect(() => {
    const reloadKey = `${optimizerBucketCount}|${optimizerBinMode}`;
    if (optimizerBucketReloadRef.current == null) {
      optimizerBucketReloadRef.current = reloadKey;
      return;
    }
    if (optimizerBucketReloadRef.current === reloadKey) return;
    optimizerBucketReloadRef.current = reloadKey;
    if (!optimizerRows.length && !optimizerRanges?.parameters?.length) return;
    const from = dateMode === "day" ? dateNy : dateFrom;
    const to = dateMode === "day" ? dateNy : dateTo;
    if (!toYmd(from) || !toYmd(to) || from > to) return;
    void loadOptimizerRangesByGroup(from, to);
  }, [
    optimizerBucketCount,
    optimizerBinMode,
    optimizerRows.length,
    optimizerRanges?.parameters?.length,
    dateMode,
    dateNy,
    dateFrom,
    dateTo,
  ]);

  const ignoreSet = useMemo(() => new Set(splitListUpper(ignoreTickersText)), [ignoreTickersText]);
  const applySet = useMemo(() => new Set(splitListUpper(tickersText)), [tickersText]);
  const pinSet = useMemo(() => new Set(splitListUpper(benchTickersText)), [benchTickersText]);
  const requestScopedTickers = useMemo(() => {
    if (listMode === "apply") return Array.from(applySet);
    if (listMode === "pin") return Array.from(pinSet);
    return [] as string[];
  }, [listMode, applySet, pinSet]);

  // IGN travels to the server as a deny-list. It used to be inverted here into an allow-list built
  // out of the rows currently on screen, so every request was scoped to the PREVIOUS request's
  // result set — and on OpenDoor that list also reached the engine, which cached the day it
  // produced under a key that ignored tickers.
  const requestExcludedTickers = useMemo(
    () => (listMode === "ignore" ? Array.from(ignoreSet) : ([] as string[])),
    [listMode, ignoreSet]
  );

  const listModeAllowsTicker = (tkRaw: string | null | undefined) => {
    const tk = tickerKey(tkRaw);
    if (!tk) return false;
    if (listMode === "ignore") return !ignoreSet.has(tk);
    if (listMode === "apply") return applySet.has(tk);
    if (listMode === "pin") return pinSet.has(tk);
    return true;
  };

  const _minCorrV = optNumOrNull(minCorr);
  const _maxCorrV = optNumOrNull(maxCorr);
  const _minBetaV = optNumOrNull(minBeta);
  const _maxBetaV = optNumOrNull(maxBeta);
  const _minSigmaV = optNumOrNull(minSigma);
  const _maxSigmaV = optNumOrNull(maxSigma);

  const _metaLoaded = Object.keys(arbitrageTickerMetaByTicker).length > 0;

  // Shared min/max filters used to be enforced only by the Arbitrage endpoint, which received them
  // in the request body. OpenDoor talks to its own endpoint, whose request carries none of them, so
  // without this they silently did nothing and the P&L never moved when a bound was set.
  // Nothing needs to go back to the server: episode rows already carry the whole static block
  // (TapeStaticMeta), and scopeResearchParameterValue is the same extractor the Visual Scope uses.
  // corr/beta/sigma are absent here on purpose - they are checked below with a ticker-meta fallback.
  const sharedRangeChecks: Array<[SharedRangeFilterKey, string, string]> = [
    ["adv20", minAdv20, maxAdv20],
    ["adv20nf", minAdv20NF, maxAdv20NF],
    ["adv90", minAdv90, maxAdv90],
    ["adv90nf", minAdv90NF, maxAdv90NF],
    ["avpremhv", minAvPreMhv, maxAvPreMhv],
    ["roundlot", minRoundLot, maxRoundLot],
    ["vwap", minVWAP, maxVWAP],
    ["spread", minSpread, maxSpread],
    ["lstprcl", minLstPrcL, maxLstPrcL],
    ["lstcls", minLstCls, maxLstCls],
    ["ycls", minYCls, maxYCls],
    ["tcls", minTCls, maxTCls],
    ["clstocls", minClsToClsPct, maxClsToClsPct],
    ["lo", minLo, maxLo],
    ["lstclsnewscnt", minLstClsNewsCnt, maxLstClsNewsCnt],
    ["marketcapm", minMarketCapM, maxMarketCapM],
    ["premhvolnf", minPreMktVolNF, maxPreMktVolNF],
    ["volnffromlstcls", minVolNFfromLstCls, maxVolNFfromLstCls],
    ["avpostmhvol90nf", minAvPostMhVol90NF, maxAvPostMhVol90NF],
    ["avpremhvol90nf", minAvPreMhVol90NF, maxAvPreMhVol90NF],
    ["avpremhvalue20nf", minAvPreMhValue20NF, maxAvPreMhValue20NF],
    ["avpremhvalue90nf", minAvPreMhValue90NF, maxAvPreMhValue90NF],
    ["avgdailyvalue20", minAvgDailyValue20, maxAvgDailyValue20],
    ["avgdailyvalue90", minAvgDailyValue90, maxAvgDailyValue90],
    ["volatility20", minVolatility20, maxVolatility20],
    ["volatility90", minVolatility90, maxVolatility90],
    ["premhmdv20nf", minPreMhMDV20NF, maxPreMhMDV20NF],
    ["premhmdv90nf", minPreMhMDV90NF, maxPreMhMDV90NF],
    ["volrel", minVolRel, maxVolRel],
    ["premhbidlstprc", minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct],
    ["premhlolstprc", minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct],
    ["premhhilstcls", minPreMhHiLstClsPct, maxPreMhHiLstClsPct],
    ["premhlolstcls", minPreMhLoLstClsPct, maxPreMhLoLstClsPct],
    ["lstprclstcls", minLstPrcLstClsPct, maxLstPrcLstClsPct],
    ["imbexch925", minImbExch925, maxImbExch925],
    ["imbexch1555", minImbExch1555, maxImbExch1555],
  ];

  const passesSharedRangeBounds = (row: PaperArbClosedDto) => {
    for (const [key, minRaw, maxRaw] of sharedRangeChecks) {
      const min = rangeValueOrNull(key, minRaw);
      const max = rangeValueOrNull(key, maxRaw);
      if (min == null && max == null) continue;

      const parameterKey = optimizerKeyToScopeResearchParameterKey(key);
      const value = parameterKey ? scopeResearchParameterValue(row, parameterKey) : null;
      if (value == null) return false;
      if (min != null && value < min) return false;
      if (max != null && value > max) return false;
    }
    return true;
  };

  const passesStaticMetricRangeFilters = (row: PaperArbClosedDto) => {
    if (!passesSharedRangeBounds(row)) return false;

    // Report gate: the same rule Sonar and Stream apply to the raw vendor marker, but judged
    // against the TAPE DAY this row belongs to rather than against today. The marker carries only
    // day/month ("10/08 BMO"), so comparing a replayed day's rows to today's date made every one
    // of them read as stale — the toggle looked wired and rejected nothing.
    // Deliberately NOT the server's HasReport boolean: the tape collapses the marker to "any
    // marker means yes", discarding the date and release time the rule is built on.
    if (requireHasReport || excludeHasReport) {
      const affectsSession = rowReportAffectsSession(row, reportSessionForRow(row));
      if (excludeHasReport && affectsSession) return false;
      if (requireHasReport && !affectsSession) return false;
    }
    // Borrow availability (B5ETB), written to the tape so it exists on a Scanner row at all.
    if (rowExcludedByBorrow(row, excludeItb, excludeHard)) return false;
    // CORR: not "this ticker reports" but "this ticker moves with one that does".
    if (excludeCorr && rowExcludedByCorr(row, sectorCorr.excluded)) return false;
    const ticker = String(row.ticker ?? "").trim().toUpperCase();
    const tickerMeta = ticker ? arbitrageTickerMetaByTicker[ticker] ?? null : null;

    if (_minCorrV != null || _maxCorrV != null) {
      const value = getOptimizerFallbackValue(row, "corr", tickerMeta);
      if (value == null) {
        if (!_metaLoaded) { /* pass through */ } else return false;
      } else {
        if (_minCorrV != null && value < _minCorrV) return false;
        if (_maxCorrV != null && value > _maxCorrV) return false;
      }
    }
    if (_minBetaV != null || _maxBetaV != null) {
      const value = getOptimizerFallbackValue(row, "beta", tickerMeta);
      if (value == null) {
        if (!_metaLoaded) { /* pass through */ } else return false;
      } else {
        if (_minBetaV != null && value < _minBetaV) return false;
        if (_maxBetaV != null && value > _maxBetaV) return false;
      }
    }
    if (_minSigmaV != null || _maxSigmaV != null) {
      const value = getOptimizerFallbackValue(row, "sigma", tickerMeta);
      if (value == null) {
        if (!_metaLoaded) { /* pass through */ } else return false;
      } else {
        if (_minSigmaV != null && value < _minSigmaV) return false;
        if (_maxSigmaV != null && value > _maxSigmaV) return false;
      }
    }

    return true;
  };

  // ========= Client-side filters
  const filteredActive = useMemo(() => {
    const tq = deferredQTicker.trim().toUpperCase();
    const useBinRatingFilter = scannerBinFilterEnabled({ ratingMode, metric });
    const useSigBinFilter = ratingMode === "BINS" && metric === "SigmaZap";
    const activeBinRule = ratingRules.find((r) => r.band === ratingBandFromSession(session)) ?? { minRate: 0, minTotal: 0 };
    return activeRows.filter((r) => {
      if (!listModeAllowsTicker(r.ticker)) return false;
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      if (zapMode === "delta" && !passesDeltaZapGate({
        side: r.side,
        metricAbs: r.start?.metricAbs,
        deltaAbs: startAbs,
        printMedianPos: r.printMedianPos,
        printMedianNeg: r.printMedianNeg,
      })) return false;
      if (ratingMode === "SESSION") {
        if (!passesStreamRatingFilter({
          ratingMode: "SESSION",
          signal: r,
          session,
          side: normalizeSide(r.side).isLong ? "Long" : "Short",
          sigmaAbs: null,
          minRate: activeBinRule.minRate,
          minTotal: activeBinRule.minTotal,
          ratingType,
        })) return false;
      }
      if (!passesScannerBinRatingFilter({
        enabled: useBinRatingFilter,
        row: r,
        session,
        side: r.side,
        sigmaAbs: r.last?.metricAbs ?? r.start?.metricAbs,
        minRate: activeBinRule.minRate,
        minTotal: activeBinRule.minTotal,
      })) return false;
      if (useSigBinFilter) {
        if (!passesScannerBinRatingFilter({
          enabled: true,
          row: r,
          session,
          side: r.side,
          sigmaAbs: r.last?.metricAbs ?? r.start?.metricAbs,
          minRate: activeBinRule.minRate,
          minTotal: activeBinRule.minTotal,
        })) return false;
        const snap = scannerSigBinSnapshot({ row: r, session, side: r.side, sigmaAbs: r.last?.metricAbs ?? r.start?.metricAbs });
        if (!snap) return false;
        const effRate = Math.max(0, Number(activeBinRule.minRate) || 0);
        const effTotal = Math.max(0, Math.trunc(Number(activeBinRule.minTotal) || 0));
        if (snap.rate < effRate || snap.total < effTotal) return false;
      }
      if (topMode) {
        const sigmaAbs = r.last?.metricAbs ?? r.start?.metricAbs;
        const tw = scannerTopWindowSnapshot({ row: r, session, side: r.side, sigmaAbs });
        if (!tw) return false;
        if (topSigmaOn && tw.sigma) {
          if (sigmaAbs == null || !Number.isFinite(sigmaAbs) || sigmaAbs < tw.sigma.lo || sigmaAbs > tw.sigma.hi) return false;
        } else if (topSigmaOn && !tw.sigma) return false;
        if (topBenchOn && tw.bench) {
          const bid = optNumOrNull(r.last?.benchBidPct ?? r.start?.benchBidPct);
          const ask = optNumOrNull(r.last?.benchAskPct ?? r.start?.benchAskPct);
          const bp = bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask ?? null);
          if (bp == null || bp < tw.bench.lo || bp > tw.bench.hi) return false;
        } else if (topBenchOn && !tw.bench) return false;
        if (topTimeOn && tw.time) {
          if (scannerCurrentTimeBand(30) !== tw.time.band) return false;
        } else if (topTimeOn && !tw.time) return false;
      }
      if (!passesStaticMetricRangeFilters(r as unknown as PaperArbClosedDto)) return false;
      return true;
    });
  }, [activeRows, deferredQTicker, qSide, listMode, ignoreSet, applySet, pinSet, zapMode, startAbs, ratingMode, metric, ratingRules, session, arbitrageTickerMetaByTicker, sharedRangeFilterModes, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma, minAdv20, maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF, minAvPreMhv, maxAvPreMhv, minRoundLot, maxRoundLot, minVWAP, maxVWAP, minSpread, maxSpread, minLstPrcL, maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls, minClsToClsPct, maxClsToClsPct, minLo, maxLo, minLstClsNewsCnt, maxLstClsNewsCnt, minMarketCapM, maxMarketCapM, minPreMktVolNF, maxPreMktVolNF, minVolNFfromLstCls, maxVolNFfromLstCls, minAvPostMhVol90NF, maxAvPostMhVol90NF, minAvPreMhVol90NF, maxAvPreMhVol90NF, minAvPreMhValue20NF, maxAvPreMhValue20NF, minAvPreMhValue90NF, maxAvPreMhValue90NF, minAvgDailyValue20, maxAvgDailyValue20, minAvgDailyValue90, maxAvgDailyValue90, minVolatility20, maxVolatility20, minVolatility90, maxVolatility90, minPreMhMDV20NF, maxPreMhMDV20NF, minPreMhMDV90NF, maxPreMhMDV90NF, minVolRel, maxVolRel, minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct, minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct, minPreMhHiLstClsPct, maxPreMhHiLstClsPct, minPreMhLoLstClsPct, maxPreMhLoLstClsPct, minLstPrcLstClsPct, maxLstPrcLstClsPct, minImbExch925, maxImbExch925, minImbExch1555, maxImbExch1555, requireHasReport, excludeHasReport, excludeCorr, sectorCorr.excluded, topMode, topSigmaOn, topBenchOn, topTimeOn]);

  const filteredEpisodes = useMemo(() => {
    const tq = deferredQTicker.trim().toUpperCase();
    const useBinRatingFilter = scannerBinFilterEnabled({ ratingMode, metric });
    const useSigBinFilter = ratingMode === "BINS" && metric === "SigmaZap";
    const episodeBinRule = ratingRules.find((r) => r.band === ratingBandFromSession(session)) ?? { minRate: 0, minTotal: 0 };
    return episodesRows.filter((r) => {
      if (!listModeAllowsTicker(r.ticker)) return false;
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      if (zapMode === "delta" && !passesDeltaZapGate({
        side: r.side,
        metricAbs: r.startMetricAbs,
        deltaAbs: startAbs,
        printMedianPos: r.printMedianPos,
        printMedianNeg: r.printMedianNeg,
      })) return false;
      if (ratingMode === "SESSION") {
        if (!passesStreamRatingFilter({
          ratingMode: "SESSION",
          signal: r,
          session,
          side: normalizeSide(r.side).isLong ? "Long" : "Short",
          sigmaAbs: null,
          minRate: episodeBinRule.minRate,
          minTotal: episodeBinRule.minTotal,
          ratingType,
        })) return false;
      }
      if (!passesScannerBinRatingFilter({
        enabled: useBinRatingFilter,
        row: r,
        session,
        side: r.side,
        sigmaAbs: r.peakMetricAbs ?? r.startMetricAbs,
        minRate: episodeBinRule.minRate,
        minTotal: episodeBinRule.minTotal,
      })) return false;
      if (useSigBinFilter) {
        if (!passesScannerBinRatingFilter({
          enabled: true,
          row: r,
          session,
          side: r.side,
          sigmaAbs: r.peakMetricAbs ?? r.startMetricAbs,
          minRate: episodeBinRule.minRate,
          minTotal: episodeBinRule.minTotal,
        })) return false;
        const snap = scannerSigBinSnapshot({ row: r, session, side: r.side, sigmaAbs: r.peakMetricAbs ?? r.startMetricAbs });
        if (!snap) return false;
        const effRate = Math.max(0, Number(episodeBinRule.minRate) || 0);
        const effTotal = Math.max(0, Math.trunc(Number(episodeBinRule.minTotal) || 0));
        if (snap.rate < effRate || snap.total < effTotal) return false;
      }
      if (topMode) {
        const sigmaAbs = r.peakMetricAbs ?? r.startMetricAbs;
        const tw = scannerTopWindowSnapshot({ row: r, session, side: r.side, sigmaAbs });
        if (!tw) return false;
        if (topSigmaOn && tw.sigma) {
          if (sigmaAbs == null || !Number.isFinite(sigmaAbs) || sigmaAbs < tw.sigma.lo || sigmaAbs > tw.sigma.hi) return false;
        } else if (topSigmaOn && !tw.sigma) return false;
        if (topBenchOn && tw.bench) {
          const bp = optNumOrNull(r.peakBenchLstPrcLstClsPct);
          if (bp == null || bp < tw.bench.lo || bp > tw.bench.hi) return false;
        } else if (topBenchOn && !tw.bench) return false;
        if (topTimeOn && tw.time) {
          if (scannerCurrentTimeBand(30) !== tw.time.band) return false;
        } else if (topTimeOn && !tw.time) return false;
      }
      if (!passesStaticMetricRangeFilters(r)) return false;
      return true;
    });
  }, [episodesRows, deferredQTicker, qSide, listMode, ignoreSet, applySet, pinSet, zapMode, startAbs, ratingMode, metric, ratingRules, session, arbitrageTickerMetaByTicker, sharedRangeFilterModes, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma, minAdv20, maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF, minAvPreMhv, maxAvPreMhv, minRoundLot, maxRoundLot, minVWAP, maxVWAP, minSpread, maxSpread, minLstPrcL, maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls, minClsToClsPct, maxClsToClsPct, minLo, maxLo, minLstClsNewsCnt, maxLstClsNewsCnt, minMarketCapM, maxMarketCapM, minPreMktVolNF, maxPreMktVolNF, minVolNFfromLstCls, maxVolNFfromLstCls, minAvPostMhVol90NF, maxAvPostMhVol90NF, minAvPreMhVol90NF, maxAvPreMhVol90NF, minAvPreMhValue20NF, maxAvPreMhValue20NF, minAvPreMhValue90NF, maxAvPreMhValue90NF, minAvgDailyValue20, maxAvgDailyValue20, minAvgDailyValue90, maxAvgDailyValue90, minVolatility20, maxVolatility20, minVolatility90, maxVolatility90, minPreMhMDV20NF, maxPreMhMDV20NF, minPreMhMDV90NF, maxPreMhMDV90NF, minVolRel, maxVolRel, minPreMhBidLstPrcPct, maxPreMhBidLstPrcPct, minPreMhLoLstPrcPct, maxPreMhLoLstPrcPct, minPreMhHiLstClsPct, maxPreMhHiLstClsPct, minPreMhLoLstClsPct, maxPreMhLoLstClsPct, minLstPrcLstClsPct, maxLstPrcLstClsPct, minImbExch925, maxImbExch925, minImbExch1555, maxImbExch1555, requireHasReport, excludeHasReport, excludeCorr, sectorCorr.excluded, topMode, topSigmaOn, topBenchOn, topTimeOn]);

  // The SNAPSHOT table predates the shared row shape and reads OpenDoor's own field names, so
  // translate once here rather than in every cell. Entry/exit fills are side-dependent: Long buys
  // the ask and sells the bid, Short the reverse.
  const openDoorSnapshotRows = useMemo<OpenDoorPaperClosed[]>(
    () =>
      filteredEpisodes.map((r: any) => {
        const isLong = String(r?.side ?? "") === "Long";
        return {
          ticker: String(r?.ticker ?? ""),
          benchTicker: r?.benchTicker ?? null,
          side: isLong ? "Long" : "Short",
          entryMinuteIdx: Number(r?.startMinuteIdx),
          exitMinuteIdx: Number(r?.endMinuteIdx),
          entryStack: (isLong ? r?.startAskPct : r?.startBidPct) ?? null,
          exitStack: (isLong ? r?.endBidPct : r?.endAskPct) ?? null,
          move: r?.move ?? null,
          pnl: r?.totalPnlUsd ?? null,
          entryDevSig: r?.entryDevSig ?? null,
          entryBench: r?.startBenchLstPrcLstClsPct ?? null,
          gateRate: r?.rating ?? null,
          gateTotal: r?.ratingTotal ?? null,
        };
      }),
    [filteredEpisodes]
  );

  const openDoorSnapshotStats = useMemo(() => {
    const rows = openDoorSnapshotRows.filter((r) => r.pnl != null);
    const wins = rows.filter((r) => (r.pnl ?? 0) > 0);
    const losses = rows.filter((r) => (r.pnl ?? 0) < 0);

    const trades = rows.length;
    const totalPnl = rows.reduce((s, r) => s + (r.pnl ?? 0), 0);
    const winRate = trades > 0 ? wins.length / trades : 0;
    const avgTrade = trades > 0 ? totalPnl / trades : 0;
    const maxWin = wins.length ? Math.max(...wins.map((r) => r.pnl ?? 0)) : 0;
    const maxLoss = losses.length ? Math.min(...losses.map((r) => r.pnl ?? 0)) : 0;
    const avgWin = wins.length ? wins.reduce((s, r) => s + (r.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, r) => s + (r.pnl ?? 0), 0) / losses.length : 0;
    const grossWin = wins.reduce((s, r) => s + (r.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + (r.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

    const sorted = [...openDoorSnapshotRows].sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));

    return { rows: sorted, trades, totalPnl, winRate, avgTrade, maxWin, maxLoss, avgWin, avgLoss, profitFactor, expectancy };
  }, [openDoorSnapshotRows]);

  useEffect(() => {
    if (arbitrageTickerMetaLoadedRef.current) return;
    const hasStaticMetricBounds =
      optNumOrNull(minCorr) != null ||
      optNumOrNull(maxCorr) != null ||
      optNumOrNull(minBeta) != null ||
      optNumOrNull(maxBeta) != null ||
      optNumOrNull(minSigma) != null ||
      optNumOrNull(maxSigma) != null;
    const needsStaticMetricMeta =
      hasStaticMetricBounds ||
      scopeSelectedParameterKeys.some((key) => key === "corr" || key === "beta" || key === "sigma" || key === "sector" || key === "bench");
    if (!needsStaticMetricMeta) return;

    const sourceRows = [...episodesRows, ...(activeRows as any[])];
    const needRatingMeta = sourceRows.some((row) => {
      const ticker = String((row as any)?.ticker ?? "").trim();
      if (!ticker) return false;
      return (
        getOptimizerFallbackValue(row as PaperArbClosedDto, "corr") == null ||
        getOptimizerFallbackValue(row as PaperArbClosedDto, "beta") == null ||
        getOptimizerFallbackValue(row as PaperArbClosedDto, "sigma") == null
      );
    });

    if (!needRatingMeta) return;

    arbitrageTickerMetaLoadedRef.current = true;
    setArbitrageTickerMetaLoading(true);
    getArbitrageList()
      .then((rows) => {
        const next: Record<string, { corr?: number | null; beta?: number | null; sigma?: number | null; sectorL3?: string | null; benchTicker?: string | null }> = {};
        for (const row of rows ?? []) {
          const ticker = String(row?.ticker ?? "").trim().toUpperCase();
          if (!ticker) continue;
          const rawSector = row?.sectorL3 ?? row?.SectorL3 ?? row?.sector ?? row?.Sector ?? null;
          const rawBench = row?.bench ?? row?.Bench ?? row?.benchTicker ?? row?.BenchTicker ?? null;
          next[ticker] = {
            corr: numOrNull(row?.corr),
            beta: numOrNull(row?.beta),
            sigma: numOrNull(row?.sig ?? row?.sigma),
            sectorL3: rawSector ? String(rawSector).trim() || null : null,
            benchTicker: rawBench ? String(rawBench).trim().toUpperCase() || null : null,
          };
        }
        setArbitrageTickerMetaByTicker(next);
      })
      .catch(() => {
        arbitrageTickerMetaLoadedRef.current = false;
      })
      .finally(() => {
        setArbitrageTickerMetaLoading(false);
      });
  }, [optimizerRanges, episodesRows, activeRows, scopeSelectedParameterKeys, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

  const cmpVal = (a: string | number, b: string | number) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  };
  const dirMul = (dir: SortDir) => (dir === "asc" ? 1 : -1);

  const episodeSortValue = (r: PaperArbClosedDto, key: EpisodeSortKey): string | number => {
    switch (key) {
      case "ticker":
        return String(r.ticker ?? "");
      case "bench":
        return String(r.benchTicker ?? "");
      case "side":
        return normalizeSide(r.side).label;
      case "startTime":
        return r.startMinuteIdx ?? -1;
      case "peakTime":
        return r.peakMinuteIdx ?? -1;
      case "endTime":
        return r.endMinuteIdx ?? -1;
      case "startAbs":
        return r.startMetric ?? r.startMetricAbs ?? -1;
      case "peakAbs":
        return r.peakMetric ?? r.peakMetricAbs ?? -1;
      case "endAbs":
        return r.endMetric ?? r.endMetricAbs ?? -1;
      case "total":
        return r.totalPnlUsd ?? 0;
      case "raw":
        return r.rawPnlUsd ?? 0;
      case "benchPnl":
        return r.benchPnlUsd ?? 0;
      case "hedged":
        return r.hedgedPnlUsd ?? 0;
      case "closeMode":
        return String(r.closeMode ?? closeMode);
      case "minHold":
        return r.minHoldCandles ?? minHoldCandles;
    }
  };

  const activeRealtimeRows = useMemo<PaperArbClosedDto[]>(() => {
    return filteredActive.map((row) => {
      const startAbs =
        row.start?.metricAbs ?? (row.start?.metric != null ? Math.abs(row.start.metric) : null);
      const peakAbs =
        row.peak?.metricAbs ?? (row.peak?.metric != null ? Math.abs(row.peak.metric) : null);
      const lastAbs =
        row.last?.metricAbs ?? (row.last?.metric != null ? Math.abs(row.last.metric) : null);
      const tickerAmountUsd = scannerTickerAmountUsd(
        sizingMode,
        sizeValue,
        row.tierBp ?? (row as any).TierBp ?? null,
        row.entryCount ?? (row as any).EntryCount ?? null,
        dilutionMode
      );
      const trancheAmountUsd = scannerTickerAmountUsd(sizingMode, sizeValue, row.tierBp ?? (row as any).TierBp ?? null, 1, "Undiluted");
      const rowCloseMode = row.closeMode ?? closeMode;
      const rowGapPct = row.gapPct ?? (row as any).GapPct ?? null;
      const isRowPassive = rowCloseMode === "Passive";
      const pnl = scannerRealtimePnlUsd({
        side: row.side,
        beta: row.beta ?? (row as any).Beta ?? null,
        trancheAmountUsd,
        entrySnaps: row.entrySnaps ?? null,
        start: row.start,
        last: row.last,
        pnlMode,
        priceMode,
        closeMode: rowCloseMode,
        gapPct: rowGapPct,
        benchGapPct: row.benchGapPct ?? (row as any).BenchGapPct ?? null,
        // OpenDoor rows carry no start class, so every Passive close marks against the gap —
        // the behaviour this scanner has always had.
        passiveGapExit: "always",
      });
      const serverRawPnl = row.rawPnlUsd ?? (row as any).RawPnlUsd ?? null;
      const serverBenchPnl = row.benchPnlUsd ?? (row as any).BenchPnlUsd ?? null;
      const serverHedgedPnl = row.hedgedPnlUsd ?? (row as any).HedgedPnlUsd ?? null;
      const serverTotalPnl = row.totalPnlUsd ?? (row as any).TotalPnlUsd ?? null;

      return {
        ticker: row.ticker,
        benchTicker: row.benchTicker,
        side: row.side,
        dateNy,
        date: dateNy,
        day: dateNy,
        tradeDate: dateNy,
        tradeDateNy: dateNy,
        sessionDate: dateNy,
        sessionDateNy: dateNy,
        startMinuteIdx: row.start?.minuteIdx ?? 0,
        peakMinuteIdx: row.peak?.minuteIdx ?? row.start?.minuteIdx ?? 0,
        endMinuteIdx: isRowPassive && rowGapPct != null ? 570 : (row.last?.minuteIdx ?? row.peak?.minuteIdx ?? row.start?.minuteIdx ?? 0),
        startMetric: row.start?.metric ?? null,
        startMetricAbs: startAbs,
        peakMetric: row.peak?.metric ?? null,
        peakMetricAbs: peakAbs,
        endMetric: row.last?.metric ?? null,
        endMetricAbs: lastAbs,
        closeMode: row.closeMode ?? closeMode,
        minHoldCandles: row.minHoldCandles ?? minHoldCandles,
        tierBp: row.tierBp ?? (row as any).TierBp ?? null,
        beta: row.beta ?? (row as any).Beta ?? null,
        positionNotionalUsd: row.positionNotionalUsd ?? (row as any).PositionNotionalUsd ?? null,
        entryCount: row.entryCount ?? (row as any).EntryCount ?? null,
        rawPnlUsd: serverRawPnl ?? pnl.rawPnlUsd,
        benchPnlUsd: serverBenchPnl ?? pnl.benchPnlUsd,
        hedgedPnlUsd: serverHedgedPnl ?? pnl.hedgedPnlUsd,
        totalPnlUsd: serverTotalPnl ?? pnl.totalPnlUsd,
        lstPrcL: row.lstPrcL ?? (row as any).LstPrcL ?? null,
        lstCls: row.lstCls ?? (row as any).LstCls ?? null,
        yCls: row.yCls ?? (row as any).YCls ?? null,
      };
    });
  }, [filteredActive, dateNy, closeMode, minHoldCandles, sizingMode, sizeValue, dilutionMode, pnlMode, priceMode]);

  const activeRealtimeSorted = useMemo(() => {
    const mul = dirMul(analyticsSort.dir);
    return [...activeRealtimeRows].sort((a, b) => cmpVal(episodeSortValue(a, analyticsSort.key), episodeSortValue(b, analyticsSort.key)) * mul);
  }, [activeRealtimeRows, analyticsSort, closeMode, minHoldCandles]);

  const activeAnalyticsSummary = useMemo(() => {
    const pnl = activeRealtimeRows.map((r) => r.totalPnlUsd ?? 0);
    const trades = pnl.length;
    const totalPnlUsd = pnl.reduce((s, x) => s + x, 0);
    const wins = pnl.filter((x) => x > 0).length;
    const losses = pnl.filter((x) => x < 0).length;
    const winRate = trades > 0 ? wins / trades : 0;
    const maxWinUsd = pnl.length ? Math.max(...pnl) : 0;
    const maxLossUsd = pnl.length ? Math.min(...pnl) : 0;

    const sumWin = pnl.filter((x) => x > 0).reduce((s, x) => s + x, 0);
    const sumLossAbs = -pnl.filter((x) => x < 0).reduce((s, x) => s + x, 0);
    const profitFactor = sumLossAbs <= 0 ? null : sumWin / sumLossAbs;
    const avgPnlUsd = trades > 0 ? totalPnlUsd / trades : 0;
    const avgWin = wins > 0 ? sumWin / wins : 0;
    const avgLoss = losses > 0 ? -(sumLossAbs / losses) : 0;
    const expectancyUsd = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    let equity = 0;
    let peak = 0;
    let maxDrawdownUsd = 0;
    const equityCurve: PaperArbEquityPointDto[] = [];

    if (equityCurveMode === "Daily") {
      const dailyTotals = new Map<string, number>();
      for (const row of activeRealtimeRows) {
        const key = getEpisodeDateKey(row, dateNy);
        if (!key) continue;
        dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + (row.totalPnlUsd ?? 0));
      }

      for (const key of [...dailyTotals.keys()].sort((a, b) => a.localeCompare(b))) {
        const p = dailyTotals.get(key) ?? 0;
        equity += p;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
        equityCurve.push({ key, equity, pnl: p });
      }
    } else {
      const tradeRows = activeRealtimeRows
        .map((row, index) => ({
          row,
          index,
          dateKey: getEpisodeDateKey(row, dateNy),
          minute: Number.isFinite(row.endMinuteIdx) ? row.endMinuteIdx : null,
        }))
        .sort((a, b) => {
          const da = a.dateKey ?? "";
          const db = b.dateKey ?? "";
          if (da !== db) return da.localeCompare(db);
          const ma = a.minute ?? Number.MAX_SAFE_INTEGER;
          const mb = b.minute ?? Number.MAX_SAFE_INTEGER;
          if (ma !== mb) return ma - mb;
          return a.index - b.index;
        });

      for (const item of tradeRows) {
        const p = item.row.totalPnlUsd ?? 0;
        equity += p;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
        const key = item.dateKey
          ? `${item.dateKey}${item.minute != null ? ` ${item.minute}` : ""}`
          : `${item.index + 1}`;
        equityCurve.push({ key, equity, pnl: p });
      }
    }

    return {
      trades,
      totalPnlUsd,
      winRate,
      profitFactor,
      avgPnlUsd,
      avgWinUsd: avgWin,
      avgLossUsd: avgLoss,
      maxWinUsd,
      maxLossUsd,
      expectancyUsd,
      maxDrawdownUsd,
      equityCurve,
    };
  }, [activeRealtimeRows, equityCurveMode, dateNy]);

  const episodesSorted = useMemo(() => {
    const mul = dirMul(episodesSort.dir);
    return [...filteredEpisodes].sort((a, b) => cmpVal(episodeSortValue(a, episodesSort.key), episodeSortValue(b, episodesSort.key)) * mul);
  }, [filteredEpisodes, episodesSort, closeMode, minHoldCandles]);

  const analyticsSorted = useMemo(() => {
    const mul = dirMul(analyticsSort.dir);
    return [...filteredEpisodes].sort((a, b) => cmpVal(episodeSortValue(a, analyticsSort.key), episodeSortValue(b, analyticsSort.key)) * mul);
  }, [filteredEpisodes, analyticsSort, closeMode, minHoldCandles]);

  const episodesSummary = useMemo(() => {
    const rows = filteredEpisodes;
    let total = 0, wins = 0, losses = 0;
    for (const r of rows) {
      const pnl = r.totalPnlUsd ?? 0;
      total += pnl;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    }
    const avg = rows.length ? total / rows.length : 0;
    return { total, wins, losses, avg, count: rows.length };
  }, [filteredEpisodes]);

  const scopeResearchObservedBoundsByPanel = useMemo<Record<ScopePanelKey, { min: number | null; max: number | null; count: number }>>(() => {
    const buildBounds = (parameterKey: ScopeResearchParameterKey) => {
      let min = Infinity, max = -Infinity, count = 0;
      for (const row of filteredEpisodes) {
        const value = scopeResearchParameterValue(row, parameterKey);
        if (value != null && Number.isFinite(value)) {
          if (value < min) min = value;
          if (value > max) max = value;
          count++;
        }
      }
      return count === 0
        ? { min: null as number | null, max: null as number | null, count: 0 }
        : { min, max, count };
    };
    return {
      left: buildBounds(scopeResearchDrafts.left.parameterKey),
      right: buildBounds(scopeResearchDrafts.right.parameterKey),
    };
  }, [filteredEpisodes, scopeResearchDrafts.left.parameterKey, scopeResearchDrafts.right.parameterKey]);

  const scopeResearchComputedByPanel = useMemo<Record<ScopePanelKey, ScopeResearchComputed | null>>(
    () => ({
      left: computeScopeResearch(filteredEpisodes, scopeResearchSelections.left, dateFrom),
      right: computeScopeResearch(filteredEpisodes, scopeResearchSelections.right, dateFrom),
    }),
    [dateFrom, filteredEpisodes, scopeResearchSelections]
  );
  const scopePanels: Array<{ key: ScopePanelKey; label: string }> = [
    { key: "left", label: "LEFT" },
    { key: "right", label: "RIGHT" },
  ];
  const visibleScopePanels = scopeFullscreenPanel ? scopePanels.filter((panel) => panel.key === scopeFullscreenPanel) : scopePanels;
  const scopeResearchChartType = scopeResearchDrafts.left.chartType;
  const setScopeResearchChartType = (next: ScopeResearchChartType) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, chartType: next } }));
  const scopeResearchParameterKey = scopeResearchDrafts.left.parameterKey;
  const setScopeResearchParameterKey = (next: ScopeResearchParameterKey) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, parameterKey: next } }));
  const scopeResearchResultKey = scopeResearchDrafts.left.resultKey;
  const setScopeResearchResultKey = (next: ScopeResearchResultKey) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, resultKey: next } }));
  const scopeResearchBucketCount = scopeResearchDrafts.left.bucketCount;
  const setScopeResearchBucketCount = (next: number) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, bucketCount: next } }));
  const scopeResearchMinSamples = scopeResearchDrafts.left.minSamples;
  const setScopeResearchMinSamples = (next: number) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, minSamples: next } }));
  const scopeResearchThresholdMode = scopeResearchDrafts.left.thresholdMode;
  const setScopeResearchThresholdMode = (next: ScopeResearchThresholdMode) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, thresholdMode: next } }));
  const scopeResearchDomainFrom = scopeResearchDrafts.left.domainFrom;
  const setScopeResearchDomainFrom = (next: string) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, domainFrom: next } }));
  const scopeResearchDomainTo = scopeResearchDrafts.left.domainTo;
  const setScopeResearchDomainTo = (next: string) =>
    setScopeResearchDrafts((prev) => ({ ...prev, left: { ...prev.left, domainTo: next } }));
  const scopeResearchObservedBounds = scopeResearchObservedBoundsByPanel.left;
  const scopeResearchSelection = scopeResearchSelections.left;
  const setScopeResearchSelection = (next: ScopeResearchSelection) =>
    setScopeResearchSelections((prev) => ({ ...prev, left: next }));
  const scopeResearchComputed = scopeResearchComputedByPanel.left;

  const optimizerBestRow = useMemo(() => optimizerRows[0] ?? null, [optimizerRows]);
  const scopeSelectedParameters = useMemo(
    () => scopeSelectedParameterKeys.map((key) => SCOPE_PARAMETER_BY_KEY.get(key)).filter(Boolean) as ScopeParameterDefinition[],
    [scopeSelectedParameterKeys]
  );
  const scopeSelectedScenarioParameterLabels = useMemo(
    () => scopeSelectedParameters.map((item) => item.scenarioParameter ?? null).filter(Boolean) as string[],
    [scopeSelectedParameters]
  );
  const scopeRequestedRangeGroups = useMemo(() => {
    if (!scopeSelectedParameters.length || scopeSelectedParameters.length >= SCOPE_PARAMETER_DEFINITIONS.length) {
      return ["RATING GATES", "ZAP THRESHOLDS", "TAPE FILTERS"] as OptimizerRangeGroupKey[];
    }
    return Array.from(new Set(scopeSelectedParameters.map((item) => item.group))) as OptimizerRangeGroupKey[];
  }, [scopeSelectedParameters]);
  const optimizerBaselineRow = useMemo(
    () => optimizerRows.find((row) => row.id === "baseline" || row.parameter === "BASE") ?? null,
    [optimizerRows]
  );
  const optimizerBestByParameter = useMemo(() => {
    const best = new Map<string, OptimizerResultRow>();
    for (const row of optimizerRows) {
      if (row.id === "baseline" || row.id === "current-stack" || row.parameter === "BASE" || row.parameter === "STACK") continue;
      const prev = best.get(row.parameter);
      if (!prev || row.score > prev.score || (row.score === prev.score && row.totalPnlUsd > prev.totalPnlUsd)) {
        best.set(row.parameter, row);
      }
    }
    return Array.from(best.values());
  }, [optimizerRows]);
  const optimizerImpactRows = useMemo<OptimizerImpactRow[]>(() => {
    const baseScore = optimizerBaselineRow?.score ?? 0;
    const basePnl = optimizerBaselineRow?.totalPnlUsd ?? 0;
    const source = optimizerRows.filter(
      (row) => row.id !== "baseline" && row.parameter !== "BASE" && row.id !== "current-stack" && row.parameter !== "STACK"
    );
    const maxAbsDeltaScore = Math.max(0.000001, ...source.map((row) => Math.abs(row.score - baseScore)));

    // The same parameter range can arrive twice (a server-returned parameter and its locally
    // rebuilt twin), and a duplicate row is pure height: identical numbers, no new information.
    // Deduped on identity here rather than at the source, so a genuine second range with the same
    // label would still be visible as its own variant.
    const seen = new Set<string>();
    return source
      .filter((row) => {
        const identity = `${row.parameter}|${row.variant}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .map((row) => {
        const deltaScore = row.score - baseScore;
        const impactPct = Math.min(1, Math.abs(deltaScore) / maxAbsDeltaScore);
        const impactLevel: OptimizerImpactRow["impactLevel"] =
          impactPct >= 0.67 ? "STRONG" : impactPct >= 0.34 ? "MEDIUM" : "LIGHT";

        return {
          id: row.id,
          parameter: row.parameter,
          variant: row.variant,
          summary: row.summary,
          impactLevel,
          impactPct,
          deltaScore,
          deltaPnlUsd: row.totalPnlUsd - basePnl,
          trades: row.trades,
          totalPnlUsd: row.totalPnlUsd,
          avgPnlUsd: row.avgPnlUsd,
          winRate: row.winRate,
        };
      })
      .sort((a, b) => {
        if (Math.abs(b.deltaScore) !== Math.abs(a.deltaScore)) return Math.abs(b.deltaScore) - Math.abs(a.deltaScore);
        if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
        return b.trades - a.trades;
      });
  }, [optimizerRows, optimizerBaselineRow]);
  // Deliberately NOT a memo over filteredEpisodes. Bucketing 47 axes is real work, and recomputing
  // it on every data change would run the optimizer continuously in the background. It stays a
  // builder invoked by the run button, so the panel behaves the way it always did: idle until asked.
  const buildOptimizerRangeParameters = useCallback((): PaperArbOptimizerParameterDto[] => {
    const useBinRatingFilter = scannerBinFilterEnabled({ ratingMode, metric });
    if (useBinRatingFilter) {
      const selectedKeySet = new Set(scopeSelectedParameterKeys);
      const includeAllParameters = selectedKeySet.size === 0;
      const catResults: PaperArbOptimizerParameterDto[] = [];
      const numericResults = SCOPE_PARAMETER_DEFINITIONS
        .filter((definition) => includeAllParameters || selectedKeySet.has(definition.key))
        .map((definition) => {
          if (definition.kind === "categorical") {
            // build categorical inline here too
            let catParam: PaperArbOptimizerParameterDto | null = null;
            if (definition.key === "sector") {
              catParam = buildCategoricalOptimizerParameter(
                filteredEpisodes, "sector", "SECTOR", definition.group,
                (row) => {
                  const ticker = String(row.ticker ?? "").trim().toUpperCase();
                  return arbitrageTickerMetaByTicker[ticker]?.sectorL3 ?? null;
                }
              );
            } else if (definition.key === "bench") {
              catParam = buildCategoricalOptimizerParameter(
                filteredEpisodes, "bench", "BENCH", definition.group,
                (row) => row.benchTicker?.trim().toUpperCase() ?? null
              );
            }
            if (catParam) catResults.push(catParam);
            return null;
          }
          if (definition.key === "minrate" || definition.key === "mintotal") {
            return buildFallbackBinRatingOptimizerParameter(
              filteredEpisodes,
              definition.key as "minrate" | "mintotal",
              definition.label,
              definition.group,
              optimizerBucketCount,
              session,
              STRATEGY.ratingBinSource,
              optimizerBinMode
            );
          }
          return buildFallbackScopeOptimizerParameter(filteredEpisodes, definition, optimizerBucketCount, optimizerBinMode);
        })
        .filter((parameter): parameter is PaperArbOptimizerParameterDto => parameter != null);
      return [...numericResults, ...catResults];
    }

    const serverParameters = optimizerRanges?.parameters ?? [];
    const parameterMap = new Map(serverParameters.map((parameter) => [String(parameter.key).toLowerCase(), parameter]));
    const selectedKeySet = new Set(scopeSelectedParameterKeys);
    const includeAllParameters = selectedKeySet.size === 0;

    for (const definition of SCOPE_PARAMETER_DEFINITIONS) {
      if (!includeAllParameters && !selectedKeySet.has(definition.key)) continue;
      if (parameterMap.has(definition.key)) continue;

      // Categorical parameters: sector and bench — computed fully client-side
      if (definition.kind === "categorical") {
        let catParam: PaperArbOptimizerParameterDto | null = null;
        if (definition.key === "sector") {
          catParam = buildCategoricalOptimizerParameter(
            filteredEpisodes, "sector", "SECTOR L3", definition.group,
            (row) => {
              const direct = row.sectorL3?.trim() || null;
              if (direct) return direct;
              const ticker = String(row.ticker ?? "").trim().toUpperCase();
              return arbitrageTickerMetaByTicker[ticker]?.sectorL3 ?? null;
            }
          );
        } else if (definition.key === "sectorL4") {
          catParam = buildCategoricalOptimizerParameter(
            filteredEpisodes, "sectorL4", "SECTOR L4", definition.group,
            (row) => row.sectorL4?.trim() || null
          );
        } else if (definition.key === "sectorL5") {
          catParam = buildCategoricalOptimizerParameter(
            filteredEpisodes, "sectorL5", "SECTOR L5", definition.group,
            (row) => row.sectorL5?.trim() || null
          );
        } else if (definition.key === "bench") {
          catParam = buildCategoricalOptimizerParameter(
            filteredEpisodes, "bench", "BENCH", definition.group,
            (row) => row.benchTicker?.trim().toUpperCase() ?? null
          );
        }
        if (catParam) parameterMap.set(definition.key, catParam);
        continue;
      }

      // MINRATE / MINTOTAL need the bin builder, not the generic one: the generic path goes through
      // optimizerKeyToScopeResearchParameterKey, which has no case for these two and so returns
      // null. Mirrors the client-side branch above and reads the same episode rate/total.
      if (definition.key === "minrate" || definition.key === "mintotal") {
        const ratingParameter = buildFallbackBinRatingOptimizerParameter(
          filteredEpisodes,
          definition.key as "minrate" | "mintotal",
          definition.label,
          definition.group,
          optimizerBucketCount,
          session,
          STRATEGY.ratingBinSource
        );
        if (ratingParameter) parameterMap.set(definition.key, ratingParameter);
        continue;
      }

      // corr/beta/sigma get the dedicated builder because it can also fall back to the ticker-meta
      // map when the episode row itself carries no value.
      if (["corr", "beta", "sigma"].includes(definition.key)) {
        const metaParameter = buildFallbackOptimizerParameter(
          filteredEpisodes,
          definition.key as "corr" | "beta" | "sigma",
          definition.label,
          definition.group,
          optimizerBucketCount,
          arbitrageTickerMetaByTicker,
          optimizerBinMode
        );
        if (metaParameter) parameterMap.set(definition.key, metaParameter);
        continue;
      }

      // Every other numeric axis is bucketed client-side from the episodes already on screen.
      // OpenDoor has no server-side /optimizer/ranges (the Arbitrage one buckets Arbitrage
      // episodes by Arbitrage-only axes), but it does not need one: the buckets are a pure
      // aggregation of totalPnlUsd over rows grouped by a parameter value, and every value comes
      // from the same scopeResearchParameterValue extractor the Visual Scope already uses.
      const fallbackParameter = buildFallbackScopeOptimizerParameter(
        filteredEpisodes,
        definition,
        optimizerBucketCount
      );

      if (fallbackParameter) {
        parameterMap.set(definition.key, fallbackParameter);
      }
    }

    return [...parameterMap.values()];
  }, [optimizerRanges, filteredEpisodes, optimizerBucketCount, optimizerBinMode, scopeSelectedParameterKeys, arbitrageTickerMetaByTicker, ratingMode, metric, session]);
  const optimizerRankValue = (bucket: PaperArbOptimizerRangeBucketDto) =>
    optimizerRangeRankMetric === "winRate"
      ? bucket.winRate
      : optimizerRangeRankMetric === "totalPnlUsd"
        ? bucket.totalPnlUsd
        : optimizerRangeRankMetric === "score"
          ? bucket.score
          : optimizerRangeRankMetric === "tailDamage"
            ? bucket.totalPnlUsd  // for individual bucket ranking fall back to totalPnlUsd
            : bucket.avgPnlUsd;
  const optimizerRangeParametersSorted = useMemo(() => {
    // tailDamage sort: parameters where tail regions have the most concentrated losses come first
    if (optimizerRangeRankMetric === "tailDamage") {
      return [...optimizerRangeParameters].sort((a, b) => {
        const da = scoreTailDamage(a, optimizerRangeMinTrades);
        const db = scoreTailDamage(b, optimizerRangeMinTrades);
        if (db !== da) return db - da;
        return (b.baseTrades ?? 0) - (a.baseTrades ?? 0);
      });
    }
    return [...optimizerRangeParameters].sort((a, b) => {
      const bestA = [...(a.buckets ?? []), ...(a.lowerTailBuckets ?? []), ...(a.upperTailBuckets ?? [])]
        .filter((x) => x.trades >= optimizerRangeMinTrades)
        .sort((x, y) => {
        if (optimizerRankValue(y) !== optimizerRankValue(x)) return optimizerRankValue(y) - optimizerRankValue(x);
        if (y.totalPnlUsd !== x.totalPnlUsd) return y.totalPnlUsd - x.totalPnlUsd;
        return y.trades - x.trades;
      })[0];
      const bestB = [...(b.buckets ?? []), ...(b.lowerTailBuckets ?? []), ...(b.upperTailBuckets ?? [])]
        .filter((x) => x.trades >= optimizerRangeMinTrades)
        .sort((x, y) => {
        if (optimizerRankValue(y) !== optimizerRankValue(x)) return optimizerRankValue(y) - optimizerRankValue(x);
        if (y.totalPnlUsd !== x.totalPnlUsd) return y.totalPnlUsd - x.totalPnlUsd;
        return y.trades - x.trades;
      })[0];
      const aAvg = bestA ? optimizerRankValue(bestA) : Number.NEGATIVE_INFINITY;
      const bAvg = bestB ? optimizerRankValue(bestB) : Number.NEGATIVE_INFINITY;
      if (bAvg !== aAvg) return bAvg - aAvg;
      const aPnl = bestA?.totalPnlUsd ?? Number.NEGATIVE_INFINITY;
      const bPnl = bestB?.totalPnlUsd ?? Number.NEGATIVE_INFINITY;
      if (bPnl !== aPnl) return bPnl - aPnl;
      return (bestB?.trades ?? 0) - (bestA?.trades ?? 0);
    });
  }, [optimizerRangeParameters, optimizerRangeMinTrades, optimizerRangeRankMetric]);
  const optimizerRangeGroups = useMemo(() => {
    const groupOrder = ["RATING GATES", "ZAP THRESHOLDS", "TAPE FILTERS"];
    const map = new Map<string, PaperArbOptimizerParameterDto[]>();
    for (const parameter of optimizerRangeParametersSorted) {
      const key = parameter.group || "OTHER";
      const arr = map.get(key) ?? [];
      arr.push(parameter);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ia = groupOrder.indexOf(a[0]);
        const ib = groupOrder.indexOf(b[0]);
        const va = ia >= 0 ? ia : Number.MAX_SAFE_INTEGER;
        const vb = ib >= 0 ? ib : Number.MAX_SAFE_INTEGER;
        return va - vb || a[0].localeCompare(b[0]);
      })
      .map(([group, parameters]) => ({ group, parameters }));
  }, [optimizerRangeParametersSorted]);
  const optimizerBestRangeBuckets = useMemo(() => {
    const compareBuckets = (
      left: PaperArbOptimizerRangeBucketDto,
      right: PaperArbOptimizerRangeBucketDto
    ) => {
      const rankDiff = optimizerRankValue(right) - optimizerRankValue(left);
      if (rankDiff !== 0) return rankDiff;
      const pnlDiff = right.totalPnlUsd - left.totalPnlUsd;
      if (pnlDiff !== 0) return pnlDiff;
      return right.trades - left.trades;
    };

    const bestByParameter = new Map<string, { parameter: string; bucket: PaperArbOptimizerRangeBucketDto }>();

    for (const parameter of optimizerRangeParametersSorted) {
      const eligibleBuckets = [
        ...(parameter.buckets ?? []),
        ...(parameter.lowerTailBuckets ?? []),
        ...(parameter.upperTailBuckets ?? []),
      ].filter((bucket) => bucket.trades >= optimizerRangeMinTrades);

      if (!eligibleBuckets.length) continue;

      const bestBucket = [...eligibleBuckets].sort(compareBuckets)[0];
      bestByParameter.set(parameter.key, {
        parameter: parameter.label,
        bucket: bestBucket,
      });
    }

    return [...bestByParameter.values()].sort((a, b) => compareBuckets(a.bucket, b.bucket));
  }, [optimizerRangeParametersSorted, optimizerRangeMinTrades, optimizerRangeRankMetric]);
  const optimizerBestRangeRows = useMemo<OptimizerResultRow[]>(
    () =>
      optimizerBestRangeBuckets.map(({ parameter, bucket }) => ({
        id: bucket.bucketId,
        parameter,
        variant: bucket.label,
        summary: `${parameter} ${bucket.label}`,
        trades: bucket.trades,
        wins: bucket.wins,
        losses: bucket.losses,
        winRate: bucket.winRate,
        totalPnlUsd: bucket.totalPnlUsd,
        avgPnlUsd: bucket.avgPnlUsd,
        score: bucket.score,
      })),
    [optimizerBestRangeBuckets]
  );
  const hasScopeMapsContent =
    optimizerRangesLoading ||
    optimizerRangeParametersSorted.length > 0 ||
    optimizerBestRangeRows.length > 0 ||
    optimizerImpactRows.length > 0 ||
    optimizerRangeGroups.length > 0;
  const hasVisualScopeLoaded = episodesRows.length > 0 || filteredEpisodes.length > 0;

  const downloadEpisodesLog = useCallback(() => {
    if (!filteredEpisodes.length) return;
    const meta = {
      exportedAt: new Date().toISOString(),
      filters: { metric, startAbs, endAbs, session, closeMode, minHoldCandles, priceMode, pnlMode, dilutionMode, dilutionStep, maxAdds },
      count: filteredEpisodes.length,
    };
    const lines = [
      JSON.stringify({ _meta: meta }),
      ...filteredEpisodes.map((r) => JSON.stringify(r)),
    ];
    const blob = new Blob([lines.join("\n")], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scanner_log_${metric}_${session}_${dateFrom}_${dateTo}_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEpisodes, metric, startAbs, endAbs, session, closeMode, minHoldCandles, priceMode, pnlMode, dilutionMode, dilutionStep, maxAdds, dateFrom, dateTo]);

  const downloadStreamFilterPassLog = useCallback(() => {
    const entries = filterPassLogStore.getEntries();
    if (!entries.length) return;
    const suffix = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    downloadFilterPassLog(entries, `stream-filter-pass-${suffix}.csv`);
  }, [filterPassLogStore]);

  const episodeEntryCount = (row: PaperArbClosedDto) => {
    const count = Math.trunc(row.entryCount ?? 1);
    return Number.isFinite(count) && count > 0 ? count : 1;
  };
  const episodeHasHedgeLeg = (row: PaperArbClosedDto) =>
    pnlMode === "Hedged" && Number.isFinite(row.beta ?? NaN) && Math.abs(row.beta ?? 0) > 0;
  const episodeTradeCount = (row: PaperArbClosedDto) => episodeEntryCount(row) * (episodeHasHedgeLeg(row) ? 2 : 1);
  const episodeTickerStreamflowUsd = (row: PaperArbClosedDto) => {
    const baseNotional = row.positionNotionalUsd ?? 0;
    if (!Number.isFinite(baseNotional) || baseNotional <= 0) return 0;
    return baseNotional * episodeEntryCount(row);
  };
  const episodeBenchStreamflowUsd = (row: PaperArbClosedDto) => {
    if (!episodeHasHedgeLeg(row)) return 0;
    const tickerFlow = episodeTickerStreamflowUsd(row);
    if (!Number.isFinite(tickerFlow) || tickerFlow <= 0) return 0;
    return tickerFlow * Math.abs(row.beta ?? 0);
  };
  const episodeStreamflowUsd = (row: PaperArbClosedDto) => {
    return episodeTickerStreamflowUsd(row) + episodeBenchStreamflowUsd(row);
  };
  const analyticsSummary = useMemo(() => {
    // Single pass instead of one map plus eight filter/reduce scans and two spread-based extremes.
    const situations = filteredEpisodes.length;
    let trades = 0;
    let streamflowUsd = 0;
    let totalPnlUsd = 0;
    let wins = 0;
    let losses = 0;
    let sumWin = 0;
    let sumLossAbs = 0;
    let maxWinUsd = 0;
    let maxLossUsd = 0;
    let longs = 0;
    let shorts = 0;
    // Every episode's P&L, kept for the medians and the concentration measures below. The running
    // totals above cannot produce either: both need the whole distribution, not a sum.
    const pnls: number[] = [];
    const summaryFallbackDate = dateMode === "day" && toYmd(dateNy) ? dateNy : null;
    const dayTotals = new Map<string, number>();
    for (let i = 0; i < situations; i += 1) {
      const row = filteredEpisodes[i]!;
      trades += episodeTradeCount(row);
      streamflowUsd += episodeStreamflowUsd(row);
      const x = row.totalPnlUsd ?? 0;
      totalPnlUsd += x;
      pnls.push(x);
      if (row.side === "Long") longs += 1;
      else if (row.side === "Short") shorts += 1;
      const dayKey = getEpisodeDateKey(row, summaryFallbackDate);
      if (dayKey) dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + x);
      if (x > 0) {
        wins += 1;
        sumWin += x;
      } else if (x < 0) {
        losses += 1;
        sumLossAbs -= x;
      }
      if (i === 0 || x > maxWinUsd) maxWinUsd = x;
      if (i === 0 || x < maxLossUsd) maxLossUsd = x;
    }
    const winRate = situations > 0 ? wins / situations : 0;
    const profitFactor = sumLossAbs <= 0 ? null : sumWin / sumLossAbs;
    const avgPnlUsd = trades > 0 ? totalPnlUsd / trades : 0;
    const avgWin = wins > 0 ? sumWin / wins : 0;
    const avgLoss = losses > 0 ? -(sumLossAbs / losses) : 0;
    const expectancyUsd = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    const median = (values: number[]) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    };

    /**
     * The median trade says what a TYPICAL trade did, which the average cannot: one +5,000 in a
     * book of small losses drags the average positive while the median stays where the mass is.
     * The median DAY asks the same question one level up, and only means anything over a range.
     */
    const medianTradeUsd = median(pnls);
    const dayCount = dayTotals.size;
    const medianDayUsd = dayCount > 0 ? median([...dayTotals.values()]) : 0;

    /**
     * How much of the result rests on one or two trades.
     *
     * Measured against the same-sign gross, not the net: the question is "did two winners make the
     * profit", and netting losses into the denominator would make the share meaningless (or
     * negative) on a losing set. Null below three trades of that sign — with two winners the top
     * two ARE all of them, so 100% would describe the sample size, not concentration.
     */
    const winsDesc = pnls.filter((x) => x > 0).sort((a, b) => b - a);
    const lossesDesc = pnls.filter((x) => x < 0).map((x) => -x).sort((a, b) => b - a);
    const top2WinShare =
      winsDesc.length >= 3 && sumWin > 0 ? (winsDesc[0]! + (winsDesc[1] ?? 0)) / sumWin : null;
    const top2LossShare =
      lossesDesc.length >= 3 && sumLossAbs > 0 ? (lossesDesc[0]! + (lossesDesc[1] ?? 0)) / sumLossAbs : null;

    let equity = 0;
    let peak = 0;
    let maxDrawdownUsd = 0;
    const equityCurve: PaperArbEquityPointDto[] = [];

    if (equityCurveMode === "Daily") {
      const fallbackDate = dateMode === "day" && toYmd(dateNy) ? dateNy : null;
      const dailyTotals = new Map<string, number>();

      for (const row of filteredEpisodes) {
        const key = getEpisodeDateKey(row, fallbackDate);
        if (!key) continue;
        dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + (row.totalPnlUsd ?? 0));
      }

      for (const key of [...dailyTotals.keys()].sort((a, b) => a.localeCompare(b))) {
        const p = dailyTotals.get(key) ?? 0;
        equity += p;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
        equityCurve.push({ key, equity, pnl: p });
      }
    } else {
      const fallbackDate = dateMode === "day" && toYmd(dateNy) ? dateNy : null;
      const tradeRows = filteredEpisodes
        .map((row, index) => ({
          row,
          index,
          dateKey: getEpisodeDateKey(row, fallbackDate),
          minute: Number.isFinite(row.endMinuteIdx) ? (row.closeMode === "Passive" ? 570 : row.endMinuteIdx) : null,
        }))
        .sort((a, b) => {
          const da = a.dateKey ?? "";
          const db = b.dateKey ?? "";
          if (da !== db) return da.localeCompare(db);
          const ma = a.minute ?? Number.MAX_SAFE_INTEGER;
          const mb = b.minute ?? Number.MAX_SAFE_INTEGER;
          if (ma !== mb) return ma - mb;
          return a.index - b.index;
        });

      for (const item of tradeRows) {
        const p = item.row.totalPnlUsd ?? 0;
        equity += p;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
        const key = item.dateKey
          ? `${item.dateKey}${item.minute != null ? ` ${item.minute}` : ""}`
          : `${item.index + 1}`;
        equityCurve.push({ key, equity, pnl: p });
      }
    }

    return {
      situations,
      trades,
      streamflowUsd,
      totalPnlUsd,
      winRate,
      profitFactor,
      avgPnlUsd,
      avgWinUsd: avgWin,
      avgLossUsd: avgLoss,
      maxWinUsd,
      maxLossUsd,
      expectancyUsd,
      maxDrawdownUsd,
      equityCurve,
      longs,
      shorts,
      medianTradeUsd,
      medianDayUsd,
      dayCount,
      top2WinShare,
      top2LossShare,
    };
  }, [filteredEpisodes, equityCurveMode, dateMode, dateNy, pnlMode]);

  const topTickerTimeByTicker = useMemo(() => {
    const m = new Map<
      string,
      {
        startMinuteIdx: number;
        peakMinuteIdx: number;
        endMinuteIdx: number;
        startMetricAbs: number | null;
        peakMetricAbs: number | null;
        endMetricAbs: number | null;
      }
    >();
    for (const r of episodesRows) {
      const key = String(r.ticker ?? "").trim().toUpperCase();
      if (!key) continue;
      const prev = m.get(key);
      if (!prev || (r.endMinuteIdx ?? -1) > (prev.endMinuteIdx ?? -1)) {
        m.set(key, {
          startMinuteIdx: r.startMinuteIdx,
          peakMinuteIdx: r.peakMinuteIdx,
          endMinuteIdx: r.endMinuteIdx,
          startMetricAbs: r.startMetricAbs ?? null,
          peakMetricAbs: r.peakMetricAbs ?? null,
          endMetricAbs: r.endMetricAbs ?? null,
        });
      }
    }
    return m;
  }, [episodesRows]);

  const classLabel = session;
  const modeLabel = dateMode === "range" ? "RANGE" : dateMode === "last" ? "LAST" : "DAY";
  const typeLabel = ratingType.toUpperCase();
  const updatedLabel = fmtHms(updatedAt);
  const selectedRule = useMemo(() => {
    const bandMap: Partial<Record<PaperArbSession, PaperArbRatingBand>> = {
      BLUE: "BLUE",
      ARK: "ARK",
      OPEN: "OPEN",
      INTRA: "INTRA",
      POST: "POST",
      GLOB: "GLOBAL",
    };
    const b = bandMap[session];
    return b ? ratingRules.find((r) => r.band === b) ?? null : null;
  }, [session, ratingRules]);
  const minRateLabel = selectedRule?.minRate ?? 0;
  const minTotalLabel = selectedRule?.minTotal ?? 0;
  const limitLabel = scopeMode === "ALL" ? 1000 : topN;
  const ignCount = ignoreSet.size;
  const appCount = applySet.size;
  const pinCount = pinSet.size;
  const setModeIgnore = () => setListMode((m) => (m === "ignore" ? "off" : "ignore"));
  const setModeApply = () => setListMode((m) => (m === "apply" ? "off" : "apply"));
  const setModePin = () => setListMode((m) => (m === "pin" ? "off" : "pin"));
  const mergeTickerText = (prev: string, add: string[]) => {
    const next = new Set<string>([...splitListUpper(prev), ...add]);
    return Array.from(next).join(", ");
  };

  const onIgnoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const t = await file.text();
      const parsed = parseTickersFromCsv(t);
      if (!parsed.length) return;
      setIgnoreTickersText((prev) => mergeTickerText(prev, parsed));
      setShowIgnore(true);
      if (listMode === "off") setListMode("ignore");
    } catch {
      // ignore malformed file
    }
  };

  const onApplyFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const t = await file.text();
      const parsed = parseTickersFromCsv(t);
      if (!parsed.length) return;
      setTickersText((prev) => mergeTickerText(prev, parsed));
      setShowApply(true);
      if (listMode === "off") setListMode("apply");
    } catch {
      // ignore malformed file
    }
  };

  const onPinFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const t = await file.text();
      const parsed = parseTickersFromCsv(t);
      if (!parsed.length) return;
      setBenchTickersText((prev) => mergeTickerText(prev, parsed));
      setShowPin(true);
      if (listMode === "off") setListMode("pin");
    } catch {
      // ignore malformed file
    }
  };
  const activeRule = useMemo(
    () => ratingRules.find((r) => r.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 },
    [ratingRules, ruleBand]
  );

  const setActiveRulePatch = (patch: Partial<PaperArbRatingRule>) => {
    setRatingRules((arr) => {
      const ix = arr.findIndex((x) => x.band === ruleBand);
      if (ix < 0) {
        return normalizePaperArbRatingRules([
          ...arr,
          {
            band: ruleBand,
            minRate: Number(patch.minRate) || 0,
            minTotal: Number(patch.minTotal) || 0,
          },
        ]);
      }
      const cp = [...arr];
      cp[ix] = { ...cp[ix], ...patch };
      return normalizePaperArbRatingRules(cp);
    });
  };

  useEffect(() => {
    setZapMode((prev) => {
      if (prev === "delta" && metric === "SigmaZap") return "delta";
      return metric === "ZapPct" ? "zap" : "sigma";
    });
  }, [metric]);

  const toggleEpisodesSort = (key: EpisodeSortKey) => {
    setEpisodesSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };
  const toggleAnalyticsSort = (key: EpisodeSortKey) => {
    setAnalyticsSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };
  const sortMark = (active: boolean, dir: SortDir) => (active ? (dir === "asc" ? " ↑" : " ↓") : "");
  const streamStats = useMemo(() => ({
    signals: streamSignalMeta.totalCount,
    ready: streamEntryReadyCount,
    open: streamPositionMeta.openCount,
    autoEnabled: streamAutoEnabled,
  }), [streamEntryReadyCount, streamPositionMeta.openCount, streamSignalMeta.totalCount, streamAutoEnabled]);
  const scannerShellTitle = isStreamOnlyShell
    ? (headerTitleOverride ?? "OPEN DOOR STREAM")
    : headerTitleOverride
      ? headerTitleOverride
      : primaryPanel === "stream"
        ? "OPEN DOOR STREAM"
        : "OPEN DOOR SCANNER";
  const headerBadgeValues = isStreamOnlyShell
    ? (headerBadgeValuesOverride ?? ["EXECUTION", "FILTERED", streamAutoEnabled ? "AUTO ON" : "AUTO OFF"])
    : [classLabel, modeLabel, typeLabel];
  const headerMetaLabel = isStreamOnlyShell
    ? (headerMetaLabelOverride ?? `signals ${intn(streamStats.signals)} | ready ${intn(streamStats.ready)} | open ${intn(streamStats.open)}`)
    : `minRate ${num(minRateLabel, 2)} | minTotal ${intn(minTotalLabel)} | limit ${intn(limitLabel)}`;
  const activeTabLabel = isStreamOnlyShell ? (activeTabLabelOverride ?? "CANDIDATES") : "ACTIVE";
  const episodesTabLabel = isStreamOnlyShell ? (episodesTabLabelOverride ?? "POSITIONS") : "SCOPE";
  const analyticsTabLabel = isStreamOnlyShell ? (analyticsTabLabelOverride ?? "ANALYTICS") : "SNAPSHOT";
  const headerNavGroupClass = isLightTheme
    ? "flex h-7 items-center gap-2 rounded-lg border border-slate-900/10 bg-white/35"
    : "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const headerNavInactiveClass = isLightTheme
    ? "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const streamShellActiveClass = "accent-soft";
  const shellTabStripClass = "flex items-center gap-1.5 self-start";
  const shellTabButtonBaseClass =
    "inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[11px] font-mono font-bold uppercase leading-none transition-all";
  const shellTabButtonActiveClass = "accent-soft";
  const shellTabButtonInactiveClass = isLightTheme
    ? "border border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border border-transparent text-[#8b8d97] hover:text-[#cfd1d8] hover:bg-white/[0.03]";
  const shellTabIconClass = isLightTheme ? "text-slate-400" : "text-[#8f919b]";
  const shellTabActiveIconClass = "text-current";
  const autoStartButtonClass = "accent-soft";
  const autoStopButtonClass = isLightTheme
    ? "border-rose-500/35 bg-rose-500/12 text-rose-700 shadow-none"
    : "border-rose-500/20 bg-rose-500/10 text-rose-300";
  const autoLockedPillClass = isLightTheme
    ? "inline-flex h-7 items-center justify-center rounded-lg border border-slate-900/10 bg-white/35 px-3 text-[10px] font-mono font-bold uppercase text-slate-500"
    : "inline-flex h-7 items-center justify-center rounded-lg border border-white/10 px-3 text-[10px] font-mono font-bold uppercase text-zinc-500";

  useEffect(() => {
    if (!isStreamOnlyShell || !onStreamShellStatsChange) return;
    onStreamShellStatsChange(streamStats);
  }, [isStreamOnlyShell, streamStats, onStreamShellStatsChange]);

  useEffect(() => {
    if (!onSharedRatingRulesChange) return;
    onSharedRatingRulesChange(ratingRules);
  }, [onSharedRatingRulesChange, ratingRules]);

  useEffect(() => {
    if (!routeLocksPrimaryPanel) return;
    setPrimaryPanel(initialPrimaryPanel);
  }, [initialPrimaryPanel, routeLocksPrimaryPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (routeLocksPrimaryPanel) {
        url.searchParams.delete("panel");
      } else if (primaryPanel === "stream") {
        url.searchParams.set("panel", "stream");
      } else {
        url.searchParams.delete("panel");
      }
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // ignore URL sync issues
    }
  }, [primaryPanel, routeLocksPrimaryPanel]);

  const renderShellTabIcon = useCallback((tabKey: TabKey, active: boolean) => {
    const iconClassName = clsx("shrink-0", active ? shellTabActiveIconClass : shellTabIconClass);
    const svg = (children: React.ReactNode) => (
      <svg aria-hidden="true" className={iconClassName} width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    );

    if (isStreamOnlyShell) {
      switch (tabKey) {
        case "active": // CONFIG — sliders
          return svg(<>
            <line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="6" y2="3"/>
            <line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="6" y2="3"/>
            <line x1="20" x2="20" y1="21" y2="18"/><line x1="20" x2="20" y1="12" y2="3"/>
            <line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/>
            <line x1="17" x2="23" y1="18" y2="18"/>
          </>);
        case "episodes": // SIMULATOR — play triangle
          return svg(<polygon points="6 3 20 12 6 21 6 3"/>);
        case "analytics": // EXECUTOR — send arrow
          return svg(<><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>);
      }
    }

    switch (tabKey) {
      case "active": // ACTIVE — lightning bolt
        return svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>);
      case "episodes": // SCOPE — search/magnifier
        return svg(<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>);
      case "analytics": // SNAPSHOT — trending up (financial)
      default:
        return svg(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>);
    }
  }, [shellTabActiveIconClass, shellTabIconClass, isStreamOnlyShell]);

  // ========= UI
  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <ScannerHeader
          scannerShellTitle={scannerShellTitle}
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref={navStreamHref}
          navScannerHref={navScannerHref}
          navSonarHref={navSonarHref}
          primaryPanel={primaryPanel}
          listMode={listMode}
          ignCount={ignCount}
          appCount={appCount}
          pinCount={pinCount}
          showIgnore={showIgnore}
          showApply={showApply}
          showPin={showPin}
          setShowIgnore={setShowIgnore}
          setShowApply={setShowApply}
          setShowPin={setShowPin}
          setShowAdvanced={setShowAdvanced}
          setModeIgnore={setModeIgnore}
          setModeApply={setModeApply}
          setModePin={setModePin}
          canRun={canRun}
          run={run}
          variantString={variantString}
        />

        {showPresets && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 p-3 backdrop-blur-md">
            <PresetPicker
              kind={SHARED_FILTER_PRESET_API_KIND}
              scope="BOTH"
              sharedFilterOnly
              getCurrentConfigJson={buildScannerSharedFilterPresetJson}
              onApplyPresetJson={(_, preset) => {
                try {
                  applyScannerPreset(preset);
                } catch {
                  // ignore storage/reload errors
                }
              }}
            />
          </div>
        )}

        {(showIgnore || showApply || showPin) && (
          <TickerListDrawers
            showIgnore={showIgnore}
            showApply={showApply}
            showPin={showPin}
            ignoreTickersText={ignoreTickersText}
            tickersText={tickersText}
            benchTickersText={benchTickersText}
            setIgnoreTickersText={setIgnoreTickersText}
            setTickersText={setTickersText}
            setBenchTickersText={setBenchTickersText}
            ignoreFileInputRef={ignoreFileInputRef}
            applyFileInputRef={applyFileInputRef}
            pinFileInputRef={pinFileInputRef}
            onIgnoreFileSelected={onIgnoreFileSelected}
            onApplyFileSelected={onApplyFileSelected}
            onPinFileSelected={onPinFileSelected}
          />
        )}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className={shellTabStripClass}>
            <button
              type="button"
              onClick={() => setTab("active")}
              className={clsx(
                shellTabButtonBaseClass,
                tab === "active"
                  ? shellTabButtonActiveClass
                  : shellTabButtonInactiveClass
              )}
            >
              {renderShellTabIcon("active", tab === "active")}
              {activeTabLabel}
            </button>
            <button
              type="button"
              onClick={() => setTab("episodes")}
              className={clsx(
                shellTabButtonBaseClass,
                tab === "episodes"
                  ? shellTabButtonActiveClass
                  : shellTabButtonInactiveClass
              )}
            >
              {renderShellTabIcon("episodes", tab === "episodes")}
              {episodesTabLabel}
            </button>
            <button
              type="button"
              onClick={() => setTab("analytics")}
              className={clsx(
                shellTabButtonBaseClass,
                tab === "analytics"
                  ? shellTabButtonActiveClass
                  : shellTabButtonInactiveClass
              )}
            >
              {renderShellTabIcon("analytics", tab === "analytics")}
              {analyticsTabLabel}
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {/* TOP mode toggle */}
          <div className="flex h-7 items-center gap-1.5">
            <div className="flex h-7 items-center rounded-lg bg-black/20">
              {([false, true] as const).map((isTop) => (
                <button
                  key={String(isTop)}
                  type="button"
                  onClick={() => setTopMode(isTop)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    topMode === isTop
                      ? isTop
                        ? "bg-yellow-400/90 text-black border-transparent shadow-[0_0_10px_rgba(250,204,21,0.3)]"
                        : "accent-soft"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {isTop ? "TOP" : "ALL"}
                </button>
              ))}
            </div>
            {topMode && (
              <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20 px-1">
                {([
                  { key: "sigma", label: "σ", on: topSigmaOn, set: setTopSigmaOn },
                  { key: "bench", label: "MKT", on: topBenchOn, set: setTopBenchOn },
                  { key: "time",  label: "TIME", on: topTimeOn,  set: setTopTimeOn },
                ] as const).map(({ key, label, on, set }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set((v) => !v)}
                    className={clsx(
                      "px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all",
                      on
                        ? "bg-emerald-500/80 text-white"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <OpenDoorGatesRow
            ignoreRatings={openDoorIgnoreRatings}
            setIgnoreRatings={setOpenDoorIgnoreRatings}
            useManualEntry={openDoorUseManualEntry}
            setUseManualEntry={setOpenDoorUseManualEntry}
            entryBounds={openDoorEntryBounds}
            setEntryBounds={setOpenDoorEntryBounds}
            useStack={openDoorUseStack} setUseStack={setOpenDoorUseStack}
            useBench={openDoorUseBench} setUseBench={setOpenDoorUseBench}
            useDevSig={openDoorUseDevSig} setUseDevSig={setOpenDoorUseDevSig}
            upMinRate={openDoorUpMinRate} setUpMinRate={setOpenDoorUpMinRate}
            downMinRate={openDoorDownMinRate} setDownMinRate={setOpenDoorDownMinRate}
            upMinTotal={openDoorUpMinTotal} setUpMinTotal={setOpenDoorUpMinTotal}
            downMinTotal={openDoorDownMinTotal} setDownMinTotal={setOpenDoorDownMinTotal}
            upMinMove={openDoorUpMinMove} setUpMinMove={setOpenDoorUpMinMove}
            downMinMove={openDoorDownMinMove} setDownMinMove={setOpenDoorDownMinMove}
          />

        </div>

          {[
            { label: "ρ", title: "Correlation", minValue: minCorr, maxValue: maxCorr, setMin: setMinCorr, setMax: setMaxCorr, step: 0.05 },
            { label: "β", title: "Beta", minValue: minBeta, maxValue: maxBeta, setMin: setMinBeta, setMax: setMaxBeta, step: 0.1 },
            { label: "σ", title: "Sigma", minValue: minSigma, maxValue: maxSigma, setMin: setMinSigma, setMax: setMaxSigma, step: 0.1 },
          ].map((field) => (
            <div key={field.title} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45" title={field.title}>
              <span className="flex h-7 min-w-4 items-center justify-center text-[12px] font-mono text-zinc-500 leading-none">
                {field.label}
              </span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  value={field.minValue}
                  onChange={(e) => field.setMin(e.target.value)}
                  className={clsx("center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
                  placeholder="min"
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => field.setMin(String(+(((Number(field.minValue) || 0) + field.step).toFixed(4))))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => field.setMin(String(+(((Number(field.minValue) || 0) - field.step).toFixed(4))))}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▼
                  </button>
                </div>
              </div>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  value={field.maxValue}
                  onChange={(e) => field.setMax(e.target.value)}
                  className={clsx("center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
                  placeholder="max"
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => field.setMax(String(+(((Number(field.maxValue) || 0) + field.step).toFixed(4))))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => field.setMax(String(+(((Number(field.maxValue) || 0) - field.step).toFixed(4))))}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          
            <div className="flex h-7 items-center gap-2">
              {[
                { key: "10m", label: "10m" },
                { key: "30m", label: "30m" },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setOpenDoorExitClass(b.key as "10m" | "30m")}
                  className={clsx(
                    TOOLBAR_BUTTON_BASE,
                    openDoorExitClass === b.key
                      ? TOOLBAR_BUTTON_ACTIVE
                      : TOOLBAR_BUTTON_INACTIVE
                  )}
                >
                  {b.label}
                </button>
                ))}
            </div>

            <div className="flex-1" />

            <div className="flex h-7 items-center gap-2 pl-3 pr-2 rounded-lg bg-black/20">
              <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">PRESET</span>
              {scannerPresetSaveMode ? (
                <input
                  type="text"
                  value={scannerPresetDraftName}
                  onChange={(e) => setScannerPresetDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!scannerPresetBusy) void saveCurrentScannerPreset(scannerPresetDraftName);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setScannerPresetSaveMode(false);
                      setScannerPresetDraftName("");
                    }
                  }}
                  autoFocus
                  placeholder="NAME..."
                  className="h-7 min-w-[112px] bg-transparent border-0 text-[10px] font-mono uppercase text-zinc-300 placeholder:text-zinc-600 outline-none focus:outline-none"
                />
              ) : (
                <GlassSelect
                  value={scannerPresetId}
                  onChange={async (e) => {
                    const nextId = e.target.value;
                    setScannerPresetId(nextId);
                    if (!nextId) {
                      clearScannerSharedFilters();
                      return;
                    }
                    if (scannerPresetBusy || scannerPresetSaveMode) return;
                    setScannerPresetBusy(true);
                    try {
                      const preset = getSharedFilterLocalPreset(nextId);
                      if (preset && applyScannerPreset(preset)) return;
                      const fallbackPreset = scannerPresets.find((x) => x.id === nextId);
                      if (fallbackPreset && applyScannerPreset(fallbackPreset)) return;
                      setScannerPresetStatus("Apply failed");
                    } catch {
                      setScannerPresetStatus("Apply failed");
                    } finally {
                      setScannerPresetBusy(false);
                    }
                  }}
                  options={[
                    { value: "", label: "NONE" },
                    ...scannerPresets.map((preset) => ({
                      value: preset.id,
                      label: preset.name.toUpperCase(),
                    })),
                  ]}
                  compact
                  panelOffsetX={-42}
                  panelWidth={124}
                  className="w-[92px] !h-7 !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (scannerPresetSaveMode) {
                    if (!scannerPresetBusy) void saveCurrentScannerPreset(scannerPresetDraftName);
                    return;
                  }
                  setScannerPresetSaveMode(true);
                  setScannerPresetDraftName("");
                }}
                disabled={scannerPresetBusy}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  scannerPresetBusy
                    ? "border-transparent text-zinc-600"
                    : scannerPresetSaveMode
                      ? TOOLBAR_BUTTON_ACTIVE
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!scannerPresetId || scannerPresetBusy || scannerPresetSaveMode) return;
                  const ok = deleteSharedFilterLocalPreset(scannerPresetId);
                  if (!ok) {
                    setScannerPresetStatus("Delete failed");
                    return;
                  }
                  const items = listSharedFilterLocalPresets().filter((x) => {
                    if (x.scope !== "BOTH") return false;
                    try {
                      return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
                    } catch {
                      return false;
                    }
                  });
                  setScannerPresets(items);
                  setScannerPresetId(items[0]?.id ?? "");
                  setScannerPresetStatus("Deleted");
                }}
                disabled={!scannerPresetId || scannerPresetBusy || scannerPresetSaveMode}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  scannerPresetId && !scannerPresetBusy && !scannerPresetSaveMode
                    ? "border-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    : "border-transparent text-zinc-600"
                )}
              >
                DEL
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSharedMinMax((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
              title={showSharedMinMax ? "Hide shared filters" : "Show shared filters"}
            >
              {showSharedMinMax ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:text-rose-400 transition-colors"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
        </div>

        {showSharedMinMax && (
          <SharedMinMaxPanel
            filters={scannerFilters}
            zeroCoverageFilterKeys={zeroCoverageFilterKeys}
            toggleSharedRangeFilterMode={toggleSharedRangeFilterMode}
          />
          )}

        <div className="flex flex-col gap-3">
        <ExecutionSettingsPanel
          filters={scannerFilters}
          tab={tab}
          isStreamOnlyShell={isStreamOnlyShell}
          applyDilutionMode={applyDilutionMode}
          applyDilutionStep={applyDilutionStep}
          applyMaxAdds={applyMaxAdds}
          applyAddDelayMinutes={applyAddDelayMinutes}
          effectiveStreamAutomationConfig={effectiveStreamAutomationConfig}
          onStreamAutomationConfigChange={onStreamAutomationConfigChange}
          streamFilterPassLogCount={streamFilterPassLogCount}
          filteredEpisodes={filteredEpisodes}
          downloadEpisodesLog={downloadEpisodesLog}
          downloadStreamFilterPassLog={downloadStreamFilterPassLog}
        />

          {/* Shared with both Sonars and Stream — see components/shared/filters/FilterFlagsRow.
              Adding a filter is now one edit here plus the rule in lib/filters, instead of the
              same edit in four files. Each exclusion also clears its paired `require*` flag, so
              the two halves of a tri-state can never both be on. */}
          <FilterFlagsRow
              className="order-1"
            exclusions={[
              { label: "ITB", value: excludeItb, set: setExcludeItb, title: "B5ETB = ITB" },
              { label: "HARD", value: excludeHard, set: setExcludeHard, title: "B5ETB = NO (hard to borrow)" },
              { label: "Div", value: excludeDividend, set: setExcludeDividend, title: "Exclude dividend=true" },
              { label: "News", value: excludeHasNews, set: (v) => { setExcludeHasNews(v); setRequireHasNews(false); }, title: "Exclude news=true" },
              { label: "PTP", value: excludePTP, set: (v) => { setExcludePTP(v); setRequireIsPTP(false); } },
              { label: "SSR", value: excludeSSR, set: (v) => { setExcludeSSR(v); setRequireIsSSR(false); } },
              { label: "ETF", value: excludeETF, set: (v) => { setExcludeETF(v); setRequireIsETF(false); } },
              { label: "CRAP", value: excludeCrap, set: (v) => { setExcludeCrap(v); setRequireIsCrap(false); } },
            ]}
            report={{
              label: "REP",
              value: excludeHasReport,
              set: (v) => { setExcludeHasReport(v); setRequireHasReport(false); },
              title: "Exclude report=true",
            }}
            corr={{ label: "CORR", value: excludeCorr, set: setExcludeCorr }}
            corrThresholdInput={corrThresholdInput}
            setCorrThresholdInput={setCorrThresholdInput}
            corrThreshold={corrThreshold}
            corrStatus={sectorCorr}
            regions={[
              { label: "USA", value: includeUSA, set: setIncludeUSA },
              { label: "CHINA", value: includeChina, set: setIncludeChina },
            ]}
            selectsSlot={
              <>
                <MultiSelectFilter
                  label="COUNTRY"
                  options={streamCountries}
                  selected={selCountries}
                  setSelected={setSelCountries}
                  enabled={countryEnabled}
                  toggleEnabled={() => setCountryEnabled((m) => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                  color="amber"
                />

                <MultiSelectFilter
                  label="EXCHANGE"
                  options={streamExchanges}
                  selected={selExchanges}
                  setSelected={setSelExchanges}
                  enabled={exchangeEnabled}
                  toggleEnabled={() => setExchangeEnabled((m) => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                  color="amber"
                />
                <MultiSelectFilter
                  label="SECTOR"
                  options={streamSectors}
                  selected={selSectors}
                  setSelected={setSelSectors}
                  enabled={sectorEnabled}
                  toggleEnabled={() => setSectorEnabled((m) => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                  color="amber"
                  panelWidth={220}
                />
              </>
            }
            sortSlot={
              <div className="relative flex h-7 items-center rounded-full border border-sky-400/25 bg-[#0a1520]/85">
                <GlassSelect
                  value={streamSortKey}
                  onChange={(e) => setStreamSortKey(e.target.value as "alpha" | "sigma" | "netEdge")}
                  options={STREAM_SORT_KEY_OPTIONS}
                  className="!h-7 !min-w-[74px] !w-[74px] !py-0 !px-2 !bg-transparent !border-0 !focus:border-0 text-right rounded-full"
                />
              </div>
            }
          />
        {/* Active ticker, shared with the Sonars and Stream. The Sonar owns the selection; this
            reads its per-strategy localStorage key so the same ticker is active on every surface.
            Wrapped at order-1 so it lands in the same band as the filter row above it: the column
            lays out by `order`, not by source, and at the default order-0 this strip floated to
            the top of the column, above the filters. */}
        <div className="order-1">
            <ActiveTickerCard
              ticker={activeSelection.ticker ?? null}
              stats={activeCardStats}
              loading={activeSnapshot.loading}
              error={activeSnapshot.error}
            />
        </div>

        </div>

        {/* Error */}
        {err && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-200 text-xs font-mono p-3">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {!isStreamOnlyShell && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                {[
                  { key: "day", label: "DAY" },
                  { key: "last", label: "LAST" },
                  { key: "range", label: "RANGE" },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      const wants = m.key as DateMode;
                      const canRange = tab === "analytics" || (tab === "episodes" && episodesUseSearchEffective);
                      if ((wants === "range" || wants === "last") && !canRange) return;
                      if (tab === "episodes") {
                        if (wants === "day") {
                          setEpisodesUseSearch(false);
                          const d = toYmd(dateNy) ? dateNy : (toYmd(dateTo) ? dateTo : todayNyYmd());
                          setDateNy(d);
                          setDateFrom(d);
                          setDateTo(d);
                        } else {
                          setEpisodesUseSearch(true);
                        }
                      }
                      setDateMode(wants);
                      if (wants === "day") {
                        return;
                      }
                      if (wants === "last") {
                        applyRangePreset(rangePreset);
                      }
                    }}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                      dateMode === m.key
                        ? "accent-soft"
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                {dateMode === "day" ? (
                  <div ref={daySelectWrapperRef} className="flex h-7 items-center rounded-lg px-1.5">
                    <GlassSelect
                      value={dateNy}
                      onChange={(e) => {
                        const d = e.target.value;
                        setDateNy(d);
                        setDateFrom(d);
                        setDateTo(d);
                      }}
                      options={(sortedDaysDesc.length ? sortedDaysDesc : [dateNy]).map((d) => ({ value: d, label: d }))}
                      className="!inline-flex !w-[112px] !min-w-[112px] !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                      panelWidth={112}
                      panelAnchorRef={daySelectWrapperRef}
                      onDelete={handleDeleteDay}
                    />
                  </div>
                ) : dateMode === "last" ? (
                  <div ref={rangePresetWrapperRef} className="flex h-7 items-center rounded-lg px-1.5">
                    <GlassSelect
                      value={rangePreset}
                      onChange={(e) => applyRangePreset(e.target.value as "3d" | "5d" | "10d" | "15d" | "20d" | "30d")}
                      options={[
                        { value: "3d", label: "3 DAYS" },
                        { value: "5d", label: "5 DAYS" },
                        { value: "10d", label: "10 DAYS" },
                        { value: "15d", label: "15 DAYS" },
                        { value: "20d", label: "20 DAYS" },
                        { value: "30d", label: "30 DAYS" },
                      ]}
                      className="!inline-flex !w-[90px] !min-w-[90px] !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                      panelWidth={110}
                      panelAnchorRef={rangePresetWrapperRef}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div ref={dateFromSelectWrapperRef} className="flex h-7 items-center rounded-lg px-1.5">
                      <GlassSelect
                        value={dateFrom}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDateFrom(v);
                          if (toYmd(dateTo) && v > dateTo) setDateTo(v);
                        }}
                        options={fromDayOptions.length ? fromDayOptions : [{ value: dateFrom, label: dateFrom }]}
                        className="!inline-flex !w-[124px] !min-w-[124px] !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                        panelWidth={124}
                        panelAnchorRef={dateFromSelectWrapperRef}
                      />
                    </div>
                    <div ref={dateToSelectWrapperRef} className="flex h-7 items-center rounded-lg px-1.5">
                      <GlassSelect
                        value={dateTo}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDateTo(v);
                          if (toYmd(dateFrom) && v < dateFrom) setDateFrom(v);
                        }}
                        options={toDayOptions.length ? toDayOptions : [{ value: dateTo, label: dateTo }]}
                        className="!inline-flex !w-[124px] !min-w-[124px] !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                        panelWidth={124}
                        panelAnchorRef={dateToSelectWrapperRef}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
          {primaryPanel === "stream" ? (
            streamAutomationLaunchEnabled ? (
              <>
                <button
                  type="button"
                  onClick={() => void captureStreamWindowsFromHeader()}
                  disabled={streamWindowCaptureBusy}
                  className={clsx(
                    SCANNER_EYE_BUTTON,
                    streamWindowCaptureBusy && "cursor-not-allowed opacity-60"
                  )}
                  title={
                    streamWindowCaptureBusy
                      ? (streamWindowsBound ? "Disconnecting windows..." : "Capturing windows...")
                      : (streamWindowsBound ? "Disconnect Market Maker + Main Window" : "Capture Market Maker + Main Window")
                  }
                  aria-label={
                    streamWindowCaptureBusy
                      ? (streamWindowsBound ? "Disconnecting windows" : "Capturing windows")
                      : (streamWindowsBound ? "Disconnect Market Maker and Main Window" : "Capture Market Maker and Main Window")
                  }
                >
                  <CrosshairIcon
                    className={clsx(
                      "transition-colors",
                      !streamWindowsBound && "text-zinc-300 group-hover:text-white"
                    )}
                    style={streamWindowsBound ? { color: STREAM_FIXED_ICON_GREEN } : undefined}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleStreamBookReadingFromHeader()}
                  disabled={!streamWindowsBound || streamBookToggleBusy}
                  className={clsx(
                    SCANNER_EYE_BUTTON,
                    (!streamWindowsBound || streamBookToggleBusy) && "cursor-not-allowed opacity-40"
                  )}
                  title={
                    !streamWindowsBound
                      ? "Bind the Market Maker window first"
                      : streamBookReading
                        ? "Stop reading the order book"
                        : "Start reading the order book"
                  }
                  aria-label={streamBookReading ? "Stop reading the order book" : "Start reading the order book"}
                >
                  <BookLevelsIcon
                    className={clsx(
                      "transition-colors",
                      !streamBookReading && "text-zinc-300 group-hover:text-white"
                    )}
                    style={streamBookReading ? { color: STREAM_FIXED_ICON_GREEN } : undefined}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setStreamAutoStartLocked((prev) => !prev)}
                  className={SCANNER_EYE_BUTTON}
                  title={streamAutoStartLocked ? "Unlock auto start" : "Lock auto start"}
                  aria-label={streamAutoStartLocked ? "Unlock auto start" : "Lock auto start"}
                >
                  <LockToggleIcon
                    open={streamAutoStartLocked}
                    className="text-zinc-300 group-hover:text-white transition-colors"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleStreamAutomationRunFromHeader()}
                  disabled={streamAutomationToggleBusy || (streamAutoStartLocked && !streamAutomationRunning)}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                    streamAutomationRunning
                      ? autoStopButtonClass
                      : autoStartButtonClass,
                    (streamAutomationToggleBusy || (streamAutoStartLocked && !streamAutomationRunning)) && "cursor-not-allowed opacity-40"
                  )}
                >
                  {streamAutomationTogglePending === "start"
                    ? "STARTING"
                    : streamAutomationTogglePending === "stop"
                      ? "STOPPING"
                      : streamAutomationRunning
                        ? "STOP AUTO"
                        : streamAutoStartLocked
                          ? "START LOCKED"
                          : "START AUTO"}
                </button>
              </>
            ) : (
              <span className={autoLockedPillClass}>
                AUTO LOCKED
              </span>
            )
          ) : (
            <div className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase tracking-wide">
              {loading ? "Loading..." : "Idle"} | <span className="text-zinc-200">{variantShort}</span>
            </div>
          )}
          </div>
        </div>

        {/* CONTENT */}

        {primaryPanel === "stream" && (
          <OpenDoorStreamView
            tab={tab}
            streamSignalsCount={streamSignalMeta.totalCount}
            streamAutoEnabled={effectiveStreamAutoEnabled}
            streamSessionStartedAt={streamSessionStartedAt}
            streamSessionStoppedAt={streamSessionStoppedAt}
            streamSentOrdersCount={streamSentOrdersCount}
            onSetAutoEnabled={applyStreamAutoEnabled}
            manualExecutionBusy={streamManualExecutionBusy}
            onSubmitManualOrders={submitManualStreamOrders}
            onCaptureTickerPoint={captureStreamTickerPoint}
            onCaptureTickerPointDelayed={captureStreamTickerPointDelayed}
            onClearTickerPoint={clearStreamTickerPoint}
            onTogglePanicOff={toggleStreamPanicOff}
            onStartAutomation={startStreamAutomation}
            onStopAutomation={stopStreamAutomation}
            onClearExecutionQueue={clearStreamExecutionQueue}
            onResetAutomationState={resetStreamAutomationState}
            onDismissActivePositions={dismissStreamActivePositions}
            onForceRefresh={refreshStreamSignals}
            listModeLabel={listMode.toUpperCase()}
            automationConfig={effectiveStreamAutomationConfig}
            onAutomationConfigChange={(patch) => onStreamAutomationConfigChange?.(patch)}
            accentActiveSoftClass={STREAM_FIXED_ACTIVE_SOFT}
            accentActiveTextClass={STREAM_FIXED_ACTIVE_TEXT}
            viewMode={streamViewModeOverride ?? "stream"}
            automationLaunchEnabled={streamViewModeOverride === "auto" || streamViewModeOverride === "stream-auto-tab"}
            entryCutoffActive={streamSignalClass === "ark"}
            hideAutomationButtons
          />
        )}

        {primaryPanel === "scanner" && tab === "active" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryMetricCard
                label="TOTAL PNL (pts)"
                value={num(openDoorCombined.totalPnl, 2)}
                className="xl:row-span-2 xl:min-h-[124px]"
                valueClassName={
                  clsx(
                    "text-4xl md:text-6xl font-bold",
                    openDoorCombined.totalPnl > 0
                      ? "text-[#6ee7b7]"
                      : openDoorCombined.totalPnl < 0
                        ? SOFT_LOSS_TEXT_CLASS
                        : "text-zinc-200"
                  )
                }
              />
              <SummaryMetricCard label="TICKERS" value={intn(openDoorCombined.tickers)} inline />
              <SummaryMetricCard label="OBS" value={intn(openDoorCombined.totalObs)} inline />
              <SummaryMetricCard label="WIN RATE" value={`${num(openDoorCombined.weightedRate * 100, 1)}%`} inline />
              <SummaryMetricCard
                label="AVG TRADE (pts)"
                value={num(openDoorCombined.avgTrade, 3)}
                inline
                valueClassName={openDoorCombined.avgTrade > 0 ? "text-emerald-300" : openDoorCombined.avgTrade < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="MAX WIN (pts)"
                value={num(openDoorCombined.maxWin, 2)}
                inline
                valueClassName={openDoorCombined.maxWin > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG WIN (pts)"
                value={num(openDoorCombined.avgWin, 3)}
                inline
                valueClassName={openDoorCombined.avgWin > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard label="PROFIT FACTOR" value={Number.isFinite(openDoorCombined.profitFactor) ? num(openDoorCombined.profitFactor, 2) : "∞"} inline />
              <SummaryMetricCard label="EXPECTANCY (pts)" value={num(openDoorCombined.expectancy, 3)} inline />
              <SummaryMetricCard
                label="MAX LOSS (pts)"
                value={num(openDoorCombined.maxLoss, 2)}
                inline
                valueClassName={openDoorCombined.maxLoss < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG LOSS (pts)"
                value={num(openDoorCombined.avgLoss, 3)}
                inline
                valueClassName={openDoorCombined.avgLoss < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                  OPENDOOR CANDIDATES | rows {openDoorCombined.rows.length}
                </div>
                <div className="text-[10px] font-mono text-zinc-600">
                  {openDoorExitClass} exit · entry 9:20 · {openDoorResearch.enabledParams.join(" + ") || "no params enabled"}
                </div>
              </div>

              <div className={clsx("overflow-auto rounded-xl", SCANNER_PANEL_SURFACE)}>
                <table className="min-w-[900px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
                    <tr>
                      <th className="text-left p-2.5">Ticker</th>
                      <th className="text-left p-2.5">Side</th>
                      <th className="text-right p-2.5 border-l border-white/10">Rate</th>
                      <th className="text-right p-2.5">Obs</th>
                      <th className="text-right p-2.5 border-l border-white/10">Avg Move</th>
                      <th className="text-right p-2.5">P&amp;L (pts)</th>
                      <th className="text-left p-2.5 border-l border-white/10">Per-Param (rate × total, move)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openDoorCombined.rows.map((r, i) => (
                      <tr
                        key={`${r.ticker}|${r.side}|${i}`}
                        className={clsx(
                          "border-t border-white/5 transition-colors",
                          i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                          "hover:bg-white/[0.03]"
                        )}
                      >
                        <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                        <td className={clsx("p-2.5 font-bold", r.side === "LONG" ? "text-[#6ee7b7]" : "text-rose-400")}>{r.side}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-200 border-l border-white/10">{(r.rate * 100).toFixed(0)}%</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{r.total}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300 border-l border-white/10">
                          {r.avgMove != null ? `${r.avgMove.toFixed(2)}%` : "—"}
                        </td>
                        <td
                          className={clsx(
                            "p-2.5 text-right tabular-nums font-bold",
                            (r.pnl ?? 0) > 0 ? "text-[#6ee7b7]" : (r.pnl ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"
                          )}
                        >
                          {r.pnl != null ? r.pnl.toFixed(3) : "—"}
                        </td>
                        <td className="p-2.5 text-left text-[10px] text-zinc-500 border-l border-white/10">
                          {Object.entries(r.byParam)
                            .map(([p, v]) => `${p}: ${(v.rate * 100).toFixed(0)}%×${v.total}${v.avgMove != null ? `, ${v.avgMove.toFixed(2)}%` : ""}`)
                            .join("  ·  ")}
                        </td>
                      </tr>
                    ))}
                    {!openDoorCombined.rows.length && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500">
                          No candidates pass the current gates. Adjust MINRATE/MINTOTAL/MINMOVE or enabled parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {primaryPanel === "scanner" && tab === "episodes" && !isStreamOnlyShell && (
          <div className="space-y-3">
            {/* TOTAL PNL keeps its own column; every other card shares ONE grid so they all get
                the same track width. */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,6fr)]">
              <div className="grid grid-cols-1 gap-3">
                <SummaryMetricCard
                  label="TOTAL PNL"
                  value={num(analyticsSummary.totalPnlUsd, 2)}
                  className="h-full xl:min-h-[124px]"
                  valueClassName={
                    clsx(
                      "text-4xl md:text-6xl font-bold",
                      analyticsSummary.totalPnlUsd > 0
                        ? "text-[#6ee7b7]"
                        : analyticsSummary.totalPnlUsd < 0
                          ? SOFT_LOSS_TEXT_CLASS
                          : "text-zinc-200"
                    )
                  }
                />
              </div>
              {/* Nine columns of two, filled COLUMN by column (grid-flow-col), so each pair sits
                  one above the other: the green reading on top, its red counterpart underneath.
                  Track widths are deliberately uneven — the counts are narrow because "31" needs
                  no room, MONEYFLOW and MAX DRAWDOWN are wide because their numbers are long
                  enough to wrap at a normal width. */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-flow-col xl:grid-rows-2 xl:[grid-template-columns:1fr_1fr_4fr_2fr_2fr_2fr_2fr_2fr_2fr]">
                {/* 1 — counts */}
                <SummaryMetricCard label="SITUATIONS" value={intn(analyticsSummary.situations)} inline />
                <SummaryMetricCard label="LONGS" value={intn(analyticsSummary.longs)} inline valueClassName="text-[#6ee7b7]" />

                {/* 2 — counts */}
                <SummaryMetricCard label="TRADES" value={intn(analyticsSummary.trades)} inline />
                <SummaryMetricCard label="SHORTS" value={intn(analyticsSummary.shorts)} inline valueClassName={SOFT_LOSS_TEXT_CLASS} />

                {/* 3 — the two long numbers */}
                <SummaryMetricCard label="MONEYFLOW" value={numSpaced(analyticsSummary.streamflowUsd, 2)} inline valueClassName={"accent-text"} />
                <SummaryMetricCard label="MAX DRAWDOWN" value={num(analyticsSummary.maxDrawdownUsd, 2)} inline />

                {/* 4 */}
                <SummaryMetricCard label="WIN RATE" value={`${num(analyticsSummary.winRate * 100, 1)}%`} inline />
                <SummaryMetricCard label="EXPECTANCY" value={num(analyticsSummary.expectancyUsd, 2)} inline />

                {/* 5 — extremes, green over red */}
                <SummaryMetricCard label="MAX WIN" value={num(analyticsSummary.maxWinUsd, 2)} inline valueClassName={analyticsSummary.maxWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"} />
                <SummaryMetricCard label="MAX LOSS" value={num(analyticsSummary.maxLossUsd, 2)} inline valueClassName={analyticsSummary.maxLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"} />

                {/* 6 — averages, green over red */}
                <SummaryMetricCard label="AVG WIN" value={num(analyticsSummary.avgWinUsd, 2)} inline valueClassName={analyticsSummary.avgWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"} />
                <SummaryMetricCard label="AVG LOSS" value={num(analyticsSummary.avgLossUsd, 2)} inline valueClassName={analyticsSummary.avgLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"} />

                {/* 7 — concentration, green over red. Share of the same-sign gross carried by the
                    two biggest; amber past 60% is where the result is two trades, not a strategy. */}
                <SummaryMetricCard
                  label="TOP2 WIN %"
                  value={analyticsSummary.top2WinShare == null ? "-" : `${num(analyticsSummary.top2WinShare * 100, 1)}%`}
                  inline
                  valueClassName={
                    analyticsSummary.top2WinShare == null
                      ? "text-zinc-500"
                      : analyticsSummary.top2WinShare >= 0.6
                        ? "text-amber-300"
                        : "text-[#6ee7b7]"
                  }
                />
                <SummaryMetricCard
                  label="TOP2 LOSS %"
                  value={analyticsSummary.top2LossShare == null ? "-" : `${num(analyticsSummary.top2LossShare * 100, 1)}%`}
                  inline
                  valueClassName={
                    analyticsSummary.top2LossShare == null
                      ? "text-zinc-500"
                      : analyticsSummary.top2LossShare >= 0.6
                        ? "text-amber-300"
                        : SOFT_LOSS_TEXT_CLASS
                  }
                />

                {/* 8 — the average against the median, the pair that exposes a skewed book */}
                <SummaryMetricCard
                  label="AVG TRADE"
                  value={num(analyticsSummary.avgPnlUsd, 2)}
                  inline
                  valueClassName={
                    analyticsSummary.avgPnlUsd > 0
                      ? "text-emerald-300"
                      : analyticsSummary.avgPnlUsd < 0
                        ? SOFT_LOSS_TEXT_CLASS
                        : "text-zinc-200"
                  }
                />
                <SummaryMetricCard
                  label="MEDIAN TRADE"
                  value={num(analyticsSummary.medianTradeUsd, 2)}
                  inline
                  valueClassName={
                    analyticsSummary.medianTradeUsd > 0
                      ? "text-[#6ee7b7]"
                      : analyticsSummary.medianTradeUsd < 0
                        ? SOFT_LOSS_TEXT_CLASS
                        : "text-zinc-200"
                  }
                />

                {/* 9 — MEDIAN DAY only over a range: on one day the median day IS the day. */}
                <SummaryMetricCard label="PROFIT FACTOR" value={num(analyticsSummary.profitFactor, 2)} inline />
                <SummaryMetricCard
                  label={analyticsSummary.dayCount > 1 ? `MEDIAN DAY (${intn(analyticsSummary.dayCount)}d)` : "MEDIAN DAY"}
                  value={analyticsSummary.dayCount > 1 ? num(analyticsSummary.medianDayUsd, 2) : "-"}
                  inline
                  valueClassName={
                    analyticsSummary.dayCount <= 1
                      ? "text-zinc-500"
                      : analyticsSummary.medianDayUsd > 0
                        ? "text-[#6ee7b7]"
                        : analyticsSummary.medianDayUsd < 0
                          ? SOFT_LOSS_TEXT_CLASS
                          : "text-zinc-200"
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              {filteredEpisodes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => downloadEpisodesCsv(filteredEpisodes, `scanner-episodes-${new Date().toISOString().slice(0, 10)}.csv`, priceMode, {
                    session,
                    ruleBand,
                    metric,
                    closeMode,
                    priceMode,
                    pnlMode,
                    scopeMode,
                    topN,
                    offset,
                    startAbs,
                    startAbsMax,
                    endAbs,
                    minHoldCandles,
                    startCutoffMinuteIdx: parseTimeToMinuteIdx(startCutoffTime),
                    preStartMinuteIdx: preStartToMinuteIdx(),
                    dilutionMode,
                    dilutionStep,
                    maxAdds,
                    zapMode,
                  })}
                  className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-950/30 px-3 py-1.5 text-[10px] font-mono uppercase text-sky-400 hover:bg-sky-500/20 hover:text-sky-200 transition-colors"
                  title="Download filtered episodes as CSV"
                >
                  CSV ({filteredEpisodes.length})
                </button>
              ) : <div />}
              {OPEN_DOOR_OPTIMIZER_ENABLED && (
                <div className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase tracking-wide">
                  Scope Engine
                </div>
              )}
            </div>

            {OPEN_DOOR_OPTIMIZER_ENABLED && (
            <GlassCard className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                    <button
                      type="button"
                      onClick={() => setScopeSelectedParameterKeys(SCOPE_PARAMETER_DEFINITIONS.map((item) => item.key))}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                        "accent-soft"
                      )}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScopeSelectedParameterKeys([]);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-start">
                  <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-2 max-w-full">
                    {SCOPE_PARAMETER_SELECT_GROUPS.map((group) => (
                      <div key={`scope-select-group-${group.label}`} className="min-w-0">
                        {(() => {
                          const selectedOptions = group.options.filter((option) => scopeSelectedParameterKeys.includes(option.value));
                          const isExpanded = Boolean(scopeParameterGroupExpanded[group.label]);
                          return (
                            <>
                        <div
                          className={clsx(
                            // One chip per group: label, picker and count read as a single unit.
                            // They used to be three loose pieces at gap-3, so neighbouring groups
                            // ran together and the count looked like a stray number.
                            "flex h-8 items-center gap-2 rounded-lg pl-3 pr-1 transition-colors",
                            selectedOptions.length
                              ? "bg-black/30 ring-1 ring-inset ring-white/[0.07]"
                              : "bg-black/20 ring-1 ring-inset ring-transparent",
                            isExpanded && selectedOptions.length > 0 && "mb-2"
                          )}
                        >
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">{group.label}</span>
                          <span aria-hidden className="h-3.5 w-px shrink-0 bg-white/10" />
                          <GlassSelect
                            key={`scope-add-${group.label}-${selectedOptions.length}`}
                            value=""
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              if (!nextValue) return;
                              setScopeSelectedParameterKeys((prev) => (prev.includes(nextValue) ? prev : [...prev, nextValue]));
                            }}
                            options={[
                              { value: "", label: "Add parameter" },
                              ...group.options.map((option) => ({
                                value: option.value,
                                label: option.label,
                                disabled: scopeSelectedParameterKeys.includes(option.value),
                              })),
                            ]}
                            compact
                            className="w-[116px] !h-[14px] !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
                          />
                          <button
                            type="button"
                            disabled={selectedOptions.length === 0}
                            onClick={() =>
                              setScopeParameterGroupExpanded((prev) => ({
                                ...prev,
                                [group.label]: !prev[group.label],
                              }))
                            }
                            className={clsx(
                              // The count was a button that looked like plain text, so nothing said
                              // the selected filters could be opened from here. Now it reads as one.
                              "shrink-0 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-mono tabular-nums transition-colors",
                              selectedOptions.length ? "accent-soft" : "text-zinc-600 cursor-default"
                            )}
                            title={selectedOptions.length ? `${isExpanded ? "Hide" : "Show"} selected filters` : "No selected filters"}
                          >
                            {intn(selectedOptions.length)}
                            {selectedOptions.length > 0 ? (
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={clsx("transition-transform", isExpanded && "rotate-180")}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            ) : null}
                          </button>
                        </div>
                        {isExpanded && selectedOptions.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedOptions.map((option) => (
                              <button
                                key={`scope-param-chip-${option.value}`}
                                type="button"
                                onClick={() =>
                                  setScopeSelectedParameterKeys((prev) => prev.filter((value) => value !== option.value))
                                }
                                className={clsx(
                                  "px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-[0.16em] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                                  "accent-soft"
                                )}
                                title={`Remove ${option.label}`}
                              >
                                {option.label}
                              </button>
                            ))}
                        </div>
                        ) : null}
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-zinc-600 shrink-0 self-center">
                  <button
                    type="button"
                    disabled={optimizerLoading}
                    onClick={runEpisodesOptimizer}
                    className={clsx(
                      "ml-1 w-9 h-9 flex items-center justify-center rounded-lg active:scale-95",
                      SCANNER_PANEL_SURFACE,
                      optimizerLoading
                        ? "border-white/10 bg-[#0a0a0a]/30 text-zinc-600 cursor-not-allowed hover:bg-[#0a0a0a]/30 hover:border-white/10"
                        : "accent-outline"
                    )}
                    aria-label={optimizerLoading ? "Running scope" : "Run scope"}
                    title={optimizerLoading ? "Running scope" : "Run scope"}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <polyline points="21 3 21 9 15 9" />
                    </svg>
                  </button>
                </div>
              </div>

              {optimizerErr && <div className="mt-1 text-xs font-mono text-rose-300">{optimizerErr}</div>}

            </GlassCard>
            )}


            <div className="space-y-3">
              {optimizerRangesErr && <div className="text-xs font-mono text-amber-300 mb-3">range maps: {optimizerRangesErr}</div>}

              {hasScopeMapsContent ? (
                <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(Object.entries(optimizerRangeGroupStatus) as Array<[OptimizerRangeGroupKey, OptimizerRangeGroupStatus]>)
                  .filter(([group]) => scopeRequestedRangeGroups.includes(group))
                  .map(([group, status]) => (
                  <div
                    key={`group-status-${group}`}
                    className={clsx(
                      "rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest",
                      status.loading
                        ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
                        : status.partial
                          ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                          : status.error
                            ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          : "border-[#6ee7b7]/25 bg-[#6ee7b7]/10 text-[#6ee7b7]"
                    )}
                  >
                    {group}: {status.loading ? "loading" : status.partial ? "partial" : status.error ? "error" : "ready"}
                  </div>
                ))}
              </div>

              {optimizerRangesLoading && !optimizerRangeGroups.length && (
                <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] px-4 py-6 mb-4">
                  <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 mb-2">Preparing Range Maps</div>
                  <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full w-1/2 bg-[linear-gradient(90deg,rgba(16,185,129,0.8),rgba(56,189,248,0.8))] animate-pulse" />
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-3">
                    Selected SCOPE maps continue loading separately in the background.
                  </div>
                </div>
              )}

              <div className="mb-4 space-y-3">
                <div className={clsx("rounded-2xl px-4 py-3", SCANNER_PANEL_SURFACE)}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className={clsx("text-[12px] uppercase tracking-[0.24em] font-mono", "accent-text")}>
                        STATS
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 xl:ml-auto xl:items-end">
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <div className="inline-flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 w-fit">
                          <span className="shrink-0 text-[10px] font-mono text-zinc-500 uppercase">Rank By</span>
                          <GlassSelect
                            value={optimizerRangeRankMetric}
                            onChange={(e) => setOptimizerRangeRankMetric(e.target.value as OptimizerRangeRankMetric)}
                            options={[
                              { value: "avgPnlUsd", label: "Avg/Trade" },
                              { value: "totalPnlUsd", label: "TotalPnL" },
                              { value: "winRate", label: "WinRate" },
                              { value: "score", label: "Score" },
                              { value: "tailDamage", label: "Tail Dmg ↓" },
                            ]}
                            className="min-w-0 w-[136px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                          />
                        </div>
                        <div className="inline-flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 w-fit">
                          <span className="shrink-0 text-[10px] font-mono text-zinc-500 uppercase">Split</span>
                          <GlassSelect
                            value={optimizerBinMode}
                            onChange={(e) => setOptimizerBinMode(e.target.value as ScopeOptimizerBinMode)}
                            options={SCOPE_BIN_MODE_OPTIONS}
                            className="min-w-0 w-[96px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                          />
                        </div>
                        <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">Buckets</span>
                          <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                            <input
                              type="number"
                              min={SCOPE_OPTIMIZER_MIN_BINS}
                              max={SCOPE_OPTIMIZER_MAX_BINS}
                              step={1}
                              value={optimizerBucketCount}
                              onChange={(e) => setOptimizerBucketCount(Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, Math.trunc(Number(e.target.value) || 8))))}
                              className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                            />
                            <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerBucketCount((v) => Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, v + 1)))}
                                className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Increase buckets"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerBucketCount((v) => Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, v - 1)))}
                                className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Decrease buckets"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">Min Trades</span>
                          <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={optimizerRangeMinTrades}
                              onChange={(e) => setOptimizerRangeMinTrades(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                              className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                            />
                            <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerRangeMinTrades((v) => Math.max(0, v + 1))}
                                className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Increase min trades"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerRangeMinTrades((v) => Math.max(0, v - 1))}
                                className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Decrease min trades"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptimizerStatsHidden((prev) => !prev)}
                      className={clsx("group self-start xl:self-auto", SCANNER_EYE_BUTTON)}
                      aria-label={optimizerStatsHidden ? "Show stats" : "Hide stats"}
                      title={optimizerStatsHidden ? "Show section" : "Hide section"}
                    >
                      <EyeToggleIcon closed={!optimizerStatsHidden} className={!optimizerStatsHidden ? "group-hover:text-rose-400 transition-colors" : undefined} />
                    </button>
                  </div>
                </div>

                {!optimizerStatsHidden && (
                  <div className="space-y-3">
                    <OptimizerDualMetricChart
                      rows={optimizerBestRangeRows}
                      leftKey={optimizerRangeRankMetric === "totalPnlUsd" ? "totalPnlUsd" : optimizerRangeRankMetric === "winRate" ? "winRate" : optimizerRangeRankMetric === "score" ? "score" : "avgPnlUsd"}
                      rightKey="trades"
                      title={
                        optimizerRangeRankMetric === "totalPnlUsd"
                          ? "BEST RANGE TOTAL PNL"
                          : optimizerRangeRankMetric === "winRate"
                            ? "BEST RANGE WIN RATE"
                            : optimizerRangeRankMetric === "score"
                              ? "BEST RANGE SCORE"
                              : "BEST RANGE AVG / TRADE"
                      }
                      meta={`params ${intn(optimizerBestRangeRows.length)}`}
                      leftLabel={
                        optimizerRangeRankMetric === "totalPnlUsd"
                          ? "TOTAL PNL"
                          : optimizerRangeRankMetric === "winRate"
                            ? "WIN RATE"
                            : optimizerRangeRankMetric === "score"
                              ? "SCORE"
                              : "AVG / TRADE"
                      }
                      rightLabel="TRADES"
                    />

                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">
                        PARAMETER IMPACT VS BASE
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600">
                        scope rows {intn(optimizerImpactRows.length)} | baseline {optimizerBaselineRow ? num(optimizerBaselineRow.score, 2) : "-"} score
                      </div>
                    </div>

                  <div className="overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40">
                    <table className="min-w-[1080px] w-full text-xs font-mono">
                      <thead className="sticky top-0 z-10 bg-[#0a0a0a]/50 text-zinc-400 border-b border-white/[0.07] backdrop-blur-sm">
                        <tr>
                          <th className="text-left px-2.5 py-1 uppercase tracking-widest text-[10px]">Parameter</th>
                          <th className="text-left px-2.5 py-1 uppercase tracking-widest text-[10px]">Impact</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">DeltaScore</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">DeltaPnL</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">Trades</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">WinRate</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">TotalPnL</th>
                          <th className="text-right px-2.5 py-1 uppercase tracking-widest text-[10px]">Avg/Trade</th>
                          <th className="text-left px-2.5 py-1 uppercase tracking-widest text-[10px]">Applied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optimizerImpactRows.map((row) => (
                          <tr key={`impact-${row.id}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                            <td className="px-2.5 py-1 text-zinc-100 font-semibold">
                              {row.parameter} <span className="text-zinc-500 font-normal">{row.variant}</span>
                            </td>
                            <td className="px-2.5 py-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={clsx(
                                    "inline-flex min-w-[64px] justify-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                                    row.impactLevel === "STRONG"
                                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                                      : row.impactLevel === "MEDIUM"
                                        ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
                                        : "border-white/10 bg-white/[0.04] text-zinc-300"
                                  )}
                                >
                                  {row.impactLevel}
                                </span>
                                <div className="h-2 w-24 rounded-full bg-white/[0.05] overflow-hidden">
                                  <div
                                    className={clsx(
                                      "h-full",
                                      row.deltaScore >= 0 ? "bg-emerald-400/80" : "bg-rose-400/80"
                                    )}
                                    style={{ width: `${Math.max(8, row.impactPct * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className={clsx("px-2.5 py-1 text-right tabular-nums font-bold", row.deltaScore > 0 ? "text-emerald-300" : row.deltaScore < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.deltaScore, 2)}
                            </td>
                            <td className={clsx("px-2.5 py-1 text-right tabular-nums", row.deltaPnlUsd > 0 ? "text-emerald-300" : row.deltaPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.deltaPnlUsd, 2)}
                            </td>
                            <td className="px-2.5 py-1 text-right tabular-nums text-zinc-300">{intn(row.trades)}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums text-zinc-300">{num(row.winRate * 100, 1)}%</td>
                            <td className={clsx("px-2.5 py-1 text-right tabular-nums", row.totalPnlUsd > 0 ? "text-emerald-300" : row.totalPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.totalPnlUsd, 2)}
                            </td>
                            <td className={clsx("px-2.5 py-1 text-right tabular-nums", row.avgPnlUsd > 0 ? "text-emerald-300" : row.avgPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.avgPnlUsd, 2)}
                            </td>
                            <td className="px-2.5 py-1 text-zinc-400">{row.summary}</td>
                          </tr>
                        ))}
                        {!optimizerImpactRows.length && (
                          <tr>
                            <td colSpan={9} className="p-6 text-center text-zinc-500">
                              Run SCOPE to see per-parameter impact versus baseline.
                            </td>
                          </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {optimizerRangeGroups.map((group) => (
                  <div key={`group-${group.group}`} className="space-y-3">
                    <div className={clsx("rounded-2xl px-4 py-3", SCANNER_PANEL_SURFACE)}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className={clsx("text-[12px] uppercase tracking-[0.24em] font-mono", "accent-text")}>
                            {OPTIMIZER_GROUP_DISPLAY_LABELS[group.group as OptimizerRangeGroupKey] ?? group.group}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 xl:ml-auto xl:items-end">
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <div className="inline-flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 w-fit">
                              <span className="shrink-0 text-[10px] font-mono text-zinc-500 uppercase">Rank By</span>
                              <GlassSelect
                                value={optimizerRangeRankMetric}
                                onChange={(e) => setOptimizerRangeRankMetric(e.target.value as OptimizerRangeRankMetric)}
                                options={[
                                  { value: "avgPnlUsd", label: "Avg/Trade" },
                                  { value: "totalPnlUsd", label: "TotalPnL" },
                                  { value: "winRate", label: "WinRate" },
                                  { value: "score", label: "Score" },
                                  { value: "tailDamage", label: "Tail Dmg ↓" },
                                ]}
                                className="min-w-0 w-[136px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                              />
                            </div>
                            <div className="inline-flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 w-fit">
                              <span className="shrink-0 text-[10px] font-mono text-zinc-500 uppercase">Split</span>
                              <GlassSelect
                                value={optimizerBinMode}
                                onChange={(e) => setOptimizerBinMode(e.target.value as ScopeOptimizerBinMode)}
                                options={SCOPE_BIN_MODE_OPTIONS}
                                className="min-w-0 w-[96px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                              />
                            </div>
                            <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase">Buckets</span>
                              <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                                <input
                                  type="number"
                                  min={SCOPE_OPTIMIZER_MIN_BINS}
                                  max={SCOPE_OPTIMIZER_MAX_BINS}
                                  step={1}
                                  value={optimizerBucketCount}
                                  onChange={(e) => setOptimizerBucketCount(Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, Math.trunc(Number(e.target.value) || 8))))}
                                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                                />
                                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerBucketCount((v) => Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, v + 1)))}
                                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label="Increase buckets"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerBucketCount((v) => Math.max(SCOPE_OPTIMIZER_MIN_BINS, Math.min(SCOPE_OPTIMIZER_MAX_BINS, v - 1)))}
                                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label="Decrease buckets"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase">Min Trades</span>
                              <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={optimizerRangeMinTrades}
                                  onChange={(e) => setOptimizerRangeMinTrades(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                                />
                                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerRangeMinTrades((v) => Math.max(0, v + 1))}
                                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label="Increase min trades"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerRangeMinTrades((v) => Math.max(0, v - 1))}
                                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label="Decrease min trades"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                          <button
                            type="button"
                            onClick={() =>
                              setOptimizerRangeGroupHidden((prev) => ({
                              ...prev,
                              [group.group]: !prev[group.group as OptimizerRangeGroupKey],
                            }))
                          }
                            className={clsx("group self-start xl:self-auto", SCANNER_EYE_BUTTON)}
                            aria-label={optimizerRangeGroupHidden[group.group as OptimizerRangeGroupKey] ? `Show ${group.group}` : `Hide ${group.group}`}
                            title={optimizerRangeGroupHidden[group.group as OptimizerRangeGroupKey] ? "Show group" : "Hide group"}
                          >
                          <EyeToggleIcon closed={!optimizerRangeGroupHidden[group.group as OptimizerRangeGroupKey]} className={!optimizerRangeGroupHidden[group.group as OptimizerRangeGroupKey] ? "group-hover:text-rose-400 transition-colors" : undefined} />
                        </button>
                      </div>
                    </div>
                    {!optimizerRangeGroupHidden[group.group as OptimizerRangeGroupKey] && (
                      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                        {group.parameters.map((parameter) => (
                          <OptimizerParameterRangeCard
                            key={`range-${parameter.key}`}
                            parameter={parameter}
                            rankMetric={optimizerRangeRankMetric}
                            minTradesFilter={optimizerRangeMinTrades}
                            bucketCount={optimizerBucketCount}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!optimizerRangeGroups.length && (
                  <div className="rounded-xl border border-white/[0.08] bg-[#070707]/95 p-6 text-center text-zinc-500 text-xs font-mono">
                    Run SCOPE to see profitability ranges for your selected parameters.
                  </div>
                )}
                </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {scopeFullscreenPanel ? <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm" /> : null}
              <div
                className={clsx(
                  "grid grid-cols-1 gap-4 mb-4",
                  scopeFullscreenPanel
                    ? "fixed inset-3 z-[150] h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#05070c]/98 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
                    : "2xl:grid-cols-2"
                )}
              >
                {scopeFullscreenPanel ? (
                  <div className="z-20 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-white/[0.06] bg-[#05070c]/95 px-4 py-3 backdrop-blur-sm">
                    <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-400">
                      Visual Scope Fullscreen
                    </div>
                  </div>
                ) : null}
                {visibleScopePanels.map((panel) => {
                  const draft = scopeResearchDrafts[panel.key];
                  const computed = scopeResearchComputedByPanel[panel.key];
                  const bounds = scopeResearchObservedBoundsByPanel[panel.key];
                  const parameterOption = scopeResearchOptionByValue(STRATEGY.scope.parameterOptions, draft.parameterKey);
                  return (
                    <div
                      key={`scope-grid-${panel.key}`}
                      className={clsx("min-w-0 rounded-2xl p-3", SCANNER_PANEL_SURFACE, scopeFullscreenPanel && "flex h-[calc(100vh-7rem)] flex-col overflow-hidden")}
                    >
                      <div className={clsx("space-y-3", scopeFullscreenPanel && "flex h-full flex-col")}>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className={clsx("flex items-center gap-2 px-3 h-8 rounded-lg", SCANNER_PANEL_SURFACE)}>
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">Rows</span>
                            <span className="text-[10px] font-mono text-emerald-300">{intn(computed?.sourceCount ?? 0)}</span>
                          </div>
                          <div className="flex h-7 flex-wrap items-center gap-2 rounded-lg bg-black/20">
                            {([
                              { key: "results_by_bins", label: "bins" },
                              { key: "results_more_less_parameter", label: "more/less" },
                              { key: "simple_box", label: "simplebox" },
                              { key: "beauty_violin", label: "violin" },
                              { key: "distribution", label: "distribution" },
                              { key: "scatter_by_date", label: "scatter" },
                              { key: "cumsum_chart", label: "cumsum" },
                              { key: "trade_performance", label: "performance" },
                            ] as Array<{ key: ScopeResearchChartType; label: string }>).map((mode) => (
                              <button
                                key={`scope-mode-${panel.key}-${mode.key}`}
                                type="button"
                                onClick={() =>
                                  setScopeResearchDrafts((prev) => ({
                                    ...prev,
                                    [panel.key]: {
                                      ...prev[panel.key],
                                      chartType: mode.key,
                                      resultKey: STRATEGY.scope.normalizeResultKey(mode.key, prev[panel.key].resultKey),
                                    },
                                  }))
                                }
                              className={clsx(
                                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                                  draft.chartType === mode.key
                                    ? "accent-soft"
                                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                                )}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setScopeFullscreenPanel((prev) => (prev === panel.key ? null : panel.key))}
                              className={clsx(
                                "w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95",
                                SCANNER_PANEL_SURFACE,
                                "accent-outline"
                              )}
                              title={scopeFullscreenPanel === panel.key ? `Close ${panel.label} fullscreen` : `Open ${panel.label} fullscreen`}
                              aria-label={scopeFullscreenPanel === panel.key ? `Close ${panel.label} fullscreen` : `Open ${panel.label} fullscreen`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {scopeFullscreenPanel === panel.key ? (
                                  <>
                                    <polyline points="9 3 3 3 3 9" />
                                    <polyline points="15 21 21 21 21 15" />
                                    <line x1="3" y1="3" x2="10" y2="10" />
                                    <line x1="21" y1="21" x2="14" y2="14" />
                                  </>
                                ) : (
                                  <>
                                    <polyline points="15 3 21 3 21 9" />
                                    <polyline points="9 21 3 21 3 15" />
                                    <line x1="21" y1="3" x2="14" y2="10" />
                                    <line x1="3" y1="21" x2="10" y2="14" />
                                  </>
                                )}
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setScopeResearchSelections((prev) => ({
                                  ...prev,
                                  [panel.key]: buildScopeResearchSelectionFromDraft(draft, STRATEGY.scope),
                                }))
                              }
                              className={clsx(
                                "w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95",
                                SCANNER_PANEL_SURFACE,
                                "accent-outline"
                              )}
                              title={`Apply ${panel.label}`}
                              aria-label={`Apply ${panel.label}`}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                                <polyline points="21 3 21 9 15 9" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 min-w-0">
                            <div className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Param</div>
                            <GlassSelect
                              value={draft.parameterKey}
                              onChange={(e) =>
                                setScopeResearchDrafts((prev) => ({
                                  ...prev,
                                  [panel.key]: { ...prev[panel.key], parameterKey: e.target.value as ScopeResearchParameterKey },
                                }))
                              }
                              options={STRATEGY.scope.parameterSelectGroups}
                              className="min-w-0 w-[148px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent text-right"
                            />
                          </div>
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20 min-w-0">
                            <div className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Result</div>
                            <GlassSelect
                              value={draft.resultKey}
                              onChange={(e) =>
                                setScopeResearchDrafts((prev) => ({
                                  ...prev,
                                  [panel.key]: { ...prev[panel.key], resultKey: e.target.value as ScopeResearchResultKey },
                                }))
                              }
                              options={STRATEGY.scope.resultOptionsForChart(draft.chartType).map((option) => ({ value: option.value, label: option.label }))}
                              className="min-w-0 w-[148px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent text-right"
                            />
                          </div>
                          <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Bins</div>
                            <div className="group relative h-7 w-[72px] overflow-hidden rounded-md">
                              <input
                                type="number"
                                min={3}
                                max={24}
                                step={1}
                                value={draft.bucketCount}
                                onChange={(e) =>
                                  setScopeResearchDrafts((prev) => ({
                                    ...prev,
                                    [panel.key]: { ...prev[panel.key], bucketCount: Math.max(3, Math.min(24, Math.trunc(Number(e.target.value) || 8))) },
                                  }))
                                }
                                className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                              />
                              <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setScopeResearchDrafts((prev) => ({
                                      ...prev,
                                      [panel.key]: { ...prev[panel.key], bucketCount: Math.max(3, Math.min(24, (prev[panel.key].bucketCount ?? 8) + 1)) },
                                    }))
                                  }
                                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                  aria-label="Increase bins"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setScopeResearchDrafts((prev) => ({
                                      ...prev,
                                      [panel.key]: { ...prev[panel.key], bucketCount: Math.max(3, Math.min(24, (prev[panel.key].bucketCount ?? 8) - 1)) },
                                    }))
                                  }
                                  className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                  aria-label="Decrease bins"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Min N</div>
                            <div className="group relative h-7 w-[72px] overflow-hidden rounded-md">
                              <input
                                type="number"
                                min={1}
                                max={5000}
                                step={1}
                                value={draft.minSamples}
                                onChange={(e) =>
                                  setScopeResearchDrafts((prev) => ({
                                    ...prev,
                                    [panel.key]: { ...prev[panel.key], minSamples: Math.max(1, Math.trunc(Number(e.target.value) || 1)) },
                                  }))
                                }
                                className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                              />
                              <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setScopeResearchDrafts((prev) => ({
                                      ...prev,
                                      [panel.key]: { ...prev[panel.key], minSamples: Math.max(1, Math.min(5000, (prev[panel.key].minSamples ?? 1) + 1)) },
                                    }))
                                  }
                                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                  aria-label="Increase min samples"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setScopeResearchDrafts((prev) => ({
                                      ...prev,
                                      [panel.key]: { ...prev[panel.key], minSamples: Math.max(1, Math.min(5000, (prev[panel.key].minSamples ?? 1) - 1)) },
                                    }))
                                  }
                                  className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                  aria-label="Decrease min samples"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">From</div>
                            <GlassInput
                              type="number"
                              step={0.01}
                              width={88}
                              value={draft.domainFrom}
                              onChange={(e) =>
                                setScopeResearchDrafts((prev) => ({
                                  ...prev,
                                  [panel.key]: { ...prev[panel.key], domainFrom: e.target.value },
                                }))
                              }
                              placeholder={bounds.min != null ? scopeResearchFormatValue(bounds.min, parameterOption.format) : "min"}
                              className="!h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent text-right"
                            />
                          </div>
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">To</div>
                            <GlassInput
                              type="number"
                              step={0.01}
                              width={88}
                              value={draft.domainTo}
                              onChange={(e) =>
                                setScopeResearchDrafts((prev) => ({
                                  ...prev,
                                  [panel.key]: { ...prev[panel.key], domainTo: e.target.value },
                                }))
                              }
                              placeholder={bounds.max != null ? scopeResearchFormatValue(bounds.max, parameterOption.format) : "max"}
                              className="!h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent text-right"
                            />
                          </div>
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Cut</div>
                            <GlassSelect
                              value={draft.thresholdMode}
                              onChange={(e) =>
                                setScopeResearchDrafts((prev) => ({
                                  ...prev,
                                  [panel.key]: { ...prev[panel.key], thresholdMode: e.target.value as ScopeResearchThresholdMode },
                                }))
                              }
                              options={[
                                { value: "more_than", label: ">= x" },
                                { value: "less_than", label: "<= x" },
                              ]}
                              className={clsx(
                                "min-w-[92px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent text-right",
                                draft.chartType !== "results_more_less_parameter" && "opacity-60"
                              )}
                            />
                          </div>
                          <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Range</div>
                            <div className="text-[10px] font-mono text-zinc-400 text-right truncate">
                              {bounds.min != null && bounds.max != null
                                ? `range ${scopeResearchFormatValue(bounds.min, parameterOption.format)} .. ${scopeResearchFormatValue(bounds.max, parameterOption.format)}`
                                : "no observed values"}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-2.5">
                          <div className={clsx("flex items-center justify-between gap-2", !scopeResearchFiltersHidden[panel.key].extra && draft.extraFilters.length && "mb-2")}>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Extra Filters</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setScopeResearchFiltersHidden((prev) => ({
                                    ...prev,
                                    [panel.key]: { ...prev[panel.key], extra: !prev[panel.key].extra },
                                  }))
                                }
                                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
                                title={scopeResearchFiltersHidden[panel.key].extra ? "Show extra filter rows" : "Hide extra filter rows"}
                              >
                                <EyeToggleIcon closed={!scopeResearchFiltersHidden[panel.key].extra} className={!scopeResearchFiltersHidden[panel.key].extra ? "group-hover:text-rose-400 transition-colors" : undefined} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setScopeResearchDrafts((prev) => ({
                                    ...prev,
                                    [panel.key]: {
                                      ...prev[panel.key],
                                      extraFilters: [
                                        ...prev[panel.key].extraFilters,
                                        {
                                          id: `${panel.key}-${Date.now()}-${prev[panel.key].extraFilters.length}`,
                                          parameterKey: "rating",
                                          from: "",
                                          to: "",
                                        },
                                      ],
                                    },
                                  }))
                                }
                                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[13px] font-mono text-zinc-300 hover:bg-white/10 transition-colors leading-none"
                                title="Add extra filter"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {!scopeResearchFiltersHidden[panel.key].extra && draft.extraFilters.length ? (
                            <div className="space-y-2">
                              {draft.extraFilters.map((filter) => (
                                <div key={filter.id} className="space-y-2">
                                  <div>
                                    <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">Param</div>
                                    <GlassSelect
                                      value={filter.parameterKey}
                                      onChange={(e) =>
                                        setScopeResearchDrafts((prev) => ({
                                          ...prev,
                                          [panel.key]: {
                                            ...prev[panel.key],
                                            extraFilters: prev[panel.key].extraFilters.map((item) =>
                                              item.id === filter.id
                                                ? { ...item, parameterKey: e.target.value as ScopeResearchParameterKey }
                                                : item
                                            ),
                                          },
                                        }))
                                      }
                                      options={STRATEGY.scope.parameterSelectGroups}
                                      className="w-full"
                                    />
                                  </div>
                                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2 items-end">
                                    <div>
                                      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">From</div>
                                      <GlassInput
                                        type="number"
                                        step={0.01}
                                        width="100%"
                                        value={filter.from ?? ""}
                                        onChange={(e) =>
                                          setScopeResearchDrafts((prev) => ({
                                            ...prev,
                                            [panel.key]: {
                                              ...prev[panel.key],
                                              extraFilters: prev[panel.key].extraFilters.map((item) =>
                                                item.id === filter.id ? { ...item, from: e.target.value } : item
                                              ),
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">To</div>
                                      <GlassInput
                                        type="number"
                                        step={0.01}
                                        width="100%"
                                        value={filter.to ?? ""}
                                        onChange={(e) =>
                                          setScopeResearchDrafts((prev) => ({
                                            ...prev,
                                            [panel.key]: {
                                              ...prev[panel.key],
                                              extraFilters: prev[panel.key].extraFilters.map((item) =>
                                                item.id === filter.id ? { ...item, to: e.target.value } : item
                                              ),
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setScopeResearchDrafts((prev) => ({
                                          ...prev,
                                          [panel.key]: {
                                            ...prev[panel.key],
                                            extraFilters: prev[panel.key].extraFilters.filter((item) => item.id !== filter.id),
                                          },
                                        }))
                                      }
                                      className="h-8 rounded-lg border border-rose-500/20 bg-rose-500/8 text-rose-300 hover:bg-rose-500/14 text-[12px] font-mono"
                                      title="Remove filter"
                                    >
                                      x
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-2.5">
                          <div className={clsx("flex items-center justify-between gap-2", !scopeResearchFiltersHidden[panel.key].parallel && draft.parallelFilters.length && "mb-2")}>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Parallel Filters</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setScopeResearchFiltersHidden((prev) => ({
                                    ...prev,
                                    [panel.key]: { ...prev[panel.key], parallel: !prev[panel.key].parallel },
                                  }))
                                }
                                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
                                title={scopeResearchFiltersHidden[panel.key].parallel ? "Show parallel filter rows" : "Hide parallel filter rows"}
                              >
                                <EyeToggleIcon closed={!scopeResearchFiltersHidden[panel.key].parallel} className={!scopeResearchFiltersHidden[panel.key].parallel ? "group-hover:text-rose-400 transition-colors" : undefined} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setScopeResearchDrafts((prev) => ({
                                    ...prev,
                                    [panel.key]: {
                                      ...prev[panel.key],
                                      parallelFilters: [
                                        ...prev[panel.key].parallelFilters,
                                        {
                                          id: `${panel.key}-parallel-${Date.now()}-${prev[panel.key].parallelFilters.length}`,
                                          parameterKey: "rating",
                                          from: "",
                                          to: "",
                                        },
                                      ],
                                    },
                                  }))
                                }
                                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[13px] font-mono text-zinc-300 hover:bg-white/10 transition-colors leading-none"
                                title="Add parallel filter"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {!scopeResearchFiltersHidden[panel.key].parallel && draft.parallelFilters.length ? (
                            <div className="space-y-2">
                              {draft.parallelFilters.map((filter) => (
                                <div key={filter.id} className="space-y-2">
                                  <div>
                                    <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">Param</div>
                                    <GlassSelect
                                      value={filter.parameterKey}
                                      onChange={(e) =>
                                        setScopeResearchDrafts((prev) => ({
                                          ...prev,
                                          [panel.key]: {
                                            ...prev[panel.key],
                                            parallelFilters: prev[panel.key].parallelFilters.map((item) =>
                                              item.id === filter.id
                                                ? { ...item, parameterKey: e.target.value as ScopeResearchParameterKey }
                                                : item
                                            ),
                                          },
                                        }))
                                      }
                                      options={STRATEGY.scope.parameterSelectGroups}
                                      className="w-full"
                                    />
                                  </div>
                                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2 items-end">
                                    <div>
                                      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">From</div>
                                      <GlassInput
                                        type="number"
                                        step={0.01}
                                        width="100%"
                                        value={filter.from ?? ""}
                                        onChange={(e) =>
                                          setScopeResearchDrafts((prev) => ({
                                            ...prev,
                                            [panel.key]: {
                                              ...prev[panel.key],
                                              parallelFilters: prev[panel.key].parallelFilters.map((item) =>
                                                item.id === filter.id ? { ...item, from: e.target.value } : item
                                              ),
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-mono mb-1">To</div>
                                      <GlassInput
                                        type="number"
                                        step={0.01}
                                        width="100%"
                                        value={filter.to ?? ""}
                                        onChange={(e) =>
                                          setScopeResearchDrafts((prev) => ({
                                            ...prev,
                                            [panel.key]: {
                                              ...prev[panel.key],
                                              parallelFilters: prev[panel.key].parallelFilters.map((item) =>
                                                item.id === filter.id ? { ...item, to: e.target.value } : item
                                              ),
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setScopeResearchDrafts((prev) => ({
                                          ...prev,
                                          [panel.key]: {
                                            ...prev[panel.key],
                                            parallelFilters: prev[panel.key].parallelFilters.filter((item) => item.id !== filter.id),
                                          },
                                        }))
                                      }
                                      className="h-8 rounded-lg border border-rose-500/20 bg-rose-500/8 text-rose-300 hover:bg-rose-500/14 text-[12px] font-mono"
                                      title="Remove parallel filter"
                                    >
                                      x
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        </div>
                      </div>

                      {computed && hasVisualScopeLoaded ? (
                        <div className={clsx("mt-3 min-w-0", scopeFullscreenPanel ? "h-[calc(100vh-26rem)] min-h-[420px] flex-none" : "")}>
                          {computed.selection.chartType === "simple_box" ? (
                            <ScopeResearchBoxChart rows={computed.bins} title="simple_box" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : computed.selection.chartType === "beauty_violin" ? (
                            <ScopeResearchViolinChart rows={computed.bins} title="beauty_violin" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : computed.selection.chartType === "distribution" ? (
                            <ScopeResearchDistributionChart points={computed.points} title="distribution" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : computed.selection.chartType === "scatter_by_date" ? (
                            <ScopeResearchScatterByDateChart points={computed.points} parallelSeries={computed.parallelPointSeries} title="scatter_by_date" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} parameterFormat={computed.parameter.format} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : computed.selection.chartType === "cumsum_chart" ? (
                            <ScopeResearchCumsumChart points={computed.points} parallelSeries={computed.parallelPointSeries} title="cumsum_chart" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : computed.selection.chartType === "trade_performance" ? (
                            <ScopeResearchTradePerformanceChart points={computed.points} parallelSeries={computed.parallelPointSeries} title="trade_performance" meta={`${computed.parameter.label} vs ${computed.sourceResult.label}`} resultFormat={computed.sourceResult.format} fullscreen={scopeFullscreenPanel === panel.key} />
                          ) : (
                            <ScopeResearchSeriesChart
                              rows={computed.selection.chartType === "results_more_less_parameter" ? computed.thresholds : computed.bins}
                              parallelSeries={computed.parallelSeries}
                              title={computed.selection.chartType === "results_more_less_parameter" ? "results_more_less_parameter" : "results_by_bins"}
                              meta={`${computed.parameter.label} vs ${computed.result.label}`}
                              resultKey={computed.selection.resultKey}
                              resultFormat={computed.result.format}
                              accent={computed.selection.chartType === "results_more_less_parameter" ? "amber" : "emerald"}
                              fullscreen={scopeFullscreenPanel === panel.key}
                            />
                          )}
                        </div>
                      ) : hasVisualScopeLoaded ? (
                        <div className={clsx("rounded-xl border border-white/[0.08] bg-[#070707]/95 p-6 text-center text-zinc-500 text-xs font-mono mt-3", scopeFullscreenPanel && "h-[calc(100vh-26rem)] min-h-[420px] flex items-center justify-center")}>
                          Pick a view and press `Apply {panel.label}`.
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="hidden">

              <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-3 mb-4">
                <div className="grid grid-cols-1 2xl:grid-cols-[auto_auto_auto_auto_auto_auto_auto_1fr_auto] gap-2.5 items-center">
                  <div className="flex items-center gap-2">
                    {([
                      { key: "results_by_bins", label: "bins" },
                      { key: "results_more_less_parameter", label: "more/less" },
                      { key: "simple_box", label: "simplebox" },
                      { key: "beauty_violin", label: "violin" },
                      { key: "distribution", label: "distribution" },
                      { key: "scatter_by_date", label: "scatter" },
                      { key: "cumsum_chart", label: "cumsum" },
                      { key: "trade_performance", label: "performance" },
                    ] as Array<{ key: ScopeResearchChartType; label: string }>).map((mode) => (
                      <button
                        key={`scope-mode-${mode.key}`}
                        type="button"
                        onClick={() => {
                          setScopeResearchChartType(mode.key);
                          setScopeResearchResultKey(STRATEGY.scope.normalizeResultKey(mode.key, scopeResearchResultKey));
                        }}
                        className={clsx(
                          "h-8 px-3 rounded-lg border whitespace-nowrap leading-none transition-all text-[10px] font-mono uppercase",
                          scopeResearchChartType === mode.key
                            ? "accent-soft"
                            : "border-white/5 bg-black/20 text-zinc-500 hover:text-zinc-200 hover:border-white/10"
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Param</div>
                    <GlassSelect
                      value={scopeResearchParameterKey}
                      onChange={(e) => setScopeResearchParameterKey(e.target.value as ScopeResearchParameterKey)}
                      options={STRATEGY.scope.parameterSelectGroups}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Result</div>
                    <GlassSelect
                      value={scopeResearchResultKey}
                      onChange={(e) => setScopeResearchResultKey(e.target.value as ScopeResearchResultKey)}
                      options={STRATEGY.scope.resultOptionsForChart(scopeResearchChartType).map((option) => ({ value: option.value, label: option.label }))}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Bins</div>
                    <GlassInput
                      type="number"
                      min={3}
                      max={24}
                      step={1}
                      width={68}
                      value={scopeResearchBucketCount}
                      onChange={(e) => setScopeResearchBucketCount(Math.max(3, Math.min(24, Math.trunc(Number(e.target.value) || 8))))}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Min N</div>
                    <GlassInput
                      type="number"
                      min={1}
                      max={5000}
                      step={1}
                      width={76}
                      value={scopeResearchMinSamples}
                      onChange={(e) => setScopeResearchMinSamples(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">From</div>
                    <GlassInput
                      type="number"
                      step={0.01}
                      value={scopeResearchDomainFrom}
                      onChange={(e) => setScopeResearchDomainFrom(e.target.value)}
                      width={84}
                      placeholder={scopeResearchObservedBounds.min != null ? scopeResearchFormatValue(scopeResearchObservedBounds.min, scopeResearchOptionByValue(STRATEGY.scope.parameterOptions, scopeResearchParameterKey).format) : "min"}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">To</div>
                    <GlassInput
                      type="number"
                      step={0.01}
                      value={scopeResearchDomainTo}
                      onChange={(e) => setScopeResearchDomainTo(e.target.value)}
                      width={84}
                      placeholder={scopeResearchObservedBounds.max != null ? scopeResearchFormatValue(scopeResearchObservedBounds.max, scopeResearchOptionByValue(STRATEGY.scope.parameterOptions, scopeResearchParameterKey).format) : "max"}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-600">
                    {scopeResearchObservedBounds.min != null && scopeResearchObservedBounds.max != null
                      ? `range ${scopeResearchFormatValue(scopeResearchObservedBounds.min, scopeResearchOptionByValue(STRATEGY.scope.parameterOptions, scopeResearchParameterKey).format)} .. ${scopeResearchFormatValue(scopeResearchObservedBounds.max, scopeResearchOptionByValue(STRATEGY.scope.parameterOptions, scopeResearchParameterKey).format)}`
                      : "Detached from optimizer."}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScopeResearchSelection(buildScopeResearchSelectionFromDraft(scopeResearchDrafts.left, STRATEGY.scope))}
                    className="px-3 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] text-zinc-100 hover:bg-white/[0.07] text-[10px] font-mono font-bold uppercase tracking-[0.16em] transition-all"
                  >
                    Apply
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Cut</div>
                    <GlassSelect
                      value={scopeResearchThresholdMode}
                      onChange={(e) => setScopeResearchThresholdMode(e.target.value as ScopeResearchThresholdMode)}
                      options={[
                        { value: "more_than", label: ">= x" },
                        { value: "less_than", label: "<= x" },
                      ]}
                      className={clsx(scopeResearchChartType !== "results_more_less_parameter" && "opacity-60")}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-600">
                    `results_by_bins`, `results_more_less_parameter`, `simple_box`, `beauty_violin`, `distribution`, `scatter_by_date`, `cumsum_chart`, `trade_performance`.
                  </div>
                </div>
              </div>

              {scopeResearchComputed ? (
                <>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                    <GlassCard className="p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-zinc-500">ROWS</div>
                      <div className="text-sm font-mono mt-1">{intn(scopeResearchComputed.sourceCount)}</div>
                    </GlassCard>
                    <GlassCard className="p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-zinc-500">GROUPS</div>
                      <div className="text-sm font-mono mt-1">
                        {intn(
                          scopeResearchComputed.selection.chartType === "results_more_less_parameter"
                            ? scopeResearchComputed.thresholds.length
                            : scopeResearchComputed.selection.chartType === "scatter_by_date" ||
                                scopeResearchComputed.selection.chartType === "cumsum_chart"
                              ? scopeResearchComputed.points.length
                              : scopeResearchComputed.bins.length
                        )}
                      </div>
                    </GlassCard>
                    <GlassCard className="p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-zinc-500">BEST</div>
                      <div className="text-sm font-mono mt-1 break-words">
                        {scopeResearchComputed.selection.chartType === "results_more_less_parameter"
                          ? scopeResearchComputed.bestThreshold?.label ?? "-"
                          : scopeResearchComputed.selection.chartType === "simple_box"
                            ? scopeResearchComputed.bestBox?.label ?? "-"
                            : scopeResearchComputed.selection.chartType === "cumsum_chart"
                              ? scopeResearchComputed.points[scopeResearchComputed.points.length - 1]?.dateKey ?? "-"
                              : scopeResearchComputed.selection.chartType === "scatter_by_date"
                                ? `${scopeResearchComputed.points[0]?.dateKey ?? "-"} .. ${
                                    scopeResearchComputed.points[scopeResearchComputed.points.length - 1]?.dateKey ?? "-"
                                  }`
                                : scopeResearchComputed.bestBin?.label ?? "-"}
                      </div>
                    </GlassCard>
                    <GlassCard className="p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-zinc-500">VALUE</div>
                      <div className="text-sm font-mono mt-1 text-emerald-300">
                        {scopeResearchComputed.selection.chartType === "results_more_less_parameter"
                          ? scopeResearchFormatValue(
                              scopeResearchMetricValue(
                                scopeResearchComputed.bestThreshold ?? scopeResearchSummarize([]),
                                scopeResearchComputed.selection.resultKey
                              ),
                              scopeResearchComputed.result.format
                            )
                          : scopeResearchComputed.selection.chartType === "cumsum_chart"
                            ? scopeResearchFormatValue(
                                scopeResearchComputed.points.reduce((sum, point) => sum + point.result, 0),
                                scopeResearchComputed.sourceResult.format
                              )
                            : scopeResearchComputed.selection.chartType === "scatter_by_date"
                              ? scopeResearchFormatValue(
                                  scopeResearchComputed.points.reduce((sum, point) => sum + point.result, 0) /
                                    Math.max(1, scopeResearchComputed.points.length),
                                  scopeResearchComputed.sourceResult.format
                                )
                              : scopeResearchFormatValue(
                                  scopeResearchComputed.selection.chartType === "simple_box"
                                    ? scopeResearchMetricValue(
                                        scopeResearchComputed.bestBox ?? scopeResearchSummarize([]),
                                        scopeResearchComputed.selection.resultKey
                                      )
                                    : scopeResearchMetricValue(
                                        scopeResearchComputed.bestBin ?? scopeResearchSummarize([]),
                                        scopeResearchComputed.selection.resultKey
                                      ),
                                  scopeResearchComputed.result.format
                                )}
                      </div>
                    </GlassCard>
                  </div>

                  <div className="mb-3 rounded-xl border border-white/[0.08] bg-[#070910]/95 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                      <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-300">
                        {scopeResearchComputed.selection.chartType}
                      </span>
                      <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400">
                        {scopeResearchComputed.parameter.label}
                      </span>
                      <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400">
                        {scopeResearchComputed.result.label}
                      </span>
                      <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                        bins {intn(scopeResearchComputed.selection.bucketCount)}
                      </span>
                      <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                        min {intn(scopeResearchComputed.selection.minSamples)}
                      </span>
                      {(scopeResearchComputed.selection.domainFrom != null || scopeResearchComputed.selection.domainTo != null) && (
                        <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                          {scopeResearchComputed.selection.domainFrom != null
                            ? scopeResearchFormatValue(scopeResearchComputed.selection.domainFrom, scopeResearchComputed.parameter.format)
                            : "*"}{" "}
                          ..{" "}
                          {scopeResearchComputed.selection.domainTo != null
                            ? scopeResearchFormatValue(scopeResearchComputed.selection.domainTo, scopeResearchComputed.parameter.format)
                            : "*"}
                        </span>
                      )}
                      {scopeResearchComputed.selection.chartType === "results_more_less_parameter" && (
                        <span className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                          {scopeResearchComputed.selection.thresholdMode === "more_than" ? ">= x" : "<= x"}
                        </span>
                      )}
                    </div>
                  </div>

                  {scopeResearchComputed.selection.chartType === "simple_box" ? (
                    <ScopeResearchBoxChart
                      rows={scopeResearchComputed.bins}
                      title="simple_box"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : scopeResearchComputed.selection.chartType === "beauty_violin" ? (
                    <ScopeResearchViolinChart
                      rows={scopeResearchComputed.bins}
                      title="beauty_violin"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : scopeResearchComputed.selection.chartType === "distribution" ? (
                    <ScopeResearchDistributionChart
                      points={scopeResearchComputed.points}
                      title="distribution"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : scopeResearchComputed.selection.chartType === "scatter_by_date" ? (
                    <ScopeResearchScatterByDateChart
                      points={scopeResearchComputed.points}
                      parallelSeries={scopeResearchComputed.parallelPointSeries}
                      title="scatter_by_date"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      parameterFormat={scopeResearchComputed.parameter.format}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : scopeResearchComputed.selection.chartType === "cumsum_chart" ? (
                    <ScopeResearchCumsumChart
                      points={scopeResearchComputed.points}
                      parallelSeries={scopeResearchComputed.parallelPointSeries}
                      title="cumsum_chart"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : scopeResearchComputed.selection.chartType === "trade_performance" ? (
                    <ScopeResearchTradePerformanceChart
                      points={scopeResearchComputed.points}
                      parallelSeries={scopeResearchComputed.parallelPointSeries}
                      title="trade_performance"
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.sourceResult.label}`}
                      resultFormat={scopeResearchComputed.sourceResult.format}
                    />
                  ) : (
                    <ScopeResearchSeriesChart
                      rows={
                        scopeResearchComputed.selection.chartType === "results_more_less_parameter"
                          ? scopeResearchComputed.thresholds
                          : scopeResearchComputed.bins
                      }
                      title={
                        scopeResearchComputed.selection.chartType === "results_more_less_parameter"
                          ? "results_more_less_parameter"
                          : "results_by_bins"
                      }
                      meta={`${scopeResearchComputed.parameter.label} vs ${scopeResearchComputed.result.label}`}
                      resultKey={scopeResearchComputed.selection.resultKey}
                      resultFormat={scopeResearchComputed.result.format}
                      accent={scopeResearchComputed.selection.chartType === "results_more_less_parameter" ? "amber" : "emerald"}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-[#070707]/95 p-6 text-center text-zinc-500 text-xs font-mono">
                  Pick a view and press `Apply`.
                </div>
              )}
              </div>
            </div>

          </div>
        )}

        {primaryPanel === "scanner" && (tab === "analytics" || (isStreamOnlyShell && tab === "episodes")) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                OPENDOOR SNAPSHOT | live tape replay | {dateFrom}{dateFrom !== dateTo ? ` → ${dateTo}` : ""} | {openDoorExitClass} exit
              </div>
              {openDoorSnapshotLoading && <span className="text-[10px] text-zinc-600 font-mono">building…</span>}
              {openDoorSnapshotError && <span className="text-[10px] text-rose-400 font-mono">{openDoorSnapshotError}</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryMetricCard
                label="TOTAL PNL ($)"
                value={num(openDoorSnapshotStats.totalPnl, 2)}
                className="xl:row-span-2 xl:min-h-[124px]"
                valueClassName={
                  clsx(
                    "text-4xl md:text-6xl font-bold",
                    openDoorSnapshotStats.totalPnl > 0
                      ? "text-[#6ee7b7]"
                      : openDoorSnapshotStats.totalPnl < 0
                        ? SOFT_LOSS_TEXT_CLASS
                        : "text-zinc-200"
                  )
                }
              />
              <SummaryMetricCard label="TRADES" value={intn(openDoorSnapshotStats.trades)} inline />
              <SummaryMetricCard label="WIN RATE" value={`${num(openDoorSnapshotStats.winRate * 100, 1)}%`} inline />
              <SummaryMetricCard
                label="AVG TRADE ($)"
                value={num(openDoorSnapshotStats.avgTrade, 2)}
                inline
                valueClassName={openDoorSnapshotStats.avgTrade > 0 ? "text-emerald-300" : openDoorSnapshotStats.avgTrade < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="MAX WIN ($)"
                value={num(openDoorSnapshotStats.maxWin, 2)}
                inline
                valueClassName={openDoorSnapshotStats.maxWin > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG WIN ($)"
                value={num(openDoorSnapshotStats.avgWin, 2)}
                inline
                valueClassName={openDoorSnapshotStats.avgWin > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard label="PROFIT FACTOR" value={Number.isFinite(openDoorSnapshotStats.profitFactor) ? num(openDoorSnapshotStats.profitFactor, 2) : "∞"} inline />
              <SummaryMetricCard label="EXPECTANCY ($)" value={num(openDoorSnapshotStats.expectancy, 2)} inline />
              <SummaryMetricCard
                label="MAX LOSS ($)"
                value={num(openDoorSnapshotStats.maxLoss, 2)}
                inline
                valueClassName={openDoorSnapshotStats.maxLoss < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG LOSS ($)"
                value={num(openDoorSnapshotStats.avgLoss, 2)}
                inline
                valueClassName={openDoorSnapshotStats.avgLoss < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
            </div>

            {/* Equity curve, the one Arbitrage chart that carries over to this strategy.
              *
              * Arbitrage renders four more here (START VS END BY TIME, START EVENTS BY TIME, PEAK
              * STRENGTH, PEAK REVERSION 2/3). None of them can say anything about an OpenDoor trade:
              * measured over 21 days / 13,958 episodes the entry is ALWAYS minuteIdx 560 (09:20) and
              * the exit always 580/581 (10m) or 600 (30m), so both time charts collapse to a single
              * bar, and startMetricAbs/peakMetricAbs are null on every row, which is why this
              * strategy already excludes those research axes in its descriptor.
              */}
            {(analyticsSummary.equityCurve?.length ?? 0) > 0 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="p-0">
                  <EquityChart
                    points={analyticsSummary.equityCurve}
                    title={`EQUITY CURVE | ${equityCurveMode}`}
                    meta={`points ${intn(analyticsSummary.equityCurve?.length ?? 0)} | situations ${intn(analyticsSummary.situations)} | trades ${intn(analyticsSummary.trades)}`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                  REALIZED TRADES | rows {openDoorSnapshotStats.rows.length} | size ${sizeValue}/trade
                </div>
              </div>

              <div className={clsx("overflow-auto rounded-xl", SCANNER_PANEL_SURFACE)}>
                <table className="min-w-[1100px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
                    <tr>
                      <th className="text-left p-2.5">Ticker</th>
                      <th className="text-left p-2.5">Side</th>
                      <th className="text-right p-2.5 border-l border-white/10">Entry Time</th>
                      <th className="text-right p-2.5">Exit Time</th>
                      <th className="text-right p-2.5 border-l border-white/10">Entry Fill</th>
                      <th className="text-right p-2.5">Exit Fill</th>
                      <th className="text-right p-2.5">Move (pts)</th>
                      <th className="text-right p-2.5">P&amp;L ($)</th>
                      <th className="text-right p-2.5 border-l border-white/10">DevSig</th>
                      <th className="text-right p-2.5">Bench</th>
                      <th className="text-right p-2.5 border-l border-white/10">Gate Rate×Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openDoorSnapshotStats.rows.map((r, i) => (
                      <tr
                        key={`${r.ticker}|${r.side}|${r.entryMinuteIdx}|${i}`}
                        className={clsx(
                          "border-t border-white/5 transition-colors",
                          i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                          "hover:bg-white/[0.03]"
                        )}
                      >
                        <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                        <td className={clsx("p-2.5 font-bold", r.side === "Long" ? "text-[#6ee7b7]" : "text-rose-400")}>{r.side}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300 border-l border-white/10">{minuteIdxToClockLabel(r.entryMinuteIdx)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxToClockLabel(r.exitMinuteIdx)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-200 border-l border-white/10">{num(r.entryStack ?? null, 3)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.exitStack ?? null, 3)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.move ?? null, 3)}</td>
                        <td
                          className={clsx(
                            "p-2.5 text-right tabular-nums font-bold",
                            (r.pnl ?? 0) > 0 ? "text-[#6ee7b7]" : (r.pnl ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"
                          )}
                        >
                          {num(r.pnl ?? null, 2)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-400 border-l border-white/10">{num(r.entryDevSig ?? null, 3)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-400">{num(r.entryBench ?? null, 3)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-500 border-l border-white/10">
                          {r.gateRate != null ? `${(r.gateRate * 100).toFixed(0)}%` : "—"}×{r.gateTotal ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {!openDoorSnapshotStats.rows.length && (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-zinc-500">
                          {openDoorSnapshotLoading ? "Building tape replay…" : "No realized trades for this date range/gates."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <ScannerTableStyles />
      </div>
      <ScannerThemeStyles />
    </div>
  );
}

