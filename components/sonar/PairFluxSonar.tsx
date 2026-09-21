"use client";

import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";


import { useUi } from "@/components/UiProvider";
import { GlitchTitle } from "@/components/ui/GlitchTitle";
import PresetPicker from "@/components/presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND, SHARED_FILTER_PRESET_FIELDS, isSharedFilterPreset } from "@/lib/presets/sharedFilterPreset";
import { SHARED_FILTER_PRESETS_CHANGED_EVENT, deleteSharedFilterLocalPreset, getSharedFilterLocalPreset, listSharedFilterLocalPresets, saveSharedFilterLocalPreset } from "@/lib/presets/sharedFilterLocalPresets";
import type { PresetDto } from "@/types/presets";
import { parseReportDateAffectsTodaySession, rowReportAffectsTodaySession } from "../../lib/filters/reportTiming";
import { rowExcludedByBorrow } from "../../lib/filters/borrow";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import SharedMinMaxPanel from "../scanner/shell/panels/SharedMinMaxPanel";
// The min/max card lives with the rest of the shared UI kit under components/scanner/shared —
// one implementation for Sonar and Scanner, so the grid cannot drift apart again.
import { MinMaxRow, MultiSelectFilter } from "../scanner/shared/ui";
import { FILTER_GROUP_BASE, FILTER_GROUP_TONES, FILTER_INPUT, FILTER_PILL, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE, toolbarButtonClass } from "../shared/filters/styles";
import FilterRatingRow from "../shared/filters/FilterRatingRow";
import ActiveTickerCard from "../shared/filters/ActiveTickerCard";
import { buildActiveTickerStats } from "@/lib/filters/activeTickerStats";
import {
  SECTOR_CORR_DEFAULT,
  SECTOR_CORR_MAX,
  SECTOR_CORR_MIN,
  clampSectorCorrThreshold,
  parseSectorCorrThreshold,
  rowExcludedByCorr,
  useSectorCorrExclusion,
} from "../../lib/filters/sectorCorr";

/* =========================
   TYPES
========================= */
// The signal shape, its normaliser and the field getters now live in one module,
// lib/signals/signal.ts — shared by both Sonars, streamEngine, streamSseHub and
// tapeMetaStore. Re-exported so existing importers keep working unchanged.
import {
  type ArbitrageSignal,
  getBestObj,
  getBoolAny,
  getMeta,
  getNumAny,
  getStrAny,
  hasValue,
  normalizeSignal,
  normalizeTicker,
  numADV20,
  numADV20NF,
  numADV90,
  numADV90NF,
  numAvPostMhVol90NF,
  numAvPreMh,
  numAvPreMhValue20NF,
  numAvPreMhValue90NF,
  numAvPreMhVol90NF,
  numAvgDailyValue20,
  numAvgDailyValue90,
  numClsToClsPct,
  numImbExch1555,
  numImbExch925,
  numLastClose,
  numLo,
  numLstClsNewsCnt,
  numLstPrcL,
  numLstPrcLstClsPctSafe,
  numMarketCapM,
  numPreMhBidLstPrcPct,
  numPreMhHiLstClsPct,
  numPreMhLoLstClsPct,
  numPreMhLoLstPrcPct,
  numPreMhMDV20NF,
  numPreMhMDV90NF,
  numPreMktVolNF,
  numRoundLot,
  numSpreadBidPct,
  numTCls,
  numVWAP,
  numVolNFfromLstCls,
  numVolRel,
  numVolatility20,
  numVolatility90,
  numYCls,
  pickAny,
  toBool,
  toNum,
} from "@/lib/signals/signal";
import { getLiveStrategy } from "@/lib/strategies/registry";
import PairFluxDivergence from "@/components/pairflux/PairFluxDivergence";
import type { LivePair } from "@/lib/pairflux/livePairs";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import {
  fetchArbitrageSonarSnapshot,
  pushArbitrageSonarLiveParams,
  toArbitrageSonarLiveParams,
  type SonarSignalRow,
} from "@/lib/sonar/arbitrageSnapshotClient";
import {
  fetchPairFluxSonarSnapshot,
  pushPairFluxSonarLiveParams,
  toPairFluxSonarLiveParams,
} from "@/lib/sonar/pairfluxSnapshotClient";
import type { SonarFilterFunnel } from "@/lib/sonar/arbitrageSnapshotClient";
import type { PairFluxClass } from "@/lib/pairflux/client";

/** Routes for this strategy, from the one registry Caesar and the scanner also read. */
const SONAR_NAV = getLiveStrategy("pairflux")!.nav;
export { normalizeSignal };
export type { ArbitrageSignal };

type Mode = "top" | "all";
type RatingMode = "SESSION" | "BIN" | "BINS";
type TriMode = "off" | "include" | "exclude";
type TopWindow = { lo: number; hi: number; rate: number; total: number } | null;
type TopWindowTime = { band: string; rate: number; total: number } | null;
type TopWindowEntry = { sigma: TopWindow; bench: TopWindow; time: TopWindowTime };
type TopWindows = Partial<Record<string, Partial<Record<"pos" | "neg", TopWindowEntry>>>>;
type BetaKey = "lt1" | "b1_1_5" | "b1_5_2" | "gt2" | "unknown";
type RowPair = { short?: ArbitrageSignal; long?: ArbitrageSignal };
type BucketGroup = { id: string; benchmark: string; betaKey: BetaKey; rows: RowPair[] };
type BenchBlock = { benchmark: string; buckets: BucketGroup[] };

type ArbClass = "blue" | "ark" | "pre" | "print" | "open" | "intra" | "post" | "global";
type ArbType = "any" | "hard" | "soft";

/* =========================
   CONFIG / CONSTANTS
========================= */
const betaLabels: Record<BetaKey, string> = {
  lt1: "< 1.0",
  b1_1_5: "1.0 - 1.5",
  b1_5_2: "1.5 - 2.0",
  gt2: "> 2.0",
  unknown: "N/A",
};

const benchmarkOrder = ["QQQ", "SPY", "IWM", "XLF", "KRE", "XLE", "XLP", "SOXL", "GDX", "KWEB", "BITO"];

const BENCH_COLORS: Record<string, string> = {
  QQQ: "#c084fc",
  SPY: "#4ade80",
  IWM: "#fb923c",
  XLF: "#38bdf8",
  KRE: "#22d3ee",
  XLE: "#f87171",
  XLP: "#fbbf24",
  SOXL: "#2dd4bf",
  GDX: "#facc15",
  KWEB: "#e879f9",
  BITO: "#fcd34d",
  DEFAULT: "#94a3b8",
};

const clsOrder: ArbClass[] = ["global", "blue", "pre", "ark", "print", "open", "intra", "post"];
const betaOrder: BetaKey[] = ["lt1", "b1_1_5", "b1_5_2", "gt2", "unknown"];

const BRIDGE_BASE = process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ?? "http://localhost:5197";

// Namespaced off the registry's sonarPrefix, NOT "bridge.arb" — sharing those keys would make
// the PairFlux and Arbitrage sonars edit one another's APPLY/PIN/IGNORE ticker lists.
const SONAR_LS = getLiveStrategy("pairflux")!.storage.sonarPrefix;
const IGNORE_LS_KEY = `${SONAR_LS}.ignoreTickers.v2`;
const APPLY_LS_KEY = `${SONAR_LS}.applyOnlyTickers.v1`;
const PIN_LS_KEY = `${SONAR_LS}.pinTickers.v1`;
const ACTIVE_PANEL_LS_KEY = `${SONAR_LS}.activePanel.v1`;
const UI_STATE_LS_KEY = `${SONAR_LS}.uiState.v1`;

/* =========================
   SMALL UTILS (fast)
========================= */
const clampInt = (v: any, min: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.trunc(n));
};

const clampFloat = (v: any, min: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
};

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v)
    ? "-"
    : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const fmtMaybeInt = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "-" : Math.round(v).toLocaleString("en-US");

const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v) ? "-" : `${fmtNum(v, digits)}%`;

const fmtBpInt = (v: number) => {
  const n = Math.round(Math.abs(v));
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString("en-US");
};


/* =========================
   HELPERS
========================= */

function parseTickersFromFreeText(text: string): string[] {
  if (!text) return [];
  const parts = text
    .split(/[\s,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    const tk = normalizeTicker(p);
    if (tk) out.push(tk);
  }
  return Array.from(new Set(out));
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

function sortedTickers(set: Set<string>) {
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

const slug = (s: string) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* =========================
   Robust pickers
========================= */

const getBestRating = (d: any) =>
  toNum(getBestObj(d)?.rating ?? getBestObj(d)?.Rating ?? getBestObj(d)?.rate ?? getBestObj(d)?.Rate ?? null);

const getBestTotal = (d: any) =>
  toNum(getBestObj(d)?.total ?? getBestObj(d)?.Total ?? getBestObj(d)?.count ?? getBestObj(d)?.Count ?? null);

const getBestTotalByType = (d: any, type: ArbType): number | null => {
  const best = getBestObj(d);
  const hardTotal = toNum(best?.hard ?? best?.Hard ?? (d as any)?._bestHard);
  const softTotal = toNum(best?.soft ?? best?.Soft ?? (d as any)?._bestSoft);
  const anyTotal =
    hardTotal != null || softTotal != null
      ? (hardTotal ?? 0) + (softTotal ?? 0)
      : toNum(best?.total ?? best?.Total ?? best?.count ?? best?.Count ?? (d as any)?._bestTotal ?? (d as any)?.total);
  if (type === "hard") return hardTotal;
  if (type === "soft") return softTotal;
  return anyTotal;
};

const getCompany = (d: any) => String(getMeta(d)?.company ?? getMeta(d)?.Company ?? d?.company ?? d?.Company ?? "-");
const getCountry = (d: any) => String(getMeta(d)?.country ?? getMeta(d)?.Country ?? d?.country ?? d?.Country ?? "-");
const getSector = (d: any) =>
  String(
    getMeta(d)?.sectorL3 ??
      getMeta(d)?.SectorL3 ??
      getMeta(d)?.sector ??
      getMeta(d)?.Sector ??
      d?.sectorL3 ??
      d?.SectorL3 ??
      d?.sector ??
      d?.Sector ??
      "-"
  );
const getExchange = (d: any) => String(d?.exchange ?? d?.Exchange ?? getMeta(d)?.exchange ?? getMeta(d)?.Exchange ?? "-");

const getCountryStr = (s: any) => String(getCountry(s) ?? "").trim().toUpperCase();
const isUSA = (s: any) => {
  const c = getCountryStr(s);
  return c === "UNITED STATES" || c === "USA" || c === "US" || c === "UNITED STATES OF AMERICA";
};

const makeCmpAccountThenTicker = (nonEmptyFirst: boolean) => {
  const getAccountStr = (s: any) => String(s?.account ?? s?.Account ?? "").trim();
  const hasAccount = (s: any) => getAccountStr(s).length > 0;

  return (a: any, b: any) => {
    const ea = hasAccount(a) ? 1 : 0;
    const eb = hasAccount(b) ? 1 : 0;
    const pa = nonEmptyFirst ? -ea : ea;
    const pb = nonEmptyFirst ? -eb : eb;
    if (pa !== pb) return pa - pb;
    return String(a?.ticker ?? "").localeCompare(String(b?.ticker ?? ""));
  };
};

/* =========================
   Numeric field getters (centralized)
========================= */
const RANGE_VALUE_GETTERS = {
  ADV20: numADV20,
  ADV20NF: numADV20NF,
  ADV90: numADV90,
  ADV90NF: numADV90NF,
  AvPreMhv: numAvPreMh,
  RoundLot: numRoundLot,
  VWAP: numVWAP,
  SpreadBidPct: numSpreadBidPct,
  LstPrcL: numLstPrcL,
  LstCls: numLastClose,
  YCls: numYCls,
  TCls: numTCls,
  ClsToClsPct: numClsToClsPct,
  Lo: numLo,
  LstClsNewsCnt: numLstClsNewsCnt,
  MarketCapM: numMarketCapM,
  PreMhVolNF: numPreMktVolNF,
  VolNFfromLstCls: numVolNFfromLstCls,
  AvPostMhVol90NF: numAvPostMhVol90NF,
  AvPreMhVol90NF: numAvPreMhVol90NF,
  AvPreMhValue20NF: numAvPreMhValue20NF,
  AvPreMhValue90NF: numAvPreMhValue90NF,
  AvgDailyValue20: numAvgDailyValue20,
  AvgDailyValue90: numAvgDailyValue90,
  Volatility20: numVolatility20,
  Volatility90: numVolatility90,
  PreMhMDV20NF: numPreMhMDV20NF,
  PreMhMDV90NF: numPreMhMDV90NF,
  VolRel: numVolRel,
  PreMhBidLstPrcPct: numPreMhBidLstPrcPct,
  PreMhLoLstPrcPct: numPreMhLoLstPrcPct,
  PreMhHiLstClsPct: numPreMhHiLstClsPct,
  PreMhLoLstClsPct: numPreMhLoLstClsPct,
  LstPrcLstClsPct: numLstPrcLstClsPctSafe,
  ImbExch925: numImbExch925,
  ImbExch1555: numImbExch1555,
} as const;

const strEquityType = (s: any) => getStrAny(s, ["equityType", "EquityType", "eqType", "EqType"], "");
const numNews = (s: any) => getNumAny(s, ["news", "News", "newsCount", "NewsCount"]);
const boolIsPTP = (s: any) => getBoolAny(s, ["isPTP", "IsPTP", "ptp", "PTP"]);
const boolIsSSR = (s: any) => getBoolAny(s, ["isSSR", "IsSSR", "ssr", "SSR"]);
const boolIsETF = (s: any) => getBoolAny(s, ["etf", "ETF", "isEtf", "IsEtf", "isETF", "IsETF"]);
const numPositionBp = (s: any) =>
  getNumAny(s, [
    "PositionBp",
    "positionBp",
    "position_bp",
    "posBp",
    "PosBp",
    "positionBpAbs",
    "PositionBpAbs",
  ]);

const isActiveByPositionBp = (s: any) => {
  const v = numPositionBp(s);
  if (v != null) return v !== 0;
  // Fallback for feeds where PositionBp is absent but active flag is provided.
  const f = toBool((s as any)?._isActive ?? s?.active ?? s?.isActive ?? s?.IsActive ?? getMeta(s)?.active ?? getMeta(s)?.isActive ?? getMeta(s)?.IsActive);
  return f === true;
};

const getRenderableDirection = (s: any): "up" | "down" | "none" => {
  const normalized = String(s?.direction ?? "").trim().toLowerCase();
  if (normalized === "up" || normalized === "down") return normalized;

  const raw = String(s?.side ?? s?.Side ?? s?.dir ?? s?.Dir ?? getMeta(s)?.direction ?? getMeta(s)?.Direction ?? "")
    .trim()
    .toLowerCase();
  if (raw === "short" || raw === "down" || raw === "sell" || raw === "s") return "down";
  if (raw === "long" || raw === "up" || raw === "buy" || raw === "l") return "up";

  if (s?.shortCandidate && !s?.longCandidate) return "down";
  if (s?.longCandidate && !s?.shortCandidate) return "up";

  return "none";
};

export function signalSide(s: ArbitrageSignal): "Long" | "Short" {
  return getRenderableDirection(s) === "down" ? "Short" : "Long";
}

const getSignalMetricAbs = (
  s: ArbitrageSignal,
  zapMode: "zap" | "sigma" | "delta" | "gamma" | "off"
): number | null => {
  if (zapMode === "off") return null;
  const dir = s.direction;
  if (dir !== "down" && dir !== "up") return null;
  const raw =
    zapMode === "zap"
      ? dir === "down"
        ? toNum(s.zapS)
        : toNum(s.zapL)
      : dir === "down"
        ? toNum(s.zapSsigma)
        : toNum(s.zapLsigma);
  return raw == null ? null : Math.abs(raw);
};

const SONAR_ACTIVE_PRESET_ID_LS_KEY = "arb.sonar.shared-preset.active-id";

const getSignalDeltaThreshold = (s: ArbitrageSignal): number | null => {
  const best = getBestParams(s);
  const printMedian = safeObj(best?.dev_print_last5_median ?? best?.DevPrintLast5Median);
  if (s.direction === "down") {
    return toNum(best?.printMedianPos ?? best?.PrintMedianPos) ?? toNum(printMedian?.pos ?? printMedian?.Pos);
  }
  if (s.direction === "up") {
    return toNum(best?.printMedianNeg ?? best?.PrintMedianNeg) ?? toNum(printMedian?.neg ?? printMedian?.Neg);
  }
  return null;
};

const parseTodayReportFlag = (value: any): boolean | null => {
  const byDate = parseReportDateAffectsTodaySession(value);
  if (byDate != null) return byDate;
  return toBool(value);
};

const hasTodayReport = (s: ArbitrageSignal): boolean => rowReportAffectsTodaySession(s);

const isSignalGoldActive = (
  s: ArbitrageSignal,
  zapMode: "zap" | "sigma" | "delta" | "gamma" | "off",
  zapGoldAbs: number
): boolean => {
  const absM = getSignalMetricAbs(s, zapMode);
  return zapMode !== "off" && isActiveByPositionBp(s) && absM != null && absM <= Math.max(0, Number(zapGoldAbs ?? 0));
};

/* =========================
   Beta parsing
========================= */
const parseBetaKey = (raw?: string | number | null): BetaKey => {
  if (raw == null) return "unknown";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "unknown";

  if (s === "lt1" || s.includes("< 1")) return "lt1";
  if (s === "b1_1_5" || (s.includes("1.0") && s.includes("1.5"))) return "b1_1_5";
  if (s === "b1_5_2" || (s.includes("1.5") && s.includes("2.0"))) return "b1_5_2";
  if (s === "gt2" || s.includes("> 2")) return "gt2";

  const b = Number(s.replace(",", "."));
  if (Number.isNaN(b)) return "unknown";
  if (b < 1) return "lt1";
  if (b < 1.5) return "b1_1_5";
  if (b < 2) return "b1_5_2";
  return "gt2";
};

const getBetaValue = (s: any): number | null => {
  const b0 = toNum(s?.beta ?? s?.Beta);
  if (b0 != null) return b0;

  const best = s?.best ?? s?.Best ?? null;
  const b1 = toNum(best?.beta ?? best?.Beta);
  if (b1 != null) return b1;

  const meta = s?.meta ?? s?.Meta ?? null;
  const b2 = toNum(meta?.beta ?? meta?.Beta);
  if (b2 != null) return b2;

  const bp = s?.best_params ?? s?.bestParams ?? s?.BestParams ?? null;
  const st = bp?.static ?? bp?.Static ?? null;
  const b3 = toNum(st?.beta ?? st?.Beta);
  if (b3 != null) return b3;

  return null;
};

const getCorrValue = (s: any): number | null => {
  const best = s?.best ?? s?.Best ?? null;
  const c1 = toNum(best?.corr ?? best?.Corr);
  if (c1 != null) return c1;

  const meta = s?.meta ?? s?.Meta ?? null;
  const c2 = toNum(meta?.corr ?? meta?.Corr);
  if (c2 != null) return c2;

  const bp = s?.best_params ?? s?.bestParams ?? s?.BestParams ?? null;
  const st = bp?.static ?? bp?.Static ?? null;
  const c3 = toNum(st?.corr ?? st?.Corr);
  if (c3 != null) return c3;

  return null;
};

const getSigmaValue = (s: any): number | null => {
  const best = s?.best ?? s?.Best ?? null;
  const s1 = toNum(best?.sigma ?? best?.Sigma);
  if (s1 != null) return s1;

  const meta = s?.meta ?? s?.Meta ?? null;
  const s2 = toNum(meta?.sigma ?? meta?.Sigma);
  if (s2 != null) return s2;

  const bp = s?.best_params ?? s?.bestParams ?? s?.BestParams ?? null;
  const st = bp?.static ?? bp?.Static ?? null;
  const s3 = toNum(st?.sigma ?? st?.Sigma);
  if (s3 != null) return s3;

  return null;
};

const sortBenchmarks = (a: string, b: string) => {
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  const ia = benchmarkOrder.indexOf(ua);
  const ib = benchmarkOrder.indexOf(ub);
  const ra = ia === -1 ? 999 : ia;
  const rb = ib === -1 ? 999 : ib;
  if (ra !== rb) return ra - rb;
  return ua.localeCompare(ub);
};


function safeRecord(value: any): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function sonarClassToBinClassKey(cls: ArbClass): string {
  if (cls === "global") return "global";
  return cls;
}

function sonarBinSignKey(signal: ArbitrageSignal): "pos" | "neg" | null {
  const dir = String(signal?.direction ?? "").trim().toLowerCase();
  if (dir === "down") return "pos";
  if (dir === "up") return "neg";
  return null;
}

function parseSonarBinIntervals(value: any): Array<{ lo: number; hi: number; rate: number; total: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = safeRecord(item);
      const lo = toNum(obj?.lo ?? obj?.from ?? obj?.min ?? obj?.Min);
      const hi = toNum(obj?.hi ?? obj?.to ?? obj?.max ?? obj?.Max);
      const rate = toNum(obj?.rate ?? obj?.Rate ?? obj?.rating ?? obj?.Rating);
      const total = toNum(obj?.total ?? obj?.Total ?? obj?.count ?? obj?.Count);
      if (lo == null || hi == null || rate == null || total == null) return null;
      return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), rate, total };
    })
    .filter((item): item is { lo: number; hi: number; rate: number; total: number } => item != null);
}

function getSignalSigmaAbs(signal: ArbitrageSignal): number | null {
  const signKey = sonarBinSignKey(signal);
  if (signKey === "pos") {
    const value = toNum(signal?.zapSsigma);
    return value == null ? null : Math.abs(value);
  }
  if (signKey === "neg") {
    const value = toNum(signal?.zapLsigma);
    return value == null ? null : Math.abs(value);
  }
  return null;
}

function passesSonarBinRating(args: {
  signal: ArbitrageSignal;
  cls: ArbClass;
  minRate: number;
  minTotal: number;
}) {
  const { signal, cls, minRate, minTotal } = args;
  const signKey = sonarBinSignKey(signal);
  const sigmaAbs = getSignalSigmaAbs(signal);
  if (!signKey || sigmaAbs == null || !Number.isFinite(sigmaAbs)) return false;

  const root = safeRecord(getBestParams(signal));
  const stitched =
    safeRecord(safeRecord(root?.best_windows_any)?.stitched) ??
    safeRecord(safeRecord(root?.BestWindowsAny)?.stitched) ??
    safeRecord(safeRecord(root?.best_windows_any)?.Stitched) ??
    safeRecord(safeRecord(root?.BestWindowsAny)?.Stitched) ??
    null;
  const sigmaPeakBins =
    safeRecord(stitched?.sigma_peak_bins) ??
    safeRecord(stitched?.SigmaPeakBins) ??
    null;
  const classBins = safeRecord(safeRecord(sigmaPeakBins)?.[sonarClassToBinClassKey(cls)]);
  const intervals = parseSonarBinIntervals(classBins?.[signKey]);
  if (!intervals.length) return false;

  const effectiveMinRate = Math.max(0, Number(minRate) || 0);
  const effectiveMinTotal = Math.max(0, Math.trunc(Number(minTotal) || 0));

  return intervals.some((interval) =>
    sigmaAbs >= interval.lo &&
    sigmaAbs <= interval.hi &&
    interval.rate >= effectiveMinRate &&
    interval.total >= effectiveMinTotal
  );
}

function getSigmaBinParams(signal: ArbitrageSignal): { min: number; max: number; step: number } {
  const root = safeRecord(getBestParams(signal));
  const bwAny = safeRecord(root?.best_windows_any ?? root?.BestWindowsAny);
  const p = safeRecord(bwAny?.sigma_bin_params ?? bwAny?.SigmaBinParams);
  return {
    min: toNum(p?.min) ?? 0.5,
    max: toNum(p?.max) ?? 10.0,
    step: toNum(p?.step) ?? 0.5,
  };
}

function computeSigmaBinKey(absVal: number, step: number, min: number, max: number): string | null {
  if (!Number.isFinite(absVal) || step <= 0) return null;
  const v = Math.max(min, Math.min(max, absVal));
  const b = Math.floor(v / step) * step;
  return b.toFixed(1);
}

function getSessionBinRating(
  signal: ArbitrageSignal,
  cls: ArbClass
): { rate: number; total: number } | null {
  const signKey = sonarBinSignKey(signal);
  const sigmaAbs = getSignalSigmaAbs(signal);
  if (!signKey || sigmaAbs == null || !Number.isFinite(sigmaAbs)) return null;
  const { min, max, step } = getSigmaBinParams(signal);
  const binKey = computeSigmaBinKey(sigmaAbs, step, min, max);
  if (!binKey) return null;
  const root = safeRecord(getBestParams(signal));
  const bwAny = safeRecord(root?.best_windows_any ?? root?.BestWindowsAny);
  const stitched = safeRecord(bwAny?.stitched ?? bwAny?.Stitched);
  const allStats = safeRecord(stitched?.sigma_bin_stats ?? stitched?.SigmaBinStats);
  const clsStats = safeRecord(allStats?.[sonarClassToBinClassKey(cls)]);
  const signStats = safeRecord(clsStats?.[signKey]);
  const entry = safeRecord(signStats?.[binKey]);
  if (!entry) return null;
  const rate = toNum(entry.r ?? entry.rate ?? entry.Rate);
  const total = toNum(entry.t ?? entry.total ?? entry.Total);
  if (rate == null || total == null) return null;
  return { rate, total };
}

function getTopWindows(signal: ArbitrageSignal, cls: ArbClass): TopWindows[string] | null {
  const root = safeRecord(getBestParams(signal));
  const tw = safeRecord(root?.top_windows ?? root?.TopWindows);
  return safeRecord(tw?.[sonarClassToBinClassKey(cls)]) ?? null;
}

function getSignalBenchPct(signal: ArbitrageSignal): number | null {
  const bid = toNum(signal?.bidBench);
  const ask = toNum(signal?.askBench);
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask ?? null;
}

function currentMarketTimeBand(bandMinutes: number): string | null {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const min = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    const m = Math.floor(min / bandMinutes) * bandMinutes;
    const totalEnd = h * 60 + m + bandMinutes;
    const eh = Math.floor(totalEnd / 60) % 24;
    const em = totalEnd % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function passesTopWindowFilter(
  signal: ArbitrageSignal,
  cls: ArbClass,
  topSigmaOn: boolean,
  topBenchOn: boolean,
  topTimeOn: boolean
): boolean {
  const signKey = sonarBinSignKey(signal);
  if (!signKey) return false;
  const tw = getTopWindows(signal, cls);
  const entry = safeRecord(tw?.[signKey]) as Partial<TopWindowEntry> | null;
  if (!entry) return false;

  if (topSigmaOn && entry.sigma) {
    const sa = getSignalSigmaAbs(signal);
    if (sa == null) return false;
    if (sa < entry.sigma.lo || sa > entry.sigma.hi) return false;
  }
  if (topBenchOn && entry.bench) {
    const bp = getSignalBenchPct(signal);
    if (bp == null) return false;
    if (bp < entry.bench.lo || bp > entry.bench.hi) return false;
  }
  if (topTimeOn && entry.time) {
    const band = currentMarketTimeBand(30);
    if (!band || band !== entry.time.band) return false;
  }
  return true;
}

/* =========================
   URL builder
========================= */
// The signals feed URL now has ONE implementation, shared by both Sonars, streamEngine and
// tapeMetaStore. Re-exported here so the existing importers keep working unchanged.
// See lib/signals/url.ts for the minTotal clamp that differed between the two old copies.
import { buildSignalsUrl, buildSignalsStreamUrl } from "@/lib/signals/url";
export { buildSignalsUrl, buildSignalsStreamUrl };

/* =========================
   API NORMALIZER
========================= */


/* =========================
   Range-bound filter modes
========================= */
const RANGE_BOUND_KEYS = [
  "Corr", "Beta", "Sigma",
  "ADV20", "ADV20NF", "ADV90", "ADV90NF",
  "AvPreMhv", "RoundLot", "VWAP", "SpreadBidPct", "LstPrcL",
  "LstCls", "YCls", "TCls", "ClsToClsPct", "Lo", "LstClsNewsCnt",
  "MarketCapM", "PreMhVolNF", "VolNFfromLstCls",
  "AvPostMhVol90NF", "AvPreMhVol90NF", "AvPreMhValue20NF", "AvPreMhValue90NF",
  "AvgDailyValue20", "AvgDailyValue90", "Volatility20", "Volatility90",
  "PreMhMDV20NF", "PreMhMDV90NF", "VolRel",
  "PreMhBidLstPrcPct", "PreMhLoLstPrcPct", "PreMhHiLstClsPct", "PreMhLoLstClsPct",
  "LstPrcLstClsPct", "ImbExch925", "ImbExch1555",
] as const;

export type RangeBoundKey = (typeof RANGE_BOUND_KEYS)[number];
export type RangeFilterMode = "on" | "off";
export type RangeFilterModes = Record<RangeBoundKey, RangeFilterMode>;

const createDefaultRangeModes = (): RangeFilterModes =>
  Object.fromEntries(RANGE_BOUND_KEYS.map((key) => [key, "on"])) as RangeFilterModes;

/* =========================
   UI Helper Components
========================= */
type MsColor = "amber" | "emerald" | "rose" | "cyan" | "fuchsia" | "zinc";
type GlassSelectOption = { value: string; label: string; disabled?: boolean };

const getSonarPrimaryMsColor = (theme?: string | null): MsColor => {
  if (theme === "sparkle") return "amber";
  if (theme === "asher") return "zinc";
  if (theme === "rain") return "zinc";
  if (theme === "inferno") return "amber";
  if (theme === "light") return "fuchsia";
  if (theme === "neon") return "fuchsia";
  if (theme === "space") return "cyan";
  if (theme === "mercury") return "zinc";
  if (theme === "magma") return "rose";
  if (theme === "oceanic") return "cyan";
  if (theme === "khaki") return "amber";
  if (theme === "zebra") return "zinc";
  if (theme === "flamingo") return "rose";
  if (theme === "money") return "amber";
  if (theme === "matrix") return "emerald";
  return "emerald";
};

const getSonarActiveButtonClass = (theme?: string | null): string => {
  if (theme === "inferno") return "bg-orange-500/75 text-white";
  const c = getSonarPrimaryMsColor(theme);
  if (c === "amber") return "bg-yellow-300/75 text-black";
  if (c === "zinc") return "bg-zinc-300/65 text-zinc-900";
  if (c === "fuchsia") return "bg-fuchsia-500/75 text-white";
  if (c === "cyan") return "bg-sky-500/75 text-white";
  if (c === "rose") return "bg-rose-500/75 text-white";
  return "bg-emerald-500/80 text-white";
};

const resolveAccentMsColor = (theme: string | null | undefined, color: MsColor): MsColor =>
  color === "emerald" ? getSonarPrimaryMsColor(theme) : color;


const MSF = {
  amber: {
    activeItem: "bg-yellow-300/20 text-yellow-100",
    inactiveItem: "text-yellow-200/80 hover:bg-yellow-200/10 hover:text-yellow-100",
    chipActive: "bg-yellow-300 text-[#221400] border-transparent shadow-[0_0_16px_rgba(253,224,71,0.38)]",
    chipInactive: "text-yellow-200 border-yellow-200/0 hover:bg-yellow-200/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-yellow-200/30",
    boxChecked: "bg-yellow-300 border-transparent",
  },
  zinc: {
    activeItem: "bg-zinc-200/16 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-zinc-200 text-[#111111] border-transparent shadow-[0_0_16px_rgba(212,212,216,0.24)]",
    chipInactive: "text-zinc-200 border-zinc-200/0 hover:bg-zinc-200/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-zinc-200/20",
    boxChecked: "bg-zinc-200 border-transparent",
  },
  emerald: {
    activeItem: "bg-emerald-500/20 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-emerald-500 text-white border-transparent shadow-[0_0_16px_rgba(16,185,129,0.36)]",
    chipInactive: "text-emerald-500 border-emerald-500/0 hover:bg-emerald-500/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-emerald-500/20",
    boxChecked: "bg-emerald-500 border-transparent",
  },
  rose: {
    activeItem: "bg-rose-500/20 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-rose-500 text-white border-transparent shadow-[0_0_16px_rgba(244,63,94,0.42)]",
    chipInactive: "text-rose-500 border-rose-500/0 hover:bg-rose-500/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-rose-500/20",
    boxChecked: "bg-rose-500 border-transparent",
  },
  // NEW: light-blue / sky (бірюзовий -> блакитний)
  cyan: {
    activeItem: "bg-sky-500/15 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-sky-400 text-white border-transparent shadow-[0_0_16px_rgba(56,189,248,0.34)]",
    chipInactive: "text-sky-300 border-sky-400/0 hover:bg-sky-400/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-sky-400/20",
    boxChecked: "bg-sky-400 border-transparent",
  },
  fuchsia: {
    activeItem: "bg-fuchsia-500/15 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-fuchsia-400 text-white border-transparent shadow-[0_0_16px_rgba(232,121,249,0.34)]",
    chipInactive: "text-fuchsia-300 border-fuchsia-400/0 hover:bg-fuchsia-400/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-fuchsia-400/20",
    boxChecked: "bg-fuchsia-400 border-transparent",
  },

} as const;

const getSonarAccent = (theme?: string | null) => {
  if (theme === "inferno") {
    return {
      selection: "selection:bg-orange-300/35",
      dot: "bg-orange-300",
      badge: "border-orange-300/24 bg-red-500/14 text-orange-100",
      button: "bg-red-500/14 text-orange-100 border-orange-300/26 shadow-[0_0_14px_-3px_rgba(249,115,22,0.22)]",
      outlineButton: "border-orange-300/52 text-orange-100 hover:bg-red-500/14 shadow-[0_0_12px_rgba(249,115,22,0.12)]",
      panel: "border-l-orange-300 shadow-[0_0_40px_-10px_rgba(249,115,22,0.08)]",
      chip: "border-orange-300/32 bg-red-500/14 text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.2)]",
      line: "bg-orange-300/60",
      text: "text-orange-100",
      textSoft: "text-orange-100/82",
      softBorder: "border-orange-300/38 bg-red-500/16 text-orange-100",
      panelSoft: "border-orange-300/22 bg-red-500/[0.05]",
    };
  }
  const primary = getSonarPrimaryMsColor(theme);
  if (primary === "amber") {
    return {
      selection: "selection:bg-yellow-200/30",
      dot: "bg-yellow-200",
      badge: "border-yellow-200/20 bg-yellow-200/10 text-yellow-200",
      button: "bg-yellow-200/10 text-yellow-200 border-yellow-200/20 shadow-[0_0_10px_-3px_rgba(254,240,138,0.16)]",
      outlineButton: "border-yellow-200/45 text-yellow-200 hover:bg-yellow-200/10 shadow-[0_0_10px_rgba(254,240,138,0.08)]",
      panel: "border-l-yellow-200 shadow-[0_0_40px_-10px_rgba(254,240,138,0.05)]",
      chip: "border-yellow-200/30 bg-yellow-200/10 text-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.14)]",
      line: "bg-yellow-200/50",
      text: "text-yellow-200",
      textSoft: "text-yellow-200/80",
      softBorder: "border-yellow-200/35 bg-yellow-200/12 text-yellow-200",
      panelSoft: "border-yellow-200/20 bg-yellow-200/[0.03]",
    };
  }
  if (primary === "zinc") {
    return {
      selection: "selection:bg-zinc-200/24",
      dot: "bg-zinc-300",
      badge: "border-zinc-300/20 bg-zinc-200/10 text-zinc-200",
      button: "bg-zinc-200/10 text-zinc-200 border-zinc-300/20 shadow-[0_0_10px_-3px_rgba(212,212,216,0.12)]",
      outlineButton: "border-zinc-300/40 text-zinc-200 hover:bg-zinc-200/10 shadow-[0_0_10px_rgba(212,212,216,0.06)]",
      panel: "border-l-zinc-300 shadow-[0_0_40px_-10px_rgba(212,212,216,0.05)]",
      chip: "border-zinc-300/28 bg-zinc-200/10 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.1)]",
      line: "bg-zinc-300/45",
      text: "text-zinc-200",
      textSoft: "text-zinc-300/80",
      softBorder: "border-zinc-300/30 bg-zinc-200/12 text-zinc-200",
      panelSoft: "border-zinc-300/18 bg-zinc-200/[0.03]",
    };
  }
  if (primary === "fuchsia") {
    return {
      selection: "selection:bg-fuchsia-500/30",
      dot: "bg-fuchsia-400",
      badge: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300",
      button: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20 shadow-[0_0_10px_-3px_rgba(217,70,239,0.2)]",
      outlineButton: "border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10 shadow-[0_0_10px_rgba(217,70,239,0.1)]",
      panel: "border-l-fuchsia-500 shadow-[0_0_40px_-10px_rgba(217,70,239,0.06)]",
      chip: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.18)]",
      line: "bg-fuchsia-400/50",
      text: "text-fuchsia-300",
      textSoft: "text-fuchsia-200/75",
      softBorder: "border-fuchsia-500/35 bg-fuchsia-500/12 text-fuchsia-300",
      panelSoft: "border-fuchsia-500/20 bg-fuchsia-500/[0.03]",
    };
  }
  if (primary === "rose") {
    return {
      selection: "selection:bg-rose-500/30",
      dot: "bg-rose-400",
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-300",
      button: "bg-rose-500/10 text-rose-300 border-rose-500/20 shadow-[0_0_10px_-3px_rgba(244,63,94,0.2)]",
      outlineButton: "border-rose-500/50 text-rose-400 hover:bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
      panel: "border-l-rose-500 shadow-[0_0_40px_-10px_rgba(244,63,94,0.06)]",
      chip: "border-rose-500/30 bg-rose-500/10 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.18)]",
      line: "bg-rose-400/50",
      text: "text-rose-300",
      textSoft: "text-rose-200/75",
      softBorder: "border-rose-500/35 bg-rose-500/12 text-rose-300",
      panelSoft: "border-rose-500/20 bg-rose-500/[0.03]",
    };
  }
  if (primary === "cyan") {
    return {
      selection: "selection:bg-sky-500/30",
      dot: "bg-sky-400",
      badge: "border-sky-500/20 bg-sky-500/10 text-sky-300",
      button: "bg-sky-500/10 text-sky-300 border-sky-500/20 shadow-[0_0_10px_-3px_rgba(56,189,248,0.2)]",
      outlineButton: "border-sky-500/50 text-sky-400 hover:bg-sky-500/10 shadow-[0_0_10px_rgba(56,189,248,0.1)]",
      panel: "border-l-sky-500 shadow-[0_0_40px_-10px_rgba(56,189,248,0.06)]",
      chip: "border-sky-500/30 bg-sky-500/10 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.18)]",
      line: "bg-sky-400/50",
      text: "text-sky-300",
      textSoft: "text-sky-200/75",
      softBorder: "border-sky-500/35 bg-sky-500/12 text-sky-300",
      panelSoft: "border-sky-500/20 bg-sky-500/[0.03]",
    };
  }
  return {
    selection: "selection:bg-zinc-200/24",
    dot: "bg-zinc-300",
    badge: "border-zinc-300/20 bg-zinc-200/10 text-zinc-200",
    button: "bg-zinc-200/10 text-zinc-200 border-zinc-300/20 shadow-[0_0_10px_-3px_rgba(212,212,216,0.12)]",
    outlineButton: "border-zinc-300/50 text-zinc-200 hover:bg-zinc-200/10 shadow-[0_0_10px_rgba(212,212,216,0.08)]",
    panel: "border-l-zinc-300 shadow-[0_0_40px_-10px_rgba(212,212,216,0.05)]",
    chip: "border-zinc-300/30 bg-zinc-200/10 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.1)]",
    line: "bg-zinc-300/50",
    text: "text-zinc-200",
    textSoft: "text-zinc-300/80",
    softBorder: "border-zinc-300/35 bg-zinc-200/12 text-zinc-200",
    panelSoft: "border-zinc-300/20 bg-zinc-200/[0.03]",
  };
};

// Aliases, not copies: the ZAP slot and a few one-off controls still render their own markup
// here, and the shared toolbar rows render theirs from components/shared/filters/styles. Two
// literal copies of the same strings is exactly how the Scanner's ZAP group ended up a shade
// darker than the Sonar's, so there is one definition now.
const SONAR_FILTER_GROUP_BASE = FILTER_GROUP_BASE;
const SONAR_FILTER_INNER_PILL = FILTER_PILL;
const SONAR_FILTER_INPUT = FILTER_INPUT;

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`h-2.5 w-2.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M6 8L10 12L14 8"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);


type SingleSelectFilterProps = {
  hideArrow?: boolean;
  onMainClick?: () => void;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  color?: MsColor; // використовує MSF як у MultiSelectFilter
};

const SingleSelectFilter: React.FC<SingleSelectFilterProps> = ({
  value,
  options,
  onChange,
  color = "cyan",
  hideArrow = false,
  onMainClick,
}) => {
  const { theme } = useUi();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const id = useMemo(() => `ssf-${Math.random().toString(36).slice(2)}`, []);
  const C = MSF[resolveAccentMsColor(theme, color)];

  const recomputePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: r.left,
      top: r.bottom + 8,
      width: Math.max(220, r.width),
    });
  };

  useEffect(() => {
    if (!open) return;
    recomputePos();

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrap = !!wrapRef.current?.contains(target);
      const menuEl = document.getElementById(id);
      const insideMenu = !!menuEl?.contains(target);
      if (!insideWrap && !insideMenu) setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", recomputePos, true);
    window.addEventListener("resize", recomputePos);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", recomputePos, true);
      window.removeEventListener("resize", recomputePos);
    };
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? "-";

  const menu =
    open && pos
      ? createPortal(
          <div
            id={id}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: pos.width,
              zIndex: 999999,
            }}
            className={[
              // як на 2 скріні: темне вікно, border, rounded, blur
              "z-[9999] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-xl",
              "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] transition-all duration-200 origin-top",
            ].join(" ")}
          >
            <div className="max-h-[340px] overflow-y-auto py-1.5 no-scrollbar">
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={[
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                      active ? "accent-text-soft" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {active && <span className="h-1.5 w-1.5 rounded-full accent-dot" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={wrapRef}
        className="relative flex h-7 items-center bg-black/20 rounded-full border border-white/5"
      >
        {/* main button */}
        <button
          type="button"
          onClick={() => {
            if (onMainClick) {
              onMainClick();
              return;
            }
            setOpen((v) => !v);
          }}
          className={[
            hideArrow
              ? "inline-flex h-full items-center justify-center rounded-full px-3 text-[10px] font-mono font-bold uppercase leading-none transition-all"
              : "inline-flex h-full items-center justify-center rounded-l-full px-3 text-[10px] font-mono font-bold uppercase leading-none transition-all",
            C.chipInactive, // синій/бірюзовий акцент
          ].join(" ")}
        >
          {currentLabel}
        </button>

        {!hideArrow && (
          <>
            <div className={`w-px h-4 ${C.divider}`} />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={[
                "inline-flex h-full min-w-[28px] items-center justify-center rounded-r-full px-2 transition-all",
                C.arrow,
              ].join(" ")}
              aria-label="Open"
            >
              <ChevronIcon open={open} />
            </button>
          </>
        )}
      </div>

      {menu}
    </>
  );
};

function GlassSelect({
  value,
  onChange,
  options,
  className,
  compact = false,
  panelOffsetX = 0,
  panelWidth,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: GlassSelectOption[];
  className?: string;
  compact?: boolean;
  panelOffsetX?: number;
  panelWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((opt) => opt.value === value) ?? options.find((opt) => !opt.disabled) ?? null;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
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
  }, [open, panelOffsetX, panelWidth]);

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
          compact
            ? clsx("accent-text-soft", "border-transparent bg-transparent shadow-none hover:text-zinc-200")
            : clsx("accent-text-soft", "border-white/10 bg-black/30 shadow-[0_0_15px_-5px_rgba(255,255,255,0.08)]"),
          className
        )}
      >
        <span className={clsx("min-w-0 flex-1 truncate text-left", compact && "leading-none")}>{selected?.label ?? value}</span>
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
                "z-[9999] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-xl",
                "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] transition-all duration-200",
                openUpward ? "origin-bottom" : "origin-top"
              )}
            >
              <div className="max-h-[340px] overflow-y-auto py-1.5 no-scrollbar">
                {options.map((opt) => (
                  <div key={opt.value} className="px-1.5 py-0.5">
                    <button
                      type="button"
                      data-selected={opt.value === value}
                      disabled={opt.disabled}
                      onClick={() => !opt.disabled && emitChange(opt.value)}
                      className={clsx(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                        opt.disabled
                          ? "cursor-not-allowed text-zinc-600"
                          : opt.value === value
                            ? "accent-soft"
                            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {opt.value === value && <span className={clsx("w-1.5 h-1.5 rounded-full", "accent-dot")} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}



interface FilterButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  color?: MsColor;
}

const FB = {
  emerald: {
    on: "border border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] bg-emerald-500/10",
  },
  amber: {
    on: "border border-yellow-200/70 text-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.2)] bg-yellow-200/10",
  },
  zinc: {
    on: "border border-zinc-300/45 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.12)] bg-zinc-200/10",
  },
  cyan: {
    on: "border border-sky-500 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.28)] bg-sky-500/10",
  },
  fuchsia: {
    on: "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.28)] bg-fuchsia-500/10",
  },
  rose: {
    on: "border border-rose-500 text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)] bg-rose-500/10",
  },
} as const;

const FilterButton: React.FC<FilterButtonProps> = ({ active, label, onClick }) => (
  <button type="button" onClick={onClick} className={toolbarButtonClass(active)}>
    {label}
  </button>
);

// ЗАМІНИТИ існуюче оголошення SignalCardProps + компонент SignalCard
// на наступний блок:

interface SignalCardProps {
  s: ArbitrageSignal;
  side: "short" | "long";
  onClick: (tk: string) => void;
  activeTicker: string | null;
  flashClass: (ticker: string, side: "short" | "long") => string;
  compact?: boolean;

  zapMode: "zap" | "sigma" | "delta" | "gamma" | "off";
  zapShowAbs: number;    // NEW
  zapSilverAbs: number;  // NEW
  zapGoldAbs: number;    // NEW (only ACTIVE)

  pinColor?: PinColor | null;
  [k: string]: any;
}

const SignalCard: React.FC<SignalCardProps> = ({
  s,
  side,
  onClick,
  activeTicker,
  flashClass,
  compact = false,

  zapMode,
  zapShowAbs,
  zapSilverAbs,
  zapGoldAbs,

  pinColor = null,
}) => {
  const isShort = side === "short";
  const isActive = activeTicker === s.ticker;

  // ACTIVE position by PositionBp != 0
  const posActive = isActiveByPositionBp(s);

  const z = isShort ? toNum(s.zapS) : toNum(s.zapL);
  const zs = isShort ? toNum(s.zapSsigma) : toNum(s.zapLsigma);

  const metric =
    zapMode === "zap" ? z :
    zapMode === "sigma" || zapMode === "delta" ? zs :
    null;

  const absM = metric == null ? null : Math.abs(metric);

  const isGold = isSignalGoldActive(s, zapMode, zapGoldAbs);

  const isSilver =
    zapMode !== "off" &&
    absM != null &&
    absM >= Math.max(0, Number(zapSilverAbs ?? 0));

  const deltaBase = Math.abs(getSignalDeltaThreshold(s) ?? 0.1);
  const minShowAbs = zapMode === "delta"
    ? deltaBase + Math.max(0.05, Number(zapShowAbs ?? 0))
    : Math.max(zapMode === "sigma" ? 0.05 : 0.3, Number(zapShowAbs ?? 0));

  const isBelowShow =
    !posActive &&
    zapMode !== "off" &&
    absM != null &&
    absM < minShowAbs;

  const mintTextClass = "text-[#6ee7b7]";
  const goldClasses =
    "bg-amber-500/10 border-amber-500/50 shadow-[0_0_18px_-6px_rgba(245,158,11,0.35)]";

  const silverClasses =
    "bg-zinc-200/5 border-zinc-200/30 shadow-[0_0_18px_-10px_rgba(255,255,255,0.18)]";

  const activeClasses = isShort
    ? "bg-rose-950/28 border-rose-900/45 shadow-[0_0_12px_-6px_rgba(244,63,94,0.18)]"
    : "bg-[#6ee7b7]/10 border-[#6ee7b7]/30 shadow-[0_0_14px_-6px_rgba(110,231,183,0.28)]";

  const inactiveClasses = "bg-transparent border-white/5 hover:border-white/10 hover:bg-white/5";

  const baseClass =
    isGold ? goldClasses :
    isSilver ? silverClasses :
    isActive ? activeClasses :
    inactiveClasses;

  const muted = isBelowShow ? "opacity-60" : "opacity-100";

  const px = isShort ? toNum(s.bidStock) : toNum(s.askStock);
  const pxLabel = isShort ? "bid" : "ask";
  const pxColor = isGold ? "text-amber-300" : isShort ? "text-rose-400" : mintTextClass;

  const tickerColor = isActive
    ? isGold ? "text-amber-200" : isShort ? "text-rose-300" : mintTextClass
    : "text-zinc-300 group-hover:text-zinc-100";

  const pinClass =
    pinColor === "orange" ? "bg-orange-400"
    : pinColor === "lavender" ? "bg-violet-300"
    : pinColor === "cyan" ? "bg-sky-300"
    : "bg-transparent";

  return (
    <button
      onClick={() => onClick(s.ticker)}
      className={[
        "group relative w-full text-left transition-all duration-200 border flex flex-col justify-between",
        compact ? "p-2 rounded-lg gap-1" : "p-3 rounded-xl gap-1.5",
        baseClass,
        muted,
        flashClass(s.ticker, side),
      ].join(" ")}
    >
      {pinColor && (
        <div className="absolute top-2 right-2 w-3 h-3 rounded-full border border-white/10" style={{ pointerEvents: "none" }}>
          <div className={`w-full h-full rounded-full ${pinClass}`} />
        </div>
      )}

      <div className="flex items-center justify-between w-full">
        <span className={`font-bold tracking-tight leading-none ${compact ? "text-sm" : "text-[15px]"} ${tickerColor}`}>
          {s.ticker}
        </span>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-mono text-zinc-600 lowercase">{pxLabel}</span>
          <span className={`font-mono tabular-nums leading-none font-bold ${compact ? "text-[13px]" : "text-[15px]"} ${pxColor}`}>
            {px == null ? "-" : fmtNum(px, 2)}
          </span>
        </div>
      </div>

      <div className={`flex items-center justify-between w-full font-mono ${compact ? "text-[9px]" : "text-[10px]"} opacity-80`}>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-600">SIG</span>
          <span className="text-zinc-400 tabular-nums">{s.sig == null ? "-" : fmtNum(toNum(s.sig), 2)}</span>
        </div>

          <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">%</span>
            <span className="text-zinc-400 tabular-nums">{z == null ? "-" : fmtNum(z, 2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">σ</span>
            <span className="text-zinc-400 tabular-nums">{zs == null ? "-" : fmtNum(zs, 1)}</span>
          </div>
        </div>
      </div>

    </button>
  );
};



const safeObj = (v: any) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const getBestParams = (d: any) => d?.best_params ?? d?.bestParams ?? d?.BestParams ?? null;

type WindowRateCell = {
  rate: number | null;
  total: number | null;
};

type WindowRatingRow = {
  windowKey: string;
  any: WindowRateCell;
  hard: WindowRateCell;
  soft: WindowRateCell;
};

const WINDOW_RATING_LABELS: Record<string, string> = {
  glob: "GLOBAL",
  global: "GLOBAL",
  all: "ALL",
  any: "ANY",
  "5m": "5M",
  "10m": "10M",
  "15m": "15M",
  "20m": "20M",
  "30m": "30M",
  "45m": "45M",
  "60m": "60M",
  "90m": "90M",
  "120m": "120M",
  open: "OPEN",
  intra: "INTRA",
  post: "POST",
  print: "PRINT",
  ark: "ARK",
  pre: "PRE",
  blue: "BLUE",
};

const toWindowRateCell = (value: any): WindowRateCell => {
  const obj = safeObj(value);
  if (!obj) return { rate: null, total: null };
  return {
    rate: toNum(obj.rate ?? obj.Rate ?? obj.rating ?? obj.Rating),
    total: toNum(obj.total ?? obj.Total ?? obj.count ?? obj.Count),
  };
};

const pickWindowRatingsSource = (d: any) => {
  return (
    safeObj(d?.ratings) ??
    safeObj(d?.Ratings) ??
    safeObj(d?.best?.ratings) ??
    safeObj(d?.best?.Ratings) ??
    safeObj(d?.Best?.ratings) ??
    safeObj(d?.Best?.Ratings) ??
    safeObj(getBestParams(d)?.ratings) ??
    safeObj(getBestParams(d)?.Ratings) ??
    safeObj(getBestParams(d)?.windows) ??
    safeObj(getBestParams(d)?.Windows) ??
    null
  );
};

const getWindowRatings = (d: any): WindowRatingRow[] => {
  const source = pickWindowRatingsSource(d);
  if (!source) return [];

  const rows: WindowRatingRow[] = [];

  for (const [windowKeyRaw, value] of Object.entries(source)) {
    const windowKey = String(windowKeyRaw);
    const bucket = safeObj(value);
    if (!bucket) continue;

    const anyCell = toWindowRateCell(bucket.any ?? bucket.Any ?? bucket.all ?? bucket.All);
    const hardCell = toWindowRateCell(bucket.hard ?? bucket.Hard);
    const softCell = toWindowRateCell(bucket.soft ?? bucket.Soft);

    if (
      anyCell.rate == null &&
      anyCell.total == null &&
      hardCell.rate == null &&
      hardCell.total == null &&
      softCell.rate == null &&
      softCell.total == null
    ) {
      continue;
    }

    rows.push({ windowKey, any: anyCell, hard: hardCell, soft: softCell });
  }

  const order = ["glob", "global", "all", "5m", "10m", "15m", "20m", "30m", "45m", "60m", "90m", "120m", "open", "intra", "post", "print", "ark", "blue"];
  return rows.sort((a, b) => {
    const ia = order.indexOf(a.windowKey.toLowerCase());
    const ib = order.indexOf(b.windowKey.toLowerCase());
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return a.windowKey.localeCompare(b.windowKey);
  });
};

type ListMode = "off" | "ignore" | "apply" | "pin";
type ActiveMode = "off" | "onlyActive" | "onlyInactive";


type PinColor = "orange" | "lavender" | "cyan";
type PinMap = Record<string, PinColor>;

export type SonarExactFilterSnapshot = {
  /**
   * Skip Arbitrage's own rating gate (session best-rating and the BIN/BINS bin lookups).
   *
   * Strategies that rate by their OWN file must set this. OpenDoor scores a signal against its
   * summary.csv per-bin table (lib/opendoor/gate.ts); running Arbitrage's rating first pre-thins
   * the feed by an unrelated rule, so the OpenDoor gate then judges a universe Arbitrage already
   * cut. OpenDoorSonar's own copy of this function has never applied it — this flag is what lets
   * the shared copy behave the same way for the stream.
   */
  skipArbitrageRating?: boolean;
  cls: string;
  type: string;
  mode: string;
  ratingMode: "SESSION" | "BIN" | "BINS";
  minRate: number | string;
  minTotal: number | string;
  tickersFilterNorm: string;
  listMode: ListMode;
  topMode: boolean;
  topSigmaOn: boolean;
  topBenchOn: boolean;
  topTimeOn: boolean;
  ignoreSet: Set<string>;
  applySet: Set<string>;
  pinMap: Record<string, string>;
  bounds: any;
  excludeDividend: boolean;
  excludeNews: boolean;
  excludePTP: boolean;
  excludeSSR: boolean;
  excludeReport: boolean;
  excludeETF: boolean;
  excludeCrap: boolean;
  excludeItb: boolean;
  excludeHard: boolean;
  excludeCorr: boolean;
  /** Peers of today's reporting tickers, resolved by the bridge. See `lib/filters/sectorCorr`. */
  corrExcluded: Set<string>;
  activeMode: ActiveMode;
  includeUSA: boolean;
  includeChina: boolean;
  selCountries: Set<string>;
  countryEnabled: TriMode;
  selExchanges: Set<string>;
  exchangeEnabled: TriMode;
  selSectors: Set<string>;
  sectorEnabled: TriMode;
  filterReport: "ALL" | "YES" | "NO";
  equityType: string;
  corrMin: string;
  corrMax: string;
  betaMin: string;
  betaMax: string;
  sigmaMin: string;
  sigmaMax: string;
  zapMode: "zap" | "sigma" | "delta" | "gamma" | "off";
  zapShowAbs: number;
  zapSilverAbs: number;
  zapGoldAbs: number;
};

type SortKey = "alpha" | "sigma" | "zapAbs" | "sigZapAbs" | "rate" | "posBpAbs" | "beta" | "pin";
type SortDir = "asc" | "desc";

const PIN_DOT_CLASS: Record<PinColor, string> = {
  orange: "bg-orange-400",
  lavender: "bg-violet-300",
  cyan: "bg-sky-300", // was bg-cyan-300 -> now light-blue
};


/* =========================================================================
   SHARED SIGNAL DETAIL PANEL
   The tape-metadata card the Sonar shows for the selected ticker. Exported so
   the Stream renders the identical thing instead of growing its own copy —
   every value is derived from the signal object both surfaces already hold,
   plus an optional live snapshot for fields that go stale on the tape row.
   ========================================================================= */
export type SignalDetailPanelProps = {
  signal: any | null;
  /** Rating type currently selected ("any" | "hard" | "soft") — drives the N figure. */
  ratingType?: string;
  /** Optional fresher field map merged over the signal (same shape Sonar fetches). */
  liveSnap?: Record<string, any> | null;
  className?: string;
};

export function SignalDetailPanel({ signal, ratingType = "any", liveSnap = null, className }: SignalDetailPanelProps) {
  const activeData = signal;

  const bestObj = activeData?.best ?? activeData?.Best ?? null;
  const bestParams = getBestParams(activeData);
  const printMedian = safeObj(bestParams?.dev_print_last5_median ?? bestParams?.DevPrintLast5Median);

  const activeBench = (activeData?.benchmark ? String(activeData.benchmark) : getStrAny(activeData, ["benchmark", "Benchmark"], "-")).toUpperCase();
  const activeExchange2 = getStrAny(activeData, ["exchange", "Exchange"], "-");
  const activeBeta = toNum(bestObj?.beta ?? bestObj?.Beta ?? (activeData as any)?._bestBeta);
  const activeSigma = toNum(bestObj?.sigma ?? bestObj?.Sigma) ?? getNumAny(activeData, ["sig", "Sig", "sigma", "Sigma"]);
  const mdPrintPos = toNum(bestObj?.printMedianPos ?? bestObj?.PrintMedianPos) ?? toNum(printMedian?.pos ?? printMedian?.Pos);
  const mdPrintNeg = toNum(bestObj?.printMedianNeg ?? bestObj?.PrintMedianNeg) ?? toNum(printMedian?.neg ?? printMedian?.Neg);

  const bestRating = toNum(bestObj?.rating);
  const bestTotalHard = toNum(bestObj?.hard);
  const bestTotalSoft = toNum(bestObj?.soft);
  const bestTotalAny =
    bestTotalHard != null || bestTotalSoft != null
      ? (bestTotalHard ?? 0) + (bestTotalSoft ?? 0)
      : toNum(bestObj?.total);
  const bestTotalEff = ratingType === "hard" ? bestTotalHard : ratingType === "soft" ? bestTotalSoft : bestTotalAny;

  const sectorFallback = getStrAny(activeData, ["sector", "Sector", "lvl2", "level2", "Level2"], "-");
  const marketCapFallback = getNumAny(activeData, ["marketCapM", "MarketCapM", "marketcapm"]);

  const isUsableLive = (v: any) => {
    if (v == null) return false;
    if (typeof v === "string") { const t = v.trim(); return t.length > 0 && t !== "-" && t !== "—"; }
    return true;
  };
  const liveSnapFiltered = liveSnap
    ? Object.fromEntries(Object.entries(liveSnap).filter(([, v]) => isUsableLive(v)))
    : null;
  const s = activeData
    ? (liveSnapFiltered && Object.keys(liveSnapFiltered).length > 0 ? { ...activeData, ...liveSnapFiltered } : activeData)
    : null;

  const bid = s ? toNum((s as any).Bid ?? (s as any).bid ?? getMeta(s)?.Bid ?? getMeta(s)?.bid) : null;
  const ask = s ? toNum((s as any).Ask ?? (s as any).ask ?? getMeta(s)?.Ask ?? getMeta(s)?.ask) : null;
  const bidDelta = s ? toNum((s as any)["BidLstClsΔ%"] ?? (s as any).BidLstClsDeltaPct ?? (s as any)["BidLstClsDelta%"]) : null;
  const askDelta = s ? toNum((s as any)["AskLstClsΔ%"] ?? (s as any).AskLstClsDeltaPct ?? (s as any)["AskLstClsDelta%"]) : null;

  const accentTextClass = "accent-text";
  const accentLineClass = "accent-line";

  const renderCell = (label: string, value: React.ReactNode, colorClass = "text-zinc-200") => (
    <div key={label} className="border border-white/0 rounded-xl bg-black/40 px-3 py-2">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-mono">{label}</span>
      <span className={`mt-1 block text-[12px] font-mono tabular-nums truncate ${colorClass}`}>{value ?? "-"}</span>
    </div>
  );

  if (!signal) return null;

  return (
    <div className={clsx("relative overflow-hidden border border-white/10 rounded-2xl bg-black/40", className)}>
      <div className={`absolute inset-y-0 left-0 w-px ${accentLineClass}`} />

      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-white/10">
        <span className="text-lg leading-none font-mono font-semibold tracking-[0.08em] text-white">
          {getStrAny(activeData, ["ticker", "Ticker"], "-")}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
          <span>Exchange: <span className="text-zinc-200">{activeExchange2 !== "-" ? activeExchange2 : "-"}</span></span>
          <span>Bench: <span className="text-zinc-200">{activeBench !== "-" ? activeBench : "-"}</span></span>
          <span>Beta: <span className="text-zinc-200">{activeBeta == null ? "-" : fmtNum(activeBeta, 2)}</span></span>
          <span>Sig: <span className="text-zinc-200">{activeSigma == null ? "-" : fmtNum(activeSigma, 2)}</span></span>
          <span>Rate: <span className={accentTextClass}>{bestRating == null ? "-" : `${Math.round(bestRating * 100)}%`}</span></span>
          <span>N: <span className="text-zinc-200">{bestTotalEff == null ? "-" : fmtMaybeInt(bestTotalEff)}</span></span>
          <span>MD Print Pos: <span className="text-zinc-200">{mdPrintPos == null ? "-" : fmtNum(mdPrintPos, 2)}</span></span>
          <span>MD Print Neg: <span className="text-zinc-200">{mdPrintNeg == null ? "-" : fmtNum(mdPrintNeg, 2)}</span></span>
        </div>
      </div>

      <div className="relative p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                    {renderCell("Company", s ? getCompany(s) : "-")}
                    {renderCell("PreMhHiLstPrc%", s ? fmtPct(numPreMhBidLstPrcPct(s), 2) : "-")}
                    {renderCell("AvPreMhv", s ? fmtMaybeInt(numAvPreMh(s)) : "-")}
                    {renderCell("ADV20", s ? fmtMaybeInt(numADV20(s)) : "-")}
                    {renderCell("ADV90", s ? fmtMaybeInt(numADV90(s)) : "-")}
                    {renderCell("RoundLot", s ? (numRoundLot(s) == null ? "-" : fmtMaybeInt(numRoundLot(s))) : "-")}
                    {renderCell("VolRel", s ? fmtNum(numVolRel(s), 2) : "-")}
                    {renderCell("BidLstClsDelta%", s ? fmtPct(bidDelta, 2) : "-", s && bidDelta != null ? (bidDelta >= 0 ? accentTextClass : "text-rose-400") : "text-zinc-500")}
                    {renderCell("Bid", s && bid != null ? fmtNum(bid, 2) : "-", s ? "text-emerald-400" : "text-zinc-500")}
                    {renderCell("SectorL3", s ? (getSector(s) !== "-" ? getSector(s) : sectorFallback) : "-")}
                    {renderCell("PreMhVolNF", s ? fmtMaybeInt(numPreMktVolNF(s)) : "-")}
                    {renderCell("SpreadBid%", s ? (numSpreadBidPct(s) == null ? "-" : fmtNum(numSpreadBidPct(s)!, 4)) : "-")}
                    {renderCell("ADV20NF", s ? fmtMaybeInt(numADV20NF(s)) : "-")}
                    {renderCell("ADV90NF", s ? fmtMaybeInt(numADV90NF(s)) : "-")}
                    {renderCell("AskLstClsDelta%", s ? fmtPct(askDelta, 2) : "-", s && askDelta != null ? (askDelta >= 0 ? accentTextClass : "text-rose-400") : "text-zinc-500")}
                    {renderCell("Ask", s && ask != null ? fmtNum(ask, 2) : "-", s ? "text-rose-300" : "text-zinc-500")}
                    {renderCell("LstCls", s ? (numLastClose(s) == null ? "-" : fmtNum(numLastClose(s)!, 2)) : "-")}
                    {renderCell("VWAP", s ? (numVWAP(s) == null ? "-" : fmtNum(numVWAP(s)!, 2)) : "-")}
                    {renderCell("Country", s ? getCountry(s) : "-")}
                    {renderCell("AvPreMhVol90NF", s ? fmtMaybeInt(numAvPreMhVol90NF(s)) : "-")}
                    {renderCell("AvPreMhValue20NF", s ? fmtMaybeInt(numAvPreMhValue20NF(s)) : "-")}
                    {renderCell("AvPreMhValue90NF", s ? fmtMaybeInt(numAvPreMhValue90NF(s)) : "-")}
                    {renderCell("AvgDailyValue20", s ? fmtMaybeInt(numAvgDailyValue20(s)) : "-")}
                    {renderCell("AvgDailyValue90", s ? fmtMaybeInt(numAvgDailyValue90(s)) : "-")}
                    {renderCell("Volatility20", s ? fmtPct(numVolatility20(s), 2) : "-")}
                    {renderCell("Volatility90", s ? fmtPct(numVolatility90(s), 2) : "-")}
                    {renderCell("LstPrcLstCls%", s ? fmtPct(numLstPrcLstClsPctSafe(s), 2) : "-")}
                    {renderCell("MarketCapM", s ? fmtMaybeInt(numMarketCapM(s) ?? marketCapFallback) : "-", s ? "text-emerald-400" : "text-zinc-500")}
                    {renderCell("PreMhLoLstPrc%", s ? fmtPct(numPreMhLoLstPrcPct(s), 2) : "-")}
                    {renderCell("PreMhHiLstCls%", s ? fmtPct(numPreMhHiLstClsPct(s), 2) : "-")}
                    {renderCell("PreMhLoLstCls%", s ? fmtPct(numPreMhLoLstClsPct(s), 2) : "-")}
                    {renderCell("ImbExch9:25", s ? fmtMaybeInt(numImbExch925(s)) : "-")}
                    {renderCell("ImbExch15:55", s ? fmtMaybeInt(numImbExch1555(s)) : "-")}
                    {renderCell("AvPostMhVol90NF", s ? fmtMaybeInt(numAvPostMhVol90NF(s)) : "-")}
                    {renderCell("PreMhMDV20NF", s ? fmtMaybeInt(numPreMhMDV20NF(s)) : "-")}
                    {renderCell("PreMhMDV90NF", s ? fmtMaybeInt(numPreMhMDV90NF(s)) : "-")}
        </div>
      </div>
    </div>
  );
}



type HedgeInfo = {
  benchmark: string;
  targetBp: number;
  currentBp: number;
  needBp: number;
  buyBp: number;
  sellBp: number;
};

type MutualExclusionInfo = {
  key: string;
  aBench: string;
  bBench: string;
  ratio: number;
  active: boolean;
  cancelA: number;
  cancelB: number;
  favorTicker: string | null;
  favorDir: "buy" | "sell" | "none";
  favorSum: number;
};

const getBenchmarkKey = (s: any) => String(getStrAny(s, ["benchmark", "Benchmark", "bench", "Bench"], "UNKNOWN")).toUpperCase();

const isEtfRow = (s: any, bench: string) => {
  // meta.ETF OR boolIsETF() OR equityType contains etf
  const meta = getMeta(s);
  const metaEtf = String(meta?.ETF ?? meta?.etf ?? "").trim().toUpperCase();
  const metaYes = metaEtf === "YES" || metaEtf === "TRUE" || metaEtf === "1";
  const b = boolIsETF(s) === true;
  const eqt = strEquityType(s).toLowerCase();
  const eqtEtf = eqt.includes("etf");

  const tk = String(s?.ticker ?? "").toUpperCase();
  const sameAsBench = tk === String(bench ?? "").toUpperCase();

  return sameAsBench && (metaYes || b || eqtEtf);
};

const getBetaFallback1 = (s: any) => {
  // fallback = best?.beta ?? best_params?.static?.beta ?? 1.0
  const best = getBestObj(s);
  const b1 = toNum(best?.beta ?? best?.Beta);
  if (b1 != null) return b1;

  const bp = getBestParams(s);
  const st = bp?.static ?? bp?.Static ?? null;
  const b2 = toNum(st?.beta ?? st?.Beta);
  if (b2 != null) return b2;

  return 1.0;
};

const getHedgeBeta = (s: any) => {
  // Prefer full parser (betaBucket numeric, best.beta, meta.beta, static beta), then safe fallback.
  const b = getBetaValue(s);
  if (b != null && Number.isFinite(b) && b !== 0) return Math.abs(b);
  const f = getBetaFallback1(s);
  if (Number.isFinite(f) && f !== 0) return Math.abs(f);
  return 1.0;
};

const computeHedgeByBench = (arr: ArbitrageSignal[]) => {
  const map = new Map<string, HedgeInfo>();
  const exclusions: MutualExclusionInfo[] = [];

  // Hedge logic (per your contract):
  // - Consider ONLY active positions (PositionBp != 0)
  // - PositionBp is always positive
  // - Direction defines the side:
  //     direction: "short" => BUY bucket
  //     direction: "long"  => SELL bucket
  //     unknown => ignore
  // - Per ticker hedge (bp): hedge = PositionBp * beta
  // - Per benchmark (ETF) group:
  //     buySum  = sum hedge for short positions
  //     sellSum = sum hedge for long positions
  //     needBp  = buySum - sellSum
  //       needBp > 0 => BUY hedge (green/right)
  //       needBp < 0 => SELL hedge (red/left)

  const dirBucket = (s: any): "buy" | "sell" | null => {
    const d = String(s?.direction ?? getMeta(s)?.direction ?? s?.side ?? getMeta(s)?.side ?? "")
      .trim()
      .toLowerCase();
    // Normalized stream currently uses direction: up/down.
    // down == short signal => need BUY hedge
    // up   == long signal  => need SELL hedge
    if (d === "short" || d === "down" || d === "sell" || d === "s") return "buy";
    if (d === "long" || d === "up" || d === "buy" || d === "l") return "sell";
    return null; // unknown => ignore
  };

  const etfPositionSign = (s: any): number => {
    const d = String(s?.direction ?? getMeta(s)?.direction ?? s?.side ?? getMeta(s)?.side ?? "")
      .trim()
      .toLowerCase();
    if (d === "long" || d === "up" || d === "buy" || d === "l") return 1;
    if (d === "short" || d === "down" || d === "sell" || d === "s") return -1;
    return 0;
  };

  // Deduplicate positions inside each bench group, because the feed can contain many signal rows
  // for the same ticker (different buckets/classes). PositionBp represents the *position*.
  // We keep the row with the largest PositionBp for each (bench, ticker, side).
  const byBenchTicker = new Map<string, any>(); // key = bench::ticker::bucket
  const currentByBench = new Map<string, number>();

  for (const s of arr ?? []) {
    const bench = getBenchmarkKey(s);
    if (!bench || bench === "UNKNOWN") continue;

    const tk = String(s?.ticker ?? "").toUpperCase();
    if (!tk) continue;

    // Ignore the ETF row itself in the hedge need calculation.
    if (isEtfRow(s, bench)) {
      const posRaw = numPositionBp(s);
      const pos = posRaw == null ? null : Math.abs(posRaw);
      const sign = etfPositionSign(s);
      if (pos != null && pos > 0 && sign !== 0) {
        currentByBench.set(bench, (currentByBench.get(bench) ?? 0) + sign * pos);
      }
      continue;
    }

    const bucket = dirBucket(s);
    if (!bucket) continue; // unknown direction => ignore

    const pos = numPositionBp(s);
    if (pos == null || pos === 0) continue; // ACTIVE only

    const key = `${bench}::${tk}::${bucket}`;
    const prev = byBenchTicker.get(key);
    const prevPos = prev ? Math.abs(numPositionBp(prev) ?? 0) : 0;
    if (!prev || Math.abs(pos) > prevPos) byBenchTicker.set(key, s);
  }

  // Aggregate buy/sell per bench
  const sums = new Map<string, { buySum: number; sellSum: number }>();

  for (const s of byBenchTicker.values()) {
    const bench = getBenchmarkKey(s);
    const bucket = dirBucket(s);
    if (!bench || !bucket) continue;

    const posRaw = numPositionBp(s);
    const pos = posRaw == null ? null : Math.abs(posRaw);
    if (pos == null || pos === 0) continue;

    const beta = getHedgeBeta(s);
    const h = pos * beta;

    const cur = sums.get(bench) ?? { buySum: 0, sellSum: 0 };
    if (bucket === "buy") cur.buySum += h;
    else cur.sellSum += h;
    sums.set(bench, cur);
  }

  const needByBench = new Map<string, number>();
  for (const [bench, v] of sums.entries()) {
    needByBench.set(bench, v.buySum - v.sellSum);
  }

  const calcPairCapacity = (aBench: string, bBench: string, bPerA: number) => {
    const aNeed = needByBench.get(aBench) ?? 0;
    const bNeed = needByBench.get(bBench) ?? 0;
    if (!Number.isFinite(bPerA) || bPerA <= 0) return 0;
    if (aNeed === 0 || bNeed === 0 || Math.sign(aNeed) === Math.sign(bNeed)) return 0;
    return Math.min(Math.abs(aNeed), Math.abs(bNeed) / bPerA);
  };

  const applyPairMutualExclusion = (aBench: string, bBench: string, bPerA: number): MutualExclusionInfo => {
    if (!Number.isFinite(bPerA) || bPerA <= 0) {
      return {
        key: `${aBench}/${bBench}`,
        aBench,
        bBench,
        ratio: bPerA,
        active: false,
        cancelA: 0,
        cancelB: 0,
        favorTicker: null,
        favorDir: "none",
        favorSum: 0,
      };
    }

    let aNeed = needByBench.get(aBench) ?? 0;
    let bNeed = needByBench.get(bBench) ?? 0;

    if (aNeed === 0 || bNeed === 0 || Math.sign(aNeed) === Math.sign(bNeed)) {
      return {
        key: `${aBench}/${bBench}`,
        aBench,
        bBench,
        ratio: bPerA,
        active: false,
        cancelA: 0,
        cancelB: 0,
        favorTicker: null,
        favorDir: "none",
        favorSum: 0,
      };
    }

    const aBuy = aNeed > 0;
    const aCapInA = Math.abs(aNeed);
    const bCapInA = Math.abs(bNeed) / bPerA;
    const x = Math.min(aCapInA, bCapInA);
    if (!(x > 0)) {
      return {
        key: `${aBench}/${bBench}`,
        aBench,
        bBench,
        ratio: bPerA,
        active: false,
        cancelA: 0,
        cancelB: 0,
        favorTicker: null,
        favorDir: "none",
        favorSum: 0,
      };
    }

    if (aBuy) {
      aNeed -= x;
      bNeed += x * bPerA;
    } else {
      aNeed += x;
      bNeed -= x * bPerA;
    }

    needByBench.set(aBench, aNeed);
    needByBench.set(bBench, bNeed);

    const eps = 1e-8;
    let favorTicker: string | null = null;
    let favorDir: "buy" | "sell" | "none" = "none";
    let favorSum = 0;

    if (Math.abs(aNeed) > eps && Math.abs(bNeed) <= eps) {
      favorTicker = aBench;
      favorDir = aNeed > 0 ? "buy" : "sell";
      favorSum = Math.abs(aNeed);
    } else if (Math.abs(bNeed) > eps && Math.abs(aNeed) <= eps) {
      favorTicker = bBench;
      favorDir = bNeed > 0 ? "buy" : "sell";
      favorSum = Math.abs(bNeed);
    } else if (Math.abs(aNeed) > eps || Math.abs(bNeed) > eps) {
      const aNorm = Math.abs(aNeed);
      const bNorm = Math.abs(bNeed) / bPerA;
      if (aNorm >= bNorm) {
        favorTicker = aBench;
        favorDir = aNeed > 0 ? "buy" : "sell";
        favorSum = Math.abs(aNeed);
      } else {
        favorTicker = bBench;
        favorDir = bNeed > 0 ? "buy" : "sell";
        favorSum = Math.abs(bNeed);
      }
    }

    return {
      key: `${aBench}/${bBench}`,
      aBench,
      bBench,
      ratio: bPerA,
      active: true,
      cancelA: x,
      cancelB: x * bPerA,
      favorTicker,
      favorDir,
      favorSum,
    };
  };

  // Cross-cancel only for QQQ/SPY/IWM per user-defined ratios:
  // QQQ/SPY = 1.44, QQQ/IWM = 0.79.
  const pairConfigs = [
    { aBench: "QQQ", bBench: "SPY", ratio: 1.44 },
    { aBench: "QQQ", bBench: "IWM", ratio: 0.79 },
  ];
  const remaining = [...pairConfigs];

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestCap = 0;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const cap = calcPairCapacity(p.aBench, p.bBench, p.ratio);
      if (cap > bestCap) {
        bestCap = cap;
        bestIdx = i;
      }
    }

    if (bestIdx === -1 || bestCap <= 0) break;
    const chosen = remaining.splice(bestIdx, 1)[0];
    exclusions.push(applyPairMutualExclusion(chosen.aBench, chosen.bBench, chosen.ratio));
  }

  for (const p of remaining) {
    exclusions.push(applyPairMutualExclusion(p.aBench, p.bBench, p.ratio));
  }

  const benches = new Set<string>([...sums.keys(), ...currentByBench.keys(), ...needByBench.keys()]);
  for (const bench of benches) {
    const need = needByBench.get(bench) ?? 0;
    map.set(bench, {
      benchmark: bench,
      targetBp: need,
      currentBp: currentByBench.get(bench) ?? 0,
      needBp: need,
      buyBp: need > 0 ? need : 0,
      sellBp: need < 0 ? Math.abs(need) : 0,
    });
  }

  return { byBench: map, exclusions };
};

function fmtBp0(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "";
  const a = Math.abs(v);
  const r = Math.round(a);
  return r === 0 ? "" : String(r);
}

function splitSides(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || v === 0) return { left: "", right: "" };
  return v < 0 ? { left: fmtBp0(v), right: "" } : { left: "", right: fmtBp0(v) };
}

function HedgeHeaderMinimal({
  bench,
  info,
}: {
  bench: string;
  info: { targetBp: number; currentBp: number; needBp: number; buyBp: number; sellBp: number } | null;
}) {
  const mintTextClass = "text-[#6ee7b7]";
  const need = info ? { left: fmtBp0(info.sellBp), right: fmtBp0(info.buyBp) } : { left: "", right: "" };
  const cur = info ? splitSides(info.currentBp) : { left: "", right: "" };

  return (
    <div className="px-4 pt-3 pb-3">
      {/* top line with centered ETF */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="h-px bg-white/10" />
        <div className="text-[19px] font-mono font-semibold tracking-wide text-zinc-200 leading-none">
          {bench}
        </div>
        <div className="h-px bg-white/10" />
      </div>

      {/* NEED (big) */}
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div className="text-left">
          <span className="text-[22px] font-mono tabular-nums text-rose-400 leading-none">
            {need.left}
          </span>
        </div>
        <div className="text-right">
          <span className={`text-[22px] font-mono tabular-nums leading-none ${mintTextClass}`}>
            {need.right}
          </span>
        </div>
      </div>

      {/* CUR (small, subtle) */}
      <div className="mt-1 grid grid-cols-2 gap-6 opacity-70">
        <div className="text-left">
          <span className="text-[12px] font-mono tabular-nums text-rose-300 leading-none">
            {cur.left}
          </span>
        </div>
        <div className="text-right">
          <span className={`text-[12px] font-mono tabular-nums leading-none ${mintTextClass}`}>
            {cur.right}
          </span>
        </div>
      </div>
    </div>
  );
}


/* =========================
   COMPONENT
========================= */
export default function PairFluxSonar() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const isDark = true;
  const accentSelectionClass = "accent-selection";
  const accentDotClass = "accent-dot";
  const accentBadgeClass = "accent-badge";
  const accentButtonClass = "accent-soft";
  const accentOutlineButtonClass = "accent-outline";
  const accentPanelClass = "accent-panel-l";
  const accentChipClass = "accent-chip";
  const accentLineClass = "accent-line";
  const accentTextClass = "accent-text";
  const accentTextSoftClass = "accent-text-soft";
  const sonarActiveFilterStripClass = "flex items-center gap-1.5 self-start";
  const sonarActiveFilterButtonBaseClass =
    "inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[11px] font-mono font-bold uppercase leading-none transition-all";
  const sonarActiveFilterButtonActiveClass = accentButtonClass;
  const sonarActiveFilterButtonInactiveClass = isLightTheme
    ? "border border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border border-transparent text-[#8b8d97] hover:text-[#cfd1d8] hover:bg-white/[0.03]";
  const sonarActiveFilterIconClass = isLightTheme ? "text-slate-400" : "text-[#8f919b]";
  const sonarActiveFilterActiveIconClass = "text-current";
  const secondaryGroupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  // Aliases of the shared toolbar style, not copies — this pair is the original from which the
  // class-row pills were forked, and keeping a second literal here is how they drifted apart.
  const secondaryButtonBaseClass = TOOLBAR_BUTTON_BASE;
  const secondaryButtonInactiveClass = TOOLBAR_BUTTON_INACTIVE;
  const secondaryButtonSoftActiveClass = isLightTheme
    ? "bg-slate-900/10 text-slate-900 border-slate-900/10 shadow-none"
    : accentButtonClass;
  const secondaryIconButtonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-all hover:text-white hover:bg-white/5";

  /* ===== defaults requested: global / all / any ===== */
  const [cls, setCls] = useState<ArbClass>("global");
  // PairFlux rates pairs per PRE / OPEN / INTRA. Held here rather than inside the panel so the
  // switcher can live in the shared filter toolbar with every other control.
  const [pfCls, setPfCls] = useState<PairFluxClass>("intra");
  const [type, setType] = useState<ArbType>("any");
  const [mode, setMode] = useState<Mode>("all");
  const [corrMin, setCorrMin] = useState("");
  const [corrMax, setCorrMax] = useState("");
  const [betaMin, setBetaMin] = useState("");
  const [betaMax, setBetaMax] = useState("");
  const [sigmaMin, setSigmaMin] = useState("");
  const [sigmaMax, setSigmaMax] = useState("");
  // Alpha has no Arbitrage counterpart, so it brings its own pair of boxes rather than borrowing
  // a slot. It sits beside rho / beta / sigma and reads the same way.
  const [alphaMin, setAlphaMin] = useState("");
  const [alphaMax, setAlphaMax] = useState("");


  const [minRate, setMinRate] = useState<number>(0.3);
  const [minTotal, setMinTotal] = useState<number>(1);
  const [ratingMode, setRatingMode] = useState<RatingMode>("SESSION");
  const [topMode, setTopMode] = useState(false);
  const [topSigmaOn, setTopSigmaOn] = useState(true);
  const [topBenchOn, setTopBenchOn] = useState(false);
  const [topTimeOn, setTopTimeOn] = useState(false);

  type NumField = {
    label: string;
    val: number;
    set: React.Dispatch<React.SetStateAction<number>>;
    ph: string;
    step: number;
    min: number;
    integer?: boolean;
  };

  const fields: NumField[] = [
    { label: "minRate", val: minRate, set: setMinRate, ph: "0.3", step: 0.1, min: 0.0 },
    { label: "minTotal", val: minTotal, set: setMinTotal, ph: "1", step: 1, min: 1, integer: true },
  ];

  const renderSonarActiveFilterIcon = useCallback(
    (kind: "active" | "inactive" | "all", active: boolean) => {
      const iconClassName = clsx("shrink-0", active ? sonarActiveFilterActiveIconClass : sonarActiveFilterIconClass);
      switch (kind) {
        case "active":
          return (
            <svg
              aria-hidden="true"
              className={iconClassName}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
            </svg>
          );
        case "inactive":
          return (
            <svg
              aria-hidden="true"
              className={iconClassName}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4l16 16" />
              <path d="M10.6 10.6A2 2 0 0 0 14 12V7a3 3 0 0 0-6 0v10a3 3 0 0 0 5.1 2.1" />
            </svg>
          );
        case "all":
          return (
            <svg
              aria-hidden="true"
              className={iconClassName}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 20V10" />
              <path d="M12 20V4" />
              <path d="M19 20v-7" />
            </svg>
          );
      }
    },
    [sonarActiveFilterActiveIconClass, sonarActiveFilterIconClass]
  );

  const bumpNumField = useCallback((field: NumField, delta: number) => {
    let next = Number.isFinite(field.val) ? field.val + delta : field.min;
    if (field.integer) next = Math.trunc(next);
    next = Math.max(field.min, next);
    field.set(field.integer ? next : +next.toFixed(4));
  }, []);

  const [tickersFilter, setTickersFilter] = useState("");
  const tickersFilterNorm = useMemo(() => {
    const arr = parseTickersFromFreeText(tickersFilter);
    return arr.length ? arr.join(",") : "";
  }, [tickersFilter]);

  /* ===== Threshold filters ===== */
  const [adv20Min, setAdv20Min] = useState("");
  const [adv20Max, setAdv20Max] = useState("");
  const [adv20NFMin, setAdv20NFMin] = useState("");
  const [adv20NFMax, setAdv20NFMax] = useState("");

  const [bpCls, setBpCls] = useState<ArbClass>("global");

  // OFF on this page. `zapMode` scores a stock against its benchmark and, left on, silently
  // dropped signals from the set the pair panel reads — filtering pairs by a statistic that says
  // nothing about them. The toolbar slot it used to own now drives the controls below.
  const [zapMode, setZapMode] = useState<"zap" | "sigma" | "delta" | "gamma" | "off">("off");

  // Unit a pair's live deviation is read in, plus its min / max / exit thresholds in that unit.
  const [pfZapMode, setPfZapMode] = useState<"pct" | "sigma" | "alpha" | "gamma">("pct");
  const [pfZapMin, setPfZapMin] = useState("0.5");
  const [pfZapMax, setPfZapMax] = useState("");
  const [pfZapExit, setPfZapExit] = useState("0.2");

  // Step for the spinner arrows. Percentage points move in 0.1; a reading already divided by the
  // pair's own sigma or alpha is a smaller number, so it moves in 0.05. An empty field steps up
  // from zero rather than to NaN, and nothing goes negative — these are all magnitudes.
  const pfZapStep = pfZapMode === "pct" ? 0.1 : 0.05;
  const pfBump = (raw: string, dir: number) => {
    // Comma-normalised for the same reason as the range boxes: 0,7 is a value, not a reset to 0.
    const cur = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    const base = Number.isFinite(cur) ? cur : 0;
    return String(Math.max(0, +(base + dir * pfZapStep).toFixed(4)));
  };

  // 3 inputs:
  // 1) filter/display threshold (single, depends on zapMode)
  const [zapShowAbs, setZapShowAbs] = useState<number>(0.3);

  // 2) silver: too high highlight (active + inactive)
  const [zapSilverAbs, setZapSilverAbs] = useState<number>(2.0);

  // 3) gold: normalization highlight (ONLY active)
  const [zapGoldAbs, setZapGoldAbs] = useState<number>(0.3);


  const [adv90Min, setAdv90Min] = useState("");
  const [adv90Max, setAdv90Max] = useState("");
  const [adv90NFMin, setAdv90NFMin] = useState("");
  const [adv90NFMax, setAdv90NFMax] = useState("");

  const [avPreMhvMin, setAvPreMhvMin] = useState("");
  const [avPreMhvMax, setAvPreMhvMax] = useState("");

  const [roundLotMin, setRoundLotMin] = useState("");
  const [roundLotMax, setRoundLotMax] = useState("");

  const [vwapMin, setVwapMin] = useState("");
  const [vwapMax, setVwapMax] = useState("");

  const [spreadMin, setSpreadMin] = useState("");
  const [spreadMax, setSpreadMax] = useState("");

  const [lstPrcLMin, setLstPrcLMin] = useState("");
  const [lstPrcLMax, setLstPrcLMax] = useState("");

  const [lstClsMin, setLstClsMin] = useState("");
  const [lstClsMax, setLstClsMax] = useState("");

  const [yClsMin, setYClsMin] = useState("");
  const [yClsMax, setYClsMax] = useState("");

  const [tClsMin, setTClsMin] = useState("");
  const [tClsMax, setTClsMax] = useState("");

  const [clsToClsPctMin, setClsToClsPctMin] = useState("");
  const [clsToClsPctMax, setClsToClsPctMax] = useState("");

  const [loMin, setLoMin] = useState("");
  const [loMax, setLoMax] = useState("");

  const [lstClsNewsCntMin, setLstClsNewsCntMin] = useState("");
  const [lstClsNewsCntMax, setLstClsNewsCntMax] = useState("");

  const [marketCapMMin, setMarketCapMMin] = useState("");
  const [marketCapMMax, setMarketCapMMax] = useState("");

  const [preMhVolNFMin, setPreMhVolNFMin] = useState("");
  const [preMhVolNFMax, setPreMhVolNFMax] = useState("");

  const [volNFfromLstClsMin, setVolNFfromLstClsMin] = useState("");
  const [volNFfromLstClsMax, setVolNFfromLstClsMax] = useState("");
  const [avPostMhVol90NFMin, setAvPostMhVol90NFMin] = useState("");
  const [avPostMhVol90NFMax, setAvPostMhVol90NFMax] = useState("");
  const [avPreMhVol90NFMin, setAvPreMhVol90NFMin] = useState("");
  const [avPreMhVol90NFMax, setAvPreMhVol90NFMax] = useState("");
  const [avPreMhValue20NFMin, setAvPreMhValue20NFMin] = useState("");
  const [avPreMhValue20NFMax, setAvPreMhValue20NFMax] = useState("");
  const [avPreMhValue90NFMin, setAvPreMhValue90NFMin] = useState("");
  const [avPreMhValue90NFMax, setAvPreMhValue90NFMax] = useState("");
  const [avgDailyValue20Min, setAvgDailyValue20Min] = useState("");
  const [avgDailyValue20Max, setAvgDailyValue20Max] = useState("");
  const [avgDailyValue90Min, setAvgDailyValue90Min] = useState("");
  const [avgDailyValue90Max, setAvgDailyValue90Max] = useState("");
  const [volatility20Min, setVolatility20Min] = useState("");
  const [volatility20Max, setVolatility20Max] = useState("");
  const [volatility90Min, setVolatility90Min] = useState("");
  const [volatility90Max, setVolatility90Max] = useState("");
  const [preMhMDV20NFMin, setPreMhMDV20NFMin] = useState("");
  const [preMhMDV20NFMax, setPreMhMDV20NFMax] = useState("");
  const [preMhMDV90NFMin, setPreMhMDV90NFMin] = useState("");
  const [preMhMDV90NFMax, setPreMhMDV90NFMax] = useState("");
  const [volRelMin, setVolRelMin] = useState("");
  const [volRelMax, setVolRelMax] = useState("");
  const [preMhBidLstPrcPctMin, setPreMhBidLstPrcPctMin] = useState("");
  const [preMhBidLstPrcPctMax, setPreMhBidLstPrcPctMax] = useState("");
  const [preMhLoLstPrcPctMin, setPreMhLoLstPrcPctMin] = useState("");
  const [preMhLoLstPrcPctMax, setPreMhLoLstPrcPctMax] = useState("");
  const [preMhHiLstClsPctMin, setPreMhHiLstClsPctMin] = useState("");
  const [preMhHiLstClsPctMax, setPreMhHiLstClsPctMax] = useState("");
  const [preMhLoLstClsPctMin, setPreMhLoLstClsPctMin] = useState("");
  const [preMhLoLstClsPctMax, setPreMhLoLstClsPctMax] = useState("");
  const [lstPrcLstClsPctMin, setLstPrcLstClsPctMin] = useState("");
  const [lstPrcLstClsPctMax, setLstPrcLstClsPctMax] = useState("");
  const [imbExch925Min, setImbExch925Min] = useState("");
  const [imbExch925Max, setImbExch925Max] = useState("");
  const [imbExch1555Min, setImbExch1555Min] = useState("");
  const [imbExch1555Max, setImbExch1555Max] = useState("");
  const [rangeModes, setRangeModes] = useState<RangeFilterModes>(() => createDefaultRangeModes());

  /* ===== Boolean filters (Red Group - Exclude) ===== */
  const [excludeDividend, setExcludeDividend] = useState(false);
  const [excludeNews, setExcludeNews] = useState(false);
  const [excludePTP, setExcludePTP] = useState(false);
  const [excludeSSR, setExcludeSSR] = useState(false);
  const [excludeReport, setExcludeReport] = useState(false);
  const [excludeETF, setExcludeETF] = useState(false);
  const [excludeCrap, setExcludeCrap] = useState(false);
  // B5ETB borrow availability: ITB drops rows valued "ITB", HARD drops rows valued "NO".
  const [excludeItb, setExcludeItb] = useState(false);
  const [excludeHard, setExcludeHard] = useState(false);
  // CORR drops names correlated with today's reporting tickers; the box holds the |corr| cutoff.
  const [excludeCorr, setExcludeCorr] = useState(false);
  const [corrThresholdInput, setCorrThresholdInput] = useState(String(SECTOR_CORR_DEFAULT));
  const [activeMode, setActiveMode] = useState<ActiveMode>("off");


  /* ===== Boolean filters (Green Group - Include Only) ===== */
  const [includeUSA, setIncludeUSA] = useState(false);
  const [includeChina, setIncludeChina] = useState(false);

  /* ===== Multi-select ===== */
  const [selCountries, setSelCountries] = useState<Set<string>>(new Set());
  const [countryEnabled, setCountryEnabled] = useState<TriMode>("off");

  const [selExchanges, setSelExchanges] = useState<Set<string>>(new Set());
  const [exchangeEnabled, setExchangeEnabled] = useState<TriMode>("off");

  const [selSectors, setSelSectors] = useState<Set<string>>(new Set());
  const [sectorEnabled, setSectorEnabled] = useState<TriMode>("off");

  const [filterReport, setFilterReport] = useState<"ALL" | "YES" | "NO">("ALL");
  const [accountNonEmptyFirst, setAccountNonEmptyFirst] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("alpha");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [equityType, setEquityType] = useState("");

  /* ===== IGNORE/APPLY lists ===== */
  const [listMode, setListMode] = useState<ListMode>("off");
  const [ignoreSet, setIgnoreSet] = useState<Set<string>>(new Set());
  const [applySet, setApplySet] = useState<Set<string>>(new Set());
  const [pinMap, setPinMap] = useState<PinMap>({});
  const [showPin, setShowPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinColor, setPinColor] = useState<PinColor>("orange");
  const [showIgnore, setShowIgnore] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [sonarPresets, setSonarPresets] = useState<PresetDto[]>([]);
  const [sonarPresetId, setSonarPresetId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(SONAR_ACTIVE_PRESET_ID_LS_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [sonarPresetBusy, setSonarPresetBusy] = useState(false);
  const [sonarPresetSaveMode, setSonarPresetSaveMode] = useState(false);
  const [sonarPresetDraftName, setSonarPresetDraftName] = useState("");
  const [sonarPresetStatus, setSonarPresetStatus] = useState("");
  const [ignoreDraft, setIgnoreDraft] = useState("");
  const [applyDraft, setApplyDraft] = useState("");
  const ignoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const applyFileInputRef = useRef<HTMLInputElement | null>(null);

  /* ===== Data ===== */
  const [allItems, setAllItems] = useState<ArbitrageSignal[]>([]);
  const [sonarRawCount, setSonarRawCount] = useState(0);
  const [items, setItems] = useState<ArbitrageSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  /* ===== Active ticker panel ===== */
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activePanelVisible, setActivePanelVisible] = useState<boolean>(true);
  const [activePanelCollapsed, setActivePanelCollapsed] = useState<boolean>(true);
  const [activePanelMode, setActivePanelMode] = useState<"mini" | "expanded">("mini");
  // Same name, polarity and default as the Scanner's toggle for the identical grid. It used
  // to be `filtersCollapsed` (inverted), which is why the two surfaces read as different
  // controls even though they gate the same thing.
  const [showSharedMinMax, setShowSharedMinMax] = useState(true);

  const [activeLoading, setActiveLoading] = useState(false);
  const [activeErr, setActiveErr] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<any>(null);
  const [liveSnap, setLiveSnap] = useState<Record<string, any> | null>(null);

  const toggleRangeMode = useCallback((key: RangeBoundKey) => {
    setRangeModes((prev) => ({
      ...prev,
      [key]: prev[key] === "off" ? "on" : "off",
    }));
  }, []);

  /* =========================
     Multi-select options
     (IMPORTANT: use robust getters, not item.country/item.exchange)
  ========================= */
  const { allCountries, allExchanges, allSectors } = useMemo(() => {
    const c = new Set<string>();
    const e = new Set<string>();
    const s = new Set<string>();

    for (const item of items) {
      const cc = getCountry(item);
      const ee = getExchange(item);
      const ss = getSector(item);

      if (cc && cc !== "-") c.add(cc);
      if (ee && ee !== "-") e.add(ee);
      if (ss && ss !== "-") s.add(ss);
    }

    return {
      allCountries: Array.from(c).sort(),
      allExchanges: Array.from(e).sort(),
      allSectors: Array.from(s).sort(),
    };
  }, [items]);

  /* =========================
     Edit pause (typing guard)
  ========================= */
  const isEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);

  const startEditing = () => {
    isEditingRef.current = true;
    setIsEditing(true);
  };

  const stopEditing = () => {
    isEditingRef.current = false;
    setIsEditing(false);
  };

  /* =========================
     Persist Active panel
  ========================= */
  const activePanelHydratedRef = useRef(false);
  const activePanelRestoringRef = useRef(false);

  useLayoutEffect(() => {
    activePanelRestoringRef.current = true;
    try {
      const raw = localStorage.getItem(ACTIVE_PANEL_LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);

      const tk = typeof s?.activeTicker === "string" ? normalizeTicker(s.activeTicker) : null;
      const vis = typeof s?.visible === "boolean" ? s.visible : true;
      const col = typeof s?.collapsed === "boolean" ? s.collapsed : true;
      const mode = s?.mode === "mini" || s?.mode === "expanded" ? s.mode : "mini";

      setActiveTicker(tk);
      setActivePanelVisible(vis);
      setActivePanelCollapsed(col);
      setActivePanelMode(mode);
    } catch {}

    activePanelHydratedRef.current = true;
    queueMicrotask(() => { activePanelRestoringRef.current = false; });
  }, []);

  useEffect(() => {
    if (!activePanelHydratedRef.current) return;
    if (activePanelRestoringRef.current) return;
    try {
      localStorage.setItem(
        ACTIVE_PANEL_LS_KEY,
        JSON.stringify({
          activeTicker,
          visible: activePanelVisible,
          collapsed: activePanelCollapsed,
          mode: activePanelMode,
        })
      );
    } catch {}
  }, [activeTicker, activePanelVisible, activePanelCollapsed, activePanelMode]);

  /* =========================
     localStorage load/save ignore/apply
  ========================= */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IGNORE_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const safe = parsed.map((x: any) => normalizeTicker(String(x))).filter((x): x is string => !!x);
          setIgnoreSet(new Set(safe));
        }
      }
    } catch {}
    try {
      const raw = localStorage.getItem(APPLY_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const safe = parsed.map((x: any) => normalizeTicker(String(x))).filter((x): x is string => !!x);
          setApplySet(new Set(safe));
        }
      }
    } catch {}
    try {
      const raw = localStorage.getItem(PIN_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // expected: [{ticker:"AAPL", color:"orange"}, ...] OR object map
        if (Array.isArray(parsed)) {
          const next: PinMap = {};
          for (const row of parsed) {
            const tk = normalizeTicker(String(row?.ticker ?? ""));
            const c = String(row?.color ?? "");
            if (!tk) continue;
            if (c === "orange" || c === "lavender" || c === "cyan") next[tk] = c;
          }
          setPinMap(next);
        } else if (parsed && typeof parsed === "object") {
          const next: PinMap = {};
          for (const [k, v] of Object.entries(parsed)) {
            const tk = normalizeTicker(String(k));
            const c = String(v);
            if (!tk) continue;
            if (c === "orange" || c === "lavender" || c === "cyan") next[tk] = c;
          }
          setPinMap(next);
        }
      }
    } catch {}
  }, []);

  const saveSet = (key: string, set: Set<string>) => {
    try {
      localStorage.setItem(key, JSON.stringify(sortedTickers(set)));
    } catch {}
  };

  const savePinMap = (m: PinMap) => {
    try {
      const arr = Object.entries(m)
        .map(([ticker, color]) => ({ ticker, color }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker));
      localStorage.setItem(PIN_LS_KEY, JSON.stringify(arr));
    } catch {}
  };

  const addPins = (tickers: string[], color: PinColor) => {
    if (!tickers.length) return;
    setPinMap((prev) => {
      const next: PinMap = { ...prev };
      for (const t of tickers) next[t] = color;
      savePinMap(next);
      return next;
    });
  };

  const removePin = (ticker: string) => {
    setPinMap((prev) => {
      const next: PinMap = { ...prev };
      delete next[ticker];
      savePinMap(next);
      return next;
    });
  };

  const clearPins = () => {
    const next: PinMap = {};
    setPinMap(next);
    savePinMap(next);
  };


  const addToSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string, tickers: string[]) => {
    if (!tickers.length) return;
    setter((prev) => {
      const next = new Set(prev);
      tickers.forEach((t) => next.add(t));
      saveSet(key, next);
      return next;
    });
  };

  const removeFromSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string, ticker: string) => {
    setter((prev) => {
      const next = new Set(prev);
      next.delete(ticker);
      saveSet(key, next);
      return next;
    });
  };

  const clearSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    const next = new Set<string>();
    setter(next);
    saveSet(key, next);
  };

  const onIgnoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const t = await file.text();
      addToSet(setIgnoreSet, IGNORE_LS_KEY, parseTickersFromCsv(t));
      setShowIgnore(true);
      if (listMode === "off") setListMode("ignore");
    } catch {}
  };

  const onApplyFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const t = await file.text();
      addToSet(setApplySet, APPLY_LS_KEY, parseTickersFromCsv(t));
      setShowApply(true);
      if (listMode === "off") setListMode("apply");
    } catch {}
  };

  const onAddIgnore = () => {
    addToSet(setIgnoreSet, IGNORE_LS_KEY, parseTickersFromFreeText(ignoreDraft));
    setIgnoreDraft("");
    setShowIgnore(true);
    if (listMode === "off") setListMode("ignore");
  };

  const onAddApply = () => {
    addToSet(setApplySet, APPLY_LS_KEY, parseTickersFromFreeText(applyDraft));
    setApplyDraft("");
    setShowApply(true);
    if (listMode === "off") setListMode("apply");
  };

  /* =========================
     UI State (cls/type/mode/listMode/bpCls/zapMode)
  ========================= */
  // --- Persistence (load before first paint; avoid overwriting stored state with defaults) ---
  const uiHydratedRef = useRef(false);
  const uiRestoringRef = useRef(false);

  useLayoutEffect(() => {
    uiRestoringRef.current = true;
    try {
      const raw = localStorage.getItem(UI_STATE_LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);

        // core
        if (typeof s?.cls === "string") setCls(s.cls);
        if (typeof s?.type === "string") setType(s.type);
        if (typeof s?.mode === "string") setMode(s.mode);
        if (typeof s?.listMode === "string") setListMode(s.listMode);
        if (typeof s?.bpCls === "string") setBpCls(s.bpCls);

        // zap/sort
        if (s?.zapMode === "zap" || s?.zapMode === "sigma" || s?.zapMode === "delta" || s?.zapMode === "off") setZapMode(s.zapMode);
        if (s?.activeMode === "off" || s?.activeMode === "onlyActive" || s?.activeMode === "onlyInactive") setActiveMode(s.activeMode);
        if (typeof s?.sortKey === "string") setSortKey(s.sortKey);
        if (typeof s?.sortDir === "string") setSortDir(s.sortDir);
        if (typeof s?.zapShowAbs === "number") setZapShowAbs(s.zapShowAbs);
        if (typeof s?.zapSilverAbs === "number") setZapSilverAbs(s.zapSilverAbs);
        if (typeof s?.zapGoldAbs === "number") setZapGoldAbs(s.zapGoldAbs);

        // Pair divergence group. pfZapMax may legitimately be "" - an empty max means "no upper
        // bound", which is a real setting rather than a missing one.
        if (s?.pfCls === "pre" || s?.pfCls === "open" || s?.pfCls === "intra") setPfCls(s.pfCls);
        if (s?.pfZapMode === "pct" || s?.pfZapMode === "sigma" || s?.pfZapMode === "alpha" || s?.pfZapMode === "gamma") setPfZapMode(s.pfZapMode);
        if (typeof s?.pfZapMin === "string") setPfZapMin(s.pfZapMin);
        if (typeof s?.pfZapMax === "string") setPfZapMax(s.pfZapMax);
        if (typeof s?.pfZapExit === "string") setPfZapExit(s.pfZapExit);

        // query params
        if (s?.ratingMode === "SESSION" || s?.ratingMode === "BIN" || s?.ratingMode === "BINS") setRatingMode(s.ratingMode);
        if (typeof s?.minRate === "number") setMinRate(s.minRate);
        if (typeof s?.minTotal === "number") setMinTotal(s.minTotal);
        if (typeof s?.tickersFilter === "string") setTickersFilter(s.tickersFilter);
        if (typeof s?.topMode === "boolean") setTopMode(s.topMode);
        if (typeof s?.topSigmaOn === "boolean") setTopSigmaOn(s.topSigmaOn);
        if (typeof s?.topBenchOn === "boolean") setTopBenchOn(s.topBenchOn);
        if (typeof s?.topTimeOn === "boolean") setTopTimeOn(s.topTimeOn);
        if (typeof s?.accountNonEmptyFirst === "boolean") setAccountNonEmptyFirst(s.accountNonEmptyFirst);
        if (typeof s?.showSharedMinMax === "boolean") setShowSharedMinMax(s.showSharedMinMax);
        // Layouts saved before the rename stored the inverted `filtersCollapsed`.
        else if (typeof s?.filtersCollapsed === "boolean") setShowSharedMinMax(!s.filtersCollapsed);

        // toggles
        for (const k of [
          'excludeDividend','excludeNews','excludePTP','excludeSSR','excludeReport','excludeETF','excludeCrap',
          // ITB/HARD/CORR reached the shared FilterFlagsRow but never this list, so they were
          // the only toolbar toggles that silently reset on every reload.
          'excludeItb','excludeHard','excludeCorr',
          'includeUSA','includeChina',
        ] as const) {
          if (typeof s?.[k] === 'boolean') {
            const v = s[k];
            switch(k){
              case 'excludeDividend': setExcludeDividend(v); break;
              case 'excludeNews': setExcludeNews(v); break;
              case 'excludePTP': setExcludePTP(v); break;
              case 'excludeSSR': setExcludeSSR(v); break;
              case 'excludeReport': setExcludeReport(v); break;
              case 'excludeETF': setExcludeETF(v); break;
              case 'excludeCrap': setExcludeCrap(v); break;
              case 'excludeItb': setExcludeItb(v); break;
              case 'excludeHard': setExcludeHard(v); break;
              case 'excludeCorr': setExcludeCorr(v); break;
              case 'includeUSA': setIncludeUSA(v); break;
              case 'includeChina': setIncludeChina(v); break;
            }
          }
        }
        if (typeof s?.filterReport === 'string') setFilterReport(s.filterReport);
        if (typeof s?.equityType === 'string') setEquityType(s.equityType);

        // The raw input, not the clamped number: corrThreshold is derived from it.
        if (typeof s?.corrThresholdInput === 'string') setCorrThresholdInput(s.corrThresholdInput);
        if (typeof s?.corrMin === 'string') setCorrMin(s.corrMin);
        if (typeof s?.corrMax === 'string') setCorrMax(s.corrMax);
        if (typeof s?.betaMin === 'string') setBetaMin(s.betaMin);
        if (typeof s?.betaMax === 'string') setBetaMax(s.betaMax);
        if (typeof s?.sigmaMin === 'string') setSigmaMin(s.sigmaMin);
        if (typeof s?.sigmaMax === 'string') setSigmaMax(s.sigmaMax);
        if (typeof s?.alphaMin === 'string') setAlphaMin(s.alphaMin);
        if (typeof s?.alphaMax === 'string') setAlphaMax(s.alphaMax);

        // multi-select
        const validTriMode = (v: unknown): v is TriMode => v === "off" || v === "include" || v === "exclude";
        if (validTriMode(s?.countryEnabled)) setCountryEnabled(s.countryEnabled);
        else if (typeof s?.countryEnabled === 'boolean') setCountryEnabled(s.countryEnabled ? "include" : "off");
        if (Array.isArray(s?.selCountries)) setSelCountries(new Set(s.selCountries.filter(Boolean)));
        if (validTriMode(s?.exchangeEnabled)) setExchangeEnabled(s.exchangeEnabled);
        else if (typeof s?.exchangeEnabled === 'boolean') setExchangeEnabled(s.exchangeEnabled ? "include" : "off");
        if (Array.isArray(s?.selExchanges)) setSelExchanges(new Set(s.selExchanges.filter(Boolean)));
        if (validTriMode(s?.sectorEnabled)) setSectorEnabled(s.sectorEnabled);
        else if (typeof s?.sectorEnabled === 'boolean') setSectorEnabled(s.sectorEnabled ? "include" : "off");
        if (Array.isArray(s?.selSectors)) setSelSectors(new Set(s.selSectors.filter(Boolean)));

        if (s?.rangeModes && typeof s.rangeModes === "object") {
          setRangeModes((prev) => {
            const next = { ...prev };
            for (const key of RANGE_BOUND_KEYS) {
              const value = s.rangeModes[key];
              if (value === "on" || value === "off") next[key] = value;
            }
            return next;
          });
        }

        // bounds (strings)
        for (const key of [
          'adv20Min','adv20Max','adv20NFMin','adv20NFMax','adv90Min','adv90Max','adv90NFMin','adv90NFMax',
          'avPreMhvMin','avPreMhvMax','roundLotMin','roundLotMax','vwapMin','vwapMax','spreadMin','spreadMax',
          'lstPrcLMin','lstPrcLMax','lstClsMin','lstClsMax','yClsMin','yClsMax','tClsMin','tClsMax',
          'clsToClsPctMin','clsToClsPctMax','loMin','loMax','lstClsNewsCntMin','lstClsNewsCntMax',
          'marketCapMMin','marketCapMMax','preMhVolNFMin','preMhVolNFMax','volNFfromLstClsMin','volNFfromLstClsMax',
          'avPostMhVol90NFMin','avPostMhVol90NFMax','avPreMhVol90NFMin','avPreMhVol90NFMax',
          'avPreMhValue20NFMin','avPreMhValue20NFMax','avPreMhValue90NFMin','avPreMhValue90NFMax',
          'avgDailyValue20Min','avgDailyValue20Max','avgDailyValue90Min','avgDailyValue90Max',
          'volatility20Min','volatility20Max','volatility90Min','volatility90Max',
          'preMhMDV20NFMin','preMhMDV20NFMax','preMhMDV90NFMin','preMhMDV90NFMax','volRelMin','volRelMax',
          'preMhBidLstPrcPctMin','preMhBidLstPrcPctMax','preMhLoLstPrcPctMin','preMhLoLstPrcPctMax',
          'preMhHiLstClsPctMin','preMhHiLstClsPctMax','preMhLoLstClsPctMin','preMhLoLstClsPctMax',
          'lstPrcLstClsPctMin','lstPrcLstClsPctMax','imbExch925Min','imbExch925Max','imbExch1555Min','imbExch1555Max',
        ] as const) {
          if (typeof s?.[key] === 'string') {
            const v = s[key];
            switch(key){
              case 'adv20Min': setAdv20Min(v); break;
              case 'adv20Max': setAdv20Max(v); break;
              case 'adv20NFMin': setAdv20NFMin(v); break;
              case 'adv20NFMax': setAdv20NFMax(v); break;
              case 'adv90Min': setAdv90Min(v); break;
              case 'adv90Max': setAdv90Max(v); break;
              case 'adv90NFMin': setAdv90NFMin(v); break;
              case 'adv90NFMax': setAdv90NFMax(v); break;
              case 'avPreMhvMin': setAvPreMhvMin(v); break;
              case 'avPreMhvMax': setAvPreMhvMax(v); break;
              case 'roundLotMin': setRoundLotMin(v); break;
              case 'roundLotMax': setRoundLotMax(v); break;
              case 'vwapMin': setVwapMin(v); break;
              case 'vwapMax': setVwapMax(v); break;
              case 'spreadMin': setSpreadMin(v); break;
              case 'spreadMax': setSpreadMax(v); break;
              case 'lstPrcLMin': setLstPrcLMin(v); break;
              case 'lstPrcLMax': setLstPrcLMax(v); break;
              case 'lstClsMin': setLstClsMin(v); break;
              case 'lstClsMax': setLstClsMax(v); break;
              case 'yClsMin': setYClsMin(v); break;
              case 'yClsMax': setYClsMax(v); break;
              case 'tClsMin': setTClsMin(v); break;
              case 'tClsMax': setTClsMax(v); break;
              case 'clsToClsPctMin': setClsToClsPctMin(v); break;
              case 'clsToClsPctMax': setClsToClsPctMax(v); break;
              case 'loMin': setLoMin(v); break;
              case 'loMax': setLoMax(v); break;
              case 'lstClsNewsCntMin': setLstClsNewsCntMin(v); break;
              case 'lstClsNewsCntMax': setLstClsNewsCntMax(v); break;
              case 'marketCapMMin': setMarketCapMMin(v); break;
              case 'marketCapMMax': setMarketCapMMax(v); break;
              case 'preMhVolNFMin': setPreMhVolNFMin(v); break;
              case 'preMhVolNFMax': setPreMhVolNFMax(v); break;
              case 'volNFfromLstClsMin': setVolNFfromLstClsMin(v); break;
              case 'volNFfromLstClsMax': setVolNFfromLstClsMax(v); break;
              case 'avPostMhVol90NFMin': setAvPostMhVol90NFMin(v); break;
              case 'avPostMhVol90NFMax': setAvPostMhVol90NFMax(v); break;
              case 'avPreMhVol90NFMin': setAvPreMhVol90NFMin(v); break;
              case 'avPreMhVol90NFMax': setAvPreMhVol90NFMax(v); break;
              case 'avPreMhValue20NFMin': setAvPreMhValue20NFMin(v); break;
              case 'avPreMhValue20NFMax': setAvPreMhValue20NFMax(v); break;
              case 'avPreMhValue90NFMin': setAvPreMhValue90NFMin(v); break;
              case 'avPreMhValue90NFMax': setAvPreMhValue90NFMax(v); break;
              case 'avgDailyValue20Min': setAvgDailyValue20Min(v); break;
              case 'avgDailyValue20Max': setAvgDailyValue20Max(v); break;
              case 'avgDailyValue90Min': setAvgDailyValue90Min(v); break;
              case 'avgDailyValue90Max': setAvgDailyValue90Max(v); break;
              case 'volatility20Min': setVolatility20Min(v); break;
              case 'volatility20Max': setVolatility20Max(v); break;
              case 'volatility90Min': setVolatility90Min(v); break;
              case 'volatility90Max': setVolatility90Max(v); break;
              case 'preMhMDV20NFMin': setPreMhMDV20NFMin(v); break;
              case 'preMhMDV20NFMax': setPreMhMDV20NFMax(v); break;
              case 'preMhMDV90NFMin': setPreMhMDV90NFMin(v); break;
              case 'preMhMDV90NFMax': setPreMhMDV90NFMax(v); break;
              case 'volRelMin': setVolRelMin(v); break;
              case 'volRelMax': setVolRelMax(v); break;
              case 'preMhBidLstPrcPctMin': setPreMhBidLstPrcPctMin(v); break;
              case 'preMhBidLstPrcPctMax': setPreMhBidLstPrcPctMax(v); break;
              case 'preMhLoLstPrcPctMin': setPreMhLoLstPrcPctMin(v); break;
              case 'preMhLoLstPrcPctMax': setPreMhLoLstPrcPctMax(v); break;
              case 'preMhHiLstClsPctMin': setPreMhHiLstClsPctMin(v); break;
              case 'preMhHiLstClsPctMax': setPreMhHiLstClsPctMax(v); break;
              case 'preMhLoLstClsPctMin': setPreMhLoLstClsPctMin(v); break;
              case 'preMhLoLstClsPctMax': setPreMhLoLstClsPctMax(v); break;
              case 'lstPrcLstClsPctMin': setLstPrcLstClsPctMin(v); break;
              case 'lstPrcLstClsPctMax': setLstPrcLstClsPctMax(v); break;
              case 'imbExch925Min': setImbExch925Min(v); break;
              case 'imbExch925Max': setImbExch925Max(v); break;
              case 'imbExch1555Min': setImbExch1555Min(v); break;
              case 'imbExch1555Max': setImbExch1555Max(v); break;
            }
          }
        }
      }
    } catch {}

    uiHydratedRef.current = true;
    // allow saves on next tick (after state settles)
    queueMicrotask(() => { uiRestoringRef.current = false; });
  }, []);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    if (uiRestoringRef.current) return;
    try {
      localStorage.setItem(
        UI_STATE_LS_KEY,
        JSON.stringify({
          // core
          cls, type, mode, listMode, bpCls,

          // zap/sort
          zapMode, activeMode, sortKey, sortDir, zapShowAbs, zapSilverAbs, zapGoldAbs,
          // The PAIR divergence group. Distinct from the zap* fields above: those are Arbitrage's
          // stock-vs-benchmark metric, which this page forces off. These four are the unit a pair's
          // deviation is read in, plus its min/max/exit in that unit.
          pfCls, pfZapMode, pfZapMin, pfZapMax, pfZapExit,

          // query params
          ratingMode, minRate, minTotal, tickersFilter, accountNonEmptyFirst, showSharedMinMax,
          topMode, topSigmaOn, topBenchOn, topTimeOn,

          // toggles
          excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
          excludeItb, excludeHard, excludeCorr, corrThresholdInput,
          includeUSA, includeChina,
          filterReport, equityType,

          corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax, alphaMin, alphaMax,

          // multi-select
          countryEnabled, selCountries: Array.from(selCountries),
          exchangeEnabled, selExchanges: Array.from(selExchanges),
          sectorEnabled, selSectors: Array.from(selSectors),
          rangeModes,

          // bounds
          adv20Min, adv20Max,
          adv20NFMin, adv20NFMax,
          adv90Min, adv90Max,
          adv90NFMin, adv90NFMax,
          avPreMhvMin, avPreMhvMax,
          roundLotMin, roundLotMax,
          vwapMin, vwapMax,
          spreadMin, spreadMax,
          lstPrcLMin, lstPrcLMax,
          lstClsMin, lstClsMax,
          yClsMin, yClsMax,
          tClsMin, tClsMax,
          clsToClsPctMin, clsToClsPctMax,
          loMin, loMax,
          lstClsNewsCntMin, lstClsNewsCntMax,
          marketCapMMin, marketCapMMax,
          preMhVolNFMin, preMhVolNFMax,
          volNFfromLstClsMin, volNFfromLstClsMax,
          avPostMhVol90NFMin, avPostMhVol90NFMax,
          avPreMhVol90NFMin, avPreMhVol90NFMax,
          avPreMhValue20NFMin, avPreMhValue20NFMax,
          avPreMhValue90NFMin, avPreMhValue90NFMax,
          avgDailyValue20Min, avgDailyValue20Max,
          avgDailyValue90Min, avgDailyValue90Max,
          volatility20Min, volatility20Max,
          volatility90Min, volatility90Max,
          preMhMDV20NFMin, preMhMDV20NFMax,
          preMhMDV90NFMin, preMhMDV90NFMax,
          volRelMin, volRelMax,
          preMhBidLstPrcPctMin, preMhBidLstPrcPctMax,
          preMhLoLstPrcPctMin, preMhLoLstPrcPctMax,
          preMhHiLstClsPctMin, preMhHiLstClsPctMax,
          preMhLoLstClsPctMin, preMhLoLstClsPctMax,
          lstPrcLstClsPctMin, lstPrcLstClsPctMax,
          imbExch925Min, imbExch925Max,
          imbExch1555Min, imbExch1555Max,
        })
      );
    } catch {}
  }, [
    cls, type, mode, listMode, bpCls,
    zapMode, activeMode, sortKey, sortDir, zapShowAbs, zapSilverAbs, zapGoldAbs,
    pfCls, pfZapMode, pfZapMin, pfZapMax, pfZapExit,
    ratingMode, minRate, minTotal, tickersFilter, accountNonEmptyFirst, showSharedMinMax,
    excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
    excludeItb, excludeHard, excludeCorr, corrThresholdInput,
    includeUSA, includeChina,
    filterReport, equityType,
    corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax, alphaMin, alphaMax,
    countryEnabled, selCountries,
    exchangeEnabled, selExchanges,
    sectorEnabled, selSectors,
    rangeModes,
    adv20Min, adv20Max,
    adv20NFMin, adv20NFMax,
    adv90Min, adv90Max,
    adv90NFMin, adv90NFMax,
    avPreMhvMin, avPreMhvMax,
    roundLotMin, roundLotMax,
    vwapMin, vwapMax,
    spreadMin, spreadMax,
    lstPrcLMin, lstPrcLMax,
    lstClsMin, lstClsMax,
    yClsMin, yClsMax,
    tClsMin, tClsMax,
    clsToClsPctMin, clsToClsPctMax,
    loMin, loMax,
    lstClsNewsCntMin, lstClsNewsCntMax,
    marketCapMMin, marketCapMMax,
    preMhVolNFMin, preMhVolNFMax,
    volNFfromLstClsMin, volNFfromLstClsMax,
    avPostMhVol90NFMin, avPostMhVol90NFMax,
    avPreMhVol90NFMin, avPreMhVol90NFMax,
    avPreMhValue20NFMin, avPreMhValue20NFMax,
    avPreMhValue90NFMin, avPreMhValue90NFMax,
    avgDailyValue20Min, avgDailyValue20Max,
    avgDailyValue90Min, avgDailyValue90Max,
    volatility20Min, volatility20Max,
    volatility90Min, volatility90Max,
    preMhMDV20NFMin, preMhMDV20NFMax,
    preMhMDV90NFMin, preMhMDV90NFMax,
    volRelMin, volRelMax,
    preMhBidLstPrcPctMin, preMhBidLstPrcPctMax,
    preMhLoLstPrcPctMin, preMhLoLstPrcPctMax,
    preMhHiLstClsPctMin, preMhHiLstClsPctMax,
    preMhLoLstClsPctMin, preMhLoLstClsPctMax,
    lstPrcLstClsPctMin, lstPrcLstClsPctMax,
    imbExch925Min, imbExch925Max,
    imbExch1555Min, imbExch1555Max,
  ]);

  useEffect(() => {
    let cancelled = false;

    function loadSonarPresets() {
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
        setSonarPresets(items);
        setSonarPresetId((prev) => {
          const candidate = prev || (() => {
            try {
              return localStorage.getItem(SONAR_ACTIVE_PRESET_ID_LS_KEY) ?? "";
            } catch {
              return "";
            }
          })();
          if (candidate === "") return "";
          return items.some((x) => x.id === candidate) ? candidate : "";
        });
      } catch {
        if (!cancelled) setSonarPresets([]);
      }
    }

    loadSonarPresets();
    window.addEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, loadSonarPresets as EventListener);
    window.addEventListener("focus", loadSonarPresets);
    return () => {
      cancelled = true;
      window.removeEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, loadSonarPresets as EventListener);
      window.removeEventListener("focus", loadSonarPresets);
    };
  }, []);

  useEffect(() => {
    try {
      if (sonarPresetId) {
        localStorage.setItem(SONAR_ACTIVE_PRESET_ID_LS_KEY, sonarPresetId);
      } else {
        localStorage.removeItem(SONAR_ACTIVE_PRESET_ID_LS_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [sonarPresetId]);

  const buildSonarSharedFilterPresetJson = () => {
    const current = {
      rangeModes,
      corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax, alphaMin, alphaMax,
      adv20Min, adv20Max, adv20NFMin, adv20NFMax, adv90Min, adv90Max, adv90NFMin, adv90NFMax,
      avPreMhvMin, avPreMhvMax, roundLotMin, roundLotMax, vwapMin, vwapMax, spreadMin, spreadMax,
      lstPrcLMin, lstPrcLMax, lstClsMin, lstClsMax, yClsMin, yClsMax, tClsMin, tClsMax,
      clsToClsPctMin, clsToClsPctMax, loMin, loMax, lstClsNewsCntMin, lstClsNewsCntMax,
      marketCapMMin, marketCapMMax, preMhVolNFMin, preMhVolNFMax, volNFfromLstClsMin, volNFfromLstClsMax,
      avPostMhVol90NFMin, avPostMhVol90NFMax, avPreMhVol90NFMin, avPreMhVol90NFMax,
      avPreMhValue20NFMin, avPreMhValue20NFMax, avPreMhValue90NFMin, avPreMhValue90NFMax,
      avgDailyValue20Min, avgDailyValue20Max, avgDailyValue90Min, avgDailyValue90Max,
      volatility20Min, volatility20Max, volatility90Min, volatility90Max,
      preMhMDV20NFMin, preMhMDV20NFMax, preMhMDV90NFMin, preMhMDV90NFMax, volRelMin, volRelMax,
      preMhBidLstPrcPctMin, preMhBidLstPrcPctMax, preMhLoLstPrcPctMin, preMhLoLstPrcPctMax,
      preMhHiLstClsPctMin, preMhHiLstClsPctMax, preMhLoLstClsPctMin, preMhLoLstClsPctMax,
      lstPrcLstClsPctMin, lstPrcLstClsPctMax, imbExch925Min, imbExch925Max, imbExch1555Min, imbExch1555Max,
    } as Record<string, any>;

    return JSON.stringify({
      version: 1,
      presetType: "shared-filters",
      filters: Object.fromEntries(
        SHARED_FILTER_PRESET_FIELDS.map(({ key, sonarMode, sonarMin, sonarMax }) => [
          key,
          {
            mode: current.rangeModes?.[sonarMode] === "off" ? "off" : "on",
            min: String(current[sonarMin] ?? ""),
            max: String(current[sonarMax] ?? ""),
          },
        ])
      ),
    });
  };

  const sonarSharedFilterSetters = {
    corrMin: setCorrMin,
    corrMax: setCorrMax,
    betaMin: setBetaMin,
    betaMax: setBetaMax,
    sigmaMin: setSigmaMin,
    sigmaMax: setSigmaMax,
    alphaMin: setAlphaMin,
    alphaMax: setAlphaMax,
    adv20Min: setAdv20Min,
    adv20Max: setAdv20Max,
    adv20NFMin: setAdv20NFMin,
    adv20NFMax: setAdv20NFMax,
    adv90Min: setAdv90Min,
    adv90Max: setAdv90Max,
    adv90NFMin: setAdv90NFMin,
    adv90NFMax: setAdv90NFMax,
    avPreMhvMin: setAvPreMhvMin,
    avPreMhvMax: setAvPreMhvMax,
    roundLotMin: setRoundLotMin,
    roundLotMax: setRoundLotMax,
    vwapMin: setVwapMin,
    vwapMax: setVwapMax,
    spreadMin: setSpreadMin,
    spreadMax: setSpreadMax,
    lstPrcLMin: setLstPrcLMin,
    lstPrcLMax: setLstPrcLMax,
    lstClsMin: setLstClsMin,
    lstClsMax: setLstClsMax,
    yClsMin: setYClsMin,
    yClsMax: setYClsMax,
    tClsMin: setTClsMin,
    tClsMax: setTClsMax,
    clsToClsPctMin: setClsToClsPctMin,
    clsToClsPctMax: setClsToClsPctMax,
    loMin: setLoMin,
    loMax: setLoMax,
    lstClsNewsCntMin: setLstClsNewsCntMin,
    lstClsNewsCntMax: setLstClsNewsCntMax,
    marketCapMMin: setMarketCapMMin,
    marketCapMMax: setMarketCapMMax,
    preMhVolNFMin: setPreMhVolNFMin,
    preMhVolNFMax: setPreMhVolNFMax,
    volNFfromLstClsMin: setVolNFfromLstClsMin,
    volNFfromLstClsMax: setVolNFfromLstClsMax,
    avPostMhVol90NFMin: setAvPostMhVol90NFMin,
    avPostMhVol90NFMax: setAvPostMhVol90NFMax,
    avPreMhVol90NFMin: setAvPreMhVol90NFMin,
    avPreMhVol90NFMax: setAvPreMhVol90NFMax,
    avPreMhValue20NFMin: setAvPreMhValue20NFMin,
    avPreMhValue20NFMax: setAvPreMhValue20NFMax,
    avPreMhValue90NFMin: setAvPreMhValue90NFMin,
    avPreMhValue90NFMax: setAvPreMhValue90NFMax,
    avgDailyValue20Min: setAvgDailyValue20Min,
    avgDailyValue20Max: setAvgDailyValue20Max,
    avgDailyValue90Min: setAvgDailyValue90Min,
    avgDailyValue90Max: setAvgDailyValue90Max,
    volatility20Min: setVolatility20Min,
    volatility20Max: setVolatility20Max,
    volatility90Min: setVolatility90Min,
    volatility90Max: setVolatility90Max,
    preMhMDV20NFMin: setPreMhMDV20NFMin,
    preMhMDV20NFMax: setPreMhMDV20NFMax,
    preMhMDV90NFMin: setPreMhMDV90NFMin,
    preMhMDV90NFMax: setPreMhMDV90NFMax,
    volRelMin: setVolRelMin,
    volRelMax: setVolRelMax,
    preMhBidLstPrcPctMin: setPreMhBidLstPrcPctMin,
    preMhBidLstPrcPctMax: setPreMhBidLstPrcPctMax,
    preMhLoLstPrcPctMin: setPreMhLoLstPrcPctMin,
    preMhLoLstPrcPctMax: setPreMhLoLstPrcPctMax,
    preMhHiLstClsPctMin: setPreMhHiLstClsPctMin,
    preMhHiLstClsPctMax: setPreMhHiLstClsPctMax,
    preMhLoLstClsPctMin: setPreMhLoLstClsPctMin,
    preMhLoLstClsPctMax: setPreMhLoLstClsPctMax,
    lstPrcLstClsPctMin: setLstPrcLstClsPctMin,
    lstPrcLstClsPctMax: setLstPrcLstClsPctMax,
    imbExch925Min: setImbExch925Min,
    imbExch925Max: setImbExch925Max,
    imbExch1555Min: setImbExch1555Min,
    imbExch1555Max: setImbExch1555Max,
  } as const;

  const applySonarPreset = (preset: PresetDto) => {
    try {
      const parsed = JSON.parse(preset.configJson ?? "{}");
      if (!isSharedFilterPreset(parsed)) return { ok: false, applied: 0, error: "invalid-format" };
      let base: Record<string, any> = {};
      try {
        base = JSON.parse(localStorage.getItem(UI_STATE_LS_KEY) ?? "{}");
      } catch {
        base = {};
      }
      const next = {
        ...base,
        rangeModes: {
          ...createDefaultRangeModes(),
          ...(base?.rangeModes && typeof base.rangeModes === "object" ? base.rangeModes : {}),
        },
        // Reset all toggle/country/sector filters to defaults so the same preset
        // produces identical results regardless of prior per-device localStorage state.
        excludeDividend: false, excludeNews: false, excludePTP: false, excludeSSR: false,
        excludeReport: false, excludeETF: false, excludeCrap: false,
        excludeItb: false, excludeHard: false, excludeCorr: false,
        includeUSA: false, includeChina: false,
        filterReport: "ALL", equityType: "",
        countryEnabled: "off", selCountries: [],
        exchangeEnabled: "off", selExchanges: [],
        sectorEnabled: "off", selSectors: [],
      } as Record<string, any>;

      // Apply the resets to React state as well
      setExcludeDividend(false); setExcludeNews(false); setExcludePTP(false); setExcludeSSR(false);
      setExcludeReport(false); setExcludeETF(false); setExcludeCrap(false);
      setIncludeUSA(false); setIncludeChina(false);
      setFilterReport("ALL"); setEquityType("");
      setCountryEnabled("off"); setSelCountries(new Set());
      setExchangeEnabled("off"); setSelExchanges(new Set());
      setSectorEnabled("off"); setSelSectors(new Set());

      let applied = 0;

      for (const { key, sonarMode, sonarMin, sonarMax } of SHARED_FILTER_PRESET_FIELDS) {
        const filter = parsed.filters?.[key];
        if (!filter || typeof filter !== "object") continue;
        next.rangeModes[sonarMode] = filter.mode === "off" ? "off" : "on";
        const nextMin = typeof filter.min === "string" ? filter.min : String(filter.min ?? "");
        const nextMax = typeof filter.max === "string" ? filter.max : String(filter.max ?? "");
        next[sonarMin] = nextMin;
        next[sonarMax] = nextMax;
        sonarSharedFilterSetters[sonarMin](nextMin);
        sonarSharedFilterSetters[sonarMax](nextMax);
        applied += 1;
      }

      setRangeModes((prev) => ({ ...prev, ...next.rangeModes }));
      localStorage.setItem(UI_STATE_LS_KEY, JSON.stringify(next));
      return { ok: true, applied, error: "" };
    } catch (error: any) {
      return {
        ok: false,
        applied: 0,
        error: typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "runtime-error",
      };
    }
  };

  const clearSonarSharedFilters = () => {
    setSonarPresetId("");
    const nextRangeModes = createDefaultRangeModes();
    for (const { sonarMin, sonarMax } of SHARED_FILTER_PRESET_FIELDS) {
      sonarSharedFilterSetters[sonarMin]("");
      sonarSharedFilterSetters[sonarMax]("");
    }
    setRangeModes(nextRangeModes);

    let base: Record<string, any> = {};
    try {
      base = JSON.parse(localStorage.getItem(UI_STATE_LS_KEY) ?? "{}");
    } catch {
      base = {};
    }
    const next = { ...base, rangeModes: nextRangeModes } as Record<string, any>;
    for (const { sonarMin, sonarMax } of SHARED_FILTER_PRESET_FIELDS) {
      next[sonarMin] = "";
      next[sonarMax] = "";
    }
    try {
      localStorage.setItem(UI_STATE_LS_KEY, JSON.stringify(next));
      setSonarPresetStatus("Cleared");
    } catch {
      setSonarPresetStatus("Clear failed");
    }
  };

  const saveCurrentSonarPreset = async (presetName?: string) => {
    const name = presetName?.trim();
    if (!name) return;

    setSonarPresetBusy(true);
    setSonarPresetStatus("");
    try {
      saveSharedFilterLocalPreset(name, buildSonarSharedFilterPresetJson());
      const items = listSharedFilterLocalPresets()
        .filter((x) => {
          if (x.scope !== "BOTH") return false;
          try {
            return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
          } catch {
            return false;
          }
        });
      setSonarPresets(items);
      setSonarPresetId(items[0]?.id ?? "");
      setSonarPresetDraftName("");
      setSonarPresetSaveMode(false);
      setSonarPresetStatus("Saved");
    } catch {
      setSonarPresetStatus("Save failed");
    } finally {
      setSonarPresetBusy(false);
    }
  };

  /* =========================
     Snapshot (single source of truth for fetching/filtering)
  ========================= */
  const bounds = useMemo(() => {
    const mm = (key: RangeBoundKey, minS: string, maxS: string) =>
      rangeModes[key] === "off" ? { min: null, max: null } : { min: toNum(minS), max: toNum(maxS) };
    return {
      Corr: mm("Corr", corrMin, corrMax),
      Beta: mm("Beta", betaMin, betaMax),
      Sigma: mm("Sigma", sigmaMin, sigmaMax),
      ADV20: mm("ADV20", adv20Min, adv20Max),
      ADV20NF: mm("ADV20NF", adv20NFMin, adv20NFMax),
      ADV90: mm("ADV90", adv90Min, adv90Max),
      ADV90NF: mm("ADV90NF", adv90NFMin, adv90NFMax),
      AvPreMhv: mm("AvPreMhv", avPreMhvMin, avPreMhvMax),
      RoundLot: mm("RoundLot", roundLotMin, roundLotMax),
      VWAP: mm("VWAP", vwapMin, vwapMax),
      SpreadBidPct: mm("SpreadBidPct", spreadMin, spreadMax),
      LstPrcL: mm("LstPrcL", lstPrcLMin, lstPrcLMax),
      LstCls: mm("LstCls", lstClsMin, lstClsMax),
      YCls: mm("YCls", yClsMin, yClsMax),
      TCls: mm("TCls", tClsMin, tClsMax),
      ClsToClsPct: mm("ClsToClsPct", clsToClsPctMin, clsToClsPctMax),
      Lo: mm("Lo", loMin, loMax),
      LstClsNewsCnt: mm("LstClsNewsCnt", lstClsNewsCntMin, lstClsNewsCntMax),
      MarketCapM: mm("MarketCapM", marketCapMMin, marketCapMMax),
      PreMhVolNF: mm("PreMhVolNF", preMhVolNFMin, preMhVolNFMax),
      VolNFfromLstCls: mm("VolNFfromLstCls", volNFfromLstClsMin, volNFfromLstClsMax),
      AvPostMhVol90NF: mm("AvPostMhVol90NF", avPostMhVol90NFMin, avPostMhVol90NFMax),
      AvPreMhVol90NF: mm("AvPreMhVol90NF", avPreMhVol90NFMin, avPreMhVol90NFMax),
      AvPreMhValue20NF: mm("AvPreMhValue20NF", avPreMhValue20NFMin, avPreMhValue20NFMax),
      AvPreMhValue90NF: mm("AvPreMhValue90NF", avPreMhValue90NFMin, avPreMhValue90NFMax),
      AvgDailyValue20: mm("AvgDailyValue20", avgDailyValue20Min, avgDailyValue20Max),
      AvgDailyValue90: mm("AvgDailyValue90", avgDailyValue90Min, avgDailyValue90Max),
      Volatility20: mm("Volatility20", volatility20Min, volatility20Max),
      Volatility90: mm("Volatility90", volatility90Min, volatility90Max),
      PreMhMDV20NF: mm("PreMhMDV20NF", preMhMDV20NFMin, preMhMDV20NFMax),
      PreMhMDV90NF: mm("PreMhMDV90NF", preMhMDV90NFMin, preMhMDV90NFMax),
      VolRel: mm("VolRel", volRelMin, volRelMax),
      PreMhBidLstPrcPct: mm("PreMhBidLstPrcPct", preMhBidLstPrcPctMin, preMhBidLstPrcPctMax),
      PreMhLoLstPrcPct: mm("PreMhLoLstPrcPct", preMhLoLstPrcPctMin, preMhLoLstPrcPctMax),
      PreMhHiLstClsPct: mm("PreMhHiLstClsPct", preMhHiLstClsPctMin, preMhHiLstClsPctMax),
      PreMhLoLstClsPct: mm("PreMhLoLstClsPct", preMhLoLstClsPctMin, preMhLoLstClsPctMax),
      LstPrcLstClsPct: mm("LstPrcLstClsPct", lstPrcLstClsPctMin, lstPrcLstClsPctMax),
      ImbExch925: mm("ImbExch925", imbExch925Min, imbExch925Max),
      ImbExch1555: mm("ImbExch1555", imbExch1555Min, imbExch1555Max),
    };
  }, [
    rangeModes,
    corrMin, corrMax,
    betaMin, betaMax,
    sigmaMin, sigmaMax,
    adv20Min, adv20Max,
    adv20NFMin, adv20NFMax,
    adv90Min, adv90Max,
    adv90NFMin, adv90NFMax,
    avPreMhvMin, avPreMhvMax,
    roundLotMin, roundLotMax,
    vwapMin, vwapMax,
    spreadMin, spreadMax,
    lstPrcLMin, lstPrcLMax,
    lstClsMin, lstClsMax,
    yClsMin, yClsMax,
    tClsMin, tClsMax,
    clsToClsPctMin, clsToClsPctMax,
    loMin, loMax,
    lstClsNewsCntMin, lstClsNewsCntMax,
    marketCapMMin, marketCapMMax,
    preMhVolNFMin, preMhVolNFMax,
    volNFfromLstClsMin, volNFfromLstClsMax,
    avPostMhVol90NFMin, avPostMhVol90NFMax,
    avPreMhVol90NFMin, avPreMhVol90NFMax,
    avPreMhValue20NFMin, avPreMhValue20NFMax,
    avPreMhValue90NFMin, avPreMhValue90NFMax,
    avgDailyValue20Min, avgDailyValue20Max,
    avgDailyValue90Min, avgDailyValue90Max,
    volatility20Min, volatility20Max,
    volatility90Min, volatility90Max,
    preMhMDV20NFMin, preMhMDV20NFMax,
    preMhMDV90NFMin, preMhMDV90NFMax,
    volRelMin, volRelMax,
    preMhBidLstPrcPctMin, preMhBidLstPrcPctMax,
    preMhLoLstPrcPctMin, preMhLoLstPrcPctMax,
    preMhHiLstClsPctMin, preMhHiLstClsPctMax,
    preMhLoLstClsPctMin, preMhLoLstClsPctMax,
    lstPrcLstClsPctMin, lstPrcLstClsPctMax,
    imbExch925Min, imbExch925Max,
    imbExch1555Min, imbExch1555Max,
  ]);

  // Seeds come from `allItems` — the whole sample, before any UI filter. A reporting ticker the
  // user hid for an unrelated reason still contaminates the names that move with it.
  const corrThreshold = useMemo(
    () => clampSectorCorrThreshold(parseSectorCorrThreshold(corrThresholdInput) ?? SECTOR_CORR_DEFAULT),
    [corrThresholdInput]
  );
  const sectorCorr = useSectorCorrExclusion(allItems, excludeCorr, corrThreshold);

  const snapshot = useMemo(() => {
    return {
      cls,
      type,
      mode,
      ratingMode,
      minRate,
      minTotal,
      tickersFilterNorm,

      listMode,
      ignoreSet,
      applySet,
      pinMap,
      sortKey,
      sortDir,

      bounds,

      excludeDividend,
      excludeNews,
      excludePTP,
      excludeSSR,
      excludeReport,
      excludeETF,
      excludeCrap,
      excludeItb,
      excludeHard,
      excludeCorr,
      corrExcluded: sectorCorr.excluded,
      activeMode,

      includeUSA,
      includeChina,

      selCountries,
      countryEnabled,
      selExchanges,
      exchangeEnabled,
      selSectors,
      sectorEnabled,

      filterReport,
      equityType,

      // Blank on purpose. These boxes hold a PAIR's corr / beta / sigma now, and the client
      // filter below would otherwise read them as the ticker-vs-benchmark statistics of the same
      // name and quietly drop legs the pair panel needs. The panel applies them itself.
      corrMin: "",
      corrMax: "",
      betaMin: "",
      betaMax: "",
      sigmaMin: "",
      sigmaMax: "",

      zapMode,
      zapShowAbs,
      zapSilverAbs,
      zapGoldAbs,

      topMode,
      topSigmaOn,
      topBenchOn,
      topTimeOn,

    };
  }, [
    cls, type, mode, ratingMode, minRate, minTotal, tickersFilterNorm,
    listMode, ignoreSet, applySet,pinMap, sortKey, sortDir,
    bounds,
    excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
    excludeItb, excludeHard, excludeCorr, sectorCorr.excluded,
    activeMode, // include in dependencies
    includeUSA, includeChina,
    selCountries, countryEnabled, selExchanges, exchangeEnabled, selSectors, sectorEnabled,
    filterReport, equityType,
    corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax,
    zapMode, zapShowAbs,  zapSilverAbs, zapGoldAbs,
    topMode, topSigmaOn, topBenchOn, topTimeOn,

  ]);

  const filtersRef = useRef(snapshot);
  useEffect(() => {
    filtersRef.current = snapshot;
  }, [snapshot]);

  /**
   * The bucket grid's toolbar, to the bridge — same push as ArbitrageSonar's, reused as-is since
   * the bucket grid here is the identical Arbitrage-shaped screen (corr/beta/sigma already blanked
   * in `snapshot` for this path, see its own comment above).
   */
  useEffect(() => {
    if (!uiHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void pushArbitrageSonarLiveParams(toArbitrageSonarLiveParams({
        snapshot,
        source: "pairflux-sonar-grid",
      }));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  /** Same window as ArbitrageSonar's — the bucket grid's own approved (ticker, side) set. */
  // Retry bumps this to re-subscribe the snapshot poll below.
  const [streamReconnectVersion, setStreamReconnectVersion] = useState(0);
  const [sonarApprovedKeys, setSonarApprovedKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeSharedPoll("sonar-pairflux-grid-snapshot", fetchArbitrageSonarSnapshot, 6_000, (value, err) => {
      if (!alive) return;
      if (err) return;
      if (value?.timedOut) {
        setError("Bridge fetch timed out — no live feed reachable. Values below are the last received snapshot.");
        return;
      }
      const rows: SonarSignalRow[] = value?.rows ?? [];
      setSonarApprovedKeys(new Set(rows.map((r) => `${r.ticker.toUpperCase()}|${r.side}`)));
      // The bridge also sends the full rows those tickers (and the few its hedge / gold / sector-
      // correlation widgets read) are drawn from, so the page opens no live feed of its own.
      const detail = (((value as any)?.items ?? []) as any[]).map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
      startTransition(() => {
        setAllItems(detail);
        setSonarRawCount((value as any)?.rawCount ?? detail.length);
        setUpdatedAt(Date.now());
      });
      setLoading(false);
      setError(null);
    });
    return () => { alive = false; unsubscribe(); };
  }, [streamReconnectVersion]);

  /**
   * PairFluxDivergence's own toolbar (cls/unit/min/max/exit/corr/beta/sigma/alpha) — genuinely
   * separate params from the bucket grid's above, since PairFluxDivergence reads a PAIR's own
   * stats, not a per-ticker one. No rating floor here: fetchPairFluxRatings/computeLivePairs are
   * called today with no minRate/minTotal at all in this panel, faithfully carried forward as 0/0
   * rather than inventing a floor the toolbar has no control for.
   */
  useEffect(() => {
    if (!uiHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void pushPairFluxSonarLiveParams(toPairFluxSonarLiveParams({
        cls: pfCls,
        unit: pfZapMode,
        minDeviation: pfZapMin,
        maxDeviation: pfZapMax,
        exitAt: pfZapExit,
        minRate: 0,
        minTotal: 0,
        corr: [corrMin, corrMax],
        beta: [betaMin, betaMax],
        sigma: [sigmaMin, sigmaMax],
        alpha: [alphaMin, alphaMax],
        sonar: snapshot as SonarExactFilterSnapshot,
        source: "pairflux-sonar-divergence",
      }));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [pfCls, pfZapMode, pfZapMin, pfZapMax, pfZapExit, corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax, alphaMin, alphaMax, snapshot]);

  const [pairFluxSonarPairs, setPairFluxSonarPairs] = useState<LivePair[] | null>(null);
  const [pairFluxSonarCoverage, setPairFluxSonarCoverage] = useState<{ both: number; half: number; total: number } | null>(null);
  // Per-stage rejection counts from the leg filter — not yet surfaced in this panel's own UI
  // (unlike ArbitrageSonar's), but captured so a future empty-state banner here has it for free.
  const [pairFluxSonarFunnel, setPairFluxSonarFunnel] = useState<SonarFilterFunnel | null>(null);
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeSharedPoll("sonar-pairflux-divergence-snapshot", fetchPairFluxSonarSnapshot, 6_000, (value, err) => {
      if (!alive) return;
      if (err) return;
      if (value?.timedOut) {
        setError("Bridge fetch timed out — no live feed reachable. Values below are the last received snapshot.");
        return;
      }
      setPairFluxSonarPairs(value?.pairs ?? []);
      setPairFluxSonarCoverage(value?.coverage ?? null);
      setPairFluxSonarFunnel(value?.funnel ?? null);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  /* =========================
     Filters (fast single-pass)
  ========================= */
  const passMinMax = (val: number | null, min: number | null, max: number | null) => {
    if ((min != null || max != null) && val == null) return false;
    if (min != null && val != null && val < min) return false;
    if (max != null && val != null && val > max) return false;
    return true;
  };

  // Filtering itself now happens server-side (ArbitrageSonarSnapshotService, reused for this
  // bucket grid) — see sonarApprovedKeys above. The browser copy of the filter chain
  // (applyExactSonarClientFilters) is deleted: it had no caller, and a second copy of a rule is
  // how the two drift apart.

  // The filter decision now comes from the bridge (sonarApprovedKeys, polled above) — this only
  // intersects it with the live feed's full-fidelity rows, which PairFluxDivergence still needs
  // for its own quoteByTicker/coverage diagnostics.
  useEffect(() => {
    if (isEditingRef.current) return;
    const filtered = sonarApprovedKeys == null
      ? []
      : allItems.filter((s) => {
          const side = s.direction === "down" ? "Short" : "Long";
          return sonarApprovedKeys.has(`${String(s.ticker ?? "").toUpperCase()}|${side}`);
        });
    startTransition(() => {
      setItems(filtered);
    });
  }, [allItems, sonarApprovedKeys, isEditing]);

  /* =========================
    Flash Logic (stable, cleanup-safe)
  ========================= */

  const prevRef = useRef<Map<string, number | null>>(new Map());
  const flashRef = useRef<Map<string, "up" | "down">>(new Map());
  const timersRef = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, number | null>();
    const EPS = 1e-6;

    for (const s of items ?? []) {
      if (!s?.ticker) continue;

      const dir = s.direction;
      if (dir !== "down" && dir !== "up") continue;

      const side: "short" | "long" = dir === "down" ? "short" : "long";
      const key = `${side}::${s.ticker}`;

      // flash metric: choose WHAT you want to compare (sig? zap? sigmaZap?)
      const metric = typeof s.sig === "number" ? s.sig : null;

      next.set(key, metric);

      const old = prev.get(key);
      if (metric != null && old != null && Math.abs(metric - old) > EPS) {
        const d: "up" | "down" = metric > old ? "up" : "down";
        flashRef.current.set(key, d);

        // clear previous timer for this key
        const oldTimer = timersRef.current.get(key);
        if (oldTimer) window.clearTimeout(oldTimer);

        const t = window.setTimeout(() => {
          // only clear if still the same direction
          if (flashRef.current.get(key) === d) {
            flashRef.current.delete(key);
            force((x) => x + 1);
          }
          timersRef.current.delete(key);
        }, 900);

        timersRef.current.set(key, t);
      }
    }

    prevRef.current = next;
    force((x) => x + 1);
  }, [items]);

  // cleanup flash timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) window.clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const flashClass = useCallback((ticker: string, side: "short" | "long") => {
    const f = flashRef.current.get(`${side}::${ticker}`);
    return f === "up" ? "flashUp" : f === "down" ? "flashDown" : "";
  }, []);


  /* =========================
     Active ticker derived from items
  ========================= */
  const activeItem = useMemo(() => {
    const tk = normalizeTicker(activeTicker || "");
    if (!tk) return null;
    return (items ?? []).find((x) => normalizeTicker(x?.ticker || "") === tk) ?? null;
  }, [activeTicker, items]);

  useEffect(() => {
    setActiveLoading(false);
    setActiveErr(null);
    setActiveData(activeItem);
  }, [activeItem]);

  // Fetch live snapshot fields for the active ticker so static fields
  // (AvPreMhVol90NF, Volatility20, ImbExch9:25 etc.) always show current values
  // even when tape rows are stale or missing those fields.
  useEffect(() => {
    const tk = normalizeTicker(activeTicker || "");
    if (!tk) { setLiveSnap(null); return; }
    let cancelled = false;
    const LIVE_FIELDS = [
      "AvPreMhVol90NF","AvPreMhValue20NF","AvPreMhValue90NF",
      "PreMhMDV90NF","PreMhMDV20NF","AvPostMhVol90NF",
      "Volatility20","Volatility90","VolRel",
      "LstPrcLstClsΔ%",
      "PreMhBidLstPrcΔ%","PreMhLoLstPrcΔ%","PreMhHiLstClsΔ%","PreMhLoLstClsΔ%",
      "ImbExch9:25","ImbExch15:55",
      "PreMhVol","PreMhVolNF",
      "SpreadBid%",
    ].join(",");
    fetch(`${BRIDGE_BASE}/api/live/snapshot?tickers=${encodeURIComponent(tk)}&fields=${encodeURIComponent(LIVE_FIELDS)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const item = Array.isArray(data?.items) ? data.items[0] : null;
        setLiveSnap(item?.Fields ?? item?.fields ?? null);
      })
      .catch(() => { if (!cancelled) setLiveSnap(null); });
    return () => { cancelled = true; };
  }, [activeTicker]);

  const onTickerClick = (tk: string) => {
    const n = normalizeTicker(tk);
    if (!n) return;
    setActiveTicker(n);
    setActivePanelVisible(true);
  };

  const getSortValue = (s: ArbitrageSignal, key: SortKey) => {
    switch (key) {
      case "sigma": return toNum(s.sig) ?? -Infinity;
      case "zapAbs": {
        const dir = s.direction;
        const v = dir === "down" ? toNum(s.zapS) : dir === "up" ? toNum(s.zapL) : null;
        return v == null ? -Infinity : Math.abs(v);
      }
      case "sigZapAbs": {
        const dir = s.direction;
        const v = dir === "down" ? toNum(s.zapSsigma) : dir === "up" ? toNum(s.zapLsigma) : null;
        return v == null ? -Infinity : Math.abs(v);
      }
      case "rate": return getBestRating(s) ?? (s as any)._bestRating ?? -Infinity;
      case "posBpAbs": {
        const v = numPositionBp(s);
        return v == null ? -Infinity : Math.abs(v);
      }
      case "beta": {
        const b = getBetaValue(s);
        return b == null ? -Infinity : b;
      }
      case "pin":
      case "alpha":
      default:
        return null;
    }
  };

  const cmpBySort = (a: ArbitrageSignal, b: ArbitrageSignal, f: typeof snapshot) => {
    const ta = String(a?.ticker ?? "");
    const tb = String(b?.ticker ?? "");

    const pa = !!f.pinMap[ta];
    const pb = !!f.pinMap[tb];

    // when sorting by PIN: pinned always on top
    if (f.sortKey === "pin" && pa !== pb) return pa ? -1 : 1;

    // alpha: just ticker
    if (f.sortKey === "alpha") return ta.localeCompare(tb);

    const va = getSortValue(a, f.sortKey);
    const vb = getSortValue(b, f.sortKey);

    const na = typeof va === "number" ? va : -Infinity;
    const nb = typeof vb === "number" ? vb : -Infinity;

    if (na !== nb) {
      const d = na < nb ? -1 : 1;
      return f.sortDir === "asc" ? d : -d;
    }

    // tie-breakers:
    // optionally account ordering first if you still want it:
    // (leave it as your current switch)
    return ta.localeCompare(tb);
  };


  /* =========================
    Grouping (+ account sorting toggle + turquoise sort + pins)
  ========================= */
  const benchBlocks: BenchBlock[] = useMemo(() => {
    const bucketMap = new Map<
      string,
      { benchmark: string; betaKey: BetaKey; shorts: ArbitrageSignal[]; longs: ArbitrageSignal[] }
    >();

    const isPinned = (tk: string) => !!pinMap[tk]; // pinMap is Record

    const cmpAccountThenTicker = makeCmpAccountThenTicker(accountNonEmptyFirst);

    // Precompute expensive sort metrics once per item (instead of per comparator call in Array.sort).
    const metricMap = new Map<string, number>(); // key: `${ticker}|${direction}`

    const computeMetric = (s: ArbitrageSignal): number => {
      switch (sortKey) {
        case "sigma":
          return Math.abs(toNum(s.sig) ?? 0);

        case "zapAbs": {
          const dir = s.direction;
          const v = dir === "down" ? toNum(s.zapS) : dir === "up" ? toNum(s.zapL) : null;
          return v == null ? -Infinity : Math.abs(v);
        }

        case "sigZapAbs": {
          const dir = s.direction;
          const v = dir === "down" ? toNum(s.zapSsigma) : dir === "up" ? toNum(s.zapLsigma) : null;
          return v == null ? -Infinity : Math.abs(v);
        }

        case "rate":
          return getBestRating(s) ?? -Infinity;

        case "posBpAbs": {
          const v = numPositionBp(s);
          return v == null ? -Infinity : Math.abs(v);
        }

        case "beta": {
          const b = getBetaValue(s);
          return b == null ? -Infinity : b;
        }

        case "pin":
        case "alpha":
        default:
          return 0;
      }
    };

    for (const s of items || []) {
      const dir = getRenderableDirection(s);
      if (dir !== "down" && dir !== "up") continue;

      const tk = String(s.ticker ?? "").toUpperCase();
      if (!tk) continue;

      // compute metric once per (ticker,direction)
      metricMap.set(`${tk}|${dir}`, computeMetric(s));

      const benchmark = (s.benchmark || "UNKNOWN").toUpperCase();
      const betaVal = getBetaValue(s);
      const betaKey = parseBetaKey(betaVal);

      const bucketId = `${benchmark}__${betaKey}`;
      let b = bucketMap.get(bucketId);
      if (!b) {
        b = { benchmark, betaKey, shorts: [], longs: [] };
        bucketMap.set(bucketId, b);
      }

      if (dir === "down") b.shorts.push(s);
      else b.longs.push(s);
    }

    const cmpSort = (a: ArbitrageSignal, b: ArbitrageSignal) => {
      const ta = String(a.ticker ?? "").toUpperCase();
      const tb = String(b.ticker ?? "").toUpperCase();

      // 1) pinned first
      const pa = isPinned(ta) ? 1 : 0;
      const pb = isPinned(tb) ? 1 : 0;
      if (pa !== pb) return pb - pa;

      // 2) special modes keep old behavior
      if (sortKey === "pin" || sortKey === "alpha") {
        return cmpAccountThenTicker(a, b);
      }

      const ma = metricMap.get(`${ta}|${a.direction}`) ?? -Infinity;
      const mb = metricMap.get(`${tb}|${b.direction}`) ?? -Infinity;

      if (ma !== mb) return sortDir === "asc" ? ma - mb : mb - ma;

      // 3) tie-breaker
      return cmpAccountThenTicker(a, b);
    };

    // regroup to BenchBlock[]
    const benchMap = new Map<string, BucketGroup[]>();

    for (const [, b] of bucketMap.entries()) {
      b.shorts.sort(cmpSort);
      b.longs.sort(cmpSort);

      const n = Math.max(b.shorts.length, b.longs.length);
      const rows: RowPair[] = new Array(n);
      for (let i = 0; i < n; i++) rows[i] = { short: b.shorts[i], long: b.longs[i] };

      const group: BucketGroup = {
        id: `${b.benchmark}__${b.betaKey}`,
        benchmark: b.benchmark,
        betaKey: b.betaKey,
        rows,
      };

      const list = benchMap.get(b.benchmark) ?? [];
      list.push(group);
      benchMap.set(b.benchmark, list);
    }

    return Array.from(benchMap.entries())
      .sort(([a], [b]) => sortBenchmarks(a, b))
      .map(([benchmark, groups]) => ({
        benchmark,
        buckets: groups.sort((a, b) => betaOrder.indexOf(a.betaKey) - betaOrder.indexOf(b.betaKey)),
      }));
  }, [items, accountNonEmptyFirst, sortKey, sortDir, pinMap]);

  const hedgeComputed = useMemo(() => computeHedgeByBench(allItems), [allItems]);
  const hedgeByBench = hedgeComputed.byBench;
  const pairMutualExclusion = hedgeComputed.exclusions;
  const hasAny = benchBlocks.some((b) => b.buckets.some((g) => g.rows.length > 0));
  const rawSignalCount = sonarRawCount;
  const filteredOutSignalCount = Math.max(0, rawSignalCount - items.length);
  const filteredOutByClientFilters = !loading && !error && !hasAny && rawSignalCount > 0;
  const bridgeReturnedNoSignals = !loading && !error && !hasAny && rawSignalCount === 0;
  const activeEmptyStateHints = useMemo(() => {
    const hints: string[] = [];
    const pushRangeHint = (label: string, mode: RangeFilterMode, min: string, max: string) => {
      if (mode === "off" || (!min && !max)) return;
      hints.push(`${label} ${min || "min"}..${max || "max"}`);
    };
    pushRangeHint(`PreMhVolNF`, rangeModes.PreMhVolNF, preMhVolNFMin, preMhVolNFMax);
    pushRangeHint(`VolNFfromLstCls`, rangeModes.VolNFfromLstCls, volNFfromLstClsMin, volNFfromLstClsMax);
    if (tickersFilterNorm) hints.push(`tickers ${tickersFilterNorm}`);
    if (corrMin || corrMax) hints.push(`ρ ${corrMin || "min"}..${corrMax || "max"}`);
    if (betaMin || betaMax) hints.push(`β ${betaMin || "min"}..${betaMax || "max"}`);
    if (sigmaMin || sigmaMax) hints.push(`σ ${sigmaMin || "min"}..${sigmaMax || "max"}`);
    if (alphaMin || alphaMax) hints.push(`α ${alphaMin || "min"}..${alphaMax || "max"}`);
    if (listMode === "ignore" && ignoreSet.size > 0) hints.push(`ignore ${ignoreSet.size}`);
    if (listMode === "apply" && applySet.size > 0) hints.push(`apply ${applySet.size}`);
    if (listMode === "pin" && Object.keys(pinMap).length > 0) hints.push(`pin ${Object.keys(pinMap).length}`);
    if (activeMode === "onlyActive") hints.push("ACTIVE only");
    if (activeMode === "onlyInactive") hints.push("INACTIVE only");
    if (excludeDividend) hints.push("ex DIV");
    if (excludeNews) hints.push("ex NEWS");
    if (excludePTP) hints.push("ex PTP");
    if (excludeSSR) hints.push("ex SSR");
    if (excludeReport) hints.push("ex REPORT");
    if (excludeETF) hints.push("ex ETF");
    if (excludeCrap) hints.push("ex < $5");
    if (excludeItb) hints.push("ex ITB");
    if (excludeHard) hints.push("ex HARD-to-borrow");
    if (excludeCorr) hints.push(`ex CORR peers ${sectorCorr.excluded.size}`);
    if (includeUSA) hints.push("USA only");
    if (includeChina) hints.push("CHINA only");
    if (countryEnabled !== "off" && selCountries.size > 0) hints.push(`countries ${selCountries.size}`);
    if (exchangeEnabled !== "off" && selExchanges.size > 0) hints.push(`exchanges ${selExchanges.size}`);
    if (sectorEnabled !== "off" && selSectors.size > 0) hints.push(`sectors ${selSectors.size}`);
    if (equityType.trim()) hints.push(`equity ${equityType.trim()}`);
    if (zapMode !== "off") hints.push(`${zapMode.toUpperCase()} >= ${Number(zapShowAbs ?? 0).toFixed(2)}`);
    // BIN/BINS are not ported server-side yet — the Sonar snapshot always rates SESSION-only, a
    // known gap (see the handoff doc). Surfacing it here so "0 visible" is not mistaken for a bug
    // when the real cause is a rating mode silently substituted underneath the operator's choice.
    if (ratingMode !== "SESSION") hints.push(`${ratingMode} requested, served SESSION`);
    return hints.slice(0, 10);
  }, [
    activeMode,
    alphaMax,
    alphaMin,
    applySet.size,
    betaMax,
    betaMin,
    countryEnabled,
    corrMax,
    corrMin,
    equityType,
    exchangeEnabled,
    excludeCrap,
    excludeDividend,
    excludeETF,
    excludeHard,
    excludeItb,
    excludeCorr,
    excludeNews,
    excludePTP,
    excludeReport,
    excludeSSR,
    ignoreSet.size,
    includeChina,
    includeUSA,
    listMode,
    pinMap,
    preMhVolNFMax,
    preMhVolNFMin,
    rangeModes,
    ratingMode,
    sectorCorr.excluded,
    sectorEnabled,
    selCountries,
    selExchanges,
    selSectors,
    sigmaMax,
    sigmaMin,
    tickersFilterNorm,
    volNFfromLstClsMax,
    volNFfromLstClsMin,
    zapMode,
    zapShowAbs,
  ]);
  const resetSonarUiState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(UI_STATE_LS_KEY);
      localStorage.removeItem(SONAR_ACTIVE_PRESET_ID_LS_KEY);
    } catch {}
    window.location.reload();
  }, []);

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const toggleBucket = (id: string) => setExpandedMap((p) => ({ ...p, [id]: !p[id] }));

  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-US", { hour12: false }) : null;

  const ignoreList = useMemo(() => sortedTickers(ignoreSet), [ignoreSet]);
  const applyList = useMemo(() => sortedTickers(applySet), [applySet]);

  const classLabel = cls.toUpperCase() === "GLOBAL" ? "GLOB" : cls.toUpperCase();
  const typeLabel = type.toUpperCase();
  const modeLabel = mode.toUpperCase();

  const setModeIgnore = () => setListMode((m) => (m === "ignore" ? "off" : "ignore"));
  const setModeApply = () => setListMode((m) => (m === "apply" ? "off" : "apply"));
  const setModePin = () => setListMode((m) => (m === "pin" ? "off" : "pin"));



  /* =========================
     Active derived fields
  ========================= */
  const activeMeta = getMeta(activeData);
  const activeBench = (activeData?.benchmark ? String(activeData.benchmark) : getStrAny(activeData, ["benchmark", "Benchmark"], "-")).toUpperCase();
  const bestObj = activeData?.best ?? activeData?.Best ?? null;
  const bestParams = getBestParams(activeData);
  const activePrintMedian = safeObj(bestParams?.dev_print_last5_median ?? bestParams?.DevPrintLast5Median);
  const activeMdPrintPos =
    toNum(bestObj?.printMedianPos ?? bestObj?.PrintMedianPos) ??
    toNum(activePrintMedian?.pos ?? activePrintMedian?.Pos);
  const activeMdPrintNeg =
    toNum(bestObj?.printMedianNeg ?? bestObj?.PrintMedianNeg) ??
    toNum(activePrintMedian?.neg ?? activePrintMedian?.Neg);

  const activeBeta = toNum(bestObj?.beta ?? bestObj?.Beta ?? (activeData as any)?._bestBeta);
  const activeSigma = toNum(bestObj?.sigma ?? bestObj?.Sigma) ?? getNumAny(activeData, ["sig", "Sig", "sigma", "Sigma"]);
  const activeSector2 = getStrAny(activeData, ["sector", "Sector", "lvl2", "level2", "Level2"], "-");
  const activeExchange2 = getStrAny(activeData, ["exchange", "Exchange"], "-");
  const activeMarketCapM2 =
    getNumAny(activeData, ["marketCapM", "MarketCapM"]) ??
    (getNumAny(activeData, ["marketCap", "MarketCap"]) != null ? getNumAny(activeData, ["marketCap", "MarketCap"]) : null);
  const activeTickerNorm = normalizeTicker(activeTicker || "");
  const activeInIgnoreList = activeTickerNorm ? ignoreSet.has(activeTickerNorm) : false;
  const activeInApplyList = activeTickerNorm ? applySet.has(activeTickerNorm) : false;
  const activePinColor = activeTickerNorm ? pinMap[activeTickerNorm] ?? null : null;
  const activeGoldTickers = useMemo(() => {
    if (zapMode === "off") return [];
    const byKey = new Map<string, { ticker: string; direction: "up" | "down"; benchmark: string; metricAbs: number | null }>();
    for (const s of allItems ?? []) {
      if (!isSignalGoldActive(s, zapMode, zapGoldAbs)) continue;
      const dir = s.direction;
      if (dir !== "up" && dir !== "down") continue;
      const tk = normalizeTicker(s.ticker);
      if (!tk) continue;
      const metricAbs = getSignalMetricAbs(s, zapMode);
      if (metricAbs == null || metricAbs > Math.max(0, Number(zapGoldAbs ?? 0))) continue;
      const key = `${tk}|${dir}`;
      const nextEntry = {
        ticker: tk,
        direction: dir,
        benchmark: String(s.benchmark ?? "UNKNOWN").toUpperCase(),
        metricAbs,
      };
      const prev = byKey.get(key);
      if (!prev || (nextEntry.metricAbs ?? Number.POSITIVE_INFINITY) < (prev.metricAbs ?? Number.POSITIVE_INFINITY)) {
        byKey.set(key, nextEntry);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const ma = a.metricAbs ?? Number.POSITIVE_INFINITY;
      const mb = b.metricAbs ?? Number.POSITIVE_INFINITY;
      if (ma !== mb) return ma - mb;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [allItems, zapMode, zapGoldAbs]);

  const bestRating = toNum(bestObj?.rating);
  const bestTotalHard = toNum(bestObj?.hard);
  const bestTotalSoft = toNum(bestObj?.soft);
  const bestTotalAny =
    bestTotalHard != null || bestTotalSoft != null
      ? (bestTotalHard ?? 0) + (bestTotalSoft ?? 0)
      : toNum(bestObj?.total);
  const bestTotalEff = type === "hard" ? bestTotalHard : type === "soft" ? bestTotalSoft : bestTotalAny;
  const activeWindowRatings = useMemo(() => getWindowRatings(activeData), [activeData]);


  /**
   * This Sonar's thresholds, shaped as SharedMinMaxPanel expects.
   *
   * Same adapter the OpenDoor Sonar uses: the Sonars keep each bound in its own useState while the
   * Scanners keep them in a ScannerFilterBag, so mapping here lets all four surfaces render ONE
   * panel instead of four copies of 36 MinMaxRow lines. Nothing about this Sonar's state or its
   * persistence moves.
   */
  const sharedMinMaxFilters = useMemo(() => ({
    minAdv20: adv20Min, maxAdv20: adv20Max,
    setMinAdv20: setAdv20Min, setMaxAdv20: setAdv20Max,
    minAdv20NF: adv20NFMin, maxAdv20NF: adv20NFMax,
    setMinAdv20NF: setAdv20NFMin, setMaxAdv20NF: setAdv20NFMax,
    minAdv90: adv90Min, maxAdv90: adv90Max,
    setMinAdv90: setAdv90Min, setMaxAdv90: setAdv90Max,
    minAdv90NF: adv90NFMin, maxAdv90NF: adv90NFMax,
    setMinAdv90NF: setAdv90NFMin, setMaxAdv90NF: setAdv90NFMax,
    minAvPreMhv: avPreMhvMin, maxAvPreMhv: avPreMhvMax,
    setMinAvPreMhv: setAvPreMhvMin, setMaxAvPreMhv: setAvPreMhvMax,
    minRoundLot: roundLotMin, maxRoundLot: roundLotMax,
    setMinRoundLot: setRoundLotMin, setMaxRoundLot: setRoundLotMax,
    minVWAP: vwapMin, maxVWAP: vwapMax,
    setMinVWAP: setVwapMin, setMaxVWAP: setVwapMax,
    minSpread: spreadMin, maxSpread: spreadMax,
    setMinSpread: setSpreadMin, setMaxSpread: setSpreadMax,
    minLstPrcL: lstPrcLMin, maxLstPrcL: lstPrcLMax,
    setMinLstPrcL: setLstPrcLMin, setMaxLstPrcL: setLstPrcLMax,
    minLstCls: lstClsMin, maxLstCls: lstClsMax,
    setMinLstCls: setLstClsMin, setMaxLstCls: setLstClsMax,
    minYCls: yClsMin, maxYCls: yClsMax,
    setMinYCls: setYClsMin, setMaxYCls: setYClsMax,
    minTCls: tClsMin, maxTCls: tClsMax,
    setMinTCls: setTClsMin, setMaxTCls: setTClsMax,
    minClsToClsPct: clsToClsPctMin, maxClsToClsPct: clsToClsPctMax,
    setMinClsToClsPct: setClsToClsPctMin, setMaxClsToClsPct: setClsToClsPctMax,
    minLo: loMin, maxLo: loMax,
    setMinLo: setLoMin, setMaxLo: setLoMax,
    minLstClsNewsCnt: lstClsNewsCntMin, maxLstClsNewsCnt: lstClsNewsCntMax,
    setMinLstClsNewsCnt: setLstClsNewsCntMin, setMaxLstClsNewsCnt: setLstClsNewsCntMax,
    minMarketCapM: marketCapMMin, maxMarketCapM: marketCapMMax,
    setMinMarketCapM: setMarketCapMMin, setMaxMarketCapM: setMarketCapMMax,
    minPreMktVolNF: preMhVolNFMin, maxPreMktVolNF: preMhVolNFMax,
    setMinPreMktVolNF: setPreMhVolNFMin, setMaxPreMktVolNF: setPreMhVolNFMax,
    minVolNFfromLstCls: volNFfromLstClsMin, maxVolNFfromLstCls: volNFfromLstClsMax,
    setMinVolNFfromLstCls: setVolNFfromLstClsMin, setMaxVolNFfromLstCls: setVolNFfromLstClsMax,
    minAvPostMhVol90NF: avPostMhVol90NFMin, maxAvPostMhVol90NF: avPostMhVol90NFMax,
    setMinAvPostMhVol90NF: setAvPostMhVol90NFMin, setMaxAvPostMhVol90NF: setAvPostMhVol90NFMax,
    minAvPreMhVol90NF: avPreMhVol90NFMin, maxAvPreMhVol90NF: avPreMhVol90NFMax,
    setMinAvPreMhVol90NF: setAvPreMhVol90NFMin, setMaxAvPreMhVol90NF: setAvPreMhVol90NFMax,
    minAvPreMhValue20NF: avPreMhValue20NFMin, maxAvPreMhValue20NF: avPreMhValue20NFMax,
    setMinAvPreMhValue20NF: setAvPreMhValue20NFMin, setMaxAvPreMhValue20NF: setAvPreMhValue20NFMax,
    minAvPreMhValue90NF: avPreMhValue90NFMin, maxAvPreMhValue90NF: avPreMhValue90NFMax,
    setMinAvPreMhValue90NF: setAvPreMhValue90NFMin, setMaxAvPreMhValue90NF: setAvPreMhValue90NFMax,
    minAvgDailyValue20: avgDailyValue20Min, maxAvgDailyValue20: avgDailyValue20Max,
    setMinAvgDailyValue20: setAvgDailyValue20Min, setMaxAvgDailyValue20: setAvgDailyValue20Max,
    minAvgDailyValue90: avgDailyValue90Min, maxAvgDailyValue90: avgDailyValue90Max,
    setMinAvgDailyValue90: setAvgDailyValue90Min, setMaxAvgDailyValue90: setAvgDailyValue90Max,
    minVolatility20: volatility20Min, maxVolatility20: volatility20Max,
    setMinVolatility20: setVolatility20Min, setMaxVolatility20: setVolatility20Max,
    minVolatility90: volatility90Min, maxVolatility90: volatility90Max,
    setMinVolatility90: setVolatility90Min, setMaxVolatility90: setVolatility90Max,
    minPreMhMDV20NF: preMhMDV20NFMin, maxPreMhMDV20NF: preMhMDV20NFMax,
    setMinPreMhMDV20NF: setPreMhMDV20NFMin, setMaxPreMhMDV20NF: setPreMhMDV20NFMax,
    minPreMhMDV90NF: preMhMDV90NFMin, maxPreMhMDV90NF: preMhMDV90NFMax,
    setMinPreMhMDV90NF: setPreMhMDV90NFMin, setMaxPreMhMDV90NF: setPreMhMDV90NFMax,
    minVolRel: volRelMin, maxVolRel: volRelMax,
    setMinVolRel: setVolRelMin, setMaxVolRel: setVolRelMax,
    minPreMhBidLstPrcPct: preMhBidLstPrcPctMin, maxPreMhBidLstPrcPct: preMhBidLstPrcPctMax,
    setMinPreMhBidLstPrcPct: setPreMhBidLstPrcPctMin, setMaxPreMhBidLstPrcPct: setPreMhBidLstPrcPctMax,
    minPreMhLoLstPrcPct: preMhLoLstPrcPctMin, maxPreMhLoLstPrcPct: preMhLoLstPrcPctMax,
    setMinPreMhLoLstPrcPct: setPreMhLoLstPrcPctMin, setMaxPreMhLoLstPrcPct: setPreMhLoLstPrcPctMax,
    minPreMhHiLstClsPct: preMhHiLstClsPctMin, maxPreMhHiLstClsPct: preMhHiLstClsPctMax,
    setMinPreMhHiLstClsPct: setPreMhHiLstClsPctMin, setMaxPreMhHiLstClsPct: setPreMhHiLstClsPctMax,
    minPreMhLoLstClsPct: preMhLoLstClsPctMin, maxPreMhLoLstClsPct: preMhLoLstClsPctMax,
    setMinPreMhLoLstClsPct: setPreMhLoLstClsPctMin, setMaxPreMhLoLstClsPct: setPreMhLoLstClsPctMax,
    minLstPrcLstClsPct: lstPrcLstClsPctMin, maxLstPrcLstClsPct: lstPrcLstClsPctMax,
    setMinLstPrcLstClsPct: setLstPrcLstClsPctMin, setMaxLstPrcLstClsPct: setLstPrcLstClsPctMax,
    minImbExch925: imbExch925Min, maxImbExch925: imbExch925Max,
    setMinImbExch925: setImbExch925Min, setMaxImbExch925: setImbExch925Max,
    minImbExch1555: imbExch1555Min, maxImbExch1555: imbExch1555Max,
    setMinImbExch1555: setImbExch1555Min, setMaxImbExch1555: setImbExch1555Max,
    sharedRangeFilterModes: {
      // corr/beta/sigma belong to the shared key union but this panel renders no row for them —
      // the Sonar shows those through FilterRatingRow. "on" is the Scanners' own default.
      corr: "on" as const, beta: "on" as const, sigma: "on" as const,
      adv20: rangeModes.ADV20,
      adv20nf: rangeModes.ADV20NF,
      adv90: rangeModes.ADV90,
      adv90nf: rangeModes.ADV90NF,
      avpremhv: rangeModes.AvPreMhv,
      roundlot: rangeModes.RoundLot,
      vwap: rangeModes.VWAP,
      spread: rangeModes.SpreadBidPct,
      lstprcl: rangeModes.LstPrcL,
      lstcls: rangeModes.LstCls,
      ycls: rangeModes.YCls,
      tcls: rangeModes.TCls,
      clstocls: rangeModes.ClsToClsPct,
      lo: rangeModes.Lo,
      lstclsnewscnt: rangeModes.LstClsNewsCnt,
      marketcapm: rangeModes.MarketCapM,
      premhvolnf: rangeModes.PreMhVolNF,
      volnffromlstcls: rangeModes.VolNFfromLstCls,
      avpostmhvol90nf: rangeModes.AvPostMhVol90NF,
      avpremhvol90nf: rangeModes.AvPreMhVol90NF,
      avpremhvalue20nf: rangeModes.AvPreMhValue20NF,
      avpremhvalue90nf: rangeModes.AvPreMhValue90NF,
      avgdailyvalue20: rangeModes.AvgDailyValue20,
      avgdailyvalue90: rangeModes.AvgDailyValue90,
      volatility20: rangeModes.Volatility20,
      volatility90: rangeModes.Volatility90,
      premhmdv20nf: rangeModes.PreMhMDV20NF,
      premhmdv90nf: rangeModes.PreMhMDV90NF,
      volrel: rangeModes.VolRel,
      premhbidlstprc: rangeModes.PreMhBidLstPrcPct,
      premhlolstprc: rangeModes.PreMhLoLstPrcPct,
      premhhilstcls: rangeModes.PreMhHiLstClsPct,
      premhlolstcls: rangeModes.PreMhLoLstClsPct,
      lstprclstcls: rangeModes.LstPrcLstClsPct,
      imbexch925: rangeModes.ImbExch925,
      imbexch1555: rangeModes.ImbExch1555,
    },
  }), [
    adv20Min, adv20Max, adv20NFMin, adv20NFMax, adv90Min, adv90Max, adv90NFMin, adv90NFMax, avPreMhvMin, avPreMhvMax, roundLotMin, roundLotMax, vwapMin, vwapMax, spreadMin, spreadMax, lstPrcLMin, lstPrcLMax, lstClsMin, lstClsMax, yClsMin, yClsMax, tClsMin, tClsMax, clsToClsPctMin, clsToClsPctMax, loMin, loMax, lstClsNewsCntMin, lstClsNewsCntMax, marketCapMMin, marketCapMMax, preMhVolNFMin, preMhVolNFMax, volNFfromLstClsMin, volNFfromLstClsMax, avPostMhVol90NFMin, avPostMhVol90NFMax, avPreMhVol90NFMin, avPreMhVol90NFMax, avPreMhValue20NFMin, avPreMhValue20NFMax, avPreMhValue90NFMin, avPreMhValue90NFMax, avgDailyValue20Min, avgDailyValue20Max, avgDailyValue90Min, avgDailyValue90Max, volatility20Min, volatility20Max, volatility90Min, volatility90Max, preMhMDV20NFMin, preMhMDV20NFMax, preMhMDV90NFMin, preMhMDV90NFMax, volRelMin, volRelMax, preMhBidLstPrcPctMin, preMhBidLstPrcPctMax, preMhLoLstPrcPctMin, preMhLoLstPrcPctMax, preMhHiLstClsPctMin, preMhHiLstClsPctMax, preMhLoLstClsPctMin, preMhLoLstClsPctMax, lstPrcLstClsPctMin, lstPrcLstClsPctMax, imbExch925Min, imbExch925Max, imbExch1555Min, imbExch1555Max,
    rangeModes,
  ]);

  return (
      <div className={`sonar-borderless relative min-h-screen w-full text-zinc-200 font-sans ${accentSelectionClass} selection:text-white p-4 overflow-x-hidden ${isLightTheme ? "sonar-light-theme" : ""}`}>

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* ========================= HEADER ========================= */}
        {/* Shared with both Scanners — see components/scanner/shell/panels/ScannerHeader. */}
        <ScannerHeader
          scannerShellTitle="PAIRFLUX SONAR"
          headerNavGroupClass={secondaryGroupClass}
          headerNavInactiveClass={secondaryButtonInactiveClass}
          navStreamHref={SONAR_NAV.stream}
          navScannerHref={SONAR_NAV.scanner}
          navSonarHref={SONAR_NAV.sonar}
          navScoutHref={SONAR_NAV.scout}
          primaryPanel="sonar"
          listMode={listMode}
          ignCount={ignoreSet.size}
          appCount={applySet.size}
          pinCount={Object.keys(pinMap).length}
          showIgnore={showIgnore}
          showApply={showApply}
          showPin={showPin}
          setShowIgnore={setShowIgnore}
          setShowApply={setShowApply}
          setShowPin={setShowPin}
          // The Sonar has no advanced panel to reveal; the Scanner opens one alongside the drawers.
          setShowAdvanced={() => {}}
          setModeIgnore={setModeIgnore}
          setModeApply={setModeApply}
          setModePin={setModePin}
          canRun={!loading}
          run={() => setStreamReconnectVersion((v) => v + 1)}
          busy={loading}
          variantString="Reconnect stream"
        />

        {showPresets && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
            <PresetPicker
              kind={SHARED_FILTER_PRESET_API_KIND}
              scope="BOTH"
              sharedFilterOnly
              getCurrentConfigJson={buildSonarSharedFilterPresetJson}
              onApplyPresetJson={(_, preset) => {
                try {
                  applySonarPreset(preset);
                } catch {
                  // ignore storage/reload errors
                }
              }}
            />
          </div>
        )}

        {/* Rating row — shared with the other Sonar and both Scanners.
            See components/shared/filters/FilterRatingRow. */}
        <FilterRatingRow
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          stripClass={sonarActiveFilterStripClass}
          stripButtonBaseClass={sonarActiveFilterButtonBaseClass}
          stripButtonActiveClass={sonarActiveFilterButtonActiveClass}
          stripButtonInactiveClass={sonarActiveFilterButtonInactiveClass}
          renderActiveIcon={renderSonarActiveFilterIcon}
          modeSlot={
            <>

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
                            : secondaryButtonSoftActiveClass
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
                            ? "accent-fill"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                {(["SESSION", "BIN", "BINS"] as RatingMode[]).map((modeKey) => (
                  <button
                    key={modeKey}
                    type="button"
                    onClick={() => setRatingMode(modeKey)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                      ratingMode === modeKey
                        ? secondaryButtonSoftActiveClass
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {modeKey}
                  </button>
                ))}
              </div>
            </>
          }
          steppers={fields}
          ranges={[
            { label: "ρ", title: "Correlation — на 5-барних дохідностях, для цього класу", minValue: corrMin, maxValue: corrMax, setMin: setCorrMin, setMax: setCorrMax, step: 0.05 },
            { label: "β", title: "Beta — хедж-коефіцієнт пари для цього класу", minValue: betaMin, maxValue: betaMax, setMin: setBetaMin, setMax: setBetaMax, step: 0.1 },
            { label: "σ", title: "Sigma — найбільше відхилення, з якого пара ще повертається, pp", minValue: sigmaMin, maxValue: sigmaMax, setMin: setSigmaMin, setMax: setSigmaMax, step: 0.1 },
            { label: "α", title: "Alpha — медіанний пік зведених епізодів, pp", minValue: alphaMin, maxValue: alphaMax, setMin: setAlphaMin, setMax: setAlphaMax, step: 0.1 },
          ]}
        />

        {/* ========================= CONTROLS ========================= */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          {/* PairFlux classes stand where Arbitrage's session bands used to: this page rates
              pairs per PRE / OPEN / INTRA, and the eight Arbitrage bands mean nothing to it.
              The underlying `cls` state stays at its "global" default — the widest setting the
              signals request can carry — so nothing below is silently narrowed by a band the user
              can no longer see. */}
          <div className="flex h-7 items-center gap-2">
            {(["intra", "pre", "open"] as PairFluxClass[]).map((c) => (
              <FilterButton
                key={c}
                active={pfCls === c}
                label={c.toUpperCase()}
                onClick={() => setPfCls(c)}
              />
            ))}
          </div>

          <div className="h-7 w-px self-center bg-white/5" />

          <div className="flex h-7 items-center gap-2">
            {(["all", "top"] as const).map((m) => (
              <FilterButton key={m} active={mode === m} label={m.toUpperCase()} onClick={() => setMode(m)} />
            ))}
          </div>

          <div className="h-7 w-px self-center bg-white/5" />

          <div className="flex h-7 items-center gap-2">
            {(["any", "hard", "soft"] as ArbType[]).map((t) => (
              <FilterButton key={t} active={type === t} label={t} onClick={() => setType(t)} />
            ))}
          </div>

          <div className="flex-1" />

          {/* RIGHT GROUP */}
          <div className="flex gap-2 items-center">

            <div className="flex h-7 items-center gap-2 pl-3 pr-2 rounded-lg bg-black/20">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">PRESET</span>
              {sonarPresetSaveMode ? (
                <input
                  type="text"
                  value={sonarPresetDraftName}
                  onChange={(e) => setSonarPresetDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!sonarPresetBusy) void saveCurrentSonarPreset(sonarPresetDraftName);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setSonarPresetSaveMode(false);
                      setSonarPresetDraftName("");
                    }
                  }}
                  autoFocus
                  placeholder="NAME..."
                  className="h-7 min-w-[112px] bg-transparent border-0 text-[10px] font-mono uppercase text-zinc-300 placeholder:text-zinc-600 outline-none focus:outline-none"
                />
              ) : (
                <GlassSelect
                  value={sonarPresetId}
                  onChange={async (e) => {
                    const nextId = e.target.value;
                    setSonarPresetId(nextId);
                    if (!nextId) {
                      clearSonarSharedFilters();
                      return;
                    }
                    if (sonarPresetBusy || sonarPresetSaveMode) return;
                    setSonarPresetBusy(true);
                    setSonarPresetStatus("");
                    try {
                      const preset = getSharedFilterLocalPreset(nextId);
                      if (preset) {
                        const result = applySonarPreset(preset);
                        if (result.ok) {
                          setSonarPresetStatus(`Applied ${result.applied}`);
                          return;
                        }
                        setSonarPresetStatus(`ERR ${result.error || "apply"}`);
                      }
                      const fallbackPreset = sonarPresets.find((x) => x.id === nextId);
                      if (fallbackPreset) {
                        const result = applySonarPreset(fallbackPreset);
                        if (result.ok) {
                          setSonarPresetStatus(`Applied ${result.applied}`);
                          return;
                        }
                        setSonarPresetStatus(`ERR ${result.error || "apply"}`);
                        return;
                      }
                      setSonarPresetStatus("Apply failed");
                    } catch {
                      setSonarPresetStatus("Apply failed");
                    } finally {
                      setSonarPresetBusy(false);
                    }
                  }}
                  options={[
                    { value: "", label: "NONE" },
                    ...sonarPresets.map((preset) => ({
                      value: preset.id,
                      label: preset.name.toUpperCase(),
                    })),
                  ]}
                  compact
                  panelOffsetX={-42}
                  panelWidth={124}
                  className="w-[92px] !h-[14px] !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (sonarPresetSaveMode) {
                    if (!sonarPresetBusy) void saveCurrentSonarPreset(sonarPresetDraftName);
                    return;
                  }
                  setSonarPresetSaveMode(true);
                  setSonarPresetDraftName("");
                }}
                disabled={sonarPresetBusy}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  sonarPresetBusy
                    ? "border-transparent text-zinc-600"
                    : sonarPresetSaveMode
                      ? accentButtonClass
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sonarPresetId || sonarPresetBusy || sonarPresetSaveMode) return;
                  const ok = deleteSharedFilterLocalPreset(sonarPresetId);
                  if (!ok) {
                    setSonarPresetStatus("Delete failed");
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
                  setSonarPresets(items);
                  setSonarPresetId("");
                  setSonarPresetStatus("Deleted");
                }}
                disabled={!sonarPresetId || sonarPresetBusy || sonarPresetSaveMode}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  sonarPresetId && !sonarPresetBusy && !sonarPresetSaveMode
                    ? "border-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    : "border-transparent text-zinc-600"
                )}
              >
                DEL
              </button>
            </div>

            {/* COLLAPSE BUTTON - MUST BE LAST (after OFFSET) */}
              <button
                type="button"
                onClick={() => setShowSharedMinMax((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
                title={showSharedMinMax ? "Hide shared filters" : "Show shared filters"}
              >
                {!showSharedMinMax ? (
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
                    className="group-hover:text-rose-400 transition-colors"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                )}
              </button>

        </div>
        </div>

        {/* ========================= THRESHOLDS GRID ========================= */}
        {showSharedMinMax && (
          <SharedMinMaxPanel
            filters={sharedMinMaxFilters}
            zeroCoverageFilterKeys={new Set()}
            toggleSharedRangeFilterMode={toggleRangeMode as any}
            onStartEditing={startEditing}
            onStopEditing={stopEditing}
          />
        )}


        {/* ========================= BOOLEAN & MULTI-SELECT FILTERS ========================= */}
        {/* Shared with OpenDoor Sonar, both Scanners and Stream — see components/shared/filters.
            The ZAP group stays here as a slot: it is an Arbitrage statistic and OpenDoor has no
            equivalent. */}
        <FilterFlagsRow
          exclusions={[
            { label: "ITB", value: excludeItb, set: setExcludeItb, title: "B5ETB = ITB" },
            { label: "HARD", value: excludeHard, set: setExcludeHard, title: "B5ETB = NO (hard to borrow)" },
            { label: "Div", value: excludeDividend, set: setExcludeDividend },
            { label: "News", value: excludeNews, set: setExcludeNews },
            { label: "PTP", value: excludePTP, set: setExcludePTP },
            { label: "SSR", value: excludeSSR, set: setExcludeSSR },
            { label: "ETF", value: excludeETF, set: setExcludeETF },
            { label: "CRAP", value: excludeCrap, set: setExcludeCrap, title: "LstClose < 5" },
          ]}
          report={{ label: "REP", value: excludeReport, set: setExcludeReport, title: "Exclude report=true" }}
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
                label="Country"
                options={allCountries}
                selected={selCountries}
                setSelected={setSelCountries}
                enabled={countryEnabled}
                toggleEnabled={() => setCountryEnabled(m => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                color="amber"
              />
              <MultiSelectFilter
                label="Exchange"
                options={allExchanges}
                selected={selExchanges}
                setSelected={setSelExchanges}
                enabled={exchangeEnabled}
                toggleEnabled={() => setExchangeEnabled(m => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                color="amber"
              />
              <MultiSelectFilter
                label="Sector"
                options={allSectors}
                selected={selSectors}
                setSelected={setSelSectors}
                enabled={sectorEnabled}
                toggleEnabled={() => setSectorEnabled(m => m === "off" ? "include" : m === "include" ? "exclude" : "off")}
                color="amber"
              />
            </>
          }
          sortSlot={
            <SingleSelectFilter
              value={sortKey}
              onChange={(v) => {
                const k = v as SortKey;
                setSortKey(k);
                if (k === "pin") setSortDir("desc");
              }}
              onMainClick={() => {
                if (sortKey === "pin") return;
                setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              }}
              color="cyan"
              options={[
                { value: "alpha", label: "ABC" },
                { value: "sigma", label: "SIG" },
                { value: "zapAbs", label: "|ZAP|" },
                { value: "sigZapAbs", label: "|SIGZAP|" },
                { value: "rate", label: "RATE" },
                { value: "posBpAbs", label: "BP" },
                { value: "beta", label: "BETA" },
                { value: "pin", label: "PIN" },
              ]}
            />
          }
          zapSlot={
            <>
            {/* PAIR DIVERGENCE — this slot used to hold Arbitrage's ZAP filters, which score a
                stock against its benchmark and mean nothing for a pair. The buttons now pick the
                UNIT a pair's live deviation is read in, and the three inputs are its min, max and
                exit level in that unit. `zapMode` itself is forced off below, so the Arbitrage
                metric no longer silently filters the signal set this page feeds to the panel. */}
            <div className={`ml-auto ${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.zap.group}`}>
              {([
                { key: "pct", label: "% DEV", title: "Розходження в процентних пунктах" },
                { key: "sigma", label: "\u03c3 DEV", title: "dev / sigma — пари без сігми не проходять" },
                { key: "alpha", label: "\u03b1 DEV", title: "dev / alpha — пари без альфи не проходять" },
                { key: "gamma", label: "\u03b3 DEV", title: "dev / gamma — рівень, з якого вхід окупається з довірою. 1.00 = рівно він. Пари без гамми не проходять, а це 99.6% INTRA" },
              ] as const).map((z) => (
                <button
                  key={z.key}
                  type="button"
                  title={z.title}
                  onClick={() => setPfZapMode(z.key)}
                  className={[
                    SONAR_FILTER_INNER_PILL,
                    pfZapMode === z.key ? FILTER_GROUP_TONES.zap.on : FILTER_GROUP_TONES.zap.off,
                  ].join(" ")}
                >
                  <span className="leading-none" style={{ textTransform: "none" }}>{z.label}</span>
                </button>
              ))}

              {([
                { v: pfZapMin, set: setPfZapMin, ph: "min", t: "Нижній поріг у поточній одиниці" },
                { v: pfZapMax, set: setPfZapMax, ph: "max", t: "Верхній поріг. Порожньо = без обмеження" },
                { v: pfZapExit, set: setPfZapExit, ph: "exit", t: "Рівень виходу. Картка показує, скільки pp це дає" },
              ] as const).map((f, i) => (
                <div key={i} className="group relative w-[78px]">
                  <input
                    value={f.v}
                    title={f.t}
                    placeholder={f.ph}
                    inputMode="decimal"
                    onChange={(e) => f.set(e.target.value)}
                    className="center-spin h-7 w-full rounded-md border-0 bg-black/20 !pl-2 !pr-5 text-center font-mono text-[11px] tabular-nums text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:bg-black/30 active:scale-[0.99]"
                  />
                  <div className="pointer-events-none absolute right-[1px] top-[1px] bottom-[1px] flex w-4 flex-col overflow-hidden rounded-r-[5px] border-l border-white/10 bg-transparent opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => f.set(pfBump(f.v, 1))}
                      className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 transition-colors hover:text-zinc-300"
                      aria-label="Збільшити"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => f.set(pfBump(f.v, -1))}
                      className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 transition-colors hover:text-zinc-300"
                      aria-label="Зменшити"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>
          }
        />
        {/* ========================= DRAWERS (Ignore/Apply) ========================= */}
        {(showIgnore || showApply || showPin) && (
          <div className="grid grid-cols-7 gap-4">
            {showIgnore && (
              <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4 col-span-7 lg:col-span-3">
                <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                  <span className="text-sm font-bold text-rose-400 tracking-tight">IGNORE LIST</span>
                  <span className="text-[10px] font-mono text-zinc-500">Removed client-side when LIST MODE = IGNORE</span>
                </div>
                <textarea
                  value={ignoreDraft}
                  onChange={(e) => setIgnoreDraft(e.target.value)}
                  placeholder="TSLA, NVDA..."
                  className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-rose-500/30 resize-none"
                />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={onAddIgnore} className="px-4 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30">
                    ADD
                  </button>
                  <button onClick={() => setIgnoreDraft("")} className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white">
                    CLEAR
                  </button>
                  <button
                    onClick={() => ignoreFileInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs hover:bg-violet-500/20"
                  >
                    IMPORT CSV
                  </button>
                  {ignoreSet.size > 0 && (
                    <button onClick={() => clearSet(setIgnoreSet, IGNORE_LS_KEY)} className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40">
                      RESET
                    </button>
                  )}
                  <input ref={ignoreFileInputRef} type="file" accept=".csv" onChange={onIgnoreFileSelected} className="hidden" />
                </div>

                {ignoreList.length > 0 && (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {ignoreList.map((tk) => (
                      <button
                        key={tk}
                        onClick={() => removeFromSet(setIgnoreSet, IGNORE_LS_KEY, tk)}
                        className="px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
                      >
                        {tk} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showApply && (
              <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4 col-span-7 lg:col-span-4">
                <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                  <span className="text-sm font-bold tracking-tight text-[#6ee7b7]">APPLY ONLY LIST</span>
                  <span className="text-[10px] font-mono text-zinc-500">Show only these when LIST MODE = APPLY</span>
                </div>
                <textarea
                  value={applyDraft}
                  onChange={(e) => setApplyDraft(e.target.value)}
                  placeholder="AAPL, MSFT..."
                  className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:outline-none resize-none"
                />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={onAddApply} className="px-4 py-1.5 rounded-lg border border-[#6ee7b7]/30 bg-[#6ee7b7]/10 text-[#6ee7b7] text-xs font-bold hover:bg-[#6ee7b7]/15 transition-colors">
                    ADD
                  </button>
                  <button onClick={() => setApplyDraft("")} className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white">
                    CLEAR
                  </button>
                  <button
                    onClick={() => applyFileInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs hover:bg-violet-500/20"
                  >
                    IMPORT CSV
                  </button>
                  {applySet.size > 0 && (
                    <button onClick={() => clearSet(setApplySet, APPLY_LS_KEY)} className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40">
                      RESET
                    </button>
                  )}
                  <input ref={applyFileInputRef} type="file" accept=".csv" onChange={onApplyFileSelected} className="hidden" />
                </div>

                {applyList.length > 0 && (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {applyList.map((tk) => (
                      <button
                        key={tk}
                        onClick={() => removeFromSet(setApplySet, APPLY_LS_KEY, tk)}
                        className="px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
                      >
                        {tk} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showPin && (
                <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4 col-span-7 lg:col-span-4">
                <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                  <span className={`text-sm font-bold tracking-tight ${accentTextClass}`}>PIN LIST</span>
                  <span className="text-[10px] font-mono text-zinc-500">Show only these when LIST MODE = PIN</span>
                </div>

                <textarea
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                  placeholder="AAPL, MSFT..."
                  className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:outline-none resize-none"
                />

                <div className="flex items-center gap-2 flex-wrap">
                  {/* color picker */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">color</span>
                    {(["orange","lavender","cyan"] as PinColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPinColor(c)}
                        className={[
                          "w-6 h-6 rounded-full border",
                          pinColor === c ? "border-white/40" : "border-white/10 opacity-70 hover:opacity-100",
                          PIN_DOT_CLASS[c],
                        ].join(" ")}
                        title={c}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => { addPins(parseTickersFromFreeText(pinDraft), pinColor); setPinDraft(""); setShowPin(true); if (listMode === "off") setListMode("pin"); }}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-bold ${accentButtonClass}`}
                  >
                    ADD
                  </button>

                  <button
                    onClick={() => setPinDraft("")}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white"
                  >
                    CLEAR
                  </button>

                  {Object.keys(pinMap).length > 0 && (
                    <button
                      onClick={clearPins}
                      className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40"
                    >
                      RESET
                    </button>
                  )}
                </div>

                {Object.keys(pinMap).length > 0 && (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.entries(pinMap)
                      .sort(([a],[b]) => a.localeCompare(b))
                      .map(([tk, c]) => (
                        <button
                          key={tk}
                          onClick={() => removePin(tk)}
                          className="px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:border-rose-500/40 hover:text-rose-300 transition-colors flex items-center gap-2"
                          title="Remove pin"
                        >
                          <span className={`w-2 h-2 rounded-full ${PIN_DOT_CLASS[c]}`} />
                          {tk} ×
                        </button>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* ========================= ACTIVE PANEL ========================= */}
        {/* The strip itself is shared with OpenDoor Sonar, the Scanners and Stream — see
            components/shared/filters/ActiveTickerCard. Only the expanded body below stays local:
            it is the live-snapshot grid, which no other surface has. */}
        {activePanelVisible && (
          <ActiveTickerCard
            ticker={activeTicker ?? null}
            stats={buildActiveTickerStats(activeData, type)}
            loading={activeLoading}
            error={activeErr}
            accentLineClass={accentLineClass}
            accentTextClass={accentTextClass}
            lists={{
              inIgnore: activeInIgnoreList,
              inApply: activeInApplyList,
              pinned: Boolean(activePinColor),
              onToggleIgnore: () => {
                if (!activeTickerNorm) return;
                if (activeInIgnoreList) removeFromSet(setIgnoreSet, IGNORE_LS_KEY, activeTickerNorm);
                else {
                  addToSet(setIgnoreSet, IGNORE_LS_KEY, [activeTickerNorm]);
                  if (listMode === "off") setListMode("ignore");
                }
              },
              onToggleApply: () => {
                if (!activeTickerNorm) return;
                if (activeInApplyList) removeFromSet(setApplySet, APPLY_LS_KEY, activeTickerNorm);
                else {
                  addToSet(setApplySet, APPLY_LS_KEY, [activeTickerNorm]);
                  if (listMode === "off") setListMode("apply");
                }
              },
              onTogglePin: () => {
                if (!activeTickerNorm) return;
                if (activePinColor) removePin(activeTickerNorm);
                else {
                  addPins([activeTickerNorm], pinColor);
                  if (listMode === "off") setListMode("pin");
                }
              },
            }}
            expanded={{ value: activePanelMode !== "mini", onToggle: () => setActivePanelMode((m) => (m === "mini" ? "expanded" : "mini")) }}
            collapsed={{ value: activePanelCollapsed, onToggle: () => setActivePanelCollapsed(!activePanelCollapsed) }}
          >
            {!activePanelCollapsed && (
              <div className="relative p-4 space-y-4">
                {(() => {
                  const isUsableLive = (v: any) => {
                    if (v == null) return false;
                    if (typeof v === "string") { const t = v.trim(); return t.length > 0 && t !== "-" && t !== "—"; }
                    return true;
                  };
                  const liveSnapFiltered = liveSnap
                    ? Object.fromEntries(Object.entries(liveSnap).filter(([, v]) => isUsableLive(v)))
                    : null;
                  const s = activeData
                    ? (liveSnapFiltered && Object.keys(liveSnapFiltered).length > 0
                        ? { ...activeData, ...liveSnapFiltered }
                        : activeData)
                    : null;
                  const bid = s ? toNum((s as any).Bid ?? (s as any).bid ?? getMeta(s)?.Bid ?? getMeta(s)?.bid) : null;
                  const ask = s ? toNum((s as any).Ask ?? (s as any).ask ?? getMeta(s)?.Ask ?? getMeta(s)?.ask) : null;


                  const bidDelta = s
                    ? toNum((s as any)["BidLstClsΔ%"] ?? (s as any).BidLstClsDeltaPct ?? (s as any)["BidLstClsDelta%"])
                    : null;
                  const askDelta = s
                    ? toNum((s as any)["AskLstClsΔ%"] ?? (s as any).AskLstClsDeltaPct ?? (s as any)["AskLstClsDelta%"])
                    : null;

                  const renderCell = (label: string, value: React.ReactNode, colorClass = "text-zinc-200") => (
                    <div className="border border-white/0 rounded-xl bg-black/40 px-3 py-2">
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-mono">{label}</span>
                      <span className={`mt-1 block text-[12px] font-mono tabular-nums truncate ${colorClass}`}>{value ?? "-"}</span>
                    </div>
                  );

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                        {renderCell("Company", s ? getCompany(s) : "-")}
                        {renderCell("PreMhHiLstPrc%", s ? fmtPct(numPreMhBidLstPrcPct(s), 2) : "-")}
                        {renderCell("AvPreMhv", s ? fmtMaybeInt(numAvPreMh(s)) : "-")}
                        {renderCell("ADV20", s ? fmtMaybeInt(numADV20(s)) : "-")}
                        {renderCell("ADV90", s ? fmtMaybeInt(numADV90(s)) : "-")}
                        {renderCell("RoundLot", s ? (numRoundLot(s) == null ? "-" : fmtMaybeInt(numRoundLot(s))) : "-")}
                        {renderCell("VolRel", s ? fmtNum(numVolRel(s), 2) : "-")}
                        {renderCell("BidLstClsDelta%", s ? fmtPct(bidDelta, 2) : "-", s && bidDelta != null ? (bidDelta >= 0 ? accentTextClass : "text-rose-400") : "text-zinc-500")}
                        {renderCell("Bid", s && bid != null ? fmtNum(bid, 2) : "-", s ? "text-emerald-400" : "text-zinc-500")}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                        {renderCell("SectorL3", s ? (getSector(s) !== "-" ? getSector(s) : activeSector2) : "-")}
                        {renderCell("PreMhVolNF", s ? fmtMaybeInt(numPreMktVolNF(s)) : "-")}
                        {renderCell("SpreadBid%", s ? (numSpreadBidPct(s) == null ? "-" : fmtNum(numSpreadBidPct(s)!, 4)) : "-")}
                        {renderCell("ADV20NF", s ? fmtMaybeInt(numADV20NF(s)) : "-")}
                        {renderCell("ADV90NF", s ? fmtMaybeInt(numADV90NF(s)) : "-")}
                        {renderCell("AskLstClsDelta%", s ? fmtPct(askDelta, 2) : "-", s && askDelta != null ? (askDelta >= 0 ? accentTextClass : "text-rose-400") : "text-zinc-500")}
                        {renderCell("Ask", s && ask != null ? fmtNum(ask, 2) : "-", s ? "text-rose-300" : "text-zinc-500")}
                        {renderCell("LstCls", s ? (numLastClose(s) == null ? "-" : fmtNum(numLastClose(s)!, 2)) : "-")}
                        {renderCell("VWAP", s ? (numVWAP(s) == null ? "-" : fmtNum(numVWAP(s)!, 2)) : "-")}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                        {renderCell("Country", s ? getCountry(s) : "-")}
                        {renderCell("AvPreMhVol90NF", s ? fmtMaybeInt(numAvPreMhVol90NF(s)) : "-")}
                        {renderCell("AvPreMhValue20NF", s ? fmtMaybeInt(numAvPreMhValue20NF(s)) : "-")}
                        {renderCell("AvPreMhValue90NF", s ? fmtMaybeInt(numAvPreMhValue90NF(s)) : "-")}
                        {renderCell("AvgDailyValue20", s ? fmtMaybeInt(numAvgDailyValue20(s)) : "-")}
                        {renderCell("AvgDailyValue90", s ? fmtMaybeInt(numAvgDailyValue90(s)) : "-")}
                        {renderCell("Volatility20", s ? fmtPct(numVolatility20(s), 2) : "-")}
                        {renderCell("Volatility90", s ? fmtPct(numVolatility90(s), 2) : "-")}
                        {renderCell("LstPrcLstCls%", s ? fmtPct(numLstPrcLstClsPctSafe(s), 2) : "-")}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                        {renderCell("MarketCapM", s ? fmtMaybeInt(numMarketCapM(s) ?? activeMarketCapM2) : "-", s ? "text-emerald-400" : "text-zinc-500")}
                        {renderCell("PreMhLoLstPrc%", s ? fmtPct(numPreMhLoLstPrcPct(s), 2) : "-")}
                        {renderCell("PreMhHiLstCls%", s ? fmtPct(numPreMhHiLstClsPct(s), 2) : "-")}
                        {renderCell("PreMhLoLstCls%", s ? fmtPct(numPreMhLoLstClsPct(s), 2) : "-")}
                        {renderCell("ImbExch9:25", s ? fmtMaybeInt(numImbExch925(s)) : "-")}
                        {renderCell("ImbExch15:55", s ? fmtMaybeInt(numImbExch1555(s)) : "-")}
                        {renderCell("AvPostMhVol90NF", s ? fmtMaybeInt(numAvPostMhVol90NF(s)) : "-")}
                        {renderCell("PreMhMDV20NF", s ? fmtMaybeInt(numPreMhMDV20NF(s)) : "-")}
                        {renderCell("PreMhMDV90NF", s ? fmtMaybeInt(numPreMhMDV90NF(s)) : "-")}
                      </div>
                    </div>
                  );
                })()}

                {/* expanded (залишаєш свій existing expanded JSX як є) */}
                {activePanelMode === "expanded" && (
                  <div className="space-y-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">

                    {/* встав свій expanded-блок сюди */}
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-transparent">
                      <div className="px-3 py-2 border-b border-white/10 flex justify-between items-center">
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.14em]">Ratings</span>
                        <span className="text-[10px] font-mono text-zinc-600">best object</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/10">
                        {[
                          { k: "Rate", v: bestRating == null ? "-" : `${Math.round(bestRating * 100)}%`, c: accentTextClass },
                          { k: "Total Any", v: fmtMaybeInt(bestTotalAny) },
                          { k: "Total Hard", v: fmtMaybeInt(bestTotalHard) },
                          { k: "Total Soft", v: fmtMaybeInt(bestTotalSoft) },
                          { k: "Beta", v: activeBeta == null ? "-" : fmtNum(activeBeta, 2) },
                          { k: "Sigma", v: activeSigma == null ? "-" : fmtNum(activeSigma, 2) },
                          { k: "MD Print Pos", v: activeMdPrintPos == null ? "-" : fmtNum(activeMdPrintPos, 2) },
                          { k: "MD Print Neg", v: activeMdPrintNeg == null ? "-" : fmtNum(activeMdPrintNeg, 2) },
                        ].map((item) => (
                                  <div key={item.k} className="flex flex-col gap-1 bg-black/40 px-3 py-2">
                            <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.12em]">{item.k}</span>
                            <span className={`text-[12px] font-mono tabular-nums ${item.c ?? "text-zinc-200"}`}>{item.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {activeWindowRatings.length > 0 && (
                      <div className="overflow-hidden border border-white/10 rounded-xl bg-transparent">
                        <div className="px-3 py-2 border-b border-white/10 flex justify-between items-center">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.14em]">Window Ratings</span>
                          <span className="text-[10px] font-mono text-zinc-600">{activeWindowRatings.length} windows</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-white/10">
                          {activeWindowRatings.map((row) => (
                            <div key={row.windowKey} className="bg-black/40 px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.14em]">
                                  {WINDOW_RATING_LABELS[row.windowKey.toLowerCase()] ?? row.windowKey.toUpperCase()}
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {[
                                  { label: "ANY", cell: row.any, accent: accentTextClass },
                                  { label: "HARD", cell: row.hard, accent: "text-zinc-200" },
                                  { label: "SOFT", cell: row.soft, accent: "text-zinc-200" },
                                ].map((item) => (
                                  <div key={item.label} className="border border-white/10 px-2 py-1.5">
                                    <span className="block text-[10px] text-zinc-600 font-mono uppercase">{item.label}</span>
                                    <span className={`mt-1 block text-[12px] font-mono tabular-nums ${item.accent}`}>
                                      {item.cell.rate == null ? "-" : `${Math.round(item.cell.rate * 100)}%`}
                                    </span>
                                    <span className="block text-[10px] text-zinc-500 font-mono">
                                      N {item.cell.total == null ? "-" : fmtMaybeInt(item.cell.total)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="overflow-hidden border border-white/10 rounded-xl bg-transparent">
                      <div className="px-3 py-2 border-b border-white/10 flex justify-between items-center">
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.14em]">Pricing & Liquidity</span>
                        <span className="text-[10px] font-mono text-zinc-600">parsed from root/meta</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-px bg-white/10">
                        {[
                          { k: "YCls", v: activeData ? (numYCls(activeData) == null ? "-" : fmtNum(numYCls(activeData)!, 2)) : "-" },
                          { k: "TCls", v: activeData ? (numTCls(activeData) == null ? "-" : fmtNum(numTCls(activeData)!, 2)) : "-" },
                          { k: "ClsToCls%", v: activeData ? fmtPct(numClsToClsPct(activeData), 2) : "-" },
                          { k: "Lo", v: activeData ? (numLo(activeData) == null ? "-" : fmtNum(numLo(activeData)!, 2)) : "-" },
                          {
                            k: "LstClsNewsCnt",
                            v: activeData ? (numLstClsNewsCnt(activeData) == null ? "-" : fmtMaybeInt(numLstClsNewsCnt(activeData))) : "-",
                          },
                        ].map((item) => (
                          <div key={item.k} className="flex flex-col gap-1 bg-black/40 px-3 py-2">
                            <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.12em]">{item.k}</span>
                            <span className="text-[12px] text-zinc-200 font-mono tabular-nums">{item.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                                        {/* Flags */}
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-transparent">
                      <div className="px-3 py-2 border-b border-white/10">
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.14em]">Flags</span>
                      </div>
                      <div className="p-3 flex gap-2 flex-wrap">
                        {[
                          { l: "PTP", v: (activeData as any)?._isPTP },
                          { l: "SSR", v: (activeData as any)?._isSSR },
                          { l: "ACTIVE", v: isActiveByPositionBp(activeData) },
                          { l: "ETF", v: boolIsETF(activeData) },
                          { l: "DIV", v: hasValue(pickAny(activeData, ["dividend", "Dividend", "hasDividend", "HasDividend"])) },
                          { l: "REPORT", v: hasValue(pickAny(activeData, ["report", "Report"])) },
                        ].map((f) => (
                          <span
                            key={f.l}
                            className={`px-2.5 py-1 border text-[10px] font-mono font-bold uppercase tracking-[0.12em] ${
                              f.v
                                ? accentChipClass
                                : "bg-black/30 border-white/10 text-zinc-600"
                            }`}
                          >
                            {f.l}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ActiveTickerCard>
        )}

        {activePanelVisible && (
          <div
            className={[
              "rounded-2xl bg-black/40 px-4 py-3",
              activeGoldTickers.length > 0
                ? "border border-amber-500/20 bg-amber-500/[0.03]"
                : "accent-panel-soft",
            ].join(" ")}
          >
            {activeGoldTickers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeGoldTickers.map((entry) => {
                  const isCurrent = activeTickerNorm === entry.ticker;
                  return (
                    <button
                      key={`${entry.ticker}|${entry.direction}`}
                      type="button"
                      onClick={() => setActiveTicker(entry.ticker)}
                    className={[
                      "group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left font-mono transition-all duration-200",
                      "border-amber-500/35 bg-amber-500/12 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.16)]",
                      "animate-pulse hover:bg-white/[0.08]",
                      isCurrent ? "ring-1 ring-white/30" : "",
                    ].join(" ")}
                      title="Set as active ticker"
                    >
                      <span className="text-[12px] font-semibold tracking-[0.08em]">{entry.ticker}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="h-5" />
            )}
          </div>
        )}

        {/* ========================= MESSAGES & GRID ========================= */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-sm text-center">
            ERROR: {error}
          </div>
        )}

        {!error && !hasAny && (
          <div className="rounded-xl border border-white/5 bg-white/[0.01] p-8 text-center font-mono">
            {loading ? (
              <div className="text-sm tracking-widest text-zinc-500">SCANNING MARKETS...</div>
            ) : filteredOutByClientFilters ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-sm tracking-widest text-amber-200">RAW SIGNALS FOUND, BUT FILTERED OUT</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    raw {rawSignalCount} | visible 0 | filtered {filteredOutSignalCount}
                  </div>
                </div>
                <div className="mx-auto max-w-3xl text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  Current class/type/mode still return data from the bridge, so the active SONAR UI filters or saved preset are hiding all rows.
                </div>
                {activeEmptyStateHints.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {activeEmptyStateHints.map((hint) => (
                      <span
                        key={hint}
                        className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-200"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={resetSonarUiState}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-rose-200 transition-colors hover:bg-rose-500/[0.14]"
                  >
                    Reset Saved Sonar State
                  </button>
                </div>
              </div>
            ) : bridgeReturnedNoSignals ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-sm tracking-widest text-zinc-400">BRIDGE RETURNED 0 SIGNALS FOR CURRENT QUERY</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    cls {classLabel} | mode {modeLabel} | type {typeLabel} | minRate {minRate} | minTotal {minTotal}
                  </div>
                </div>
                {activeEmptyStateHints.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {activeEmptyStateHints.map((hint) => (
                      <span
                        key={hint}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mx-auto max-w-3xl text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  Try relaxing query filters first, especially ρ/β/σ and country toggles, then refresh.
                </div>
              </div>
            ) : (
              <div className="text-sm tracking-widest text-zinc-500">NO SIGNALS DETECTED</div>
            )}
          </div>
        )}

        {/* PairFlux replaces the Arbitrage bucket grid on this page. Same benchmark columns, same
            beta bands, same card markup — but each row is a PAIR: the leg that ran ahead on the left
            (sold at its bid), the one that lagged on the right (bought at its ask), and the shared
            spread statistics between them. ArbitrageSonar still renders the original grid.

            Rendered OUTSIDE the hasAny gate on purpose: hasAny is computed from the ARBITRAGE
            bucketing, so gating on it would blank the pair panel whenever Arbitrage's own filters
            emptied their buckets — two unrelated strategies sharing one visibility flag. The panel
            carries its own empty states. */}
        {/* `items`, NOT `allItems`: the toolbar's min/max filters are already applied to it, and
            because a pair needs BOTH legs present to be priced, feeding the filtered set is exactly
            what makes every filter apply to BOTH tickers of the pair. Passing the raw list would
            silently ignore the whole toolbar. */}
        {!error && (
          <PairFluxDivergence
            cls={pfCls}
            unit={pfZapMode}
            minStr={pfZapMin}
            maxStr={pfZapMax}
            rowsOverride={pairFluxSonarPairs}
            coverage={pairFluxSonarCoverage}
          />
        )}

        {!error && hasAny && (
          <div className="space-y-3">
            {(() => {
              const visible = new Set(benchBlocks.map((b) => b.benchmark));
              const activePairs = pairMutualExclusion.filter((p) => p.active && visible.has(p.aBench) && visible.has(p.bBench));
              if (!activePairs.length) return null;

              return (
                <div className={`px-3 py-2 rounded-lg border ${"accent-panel-soft"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent via-current to-transparent ${accentTextClass}`} />
                    <span className={`text-[10px] font-mono uppercase tracking-widest ${accentTextClass}`}>
                      QQQ/SPY/IWM Mutual Exclusion
                    </span>
                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent via-current to-transparent ${accentTextClass}`} />
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                    {activePairs.map((p) => {
                      const dirArrow = p.favorDir === "buy" ? "^" : p.favorDir === "sell" ? "v" : "-";
                      const dirClass =
                        p.favorDir === "buy" ? accentTextClass : p.favorDir === "sell" ? "text-rose-400" : "text-zinc-400";
                      const tickerLabel = p.favorTicker ?? "-";

                      return (
                        <div key={p.key} className="px-2 py-1 rounded border border-white/10 bg-black/20 text-[10px] font-mono uppercase tracking-wide">
                          <span className="text-zinc-300">{p.key}</span>
                          <span className="mx-1 text-zinc-600">r=</span>
                          <span className="text-zinc-200">{fmtNum(p.ratio, 2)}</span>
                          <span className="mx-2 text-zinc-600">|</span>
                          <span className="text-zinc-400">Excl Sum {fmtBp0(p.cancelA)}</span>
                          <span className="mx-2 text-zinc-600">|</span>
                          <span className={dirClass}>Sum {fmtBp0(p.favorSum)} {dirArrow} {tickerLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
        <style>{`
          .sonar-borderless .border-white\\/5,
          .sonar-borderless .border-white\\/10,
          .sonar-borderless .border-white\\/\\[0\\.04\\],
          .sonar-borderless .border-white\\/\\[0\\.06\\],
          .sonar-borderless .border-white\\/\\[0\\.08\\],
          .sonar-borderless .border-white\\/\\[0\\.12\\] {
            border-color: transparent !important;
          }

          .sonar-light-theme {
            color: #111827;
            color-scheme: light;
          }

          .sonar-light-theme button,
          .sonar-light-theme input,
          .sonar-light-theme select,
          .sonar-light-theme textarea {
            color: #111827;
          }

          .sonar-light-theme .bg-black\\/20,
          .sonar-light-theme .bg-black\\/30,
          .sonar-light-theme .bg-black\\/40,
          .sonar-light-theme .bg-\\[\\#0a0a0a\\]\\/40,
          .sonar-light-theme .bg-\\[\\#0a0a0a\\]\\/60,
          .sonar-light-theme .bg-white\\/5,
          .sonar-light-theme .bg-white\\/10,
          .sonar-light-theme .bg-white\\/\\[0\\.01\\],
          .sonar-light-theme .bg-white\\/\\[0\\.03\\],
          .sonar-light-theme .bg-white\\/\\[0\\.04\\],
          .sonar-light-theme .bg-emerald-500\\/\\[0\\.05\\],
          .sonar-light-theme .bg-rose-500\\/\\[0\\.05\\],
          .sonar-light-theme .bg-yellow-200\\/10,
          .sonar-light-theme .bg-violet-500\\/10,
          .sonar-light-theme .bg-fuchsia-500\\/10,
          .sonar-light-theme .bg-sky-400\\/10 {
            background-color: rgba(255, 255, 255, 0.38) !important;
          }

          .sonar-light-theme .border-white\\/5,
          .sonar-light-theme .border-white\\/10,
          .sonar-light-theme .border-white\\/\\[0\\.04\\],
          .sonar-light-theme .border-white\\/\\[0\\.06\\],
          .sonar-light-theme .border-white\\/\\[0\\.08\\],
          .sonar-light-theme .border-white\\/\\[0\\.12\\] {
            border-color: rgba(15, 23, 42, 0.1) !important;
          }

          .sonar-light-theme .text-white,
          .sonar-light-theme .text-zinc-100,
          .sonar-light-theme .text-zinc-200,
          .sonar-light-theme .text-zinc-300,
          .sonar-light-theme .text-zinc-400,
          .sonar-light-theme .text-zinc-500,
          .sonar-light-theme .text-zinc-600,
          .sonar-light-theme .text-zinc-700 {
            color: #111827 !important;
          }

          .sonar-light-theme .hover\\:text-white:hover,
          .sonar-light-theme .hover\\:text-zinc-200:hover,
          .sonar-light-theme .hover\\:text-zinc-300:hover {
            color: #111827 !important;
          }

          .sonar-light-theme .text-violet-300,
          .sonar-light-theme .text-violet-200,
          .sonar-light-theme .text-fuchsia-300 {
            color: #4c1d95 !important;
          }

          .sonar-light-theme .text-emerald-300,
          .sonar-light-theme .text-emerald-400 {
            color: #047857 !important;
          }

          .sonar-light-theme .text-rose-300,
          .sonar-light-theme .text-rose-400 {
            color: #be123c !important;
          }

          .sonar-light-theme .bg-rose-950\\/28,
          .sonar-light-theme .bg-rose-950\\/45,
          .sonar-light-theme .bg-emerald-950\\/28,
          .sonar-light-theme .bg-emerald-950\\/45,
          .sonar-light-theme .border-rose-900\\/40,
          .sonar-light-theme .border-rose-900\\/45,
          .sonar-light-theme .border-emerald-900\\/40,
          .sonar-light-theme .border-emerald-900\\/45 {
            background-color: rgba(255, 255, 255, 0.38) !important;
            border-color: rgba(15, 23, 42, 0.1) !important;
          }

          .sonar-light-theme input::placeholder,
          .sonar-light-theme textarea::placeholder {
            color: rgba(17, 24, 39, 0.42) !important;
          }

          .sonar-light-theme .from-white.to-white\\/60 {
            --tw-gradient-from: #111827 var(--tw-gradient-from-position) !important;
            --tw-gradient-to: rgb(17 24 39 / 0.62) var(--tw-gradient-to-position) !important;
          }

        `}</style>
      </div>
    </div>
  );
}


