"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { getArbTicker } from "@/lib/trapClient";
import {
  ArrowLeft,
  Activity,
  Layers,
  SlidersHorizontal,
  Zap,
  TrendingUp,
  Globe,
  Clock,
  BarChart2,
  Maximize2
} from "lucide-react";

// =========================
// THEME & CONSTANTS
// =========================
const THEME = {
  bg: "#030303",
  cardBg: "rgba(10, 10, 10, 0.4)",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  grid: "rgba(255, 255, 255, 0.04)",
  textMain: "#ececec",
  textMuted: "#525252",
  colors: {
    hard: "#10b981", // Emerald 500
    soft: "#8b5cf6", // Violet 500
    none: "#ef4444", // Red 500
    any: "#06b6d4", // Cyan 500
    amber: "#f59e0b",
  }
};

// =========================
// TYPES & UTILS
// =========================
type AnyObj = Record<string, any>;
type ArbTypeKey = "blue" | "ark" | "print" | "open" | "intra" | "post" | "global";


type StackedRow = { label: string; hard: number; soft: number; none: number; total: number };
type BenchStackedRow = { label: string; hard: number; soft: number; total: number };
type RangeItem = { from: string; to: string; rate: number; total: number };

type HeaderRates = {
  any?: { rate?: number; total?: number };
  hard?: { rate?: number; total?: number };
  soft?: { rate?: number; total?: number };
};

type HeaderMetrics = {
  rates?: Record<ArbTypeKey, HeaderRates>;
  print_basics?: {
    median_pos?: number;
    median_neg?: number;
    mode_peak_pos?: number;
    mode_peak_neg?: number;
    median_recovery_frac?: number;
    mode_post_peak_low?: number;
    avg_norm_minutes?: number;
    avg_events_per_day?: number;
  };
};

function isObj(v: any): v is AnyObj {
  return v && typeof v === "object" && !Array.isArray(v);
}
function n(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function fmt(x: any, d = 2) {
  const v = n(x);
  return v == null ? "—" : v.toFixed(d);
}
function fmtPct01(x: any, d = 0) {
  const v = n(x);
  if (v == null) return "—";
  return `${(v * 100).toFixed(d)}%`;
}
function fmtSigned(x: any, d = 3) {
  const v = n(x);
  if (v == null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(d)}`;
}
function fmtDt(dt?: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(x: any) {
  const s = String(x ?? "");
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return s;
}

// =========================
// UI ATOMS
// =========================

const NeonGradientDefs = () => (
  <defs>
    <linearGradient id="gradHard" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.hard} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.hard} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradSoft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.soft} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.soft} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradNone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.none} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.none} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradAny" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.any} stopOpacity={0.4} />
      <stop offset="100%" stopColor={THEME.colors.any} stopOpacity={0} />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

const GlassCard = ({ children, className = "", glow = false }: { children: React.ReactNode; className?: string, glow?: boolean }) => (
  <div
    className={`
      relative group overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-500
      ${glow ? "shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)]" : "shadow-xl"}
      bg-[#0a0a0a]/60 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#0a0a0a]/80
      ${className}
    `}
  >
    <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
    {children}
  </div>
);

const Chip = ({
  children,
  variant = "zinc",
  size = "sm"
}: {
  children: React.ReactNode;
  variant?: "zinc" | "emerald" | "violet" | "cyan" | "amber" | "rose";
  size?: "xs" | "sm";
}) => {
  const styles = {
    zinc: "bg-zinc-800/40 text-zinc-400 border-zinc-700/50",
    emerald: "bg-emerald-950/30 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-4px_rgba(16,185,129,0.3)]",
    violet: "bg-violet-950/30 text-violet-400 border-violet-500/20 shadow-[0_0_10px_-4px_rgba(139,92,246,0.3)]",
    cyan: "bg-cyan-950/30 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_-4px_rgba(6,182,212,0.3)]",
    amber: "bg-amber-950/30 text-amber-400 border-amber-500/20",
    rose: "bg-rose-950/30 text-rose-400 border-rose-500/20",
  };
  const sizes = {
    xs: "px-1.5 py-0.5 text-[9px]",
    sm: "px-2.5 py-1 text-[10px]",
  };
  return (
    <span className={`inline-flex items-center justify-center rounded-md border font-mono font-bold uppercase tracking-wider ${styles[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
};

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-white/[0.04]">
    <div className="flex items-center gap-4">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
        <Icon size={18} className="text-zinc-200" />
        <div className="absolute inset-0 rounded-xl bg-white/5 opacity-0 hover:opacity-100 transition-opacity" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs font-medium text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#050505]/90 border border-white/10 p-3 rounded-lg backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] min-w-[180px]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      </div>
      <div className="space-y-1">
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2 text-zinc-300 font-medium">
              <span className="w-1 h-3 rounded-full" style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}` }} />
              {entry.name}
            </span>
            <span className="font-mono text-white tabular-nums tracking-wide">
              {Number(entry.value).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =========================
// ACCESSORS & LOGIC
// =========================
function getMeta(item: AnyObj | null) {
  const meta = (item?.meta ?? item?.static ?? item?.header ?? {}) as AnyObj;
  const bench = meta?.bench ?? item?.bench ?? meta?.benchmark ?? "—";
  const sector = meta?.sector ?? meta?.lvl2 ?? meta?.SectorL3 ?? item?.sector ?? "—";
  const exchange = meta?.exchange ?? item?.exchange;
  const marketCap = meta?.marketCap ?? meta?.market_cap ?? item?.marketCap ?? item?.market_cap;
  const corr = meta?.corr ?? meta?.cor ?? meta?.correlation ?? item?.corr ?? item?.static?.corr;
  const beta = meta?.beta ?? item?.beta ?? item?.static?.beta;
  const sigma = meta?.sigma ?? meta?.sig ?? item?.sigma ?? item?.static?.sigma;
  return { bench, sector, exchange, marketCap, corr, beta, sigma };
}

function getHeaderMetrics(item: AnyObj | null): HeaderMetrics {
  const hm = item?.header_metrics;
  if (isObj(hm)) return hm as HeaderMetrics;

  const statsPre = item?.stats?.pre ?? {};
  const statsIntra = item?.stats?.intra ?? {};
  const statsPost = item?.stats?.post ?? {};

  const mk = (s: AnyObj | null): any => (isObj(s)
    ? {
        any: { rate: n(s?.rate_any), total: n(s?.total) ?? undefined },
        hard: { rate: n(s?.rate_hard), total: n(s?.hard) ?? undefined },
        soft: { rate: n(s?.rate_soft), total: n(s?.soft) ?? undefined },
      }
    : {});

  return {
    rates: {
      global: mk(statsPre?.global ?? null),
      blue: mk(statsPre?.blue ?? null),
      ark: mk(statsPre?.ark ?? null),
      print: mk(statsPre?.print ?? null),
      open: mk(statsPre?.open ?? null),
      intra: mk(statsIntra?.intra ?? null),
      post: mk(statsPost?.post ?? null),
    },
  };

}

function getClassBlock(item: AnyObj | null, cls: ArbTypeKey): AnyObj | null {
  if (!item) return null;

  const c = item?.classes?.[cls];
  if (isObj(c)) return c;

  if (cls === "intra") return item?.intra ?? item?.stats?.intra ?? null;
  if (cls === "post") return item?.post ?? item?.stats?.post ?? null;

  // pre-classes: blue/ark/print/open/global
  return item?.pre?.[cls] ?? item?.stats?.pre?.[cls] ?? null;
}


function getPeakBins(item: AnyObj | null, cls: ArbTypeKey, sign: "pos" | "neg"): AnyObj | null {
  const c = getClassBlock(item, cls);
  const vNext = c?.bins?.peak?.[sign];
  if (isObj(vNext)) return vNext;

  if (cls === "intra") return item?.bins?.sigma?.intra?.intra?.[sign] ?? null;
  if (cls === "post") return item?.bins?.sigma?.post?.post?.[sign] ?? null;

  return item?.bins?.sigma?.pre?.[cls]?.[sign] ?? null;
}


function getBenchBins(item: AnyObj | null, cls: ArbTypeKey, moment: "start" | "peak" | "norm", sign: "pos" | "neg"): AnyObj | null {
  const c = getClassBlock(item, cls);
  const vNext = c?.bins?.bench?.[moment]?.[sign];
  if (isObj(vNext)) return vNext;

  if (cls === "intra") return item?.bins?.bench?.intra?.intra?.[moment]?.[sign] ?? null;
  if (cls === "post") return item?.bins?.bench?.post?.post?.[moment]?.[sign] ?? null;

  return item?.bins?.bench?.pre?.[cls]?.[moment]?.[sign] ?? null;
}


function getTimeStartBins(item: AnyObj | null, cls: ArbTypeKey, sign: "pos" | "neg"): AnyObj | null {
  const c = getClassBlock(item, cls);
  const vNew = c?.time?.start_bins?.[sign] ?? c?.time?.startBins?.[sign];
  if (isObj(vNew)) return vNew;
  const pre = item?.time_bands?.pre_by_class_sign?.[cls]?.start?.[sign];
  if (isObj(pre)) return pre;
  if (cls === "intra") {
    const intra = item?.time_bands?.intra_by_class_sign?.intra?.start?.[sign];
    if (isObj(intra)) return intra;
  }
  if (cls === "post") {
    const post = item?.time_bands?.post_by_class_sign?.post?.start?.[sign];
    if (isObj(post)) return post;
  }
  return null;

}

function getTimeNormBins(item: AnyObj | null, cls: ArbTypeKey, sign: "pos" | "neg"): AnyObj | null {
  const c = getClassBlock(item, cls);
  const vNew = c?.time?.norm_bins?.[sign] ?? c?.time?.normBins?.[sign];
  if (isObj(vNew)) return vNew;
  const pre = item?.time_bands?.pre_by_class_sign?.[cls]?.norm?.[sign];
  if (isObj(pre)) return pre;
  if (cls === "intra") {
    const intra = item?.time_bands?.intra_by_class_sign?.intra?.norm?.[sign];
    if (isObj(intra)) return intra;
  }
    if (cls === "post") {
    const post = item?.time_bands?.post_by_class_sign?.post?.norm?.[sign];
    if (isObj(post)) return post;
  }

  return null;
}

function getExamplesLast3(item: AnyObj | null, cls: ArbTypeKey, sign: "pos" | "neg"): AnyObj[] {
  const c = getClassBlock(item, cls);
  const vNext = c?.last3?.[sign];
  if (Array.isArray(vNext)) return vNext;
  const ex = item?.examples_last3_normalized;
  const byCls = ex?.[cls];
  const bySign = byCls?.[sign];
  if (Array.isArray(bySign)) return bySign;
  if (Array.isArray(byCls)) return byCls;
  return [];
}

function binsToStacked(obj: AnyObj | null): StackedRow[] {
  if (!isObj(obj)) return [];
  const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => {
    const cell = obj[k] ?? {};
    return {
      label: k,
      hard: Number(cell.hard ?? 0),
      soft: Number(cell.soft ?? 0),
      none: Number(cell.none ?? 0),
      total: Number(cell.total ?? 0),
    };
  });
}

function benchBinsToStacked(obj: AnyObj | null): BenchStackedRow[] {
  if (!isObj(obj)) return [];
  const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => {
    const cell = obj[k] ?? {};
    return {
      label: k,
      hard: Number(cell.hard ?? 0),
      soft: Number(cell.soft ?? 0),
      total: Number(cell.total ?? (Number(cell.hard ?? 0) + Number(cell.soft ?? 0))),
    };
  });
}

type StartNormRow = {
  label: string;
  start_hard: number;
  start_soft: number;
  start_none: number;
  norm_hard: number;
  norm_soft: number;
};

function buildStartNormRows(startObj: AnyObj | null, normObj: AnyObj | null): StartNormRow[] {
  if (!isObj(startObj) && !isObj(normObj)) return [];
  const labels = new Set<string>();
  if (isObj(startObj)) Object.keys(startObj).forEach((k) => labels.add(k));
  if (isObj(normObj)) Object.keys(normObj).forEach((k) => labels.add(k));
  const keys = [...labels].sort((a, b) => a.localeCompare(b));

  const getStart = (k: string) => {
    const cell = (startObj?.[k] ?? {}) as AnyObj;
    const hard = Number(cell.hard ?? 0);
    const soft = Number(cell.soft ?? 0);
    const total = Number(cell.total ?? (hard + soft));
    const none = Number(cell.none ?? Math.max(0, total - hard - soft));
    return { hard, soft, none };
  };
  const getNorm = (k: string) => {
    const cell = (normObj?.[k] ?? {}) as AnyObj;
    const hard = Number(cell.hard ?? 0);
    const soft = Number(cell.soft ?? 0);
    return { hard, soft };
  };

  return keys.map((label) => {
    const s = getStart(label);
    const m = getNorm(label);
    return {
      label,
      start_hard: s.hard,
      start_soft: s.soft,
      start_none: s.none,
      norm_hard: m.hard,
      norm_soft: m.soft,
    };
  });
}

// =========================
// CHART HELPERS
// =========================

function StackedBarChart({
  data,
  keys,
  xKey = "label",
  marginTop = 10,
}: {
  data: AnyObj[];
  keys: Array<{ key: string; name: string; color: string; fillId?: string; stackId?: string }>;
  xKey?: string;
  marginTop?: number;
}) {
  if (!data?.length) {
    return <div className="h-full flex flex-col items-center justify-center text-xs font-mono text-zinc-700 uppercase tracking-widest gap-2"><Activity size={16} /><span>No Data</span></div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: marginTop, right: 10, left: -20, bottom: 0 }} barCategoryGap="25%">
        <NeonGradientDefs />
        <CartesianGrid stroke={THEME.grid} vertical={false} strokeDasharray="2 4" />
        <XAxis 
          dataKey={xKey} 
          tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }} 
          axisLine={false} 
          tickLine={false} 
          dy={8} 
        />
        <YAxis 
          tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }} 
          axisLine={false} 
          tickLine={false} 
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
        {keys.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.name}
            stackId={b.stackId ?? "a"}
            fill={b.fillId ? `url(#${b.fillId})` : b.color}
            stroke={b.color}
            strokeWidth={1}
            strokeOpacity={0.8}
            radius={i === keys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function AreaWithLines({
  data,
  xKey = "label",
  area,
  lines,
  referenceZero,
}: {
  data: AnyObj[];
  xKey?: string;
  referenceZero?: boolean;
  area: { key: string; name: string; stroke: string; fill: string };
  lines?: Array<{ key: string; name: string; stroke: string; dash?: string; width?: number; dot?: boolean }>;
}) {
  if (!data?.length) {
    return <div className="h-full flex flex-col items-center justify-center text-xs font-mono text-zinc-700 uppercase tracking-widest gap-2"><Activity size={16} /><span>No Data</span></div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <NeonGradientDefs />
        <CartesianGrid stroke={THEME.grid} vertical={false} strokeDasharray="2 4" />
        <XAxis 
          dataKey={xKey} 
          tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }} 
          axisLine={false} 
          tickLine={false} 
          dy={8} 
        />
        <YAxis 
          tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }} 
          axisLine={false} 
          tickLine={false} 
        />
        <Tooltip content={<CustomTooltip />} />
        {referenceZero ? <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" /> : null}
        <Area
          type="monotone"
          dataKey={area.key}
          name={area.name}
          stroke={area.stroke}
          fill={area.fill}
          strokeWidth={2}
          connectNulls
          activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
        />
        {lines?.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={l.stroke}
            strokeDasharray={l.dash}
            strokeWidth={l.width ?? 2}
            dot={l.dot ? { r: 2, fill: l.stroke, strokeWidth: 0 } : false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// =========================
// UI COMPONENTS (ClassSection, etc.)
// =========================

function kindPill(kind: any) {
  const k = String(kind ?? "").toLowerCase();
  if (k.includes("hard")) return { label: "HARD", variant: "emerald" as const };
  if (k.includes("soft")) return { label: "SOFT", variant: "violet" as const };
  return { label: k ? k.toUpperCase() : "OK", variant: "zinc" as const };
}

function Last3Success({ rows, tone }: { rows: AnyObj[]; tone: "pos" | "neg" }) {
  const items = (rows ?? []).slice(0, 3);
  if (!items.length) return <div className="h-24 flex items-center justify-center text-xs text-zinc-700 italic border border-dashed border-white/5 rounded-lg">No examples recorded</div>;

  return (
    <div className="grid gap-2">
      {items.map((r, idx) => {
        const dt = r.date ?? r.dt;
        const kind = r.kind ?? r.type ?? r.outcome;
        const pill = kindPill(kind);
        const startT = r.start_time ?? r.t_start ?? r.startTs ?? r.start_ts ?? r.start;
        const endT = r.end_time ?? r.t_end ?? r.endTs ?? r.end_ts ?? r.end;
        const startDev = r.start_dev ?? r.dev_start ?? r.dev;
        const peakDev = r.peak_dev ?? r.dev_peak ?? r.peak;
        const endDev = r.end_dev ?? r.dev_end ?? r.norm_dev ?? r.end_dev;
        const showTime = (x: any) => x && String(x).includes("T") ? fmtDt(String(x)) : String(x);

        return (
          <div key={idx} className="group relative rounded-lg border border-white/5 bg-zinc-900/40 px-3 py-2.5 transition-all hover:bg-zinc-800/50 hover:border-white/10">
            <div className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${tone === "pos" ? "bg-emerald-500" : "bg-rose-500"} opacity-50`}></div>
            <div className="pl-3">
               <div className="flex items-center justify-between gap-2 mb-2">
                 <div className="flex items-center gap-2">
                    <Chip variant={pill.variant} size="xs">{pill.label}</Chip>
                    <span className="text-[10px] font-mono text-zinc-500">{fmtDateShort(dt)}</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                    <span>{showTime(startT)}</span>
                    <ArrowLeft size={8} className="rotate-180 text-zinc-600" />
                    <span>{showTime(endT)}</span>
                 </div>
               </div>
               <div className="flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-600">σ</span>
                    <span className="text-zinc-300">{fmtSigned(startDev, 2)}</span>
                    <span className="text-zinc-700">→</span>
                    <span className="text-violet-300 font-bold">{fmtSigned(peakDev, 2)}</span>
                    <span className="text-zinc-700">→</span>
                    <span className="text-emerald-300 font-bold">{fmtSigned(endDev, 2)}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-zinc-500">
                     <span>STK <span className="text-zinc-300">{fmtSigned(r.stock_end, 1)}</span></span>
                     <span>BCH <span className="text-zinc-300">{fmtSigned(r.bench_end, 1)}</span></span>
                  </div>
               </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClassSection({
  title,
  subtitle,
  cls,
  item,
  benchMoment,
  setBenchMoment,
}: {
  title: string;
  subtitle?: string;
  cls: Exclude<ArbTypeKey, "global">;
  item: AnyObj | null;
  benchMoment: "start" | "peak" | "norm";
  setBenchMoment: (m: "start" | "peak" | "norm") => void;
}) {
  const sigmaPos = useMemo(() => binsToStacked(getPeakBins(item, cls, "pos")), [item, cls]);
  const sigmaNeg = useMemo(() => binsToStacked(getPeakBins(item, cls, "neg")), [item, cls]);
  const benchPos = useMemo(() => benchBinsToStacked(getBenchBins(item, cls, benchMoment, "pos")), [item, cls, benchMoment]);
  const benchNeg = useMemo(() => benchBinsToStacked(getBenchBins(item, cls, benchMoment, "neg")), [item, cls, benchMoment]);
  const tStartPos = useMemo(() => getTimeStartBins(item, cls, "pos"), [item, cls]);
  const tNormPos = useMemo(() => getTimeNormBins(item, cls, "pos"), [item, cls]);
  const tStartNeg = useMemo(() => getTimeStartBins(item, cls, "neg"), [item, cls]);
  const tNormNeg = useMemo(() => getTimeNormBins(item, cls, "neg"), [item, cls]);
  const timePos = useMemo(() => buildStartNormRows(tStartPos, tNormPos), [tStartPos, tNormPos]);
  const timeNeg = useMemo(() => buildStartNormRows(tStartNeg, tNormNeg), [tStartNeg, tNormNeg]);
  const last3Pos = useMemo(() => getExamplesLast3(item, cls, "pos"), [item, cls]);
  const last3Neg = useMemo(() => getExamplesLast3(item, cls, "neg"), [item, cls]);

  const hasAnything = sigmaPos.length || sigmaNeg.length || benchPos.length || benchNeg.length || timePos.length || timeNeg.length || last3Pos.length || last3Neg.length;
  if (!hasAnything) return null;

  return (
    <div className="space-y-6 pt-8">
      <SectionHeader
        icon={Layers}
        title={title}
        subtitle={subtitle}
        right={
          <div className="flex bg-zinc-900 rounded-lg border border-white/5 p-0.5">
            {(["start", "peak", "norm"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBenchMoment(m)}
                className={`px-3 py-1 rounded-[6px] text-[10px] font-bold uppercase transition-all ${
                  m === benchMoment ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Peak bins · POS</span>
          </div>
          <div className="h-[200px]">
            <StackedBarChart
              data={sigmaPos as any}
              keys={[
                { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
                { key: "none", name: "none", color: THEME.colors.none, fillId: "gradNone" },
              ]}
            />
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Peak bins · NEG</span>
          </div>
          <div className="h-[200px]">
            <StackedBarChart
              data={sigmaNeg as any}
              keys={[
                { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
                { key: "none", name: "none", color: THEME.colors.none, fillId: "gradNone" },
              ]}
            />
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={12} className="text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Benchmark ({benchMoment}) · POS</span>
          </div>
          <div className="h-[200px]">
            <StackedBarChart
              data={benchPos as any}
              keys={[
                { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
              ]}
            />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={12} className="text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Benchmark ({benchMoment}) · NEG</span>
          </div>
          <div className="h-[200px]">
            <StackedBarChart
              data={benchNeg as any}
              keys={[
                { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
              ]}
            />
          </div>
        </GlassCard>
      </div>

      {(timePos.length || timeNeg.length) ? (
        <div className="space-y-4">
           <div className="flex items-center gap-2 px-2 opacity-50">
             <Clock size={14} className="text-emerald-400" />
             <span className="text-xs font-mono font-medium text-emerald-400/80 uppercase">Temporal Distribution</span>
             <div className="h-px bg-emerald-500/20 flex-1"></div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 block">Time bins · POS</span>
              <div className="h-[220px]">
                <StackedBarChart
                  data={timePos as any}
                  keys={[
                    { key: "start_hard", name: "start hard", color: "#22c55e", stackId: "start" },
                    { key: "start_soft", name: "start soft", color: "#a78bfa", stackId: "start" },
                    { key: "start_none", name: "start none", color: "#fb7185", stackId: "start" },
                    { key: "norm_hard", name: "norm hard", color: THEME.colors.hard, fillId: "gradHard", stackId: "norm" },
                    { key: "norm_soft", name: "norm soft", color: THEME.colors.soft, fillId: "gradSoft", stackId: "norm" },
                  ]}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 block">Time bins · NEG</span>
              <div className="h-[220px]">
                <StackedBarChart
                  data={timeNeg as any}
                  keys={[
                    { key: "start_hard", name: "start hard", color: "#22c55e", stackId: "start" },
                    { key: "start_soft", name: "start soft", color: "#a78bfa", stackId: "start" },
                    { key: "start_none", name: "start none", color: "#fb7185", stackId: "start" },
                    { key: "norm_hard", name: "norm hard", color: THEME.colors.hard, fillId: "gradHard", stackId: "norm" },
                    { key: "norm_soft", name: "norm soft", color: THEME.colors.soft, fillId: "gradSoft", stackId: "norm" },
                  ]}
                />
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard className="p-4">
           <div className="flex justify-between items-center mb-4">
             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Last Successful · POS</span>
             <Chip variant="emerald" size="xs">TOP 3</Chip>
           </div>
           <Last3Success rows={last3Pos} tone="pos" />
        </GlassCard>
        <GlassCard className="p-4">
           <div className="flex justify-between items-center mb-4">
             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Last Successful · NEG</span>
             <Chip variant="rose" size="xs">TOP 3</Chip>
           </div>
           <Last3Success rows={last3Neg} tone="neg" />
        </GlassCard>
      </div>
    </div>
  );
}

// =========================
// MAIN PAGE COMPONENT
// =========================
export default function ArbitrageTickerStats({ ticker }: { ticker: string }) {
  const t = (ticker ?? "").trim().toUpperCase();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [item, setItem] = useState<AnyObj | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  const [benchMoment, setBenchMoment] = useState<"start" | "peak" | "norm">("start");
  const [rateThr, setRateThr] = useState(0.6);
  const [minTotal, setMinTotal] = useState(20);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!t) return;
      setLoading(true);
      setErr(null);
      try {
        const env = await getArbTicker(t);
        if (!env?.item) throw new Error("No item data found");
        if (!cancelled) {
          setItem(env.item);
          setUpdatedAt(env.updatedAt ?? undefined);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const meta = useMemo(() => getMeta(item), [item]);
  const headerMetrics = useMemo(() => getHeaderMetrics(item), [item]);

  const headerRates = useMemo(() => {
    const r = headerMetrics?.rates ?? ({} as any);
    const pick = (x: HeaderRates | null) => ({
      hard: n(x?.hard?.rate),
      soft: n(x?.soft?.rate),
      any: n(x?.any?.rate),
      total: n(x?.any?.total),
      hard_total: n(x?.hard?.total),
      soft_total: n(x?.soft?.total),
    });
    return {
      global: pick(r?.global ?? null),
      blue: pick(r?.blue ?? null),
      ark: pick(r?.ark ?? null),
      print: pick(r?.print ?? null),
      open: pick(r?.open ?? null),
      intra: pick(r?.intra ?? null),
      post: pick(r?.post ?? null),
    };

  }, [headerMetrics]);

  const globalPos = useMemo(() => binsToStacked(getPeakBins(item, "global", "pos")), [item]);
  const globalNeg = useMemo(() => binsToStacked(getPeakBins(item, "global", "neg")), [item]);

  const last10Print = useMemo(() => {
    const r = item?.recent ?? {};
    const raw = Array.isArray(r?.last10_print) ? r.last10_print : Array.isArray(r?.print_last10) ? r.print_last10 : [];
    return raw.map((x: AnyObj, i: number) => {
      const dt = x.dt ?? x.date ?? x.day ?? null;
      const label = dt ? new Date(dt).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" }) : String(i + 1);
      const printDev = n(x.dev);
      const peakDev = n(x.peak) ?? n(x.peak_dev) ?? n(x.pre_peak_signed) ?? (n(x.pre_peak_abs) != null && n(x.first_sign) != null ? (n(x.pre_peak_abs)! * (n(x.first_sign)! >= 0 ? 1 : -1)) : null);
      return { label, print: printDev, peak: peakDev };
    });
  }, [item]);

  const last5Pos = useMemo(() => {
    const r = item?.recent ?? {};
    const block = r?.print_last5?.pos ?? r?.last5_print?.pos ?? null;
    const vals = block?.values;
    const median = n(block?.median);
    const mean = n(block?.mean);
    return Array.isArray(vals) ? vals.map((v: any, i: number) => ({
      label: `#${i + 1}`,
      v: n(v) ?? 0,
      ...(median != null ? { median } : {}),
      ...(mean != null ? { mean } : {}),
    })) : [];
  }, [item]);

  const last5Neg = useMemo(() => {
    const r = item?.recent ?? {};
    const block = r?.print_last5?.neg ?? r?.last5_print?.neg ?? null;
    const vals = block?.values;
    const median = n(block?.median);
    const mean = n(block?.mean);
    return Array.isArray(vals) ? vals.map((v: any, i: number) => ({
      label: `#${i + 1}`,
      v: n(v) ?? 0,
      ...(median != null ? { median } : {}),
      ...(mean != null ? { mean } : {}),
    })) : [];
  }, [item]);

  const openOverlay = useMemo(() => {
    const r = item?.recent ?? {};
    const raw = Array.isArray(r?.open_0931_0940) ? r.open_0931_0940 : Array.isArray(r?.last10_open_dev_series) ? r.last10_open_dev_series : [];
    const series = raw.slice(0, 10);
    const keys = series.map((s: AnyObj, idx: number) => String(s.date ?? s.id ?? `D${idx + 1}`));
    const map = new Map<string, AnyObj>();
    const toLabel = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    };
    series.forEach((s: AnyObj, idx: number) => {
      const k = keys[idx];
      const pts = Array.isArray(s.points) ? s.points : [];
      pts.forEach((p: any) => {
        const iso = Array.isArray(p) ? p[0] : p?.t ?? p?.time ?? p?.ts;
        const val = Array.isArray(p) ? p[1] : p?.v ?? p?.value;
        if (!iso) return;
        const label = toLabel(String(iso));
        if (!map.has(label)) map.set(label, { label });
        map.get(label)![k] = n(val) ?? 0;
      });
    });
    const data = [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return { data, keys };
  }, [item]);

  const best = useMemo(() => item?.best_params ?? null, [item]);
  const filteredBest = useMemo(() => {
    if (!best) return null;
    const walk = (x: any): RangeItem[] | null => {
      if (!Array.isArray(x)) return null;
      return x
        .map((it) => ({ from: String(it.from ?? ""), to: String(it.to ?? ""), rate: Number(it.rate ?? 0), total: Number(it.total ?? 0) }))
        .filter((it) => it.rate >= rateThr && it.total >= minTotal);
    };
    return {
      peak_sigma_pos: walk(best?.peak_sigma_any?.pos ?? null),
      peak_sigma_neg: walk(best?.peak_sigma_any?.neg ?? null),
      bench_pos: walk(best?.bench_any?.[benchMoment]?.pos ?? null),
      bench_neg: walk(best?.bench_any?.[benchMoment]?.neg ?? null),
    };
  }, [best, rateThr, minTotal, benchMoment]);

  const canShow = !!item && !err;
  if (!t) return null;

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-200 font-sans pb-24 selection:bg-emerald-500/30 selection:text-white">
      {/* Immersive Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-900/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[#030303]/70 border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link href="/stats/arbitrage" className="flex items-center gap-2.5 text-xs font-medium text-zinc-400 hover:text-white transition-all group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 group-hover:bg-white/10 border border-white/5 transition-colors">
               <ArrowLeft size={16} />
            </div>
            <span>DASHBOARD</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-zinc-600">
               <Clock size={12} />
               {updatedAt && <span>SYNC: {fmtDt(updatedAt)}</span>}
            </div>
            <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] ${loading ? "bg-amber-500 text-amber-500 animate-pulse" : "bg-emerald-500 text-emerald-500"}`} />
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-6 py-12 space-y-16">
        {/* HEADER */}
        <div className="space-y-8">
           <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
              <div className="space-y-4">
                 <div className="flex items-center gap-4">
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 drop-shadow-sm">
                      {t}
                    </h1>
                 </div>
                 <div className="flex flex-wrap items-center gap-2">
                    <Chip variant="emerald">BENCH: {String(meta.bench ?? "—")}</Chip>
                    <Chip variant="cyan">CORR: {fmt(meta.corr, 2)}</Chip>
                    <Chip variant="violet">BETA: {fmt(meta.beta, 2)}</Chip>
                    <Chip variant="amber">SIGMA: {fmt(meta.sigma, 2)}</Chip>
                 </div>
              </div>

              {/* Stat Cards */}
              {canShow && (
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 w-full xl:w-auto">
                   {(
                    [
                      ["GLOBAL", "global", Globe, "bg-cyan-500", "text-cyan-400"],
                      ["BLUE", "blue", Layers, "bg-blue-500", "text-blue-400"],
                      ["ARK", "ark", Layers, "bg-emerald-500", "text-emerald-400"],
                      ["PRINT", "print", Layers, "bg-emerald-500", "text-emerald-400"],
                      ["OPEN", "open", Layers, "bg-emerald-500", "text-emerald-400"],
                      ["INTRA", "intra", Layers, "bg-emerald-500", "text-emerald-400"],
                      ["POST", "post", Layers, "bg-amber-500", "text-amber-400"],
                    ] as const

                  ).map(([label, key, Icon, barColor, txtColor]) => {
                     const r = (headerRates as any)[key];
                     const total = r?.total ?? 0;
                     const hardPct = (n(r?.hard) ?? 0) * 100;
                     const softPct = (n(r?.soft) ?? 0) * 100;
                     return (
                       <GlassCard key={key} className="p-3 flex flex-col justify-between h-[90px]">
                          <div className="flex justify-between items-start">
                             <span className={`text-[9px] font-bold uppercase tracking-widest ${label === "GLOBAL" ? "text-cyan-200" : "text-zinc-500"}`}>{label}</span>
                             <span className="text-[9px] font-mono text-zinc-600">n:{total}</span>
                          </div>
                          <div className="space-y-1.5">
                             <div className="flex items-end justify-between">
                                <span className={`text-lg font-mono font-medium leading-none ${txtColor}`}>{Math.round(hardPct)}%</span>
                                <span className="text-[10px] font-mono text-violet-400 leading-none">{Math.round(softPct)}%</span>
                             </div>
                             <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${barColor} shadow-[0_0_10px_currentColor]`} style={{ width: `${hardPct}%` }} />
                             </div>
                          </div>
                       </GlassCard>
                     );
                  })}
                </div>
              )}
           </div>

           {err && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
               <Activity size={16} /> Error loading data: {err}
            </div>
           )}
        </div>

        {canShow && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
             {/* GLOBAL Section */}
             <section>
                <SectionHeader icon={Globe} title="Global Normalization" subtitle="Distribution of events across all classes" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                   <GlassCard className="p-6 h-[320px]" glow>
                      <div className="flex justify-between items-center mb-6">
                         <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Positive Peaks</span>
                         <Maximize2 size={12} className="text-zinc-600" />
                      </div>
                      <StackedBarChart
                        data={globalPos as any}
                        keys={[
                          { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                          { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
                          { key: "none", name: "none", color: THEME.colors.none, fillId: "gradNone" },
                        ]}
                      />
                   </GlassCard>
                   <GlassCard className="p-6 h-[320px]">
                      <div className="flex justify-between items-center mb-6">
                         <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Negative Peaks</span>
                         <Maximize2 size={12} className="text-zinc-600" />
                      </div>
                      <StackedBarChart
                        data={globalNeg as any}
                        keys={[
                          { key: "hard", name: "hard", color: THEME.colors.hard, fillId: "gradHard" },
                          { key: "soft", name: "soft", color: THEME.colors.soft, fillId: "gradSoft" },
                          { key: "none", name: "none", color: THEME.colors.none, fillId: "gradNone" },
                        ]}
                      />
                   </GlassCard>
                </div>
             </section>

             {/* Classes Grid */}
             <div className="grid grid-cols-1 gap-12">
            <ClassSection title="BLUE" subtitle="Overnight / BLOOTION window" cls="blue" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />
            <ClassSection title="ARK" subtitle="Deep dive into ARK strategy performance" cls="ark" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />
            <ClassSection title="PRINT" subtitle="Print signatures analysis" cls="print" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />
            <ClassSection title="OPEN" subtitle="Opening range breakouts" cls="open" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />
            <ClassSection title="INTRA" subtitle="Intraday mean reversion" cls="intra" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />
            <ClassSection title="POST" subtitle="After-hours normalization window" cls="post" item={item} benchMoment={benchMoment} setBenchMoment={setBenchMoment} />

                        </div>

             {/* Advanced Metrics */}
             <section className="space-y-8 border-t border-white/5 pt-12">
                <SectionHeader icon={TrendingUp} title="Advanced Metrics" subtitle="Cross-sectional analysis" />
                
                {/* 1. Large Top Chart */}
                <GlassCard className="p-6 h-[350px]">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400">
                        <TrendingUp size={14} />
                      </div>
                      <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Last 10: PRINT dev + peak</span>
                  </div>
                  <AreaWithLines
                    data={last10Print as any}
                    referenceZero
                    area={{ key: "print", name: "Print dev", stroke: THEME.colors.any, fill: "url(#gradAny)" }}
                    lines={[{ key: "peak", name: "Peak dev", stroke: THEME.colors.soft, dash: "4 4", dot: true, width: 2 }]}
                  />
                </GlassCard>

                {/* 2. Side-by-Side Charts (Print Last 5) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* POS */}
                   <GlassCard className="p-6 h-[300px]">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">PRINT last 5 · POS</span>
                        <div className="flex flex-col items-end gap-1">
                          {last5Pos?.[0]?.median != null && (
                            <Chip variant="zinc" size="xs">Median {fmtSigned(last5Pos[0].median, 2)}</Chip>
                          )}
                          {last5Pos?.[0]?.mean != null && (
                            <Chip variant="amber" size="xs">Mean {fmtSigned(last5Pos[0].mean, 2)}</Chip>
                          )}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={last5Pos as any} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke={THEME.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="v" stroke={THEME.colors.any} strokeWidth={2} dot={{r:2}} />
                          
                          {/* Lines for Median & Mean */}
                          {last5Pos?.[0]?.median != null && (
                            <Line type="monotone" dataKey="median" stroke="white" strokeDasharray="3 3" strokeOpacity={0.4} strokeWidth={1} dot={false} />
                          )}
                          {last5Pos?.[0]?.mean != null && (
                            <Line type="monotone" dataKey="mean" stroke={THEME.colors.amber} strokeDasharray="5 5" strokeOpacity={0.6} strokeWidth={1} dot={false} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                   </GlassCard>

                   {/* NEG */}
                   <GlassCard className="p-6 h-[300px]">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">PRINT last 5 · NEG</span>
                         <div className="flex flex-col items-end gap-1">
                          {last5Neg?.[0]?.median != null && (
                            <Chip variant="zinc" size="xs">Median {fmtSigned(last5Neg[0].median, 2)}</Chip>
                          )}
                          {last5Neg?.[0]?.mean != null && (
                            <Chip variant="amber" size="xs">Mean {fmtSigned(last5Neg[0].mean, 2)}</Chip>
                          )}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={last5Neg as any} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke={THEME.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="v" stroke={THEME.colors.none} strokeWidth={2} dot={{r:2}} />

                          {/* Lines for Median & Mean */}
                          {last5Neg?.[0]?.median != null && (
                             <Line type="monotone" dataKey="median" stroke="white" strokeDasharray="3 3" strokeOpacity={0.4} strokeWidth={1} dot={false} />
                          )}
                          {last5Neg?.[0]?.mean != null && (
                             <Line type="monotone" dataKey="mean" stroke={THEME.colors.amber} strokeDasharray="5 5" strokeOpacity={0.6} strokeWidth={1} dot={false} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                   </GlassCard>
                </div>

                {/* 3. Full Width Open Overlay */}
                <GlassCard className="p-6 h-[350px]">
                  <div className="flex justify-between mb-4">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">OPEN Overlay (09:31-09:40)</span>
                    <span className="text-[9px] font-mono text-zinc-600">Series: {openOverlay.keys.length}</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={openOverlay.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={THEME.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      {openOverlay.keys.map((k, i) => (
                          <Line key={k} type="monotone" dataKey={k} stroke={`hsl(${i * 40}, 70%, 60%)`} strokeWidth={1.5} dot={false} strokeOpacity={0.7} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </GlassCard>
             </section>

             {/* Efficiency Windows */}
             <section className="space-y-8 pt-12 border-t border-white/5">
                <SectionHeader icon={SlidersHorizontal} title="Efficiency Windows" subtitle="Statistical edge discovery" />
                
                <GlassCard className="p-8 bg-gradient-to-br from-zinc-900/80 to-black/80">
                   <div className="flex flex-col md:flex-row gap-12 items-center">
                      <div className="flex-1 w-full space-y-6">
                         <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold text-zinc-400 uppercase tracking-widest">
                               <span>Win Rate Threshold</span>
                               <span className="text-emerald-400 font-mono">{fmtPct01(rateThr, 0)}</span>
                            </div>
                            <input
                              type="range" min={0.3} max={0.95} step={0.01} value={rateThr}
                              onChange={(e) => setRateThr(Number(e.target.value))}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
                            />
                         </div>
                         <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold text-zinc-400 uppercase tracking-widest">
                               <span>Min Sample Size</span>
                               <span className="text-emerald-400 font-mono">{minTotal}</span>
                            </div>
                            <input
                              type="range" min={5} max={200} step={1} value={minTotal}
                              onChange={(e) => setMinTotal(Number(e.target.value))}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
                            />
                         </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-4 p-4 rounded-xl border border-amber-500/10 bg-amber-500/5 max-w-sm">
                         <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Zap size={20} /></div>
                         <p className="text-xs text-amber-200/60 leading-relaxed">
                           Adjust parameters to filter for high-probability setups. Higher thresholds yield fewer but stronger signals.
                         </p>
                      </div>
                   </div>
                </GlassCard>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {filteredBest?.peak_sigma_pos?.length ? <BestWindowsCard title="Peak Sigma · POS" items={filteredBest?.peak_sigma_pos ?? null} /> : null}
                  {filteredBest?.peak_sigma_neg?.length ? <BestWindowsCard title="Peak Sigma · NEG" items={filteredBest?.peak_sigma_neg ?? null} /> : null}
                  {filteredBest?.bench_pos?.length ? <BestWindowsCard title={`Bench (${benchMoment}) · POS`} items={filteredBest?.bench_pos ?? null} /> : null}
                  {filteredBest?.bench_neg?.length ? <BestWindowsCard title={`Bench (${benchMoment}) · NEG`} items={filteredBest?.bench_neg ?? null} /> : null}
                </div>
             </section>

             <div className="pt-20 pb-10 flex justify-center opacity-30 hover:opacity-100 transition-opacity">
                <details className="text-center">
                   <summary className="text-[10px] font-mono uppercase tracking-widest cursor-pointer text-zinc-600 hover:text-white">View Raw JSON Payload</summary>
                   <pre className="mt-8 text-[10px] text-left text-zinc-500 font-mono bg-black p-6 rounded-2xl border border-white/5 overflow-auto max-w-3xl max-h-[400px]">
                      {JSON.stringify(item, null, 2)}
                   </pre>
                </details>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

function BestWindowsCard({ title, items }: { title: string; items: Array<RangeItem> | null }) {
  if (!items?.length) return null;
  return (
    <GlassCard className="p-4 flex flex-col gap-3 h-[240px]">
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <Zap size={14} className="text-amber-400" fill="currentColor" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-1.5 custom-scrollbar">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.02] hover:bg-white/[0.05] transition-colors">
            <div className="text-[10px] font-mono text-zinc-400">
              {it.from} <span className="text-zinc-600">→</span> {it.to}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-emerald-400">{fmtPct01(it.rate, 0)}</span>
              <span className="text-[9px] font-mono text-zinc-600">n:{it.total}</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export { ArbitrageTickerStats };