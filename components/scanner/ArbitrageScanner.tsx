"use client";

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { todayNyYmd } from "../../lib/time";
import { getToken } from "../../lib/authClient";
import { bridgeUrl, getBridgeBaseUrl } from "../../lib/bridgeBase";
import { useUi } from "../UiProvider";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND, SHARED_FILTER_PRESET_FIELDS, isSharedFilterPreset } from "../../lib/presets/sharedFilterPreset";
import { SHARED_FILTER_PRESETS_CHANGED_EVENT, deleteSharedFilterLocalPreset, getSharedFilterLocalPreset, listSharedFilterLocalPresets, saveSharedFilterLocalPreset } from "../../lib/presets/sharedFilterLocalPresets";
import type { PresetDto } from "../../types/presets";
import clsx from "clsx";

// =========================
// API base (Tape/Scope style)
// =========================
function apiUrl(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/")) pathAndQuery = `/${pathAndQuery}`;
  return bridgeUrl(pathAndQuery);
}

// =========================
// TYPES (Paper Arbitrage)
// =========================
type TabKey = "active" | "episodes" | "analytics";
type DateMode = "day" | "last" | "range";
type PaperListMode = "off" | "ignore" | "apply" | "pin";
type ZapUiMode = "off" | "zap" | "sigma" | "delta";
type SortDir = "asc" | "desc";
type EpisodeSortKey =
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

type PaperArbMetric = "SigmaZap" | "ZapPct";
type PaperArbSession = "BLUE" | "ARK" | "OPEN" | "INTRA" | "POST" | "NIGHT" | "GLOB";
type PaperArbCloseMode = "Active" | "Passive";
type PaperArbPnlMode = "RawOnly" | "Hedged";

// rating (best_params gates)
type PaperArbRatingBand = "BLUE" | "ARK" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
type PaperArbRatingType = "any" | "hard" | "soft";
type PaperArbRatingRule = {
  band: PaperArbRatingBand;
  minRate: number;
  minTotal: number;
};

type ScannerAccent = {
  selection: string;
  dot: string;
  activeButton: string;
  activeText: string;
  activeBorder: string;
  activeSoft: string;
  buttonBorder: string;
  outlineButton: string;
};

function getScannerAccent(theme?: string | null): ScannerAccent {
  switch (theme) {
    case "light":
      return {
        selection: "selection:bg-violet-400/30",
        dot: "bg-violet-600",
        activeButton: "border border-violet-400/55 text-violet-900 shadow-[0_0_12px_rgba(139,92,246,0.12)] bg-violet-200/55",
        activeText: "text-violet-900",
        activeBorder: "border-violet-400/28 bg-violet-200/30",
        activeSoft: "bg-violet-200/55 text-violet-900 border-violet-400/30 shadow-[0_0_10px_-3px_rgba(139,92,246,0.12)]",
        buttonBorder: "border-violet-400/30",
        outlineButton: "border-violet-300/55 text-violet-900 hover:bg-violet-200/40 shadow-[0_0_10px_rgba(139,92,246,0.06)]",
      };
    case "sparkle":
      return {
        selection: "selection:bg-yellow-200/35",
        dot: "bg-yellow-200",
        activeButton: "border border-yellow-200/70 text-yellow-200 shadow-[0_0_12px_rgba(254,240,138,0.18)] bg-yellow-200/8",
        activeText: "text-yellow-200",
        activeBorder: "border-yellow-200/28 bg-yellow-200/[0.05]",
        activeSoft: "bg-yellow-200/10 text-yellow-200 border-yellow-200/25 shadow-[0_0_10px_-3px_rgba(254,240,138,0.16)]",
        buttonBorder: "border-yellow-200/18",
        outlineButton: "border-yellow-200/35 text-yellow-200 hover:bg-yellow-200/10 shadow-[0_0_10px_rgba(254,240,138,0.08)]",
      };
    case "inferno":
      return {
        selection: "selection:bg-orange-300/35",
        dot: "bg-orange-300",
        activeButton: "border border-orange-300/80 text-orange-100 shadow-[0_0_16px_rgba(249,115,22,0.26)] bg-red-500/12",
        activeText: "text-orange-100",
        activeBorder: "border-orange-300/35 bg-red-500/[0.08]",
        activeSoft: "bg-red-500/14 text-orange-100 border-orange-300/35 shadow-[0_0_14px_-3px_rgba(249,115,22,0.22)]",
        buttonBorder: "border-orange-300/26",
        outlineButton: "border-orange-300/55 text-orange-100 hover:bg-red-500/14 shadow-[0_0_14px_rgba(249,115,22,0.14)]",
      };
    case "asher":
    case "rain":
      return {
        selection: "selection:bg-zinc-200/25",
        dot: "bg-zinc-300",
        activeButton: "border border-zinc-300/45 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.12)] bg-zinc-200/8",
        activeText: "text-zinc-200",
        activeBorder: "border-zinc-300/25 bg-zinc-200/[0.04]",
        activeSoft: "bg-zinc-200/10 text-zinc-200 border-zinc-300/20 shadow-[0_0_10px_-3px_rgba(212,212,216,0.1)]",
        buttonBorder: "border-zinc-300/18",
        outlineButton: "border-zinc-300/30 text-zinc-200 hover:bg-zinc-200/10 shadow-[0_0_10px_rgba(212,212,216,0.06)]",
      };
    case "neon":
      return {
        selection: "selection:bg-fuchsia-500/30",
        dot: "bg-fuchsia-500",
        activeButton: "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.3)] bg-fuchsia-500/10",
        activeText: "text-fuchsia-300",
        activeBorder: "border-fuchsia-500/30 bg-fuchsia-500/[0.05]",
        activeSoft: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20 shadow-[0_0_10px_-3px_rgba(217,70,239,0.2)]",
        buttonBorder: "border-fuchsia-500/20",
        outlineButton: "border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10 shadow-[0_0_10px_rgba(217,70,239,0.1)]",
      };
    case "space":
      return {
        selection: "selection:bg-sky-500/30",
        dot: "bg-sky-400",
        activeButton: "border border-sky-400 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.3)] bg-sky-400/10",
        activeText: "text-sky-200",
        activeBorder: "border-sky-400/30 bg-sky-400/[0.05]",
        activeSoft: "bg-sky-400/10 text-sky-200 border-sky-400/20 shadow-[0_0_10px_-3px_rgba(56,189,248,0.2)]",
        buttonBorder: "border-sky-400/20",
        outlineButton: "border-sky-400/50 text-sky-300 hover:bg-sky-400/10 shadow-[0_0_10px_rgba(56,189,248,0.1)]",
      };
    default:
      return {
        selection: "selection:bg-zinc-200/24",
        dot: "bg-zinc-300",
        activeButton: "border border-zinc-300 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.18)] bg-zinc-200/10",
        activeText: "text-zinc-200",
        activeBorder: "border-zinc-300/30 bg-zinc-200/[0.05]",
        activeSoft: "bg-zinc-200/10 text-zinc-200 border-zinc-300/20 shadow-[0_0_10px_-3px_rgba(212,212,216,0.12)]",
        buttonBorder: "border-zinc-300/20",
        outlineButton: "border-zinc-300/50 text-zinc-200 hover:bg-zinc-200/10 shadow-[0_0_10px_rgba(212,212,216,0.08)]",
      };
  }
}

function getScannerHeaderButtonActiveClass(theme?: string | null): string {
  if (theme === "sparkle") return "border border-yellow-200/70 text-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.2)] bg-yellow-200/10";
  if (theme === "inferno") return "border border-orange-300/80 text-orange-100 shadow-[0_0_14px_rgba(249,115,22,0.26)] bg-red-500/14";
  if (theme === "asher") return "border border-zinc-300/45 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.12)] bg-zinc-200/10";
  if (theme === "rain") return "border border-zinc-300/45 text-zinc-100 shadow-[0_0_10px_rgba(228,228,231,0.14)] bg-zinc-200/10";
  if (theme === "light") return "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.28)] bg-fuchsia-500/10";
  if (theme === "neon") return "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.28)] bg-fuchsia-500/10";
  if (theme === "space") return "border border-sky-500 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.28)] bg-sky-500/10";
  return "border border-zinc-300 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.18)] bg-zinc-200/10";
}

type TapeArbSide = "Long" | "Short" | number | string;

// Active snapshots are "Start/Peak/Last" with MinuteIdx + Metric + MetricAbs + (LastPrint fields)
type PaperArbSnap = {
  minuteIdx: number;
  metric?: number | null;
  metricAbs?: number | null;

  // LastPrint-only fields (may be present on Start/Peak/Last)
  lstPrcLstClsPct?: number | null;
  benchLstPrcLstClsPct?: number | null;
};

type PaperArbActiveRow = {
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;

  start: PaperArbSnap;
  peak: PaperArbSnap;
  last: PaperArbSnap;

  // config echoed back (optional but we show if present)
  closeMode?: PaperArbCloseMode;
  minHoldCandles?: number;
  startClass?: string | null;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
};

type PaperArbClosedDto = {
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

  closeMode?: PaperArbCloseMode;
  minHoldCandles?: number;

  rawPnlUsd?: number | null;
  benchPnlUsd?: number | null;
  hedgedPnlUsd?: number | null;
  totalPnlUsd?: number | null; // depends on pnlMode on server, but server returns it already
  rating?: number | null;
  ratingTotal?: number | null;

  adv20?: number | null;
  adv20NF?: number | null;
  adv90?: number | null;
  adv90NF?: number | null;
  avPreMhv?: number | null;
  roundLot?: number | null;
  vwap?: number | null;
  spread?: number | null;
  lstPrcL?: number | null;
  lstCls?: number | null;
  yCls?: number | null;
  tCls?: number | null;
  clsToClsPct?: number | null;
  lo?: number | null;
  newsCnt?: number | null;
  marketCapM?: number | null;
  preMktVolNF?: number | null;
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
  imbExch925?: number | null;
  imbExch1555?: number | null;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
};

// Big request: Analytics + EpisodesSearch
type PaperArbAnalyticsRequest = {
  dateFrom: string;
  dateTo: string;

  metric?: PaperArbMetric;
  startAbs?: number;
  usePrintMedianDelta?: boolean;
  startAbsMax?: number | null;
  endAbs?: number;
  session?: PaperArbSession;
  closeMode?: PaperArbCloseMode;
  minHoldCandles?: number;
  startCutoffMinuteIdx?: number | null;
  pnlMode?: PaperArbPnlMode;

  // rating rules
  ratingType?: PaperArbRatingType | string | null;
  ratingRules?: PaperArbRatingRule[] | null;
  ratingFilters?: any[] | null; // legacy/compat

  // lists
  tickers?: string[] | null;
  benchTickers?: string[] | null;
  side?: "Long" | "Short" | null;

  exchanges?: string[] | null;
  countries?: string[] | null;
  sectorsL3?: string[] | null;

  // ranges
  minTierBp?: number | null;
  maxTierBp?: number | null;

  minBeta?: number | null;
  maxBeta?: number | null;

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
  optimizerBucketCount?: number | null;
  optimizerGroups?: string[] | null;
  optimizerParameterKeys?: string[] | null;

  topN?: number;

  // priceMode intentionally omitted (server forces LastPrint)
};

type PaperArbEquityPointDto = {
  key: string; // "YYYY-MM-DD" or "YYYY-MM-DD minuteIdx"
  equity: number;
  pnl: number;
};

type PaperArbTickerStatsDto = {
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

type PaperArbAnalyticsResponse = {
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

type PaperArbOptimizerRangeBucketDto = {
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

type PaperArbOptimizerParameterDto = {
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

type PaperArbOptimizerRangesResponse = {
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

type EpisodeScanResult = {
  startAbs: number;
  endAbs: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
};

type OptimizerScenario = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  apply: (req: PaperArbAnalyticsRequest) => void;
};

type OptimizerResultRow = {
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

type ScopeBatchScenarioRequest = {
  id: string;
  parameter: string;
  variant: string;
  summary: string;
  request: PaperArbAnalyticsRequest;
};

type ScopeBatchResponse = {
  rows?: OptimizerResultRow[] | null;
  comboRows?: OptimizerResultRow[] | null;
};

type OptimizerImpactRow = {
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

type OptimizerRangeRankMetric = "avgPnlUsd" | "totalPnlUsd" | "winRate" | "score";
type OptimizerRangeGroupKey = "RATING GATES" | "ZAP THRESHOLDS" | "TAPE FILTERS";
type OptimizerRangeGroupStatus = { loading: boolean; error: string | null; partial: boolean };
type ScopeParameterDefinition = {
  key: string;
  label: string;
  group: OptimizerRangeGroupKey;
  scenarioParameter?: string | null;
};

type ScopeResearchChartType =
  | "simple_box"
  | "beauty_violin"
  | "results_by_bins"
  | "results_more_less_parameter"
  | "distribution"
  | "scatter_by_date"
  | "cumsum_chart"
  | "trade_performance";
type ScopeResearchThresholdMode = "less_than" | "more_than";
type ScopeResearchValueFormat = "number" | "currency" | "clock" | "minutes" | "percent";
type ScopeResearchParameterKey =
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
  | "rating"
  | "ratingTotal"
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
type ScopeResearchResultKey =
  | "avgPnlUsd"
  | "totalPnlUsd"
  | "winRate"
  | "score"
  | "rawPnlUsd"
  | "benchPnlUsd"
  | "hedgedPnlUsd"
  | "peakMetricAbs"
  | "endMetricAbs";
type ScopeResearchOption<T extends string> = {
  value: T;
  label: string;
  format: ScopeResearchValueFormat;
};
type GlassSelectOption = { value: string; label: string; disabled?: boolean };
type GlassSelectGroup = { label: string; options: GlassSelectOption[] };
type ScopeResearchExtraFilterSelection = {
  id: string;
  parameterKey: ScopeResearchParameterKey;
  from: number | null;
  to: number | null;
};
type ScopeResearchExtraFilterDraft = {
  id: string;
  parameterKey: ScopeResearchParameterKey;
  from: string;
  to: string;
};
type ScopeResearchParallelFilterSelection = ScopeResearchExtraFilterSelection;
type ScopeResearchParallelFilterDraft = ScopeResearchExtraFilterDraft;
type ScopeResearchSelection = {
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
type ScopeResearchDraft = Omit<ScopeResearchSelection, "domainFrom" | "domainTo"> & {
  domainFrom: string;
  domainTo: string;
  extraFilters: ScopeResearchExtraFilterDraft[];
  parallelFilters: ScopeResearchParallelFilterDraft[];
};
type ScopePanelKey = "left" | "right";
type ScopeResearchStats = {
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
type ScopeResearchBinRow = ScopeResearchStats & {
  label: string;
  from: number;
  to: number;
  values: number[];
};
type ScopeResearchThresholdRow = ScopeResearchStats & {
  label: string;
  threshold: number;
};
type ScopeResearchPoint = {
  row: PaperArbClosedDto;
  parameter: number;
  result: number;
  dateKey: string;
  sortKey: number;
};
type ScopeResearchComputed = {
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

type ScopeChartTooltipData = {
  x: number;
  y: number;
  title: string;
  lines: string[];
  accent?: "emerald" | "amber" | "cyan" | "fuchsia";
};

// =========================
// UTILS
// =========================
function isNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined) return "-";
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(digits);
}
function intn(x: number | null | undefined): string {
  if (x === null || x === undefined) return "-";
  if (!Number.isFinite(x)) return "-";
  return String(Math.trunc(x));
}
function minuteIdxToClockLabel(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  const idx = Math.trunc(x);
  const totalMin = idx; // absolute NY minute-of-day, e.g. 570 => 09:30
  const hh = Math.floor((((totalMin % 1440) + 1440) % 1440) / 60)
    .toString()
    .padStart(2, "0");
  const mm = ((((totalMin % 1440) + 1440) % 1440) % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
function clampInt(x: any, def = 0) {
  const v = Number(x);
  if (!Number.isFinite(v)) return def;
  return Math.trunc(v);
}
function clampNumber(x: any, def = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : def;
}
function splitList(s: string): string[] {
  return (s ?? "")
    .split(/[\s,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}
function splitListUpper(s: string): string[] {
  return splitList(s).map((x) => x.toUpperCase());
}
function normalizeTicker(raw: string): string | null {
  const tk = (raw || "").trim().toUpperCase().replace(/"/g, "");
  if (!tk) return null;
  if (!/^[A-Z0-9.\-]+$/.test(tk)) return null;
  return tk;
}
function parseTickersFromCsv(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];

  const detectDelim = (line: string) =>
    (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";

  const delim = detectDelim(lines[0]);
  const header = lines[0].split(delim).map((x) => x.trim().toLowerCase());
  const tickerIdx = header.findIndex((h) => h === "ticker");
  const start = tickerIdx !== -1 ? 1 : 0;

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((x) => x.trim());
    const raw = tickerIdx !== -1 ? parts[tickerIdx] : parts[0];
    const tk = normalizeTicker(raw || "");
    if (tk) out.push(tk);
  }
  return Array.from(new Set(out));
}
function tickerKey(x: string | null | undefined): string {
  return String(x ?? "").trim().toUpperCase();
}
function optNumOrNull(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const normalized = typeof v === "string" ? v.trim().replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function buildRangeValues(min: number, max: number, step: number): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const st = Math.max(0.0001, step);
  const out: number[] = [];
  for (let v = lo; v <= hi + st * 0.5; v += st) out.push(Number(v.toFixed(4)));
  return Array.from(new Set(out));
}

function normalizeSide(
  side: TapeArbSide
): { label: "Long" | "Short" | string; isLong: boolean | null } {
  if (side === 0) return { label: "Long", isLong: true };
  if (side === 1) return { label: "Short", isLong: false };
  const s = String(side ?? "").trim();
  const low = s.toLowerCase();
  if (low.includes("long")) return { label: "Long", isLong: true };
  if (low.includes("short")) return { label: "Short", isLong: false };
  return { label: s.length ? s : "-", isLong: null };
}

function passesDeltaZapGate(args: {
  side: TapeArbSide;
  metricAbs: number | null | undefined;
  deltaAbs: number | null | undefined;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
}) {
  const { side, metricAbs, deltaAbs, printMedianPos, printMedianNeg } = args;
  if (metricAbs == null || !Number.isFinite(metricAbs)) return false;
  if (deltaAbs == null || !Number.isFinite(deltaAbs)) return false;
  const sideInfo = normalizeSide(side);
  const FALLBACK_PRINT_MEDIAN = 0.1;
  if (sideInfo.isLong === true) {
    const threshold = Math.abs(printMedianNeg ?? FALLBACK_PRINT_MEDIAN) + Math.max(0, deltaAbs);
    return Math.abs(metricAbs) >= threshold;
  }
  if (sideInfo.isLong === false) {
    const threshold = Math.abs(printMedianPos ?? FALLBACK_PRINT_MEDIAN) + Math.max(0, deltaAbs);
    return Math.abs(metricAbs) >= threshold;
  }
  return false;
}

function toYmd(d: string) {
  // minimal client guard; server validates too
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

type SharedRangeFilterKey =
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

type SharedRangeFilterMode = "on" | "off";

const DEFAULT_SHARED_RANGE_FILTER_MODES: Record<SharedRangeFilterKey, SharedRangeFilterMode> = {
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

const SCOPE_RESEARCH_PARAMETER_OPTIONS: Array<ScopeResearchOption<ScopeResearchParameterKey>> = [
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
  { value: "rating", label: "Rating", format: "number" },
  { value: "ratingTotal", label: "Rating Total", format: "number" },
  { value: "adv20", label: "ADV20", format: "number" },
  { value: "adv20NF", label: "ADV20NF", format: "number" },
  { value: "adv90", label: "ADV90", format: "number" },
  { value: "adv90NF", label: "ADV90NF", format: "number" },
  { value: "avPreMhv", label: "AvPreMhv", format: "number" },
  { value: "roundLot", label: "RoundLot", format: "number" },
  { value: "vwap", label: "VWAP", format: "number" },
  { value: "spread", label: "Spread", format: "number" },
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

const SCOPE_RESEARCH_PARAMETER_SELECT_GROUPS: GlassSelectGroup[] = [
  {
    label: "OPTION FILTERS",
    options: SCOPE_RESEARCH_PARAMETER_OPTIONS.filter((option) =>
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
      ].includes(option.value)
    ).map((option) => ({ value: option.value, label: option.label })),
  },
  {
    label: "RATING FILTERS",
    options: SCOPE_RESEARCH_PARAMETER_OPTIONS.filter((option) =>
      ["rating", "ratingTotal"].includes(option.value)
    ).map((option) => ({ value: option.value, label: option.label })),
  },
  {
    label: "TAPE FILTERS",
    options: SCOPE_RESEARCH_PARAMETER_OPTIONS.filter((option) =>
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

const SCOPE_RESEARCH_RESULT_OPTIONS: Array<ScopeResearchOption<ScopeResearchResultKey>> = [
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

function scopeResearchResultOptionsForChart(chartType: ScopeResearchChartType): Array<ScopeResearchOption<ScopeResearchResultKey>> {
  if (chartType === "results_by_bins" || chartType === "results_more_less_parameter") {
    return SCOPE_RESEARCH_RESULT_OPTIONS;
  }
  return SCOPE_RESEARCH_RESULT_OPTIONS.filter(
    (option) => option.value !== "avgPnlUsd" && option.value !== "winRate" && option.value !== "score"
  );
}

function scopeResearchNormalizeResultKey(
  chartType: ScopeResearchChartType,
  resultKey: ScopeResearchResultKey
): ScopeResearchResultKey {
  const allowed = scopeResearchResultOptionsForChart(chartType);
  return allowed.some((option) => option.value === resultKey) ? resultKey : "totalPnlUsd";
}

const OPTIMIZER_GROUP_DISPLAY_LABELS: Record<OptimizerRangeGroupKey, string> = {
  "RATING GATES": "RATING FILTERS",
  "ZAP THRESHOLDS": "ZAP FILTERS",
  "TAPE FILTERS": "TAPE FILTERS",
};

const SCOPE_PARAMETER_DEFINITIONS: ScopeParameterDefinition[] = [
  { key: "minrate", label: "MINRATE", group: "RATING GATES", scenarioParameter: "MINRATE" },
  { key: "mintotal", label: "MINTOTAL", group: "RATING GATES", scenarioParameter: "MINTOTAL" },
  { key: "startabs", label: "START", group: "ZAP THRESHOLDS", scenarioParameter: null },
  { key: "endabs", label: "END", group: "ZAP THRESHOLDS", scenarioParameter: "END" },
  { key: "adv20", label: "ADV20", group: "TAPE FILTERS", scenarioParameter: "ADV20" },
  { key: "adv20nf", label: "ADV20NF", group: "TAPE FILTERS", scenarioParameter: "ADV20NF" },
  { key: "adv90", label: "ADV90", group: "TAPE FILTERS", scenarioParameter: "ADV90" },
  { key: "adv90nf", label: "ADV90NF", group: "TAPE FILTERS", scenarioParameter: "ADV90NF" },
  { key: "avpremhv", label: "AvPreMhv", group: "TAPE FILTERS", scenarioParameter: "AvPreMhv" },
  { key: "roundlot", label: "RoundLot", group: "TAPE FILTERS", scenarioParameter: "RoundLot" },
  { key: "vwap", label: "VWAP", group: "TAPE FILTERS", scenarioParameter: "VWAP" },
  { key: "spread", label: "Spread", group: "TAPE FILTERS", scenarioParameter: "Spread" },
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

const SCOPE_PARAMETER_BY_KEY = new Map(SCOPE_PARAMETER_DEFINITIONS.map((item) => [item.key, item]));

const SCOPE_PARAMETER_SELECT_GROUPS: GlassSelectGroup[] = (["RATING GATES", "ZAP THRESHOLDS", "TAPE FILTERS"] as OptimizerRangeGroupKey[]).map((group) => ({
  label: OPTIMIZER_GROUP_DISPLAY_LABELS[group],
  options: SCOPE_PARAMETER_DEFINITIONS
    .filter((item) => item.group === group)
    .map((item) => ({ value: item.key, label: item.label })),
}));

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

function getEpisodeDateKey(row: PaperArbClosedDto, fallbackDate?: string | null) {
  const extractYmd = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const head = raw.slice(0, 10);
    if (toYmd(head)) return head;
    const match = raw.match(/\b\d{4}-\d{2}-\d{2}\b/);
    return match?.[0] && toYmd(match[0]) ? match[0] : null;
  };

  const tsCandidates = [row.startTsNy, row.peakTsNy, row.endTsNy, row.episodeId];
  for (const candidate of tsCandidates) {
    const ymd = extractYmd(candidate);
    if (ymd) return ymd;
  }

  const candidates = [
    row.dateNy,
    row.date,
    row.day,
    row.tradeDateNy,
    row.tradeDate,
    row.sessionDateNy,
    row.sessionDate,
    fallbackDate ?? null,
  ];

  for (const candidate of candidates) {
    const ymd = extractYmd(candidate);
    if (ymd) return ymd;
  }
  return null;
}

function ratingBandFromSession(session: PaperArbSession): PaperArbRatingBand {
  switch (session) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "OPEN":
      return "OPEN";
    case "INTRA":
      return "INTRA";
    case "POST":
      return "POST";
    case "NIGHT":
    case "GLOB":
    default:
      return "GLOBAL";
  }
}

function scopeResearchParameterValue(row: PaperArbClosedDto, key: ScopeResearchParameterKey): number | null {
  switch (key) {
    case "startMinuteIdx":
      return Number.isFinite(row.startMinuteIdx) ? row.startMinuteIdx : null;
    case "peakMinuteIdx":
      return Number.isFinite(row.peakMinuteIdx) ? row.peakMinuteIdx : null;
    case "endMinuteIdx":
      return Number.isFinite(row.endMinuteIdx) ? row.endMinuteIdx : null;
    case "timeToPeak":
      return Number.isFinite(row.startMinuteIdx) && Number.isFinite(row.peakMinuteIdx)
        ? row.peakMinuteIdx - row.startMinuteIdx
        : null;
    case "timeToClose":
      return Number.isFinite(row.startMinuteIdx) && Number.isFinite(row.endMinuteIdx)
        ? row.endMinuteIdx - row.startMinuteIdx
        : null;
    case "startMetricAbs":
      return row.startMetricAbs ?? null;
    case "peakMetricAbs":
      return row.peakMetricAbs ?? null;
    case "endMetricAbs":
      return row.endMetricAbs ?? null;
    case "reversionAbs": {
      const peak = row.peakMetricAbs ?? null;
      const end = row.endMetricAbs ?? null;
      return peak != null && end != null ? peak - end : null;
    }
    case "reversionPct": {
      const peak = row.peakMetricAbs ?? null;
      const end = row.endMetricAbs ?? null;
      return peak != null && end != null && peak !== 0 ? (peak - end) / peak : null;
    }
    case "minHoldCandles":
      return row.minHoldCandles ?? null;
    case "rating":
      return row.rating ?? null;
    case "ratingTotal":
      return row.ratingTotal ?? null;
    case "adv20":
      return row.adv20 ?? null;
    case "adv20NF":
      return row.adv20NF ?? null;
    case "adv90":
      return row.adv90 ?? null;
    case "adv90NF":
      return row.adv90NF ?? null;
    case "avPreMhv":
      return row.avPreMhv ?? null;
    case "roundLot":
      return row.roundLot ?? null;
    case "vwap":
      return row.vwap ?? null;
    case "spread":
      return row.spread ?? null;
    case "lstPrcL":
      return row.lstPrcL ?? null;
    case "lstCls":
      return row.lstCls ?? null;
    case "yCls":
      return row.yCls ?? null;
    case "tCls":
      return row.tCls ?? null;
    case "clsToClsPct":
      return row.clsToClsPct ?? null;
    case "lo":
      return row.lo ?? null;
    case "newsCnt":
      return row.newsCnt ?? null;
    case "marketCapM":
      return row.marketCapM ?? null;
    case "preMktVolNF":
      return row.preMktVolNF ?? null;
    case "volNFfromLstCls":
      return row.preMktVolNF != null && row.lstCls != null ? row.preMktVolNF * row.lstCls : null;
    case "avPostMhVol90NF":
      return row.avPostMhVol90NF ?? null;
    case "avPreMhVol90NF":
      return row.avPreMhVol90NF ?? null;
    case "avPreMhValue20NF":
      return row.avPreMhValue20NF ?? null;
    case "avPreMhValue90NF":
      return row.avPreMhValue90NF ?? null;
    case "avgDailyValue20":
      return row.avgDailyValue20 ?? null;
    case "avgDailyValue90":
      return row.avgDailyValue90 ?? null;
    case "volatility20":
      return row.volatility20 ?? null;
    case "volatility90":
      return row.volatility90 ?? null;
    case "preMhMDV20NF":
      return row.preMhMDV20NF ?? null;
    case "preMhMDV90NF":
      return row.preMhMDV90NF ?? null;
    case "volRel":
      return row.volRel ?? null;
    case "preMhBidLstPrcPct":
      return row.preMhBidLstPrcPct ?? null;
    case "preMhLoLstPrcPct":
      return row.preMhLoLstPrcPct ?? null;
    case "preMhHiLstClsPct":
      return row.preMhHiLstClsPct ?? null;
    case "preMhLoLstClsPct":
      return row.preMhLoLstClsPct ?? null;
    case "lstPrcLstClsPct":
      return row.lstPrcLstClsPct ?? null;
    case "imbExch925":
      return row.imbExch925 ?? null;
    case "imbExch1555":
      return row.imbExch1555 ?? null;
  }
}

function scopeResearchResultValue(row: PaperArbClosedDto, key: ScopeResearchResultKey): number | null {
  switch (key) {
    case "avgPnlUsd":
    case "totalPnlUsd":
    case "winRate":
    case "score":
      return row.totalPnlUsd ?? null;
    case "rawPnlUsd":
      return row.rawPnlUsd ?? null;
    case "benchPnlUsd":
      return row.benchPnlUsd ?? null;
    case "hedgedPnlUsd":
      return row.hedgedPnlUsd ?? null;
    case "peakMetricAbs":
      return row.peakMetricAbs ?? null;
    case "endMetricAbs":
      return row.endMetricAbs ?? null;
  }
}

function scopeResearchMetricValue(row: ScopeResearchStats, key: ScopeResearchResultKey): number {
  switch (key) {
    case "avgPnlUsd":
      return row.avg;
    case "totalPnlUsd":
      return row.total;
    case "winRate":
      return row.winRate;
    case "score":
      return row.score;
    default:
      return row.avg;
  }
}

function scopeResearchMetricLabel(key: ScopeResearchResultKey): string {
  switch (key) {
    case "avgPnlUsd":
      return "avg/trade";
    case "totalPnlUsd":
      return "total";
    case "winRate":
      return "win";
    case "score":
      return "score";
    default:
      return "avg";
  }
}

function scopeResearchSourceResultKey(key: ScopeResearchResultKey): ScopeResearchResultKey {
  switch (key) {
    case "avgPnlUsd":
    case "totalPnlUsd":
    case "winRate":
    case "score":
      return "totalPnlUsd";
    default:
      return key;
  }
}

function scopeResearchOptionByValue<T extends string>(options: Array<ScopeResearchOption<T>>, value: T): ScopeResearchOption<T> {
  return options.find((option) => option.value === value) ?? options[0];
}

function scopeResearchPercentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const pos = Math.max(0, Math.min(sortedValues.length - 1, (sortedValues.length - 1) * p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  const left = sortedValues[lo] ?? sortedValues[0] ?? 0;
  const right = sortedValues[hi] ?? sortedValues[sortedValues.length - 1] ?? left;
  return left + (right - left) * weight;
}

function scopeResearchSummarize(values: number[]): ScopeResearchStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const avg = count ? total / count : 0;
  const median = scopeResearchPercentile(sorted, 0.5);
  const q1 = scopeResearchPercentile(sorted, 0.25);
  const q3 = scopeResearchPercentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - iqr * 1.5;
  const upperFence = q3 + iqr * 1.5;
  return {
    count,
    total,
    avg,
    median,
    winRate: count ? sorted.filter((value) => value > 0).length / count : 0,
    score: avg,
    q1,
    q3,
    lowerFence,
    upperFence,
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
  };
}

function scopeResearchEdges(values: number[], bucketCount: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const minValue = sorted[0] ?? 0;
  const maxValue = sorted[sorted.length - 1] ?? minValue;
  if (minValue === maxValue) return [minValue - 0.5, maxValue + 0.5];

  const count = Math.max(2, Math.min(32, Math.trunc(bucketCount) || 8));
  const quantileEdges = Array.from({ length: count + 1 }, (_, index) => {
    const p = index / count;
    return scopeResearchPercentile(sorted, p);
  });
  quantileEdges[0] = minValue;
  quantileEdges[quantileEdges.length - 1] = maxValue;

  const deduped = quantileEdges.filter((edge, index, arr) => {
    if (index === 0) return true;
    return Math.abs(edge - (arr[index - 1] ?? edge)) > 1e-9;
  });

  if (deduped.length >= 3) {
    return deduped;
  }

  const step = (maxValue - minValue) / count;
  const fallbackEdges = Array.from({ length: count + 1 }, (_, index) => minValue + step * index);
  fallbackEdges[0] = minValue;
  fallbackEdges[fallbackEdges.length - 1] = maxValue;
  return fallbackEdges;
}

function scopeResearchFormatValue(value: number, format: ScopeResearchValueFormat, digits = 2): string {
  if (!Number.isFinite(value)) return "-";
  switch (format) {
    case "currency":
      return `$${num(value, digits)}`;
    case "clock":
      return minuteIdxToClockLabel(Math.round(value));
    case "minutes":
      return `${intn(value)}m`;
    case "percent":
      return `${num(value * 100, 1)}%`;
    case "number":
    default:
      return num(value, digits);
  }
}

function scopeResearchRangeLabel(from: number, to: number, format: ScopeResearchValueFormat): string {
  return `${scopeResearchFormatValue(from, format, format === "percent" ? 3 : 2)} .. ${scopeResearchFormatValue(
    to,
    format,
    format === "percent" ? 3 : 2
  )}`;
}

function scopeResearchLabelLines(label: string): [string, string?] {
  const trimmed = label.trim();
  if (trimmed.includes(" .. ")) {
    const [left, right] = trimmed.split(" .. ");
    return [left?.trim() ?? trimmed, `.. ${right?.trim() ?? ""}`.trim()];
  }
  if (trimmed.startsWith(">=") || trimmed.startsWith("<=")) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return [parts.slice(0, 2).join(" "), parts.slice(2).join(" ") || undefined];
    }
  }
  const mid = Math.ceil(trimmed.length / 2);
  if (trimmed.length > 18) {
    return [trimmed.slice(0, mid).trim(), trimmed.slice(mid).trim()];
  }
  return [trimmed];
}

function scopeResearchDailySeries(points: ScopeResearchPoint[]) {
  const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey || a.parameter - b.parameter);
  const grouped = Array.from(
    sorted.reduce((map, point) => {
      const entry = map.get(point.dateKey) ?? { dateKey: point.dateKey, total: 0, count: 0, avgParam: 0, items: [] as ScopeResearchPoint[] };
      entry.total += point.result;
      entry.count += 1;
      entry.avgParam += point.parameter;
      entry.items.push(point);
      map.set(point.dateKey, entry);
      return map;
    }, new Map<string, { dateKey: string; total: number; count: number; avgParam: number; items: ScopeResearchPoint[] }>())
  ).map(([, entry]) => ({
    ...entry,
    avgParam: entry.count ? entry.avgParam / entry.count : 0,
  }));

  let running = 0;
  return grouped.map((row, index) => {
    running += row.total;
    return { ...row, index, cumulative: running };
  });
}

function ScopeResearchInsufficientState({
  message,
  detail = "Widen range, lower `Min N`, or reduce `Bins`.",
}: {
  message: string;
  detail?: string;
}) {
  return (
    <div className="w-full h-[520px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-5 flex items-center justify-center">
      <div className="max-w-[420px] text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-zinc-400">{message}</div>
        <div className="mt-2 text-[11px] font-mono text-zinc-500">{detail}</div>
      </div>
    </div>
  );
}

function buildScopeResearchSelectionFromDraft(draft: ScopeResearchDraft): ScopeResearchSelection {
  return {
    chartType: draft.chartType,
    parameterKey: draft.parameterKey,
    resultKey: scopeResearchNormalizeResultKey(draft.chartType, draft.resultKey),
    bucketCount: draft.bucketCount,
    minSamples: draft.minSamples,
    thresholdMode: draft.thresholdMode,
    domainFrom: optNumOrNull(draft.domainFrom),
    domainTo: optNumOrNull(draft.domainTo),
    extraFilters: draft.extraFilters.map((filter) => ({
      id: filter.id,
      parameterKey: filter.parameterKey,
      from: optNumOrNull(filter.from),
      to: optNumOrNull(filter.to),
    })),
    parallelFilters: draft.parallelFilters.map((filter) => ({
      id: filter.id,
      parameterKey: filter.parameterKey,
      from: optNumOrNull(filter.from),
      to: optNumOrNull(filter.to),
    })),
  };
}

function scopeResearchFilterMatchesRow(
  row: PaperArbClosedDto,
  filters: Array<{ parameterKey: ScopeResearchParameterKey; from: number | null; to: number | null }>
) {
  return filters.every((filter) => {
    const value = scopeResearchParameterValue(row, filter.parameterKey);
    if (value == null || !Number.isFinite(value)) return false;
    const lo = filter.from != null && filter.to != null ? Math.min(filter.from, filter.to) : filter.from;
    const hi = filter.from != null && filter.to != null ? Math.max(filter.from, filter.to) : filter.to;
    if (lo != null && value < lo) return false;
    if (hi != null && value > hi) return false;
    return true;
  });
}

function scopeResearchFilterLabel(
  filter: { parameterKey: ScopeResearchParameterKey; from: number | null; to: number | null }
) {
  const option = scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, filter.parameterKey);
  const lo = filter.from != null && filter.to != null ? Math.min(filter.from, filter.to) : filter.from;
  const hi = filter.from != null && filter.to != null ? Math.max(filter.from, filter.to) : filter.to;
  if (lo != null && hi != null) {
    return `${option.label} ${scopeResearchFormatValue(lo, option.format)} .. ${scopeResearchFormatValue(hi, option.format)}`;
  }
  if (lo != null) return `${option.label} >= ${scopeResearchFormatValue(lo, option.format)}`;
  if (hi != null) return `${option.label} <= ${scopeResearchFormatValue(hi, option.format)}`;
  return option.label;
}

function computeScopeResearch(
  rows: PaperArbClosedDto[],
  selection: ScopeResearchSelection | null,
  fallbackDate: string,
  fixedEdges?: number[],
  includeParallel = true
): ScopeResearchComputed | null {
  if (!selection) return null;

  const parameter = scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, selection.parameterKey);
  const result = scopeResearchOptionByValue(SCOPE_RESEARCH_RESULT_OPTIONS, selection.resultKey);
  const sourceResult = scopeResearchOptionByValue(SCOPE_RESEARCH_RESULT_OPTIONS, scopeResearchSourceResultKey(selection.resultKey));
  const rawPoints = rows
    .filter((row) => scopeResearchFilterMatchesRow(row, selection.extraFilters))
    .map((row) => {
      const parameterValue = scopeResearchParameterValue(row, selection.parameterKey);
      const resultValue = scopeResearchResultValue(row, selection.resultKey);
      const dateKey = getEpisodeDateKey(row, fallbackDate) ?? "unknown";
      return {
        row,
        parameter: parameterValue,
        result: resultValue,
        dateKey,
        sortKey: Number(dateKey.replace(/-/g, "")) || 0,
      };
    })
    .filter(
      (point): point is ScopeResearchPoint =>
        point.parameter != null && point.result != null && Number.isFinite(point.parameter) && Number.isFinite(point.result)
    );
  const domainLo = selection.domainFrom != null && selection.domainTo != null ? Math.min(selection.domainFrom, selection.domainTo) : selection.domainFrom;
  const domainHi = selection.domainFrom != null && selection.domainTo != null ? Math.max(selection.domainFrom, selection.domainTo) : selection.domainTo;
  const points = rawPoints.filter((point) => {
    if (domainLo != null && point.parameter < domainLo) return false;
    if (domainHi != null && point.parameter > domainHi) return false;
    return true;
  });

  if (!points.length) {
    return {
      selection,
      parameter,
        result,
        sourceResult,
        sourceCount: 0,
      points: [],
      bins: [],
      thresholds: [],
      bestBin: null,
      bestThreshold: null,
      bestBox: null,
      parallelSeries: [],
      parallelPointSeries: [],
    };
  }

  const parameterValues = points.map((point) => point.parameter);
  const edges = fixedEdges && fixedEdges.length >= 2 ? fixedEdges : scopeResearchEdges(parameterValues, selection.bucketCount);
  const minSamples = Math.max(1, Math.trunc(selection.minSamples) || 1);
  const bins =
    edges.length < 2
      ? []
      : Array.from({ length: edges.length - 1 }, (_, index) => ({
          from: edges[index] ?? 0,
          to: edges[index + 1] ?? 0,
          values: [] as number[],
        }))
          .map((bucket, _, source) => {
            for (const point of points) {
              const bucketIndex = source.findIndex((candidate, candidateIndex) =>
                candidateIndex === source.length - 1
                  ? point.parameter >= candidate.from && point.parameter <= candidate.to
                  : point.parameter >= candidate.from && point.parameter < candidate.to
              );
              if (bucketIndex >= 0 && source[bucketIndex] === bucket) {
                bucket.values.push(point.result);
              }
            }
            return bucket;
          })
          .map((bucket) =>
            bucket.values.length < minSamples
              ? null
              : ({
                  label: scopeResearchRangeLabel(bucket.from, bucket.to, parameter.format),
                  from: bucket.from,
                  to: bucket.to,
                  values: [...bucket.values],
                  ...scopeResearchSummarize(bucket.values),
                } satisfies ScopeResearchBinRow)
          )
          .filter(Boolean) as ScopeResearchBinRow[];

  const thresholdSeeds = edges.slice(1, -1).length ? edges.slice(1, -1) : edges.slice(0, -1);
  const thresholds = thresholdSeeds
    .map((threshold) => {
      const subset = points
        .filter((point) => (selection.thresholdMode === "less_than" ? point.parameter <= threshold : point.parameter >= threshold))
        .map((point) => point.result);
      if (subset.length < minSamples) return null;
      return {
        label: `${selection.thresholdMode === "less_than" ? "<=" : ">="} ${scopeResearchFormatValue(
          threshold,
          parameter.format,
          parameter.format === "percent" ? 3 : 2
        )}`,
        threshold,
        ...scopeResearchSummarize(subset),
      } satisfies ScopeResearchThresholdRow;
    })
    .filter(Boolean) as ScopeResearchThresholdRow[];

  const bestBin = bins.length
    ? [...bins].sort((a, b) => {
        const delta = scopeResearchMetricValue(b, selection.resultKey) - scopeResearchMetricValue(a, selection.resultKey);
        return delta !== 0 ? delta : b.count - a.count;
      })[0] ?? null
    : null;
  const bestThreshold = thresholds.length
    ? [...thresholds].sort((a, b) => {
        const delta = scopeResearchMetricValue(b, selection.resultKey) - scopeResearchMetricValue(a, selection.resultKey);
        return delta !== 0 ? delta : b.count - a.count;
      })[0] ?? null
    : null;
  const bestBox = bins.length
    ? [...bins].sort((a, b) => {
        const delta = scopeResearchMetricValue(b, selection.resultKey) - scopeResearchMetricValue(a, selection.resultKey);
        return delta !== 0 ? delta : b.count - a.count;
      })[0] ?? null
    : null;
  const parallelSeries = includeParallel
    ? selection.parallelFilters
        .map((filter) => {
          const computed = computeScopeResearch(
            rows,
            {
              ...selection,
              extraFilters: [...selection.extraFilters, filter],
              parallelFilters: [],
            },
            fallbackDate,
            edges,
            false
          );
          if (!computed) return null;
          const seriesRows =
            selection.chartType === "results_more_less_parameter" ? computed.thresholds : computed.bins;
          if (seriesRows.length < 2) return null;
          return {
            id: filter.id,
            label: scopeResearchFilterLabel(filter),
            rows: seriesRows,
          };
        })
        .filter(Boolean) as ScopeResearchComputed["parallelSeries"]
    : [];
  const parallelPointSeries = includeParallel
    ? selection.parallelFilters
        .map((filter) => {
          const computed = computeScopeResearch(
            rows,
            {
              ...selection,
              extraFilters: [...selection.extraFilters, filter],
              parallelFilters: [],
            },
            fallbackDate,
            edges,
            false
          );
          if (!computed || !computed.points.length) return null;
          return {
            id: filter.id,
            label: scopeResearchFilterLabel(filter),
            points: computed.points,
          };
        })
        .filter(Boolean) as ScopeResearchComputed["parallelPointSeries"]
    : [];

  return {
    selection,
    parameter,
    result,
    sourceResult,
    sourceCount: points.length,
    points,
    bins,
    thresholds,
    bestBin,
    bestThreshold,
    bestBox,
    parallelSeries,
    parallelPointSeries,
  };
}

function renderScopeChartTooltip(tooltip: ScopeChartTooltipData | null) {
  if (!tooltip) return null;
  const accentClass =
    tooltip.accent === "amber"
      ? "border-amber-400/25 shadow-[0_10px_30px_rgba(245,158,11,0.12)]"
      : tooltip.accent === "cyan"
        ? "border-cyan-400/25 shadow-[0_10px_30px_rgba(34,211,238,0.12)]"
        : tooltip.accent === "fuchsia"
          ? "border-fuchsia-400/25 shadow-[0_10px_30px_rgba(217,70,239,0.12)]"
          : "border-emerald-400/25 shadow-[0_10px_30px_rgba(16,185,129,0.12)]";
  return (
    <div
      className={clsx(
        "pointer-events-none absolute z-20 min-w-[160px] max-w-[280px] rounded-xl border bg-[#06080d]/96 px-3 py-2 backdrop-blur-xl",
        accentClass
      )}
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: "translate(-50%, -110%)",
      }}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-300">{tooltip.title}</div>
      <div className="mt-1 space-y-0.5">
        {tooltip.lines.map((line, index) => (
          <div key={`${tooltip.title}-${index}`} className="text-[11px] font-mono text-zinc-400 whitespace-nowrap">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPaperQuery(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === "") continue;
        sp.append(k, String(item));
      }
      continue;
    }
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

type ProblemDetails = {
  title?: string;
  detail?: string;
  status?: number;
  type?: string;
  instance?: string;
};

async function parseProblemDetailsSafe(res: Response): Promise<ProblemDetails | null> {
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = (await res.json()) as any;
      if (j && (j.title || j.detail || j.status)) return j as ProblemDetails;
    }
  } catch {
    // ignore
  }
  return null;
}

async function apiGet<T>(pathAndQuery: string): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(pathAndQuery);
  const res = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const pd = await parseProblemDetailsSafe(res);
    const txt = pd
      ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
      : await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(path);
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const pd = await parseProblemDetailsSafe(res);
    const txt = pd
      ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
      : await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

async function apiPostWithTimeout<T>(path: string, body: any, timeoutMs: number): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const pd = await parseProblemDetailsSafe(res);
      const txt = pd
        ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
        : await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// Accept either:
// - { ok, days: string[] }
// - string[]
async function loadDaysApi(): Promise<string[]> {
  const j = await apiGet<any>("/api/paper/arbitrage/days");
  if (Array.isArray(j)) return j as string[];
  if (j && Array.isArray(j.days)) return j.days as string[];
  return [];
}

// Accept either:
// - { ok, rows: T[] }
// - T[]
function normalizeRows<T>(j: any): T[] {
  if (Array.isArray(j)) return j as T[];
  if (j && Array.isArray(j.rows)) return j.rows as T[];
  if (j && Array.isArray(j.items)) return j.items as T[];
  return [];
}

const EPISODES_SEARCH_CACHE_TTL_MS = 12_000;
const EPISODES_SEARCH_CACHE_MAX = 24;

// =========================
// DESIGN SYSTEM COMPONENTS (kept from your file)
// =========================
function NebulaBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 bg-[#030303]">
      <div className="absolute inset-0 bg-[radial-gradient(680px_420px_at_14%_8%,rgba(16,185,129,0.2),transparent_70%),radial-gradient(720px_420px_at_88%_10%,rgba(139,92,246,0.16),transparent_72%)] blur-[150px]" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      <div
        className="absolute inset-x-0 bottom-0 h-[55vh]"
        style={{
          backgroundImage:
            "radial-gradient(68% 52% at 50% 100%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.05) 28%, rgba(0,0,0,0) 70%)",
          maskImage: "linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))",
        }}
      />
    </div>
  );
}

function GlassCard({
  children,
  className,
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "scanner-glass-card bg-[#0a0a0a]/50 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70",
        glow && "border-l-4 border-l-emerald-500 shadow-[0_0_30px_-10px_rgba(16,185,129,0.18)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function GlassInput({
  value,
  onChange,
  placeholder,
  type = "text",
  width,
  className,
  min,
  max,
  step,
  disabled,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  width?: number | string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={{ width }}
      className={clsx(
        "scanner-glass-input bg-black/10 border border-white/5 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:bg-black/20 hover:border-white/10 hover:bg-black/20 transition-all duration-200 font-mono tabular-nums",
        className
      )}
    />
  );
}

const SCANNER_PANEL_SURFACE =
  "scanner-panel-surface border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all duration-200 hover:border-white/[0.12] hover:bg-[#101010]/60";

const SCANNER_CONTROL_SURFACE =
  "scanner-control-surface border border-white/5 bg-black/10 transition-all duration-200 hover:border-white/10 hover:bg-black/20";

const SCANNER_EYE_BUTTON =
  "scanner-eye-button inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-zinc-300 transition-colors hover:bg-white/[0.08] group";

const SOFT_LOSS_TEXT_CLASS = "text-[#f3a6b2]";
const SOFT_LOSS_SOLID = "rgba(243,166,178,0.95)";
const SOFT_LOSS_MUTED = "rgba(243,166,178,0.25)";
const SOFT_LOSS_STROKE = "rgba(243,166,178,0.55)";
const SOFT_LOSS_LINE = "rgba(243,166,178,0.6)";
const SOFT_LOSS_CHIP = "border-[rgba(243,166,178,0.18)] bg-[rgba(243,166,178,0.08)] text-[#f3a6b2]/90";

function SummaryMetricCard({
  label,
  value,
  valueClassName,
  className,
  inline = false,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <GlassCard className={clsx("p-3", className)}>
      <div
        className={clsx(
          inline
            ? "h-full flex items-center justify-between gap-4"
            : "h-full flex flex-col",
        )}
      >
        <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{label}</div>
        <div
          className={clsx(
            inline
              ? "flex items-center justify-end text-base md:text-xl font-semibold font-mono text-right"
              : "flex-1 flex items-center justify-center text-sm font-mono text-center",
            valueClassName
          )}
        >
          {value}
        </div>
      </div>
    </GlassCard>
  );
}

function GlassSelect({
  value,
  onChange,
  options,
  className,
  compact = false,
  panelOffsetX = 0,
  panelWidth,
  panelAnchorRef,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<GlassSelectOption | GlassSelectGroup>;
  className?: string;
  compact?: boolean;
  panelOffsetX?: number;
  panelWidth?: number;
  panelAnchorRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { theme } = useUi();
  const accent = getScannerAccent(theme);
  const isLightTheme = theme === "light";
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flatOptions = useMemo(
    () =>
      options.flatMap((opt) =>
        "options" in opt ? opt.options.map((groupOption) => ({ ...groupOption, group: opt.label })) : [{ ...opt, group: null as string | null }]
      ),
    [options]
  );
  const selected = flatOptions.find((opt) => opt.value === value) ?? flatOptions.find((opt) => !opt.disabled) ?? null;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = (panelAnchorRef?.current ?? rootRef.current)?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.innerHeight || 0;
      const roomBelow = viewportHeight - rect.bottom;
      const roomAbove = rect.top;
      const nextOpenUpward = roomBelow < 360 && roomAbove > roomBelow;
      setOpenUpward(nextOpenUpward);
      setPanelStyle({
        position: "fixed",
        left: Math.max(12, rect.left + panelOffsetX),
        width: panelWidth ?? rect.width,
        top: nextOpenUpward ? undefined : Math.min(viewportHeight - 12, rect.bottom + 6),
        bottom: nextOpenUpward ? Math.max(12, viewportHeight - rect.top + 6) : undefined,
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (!rootRef.current?.contains(targetNode) && !panelRef.current?.contains(targetNode)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = panelRef.current?.querySelector<HTMLButtonElement>("[data-selected='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [open, value]);

  const emitChange = (nextValue: string) => {
    onChange({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={clsx("relative z-50 font-mono", open && "z-[220] isolate")}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          compact
            ? "relative flex w-full items-center gap-1.5 h-[14px] border-0 bg-transparent px-0 py-0 text-xs font-mono font-normal normal-case tracking-normal leading-none shadow-none transition-colors duration-150"
            : "relative flex w-full items-center gap-2.5 h-9 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
          open
            ? compact
              ? clsx(accent.activeText, "border-transparent bg-transparent shadow-none")
              : clsx(accent.activeText, "border-white/10 bg-black/30 shadow-[0_0_15px_-5px_rgba(255,255,255,0.08)]", accent.buttonBorder ?? "border-white/20")
            : compact
              ? clsx(isLightTheme ? "text-slate-900" : accent.activeText, "border-transparent bg-transparent shadow-none hover:text-zinc-200")
              : clsx(accent.activeText, SCANNER_CONTROL_SURFACE),
          className
        )}
      >
        <span className={clsx("min-w-0 flex-1 truncate text-left", compact ? "leading-none" : "")}>{selected?.label ?? value}</span>
        <span className={clsx("opacity-50 ml-1", compact && "ml-0 flex items-center self-center")}>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className={clsx(
                "z-[9999] overflow-hidden rounded-xl backdrop-blur-xl transition-all duration-200 origin-top",
                isLightTheme
                  ? "border border-slate-900/10 bg-white/95 shadow-[0_10px_32px_-12px_rgba(15,23,42,0.18)]"
                  : "border border-white/[0.08] bg-[#0a0a0a]/90 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]"
              )}
            >
              <div className="max-h-[340px] overflow-y-auto py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {options.map((opt) =>
                  "options" in opt ? (
                    <div key={`group-${opt.label}`} className="px-1.5 py-1">
                      <div className={clsx("px-2.5 pb-1.5 text-[9px] uppercase tracking-[0.18em] font-mono", isLightTheme ? "text-slate-500" : "text-zinc-500")}>
                        {opt.label}
                      </div>
                      <div className="space-y-0.5">
                        {opt.options.map((groupOption) => {
                          const isSelected = groupOption.value === value;
                          return (
                            <button
                              key={groupOption.value}
                              type="button"
                              data-selected={isSelected}
                              disabled={groupOption.disabled}
                              onClick={() => !groupOption.disabled && emitChange(groupOption.value)}
                              className={clsx(
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                                groupOption.disabled
                                  ? (isLightTheme ? "cursor-not-allowed text-slate-400" : "cursor-not-allowed text-zinc-600")
                                  : isSelected
                                    ? (isLightTheme ? "bg-slate-900/10 text-slate-900" : accent.activeSoft)
                                    : (isLightTheme ? "text-slate-500 hover:bg-slate-900/[0.05] hover:text-slate-900" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200")
                              )}
                              title={groupOption.disabled ? "Unavailable" : groupOption.label}
                            >
                              <span className="min-w-0 flex-1 truncate">{groupOption.label}</span>
                              {isSelected && <span className={clsx("w-1.5 h-1.5 rounded-full", accent.dot)} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key={opt.value} className="px-1.5 py-0.5">
                      <button
                        type="button"
                        data-selected={opt.value === value}
                        disabled={opt.disabled}
                        onClick={() => !opt.disabled && emitChange(opt.value)}
                        className={clsx(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                          opt.disabled
                            ? (isLightTheme ? "cursor-not-allowed text-slate-400" : "cursor-not-allowed text-zinc-600")
                            : opt.value === value
                              ? (isLightTheme ? "bg-slate-900/10 text-slate-900" : accent.activeSoft)
                              : (isLightTheme ? "text-slate-500 hover:bg-slate-900/[0.05] hover:text-slate-900" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200")
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        {opt.value === value && <span className={clsx("w-1.5 h-1.5 rounded-full", accent.dot)} />}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>,
            document.body
          )
        : null}
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-0">
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1L5 5L9 1" />
        </svg>
      </div>
    </div>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-3 h-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M6 8L10 12L14 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function MinMaxRow({
  label,
  filterKey,
  minValue,
  maxValue,
  setMin,
  setMax,
  mode = "on",
  onToggleMode,
  card = false,
  clearable = false,
  placeholderMin = "min",
  placeholderMax = "max",
}: {
  label: string;
  filterKey?: SharedRangeFilterKey;
  minValue: string;
  maxValue: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  mode?: SharedRangeFilterMode;
  onToggleMode?: (key: SharedRangeFilterKey) => void;
  card?: boolean;
  clearable?: boolean;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  const hasValue = Boolean((minValue ?? "").trim() || (maxValue ?? "").trim());
  const isOff = mode === "off";

  if (card) {
    return (
      <div
        className={clsx(
          "group flex flex-col gap-1 rounded-xl border p-2 transition-all",
          hasValue
            ? isOff
              ? "border-rose-500/30 bg-rose-500/[0.05]"
              : "border-[#6ee7b7]/30 bg-[#6ee7b7]/[0.05]"
            : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="mr-1 truncate text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
          <div className="flex items-center gap-2">
            {clearable && filterKey && hasValue && onToggleMode && (
              <button
                type="button"
                onClick={() => onToggleMode(filterKey)}
                className={clsx(
                  "text-[10px] font-mono transition-colors uppercase",
                  isOff ? "text-rose-300 hover:text-rose-200" : "text-[#6ee7b7] hover:text-[#a7f3d0]"
                )}
                title={isOff ? "Stored but ignored in requests" : "Applied to requests"}
              >
                {isOff ? "OFF" : "ON"}
              </button>
            )}
            {clearable && hasValue && (
              <button
                type="button"
                onClick={() => {
                  setMin("");
                  setMax("");
                }}
                className="text-[10px] font-mono text-rose-400 hover:text-rose-300 transition-colors"
              >
                CLR
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <GlassInput
            value={minValue}
            onChange={(e) => setMin(e.target.value)}
            placeholder={placeholderMin}
            className="!h-auto w-full !rounded !border-0 hover:!border-0 focus:!border-0 focus-visible:!border-0 !ring-0 focus:!ring-0 focus-visible:!ring-0 !shadow-none !outline-none !bg-black/20 !px-1.5 !py-1 !text-center !text-[11px] !font-mono !text-zinc-200"
          />
          <GlassInput
            value={maxValue}
            onChange={(e) => setMax(e.target.value)}
            placeholder={placeholderMax}
            className="!h-auto w-full !rounded !border-0 hover:!border-0 focus:!border-0 focus-visible:!border-0 !ring-0 focus:!ring-0 focus-visible:!ring-0 !shadow-none !outline-none !bg-black/20 !px-1.5 !py-1 !text-center !text-[11px] !font-mono !text-zinc-200"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">{label}</div>
      <div className="flex gap-2">
        <GlassInput value={minValue} onChange={(e) => setMin(e.target.value)} placeholder={placeholderMin} className="w-full" />
        <GlassInput value={maxValue} onChange={(e) => setMax(e.target.value)} placeholder={placeholderMax} className="w-full" />
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  className?: string;
}) {
  return (
    <div className={clsx("inline-flex rounded-xl p-1", SCANNER_PANEL_SURFACE, className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={clsx(
              "px-3 py-1.5 text-[10px] font-mono font-bold uppercase rounded-lg tracking-wide transition-all border",
              on
                ? "bg-emerald-500/12 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-4px_rgba(16,185,129,0.35)]"
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-black/30"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SideBadge({ side }: { side: TapeArbSide }) {
  const s = normalizeSide(side);
  const isLong = s.isLong === true;
  const isShort = s.isLong === false;
  const colorClass = isLong
    ? "bg-[#6ee7b7]/10 text-[#6ee7b7] border-[#6ee7b7]/20"
    : isShort
      ? "border-[rgba(243,166,178,0.22)] bg-[rgba(243,166,178,0.10)] text-[#f3a6b2]"
      : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50";

  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap",
        colorClass
      )}
    >
      {s.label}
    </span>
  );
}

// =========================
// Simple SVG line chart (equity curve)
// =========================
function EquityChart({
  points,
  title,
  meta,
  fullscreen = false,
}: {
  points: PaperArbEquityPointDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 360;
  const padLeft = 18;
  const padRight = 46;
  const padTop = 34;
  const padBottom = 40;

  const parseKey = (key: string): { date: string | null; minuteIdx: number | null } => {
    const m = String(key ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d+))?$/);
    if (!m) return { date: null, minuteIdx: null };
    return {
      date: m[1] ?? null,
      minuteIdx: m[2] == null ? null : clampInt(m[2], 0),
    };
  };

  const formatX = (key: string, sameDay: boolean) => {
    const { date, minuteIdx } = parseKey(key);
    if (minuteIdx != null) {
      const totalMin = minuteIdx; // absolute NY minute-of-day
      const hh = Math.floor((totalMin % 1440) / 60)
        .toString()
        .padStart(2, "0");
      const mm = (totalMin % 60).toString().padStart(2, "0");
      return sameDay ? `${hh}:${mm}` : `${date?.slice(5)} ${hh}:${mm}`;
    }
    if (date) return sameDay ? date.slice(5) : date;
    return String(key ?? "");
  };

  const toTimeValue = (key: string, fallbackIdx: number): number => {
    const { date, minuteIdx } = parseKey(key);
    if (date) {
      const [y, m, d] = date.split("-").map((x) => Number(x));
      if ([y, m, d].every((x) => Number.isFinite(x))) {
        const day = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
        return day + (minuteIdx ?? 0) * 60_000;
      }
    }
    if (minuteIdx != null) return minuteIdx * 60_000;
    return fallbackIdx;
  };

  // Normalize timeline to actual time (not array index) and micro-spread identical timestamps.
  // This avoids visually broken vertical walls when many trades share the same minute.
  const chartPoints = (() => {
    const sorted = points
      .map((p, i) => ({ ...p, _idx: i, _t: toTimeValue(p.key, i) }))
      .sort((a, b) => (a._t === b._t ? a._idx - b._idx : a._t - b._t));

    const groups: Array<Array<PaperArbEquityPointDto & { _idx: number; _t: number }>> = [];
    for (const p of sorted) {
      const g = groups[groups.length - 1];
      if (g && g[0]._t === p._t) {
        g.push(p);
      } else {
        groups.push([p]);
      }
    }

    const out: Array<PaperArbEquityPointDto & { _t: number; _tp: number }> = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const baseT = g[0]._t;
      const nextBaseT = groups[gi + 1]?.[0]?._t ?? baseT + 60_000;
      const windowMs = Math.max(1, Math.min(60_000, nextBaseT - baseT));
      const spreadMs = Math.max(0, Math.floor(windowMs * 0.85));
      const denom = Math.max(1, g.length - 1);

      for (let j = 0; j < g.length; j++) {
        const p = g[j];
        const tp = g.length === 1 ? baseT : baseT + Math.round((j / denom) * spreadMs);
        out.push({ key: p.key, equity: p.equity, pnl: p.pnl, _t: baseT, _tp: tp });
      }
    }
    return out;
  })();

  const ys = chartPoints.map((p) => p.equity);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  const sameDay = (() => {
    const dates = chartPoints.map((p) => parseKey(p.key).date).filter(Boolean) as string[];
    if (!dates.length) return false;
    return dates.every((d) => d === dates[0]);
  })();

  const toX = (i: number) => {
    if (chartPoints.length <= 1) return padLeft;
    const t0 = chartPoints[0]._tp;
    const t1 = chartPoints[chartPoints.length - 1]._tp;
    const spanT = Math.max(1, t1 - t0);
    return padLeft + ((chartPoints[i]._tp - t0) / spanT) * (w - padLeft - padRight);
  };
  const toY = (v: number) => padTop + (1 - (v - minY) / span) * (h - padTop - padBottom);

  const lineD = chartPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.equity).toFixed(2)}`)
    .join(" ");

  const areaD = `${lineD} L ${toX(chartPoints.length - 1).toFixed(2)} ${(h - padBottom).toFixed(2)} L ${toX(0).toFixed(2)} ${(h - padBottom).toFixed(2)} Z`;

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const val = maxY - t * span;
    return { y: toY(val), val };
  });

  // Axis labels use true minute timestamps (one label per unique minute).
  const uniqueTimeline = (() => {
    const out: Array<{ idx: number; key: string; date: string | null; minuteIdx: number | null; t: number }> = [];
    for (let i = 0; i < chartPoints.length; i++) {
      const key = chartPoints[i]?.key ?? "";
      if (i > 0 && chartPoints[i]._t === chartPoints[i - 1]._t) continue;
      const parsed = parseKey(key);
      out.push({ idx: i, key, date: parsed.date, minuteIdx: parsed.minuteIdx, t: chartPoints[i]._t });
    }
    return out;
  })();

  const tickCount = Math.min(10, Math.max(3, uniqueTimeline.length));
  const sampled = Array.from({ length: tickCount }, (_, i) => {
    const pos = Math.round((i / (tickCount - 1)) * (uniqueTimeline.length - 1));
    return uniqueTimeline[pos];
  }).filter((t, i, arr) => i === 0 || t.idx !== arr[i - 1].idx);

  const byTimeLabel = new Map<string, Set<string>>();
  for (const s of uniqueTimeline) {
    const timeLabel = s.minuteIdx == null ? formatX(s.key, sameDay) : minuteIdxToClockLabel(s.minuteIdx);
    if (!byTimeLabel.has(timeLabel)) byTimeLabel.set(timeLabel, new Set<string>());
    byTimeLabel.get(timeLabel)!.add(s.date ?? "");
  }

  const xTicks: Array<{ idx: number; x: number; label: string }> = [];
  let lastPlacedX = -1e9;
  for (const t of sampled) {
    const x = toX(t.idx);
    const mustKeep = t.idx === 0 || t.idx === chartPoints.length - 1;
    if (!mustKeep && x - lastPlacedX < 72) continue;

    const timeOnly = t.minuteIdx == null ? formatX(t.key, sameDay) : minuteIdxToClockLabel(t.minuteIdx);
    const dateSet = byTimeLabel.get(timeOnly);
    const needsDatePrefix = !!dateSet && dateSet.size > 1 && t.date;
    const label = needsDatePrefix ? `${(t.date ?? "").slice(5)} ${timeOnly}` : formatX(t.key, sameDay);

    if (xTicks.some((z) => z.label === label) && !mustKeep) continue;
    xTicks.push({ idx: t.idx, x, label });
    lastPlacedX = x;
  }

  const peakIdx = ys.reduce((best, v, i) => (v > ys[best] ? i : best), 0);
  const troughIdx = ys.reduce((best, v, i) => (v < ys[best] ? i : best), 0);
  const peakX = toX(peakIdx);
  const peakY = toY(chartPoints[peakIdx]?.equity ?? 0);
  const troughX = toX(troughIdx);
  const troughY = toY(chartPoints[troughIdx]?.equity ?? 0);

  const first = chartPoints[0];
  const last = chartPoints[chartPoints.length - 1];
  const firstY = toY(first?.equity ?? 0);
  const lastY = toY(last?.equity ?? 0);
  const zeroInRange = minY <= 0 && maxY >= 0;
  const zeroY = zeroInRange ? toY(0) : null;

  return (
    <div className="scanner-glass-card relative w-full h-[360px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full">
        <defs>
          <linearGradient id="eq-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.08)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0)" />
          </linearGradient>
          <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
          </linearGradient>
          <linearGradient id="eq-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(45,212,191,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0.95)" />
          </linearGradient>
          <filter id="eq-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={padLeft} y={padTop} width={w - padLeft - padRight} height={h - padTop - padBottom} fill="url(#eq-bg)" />

        {yTicks.map((t) => (
          <g key={`y-${t.y.toFixed(2)}`}>
            <line x1={padLeft} x2={w - padRight} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
            <text x={w - 8} y={t.y - 4} fontSize="14" textAnchor="end" className="fill-zinc-400 font-mono">
              {num(t.val, 2)}
            </text>
          </g>
        ))}

        {zeroY != null && <line x1={padLeft} x2={w - padRight} y1={zeroY} y2={zeroY} stroke="rgba(244,63,94,0.25)" strokeDasharray="4 3" />}

        <path d={areaD} fill="url(#eq-fill)" />
        <path d={lineD} fill="none" stroke="url(#eq-stroke)" strokeWidth="2.8" filter="url(#eq-glow)" />

        <circle cx={toX(0)} cy={firstY} r="3.2" fill="rgba(167,139,250,0.95)" />
        <circle cx={toX(chartPoints.length - 1)} cy={lastY} r="4" fill="rgba(16,185,129,1)" />
        <text x={toX(chartPoints.length - 1) + 8} y={lastY - 10} fontSize="10" className="fill-emerald-300 font-mono">
          {num(last?.equity ?? null, 2)}
        </text>

        <circle cx={peakX} cy={peakY} r="3.8" fill="rgba(16,185,129,0.95)" />
        <text x={peakX + 8} y={peakY - 8} fontSize="10" className="fill-emerald-200 font-mono">
          peak {num(chartPoints[peakIdx]?.equity ?? null, 2)}
        </text>

        <circle cx={troughX} cy={troughY} r="3.4" fill="rgba(244,63,94,0.92)" />
        <text x={troughX + 8} y={troughY + 14} fontSize="10" className="fill-rose-200 font-mono">
          min {num(chartPoints[troughIdx]?.equity ?? null, 2)}
        </text>

        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.12)" />
        {xTicks.map((t) => (
          <g key={`x-${t.idx}`}>
            <line x1={t.x} x2={t.x} y1={padTop} y2={h - padBottom} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />
            <line x1={t.x} x2={t.x} y1={h - padBottom} y2={h - padBottom + 6} stroke="rgba(255,255,255,0.25)" />
            <text x={t.x} y={h - 8} fontSize="14" textAnchor="middle" className="fill-zinc-400 font-mono">
              {t.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function OptimizerBarChart({
  rows,
  valueKey,
  title,
  meta,
  color = "emerald",
  maxRows,
}: {
  rows: OptimizerResultRow[];
  valueKey: "score" | "totalPnlUsd" | "avgPnlUsd" | "trades" | "winRate";
  title: string;
  meta?: string;
  color?: "emerald" | "sky";
  maxRows?: number;
}) {
  const items = maxRows != null ? rows.slice(0, maxRows) : rows;
  if (!items.length) {
    return (
      <div className="w-full h-[300px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No optimizer results yet.
      </div>
    );
  }

  const values = items.map((r) => Number(r[valueKey] ?? 0));
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const barClass = color === "sky" ? "bg-sky-400/80" : "bg-emerald-400/80";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
      </div>
      <div
        className={clsx(
          "space-y-2",
          items.length > 12 && "max-h-[520px] overflow-y-auto pr-1"
        )}
      >
        {items.map((row) => {
          const v = Number(row[valueKey] ?? 0);
          const widthPct = Math.max(2, (Math.abs(v) / maxAbs) * 100);
          return (
            <div key={`${valueKey}-${row.id}`} className="grid grid-cols-[140px_1fr_64px] gap-3 items-center">
              <div className="text-[10px] font-mono text-zinc-400 truncate" title={`${row.parameter} | ${row.variant}`}>
                {row.parameter} {row.variant}
              </div>
              <div className="h-5 rounded bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div
                  className={clsx("h-full", barClass)}
                  style={{ width: `${widthPct}%`, opacity: v < 0 ? 0.45 : 1 }}
                />
              </div>
              <div className="text-right text-[10px] font-mono text-zinc-300 tabular-nums">
                {valueKey === "trades" ? intn(v) : valueKey === "winRate" ? `${num(v * 100, 1)}%` : num(v, 2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptimizerDualMetricChart({
  rows,
  leftKey,
  rightKey,
  title,
  meta,
  leftLabel,
  rightLabel,
}: {
  rows: OptimizerResultRow[];
  leftKey: "score" | "totalPnlUsd" | "avgPnlUsd" | "trades" | "winRate";
  rightKey: "score" | "totalPnlUsd" | "avgPnlUsd" | "trades" | "winRate";
  title: string;
  meta?: string;
  leftLabel: string;
  rightLabel: string;
}) {
  if (!rows.length) {
    return (
      <div className="w-full h-[300px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No optimizer results yet.
      </div>
    );
  }

  const leftValues = rows.map((row) => Number(row[leftKey] ?? 0));
  const rightValues = rows.map((row) => Number(row[rightKey] ?? 0));
  const leftMaxAbs = Math.max(1, ...leftValues.map((value) => Math.abs(value)));
  const rightMaxAbs = Math.max(1, ...rightValues.map((value) => Math.abs(value)));
  const formatValue = (key: "score" | "totalPnlUsd" | "avgPnlUsd" | "trades" | "winRate", value: number) =>
    key === "trades" ? intn(value) : key === "winRate" ? `${num(value * 100, 1)}%` : num(value, 2);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
      </div>
      <div className="mb-2 grid grid-cols-[160px_1fr_72px_1fr_64px] gap-2 items-center text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">
        <div />
        <div>{leftLabel}</div>
        <div />
        <div>{rightLabel}</div>
        <div />
      </div>
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {rows.map((row) => {
          const left = Number(row[leftKey] ?? 0);
          const right = Number(row[rightKey] ?? 0);
          const leftWidthPct = Math.max(2, (Math.abs(left) / leftMaxAbs) * 100);
          const rightWidthPct = Math.max(2, (Math.abs(right) / rightMaxAbs) * 100);
          return (
            <div key={`dual-${row.id}`} className="grid grid-cols-[160px_1fr_72px_1fr_64px] gap-2 items-center">
              <div className="text-[10px] font-mono text-zinc-400 truncate" title={`${row.parameter} | ${row.variant}`}>
                {row.parameter} {row.variant}
              </div>
              <div className="h-4 rounded bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-emerald-400/80"
                  style={{ width: `${leftWidthPct}%`, opacity: left < 0 ? 0.45 : 1 }}
                />
              </div>
              <div className="text-right text-[10px] font-mono text-zinc-300 tabular-nums">
                {formatValue(leftKey, left)}
              </div>
              <div className="h-4 rounded bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-sky-400/80"
                  style={{ width: `${rightWidthPct}%`, opacity: right < 0 ? 0.45 : 1 }}
                />
              </div>
              <div className="text-right text-[10px] font-mono text-zinc-300 tabular-nums">
                {formatValue(rightKey, right)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EyeToggleIcon({ closed, className }: { closed: boolean; className?: string }) {
  return (
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
      className={className}
      aria-hidden="true"
    >
      {closed ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </>
      )}
    </svg>
  );
}

function OptimizerParameterRangeCard({
  parameter,
  rankMetric,
  minTradesFilter,
  bucketCount,
}: {
  parameter: PaperArbOptimizerParameterDto;
  rankMetric: OptimizerRangeRankMetric;
  minTradesFilter: number;
  bucketCount: number;
}) {
  const { theme } = useUi();
  const accent = getScannerAccent(theme);
  const sortBucketsByMetric = (items: PaperArbOptimizerRangeBucketDto[]) =>
    [...items].sort((a, b) => {
      const aMetric = rankMetric === "winRate" ? a.winRate : rankMetric === "totalPnlUsd" ? a.totalPnlUsd : rankMetric === "score" ? a.score : a.avgPnlUsd;
      const bMetric = rankMetric === "winRate" ? b.winRate : rankMetric === "totalPnlUsd" ? b.totalPnlUsd : rankMetric === "score" ? b.score : b.avgPnlUsd;
      if (bMetric !== aMetric) return bMetric - aMetric;
      if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
      return b.trades - a.trades;
    });
  const buckets = [...(parameter.buckets ?? [])]
    .filter((bucket) => bucket.trades >= minTradesFilter)
    .sort((a, b) => {
    const av = a.fromValue ?? Number.NEGATIVE_INFINITY;
    const bv = b.fromValue ?? Number.NEGATIVE_INFINITY;
    return av - bv;
  });
  const maxAbsScore = Math.max(0.000001, ...buckets.map((b) => Math.abs(b.score)));
  const baseTotalPnl = parameter.baseTotalPnlUsd ?? 0;
  const baseAvgPnl = parameter.baseAvgPnlUsd ?? 0;
  const baseWinRate = parameter.baseWinRate ?? 0;
  const positiveTextClass = "text-[#6ee7b7]";
  const negativeTextClass = SOFT_LOSS_TEXT_CLASS;
  const positiveScoreTextClass = "text-[#86efc5]";
  const negativeScoreTextClass = "text-[#ffb3bf]";
  const positiveChipClass = "border-[#6ee7b7]/30 bg-[#6ee7b7]/10 text-[#6ee7b7]";
  const negativeChipClass = "border-[rgba(243,166,178,0.28)] bg-[rgba(243,166,178,0.10)] text-[#f3a6b2]";
  const valueTextClass = (value: number, neutral = "text-zinc-300") =>
    value > 0 ? positiveTextClass : value < 0 ? negativeTextClass : neutral;
  const scoreTextClass = (value: number, neutral = "text-zinc-300") =>
    value > 0 ? positiveScoreTextClass : value < 0 ? negativeScoreTextClass : neutral;
  const valueChipClass = (value: number, neutral = "border-white/10 bg-black/20 text-zinc-400") =>
    value > 0 ? positiveChipClass : value < 0 ? negativeChipClass : neutral;
  const bestBucket = useMemo(
    () => sortBucketsByMetric(buckets)[0] ?? null,
    [buckets, rankMetric]
  );
  const bestLowerTail = useMemo(
    () => sortBucketsByMetric((parameter.lowerTailBuckets ?? []).filter((bucket) => bucket.trades >= minTradesFilter))[0] ?? null,
    [parameter.lowerTailBuckets, minTradesFilter, rankMetric]
  );
  const bestUpperTail = useMemo(
    () => sortBucketsByMetric((parameter.upperTailBuckets ?? []).filter((bucket) => bucket.trades >= minTradesFilter))[0] ?? null,
    [parameter.upperTailBuckets, minTradesFilter, rankMetric]
  );
  const summaryCards = [
    { label: "BEST RANGE", item: bestBucket },
    ...(parameter.lowerTailBuckets?.length ? [{ label: "BEST <= X", item: bestLowerTail }] : []),
    ...(parameter.upperTailBuckets?.length ? [{ label: "BEST >= X", item: bestUpperTail }] : []),
  ];

  return (
    <GlassCard className="p-0 overflow-hidden border border-white/[0.08] bg-[linear-gradient(180deg,rgba(11,10,8,0.96),rgba(8,8,7,0.98))] shadow-[0_22px_60px_-38px_rgba(0,0,0,0.92)]">
      <div className="border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(18,16,11,0.92),rgba(11,12,12,0.84))] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <div className={clsx("text-[12px] uppercase tracking-[0.20em] font-mono", accent.activeText)}>{parameter.label}</div>
            <div className="text-[10px] font-mono text-zinc-200 mt-1.5">
              {num(parameter.observedMin, 2)} .. {num(parameter.observedMax, 2)} | n {intn(parameter.valueCount)} | b {intn(bucketCount)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-right">
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 min-w-[58px]">
              <div className="text-[8px] font-mono uppercase tracking-[0.16em] text-zinc-500">Trades</div>
              <div className="text-[11px] font-mono text-zinc-100 mt-0.5">{intn(parameter.baseTrades)}</div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 min-w-[58px]">
              <div className="text-[8px] font-mono uppercase tracking-[0.16em] text-zinc-500">PnL</div>
              <div className={clsx("text-[11px] font-mono mt-0.5", valueTextClass(baseTotalPnl, "text-zinc-100"))}>
                {num(baseTotalPnl, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 min-w-[58px]">
              <div className="text-[8px] font-mono uppercase tracking-[0.16em] text-zinc-500">Avg</div>
              <div className={clsx("text-[11px] font-mono mt-0.5", valueTextClass(baseAvgPnl, "text-zinc-100"))}>
                {num(baseAvgPnl, 2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3">
      <div className={clsx("grid gap-1.5 mb-3", summaryCards.length >= 3 ? "grid-cols-1 md:grid-cols-3" : summaryCards.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        {summaryCards.map((entry) => (
          <div key={`${parameter.key}-${entry.label}`} className="rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(14,13,11,0.72),rgba(9,9,10,0.9))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500 mb-1">{entry.label}</div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-zinc-100">{entry.item?.label ?? "-"}</div>
                <div className="text-[10px] font-mono mt-1.5">
                  <span className={clsx(valueTextClass(entry.item?.avgPnlUsd ?? 0, "text-zinc-400"))}>
                    avg {num(entry.item?.avgPnlUsd, 2)}
                  </span>
                  {" | "}
                  <span className="text-zinc-400">pnl {num(entry.item?.totalPnlUsd, 2)}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-mono text-zinc-400">trades {intn(entry.item?.trades)}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-1">hit {num((entry.item?.winRate ?? 0) * 100, 1)}%</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
              <span className={clsx("rounded-md border px-1.5 py-0.5", valueChipClass((entry.item?.avgPnlUsd ?? 0) - baseAvgPnl))}>
                dAvg {num((entry.item?.avgPnlUsd ?? 0) - baseAvgPnl, 2)}
              </span>
              <span className={clsx("rounded-md border px-1.5 py-0.5", valueChipClass((entry.item?.totalPnlUsd ?? 0) - baseTotalPnl))}>
                dPnL {num((entry.item?.totalPnlUsd ?? 0) - baseTotalPnl, 2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 xl:grid-cols-8 gap-1 mb-3">
        {buckets.map((bucket) => (
          <div
            key={`heat-${bucket.bucketId}`}
            className={clsx(
              "h-7 rounded border border-white/[0.06] flex items-center justify-center text-[9px] font-mono bg-black/20",
              bucket.avgPnlUsd > 0
                ? "bg-[#6ee7b7]/20 text-[#6ee7b7]"
                : bucket.avgPnlUsd < 0
                  ? "bg-[#f87171]/20 text-[#f87171]"
                  : "bg-white/[0.04] text-zinc-400"
            )}
            title={`${bucket.label} | avg ${num(bucket.avgPnlUsd, 2)} | pnl ${num(bucket.totalPnlUsd, 2)} | trades ${intn(bucket.trades)}`}
            style={{ opacity: Math.max(0.35, bucket.coveragePct) }}
          >
            {num(bucket.avgPnlUsd, 1)}
          </div>
        ))}
      </div>

      <div className="space-y-1.5 mb-3 rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(12,12,12,0.9),rgba(9,9,9,0.95))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex items-center justify-between">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Range Strength</div>
          <div className="text-[9px] font-mono text-zinc-600">score</div>
        </div>
        {buckets.map((bucket) => {
          const widthPct = Math.max(6, (Math.abs(bucket.score) / maxAbsScore) * 100);
          return (
            <div key={bucket.bucketId} className="grid grid-cols-[118px_1fr_58px] gap-2 items-center">
              <div className="text-[10px] font-mono text-zinc-400 truncate" title={bucket.label}>
                {bucket.label}
              </div>
              <div className="h-[18px] rounded bg-black/20 border border-white/[0.06] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div
                  className={clsx(
                    "h-full",
                    bucket.score >= 0 ? "bg-[#6ee7b7]/80" : "bg-[#f3a6b2]/80"
                  )}
                  style={{ width: `${widthPct}%`, opacity: bucket.coveragePct < 0.08 ? 0.4 : 1 }}
                />
              </div>
              <div className={clsx("text-right text-[10px] font-mono font-semibold tabular-nums", scoreTextClass(bucket.score))}>
                {num(bucket.score, 2)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-auto rounded-xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,12,12,0.96),rgba(8,8,8,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <table className="min-w-[760px] w-full text-[11px] font-mono">
          <thead className="sticky top-0 z-10 bg-[#111111]/95 text-zinc-400 border-b border-white/[0.08]">
            <tr>
              <th className="text-left px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">Range</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">N</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">Cov</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">Win</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">dW</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">PnL</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">dP</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">Avg</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">dA</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[9px]">W/L</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={`${parameter.key}-${bucket.bucketId}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                <td className="px-2 py-1.5 text-zinc-200 whitespace-nowrap">{bucket.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{intn(bucket.trades)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{num(bucket.coveragePct * 100, 1)}%</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{num(bucket.winRate * 100, 1)}%</td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums", valueTextClass(bucket.winRate - baseWinRate))}>
                  {num((bucket.winRate - baseWinRate) * 100, 1)}%
                </td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums", valueTextClass(bucket.totalPnlUsd))}>
                  {num(bucket.totalPnlUsd, 2)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums", valueTextClass(bucket.totalPnlUsd - baseTotalPnl))}>
                  {num(bucket.totalPnlUsd - baseTotalPnl, 2)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums font-bold", valueTextClass(bucket.avgPnlUsd))}>
                  {num(bucket.avgPnlUsd, 2)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums font-bold", valueTextClass(bucket.avgPnlUsd - baseAvgPnl))}>
                  {num(bucket.avgPnlUsd - baseAvgPnl, 2)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                  {intn(bucket.wins)} / {intn(bucket.losses)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </GlassCard>
  );
}

function StartsByTimeChart({
  rows,
  title,
  meta,
  fullscreen = false,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 320;
  const padLeft = 22;
  const padRight = 40;
  const padTop = 40;
  const footerH = 40;
  const padBottom = 56;

  const bins = useMemo(() => {
    const m = new Map<number, { ok: number; bad: number }>();
    for (const r of rows) {
      const idx = Number(r.startMinuteIdx);
      if (!Number.isFinite(idx)) continue;
      const b = Math.trunc(idx / 5) * 5;
      const prev = m.get(b) ?? { ok: 0, bad: 0 };
      if ((r.totalPnlUsd ?? 0) > 0) prev.ok += 1;
      else prev.bad += 1;
      m.set(b, prev);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  if (!bins.length) {
    return (
      <div className="w-full h-[360px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No start events for chart.
      </div>
    );
  }

  const maxY = Math.max(1, ...bins.map(([, v]) => Math.max(v.ok, v.bad)));
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const barGap = 2;
  const groupW = Math.max(8, Math.floor(plotW / bins.length) - barGap);
  const barW = Math.max(3, Math.floor((groupW - 1) / 2));
  const yTicks = [0, Math.ceil(maxY * 0.33), Math.ceil(maxY * 0.66), maxY];
  const xTickItems = (() => {
    const src = bins.map(([idx], i) => ({ idx, i }));
    const target = Math.max(4, Math.min(10, src.length));
    const sampled = Array.from({ length: target }, (_, k) => src[Math.round((k / (target - 1)) * (src.length - 1))]);
    const uniq = sampled.filter((t, i, arr) => i === 0 || t.i !== arr[i - 1].i);
    const out: Array<{ idx: number; x: number }> = [];
    let lastX = -1e9;
    for (const t of uniq) {
      const x = padLeft + t.i * (groupW + barGap) + groupW / 2;
      const mustKeep = t.i === 0 || t.i === src.length - 1;
      if (!mustKeep && x - lastX < 86) continue;
      out.push({ idx: t.idx, x });
      lastX = x;
    }
    return out;
  })();
  const totalOk = bins.reduce((s, [, v]) => s + v.ok, 0);
  const totalBad = bins.reduce((s, [, v]) => s + v.bad, 0);
  const total = totalOk + totalBad;
  const hit = total > 0 ? totalOk / total : 0;
  const avgOkBin = bins.length ? totalOk / bins.length : 0;
  const avgBadBin = bins.length ? totalBad / bins.length : 0;
  const bestOk = bins.reduce((best, cur) => (cur[1].ok > best[1].ok ? cur : best), bins[0]);
  const bestBad = bins.reduce((best, cur) => (cur[1].bad > best[1].bad ? cur : best), bins[0]);

  return (
    <div className="scanner-glass-card relative w-full h-[320px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <div className="absolute top-7 left-3 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300/90" />
          START OK
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/90" />
          START BAD
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full">
        <defs>
          <linearGradient id="starts-ok-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(110,231,183,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0.25)" />
          </linearGradient>
          <linearGradient id="starts-bad-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SOFT_LOSS_SOLID} />
            <stop offset="100%" stopColor={SOFT_LOSS_MUTED} />
          </linearGradient>
        </defs>

        {yTicks.map((t) => {
          const y = padTop + plotH - (t / maxY) * plotH;
          return (
            <g key={`y-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              {t > 0 && (
                <text x={w - 8} y={y - 3} textAnchor="end" fontSize="16" className="fill-zinc-300 font-mono">
                  {t}
                </text>
              )}
            </g>
          );
        })}

        {bins.map(([idx, v], i) => {
          const xBase = padLeft + i * (groupW + barGap);
          const hOk = plotH * (v.ok / maxY);
          const hBad = plotH * (v.bad / maxY);
          const yOk = padTop + plotH - hOk;
          const yBad = padTop + plotH - hBad;
          return (
            <g key={`${idx}-${i}`}>
              <rect x={xBase} y={yOk} width={barW} height={hOk} rx="3" fill="url(#starts-ok-bar)" stroke="rgba(110,231,183,0.55)" strokeWidth="0.6" />
              <rect x={xBase + barW + 1} y={yBad} width={barW} height={hBad} rx="3" fill="url(#starts-bad-bar)" stroke={SOFT_LOSS_STROKE} strokeWidth="0.6" />
            </g>
          );
        })}

        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.15)" />

        {xTickItems.map((t, i) => {
          const anchor = i === 0 ? "start" : i === xTickItems.length - 1 ? "end" : "middle";
          return (
            <text key={`x-${t.idx}-${i}`} x={t.x} y={h - footerH + 12} textAnchor={anchor as any} fontSize="18" className="fill-zinc-200 font-mono">
              {minuteIdxToClockLabel(t.idx)}
            </text>
          );
        })}
      </svg>

      <div className="absolute bottom-0 inset-x-0 h-[40px] border-t border-white/[0.08] bg-[#0a0a0a]/55 px-3 py-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-emerald-300/90">ok {intn(totalOk)}</span>
          <span className="text-rose-300/90">bad {intn(totalBad)}</span>
          <span className="text-zinc-500">hit {num(hit * 100, 1)}%</span>
          <span className="text-zinc-500">avg/bin {num(avgOkBin, 2)} / {num(avgBadBin, 2)}</span>
          <span className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
            best ok: <span className="text-emerald-300">{minuteIdxToClockLabel(bestOk[0])}</span> ({intn(bestOk[1].ok)})
          </span>
          <span className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
            best bad: <span className="text-rose-300">{minuteIdxToClockLabel(bestBad[0])}</span> ({intn(bestBad[1].bad)})
          </span>
        </div>
      </div>
    </div>
  );
}

function StartsEndsByTimeChart({
  rows,
  title,
  meta,
  fullscreen = false,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 360;
  const padLeft = 22;
  const padRight = 40;
  const padTop = 56;
  const padBottom = 40;

  const bins = useMemo(() => {
    const m = new Map<number, { starts: number; ends: number }>();
    for (const r of rows) {
      const s = Number(r.startMinuteIdx);
      const e = Number(r.endMinuteIdx);

      if (Number.isFinite(s)) {
        const b = Math.trunc(s / 5) * 5;
        const prev = m.get(b) ?? { starts: 0, ends: 0 };
        prev.starts += 1;
        m.set(b, prev);
      }
      if (Number.isFinite(e)) {
        const b = Math.trunc(e / 5) * 5;
        const prev = m.get(b) ?? { starts: 0, ends: 0 };
        prev.ends += 1;
        m.set(b, prev);
      }
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  if (!bins.length) {
    return (
      <div className="w-full h-[360px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No start/end events for chart.
      </div>
    );
  }

  const maxY = Math.max(1, ...bins.map(([, v]) => Math.max(v.starts, v.ends)));
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const barGap = 2;
  const groupW = Math.max(8, Math.floor(plotW / bins.length) - barGap);
  const barW = Math.max(3, Math.floor((groupW - 1) / 2));
  const yTicks = [0, Math.ceil(maxY * 0.33), Math.ceil(maxY * 0.66), maxY];

  return (
    <div className="scanner-glass-card relative w-full h-[360px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}

      <div className="absolute top-7 left-3 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300/90" />
          START
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/80" />
          END
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full">
        <defs>
          <linearGradient id="se-start" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(110,231,183,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0.25)" />
          </linearGradient>
          <linearGradient id="se-end" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SOFT_LOSS_SOLID} />
            <stop offset="100%" stopColor={SOFT_LOSS_MUTED} />
          </linearGradient>
        </defs>

        {yTicks.map((t) => {
          const y = padTop + plotH - (t / maxY) * plotH;
          return (
            <g key={`y-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              <text x={w - 8} y={y - 3} textAnchor="end" fontSize="14" className="fill-zinc-400 font-mono">
                {t}
              </text>
            </g>
          );
        })}

        {bins.map(([idx, v], i) => {
          const xBase = padLeft + i * (groupW + barGap);
          const hs = plotH * (v.starts / maxY);
          const he = plotH * (v.ends / maxY);
          const ys = padTop + plotH - hs;
          const ye = padTop + plotH - he;
          return (
            <g key={`${idx}-${i}`}>
              <rect x={xBase} y={ys} width={barW} height={hs} rx="3" fill="url(#se-start)" stroke="rgba(110,231,183,0.55)" strokeWidth="0.6" />
              <rect x={xBase + barW + 1} y={ye} width={barW} height={he} rx="3" fill="url(#se-end)" stroke={SOFT_LOSS_STROKE} strokeWidth="0.6" />
            </g>
          );
        })}

        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.15)" />

        {bins
          .filter((_, i) => i % Math.ceil(bins.length / 8) === 0 || i === bins.length - 1)
          .map(([idx], i) => {
            const pos = bins.findIndex(([k]) => k === idx);
            const x = padLeft + pos * (groupW + barGap) + groupW / 2;
            return (
              <text key={`x-${idx}-${i}`} x={x} y={h - 8} textAnchor="middle" fontSize="14" className="fill-zinc-300 font-mono">
                {minuteIdxToClockLabel(idx)}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

function PeakStrengthByTimeChart({
  rows,
  title,
  meta,
  fullscreen = false,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 320;
  const padLeft = 28;
  const padRight = 46;
  const padTop = 40;
  const footerH = 40;
  const padBottom = 56;

  const bins = useMemo(() => {
    const m = new Map<number, { count: number; sumAbs: number }>();
    for (const r of rows) {
      const p = Number(r.peakMinuteIdx);
      if (!Number.isFinite(p)) continue;
      const b = Math.trunc(p / 5) * 5;
      const peakAbs = Math.abs(Number(r.peakMetricAbs ?? r.peakMetric ?? 0));
      const prev = m.get(b) ?? { count: 0, sumAbs: 0 };
      prev.count += 1;
      prev.sumAbs += Number.isFinite(peakAbs) ? peakAbs : 0;
      m.set(b, prev);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, v]) => ({ idx, count: v.count, avgAbs: v.count ? v.sumAbs / v.count : 0 }));
  }, [rows]);

  if (!bins.length) {
    return (
      <div className="w-full h-[360px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No peak events for chart.
      </div>
    );
  }

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const maxAbs = Math.max(0.0001, ...bins.map((b) => b.avgAbs));
  const barGap = 1;
  const barW = Math.max(3, Math.floor(plotW / bins.length) - barGap);

  const toX = (i: number) => padLeft + i * (barW + barGap) + barW / 2;
  const toYCount = (v: number) => padTop + plotH - (v / maxCount) * plotH;
  const toYAbs = (v: number) => padTop + plotH - (v / maxAbs) * plotH;
  const lineD = bins
    .map((b, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toYAbs(b.avgAbs).toFixed(2)}`)
    .join(" ");
  const peakVals = bins.map((b) => b.avgAbs);
  const avgPeak = peakVals.length ? peakVals.reduce((s, v) => s + v, 0) / peakVals.length : 0;
  const sortedPeak = [...peakVals].sort((a, b) => a - b);
  const medPeak = sortedPeak.length ? sortedPeak[Math.floor((sortedPeak.length - 1) * 0.5)] : 0;
  const p90Peak = sortedPeak.length ? sortedPeak[Math.floor((sortedPeak.length - 1) * 0.9)] : 0;
  const maxCountBin = bins.reduce((best, cur) => (cur.count > best.count ? cur : best), bins[0]);
  const strengthRanges = [
    { label: "<0.5", min: 0, max: 0.5 },
    { label: "0.5-1", min: 0.5, max: 1 },
    { label: "1-2", min: 1, max: 2 },
    { label: "2-4", min: 2, max: 4 },
    { label: "4+", min: 4, max: Number.POSITIVE_INFINITY },
  ];
  const strengthDist = strengthRanges.map((r) => ({
    ...r,
    count: bins.filter((b) => b.avgAbs >= r.min && b.avgAbs < r.max).reduce((s, b) => s + b.count, 0),
  }));
  const xTickItems = (() => {
    const src = bins.map((b, i) => ({ idx: b.idx, i }));
    const target = Math.max(4, Math.min(10, src.length));
    const sampled = Array.from({ length: target }, (_, k) => src[Math.round((k / (target - 1)) * (src.length - 1))]);
    const uniq = sampled.filter((t, i, arr) => i === 0 || t.i !== arr[i - 1].i);
    const out: Array<{ idx: number; x: number }> = [];
    let lastX = -1e9;
    for (const t of uniq) {
      const x = toX(t.i);
      const mustKeep = t.i === 0 || t.i === src.length - 1;
      if (!mustKeep && x - lastX < 86) continue;
      out.push({ idx: t.idx, x });
      lastX = x;
    }
    return out;
  })();

  return (
    <div className="scanner-glass-card relative w-full h-[320px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}

      <div className="absolute top-7 left-3 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-400/80" />
          COUNT
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300/90" />
          AVG PEAK ABS
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full">
        <defs>
          <linearGradient id="peak-count" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(167,139,250,0.95)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0.25)" />
          </linearGradient>
          <filter id="peak-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0, 0.33, 0.66, 1].map((t, i) => {
          const y = padTop + plotH - t * plotH;
          const left = Math.round(t * maxCount);
          const right = num(t * maxAbs, 3);
          return (
            <g key={`grid-${i}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              {left > 0 && (
                <text x={padLeft + 2} y={y - 3} fontSize="16" className="fill-zinc-300 font-mono">
                  {left}
                </text>
              )}
              {t > 0 && (
                <text x={w - 8} y={y - 3} textAnchor="end" fontSize="16" className="fill-amber-200/80 font-mono">
                  {right}
                </text>
              )}
            </g>
          );
        })}

        {bins.map((b, i) => {
          const x = padLeft + i * (barW + barGap);
          const hh = plotH * (b.count / maxCount);
          const y = padTop + plotH - hh;
          return <rect key={`b-${b.idx}-${i}`} x={x} y={y} width={barW} height={hh} rx="3" fill="url(#peak-count)" stroke="rgba(196,181,253,0.55)" strokeWidth="0.6" />;
        })}

        <path d={lineD} fill="none" stroke="rgba(252,211,77,0.95)" strokeWidth="2" filter="url(#peak-line-glow)" />
        {bins.map((b, i) => (
          <circle key={`p-${b.idx}-${i}`} cx={toX(i)} cy={toYAbs(b.avgAbs)} r="2.5" fill="rgba(252,211,77,0.95)" />
        ))}

        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.15)" />
        {xTickItems.map((t, i) => {
          const anchor = i === 0 ? "start" : i === xTickItems.length - 1 ? "end" : "middle";
          return (
            <text key={`x-${t.idx}-${i}`} x={t.x} y={h - footerH + 12} textAnchor={anchor as any} fontSize="18" className="fill-zinc-200 font-mono">
              {minuteIdxToClockLabel(t.idx)}
            </text>
          );
        })}
      </svg>

      <div className="absolute bottom-0 inset-x-0 h-[40px] border-t border-white/[0.08] bg-[#0a0a0a]/55 px-3 py-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-zinc-500">avg {num(avgPeak, 3)}</span>
          <span className="text-zinc-500">median {num(medPeak, 3)}</span>
          <span className="text-zinc-500">p90 {num(p90Peak, 3)}</span>
          <span className="text-violet-300/90">max count {intn(maxCountBin.count)} @ {minuteIdxToClockLabel(maxCountBin.idx)}</span>
          {strengthDist.map((d) => (
            <span key={d.label} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
              {d.label}: <span className="text-amber-300">{intn(d.count)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PeakReversionTwoThirdsChart({
  rows,
  title,
  meta,
  fullscreen = false,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 320;
  const padLeft = 22;
  const padRight = 40;
  const padTop = 40;
  const footerH = 40;
  const padBottom = 56;

  const bins = useMemo(() => {
    const m = new Map<number, { yes: number; no: number }>();
    for (const r of rows) {
      const t = Number(r.peakMinuteIdx);
      if (!Number.isFinite(t)) continue;
      const b = Math.trunc(t / 5) * 5;

      const peakAbs = Math.abs(Number(r.peakMetricAbs ?? 0));
      const endAbs = Math.abs(Number(r.endMetricAbs ?? 0));
      const revertedFrac = peakAbs > 0 ? (peakAbs - endAbs) / peakAbs : 0;
      const ok = revertedFrac >= 2 / 3;

      const prev = m.get(b) ?? { yes: 0, no: 0 };
      if (ok) prev.yes += 1;
      else prev.no += 1;
      m.set(b, prev);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  const stats = useMemo(() => {
    const valsAll: number[] = [];
    const valsYes: number[] = [];
    const valsNo: number[] = [];
    const distRanges = [
      { label: "<0.5", min: 0, max: 0.5 },
      { label: "0.5-1", min: 0.5, max: 1 },
      { label: "1-2", min: 1, max: 2 },
      { label: "2-4", min: 2, max: 4 },
      { label: "4+", min: 4, max: Number.POSITIVE_INFINITY },
    ];
    const dist = distRanges.map((r) => ({ ...r, yes: 0, no: 0 }));

    for (const r of rows) {
      const peakAbs = Math.abs(Number(r.peakMetricAbs ?? 0));
      if (!Number.isFinite(peakAbs) || peakAbs <= 0) continue;
      const endAbs = Math.abs(Number(r.endMetricAbs ?? 0));
      const revertedFrac = peakAbs > 0 ? (peakAbs - endAbs) / peakAbs : 0;
      const ok = revertedFrac >= 2 / 3;

      valsAll.push(peakAbs);
      if (ok) valsYes.push(peakAbs);
      else valsNo.push(peakAbs);

      const bucket = dist.find((d) => peakAbs >= d.min && peakAbs < d.max);
      if (bucket) {
        if (ok) bucket.yes += 1;
        else bucket.no += 1;
      }
    }

    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const pctl = (a: number[], p: number) => {
      if (!a.length) return 0;
      const s = [...a].sort((x, y) => x - y);
      const idx = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
      return s[idx] ?? 0;
    };
    return {
      avgAll: avg(valsAll),
      medAll: pctl(valsAll, 0.5),
      p90All: pctl(valsAll, 0.9),
      avgYes: avg(valsYes),
      avgNo: avg(valsNo),
      dist,
    };
  }, [rows]);

  if (!bins.length) {
    return (
      <div className="w-full h-[320px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center">
        No peak reversion data.
      </div>
    );
  }

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const maxY = Math.max(1, ...bins.map(([, v]) => Math.max(v.yes, v.no)));
  const barGap = 2;
  const groupW = Math.max(8, Math.floor(plotW / bins.length) - barGap);
  const barW = Math.max(3, Math.floor((groupW - 1) / 2));
  const totalYes = bins.reduce((s, [, v]) => s + v.yes, 0);
  const totalNo = bins.reduce((s, [, v]) => s + v.no, 0);
  const total = totalYes + totalNo;
  const yesRate = total ? totalYes / total : 0;
  const xTickItems = (() => {
    const src = bins.map(([idx], i) => ({ idx, i }));
    const target = Math.max(4, Math.min(10, src.length));
    const sampled = Array.from({ length: target }, (_, k) => src[Math.round((k / (target - 1)) * (src.length - 1))]);
    const uniq = sampled.filter((t, i, arr) => i === 0 || t.i !== arr[i - 1].i);
    const out: Array<{ idx: number; x: number }> = [];
    let lastX = -1e9;
    for (const t of uniq) {
      const x = padLeft + t.i * (groupW + barGap) + groupW / 2;
      const mustKeep = t.i === 0 || t.i === src.length - 1;
      if (!mustKeep && x - lastX < 86) continue;
      out.push({ idx: t.idx, x });
      lastX = x;
    }
    return out;
  })();

  return (
    <div className="scanner-glass-card relative w-full h-[320px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <div className="absolute top-7 left-3 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300/90" />
          REVERTED ≥ 2/3
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/90" />
          NOT REVERTED
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          hit {num(yesRate * 100, 1)}%
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full">
        <defs>
          <linearGradient id="rev-yes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(110,231,183,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0.25)" />
          </linearGradient>
          <linearGradient id="rev-no" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SOFT_LOSS_SOLID} />
            <stop offset="100%" stopColor={SOFT_LOSS_MUTED} />
          </linearGradient>
        </defs>

        {[0, 0.33, 0.66, 1].map((t, i) => {
          const y = padTop + plotH - t * plotH;
          const val = Math.round(t * maxY);
          return (
            <g key={`y-${i}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              {val > 0 && (
                <text x={w - 8} y={y - 3} textAnchor="end" fontSize="16" className="fill-zinc-300 font-mono">
                  {val}
                </text>
              )}
            </g>
          );
        })}

        {bins.map(([idx, v], i) => {
          const xBase = padLeft + i * (groupW + barGap);
          const hYes = plotH * (v.yes / maxY);
          const hNo = plotH * (v.no / maxY);
          const yYes = padTop + plotH - hYes;
          const yNo = padTop + plotH - hNo;
          return (
            <g key={`${idx}-${i}`}>
              <rect x={xBase} y={yYes} width={barW} height={hYes} rx="3" fill="url(#rev-yes)" stroke="rgba(110,231,183,0.55)" strokeWidth="0.6" />
              <rect x={xBase + barW + 1} y={yNo} width={barW} height={hNo} rx="3" fill="url(#rev-no)" stroke={SOFT_LOSS_STROKE} strokeWidth="0.6" />
            </g>
          );
        })}

        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.15)" />
        {xTickItems.map((t, i) => {
          const anchor = i === 0 ? "start" : i === xTickItems.length - 1 ? "end" : "middle";
          return (
            <text key={`x-${t.idx}-${i}`} x={t.x} y={h - footerH + 12} textAnchor={anchor as any} fontSize="18" className="fill-zinc-200 font-mono">
              {minuteIdxToClockLabel(t.idx)}
            </text>
          );
        })}
      </svg>

      <div className="absolute bottom-0 inset-x-0 h-[40px] border-t border-white/[0.08] bg-[#0a0a0a]/55 px-3 py-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-zinc-500">peakAbs avg {num(stats.avgAll, 3)}</span>
          <span className="text-zinc-500">median {num(stats.medAll, 3)}</span>
          <span className="text-zinc-500">p90 {num(stats.p90All, 3)}</span>
          <span className="text-emerald-300/90">avg(reverted) {num(stats.avgYes, 3)}</span>
          <span className="text-rose-300/90">avg(not) {num(stats.avgNo, 3)}</span>
          {stats.dist.map((d) => (
            <span key={d.label} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
              {d.label}: <span className="text-emerald-300">{intn(d.yes)}</span>/<span className="text-rose-300">{intn(d.no)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeResearchSeriesChart({
  rows,
  parallelSeries = [],
  title,
  meta,
  resultKey,
  resultFormat,
  accent = "emerald",
  fullscreen = false,
}: {
  rows: Array<ScopeResearchBinRow | ScopeResearchThresholdRow>;
  parallelSeries?: Array<{
    id: string;
    label: string;
    rows: Array<ScopeResearchBinRow | ScopeResearchThresholdRow>;
  }>;
  title: string;
  meta?: string;
  resultKey: ScopeResearchResultKey;
  resultFormat: ScopeResearchValueFormat;
  accent?: "emerald" | "amber";
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = fullscreen ? 2800 : 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 24;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 62;
  const padBottom = 96;
  const splitGap = 10;
  const topH = h - padTop - padBottom - 72;
  const barsTop = padTop + topH + splitGap;
  const barsH = h - barsTop - padBottom;

  if (!rows.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[360px]")}>
        No scope data for selected settings.
      </div>
    );
  }
  if (rows.length < 3) {
    return <ScopeResearchInsufficientState message="Need at least 3 populated groups for this graph." />;
  }

  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const metricLabel = scopeResearchMetricLabel(resultKey);
  const metricValues = rows.map((row) => scopeResearchMetricValue(row, resultKey));
  const medianValues = rows.map((row) => row.median);
  const winRateValues = rows.map((row) => row.winRate);
  const parallelMetricValues = parallelSeries.flatMap((series) => series.rows.map((row) => scopeResearchMetricValue(row, resultKey)));
  const supportValues =
    resultKey === "winRate" ? [] : resultKey === "avgPnlUsd" || resultKey === "score" ? medianValues : winRateValues;
  const minMetric = Math.min(...metricValues, ...(supportValues.length ? supportValues : []), ...(parallelMetricValues.length ? parallelMetricValues : [0]));
  const maxMetric = Math.max(...metricValues, ...(supportValues.length ? supportValues : []), ...(parallelMetricValues.length ? parallelMetricValues : [0]));
  const metricSpan = maxMetric - minMetric || 1;
  const xAt = (index: number) =>
    rows.length === 1 ? (padLeft + (w - padRight)) / 2 : padLeft + (index / (rows.length - 1)) * (w - padLeft - padRight);
  const yMetric = (value: number) => padTop + (1 - (value - minMetric) / metricSpan) * topH;
  const yBar = (value: number) => barsTop + barsH - (value / maxCount) * barsH;
  const lineD = metricValues.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yMetric(value).toFixed(2)}`).join(" ");
  const medianD = medianValues
    .map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yMetric(value).toFixed(2)}`)
    .join(" ");
  const winD = winRateValues
    .map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${(padTop + (1 - value) * topH).toFixed(2)}`)
    .join(" ");
  const areaD = `${lineD} L ${xAt(rows.length - 1).toFixed(2)} ${(padTop + topH).toFixed(2)} L ${xAt(0).toFixed(2)} ${(padTop + topH).toFixed(2)} Z`;
  const accentStops =
    accent === "amber"
      ? {
          strokeA: "rgba(251,191,36,0.95)",
          strokeB: "rgba(245,158,11,0.9)",
          fillA: "rgba(251,191,36,0.28)",
          fillB: "rgba(251,191,36,0.02)",
          bar: "rgba(245,158,11,0.7)",
        }
      : {
          strokeA: "rgba(45,212,191,0.95)",
          strokeB: "rgba(110,231,183,0.95)",
          fillA: "rgba(16,185,129,0.3)",
          fillB: "rgba(16,185,129,0.02)",
          bar: "rgba(56,189,248,0.58)",
        };
  const parallelPalette = [
    { stroke: "rgba(56,189,248,0.95)", chip: "border-sky-500/15 bg-sky-500/8 text-sky-300/90" },
    { stroke: "rgba(217,70,239,0.95)", chip: "border-fuchsia-500/15 bg-fuchsia-500/8 text-fuchsia-300/90" },
    { stroke: "rgba(251,191,36,0.95)", chip: "border-amber-500/15 bg-amber-500/8 text-amber-300/90" },
    { stroke: SOFT_LOSS_SOLID, chip: SOFT_LOSS_CHIP },
  ];

  const showTooltip = (
    event: React.MouseEvent<SVGElement>,
    row: ScopeResearchBinRow | ScopeResearchThresholdRow,
    seriesLabel?: string
  ) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: seriesLabel ? `${seriesLabel} | ${row.label}` : row.label,
      accent: accent === "amber" ? "amber" : "emerald",
      lines: [
        `${metricLabel} ${scopeResearchFormatValue(scopeResearchMetricValue(row, resultKey), resultFormat)}`,
        `median ${scopeResearchFormatValue(row.median, resultFormat)}`,
        `total ${scopeResearchFormatValue(row.total, resultFormat)}`,
        `count ${intn(row.count)}`,
        `win ${num(row.winRate * 100, 1)}%`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-2 py-0.5 text-emerald-300/90">{metricLabel}</span>
        {resultKey !== "winRate" ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-zinc-400">median</span> : null}
        {resultKey !== "totalPnlUsd" ? <span className="rounded-full border border-violet-500/15 bg-violet-500/8 px-2 py-0.5 text-violet-300/90">win</span> : null}
        <span className="rounded-full border border-sky-500/15 bg-sky-500/8 px-2 py-0.5 text-sky-300/90">count</span>
        {parallelSeries.map((series, index) => (
          <span
            key={`parallel-chip-${series.id}`}
            className={clsx("rounded-full border px-2 py-0.5 max-w-[180px] truncate", parallelPalette[index % parallelPalette.length]?.chip)}
            title={series.label}
          >
            {series.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id={`scope-line-${chartId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={accentStops.strokeA} />
            <stop offset="100%" stopColor={accentStops.strokeB} />
          </linearGradient>
          <linearGradient id={`scope-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentStops.fillA} />
            <stop offset="100%" stopColor={accentStops.fillB} />
          </linearGradient>
          <linearGradient id={`scope-bars-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentStops.bar} />
            <stop offset="100%" stopColor="rgba(15,23,42,0.18)" />
          </linearGradient>
          <filter id={`scope-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={padLeft} y={padTop} width={w - padLeft - padRight} height={topH} fill="rgba(8,15,26,0.45)" rx="14" />
        <rect x={padLeft} y={barsTop} width={w - padLeft - padRight} height={barsH} fill="rgba(8,15,26,0.28)" rx="14" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + topH - t * topH;
          const value = minMetric + metricSpan * t;
          return (
            <g key={`metric-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(value, resultFormat)}
              </text>
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={padTop + topH} y2={padTop + topH} stroke="rgba(255,255,255,0.12)" />
        <path d={areaD} fill={`url(#scope-fill-${chartId})`} />
        {resultKey !== "winRate" ? <path d={medianD} fill="none" stroke="rgba(244,244,245,0.35)" strokeWidth="1.2" strokeDasharray="5 5" /> : null}
        {resultKey !== "totalPnlUsd" ? <path d={winD} fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.4" strokeDasharray="4 5" /> : null}
        <path d={lineD} fill="none" stroke={`url(#scope-line-${chartId})`} strokeWidth="2.8" filter={`url(#scope-glow-${chartId})`} />
        {parallelSeries.map((series, seriesIndex) => {
          const color = parallelPalette[seriesIndex % parallelPalette.length]?.stroke ?? "rgba(56,189,248,0.95)";
          const rowsByLabel = new Map(series.rows.map((row) => [row.label, row]));
          const points = rows
            .map((row, index) => {
              const match = rowsByLabel.get(row.label);
              return match ? { row: match, index } : null;
            })
            .filter(Boolean) as Array<{ row: ScopeResearchBinRow | ScopeResearchThresholdRow; index: number }>;
          if (points.length < 2) return null;
          const pathD = points
            .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(point.index).toFixed(2)} ${yMetric(scopeResearchMetricValue(point.row, resultKey)).toFixed(2)}`)
            .join(" ");
          return (
            <g key={`parallel-series-${series.id}`}>
              <path d={pathD} fill="none" stroke={color} strokeWidth="2.1" strokeDasharray="6 5" opacity="0.95" />
              {points.map((point) => (
                <circle
                  key={`parallel-point-${series.id}-${point.index}`}
                  cx={xAt(point.index)}
                  cy={yMetric(scopeResearchMetricValue(point.row, resultKey))}
                  r="3.2"
                  fill={color}
                  onMouseMove={(event) => showTooltip(event, point.row, series.label)}
                  onMouseEnter={(event) => showTooltip(event, point.row, series.label)}
                />
              ))}
            </g>
          );
        })}
        {rows.map((row, index) => {
          const x = xAt(index);
          const barW = Math.max(14, Math.min(34, (w - padLeft - padRight) / Math.max(1, rows.length) - 10));
          const y = yBar(row.count);
          return (
            <g key={`${row.label}-${index}`}>
              <rect
                x={x - Math.max(20, barW)}
                y={padTop}
                width={Math.max(40, barW * 2)}
                height={h - padTop - padBottom + 8}
                fill="transparent"
                onMouseMove={(event) => showTooltip(event, row)}
                onMouseEnter={(event) => showTooltip(event, row)}
              />
              <rect
                x={x - barW / 2}
                y={y}
                width={barW}
                height={Math.max(3, barsTop + barsH - y)}
                rx="5"
                fill={`url(#scope-bars-${chartId})`}
                stroke="rgba(125,211,252,0.35)"
                strokeWidth="0.8"
              />
              <circle cx={x} cy={yMetric(scopeResearchMetricValue(row, resultKey))} r="4.2" fill={accentStops.strokeA} onMouseMove={(event) => showTooltip(event, row)} />
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={barsTop + barsH} y2={barsTop + barsH} stroke="rgba(255,255,255,0.12)" />
        {rows.map((row, index) => {
          const x = xAt(index);
          const [line1, line2] = scopeResearchLabelLines(row.label);
          const textAnchor = index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle";
          return (
            <g key={`tick-${row.label}`}>
              <line x1={x} x2={x} y1={barsTop + barsH} y2={barsTop + barsH + 6} stroke="rgba(255,255,255,0.2)" />
              <text x={x} y={h - 26} textAnchor={textAnchor} fontSize="10" className="fill-zinc-500 font-mono">
                <tspan x={x} dy="0">{line1}</tspan>
                {line2 ? <tspan x={x} dy="13">{line2}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScopeResearchBoxChart({
  rows,
  title,
  meta,
  resultFormat,
  fullscreen = false,
}: {
  rows: ScopeResearchBinRow[];
  title: string;
  meta?: string;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = fullscreen ? 2800 : 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 24;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 48;
  const padBottom = 92;
  if (!rows.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[360px]")}>
        No box groups for selected settings.
      </div>
    );
  }
  if (rows.length < 3) {
    return <ScopeResearchInsufficientState message="Need at least 3 populated boxes for `simple_box`." />;
  }
  const minY = Math.min(...rows.map((row) => row.lowerFence));
  const maxY = Math.max(...rows.map((row) => row.upperFence));
  const span = maxY - minY || 1;
  const plotH = h - padTop - padBottom;
  const xAt = (index: number) =>
    rows.length === 1 ? (padLeft + (w - padRight)) / 2 : padLeft + (index / Math.max(1, rows.length - 1)) * (w - padLeft - padRight);
  const yAt = (value: number) => padTop + (1 - (value - minY) / span) * plotH;
  const boxWidth = Math.max(28, Math.min(56, (w - padLeft - padRight) / Math.max(1, rows.length) - 10));

  const showTooltip = (event: React.MouseEvent<SVGElement>, row: ScopeResearchBinRow) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: row.label,
      accent: "cyan",
      lines: [
        `avg ${scopeResearchFormatValue(row.avg, resultFormat)}`,
        `median ${scopeResearchFormatValue(row.median, resultFormat)}`,
        `q1 ${scopeResearchFormatValue(row.q1, resultFormat)}`,
        `q3 ${scopeResearchFormatValue(row.q3, resultFormat)}`,
        `min/max ${scopeResearchFormatValue(row.min, resultFormat)} / ${scopeResearchFormatValue(row.max, resultFormat)}`,
        `count ${intn(row.count)}`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <filter id={`scope-box-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={padLeft} y={padTop} width={w - padLeft - padRight} height={plotH} fill="rgba(8,15,26,0.34)" rx="14" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH - t * plotH;
          const value = minY + span * t;
          return (
            <g key={`box-y-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(value, resultFormat)}
              </text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const x = xAt(index);
          const yMin = yAt(row.min);
          const yMax = yAt(row.max);
          const yQ1 = yAt(row.q1);
          const yMedian = yAt(row.median);
          const yQ3 = yAt(row.q3);
          const yLow = yAt(row.lowerFence);
          const yHigh = yAt(row.upperFence);
          return (
            <g key={`${row.label}-${index}`}>
              <rect
                x={x - Math.max(24, boxWidth)}
                y={padTop}
                width={Math.max(48, boxWidth * 2)}
                height={plotH}
                fill="transparent"
                onMouseEnter={(event) => showTooltip(event, row)}
                onMouseMove={(event) => showTooltip(event, row)}
              />
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke="rgba(255,255,255,0.35)" />
              <line x1={x - boxWidth / 3} x2={x + boxWidth / 3} y1={yMax} y2={yMax} stroke={SOFT_LOSS_LINE} />
              <line x1={x - boxWidth / 3} x2={x + boxWidth / 3} y1={yMin} y2={yMin} stroke={SOFT_LOSS_LINE} />
              <rect
                x={x - boxWidth / 2}
                y={yQ3}
                width={boxWidth}
                height={Math.max(3, yQ1 - yQ3)}
                rx="6"
                fill="rgba(34,211,238,0.16)"
                stroke="rgba(34,211,238,0.75)"
                filter={`url(#scope-box-glow-${chartId})`}
              />
              <line x1={x - boxWidth / 2} x2={x + boxWidth / 2} y1={yMedian} y2={yMedian} stroke="rgba(110,231,183,0.95)" strokeWidth="2" />
              <circle cx={x} cy={yAt(row.avg)} r="4.2" fill="rgba(250,204,21,0.92)" onMouseMove={(event) => showTooltip(event, row)} />
              <text x={x} y={padTop - 8} textAnchor="middle" fontSize="10" className="fill-zinc-500 font-mono">
                {intn(row.count)}
              </text>
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.12)" />
        {rows.map((row, index) => {
          const x = xAt(index);
          const [line1, line2] = scopeResearchLabelLines(row.label);
          const textAnchor = index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle";
          return (
            <g key={`box-tick-${row.label}`}>
              <line x1={x} x2={x} y1={h - padBottom} y2={h - padBottom + 6} stroke="rgba(255,255,255,0.2)" />
              <text x={x} y={h - 26} textAnchor={textAnchor} fontSize="10" className="fill-zinc-500 font-mono">
                <tspan x={x} dy="0">{line1}</tspan>
                {line2 ? <tspan x={x} dy="13">{line2}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScopeResearchDistributionChart({
  points,
  title,
  meta,
  resultFormat,
  fullscreen = false,
}: {
  points: ScopeResearchPoint[];
  title: string;
  meta?: string;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 24;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 60;
  const padBottom = 80;
  const values = points.map((point) => point.result).filter(Number.isFinite);
  const edges = scopeResearchEdges(values, Math.min(24, Math.max(8, Math.round(Math.sqrt(values.length)))));
  const bins =
    edges.length < 2
      ? []
      : Array.from({ length: edges.length - 1 }, (_, index) => {
          const from = edges[index] ?? 0;
          const to = edges[index + 1] ?? 0;
          const items = points.filter((point) =>
            index === edges.length - 2 ? point.result >= from && point.result <= to : point.result >= from && point.result < to
          );
          return {
            label: scopeResearchRangeLabel(from, to, resultFormat),
            from,
            to,
            count: items.length,
            positive: to >= 0,
          };
        }).filter((bin) => bin.count > 0);

  if (!bins.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
        No distribution data for selected settings.
      </div>
    );
  }
  if (bins.length < 3) {
    return <ScopeResearchInsufficientState message="Need at least 3 populated bars for `distribution`." />;
  }

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const minValue = edges[0] ?? 0;
  const maxValue = edges[edges.length - 1] ?? 1;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const barW = Math.max(10, Math.min(58, plotW / bins.length - 8));
  const xAt = (index: number) => padLeft + ((index + 0.5) / bins.length) * plotW;
  const yCount = (value: number) => padTop + plotH - (value / maxCount) * plotH;
  const meanX = padLeft + ((meanValue - minValue) / (maxValue - minValue || 1)) * plotW;

  const showTooltip = (
    event: React.MouseEvent<SVGElement>,
    bin: { label: string; count: number; from: number; to: number; positive: boolean }
  ) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: bin.label,
      accent: "fuchsia",
      lines: [
        `count ${intn(bin.count)}`,
        `from ${scopeResearchFormatValue(bin.from, resultFormat)}`,
        `to ${scopeResearchFormatValue(bin.to, resultFormat)}`,
        bin.positive ? "positive bucket" : "negative bucket",
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-2 py-0.5 text-emerald-300/90">positive</span>
        <span className="rounded-full border border-rose-500/15 bg-rose-500/8 px-2 py-0.5 text-rose-300/90">negative</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-zinc-400">mean</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id={`scope-dist-pos-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.78)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.14)" />
          </linearGradient>
          <linearGradient id={`scope-dist-neg-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,63,94,0.78)" />
            <stop offset="100%" stopColor="rgba(244,63,94,0.14)" />
          </linearGradient>
        </defs>
        <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="rgba(8,15,26,0.36)" rx="16" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH - t * plotH;
          return (
            <g key={`dist-grid-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {intn(Math.round(maxCount * t))}
              </text>
            </g>
          );
        })}
        {bins.map((bin, index) => {
          const x = xAt(index);
          const y = yCount(bin.count);
          return (
            <g key={`dist-bar-${bin.label}-${index}`}>
              <rect
                x={x - Math.max(18, barW)}
                y={padTop}
                width={Math.max(36, barW * 2)}
                height={plotH}
                fill="transparent"
                onMouseEnter={(event) => showTooltip(event, bin)}
                onMouseMove={(event) => showTooltip(event, bin)}
              />
              <rect
                x={x - barW / 2}
                y={y}
                width={barW}
                height={Math.max(3, padTop + plotH - y)}
                rx="8"
                fill={bin.positive ? `url(#scope-dist-pos-${chartId})` : `url(#scope-dist-neg-${chartId})`}
                stroke={bin.positive ? "rgba(16,185,129,0.32)" : "rgba(244,63,94,0.32)"}
              />
            </g>
          );
        })}
        <line x1={meanX} x2={meanX} y1={padTop} y2={padTop + plotH} stroke="rgba(244,244,245,0.55)" strokeDasharray="5 5" />
        <line x1={padLeft} x2={w - padRight} y1={padTop + plotH} y2={padTop + plotH} stroke="rgba(255,255,255,0.12)" />
        {bins.map((bin, index) => {
          const x = xAt(index);
          const [line1, line2] = scopeResearchLabelLines(bin.label);
          const textAnchor = index === 0 ? "start" : index === bins.length - 1 ? "end" : "middle";
          return (
            <g key={`dist-tick-${bin.label}`}>
              <line x1={x} x2={x} y1={padTop + plotH} y2={padTop + plotH + 6} stroke="rgba(255,255,255,0.18)" />
              <text x={x} y={h - 24} textAnchor={textAnchor} fontSize="10" className="fill-zinc-500 font-mono">
                <tspan x={x} dy="0">{line1}</tspan>
                {line2 ? <tspan x={x} dy="13">{line2}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScopeResearchViolinChart({
  rows,
  title,
  meta,
  resultFormat,
  fullscreen = false,
}: {
  rows: ScopeResearchBinRow[];
  title: string;
  meta?: string;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 24;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 60;
  const padBottom = 92;
  const barsH = 60;
  const plotH = h - padTop - padBottom - barsH;
  const barsTop = padTop + plotH + 12;
  if (!rows.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
        No violin groups for selected settings.
      </div>
    );
  }
  if (rows.length < 3) {
    return <ScopeResearchInsufficientState message="Need at least 3 populated violins for `beauty_violin`." />;
  }
  const minY = Math.min(...rows.map((row) => row.min));
  const maxY = Math.max(...rows.map((row) => row.max));
  const spanY = maxY - minY || 1;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const plotW = w - padLeft - padRight;
  const xAt = (index: number) =>
    rows.length === 1 ? padLeft + plotW / 2 : padLeft + (index / Math.max(1, rows.length - 1)) * plotW;
  const yAt = (value: number) => padTop + plotH - ((value - minY) / spanY) * plotH;
  const barW = Math.max(18, Math.min(44, plotW / Math.max(1, rows.length) - 10));
  const violinHalfW = Math.max(22, Math.min(54, plotW / Math.max(1, rows.length) * 0.28));

  const buildViolinPath = (row: ScopeResearchBinRow, centerX: number) => {
    if (row.values.length < 2 || row.min === row.max) {
      const y = yAt(row.median);
      return `M ${(centerX - 8).toFixed(1)} ${y.toFixed(1)} L ${(centerX + 8).toFixed(1)} ${y.toFixed(1)}`;
    }
    const slices = 14;
    const step = (row.max - row.min) / slices || 1;
    const counts = Array.from({ length: slices }, (_, index) => {
      const y0 = row.min + step * index;
      const y1 = index === slices - 1 ? row.max + 1e-9 : y0 + step;
      return row.values.filter((value) => value >= y0 && value < y1).length;
    });
    const maxSlice = Math.max(1, ...counts);
    const points = counts.map((count, index) => {
      const yValue = row.min + step * (index + 0.5);
      const width = Math.max(4, (count / maxSlice) * violinHalfW);
      return { y: yAt(yValue), width };
    });
    const right = points.map((point, index) => `${index === 0 ? "M" : "L"} ${(centerX + point.width).toFixed(1)} ${point.y.toFixed(1)}`);
    const left = [...points]
      .reverse()
      .map((point) => `L ${(centerX - point.width).toFixed(1)} ${point.y.toFixed(1)}`);
    return [...right, ...left, "Z"].join(" ");
  };

  const showTooltip = (event: React.MouseEvent<SVGElement>, row: ScopeResearchBinRow) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: row.label,
      accent: "fuchsia",
      lines: [
        `avg ${scopeResearchFormatValue(row.avg, resultFormat)}`,
        `median ${scopeResearchFormatValue(row.median, resultFormat)}`,
        `q1/q3 ${scopeResearchFormatValue(row.q1, resultFormat)} / ${scopeResearchFormatValue(row.q3, resultFormat)}`,
        `range ${scopeResearchFormatValue(row.min, resultFormat)} .. ${scopeResearchFormatValue(row.max, resultFormat)}`,
        `count ${intn(row.count)}`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="rounded-full border border-fuchsia-500/15 bg-fuchsia-500/8 px-2 py-0.5 text-fuchsia-300/90">violin</span>
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-2 py-0.5 text-emerald-300/90">meanline</span>
        <span className="rounded-full border border-sky-500/15 bg-sky-500/8 px-2 py-0.5 text-sky-300/90">count</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id={`scope-violin-fill-${chartId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(217,70,239,0.24)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.18)" />
          </linearGradient>
          <linearGradient id={`scope-violin-bars-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.74)" />
            <stop offset="100%" stopColor="rgba(14,165,233,0.14)" />
          </linearGradient>
          <filter id={`scope-violin-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="rgba(8,15,26,0.36)" rx="16" />
        <rect x={padLeft} y={barsTop} width={plotW} height={barsH} fill="rgba(8,15,26,0.28)" rx="14" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH - t * plotH;
          return (
            <g key={`violin-grid-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(minY + spanY * t, resultFormat)}
              </text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const x = xAt(index);
          const barHeight = Math.max(4, (row.count / maxCount) * barsH);
          const boxTop = yAt(row.q3);
          const boxBottom = yAt(row.q1);
          return (
            <g key={`violin-${row.label}-${index}`}>
              <rect
                x={x - Math.max(28, violinHalfW + 10)}
                y={padTop}
                width={Math.max(56, (violinHalfW + 10) * 2)}
                height={barsTop + barsH - padTop}
                fill="transparent"
                onMouseEnter={(event) => showTooltip(event, row)}
                onMouseMove={(event) => showTooltip(event, row)}
              />
              <path d={buildViolinPath(row, x)} fill={`url(#scope-violin-fill-${chartId})`} stroke="rgba(217,70,239,0.65)" strokeWidth="1.2" filter={`url(#scope-violin-glow-${chartId})`} />
              <line x1={x} x2={x} y1={yAt(row.min)} y2={yAt(row.max)} stroke="rgba(255,255,255,0.25)" />
              <rect x={x - barW / 2} y={boxTop} width={barW} height={Math.max(4, boxBottom - boxTop)} rx="6" fill="rgba(34,211,238,0.14)" stroke="rgba(34,211,238,0.65)" />
              <line x1={x - barW / 2} x2={x + barW / 2} y1={yAt(row.median)} y2={yAt(row.median)} stroke="rgba(244,244,245,0.85)" strokeWidth="1.8" />
              <line x1={x - barW / 2} x2={x + barW / 2} y1={yAt(row.avg)} y2={yAt(row.avg)} stroke="rgba(110,231,183,0.95)" strokeWidth="2.1" />
              <circle cx={x} cy={yAt(row.avg)} r="3.4" fill="rgba(250,204,21,0.94)" />
              <rect
                x={x - barW / 2}
                y={barsTop + barsH - barHeight}
                width={barW}
                height={barHeight}
                rx="7"
                fill={`url(#scope-violin-bars-${chartId})`}
                stroke="rgba(56,189,248,0.3)"
              />
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={barsTop + barsH} y2={barsTop + barsH} stroke="rgba(255,255,255,0.12)" />
        {rows.map((row, index) => {
          const x = xAt(index);
          const [line1, line2] = scopeResearchLabelLines(row.label);
          const textAnchor = index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle";
          return (
            <g key={`violin-tick-${row.label}`}>
              <line x1={x} x2={x} y1={barsTop + barsH} y2={barsTop + barsH + 6} stroke="rgba(255,255,255,0.18)" />
              <text x={x} y={h - 24} textAnchor={textAnchor} fontSize="10" className="fill-zinc-500 font-mono">
                <tspan x={x} dy="0">{line1}</tspan>
                {line2 ? <tspan x={x} dy="13">{line2}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScopeResearchScatterByDateChart({
  points,
  parallelSeries = [],
  title,
  meta,
  parameterFormat,
  resultFormat,
  fullscreen = false,
}: {
  points: ScopeResearchPoint[];
  parallelSeries?: Array<{ id: string; label: string; points: ScopeResearchPoint[] }>;
  title: string;
  meta?: string;
  parameterFormat: ScopeResearchValueFormat;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 20;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 60;
  const padBottom = 72;
  if (!points.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
        No scatter data for selected settings.
      </div>
    );
  }
  if (points.length < 3 || new Set(points.map((point) => point.dateKey)).size < 2) {
    return <ScopeResearchInsufficientState message="Need at least 3 points across 2 dates for `scatter_by_date`." />;
  }
  const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey || a.parameter - b.parameter);
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const minY = Math.min(...sorted.map((point) => point.result));
  const maxY = Math.max(...sorted.map((point) => point.result));
  const spanY = maxY - minY || 1;
  const meanValue = sorted.reduce((sum, point) => sum + point.result, 0) / Math.max(1, sorted.length);
  const uniqueDates = Array.from(new Set(sorted.map((point) => point.dateKey)));
  const xAt = (index: number) => padLeft + (index / Math.max(1, sorted.length - 1)) * plotW;
  const yAt = (value: number) => padTop + plotH - (value - minY) / spanY * plotH;
  const dateTicks = uniqueDates.filter((_, index) => {
    if (uniqueDates.length <= 6) return true;
    const step = Math.max(1, Math.ceil(uniqueDates.length / 6));
    return index === 0 || index === uniqueDates.length - 1 || index % step === 0;
  });
  const maxParamAbs = Math.max(1, ...sorted.map((row) => Math.abs(row.parameter)));
  const parallelPalette = [
    { stroke: "rgba(56,189,248,0.95)", fill: "rgba(56,189,248,0.9)", chip: "border-sky-500/15 bg-sky-500/8 text-sky-300/90" },
    { stroke: "rgba(217,70,239,0.95)", fill: "rgba(217,70,239,0.9)", chip: "border-fuchsia-500/15 bg-fuchsia-500/8 text-fuchsia-300/90" },
    { stroke: "rgba(251,191,36,0.95)", fill: "rgba(251,191,36,0.9)", chip: "border-amber-500/15 bg-amber-500/8 text-amber-300/90" },
  ];

  const showTooltip = (event: React.MouseEvent<SVGElement>, point: ScopeResearchPoint) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: point.dateKey,
      accent: "cyan",
      lines: [
        `param ${scopeResearchFormatValue(point.parameter, parameterFormat)}`,
        `result ${scopeResearchFormatValue(point.result, resultFormat)}`,
        `ticker ${point.row.ticker || "-"}`,
        `bench ${point.row.benchTicker || "-"}`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="rounded-full border border-cyan-500/15 bg-cyan-500/8 px-2 py-0.5 text-cyan-300/90">result</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-zinc-400">mean</span>
        <span className="rounded-full border border-amber-500/15 bg-amber-500/8 px-2 py-0.5 text-amber-300/90">param glow</span>
        {parallelSeries.map((series, index) => (
          <span
            key={`scatter-chip-${series.id}`}
            className={clsx("rounded-full border px-2 py-0.5 max-w-[180px] truncate", parallelPalette[index % parallelPalette.length]?.chip)}
            title={series.label}
          >
            {series.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <filter id={`scope-scatter-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="rgba(8,15,26,0.36)" rx="16" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH - t * plotH;
          return (
            <g key={`scatter-grid-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(minY + spanY * t, resultFormat)}
              </text>
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={yAt(meanValue)} y2={yAt(meanValue)} stroke="rgba(244,244,245,0.45)" strokeDasharray="5 5" />
        {sorted.map((point, index) => {
          const x = xAt(index);
          const y = yAt(point.result);
          const intensity = Math.min(1, Math.max(0.12, Math.abs(point.parameter) / maxParamAbs));
          return (
            <g key={`scatter-${point.dateKey}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={9}
                fill="transparent"
                onMouseEnter={(event) => showTooltip(event, point)}
                onMouseMove={(event) => showTooltip(event, point)}
              />
              <circle cx={x} cy={y} r={7} fill={`rgba(250,204,21,${0.08 + intensity * 0.18})`} filter={`url(#scope-scatter-glow-${chartId})`} />
              <circle cx={x} cy={y} r={3.4} fill="rgba(34,211,238,0.92)" stroke="rgba(255,255,255,0.18)" />
            </g>
          );
        })}
        {parallelSeries.map((series, seriesIndex) => {
          const color = parallelPalette[seriesIndex % parallelPalette.length];
          const seriesPoints = [...series.points].sort((a, b) => a.sortKey - b.sortKey || a.parameter - b.parameter);
          return seriesPoints.map((point, index) => {
            const baseIndex = sorted.findIndex((candidate) => candidate === point);
            if (baseIndex < 0) return null;
            const x = xAt(baseIndex);
            const y = yAt(point.result);
            return (
              <g key={`scatter-parallel-${series.id}-${index}`}>
                <circle cx={x} cy={y} r={8} fill="transparent" onMouseEnter={(event) => showTooltip(event, point)} onMouseMove={(event) => showTooltip(event, point)} />
                <circle cx={x} cy={y} r={5.2} fill={color.fill} opacity="0.16" />
                <circle cx={x} cy={y} r={2.6} fill={color.fill} stroke="rgba(255,255,255,0.18)" />
              </g>
            );
          });
        })}
        <line x1={padLeft} x2={w - padRight} y1={padTop + plotH} y2={padTop + plotH} stroke="rgba(255,255,255,0.12)" />
        {dateTicks.map((dateKey) => {
          const index = sorted.findIndex((candidate) => candidate.dateKey === dateKey);
          const x = xAt(index);
          return (
            <g key={`scatter-tick-${dateKey}-${index}`}>
              <line x1={x} x2={x} y1={padTop + plotH} y2={padTop + plotH + 6} stroke="rgba(255,255,255,0.18)" />
              <text
                x={x}
                y={h - 16}
                textAnchor="middle"
                fontSize="11"
                className="fill-zinc-500 font-mono"
              >
                {dateKey.slice(5)}
              </text>
            </g>
          );
        })}
        <text x={padLeft + 8} y={22} fontSize="11" className="fill-zinc-500 font-mono">
          by date | {scopeResearchFormatValue(sorted[0]?.parameter ?? 0, parameterFormat)} ..{" "}
          {scopeResearchFormatValue(sorted[sorted.length - 1]?.parameter ?? 0, parameterFormat)}
        </text>
      </svg>
    </div>
  );
}

function ScopeResearchCumsumChart({
  points,
  parallelSeries = [],
  title,
  meta,
  resultFormat,
  fullscreen = false,
}: {
  points: ScopeResearchPoint[];
  parallelSeries?: Array<{ id: string; label: string; points: ScopeResearchPoint[] }>;
  title: string;
  meta?: string;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 20;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 60;
  const padBottom = 72;
  if (!points.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
        No cumulative data for selected settings.
      </div>
    );
  }
  const daily = scopeResearchDailySeries(points);
  if (daily.length < 2) {
    return <ScopeResearchInsufficientState message="Need at least 2 points for `cumsum_chart`." detail="Widen range or reduce `Min N`." />;
  }
  const series = daily;
  const plotW = w - padLeft - padRight;
  const topH = h - padTop - padBottom - 68;
  const barsTop = padTop + topH + 12;
  const barsH = 56;
  const minY = Math.min(0, ...series.map((point) => point.cumulative));
  const maxY = Math.max(0, ...series.map((point) => point.cumulative));
  const spanY = maxY - minY || 1;
  const maxCount = Math.max(1, ...series.map((point) => point.count));
  const parallelDailySeries = parallelSeries
    .map((seriesItem) => ({
      id: seriesItem.id,
      label: seriesItem.label,
      series: scopeResearchDailySeries(seriesItem.points),
    }))
    .filter((seriesItem) => seriesItem.series.length >= 1);
  const parallelPalette = [
    { stroke: "rgba(56,189,248,0.95)", chip: "border-sky-500/15 bg-sky-500/8 text-sky-300/90" },
    { stroke: "rgba(217,70,239,0.95)", chip: "border-fuchsia-500/15 bg-fuchsia-500/8 text-fuchsia-300/90" },
    { stroke: "rgba(251,191,36,0.95)", chip: "border-amber-500/15 bg-amber-500/8 text-amber-300/90" },
  ];
  const xAt = (index: number) => padLeft + (index / Math.max(1, series.length - 1)) * plotW;
  const yAt = (value: number) => padTop + topH - (value - minY) / spanY * topH;
  const yBar = (value: number) => barsTop + barsH - (value / maxCount) * barsH;
  const lineD = series.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(point.cumulative).toFixed(1)}`).join(" ");
  const areaD = `${lineD} L ${xAt(series.length - 1).toFixed(1)} ${(padTop + topH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + topH).toFixed(1)} Z`;
  const ticks = series.filter((_, index) => {
    if (series.length <= 6) return true;
    const step = Math.max(1, Math.ceil(series.length / 6));
    return index === 0 || index === series.length - 1 || index % step === 0;
  });
  const showTooltip = (
    event: React.MouseEvent<SVGElement>,
    point: (typeof series)[number]
  ) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: point.dateKey,
      accent: "emerald",
      lines: [
        `day pnl ${scopeResearchFormatValue(point.total, resultFormat)}`,
        `equity ${scopeResearchFormatValue(point.cumulative, resultFormat)}`,
        `count ${intn(point.count)}`,
        `avg/trade ${scopeResearchFormatValue(point.count ? point.total / point.count : 0, resultFormat)}`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-2 py-0.5 text-emerald-300/90">equity</span>
        <span className="rounded-full border border-sky-500/15 bg-sky-500/8 px-2 py-0.5 text-sky-300/90">count</span>
        {parallelDailySeries.map((seriesItem, index) => (
          <span
            key={`cumsum-chip-${seriesItem.id}`}
            className={clsx("rounded-full border px-2 py-0.5 max-w-[180px] truncate", parallelPalette[index % parallelPalette.length]?.chip)}
            title={seriesItem.label}
          >
            {seriesItem.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id={`scope-cumsum-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(52,211,153,0.24)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
          </linearGradient>
          <linearGradient id={`scope-cumsum-bars-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.72)" />
            <stop offset="100%" stopColor="rgba(14,165,233,0.14)" />
          </linearGradient>
          <filter id={`scope-cumsum-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={padLeft} y={padTop} width={plotW} height={topH} fill="rgba(8,15,26,0.36)" rx="16" />
        <rect x={padLeft} y={barsTop} width={plotW} height={barsH} fill="rgba(8,15,26,0.28)" rx="14" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + topH - t * topH;
          return (
            <g key={`cumsum-grid-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(minY + spanY * t, resultFormat)}
              </text>
            </g>
          );
        })}
        <path d={areaD} fill={`url(#scope-cumsum-fill-${chartId})`} />
        <path d={lineD} fill="none" stroke="rgba(52,211,153,0.95)" strokeWidth="3" filter={`url(#scope-cumsum-glow-${chartId})`} />
        {parallelDailySeries.map((seriesItem, index) => {
          const color = parallelPalette[index % parallelPalette.length]?.stroke ?? "rgba(56,189,248,0.95)";
          const byDate = new Map(seriesItem.series.map((item) => [item.dateKey, item]));
          const aligned = series
            .map((basePoint) => {
              const match = byDate.get(basePoint.dateKey);
              return match ? { ...match, baseIndex: basePoint.index } : null;
            })
            .filter(Boolean) as Array<(typeof seriesItem.series)[number] & { baseIndex: number }>;
          if (!aligned.length) return null;
          const path = aligned
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xAt(point.baseIndex).toFixed(1)} ${yAt(point.cumulative).toFixed(1)}`)
            .join(" ");
          return (
            <g key={`cumsum-parallel-${seriesItem.id}`}>
              <path d={path} fill="none" stroke={color} strokeWidth="2.1" strokeDasharray="6 5" />
              {aligned.map((point) => (
                <circle key={`cumsum-parallel-point-${seriesItem.id}-${point.baseIndex}`} cx={xAt(point.baseIndex)} cy={yAt(point.cumulative)} r={2.8} fill={color} />
              ))}
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={yAt(0)} y2={yAt(0)} stroke="rgba(255,255,255,0.14)" />
        {series.map((point) => (
          <g key={`cumsum-point-${point.dateKey}-${point.index}`}>
            <circle
              cx={xAt(point.index)}
              cy={yAt(point.cumulative)}
              r={8}
              fill="transparent"
              onMouseEnter={(event) => showTooltip(event, point)}
              onMouseMove={(event) => showTooltip(event, point)}
            />
            <circle cx={xAt(point.index)} cy={yAt(point.cumulative)} r={3.6} fill="rgba(110,231,183,0.96)" />
            <rect
              x={xAt(point.index) - 10}
              y={yBar(point.count)}
              width={20}
              height={Math.max(4, barsTop + barsH - yBar(point.count))}
              rx="6"
              fill={`url(#scope-cumsum-bars-${chartId})`}
              stroke="rgba(56,189,248,0.24)"
            />
          </g>
        ))}
        <line x1={padLeft} x2={w - padRight} y1={barsTop + barsH} y2={barsTop + barsH} stroke="rgba(255,255,255,0.12)" />
        {ticks.map((point) => {
          const x = xAt(point.index);
          return (
            <g key={`cumsum-tick-${point.dateKey}-${point.index}`}>
              <line x1={x} x2={x} y1={barsTop + barsH} y2={barsTop + barsH + 6} stroke="rgba(255,255,255,0.18)" />
              <text x={x} y={h - 16} textAnchor="middle" fontSize="10" className="fill-zinc-500 font-mono">
                {point.dateKey.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScopeResearchTradePerformanceChart({
  points,
  parallelSeries = [],
  title,
  meta,
  resultFormat,
  fullscreen = false,
}: {
  points: ScopeResearchPoint[];
  parallelSeries?: Array<{ id: string; label: string; points: ScopeResearchPoint[] }>;
  title: string;
  meta?: string;
  resultFormat: ScopeResearchValueFormat;
  fullscreen?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ScopeChartTooltipData | null>(null);
  const chartId = useId().replace(/:/g, "");
  const w = 1100;
  const h = fullscreen ? 820 : 520;
  const padLeft = fullscreen ? 10 : 20;
  const padRight = fullscreen ? 54 : 82;
  const padTop = 88;
  const padBottom = 72;
  if (!points.length) {
    return (
      <div className={clsx("w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-4 text-xs font-mono text-zinc-500 flex items-center justify-center", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
        No performance data for selected settings.
      </div>
    );
  }
  if (points.length < 1 || new Set(points.map((point) => point.dateKey)).size < 1) {
    return <ScopeResearchInsufficientState message="Need at least 1 date for `trade_performance`." detail="Widen range or lower extra filters." />;
  }

  const series = scopeResearchDailySeries(points);
  const summary = scopeResearchSummarize(points.map((point) => point.result));
  const parallelDailySeries = parallelSeries
    .map((seriesItem) => ({
      id: seriesItem.id,
      label: seriesItem.label,
      series: scopeResearchDailySeries(seriesItem.points),
    }))
    .filter((seriesItem) => seriesItem.series.length >= 1);
  const bestDay = [...series].sort((a, b) => b.total - a.total)[0] ?? null;
  const worstDay = [...series].sort((a, b) => a.total - b.total)[0] ?? null;
  const plotW = w - padLeft - padRight;
  const topH = h - padTop - padBottom - 72;
  const barsTop = padTop + topH + 12;
  const barsH = 56;
  const minY = Math.min(0, ...series.map((row) => row.cumulative));
  const maxY = Math.max(0, ...series.map((row) => row.cumulative));
  const spanY = maxY - minY || 1;
  const maxCount = Math.max(1, ...series.map((row) => row.count));
  const parallelPalette = [
    { stroke: "rgba(56,189,248,0.95)", chip: "border-sky-500/15 bg-sky-500/8 text-sky-300/90" },
    { stroke: "rgba(217,70,239,0.95)", chip: "border-fuchsia-500/15 bg-fuchsia-500/8 text-fuchsia-300/90" },
    { stroke: "rgba(251,191,36,0.95)", chip: "border-amber-500/15 bg-amber-500/8 text-amber-300/90" },
  ];
  const xAt = (index: number) => padLeft + (index / Math.max(1, series.length - 1)) * plotW;
  const yAt = (value: number) => padTop + topH - ((value - minY) / spanY) * topH;
  const yBar = (value: number) => barsTop + barsH - (value / maxCount) * barsH;
  const lineD = series.map((row, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(row.cumulative).toFixed(1)}`).join(" ");
  const areaD = `${lineD} L ${xAt(series.length - 1).toFixed(1)} ${(padTop + topH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + topH).toFixed(1)} Z`;
  const ticks = series.filter((_, index) => {
    if (series.length <= 6) return true;
    const step = Math.max(1, Math.ceil(series.length / 6));
    return index === 0 || index === series.length - 1 || index % step === 0;
  });

  const showTooltip = (event: React.MouseEvent<SVGElement>, point: (typeof series)[number]) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: point.dateKey,
      accent: "emerald",
      lines: [
        `day pnl ${scopeResearchFormatValue(point.total, resultFormat)}`,
        `equity ${scopeResearchFormatValue(point.cumulative, resultFormat)}`,
        `count ${intn(point.count)}`,
        `avg/trade ${scopeResearchFormatValue(point.count ? point.total / point.count : 0, resultFormat)}`,
      ],
    });
  };

  return (
    <div className={clsx("relative w-full rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 overflow-hidden", fullscreen ? "h-full min-h-0" : "h-[520px]")}>
      {renderScopeChartTooltip(tooltip)}
      <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-zinc-500">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 truncate ml-4">{meta}</div>
      </div>
      <div className="absolute top-7 left-3 right-3 z-10 grid grid-cols-2 xl:grid-cols-4 gap-2">
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Trades</div>
          <div className="mt-1 text-[16px] font-mono text-zinc-100">{intn(summary.count)}</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Total</div>
          <div className="mt-1 text-[16px] font-mono text-emerald-300">{scopeResearchFormatValue(summary.total, resultFormat)}</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Best Day</div>
          <div className="mt-1 text-[14px] font-mono text-cyan-300 truncate">{bestDay ? `${bestDay.dateKey.slice(5)}  ${scopeResearchFormatValue(bestDay.total, resultFormat)}` : "-"}</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Worst Day</div>
          <div className="mt-1 text-[14px] font-mono text-rose-300 truncate">{worstDay ? `${worstDay.dateKey.slice(5)}  ${scopeResearchFormatValue(worstDay.total, resultFormat)}` : "-"}</div>
        </div>
      </div>
      <div className="absolute top-[72px] left-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        {parallelDailySeries.map((seriesItem, index) => (
          <span
            key={`performance-chip-${seriesItem.id}`}
            className={clsx("rounded-full border px-2 py-0.5 max-w-[180px] truncate", parallelPalette[index % parallelPalette.length]?.chip)}
            title={seriesItem.label}
          >
            {seriesItem.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-full" onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id={`scope-performance-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(52,211,153,0.24)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.03)" />
          </linearGradient>
          <linearGradient id={`scope-performance-bars-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.72)" />
            <stop offset="100%" stopColor="rgba(14,165,233,0.14)" />
          </linearGradient>
        </defs>
        <rect x={padLeft} y={padTop} width={plotW} height={topH} fill="rgba(8,15,26,0.36)" rx="16" />
        <rect x={padLeft} y={barsTop} width={plotW} height={barsH} fill="rgba(8,15,26,0.28)" rx="14" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + topH - t * topH;
          return (
            <g key={`perf-grid-${t}`}>
              <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
              <text x={w - 6} y={y - 4} textAnchor="end" fontSize="11" className="fill-zinc-500 font-mono">
                {scopeResearchFormatValue(minY + spanY * t, resultFormat)}
              </text>
            </g>
          );
        })}
        <path d={areaD} fill={`url(#scope-performance-fill-${chartId})`} />
        <path d={lineD} fill="none" stroke="rgba(52,211,153,0.94)" strokeWidth="3" />
        {parallelDailySeries.map((seriesItem, index) => {
          const color = parallelPalette[index % parallelPalette.length]?.stroke ?? "rgba(56,189,248,0.95)";
          const byDate = new Map(seriesItem.series.map((item) => [item.dateKey, item]));
          const aligned = series
            .map((basePoint) => {
              const match = byDate.get(basePoint.dateKey);
              return match ? { ...match, baseIndex: basePoint.index } : null;
            })
            .filter(Boolean) as Array<(typeof seriesItem.series)[number] & { baseIndex: number }>;
          if (!aligned.length) return null;
          const path = aligned
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xAt(point.baseIndex).toFixed(1)} ${yAt(point.cumulative).toFixed(1)}`)
            .join(" ");
          return <path key={`performance-parallel-${seriesItem.id}`} d={path} fill="none" stroke={color} strokeWidth="2.1" strokeDasharray="6 5" />;
        })}
        <line x1={padLeft} x2={w - padRight} y1={yAt(0)} y2={yAt(0)} stroke="rgba(255,255,255,0.14)" />
        {series.map((point) => {
          const x = xAt(point.index);
          const y = yAt(point.cumulative);
          return (
            <g key={`perf-point-${point.dateKey}`}>
              <rect
                x={x - 12}
                y={padTop}
                width={24}
                height={barsTop + barsH - padTop}
                fill="transparent"
                onMouseEnter={(event) => showTooltip(event, point)}
                onMouseMove={(event) => showTooltip(event, point)}
              />
              <circle cx={x} cy={y} r={3.8} fill="rgba(110,231,183,0.96)" />
              <rect x={x - 10} y={yBar(point.count)} width={20} height={Math.max(4, barsTop + barsH - yBar(point.count))} rx="6" fill={`url(#scope-performance-bars-${chartId})`} stroke="rgba(56,189,248,0.24)" />
            </g>
          );
        })}
        <line x1={padLeft} x2={w - padRight} y1={barsTop + barsH} y2={barsTop + barsH} stroke="rgba(255,255,255,0.12)" />
        {ticks.map((point) => {
          const x = xAt(point.index);
          return (
            <g key={`perf-tick-${point.dateKey}`}>
              <line x1={x} x2={x} y1={barsTop + barsH} y2={barsTop + barsH + 6} stroke="rgba(255,255,255,0.18)" />
              <text x={x} y={h - 16} textAnchor="middle" fontSize="10" className="fill-zinc-500 font-mono">
                {point.dateKey.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function fmtHms(d: Date | null): string {
  if (!d) return "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const PAPER_ARB_FILTERS_LS_KEY = "paper.arb.filters.v1";
const SCANNER_ACTIVE_PRESET_ID_LS_KEY = "paper.arb.shared-preset.active-id";

// =========================
// MAIN PAGE
// =========================
export default function ArbitrageScanner() {
  const { theme } = useUi();
  const accent = useMemo(() => getScannerAccent(theme), [theme]);
  const headerButtonActiveClass = useMemo(() => getScannerHeaderButtonActiveClass(theme), [theme]);
  const isLightTheme = theme === "light";
  const [tab, setTab] = useState<TabKey>("active");
  const [ruleBand, setRuleBand] = useState<PaperArbRatingBand>("GLOBAL");
  const [zapUiMode, setZapUiMode] = useState<ZapUiMode>("zap");
  const [showSharedMinMax, setShowSharedMinMax] = useState<boolean>(true);

  // days + date mode
  const [days, setDays] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<DateMode>("day");
  const [dateNy, setDateNy] = useState<string>(todayNyYmd());
  const [dateFrom, setDateFrom] = useState<string>(todayNyYmd());
  const [dateTo, setDateTo] = useState<string>(todayNyYmd());
  const [rangePreset, setRangePreset] = useState<"3d" | "5d" | "10d" | "15d" | "20d" | "30d">("5d");
  const daySelectWrapperRef = useRef<HTMLDivElement | null>(null);
  const rangePresetWrapperRef = useRef<HTMLDivElement | null>(null);
  const dateFromSelectWrapperRef = useRef<HTMLDivElement | null>(null);
  const dateToSelectWrapperRef = useRef<HTMLDivElement | null>(null);

  // global filters (variant)
  const [session, setSession] = useState<PaperArbSession>("GLOB");
  const [metric, setMetric] = useState<PaperArbMetric>("SigmaZap");
  const [closeMode, setCloseMode] = useState<PaperArbCloseMode>("Active");
  const [startAbs, setStartAbs] = useState<number>(0.1);
  const [startAbsMax, setStartAbsMax] = useState<string>("");
  const [endAbs, setEndAbs] = useState<number>(0.05);
  const [minHoldCandles, setMinHoldCandles] = useState<number>(0);
  const [pnlMode, setPnlMode] = useState<PaperArbPnlMode>("Hedged");

  // analytics options
  const [includeEquityCurve, setIncludeEquityCurve] = useState(true);
  const [equityCurveMode, setEquityCurveMode] = useState<"Daily" | "Trade">("Daily");
  const [topN, setTopN] = useState<number>(1000);
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  const [offset, setOffset] = useState<number>(0);

  // table sub-filters (client-side)
  const [qTicker, setQTicker] = useState("");
  const [qSide, setQSide] = useState<"" | "Long" | "Short">("");

  // data
  const [activeRows, setActiveRows] = useState<PaperArbActiveRow[]>([]);
  const [episodesRows, setEpisodesRows] = useState<PaperArbClosedDto[]>([]);
  const [analytics, setAnalytics] = useState<PaperArbAnalyticsResponse | null>(null);

  // ui state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [listMode, setListMode] = useState<PaperListMode>("off");
  const [showIgnore, setShowIgnore] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [scannerPresets, setScannerPresets] = useState<PresetDto[]>([]);
  const [scannerPresetId, setScannerPresetId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(SCANNER_ACTIVE_PRESET_ID_LS_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [scannerPresetBusy, setScannerPresetBusy] = useState(false);
  const [scannerPresetSaveMode, setScannerPresetSaveMode] = useState(false);
  const [scannerPresetDraftName, setScannerPresetDraftName] = useState("");
  const [scannerPresetStatus, setScannerPresetStatus] = useState<string>("");
  const [episodesSort, setEpisodesSort] = useState<{ key: EpisodeSortKey; dir: SortDir }>({
    key: "total",
    dir: "desc",
  });
  const [analyticsSort, setAnalyticsSort] = useState<{ key: EpisodeSortKey; dir: SortDir }>({
    key: "total",
    dir: "desc",
  });

  // episodes: advanced POST search toggle + advanced panel
  const [episodesUseSearch, setEpisodesUseSearch] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // ===== Advanced filters (ALL switches)
  // rating
  const [ratingType, setRatingType] = useState<PaperArbRatingType>("any");
  const [ratingRules, setRatingRules] = useState<PaperArbRatingRule[]>([
    { band: "BLUE", minRate: 0, minTotal: 0 },
    { band: "ARK", minRate: 0, minTotal: 0 },
    { band: "OPEN", minRate: 0, minTotal: 0 },
    { band: "INTRA", minRate: 0, minTotal: 0 },
    { band: "PRINT", minRate: 0, minTotal: 0 },
    { band: "POST", minRate: 0, minTotal: 0 },
    { band: "GLOBAL", minRate: 0, minTotal: 0 },
  ]);
  const [ratingEnabledBands, setRatingEnabledBands] = useState<Record<PaperArbRatingBand, boolean>>({
    BLUE: false,
    ARK: false,
    OPEN: false,
    INTRA: false,
    PRINT: false,
    POST: false,
    GLOBAL: true,
  });

  // lists
  const [ignoreTickersText, setIgnoreTickersText] = useState<string>("");
  const [tickersText, setTickersText] = useState<string>("");
  const [benchTickersText, setBenchTickersText] = useState<string>("");
  const ignoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const applyFileInputRef = useRef<HTMLInputElement | null>(null);
  const pinFileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionSelectWrapperRef = useRef<HTMLDivElement | null>(null);
  const [sideFilter, setSideFilter] = useState<"" | "Long" | "Short">("");

  const [exchangesText, setExchangesText] = useState<string>("");
  const [countriesText, setCountriesText] = useState<string>("");
  const [sectorsL3Text, setSectorsL3Text] = useState<string>("");

  const [imbExchsText, setImbExchsText] = useState<string>("");

  // numeric ranges (as strings for easy empty/null)
  const [minTierBp, setMinTierBp] = useState<string>("");
  const [maxTierBp, setMaxTierBp] = useState<string>("");
  const [minBeta, setMinBeta] = useState<string>("");
  const [maxBeta, setMaxBeta] = useState<string>("");

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

  // news flags
  const [requireHasNews, setRequireHasNews] = useState<boolean>(false);
  const [excludeHasNews, setExcludeHasNews] = useState<boolean>(false);
  const [requireHasReport, setRequireHasReport] = useState<boolean>(false);
  const [excludeHasReport, setExcludeHasReport] = useState<boolean>(false);
  const [minNewsCnt, setMinNewsCnt] = useState<string>("");
  const [maxNewsCnt, setMaxNewsCnt] = useState<string>("");

  // require flags
  const [requireIsPTP, setRequireIsPTP] = useState<boolean>(false);
  const [requireIsSSR, setRequireIsSSR] = useState<boolean>(false);
  const [requireIsETF, setRequireIsETF] = useState<boolean>(false);
  const [requireIsCrap, setRequireIsCrap] = useState<boolean>(false);

  // exclude flags
  const [excludePTP, setExcludePTP] = useState<boolean>(false);
  const [excludeSSR, setExcludeSSR] = useState<boolean>(false);
  const [excludeETF, setExcludeETF] = useState<boolean>(false);
  const [excludeCrap, setExcludeCrap] = useState<boolean>(false);
  const [includeUSA, setIncludeUSA] = useState<boolean>(false);
  const [includeChina, setIncludeChina] = useState<boolean>(false);

  // medians
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

  // imbalance
  const [minImbARCA, setMinImbARCA] = useState<string>("");
  const [maxImbARCA, setMaxImbARCA] = useState<string>("");
  const [minImbExchValue, setMinImbExchValue] = useState<string>("");
  const [maxImbExchValue, setMaxImbExchValue] = useState<string>("");
  const [sharedRangeFilterModes, setSharedRangeFilterModes] = useState<Record<SharedRangeFilterKey, SharedRangeFilterMode>>(
    DEFAULT_SHARED_RANGE_FILTER_MODES
  );
  const filtersHydratedRef = useRef(false);
  const filtersRestoringRef = useRef(false);
  const optimizerBucketReloadRef = useRef<number | null>(null);
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
  const [optimizerComboRows, setOptimizerComboRows] = useState<OptimizerResultRow[]>([]);
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
  const [scopeOverlayParameterKeys, setScopeOverlayParameterKeys] = useState<[string, string]>(["", ""]);
  const [optimizerRangeRankMetric, setOptimizerRangeRankMetric] = useState<OptimizerRangeRankMetric>("avgPnlUsd");
  const [optimizerRangeMinTrades, setOptimizerRangeMinTrades] = useState<number>(25);
  const [optimizerBucketCount, setOptimizerBucketCount] = useState<number>(8);
  const [scopeResearchDrafts, setScopeResearchDrafts] = useState<Record<ScopePanelKey, ScopeResearchDraft>>(DEFAULT_SCOPE_RESEARCH_DRAFTS);
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
  const episodesSearchCacheRef = useRef<Map<string, { ts: number; rows: PaperArbClosedDto[] }>>(new Map());
  const episodesSearchInFlightRef = useRef<Map<string, Promise<PaperArbClosedDto[]>>>(new Map());

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
      `deltaPrint=${zapUiMode === "delta" ? "on" : "off"}`,
      `startAbsMax=${startAbsMax || "off"}`,
      `endAbs=${endAbs}`,
      `session=${session}`,
      `scope=${scopeMode}`,
      `limit=${scopeMode === "ALL" ? 1000 : topN}`,
      `offset=${offset}`,
      `closeMode=${closeMode}`,
      `minHoldCandles=${minHoldCandles}`,
      `priceMode=LastPrint`,
      `pnlMode=${pnlMode}`,
    ].join(" | ");
  }, [metric, startAbs, startAbsMax, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, pnlMode, zapUiMode]);

  const variantShort = useMemo(() => {
    // small stable hash-ish label without bringing crypto
    const s = `${metric}|${startAbs}|${zapUiMode === "delta" ? 1 : 0}|${startAbsMax}|${endAbs}|${session}|${scopeMode}|${scopeMode === "ALL" ? 1000 : topN}|${offset}|${closeMode}|${minHoldCandles}|${pnlMode}|LastPrint`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `v${h.toString(16).slice(0, 8)}`;
  }, [metric, startAbs, startAbsMax, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, pnlMode, zapUiMode]);

  const forceEpisodesSearch = useMemo(() => {
    const has = (v: string) => String(v ?? "").trim().length > 0;
    const startAbsMaxNum = optNumOrNull(startAbsMax);
    const hasValidStartAbsMax = startAbsMaxNum != null && startAbsMaxNum > 0 && (zapUiMode === "delta" || startAbsMaxNum >= startAbs);
    return (
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
      excludePTP || excludeSSR || excludeETF || excludeCrap
    );
  }, [
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
    startAbsMax, startAbs, zapUiMode,
    minNewsCnt, maxNewsCnt,
    requireHasNews, excludeHasNews, requireHasReport, excludeHasReport, includeUSA, includeChina,
    requireIsPTP, requireIsSSR, requireIsETF, requireIsCrap,
    excludePTP, excludeSSR, excludeETF, excludeCrap,
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

    if (!(startAbs > 0)) e.push("startAbs must be > 0");
    if (!(endAbs >= 0)) e.push("endAbs must be >= 0");
    if (zapUiMode !== "delta" && endAbs > startAbs) e.push("endAbs must be <= startAbs");

    if (minHoldCandles < 0) e.push("minHoldCandles must be >= 0");

    return e;
  }, [tab, dateMode, episodesUseSearch, forceEpisodesSearch, dateNy, dateFrom, dateTo, startAbs, endAbs, minHoldCandles, zapUiMode]);

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

  // ========= Load available days on mount
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const d = await loadDaysApi();
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
  useLayoutEffect(() => {
    filtersRestoringRef.current = true;
    try {
      const raw = localStorage.getItem(PAPER_ARB_FILTERS_LS_KEY);
      if (!raw) {
        // no saved state
      } else {
        const s = JSON.parse(raw) as Record<string, any>;

        if (s.tab === "active" || s.tab === "episodes" || s.tab === "analytics") setTab(s.tab);
        if (s.ruleBand === "BLUE" || s.ruleBand === "ARK" || s.ruleBand === "OPEN" || s.ruleBand === "INTRA" || s.ruleBand === "PRINT" || s.ruleBand === "POST" || s.ruleBand === "GLOBAL") setRuleBand(s.ruleBand);
        if (s.zapUiMode === "off" || s.zapUiMode === "zap" || s.zapUiMode === "sigma" || s.zapUiMode === "delta") setZapUiMode(s.zapUiMode);
        if (typeof s.showSharedMinMax === "boolean") setShowSharedMinMax(s.showSharedMinMax);

        if (s.dateMode === "day" || s.dateMode === "last" || s.dateMode === "range") setDateMode(s.dateMode);
        if (typeof s.dateNy === "string") setDateNy(s.dateNy);
        if (typeof s.dateFrom === "string") setDateFrom(s.dateFrom);
        if (typeof s.dateTo === "string") setDateTo(s.dateTo);

        if (s.session === "BLUE" || s.session === "ARK" || s.session === "OPEN" || s.session === "INTRA" || s.session === "POST" || s.session === "NIGHT" || s.session === "GLOB") setSession(s.session);
        if (s.metric === "SigmaZap" || s.metric === "ZapPct") setMetric(s.metric);
        if (s.closeMode === "Active" || s.closeMode === "Passive") setCloseMode(s.closeMode);
        if (typeof s.startAbs === "number") setStartAbs(s.startAbs);
        if (typeof s.startAbsMax === "string") setStartAbsMax(s.startAbsMax);
        if (typeof s.endAbs === "number") setEndAbs(s.endAbs);
        if (typeof s.minHoldCandles === "number") setMinHoldCandles(s.minHoldCandles);
        if (s.pnlMode === "RawOnly" || s.pnlMode === "Hedged") setPnlMode(s.pnlMode);
        if (s.optimizerRangeRankMetric === "avgPnlUsd" || s.optimizerRangeRankMetric === "totalPnlUsd" || s.optimizerRangeRankMetric === "winRate" || s.optimizerRangeRankMetric === "score") {
          setOptimizerRangeRankMetric(s.optimizerRangeRankMetric);
        }
        if (typeof s.optimizerRangeMinTrades === "number") setOptimizerRangeMinTrades(Math.max(0, Math.trunc(s.optimizerRangeMinTrades)));
        if (typeof s.optimizerBucketCount === "number") setOptimizerBucketCount(Math.max(3, Math.min(16, Math.trunc(s.optimizerBucketCount))));

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

        if (s.ratingType === "any" || s.ratingType === "hard" || s.ratingType === "soft") setRatingType(s.ratingType);
        if (Array.isArray(s.ratingRules)) {
          const rr = s.ratingRules
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              band: x.band as PaperArbRatingBand,
              minRate: Number(x.minRate) || 0,
              minTotal: Number(x.minTotal) || 0,
            }))
            .filter((x) => ["BLUE", "ARK", "OPEN", "INTRA", "PRINT", "POST", "GLOBAL"].includes(x.band));
          if (rr.length) setRatingRules(rr);
        }
        if (s.ratingEnabledBands && typeof s.ratingEnabledBands === "object") {
          setRatingEnabledBands((prev) => {
            const next = {
              ...prev,
              BLUE: Boolean(s.ratingEnabledBands.BLUE),
              ARK: Boolean(s.ratingEnabledBands.ARK),
              OPEN: Boolean(s.ratingEnabledBands.OPEN),
              INTRA: Boolean(s.ratingEnabledBands.INTRA),
              PRINT: Boolean(s.ratingEnabledBands.PRINT),
              POST: Boolean(s.ratingEnabledBands.POST),
              GLOBAL: Boolean(s.ratingEnabledBands.GLOBAL),
            };

            const hasAnyEnabled =
              next.BLUE || next.ARK || next.OPEN || next.INTRA || next.PRINT || next.POST || next.GLOBAL;

            // Backward-compat for old saved state where all bands were false.
            if (!hasAnyEnabled) next.GLOBAL = true;

            return next;
          });
        }

        if (typeof s.ignoreTickersText === "string") setIgnoreTickersText(s.ignoreTickersText);
        if (typeof s.tickersText === "string") setTickersText(s.tickersText);
        if (typeof s.benchTickersText === "string") setBenchTickersText(s.benchTickersText);
        if (s.sideFilter === "" || s.sideFilter === "Long" || s.sideFilter === "Short") setSideFilter(s.sideFilter);
        if (typeof s.exchangesText === "string") setExchangesText(s.exchangesText);
        if (typeof s.countriesText === "string") setCountriesText(s.countriesText);
        if (typeof s.sectorsL3Text === "string") setSectorsL3Text(s.sectorsL3Text);
        if (typeof s.imbExchsText === "string") setImbExchsText(s.imbExchsText);

        const applyStr = (v: any, setter: (x: string) => void) => {
          if (typeof v === "string") setter(v);
        };
        applyStr(s.minTierBp, setMinTierBp); applyStr(s.maxTierBp, setMaxTierBp);
        applyStr(s.minBeta, setMinBeta); applyStr(s.maxBeta, setMaxBeta);
        applyStr(s.minMarketCapM, setMinMarketCapM); applyStr(s.maxMarketCapM, setMaxMarketCapM);
        applyStr(s.minRoundLot, setMinRoundLot); applyStr(s.maxRoundLot, setMaxRoundLot);
        applyStr(s.minAdv20, setMinAdv20); applyStr(s.maxAdv20, setMaxAdv20);
        applyStr(s.minAdv20NF, setMinAdv20NF); applyStr(s.maxAdv20NF, setMaxAdv20NF);
        applyStr(s.minAdv90, setMinAdv90); applyStr(s.maxAdv90, setMaxAdv90);
        applyStr(s.minAdv90NF, setMinAdv90NF); applyStr(s.maxAdv90NF, setMaxAdv90NF);
        applyStr(s.minPreMktVol, setMinPreMktVol); applyStr(s.maxPreMktVol, setMaxPreMktVol);
        applyStr(s.minPreMktVolNF, setMinPreMktVolNF); applyStr(s.maxPreMktVolNF, setMaxPreMktVolNF);
        applyStr(s.minSpread, setMinSpread); applyStr(s.maxSpread, setMaxSpread);
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
        if (typeof s.excludePTP === "boolean") setExcludePTP(s.excludePTP);
        if (typeof s.excludeSSR === "boolean") setExcludeSSR(s.excludeSSR);
        if (typeof s.excludeETF === "boolean") setExcludeETF(s.excludeETF);
        if (typeof s.excludeCrap === "boolean") setExcludeCrap(s.excludeCrap);
        if (typeof s.includeUSA === "boolean") setIncludeUSA(s.includeUSA);
        if (typeof s.includeChina === "boolean") setIncludeChina(s.includeChina);
      }
    } catch {
      // ignore broken storage
    } finally {
      filtersHydratedRef.current = true;
      queueMicrotask(() => {
        filtersRestoringRef.current = false;
      });
    }
  }, []);

  const persistedFilters = useMemo(
    () => ({
      tab,
      ruleBand,
      zapUiMode,
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
      pnlMode,
      optimizerRangeRankMetric,
      optimizerRangeMinTrades,
      optimizerBucketCount,
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
      ratingType,
      ratingRules,
      ratingEnabledBands,
      ignoreTickersText,
      tickersText,
      benchTickersText,
      sideFilter,
      exchangesText,
      countriesText,
      sectorsL3Text,
      imbExchsText,
      minTierBp,
      maxTierBp,
      minBeta,
      maxBeta,
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
      requireHasReport,
      excludeHasReport,
      minNewsCnt,
      maxNewsCnt,
      requireIsPTP,
      requireIsSSR,
      requireIsETF,
      requireIsCrap,
      excludePTP,
      excludeSSR,
      excludeETF,
      excludeCrap,
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
      tab, ruleBand, zapUiMode, showSharedMinMax, dateMode, dateNy, dateFrom, dateTo,
      session, metric, closeMode, startAbs, startAbsMax, endAbs, minHoldCandles, pnlMode,
      includeEquityCurve, equityCurveMode, sharedRangeFilterModes, topN, scopeMode, offset,
      qTicker, qSide, listMode, showIgnore, showApply, showPin, episodesUseSearch, showAdvanced,
      ratingType, ratingRules, ratingEnabledBands, ignoreTickersText, tickersText, benchTickersText, sideFilter,
      exchangesText, countriesText, sectorsL3Text, imbExchsText, minTierBp, maxTierBp,
      minBeta, maxBeta, minMarketCapM, maxMarketCapM, minRoundLot, maxRoundLot, minAdv20,
      maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF,
      minPreMktVol, maxPreMktVol, minPreMktVolNF, maxPreMktVolNF, minSpread, maxSpread,
      minSpreadBps, maxSpreadBps, minGap, maxGap, minGapPct, maxGapPct, minClsToClsPct,
      maxClsToClsPct, minVWAP, maxVWAP, minLo, maxLo, minAvPreMhv, maxAvPreMhv, minLstPrcL,
      maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls,
      minLstClsNewsCnt, maxLstClsNewsCnt, minVolNFfromLstCls, maxVolNFfromLstCls, requireHasNews, excludeHasNews, requireHasReport, excludeHasReport, minNewsCnt,
      maxNewsCnt, requireIsPTP, requireIsSSR, requireIsETF, requireIsCrap, excludePTP,
      excludeSSR, excludeETF, excludeCrap, minMdnPreMhVol90, maxMdnPreMhVol90,
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
              return localStorage.getItem(SCANNER_ACTIVE_PRESET_ID_LS_KEY) ?? "";
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
        localStorage.setItem(SCANNER_ACTIVE_PRESET_ID_LS_KEY, scannerPresetId);
      } else {
        localStorage.removeItem(SCANNER_ACTIVE_PRESET_ID_LS_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [scannerPresetId]);

  const scannerSharedFilterSetters = {
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
      localStorage.setItem(PAPER_ARB_FILTERS_LS_KEY, JSON.stringify(base));
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
        base = JSON.parse(localStorage.getItem(PAPER_ARB_FILTERS_LS_KEY) ?? JSON.stringify(persistedFilters));
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

      localStorage.setItem(PAPER_ARB_FILTERS_LS_KEY, JSON.stringify(next));
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

  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    if (filtersRestoringRef.current) return;
    try {
      localStorage.setItem(PAPER_ARB_FILTERS_LS_KEY, JSON.stringify(persistedFilters));
    } catch {
      // ignore quota/storage errors
    }
  }, [persistedFilters]);

  // ========= Build query params for GET /active & /episodes
  function buildGetParams(d: string) {
    // NOTE: priceMode not sent (server accepts empty or LastPrint; Quotes rejected)
    const mh = Math.max(0, Math.min(60, clampInt(minHoldCandles, 0)));
    const applyTickers = splitListUpper(tickersText);
    const pinTickers = splitListUpper(benchTickersText);
    const reqTickers =
      listMode === "apply" ? applyTickers : listMode === "pin" ? pinTickers : [];

    return {
      dateNy: d,
      metric,
      startAbs,
      usePrintMedianDelta: zapUiMode === "delta" ? true : undefined,
      startAbsMax: optNumOrNull(startAbsMax),
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      pnlMode,
      ratingType: ratingType ?? "any",

      tickers: reqTickers.length ? reqTickers : null,
      benchTickers: null,
      side: sideFilter ? sideFilter : null,

      exchanges: splitListUpper(exchangesText).length ? splitListUpper(exchangesText) : null,
      countries: splitListUpper(countriesText).length ? splitListUpper(countriesText) : null,
      sectorsL3: splitList(sectorsL3Text).length ? splitList(sectorsL3Text) : null,

      minTierBp: optNumOrNull(minTierBp),
      maxTierBp: optNumOrNull(maxTierBp),
      minBeta: optNumOrNull(minBeta),
      maxBeta: optNumOrNull(maxBeta),

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

  function buildPostRequest(from: string, to: string): PaperArbAnalyticsRequest {
    const mh = Math.max(0, Math.min(180, clampInt(minHoldCandles, 0)));
    const startAbsMaxNum = optNumOrNull(startAbsMax);
    const startAbsMaxEff = startAbsMaxNum != null && startAbsMaxNum > 0 && (zapUiMode === "delta" || startAbsMaxNum >= startAbs) ? startAbsMaxNum : null;
    const applyTickers = splitListUpper(tickersText);
    const pinTickers = splitListUpper(benchTickersText);
    const reqTickers =
      listMode === "apply" ? applyTickers : listMode === "pin" ? pinTickers : [];

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
      usePrintMedianDelta: zapUiMode === "delta" ? true : undefined,
      startAbsMax: startAbsMaxEff,
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      pnlMode,

      ratingType: ratingType ?? "any",
      ratingRules: rrForRequest,

      tickers: reqTickers.length ? reqTickers : null,
      benchTickers: null,
      side: sideFilter ? sideFilter : null,

      exchanges: splitListUpper(exchangesText).length ? splitListUpper(exchangesText) : null,
      countries: splitListUpper(countriesText).length ? splitListUpper(countriesText) : null,
      sectorsL3: splitList(sectorsL3Text).length ? splitList(sectorsL3Text) : null,

      minTierBp: optNumOrNull(minTierBp),
      maxTierBp: optNumOrNull(maxTierBp),
      minBeta: optNumOrNull(minBeta),
      maxBeta: optNumOrNull(maxBeta),

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
    const key = JSON.stringify(req);
    const now = Date.now();
    const cached = episodesSearchCacheRef.current.get(key);
    if (cached && now - cached.ts <= EPISODES_SEARCH_CACHE_TTL_MS) {
      return cached.rows;
    }

    const inFlight = episodesSearchInFlightRef.current.get(key);
    if (inFlight) return inFlight;

    const requestPromise = apiPost<any>("/api/paper/arbitrage/episodes/search", req)
      .then((j) => normalizeRows<PaperArbClosedDto>(j) ?? [])
      .then((rows) => {
        episodesSearchCacheRef.current.set(key, { ts: Date.now(), rows });
        if (episodesSearchCacheRef.current.size > EPISODES_SEARCH_CACHE_MAX) {
          const oldestKey = episodesSearchCacheRef.current.keys().next().value;
          if (oldestKey) episodesSearchCacheRef.current.delete(oldestKey);
        }
        return rows;
      })
      .finally(() => {
        episodesSearchInFlightRef.current.delete(key);
      });

    episodesSearchInFlightRef.current.set(key, requestPromise);
    return requestPromise;
  }

  // ========= Run handler
  async function run() {
    if (!canRun) return;

    setLoading(true);
    setErr(null);

    try {
      if (tab === "active") {
        setAnalytics(null);
        const params = buildGetParams(dateNy);
        const qs = buildPaperQuery(params);
        const j = await apiGet<any>(`/api/paper/arbitrage/active${qs}`);
        const rows = normalizeRows<PaperArbActiveRow>(j);
        setActiveRows(rows ?? []);
      } else if (tab === "episodes") {
        setAnalytics(null);
        if (!(episodesUseSearch || forceEpisodesSearch)) {
          const params = buildGetParams(dateNy);
          const qs = buildPaperQuery(params);
          const j = await apiGet<any>(`/api/paper/arbitrage/episodes${qs}`);
          const rows = normalizeRows<PaperArbClosedDto>(j);
          setEpisodesRows(rows ?? []);
        } else {
          const req = buildPostRequest(dateFrom, dateTo);
          const rows = await fetchEpisodesSearchRows(req);
          setEpisodesRows(rows);
        }
      } else {
        const req = buildPostRequest(dateFrom, dateTo);
        req.includeEquityCurve = includeEquityCurve;
        req.equityCurveMode = equityCurveMode;
        req.topN = Math.max(1, Math.min(1000, clampInt(scopeMode === "ALL" ? 1000 : topN, 1000)));
        req.startCutoffMinuteIdx = Math.max(0, clampInt(offset, 0));
        const [analyticsResp, rows] = await Promise.all([
          apiPost<PaperArbAnalyticsResponse>("/api/paper/arbitrage/analytics", req),
          fetchEpisodesSearchRows(buildPostRequest(dateFrom, dateTo)),
        ]);

        setAnalytics(analyticsResp ?? null);
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
        const j = await apiPost<any>("/api/paper/arbitrage/episodes/search", req);
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

    pushRangeScenarios("adv20", "ADV20", minAdv20, maxAdv20, "minAdv20", "maxAdv20");
    pushRangeScenarios("adv20nf", "ADV20NF", minAdv20NF, maxAdv20NF, "minAdv20NF", "maxAdv20NF");
    pushRangeScenarios("adv90", "ADV90", minAdv90, maxAdv90, "minAdv90", "maxAdv90");
    pushRangeScenarios("adv90nf", "ADV90NF", minAdv90NF, maxAdv90NF, "minAdv90NF", "maxAdv90NF");
    pushRangeScenarios("avpremhv", "AvPreMhv", minAvPreMhv, maxAvPreMhv, "minAvPreMhv", "maxAvPreMhv");
    pushRangeScenarios("roundlot", "RoundLot", minRoundLot, maxRoundLot, "minRoundLot", "maxRoundLot");
    pushRangeScenarios("vwap", "VWAP", minVWAP, maxVWAP, "minVWAP", "maxVWAP");
    pushRangeScenarios("spread", "Spread", minSpread, maxSpread, "minSpread", "maxSpread");
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

    if (currentRatingRule.minRate > 0) {
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
    if (currentRatingRule.minTotal > 0) {
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
    zapUiMode,
  ]);

  const clearOptimizerFields = (req: PaperArbAnalyticsRequest) => {
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
    req.ratingRules = [{ band: ruleBand, minRate: 0, minTotal: 0 }];
  };

  async function loadOptimizerRangesByGroup(from: string, to: string) {
    const effectiveScopeKeys = scopeSelectedParameterKeys.length
      ? scopeSelectedParameterKeys
      : SCOPE_PARAMETER_DEFINITIONS.map((item) => item.key);
    const loadAllScopeKeys = effectiveScopeKeys.length >= SCOPE_PARAMETER_DEFINITIONS.length;
    const requestedGroups = new Map<OptimizerRangeGroupKey, string[]>();
    for (const key of effectiveScopeKeys) {
      const def = SCOPE_PARAMETER_BY_KEY.get(key);
      if (!def) continue;
      const list = requestedGroups.get(def.group) ?? [];
      list.push(def.key);
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
      if (!loadAllScopeKeys && !requestedGroups.has(group)) continue;
      const groupKeys = loadAllScopeKeys
        ? SCOPE_PARAMETER_DEFINITIONS.filter((item) => item.group === group).map((item) => item.key)
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
      "RATING GATES": { loading: true, error: null, partial: false },
      "ZAP THRESHOLDS": { loading: true, error: null, partial: false },
      "TAPE FILTERS": { loading: true, error: null, partial: false },
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
        groupReq.optimizerBucketCount = bucketCount ?? Math.max(3, Math.min(16, Math.trunc(optimizerBucketCount)));
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

  async function runEpisodesOptimizer() {
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
    setOptimizerComboRows([]);
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

      const overlayParameters = scopeOverlayParameterKeys.map((value) => value.trim()).filter(Boolean);
      const uniqueOverlayParameters = Array.from(new Set(overlayParameters));
      const scenariosByParameter = scopeScenarioRows.reduce<Map<string, OptimizerScenario[]>>((acc, scenario) => {
        if (scenario.id === "baseline" || scenario.id === "current-stack" || scenario.parameter === "BASE" || scenario.parameter === "STACK") return acc;
        const list = acc.get(scenario.parameter) ?? [];
        list.push(scenario);
        acc.set(scenario.parameter, list);
        return acc;
      }, new Map());

      let overlayCombos: Array<Array<OptimizerScenario | null>> = [];
      if (overlayParameters.length > 0) {
        if (overlayParameters.length !== 2 || uniqueOverlayParameters.length !== 2) {
          setOptimizerErr("Select exactly 2 unique parameters for overlay research.");
          setOptimizerLoading(false);
          return;
        }

        const selectedScenarioGroups = uniqueOverlayParameters.map((parameter) => ({
          parameter,
          scenarios: scenariosByParameter.get(parameter) ?? [],
        }));
        const missingParameter = selectedScenarioGroups.find((group) => group.scenarios.length === 0);
        if (missingParameter) {
          setOptimizerErr(`No SCOPE scenarios available for ${missingParameter.parameter}. Enter a value for that parameter first.`);
          setOptimizerLoading(false);
          return;
        }

        overlayCombos = [[]];
        for (const group of selectedScenarioGroups) {
          const next: Array<Array<OptimizerScenario | null>> = [];
          const scenarioChoices: Array<OptimizerScenario | null> = [null, ...group.scenarios];
          for (const combo of overlayCombos) {
            for (const scenario of scenarioChoices) next.push([...combo, scenario]);
          }
          overlayCombos = next;
        }
      }

      const singleScenarioCount = scopeScenarioRows.length;
      const comboWorkEstimate = overlayCombos.length;
      setOptimizerProgress({ done: 0, total: singleScenarioCount + comboWorkEstimate });

      const baseRequest = buildPostRequest(from, to);
      clearOptimizerFields(baseRequest);

      const rowRequests = scopeScenarioRows.map((scenario) =>
        buildScopeScenarioRequest(scenario.id, scenario.parameter, scenario.variant, scenario.summary, scenario.apply)
      );
      const comboRequests = overlayCombos.map((combo) => {
        const scenarios = combo.filter((scenario): scenario is OptimizerScenario => scenario != null);
        const comboId = combo.map((scenario) => scenario?.id ?? "off").join("|");
        const parameter = uniqueOverlayParameters
          .map((parameter, index) => `${parameter}:${combo[index] ? combo[index]!.variant : "OFF"}`)
          .join(" | ");
        const summary = combo
          .map((scenario, index) => `${uniqueOverlayParameters[index]} => ${scenario?.summary ?? "OFF"}`)
          .join(" | ");
        return buildScopeScenarioRequest(
          `combo:${comboId}`,
          parameter,
          "PAIR",
          summary,
          (req) => {
            scenarios.forEach((scenario) => scenario.apply(req));
          }
        );
      });

      const resp = await apiPostWithTimeout<ScopeBatchResponse>(
        "/api/paper/arbitrage/scope/evaluate",
        {
          baseRequest,
          rows: rowRequests,
          comboRows: comboRequests,
        },
        180_000
      );

      const out = [...(resp?.rows ?? [])].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
        return b.trades - a.trades;
      });
      const comboRows = [...(resp?.comboRows ?? [])].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
        return b.trades - a.trades;
      });

      setOptimizerRows(out);
      setOptimizerComboRows(comboRows);
      setOptimizerProgress({ done: singleScenarioCount + comboWorkEstimate, total: singleScenarioCount + comboWorkEstimate });
      void loadOptimizerRangesByGroup(from, to);
    } catch (e: any) {
      setOptimizerErr(e?.message ?? String(e));
    } finally {
      setOptimizerLoading(false);
    }
  }

  useEffect(() => {
    if (optimizerBucketReloadRef.current == null) {
      optimizerBucketReloadRef.current = optimizerBucketCount;
      return;
    }
    if (optimizerBucketReloadRef.current === optimizerBucketCount) return;
    optimizerBucketReloadRef.current = optimizerBucketCount;
    if (!optimizerRows.length && !optimizerComboRows.length && !optimizerRanges?.parameters?.length) return;
    const from = dateMode === "day" ? dateNy : dateFrom;
    const to = dateMode === "day" ? dateNy : dateTo;
    if (!toYmd(from) || !toYmd(to) || from > to) return;
    void loadOptimizerRangesByGroup(from, to);
  }, [
    optimizerBucketCount,
    optimizerRows.length,
    optimizerComboRows.length,
    optimizerRanges?.parameters?.length,
    dateMode,
    dateNy,
    dateFrom,
    dateTo,
  ]);

  const ignoreSet = useMemo(() => new Set(splitListUpper(ignoreTickersText)), [ignoreTickersText]);
  const applySet = useMemo(() => new Set(splitListUpper(tickersText)), [tickersText]);
  const pinSet = useMemo(() => new Set(splitListUpper(benchTickersText)), [benchTickersText]);

  const listModeAllowsTicker = (tkRaw: string | null | undefined) => {
    const tk = tickerKey(tkRaw);
    if (!tk) return false;
    if (listMode === "ignore") return !ignoreSet.has(tk);
    if (listMode === "apply") return applySet.has(tk);
    if (listMode === "pin") return pinSet.has(tk);
    return true;
  };

  // ========= Client-side filters
  const filteredActive = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    return activeRows.filter((r) => {
      if (!listModeAllowsTicker(r.ticker)) return false;
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      if (zapUiMode === "delta" && !passesDeltaZapGate({
        side: r.side,
        metricAbs: r.start?.metricAbs,
        deltaAbs: startAbs,
        printMedianPos: r.printMedianPos,
        printMedianNeg: r.printMedianNeg,
      })) return false;
      return true;
    });
  }, [activeRows, qTicker, qSide, listMode, ignoreSet, applySet, pinSet, zapUiMode, startAbs]);

  const filteredEpisodes = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    return episodesRows.filter((r) => {
      if (!listModeAllowsTicker(r.ticker)) return false;
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      if (zapUiMode === "delta" && !passesDeltaZapGate({
        side: r.side,
        metricAbs: r.startMetricAbs,
        deltaAbs: startAbs,
        printMedianPos: r.printMedianPos,
        printMedianNeg: r.printMedianNeg,
      })) return false;
      return true;
    });
  }, [episodesRows, qTicker, qSide, listMode, ignoreSet, applySet, pinSet, zapUiMode, startAbs]);

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
        return r.startMetricAbs ?? -1;
      case "peakAbs":
        return r.peakMetricAbs ?? -1;
      case "endAbs":
        return r.endMetricAbs ?? -1;
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
      const currentDelta =
        startAbs != null && lastAbs != null && Number.isFinite(startAbs) && Number.isFinite(lastAbs)
          ? lastAbs - startAbs
          : 0;

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
        endMinuteIdx: row.last?.minuteIdx ?? row.peak?.minuteIdx ?? row.start?.minuteIdx ?? 0,
        startMetric: row.start?.metric ?? null,
        startMetricAbs: startAbs,
        peakMetric: row.peak?.metric ?? null,
        peakMetricAbs: peakAbs,
        endMetric: row.last?.metric ?? null,
        endMetricAbs: lastAbs,
        closeMode: row.closeMode ?? closeMode,
        minHoldCandles: row.minHoldCandles ?? minHoldCandles,
        rawPnlUsd: currentDelta,
        benchPnlUsd: 0,
        hedgedPnlUsd: currentDelta,
        totalPnlUsd: currentDelta,
      };
    });
  }, [filteredActive, dateNy, closeMode, minHoldCandles]);

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
    const total = rows.reduce((s, r) => s + (r.totalPnlUsd ?? 0), 0);
    const wins = rows.filter((r) => (r.totalPnlUsd ?? 0) > 0).length;
    const losses = rows.filter((r) => (r.totalPnlUsd ?? 0) < 0).length;
    const avg = rows.length ? total / rows.length : 0;
    return { total, wins, losses, avg, count: rows.length };
  }, [filteredEpisodes]);

  const scopeResearchObservedBoundsByPanel = useMemo<Record<ScopePanelKey, { min: number | null; max: number | null; count: number }>>(() => {
    const buildBounds = (parameterKey: ScopeResearchParameterKey) => {
      const values = filteredEpisodes
        .map((row) => scopeResearchParameterValue(row, parameterKey))
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (!values.length) return { min: null as number | null, max: null as number | null, count: 0 };
      return { min: Math.min(...values), max: Math.max(...values), count: values.length };
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
  const optimizerBestComboRow = useMemo(() => optimizerComboRows[0] ?? null, [optimizerComboRows]);
  const scopeSelectedParameters = useMemo(
    () => scopeSelectedParameterKeys.map((key) => SCOPE_PARAMETER_BY_KEY.get(key)).filter(Boolean) as ScopeParameterDefinition[],
    [scopeSelectedParameterKeys]
  );
  const scopeSelectedScenarioParameterLabels = useMemo(
    () => scopeSelectedParameters.map((item) => item.scenarioParameter ?? null).filter(Boolean) as string[],
    [scopeSelectedParameters]
  );
  const scopeOverlayScenarioOptions = useMemo(
    () => Array.from(new Set(scopeSelectedScenarioParameterLabels)).sort((left, right) => left.localeCompare(right)),
    [scopeSelectedScenarioParameterLabels]
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

    return source
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
  const optimizerRangeParameters = useMemo(() => optimizerRanges?.parameters ?? [], [optimizerRanges]);
  const optimizerRankValue = (bucket: PaperArbOptimizerRangeBucketDto) =>
    optimizerRangeRankMetric === "winRate"
      ? bucket.winRate
      : optimizerRangeRankMetric === "totalPnlUsd"
        ? bucket.totalPnlUsd
        : optimizerRangeRankMetric === "score"
          ? bucket.score
          : bucket.avgPnlUsd;
  const optimizerRangeParametersSorted = useMemo(() => {
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

  const analyticsSummary = useMemo(() => {
    const pnl = filteredEpisodes.map((r) => r.totalPnlUsd ?? 0);
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

    const serverEquityCurve = includeEquityCurve ? (analytics?.equityCurve ?? null) : null;

    return {
      trades,
      totalPnlUsd: analytics?.totalPnlUsd ?? totalPnlUsd,
      winRate: analytics?.winRate ?? winRate,
      profitFactor: analytics?.profitFactor ?? profitFactor,
      avgPnlUsd: analytics?.avgPnlUsd ?? avgPnlUsd,
      avgWinUsd: analytics?.avgWinUsd ?? avgWin,
      avgLossUsd: analytics?.avgLossUsd != null ? -Math.abs(analytics.avgLossUsd) : avgLoss,
      maxWinUsd: analytics?.maxWinUsd ?? maxWinUsd,
      maxLossUsd: analytics?.maxLossUsd != null ? Math.min(analytics.maxLossUsd, 0) : maxLossUsd,
      expectancyUsd: analytics?.expectancyUsd ?? expectancyUsd,
      maxDrawdownUsd: analytics?.maxDrawdownUsd ?? maxDrawdownUsd,
      equityCurve: serverEquityCurve && serverEquityCurve.length > 0 ? serverEquityCurve : equityCurve,
    };
  }, [filteredEpisodes, equityCurveMode, dateMode, dateNy, analytics, includeEquityCurve]);

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
      if (ix < 0) return arr;
      const cp = [...arr];
      cp[ix] = { ...cp[ix], ...patch };
      return cp;
    });
  };

  useEffect(() => {
    setZapUiMode((prev) => {
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

  // ========= UI
  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-hidden", accent.selection, isLightTheme && "scanner-light-theme")}>

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <header className="scanner-header-surface bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={clsx("w-2.5 h-2.5 rounded-full border border-white/10", accent.dot, loading && "animate-pulse")} />
              <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                ARBITRAGE SCANNER
              </h1>
              <div className="flex gap-2 ml-4">
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{classLabel}</span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{modeLabel}</span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{typeLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              <span>{updatedLabel ? `UPDATED ${updatedLabel}` : "CONNECTING..."}</span>
              <span className="text-zinc-700 mx-1">|</span>
              <span className="opacity-70">minRate {num(minRateLabel, 2)} | minTotal {intn(minTotalLabel)} | limit {intn(limitLabel)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              <button type="button" disabled className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase border border-transparent text-zinc-600 bg-transparent cursor-not-allowed">
                MONEY
              </button>
              <button
                type="button"
                className={clsx("px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border", accent.activeSoft)}
                title="SCANNER (current)"
              >
                SCANNER
              </button>
              <Link
                href="/signals/arbitrage"
                className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                title="Open /signals/arbitrage"
              >
                SONAR
              </Link>
            </div>

            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  tab === "active"
                    ? accent.activeSoft
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                ACTIVE
              </button>
              <button
                type="button"
                onClick={() => setTab("episodes")}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  tab === "episodes"
                    ? accent.activeSoft
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                SCOPE
              </button>
              <button
                type="button"
                onClick={() => setTab("analytics")}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  tab === "analytics"
                    ? accent.activeSoft
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                ANALYTICS
              </button>
            </div>

            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              <div
                className={clsx(
                  "flex items-stretch overflow-hidden rounded-lg border transition-all",
                  listMode === "ignore" ? "border-rose-500/30 bg-rose-500/12" : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setModeIgnore();
                    setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                    listMode === "ignore" ? "text-rose-300" : "text-zinc-300"
                  )}
                  title="LIST MODE: IGNORE"
                >
                  <span className="tracking-wide">IGN</span>
                  {ignCount > 0 && <span className="opacity-70">({ignCount})</span>}
                </button>
                <div className="w-px bg-white/10" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !showIgnore;
                    setShowIgnore(next);
                    if (next) setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                    showIgnore ? "text-rose-300" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showIgnore ? "" : "opacity-80"}>
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>

              <div
                className={clsx(
                  "flex items-stretch overflow-hidden rounded-lg border transition-all",
                  listMode === "apply" ? "border-emerald-500/25 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setModeApply();
                    setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                    listMode === "apply" ? "text-emerald-300" : "text-zinc-300"
                  )}
                  title="LIST MODE: APPLY"
                >
                  <span className="tracking-wide">APP</span>
                  {appCount > 0 && <span className="opacity-70">({appCount})</span>}
                </button>
                <div className="w-px bg-white/10" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !showApply;
                    setShowApply(next);
                    if (next) setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                    showApply ? "text-emerald-300" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showApply ? "" : "opacity-80"}>
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>

              <div
                className={clsx(
                  "flex items-stretch overflow-hidden rounded-lg border transition-all",
                  listMode === "pin" ? "border-violet-400/30 bg-violet-400/12" : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setModePin();
                    setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                    listMode === "pin" ? "text-violet-200" : "text-zinc-300"
                  )}
                  title="LIST MODE: PIN"
                >
                  <span className="tracking-wide">PIN</span>
                  {pinCount > 0 && <span className="opacity-70">({pinCount})</span>}
                </button>
                <div className="w-px bg-white/10" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !showPin;
                    setShowPin(next);
                    if (next) setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                    showPin ? "text-violet-300" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showPin ? "" : "opacity-80"}>
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className={clsx(
                "w-9 h-9 flex items-center justify-center rounded-lg border bg-[#0a0a0a]/40 transition-all active:scale-95",
                canRun
                  ? accent.outlineButton
                  : "border-white/10 bg-[#0a0a0a]/30 text-zinc-600 cursor-not-allowed"
              )}
              title={variantString}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>

          </div>
        </header>

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
          <GlassCard className="p-3 border-white/[0.08] bg-[#05070b]/95">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {showIgnore && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-rose-300">
                      IGNORE TICKERS
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => ignoreFileInputRef.current?.click()}
                        className="text-[10px] font-mono px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                      >
                        IMPORT CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setIgnoreTickersText("")}
                        className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                      >
                        CLR
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={ignoreTickersText}
                    onChange={(e) => setIgnoreTickersText(e.target.value.toUpperCase())}
                    rows={4}
                    placeholder="AAPL, TSLA, NVDA"
                    className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500/45 font-mono"
                  />
                  <input
                    ref={ignoreFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={onIgnoreFileSelected}
                    className="hidden"
                  />
                </div>
              )}

              {showApply && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-emerald-300">
                      APPLY TICKERS
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyFileInputRef.current?.click()}
                        className="text-[10px] font-mono px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                      >
                        IMPORT CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setTickersText("")}
                        className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                      >
                        CLR
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={tickersText}
                    onChange={(e) => setTickersText(e.target.value.toUpperCase())}
                    rows={4}
                    placeholder="AAPL, TSLA, NVDA"
                    className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 font-mono"
                  />
                  <input
                    ref={applyFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={onApplyFileSelected}
                    className="hidden"
                  />
                </div>
              )}

              {showPin && (
                <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-violet-200">
                      PIN TICKERS
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => pinFileInputRef.current?.click()}
                        className="text-[10px] font-mono px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
                      >
                        IMPORT CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setBenchTickersText("")}
                        className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                      >
                        CLR
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={benchTickersText}
                    onChange={(e) => setBenchTickersText(e.target.value.toUpperCase())}
                    rows={4}
                    placeholder="AAPL, TSLA, NVDA"
                    className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-400/45 font-mono"
                  />
                  <input
                    ref={pinFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={onPinFileSelected}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </GlassCard>
        )}

        <div className="scanner-glass-card flex flex-wrap gap-4 items-center rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          
            <div className="flex h-7 items-center gap-2">
              {[
                { key: "GLOBAL", label: "GLOB" },
                { key: "BLUE", label: "BLUE" },
                { key: "ARK", label: "ARK" },
                { key: "PRINT", label: "PRINT" },
                { key: "OPEN", label: "OPEN" },
                { key: "INTRA", label: "INTRA" },
                { key: "POST", label: "POST" },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => {
                    const nextBand = b.key as PaperArbRatingBand;
                    setRuleBand(nextBand);
                    setRatingEnabledBands({
                      BLUE: nextBand === "BLUE",
                      ARK: nextBand === "ARK",
                      OPEN: nextBand === "OPEN",
                      INTRA: nextBand === "INTRA",
                      PRINT: nextBand === "PRINT",
                      POST: nextBand === "POST",
                      GLOBAL: nextBand === "GLOBAL",
                    });
                    if (nextBand === "GLOBAL") setSession("GLOB");
                    if (nextBand === "BLUE") setSession("BLUE");
                    if (nextBand === "ARK") setSession("ARK");
                    if (nextBand === "OPEN") setSession("OPEN");
                    if (nextBand === "INTRA") setSession("INTRA");
                    if (nextBand === "POST") setSession("POST");
                  }}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                    ruleBand === b.key
                      ? headerButtonActiveClass
                      : "border-transparent text-zinc-500 hover:text-zinc-300 bg-transparent"
                  )}
                >
                  {b.label}
                </button>
                ))}
            </div>

            <div className="h-7 w-px self-center bg-white/5" />

            <div className="flex h-7 items-center gap-2">
              {[
                { key: "ALL", label: "ALL" },
                { key: "TOP", label: "TOP" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    const next = m.key as "ALL" | "TOP";
                    setScopeMode(next);
                    if (next === "ALL") setTopN(1000);
                  }}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                    scopeMode === m.key
                      ? headerButtonActiveClass
                      : "border-transparent text-zinc-500 hover:text-zinc-300 bg-transparent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="h-7 w-px self-center bg-white/5" />

            <div className="flex h-7 items-center gap-2">
              {[
                { key: "any", label: "ANY" },
                { key: "hard", label: "HARD" },
                { key: "soft", label: "SOFT" },
              ].map((rt) => (
                <button
                  key={rt.key}
                  type="button"
                  onClick={() => setRatingType(rt.key as PaperArbRatingType)}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                    ratingType === rt.key
                      ? headerButtonActiveClass
                      : "border-transparent text-zinc-500 hover:text-zinc-300 bg-transparent"
                  )}
                  title={`RatingType = ${rt.key}`}
                >
                  {rt.label}
                </button>
                ))}
            </div>

            <div className="flex-1" />

            <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
              <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MINRATE</span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0}
                  value={activeRule.minRate}
                  onChange={(e) => setActiveRulePatch({ minRate: Math.max(0, clampNumber(e.target.value, 0)) })}
                  className={clsx("center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", accent.activeText)}
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveRulePatch({ minRate: Math.max(0, +((activeRule.minRate ?? 0) + 0.1).toFixed(4)) })}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Increase min rate"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveRulePatch({ minRate: Math.max(0, +((activeRule.minRate ?? 0) - 0.1).toFixed(4)) })}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Decrease min rate"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
              <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MINTOTAL</span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={0}
                  value={activeRule.minTotal}
                  onChange={(e) => setActiveRulePatch({ minTotal: Math.max(0, clampInt(e.target.value, 0)) })}
                  className={clsx("center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", accent.activeText)}
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveRulePatch({ minTotal: Math.max(0, Math.trunc((activeRule.minTotal ?? 0) + 1)) })}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Increase min total"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveRulePatch({ minTotal: Math.max(0, Math.trunc((activeRule.minTotal ?? 0) - 1)) })}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Decrease min total"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

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
                      ? accent.activeSoft
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
              <MinMaxRow label="ADV20" filterKey="adv20" mode={sharedRangeFilterModes.adv20} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv20} maxValue={maxAdv20} setMin={setMinAdv20} setMax={setMaxAdv20} card clearable />
              <MinMaxRow label="ADV20NF" filterKey="adv20nf" mode={sharedRangeFilterModes.adv20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv20NF} maxValue={maxAdv20NF} setMin={setMinAdv20NF} setMax={setMaxAdv20NF} card clearable />
              <MinMaxRow label="ADV90" filterKey="adv90" mode={sharedRangeFilterModes.adv90} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv90} maxValue={maxAdv90} setMin={setMinAdv90} setMax={setMaxAdv90} card clearable />
              <MinMaxRow label="ADV90NF" filterKey="adv90nf" mode={sharedRangeFilterModes.adv90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv90NF} maxValue={maxAdv90NF} setMin={setMinAdv90NF} setMax={setMaxAdv90NF} card clearable />
              <MinMaxRow label="AvPreMhv" filterKey="avpremhv" mode={sharedRangeFilterModes.avpremhv} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhv} maxValue={maxAvPreMhv} setMin={setMinAvPreMhv} setMax={setMaxAvPreMhv} card clearable />
              <MinMaxRow label="RoundLot" filterKey="roundlot" mode={sharedRangeFilterModes.roundlot} onToggleMode={toggleSharedRangeFilterMode} minValue={minRoundLot} maxValue={maxRoundLot} setMin={setMinRoundLot} setMax={setMaxRoundLot} card clearable />
              <MinMaxRow label="VWAP" filterKey="vwap" mode={sharedRangeFilterModes.vwap} onToggleMode={toggleSharedRangeFilterMode} minValue={minVWAP} maxValue={maxVWAP} setMin={setMinVWAP} setMax={setMaxVWAP} card clearable />
              <MinMaxRow label="Spread" filterKey="spread" mode={sharedRangeFilterModes.spread} onToggleMode={toggleSharedRangeFilterMode} minValue={minSpread} maxValue={maxSpread} setMin={setMinSpread} setMax={setMaxSpread} card clearable />
              <MinMaxRow label="LstPrcL" filterKey="lstprcl" mode={sharedRangeFilterModes.lstprcl} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstPrcL} maxValue={maxLstPrcL} setMin={setMinLstPrcL} setMax={setMaxLstPrcL} card clearable />
              <MinMaxRow label="LstCls" filterKey="lstcls" mode={sharedRangeFilterModes.lstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstCls} maxValue={maxLstCls} setMin={setMinLstCls} setMax={setMaxLstCls} card clearable />
              <MinMaxRow label="YCls" filterKey="ycls" mode={sharedRangeFilterModes.ycls} onToggleMode={toggleSharedRangeFilterMode} minValue={minYCls} maxValue={maxYCls} setMin={setMinYCls} setMax={setMaxYCls} card clearable />
              <MinMaxRow label="TCls" filterKey="tcls" mode={sharedRangeFilterModes.tcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minTCls} maxValue={maxTCls} setMin={setMinTCls} setMax={setMaxTCls} card clearable />
              <MinMaxRow label="ClsToCls%" filterKey="clstocls" mode={sharedRangeFilterModes.clstocls} onToggleMode={toggleSharedRangeFilterMode} minValue={minClsToClsPct} maxValue={maxClsToClsPct} setMin={setMinClsToClsPct} setMax={setMaxClsToClsPct} card clearable />
              <MinMaxRow label="Lo" filterKey="lo" mode={sharedRangeFilterModes.lo} onToggleMode={toggleSharedRangeFilterMode} minValue={minLo} maxValue={maxLo} setMin={setMinLo} setMax={setMaxLo} card clearable />
              <MinMaxRow
                label="LstClsNewsCnt"
                filterKey="lstclsnewscnt"
                mode={sharedRangeFilterModes.lstclsnewscnt}
                onToggleMode={toggleSharedRangeFilterMode}
                minValue={minLstClsNewsCnt}
                maxValue={maxLstClsNewsCnt}
                setMin={setMinLstClsNewsCnt}
                setMax={setMaxLstClsNewsCnt}
                card
                clearable
              />
              <MinMaxRow
                label="MarketCapM"
                filterKey="marketcapm"
                mode={sharedRangeFilterModes.marketcapm}
                onToggleMode={toggleSharedRangeFilterMode}
                minValue={minMarketCapM}
                maxValue={maxMarketCapM}
                setMin={setMinMarketCapM}
                setMax={setMaxMarketCapM}
                card
                clearable
              />
              <MinMaxRow label="PreMhVolNF" filterKey="premhvolnf" mode={sharedRangeFilterModes.premhvolnf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMktVolNF} maxValue={maxPreMktVolNF} setMin={setMinPreMktVolNF} setMax={setMaxPreMktVolNF} card clearable />
              <MinMaxRow
                label="VolNFfromLstCls"
                filterKey="volnffromlstcls"
                mode={sharedRangeFilterModes.volnffromlstcls}
                onToggleMode={toggleSharedRangeFilterMode}
                minValue={minVolNFfromLstCls}
                maxValue={maxVolNFfromLstCls}
                setMin={setMinVolNFfromLstCls}
                setMax={setMaxVolNFfromLstCls}
                card
                clearable
              />
              <MinMaxRow label="AvPostMhVol90NF" filterKey="avpostmhvol90nf" mode={sharedRangeFilterModes.avpostmhvol90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPostMhVol90NF} maxValue={maxAvPostMhVol90NF} setMin={setMinAvPostMhVol90NF} setMax={setMaxAvPostMhVol90NF} card clearable />
              <MinMaxRow label="AvPreMhVol90NF" filterKey="avpremhvol90nf" mode={sharedRangeFilterModes.avpremhvol90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhVol90NF} maxValue={maxAvPreMhVol90NF} setMin={setMinAvPreMhVol90NF} setMax={setMaxAvPreMhVol90NF} card clearable />
              <MinMaxRow label="AvPreMhValue20NF" filterKey="avpremhvalue20nf" mode={sharedRangeFilterModes.avpremhvalue20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhValue20NF} maxValue={maxAvPreMhValue20NF} setMin={setMinAvPreMhValue20NF} setMax={setMaxAvPreMhValue20NF} card clearable />
              <MinMaxRow label="AvPreMhValue90NF" filterKey="avpremhvalue90nf" mode={sharedRangeFilterModes.avpremhvalue90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhValue90NF} maxValue={maxAvPreMhValue90NF} setMin={setMinAvPreMhValue90NF} setMax={setMaxAvPreMhValue90NF} card clearable />
              <MinMaxRow label="AvgDailyValue20" filterKey="avgdailyvalue20" mode={sharedRangeFilterModes.avgdailyvalue20} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvgDailyValue20} maxValue={maxAvgDailyValue20} setMin={setMinAvgDailyValue20} setMax={setMaxAvgDailyValue20} card clearable />
              <MinMaxRow label="AvgDailyValue90" filterKey="avgdailyvalue90" mode={sharedRangeFilterModes.avgdailyvalue90} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvgDailyValue90} maxValue={maxAvgDailyValue90} setMin={setMinAvgDailyValue90} setMax={setMaxAvgDailyValue90} card clearable />
              <MinMaxRow label="Volatility20" filterKey="volatility20" mode={sharedRangeFilterModes.volatility20} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolatility20} maxValue={maxVolatility20} setMin={setMinVolatility20} setMax={setMaxVolatility20} card clearable />
              <MinMaxRow label="Volatility90" filterKey="volatility90" mode={sharedRangeFilterModes.volatility90} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolatility90} maxValue={maxVolatility90} setMin={setMinVolatility90} setMax={setMaxVolatility90} card clearable />
              <MinMaxRow label="PreMhMDV20NF" filterKey="premhmdv20nf" mode={sharedRangeFilterModes.premhmdv20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhMDV20NF} maxValue={maxPreMhMDV20NF} setMin={setMinPreMhMDV20NF} setMax={setMaxPreMhMDV20NF} card clearable />
              <MinMaxRow label="PreMhMDV90NF" filterKey="premhmdv90nf" mode={sharedRangeFilterModes.premhmdv90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhMDV90NF} maxValue={maxPreMhMDV90NF} setMin={setMinPreMhMDV90NF} setMax={setMaxPreMhMDV90NF} card clearable />
              <MinMaxRow label="VolRel" filterKey="volrel" mode={sharedRangeFilterModes.volrel} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolRel} maxValue={maxVolRel} setMin={setMinVolRel} setMax={setMaxVolRel} card clearable />
              <MinMaxRow label="PreMhHiLstPrc%" filterKey="premhbidlstprc" mode={sharedRangeFilterModes.premhbidlstprc} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhBidLstPrcPct} maxValue={maxPreMhBidLstPrcPct} setMin={setMinPreMhBidLstPrcPct} setMax={setMaxPreMhBidLstPrcPct} card clearable />
              <MinMaxRow label="PreMhLoLstPrc%" filterKey="premhlolstprc" mode={sharedRangeFilterModes.premhlolstprc} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhLoLstPrcPct} maxValue={maxPreMhLoLstPrcPct} setMin={setMinPreMhLoLstPrcPct} setMax={setMaxPreMhLoLstPrcPct} card clearable />
              <MinMaxRow label="PreMhHiLstCls%" filterKey="premhhilstcls" mode={sharedRangeFilterModes.premhhilstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhHiLstClsPct} maxValue={maxPreMhHiLstClsPct} setMin={setMinPreMhHiLstClsPct} setMax={setMaxPreMhHiLstClsPct} card clearable />
              <MinMaxRow label="PreMhLoLstCls%" filterKey="premhlolstcls" mode={sharedRangeFilterModes.premhlolstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhLoLstClsPct} maxValue={maxPreMhLoLstClsPct} setMin={setMinPreMhLoLstClsPct} setMax={setMaxPreMhLoLstClsPct} card clearable />
              <MinMaxRow label="LstPrcLstCls%" filterKey="lstprclstcls" mode={sharedRangeFilterModes.lstprclstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstPrcLstClsPct} maxValue={maxLstPrcLstClsPct} setMin={setMinLstPrcLstClsPct} setMax={setMaxLstPrcLstClsPct} card clearable />
              <MinMaxRow label="ImbExch9:25" filterKey="imbexch925" mode={sharedRangeFilterModes.imbexch925} onToggleMode={toggleSharedRangeFilterMode} minValue={minImbExch925} maxValue={maxImbExch925} setMin={setMinImbExch925} setMax={setMaxImbExch925} card clearable />
              <MinMaxRow label="ImbExch15:55" filterKey="imbexch1555" mode={sharedRangeFilterModes.imbexch1555} onToggleMode={toggleSharedRangeFilterMode} minValue={minImbExch1555} maxValue={maxImbExch1555} setMin={setMinImbExch1555} setMax={setMaxImbExch1555} card clearable />
            </div>
          )}

        <GlassCard className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              {[
                { key: "Active", label: "ACTIVE" },
                { key: "Passive", label: "PASSIVE" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setCloseMode(m.key as PaperArbCloseMode)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    closeMode === m.key
                      ? accent.activeSoft
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              {[
                { key: "Hedged", label: "HEDGED" },
                { key: "RawOnly", label: "RAWONLY" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPnlMode(m.key as PaperArbPnlMode)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    pnlMode === m.key
                      ? accent.activeSoft
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              {[
                { key: "Daily", label: "DAILY" },
                { key: "Trade", label: "TRADE" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setEquityCurveMode(m.key as "Daily" | "Trade")}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    equityCurveMode === m.key
                      ? accent.activeSoft
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
                ))}
            </div>

            <div ref={sessionSelectWrapperRef} className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-lg", SCANNER_CONTROL_SURFACE)}>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">SESSION</span>
              <GlassSelect
                value={session}
                onChange={(e) => {
                  const nextSession = e.target.value as PaperArbSession;
                  setSession(nextSession);
                  const band = ratingBandFromSession(nextSession);
                  setRuleBand(band);
                  setRatingEnabledBands({
                    BLUE: band === "BLUE",
                    ARK: band === "ARK",
                    OPEN: band === "OPEN",
                    INTRA: band === "INTRA",
                    PRINT: band === "PRINT",
                    POST: band === "POST",
                    GLOBAL: band === "GLOBAL",
                  });
                }}
                options={[
                  { value: "GLOB", label: "GLOB" },
                  { value: "BLUE", label: "BLUE" },
                  { value: "ARK", label: "ARK" },
                  { value: "OPEN", label: "OPEN" },
                  { value: "INTRA", label: "INTRA" },
                  { value: "POST", label: "POST" },
                  { value: "NIGHT", label: "NIGHT" },
                ]}
                compact
                panelAnchorRef={sessionSelectWrapperRef}
                className="w-[72px] !h-[14px] !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
              />
            </div>

            <div className="flex h-7 items-center gap-2 px-3 rounded-lg bg-black/20">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">SIDE</span>
              <GlassSelect
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value as any)}
                options={[
                  { value: "", label: "ANY" },
                  { value: "Long", label: "LONG" },
                  { value: "Short", label: "SHORT" },
                ]}
                compact
                className="min-w-[90px] !h-7 !py-0 !px-0 !bg-transparent !border-transparent !focus:border-transparent"
              />
            </div>

            <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
              <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MINHOLD</span>
              <div className="group relative h-8 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={180}
                  step={1}
                  value={minHoldCandles}
                  onChange={(e) => setMinHoldCandles(Math.max(0, Math.min(180, clampInt(e.target.value, 0))))}
                  className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", accent.activeText)}
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setMinHoldCandles((v) => Math.max(0, Math.min(180, Math.trunc(v + 1))))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Increase min hold"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setMinHoldCandles((v) => Math.max(0, Math.min(180, Math.trunc(v - 1))))}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Decrease min hold"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1" />

            {tab === "episodes" && (
              <div className="flex h-7 items-center gap-2 px-2 rounded-lg bg-black/20">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">EP MODE</span>
                <div className="flex h-7 items-center gap-1 rounded-lg bg-transparent">
                  <button
                    type="button"
                    onClick={() => setEpisodesUseSearch(false)}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all border",
                      !episodesUseSearchEffective
                        ? accent.activeSoft
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                    title={forceEpisodesSearch ? "Disabled: extended filters require SEARCH(POST)" : "GET /api/paper/arbitrage/episodes (single day)"}
                    disabled={forceEpisodesSearch}
                  >
                    GET
                  </button>
                  <button
                    type="button"
                    onClick={() => setEpisodesUseSearch(true)}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all border",
                      episodesUseSearchEffective
                        ? accent.activeSoft
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                    title="POST /api/paper/arbitrage/episodes/search (date range + filters)"
                  >
                    SEARCH
                  </button>
                </div>
              </div>
            )}

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
                        ? accent.activeSoft
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
                      className="!inline-flex !w-auto min-w-0 !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                      panelAnchorRef={daySelectWrapperRef}
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
                      className="!inline-flex !w-auto min-w-0 !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
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
                        className="!inline-flex !w-auto min-w-0 !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
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
                        className="!inline-flex !w-auto min-w-0 !h-7 !py-0 !px-0 !gap-1 !bg-transparent !border-0 !rounded-lg !shadow-none !focus:border-0 text-zinc-300"
                        panelAnchorRef={dateToSelectWrapperRef}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-[40px] items-center text-zinc-500 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </span>

            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-rose-900/30 bg-rose-900/10 p-1.5">
              {[
                {
                  label: "Div",
                  disabled: true,
                  title: "Not available in paper arbitrage API",
                  active: false,
                  onClick: () => undefined,
                },
                {
                  label: "News",
                  disabled: false,
                  title: "Exclude news=true",
                  active: excludeHasNews,
                  onClick: () => {
                    setExcludeHasNews((v) => !v);
                    setRequireHasNews(false);
                  },
                },
                {
                  label: "PTP",
                  disabled: false,
                  title: "Toggle",
                  active: excludePTP,
                  onClick: () => {
                    setExcludePTP((v) => !v);
                    setRequireIsPTP(false);
                  },
                },
                {
                  label: "SSR",
                  disabled: false,
                  title: "Toggle",
                  active: excludeSSR,
                  onClick: () => {
                    setExcludeSSR((v) => !v);
                    setRequireIsSSR(false);
                  },
                },
                {
                  label: "Rep",
                  disabled: false,
                  title: "Exclude report=true",
                  active: excludeHasReport,
                  onClick: () => {
                    setExcludeHasReport((v) => !v);
                    setRequireHasReport(false);
                  },
                },
                {
                  label: "ETF",
                  disabled: false,
                  title: "Toggle",
                  active: excludeETF,
                  onClick: () => {
                    setExcludeETF((v) => !v);
                    setRequireIsETF(false);
                  },
                },
                {
                  label: "CRAP",
                  disabled: false,
                  title: "Toggle",
                  active: excludeCrap,
                  onClick: () => {
                    setExcludeCrap((v) => !v);
                    setRequireIsCrap(false);
                  },
                },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.onClick}
                  title={b.title}
                  disabled={b.disabled}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase leading-none transition-all",
                    b.disabled
                      ? "bg-transparent text-zinc-600 border border-zinc-800 cursor-not-allowed"
                      : b.active
                        ? "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                        : "bg-transparent text-rose-500 hover:bg-rose-500/10"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="h-7 w-px bg-white/5" />

            <div className="inline-flex items-center gap-2 rounded-xl border border-[rgba(6,78,59,0.55)] bg-[rgba(6,78,59,0.18)] p-1.5">
              {[
                { label: "USA", active: includeUSA, onClick: () => setIncludeUSA((v) => !v) },
                { label: "CHINA", active: includeChina, onClick: () => setIncludeChina((v) => !v) },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.onClick}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase leading-none transition-all",
                    b.active
                      ? "bg-[rgba(16,185,129,0.95)] text-white shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                      : "bg-transparent text-[#34d399] hover:bg-[rgba(16,185,129,0.10)]"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="ml-auto inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-1.5">
              <button
                type="button"
                onClick={() => {
                  if (zapUiMode === "zap") {
                    setZapUiMode("off");
                    setMetric("SigmaZap");
                  } else {
                    setZapUiMode("zap");
                    setMetric("ZapPct");
                  }
                }}
                className={clsx(
                  "inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-3 text-[10px] font-mono font-bold leading-none transition-all active:scale-[0.98]",
                  zapUiMode === "zap"
                    ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                    : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200"
                )}
              >
                <span className="leading-none" style={{ textTransform: "none" }}>% ZAP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (zapUiMode === "sigma") {
                    setZapUiMode("off");
                  } else {
                    setZapUiMode("sigma");
                    setMetric("SigmaZap");
                  }
                }}
                className={clsx(
                  "inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-3 text-[10px] font-mono font-bold leading-none transition-all active:scale-[0.98]",
                  zapUiMode === "sigma"
                    ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                    : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200"
                )}
              >
                <span className="leading-none" style={{ textTransform: "none" }}>σ ZAP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (zapUiMode === "delta") {
                    setZapUiMode("off");
                  } else {
                    setZapUiMode("delta");
                    setMetric("SigmaZap");
                  }
                }}
                className={clsx(
                  "inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-3 text-[10px] font-mono font-bold leading-none transition-all active:scale-[0.98]",
                  zapUiMode === "delta"
                    ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                    : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200"
                )}
                title="Require start sigma to be above direction-specific print median plus the first input delta"
              >
                <span className="leading-none" style={{ textTransform: "none" }}>Δ ZAP</span>
              </button>

              <div className={clsx("group relative w-[78px]", zapUiMode === "off" && "opacity-60")}>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={startAbs}
                  disabled={zapUiMode === "off"}
                  onChange={(e) => setStartAbs(clampNumber(e.target.value, 0.1))}
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setStartAbs((v) => Math.max(0.1, +(v + 0.1).toFixed(4)))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    aria-label="Increase start abs"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setStartAbs((v) => Math.max(0.1, +(v - 0.1).toFixed(4)))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                    aria-label="Decrease start abs"
                  >
                    ▼
                  </button>
                </div>
              </div>
              <div className={clsx("group relative w-[78px]", zapUiMode === "off" && "opacity-60")}>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={startAbsMax}
                  disabled={zapUiMode === "off"}
                  onChange={(e) => setStartAbsMax(e.target.value)}
                  placeholder="start max"
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bumpStartAbsMax(0.1)}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    aria-label="Increase start max"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bumpStartAbsMax(-0.1)}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                    aria-label="Decrease start max"
                  >
                    ▼
                  </button>
                </div>
              </div>
              <div className={clsx("group relative w-[78px]", zapUiMode === "off" && "opacity-60")}>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={endAbs}
                  disabled={zapUiMode === "off"}
                  onChange={(e) => setEndAbs(clampNumber(e.target.value, 0.05))}
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEndAbs((v) => Math.max(0, +(v + 0.05).toFixed(4)))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    aria-label="Increase end abs"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={zapUiMode === "off"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEndAbs((v) => Math.max(0, +(v - 0.05).toFixed(4)))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                    aria-label="Decrease end abs"
                  >
                    ▼
                  </button>
                </div>
              </div>

            </div>
          </div>
        </GlassCard>

        {/* Error */}
        {err && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-200 text-xs font-mono p-3">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end">
          <div className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase tracking-wide">
            {loading ? "Loading..." : "Idle"} | <span className="text-zinc-200">{variantShort}</span>
          </div>
        </div>

        {/* CONTENT */}
        {tab === "active" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryMetricCard
                label="TOTAL PNL"
                value={num(activeAnalyticsSummary.totalPnlUsd, 2)}
                className="xl:row-span-2 xl:min-h-[124px]"
                valueClassName={
                  clsx(
                    "text-4xl md:text-6xl font-bold",
                    activeAnalyticsSummary.totalPnlUsd > 0
                      ? "text-[#6ee7b7]"
                      : activeAnalyticsSummary.totalPnlUsd < 0
                        ? SOFT_LOSS_TEXT_CLASS
                        : "text-zinc-200"
                  )
                }
              />
              <SummaryMetricCard
                label="TRADES"
                value={intn(activeAnalyticsSummary.trades)}
                inline
              />
              <SummaryMetricCard
                label="WIN RATE"
                value={`${num(activeAnalyticsSummary.winRate * 100, 1)}%`}
                inline
              />
              <SummaryMetricCard
                label="AVG TRADE"
                value={num(activeAnalyticsSummary.avgPnlUsd, 2)}
                inline
                valueClassName={
                  activeAnalyticsSummary.avgPnlUsd > 0
                    ? "text-emerald-300"
                    : activeAnalyticsSummary.avgPnlUsd < 0
                      ? SOFT_LOSS_TEXT_CLASS
                      : "text-zinc-200"
                }
              />
              <SummaryMetricCard
                label="MAX WIN"
                value={num(activeAnalyticsSummary.maxWinUsd, 2)}
                inline
                valueClassName={activeAnalyticsSummary.maxWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG WIN"
                value={num(activeAnalyticsSummary.avgWinUsd, 2)}
                inline
                valueClassName={activeAnalyticsSummary.avgWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="PROFIT FACTOR"
                value={num(activeAnalyticsSummary.profitFactor, 2)}
                inline
              />
              <SummaryMetricCard
                label="EXPECTANCY"
                value={num(activeAnalyticsSummary.expectancyUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX DRAWDOWN"
                value={num(activeAnalyticsSummary.maxDrawdownUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX LOSS"
                value={num(activeAnalyticsSummary.maxLossUsd, 2)}
                inline
                valueClassName={activeAnalyticsSummary.maxLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG LOSS"
                value={num(activeAnalyticsSummary.avgLossUsd, 2)}
                inline
                valueClassName={activeAnalyticsSummary.avgLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
            </div>

            {activeRealtimeSorted.length > 0 ? (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(activeAnalyticsSummary.equityCurve?.length ?? 0) > 0 && (
                    <div className="p-0">
                      <EquityChart
                        points={activeAnalyticsSummary.equityCurve}
                        title={`EQUITY CURVE | ${equityCurveMode}`}
                        meta={`points ${intn(activeAnalyticsSummary.equityCurve?.length ?? 0)}`}
                      />
                    </div>
                  )}

                  <div className="p-0">
                    <StartsEndsByTimeChart
                      rows={activeRealtimeSorted}
                      title="START VS CURRENT BY TIME | 5M"
                      meta={`rows ${intn(activeRealtimeSorted.length)}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <div className="p-0">
                    <StartsByTimeChart
                      rows={activeRealtimeSorted}
                      title="START EVENTS BY TIME (OK/BAD) | 5M"
                      meta={`rows ${intn(activeRealtimeSorted.length)}`}
                    />
                  </div>
                  <div className="p-0">
                    <PeakStrengthByTimeChart
                      rows={activeRealtimeSorted}
                      title="PEAK STRENGTH BY TIME | 5M"
                      meta={`rows ${intn(activeRealtimeSorted.length)}`}
                    />
                  </div>
                  <div className="p-0">
                    <PeakReversionTwoThirdsChart
                      rows={activeRealtimeSorted}
                      title="PEAK REVERSION ≥ 2/3 | 5M"
                      meta={`rows ${intn(activeRealtimeSorted.length)}`}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-[#070707]/95 p-4 text-xs font-mono text-zinc-500">
                No active realtime rows yet. Run scanner for live open events to render charts.
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                  ACTIVE TRADES | rows {activeRealtimeSorted.length}
                </div>
                <div className="text-[10px] font-mono text-zinc-600">live open events</div>
              </div>

              <div className={clsx("overflow-auto rounded-xl", SCANNER_PANEL_SURFACE)}>
                <table className="min-w-[1720px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
                    <tr>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("ticker")}>Ticker{sortMark(analyticsSort.key === "ticker", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("bench")}>Bench{sortMark(analyticsSort.key === "bench", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("side")}>Side{sortMark(analyticsSort.key === "side", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-right p-2.5 border-l border-white/10" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("total")}>Total{sortMark(analyticsSort.key === "total", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Time
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Abs
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Legs
                      </th>
                    </tr>
                    <tr className="text-zinc-400">
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("startTime")}>StartTime{sortMark(analyticsSort.key === "startTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("peakTime")}>PeakTime{sortMark(analyticsSort.key === "peakTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("endTime")}>CurrentTime{sortMark(analyticsSort.key === "endTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("startAbs")}>StartAbs{sortMark(analyticsSort.key === "startAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("peakAbs")}>PeakAbs{sortMark(analyticsSort.key === "peakAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("endAbs")}>CurrentAbs{sortMark(analyticsSort.key === "endAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("raw")}>Raw{sortMark(analyticsSort.key === "raw", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("benchPnl")}>Bench{sortMark(analyticsSort.key === "benchPnl", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("hedged")}>Hedged{sortMark(analyticsSort.key === "hedged", analyticsSort.dir)}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRealtimeSorted.map((r, i) => {
                      const pnl = r.totalPnlUsd ?? 0;
                      return (
                        <tr
                          key={`${r.ticker}|active|${i}`}
                          className={clsx(
                            "border-t border-white/5 transition-colors",
                            i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                            "hover:bg-white/[0.03]"
                          )}
                        >
                          <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                          <td className="p-2.5 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2.5">
                            <SideBadge side={r.side} />
                          </td>

                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums font-bold border-l border-white/10",
                              pnl > 0 ? "text-[#6ee7b7]" : pnl < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"
                            )}
                          >
                            {num(r.totalPnlUsd ?? null, 2)}
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300 border-l border-white/10">
                            {minuteIdxToClockLabel(r.startMinuteIdx)}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">
                            {minuteIdxToClockLabel(r.peakMinuteIdx)}
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              minuteIdxToClockLabel(r.endMinuteIdx) === "09:30" ? "text-violet-300" : "text-zinc-300"
                            )}
                          >
                            {minuteIdxToClockLabel(r.endMinuteIdx)}
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-200 border-l border-white/10">{num(r.startMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.peakMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.endMetricAbs ?? null, 3)}</td>

                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums border-l border-white/10",
                              (r.rawPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.rawPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.rawPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.rawPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.rawPnlUsd ?? null, 2)}
                            </span>
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              (r.benchPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.benchPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.benchPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.benchPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.benchPnlUsd ?? null, 2)}
                            </span>
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              (r.hedgedPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.hedgedPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.hedgedPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.hedgedPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.hedgedPnlUsd ?? null, 2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!activeRealtimeSorted.length && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-zinc-500">
                          No active open trades yet. Run Scanner for live rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "episodes" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryMetricCard
                label="TOTAL PNL"
                value={num(analyticsSummary.totalPnlUsd, 2)}
                className="xl:row-span-2 xl:min-h-[124px]"
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
              <SummaryMetricCard
                label="TRADES"
                value={intn(analyticsSummary.trades)}
                inline
              />
              <SummaryMetricCard
                label="WIN RATE"
                value={`${num(analyticsSummary.winRate * 100, 1)}%`}
                inline
              />
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
                label="MAX WIN"
                value={num(analyticsSummary.maxWinUsd, 2)}
                inline
                valueClassName={analyticsSummary.maxWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG WIN"
                value={num(analyticsSummary.avgWinUsd, 2)}
                inline
                valueClassName={analyticsSummary.avgWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="PROFIT FACTOR"
                value={num(analyticsSummary.profitFactor, 2)}
                inline
              />
              <SummaryMetricCard
                label="EXPECTANCY"
                value={num(analyticsSummary.expectancyUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX DRAWDOWN"
                value={num(analyticsSummary.maxDrawdownUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX LOSS"
                value={num(analyticsSummary.maxLossUsd, 2)}
                inline
                valueClassName={analyticsSummary.maxLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG LOSS"
                value={num(analyticsSummary.avgLossUsd, 2)}
                inline
                valueClassName={analyticsSummary.avgLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
            </div>

            <div className="flex items-center justify-end">
              <div className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase tracking-wide">
                Scope Engine
              </div>
            </div>

            <GlassCard className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                    <button
                      type="button"
                      onClick={() => setScopeSelectedParameterKeys(SCOPE_PARAMETER_DEFINITIONS.map((item) => item.key))}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                        accent.activeSoft
                      )}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScopeSelectedParameterKeys([]);
                        setScopeOverlayParameterKeys(["", ""]);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-center">
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 w-fit max-w-full">
                    {SCOPE_PARAMETER_SELECT_GROUPS.map((group) => (
                      <div key={`scope-select-group-${group.label}`} className="min-w-0">
                        {(() => {
                          const selectedOptions = group.options.filter((option) => scopeSelectedParameterKeys.includes(option.value));
                          const isExpanded = Boolean(scopeParameterGroupExpanded[group.label]);
                          return (
                            <>
                        <div className={clsx("flex items-center gap-3", isExpanded && selectedOptions.length > 0 && "mb-2")}>
                          <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">{group.label}</div>
                          <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg w-fit max-w-full", SCANNER_CONTROL_SURFACE)}>
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
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setScopeParameterGroupExpanded((prev) => ({
                                ...prev,
                                [group.label]: !prev[group.label],
                              }))
                            }
                            className={clsx(
                              "shrink-0 min-w-[22px] text-right text-[10px] font-mono transition-colors",
                              selectedOptions.length ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-400"
                            )}
                            title={selectedOptions.length ? `${isExpanded ? "Hide" : "Show"} selected filters` : "No selected filters"}
                          >
                            {intn(selectedOptions.length)}
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
                                  accent.activeSoft
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

                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 text-[10px] uppercase tracking-widest font-mono text-zinc-500">Pair Overlay</div>
                        <div className="flex items-center gap-3 min-w-0">
                            {[0, 1].map((index) => (
                              <div key={`scope-overlay-${index}`} className="min-w-0 flex items-center gap-2">
                                <div className="shrink-0 text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                                  {index === 0 ? "Primary" : "Secondary"}
                                </div>
                                <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg w-fit max-w-full", SCANNER_CONTROL_SURFACE)}>
                                  <GlassSelect
                                    value={scopeOverlayParameterKeys[index]}
                                    onChange={(e) =>
                                      setScopeOverlayParameterKeys((prev) => {
                                        const next: [string, string] = [...prev] as [string, string];
                                        next[index] = e.target.value;
                                        return next;
                                      })
                                    }
                                    options={[
                                      { value: "", label: "Select" },
                                      ...scopeOverlayScenarioOptions.map((parameter) => ({ value: parameter, label: parameter })),
                                    ]}
                                    compact
                                    className="w-[72px] !h-[14px] !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600">
                          {intn(optimizerComboRows.length)}
                        </div>
                      </div>
                    </div>
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
                        : accent.outlineButton
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

            {optimizerComboRows.length > 0 && (
            <GlassCard className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">
                  PAIR OVERLAY RESULTS
                </div>
                <div className="text-[10px] font-mono text-zinc-600">
                  top pairs {intn(optimizerComboRows.length)} | best {optimizerBestComboRow ? num(optimizerBestComboRow.score, 2) : "-"} score
                </div>
              </div>

              <div className="overflow-auto rounded-xl border border-white/[0.08] bg-[#070707]/95">
                <table className="min-w-[1180px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 text-zinc-400 border-b border-white/[0.08]">
                    <tr>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">#</th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Set</th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Variant</th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Applied</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">Score</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">Trades</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">W/L</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">WinRate</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">TotalPnL</th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">AvgPnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimizerComboRows.map((r, i) => (
                      <tr key={`${r.id}|combo|${i}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <td className="p-2.5 text-zinc-500">{i + 1}</td>
                        <td className="p-2.5 text-zinc-100 font-semibold">{r.parameter}</td>
                        <td className="p-2.5 text-zinc-300">{r.variant}</td>
                        <td className="p-2.5 text-zinc-400">{r.summary}</td>
                        <td className={clsx("p-2.5 text-right tabular-nums font-bold", r.score > 0 ? "text-emerald-300" : r.score < 0 ? "text-rose-300" : "text-zinc-200")}>
                          {Number.isFinite(r.score) ? num(r.score, 2) : "-"}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{intn(r.trades)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{intn(r.wins)} / {intn(r.losses)}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.winRate * 100, 1)}%</td>
                        <td className={clsx("p-2.5 text-right tabular-nums", r.totalPnlUsd > 0 ? "text-emerald-300" : r.totalPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                          {num(r.totalPnlUsd, 2)}
                        </td>
                        <td className={clsx("p-2.5 text-right tabular-nums", r.avgPnlUsd > 0 ? "text-emerald-300" : r.avgPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                          {num(r.avgPnlUsd, 2)}
                        </td>
                      </tr>
                    ))}
                    {!optimizerComboRows.length && (
                      <tr>
                        <td colSpan={10} className="p-6 text-center text-zinc-500">
                          Pick two SCOPE parameters to see pair overlays, not only isolated filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                      <div className={clsx("text-[12px] uppercase tracking-[0.24em] font-mono", accent.activeText)}>
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
                            ]}
                            className="min-w-0 w-[136px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                          />
                        </div>
                        <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">Buckets</span>
                          <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                            <input
                              type="number"
                              min={3}
                              max={16}
                              step={1}
                              value={optimizerBucketCount}
                              onChange={(e) => setOptimizerBucketCount(Math.max(3, Math.min(16, Math.trunc(Number(e.target.value) || 8))))}
                              className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                            />
                            <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerBucketCount((v) => Math.max(3, Math.min(16, v + 1)))}
                                className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Increase buckets"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setOptimizerBucketCount((v) => Math.max(3, Math.min(16, v - 1)))}
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
                          <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Parameter</th>
                          <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Impact</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">DeltaScore</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">DeltaPnL</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">Trades</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">WinRate</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">TotalPnL</th>
                          <th className="text-right p-2.5 uppercase tracking-widest text-[10px]">Avg/Trade</th>
                          <th className="text-left p-2.5 uppercase tracking-widest text-[10px]">Applied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optimizerImpactRows.map((row) => (
                          <tr key={`impact-${row.id}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                            <td className="p-2.5 text-zinc-100 font-semibold">
                              {row.parameter} <span className="text-zinc-500 font-normal">{row.variant}</span>
                            </td>
                            <td className="p-2.5">
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
                            <td className={clsx("p-2.5 text-right tabular-nums font-bold", row.deltaScore > 0 ? "text-emerald-300" : row.deltaScore < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.deltaScore, 2)}
                            </td>
                            <td className={clsx("p-2.5 text-right tabular-nums", row.deltaPnlUsd > 0 ? "text-emerald-300" : row.deltaPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.deltaPnlUsd, 2)}
                            </td>
                            <td className="p-2.5 text-right tabular-nums text-zinc-300">{intn(row.trades)}</td>
                            <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(row.winRate * 100, 1)}%</td>
                            <td className={clsx("p-2.5 text-right tabular-nums", row.totalPnlUsd > 0 ? "text-emerald-300" : row.totalPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.totalPnlUsd, 2)}
                            </td>
                            <td className={clsx("p-2.5 text-right tabular-nums", row.avgPnlUsd > 0 ? "text-emerald-300" : row.avgPnlUsd < 0 ? "text-rose-300" : "text-zinc-300")}>
                              {num(row.avgPnlUsd, 2)}
                            </td>
                            <td className="p-2.5 text-zinc-400">{row.summary}</td>
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
                          <div className={clsx("text-[12px] uppercase tracking-[0.24em] font-mono", accent.activeText)}>
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
                                ]}
                                className="min-w-0 w-[136px] !h-7 !py-0 !bg-transparent !border-transparent !focus:border-transparent !px-0 !pr-4 text-right !text-[11px] !font-mono !font-semibold !text-zinc-200 !shadow-none"
                              />
                            </div>
                            <div className="inline-flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20 w-fit">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase">Buckets</span>
                              <div className="group relative h-7 w-[52px] overflow-hidden rounded-md">
                                <input
                                  type="number"
                                  min={3}
                                  max={16}
                                  step={1}
                                  value={optimizerBucketCount}
                                  onChange={(e) => setOptimizerBucketCount(Math.max(3, Math.min(16, Math.trunc(Number(e.target.value) || 8))))}
                                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                                />
                                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerBucketCount((v) => Math.max(3, Math.min(16, v + 1)))}
                                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label="Increase buckets"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setOptimizerBucketCount((v) => Math.max(3, Math.min(16, v - 1)))}
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
                  const parameterOption = scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, draft.parameterKey);
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
                                      resultKey: scopeResearchNormalizeResultKey(mode.key, prev[panel.key].resultKey),
                                    },
                                  }))
                                }
                              className={clsx(
                                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                                  draft.chartType === mode.key
                                    ? accent.activeSoft
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
                                accent.outlineButton
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
                                  [panel.key]: buildScopeResearchSelectionFromDraft(draft),
                                }))
                              }
                              className={clsx(
                                "w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95",
                                SCANNER_PANEL_SURFACE,
                                accent.outlineButton
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
                              options={SCOPE_RESEARCH_PARAMETER_SELECT_GROUPS}
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
                              options={scopeResearchResultOptionsForChart(draft.chartType).map((option) => ({ value: option.value, label: option.label }))}
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
                                          parameterKey: "peakMetricAbs",
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
                                      options={SCOPE_RESEARCH_PARAMETER_SELECT_GROUPS}
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
                                          parameterKey: "peakMetricAbs",
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
                                      options={SCOPE_RESEARCH_PARAMETER_SELECT_GROUPS}
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
                          setScopeResearchResultKey(scopeResearchNormalizeResultKey(mode.key, scopeResearchResultKey));
                        }}
                        className={clsx(
                          "h-8 px-3 rounded-lg border whitespace-nowrap leading-none transition-all text-[10px] font-mono uppercase",
                          scopeResearchChartType === mode.key
                            ? accent.activeSoft
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
                      options={SCOPE_RESEARCH_PARAMETER_SELECT_GROUPS}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-mono">Result</div>
                    <GlassSelect
                      value={scopeResearchResultKey}
                      onChange={(e) => setScopeResearchResultKey(e.target.value as ScopeResearchResultKey)}
                      options={scopeResearchResultOptionsForChart(scopeResearchChartType).map((option) => ({ value: option.value, label: option.label }))}
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
                      placeholder={scopeResearchObservedBounds.min != null ? scopeResearchFormatValue(scopeResearchObservedBounds.min, scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, scopeResearchParameterKey).format) : "min"}
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
                      placeholder={scopeResearchObservedBounds.max != null ? scopeResearchFormatValue(scopeResearchObservedBounds.max, scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, scopeResearchParameterKey).format) : "max"}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-600">
                    {scopeResearchObservedBounds.min != null && scopeResearchObservedBounds.max != null
                      ? `range ${scopeResearchFormatValue(scopeResearchObservedBounds.min, scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, scopeResearchParameterKey).format)} .. ${scopeResearchFormatValue(scopeResearchObservedBounds.max, scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS, scopeResearchParameterKey).format)}`
                      : "Detached from optimizer."}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScopeResearchSelection(buildScopeResearchSelectionFromDraft(scopeResearchDrafts.left))}
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

        {tab === "analytics" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryMetricCard
                label="TOTAL PNL"
                value={num(analyticsSummary.totalPnlUsd, 2)}
                className="xl:row-span-2 xl:min-h-[124px]"
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
              <SummaryMetricCard
                label="TRADES"
                value={intn(analyticsSummary.trades)}
                inline
              />
              <SummaryMetricCard
                label="WIN RATE"
                value={`${num(analyticsSummary.winRate * 100, 1)}%`}
                inline
              />
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
                label="MAX WIN"
                value={num(analyticsSummary.maxWinUsd, 2)}
                inline
                valueClassName={analyticsSummary.maxWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG WIN"
                value={num(analyticsSummary.avgWinUsd, 2)}
                inline
                valueClassName={analyticsSummary.avgWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="PROFIT FACTOR"
                value={num(analyticsSummary.profitFactor, 2)}
                inline
              />
              <SummaryMetricCard
                label="EXPECTANCY"
                value={num(analyticsSummary.expectancyUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX DRAWDOWN"
                value={num(analyticsSummary.maxDrawdownUsd, 2)}
                inline
              />
              <SummaryMetricCard
                label="MAX LOSS"
                value={num(analyticsSummary.maxLossUsd, 2)}
                inline
                valueClassName={analyticsSummary.maxLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
              <SummaryMetricCard
                label="AVG LOSS"
                value={num(analyticsSummary.avgLossUsd, 2)}
                inline
                valueClassName={analyticsSummary.avgLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"}
              />
            </div>

            {analytics !== null && (analyticsSorted.length > 0 ? (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(analyticsSummary.equityCurve?.length ?? 0) > 0 && (
                    <div className="p-0">
                      <EquityChart
                        points={analyticsSummary.equityCurve}
                        title={`EQUITY CURVE | ${equityCurveMode}`}
                        meta={`points ${intn(analyticsSummary.equityCurve?.length ?? 0)}`}
                      />
                    </div>
                  )}

                  <div className="p-0">
                    <StartsEndsByTimeChart
                      rows={analyticsSorted}
                      title="START VS END BY TIME | 5M"
                      meta={`rows ${intn(analyticsSorted.length)}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <div className="p-0">
                    <StartsByTimeChart
                      rows={analyticsSorted}
                      title="START EVENTS BY TIME (OK/BAD) | 5M"
                      meta={`rows ${intn(analyticsSorted.length)}`}
                    />
                  </div>
                  <div className="p-0">
                    <PeakStrengthByTimeChart
                      rows={analyticsSorted}
                      title="PEAK STRENGTH BY TIME | 5M"
                      meta={`rows ${intn(analyticsSorted.length)}`}
                    />
                  </div>
                  <div className="p-0">
                    <PeakReversionTwoThirdsChart
                      rows={analyticsSorted}
                      title="PEAK REVERSION ≥ 2/3 | 5M"
                      meta={`rows ${intn(analyticsSorted.length)}`}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-[#070707]/95 p-4 text-xs font-mono text-zinc-500">
                No analytics rows yet. Run analytics for selected date/day range to render charts.
              </div>
            ))}

            {analytics !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                  ANALYTICS TRADES | rows {analyticsSorted.length}
                </div>
                <div className="text-[10px] font-mono text-zinc-600">dark pro table</div>
              </div>

              <div className={clsx("overflow-auto rounded-xl", SCANNER_PANEL_SURFACE)}>
                <table className="min-w-[1720px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
                    <tr>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("ticker")}>Ticker{sortMark(analyticsSort.key === "ticker", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("bench")}>Bench{sortMark(analyticsSort.key === "bench", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-left p-2.5" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("side")}>Side{sortMark(analyticsSort.key === "side", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-right p-2.5 border-l border-white/10" rowSpan={2}>
                        <button type="button" onClick={() => toggleAnalyticsSort("total")}>Total{sortMark(analyticsSort.key === "total", analyticsSort.dir)}</button>
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Time
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Abs
                      </th>
                      <th className="text-center p-2.5 border-l border-white/10" colSpan={3}>
                        Legs
                      </th>
                    </tr>
                    <tr className="text-zinc-400">
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("startTime")}>StartTime{sortMark(analyticsSort.key === "startTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("peakTime")}>PeakTime{sortMark(analyticsSort.key === "peakTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("endTime")}>EndTime{sortMark(analyticsSort.key === "endTime", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("startAbs")}>StartAbs{sortMark(analyticsSort.key === "startAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("peakAbs")}>PeakAbs{sortMark(analyticsSort.key === "peakAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("endAbs")}>EndAbs{sortMark(analyticsSort.key === "endAbs", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5 border-l border-white/10"><button type="button" onClick={() => toggleAnalyticsSort("raw")}>Raw{sortMark(analyticsSort.key === "raw", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("benchPnl")}>Bench{sortMark(analyticsSort.key === "benchPnl", analyticsSort.dir)}</button></th>
                      <th className="text-right p-2.5"><button type="button" onClick={() => toggleAnalyticsSort("hedged")}>Hedged{sortMark(analyticsSort.key === "hedged", analyticsSort.dir)}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsSorted.map((r, i) => {
                      const pnl = r.totalPnlUsd ?? 0;
                      return (
                        <tr
                          key={`${r.ticker}|analytics|${i}`}
                          className={clsx(
                            "border-t border-white/5 transition-colors",
                            i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                            "hover:bg-white/[0.03]"
                          )}
                        >
                          <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                          <td className="p-2.5 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2.5">
                            <SideBadge side={r.side} />
                          </td>

                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums font-bold border-l border-white/10",
                              pnl > 0 ? "text-[#6ee7b7]" : pnl < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"
                            )}
                          >
                            {num(r.totalPnlUsd ?? null, 2)}
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300 border-l border-white/10">
                            {minuteIdxToClockLabel(r.startMinuteIdx)}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">
                            {minuteIdxToClockLabel(r.peakMinuteIdx)}
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              minuteIdxToClockLabel(r.endMinuteIdx) === "09:30" ? "text-violet-300" : "text-zinc-300"
                            )}
                          >
                            {minuteIdxToClockLabel(r.endMinuteIdx)}
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-200 border-l border-white/10">{num(r.startMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.peakMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.endMetricAbs ?? null, 3)}</td>

                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums border-l border-white/10",
                              (r.rawPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.rawPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.rawPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.rawPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.rawPnlUsd ?? null, 2)}
                            </span>
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              (r.benchPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.benchPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.benchPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.benchPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.benchPnlUsd ?? null, 2)}
                            </span>
                          </td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              (r.hedgedPnlUsd ?? 0) > 0 ? "text-[#6ee7b7]" : (r.hedgedPnlUsd ?? 0) < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-300"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block min-w-[64px] px-2 py-0.5 rounded-md",
                                (r.hedgedPnlUsd ?? 0) > 0
                                  ? "bg-[#6ee7b7]/12"
                                  : (r.hedgedPnlUsd ?? 0) < 0
                                    ? "bg-transparent"
                                    : "bg-white/[0.04]"
                              )}
                            >
                              {num(r.hedgedPnlUsd ?? null, 2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!analyticsSorted.length && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-zinc-500">
                          No analytics trades yet. Run Analytics for a date range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
            )}
          </div>
        )}

        <style jsx global>{`
          input.center-spin[type="number"] {
            -moz-appearance: textfield;
          }
          input.center-spin[type="number"]::-webkit-outer-spin-button,
          input.center-spin[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}</style>
      </div>
      <style>{`
        .scanner-borderless .scanner-header-surface,
        .scanner-borderless .scanner-glass-card,
        .scanner-borderless .scanner-panel-surface,
        .scanner-borderless .scanner-control-surface,
        .scanner-borderless .scanner-eye-button {
          border-color: transparent !important;
        }

        .scanner-borderless .border-white\\/5,
        .scanner-borderless .border-white\\/10,
        .scanner-borderless .border-white\\/\\[0\\.04\\],
        .scanner-borderless .border-white\\/\\[0\\.06\\],
        .scanner-borderless .border-white\\/\\[0\\.07\\],
        .scanner-borderless .border-white\\/\\[0\\.08\\],
        .scanner-borderless .border-white\\/\\[0\\.12\\] {
          border-color: transparent !important;
        }

        .scanner-light-theme {
          color: #111827;
          color-scheme: light;
        }

        .scanner-light-theme .scanner-header-surface,
        .scanner-light-theme .scanner-glass-card,
        .scanner-light-theme .scanner-panel-surface,
        .scanner-light-theme .scanner-eye-button,
        .scanner-light-theme .scanner-control-surface,
        .scanner-light-theme .scanner-glass-input {
          background: rgba(255, 255, 255, 0.28) !important;
          border-color: rgba(15, 23, 42, 0.1) !important;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05) !important;
        }

        .scanner-light-theme button,
        .scanner-light-theme input,
        .scanner-light-theme select,
        .scanner-light-theme textarea {
          color: #111827;
        }

        .scanner-light-theme .bg-black\\/20,
        .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/40,
        .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/30,
        .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/60,
        .scanner-light-theme .bg-\\[\\#05070b\\]\\/95,
        .scanner-light-theme .bg-\\[\\#06070c\\]\\/90,
        .scanner-light-theme .bg-\\[\\#070707\\]\\/95,
        .scanner-light-theme .bg-\\[\\#070910\\]\\/95,
        .scanner-light-theme .bg-\\[\\#090b10\\],
        .scanner-light-theme .bg-\\[\\#090a0f\\]\\/90,
        .scanner-light-theme .bg-\\[\\#111111\\]\\/95,
        .scanner-light-theme .bg-\\[\\#05070b\\]\\/95,
        .scanner-light-theme .bg-white\\/5,
        .scanner-light-theme .bg-white\\/10,
        .scanner-light-theme .bg-white\\/\\[0\\.03\\],
        .scanner-light-theme .bg-white\\/\\[0\\.04\\] {
          background-color: rgba(255, 255, 255, 0.38) !important;
        }

        .scanner-light-theme [class*="bg-[linear-gradient"] {
          background: rgba(255, 255, 255, 0.38) !important;
          background-image: none !important;
        }

        .scanner-light-theme .border-white\\/5,
        .scanner-light-theme .border-white\\/10,
        .scanner-light-theme .border-white\\/\\[0\\.04\\],
        .scanner-light-theme .border-white\\/\\[0\\.06\\],
        .scanner-light-theme .border-white\\/\\[0\\.08\\],
        .scanner-light-theme .border-white\\/\\[0\\.12\\] {
          border-color: rgba(15, 23, 42, 0.1) !important;
        }

        .scanner-light-theme .scanner-glass-input {
          color: #111827 !important;
        }

        .scanner-light-theme .scanner-glass-input::placeholder {
          color: rgba(17, 24, 39, 0.42) !important;
        }

        .scanner-light-theme .text-white,
        .scanner-light-theme .text-zinc-50,
        .scanner-light-theme .text-zinc-100,
        .scanner-light-theme .text-zinc-200,
        .scanner-light-theme .text-zinc-300,
        .scanner-light-theme .text-zinc-400 {
          color: #111827 !important;
        }

        .scanner-light-theme .text-zinc-500,
        .scanner-light-theme .text-zinc-600,
        .scanner-light-theme .text-zinc-700 {
          color: rgba(17, 24, 39, 0.64) !important;
        }

        .scanner-light-theme svg text,
        .scanner-light-theme .fill-zinc-200,
        .scanner-light-theme .fill-zinc-300,
        .scanner-light-theme .fill-zinc-400,
        .scanner-light-theme .fill-zinc-500,
        .scanner-light-theme .fill-zinc-600,
        .scanner-light-theme .text-\\[9px\\].uppercase.tracking-\\[0\\.18em\\].font-mono.text-zinc-500,
        .scanner-light-theme .text-\\[10px\\].uppercase.tracking-widest.font-mono.text-zinc-500,
        .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-500,
        .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-600,
        .scanner-light-theme .text-xs.font-mono.text-zinc-500,
        .scanner-light-theme .text-zinc-400.font-normal,
        .scanner-light-theme .text-zinc-500.font-normal {
          color: #111827 !important;
          fill: #111827 !important;
        }

        .scanner-light-theme .hover\\:text-white:hover,
        .scanner-light-theme .hover\\:text-zinc-200:hover,
        .scanner-light-theme .hover\\:text-zinc-300:hover,
        .scanner-light-theme .hover\\:text-violet-200:hover,
        .scanner-light-theme .hover\\:text-rose-400:hover {
          color: #111827 !important;
        }

        .scanner-light-theme .text-violet-300,
        .scanner-light-theme .text-violet-400,
        .scanner-light-theme .text-violet-500,
        .scanner-light-theme .text-violet-600 {
          color: #4c1d95 !important;
        }

        .scanner-light-theme .fill-zinc-400,
        .scanner-light-theme .fill-zinc-500,
        .scanner-light-theme .fill-zinc-600 {
          fill: rgba(17, 24, 39, 0.7) !important;
        }

        .scanner-light-theme svg rect[fill="rgba(8,15,26,0.36)"],
        .scanner-light-theme svg rect[fill="rgba(8,15,26,0.28)"] {
          fill: rgba(255, 255, 255, 0.28) !important;
        }

        .scanner-light-theme svg line[stroke="rgba(255,255,255,0.06)"],
        .scanner-light-theme svg line[stroke="rgba(255,255,255,0.12)"],
        .scanner-light-theme svg line[stroke="rgba(255,255,255,0.14)"],
        .scanner-light-theme svg line[stroke="rgba(255,255,255,0.18)"] {
          stroke: rgba(15, 23, 42, 0.12) !important;
        }

        .scanner-light-theme svg text.fill-zinc-500,
        .scanner-light-theme svg text.fill-zinc-400,
        .scanner-light-theme svg text.fill-zinc-600 {
          fill: rgba(17, 24, 39, 0.64) !important;
        }

        .scanner-light-theme table thead.bg-\\[\\#111111\\]\\/95,
        .scanner-light-theme table thead.bg-\\[\\#090a0f\\]\\/90,
        .scanner-light-theme .text-xs.font-mono.text-zinc-500.bg-\\[\\#070707\\]\\/95,
        .scanner-light-theme .dark-pro-table,
        .scanner-light-theme [title="dark pro table"] {
          background: rgba(255, 255, 255, 0.38) !important;
          color: #111827 !important;
        }

        .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-600 {
          color: rgba(17, 24, 39, 0.52) !important;
        }

        .scanner-light-theme table,
        .scanner-light-theme thead,
        .scanner-light-theme tbody,
        .scanner-light-theme tr,
        .scanner-light-theme th,
        .scanner-light-theme td {
          color: #111827;
        }

        .scanner-light-theme .stroke-white\\/10,
        .scanner-light-theme .stroke-white\\/\\[0\\.06\\],
        .scanner-light-theme .stroke-white\\/\\[0\\.08\\] {
          stroke: rgba(15, 23, 42, 0.14) !important;
        }

        .scanner-light-theme .text-emerald-300,
        .scanner-light-theme .text-emerald-400 {
          color: #047857 !important;
        }

        .scanner-light-theme .text-rose-300,
        .scanner-light-theme .text-rose-400 {
          color: #be123c !important;
        }

        .scanner-light-theme .bg-violet-300\\/10,
        .scanner-light-theme .bg-violet-300\\/8,
        .scanner-light-theme .bg-violet-200\\/10 {
          background-color: rgba(221, 214, 254, 0.55) !important;
        }

        .scanner-light-theme .hover\\:bg-black\\/30:hover,
        .scanner-light-theme .hover\\:bg-black\\/20:hover,
        .scanner-light-theme .hover\\:bg-white\\/5:hover,
        .scanner-light-theme .hover\\:bg-white\\/10:hover,
        .scanner-light-theme .hover\\:bg-white\\/\\[0\\.03\\]:hover,
        .scanner-light-theme .hover\\:bg-white\\/\\[0\\.04\\]:hover,
        .scanner-light-theme .hover\\:bg-white\\/\\[0\\.05\\]:hover {
          background-color: rgba(255, 255, 255, 0.5) !important;
        }
      `}</style>
    </div>
  );
}







