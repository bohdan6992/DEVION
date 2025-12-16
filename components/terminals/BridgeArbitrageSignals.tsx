"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useUi } from "@/components/UiProvider";

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
  company?: string;
  Company?: string;
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

  [k: string]: any;
};

type Mode = "top" | "all";
type BetaKey = "lt1" | "b1_1_5" | "b1_5_2" | "gt2" | "unknown";
type RowPair = { short?: ArbitrageSignal; long?: ArbitrageSignal };
type BucketGroup = { id: string; benchmark: string; betaKey: BetaKey; rows: RowPair[] };
type BenchBlock = { benchmark: string; buckets: BucketGroup[] };

type ArbClass = "ark" | "print" | "open" | "intra" | "post" | "global";
type ArbType = "any" | "hard" | "soft";

/* =========================
   CONFIG / CONSTANTS
========================= */
const betaLabels: Record<BetaKey, string> = {
  lt1: "< 1.0",
  b1_1_5: "1.0 – 1.5",
  b1_5_2: "1.5 – 2.0",
  gt2: "> 2.0",
  unknown: "N/A",
};

const benchmarkOrder = ["QQQ", "SPY", "IWM", "XLF", "KRE", "XLE", "SOXL", "GDX", "KWEB", "BITO"];

const BENCH_COLORS: Record<string, string> = {
  QQQ: "#c084fc",
  SPY: "#4ade80",
  IWM: "#fb923c",
  XLF: "#38bdf8",
  KRE: "#22d3ee",
  XLE: "#f87171",
  SOXL: "#2dd4bf",
  GDX: "#facc15",
  KWEB: "#e879f9",
  BITO: "#fcd34d",
  DEFAULT: "#94a3b8",
};

const parseBetaKey = (raw?: string | null): BetaKey => {
  if (!raw) return "unknown";
  const b = Number(String(raw).replace(",", "."));
  if (Number.isNaN(b)) return "unknown";
  if (b < 1) return "lt1";
  if (b < 1.5) return "b1_1_5";
  if (b < 2) return "b1_5_2";
  return "gt2";
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

const betaOrder: BetaKey[] = ["lt1", "b1_1_5", "b1_5_2", "gt2", "unknown"];

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("en-US", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });

const fmtInt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : Math.round(v).toLocaleString("en-US"));

const BRIDGE_BASE = process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ?? "http://localhost:5197";

const IGNORE_LS_KEY = "bridge.arb.ignoreTickers.v2";
const APPLY_LS_KEY = "bridge.arb.applyOnlyTickers.v1";

type MinMaxProps = {
  label: string;
  min: string;
  max: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  minPh?: string;
  maxPh?: string;
  startEditing: () => void;
  stopEditing: () => void;
};

export const MinMax = React.memo(function MinMax(props: MinMaxProps) {
  return (
    <div
      className={`group flex flex-col gap-1 p-2 rounded-xl border transition-all ${
        props.min || props.max
          ? "border-emerald-500/30 bg-emerald-500/[0.05]"
          : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10"
      }`}
      onFocusCapture={props.startEditing}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        props.stopEditing();
      }}
    >
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono truncate mr-1">
          {props.label}
        </span>
        {(props.min || props.max) && (
          <button
            type="button"
            onClick={() => { props.setMin(""); props.setMax(""); }}
            className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
          >
            CLR
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="w-full bg-black/20 border border-white/5 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 tabular-nums text-center"
          value={props.min}
          placeholder={props.minPh ?? "min"}
          onChange={(e) => props.setMin(e.target.value)}
        />
        <input
          className="w-full bg-black/20 border border-white/5 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 tabular-nums text-center"
          value={props.max}
          placeholder={props.maxPh ?? "max"}
          onChange={(e) => props.setMax(e.target.value)}
        />
      </div>
    </div>
  );
});


/* =========================
   HELPERS
========================= */
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
  const detectDelim = (line: string) => ((line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",");
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

const toNum = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(",", "."));
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

const getAccountStr = (s: any) => String(s?.account ?? s?.Account ?? "").trim();
const hasAccount = (s: any) => getAccountStr(s).length > 0;

const makeCmpAccountThenTicker = (nonEmptyFirst: boolean) => {
  return (a: any, b: any) => {
    const ea = hasAccount(a) ? 1 : 0;
    const eb = hasAccount(b) ? 1 : 0;
    const pa = nonEmptyFirst ? -ea : ea;
    const pb = nonEmptyFirst ? -eb : eb;
    if (pa !== pb) return pa - pb;
    return String(a?.ticker ?? "").localeCompare(String(b?.ticker ?? ""));
  };
};

const getCountryStr = (s: any) => String(getCountry(s) ?? "").trim().toUpperCase();

const isUSA = (s: any) => {
  const c = getCountryStr(s);
  return c === "UNITED STATES" || c === "USA" || c === "US" || c === "UNITED STATES OF AMERICA";
};



const getMeta = (d: any) => d?.meta ?? d?.Meta ?? null;
const getBestObj = (d: any) => d?.best ?? d?.Best ?? null;

const getBestRating = (d: any) =>
  toNum(getBestObj(d)?.rating ?? getBestObj(d)?.Rating ?? getBestObj(d)?.rate ?? getBestObj(d)?.Rate ?? null);

const getBestTotal = (d: any) =>
  toNum(getBestObj(d)?.total ?? getBestObj(d)?.Total ?? getBestObj(d)?.count ?? getBestObj(d)?.Count ?? null);

const getCompany = (d: any) => String(getMeta(d)?.company ?? getMeta(d)?.Company ?? d?.company ?? d?.Company ?? "—");
const getCountry = (d: any) => String(getMeta(d)?.country ?? getMeta(d)?.Country ?? d?.country ?? d?.Country ?? "—");
const getSector = (d: any) => String(getMeta(d)?.sector ?? getMeta(d)?.Sector ?? d?.sector ?? d?.Sector ?? "—");

/** extra active fields */
const getLstPrc = (d: any) =>
  toNum(d?.lstPrc ?? d?.LstPrc ?? getMeta(d)?.lstPrc ?? getMeta(d)?.LstPrc ?? d?.last ?? d?.Last) ?? null;
const getExchange = (d: any) => String(d?.exchange ?? d?.Exchange ?? getMeta(d)?.exchange ?? getMeta(d)?.Exchange ?? "—");
const getTrdStatus = (d: any) => String(d?.trdStatus ?? d?.TrdStatus ?? getMeta(d)?.trdStatus ?? getMeta(d)?.TrdStatus ?? "—");
const getMarketCapM = (d: any) => toNum(d?.marketCapM ?? d?.MarketCapM ?? getMeta(d)?.marketCapM ?? getMeta(d)?.MarketCapM) ?? null;
const getTierBP = (d: any) => toNum(d?.tierBP ?? d?.TierBP ?? getMeta(d)?.tierBP ?? getMeta(d)?.TierBP) ?? null;

// Robust readers
const pick = (obj: any, keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
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

const numSpread = (s: any) => getNumAny(s, ["spread", "Spread"]);
const numLastClose = (s: any) => getNumAny(s, ["lstClose", "lastClose", "LastClose", "close", "Close"]);
const numAvg90 = (s: any) => getNumAny(s, ["avg90", "Avg90", "adv90", "ADV90", "Adv90"]);
const numAvPreMh = (s: any) => getNumAny(s, ["avPreMh", "AvPreMh", "avPreMhv", "AvPreMhv", "AvPreMhv", "AvPreMhv"]);

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

// Calculated: VolNFfromLstCls = PreMktVolNF * LastClose
const numVolNFfromLstCls = (s: any) => {
  const vol = numPreMktVolNF(s);
  const prc = numLastClose(s);
  if (vol != null && prc != null) return vol * prc;
  return null;
};

const strEquityType = (s: any) => getStrAny(s, ["equityType", "EquityType", "eqType", "EqType"], "");
const boolDividend = (s: any) => getBoolAny(s, ["dividend", "Dividend", "hasDividend", "HasDividend"]);
const numNews = (s: any) => getNumAny(s, ["news", "News", "newsCount", "NewsCount"]);

const boolIsPTP = (s: any) => getBoolAny(s, ["isPTP", "IsPTP", "ptp", "PTP"]);
const boolIsSSR = (s: any) => getBoolAny(s, ["isSSR", "IsSSR", "ssr", "SSR"]);
const boolIsActive = (s: any) => getBoolAny(s, ["active", "Active", "isActive", "IsActive"]);
const boolIsETF = (s: any) => getBoolAny(s, ["etf", "ETF", "isEtf", "IsEtf", "isETF", "IsETF"]);

/* =========================
   Active helpers
========================= */
const calcPct = (px: number | null, ref: number | null) => {
  if (px == null || ref == null || ref === 0) return null;
  return ((px - ref) / ref) * 100;
};
const fmtPct = (v: number | null | undefined, digits = 2) => (v == null || Number.isNaN(v) ? "—" : `${fmtNum(v, digits)}%`);
const fmtMaybeInt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : Math.round(v).toLocaleString("en-US"));
const firstNonNullNum = (...vals: any[]) => {
  for (const x of vals) {
    const n = toNum(x);
    if (n != null) return n;
  }
  return null;
};

/* =========================
   API NORMALIZER
========================= */
function normalizeSignal(raw: any): ArbitrageSignal | null {
  if (!raw) return null;

  const ticker = normalizeTicker(String(raw.ticker ?? raw.Ticker ?? ""));
  if (!ticker) return null;

  const benchmark = String(raw.benchmark ?? raw.Benchmark ?? raw.bench ?? raw.Bench ?? "UNKNOWN").toUpperCase();
  const betaBucket = raw.betaBucket ?? raw.BetaBucket ?? raw.beta_bucket ?? raw.beta_bucket_str ?? raw.beta ?? raw.Beta ?? null;
  const sideStr = String(raw.side ?? raw.Side ?? raw.dir ?? raw.Dir ?? raw.direction ?? raw.Direction ?? "").toLowerCase();

  let direction: "up" | "down" | "none" = "none";
  if (sideStr.includes("short") || sideStr === "s" || sideStr === "sell") direction = "down";
  else if (sideStr.includes("long") || sideStr === "l" || sideStr === "buy") direction = "up";
  else if (raw.direction === "up" || raw.direction === "down" || raw.direction === "none") direction = raw.direction;

  const sig =
    (typeof raw.sig === "number" ? raw.sig : null) ??
    (typeof raw.sigma === "number" ? raw.sigma : null) ??
    (typeof raw.devSigma === "number" ? raw.devSigma : null) ??
    (typeof raw.dev_sigma === "number" ? raw.dev_sigma : null) ??
    null;

  const zapS = typeof raw.zapS === "number" ? raw.zapS : typeof raw.zap_s === "number" ? raw.zap_s : null;
  const zapL = typeof raw.zapL === "number" ? raw.zapL : typeof raw.zap_l === "number" ? raw.zap_l : null;

  const Bid = toNum(raw.Bid ?? raw.bid ?? null);
  const Ask = toNum(raw.Ask ?? raw.ask ?? null);

  const BidLstClsDeltaPct =
    toNum(raw["BidLstClsΔ%"] ?? raw["BidLstClsDeltaPct"] ?? raw.BidLstClsDeltaPct ?? raw.bidLstClsDeltaPct ?? null);

  const AskLstClsDeltaPct =
    toNum(raw["AskLstClsΔ%"] ?? raw["AskLstClsDeltaPct"] ?? raw.AskLstClsDeltaPct ?? raw.askLstClsDeltaPct ?? null);


  const kindStr = String(raw.type ?? raw.Type ?? raw.kind ?? raw.Kind ?? raw.normType ?? "").toLowerCase();
  const kind: "hard" | "soft" | "any" = kindStr.includes("hard") ? "hard" : kindStr.includes("soft") ? "soft" : "any";

  const shortCandidate = !!(raw.shortCandidate ?? raw.ShortCandidate ?? raw.isShort ?? raw.short ?? false);
  const longCandidate = !!(raw.longCandidate ?? raw.LongCandidate ?? raw.isLong ?? raw.long ?? false);

  const bidStock = typeof raw.bidStock === "number" ? raw.bidStock : toNum(raw.bidStock);
  const askStock = typeof raw.askStock === "number" ? raw.askStock : toNum(raw.askStock);
  const bidBench = typeof raw.bidBench === "number" ? raw.bidBench : toNum(raw.bidBench);
  const askBench = typeof raw.askBench === "number" ? raw.askBench : toNum(raw.askBench);

  const zapSsigma = typeof raw.zapSsigma === "number" ? raw.zapSsigma : toNum(raw.zapSsigma);
  const zapLsigma = typeof raw.zapLsigma === "number" ? raw.zapLsigma : toNum(raw.zapLsigma);

  const best = raw?.best ?? raw?.Best ?? null;
  const meta = raw?.meta ?? raw?.Meta ?? null;

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

  return {
    ...raw,
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

function buildSignalsUrl(args: {
  cls: ArbClass;
  type: ArbType;
  mode: Mode;
  minRate: string;
  minTotal: string;
  limit: string;
  offset: string;
  tickers?: string;
}) {
  const { cls, type, mode, minRate, minTotal, limit, offset, tickers } = args;
  const u = new URL(`${BRIDGE_BASE}/api/arbitrage/signals/${cls}/${type}/${mode}`);
  u.searchParams.set("minRate", (minRate || "0.3").trim());
  u.searchParams.set("minTotal", (minTotal || "1").trim());
  u.searchParams.set("limit", (limit || "30").trim());
  u.searchParams.set("offset", (offset || "0").trim());
  if (tickers?.trim()) u.searchParams.set("tickers", tickers.trim());
  return u.toString();
}

/* =========================
   UI Helper Components
========================= */
const MultiSelectFilter = ({
  label,
  options,
  selected,
  setSelected,
  enabled,
  toggleEnabled,
  color = "amber",
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  enabled: boolean;
  toggleEnabled: () => void;
  color?: "amber" | "emerald" | "rose";
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null); // dropdown button
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const toggleOption = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setSelected(next);
  };

  const activeNameClass = `bg-${color}-500 text-black shadow-[0_0_15px_${color}] border-transparent`;
  const inactiveNameClass = `text-${color}-500 border-transparent hover:bg-${color}-500/10`;
  const arrowClass = `text-${color}-500 hover:text-${color}-400 hover:bg-${color}-500/10`;

  const recomputePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: r.left,
      top: r.bottom + 8, // mt-2
      width: Math.max(200, r.width),
    });
  };

  // close on outside click (works with portal)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrap = !!wrapRef.current?.contains(target);
      // menu is in portal -> detect by id
      const menuEl = document.getElementById(`msf-${label}`);
      const insideMenu = !!menuEl?.contains(target);
      if (!insideWrap && !insideMenu) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [label]);

  // when open, pin position and keep it updated
  useEffect(() => {
    if (!open) return;
    recomputePos();
    const onScroll = () => recomputePos();
    const onResize = () => recomputePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const menu = open && pos
    ? createPortal(
        <div
          id={`msf-${label}`}
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            width: pos.width,
            zIndex: 999999, // ✅ поверх active panel
          }}
          className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-y-auto custom-scrollbar"
        >
          <div className="flex flex-col gap-1">
            {options.map((opt, i) => (
              <button
                key={opt || `na-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // ✅ не забирати фокус/не закривати випадково
                onClick={() => toggleOption(opt)}
                className={`text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                  selected.has(opt)
                    ? `bg-${color}-500/20 text-white`
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded border border-white/20 flex items-center justify-center ${
                      selected.has(opt) ? `bg-${color}-500 border-transparent` : ""
                    }`}
                  >
                    {selected.has(opt) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                  </div>
                  <span className="truncate">{opt || "N/A"}</span>
                </div>
              </button>
            ))}
            {options.length === 0 && (
              <div className="text-[10px] text-zinc-600 px-2 py-1 text-center">No options</div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="relative flex items-center bg-black/20 rounded-full border border-white/5" ref={wrapRef}>
        <button
          type="button"
          onClick={toggleEnabled}
          className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-all rounded-l-full ${
            enabled ? activeNameClass : inactiveNameClass
          }`}
        >
          {label} {selected.size > 0 && <span className="opacity-70 ml-1">({selected.size})</span>}
        </button>

        <div className={`w-px h-4 bg-${color}-500/20`} />

        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`px-2 py-1.5 flex items-center justify-center transition-all rounded-r-full ${arrowClass}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      {menu}
    </>
  );
};


// Helper for Class/Mode/Type buttons - moved outside
interface FilterButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  color?: string;
}

const FilterButton: React.FC<FilterButtonProps> = ({ active, label, onClick, color = "emerald" }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all ${
      active
        ? `border border-${color}-500 text-${color}-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] bg-${color}-500/10`
        : "border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 bg-transparent"
    }`}
  >
    {label}
  </button>
);

// SignalCard - moved outside
interface SignalCardProps {
  s: ArbitrageSignal;
  side: "short" | "long";
  onClick: (tk: string) => void;
  activeTicker: string | null;
  flashClass: (ticker: string, side: "short" | "long") => string;
  compact?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({
  s,
  side,
  onClick,
  activeTicker,
  flashClass,
  compact = false,
}) => {
  const isShort = side === "short";
  const isActive = activeTicker === s.ticker;

  // Logic from prompt: Down (Short) -> Bid (Red), Up (Long) -> Ask (Green)
  const px = isShort ? toNum(s.bidStock) : toNum(s.askStock);
  const pxLabel = isShort ? "bid" : "ask";
  const pxColor = isShort ? "text-rose-400" : "text-emerald-400";

  const z = isShort ? toNum(s.zapS) : toNum(s.zapL);
  const zs = isShort ? toNum(s.zapSsigma) : toNum(s.zapLsigma);

  // Active styles (keep red/green formatting for active)
  const activeClasses = isShort 
    ? "bg-rose-500/10 border-rose-500/50 shadow-[0_0_15px_-5px_rgba(244,63,94,0.3)]"
    : "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]";
  
  // Inactive: Transparent background
  const inactiveClasses = "bg-transparent border-white/5 hover:border-white/10 hover:bg-white/5";

  const tickerColor = isActive 
    ? (isShort ? "text-rose-300" : "text-emerald-300")
    : "text-zinc-300 group-hover:text-zinc-100";

  return (
    <button
      onClick={() => onClick(s.ticker)}
      className={[
        "group relative w-full text-left transition-all duration-200 border flex flex-col justify-between",
        compact ? "p-2 rounded-lg gap-1" : "p-3 rounded-xl gap-1.5",
        isActive ? activeClasses : inactiveClasses,
        flashClass(s.ticker, side),
      ].join(" ")}
    >
      <div className="flex items-center justify-between w-full">
        {/* Ticker Symbol */}
        <span className={`font-bold tracking-tight leading-none ${compact ? "text-sm" : "text-[15px]"} ${tickerColor}`}>
          {s.ticker}
        </span>
        
        {/* Price Section */}
        <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono text-zinc-600 lowercase">{pxLabel}</span>
            <span className={`font-mono tabular-nums leading-none font-bold ${compact ? "text-[13px]" : "text-[15px]"} ${pxColor}`}>
                {px == null ? "—" : fmtNum(px, 2)}
            </span>
        </div>
      </div>

      {/* Metrics Section */}
      <div className={`flex items-center justify-between w-full font-mono ${compact ? "text-[9px]" : "text-[10px]"} opacity-80`}>
         <div className="flex items-center gap-1.5">
           <span className="text-zinc-600">σ</span>
           <span className="text-zinc-400 tabular-nums">
              {s.sig == null ? "—" : fmtNum(toNum(s.sig), 2)}
           </span>
         </div>
         <div className="flex items-center gap-2">
           <div className="flex items-center gap-1">
              <span className="text-zinc-600">Z</span>
              <span className="text-zinc-400 tabular-nums">{z == null ? "—" : fmtNum(z, 2)}</span>
           </div>
           <div className="flex items-center gap-1">
              <span className="text-zinc-600">S</span>
              <span className="text-zinc-400 tabular-nums">{zs == null ? "—" : fmtNum(zs, 1)}</span>
           </div>
         </div>
      </div>
    </button>
  );
};

/* =========================
   COMPONENT
========================= */
type ListMode = "off" | "ignore" | "apply";

export default function BridgeArbitrageSignals() {
  const { theme } = useUi();
  const isDark = true;

  /* ===== defaults requested: global / all / any ===== */
  const [cls, setCls] = useState<ArbClass>("global");
  const [type, setType] = useState<ArbType>("any");
  const [mode, setMode] = useState<Mode>("all");

  const [minRate, setMinRate] = useState<string>("0.3");
  const [minTotal, setMinTotal] = useState<string>("1");

  const [limit, setLimit] = useState<string>("30");
  const [offset, setOffset] = useState<string>("0");

  const [tickersFilter, setTickersFilter] = useState("");
  const tickersFilterNorm = useMemo(() => {
    const arr = parseTickersFromFreeText(tickersFilter);
    return arr.length ? arr.join(",") : "";
  }, [tickersFilter]);

  /* ===== Threshold filters ===== */
  const [adv20Min, setAdv20Min] = useState<string>("");
  const [adv20Max, setAdv20Max] = useState<string>("");
  const [adv20NFMin, setAdv20NFMin] = useState<string>("");
  const [adv20NFMax, setAdv20NFMax] = useState<string>("");

  const [adv90Min, setAdv90Min] = useState<string>("");
  const [adv90Max, setAdv90Max] = useState<string>("");
  const [adv90NFMin, setAdv90NFMin] = useState<string>("");
  const [adv90NFMax, setAdv90NFMax] = useState<string>("");

  const [avPreMhvMin, setAvPreMhvMin] = useState<string>("");
  const [avPreMhvMax, setAvPreMhvMax] = useState<string>("");

  const [roundLotMin, setRoundLotMin] = useState<string>("");
  const [roundLotMax, setRoundLotMax] = useState<string>("");

  const [vwapMin, setVwapMin] = useState<string>("");
  const [vwapMax, setVwapMax] = useState<string>("");

  const [spreadMin, setSpreadMin] = useState<string>("");
  const [spreadMax, setSpreadMax] = useState<string>("");

  const [lstPrcLMin, setLstPrcLMin] = useState<string>("");
  const [lstPrcLMax, setLstPrcLMax] = useState<string>("");

  const [lstClsMin, setLstClsMin] = useState<string>("");
  const [lstClsMax, setLstClsMax] = useState<string>("");

  const [yClsMin, setYClsMin] = useState<string>("");
  const [yClsMax, setYClsMax] = useState<string>("");

  const [tClsMin, setTClsMin] = useState<string>("");
  const [tClsMax, setTClsMax] = useState<string>("");

  const [clsToClsPctMin, setClsToClsPctMin] = useState<string>("");
  const [clsToClsPctMax, setClsToClsPctMax] = useState<string>("");

  const [loMin, setLoMin] = useState<string>("");
  const [loMax, setLoMax] = useState<string>("");

  const [lstClsNewsCntMin, setLstClsNewsCntMin] = useState<string>("");
  const [lstClsNewsCntMax, setLstClsNewsCntMax] = useState<string>("");

  const [marketCapMMin, setMarketCapMMin] = useState<string>("");
  const [marketCapMMax, setMarketCapMMax] = useState<string>("");

  const [preMhVolNFMin, setPreMhVolNFMin] = useState<string>("");
  const [preMhVolNFMax, setPreMhVolNFMax] = useState<string>("");

  const [volNFfromLstClsMin, setVolNFfromLstClsMin] = useState<string>("");
  const [volNFfromLstClsMax, setVolNFfromLstClsMax] = useState<string>("");

  /* ===== Boolean filters (Red Group - Exclude) ===== */
  const [excludeDividend, setExcludeDividend] = useState(false);
  const [excludeNews, setExcludeNews] = useState(false); // If News > 0, exclude
  const [excludePTP, setExcludePTP] = useState(false);
  const [excludeSSR, setExcludeSSR] = useState(false);
  const [excludeReport, setExcludeReport] = useState(false);
  const [excludeETF, setExcludeETF] = useState(false);
  const [excludeCrap, setExcludeCrap] = useState(false); // If lstClose < 5, exclude
  const [excludeActive, setExcludeActive] = useState(false);

  /* ===== Boolean filters (Green Group - Include Only) ===== */
  const [includeUSA, setIncludeUSA] = useState(false); // Only Country == UNITED STATES
  const [includeChina, setIncludeChina] = useState(false); // Only Country == CHINA or HONG KONG

  /* ===== Multi-select (Yellow Group) ===== */
  const [selCountries, setSelCountries] = useState<Set<string>>(new Set());
  const [countryEnabled, setCountryEnabled] = useState(false);

  const [selExchanges, setSelExchanges] = useState<Set<string>>(new Set());
  const [exchangeEnabled, setExchangeEnabled] = useState(false);

  const [selSectors, setSelSectors] = useState<Set<string>>(new Set());
  const [sectorEnabled, setSectorEnabled] = useState(false);

  const [filterReport, setFilterReport] = useState<"ALL" | "YES" | "NO">("ALL");
  const [accountNonEmptyFirst, setAccountNonEmptyFirst] = useState(false);
  const [equityType, setEquityType] = useState<string>("");

  /* ===== IGNORE/APPLY lists ===== */
  const [listMode, setListMode] = useState<ListMode>("off");
  const [ignoreSet, setIgnoreSet] = useState<Set<string>>(new Set());
  const [applySet, setApplySet] = useState<Set<string>>(new Set());
  const [showIgnore, setShowIgnore] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [ignoreDraft, setIgnoreDraft] = useState("");
  const [applyDraft, setApplyDraft] = useState("");
  const ignoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const applyFileInputRef = useRef<HTMLInputElement | null>(null);

  /* ===== Data ===== */
  const [items, setItems] = useState<ArbitrageSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  /* ===== Active ticker panel ===== */
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activePanelVisible, setActivePanelVisible] = useState<boolean>(true);
  const [activePanelCollapsed, setActivePanelCollapsed] = useState<boolean>(false);
  const [activePanelMode, setActivePanelMode] = useState<"mini" | "expanded">("expanded");

  const [activeLoading, setActiveLoading] = useState(false);
  const [activeErr, setActiveErr] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<any>(null);

  /* =========================
     Derived Options for Multi-Select
  ========================= */
  const { allCountries, allExchanges, allSectors } = useMemo(() => {
    const c = new Set<string>();
    const e = new Set<string>();
    const s = new Set<string>();
    for (const item of items) {
      if (item.country) c.add(item.country);
      if (item.exchange) e.add(item.exchange);
      if (item.sector) s.add(item.sector);
      // check meta too
      const m = getMeta(item);
      if (m?.country) c.add(m.country);
      if (m?.exchange) e.add(m.exchange);
      if (m?.sector) s.add(m.sector);
    }
    return {
      allCountries: Array.from(c).sort(),
      allExchanges: Array.from(e).sort(),
      allSectors: Array.from(s).sort(),
    };
  }, [items]);

  /* =========================
    Ref-based Fetching (Fixes stale closure in interval)
  ========================= */
  type FiltersSnapshot = {
    cls: ArbClass;
    type: ArbType;
    mode: Mode;
    minRate: string;
    minTotal: string;
    limit: string;
    offset: string;
    tickersFilterNorm: string;

    listMode: ListMode;
    ignoreSet: Set<string>;
    applySet: Set<string>;

    // Thresholds
    adv20Min: string; adv20Max: string;
    adv20NFMin: string; adv20NFMax: string;
    adv90Min: string; adv90Max: string;
    adv90NFMin: string; adv90NFMax: string;
    avPreMhvMin: string; avPreMhvMax: string;
    roundLotMin: string; roundLotMax: string;
    vwapMin: string; vwapMax: string;
    spreadMin: string; spreadMax: string;
    lstPrcLMin: string; lstPrcLMax: string;
    lstClsMin: string; lstClsMax: string;
    yClsMin: string; yClsMax: string;
    tClsMin: string; tClsMax: string;
    clsToClsPctMin: string; clsToClsPctMax: string;
    loMin: string; loMax: string;
    lstClsNewsCntMin: string; lstClsNewsCntMax: string;
    marketCapMMin: string; marketCapMMax: string;
    preMhVolNFMin: string; preMhVolNFMax: string;
    volNFfromLstClsMin: string; volNFfromLstClsMax: string;

    // Booleans
    excludeDividend: boolean;
    excludeNews: boolean;
    excludePTP: boolean;
    excludeSSR: boolean;
    excludeReport: boolean;
    excludeETF: boolean;
    excludeCrap: boolean;
    excludeActive: boolean;

    includeUSA: boolean;
    includeChina: boolean;

    // Multi-selects
    selCountries: Set<string>;
    countryEnabled: boolean;

    selExchanges: Set<string>;
    exchangeEnabled: boolean;

    selSectors: Set<string>;
    sectorEnabled: boolean;

    // Misc
    filterReport: "ALL" | "YES" | "NO";
    equityType: string;
  };

  const filtersRef = useRef<FiltersSnapshot>({
    cls,
    type,
    mode,
    minRate,
    minTotal,
    limit,
    offset,
    tickersFilterNorm,

    listMode,
    ignoreSet,
    applySet,

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

    excludeDividend,
    excludeNews,
    excludePTP,
    excludeSSR,
    excludeReport,
    excludeETF,
    excludeCrap,
    excludeActive,

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
  });

  const isEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);

  const startEditing = () => {
    isEditingRef.current = true;
    setIsEditing(true);
  };

  const stopEditing = () => {
    isEditingRef.current = false;
    setIsEditing(false);
    // опційно: одразу підтягнути свіжі дані після завершення вводу
  };

  useEffect(() => {
    filtersRef.current = {
      cls,
      type,
      mode,
      minRate,
      minTotal,
      limit,
      offset,
      tickersFilterNorm,

      listMode,
      ignoreSet,
      applySet,

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

      excludeDividend,
      excludeNews,
      excludePTP,
      excludeSSR,
      excludeReport,
      excludeETF,
      excludeCrap,
      excludeActive,

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
    };
  }, [
    cls,
    type,
    mode,
    minRate,
    minTotal,
    limit,
    offset,
    tickersFilterNorm,

    listMode,
    ignoreSet,
    applySet,

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

    excludeDividend,
    excludeNews,
    excludePTP,
    excludeSSR,
    excludeReport,
    excludeETF,
    excludeCrap,
    excludeActive,

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
  ]);

  /* =========================
     localStorage load/save
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
  }, []);

  const saveSet = (key: string, set: Set<string>) => {
    try {
      localStorage.setItem(key, JSON.stringify(sortedTickers(set)));
    } catch {}
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
     Flash Logic
  ========================= */
  const prevRef = useRef<Map<string, number | null>>(new Map());
  const flashRef = useRef<Map<string, "up" | "down">>(new Map());
  const [, force] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, number | null>();
    const EPS = 1e-6;

    for (const s of items || []) {
      if (!s?.ticker) continue;
      const dir = s.direction;
      if (dir !== "down" && dir !== "up") continue;

      const side = dir === "down" ? "short" : "long";
      const key = `${side}::${s.ticker}`;
      const metric = typeof s.sig === "number" ? s.sig : null;

      next.set(key, metric);

      const old = prev.get(key);
      if (metric != null && old != null && Math.abs(metric - old) > EPS) {
        const d = metric > old ? "up" : "down";
        flashRef.current.set(key, d);
        setTimeout(() => {
          if (flashRef.current.get(key) === d) {
            flashRef.current.delete(key);
            force((x) => x + 1);
          }
        }, 900);
      }
    }

    prevRef.current = next;
    force((x) => x + 1);
  }, [items]);

  const flashClass = (ticker: string, side: "short" | "long") => {
    const f = flashRef.current.get(`${side}::${ticker}`);
    return f === "up" ? "flashUp" : f === "down" ? "flashDown" : "";
  };

  /* =========================
     Filters pipeline
  ========================= */
  const applyListModeFilter = (arr: ArbitrageSignal[], f: FiltersSnapshot) => {
    const a = arr ?? [];
    if (f.listMode === "ignore") {
      return a.filter((x) => {
        const tk = normalizeTicker(x?.ticker || "");
        return tk != null && !f.ignoreSet.has(tk);
      });
    }
    if (f.listMode === "apply") {
      return a.filter((x) => {
        const tk = normalizeTicker(x?.ticker || "");
        return tk != null && f.applySet.has(tk);
      });
    }
    return a;
  };

  const applyMinRateMinTotal = (arr: ArbitrageSignal[], f: FiltersSnapshot) => {
    const mr = toNum(f.minRate);
    const mt = toNum(f.minTotal);
    if (mr == null && mt == null) return arr ?? [];

    const out = (arr ?? []).filter((s) => {
      const r = getBestRating(s);
      const t = getBestTotal(s);
      if (mr != null && r != null && r < mr) return false;
      if (mt != null && t != null && t < mt) return false;
      return true;
    });
    return out;
  };

  const applyThresholdFilters = (arr: ArbitrageSignal[], f: FiltersSnapshot) => {
    const n = {
      ADV20: { min: toNum(f.adv20Min), max: toNum(f.adv20Max) },
      ADV20NF: { min: toNum(f.adv20NFMin), max: toNum(f.adv20NFMax) },
      ADV90: { min: toNum(f.adv90Min), max: toNum(f.adv90Max) },
      ADV90NF: { min: toNum(f.adv90NFMin), max: toNum(f.adv90NFMax) },
      AvPreMhv: { min: toNum(f.avPreMhvMin), max: toNum(f.avPreMhvMax) },
      RoundLot: { min: toNum(f.roundLotMin), max: toNum(f.roundLotMax) },
      VWAP: { min: toNum(f.vwapMin), max: toNum(f.vwapMax) },
      Spread: { min: toNum(f.spreadMin), max: toNum(f.spreadMax) },
      LstPrcL: { min: toNum(f.lstPrcLMin), max: toNum(f.lstPrcLMax) },
      LstCls: { min: toNum(f.lstClsMin), max: toNum(f.lstClsMax) },
      YCls: { min: toNum(f.yClsMin), max: toNum(f.yClsMax) },
      TCls: { min: toNum(f.tClsMin), max: toNum(f.tClsMax) },
      "ClsToCls%": { min: toNum(f.clsToClsPctMin), max: toNum(f.clsToClsPctMax) },
      Lo: { min: toNum(f.loMin), max: toNum(f.loMax) },
      LstClsNewsCnt: { min: toNum(f.lstClsNewsCntMin), max: toNum(f.lstClsNewsCntMax) },
      MarketCapM: { min: toNum(f.marketCapMMin), max: toNum(f.marketCapMMax) },
      PreMhVolNF: { min: toNum(f.preMhVolNFMin), max: toNum(f.preMhVolNFMax) },
      VolNFfromLstCls: { min: toNum(f.volNFfromLstClsMin), max: toNum(f.volNFfromLstClsMax) },
    };

    const checkMinMax = (val: number | null, min: number | null, max: number | null) => {
      const hasAnyBound = min != null || max != null;
      if (hasAnyBound && val == null) return false;
      if (min != null && val != null && val < min) return false;
      if (max != null && val != null && val > max) return false;
      return true;
    };

    const out = (arr ?? []).filter((s) => {
      if (!checkMinMax(numADV20(s), n.ADV20.min, n.ADV20.max)) return false;
      if (!checkMinMax(numADV20NF(s), n.ADV20NF.min, n.ADV20NF.max)) return false;
      if (!checkMinMax(numADV90(s), n.ADV90.min, n.ADV90.max)) return false;
      if (!checkMinMax(numADV90NF(s), n.ADV90NF.min, n.ADV90NF.max)) return false;
      if (!checkMinMax(numAvPreMh(s), n.AvPreMhv.min, n.AvPreMhv.max)) return false;
      if (!checkMinMax(numRoundLot(s), n.RoundLot.min, n.RoundLot.max)) return false;
      if (!checkMinMax(numVWAP(s), n.VWAP.min, n.VWAP.max)) return false;
      if (!checkMinMax(numSpread(s), n.Spread.min, n.Spread.max)) return false;
      if (!checkMinMax(numLstPrcL(s), n.LstPrcL.min, n.LstPrcL.max)) return false;
      if (!checkMinMax(numLastClose(s), n.LstCls.min, n.LstCls.max)) return false;
      if (!checkMinMax(numYCls(s), n.YCls.min, n.YCls.max)) return false;
      if (!checkMinMax(numTCls(s), n.TCls.min, n.TCls.max)) return false;
      if (!checkMinMax(numClsToClsPct(s), n["ClsToCls%"].min, n["ClsToCls%"].max)) return false;
      if (!checkMinMax(numLo(s), n.Lo.min, n.Lo.max)) return false;
      if (!checkMinMax(numLstClsNewsCnt(s), n.LstClsNewsCnt.min, n.LstClsNewsCnt.max)) return false;
      if (!checkMinMax(numMarketCapM(s), n.MarketCapM.min, n.MarketCapM.max)) return false;
      if (!checkMinMax(numPreMktVolNF(s), n.PreMhVolNF.min, n.PreMhVolNF.max)) return false;
      if (!checkMinMax(numVolNFfromLstCls(s), n.VolNFfromLstCls.min, n.VolNFfromLstCls.max)) return false;

      // RED Group (Exclude)
      if (f.excludeDividend) {
        if (hasValue(pickAny(s, ["dividend", "Dividend", "hasDividend", "HasDividend"]))) return false;
      }
      if (f.excludeNews) {
        const nn = toNum((s as any)._newsCount ?? numNews(s)) ?? 0;
        if (nn > 0) return false;
      }
      if (f.excludePTP) {
        if (((s as any)._isPTP ?? boolIsPTP(s)) === true) return false;
      }
      if (f.excludeSSR) {
        if (((s as any)._isSSR ?? boolIsSSR(s)) === true) return false;
      }
      if (f.excludeReport) {
        if (hasValue(pickAny(s, ["report", "Report"]))) return false;
      }
      if (f.excludeETF) {
        if (boolIsETF(s) === true) return false;
        const eqt = strEquityType(s).toLowerCase();
        if (eqt && eqt.includes("etf")) return false;
      }
      if (f.excludeCrap) {
        const px = numLastClose(s);
        if (px != null && px < 5) return false;
      }
      if (f.excludeActive) {
        if (((s as any)._isActive ?? boolIsActive(s)) === true) return false;
      }

      // GREEN Group (Include Only)
      if (f.includeUSA) {
        if (!isUSA(s)) return false;
      }
      if (f.includeChina) {
        const c = getCountryStr(s);
        if (!c.includes("CHINA") && !c.includes("HONG KONG")) return false;
      }

      // Multi-selects
      if (f.countryEnabled && f.selCountries.size > 0 && !f.selCountries.has(getCountry(s))) return false;
      if (f.exchangeEnabled && f.selExchanges.size > 0 && !f.selExchanges.has(getExchange(s))) return false;
      if (f.sectorEnabled && f.selSectors.size > 0 && !f.selSectors.has(getSector(s))) return false;

      // Report tri-state
      if (f.filterReport !== "ALL") {
        const rep = (s as any)._reportBool ?? toBool((s as any).report ?? (s as any).Report);
        if (f.filterReport === "YES" && rep !== true) return false;
        if (f.filterReport === "NO" && rep !== false) return false;
      }

      // Equity type search
      if (f.equityType.trim()) {
        const et = strEquityType(s).toLowerCase();
        if (!et.includes(f.equityType.toLowerCase().trim())) return false;
      }

      return true;
    });
    return out;
  };


  /* =========================
     Fetch signals
  ========================= */
  const fetchSignals = async () => {
    // Read from ref to avoid stale closures in interval
    const f = filtersRef.current;

    try {
      setLoading(true);
      setError(null);

      const url = buildSignalsUrl({
        cls: f.cls,
        type: f.type,
        mode: f.mode,
        minRate: f.minRate,
        minTotal: f.minTotal,
        limit: f.limit,
        offset: f.offset,
        tickers: f.tickersFilterNorm || undefined,
      });

      const r = await fetch(url, { cache: "no-store" });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        setItems([]);
        setError(`HTTP ${r.status}: ${txt || r.statusText}`);
        return;
      }

      const j = await r.json();
      const rawItems: any[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
      const normalized = rawItems.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];

      // Apply filters locally (client-side filtering)
      let filtered = applyListModeFilter(normalized, f);
      filtered = applyThresholdFilters(filtered, f);
      filtered = applyMinRateMinTotal(filtered, f);

      setItems(filtered);
      setUpdatedAt(Date.now());
    } catch (e: any) {
      setItems([]);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };


  // Auto-refresh interval (independent of filter state changes)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isEditingRef.current) return; // <-- PAUSE WHILE TYPING
      fetchSignals();
    }, 2500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Filter change effect
useEffect(() => {
  if (isEditingRef.current) return; // <-- НЕ фетчимо поки друкуємо
  fetchSignals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [
  cls, type, mode, minRate, minTotal, limit, offset, tickersFilterNorm,
  listMode, ignoreSet, applySet,
  adv20Min, adv20Max, adv20NFMin, adv20NFMax, adv90Min, adv90Max, adv90NFMin, adv90NFMax,
  avPreMhvMin, avPreMhvMax, roundLotMin, roundLotMax, vwapMin, vwapMax, spreadMin, spreadMax,
  lstPrcLMin, lstPrcLMax, lstClsMin, lstClsMax, yClsMin, yClsMax, tClsMin, tClsMax,
  clsToClsPctMin, clsToClsPctMax, loMin, loMax, lstClsNewsCntMin, lstClsNewsCntMax,
  marketCapMMin, marketCapMMax, preMhVolNFMin, preMhVolNFMax, volNFfromLstClsMin, volNFfromLstClsMax,
  excludeDividend, excludeNews, excludePTP, excludeSSR, excludeReport, excludeETF, excludeCrap, excludeActive,
  includeUSA, includeChina, selCountries, countryEnabled, selExchanges, exchangeEnabled, selSectors, sectorEnabled,
  filterReport, accountNonEmptyFirst, equityType
]);


  /* =========================
     Active ticker is derived from /signals items
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
    setActivePanelCollapsed(false);
  };

  const closeActive = () => {
    setActivePanelVisible(false);
  };

  /* =========================
     Grouping (+ account sorting toggle)
  ========================= */
  const benchBlocks: BenchBlock[] = useMemo(() => {
    const bucketMap = new Map<string, any>();

    for (const s of items || []) {
      const direction = s.direction;
      if (direction !== "down" && direction !== "up") continue;

      const benchmark = (s.benchmark || "UNKNOWN").toUpperCase();
      const betaKey = parseBetaKey(s.betaBucket ?? null);

      const bucketId = `${benchmark}__${betaKey}`;
      if (!bucketMap.has(bucketId)) bucketMap.set(bucketId, { benchmark, betaKey, shorts: [], longs: [] });

      const b = bucketMap.get(bucketId);
      if (direction === "down") b.shorts.push(s);
      else if (direction === "up") b.longs.push(s);
    }

    const cmp = makeCmpAccountThenTicker(accountNonEmptyFirst);

    const benchMap = new Map<string, BucketGroup[]>();
    for (const [, b] of bucketMap.entries()) {
      b.shorts.sort(cmp);
      b.longs.sort(cmp);

      const n = Math.max(b.shorts.length, b.longs.length);
      const rows: RowPair[] = [];
      for (let i = 0; i < n; i++) rows.push({ short: b.shorts[i], long: b.longs[i] });

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
  }, [items, accountNonEmptyFirst]);

  const hasAny = benchBlocks.some((b) => b.buckets.some((g) => g.rows.length > 0));

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const toggleBucket = (id: string) => setExpandedMap((p) => ({ ...p, [id]: !p[id] }));

  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-US", { hour12: false }) : null;

  const ignoreList = useMemo(() => sortedTickers(ignoreSet), [ignoreSet]);
  const applyList = useMemo(() => sortedTickers(applySet), [applySet]);

  const classLabel = cls.toUpperCase() === "GLOBAL" ? "GLOB" : cls.toUpperCase();
  const typeLabel = type.toUpperCase();
  const modeLabel = mode.toUpperCase();

  const clearTickersFilter = () => setTickersFilter("");

  /* =========================
     Active derived fields
  ========================= */
  const activeMeta = getMeta(activeData);
  const activeBench = (activeData?.benchmark ? String(activeData.benchmark) : getStrAny(activeData, ["benchmark", "Benchmark"], "—")).toUpperCase();
  const bestObj = activeData?.best ?? activeData?.Best ?? null;
  const activeBeta = toNum(bestObj?.beta ?? bestObj?.Beta ?? (activeData as any)?._bestBeta);
  const activeSigma = toNum(bestObj?.sigma ?? bestObj?.Sigma) ?? getNumAny(activeData, ["sig", "Sig", "sigma", "Sigma"]);
  const activeSector2 = getStrAny(activeData, ["sector", "Sector", "lvl2", "level2", "Level2"], "—");
  const activeExchange2 = getStrAny(activeData, ["exchange", "Exchange"], "—");
  const activeMarketCapM2 =
    getNumAny(activeData, ["marketCapM", "MarketCapM"]) ??
    (getNumAny(activeData, ["marketCap", "MarketCap"]) != null ? getNumAny(activeData, ["marketCap", "MarketCap"]) : null);

  const bestDevPos: any[] = Array.isArray(bestObj?.devPos) ? bestObj.devPos : [];
  const bestDevNeg: any[] = Array.isArray(bestObj?.devNeg) ? bestObj.devNeg : [];
  const bestBenchPos: any[] = Array.isArray(bestObj?.benchPos) ? bestObj.benchPos : [];
  const bestBenchNeg: any[] = Array.isArray(bestObj?.benchNeg) ? bestObj.benchNeg : [];

  const bestRating = toNum(bestObj?.rating);
  const bestTotalAny = toNum(bestObj?.total);
  const bestTotalHard = toNum(bestObj?.hard);
  const bestTotalSoft = toNum(bestObj?.soft);
  const bestTotalEff = type === "hard" ? bestTotalHard : type === "soft" ? bestTotalSoft : bestTotalAny;

  /* =========================
     ListMode UI
  ========================= */
  const setModeIgnore = () => setListMode((m) => (m === "ignore" ? "off" : "ignore"));
  const setModeApply = () => setListMode((m) => (m === "apply" ? "off" : "apply"));

  /* =========================
     Price (bid/ask) + zap line helpers
  ========================= */
  const displayPxFor = (s: ArbitrageSignal, side: "short" | "long") => {
    if (side === "short") return { label: "ASK", value: toNum(s.askStock) };
    return { label: "BID", value: toNum(s.bidStock) };
  };

  const displayZapLineFor = (s: ArbitrageSignal, side: "short" | "long") => {
    if (side === "short") {
      const z = toNum(s.zapS);
      const zs = toNum(s.zapSsigma);
      return { zLabel: "zapS", z, sLabel: "σ", zs };
    }
    const z = toNum(s.zapL);
    const zs = toNum(s.zapLsigma);
    return { zLabel: "zapL", z, sLabel: "σ", zs };
  };

  // UI helper for min/max pairs (Tailwind conversion)



  return (
    <div className="relative min-h-screen w-full bg-[#030303] text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-white p-4 overflow-x-hidden">
      {/* Ambient Background - Deep Space Nebula */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-emerald-500/[0.05] rounded-full blur-[150px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[600px] h-[600px] bg-violet-500/[0.05] rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-6">
        {/* =========================
          HEADER (GlassCard)
      ========================= */}
        <header className="bg-[#0a0a0a]/60 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full border border-white/10 ${loading ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"}`} />
              <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                ARBITRAGE TERMINAL
              </h1>

              <div className="flex gap-2 ml-4">
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">
                  {classLabel}
                </span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">
                  {modeLabel}
                </span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">
                  {typeLabel}
                </span>
                {listMode !== "off" && (
                  <span className="px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-mono text-emerald-400 uppercase">
                    LIST: {listMode}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              <span>{updatedLabel ? `UPDATED ${updatedLabel}` : "CONNECTING..."}</span>
              <span className="text-zinc-700 mx-1">•</span>
              <span className="opacity-70">
                minRate {minRate || "—"} • minTotal {minTotal || "—"} • limit {limit || "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
              <button
                onClick={setModeIgnore}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                  listMode === "ignore"
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_-3px_rgba(244,63,94,0.2)]"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                IGNORE {ignoreSet.size > 0 && <span className="ml-1 opacity-70">({ignoreSet.size})</span>}
              </button>

              <button
                onClick={setModeApply}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                  listMode === "apply"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-3px_rgba(16,185,129,0.2)]"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                APPLY {applySet.size > 0 && <span className="ml-1 opacity-70">({applySet.size})</span>}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowIgnore(!showIgnore)}
                className={`px-3 py-2 rounded-lg border transition-all text-xs font-mono ${
                  showIgnore ? "bg-violet-500/10 border-violet-500/30 text-violet-300" : "bg-[#0a0a0a]/40 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                IG LIST
              </button>
              <button
                onClick={() => setShowApply(!showApply)}
                className={`px-3 py-2 rounded-lg border border-white/10 transition-all text-xs font-mono flex items-center gap-2 ${
                  showApply
                    ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                    : "bg-[#0a0a0a]/40 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                AP LIST
              </button>
              <button
                onClick={fetchSignals}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-emerald-500/50 bg-[#0a0a0a]/40 text-emerald-500 hover:bg-emerald-500/10 transition-all active:scale-95 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
              >
                <span className={`text-lg leading-none ${loading ? "animate-spin" : ""}`}>↻</span>
              </button>
            </div>
          </div>
        </header>

        {/* =========================
          CONTROLS / SWITCH ROW
      ========================= */}
        <div className="flex flex-wrap gap-4 items-center bg-[#0a0a0a]/40 backdrop-blur-sm border border-white/[0.04] rounded-xl p-3">
          {/* Class Segments */}
          <div className="flex gap-2">
            {(["global", "ark", "print", "open", "intra", "post"] as ArbClass[]).map((c) => (
              <FilterButton key={c} active={cls === c} label={c === "global" ? "GLOB" : c} onClick={() => setCls(c)} />
            ))}
          </div>

          <div className="w-px h-8 bg-white/5" />

          {/* Mode Segments */}
          <div className="flex gap-2">
            <FilterButton active={mode === "all"} label="ALL" onClick={() => setMode("all")} />
            <FilterButton active={mode === "top"} label="TOP" onClick={() => setMode("top")} />
          </div>

          <div className="w-px h-8 bg-white/5" />

          {/* Type Segments */}
          <div className="flex gap-2">
            {(["any", "hard", "soft"] as ArbType[]).map((t) => (
              <FilterButton key={t} active={type === t} label={t} onClick={() => setType(t)} />
            ))}
          </div>

          <div className="flex-1" />

          {/* Inputs */}
          <div className="flex gap-2">
            {[
              { label: "minRate", val: minRate, set: setMinRate, ph: "0.3" },
              { label: "minTotal", val: minTotal, set: setMinTotal, ph: "1" },
              { label: "offset", val: offset, set: setOffset, ph: "0" },
              { label: "limit", val: limit, set: setLimit, ph: "30" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-black/20">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">{f.label}</span>
                <input
                  value={f.val}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="w-12 bg-transparent text-right text-xs font-mono text-white placeholder-zinc-700 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* =========================
          THRESHOLDS GRID
        ========================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
          <MinMax label="ADV20" min={adv20Min} max={adv20Max} setMin={setAdv20Min} setMax={setAdv20Max} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="ADV20NF" min={adv20NFMin} max={adv20NFMax} setMin={setAdv20NFMin} setMax={setAdv20NFMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="ADV90" min={adv90Min} max={adv90Max} setMin={setAdv90Min} setMax={setAdv90Max} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="ADV90NF" min={adv90NFMin} max={adv90NFMax} setMin={setAdv90NFMin} setMax={setAdv90NFMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="AvPreMhv" min={avPreMhvMin} max={avPreMhvMax} setMin={setAvPreMhvMin} setMax={setAvPreMhvMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="RoundLot" min={roundLotMin} max={roundLotMax} setMin={setRoundLotMin} setMax={setRoundLotMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="VWAP" min={vwapMin} max={vwapMax} setMin={setVwapMin} setMax={setVwapMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="Spread" min={spreadMin} max={spreadMax} setMin={setSpreadMin} setMax={setSpreadMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="LstPrcL" min={lstPrcLMin} max={lstPrcLMax} setMin={setLstPrcLMin} setMax={setLstPrcLMax} startEditing={startEditing} stopEditing={stopEditing} />

          <MinMax label="LstCls" min={lstClsMin} max={lstClsMax} setMin={setLstClsMin} setMax={setLstClsMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="YCls" min={yClsMin} max={yClsMax} setMin={setYClsMin} setMax={setYClsMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="TCls" min={tClsMin} max={tClsMax} setMin={setTClsMin} setMax={setTClsMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="ClsToCls%" min={clsToClsPctMin} max={clsToClsPctMax} setMin={setClsToClsPctMin} setMax={setClsToClsPctMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="Lo" min={loMin} max={loMax} setMin={setLoMin} setMax={setLoMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="LstClsNewsCnt" min={lstClsNewsCntMin} max={lstClsNewsCntMax} setMin={setLstClsNewsCntMin} setMax={setLstClsNewsCntMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="MarketCapM" min={marketCapMMin} max={marketCapMMax} setMin={setMarketCapMMin} setMax={setMarketCapMMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax label="PreMhVolNF" min={preMhVolNFMin} max={preMhVolNFMax} setMin={setPreMhVolNFMin} setMax={setPreMhVolNFMax} startEditing={startEditing} stopEditing={stopEditing} />
          <MinMax
            label="VolNFfromLstCls"
            min={volNFfromLstClsMin}
            max={volNFfromLstClsMax}
            setMin={setVolNFfromLstClsMin}
            setMax={setVolNFfromLstClsMax}
            startEditing={startEditing}
            stopEditing={stopEditing}
          />
        </div>


        {/* =========================
          BOOLEAN & MULTI-SELECT FILTERS
      ========================= */}
        <div className="flex flex-wrap gap-3 items-center bg-[#0a0a0a]/40 backdrop-blur-sm border border-white/[0.04] rounded-xl p-3">
          <span className="text-zinc-500 mr-2 text-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </span>

          {/* RED GROUP (Exclude) */}
          <div className="flex items-center gap-2 p-2 rounded-xl border border-rose-900/30 bg-rose-900/10">
            {[
              { label: "Div", val: excludeDividend, set: setExcludeDividend },
              { label: "News", val: excludeNews, set: setExcludeNews },
              { label: "PTP", val: excludePTP, set: setExcludePTP },
              { label: "SSR", val: excludeSSR, set: setExcludeSSR },
              { label: "Rep", val: excludeReport, set: setExcludeReport },
              { label: "ETF", val: excludeETF, set: setExcludeETF },
              { label: "CRAP", val: excludeCrap, set: setExcludeCrap, title: "LstClose < 5" },
              { label: "Active", val: excludeActive, set: setExcludeActive },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => b.set(!b.val)}
                title={b.title}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all ${
                  b.val
                    ? "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                    : "bg-transparent text-rose-500 hover:bg-rose-500/10"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/5" />

          {/* GREEN GROUP (Include Only) */}
          <div className="flex items-center gap-2 p-2 rounded-xl border border-emerald-900/30 bg-emerald-900/10">
            {[
              { label: "USA", val: includeUSA, set: setIncludeUSA },
              { label: "CHINA", val: includeChina, set: setIncludeChina },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => b.set(!b.val)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all ${
                  b.val
                    ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                    : "bg-transparent text-emerald-500 hover:bg-emerald-500/10"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/5" />

          {/* YELLOW GROUP (Multi-Select) */}
          <div className="flex items-center gap-2 p-2 rounded-xl border border-amber-900/30 bg-amber-900/10">
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

          {/* ACC SORT & EQUITY TYPE */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAccountNonEmptyFirst(!accountNonEmptyFirst)}
              className={`px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase transition-all ${
                accountNonEmptyFirst
                  ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
                  : "bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {accountNonEmptyFirst ? "ACC: NONEMPTY" : "ACC: EMPTY"}
            </button>

            <div className="flex items-center gap-2 bg-black/20 border border-white/5 rounded-full px-3 py-1">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Equity</span>
              <input
                value={equityType}
                onChange={(e) => setEquityType(e.target.value)}
                placeholder="Type..."
                className="bg-transparent text-xs font-mono text-white placeholder-zinc-700 focus:outline-none w-16"
              />
            </div>
          </div>

          {/* TICKER SEARCH */}
          <div className="relative group min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">⌕</span>
            <input
              value={tickersFilter}
              onChange={(e) => setTickersFilter(e.target.value)}
              placeholder="AAPL, MSFT..."
              className="w-full bg-[#0a0a0a]/60 border border-white/10 rounded-full pl-8 pr-8 py-1.5 text-xs font-mono text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {tickersFilter && (
              <button
                onClick={clearTickersFilter}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* =========================
          DRAWERS (Ignore/Apply)
      ========================= */}
        {(showIgnore || showApply) && (
          <div className="grid grid-cols-7 gap-4">

            {showIgnore && (
              <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4">
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
                  <button
                    onClick={onAddIgnore}
                    className="px-4 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30"
                  >
                    ADD
                  </button>
                  <button
                    onClick={() => setIgnoreDraft("")}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white"
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => ignoreFileInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs hover:bg-violet-500/20"
                  >
                    IMPORT CSV
                  </button>
                  {ignoreSet.size > 0 && (
                    <button
                      onClick={() => clearSet(setIgnoreSet, IGNORE_LS_KEY)}
                      className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40"
                    >
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
              <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4">
                <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                  <span className="text-sm font-bold text-emerald-400 tracking-tight">APPLY ONLY LIST</span>
                  <span className="text-[10px] font-mono text-zinc-500">Show only these when LIST MODE = APPLY</span>
                </div>
                <textarea
                  value={applyDraft}
                  onChange={(e) => setApplyDraft(e.target.value)}
                  placeholder="AAPL, MSFT..."
                  className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-500/30 resize-none"
                />
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={onAddApply}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30"
                  >
                    ADD
                  </button>
                  <button
                    onClick={() => setApplyDraft("")}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white"
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => applyFileInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs hover:bg-violet-500/20"
                  >
                    IMPORT CSV
                  </button>
                  {applySet.size > 0 && (
                    <button
                      onClick={() => clearSet(setApplySet, APPLY_LS_KEY)}
                      className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40"
                    >
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
          </div>
        )}

        {/* =========================
          ACTIVE PANEL (GlassCard)
      ========================= */}
        {activePanelVisible && (
          <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.08] border-l-4 border-l-emerald-500 rounded-2xl shadow-[0_0_40px_-10px_rgba(16,185,129,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      ACTIVE SIGNAL
                    </span>
                    <div className="h-0.5 w-6 bg-emerald-500/50 rounded-full" />
                  </div>
                  <span className="text-2xl font-bold text-white tracking-tight">{activeTicker ?? "—"}</span>
                  <div className="flex gap-2 hidden sm:flex">
                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/40 text-[10px] font-mono text-zinc-400">
                      BENCH: <span className="text-white ml-1">{activeBench !== "—" ? activeBench : "—"}</span>
                    </span>
                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/40 text-[10px] font-mono text-zinc-400">
                      β: <span className="text-white ml-1">{activeBeta == null ? "—" : fmtNum(activeBeta, 2)}</span>
                    </span>
                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/40 text-[10px] font-mono text-zinc-400">
                      σ: <span className="text-white ml-1">{activeSigma == null ? "—" : fmtNum(activeSigma, 2)}</span>
                    </span>
                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/40 text-[10px] font-mono text-zinc-400">
                      RATE: <span className="text-emerald-400 ml-1">{bestRating == null ? "—" : `${Math.round(bestRating * 100)}%`}</span>
                    </span>
                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/40 text-[10px] font-mono text-zinc-400">
                      N: <span className="text-white ml-1">{bestTotalEff == null ? "—" : fmtMaybeInt(bestTotalEff)}</span>
                    </span>
                  </div>
                </div>
                {activeLoading && <div className="text-[10px] font-mono text-zinc-500 animate-pulse">loading data stream...</div>}
                {activeErr && <div className="text-xs text-rose-400 font-mono bg-rose-500/10 px-2 py-1 rounded">{activeErr}</div>}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setActivePanelMode((m) => (m === "mini" ? "expanded" : "mini"))}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  {activePanelMode === "mini" ? "EXPAND" : "MINI"}
                </button>
                <button
                  onClick={() => setActivePanelCollapsed(!activePanelCollapsed)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
                  title={activePanelCollapsed ? "Show Panel" : "Collapse Panel"}
                >
                  {activePanelCollapsed ? (
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

            {/* Content Body - Only shown if not collapsed */}
            {!activePanelCollapsed && (
              <div className="p-4 space-y-4">
                {(() => {
                  const s = activeData;
                  const bid = s ? toNum((s as any).Bid ?? (s as any).bid) : null;
                  const ask = s ? toNum((s as any).Ask ?? (s as any).ask) : null;

                  const bidDelta = s ? toNum((s as any)["BidLstClsΔ%"] ?? (s as any).BidLstClsDeltaPct) : null;
                  const askDelta = s ? toNum((s as any)["AskLstClsΔ%"] ?? (s as any).AskLstClsDeltaPct) : null;


                  const renderCell = (label: string, value: React.ReactNode, colorClass = "text-zinc-200") => (
                    <div className="flex flex-col gap-1 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">{label}</span>
                      <span className={`text-xs font-mono tabular-nums font-medium truncate ${colorClass}`}>{value ?? "—"}</span>
                    </div>
                  );

                  // RENDER EXPANDED GRID EVEN IF NO TICKER (Empty State as requested)
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {renderCell("Company", s ? getCompany(s) : "—")}
                        {renderCell("Country", s ? getCountry(s) : "—")}
                        {renderCell(
                          "MarketCapM",
                          s ? fmtMaybeInt(numMarketCapM(s) ?? getMarketCapM(s) ?? activeMarketCapM2) : "—",
                          s ? "text-emerald-300" : "text-zinc-500"
                        )}
                        {renderCell("AvPreMhv", s ? fmtMaybeInt(numAvPreMh(s)) : "—")}
                        {renderCell("ADV20", s ? fmtMaybeInt(numADV20(s)) : "—")}
                        {renderCell("ADV90", s ? fmtMaybeInt(numADV90(s)) : "—")}
                        {renderCell(
                          "BidLstClsΔ%",
                          s ? fmtPct(bidDelta, 2) : "—",
                          s && bidDelta != null ? (bidDelta >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-500"
                        )}
                        {renderCell("Bid", s && bid != null ? fmtNum(bid, 2) : "—", s ? "text-cyan-300" : "text-zinc-500")}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {renderCell("SectorL3", s ? (getSector(s) !== "—" ? getSector(s) : activeSector2) : "—")}
                        {renderCell("Exchange", s ? (getExchange(s) !== "—" ? getExchange(s) : activeExchange2) : "—")}
                        {renderCell("PreMhVolNF", s ? fmtMaybeInt(numPreMktVolNF(s)) : "—")}
                        {renderCell("Spread", s ? (numSpread(s) == null ? "—" : fmtNum(numSpread(s)!, 4)) : "—")}
                        {renderCell("ADV20NF", s ? fmtMaybeInt(numADV20NF(s)) : "—")}
                        {renderCell("ADV90NF", s ? fmtMaybeInt(numADV90NF(s)) : "—")}
                        {renderCell(
                          "AskLstClsΔ%",
                          s ? fmtPct(askDelta, 2) : "—",
                          s && askDelta != null ? (askDelta >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-500"
                        )}
                        {renderCell("Ask", s && ask != null ? fmtNum(ask, 2) : "—", s ? "text-rose-300" : "text-zinc-500")}
                      </div>
                    </div>
                  );
                })()}

                {/* EXPANDED SECTION */}
                {activePanelMode === "expanded" && (
                  <div className="space-y-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-4 duration-300">
                    {/* Pricing Section */}
                    <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                      <div className="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pricing & Liquidity</span>
                        <span className="text-[10px] font-mono text-zinc-600">parsed from root/meta</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {[
                          { k: "LstCls", v: activeData ? (numLastClose(activeData) == null ? "—" : fmtNum(numLastClose(activeData)!, 2)) : "—" },
                          { k: "VWAP", v: activeData ? (numVWAP(activeData) == null ? "—" : fmtNum(numVWAP(activeData)!, 2)) : "—" },
                          { k: "RoundLot", v: activeData ? (numRoundLot(activeData) == null ? "—" : fmtMaybeInt(numRoundLot(activeData))) : "—" },
                          { k: "YCls", v: activeData ? (numYCls(activeData) == null ? "—" : fmtNum(numYCls(activeData)!, 2)) : "—" },
                          { k: "TCls", v: activeData ? (numTCls(activeData) == null ? "—" : fmtNum(numTCls(activeData)!, 2)) : "—" },
                          { k: "ClsToCls%", v: activeData ? fmtPct(numClsToClsPct(activeData), 2) : "—" },
                          { k: "Lo", v: activeData ? (numLo(activeData) == null ? "—" : fmtNum(numLo(activeData)!, 2)) : "—" },
                          {
                            k: "LstClsNewsCnt",
                            v: activeData ? (numLstClsNewsCnt(activeData) == null ? "—" : fmtMaybeInt(numLstClsNewsCnt(activeData))) : "—",
                          },
                        ].map((item) => (
                          <div key={item.k} className="flex flex-col gap-1 p-2 border border-white/5 rounded bg-black/20">
                            <span className="text-[10px] text-zinc-500 font-mono uppercase">{item.k}</span>
                            <span className="text-xs text-zinc-300 font-mono tabular-nums">{item.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Flags */}
                    <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                      <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Flags</span>
                      </div>
                      <div className="p-3 flex gap-2 flex-wrap">
                        {[
                          { l: "PTP", v: (activeData as any)?._isPTP },
                          { l: "SSR", v: (activeData as any)?._isSSR },
                          { l: "ACTIVE", v: (activeData as any)?._isActive },
                          { l: "ETF", v: boolIsETF(activeData) },
                          { l: "DIV", v: hasValue(pickAny(activeData, ["dividend", "Dividend", "hasDividend", "HasDividend"])) },
                          { l: "REPORT", v: hasValue(pickAny(activeData, ["report", "Report"])) },
                        ].map((f) => (
                          <span
                            key={f.l}
                            className={`px-3 py-1 rounded-full border text-[10px] font-mono font-bold uppercase ${
                              f.v
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-white/5 border-white/10 text-zinc-600"
                            }`}
                          >
                            {f.l}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Ranges */}
                    <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                      <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Best Ranges</span>
                      </div>
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { title: "DEV POS", data: bestDevPos },
                          { title: "DEV NEG", data: bestDevNeg },
                          { title: "BENCH POS", data: bestBenchPos },
                          { title: "BENCH NEG", data: bestBenchNeg },
                        ].map((grp) => (
                          <div key={grp.title} className="bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className="text-[10px] text-zinc-500 font-mono uppercase mb-2">{grp.title}</div>
                            <div className="flex flex-wrap gap-2">
                              {grp.data?.length ? (
                                grp.data.map((r, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px] font-mono tabular-nums"
                                  >
                                    {fmtNum(toNum(r.min), 2)} → {fmtNum(toNum(r.max), 2)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-zinc-700 text-[10px] font-mono">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Debug */}
                    <details className="border border-dashed border-white/10 rounded-xl bg-black/20 p-3 text-xs font-mono text-zinc-500 cursor-pointer">
                      <summary className="hover:text-zinc-300">Debug Keys</summary>
                      <div className="mt-2 space-y-1 text-[10px] break-all">
                        <div>
                          <b>raw:</b> {activeData ? Object.keys(activeData).slice(0, 60).join(", ") : "—"}
                        </div>
                        <div>
                          <b>meta:</b> {activeData ? Object.keys(activeMeta ?? {}).slice(0, 60).join(", ") : "—"}
                        </div>
                        <div>
                          <b>best:</b> {activeData ? Object.keys(bestObj ?? {}).slice(0, 60).join(", ") : "—"}
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================
          MESSAGES & GRID
      ========================= */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">

            {benchBlocks.map((bench) => {
              const accent = BENCH_COLORS[bench.benchmark] ?? BENCH_COLORS.DEFAULT;

              return (
                <div
                  key={bench.benchmark}
                 className="bg-[#0a0a0a]/55 backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-lg overflow-hidden flex flex-col min-w-0">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-4">
                    <span className="text-lg font-bold text-white tracking-tight">{bench.benchmark}</span>
                    <div className="flex-1 border-b border-dashed border-zinc-700/50 mx-4 opacity-50" />
                  </div>

                  <div className="p-4 space-y-6">
                    {bench.buckets.map((g) => {
                      const isExpanded = !!expandedMap[g.id];
                      const rowsToShow = isExpanded ? g.rows.length : Math.min(10, g.rows.length);

                      return (
                        <div key={g.id} className="border border-white/5 bg-white/[0.01] rounded-xl overflow-hidden">
                          {/* Beta Header */}
                          <div className="grid grid-cols-[20px_1fr_20px] items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px]">
                              ↓
                            </div>
                            <div className="text-center text-xs font-mono font-medium text-zinc-400 uppercase tracking-wide">
                              {betaLabels[g.betaKey]}
                            </div>
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px]">
                              ↑
                            </div>
                          </div>

                          <div className="p-2 grid grid-cols-2 gap-2">
                            {/* LEFT: DOWN (shorts) */}
                            <div className="flex flex-col gap-2">
                              {(g.rows.slice(0, rowsToShow).map((row, i) => row.short).filter(Boolean) as ArbitrageSignal[]).map((s, i) => (
                                <SignalCard
                                  key={`${g.id}-S-${s.ticker}-${i}`}
                                  s={s}
                                  side="short"
                                  onClick={onTickerClick}
                                  activeTicker={activeTicker}
                                  flashClass={flashClass}
                                  compact
                                />
                              ))}
                            </div>

                            {/* RIGHT: UP (longs) */}
                            <div className="flex flex-col gap-2">
                              {(g.rows.slice(0, rowsToShow).map((row, i) => row.long).filter(Boolean) as ArbitrageSignal[]).map((s, i) => (
                                <SignalCard
                                  key={`${g.id}-L-${s.ticker}-${i}`}
                                  s={s}
                                  side="long"
                                  onClick={onTickerClick}
                                  activeTicker={activeTicker}
                                  flashClass={flashClass}
                                  compact
                                />
                              ))}
                            </div>
                          </div>



                          {g.rows.length > 10 && (
                            <button
                              onClick={() => toggleBucket(g.id)}
                              className="w-full py-2 text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-white hover:bg-white/5 transition-colors border-t border-white/5"
                            >
                              {isExpanded ? "COLLAPSE" : `SHOW ALL (${g.rows.length})`}
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
        )}
      </div>

      <style>{`
        @keyframes flashUp {
          0% {
            box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
            border-color: rgba(52, 211, 153, 0.25);
          }
          35% {
            box-shadow: 0 0 0 6px rgba(52, 211, 153, 0.14);
            border-color: rgba(52, 211, 153, 0.55);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
            border-color: rgba(255, 255, 255, 0.08);
          }
        }
        @keyframes flashDown {
          0% {
            box-shadow: 0 0 0 0 rgba(251, 113, 133, 0);
            border-color: rgba(251, 113, 133, 0.25);
          }
          35% {
            box-shadow: 0 0 0 6px rgba(251, 113, 133, 0.14);
            border-color: rgba(251, 113, 133, 0.55);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(251, 113, 133, 0);
            border-color: rgba(255, 255, 255, 0.08);
          }
        }
        .flashUp {
          animation: flashUp 0.9s ease-out;
        }
        .flashDown {
          animation: flashDown 0.9s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}