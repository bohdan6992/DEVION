"use client";

import React, { useMemo, useState } from "react";

type Point = { t?: string; c?: number | null; v?: number | null };

function fmt(n: any, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return Number(n).toFixed(d);
}

function MiniLine({
  points,
  height = 140,
}: {
  points: { x: number; y: number }[];
  height?: number;
}) {
  if (points.length < 2) return <div className="text-xs text-white/60">No data</div>;

  const w = 560;
  const h = height;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const sx = (x: number) => {
    if (maxX === minX) return 0;
    return ((x - minX) / (maxX - minX)) * (w - 2) + 1;
  };
  const sy = (y: number) => {
    if (maxY === minY) return h / 2;
    // invert Y
    return (1 - (y - minY) / (maxY - minY)) * (h - 2) + 1;
  };

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      {/* baseline at last point label */}
    </svg>
  );
}

export function TickerdaysIntradayPanel({
  intraday,
}: {
  intraday?: Record<string, Point[]> | null;
}) {
  const keys = useMemo(() => Object.keys(intraday ?? {}).sort(), [intraday]);
  const [key, setKey] = useState<string>(() => keys[0] ?? "");

  // keep selected key valid
  React.useEffect(() => {
    if (!keys.length) {
      setKey("");
      return;
    }
    if (!key || !keys.includes(key)) setKey(keys[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  const series = (intraday && key && intraday[key]) ? intraday[key] : [];

  const linePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    let idx = 0;
    for (const p of series) {
      const c = p.c;
      if (c === null || c === undefined || Number.isNaN(c)) { idx++; continue; }
      pts.push({ x: idx, y: Number(c) });
      idx++;
    }
    return pts;
  }, [series]);

  const stats = useMemo(() => {
    const vals = series.map(p => p.c).filter(v => v !== null && v !== undefined && !Number.isNaN(v)) as number[];
    if (!vals.length) return null;
    const first = vals[0];
    const last = vals[vals.length - 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { first, last, min, max, n: vals.length };
  }, [series]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-white/70">Intraday (Tickerdays)</div>
        <select
          className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-xs"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          {keys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="mt-2 text-white/80">
        <MiniLine points={linePoints} />
      </div>

      <div className="mt-2 text-[11px] text-white/60">
        {stats ? (
          <div className="flex flex-wrap gap-3">
            <span>n={stats.n}</span>
            <span>first={fmt(stats.first, 2)}</span>
            <span>last={fmt(stats.last, 2)}</span>
            <span>min={fmt(stats.min, 2)}</span>
            <span>max={fmt(stats.max, 2)}</span>
          </div>
        ) : (
          <div>No stats</div>
        )}
      </div>
    </div>
  );
}
