"use client";

import clsx from "clsx";
import React, { useId, useMemo, useState } from "react";
import { clampInt, intn, minuteIdxToClockLabel, num } from "../../../lib/scanner/format";
import { scopeResearchDailySeries, scopeResearchEdges, scopeResearchFormatValue, scopeResearchLabelLines, scopeResearchMetricLabel, scopeResearchMetricValue, scopeResearchRangeLabel, scopeResearchSummarize } from "../../../lib/scanner/scopeCompute";
import { scoreTailDamage } from "../../../lib/scanner/scopeOptimizer";
import type { OptimizerRangeRankMetric, OptimizerResultRow, PaperArbClosedDto, PaperArbEquityPointDto, PaperArbOptimizerParameterDto, PaperArbOptimizerRangeBucketDto, ScopeChartTooltipData, ScopeResearchBinRow, ScopeResearchPoint, ScopeResearchResultKey, ScopeResearchThresholdRow, ScopeResearchValueFormat } from "../../../lib/scanner/types";
import { SOFT_LOSS_CHIP, SOFT_LOSS_LINE, SOFT_LOSS_MUTED, SOFT_LOSS_SOLID, SOFT_LOSS_STROKE, SOFT_LOSS_TEXT_CLASS } from "./styles";
import { GlassCard, ScopeResearchInsufficientState, renderScopeChartTooltip } from "./ui";

// =========================
// Simple SVG line chart (equity curve)
// =========================
export function EquityChartImpl({
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

export const EquityChart = React.memo(EquityChartImpl);

export function OptimizerBarChartImpl({
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

export const OptimizerBarChart = React.memo(OptimizerBarChartImpl);

export function OptimizerDualMetricChartImpl({
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

export const OptimizerDualMetricChart = React.memo(OptimizerDualMetricChartImpl);

export function OptimizerParameterRangeCardImpl({
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
  const sortBucketsByMetric = (items: PaperArbOptimizerRangeBucketDto[]) =>
    [...items].sort((a, b) => {
      const aMetric = rankMetric === "winRate" ? a.winRate : rankMetric === "totalPnlUsd" ? a.totalPnlUsd : rankMetric === "score" ? a.score : a.avgPnlUsd;
      const bMetric = rankMetric === "winRate" ? b.winRate : rankMetric === "totalPnlUsd" ? b.totalPnlUsd : rankMetric === "score" ? b.score : b.avgPnlUsd;
      if (bMetric !== aMetric) return bMetric - aMetric;
      if (b.totalPnlUsd !== a.totalPnlUsd) return b.totalPnlUsd - a.totalPnlUsd;
      return b.trades - a.trades;
    });
  const isCategorical = (parameter.buckets ?? []).some((b) => b.fromValue == null && b.toValue == null && b.label && b.label !== "");
  const buckets = [...(parameter.buckets ?? [])]
    .filter((bucket) => bucket.trades >= minTradesFilter)
    .sort((a, b) => {
    if (isCategorical) return b.totalPnlUsd - a.totalPnlUsd; // categorical: sort by PnL
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
    <GlassCard className="p-0 overflow-hidden border border-white/5 bg-black/20 shadow-none">
      <div className="border-b border-white/5 bg-black/10 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex items-center gap-2">
            <div className={clsx("text-[12px] uppercase tracking-[0.18em] font-mono", "accent-text")}>{parameter.label}</div>
            {rankMetric === "tailDamage" && (() => {
              const td = scoreTailDamage(parameter, minTradesFilter);
              return td > 0 ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wide">
                  -{num(td, 0)}
                </span>
              ) : null;
            })()}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-right whitespace-nowrap">
            <div className="rounded-md border border-white/5 bg-black/20 px-1.5 py-1 min-w-[54px]">
              <div className="flex items-center justify-between gap-1 text-[9px] font-mono">
                <span className="uppercase tracking-[0.16em] text-zinc-500">Trades</span>
                <span className="text-[11px] text-zinc-100">{intn(parameter.baseTrades)}</span>
              </div>
            </div>
            <div className="rounded-md border border-white/5 bg-black/20 px-1.5 py-1 min-w-[54px]">
              <div className="flex items-center justify-between gap-1 text-[9px] font-mono">
                <span className="uppercase tracking-[0.16em] text-zinc-500">PnL</span>
                <span className={clsx("text-[11px]", valueTextClass(baseTotalPnl, "text-zinc-100"))}>{num(baseTotalPnl, 2)}</span>
              </div>
            </div>
            <div className="rounded-md border border-white/5 bg-black/20 px-1.5 py-1 min-w-[54px]">
              <div className="flex items-center justify-between gap-1 text-[9px] font-mono">
                <span className="uppercase tracking-[0.16em] text-zinc-500">Avg</span>
                <span className={clsx("text-[11px]", valueTextClass(baseAvgPnl, "text-zinc-100"))}>{num(baseAvgPnl, 2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-2.5">
      <div className={clsx("grid gap-1.5 mb-2", summaryCards.length >= 3 ? "grid-cols-1 md:grid-cols-3" : summaryCards.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        {summaryCards.map((entry) => (
          <div key={`${parameter.key}-${entry.label}`} className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">{entry.label}</div>
                <div className="text-[11px] font-mono text-zinc-100 mt-1 truncate">{entry.item?.label ?? "-"}</div>
              </div>
              <div className="shrink-0 text-right text-[10px] font-mono">
                <div className="text-zinc-400">trades {intn(entry.item?.trades)}</div>
                <div className="text-zinc-500 mt-0.5">hit {num((entry.item?.winRate ?? 0) * 100, 1)}%</div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-mono">
              <div className="min-w-0">
                <span className={clsx(valueTextClass(entry.item?.avgPnlUsd ?? 0, "text-zinc-300"))}>avg {num(entry.item?.avgPnlUsd, 2)}</span>
                <span className="text-zinc-500"> | </span>
                <span className="text-zinc-400">pnl {num(entry.item?.totalPnlUsd, 2)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={clsx("rounded-md border px-1.5 py-0.5", valueChipClass((entry.item?.avgPnlUsd ?? 0) - baseAvgPnl))}>
                dAvg {num((entry.item?.avgPnlUsd ?? 0) - baseAvgPnl, 2)}
                </span>
                <span className={clsx("rounded-md border px-1.5 py-0.5", valueChipClass((entry.item?.totalPnlUsd ?? 0) - baseTotalPnl))}>
                dPnL {num((entry.item?.totalPnlUsd ?? 0) - baseTotalPnl, 2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 xl:grid-cols-8 gap-1 mb-2.5">
        {buckets.map((bucket) => (
          <div
            key={`heat-${bucket.bucketId}`}
            className={clsx(
              "h-7 rounded border border-white/5 flex items-center justify-center text-[9px] font-mono bg-black/20",
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

      <div className="space-y-1.5 mb-2.5 rounded-xl border border-white/5 bg-black/20 p-2">
        <div className="flex items-center justify-between">
          <div className="text-[9px] uppercase tracking-[0.16em] font-mono text-zinc-500">Range Strength</div>
          <div className="text-[9px] font-mono text-zinc-600">score</div>
        </div>
        {buckets.map((bucket) => {
          const widthPct = Math.max(6, (Math.abs(bucket.score) / maxAbsScore) * 100);
          return (
            <div key={bucket.bucketId} className="grid grid-cols-[112px_1fr_54px] gap-2 items-center">
              <div className="text-[10px] font-mono text-zinc-400 truncate" title={bucket.label}>
                {bucket.label}
              </div>
              <div className="h-[18px] rounded bg-black/20 border border-white/5 overflow-hidden">
                <div
                  className={clsx(
                    "h-full",
                    bucket.score >= 0 ? "bg-[#6ee7b7]/80" : "bg-[#f3a6b2]/80"
                  )}
                  style={{
                    width: `${widthPct}%`,
                    opacity: bucket.coveragePct < 0.08 ? 0.4 : 1,
                  }}
                />
              </div>
              <div className={clsx("text-right text-[10px] font-mono font-semibold tabular-nums", scoreTextClass(bucket.score))}>
                {num(bucket.score, 2)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-auto rounded-xl border border-white/5 bg-black/20">
        <table className="min-w-[760px] w-full text-[10px] font-mono">
          <thead className="sticky top-0 z-10 bg-black/30 text-zinc-400 border-b border-white/5 backdrop-blur-sm">
            <tr>
              <th className="text-left px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">Range</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">N</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">Cov</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">Win</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">dW</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">PnL</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">dP</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">Avg</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">dA</th>
              <th className="text-right px-2 py-1.5 uppercase tracking-[0.16em] text-[8px]">W/L</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={`${parameter.key}-${bucket.bucketId}`} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                <td className="px-2 py-1.5 text-zinc-200 whitespace-nowrap">{bucket.label}</td>
                <td className="px-2 py-1 text-right tabular-nums text-zinc-300">{intn(bucket.trades)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-zinc-300">{num(bucket.coveragePct * 100, 1)}%</td>
                <td className="px-2 py-1 text-right tabular-nums text-zinc-300">{num(bucket.winRate * 100, 1)}%</td>
                <td className={clsx("px-2 py-1 text-right tabular-nums", valueTextClass(bucket.winRate - baseWinRate))}>
                  {num((bucket.winRate - baseWinRate) * 100, 1)}%
                </td>
                <td className={clsx("px-2 py-1 text-right tabular-nums", valueTextClass(bucket.totalPnlUsd))}>
                  {num(bucket.totalPnlUsd, 2)}
                </td>
                <td className={clsx("px-2 py-1 text-right tabular-nums", valueTextClass(bucket.totalPnlUsd - baseTotalPnl))}>
                  {num(bucket.totalPnlUsd - baseTotalPnl, 2)}
                </td>
                <td className={clsx("px-2 py-1 text-right tabular-nums font-bold", valueTextClass(bucket.avgPnlUsd))}>
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

export const OptimizerParameterRangeCard = React.memo(OptimizerParameterRangeCardImpl);

export function StartsByTimeChartImpl({
  rows,
  title,
  meta,
  fullscreen = false,
  xFrom,
  xTo,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
  xFrom?: number | null;
  xTo?: number | null;
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
    if (xFrom != null && xTo != null) {
      for (let b = Math.trunc(xFrom / 5) * 5; b <= xTo; b += 5) m.set(b, { ok: 0, bad: 0 });
    }
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
  }, [rows, xFrom, xTo]);

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
  const nonEmptyBins = bins.filter(([, v]) => v.ok + v.bad > 0).length;
  const avgOkBin = nonEmptyBins ? totalOk / nonEmptyBins : 0;
  const avgBadBin = nonEmptyBins ? totalBad / nonEmptyBins : 0;
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

export const StartsByTimeChart = React.memo(StartsByTimeChartImpl);

export function StartsEndsByTimeChartImpl({
  rows,
  title,
  meta,
  fullscreen = false,
  xFrom,
  xTo,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
  xFrom?: number | null;
  xTo?: number | null;
}) {
  const w = fullscreen ? 2800 : 1100;
  const h = 360;
  const padLeft = 22;
  const padRight = 40;
  const padTop = 56;
  const padBottom = 40;

  const bins = useMemo(() => {
    const m = new Map<number, { starts: number; ends: number }>();
    if (xFrom != null && xTo != null) {
      for (let b = Math.trunc(xFrom / 5) * 5; b <= xTo; b += 5) m.set(b, { starts: 0, ends: 0 });
    }
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
  }, [rows, xFrom, xTo]);

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

export const StartsEndsByTimeChart = React.memo(StartsEndsByTimeChartImpl);

export function PeakStrengthByTimeChartImpl({
  rows,
  title,
  meta,
  fullscreen = false,
  xFrom,
  xTo,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
  xFrom?: number | null;
  xTo?: number | null;
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
    if (xFrom != null && xTo != null) {
      for (let b = Math.trunc(xFrom / 5) * 5; b <= xTo; b += 5) m.set(b, { count: 0, sumAbs: 0 });
    }
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
  }, [rows, xFrom, xTo]);

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
  const peakVals = bins.filter((b) => b.count > 0).map((b) => b.avgAbs);
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

export const PeakStrengthByTimeChart = React.memo(PeakStrengthByTimeChartImpl);

export function PeakReversionTwoThirdsChartImpl({
  rows,
  title,
  meta,
  fullscreen = false,
  xFrom,
  xTo,
}: {
  rows: PaperArbClosedDto[];
  title?: string;
  meta?: string;
  fullscreen?: boolean;
  xFrom?: number | null;
  xTo?: number | null;
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
    if (xFrom != null && xTo != null) {
      for (let b = Math.trunc(xFrom / 5) * 5; b <= xTo; b += 5) m.set(b, { yes: 0, no: 0 });
    }
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
  }, [rows, xFrom, xTo]);

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

export const PeakReversionTwoThirdsChart = React.memo(PeakReversionTwoThirdsChartImpl);

export function ScopeResearchSeriesChartImpl({
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

export const ScopeResearchSeriesChart = React.memo(ScopeResearchSeriesChartImpl);

export function ScopeResearchBoxChartImpl({
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

export const ScopeResearchBoxChart = React.memo(ScopeResearchBoxChartImpl);

export function ScopeResearchDistributionChartImpl({
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

export const ScopeResearchDistributionChart = React.memo(ScopeResearchDistributionChartImpl);

export function ScopeResearchViolinChartImpl({
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

export const ScopeResearchViolinChart = React.memo(ScopeResearchViolinChartImpl);

export function ScopeResearchScatterByDateChartImpl({
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

export const ScopeResearchScatterByDateChart = React.memo(ScopeResearchScatterByDateChartImpl);

export function ScopeResearchCumsumChartImpl({
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

export const ScopeResearchCumsumChart = React.memo(ScopeResearchCumsumChartImpl);

export function ScopeResearchTradePerformanceChartImpl({
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

export const ScopeResearchTradePerformanceChart = React.memo(ScopeResearchTradePerformanceChartImpl);
