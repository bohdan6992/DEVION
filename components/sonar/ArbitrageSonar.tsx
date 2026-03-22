"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";


import { useUi } from "@/components/UiProvider";
import PresetPicker from "@/components/presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND, SHARED_FILTER_PRESET_FIELDS, isSharedFilterPreset } from "@/lib/presets/sharedFilterPreset";
import { SHARED_FILTER_PRESETS_CHANGED_EVENT, deleteSharedFilterLocalPreset, getSharedFilterLocalPreset, listSharedFilterLocalPresets, saveSharedFilterLocalPreset } from "@/lib/presets/sharedFilterLocalPresets";
import type { PresetDto } from "@/types/presets";

/* =========================
   TYPES
========================= */
export type ArbitrageSignal = {
  strategy?: string;
  ticker: string;

  benchmark?: string;
  betaBucket?: string | null;
  direction?: "up" | "down" | "none";
  sig?: number | null;

  "BidLstClsΔ%"?: number | string | null;
  "AskLstClsΔ%"?: number | string | null;
  BidLstClsDeltaPct?: number | string | null;
  AskLstClsDeltaPct?: number | string | null;
  Bid?: number | string | null;
  Ask?: number | string | null;

  zapS?: number | null;
  zapSsigma?: number | null;
  zapL?: number | null;
  zapLsigma?: number | null;

  shortCandidate?: boolean;
  longCandidate?: boolean;

  bidStock?: number | null;
  askStock?: number | null;
  bidBench?: number | null;
  askBench?: number | null;

  account?: string;
  Account?: string;

  country?: string;
  Country?: string;
  exchange?: string;
  Exchange?: string;
  sector?: string;
  Sector?: string;

  company?: string;
  Company?: string;
  SectorL3?: string;

  vol?: number | string;
  Vol?: number | string;
  spread?: number | string;
  Spread?: number | string;
  lstClose?: number | string;
  lastClose?: number | string;
  close?: number | string;

  isPTP?: any;
  IsPTP?: any;
  ptp?: any;
  PTP?: any;
  isSSR?: any;
  IsSSR?: any;
  ssr?: any;
  SSR?: any;

  report?: any;
  Report?: any;

  active?: any;
  Active?: any;
  isActive?: any;
  IsActive?: any;

  avg90?: number | string;
  Avg90?: number | string;
  avPreMh?: number | string;
  AvPreMh?: number | string;

  news?: number | string;
  News?: number | string;
  newsCount?: number | string;
  NewsCount?: number | string;

  kind?: "hard" | "soft" | "any";

  // normalized helpers (internal)
  _bestRating?: number | null;
  _bestTotal?: number | null;
  _bestHard?: number | null;
  _bestSoft?: number | null;
  _reportBool?: boolean | null;
  _newsCount?: number;
  _isPTP?: boolean | null;
  _isSSR?: boolean | null;
  _isActive?: boolean | null;

  [k: string]: any;
};

type Mode = "top" | "all";
type RatingMode = "SESSION" | "BIN";
type BetaKey = "lt1" | "b1_1_5" | "b1_5_2" | "gt2" | "unknown";
type RowPair = { short?: ArbitrageSignal; long?: ArbitrageSignal };
type BucketGroup = { id: string; benchmark: string; betaKey: BetaKey; rows: RowPair[] };
type BenchBlock = { benchmark: string; buckets: BucketGroup[] };

type ArbClass = "blue" | "ark" | "print" | "open" | "intra" | "post" | "global";
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

const clsOrder: ArbClass[] = ["global", "blue", "ark", "print", "open", "intra", "post"];
const betaOrder: BetaKey[] = ["lt1", "b1_1_5", "b1_5_2", "gt2", "unknown"];

const BRIDGE_BASE = process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ?? "http://localhost:5197";

const IGNORE_LS_KEY = "bridge.arb.ignoreTickers.v2";
const APPLY_LS_KEY = "bridge.arb.applyOnlyTickers.v1";
const PIN_LS_KEY = "bridge.arb.pinTickers.v1";
const ACTIVE_PANEL_LS_KEY = "bridge.arb.activePanel.v1";
const UI_STATE_LS_KEY = "bridge.arb.uiState.v1";

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
const toNum = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/\u2212/g, "-")
    .replace(/[%\s]/g, "")
    .replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v: any): boolean | null => {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
};

const hasValue = (v: any): boolean => {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s.length > 0 && !["false", "0", "no", "null", "undefined"].includes(s);
};

function normalizeTicker(raw: string): string | null {
  const tk = (raw || "").trim().toUpperCase().replace(/"/g, "");
  if (!tk) return null;
  if (!/^[A-Z0-9.\-]+$/.test(tk)) return null;
  return tk;
}

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
const getMeta = (d: any) => d?.meta ?? d?.Meta ?? null;
const getBestObj = (d: any) => d?.best ?? d?.Best ?? null;

const pick = (obj: any, keys: string[]) => {
  if (!obj || typeof obj !== "object") return undefined;
  const isUsableValue = (value: any) => {
    if (value === undefined || value === null) return false;
    if (typeof value !== "string") return true;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed === "-" || trimmed === "—") return false;
    return true;
  };
  for (const k of keys) {
    const v = obj?.[k];
    if (isUsableValue(v)) return v;
  }
  const normalizeFieldKey = (value: string) =>
    value
      .normalize("NFKD")
      .replaceAll("Δ", " delta ")
      .replace(/Δ|∆/g, " delta ")
      .replace(/%/g, " percent ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => {
        if (token === "delta" || token === "percent" || token === "pct" || token === "pcnt") return "pct";
        return token;
      })
      .filter((token, index, arr) => !(token === "pct" && arr[index - 1] === "pct"))
      .join("");

  const keyMap = new Map<string, any>();
  for (const [rawKey, rawValue] of Object.entries(obj)) {
    if (!isUsableValue(rawValue)) continue;
    const normalized = normalizeFieldKey(String(rawKey));
    if (!keyMap.has(normalized)) keyMap.set(normalized, rawValue);
  }

  for (const k of keys) {
    const normalized = normalizeFieldKey(k);
    if (keyMap.has(normalized)) return keyMap.get(normalized);
  }
  return undefined;
};

const pickAny = (d: any, keys: string[]) => {
  const meta = getMeta(d);
  const v1 = pick(d, keys);
  if (v1 !== undefined) return v1;
  const v2 = pick(meta, keys);
  if (v2 !== undefined) return v2;
  return undefined;
};

const getStrAny = (d: any, keys: string[], fallback = "") => String(pickAny(d, keys) ?? fallback).trim();
const getNumAny = (d: any, keys: string[]) => toNum(pickAny(d, keys));
const getBoolAny = (d: any, keys: string[]) => toBool(pickAny(d, keys));

const getBestRating = (d: any) =>
  toNum(getBestObj(d)?.rating ?? getBestObj(d)?.Rating ?? getBestObj(d)?.rate ?? getBestObj(d)?.Rate ?? null);

const getBestTotal = (d: any) =>
  toNum(getBestObj(d)?.total ?? getBestObj(d)?.Total ?? getBestObj(d)?.count ?? getBestObj(d)?.Count ?? null);

const getBestTotalByType = (d: any, type: ArbType): number | null => {
  const best = getBestObj(d);
  const anyTotal = toNum(best?.total ?? best?.Total ?? best?.count ?? best?.Count ?? (d as any)?._bestTotal ?? (d as any)?.total);
  const hardTotal = toNum(best?.hard ?? best?.Hard ?? (d as any)?._bestHard);
  const softTotal = toNum(best?.soft ?? best?.Soft ?? (d as any)?._bestSoft);
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
const numSpread = (s: any) => getNumAny(s, ["spread", "Spread"]);
const numLastClose = (s: any) =>
  getNumAny(s, ["LstCls", "lstCls", "lstclose", "lstClose", "lastClose", "LastClose", "lastclose", "YCls", "yCls", "YClose", "yClose", "TCls", "tCls", "TClose", "tClose", "close", "Close"]);

const numAvPreMh = (s: any) => getNumAny(s, ["avPreMh", "AvPreMh", "avPreMhv", "AvPreMhv"]);
const numMarketCapM = (s: any) => getNumAny(s, ["marketCapM", "MarketCapM", "market_cap_m", "market_cap", "MarketCap"]);
const numPreMktVolNF = (s: any) =>
  getNumAny(s, ["preMktVolNF", "PreMktVolNF", "preMhVolNF", "PreMhVolNF", "pre_mkt_vol_nf", "premktVolNF", "PremktVolNF"]);
const numVWAP = (s: any) => getNumAny(s, ["vwap", "VWAP"]);
const numRoundLot = (s: any) => getNumAny(s, ["roundLot", "RoundLot"]);
const numADV20 = (s: any) => getNumAny(s, ["adv20", "ADV20", "Adv20"]);
const numADV20NF = (s: any) => getNumAny(s, ["adv20NF", "ADV20NF", "Adv20NF"]);
const numADV90 = (s: any) => getNumAny(s, ["adv90", "ADV90", "Adv90", "avg90", "Avg90"]);
const numADV90NF = (s: any) => getNumAny(s, ["adv90NF", "ADV90NF", "Adv90NF"]);
const numLstPrcL = (s: any) => getNumAny(s, ["lstPrcL", "LstPrcL", "lastPriceL", "LastPriceL", "lstPrc", "LstPrc"]);
const numYCls = (s: any) => getNumAny(s, ["yCls", "YCls", "yClose", "YClose"]);
const numTCls = (s: any) => getNumAny(s, ["tCls", "TCls", "tClose", "TClose"]);
const numClsToClsPct = (s: any) =>
  getNumAny(s, ["ClsToCls%", "clsToCls%", "clsToClsPct", "ClsToClsPct", "ClsToClsPcnt", "clsToClsPcnt"]);
const numLo = (s: any) => getNumAny(s, ["lo", "Lo", "low", "Low"]);
const numLstClsNewsCnt = (s: any) => getNumAny(s, ["LstClsNewsCnt", "lstClsNewsCnt", "lstClsNewsCount", "LstClsNewsCount"]);
const numVolRel = (s: any) => getNumAny(s, ["VolRel", "volRel", "vol_rel"]);
const AV_PRE_MH_VOL_90_NF_KEYS = ["AvPreMhVol90NF", "avPreMhVol90NF", "avpremhvol90nf", "av_pre_mh_vol_90_nf"];
const AV_PRE_MH_VALUE_20_NF_KEYS = ["AvPreMhValue20NF", "avPreMhValue20NF", "avpremhvalue20nf", "av_pre_mh_value_20_nf"];
const AV_PRE_MH_VALUE_90_NF_KEYS = ["AvPreMhValue90NF", "avPreMhValue90NF", "avpremhvalue90nf", "av_pre_mh_value_90_nf"];
const AVG_DAILY_VALUE_20_KEYS = ["AvgDailyValue20", "avgDailyValue20", "avgdailyvalue20", "avg_daily_value_20"];
const AVG_DAILY_VALUE_90_KEYS = ["AvgDailyValue90", "avgDailyValue90", "avgdailyvalue90", "avg_daily_value_90"];
const VOLATILITY_20_KEYS = ["Volatility20", "volatility20", "volatility_20", "Volatility20%", "volatility20%", "Volatility20Pct", "volatility20Pct", "volatility20pct"];
const VOLATILITY_90_KEYS = ["Volatility90", "volatility90", "volatility_90", "Volatility90%", "volatility90%", "Volatility90Pct", "volatility90Pct", "volatility90pct"];
const PRE_MH_MDV_20_NF_KEYS = ["PreMhMDV20NF", "preMhMDV20NF", "premhmdv20nf", "pre_mh_mdv_20_nf", "PreMktMDV20NF", "preMktMDV20NF"];
const PRE_MH_MDV_90_NF_KEYS = ["PreMhMDV90NF", "preMhMDV90NF", "premhmdv90nf", "pre_mh_mdv_90_nf", "PreMktMDV90NF", "preMktMDV90NF"];
const numPreMhBidLstPrcPct = (s: any) =>
  getNumAny(s, ["PreMhHiLstPrcΔ%", "PreMhHiLstPrcÎ”%", "PreMhHiLstPrcPct", "preMhHiLstPrcPct", "PreMhBidLstPrcΔ%", "PreMhBidLstPrcÎ”%", "PreMhBidLstPrcPct", "preMhBidLstPrcPct"]);
const numPreMhLoLstPrcPct = (s: any) =>
  getNumAny(s, ["PreMhLoLstPrcΔ%", "PreMhLoLstPrcÎ”%", "PreMhLoLstPrcPct", "preMhLoLstPrcPct"]);
const numPreMhHiLstClsPct = (s: any) =>
  getNumAny(s, ["PreMhHiLstClsΔ%", "PreMhHiLstClsÎ”%", "PreMhHiLstClsPct", "preMhHiLstClsPct"]);
const numPreMhLoLstClsPct = (s: any) =>
  getNumAny(s, ["PreMhLoLstClsΔ%", "PreMhLoLstClsÎ”%", "PreMhLoLstClsPct", "preMhLoLstClsPct"]);
const numLstPrcLstClsPct = (s: any) =>
  getNumAny(s, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsPct", "lstPrcLstClsPct"]);
const numImbExch925 = (s: any) => getNumAny(s, ["ImbExch9:25", "ImbExch925", "imbExch925"]);
const numImbExch1555 = (s: any) => getNumAny(s, ["ImbExch15:55", "ImbExch1555", "imbExch1555"]);
const numLstPrcLstClsPctSafe = (s: any) =>
  getNumAny(s, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsÃŽâ€%", "LstPrcLstClsPct", "LstPrcLstClsDeltaPct", "lstPrcLstClsPct"]);
const numAvPostMhVol90NF = (s: any) =>
  getNumAny(s, ["AvPostMhVol90NF", "avPostMhVol90NF"]);
const deriveValueFromPrice = (volumeLike: number | null, priceLike: number | null) =>
  volumeLike != null && priceLike != null ? volumeLike * priceLike : null;
const numAvPreMhVol90NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VOL_90_NF_KEYS) ?? numAvPreMh(s);
const numAvPreMhValue20NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VALUE_20_NF_KEYS);
const numAvPreMhValue90NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VALUE_90_NF_KEYS) ?? deriveValueFromPrice(numAvPreMhVol90NF(s), numLastClose(s));
const numAvgDailyValue20 = (s: any) =>
  getNumAny(s, AVG_DAILY_VALUE_20_KEYS) ?? deriveValueFromPrice(numADV20NF(s), numLastClose(s));
const numAvgDailyValue90 = (s: any) =>
  getNumAny(s, AVG_DAILY_VALUE_90_KEYS) ?? deriveValueFromPrice(numADV90NF(s), numLastClose(s));
const numVolatility20 = (s: any) =>
  getNumAny(s, VOLATILITY_20_KEYS);
const numVolatility90 = (s: any) =>
  getNumAny(s, VOLATILITY_90_KEYS);
const numPreMhMDV20NF = (s: any) =>
  getNumAny(s, PRE_MH_MDV_20_NF_KEYS);
const numPreMhMDV90NF = (s: any) =>
  getNumAny(s, PRE_MH_MDV_90_NF_KEYS);

const numVolNFfromLstCls = (s: any) => {
  const vol = numPreMktVolNF(s);
  const prc = numLastClose(s);
  if (vol != null && prc != null) return vol * prc;
  return null;
};

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

const getSignalMetricAbs = (
  s: ArbitrageSignal,
  zapMode: "zap" | "sigma" | "delta" | "off"
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

const isSignalGoldActive = (
  s: ArbitrageSignal,
  zapMode: "zap" | "sigma" | "delta" | "off",
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
  const b0 = toNum(s?.betaBucket);
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

const BIN_SERVER_MIN_RATE = 0.3;
const BIN_SERVER_MIN_TOTAL = 1;

function safeRecord(value: any): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function sonarClassToBinClassKey(cls: ArbClass): string {
  return cls === "global" ? "global" : cls;
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

/* =========================
   URL builder
========================= */
function buildSignalsUrl(args: {
  cls: ArbClass;
  type: ArbType;
  mode: Mode;
  ratingMode: RatingMode;
  zapMode: "zap" | "sigma" | "delta" | "off";
  minRate: number;
  minTotal: number;
  tickers?: string;
  minCorr?: number | null;
  maxCorr?: number | null;
  minBeta?: number | null;
  maxBeta?: number | null;
  minSigma?: number | null;
  maxSigma?: number | null;
}) {
  const {
    cls,
    type,
    mode,
    ratingMode,
    zapMode,
    minRate,
    minTotal,
    tickers,
    minCorr,
    maxCorr,
    minBeta,
    maxBeta,
    minSigma,
    maxSigma,
  } = args;

  const u = new URL(`${BRIDGE_BASE}/api/arbitrage/signals/${cls}/${type}/${mode}`);

  const useBinRatingFilter = ratingMode === "BIN" && zapMode === "sigma";
  const safeMinRate = useBinRatingFilter
    ? BIN_SERVER_MIN_RATE
    : Number.isFinite(minRate) ? Math.max(0, minRate) : BIN_SERVER_MIN_RATE;
  const safeMinTotal = useBinRatingFilter
    ? BIN_SERVER_MIN_TOTAL
    : Number.isFinite(minTotal) ? Math.max(1, Math.trunc(minTotal)) : BIN_SERVER_MIN_TOTAL;

  u.searchParams.set("minRate", String(safeMinRate));
  u.searchParams.set("minTotal", String(safeMinTotal));
  u.searchParams.set("limit", "5000");

  const t = (tickers ?? "").trim();
  if (t) u.searchParams.set("tickers", t);

  const setOptional = (key: string, value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      u.searchParams.set(key, String(value));
    }
  };

  setOptional("minCorr", minCorr);
  setOptional("maxCorr", maxCorr);
  setOptional("minBeta", minBeta);
  setOptional("maxBeta", maxBeta);
  setOptional("minSigma", minSigma);
  setOptional("maxSigma", maxSigma);

  return u.toString();
}

/* =========================
   API NORMALIZER
========================= */
function normalizeSignal(raw: any): ArbitrageSignal | null {
  if (!raw) return null;

  const ticker = normalizeTicker(String(raw.ticker ?? raw.Ticker ?? ""));
  if (!ticker) return null;

  const meta = raw?.meta ?? raw?.Meta ?? null;

  const benchmark = String(raw.benchmark ?? raw.Benchmark ?? raw.bench ?? raw.Bench ?? meta?.bench ?? meta?.benchmark ?? "UNKNOWN").toUpperCase();
  const betaBucket =
    raw.betaBucket ?? raw.BetaBucket ?? raw.beta_bucket ?? raw.beta_bucket_str ?? raw.beta ?? raw.Beta ?? meta?.betaBucket ?? meta?.beta ?? null;

  const sideStr = String(raw.side ?? raw.Side ?? raw.dir ?? raw.Dir ?? raw.direction ?? raw.Direction ?? "")
    .toLowerCase()
    .trim();

  let direction: "up" | "down" | "none" = "none";
  if (sideStr.includes("short") || sideStr === "s" || sideStr === "sell" || sideStr === "down") direction = "down";
  else if (sideStr.includes("long") || sideStr === "l" || sideStr === "buy" || sideStr === "up") direction = "up";
  else {
    const dirRaw = String(raw.direction ?? raw.Direction ?? meta?.direction ?? meta?.Direction ?? "")
      .trim()
      .toLowerCase();
    if (dirRaw === "up" || dirRaw === "long" || dirRaw === "buy") direction = "up";
    else if (dirRaw === "down" || dirRaw === "short" || dirRaw === "sell") direction = "down";
  }

  const sig =
    (typeof raw.sig === "number" ? raw.sig : null) ??
    (typeof raw.sigma === "number" ? raw.sigma : null) ??
    (typeof raw.devSigma === "number" ? raw.devSigma : null) ??
    (typeof raw.dev_sigma === "number" ? raw.dev_sigma : null) ??
    null;

  const zapS = typeof raw.zapS === "number" ? raw.zapS : typeof raw.zap_s === "number" ? raw.zap_s : null;
  const zapL = typeof raw.zapL === "number" ? raw.zapL : typeof raw.zap_l === "number" ? raw.zap_l : null;

  const kindStr = String(raw.type ?? raw.Type ?? raw.kind ?? raw.Kind ?? raw.normType ?? "")
    .toLowerCase()
    .trim();
  const kind: "hard" | "soft" | "any" = kindStr.includes("hard") ? "hard" : kindStr.includes("soft") ? "soft" : "any";

  const shortCandidate = !!(raw.shortCandidate ?? raw.ShortCandidate ?? raw.isShort ?? raw.short ?? false);
  const longCandidate = !!(raw.longCandidate ?? raw.LongCandidate ?? raw.isLong ?? raw.long ?? false);
  if (direction === "none") {
    if (shortCandidate && !longCandidate) direction = "down";
    else if (longCandidate && !shortCandidate) direction = "up";
  }

  const bidStock = toNum(raw.bidStock ?? meta?.bidStock);
  const askStock = toNum(raw.askStock ?? meta?.askStock);
  const bidBench = toNum(raw.bidBench ?? meta?.bidBench);
  const askBench = toNum(raw.askBench ?? meta?.askBench);

  const zapSsigma = toNum(raw.zapSsigma ?? meta?.zapSsigma);
  const zapLsigma = toNum(raw.zapLsigma ?? meta?.zapLsigma);

  const best = raw?.best ?? raw?.Best ?? null;

  const _bestRating = toNum(best?.rating ?? best?.Rating);
  const _bestTotal = toNum(best?.total ?? best?.Total);
  const _bestHard = toNum(best?.hard ?? best?.Hard);
  const _bestSoft = toNum(best?.soft ?? best?.Soft);

  const _reportBool = (() => {
    const s = String(meta?.report ?? raw?.report ?? raw?.Report ?? "").trim().toLowerCase();
    if (["yes", "y", "true", "1"].includes(s)) return true;
    if (["no", "n", "false", "0"].includes(s)) return false;
    return null;
  })();

  const _newsCount =
    toNum(meta?.newsCnt ?? meta?.newsCount ?? meta?.news ?? raw?.newsCnt ?? raw?.news ?? raw?.newsCount ?? raw?.NewsCount) ?? 0;

  const _isPTP = toBool(raw?.isPtp ?? raw?.isPTP ?? raw?.IsPTP ?? meta?.isPtp ?? meta?.isPTP ?? meta?.IsPTP);
  const _isSSR = toBool(raw?.isSsr ?? raw?.isSSR ?? raw?.IsSSR ?? meta?.isSsr ?? meta?.isSSR ?? meta?.IsSSR);
  const _isActive = toBool(raw?.active ?? raw?.isActive ?? raw?.IsActive ?? meta?.active ?? meta?.isActive ?? meta?.IsActive);

  const canonical = { ...raw, meta };
  const volRel = numVolRel(canonical);
  const avPostMhVol90NF = numAvPostMhVol90NF(canonical);
  const avPreMhVol90NF = numAvPreMhVol90NF(canonical);
  const avPreMhValue20NF = numAvPreMhValue20NF(canonical);
  const avPreMhValue90NF = numAvPreMhValue90NF(canonical);
  const avgDailyValue20 = numAvgDailyValue20(canonical);
  const avgDailyValue90 = numAvgDailyValue90(canonical);
  const volatility20 = numVolatility20(canonical);
  const volatility90 = numVolatility90(canonical);
  const preMhMDV20NF = numPreMhMDV20NF(canonical);
  const preMhMDV90NF = numPreMhMDV90NF(canonical);
  const preMhBidLstPrcPct = getNumAny(canonical, ["PreMhHiLstPrcΔ%", "PreMhHiLstPrcÎ”%", "PreMhHiLstPrcPct", "preMhHiLstPrcPct", "PreMhBidLstPrcΔ%", "PreMhBidLstPrcÎ”%", "PreMhBidLstPrcPct", "preMhBidLstPrcPct"]);
  const preMhLoLstPrcPct = getNumAny(canonical, ["PreMhLoLstPrcΔ%", "PreMhLoLstPrcÎ”%", "PreMhLoLstPrcPct", "preMhLoLstPrcPct"]);
  const preMhHiLstClsPct = getNumAny(canonical, ["PreMhHiLstClsΔ%", "PreMhHiLstClsÎ”%", "PreMhHiLstClsPct", "preMhHiLstClsPct"]);
  const preMhLoLstClsPct = getNumAny(canonical, ["PreMhLoLstClsΔ%", "PreMhLoLstClsÎ”%", "PreMhLoLstClsPct", "preMhLoLstClsPct"]);
  const lstPrcLstClsPct = getNumAny(canonical, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsPct", "LstPrcLstClsDeltaPct", "lstPrcLstClsPct"]);
  const imbExch925 = getNumAny(canonical, ["ImbExch9:25", "ImbExch925", "imbExch925"]);
  const imbExch1555 = getNumAny(canonical, ["ImbExch15:55", "ImbExch1555", "imbExch1555"]);

  // make sure these exist at top-level for filters/options
  const country = raw?.country ?? raw?.Country ?? meta?.country ?? meta?.Country ?? undefined;
  const exchange = raw?.exchange ?? raw?.Exchange ?? meta?.exchange ?? meta?.Exchange ?? undefined;
  const sector = raw?.sector ?? raw?.Sector ?? meta?.sector ?? meta?.Sector ?? meta?.sectorL3 ?? meta?.SectorL3 ?? undefined;

  return {
    ...raw,
    meta,

    ticker,
    benchmark,
    betaBucket: betaBucket == null ? null : String(betaBucket),
    direction,
    sig,
    zapS,
    zapSsigma,
    zapL,
    zapLsigma,
    shortCandidate,
    longCandidate,
    kind,
    bidStock,
    askStock,
    bidBench,
    askBench,

    country,
    exchange,
    sector,
    VolRel: volRel,
    AvPostMhVol90NF: avPostMhVol90NF,
    AvPreMhVol90NF: avPreMhVol90NF,
    AvPreMhValue20NF: avPreMhValue20NF,
    AvPreMhValue90NF: avPreMhValue90NF,
    AvgDailyValue20: avgDailyValue20,
    AvgDailyValue90: avgDailyValue90,
    Volatility20: volatility20,
    Volatility90: volatility90,
    PreMhMDV20NF: preMhMDV20NF,
    PreMhMDV90NF: preMhMDV90NF,
    PreMhBidLstPrcPct: preMhBidLstPrcPct,
    PreMhLoLstPrcPct: preMhLoLstPrcPct,
    PreMhHiLstClsPct: preMhHiLstClsPct,
    PreMhLoLstClsPct: preMhLoLstClsPct,
    LstPrcLstClsPct: lstPrcLstClsPct,
    ImbExch925: imbExch925,
    ImbExch1555: imbExch1555,

    _bestRating,
    _bestTotal,
    _bestHard,
    _bestSoft,
    _reportBool,
    _newsCount,
    _isPTP,
    _isSSR,
    _isActive,
  };
}

/* =========================
   MinMax component
========================= */
type MinMaxProps = {
  label: string;
  filterKey?: RangeBoundKey;
  min: string;
  max: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  mode?: "on" | "off";
  onToggleMode?: (key: RangeBoundKey) => void;
  minPh?: string;
  maxPh?: string;
  startEditing: () => void;
  stopEditing: () => void;
};

const RANGE_BOUND_KEYS = [
  "Corr", "Beta", "Sigma",
  "ADV20", "ADV20NF", "ADV90", "ADV90NF", "AvPreMhv", "RoundLot", "VWAP", "Spread", "LstPrcL",
  "LstCls", "YCls", "TCls", "ClsToClsPct", "Lo", "LstClsNewsCnt", "MarketCapM", "PreMhVolNF",
  "VolNFfromLstCls", "AvPostMhVol90NF", "AvPreMhVol90NF", "AvPreMhValue20NF", "AvPreMhValue90NF",
  "AvgDailyValue20", "AvgDailyValue90", "Volatility20", "Volatility90", "PreMhMDV20NF", "PreMhMDV90NF",
  "VolRel", "PreMhBidLstPrcPct", "PreMhLoLstPrcPct",
  "PreMhHiLstClsPct", "PreMhLoLstClsPct", "LstPrcLstClsPct", "ImbExch925", "ImbExch1555",
] as const;
type RangeBoundKey = typeof RANGE_BOUND_KEYS[number];
type RangeFilterMode = "on" | "off";
type RangeFilterModes = Record<RangeBoundKey, RangeFilterMode>;

const createDefaultRangeModes = (): RangeFilterModes =>
  Object.fromEntries(RANGE_BOUND_KEYS.map((key) => [key, "on"])) as RangeFilterModes;

export const MinMax = React.memo(function MinMax(props: MinMaxProps) {
  const hasValue = Boolean(props.min || props.max);
  const isOff = props.mode === "off";

  return (
    <div
      className={`group flex flex-col gap-1 rounded-xl border p-2 transition-all ${
        hasValue
          ? isOff
            ? "border-rose-500/30 bg-rose-500/[0.05]"
            : "border-[#6ee7b7]/30 bg-[#6ee7b7]/[0.05]"
          : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10"
      }`}
      onFocusCapture={props.startEditing}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        props.stopEditing();
      }}
    >
      <div className="flex items-center justify-between">
        <div className="mr-1 truncate text-[10px] font-mono uppercase tracking-widest text-zinc-500">{props.label}</div>
        <div className="flex items-center gap-2">
          {hasValue && props.filterKey && props.onToggleMode && (
            <button
              type="button"
              onClick={() => props.onToggleMode?.(props.filterKey!)}
              className={`text-[10px] font-mono transition-colors uppercase ${
                isOff ? "text-rose-300 hover:text-rose-200" : "text-[#6ee7b7] hover:text-[#a7f3d0]"
              }`}
              title={isOff ? "Stored but ignored in filters" : "Applied to filters"}
            >
              {isOff ? "OFF" : "ON"}
            </button>
          )}
          {hasValue && (
            <button
              type="button"
              onClick={() => {
                props.setMin("");
                props.setMax("");
              }}
              className="text-[10px] font-mono text-rose-400 hover:text-rose-300 transition-colors"
            >
              CLR
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          className="w-full rounded border-0 bg-black/20 px-1.5 py-1 text-center text-[11px] font-mono text-zinc-200 tabular-nums shadow-none outline-none ring-0 transition-all placeholder:text-zinc-600 hover:border-0 focus:border-0 focus:outline-none focus:ring-0"
          value={props.min}
          placeholder={props.minPh ?? "min"}
          onChange={(e) => props.setMin(e.target.value)}
        />
        <input
          className="w-full rounded border-0 bg-black/20 px-1.5 py-1 text-center text-[11px] font-mono text-zinc-200 tabular-nums shadow-none outline-none ring-0 transition-all placeholder:text-zinc-600 hover:border-0 focus:border-0 focus:outline-none focus:ring-0"
          value={props.max}
          placeholder={props.maxPh ?? "max"}
          onChange={(e) => props.setMax(e.target.value)}
        />
      </div>
    </div>
  );
});

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
  return "emerald";
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

const SONAR_FILTER_GROUP_BASE =
  "inline-flex items-center gap-2 rounded-xl border p-1.5";
const SONAR_FILTER_INNER_PILL =
  "inline-flex h-7 items-center justify-center rounded-lg border px-3 py-0 text-[10px] font-mono font-bold uppercase leading-none transition-all";
const SONAR_FILTER_INPUT =
  "h-7 rounded-lg border px-3 py-0 text-[11px] font-mono text-center tabular-nums leading-none transition-all focus:outline-none";

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

const MultiSelectFilter = ({
  label,
  options,
  selected,
  setSelected,
  enabled,
  toggleEnabled,
  color = "amber",
  hideArrow = false,
  onMainClick,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  enabled: boolean;
  toggleEnabled: () => void;
  color?: MsColor;
  hideArrow?: boolean;
  onMainClick?: () => void;
}) => {
  const { theme } = useUi();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const id = useMemo(() => `msf-${slug(label)}`, [label]);
  const C = MSF[resolveAccentMsColor(theme, color)];

  const toggleOption = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setSelected(next);
  };




  const recomputePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 8, width: Math.max(220, r.width) });
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

    const onScroll = () => recomputePos();
    const onResize = () => recomputePos();

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, id]);

  const menu =
    open && pos
      ? createPortal(
          <div
            id={id}
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 999999 }}
            className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-y-auto no-scrollbar"
          >
            <div className="max-h-[340px] overflow-y-auto py-1.5 no-scrollbar">
              {options.map((opt, i) => (
                <button
                  key={opt || `na-${i}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleOption(opt)}
                  className={`text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                    selected.has(opt) ? C.activeItem : C.inactiveItem
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {selected.has(opt) ? (
                      <div className={`w-3 h-3 rounded ${C.boxChecked}`} />
                    ) : (
                      <div className="w-3 h-3 rounded border border-white/20" />
                    )}
                  </div>

                  <span className="truncate">{opt}</span>
                </button>
              ))}
              {options.length === 0 && <div className="text-[10px] text-zinc-600 px-2 py-1 text-center">No options</div>}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="relative flex h-7 items-center bg-black/20 rounded-full border border-white/5" ref={wrapRef}>
        <button
          type="button"
          onClick={toggleEnabled}
          className={`inline-flex h-full items-center px-3 text-[10px] font-mono font-bold uppercase transition-all rounded-l-full ${
            enabled ? C.chipActive : C.chipInactive
          }`}
        >
          <span>{label}</span>
          {selected.size > 0 && (
            <span
              className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full border border-yellow-200/35 bg-black/25 px-1.5 py-0.5 text-[10px] font-mono leading-none ${getSonarAccent(theme).text}`}
            >
              {selected.size}
            </span>
          )}
        </button>

        <div className={`w-px h-4 ${C.divider}`} />

        <button
          type="button"
          onClick={() => {
            onMainClick?.();
            if (!hideArrow) setOpen((v) => !v);
          }}
          className={`inline-flex h-full min-w-[28px] items-center justify-center px-2 transition-all rounded-r-full ${C.arrow}`}
        >
          <ChevronIcon open={open} />
        </button>
      </div>

      {menu}
    </>
  );
};

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
                      active ? getSonarAccent(theme).textSoft : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {active && <span className={["h-1.5 w-1.5 rounded-full", getSonarAccent(theme).dot].join(" ")} />}
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
  const { theme } = useUi();
  const accent = getSonarAccent(theme);
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
            ? clsx(accent.textSoft, "border-transparent bg-transparent shadow-none hover:text-zinc-200")
            : clsx(accent.textSoft, "border-white/10 bg-black/30 shadow-[0_0_15px_-5px_rgba(255,255,255,0.08)]"),
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
                            ? accent.button
                            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {opt.value === value && <span className={clsx("w-1.5 h-1.5 rounded-full", accent.dot)} />}
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

const FilterButton: React.FC<FilterButtonProps> = ({ active, label, onClick, color = "emerald" }) => {
  const { theme } = useUi();
  const resolvedColor = resolveAccentMsColor(theme, color);

  return (
    <button
      onClick={onClick}
      className={`inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all ${
        active ? FB[resolvedColor].on : "border border-transparent text-zinc-500 hover:text-zinc-300 bg-transparent"
      }`}
    >
      {label}
    </button>
  );
};

// ЗАМІНИТИ існуюче оголошення SignalCardProps + компонент SignalCard
// на наступний блок:

interface SignalCardProps {
  s: ArbitrageSignal;
  side: "short" | "long";
  onClick: (tk: string) => void;
  activeTicker: string | null;
  flashClass: (ticker: string, side: "short" | "long") => string;
  compact?: boolean;

  zapMode: "zap" | "sigma" | "delta" | "off";
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
  const { theme } = useUi();
  const sonarAccent = getSonarAccent(theme);
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

type SortKey = "alpha" | "sigma" | "zapAbs" | "sigZapAbs" | "rate" | "posBpAbs" | "beta" | "pin";
type SortDir = "asc" | "desc";

const PIN_DOT_CLASS: Record<PinColor, string> = {
  orange: "bg-orange-400",
  lavender: "bg-violet-300",
  cyan: "bg-sky-300", // was bg-cyan-300 -> now light-blue
};



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
export default function ArbitrageSonar() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const isDark = true;
  const sonarAccent = getSonarAccent(theme);
  const accentSelectionClass = sonarAccent.selection;
  const accentDotClass = sonarAccent.dot;
  const accentBadgeClass = sonarAccent.badge;
  const accentButtonClass = sonarAccent.button;
  const accentOutlineButtonClass = sonarAccent.outlineButton;
  const accentPanelClass = sonarAccent.panel;
  const accentChipClass = sonarAccent.chip;
  const accentLineClass = sonarAccent.line;
  const accentTextClass = sonarAccent.text;
  const accentTextSoftClass = sonarAccent.textSoft;
  const secondaryGroupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const secondaryButtonBaseClass =
    "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border";
  const secondaryButtonInactiveClass = "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const secondaryIconButtonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-all hover:text-white hover:bg-white/5";

  /* ===== defaults requested: global / all / any ===== */
  const [cls, setCls] = useState<ArbClass>("global");
  const [type, setType] = useState<ArbType>("any");
  const [mode, setMode] = useState<Mode>("all");
  const [corrMin, setCorrMin] = useState("");
  const [corrMax, setCorrMax] = useState("");
  const [betaMin, setBetaMin] = useState("");
  const [betaMax, setBetaMax] = useState("");
  const [sigmaMin, setSigmaMin] = useState("");
  const [sigmaMax, setSigmaMax] = useState("");
  const [corrEnabled, setCorrEnabled] = useState(false);
  const [corrAbs, setCorrAbs] = useState(0.5);


  const [minRate, setMinRate] = useState<number>(0.3);
  const [minTotal, setMinTotal] = useState<number>(1);
  const [ratingMode, setRatingMode] = useState<RatingMode>("SESSION");

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

  const [zapMode, setZapMode] = useState<"zap" | "sigma" | "delta" | "off">("zap");

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
  const [activeMode, setActiveMode] = useState<ActiveMode>("off");


  /* ===== Boolean filters (Green Group - Include Only) ===== */
  const [includeUSA, setIncludeUSA] = useState(false);
  const [includeChina, setIncludeChina] = useState(false);

  /* ===== Multi-select ===== */
  const [selCountries, setSelCountries] = useState<Set<string>>(new Set());
  const [countryEnabled, setCountryEnabled] = useState(false);

  const [selExchanges, setSelExchanges] = useState<Set<string>>(new Set());
  const [exchangeEnabled, setExchangeEnabled] = useState(false);

  const [selSectors, setSelSectors] = useState<Set<string>>(new Set());
  const [sectorEnabled, setSectorEnabled] = useState(false);

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
  const [items, setItems] = useState<ArbitrageSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  /* ===== Active ticker panel ===== */
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activePanelVisible, setActivePanelVisible] = useState<boolean>(true);
  const [activePanelCollapsed, setActivePanelCollapsed] = useState<boolean>(false);
  const [activePanelMode, setActivePanelMode] = useState<"mini" | "expanded">("expanded");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const [activeLoading, setActiveLoading] = useState(false);
  const [activeErr, setActiveErr] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<any>(null);

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
      const col = typeof s?.collapsed === "boolean" ? s.collapsed : false;
      const mode = s?.mode === "mini" || s?.mode === "expanded" ? s.mode : "expanded";

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

        // query params
        if (s?.ratingMode === "SESSION" || s?.ratingMode === "BIN") setRatingMode(s.ratingMode);
        if (typeof s?.minRate === "number") setMinRate(s.minRate);
        if (typeof s?.minTotal === "number") setMinTotal(s.minTotal);
        if (typeof s?.tickersFilter === "string") setTickersFilter(s.tickersFilter);
        if (typeof s?.accountNonEmptyFirst === "boolean") setAccountNonEmptyFirst(s.accountNonEmptyFirst);
        if (typeof s?.filtersCollapsed === "boolean") setFiltersCollapsed(s.filtersCollapsed);

        // toggles
        for (const k of [
          'excludeDividend','excludeNews','excludePTP','excludeSSR','excludeReport','excludeETF','excludeCrap',
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
              case 'includeUSA': setIncludeUSA(v); break;
              case 'includeChina': setIncludeChina(v); break;
            }
          }
        }
        if (typeof s?.filterReport === 'string') setFilterReport(s.filterReport);
        if (typeof s?.equityType === 'string') setEquityType(s.equityType);

        if (typeof s?.corrMin === 'string') setCorrMin(s.corrMin);
        if (typeof s?.corrMax === 'string') setCorrMax(s.corrMax);
        if (typeof s?.betaMin === 'string') setBetaMin(s.betaMin);
        if (typeof s?.betaMax === 'string') setBetaMax(s.betaMax);
        if (typeof s?.sigmaMin === 'string') setSigmaMin(s.sigmaMin);
        if (typeof s?.sigmaMax === 'string') setSigmaMax(s.sigmaMax);

        // multi-select
        if (typeof s?.countryEnabled === 'boolean') setCountryEnabled(s.countryEnabled);
        if (Array.isArray(s?.selCountries)) setSelCountries(new Set(s.selCountries.filter(Boolean)));
        if (typeof s?.exchangeEnabled === 'boolean') setExchangeEnabled(s.exchangeEnabled);
        if (Array.isArray(s?.selExchanges)) setSelExchanges(new Set(s.selExchanges.filter(Boolean)));
        if (typeof s?.sectorEnabled === 'boolean') setSectorEnabled(s.sectorEnabled);
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

          // query params
          ratingMode, minRate, minTotal, tickersFilter, accountNonEmptyFirst, filtersCollapsed,

          // toggles
          excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
          includeUSA, includeChina,
          filterReport, equityType,

          corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax,

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
    ratingMode, minRate, minTotal, tickersFilter, accountNonEmptyFirst, filtersCollapsed,
    excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
    includeUSA, includeChina,
    filterReport, equityType,
    corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax,
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
      corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax,
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
      } as Record<string, any>;
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
      Spread: mm("Spread", spreadMin, spreadMax),
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

      corrMin,
      corrMax,
      betaMin,
      betaMax,
      sigmaMin,
      sigmaMax,

      zapMode,
      zapShowAbs,
      zapSilverAbs,
      zapGoldAbs,

    };
  }, [
    cls, type, mode, ratingMode, minRate, minTotal, tickersFilterNorm,
    listMode, ignoreSet, applySet,pinMap, sortKey, sortDir,
    bounds,
    excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap,
    activeMode, // include in dependencies
    includeUSA, includeChina,
    selCountries, countryEnabled, selExchanges, exchangeEnabled, selSectors, sectorEnabled,
    filterReport, equityType,
    corrMin, corrMax, betaMin, betaMax, sigmaMin, sigmaMax,
    zapMode, zapShowAbs,  zapSilverAbs, zapGoldAbs,

  ]);

  const filtersRef = useRef(snapshot);
  useEffect(() => {
    filtersRef.current = snapshot;
  }, [snapshot]);

  /* =========================
     Filters (fast single-pass)
  ========================= */
  const passMinMax = (val: number | null, min: number | null, max: number | null) => {
    if ((min != null || max != null) && val == null) return false;
    if (min != null && val != null && val < min) return false;
    if (max != null && val != null && val > max) return false;
    return true;
  };

  const applyAllClientFilters = useCallback((arr: ArbitrageSignal[], f: typeof snapshot) => {
    const out: ArbitrageSignal[] = [];
    const mr = toNum(f.minRate);
    const mt = toNum(f.minTotal);
    const useBinRatingFilter = f.ratingMode === "BIN" && f.zapMode === "sigma";

    const base = Number(f.zapShowAbs ?? 0);
    const zapThr = Math.max(0.3, base);   // for ZAP
    const sigThr = Math.max(0.05, base);  // for SIGZAP
    const eqNeedle = f.equityType.trim().toLowerCase();

    for (const s of arr ?? []) {
      const tk = normalizeTicker(s?.ticker || "");
      if (!tk) continue;
      const posActive = isActiveByPositionBp(s);

      // ACTIVE tab should surface the same active position set used by hedge,
      // so active rows bypass list mode and secondary client-side filters here.
      if (f.activeMode === "onlyActive") {
        if (!posActive) continue;
        out.push(s);
        continue;
      }

      // list mode first (cheap)
      if (f.listMode === "ignore" && f.ignoreSet.has(tk)) continue;
      if (f.listMode === "apply" && !f.applySet.has(tk)) continue;
      if (f.listMode === "pin" && !f.pinMap[tk]) continue;

      if (f.activeMode === "onlyInactive") {
        if (posActive) continue;
      }


      // thresholds
      if (!passMinMax(getCorrValue(s), f.bounds.Corr.min, f.bounds.Corr.max)) continue;
      if (!passMinMax(getBetaValue(s), f.bounds.Beta.min, f.bounds.Beta.max)) continue;
      if (!passMinMax(getSigmaValue(s), f.bounds.Sigma.min, f.bounds.Sigma.max)) continue;
      if (!passMinMax(numADV20(s), f.bounds.ADV20.min, f.bounds.ADV20.max)) continue;
      if (!passMinMax(numADV20NF(s), f.bounds.ADV20NF.min, f.bounds.ADV20NF.max)) continue;
      if (!passMinMax(numADV90(s), f.bounds.ADV90.min, f.bounds.ADV90.max)) continue;
      if (!passMinMax(numADV90NF(s), f.bounds.ADV90NF.min, f.bounds.ADV90NF.max)) continue;
      if (!passMinMax(numAvPreMh(s), f.bounds.AvPreMhv.min, f.bounds.AvPreMhv.max)) continue;
      if (!passMinMax(numRoundLot(s), f.bounds.RoundLot.min, f.bounds.RoundLot.max)) continue;
      if (!passMinMax(numVWAP(s), f.bounds.VWAP.min, f.bounds.VWAP.max)) continue;
      if (!passMinMax(numSpread(s), f.bounds.Spread.min, f.bounds.Spread.max)) continue;
      if (!passMinMax(numLstPrcL(s), f.bounds.LstPrcL.min, f.bounds.LstPrcL.max)) continue;
      if (!passMinMax(numLastClose(s), f.bounds.LstCls.min, f.bounds.LstCls.max)) continue;
      if (!passMinMax(numYCls(s), f.bounds.YCls.min, f.bounds.YCls.max)) continue;
      if (!passMinMax(numTCls(s), f.bounds.TCls.min, f.bounds.TCls.max)) continue;
      if (!passMinMax(numClsToClsPct(s), f.bounds.ClsToClsPct.min, f.bounds.ClsToClsPct.max)) continue;
      if (!passMinMax(numLo(s), f.bounds.Lo.min, f.bounds.Lo.max)) continue;
      if (!passMinMax(numLstClsNewsCnt(s), f.bounds.LstClsNewsCnt.min, f.bounds.LstClsNewsCnt.max)) continue;
      if (!passMinMax(numMarketCapM(s), f.bounds.MarketCapM.min, f.bounds.MarketCapM.max)) continue;
      if (!passMinMax(numPreMktVolNF(s), f.bounds.PreMhVolNF.min, f.bounds.PreMhVolNF.max)) continue;
      if (!passMinMax(numVolNFfromLstCls(s), f.bounds.VolNFfromLstCls.min, f.bounds.VolNFfromLstCls.max)) continue;
      if (!passMinMax(numAvPostMhVol90NF(s), f.bounds.AvPostMhVol90NF.min, f.bounds.AvPostMhVol90NF.max)) continue;
      if (!passMinMax(numAvPreMhVol90NF(s), f.bounds.AvPreMhVol90NF.min, f.bounds.AvPreMhVol90NF.max)) continue;
      if (!passMinMax(numAvPreMhValue20NF(s), f.bounds.AvPreMhValue20NF.min, f.bounds.AvPreMhValue20NF.max)) continue;
      if (!passMinMax(numAvPreMhValue90NF(s), f.bounds.AvPreMhValue90NF.min, f.bounds.AvPreMhValue90NF.max)) continue;
      if (!passMinMax(numAvgDailyValue20(s), f.bounds.AvgDailyValue20.min, f.bounds.AvgDailyValue20.max)) continue;
      if (!passMinMax(numAvgDailyValue90(s), f.bounds.AvgDailyValue90.min, f.bounds.AvgDailyValue90.max)) continue;
      if (!passMinMax(numVolatility20(s), f.bounds.Volatility20.min, f.bounds.Volatility20.max)) continue;
      if (!passMinMax(numVolatility90(s), f.bounds.Volatility90.min, f.bounds.Volatility90.max)) continue;
      if (!passMinMax(numPreMhMDV20NF(s), f.bounds.PreMhMDV20NF.min, f.bounds.PreMhMDV20NF.max)) continue;
      if (!passMinMax(numPreMhMDV90NF(s), f.bounds.PreMhMDV90NF.min, f.bounds.PreMhMDV90NF.max)) continue;
      if (!passMinMax(numVolRel(s), f.bounds.VolRel.min, f.bounds.VolRel.max)) continue;
      if (!passMinMax(numPreMhBidLstPrcPct(s), f.bounds.PreMhBidLstPrcPct.min, f.bounds.PreMhBidLstPrcPct.max)) continue;
      if (!passMinMax(numPreMhLoLstPrcPct(s), f.bounds.PreMhLoLstPrcPct.min, f.bounds.PreMhLoLstPrcPct.max)) continue;
      if (!passMinMax(numPreMhHiLstClsPct(s), f.bounds.PreMhHiLstClsPct.min, f.bounds.PreMhHiLstClsPct.max)) continue;
      if (!passMinMax(numPreMhLoLstClsPct(s), f.bounds.PreMhLoLstClsPct.min, f.bounds.PreMhLoLstClsPct.max)) continue;
      if (!passMinMax(numLstPrcLstClsPctSafe(s), f.bounds.LstPrcLstClsPct.min, f.bounds.LstPrcLstClsPct.max)) continue;
      if (!passMinMax(numImbExch925(s), f.bounds.ImbExch925.min, f.bounds.ImbExch925.max)) continue;
      if (!passMinMax(numImbExch1555(s), f.bounds.ImbExch1555.min, f.bounds.ImbExch1555.max)) continue;

      // minRate/minTotal
      if (useBinRatingFilter) {
        if (!passesSonarBinRating({
          signal: s,
          cls: f.cls,
          minRate: mr ?? 0,
          minTotal: mt ?? 0,
        })) continue;
      } else {
        if (mr != null) {
          const r = getBestRating(s) ?? (s as any)._bestRating ?? toNum((s as any).rating) ?? null;
          if (r == null || r < mr) continue;
        }
        if (mt != null) {
          const t = getBestTotalByType(s, f.type);
          if (t == null || t < mt) continue;
        }
      }


      // exclude group
      if (f.excludeDividend && hasValue(pickAny(s, ["dividend", "Dividend", "hasDividend", "HasDividend"]))) continue;
      if (f.excludeNews) {
        const nn = toNum((s as any)._newsCount ?? numNews(s)) ?? 0;
        if (nn > 0) continue;
      }
      if (f.excludePTP && (((s as any)._isPTP ?? boolIsPTP(s)) === true)) continue;
      if (f.excludeSSR && (((s as any)._isSSR ?? boolIsSSR(s)) === true)) continue;
      if (f.excludeReport && hasValue(pickAny(s, ["report", "Report"]))) continue;
      if (f.excludeETF) {
        if (boolIsETF(s) === true) continue;
        const eqt = strEquityType(s).toLowerCase();
        if (eqt && eqt.includes("etf")) continue;
      }
      if (f.excludeCrap) {
        const px = numLastClose(s);
        if (px != null && px < 5) continue;
      }


      // include group
      if (f.includeUSA && !isUSA(s)) continue;
      if (f.includeChina) {
        const c = getCountryStr(s);
        if (!c.includes("CHINA") && !c.includes("HONG KONG")) continue;
      }

      // multi
      if (f.countryEnabled && f.selCountries.size > 0 && !f.selCountries.has(getCountry(s))) continue;
      if (f.exchangeEnabled && f.selExchanges.size > 0 && !f.selExchanges.has(getExchange(s))) continue;
      if (f.sectorEnabled && f.selSectors.size > 0 && !f.selSectors.has(getSector(s))) continue;

      // report tri-state
      if (f.filterReport !== "ALL") {
        const rep = (s as any)._reportBool ?? toBool((s as any).report ?? (s as any).Report);
        if (f.filterReport === "YES" && rep !== true) continue;
        if (f.filterReport === "NO" && rep !== false) continue;
      }

      // equity type
      if (eqNeedle) {
        const et = strEquityType(s).toLowerCase();
        if (!et.includes(eqNeedle)) continue;
      }

      // ZAP/SigmaZAP (mutually exclusive)
      if (f.zapMode !== "off") {
        const dir = s.direction;
        const isShort = dir === "down";
        const isLong = dir === "up";
        if (!isShort && !isLong) continue;

        // Start-deviation filter applies only to inactive candidates.
        if (!posActive) {
          if (f.zapMode === "zap") {
            if (isShort) {
              const v = toNum(s.zapS);
              if (v == null || v < zapThr) continue;
            } else {
              const v = toNum(s.zapL);
              if (v == null || v > -zapThr) continue;
            }
          } else if (f.zapMode === "delta") {
            const base = Math.abs(getSignalDeltaThreshold(s) ?? 0.1);
            const deltaThr = base + Math.max(0.05, Number(f.zapShowAbs ?? 0));
            if (isShort) {
              const v = toNum(s.zapSsigma);
              if (v == null || v < deltaThr) continue;
            } else {
              const v = toNum(s.zapLsigma);
              if (v == null || v > -deltaThr) continue;
            }
          } else {
            if (isShort) {
              const v = toNum(s.zapSsigma);
              if (v == null || v < sigThr) continue;
            } else {
              const v = toNum(s.zapLsigma);
              if (v == null || v > -sigThr) continue;
            }
          }
        }
      }

      out.push(s);
    }

    return out;
  }, []);

  /* =========================
    Fetch signals (stable, race-safe)
  ========================= */

  const reqIdRef = useRef(0);
  const inFlightUrlRef = useRef<string | null>(null);
  const fetchSignals = useCallback(async () => {
    const f = filtersRef.current;
    const url = buildSignalsUrl({
      cls: f.cls,
      type: f.type,
      mode: f.mode,
      ratingMode: f.ratingMode,
      zapMode: f.zapMode,
      minRate: f.minRate,
      minTotal: f.minTotal,
      tickers: f.tickersFilterNorm || undefined,
      minCorr: toNum(f.corrMin),
      maxCorr: toNum(f.corrMax),
      minBeta: toNum(f.betaMin),
      maxBeta: toNum(f.betaMax),
      minSigma: toNum(f.sigmaMin),
      maxSigma: toNum(f.sigmaMax),
    });
    if (inFlightUrlRef.current === url) return;
    inFlightUrlRef.current = url;
    const myId = ++reqIdRef.current;

    try {
      setLoading(true);
      setError(null);

      const r = await fetch(url, { cache: "no-store" });

      // ignore if a newer request was fired
      if (myId !== reqIdRef.current) return;

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        setAllItems([]);
        setItems([]);
        setError(`HTTP ${r.status}: ${txt || r.statusText}`);
        return;
      }

      const j = await r.json();
      const rawItems: any[] = Array.isArray(j)
        ? j
        : Array.isArray(j?.items)
        ? j.items
        : [];

      const normalized = rawItems
        .map(normalizeSignal)
        .filter(Boolean) as ArbitrageSignal[];

      const filtered = applyAllClientFilters(normalized, f);
      setAllItems(normalized);
      setItems(filtered);
      setUpdatedAt(Date.now());
    } catch (e: any) {
      if (myId !== reqIdRef.current) return;
      setAllItems([]);
      setItems([]);
      setError(e?.message ?? "Unknown error");
    } finally {
      if (inFlightUrlRef.current === url) inFlightUrlRef.current = null;
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [applyAllClientFilters]);

  // auto refresh (no stale closure)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isEditingRef.current) return;
      fetchSignals();
    }, 2500);

    return () => clearInterval(timer);
  }, [fetchSignals]);

  // refetch on snapshot changes (stable dep)
  const snapshotKey = useMemo(() => {
    // Prefer a single stable field if present.
    if (!snapshot) return "";
    const s: any = snapshot as any;

    const v = s.updatedAt ?? s.ts ?? s.seq ?? s.version;
    if (typeof v === "number" || typeof v === "string") return String(v);

    // Fallback: cheap shallow signature (avoids JSON.stringify on large snapshots)
    try {
      const keys = Object.keys(s).sort();
      const parts: string[] = [];
      const cap = 40;

      for (let i = 0; i < keys.length && i < cap; i++) {
        const k = keys[i];
        const val = s[k];
        if (val == null) parts.push(k);
        else if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") parts.push(`${k}:${val}`);
        else if (Array.isArray(val)) parts.push(`${k}[${val.length}]`);
        else parts.push(`${k}{}`);
      }

      parts.push(`k:${keys.length}`);
      return parts.join("|");
    } catch {
      return "snapshot";
    }
  }, [snapshot]);
  useEffect(() => {
    if (isEditingRef.current) return;
    fetchSignals();
  }, [snapshotKey, fetchSignals]);

  // Re-apply client filters immediately on any local filter change.
  useEffect(() => {
    if (isEditingRef.current) return;
    setItems(applyAllClientFilters(allItems, snapshot));
  }, [allItems, snapshot, applyAllClientFilters, isEditing]);

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
  const bestTotalAny = toNum(bestObj?.total);
  const bestTotalHard = toNum(bestObj?.hard);
  const bestTotalSoft = toNum(bestObj?.soft);
  const bestTotalEff = type === "hard" ? bestTotalHard : type === "soft" ? bestTotalSoft : bestTotalAny;
  const activeWindowRatings = useMemo(() => getWindowRatings(activeData), [activeData]);


  return (
      <div className={`sonar-borderless relative min-h-screen w-full text-zinc-200 font-sans ${accentSelectionClass} selection:text-white p-4 overflow-x-hidden ${isLightTheme ? "sonar-light-theme" : ""}`}>

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* ========================= HEADER ========================= */}
        <header className="bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full border border-white/10 ${accentDotClass} ${loading ? "animate-pulse" : ""}`} />
              <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                ARBITRAGE SONAR
              </h1>

              <div className="flex gap-2 ml-4">
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{classLabel}</span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{modeLabel}</span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">{typeLabel}</span>
                {listMode !== "off" && (
                  <span className={`px-2 py-1 rounded-full border text-[10px] font-mono uppercase ${accentBadgeClass}`}>
                    LIST: {listMode}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              <span>{updatedLabel ? `UPDATED ${updatedLabel}` : "CONNECTING..."}</span>
              <span className="text-zinc-700 mx-1">|</span>
              <span className="opacity-70">minRate {minRate ?? "-"} | minTotal {minTotal ?? "-"}</span>
            </div>
          </div>
          

          <div className="flex items-center gap-3">

          {/* ========================= MODE + ACTIVE FILTER ========================= */}
          <div className="flex items-center gap-3">
            {/* Group 1: MONEY / SCANNER / SONAR */}
            <div className={secondaryGroupClass}>
              {/* MONEY (inactive for now) */}
              <button
                type="button"
                disabled
                className={`${secondaryButtonBaseClass} border-transparent text-zinc-600 bg-transparent cursor-not-allowed`}
                title="MONEY (coming soon)"
              >
                MONEY
              </button>

              {/* SCANNER */}
              <Link
                href="/paper/arbitrage"
                className={`${secondaryButtonBaseClass} ${secondaryButtonInactiveClass}`}
                title="Open /paper/arbitrage"
              >
                SCANNER
              </Link>

              {/* SONAR (current) */}
              <button
                type="button"
                className={`${secondaryButtonBaseClass} ${accentButtonClass}`}
                title="SONAR (current)"
              >
                SONAR
              </button>
            </div>

            {/* Group 2: ACTIVE / INACTIVE / ALL */}
            <div className={secondaryGroupClass}>
              <button
                type="button"
                onClick={() => setActiveMode("onlyActive")}
                className={[
                  secondaryButtonBaseClass,
                  activeMode === "onlyActive"
                    ? accentButtonClass
                    : secondaryButtonInactiveClass,
                ].join(" ")}
                title="Show only ACTIVE positions (PositionBp != 0)"
              >
                ACTIVE
              </button>

              <button
                type="button"
                onClick={() => setActiveMode("onlyInactive")}
                className={[
                  secondaryButtonBaseClass,
                  activeMode === "onlyInactive"
                    ? accentButtonClass
                    : secondaryButtonInactiveClass,
                ].join(" ")}
                title="Show only INACTIVE positions (PositionBp == 0)"
              >
                INACTIVE
              </button>

              <button
                type="button"
                onClick={() => setActiveMode("off")}
                className={[
                  secondaryButtonBaseClass,
                  activeMode === "off"
                    ? accentButtonClass
                    : secondaryButtonInactiveClass,
                ].join(" ")}
                title="Show ALL positions"
              >
                ALL
              </button>
            </div>
          </div>



            {/* ========================= LIST MODES + DRAWER TOGGLES (two-click-areas) ========================= */}
            <div className="flex items-center gap-3">
              <div className={secondaryGroupClass}>
                {/* ---------- IGNORE pill ---------- */}
                <div
                  className={clsx(
                    "flex items-stretch overflow-hidden rounded-lg border transition-all",
                    listMode === "ignore" ? "border-rose-500/30 bg-rose-500/12" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                >
                  {/* MODE area */}
                  <button
                    type="button"
                    onClick={setModeIgnore}
                    className={clsx(
                      "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                      listMode === "ignore" ? "text-rose-300" : "text-zinc-300"
                    )}
                    title="LIST MODE: IGNORE"
                  >
                    <span className="tracking-wide">IGN</span>
                    {ignoreSet.size > 0 && <span className="opacity-70">({ignoreSet.size})</span>}
                  </button>

                  <div className="w-px bg-white/10" />

                  {/* LIST drawer area */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowIgnore((v) => !v);
                    }}
                    className={clsx(
                      "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                      showIgnore ? "text-rose-300" : "text-zinc-400 hover:text-white"
                    )}
                    title={showIgnore ? "Hide IGNORE list" : "Show IGNORE list"}
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

                {/* ---------- APPLY pill ---------- */}
                <div
                  className={clsx(
                    "flex items-stretch overflow-hidden rounded-lg border transition-all",
                    listMode === "apply" ? "border-[#6ee7b7]/25 bg-[#6ee7b7]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                >
                  {/* MODE area */}
                  <button
                    type="button"
                    onClick={setModeApply}
                    className={clsx(
                      "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                      listMode === "apply" ? "text-emerald-300" : "text-zinc-300"
                    )}
                    title="LIST MODE: APPLY"
                  >
                    <span className="tracking-wide">APP</span>
                    {applySet.size > 0 && <span className="opacity-70">({applySet.size})</span>}
                  </button>

                  <div className="w-px bg-white/10" />

                  {/* LIST drawer area */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowApply((v) => !v);
                    }}
                    className={clsx(
                      "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                      showApply ? "text-[#6ee7b7]" : "text-zinc-400 hover:text-white"
                    )}
                    title={showApply ? "Hide APPLY list" : "Show APPLY list"}
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

                {/* ---------- PIN pill ---------- */}
                <div
                  className={clsx(
                    "flex items-stretch overflow-hidden rounded-lg border transition-all",
                    listMode === "pin" ? "border-violet-400/30 bg-violet-400/12" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                >
                  {/* MODE area */}
                  <button
                    type="button"
                    onClick={setModePin}
                    className={clsx(
                      "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                      listMode === "pin" ? "text-violet-200" : "text-zinc-300"
                    )}
                    title="LIST MODE: PIN"
                  >
                    <span className="tracking-wide">PIN</span>
                    {Object.keys(pinMap).length > 0 && <span className="opacity-70">({Object.keys(pinMap).length})</span>}
                  </button>

                  <div className="w-px bg-white/10" />

                  {/* LIST drawer area */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPin((v) => !v);
                    }}
                    className={clsx(
                      "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                      showPin ? "text-violet-300" : "text-zinc-400 hover:text-white"
                    )}
                    title={showPin ? "Hide PIN list" : "Show PIN list"}
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

              {/* REFRESH */}
              <button
                type="button"
                onClick={fetchSignals}
                className={`w-9 h-9 flex items-center justify-center rounded-lg border bg-[#0a0a0a]/40 transition-all active:scale-95 ${accentOutlineButtonClass}`}
                title="Refresh"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={loading ? "animate-spin" : ""}
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
              </button>
            </div>

          </div>
        </header>

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

        <div className="mb-3 flex flex-wrap justify-end gap-3">
          <div className={clsx(secondaryGroupClass, "px-2")}>
            {(["SESSION", "BIN"] as RatingMode[]).map((modeKey) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => setRatingMode(modeKey)}
                className={[
                  secondaryButtonBaseClass,
                  ratingMode === modeKey ? accentButtonClass : secondaryButtonInactiveClass,
                ].join(" ")}
              >
                {modeKey}
              </button>
            ))}
          </div>

          {fields.map((field) => (
            <div key={field.label} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45">
              <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{field.label}</span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode={field.integer ? "numeric" : "decimal"}
                  step={field.step}
                  min={field.min}
                  value={field.val}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) {
                      field.set(field.min);
                      return;
                    }
                    field.set(field.integer ? Math.max(field.min, Math.trunc(next)) : Math.max(field.min, +next.toFixed(4)));
                  }}
                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bumpNumField(field, field.step)} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▲</button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bumpNumField(field, -field.step)} className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▼</button>
                </div>
              </div>
            </div>
          ))}

          {[
            { label: "ρ", title: "Correlation", minValue: corrMin, maxValue: corrMax, setMin: setCorrMin, setMax: setCorrMax, step: 0.05 },
            { label: "β", title: "Beta", minValue: betaMin, maxValue: betaMax, setMin: setBetaMin, setMax: setBetaMax, step: 0.1 },
            { label: "σ", title: "Sigma", minValue: sigmaMin, maxValue: sigmaMax, setMin: setSigmaMin, setMax: setSigmaMax, step: 0.1 },
          ].map((field) => (
            <div key={field.title} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45" title={field.title}>
              <span className="flex h-7 min-w-4 items-center justify-center text-[12px] font-mono text-zinc-500 leading-none">{field.label}</span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input type="number" inputMode="decimal" step={field.step} value={field.minValue} onChange={(e) => field.setMin(e.target.value)} className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]" placeholder="min" />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => field.setMin(String(+(((Number(field.minValue) || 0) + field.step).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▲</button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => field.setMin(String(+(((Number(field.minValue) || 0) - field.step).toFixed(4))))} className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▼</button>
                </div>
              </div>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input type="number" inputMode="decimal" step={field.step} value={field.maxValue} onChange={(e) => field.setMax(e.target.value)} className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]" placeholder="max" />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => field.setMax(String(+(((Number(field.maxValue) || 0) + field.step).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▲</button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => field.setMax(String(+(((Number(field.maxValue) || 0) - field.step).toFixed(4))))} className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors">▼</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ========================= CONTROLS ========================= */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          <div className="flex h-7 items-center gap-2">
            {(["global", "blue", "ark", "print", "open", "intra", "post"] as ArbClass[]).map((c) => (
              <FilterButton
                key={c}
                active={cls === c}
                label={c === "global" ? "GLOB" : c.toUpperCase()}
                onClick={() => setCls(c)}
              />
            ))}
          </div>

          <div className="h-7 w-px self-center bg-white/5" />

          <div className="flex h-7 items-center gap-2">
            <FilterButton active={mode === "all"} label="ALL" onClick={() => setMode("all")} />
            <FilterButton active={mode === "top"} label="TOP" onClick={() => setMode("top")} />
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
            {false && fields.map((f) => (
              <div key={f.label} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20">
                <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{f.label}</span>
                <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    min={f.min}
                    value={Number.isFinite(f.val) ? f.val : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return;
                      let n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      if (f.integer) n = Math.trunc(n);
                      n = Math.max(f.min, n);
                      f.set(n);
                    }}
                    placeholder={f.ph}
                    className={`center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center ${accentTextSoftClass} placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]`}
                  />
                  <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => bumpNumField(f, f.step)}
                      className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                      aria-label={`Increase ${f.label}`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => bumpNumField(f, -f.step)}
                      className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
                      aria-label={`Decrease ${f.label}`}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            ))}

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
                onClick={() => setFiltersCollapsed(!filtersCollapsed)}
                className="flex h-7 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
                title={filtersCollapsed ? "Show Filters" : "Collapse Filters"}
              >
                {filtersCollapsed ? (
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
        {!filtersCollapsed && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
            <MinMax label="ADV20" filterKey="ADV20" mode={rangeModes.ADV20} onToggleMode={toggleRangeMode} min={adv20Min} max={adv20Max} setMin={setAdv20Min} setMax={setAdv20Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ADV20NF" filterKey="ADV20NF" mode={rangeModes.ADV20NF} onToggleMode={toggleRangeMode} min={adv20NFMin} max={adv20NFMax} setMin={setAdv20NFMin} setMax={setAdv20NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ADV90" filterKey="ADV90" mode={rangeModes.ADV90} onToggleMode={toggleRangeMode} min={adv90Min} max={adv90Max} setMin={setAdv90Min} setMax={setAdv90Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ADV90NF" filterKey="ADV90NF" mode={rangeModes.ADV90NF} onToggleMode={toggleRangeMode} min={adv90NFMin} max={adv90NFMax} setMin={setAdv90NFMin} setMax={setAdv90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvPreMhv" filterKey="AvPreMhv" mode={rangeModes.AvPreMhv} onToggleMode={toggleRangeMode} min={avPreMhvMin} max={avPreMhvMax} setMin={setAvPreMhvMin} setMax={setAvPreMhvMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="RoundLot" filterKey="RoundLot" mode={rangeModes.RoundLot} onToggleMode={toggleRangeMode} min={roundLotMin} max={roundLotMax} setMin={setRoundLotMin} setMax={setRoundLotMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="VWAP" filterKey="VWAP" mode={rangeModes.VWAP} onToggleMode={toggleRangeMode} min={vwapMin} max={vwapMax} setMin={setVwapMin} setMax={setVwapMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="Spread" filterKey="Spread" mode={rangeModes.Spread} onToggleMode={toggleRangeMode} min={spreadMin} max={spreadMax} setMin={setSpreadMin} setMax={setSpreadMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="LstPrcL" filterKey="LstPrcL" mode={rangeModes.LstPrcL} onToggleMode={toggleRangeMode} min={lstPrcLMin} max={lstPrcLMax} setMin={setLstPrcLMin} setMax={setLstPrcLMax} startEditing={startEditing} stopEditing={stopEditing} />

            <MinMax label="LstCls" filterKey="LstCls" mode={rangeModes.LstCls} onToggleMode={toggleRangeMode} min={lstClsMin} max={lstClsMax} setMin={setLstClsMin} setMax={setLstClsMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="YCls" filterKey="YCls" mode={rangeModes.YCls} onToggleMode={toggleRangeMode} min={yClsMin} max={yClsMax} setMin={setYClsMin} setMax={setYClsMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="TCls" filterKey="TCls" mode={rangeModes.TCls} onToggleMode={toggleRangeMode} min={tClsMin} max={tClsMax} setMin={setTClsMin} setMax={setTClsMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ClsToCls%" filterKey="ClsToClsPct" mode={rangeModes.ClsToClsPct} onToggleMode={toggleRangeMode} min={clsToClsPctMin} max={clsToClsPctMax} setMin={setClsToClsPctMin} setMax={setClsToClsPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="Lo" filterKey="Lo" mode={rangeModes.Lo} onToggleMode={toggleRangeMode} min={loMin} max={loMax} setMin={setLoMin} setMax={setLoMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="LstClsNewsCnt" filterKey="LstClsNewsCnt" mode={rangeModes.LstClsNewsCnt} onToggleMode={toggleRangeMode} min={lstClsNewsCntMin} max={lstClsNewsCntMax} setMin={setLstClsNewsCntMin} setMax={setLstClsNewsCntMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="MarketCapM" filterKey="MarketCapM" mode={rangeModes.MarketCapM} onToggleMode={toggleRangeMode} min={marketCapMMin} max={marketCapMMax} setMin={setMarketCapMMin} setMax={setMarketCapMMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhVolNF" filterKey="PreMhVolNF" mode={rangeModes.PreMhVolNF} onToggleMode={toggleRangeMode} min={preMhVolNFMin} max={preMhVolNFMax} setMin={setPreMhVolNFMin} setMax={setPreMhVolNFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="VolNFfromLstCls" filterKey="VolNFfromLstCls" mode={rangeModes.VolNFfromLstCls} onToggleMode={toggleRangeMode} min={volNFfromLstClsMin} max={volNFfromLstClsMax} setMin={setVolNFfromLstClsMin} setMax={setVolNFfromLstClsMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvPostMhVol90NF" filterKey="AvPostMhVol90NF" mode={rangeModes.AvPostMhVol90NF} onToggleMode={toggleRangeMode} min={avPostMhVol90NFMin} max={avPostMhVol90NFMax} setMin={setAvPostMhVol90NFMin} setMax={setAvPostMhVol90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvPreMhVol90NF" filterKey="AvPreMhVol90NF" mode={rangeModes.AvPreMhVol90NF} onToggleMode={toggleRangeMode} min={avPreMhVol90NFMin} max={avPreMhVol90NFMax} setMin={setAvPreMhVol90NFMin} setMax={setAvPreMhVol90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvPreMhValue20NF" filterKey="AvPreMhValue20NF" mode={rangeModes.AvPreMhValue20NF} onToggleMode={toggleRangeMode} min={avPreMhValue20NFMin} max={avPreMhValue20NFMax} setMin={setAvPreMhValue20NFMin} setMax={setAvPreMhValue20NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvPreMhValue90NF" filterKey="AvPreMhValue90NF" mode={rangeModes.AvPreMhValue90NF} onToggleMode={toggleRangeMode} min={avPreMhValue90NFMin} max={avPreMhValue90NFMax} setMin={setAvPreMhValue90NFMin} setMax={setAvPreMhValue90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvgDailyValue20" filterKey="AvgDailyValue20" mode={rangeModes.AvgDailyValue20} onToggleMode={toggleRangeMode} min={avgDailyValue20Min} max={avgDailyValue20Max} setMin={setAvgDailyValue20Min} setMax={setAvgDailyValue20Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="AvgDailyValue90" filterKey="AvgDailyValue90" mode={rangeModes.AvgDailyValue90} onToggleMode={toggleRangeMode} min={avgDailyValue90Min} max={avgDailyValue90Max} setMin={setAvgDailyValue90Min} setMax={setAvgDailyValue90Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="Volatility20" filterKey="Volatility20" mode={rangeModes.Volatility20} onToggleMode={toggleRangeMode} min={volatility20Min} max={volatility20Max} setMin={setVolatility20Min} setMax={setVolatility20Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="Volatility90" filterKey="Volatility90" mode={rangeModes.Volatility90} onToggleMode={toggleRangeMode} min={volatility90Min} max={volatility90Max} setMin={setVolatility90Min} setMax={setVolatility90Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhMDV20NF" filterKey="PreMhMDV20NF" mode={rangeModes.PreMhMDV20NF} onToggleMode={toggleRangeMode} min={preMhMDV20NFMin} max={preMhMDV20NFMax} setMin={setPreMhMDV20NFMin} setMax={setPreMhMDV20NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhMDV90NF" filterKey="PreMhMDV90NF" mode={rangeModes.PreMhMDV90NF} onToggleMode={toggleRangeMode} min={preMhMDV90NFMin} max={preMhMDV90NFMax} setMin={setPreMhMDV90NFMin} setMax={setPreMhMDV90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="VolRel" filterKey="VolRel" mode={rangeModes.VolRel} onToggleMode={toggleRangeMode} min={volRelMin} max={volRelMax} setMin={setVolRelMin} setMax={setVolRelMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhHiLstPrc%" filterKey="PreMhBidLstPrcPct" mode={rangeModes.PreMhBidLstPrcPct} onToggleMode={toggleRangeMode} min={preMhBidLstPrcPctMin} max={preMhBidLstPrcPctMax} setMin={setPreMhBidLstPrcPctMin} setMax={setPreMhBidLstPrcPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhLoLstPrc%" filterKey="PreMhLoLstPrcPct" mode={rangeModes.PreMhLoLstPrcPct} onToggleMode={toggleRangeMode} min={preMhLoLstPrcPctMin} max={preMhLoLstPrcPctMax} setMin={setPreMhLoLstPrcPctMin} setMax={setPreMhLoLstPrcPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhHiLstCls%" filterKey="PreMhHiLstClsPct" mode={rangeModes.PreMhHiLstClsPct} onToggleMode={toggleRangeMode} min={preMhHiLstClsPctMin} max={preMhHiLstClsPctMax} setMin={setPreMhHiLstClsPctMin} setMax={setPreMhHiLstClsPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="PreMhLoLstCls%" filterKey="PreMhLoLstClsPct" mode={rangeModes.PreMhLoLstClsPct} onToggleMode={toggleRangeMode} min={preMhLoLstClsPctMin} max={preMhLoLstClsPctMax} setMin={setPreMhLoLstClsPctMin} setMax={setPreMhLoLstClsPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="LstPrcLstCls%" filterKey="LstPrcLstClsPct" mode={rangeModes.LstPrcLstClsPct} onToggleMode={toggleRangeMode} min={lstPrcLstClsPctMin} max={lstPrcLstClsPctMax} setMin={setLstPrcLstClsPctMin} setMax={setLstPrcLstClsPctMax} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ImbExch9:25" filterKey="ImbExch925" mode={rangeModes.ImbExch925} onToggleMode={toggleRangeMode} min={imbExch925Min} max={imbExch925Max} setMin={setImbExch925Min} setMax={setImbExch925Max} startEditing={startEditing} stopEditing={stopEditing} />
            <MinMax label="ImbExch15:55" filterKey="ImbExch1555" mode={rangeModes.ImbExch1555} onToggleMode={toggleRangeMode} min={imbExch1555Min} max={imbExch1555Max} setMin={setImbExch1555Min} setMax={setImbExch1555Max} startEditing={startEditing} stopEditing={stopEditing} />
          </div>
        )}

        <div className="hidden mb-3 flex flex-wrap justify-end gap-3">
          <div className={clsx(secondaryGroupClass, "px-2")}>
            {(["SESSION", "BIN"] as RatingMode[]).map((modeKey) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => setRatingMode(modeKey)}
                className={[
                  secondaryButtonBaseClass,
                  ratingMode === modeKey ? accentButtonClass : secondaryButtonInactiveClass,
                ].join(" ")}
              >
                {modeKey}
              </button>
            ))}
          </div>

          {fields.map((field) => (
            <div key={field.label} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45">
              <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{field.label}</span>
              <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                <input
                  type="number"
                  inputMode={field.integer ? "numeric" : "decimal"}
                  step={field.step}
                  min={field.min}
                  value={field.val}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) {
                      field.set(field.min);
                      return;
                    }
                    field.set(field.integer ? Math.max(field.min, Math.trunc(next)) : Math.max(field.min, +next.toFixed(4)));
                  }}
                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
                />
                <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bumpNumField(field, field.step)}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bumpNumField(field, -field.step)}
                    className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          ))}

          {[
            { label: "ρ", title: "Correlation", minValue: corrMin, maxValue: corrMax, setMin: setCorrMin, setMax: setCorrMax, step: 0.05 },
            { label: "β", title: "Beta", minValue: betaMin, maxValue: betaMax, setMin: setBetaMin, setMax: setBetaMax, step: 0.1 },
            { label: "σ", title: "Sigma", minValue: sigmaMin, maxValue: sigmaMax, setMin: setSigmaMin, setMax: setSigmaMax, step: 0.1 },
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
                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
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
                  className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]"
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

        {/* ========================= BOOLEAN & MULTI-SELECT FILTERS ========================= */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          <span className="flex h-[40px] items-center text-zinc-500 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </span>

          {/* RED GROUP */}
          <div className={`${SONAR_FILTER_GROUP_BASE} border-rose-500/20 bg-rose-500/[0.06]`}>
            {[
              { label: "Div", val: excludeDividend, set: setExcludeDividend },
              { label: "News", val: excludeNews, set: setExcludeNews },
              { label: "PTP", val: excludePTP, set: setExcludePTP },
              { label: "SSR", val: excludeSSR, set: setExcludeSSR },
              { label: "Rep", val: excludeReport, set: setExcludeReport },
              { label: "ETF", val: excludeETF, set: setExcludeETF },
              { label: "CRAP", val: excludeCrap, set: setExcludeCrap, title: "LstClose < 5" },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => b.set(!b.val)}
                title={b.title}
                className={`${SONAR_FILTER_INNER_PILL} ${
                  b.val ? "bg-rose-500 text-white border-transparent shadow-[0_0_16px_rgba(244,63,94,0.42)]" : "bg-transparent border-transparent text-rose-500 hover:bg-rose-500/10"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* GREEN GROUP */}
          <div className={`${SONAR_FILTER_GROUP_BASE} border-[rgba(6,78,59,0.55)] bg-[rgba(6,78,59,0.18)]`}>
            {[
              { label: "USA", val: includeUSA, set: setIncludeUSA },
              { label: "CHINA", val: includeChina, set: setIncludeChina },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => b.set(!b.val)}
                className={`${SONAR_FILTER_INNER_PILL} ${
                  b.val ? "bg-[rgba(16,185,129,0.95)] text-white border-transparent shadow-[0_0_16px_rgba(16,185,129,0.36)]" : "bg-transparent border-transparent text-[#34d399] hover:bg-[rgba(16,185,129,0.10)]"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* YELLOW GROUP */}
          <div className={`${SONAR_FILTER_GROUP_BASE} border-yellow-200/20 bg-yellow-200/[0.06]`}>
            <MultiSelectFilter
              label="Country"
              options={allCountries}
              selected={selCountries}
              setSelected={setSelCountries}
              enabled={countryEnabled}
              toggleEnabled={() => setCountryEnabled(!countryEnabled)}
              color="amber"
            />
            <MultiSelectFilter
              label="Exchange"
              options={allExchanges}
              selected={selExchanges}
              setSelected={setSelExchanges}
              enabled={exchangeEnabled}
              toggleEnabled={() => setExchangeEnabled(!exchangeEnabled)}
              color="amber"
            />
            <MultiSelectFilter
              label="Sector"
              options={allSectors}
              selected={selSectors}
              setSelected={setSelSectors}
              enabled={sectorEnabled}
              toggleEnabled={() => setSectorEnabled(!sectorEnabled)}
              color="amber"
            />
          </div>

          <div className="flex-1" />          

          {/* SORT (blue group; MSF-like control; one toggle button; no "SORT" label) */}
          <div className={`ml-auto ${SONAR_FILTER_GROUP_BASE} border-sky-500/20 bg-sky-500/[0.06]`}>
            {/* dropdown control styled like MSF (but BLUE) */}
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


          </div>

          {/* CORR (pink group; button + threshold input) */}
          <div className="hidden">
            <button
              type="button"
              onClick={() => setCorrEnabled((v) => !v)}
              className={[
                SONAR_FILTER_INNER_PILL,
                corrEnabled
                  ? "bg-pink-500 text-white border-transparent shadow-[0_0_16px_rgba(236,72,153,0.38)]"
                  : "bg-transparent border-transparent text-pink-300/70 hover:bg-pink-500/10 hover:text-pink-200",
              ].join(" ")}
              title="Toggle correlation hide filter"
            >
              CORR
            </button>
              <div className={clsx("group relative w-[72px]", !corrEnabled && "opacity-60")}>
                <input
                  type="number"
                  step={0.05}
                  min={0.5}
                  max={1.0}
                  value={corrAbs}
                  disabled={!corrEnabled}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    const v = Number.isFinite(raw) ? raw : 0.5;
                    const clamped = Math.min(1.0, Math.max(0.5, v));
                    setCorrAbs(clamped);
                  }}
                  className={[
                    "center-spin w-full h-7 rounded-md !pl-2 !pr-5 text-[11px] font-mono text-center tabular-nums leading-none transition-all focus:outline-none",
                    corrEnabled
                      ? "bg-black/25 border border-transparent text-pink-100"
                      : "bg-black/10 border border-white/10 text-zinc-600 cursor-not-allowed",
                  ].join(" ")}
                  title="Threshold in [0.5..1.0] for |corr|"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button
                    type="button"
                    disabled={!corrEnabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCorrAbs((v) => Math.min(1.0, Math.max(0.5, +(v + 0.05).toFixed(4))))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    aria-label="Increase correlation threshold"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={!corrEnabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCorrAbs((v) => Math.min(1.0, Math.max(0.5, +(v - 0.05).toFixed(4))))}
                    className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                    aria-label="Decrease correlation threshold"
                  >
                    ▼
                  </button>
                </div>
              </div>
          </div>

          <div className="hidden">
            {[
              { label: "CORR MIN", value: corrMin, setValue: setCorrMin, step: 0.05 },
              { label: "CORR MAX", value: corrMax, setValue: setCorrMax, step: 0.05 },
              { label: "BETA MIN", value: betaMin, setValue: setBetaMin, step: 0.1 },
              { label: "BETA MAX", value: betaMax, setValue: setBetaMax, step: 0.1 },
              { label: "SIGMA MIN", value: sigmaMin, setValue: setSigmaMin, step: 0.1 },
              { label: "SIGMA MAX", value: sigmaMax, setValue: setSigmaMax, step: 0.1 },
            ].map((field) => (
              <div key={field.label} className="flex h-7 items-center pl-3 pr-0 rounded-lg bg-black/20">
                <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{field.label}</span>
                <div className="group relative h-7 w-14 overflow-hidden rounded-md">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={field.step}
                    value={field.value}
                    onChange={(e) => field.setValue(e.target.value)}
                    className="center-spin h-7 w-full bg-transparent border-0 !pl-2 !pr-4 text-[10px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none transition-all"
                  />
                  <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const next = (toNum(field.value) ?? 0) + field.step;
                        field.setValue(String(+next.toFixed(4)));
                      }}
                      className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const next = (toNum(field.value) ?? 0) - field.step;
                        field.setValue(String(+next.toFixed(4)));
                      }}
                      className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>


          {/* ZAP FILTERS */}
          <div className={`ml-auto ${SONAR_FILTER_GROUP_BASE} border-violet-500/20 bg-violet-500/[0.06]`}>
            {/* mode toggles */}
            <button
              type="button"
              onClick={() => setZapMode((m) => (m === "zap" ? "off" : "zap"))}
              className={[
                SONAR_FILTER_INNER_PILL,
                zapMode === "zap"
                  ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                  : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200",
              ].join(" ")}
            >
              % ZAP
            </button>

            <button
              type="button"
              onClick={() => setZapMode((m) => (m === "sigma" ? "off" : "sigma"))}
              className={[
                `${SONAR_FILTER_INNER_PILL} gap-1`,
                zapMode === "sigma"
                  ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                  : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200",
              ].join(" ")}
            >
              <span className="leading-none" style={{ textTransform: "none" }}>σ ZAP</span>
            </button>

            <button
              type="button"
              onClick={() => setZapMode((m) => (m === "delta" ? "off" : "delta"))}
              className={[
                `${SONAR_FILTER_INNER_PILL} gap-1`,
                zapMode === "delta"
                  ? "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]"
                  : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200",
              ].join(" ")}
              title="Use sigma threshold above direction-specific median print plus the first input delta"
            >
              <span className="leading-none" style={{ textTransform: "none" }}>Δ ZAP</span>
            </button>

            {/* 1) show/filter threshold (single) */}
            <div className={clsx("group relative w-[78px]", zapMode === "off" && "opacity-60")}>
              <input
                type="number"
                step={zapMode === "zap" ? 0.1 : 0.05}
                min={zapMode === "zap" ? 0.3 : 0.05}
                value={zapShowAbs}
                disabled={zapMode === "off"}
                onChange={(e) => {
                  const v = clampFloat(e.target.value, zapMode === "zap" ? 0.3 : 0.05);
                  setZapShowAbs(v);
                }}
                className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                title={zapMode === "delta" ? "Additional delta above direction-specific median print" : "Threshold for filtering (ZAP or SIGZAP depending on mode)"}
              />
              <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapShowAbs((v) => Math.max(zapMode === "zap" ? 0.3 : 0.05, +(v + (zapMode === "zap" ? 0.1 : 0.05)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                  aria-label="Increase zap threshold"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapShowAbs((v) => Math.max(zapMode === "zap" ? 0.3 : 0.05, +(v - (zapMode === "zap" ? 0.1 : 0.05)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                  aria-label="Decrease zap threshold"
                >
                  ▼
                </button>
              </div>
            </div>

            {/* 2) SILVER (too high) */}
            <div className={clsx("group relative w-[78px]", zapMode === "off" && "opacity-60")}>
              <input
                type="number"
                step={zapMode === "sigma" ? 0.1 : 0.5}
                min={0}
                value={zapSilverAbs}
                disabled={zapMode === "off"}
                onChange={(e) => setZapSilverAbs(clampFloat(e.target.value, 0))}
                className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                title="SILVER highlight when |metric| >= this (active+inactive)"
              />
              <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapSilverAbs((v) => Math.max(0, +(v + (zapMode === "sigma" ? 0.1 : 0.5)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                  aria-label="Increase silver threshold"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapSilverAbs((v) => Math.max(0, +(v - (zapMode === "sigma" ? 0.1 : 0.5)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                  aria-label="Decrease silver threshold"
                >
                  ▼
                </button>
              </div>
            </div>

            {/* 3) GOLD (only active normalization) */}
            <div className={clsx("group relative w-[78px]", zapMode === "off" && "opacity-60")}>
              <input
                type="number"
                step={zapMode === "sigma" ? 0.05 : 0.1}
                min={0}
                value={zapGoldAbs}
                disabled={zapMode === "off"}
                onChange={(e) => setZapGoldAbs(clampFloat(e.target.value, 0))}
                className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                title="GOLD highlight when |metric| <= this (ONLY active positions)"
              />
              <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapGoldAbs((v) => Math.max(0, +(v + (zapMode === "sigma" ? 0.05 : 0.1)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                  aria-label="Increase gold threshold"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={zapMode === "off"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setZapGoldAbs((v) => Math.max(0, +(v - (zapMode === "sigma" ? 0.05 : 0.1)).toFixed(4)))}
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40"
                  aria-label="Decrease gold threshold"
                >
                  ▼
                </button>
              </div>
            </div>

          </div>

        </div>

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
        {activePanelVisible && (
          <div className="relative overflow-hidden border border-white/10 rounded-2xl bg-black/40 animate-in fade-in zoom-in-95 duration-300">
            <div className={`absolute inset-y-0 left-0 w-px ${accentLineClass}`} />
            <div className="relative flex flex-col gap-3 px-4 py-3 border-b border-white/10 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex flex-col gap-2 lg:justify-center">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-lg leading-none font-mono font-semibold tracking-[0.08em] text-white">{activeTicker ?? "-"}</span>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                    <span>Exchange: <span className="text-zinc-200">{activeExchange2 !== "-" ? activeExchange2 : "-"}</span></span>
                    <span>Bench: <span className="text-zinc-200">{activeBench !== "-" ? activeBench : "-"}</span></span>
                    <span>Beta: <span className="text-zinc-200">{activeBeta == null ? "-" : fmtNum(activeBeta, 2)}</span></span>
                    <span>Sig: <span className="text-zinc-200">{activeSigma == null ? "-" : fmtNum(activeSigma, 2)}</span></span>
                    <span>Rate: <span className={accentTextClass}>{bestRating == null ? "-" : `${Math.round(bestRating * 100)}%`}</span></span>
                    <span>N: <span className="text-zinc-200">{bestTotalEff == null ? "-" : fmtMaybeInt(bestTotalEff)}</span></span>
                    <span>MD Print Pos: <span className="text-zinc-200">{activeMdPrintPos == null ? "-" : fmtNum(activeMdPrintPos, 2)}</span></span>
                    <span>MD Print Neg: <span className="text-zinc-200">{activeMdPrintNeg == null ? "-" : fmtNum(activeMdPrintNeg, 2)}</span></span>
                  </div>
                </div>

                {activeLoading && <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500 animate-pulse">loading data stream...</div>}
                {activeErr && <div className="w-fit text-[11px] text-rose-300 font-mono bg-rose-500/10 px-2 py-1 border border-rose-500/20">{activeErr}</div>}
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                <button
                  type="button"
                  disabled={!activeTickerNorm}
                  onClick={() => {
                    if (!activeTickerNorm) return;
                    if (activeInIgnoreList) removeFromSet(setIgnoreSet, IGNORE_LS_KEY, activeTickerNorm);
                    else {
                      addToSet(setIgnoreSet, IGNORE_LS_KEY, [activeTickerNorm]);
                      if (listMode === "off") setListMode("ignore");
                    }
                  }}
                  className={[
                    "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
                    !activeTickerNorm
                      ? "border-white/10 text-zinc-600 opacity-50 cursor-not-allowed"
                      : activeInIgnoreList
                        ? "border-rose-500/35 bg-rose-500/12 text-rose-300"
                        : "border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.05]",
                  ].join(" ")}
                  title={activeInIgnoreList ? "Remove ticker from Ignore List" : "Add ticker to Ignore List"}
                >
                  IGN
                </button>

                <button
                  type="button"
                  disabled={!activeTickerNorm}
                  onClick={() => {
                    if (!activeTickerNorm) return;
                    if (activeInApplyList) removeFromSet(setApplySet, APPLY_LS_KEY, activeTickerNorm);
                    else {
                      addToSet(setApplySet, APPLY_LS_KEY, [activeTickerNorm]);
                      if (listMode === "off") setListMode("apply");
                    }
                  }}
                  className={[
                    "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
                    !activeTickerNorm
                      ? "border-white/10 text-zinc-600 opacity-50 cursor-not-allowed"
                      : activeInApplyList
                        ? "border-[#6ee7b7]/35 bg-[#6ee7b7]/12 text-[#6ee7b7]"
                        : "border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.05]",
                  ].join(" ")}
                  title={activeInApplyList ? "Remove ticker from Apply Only List" : "Add ticker to Apply Only List"}
                >
                  APP
                </button>

                <button
                  type="button"
                  disabled={!activeTickerNorm}
                  onClick={() => {
                    if (!activeTickerNorm) return;
                    if (activePinColor) removePin(activeTickerNorm);
                    else {
                      addPins([activeTickerNorm], pinColor);
                      if (listMode === "off") setListMode("pin");
                    }
                  }}
                  className={[
                    "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
                    !activeTickerNorm
                      ? "border-white/10 text-zinc-600 opacity-50 cursor-not-allowed"
                      : activePinColor
                        ? "border-violet-500/35 bg-violet-500/12 text-violet-200"
                        : "border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.05]",
                  ].join(" ")}
                  title={activePinColor ? "Remove ticker from Pin List" : "Add ticker to Pin List"}
                >
                  PIN
                </button>

                <button
                  onClick={() => setActivePanelMode((m) => (m === "mini" ? "expanded" : "mini"))}
                  className="inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-300 hover:bg-white/[0.05] transition-colors"
                >
                  {activePanelMode === "mini" ? "EXPAND" : "MINI"}
                </button>

                <button
                  onClick={() => setActivePanelCollapsed(!activePanelCollapsed)}
                  className="inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-[10px] font-mono text-zinc-300 hover:bg-white/[0.05] transition-colors group"
                  title={activePanelCollapsed ? "Show Panel" : "Collapse Panel"}
                >
                  {activePanelCollapsed ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            {!activePanelCollapsed && (
              <div className="relative p-4 space-y-4">
                {(() => {
                  const s = activeData;
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
                        {renderCell("Spread", s ? (numSpread(s) == null ? "-" : fmtNum(numSpread(s)!, 4)) : "-")}
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
          </div>
        )}

        {activePanelVisible && (
          <div
            className={[
              "rounded-2xl bg-black/40 px-4 py-3",
              activeGoldTickers.length > 0
                ? "border border-amber-500/20 bg-amber-500/[0.03]"
                : sonarAccent.panelSoft,
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
          <div className="p-8 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500 font-mono text-sm tracking-widest text-center">
            {loading ? "SCANNING MARKETS..." : "NO SIGNALS DETECTED"}
          </div>
        )}

        {!error && hasAny && (
          <div className="space-y-3">
            {(() => {
              const visible = new Set(benchBlocks.map((b) => b.benchmark));
              const activePairs = pairMutualExclusion.filter((p) => p.active && visible.has(p.aBench) && visible.has(p.bBench));
              if (!activePairs.length) return null;

              return (
                <div className={`px-3 py-2 rounded-lg border ${sonarAccent.panelSoft}`}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {benchBlocks.map((bench) => {
              return (
                <div
                  key={bench.benchmark}
                  className="flex min-w-0 flex-col self-start"
                >
                  <HedgeHeaderMinimal bench={bench.benchmark} info={hedgeByBench.get(bench.benchmark) ?? null} />

                  <div className="px-4 pb-3">
                    <div className="h-px bg-white/5" />
                  </div>

                  <div className="space-y-6">
                    {bench.buckets.map((g) => {
                      const isExpanded = !!expandedMap[g.id];
                      const rowsToShow = isExpanded ? g.rows.length : Math.min(10, g.rows.length);

                      return (
                        <div key={g.id} className="border border-white/5 bg-[#0a0a0a]/40 rounded-xl overflow-hidden">
                          <div className="grid grid-cols-[20px_1fr_20px] items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0a0a0a]/40">
                            <div className="flex h-5 w-5 items-center justify-center text-rose-400/90">
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 12 12"
                                className="h-3.5 w-3.5 drop-shadow-[0_0_6px_rgba(251,113,133,0.2)]"
                                fill="currentColor"
                              >
                                <path d="M6 9.5 1.75 3h8.5L6 9.5Z" />
                              </svg>
                            </div>
                            <div className="text-center text-xs font-mono font-medium text-zinc-400 uppercase tracking-wide">
                              {betaLabels[g.betaKey]}
                            </div>
                            <div className="flex h-5 w-5 items-center justify-center text-[#6ee7b7]">
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 12 12"
                                className="h-3.5 w-3.5 drop-shadow-[0_0_6px_rgba(110,231,183,0.22)]"
                                fill="currentColor"
                              >
                                <path d="M6 2.5 10.25 9h-8.5L6 2.5Z" />
                              </svg>
                            </div>
                          </div>

                          <div className="p-2 grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-2">
                              {(g.rows
                                .slice(0, rowsToShow)
                                .map((r) => r.short)
                                .filter(Boolean) as ArbitrageSignal[]
                              ).map((s) => (
                                <SignalCard
                                  key={`S-${s.ticker}`}
                                  s={s}
                                  side="short"
                                  onClick={onTickerClick}
                                  activeTicker={activeTicker}
                                  flashClass={flashClass}
                                  zapMode={zapMode}
                                  zapShowAbs={zapShowAbs}
                                  zapSilverAbs={zapSilverAbs}
                                  zapGoldAbs={zapGoldAbs}
                                  pinColor={pinMap[s.ticker] ?? null}
                                />
                              ))}
                            </div>

                            <div className="flex flex-col gap-2">
                              {(g.rows
                                .slice(0, rowsToShow)
                                .map((r) => r.long)
                                .filter(Boolean) as ArbitrageSignal[]
                              ).map((s) => (
                                <SignalCard
                                  key={`L-${s.ticker}`}
                                  s={s}
                                  side="long"
                                  onClick={onTickerClick}
                                  activeTicker={activeTicker}
                                  flashClass={flashClass}
                                  zapMode={zapMode}
                                  zapShowAbs={zapShowAbs}
                                  zapSilverAbs={zapSilverAbs}
                                  zapGoldAbs={zapGoldAbs}
                                  pinColor={pinMap[s.ticker] ?? null}
                                />
                              ))}
                            </div>
                          </div>
                          {g.rows.length > 10 && (
                            <button
                              onClick={() => toggleBucket(g.id)}
                              className="w-full py-2 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border-t border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
                            >
                              {isExpanded ? "SHOW LESS" : `SHOW ALL (${g.rows.length})`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
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


