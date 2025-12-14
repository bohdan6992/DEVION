"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  ArrowLeft,
  Activity,
  Layers,
  Clock,
  Zap,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import Link from "next/link";
import { getChronoTicker } from "@/lib/trapClient";

// =========================
// THEME & UTILS
// =========================

const THEME = {
  bg: "#030303",
  cardBg: "rgba(10, 10, 10, 0.4)",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  grid: "rgba(255, 255, 255, 0.04)",
  textMain: "#ececec",
  textMuted: "#525252",
  colors: {
    up: "#10b981",
    down: "#ef4444",
    neutral: "#8b5cf6",
  },
};

type AnyObj = Record<string, any>;

function n(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function fmt(x: any, d = 2) {
  const v = n(x);
  return v == null ? "—" : v.toFixed(d);
}
function fmtSigned(x: any, d = 2) {
  const v = n(x);
  if (v == null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(d)}`;
}
function fmtPct(x: any, d = 0) {
  const v = n(x);
  if (v == null) return "—";
  return `${(v * 100).toFixed(d)}%`;
}
function fmtDateShort(x: any) {
  const s = String(x ?? "");
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()))
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return s;
}
function fmtTime(dt: any) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return String(dt);
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// =========================
// UI ATOMS
// =========================

const NeonGradientDefs = () => (
  <defs>
    <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.up} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.up} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.down} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.down} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={THEME.colors.neutral} stopOpacity={0.6} />
      <stop offset="100%" stopColor={THEME.colors.neutral} stopOpacity={0} />
    </linearGradient>
  </defs>
);

const GlassCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`
      relative group overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-500
      shadow-xl bg-[#0a0a0a]/60 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#0a0a0a]/80
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
  size = "sm",
}: {
  children: React.ReactNode;
  variant?: "zinc" | "emerald" | "violet" | "cyan" | "amber" | "rose";
  size?: "xs" | "sm";
}) => {
  const styles = {
    zinc: "bg-zinc-800/40 text-zinc-400 border-zinc-700/50",
    emerald:
      "bg-emerald-950/30 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-4px_rgba(16,185,129,0.3)]",
    violet:
      "bg-violet-950/30 text-violet-400 border-violet-500/20 shadow-[0_0_10px_-4px_rgba(139,92,246,0.3)]",
    cyan:
      "bg-cyan-950/30 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_-4px_rgba(6,182,212,0.3)]",
    amber: "bg-amber-950/30 text-amber-400 border-amber-500/20",
    rose: "bg-rose-950/30 text-rose-400 border-rose-500/20",
  } as const;
  const sizes = {
    xs: "px-1.5 py-0.5 text-[9px]",
    sm: "px-2.5 py-1 text-[10px]",
  } as const;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border font-mono font-bold uppercase tracking-wider ${styles[variant]} ${sizes[size]}`}
    >
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
              <span
                className="w-1 h-3 rounded-full"
                style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}` }}
              />
              {entry.name}
            </span>
            <span className="font-mono text-white tabular-nums tracking-wide">{Number(entry.value).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =========================
// 1D BINS
// =========================

type Bin1DRow = {
  label: string;
  n: number;
  grow_rate: number;
  mean_delta: number;
  median_delta: number;
  mean_up: number | null;
  mean_down: number | null;

  // ✅ NEW: show how often STACK rose/fell in this bin
  // We derive it from grow_rate * n (grow=up) and (1-grow_rate)*n (down)
  stack_up_n: number;
  stack_down_n: number;
};

function buildBin1DRows(bins: any[] | undefined): Bin1DRow[] {
  if (!Array.isArray(bins) || !bins.length) return [];
  return bins.map((b) => {
    const from = n(b.from) ?? 0;
    const to = n(b.to) ?? 0;
    const label = `${from.toFixed(2)} → ${to.toFixed(2)}`;

    const nn = n(b.n) ?? 0;
    const gr = clamp01(n(b.grow_rate) ?? 0);

    const upN = Math.round(gr * nn);
    const downN = Math.max(0, nn - upN);

    return {
      label,
      n: nn,
      grow_rate: gr,
      mean_delta: n(b.mean_delta) ?? 0,
      median_delta: n(b.median_delta) ?? 0,
      mean_up: n(b.mean_up),
      mean_down: n(b.mean_down),

      stack_up_n: upN,
      stack_down_n: downN,
    };
  });
}

function OneDBinsChart({ data, title }: { data: Bin1DRow[]; title: string }) {
  if (!data?.length) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 size={12} className="text-zinc-500" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</span>
        </div>
        <div className="h-[180px] flex flex-col items-center justify-center text-xs font-mono text-zinc-700 uppercase tracking-widest gap-2">
          <Activity size={16} />
          <span>No Data</span>
        </div>
      </GlassCard>
    );
  }

  const totalN = data.reduce((s, r) => s + r.n, 0) || 1;
  const avgDelta = data.reduce((s, r) => s + r.mean_delta * r.n, 0) / totalN;
  const avgWin = data.reduce((s, r) => s + r.grow_rate * r.n, 0) / totalN;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <BarChart2 size={12} className="text-zinc-500" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</span>
      </div>

      {/* ✅ UPDATED: stacked UP/DOWN counts per bin */}
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <NeonGradientDefs />
            <CartesianGrid stroke={THEME.grid} vertical={false} strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tick={{ fill: THEME.textMuted, fontSize: 9, fontFamily: "monospace" }}
              angle={-30}
              textAnchor="end"
              axisLine={false}
              tickLine={false}
              height={45}
            />
            <YAxis tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                // payload order follows Bars: up then down
                const up = payload.find((p: any) => p.dataKey === "stack_up_n")?.value ?? 0;
                const dn = payload.find((p: any) => p.dataKey === "stack_down_n")?.value ?? 0;
                const row = payload?.[0]?.payload as Bin1DRow;
                return (
                  <div className="bg-[#050505]/90 border border-white/10 p-3 rounded-lg backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] min-w-[220px]">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
                      <span className="text-[10px] font-mono text-zinc-500">N {row?.n ?? 0}</span>
                    </div>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <ArrowUpRight size={14} className="text-emerald-400" /> STACK up
                        </span>
                        <span className="text-white tabular-nums">{up}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <ArrowDownRight size={14} className="text-rose-400" /> STACK down
                        </span>
                        <span className="text-white tabular-nums">{dn}</span>
                      </div>
                      <div className="pt-2 mt-2 border-t border-white/5 text-[11px] text-zinc-400 space-y-1">
                        <div>
                          mean Δ: <span className="text-zinc-200">{fmtSigned(row?.mean_delta, 3)}</span>
                        </div>
                        <div>
                          win: <span className="text-emerald-400">{fmtPct(row?.grow_rate, 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }}
              cursor={{ fill: "rgba(255,255,255,0.02)" }}
            />

            <Bar
              dataKey="stack_up_n"
              name="stack up"
              stackId="stack"
              fill="url(#gradUp)"
              stroke={THEME.colors.up}
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="stack_down_n"
              name="stack down"
              stackId="stack"
              fill="url(#gradDown)"
              stroke={THEME.colors.down}
              strokeWidth={1}
              radius={[0, 0, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-500 font-mono">
        <span>
          avg Δ: <span className="text-zinc-200">{fmt(avgDelta, 3)}</span>
        </span>
        <span>
          win rate (avg): <span className="text-emerald-400">{fmtPct(avgWin, 0)}</span>
        </span>
      </div>
    </GlassCard>
  );
}

// =========================
// 2D BINS (✅ MULTI-KEY SUPPORT)
// =========================

type Bin2DRow = {
  x: number;
  y: number;
  n: number;
  grow_rate: number;
  label: string;
};

function buildBin2DRowsGeneric(
  bins: any[] | undefined,
  cfg: {
    xFrom: string;
    xTo: string;
    yFrom: string;
    yTo: string;
    xName: string;
    yName: string;
  }
): Bin2DRow[] {
  if (!Array.isArray(bins) || !bins.length) return [];
  return bins.map((b) => {
    const xFrom = n(b[cfg.xFrom]) ?? 0;
    const xTo = n(b[cfg.xTo]) ?? 0;
    const yFrom = n(b[cfg.yFrom]) ?? 0;
    const yTo = n(b[cfg.yTo]) ?? 0;

    const nVal = n(b.n) ?? 0;
    const gr = clamp01(n(b.grow_rate) ?? 0);

    const x = (xFrom + xTo) / 2;
    const y = (yFrom + yTo) / 2;

    const label = `${cfg.xName}[${xFrom.toFixed(2)}..${xTo.toFixed(2)}] · ${cfg.yName}[${yFrom.toFixed(
      2
    )}..${yTo.toFixed(2)}]`;

    return { x, y, n: nVal, grow_rate: gr, label };
  });
}

function growRateColor(gr: number) {
  if (!Number.isFinite(gr)) return THEME.colors.neutral;
  if (gr >= 0.6) return THEME.colors.up;
  if (gr <= 0.4) return THEME.colors.down;
  return THEME.colors.neutral;
}

function TwoDBinsScatter({
  data,
  title,
  xLabel,
  yLabel,
}: {
  data: Bin2DRow[];
  title: string;
  xLabel: string;
  yLabel: string;
}) {
  if (!data?.length) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={12} className="text-zinc-500" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</span>
        </div>
        <div className="h-[240px] flex flex-col items-center justify-center text-xs font-mono text-zinc-700 uppercase tracking-widest gap-2">
          <Activity size={16} />
          <span>No 2D bins</span>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Layers size={12} className="text-zinc-500" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</span>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
            <CartesianGrid stroke={THEME.grid} strokeDasharray="2 4" />
            <XAxis
              dataKey="x"
              name={xLabel}
              tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="y"
              name={yLabel}
              tick={{ fill: THEME.textMuted, fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <ZAxis dataKey="n" range={[40, 180]} />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Bin2DRow;
                return (
                  <div className="bg-[#050505]/90 border border-white/10 p-3 rounded-lg text-xs font-mono text-zinc-300">
                    <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">2D bin</div>
                    <div className="text-zinc-400">{p.label}</div>
                    <div className="mt-2">Count: {p.n}</div>
                    <div>
                      Win: <span className="text-zinc-200">{fmtPct(p.grow_rate, 0)}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              data={data}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const fill = growRateColor(payload.grow_rate);
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill={fill}
                    fillOpacity={0.65}
                    stroke={fill}
                    strokeOpacity={0.9}
                    strokeWidth={1}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-[10px] font-mono text-zinc-500 flex items-center gap-4">
        <span>
          {xLabel} vs {yLabel}
        </span>
        <span className="text-zinc-700">|</span>
        <span>size = count</span>
        <span className="text-zinc-700">|</span>
        <span>
          color = winrate (<span className="text-emerald-400">green</span> / <span className="text-violet-400">mid</span> /{" "}
          <span className="text-rose-400">red</span>)
        </span>
      </div>
    </GlassCard>
  );
}

// =========================
// EXAMPLES LIST
// =========================

function ExamplesList({ rows, tone }: { rows: AnyObj[]; tone: "up" | "down" }) {
  const items = (rows ?? []).slice(0, 4);
  if (!items.length) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-zinc-700 italic border border-dashed border-white/5 rounded-lg">
        No examples recorded
      </div>
    );
  }

  const color = tone === "up" ? "bg-emerald-500" : "bg-rose-500";

  return (
    <div className="grid gap-2">
      {items.map((r, idx) => (
        <div
          key={idx}
          className="group relative rounded-lg border border-white/5 bg-zinc-900/40 px-3 py-2.5 transition-all hover:bg-zinc-800/50 hover:border-white/10"
        >
          <div className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${color} opacity-60`} />
          <div className="pl-3 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Chip variant={tone === "up" ? "emerald" : "rose"} size="xs">
                  {tone.toUpperCase()}
                </Chip>
                <span className="text-zinc-500">{fmtDateShort(r.date)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span>{fmtTime(r.start_dt ?? r.start_time)}</span>
                <ArrowLeft size={8} className="rotate-180 text-zinc-600" />
                <span>{fmtTime(r.end_dt ?? r.end_time)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-zinc-600">STACK</span>
                <span className="text-zinc-300">
                  {fmtSigned(r.stack_start, 2)} →{" "}
                  <span className="font-bold text-emerald-300">{fmtSigned(r.stack_end, 2)}</span>
                </span>
                <span className="text-zinc-500">Δ {fmtSigned(r.delta_stack, 2)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-zinc-600">BENCH</span>
                <span className="text-zinc-300">
                  {fmtSigned(r.bench_start, 2)} →{" "}
                  <span className="font-bold text-violet-300">{fmtSigned(r.bench_end, 2)}</span>
                </span>
                <span className="text-zinc-500">Δ {fmtSigned(r.delta_bench, 2)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-zinc-600">DEV</span>
                <span className="text-zinc-300">
                  {fmtSigned(r.dev_start, 3)} →{" "}
                  <span className="font-bold text-emerald-300">{fmtSigned(r.dev_end, 3)}</span>
                </span>
                <span className="text-zinc-500">Δ {fmtSigned(r.delta_dev, 3)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =========================
// WINDOW SECTION
// =========================

type WindowData = {
  stats?: AnyObj;
  bins_1d?: {
    stack_start?: any[];
    bench_start?: any[];
    dev_start?: any[];
  };
  bins_2d?: Record<string, any[] | undefined>;
  examples?: {
    up?: AnyObj[];
    down?: AnyObj[];
  };
};

function prettyWindowName(key: string): string {
  const parts = key.split("_");
  if (parts.length === 1) return key;
  return `${parts[0]} · ${parts.slice(1).join(" ")}`;
}

function windowSubtitle(key: string): string {
  if (key.includes("EARLY") && key.includes("ARK")) return "Early premarket arbitrage window";
  if (key.includes("MIDDLE") && key.includes("ARK")) return "Mid premarket arbitrage window";
  if (key.includes("LATE") && key.includes("ARK")) return "Late premarket arbitrage window";
  if (key.includes("BLUE")) return "Night/BLOOTION explorations";
  if (key === "OPEN") return "09:30–10:00 opening move";
  return "Session slice statistics";
}

function WindowSection({ name, data }: { name: string; data: WindowData }) {
  const stats = data.stats ?? {};
  const bins1d = data.bins_1d ?? {};
  const bins2d = data.bins_2d ?? {};
  const examples = data.examples ?? {};

  const stackBins = useMemo(() => buildBin1DRows(bins1d.stack_start), [bins1d.stack_start]);
  const benchBins = useMemo(() => buildBin1DRows(bins1d.bench_start), [bins1d.bench_start]);
  const devBins = useMemo(() => buildBin1DRows(bins1d.dev_start), [bins1d.dev_start]);

  // ✅ MULTI-2D: render all known keys if present
  const TWO_D_CONFIG: Record<
    string,
    {
      xFrom: string;
      xTo: string;
      yFrom: string;
      yTo: string;
      xName: string;
      yName: string;
      title: string;
    }
  > = {
    dev_vs_bench: {
      xFrom: "bench_from",
      xTo: "bench_to",
      yFrom: "dev_from",
      yTo: "dev_to",
      xName: "Bench",
      yName: "Dev",
      title: "DEV vs BENCH (2D)",
    },

    // If backend adds these later, UI is ready:
    stack_vs_bench: {
      xFrom: "bench_from",
      xTo: "bench_to",
      yFrom: "stack_from",
      yTo: "stack_to",
      xName: "Bench",
      yName: "Stack",
      title: "STACK vs BENCH (2D)",
    },
    dev_vs_stack: {
      xFrom: "stack_from",
      xTo: "stack_to",
      yFrom: "dev_from",
      yTo: "dev_to",
      xName: "Stack",
      yName: "Dev",
      title: "DEV vs STACK (2D)",
    },
    bench_vs_stack: {
      xFrom: "stack_from",
      xTo: "stack_to",
      yFrom: "bench_from",
      yTo: "bench_to",
      xName: "Stack",
      yName: "Bench",
      title: "BENCH vs STACK (2D)",
    },
  };

  const twoDCharts = useMemo(() => {
    const out: Array<{ key: string; rows: Bin2DRow[]; title: string; xLabel: string; yLabel: string }> = [];
    for (const [key, arr] of Object.entries(bins2d)) {
      const cfg = TWO_D_CONFIG[key];
      if (!cfg) continue;
      const rows = buildBin2DRowsGeneric(arr as any[], cfg);
      if (rows.length) out.push({ key, rows, title: cfg.title, xLabel: cfg.xName, yLabel: cfg.yName });
    }
    return out;
  }, [bins2d]);

  const hasCharts = stackBins.length || benchBins.length || devBins.length || twoDCharts.length;
  const hasExamples = (examples.up && examples.up.length) || (examples.down && examples.down.length);

  if (!stats && !hasCharts && !hasExamples) return null;

  return (
    <section className="space-y-6 pt-12 border-t border-white/5">
      <SectionHeader
        icon={Layers}
        title={prettyWindowName(name)}
        subtitle={windowSubtitle(name)}
        right={
          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-zinc-500">
            <span>
              N: <span className="text-zinc-200">{stats.n ?? "—"}</span>
            </span>
            <span>
              ↑: <span className="text-emerald-400">{stats.n_up ?? 0} ({fmtPct(stats.up_ratio, 0)})</span>
            </span>
            <span>
              ↓: <span className="text-rose-400">{stats.n_down ?? 0} ({fmtPct(stats.down_ratio, 0)})</span>
            </span>
            <span>
              Δ mean: <span className="text-zinc-200">{fmtSigned(stats.mean_delta, 3)}</span>
            </span>
            <span>
              Δ median: <span className="text-zinc-200">{fmtSigned(stats.median_delta, 3)}</span>
            </span>
          </div>
        }
      />

      {/* Top stats mini-cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <GlassCard className="p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">UP mean</div>
          <div className="text-sm font-mono text-emerald-400">{fmtSigned(stats.mean_up, 3)}</div>
          <div className="text-[9px] text-zinc-500">median {fmtSigned(stats.median_up, 3)}</div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">DOWN mean</div>
          <div className="text-sm font-mono text-rose-400">{fmtSigned(stats.mean_down, 3)}</div>
          <div className="text-[9px] text-zinc-500">median {fmtSigned(stats.median_down, 3)}</div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">TOTAL Δ</div>
          <div className="text-sm font-mono text-zinc-200">{fmtSigned(stats.total_delta, 3)}</div>
          <div className="text-[9px] text-zinc-500">sum of all legs</div>
        </GlassCard>
      </div>

      {/* Bins 1D (✅ now show stack up/down per bin) */}
      {hasCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <OneDBinsChart data={stackBins} title="STACK START bins (UP/DOWN counts)" />
          <OneDBinsChart data={benchBins} title="BENCH START bins (UP/DOWN counts)" />
          <OneDBinsChart data={devBins} title="DEV START bins (UP/DOWN counts)" />
        </div>
      )}

      {/* ✅ 2D charts grid (multi key) */}
      {twoDCharts.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {twoDCharts.map((c) => (
            <TwoDBinsScatter key={c.key} data={c.rows} title={c.title} xLabel={c.xLabel} yLabel={c.yLabel} />
          ))}
        </div>
      )}

      {/* Examples */}
      {hasExamples && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 opacity-70">
            <Clock size={14} className="text-emerald-400" />
            <span className="text-xs font-mono font-medium text-emerald-400/80 uppercase">Intraday Examples</span>
            <div className="h-px bg-emerald-500/20 flex-1" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">UP Moves</span>
                <Chip variant="emerald" size="xs">
                  TOP {Math.min(examples.up?.length ?? 0, 4)}
                </Chip>
              </div>
              <ExamplesList rows={examples.up ?? []} tone="up" />
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">DOWN Moves</span>
                <Chip variant="rose" size="xs">
                  TOP {Math.min(examples.down?.length ?? 0, 4)}
                </Chip>
              </div>
              <ExamplesList rows={examples.down ?? []} tone="down" />
            </GlassCard>
          </div>
        </div>
      )}
    </section>
  );
}

// =========================
// VIEW COMPONENT
// =========================

function ChronoFlowView({ data }: { data: AnyObj }) {
  const ticker = String(data?.ticker ?? "").toUpperCase();
  const windows: Record<string, WindowData> = data?.windows ?? {};
  const windowEntries = Object.entries(windows);

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-200 font-sans pb-24 selection:bg-emerald-500/30 selection:text-white">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-900/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03]" />
      </div>

      {/* Nav (✅ back leads to summary) */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[#030303]/70 border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link
            href="/stats/chrono"
            className="flex items-center gap-2.5 text-xs font-medium text-zinc-400 hover:text-white transition-all group"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 group-hover:bg-white/10 border border-white/5 transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span>BACK</span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
            <Zap size={12} />
            <span>WINDOWS: {windowEntries.length}</span>
          </div>
        </div>
      </nav>

      {/* Body */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-6 py-12 space-y-12">
        {/* Header */}
        <header className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-6xl md:text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 drop-shadow-sm">
                {ticker || "TICKER"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant="cyan">WINDOW STATS</Chip>
                <Chip variant="violet">SESSIONS: {windowEntries.length}</Chip>
              </div>
            </div>
            <GlassCard className="p-4 min-w-[220px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">OVERVIEW</span>
                <Clock size={14} className="text-zinc-600" />
              </div>
              <div className="text-[11px] font-mono text-zinc-400 space-y-1">
                <div>Windows: {windowEntries.length}</div>
                <div>
                  Total N:{" "}
                  <span className="text-zinc-200">
                    {windowEntries.map(([_, w]) => n(w.stats?.n) ?? 0).reduce((a, b) => a + b, 0)}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  Each window shows 1D bins (stack up/down), 2D bins (auto), plus real examples.
                </div>
              </div>
            </GlassCard>
          </div>
        </header>

        {/* Windows sections */}
        <div className="space-y-10">
          {windowEntries.map(([name, w]) => (
            <WindowSection key={name} name={name} data={w} />
          ))}
        </div>

        {/* Raw JSON (debug) */}
        <div className="pt-20 pb-10 flex justify-center opacity-30 hover:opacity-100 transition-opacity">
          <details className="text-center">
            <summary className="text-[10px] font-mono uppercase tracking-widest cursor-pointer text-zinc-600 hover:text-white">
              View Raw JSON Payload
            </summary>
            <pre className="mt-8 text-[10px] text-left text-zinc-500 font-mono bg-black p-6 rounded-2xl border border-white/5 overflow-auto max-w-3xl max-h-[400px]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      </main>
    </div>
  );
}

// =========================
// DEFAULT EXPORT – WRAPPER BY TICKER
// =========================

type ChronoFlowProps = {
  ticker: string;
};

export default function ChronoFlow({ ticker }: ChronoFlowProps) {
  const t = (ticker ?? "").trim().toUpperCase();

  const [data, setData] = useState<AnyObj | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!t) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        const json = await getChronoTicker(t);
        const item = (json as any)?.item ?? null;

        if (!item) throw new Error("No chrono ticker item");
        if ((item as any).windows == null && (item as any).classes == null) {
          throw new Error("Chrono ticker item has no expected fields (windows/classes)");
        }

        if (!cancelled) setData(item);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load chrono ticker");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!t) return null;

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#030303] text-zinc-200 flex items-center justify-center text-xs font-mono">
        <Activity className="mr-2 animate-spin" size={14} /> Loading ChronoFlow…
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="min-h-screen bg-[#030303] text-zinc-200 flex items-center justify-center">
        <GlassCard className="p-6 max-w-md">
          <div className="flex items-center gap-2 mb-2 text-rose-400">
            <Activity size={16} />
            <span className="text-sm font-semibold">ChronoFlow error</span>
          </div>
          <div className="text-xs text-zinc-400 font-mono break-all">{err}</div>
        </GlassCard>
      </div>
    );
  }

  return data ? <ChronoFlowView data={data} /> : null;
}
