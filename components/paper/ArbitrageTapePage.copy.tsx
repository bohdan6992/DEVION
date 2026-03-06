"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { todayNyYmd } from "../../lib/time";
import { getToken } from "../../lib/authClient";
import { bridgeUrl, getBridgeBaseUrl } from "../../lib/bridgeBase";
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
type DateMode = "day" | "range";
type PaperListMode = "off" | "ignore" | "apply" | "pin";
type ZapUiMode = "off" | "zap" | "sigma";
type SortDir = "asc" | "desc";
type ActiveSortKey =
  | "ticker"
  | "bench"
  | "side"
  | "startTime"
  | "peakTime"
  | "lastTime"
  | "startAbs"
  | "peakAbs"
  | "lastAbs"
  | "startClass"
  | "closeMode"
  | "minHold";
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
};

type PaperArbClosedDto = {
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;

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
};

// Big request: Analytics + EpisodesSearch
type PaperArbAnalyticsRequest = {
  dateFrom: string;
  dateTo: string;

  metric?: PaperArbMetric;
  startAbs?: number;
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
  requireHasReport?: boolean | null;
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

  // medians
  minMdnPreMhVol90?: number | null;
  maxMdnPreMhVol90?: number | null;

  minPreMhMDV90NF?: number | null;
  maxPreMhMDV90NF?: number | null;

  minPreMhMDV20NF?: number | null;
  maxPreMhMDV20NF?: number | null;

  minMdnPostMhVol90NF?: number | null;
  maxMdnPostMhVol90NF?: number | null;

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

  topN?: number;
  minTradesPerTicker?: number;

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
  expectancyUsd?: number | null;
  maxDrawdownUsd?: number | null;

  equityCurve?: PaperArbEquityPointDto[] | null;
  topTickers?: PaperArbTickerStatsDto[] | null;
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
function minuteIdxWithClock(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  return `${minuteIdxToClockLabel(x)} (${intn(x)})`;
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
function optNumOrNull(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function toYmd(d: string) {
  // minimal client guard; server validates too
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function buildPaperQuery(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
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
        "bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80",
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
        "bg-black/20 border border-white/10 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:bg-black/30 transition-all font-mono tabular-nums",
        className
      )}
    />
  );
}

function GlassSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={clsx(
          "appearance-none bg-black/20 border border-white/10 rounded-md px-2.5 py-1.5 pr-8 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500/40 focus:bg-black/30 transition-all font-mono cursor-pointer",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-zinc-400">
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

function MinMaxRow({
  label,
  minValue,
  maxValue,
  setMin,
  setMax,
  card = false,
  clearable = false,
  placeholderMin = "min",
  placeholderMax = "max",
}: {
  label: string;
  minValue: string;
  maxValue: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  card?: boolean;
  clearable?: boolean;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  const hasValue = Boolean((minValue ?? "").trim() || (maxValue ?? "").trim());

  if (card) {
    return (
      <div
        className={clsx(
          "rounded-xl border p-2.5 transition-all",
          hasValue ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/[0.08] bg-[#06080d]"
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">{label}</div>
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
        <div className="grid grid-cols-2 gap-2">
          <GlassInput
            value={minValue}
            onChange={(e) => setMin(e.target.value)}
            placeholder={placeholderMin}
            className="w-full h-[28px] !bg-black/30 !border-white/[0.08]"
          />
          <GlassInput
            value={maxValue}
            onChange={(e) => setMax(e.target.value)}
            placeholder={placeholderMax}
            className="w-full h-[28px] !bg-black/30 !border-white/[0.08]"
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
    <div className={clsx("inline-flex rounded-xl border border-white/[0.06] bg-[#0a0a0a]/40 p-1", className)}>
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
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-white/[0.04]"
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
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : isShort
      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
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

function CyberDollarGlyph() {
  return (
    <div className="relative w-20 h-20 rounded-2xl border border-emerald-500/20 bg-[#050805]/80 backdrop-blur-xl shadow-[0_0_30px_-8px_rgba(16,185,129,0.45)] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <svg viewBox="0 0 120 120" className="w-full h-full opacity-30" style={{ animation: "cyberSpin 12s linear infinite" }}>
          <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(16,185,129,0.35)" strokeDasharray="2 6" />
          <circle cx="60" cy="60" r="38" fill="none" stroke="rgba(16,185,129,0.18)" strokeDasharray="10 8" />
        </svg>
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <svg viewBox="0 0 120 120" className="w-14 h-14 text-emerald-400" style={{ filter: "drop-shadow(0 0 8px rgba(16,185,129,0.7))" }}>
          <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M78 34c0-10-8-18-20-18s-20 8-20 18 8 16 20 18 20 8 20 18-8 18-20 18-20-8-20-18" />
            <path d="M58 8v104" />
          </g>
        </svg>
      </div>

      <div className="absolute inset-0 grid place-items-center mix-blend-screen opacity-70">
        <svg viewBox="0 0 120 120" className="w-14 h-14 text-emerald-300" style={{ animation: "cyberGlitchA 1.6s steps(2,end) infinite" }}>
          <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M78 34c0-10-8-18-20-18s-20 8-20 18 8 16 20 18 20 8 20 18-8 18-20 18-20-8-20-18" />
            <path d="M58 8v104" />
          </g>
        </svg>
      </div>

      <div className="absolute inset-0 grid place-items-center mix-blend-screen opacity-40">
        <svg viewBox="0 0 120 120" className="w-14 h-14 text-emerald-200" style={{ animation: "cyberGlitchB 1.1s steps(2,end) infinite" }}>
          <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M78 34c0-10-8-18-20-18s-20 8-20 18 8 16 20 18 20 8 20 18-8 18-20 18-20-8-20-18" />
            <path d="M58 8v104" />
          </g>
        </svg>
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-widest uppercase text-emerald-400/80">
        $ynth
      </div>

      <style jsx>{`
        @keyframes cyberSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes cyberGlitchA {
          0%,
          100% {
            transform: translate(0, 0);
            opacity: 0.6;
          }
          20% {
            transform: translate(1px, -1px);
            opacity: 0.95;
          }
          40% {
            transform: translate(-2px, 1px);
            opacity: 0.35;
          }
          60% {
            transform: translate(2px, 0);
            opacity: 0.8;
          }
          80% {
            transform: translate(-1px, -1px);
            opacity: 0.4;
          }
        }
        @keyframes cyberGlitchB {
          0%,
          100% {
            transform: translate(0, 0);
            opacity: 0.35;
          }
          25% {
            transform: translate(-2px, 0);
            opacity: 0.2;
          }
          50% {
            transform: translate(1px, 1px);
            opacity: 0.6;
          }
          75% {
            transform: translate(0, -2px);
            opacity: 0.25;
          }
        }
      `}</style>
    </div>
  );
}

// =========================
// Simple SVG line chart (equity curve)
// =========================
function EquityChart({ points }: { points: PaperArbEquityPointDto[] }) {
  const w = 1100;
  const h = 320;
  const padX = 18;
  const padTop = 16;
  const padBottom = 38;

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
    if (chartPoints.length <= 1) return padX;
    const t0 = chartPoints[0]._tp;
    const t1 = chartPoints[chartPoints.length - 1]._tp;
    const spanT = Math.max(1, t1 - t0);
    return padX + ((chartPoints[i]._tp - t0) / spanT) * (w - padX * 2);
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
    <div className="w-full rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/70 p-3 shadow-[0_0_36px_-12px_rgba(16,185,129,0.28)]">
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-[320px]">
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

        <rect x={padX} y={padTop} width={w - padX * 2} height={h - padTop - padBottom} fill="url(#eq-bg)" />

        {yTicks.map((t) => (
          <g key={`y-${t.y.toFixed(2)}`}>
            <line x1={padX} x2={w - padX} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
            <text x={w - padX - 4} y={t.y - 4} fontSize="10" textAnchor="end" className="fill-zinc-500 font-mono">
              {num(t.val, 2)}
            </text>
          </g>
        ))}

        {zeroY != null && <line x1={padX} x2={w - padX} y1={zeroY} y2={zeroY} stroke="rgba(244,63,94,0.25)" strokeDasharray="4 3" />}

        <path d={areaD} fill="url(#eq-fill)" />
        <path d={lineD} fill="none" stroke="url(#eq-stroke)" strokeWidth="2.8" filter="url(#eq-glow)" />

        <circle cx={toX(0)} cy={firstY} r="3.2" fill="rgba(56,189,248,0.95)" />
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

        <line x1={padX} x2={w - padX} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.12)" />
        {xTicks.map((t) => (
          <g key={`x-${t.idx}`}>
            <line x1={t.x} x2={t.x} y1={padTop} y2={h - padBottom} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />
            <line x1={t.x} x2={t.x} y1={h - padBottom} y2={h - padBottom + 6} stroke="rgba(255,255,255,0.25)" />
            <text x={t.x} y={h - 10} fontSize="10" textAnchor="middle" className="fill-zinc-500 font-mono">
              {t.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StartsByTimeChart({ rows }: { rows: PaperArbClosedDto[] }) {
  const w = 1100;
  const h = 320;
  const padX = 22;
  const padTop = 16;
  const padBottom = 40;

  const bins = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) {
      const idx = Number(r.startMinuteIdx);
      if (!Number.isFinite(idx)) continue;
      const b = Math.trunc(idx / 5) * 5; // 5-minute buckets
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  if (!bins.length) {
    return (
      <div className="w-full rounded-xl border border-white/10 bg-[#070707]/70 p-4 text-xs font-mono text-zinc-500">
        No start events for chart.
      </div>
    );
  }

  const maxY = Math.max(1, ...bins.map(([, c]) => c));
  const plotW = w - padX * 2;
  const plotH = h - padTop - padBottom;
  const barGap = 2;
  const barW = Math.max(2, Math.floor(plotW / bins.length) - barGap);
  const yTicks = [0, Math.ceil(maxY * 0.33), Math.ceil(maxY * 0.66), maxY];

  return (
    <div className="w-full rounded-xl border border-white/10 bg-[#070707]/70 p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-[320px]">
        <defs>
          <linearGradient id="starts-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0.9)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0.2)" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => {
          const y = padTop + plotH - (t / maxY) * plotH;
          return (
            <g key={`y-${t}`}>
              <line x1={padX} x2={w - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              <text x={w - padX - 4} y={y - 3} textAnchor="end" fontSize="10" className="fill-zinc-500 font-mono">
                {t}
              </text>
            </g>
          );
        })}

        {bins.map(([idx, count], i) => {
          const x = padX + i * (barW + barGap);
          const hh = plotH * (count / maxY);
          const y = padTop + plotH - hh;
          return <rect key={`${idx}-${i}`} x={x} y={y} width={barW} height={hh} rx="2" fill="url(#starts-bar)" />;
        })}

        <line x1={padX} x2={w - padX} y1={h - padBottom} y2={h - padBottom} stroke="rgba(255,255,255,0.15)" />

        {bins
          .filter((_, i) => i % Math.ceil(bins.length / 8) === 0 || i === bins.length - 1)
          .map(([idx], i) => {
            const pos = bins.findIndex(([k]) => k === idx);
            const x = padX + pos * (barW + barGap) + barW / 2;
            return (
              <text key={`x-${idx}-${i}`} x={x} y={h - 10} textAnchor="middle" fontSize="10" className="fill-zinc-500 font-mono">
                {minuteIdxToClockLabel(idx)}
              </text>
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

// =========================
// MAIN PAGE
// =========================
export default function PaperArbitrageTapePage() {
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

  // global filters (variant)
  const [session, setSession] = useState<PaperArbSession>("GLOB");
  const [metric, setMetric] = useState<PaperArbMetric>("SigmaZap");
  const [closeMode, setCloseMode] = useState<PaperArbCloseMode>("Active");
  const [startAbs, setStartAbs] = useState<number>(0.1);
  const [endAbs, setEndAbs] = useState<number>(0.05);
  const [minHoldCandles, setMinHoldCandles] = useState<number>(0);
  const [pnlMode, setPnlMode] = useState<PaperArbPnlMode>("Hedged");

  // analytics options
  const [includeEquityCurve, setIncludeEquityCurve] = useState(true);
  const [equityCurveMode, setEquityCurveMode] = useState<"Daily" | "Trade">("Daily");
  const [topN, setTopN] = useState<number>(1000);
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  const [offset, setOffset] = useState<number>(0);
  const [minTradesPerTicker, setMinTradesPerTicker] = useState<number>(0);

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
  const [activeSort, setActiveSort] = useState<{ key: ActiveSortKey; dir: SortDir }>({
    key: "lastAbs",
    dir: "desc",
  });
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
  const [tickersText, setTickersText] = useState<string>("");
  const [benchTickersText, setBenchTickersText] = useState<string>("");
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
  const [minVolNFfromLstCls, setMinVolNFfromLstCls] = useState<string>("");
  const [maxVolNFfromLstCls, setMaxVolNFfromLstCls] = useState<string>("");

  // news flags
  const [requireHasNews, setRequireHasNews] = useState<boolean>(false);
  const [requireHasReport, setRequireHasReport] = useState<boolean>(false);
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

  // medians
  const [minMdnPreMhVol90, setMinMdnPreMhVol90] = useState<string>("");
  const [maxMdnPreMhVol90, setMaxMdnPreMhVol90] = useState<string>("");

  const [minPreMhMDV90NF, setMinPreMhMDV90NF] = useState<string>("");
  const [maxPreMhMDV90NF, setMaxPreMhMDV90NF] = useState<string>("");

  const [minPreMhMDV20NF, setMinPreMhMDV20NF] = useState<string>("");
  const [maxPreMhMDV20NF, setMaxPreMhMDV20NF] = useState<string>("");

  const [minMdnPostMhVol90NF, setMinMdnPostMhVol90NF] = useState<string>("");
  const [maxMdnPostMhVol90NF, setMaxMdnPostMhVol90NF] = useState<string>("");

  // imbalance
  const [minImbARCA, setMinImbARCA] = useState<string>("");
  const [maxImbARCA, setMaxImbARCA] = useState<string>("");
  const [minImbExchValue, setMinImbExchValue] = useState<string>("");
  const [maxImbExchValue, setMaxImbExchValue] = useState<string>("");
  const filtersHydratedRef = useRef(false);
  const filtersRestoringRef = useRef(false);

  // ========= Derived: variant (for display)
  const variantString = useMemo(() => {
    // EndAbs always participates in variant (even if Passive ignores for closing)
    return [
      `metric=${metric}`,
      `startAbs=${startAbs}`,
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
  }, [metric, startAbs, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, pnlMode]);

  const variantShort = useMemo(() => {
    // small stable hash-ish label without bringing crypto
    const s = `${metric}|${startAbs}|${endAbs}|${session}|${scopeMode}|${scopeMode === "ALL" ? 1000 : topN}|${offset}|${closeMode}|${minHoldCandles}|${pnlMode}|LastPrint`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `v${h.toString(16).slice(0, 8)}`;
  }, [metric, startAbs, endAbs, session, scopeMode, topN, offset, closeMode, minHoldCandles, pnlMode]);

  // ========= Preflight validation
  const validationErrors = useMemo(() => {
    const e: string[] = [];

    const needsRange = tab === "analytics" || (tab === "episodes" && episodesUseSearch);

    if (!needsRange) {
      if (!toYmd(dateNy)) e.push("dateNy must be YYYY-MM-DD");
    } else {
      if (!toYmd(dateFrom)) e.push("dateFrom must be YYYY-MM-DD");
      if (!toYmd(dateTo)) e.push("dateTo must be YYYY-MM-DD");
      if (toYmd(dateFrom) && toYmd(dateTo) && dateFrom > dateTo) e.push("dateFrom must be <= dateTo");
    }

    if (!(startAbs > 0)) e.push("startAbs must be > 0");
    if (!(endAbs >= 0)) e.push("endAbs must be >= 0");
    if (endAbs > startAbs) e.push("endAbs must be <= startAbs");

    if (minHoldCandles < 0) e.push("minHoldCandles must be >= 0");

    return e;
  }, [tab, episodesUseSearch, dateNy, dateFrom, dateTo, startAbs, endAbs, minHoldCandles]);

  const canRun = validationErrors.length === 0 && !loading;

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
    // - legacy GET => day
    // - search POST => range
    if (tab === "episodes") {
      if (!episodesUseSearch) {
        if (dateMode !== "day") {
          setDateMode("day");
          setDateNy(dateFrom || dateNy);
        }
      } else {
        if (dateMode !== "range") {
          setDateMode("range");
          setDateFrom(dateNy);
          setDateTo(dateNy);
        }
      }
      return;
    }

    // analytics => range
    if (tab === "analytics") {
      if (dateMode !== "range") {
        setDateMode("range");
        setDateFrom(dateNy);
        setDateTo(dateNy);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, episodesUseSearch]);

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
        if (s.zapUiMode === "off" || s.zapUiMode === "zap" || s.zapUiMode === "sigma") setZapUiMode(s.zapUiMode);
        if (typeof s.showSharedMinMax === "boolean") setShowSharedMinMax(s.showSharedMinMax);

        if (s.dateMode === "day" || s.dateMode === "range") setDateMode(s.dateMode);
        if (typeof s.dateNy === "string") setDateNy(s.dateNy);
        if (typeof s.dateFrom === "string") setDateFrom(s.dateFrom);
        if (typeof s.dateTo === "string") setDateTo(s.dateTo);

        if (s.session === "BLUE" || s.session === "ARK" || s.session === "OPEN" || s.session === "INTRA" || s.session === "POST" || s.session === "NIGHT" || s.session === "GLOB") setSession(s.session);
        if (s.metric === "SigmaZap" || s.metric === "ZapPct") setMetric(s.metric);
        if (s.closeMode === "Active" || s.closeMode === "Passive") setCloseMode(s.closeMode);
        if (typeof s.startAbs === "number") setStartAbs(s.startAbs);
        if (typeof s.endAbs === "number") setEndAbs(s.endAbs);
        if (typeof s.minHoldCandles === "number") setMinHoldCandles(s.minHoldCandles);
        if (s.pnlMode === "RawOnly" || s.pnlMode === "Hedged") setPnlMode(s.pnlMode);

        if (typeof s.includeEquityCurve === "boolean") setIncludeEquityCurve(s.includeEquityCurve);
        if (s.equityCurveMode === "Daily" || s.equityCurveMode === "Trade") setEquityCurveMode(s.equityCurveMode);
        if (typeof s.topN === "number") setTopN(s.topN);
        if (s.scopeMode === "ALL" || s.scopeMode === "TOP") setScopeMode(s.scopeMode);
        if (typeof s.offset === "number") setOffset(s.offset);
        if (typeof s.minTradesPerTicker === "number") setMinTradesPerTicker(s.minTradesPerTicker);

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
          setRatingEnabledBands((prev) => ({
            ...prev,
            BLUE: Boolean(s.ratingEnabledBands.BLUE),
            ARK: Boolean(s.ratingEnabledBands.ARK),
            OPEN: Boolean(s.ratingEnabledBands.OPEN),
            INTRA: Boolean(s.ratingEnabledBands.INTRA),
            PRINT: Boolean(s.ratingEnabledBands.PRINT),
            POST: Boolean(s.ratingEnabledBands.POST),
            GLOBAL: Boolean(s.ratingEnabledBands.GLOBAL),
          }));
        }

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
        applyStr(s.minVolNFfromLstCls, setMinVolNFfromLstCls); applyStr(s.maxVolNFfromLstCls, setMaxVolNFfromLstCls);
        applyStr(s.minNewsCnt, setMinNewsCnt); applyStr(s.maxNewsCnt, setMaxNewsCnt);
        applyStr(s.minMdnPreMhVol90, setMinMdnPreMhVol90); applyStr(s.maxMdnPreMhVol90, setMaxMdnPreMhVol90);
        applyStr(s.minPreMhMDV90NF, setMinPreMhMDV90NF); applyStr(s.maxPreMhMDV90NF, setMaxPreMhMDV90NF);
        applyStr(s.minPreMhMDV20NF, setMinPreMhMDV20NF); applyStr(s.maxPreMhMDV20NF, setMaxPreMhMDV20NF);
        applyStr(s.minMdnPostMhVol90NF, setMinMdnPostMhVol90NF); applyStr(s.maxMdnPostMhVol90NF, setMaxMdnPostMhVol90NF);
        applyStr(s.minImbARCA, setMinImbARCA); applyStr(s.maxImbARCA, setMaxImbARCA);
        applyStr(s.minImbExchValue, setMinImbExchValue); applyStr(s.maxImbExchValue, setMaxImbExchValue);

        if (typeof s.requireHasNews === "boolean") setRequireHasNews(s.requireHasNews);
        if (typeof s.requireHasReport === "boolean") setRequireHasReport(s.requireHasReport);
        if (typeof s.requireIsPTP === "boolean") setRequireIsPTP(s.requireIsPTP);
        if (typeof s.requireIsSSR === "boolean") setRequireIsSSR(s.requireIsSSR);
        if (typeof s.requireIsETF === "boolean") setRequireIsETF(s.requireIsETF);
        if (typeof s.requireIsCrap === "boolean") setRequireIsCrap(s.requireIsCrap);
        if (typeof s.excludePTP === "boolean") setExcludePTP(s.excludePTP);
        if (typeof s.excludeSSR === "boolean") setExcludeSSR(s.excludeSSR);
        if (typeof s.excludeETF === "boolean") setExcludeETF(s.excludeETF);
        if (typeof s.excludeCrap === "boolean") setExcludeCrap(s.excludeCrap);
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
      endAbs,
      minHoldCandles,
      pnlMode,
      includeEquityCurve,
      equityCurveMode,
      topN,
      scopeMode,
      offset,
      minTradesPerTicker,
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
      minVolNFfromLstCls,
      maxVolNFfromLstCls,
      requireHasNews,
      requireHasReport,
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
      minMdnPreMhVol90,
      maxMdnPreMhVol90,
      minPreMhMDV90NF,
      maxPreMhMDV90NF,
      minPreMhMDV20NF,
      maxPreMhMDV20NF,
      minMdnPostMhVol90NF,
      maxMdnPostMhVol90NF,
      minImbARCA,
      maxImbARCA,
      minImbExchValue,
      maxImbExchValue,
    }),
    [
      tab, ruleBand, zapUiMode, showSharedMinMax, dateMode, dateNy, dateFrom, dateTo,
      session, metric, closeMode, startAbs, endAbs, minHoldCandles, pnlMode,
      includeEquityCurve, equityCurveMode, topN, scopeMode, offset, minTradesPerTicker,
      qTicker, qSide, listMode, showIgnore, showApply, showPin, episodesUseSearch, showAdvanced,
      ratingType, ratingRules, ratingEnabledBands, tickersText, benchTickersText, sideFilter,
      exchangesText, countriesText, sectorsL3Text, imbExchsText, minTierBp, maxTierBp,
      minBeta, maxBeta, minMarketCapM, maxMarketCapM, minRoundLot, maxRoundLot, minAdv20,
      maxAdv20, minAdv20NF, maxAdv20NF, minAdv90, maxAdv90, minAdv90NF, maxAdv90NF,
      minPreMktVol, maxPreMktVol, minPreMktVolNF, maxPreMktVolNF, minSpread, maxSpread,
      minSpreadBps, maxSpreadBps, minGap, maxGap, minGapPct, maxGapPct, minClsToClsPct,
      maxClsToClsPct, minVWAP, maxVWAP, minLo, maxLo, minAvPreMhv, maxAvPreMhv, minLstPrcL,
      maxLstPrcL, minLstCls, maxLstCls, minYCls, maxYCls, minTCls, maxTCls,
      minVolNFfromLstCls, maxVolNFfromLstCls, requireHasNews, requireHasReport, minNewsCnt,
      maxNewsCnt, requireIsPTP, requireIsSSR, requireIsETF, requireIsCrap, excludePTP,
      excludeSSR, excludeETF, excludeCrap, minMdnPreMhVol90, maxMdnPreMhVol90,
      minPreMhMDV90NF, maxPreMhMDV90NF, minPreMhMDV20NF, maxPreMhMDV20NF,
      minMdnPostMhVol90NF, maxMdnPostMhVol90NF, minImbARCA, maxImbARCA,
      minImbExchValue, maxImbExchValue,
    ]
  );

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
    return {
      dateNy: d,
      metric,
      startAbs,
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      pnlMode,
    };
  }

  function buildPostRequest(from: string, to: string): PaperArbAnalyticsRequest {
    const mh = Math.max(0, Math.min(180, clampInt(minHoldCandles, 0)));

    const rrEnabled = ratingRules
      .filter((r) => ratingEnabledBands[r.band])
      .map((r) => ({
        band: r.band,
        minRate: Math.max(0, Number(r.minRate) || 0),
        minTotal: Math.max(0, clampInt(r.minTotal, 0)),
      }));

    const req: PaperArbAnalyticsRequest = {
      dateFrom: from,
      dateTo: to,

      metric,
      startAbs,
      endAbs,
      session,
      closeMode,
      minHoldCandles: mh,
      pnlMode,

      ratingType: ratingType ?? "any",
      ratingRules: rrEnabled.length ? rrEnabled : null,

      tickers: splitListUpper(tickersText).length ? splitListUpper(tickersText) : null,
      benchTickers: splitListUpper(benchTickersText).length ? splitListUpper(benchTickersText) : null,
      side: sideFilter ? sideFilter : null,

      exchanges: splitListUpper(exchangesText).length ? splitListUpper(exchangesText) : null,
      countries: splitListUpper(countriesText).length ? splitListUpper(countriesText) : null,
      sectorsL3: splitList(sectorsL3Text).length ? splitList(sectorsL3Text) : null,

      minTierBp: optNumOrNull(minTierBp),
      maxTierBp: optNumOrNull(maxTierBp),
      minBeta: optNumOrNull(minBeta),
      maxBeta: optNumOrNull(maxBeta),

      minMarketCapM: optNumOrNull(minMarketCapM),
      maxMarketCapM: optNumOrNull(maxMarketCapM),

      minRoundLot: optNumOrNull(minRoundLot),
      maxRoundLot: optNumOrNull(maxRoundLot),

      minAdv20: optNumOrNull(minAdv20),
      maxAdv20: optNumOrNull(maxAdv20),
      minAdv20NF: optNumOrNull(minAdv20NF),
      maxAdv20NF: optNumOrNull(maxAdv20NF),

      minAdv90: optNumOrNull(minAdv90),
      maxAdv90: optNumOrNull(maxAdv90),
      minAdv90NF: optNumOrNull(minAdv90NF),
      maxAdv90NF: optNumOrNull(maxAdv90NF),

      minPreMktVol: optNumOrNull(minPreMktVol),
      maxPreMktVol: optNumOrNull(maxPreMktVol),
      minPreMktVolNF: optNumOrNull(minPreMktVolNF),
      maxPreMktVolNF: optNumOrNull(maxPreMktVolNF),

      minSpread: optNumOrNull(minSpread),
      maxSpread: optNumOrNull(maxSpread),
      minSpreadBps: optNumOrNull(minSpreadBps),
      maxSpreadBps: optNumOrNull(maxSpreadBps),

      minGap: optNumOrNull(minGap),
      maxGap: optNumOrNull(maxGap),
      minGapPct: optNumOrNull(minGapPct),
      maxGapPct: optNumOrNull(maxGapPct),

      minClsToClsPct: optNumOrNull(minClsToClsPct),
      maxClsToClsPct: optNumOrNull(maxClsToClsPct),

      minVWAP: optNumOrNull(minVWAP),
      maxVWAP: optNumOrNull(maxVWAP),

      minLo: optNumOrNull(minLo),
      maxLo: optNumOrNull(maxLo),

      requireHasNews: requireHasNews ? true : null,
      requireHasReport: requireHasReport ? true : null,
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

      minMdnPreMhVol90: optNumOrNull(minMdnPreMhVol90),
      maxMdnPreMhVol90: optNumOrNull(maxMdnPreMhVol90),

      minPreMhMDV90NF: optNumOrNull(minPreMhMDV90NF),
      maxPreMhMDV90NF: optNumOrNull(maxPreMhMDV90NF),

      minPreMhMDV20NF: optNumOrNull(minPreMhMDV20NF),
      maxPreMhMDV20NF: optNumOrNull(maxPreMhMDV20NF),

      minMdnPostMhVol90NF: optNumOrNull(minMdnPostMhVol90NF),
      maxMdnPostMhVol90NF: optNumOrNull(maxMdnPostMhVol90NF),

      minAvPreMhv: optNumOrNull(minAvPreMhv),
      maxAvPreMhv: optNumOrNull(maxAvPreMhv),
      minLstPrcL: optNumOrNull(minLstPrcL),
      maxLstPrcL: optNumOrNull(maxLstPrcL),
      minLstCls: optNumOrNull(minLstCls),
      maxLstCls: optNumOrNull(maxLstCls),
      minYCls: optNumOrNull(minYCls),
      maxYCls: optNumOrNull(maxYCls),
      minTCls: optNumOrNull(minTCls),
      maxTCls: optNumOrNull(maxTCls),
      minLstClsNewsCnt: optNumOrNull(minNewsCnt),
      maxLstClsNewsCnt: optNumOrNull(maxNewsCnt),
      minPreMhVolNF: optNumOrNull(minPreMktVolNF),
      maxPreMhVolNF: optNumOrNull(maxPreMktVolNF),
      minVolNFfromLstCls: optNumOrNull(minVolNFfromLstCls),
      maxVolNFfromLstCls: optNumOrNull(maxVolNFfromLstCls),

      imbExchs: splitListUpper(imbExchsText).length ? splitListUpper(imbExchsText) : null,
      minImbARCA: optNumOrNull(minImbARCA),
      maxImbARCA: optNumOrNull(maxImbARCA),
      minImbExchValue: optNumOrNull(minImbExchValue),
      maxImbExchValue: optNumOrNull(maxImbExchValue),
    };

    return req;
  }

  // ========= Run handler
  async function run() {
    if (!canRun) return;

    setLoading(true);
    setErr(null);

    try {
      if (tab === "active") {
        const params = buildGetParams(dateNy);
        const qs = buildPaperQuery(params);
        const j = await apiGet<any>(`/api/paper/arbitrage/active${qs}`);
        const rows = normalizeRows<PaperArbActiveRow>(j);
        setActiveRows(rows ?? []);
      } else if (tab === "episodes") {
        if (!episodesUseSearch) {
          const params = buildGetParams(dateNy);
          const qs = buildPaperQuery(params);
          const j = await apiGet<any>(`/api/paper/arbitrage/episodes${qs}`);
          const rows = normalizeRows<PaperArbClosedDto>(j);
          setEpisodesRows(rows ?? []);
        } else {
          const req = buildPostRequest(dateFrom, dateTo);
          const j = await apiPost<any>("/api/paper/arbitrage/episodes/search", req);
          const rows = normalizeRows<PaperArbClosedDto>(j);
          setEpisodesRows(rows ?? []);
        }
      } else {
        const req = buildPostRequest(dateFrom, dateTo);
        req.includeEquityCurve = true;
        req.equityCurveMode = equityCurveMode;
        req.topN = Math.max(1, Math.min(1000, clampInt(scopeMode === "ALL" ? 1000 : topN, 1000)));
        req.startCutoffMinuteIdx = Math.max(0, clampInt(offset, 0));
        req.minTradesPerTicker = Math.max(0, clampInt(minTradesPerTicker, 0));
        const [j, ej] = await Promise.all([
          apiPost<PaperArbAnalyticsResponse>("/api/paper/arbitrage/analytics", req),
          apiPost<any>("/api/paper/arbitrage/episodes/search", buildPostRequest(dateFrom, dateTo)),
        ]);
        setAnalytics(j ?? null);
        setEpisodesRows(normalizeRows<PaperArbClosedDto>(ej) ?? []);
      }
      setUpdatedAt(new Date());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ========= Client-side filters
  const filteredActive = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    return activeRows.filter((r) => {
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      return true;
    });
  }, [activeRows, qTicker, qSide]);

  const filteredEpisodes = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    return episodesRows.filter((r) => {
      if (tq && !String(r.ticker ?? "").toUpperCase().includes(tq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      return true;
    });
  }, [episodesRows, qTicker, qSide]);

  const cmpVal = (a: string | number, b: string | number) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  };
  const dirMul = (dir: SortDir) => (dir === "asc" ? 1 : -1);

  const activeSortValue = (r: PaperArbActiveRow, key: ActiveSortKey): string | number => {
    const startAbsV = r.start?.metricAbs ?? (r.start?.metric != null ? Math.abs(r.start.metric) : null);
    const peakAbsV = r.peak?.metricAbs ?? (r.peak?.metric != null ? Math.abs(r.peak.metric) : null);
    const lastAbsV = r.last?.metricAbs ?? (r.last?.metric != null ? Math.abs(r.last.metric) : null);
    switch (key) {
      case "ticker":
        return String(r.ticker ?? "");
      case "bench":
        return String(r.benchTicker ?? "");
      case "side":
        return normalizeSide(r.side).label;
      case "startTime":
        return r.start?.minuteIdx ?? -1;
      case "peakTime":
        return r.peak?.minuteIdx ?? -1;
      case "lastTime":
        return r.last?.minuteIdx ?? -1;
      case "startAbs":
        return startAbsV ?? -1;
      case "peakAbs":
        return peakAbsV ?? -1;
      case "lastAbs":
        return lastAbsV ?? -1;
      case "startClass":
        return String(r.startClass ?? "");
      case "closeMode":
        return String(r.closeMode ?? closeMode);
      case "minHold":
        return r.minHoldCandles ?? minHoldCandles;
    }
  };

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

  const activeSorted = useMemo(() => {
    const mul = dirMul(activeSort.dir);
    return [...filteredActive].sort((a, b) => cmpVal(activeSortValue(a, activeSort.key), activeSortValue(b, activeSort.key)) * mul);
  }, [filteredActive, activeSort, closeMode, minHoldCandles]);

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
  const modeLabel = dateMode === "range" ? "RANGE" : "DAY";
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
  const ignCount = [excludePTP, excludeSSR, excludeETF, excludeCrap].filter(Boolean).length;
  const appCount = splitListUpper(tickersText).length;
  const pinCount = splitListUpper(benchTickersText).length;
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
    setZapUiMode(metric === "ZapPct" ? "zap" : "sigma");
  }, [metric]);

  const toggleActiveSort = (key: ActiveSortKey) => {
    setActiveSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };
  const toggleEpisodesSort = (key: EpisodeSortKey) => {
    setEpisodesSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };
  const toggleAnalyticsSort = (key: EpisodeSortKey) => {
    setAnalyticsSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };
  const sortMark = (active: boolean, dir: SortDir) => (active ? (dir === "asc" ? " ↑" : " ↓") : "");

  // ========= UI
  return (
    <div className="relative min-h-screen w-full bg-black/0 text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-white p-4 overflow-x-hidden">
      <NebulaBackground />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <header className="bg-[#0a0a0a]/60 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={clsx("w-2.5 h-2.5 rounded-full border border-white/10", loading ? "bg-emerald-500 animate-pulse" : "bg-emerald-500")} />
              <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                ARBITRAGE TERMINAL
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
            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
              <button type="button" disabled className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase border border-transparent text-zinc-600 bg-transparent cursor-not-allowed">
                MONEY
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[0_0_10px_-3px_rgba(16,185,129,0.2)]"
                title="PAPER (current)"
              >
                PAPER
              </button>
              <Link
                href="/signals/arbitrage"
                className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-violet-300 hover:text-violet-200 hover:bg-violet-500/10"
                title="Open /signals/arbitrage"
              >
                SIGNAL
              </Link>
            </div>

            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  tab === "active"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/25 shadow-[0_0_10px_-3px_rgba(245,158,11,0.25)]"
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
                    ? "bg-zinc-500/10 text-zinc-200 border-zinc-500/30 shadow-[0_0_10px_-3px_rgba(255,255,255,0.08)]"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                EPISODES
              </button>
              <button
                type="button"
                onClick={() => setTab("analytics")}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  tab === "analytics"
                    ? "bg-rose-500/15 border-rose-500/30 text-rose-300 shadow-[0_0_10px_-3px_rgba(244,63,94,0.25)]"
                    : "border-transparent text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                )}
              >
                ANALYTICS
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
              <div
                className={clsx(
                  "flex items-stretch overflow-hidden rounded-lg border transition-all",
                  listMode === "ignore" ? "border-rose-500/25 bg-rose-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setListMode("ignore");
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
                    showIgnore ? "text-violet-300" : "text-zinc-400 hover:text-white"
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
                    setListMode("apply");
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
                    showApply ? "text-violet-300" : "text-zinc-400 hover:text-white"
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
                  listMode === "pin" ? "border-cyan-500/25 bg-cyan-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setListMode("pin");
                    setShowAdvanced(true);
                  }}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                    listMode === "pin" ? "text-cyan-200" : "text-zinc-300"
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
                "w-9 h-9 flex items-center justify-center rounded-lg border text-[14px] transition-all active:scale-95",
                canRun
                  ? "border-emerald-500/50 bg-[#0a0a0a]/40 text-emerald-500 hover:bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                  : "border-white/10 bg-[#0a0a0a]/30 text-zinc-600 cursor-not-allowed"
              )}
              title={variantString}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>

            <div className="hidden xl:block ml-1">
              <CyberDollarGlyph />
            </div>
          </div>
        </header>

        <GlassCard className="p-3 border-white/[0.08] bg-[#05070b]/95">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#090b10] p-1 rounded-xl border border-white/[0.06]">
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
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    ruleBand === b.key
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {b.label}
                </button>
                ))}
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex items-center gap-2 bg-[#090b10] p-1 rounded-xl border border-white/[0.06]">
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
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    scopeMode === m.key
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex items-center gap-2 bg-[#090b10] p-1 rounded-xl border border-white/[0.06]">
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
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    ratingType === rt.key
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                  title={`RatingType = ${rt.key}`}
                >
                  {rt.label}
                </button>
                ))}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-[#090b10]">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">MINRATE</span>
              <GlassInput
                type="number"
                step={0.1}
                value={activeRule.minRate}
                onChange={(e) => setActiveRulePatch({ minRate: Math.max(0, clampNumber(e.target.value, 0)) })}
                className="w-[74px]"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-[#090b10]">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">MINTOTAL</span>
              <GlassInput
                type="number"
                step={1}
                min={0}
                value={activeRule.minTotal}
                onChange={(e) => setActiveRulePatch({ minTotal: Math.max(0, clampInt(e.target.value, 0)) })}
                className="w-[74px]"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-[#090b10]">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">SESSION</span>
              <GlassSelect
                value={session}
                onChange={(e) => setSession(e.target.value as PaperArbSession)}
                options={[
                  { value: "GLOB", label: "GLOB" },
                  { value: "BLUE", label: "BLUE" },
                  { value: "ARK", label: "ARK" },
                  { value: "OPEN", label: "OPEN" },
                  { value: "INTRA", label: "INTRA" },
                  { value: "POST", label: "POST" },
                  { value: "NIGHT", label: "NIGHT" },
                ]}
                className="min-w-[108px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowSharedMinMax((v) => !v)}
              className={clsx(
                "w-9 h-9 flex items-center justify-center rounded-lg border transition-all",
                showSharedMinMax
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-[#090b10] text-zinc-500 hover:text-zinc-300"
              )}
              title={showSharedMinMax ? "Hide shared filters" : "Show shared filters"}
            >
              {showSharedMinMax ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-3 3.8" />
                  <path d="M6.6 6.6C4.1 8.3 2 12 2 12a18.6 18.6 0 0 0 7.5 5.7" />
                </svg>
              )}
            </button>
          </div>

          {showSharedMinMax && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
              <MinMaxRow label="ADV20" minValue={minAdv20} maxValue={maxAdv20} setMin={setMinAdv20} setMax={setMaxAdv20} card clearable />
              <MinMaxRow label="ADV20NF" minValue={minAdv20NF} maxValue={maxAdv20NF} setMin={setMinAdv20NF} setMax={setMaxAdv20NF} card clearable />
              <MinMaxRow label="ADV90" minValue={minAdv90} maxValue={maxAdv90} setMin={setMinAdv90} setMax={setMaxAdv90} card clearable />
              <MinMaxRow label="ADV90NF" minValue={minAdv90NF} maxValue={maxAdv90NF} setMin={setMinAdv90NF} setMax={setMaxAdv90NF} card clearable />
              <MinMaxRow label="AvPreMhv" minValue={minAvPreMhv} maxValue={maxAvPreMhv} setMin={setMinAvPreMhv} setMax={setMaxAvPreMhv} card clearable />
              <MinMaxRow label="RoundLot" minValue={minRoundLot} maxValue={maxRoundLot} setMin={setMinRoundLot} setMax={setMaxRoundLot} card clearable />
              <MinMaxRow label="VWAP" minValue={minVWAP} maxValue={maxVWAP} setMin={setMinVWAP} setMax={setMaxVWAP} card clearable />
              <MinMaxRow label="Spread" minValue={minSpread} maxValue={maxSpread} setMin={setMinSpread} setMax={setMaxSpread} card clearable />
              <MinMaxRow label="LstPrcL" minValue={minLstPrcL} maxValue={maxLstPrcL} setMin={setMinLstPrcL} setMax={setMaxLstPrcL} card clearable />
              <MinMaxRow label="LstCls" minValue={minLstCls} maxValue={maxLstCls} setMin={setMinLstCls} setMax={setMaxLstCls} card clearable />
              <MinMaxRow label="YCls" minValue={minYCls} maxValue={maxYCls} setMin={setMinYCls} setMax={setMaxYCls} card clearable />
              <MinMaxRow label="TCls" minValue={minTCls} maxValue={maxTCls} setMin={setMinTCls} setMax={setMaxTCls} card clearable />
              <MinMaxRow label="ClsToCls%" minValue={minClsToClsPct} maxValue={maxClsToClsPct} setMin={setMinClsToClsPct} setMax={setMaxClsToClsPct} card clearable />
              <MinMaxRow label="Lo" minValue={minLo} maxValue={maxLo} setMin={setMinLo} setMax={setMaxLo} card clearable />
              <MinMaxRow label="LstClsNewsCnt" minValue={minNewsCnt} maxValue={maxNewsCnt} setMin={setMinNewsCnt} setMax={setMaxNewsCnt} card clearable />
              <MinMaxRow
                label="MarketCapM"
                minValue={minMarketCapM}
                maxValue={maxMarketCapM}
                setMin={setMinMarketCapM}
                setMax={setMaxMarketCapM}
                card
                clearable
              />
              <MinMaxRow label="PreMhVolNF" minValue={minPreMktVolNF} maxValue={maxPreMktVolNF} setMin={setMinPreMktVolNF} setMax={setMaxPreMktVolNF} card clearable />
              <MinMaxRow
                label="VolNFfromLstCls"
                minValue={minVolNFfromLstCls}
                maxValue={maxVolNFfromLstCls}
                setMin={setMinVolNFfromLstCls}
                setMax={setMaxVolNFfromLstCls}
                card
              />
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
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
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
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
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
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
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 shadow-[0_0_10px_-3px_rgba(16,185,129,0.25)]"
                      : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {m.label}
                </button>
                ))}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">SIDE</span>
              <GlassSelect
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value as any)}
                options={[
                  { value: "", label: "ANY" },
                  { value: "Long", label: "LONG" },
                  { value: "Short", label: "SHORT" },
                ]}
                className="min-w-[90px]"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">MINHOLD</span>
              <GlassInput
                type="number"
                min={0}
                max={180}
                step={1}
                value={minHoldCandles}
                onChange={(e) => setMinHoldCandles(Math.max(0, Math.min(180, clampInt(e.target.value, 0))))}
                className="w-[74px]"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">TRADES</span>
              <GlassInput
                type="number"
                min={0}
                step={10}
                value={minTradesPerTicker}
                onChange={(e) => setMinTradesPerTicker(Math.max(0, clampInt(e.target.value, 0)))}
                className="w-[74px]"
              />
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-white/10 bg-white/5">
              <div className="flex items-center gap-1 bg-[#0a0a0a]/40 p-1 rounded-lg border border-white/[0.06]">
                {[
                  { key: "day", label: "DAY" },
                  { key: "range", label: "RANGE" },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      const wants = m.key as DateMode;
                      const canRange = tab === "analytics" || (tab === "episodes" && episodesUseSearch);
                      if (wants === "range" && !canRange) return;
                      setDateMode(wants);
                    }}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all border",
                      dateMode === m.key
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {dateMode === "day" ? (
                <GlassSelect
                  value={dateNy}
                  onChange={(e) => {
                    const d = e.target.value;
                    setDateNy(d);
                    setDateFrom(d);
                    setDateTo(d);
                  }}
                  options={(days?.length ? days : [dateNy]).map((d) => ({ value: d, label: d }))}
                  className="min-w-[126px]"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <GlassInput
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-[128px]"
                  />
                  <GlassInput
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-[128px]"
                  />
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="flex items-center gap-2 p-2 rounded-xl border border-rose-900/30 bg-rose-900/10">
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
                  title: "Toggle",
                  active: requireHasNews,
                  onClick: () => setRequireHasNews((v) => !v),
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
                  title: "Toggle",
                  active: requireHasReport,
                  onClick: () => setRequireHasReport((v) => !v),
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
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all",
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

            <div className="flex items-center gap-2 p-2 rounded-xl border border-violet-500/30 bg-violet-500/10">
              <button
                type="button"
                onClick={() => {
                  setZapUiMode("zap");
                  setMetric("ZapPct");
                }}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all border uppercase",
                  zapUiMode === "zap"
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.25)]"
                    : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200"
                )}
              >
                ZAP
              </button>

              <button
                type="button"
                onClick={() => {
                  setZapUiMode("sigma");
                  setMetric("SigmaZap");
                }}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all border flex items-baseline gap-1",
                  zapUiMode === "sigma"
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.25)]"
                    : "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200"
                )}
              >
                <span className="text-[12px] leading-[1] relative top-[0.5px]" style={{ textTransform: "none" }}>
                  SIGMA
                </span>
                <span className="uppercase">ZAP</span>
              </button>

              <GlassInput
                type="number"
                step={0.1}
                min={0}
                value={startAbs}
                disabled={zapUiMode === "off"}
                onChange={(e) => setStartAbs(clampNumber(e.target.value, 0.1))}
                className={clsx("w-[66px] text-right", zapUiMode === "off" && "opacity-60")}
              />
              <GlassInput
                type="number"
                step={1}
                min={0}
                value={minHoldCandles}
                disabled={zapUiMode === "off"}
                onChange={(e) => setMinHoldCandles(Math.max(0, clampInt(e.target.value, 0)))}
                className={clsx("w-[56px] text-right", zapUiMode === "off" && "opacity-60")}
              />
              <GlassInput
                type="number"
                step={0.1}
                min={0}
                value={endAbs}
                disabled={zapUiMode === "off"}
                onChange={(e) => setEndAbs(clampNumber(e.target.value, 0.05))}
                className={clsx("w-[66px] text-right", zapUiMode === "off" && "opacity-60")}
              />

              <button
                type="button"
                onClick={() => {
                  setZapUiMode("off");
                  setMetric("SigmaZap");
                  setStartAbs(0.1);
                  setMinHoldCandles(0);
                  setEndAbs(0.05);
                }}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  zapUiMode === "off"
                    ? "bg-zinc-500/10 border-zinc-500/30 text-zinc-200"
                    : "bg-transparent border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
              >
                OFF
              </button>

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">DATE (NY)</div>
                <div className="text-sm font-mono mt-1">{dateNy}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">SESSION</div>
                <div className="text-sm font-mono mt-1">{session}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">ROWS</div>
                <div className="text-sm font-mono mt-1">{intn(activeSorted.length)}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">MODE</div>
                <div className="text-sm font-mono mt-1">
                  {metric} | {closeMode} | {pnlMode}
                </div>
              </GlassCard>
            </div>

            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                ACTIVE EPISODES | rows {activeSorted.length}
              </div>

              <div className="overflow-auto rounded-xl border border-white/10 bg-[#070707]/70 backdrop-blur-md">
                <table className="min-w-[1200px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-[#0b0b0b]/95 text-zinc-400 border-b border-white/10 backdrop-blur-md">
                    <tr>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("ticker")}>Ticker{sortMark(activeSort.key === "ticker", activeSort.dir)}</button></th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("bench")}>Bench{sortMark(activeSort.key === "bench", activeSort.dir)}</button></th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("side")}>Side{sortMark(activeSort.key === "side", activeSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("startTime")}>StartTime{sortMark(activeSort.key === "startTime", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("peakTime")}>PeakTime{sortMark(activeSort.key === "peakTime", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("lastTime")}>LastTime{sortMark(activeSort.key === "lastTime", activeSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("startAbs")}>StartAbs{sortMark(activeSort.key === "startAbs", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("peakAbs")}>PeakAbs{sortMark(activeSort.key === "peakAbs", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("lastAbs")}>LastAbs{sortMark(activeSort.key === "lastAbs", activeSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("startClass")}>StartClass{sortMark(activeSort.key === "startClass", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("closeMode")}>CloseMode{sortMark(activeSort.key === "closeMode", activeSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleActiveSort("minHold")}>MinHold{sortMark(activeSort.key === "minHold", activeSort.dir)}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSorted.map((r) => {
                      const startAbsV =
                        r.start?.metricAbs ?? (r.start?.metric != null ? Math.abs(r.start.metric) : null);
                      const peakAbsV =
                        r.peak?.metricAbs ?? (r.peak?.metric != null ? Math.abs(r.peak.metric) : null);
                      const lastAbsV =
                        r.last?.metricAbs ?? (r.last?.metric != null ? Math.abs(r.last.metric) : null);

                      return (
                        <tr key={r.ticker} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                          <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                          <td className="p-2.5 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2.5">
                            <SideBadge side={r.side} />
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxWithClock(r.start?.minuteIdx)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxWithClock(r.peak?.minuteIdx)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxWithClock(r.last?.minuteIdx)}</td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(startAbsV as any, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(peakAbsV as any, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(lastAbsV as any, 3)}</td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{r.startClass ?? "-"}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{r.closeMode ?? closeMode}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{intn(r.minHoldCandles ?? minHoldCandles)}</td>
                        </tr>
                      );
                    })}
                    {!activeSorted.length && (
                      <tr>
                        <td colSpan={12} className="p-6 text-center text-zinc-500">
                          No active episodes for this variant/day. Try lowering StartAbs or using Session=GLOB.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#0a0a0a]/45 p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 mb-2">Variant</div>
                <div className="text-xs font-mono text-zinc-300 break-words">{variantString}</div>
              </div>
            </GlassCard>
          </div>
        )}

        {tab === "episodes" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">CLOSED COUNT</div>
                <div className="text-sm font-mono mt-1">{intn(episodesSummary.count)}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">TOTAL PNL</div>
                <div
                  className={clsx(
                    "text-sm font-mono mt-1",
                    episodesSummary.total > 0
                      ? "text-emerald-300"
                      : episodesSummary.total < 0
                        ? "text-rose-300"
                        : "text-zinc-200"
                  )}
                >
                  {num(episodesSummary.total, 2)}
                </div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">W / L</div>
                <div className="text-sm font-mono mt-1">
                  {intn(episodesSummary.wins)} / {intn(episodesSummary.losses)}
                </div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">AVG PNL</div>
                <div className="text-sm font-mono mt-1">{num(episodesSummary.avg, 2)}</div>
              </GlassCard>
            </div>

            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                EPISODES | rows {episodesSorted.length} | click header to sort{" "}
                {episodesUseSearch ? "| SEARCH(POST)" : "| GET(day)"}
              </div>

              <div className="overflow-auto rounded-xl border border-white/10 bg-[#070707]/70 backdrop-blur-md">
                <table className="min-w-[1400px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-[#0b0b0b]/95 text-zinc-400 border-b border-white/10 backdrop-blur-md">
                    <tr>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("ticker")}>Ticker{sortMark(episodesSort.key === "ticker", episodesSort.dir)}</button></th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("bench")}>Bench{sortMark(episodesSort.key === "bench", episodesSort.dir)}</button></th>
                      <th className="text-left p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("side")}>Side{sortMark(episodesSort.key === "side", episodesSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("startTime")}>StartTime{sortMark(episodesSort.key === "startTime", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("peakTime")}>PeakTime{sortMark(episodesSort.key === "peakTime", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("endTime")}>EndTime{sortMark(episodesSort.key === "endTime", episodesSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("startAbs")}>StartAbs{sortMark(episodesSort.key === "startAbs", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("peakAbs")}>PeakAbs{sortMark(episodesSort.key === "peakAbs", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("endAbs")}>EndAbs{sortMark(episodesSort.key === "endAbs", episodesSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("total")}>Total{sortMark(episodesSort.key === "total", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("raw")}>Raw{sortMark(episodesSort.key === "raw", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("benchPnl")}>Bench{sortMark(episodesSort.key === "benchPnl", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("hedged")}>Hedged{sortMark(episodesSort.key === "hedged", episodesSort.dir)}</button></th>

                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("closeMode")}>CloseMode{sortMark(episodesSort.key === "closeMode", episodesSort.dir)}</button></th>
                      <th className="text-right p-2.5 uppercase tracking-widest text-[10px]"><button type="button" onClick={() => toggleEpisodesSort("minHold")}>MinHold{sortMark(episodesSort.key === "minHold", episodesSort.dir)}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {episodesSorted.map((r, i) => {
                      const pnl = r.totalPnlUsd ?? 0;
                      return (
                        <tr key={`${r.ticker}|${i}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                          <td className="p-2.5 text-zinc-100 font-semibold">{r.ticker}</td>
                          <td className="p-2.5 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2.5">
                            <SideBadge side={r.side} />
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxWithClock(r.startMinuteIdx)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{minuteIdxWithClock(r.peakMinuteIdx)}</td>
                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums",
                              minuteIdxToClockLabel(r.endMinuteIdx) === "09:30" ? "text-violet-300" : "text-zinc-300"
                            )}
                          >
                            {minuteIdxWithClock(r.endMinuteIdx)}
                          </td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.startMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.peakMetricAbs ?? null, 3)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(r.endMetricAbs ?? null, 3)}</td>

                          <td
                            className={clsx(
                              "p-2.5 text-right tabular-nums font-bold",
                              pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-zinc-200"
                            )}
                          >
                            {num(r.totalPnlUsd ?? null, 2)}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.rawPnlUsd ?? null, 2)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.benchPnlUsd ?? null, 2)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.hedgedPnlUsd ?? null, 2)}</td>

                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{r.closeMode ?? closeMode}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{intn(r.minHoldCandles ?? minHoldCandles)}</td>
                        </tr>
                      );
                    })}
                    {!episodesSorted.length && (
                      <tr>
                        <td colSpan={15} className="p-6 text-center text-zinc-500">
                          No closed episodes for this query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#0a0a0a]/45 p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 mb-2">Variant</div>
                <div className="text-xs font-mono text-zinc-300 break-words">{variantString}</div>
              </div>
            </GlassCard>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">TRADES</div>
                <div className="text-sm font-mono mt-1">{intn(analytics?.trades ?? null)}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">TOTAL PNL</div>
                <div
                  className={clsx(
                    "text-sm font-mono mt-1",
                    (analytics?.totalPnlUsd ?? 0) > 0
                      ? "text-emerald-300"
                      : (analytics?.totalPnlUsd ?? 0) < 0
                        ? "text-rose-300"
                        : "text-zinc-200"
                  )}
                >
                  {num(analytics?.totalPnlUsd ?? null, 2)}
                </div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">WIN RATE</div>
                <div className="text-sm font-mono mt-1">
                  {analytics?.winRate == null ? "-" : `${num(analytics.winRate * 100, 1)}%`}
                </div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">PROFIT FACTOR</div>
                <div className="text-sm font-mono mt-1">{num(analytics?.profitFactor ?? null, 2)}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">EXPECTANCY</div>
                <div className="text-sm font-mono mt-1">{num(analytics?.expectancyUsd ?? null, 2)}</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">MAX DRAWDOWN</div>
                <div className="text-sm font-mono mt-1">{num(analytics?.maxDrawdownUsd ?? null, 2)}</div>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {(analytics?.equityCurve?.length ?? 0) > 0 && (
                <GlassCard className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                      EQUITY CURVE | {equityCurveMode}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600">
                      points {intn(analytics?.equityCurve?.length ?? 0)}
                    </div>
                  </div>
                  <EquityChart points={analytics!.equityCurve!} />
                </GlassCard>
              )}

              <GlassCard className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                    START EVENTS BY TIME | 5M
                  </div>
                  <div className="text-[10px] font-mono text-zinc-600">rows {intn(analyticsSorted.length)}</div>
                </div>
                <StartsByTimeChart rows={analyticsSorted} />
              </GlassCard>
            </div>

            <GlassCard className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                  ANALYTICS TRADES | rows {analyticsSorted.length}
                </div>
                <div className="text-[10px] font-mono text-zinc-600">dark pro table</div>
              </div>

              <div className="overflow-auto rounded-xl border border-white/10 bg-[#070707]/70 backdrop-blur-md">
                <table className="min-w-[1720px] w-full text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-[#0b0b0b]/95 text-zinc-400 border-b border-white/10 backdrop-blur-md">
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
                              pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-zinc-200"
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

                          <td className="p-2.5 text-right tabular-nums text-zinc-300 border-l border-white/10">{num(r.rawPnlUsd ?? null, 2)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.benchPnlUsd ?? null, 2)}</td>
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">{num(r.hedgedPnlUsd ?? null, 2)}</td>
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

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#0a0a0a]/45 p-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 mb-2">Variant</div>
                <div className="text-xs font-mono text-zinc-300 break-words">{variantString}</div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Footer helper */}
        <div className="text-[10px] font-mono text-zinc-600">
          Tip: any change in Metric/Session/StartAbs/EndAbs/CloseMode/MinHold/PnLMode changes variant and may rebuild cache
          on backend.
        </div>
      </div>
    </div>
  );
}







