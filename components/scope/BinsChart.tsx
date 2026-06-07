import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

type BinRow = {
  label: string;
  left: number;
  right: number;
  n: number;
  sum: number;
  avg: number;
  median: number;
  std: number;
  batPct: number;
  wl: number;
  avgWin: number;
  avgLoss: number;
  tailDamage: number;
  tailDamageRatio: number;
  tailN: number;
  trimmedAvg: number;
  trimmedSum: number;
  trimmedN: number;
};

type SortMode = "xAxis" | "tailDamage" | "trimmedAvg";

const SORT_LABELS: Record<SortMode, string> = {
  xAxis: "X-axis order",
  tailDamage: "Tail damage ↓",
  trimmedAvg: "Trimmed avg ↓",
};

function fmt2(v: number | undefined) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "-";
  return v.toFixed(3);
}

function fmtPct(v: number | undefined) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "-";
  return v.toFixed(1) + "%";
}

export default function BinsChart({ data }: { data: any }) {
  const [sortMode, setSortMode] = useState<SortMode>("xAxis");
  const [showTrimmed, setShowTrimmed] = useState(false);

  const bins: BinRow[] = useMemo(() => {
    return (data?.bins ?? []).map((b: any) => ({
      label: b.label ?? "",
      left: b.left ?? 0,
      right: b.right ?? 0,
      n: b.n ?? 0,
      sum: b.sum ?? 0,
      avg: b.avg ?? 0,
      median: b.median ?? 0,
      std: b.std ?? 0,
      batPct: b.batPct ?? 0,
      wl: b.wl ?? 0,
      avgWin: b.avgWin ?? 0,
      avgLoss: b.avgLoss ?? 0,
      tailDamage: b.tailDamage ?? 0,
      tailDamageRatio: b.tailDamageRatio ?? 0,
      tailN: b.tailN ?? 0,
      trimmedAvg: b.trimmedAvg ?? 0,
      trimmedSum: b.trimmedSum ?? 0,
      trimmedN: b.trimmedN ?? 0,
    }));
  }, [data]);

  const sorted = useMemo(() => {
    if (sortMode === "xAxis") return bins;
    if (sortMode === "tailDamage") return [...bins].sort((a, b) => b.tailDamage - a.tailDamage);
    if (sortMode === "trimmedAvg") return [...bins].sort((a, b) => b.trimmedAvg - a.trimmedAvg);
    return bins;
  }, [bins, sortMode]);

  const chartData = sorted.map((b) => ({
    label: b.label,
    avg: b.avg,
    trimmedAvg: b.trimmedAvg,
    tailDamage: b.tailDamage,
    n: b.n,
  }));

  const yKey = showTrimmed ? "trimmedAvg" : "avg";

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="text-white text-lg font-semibold">
          Bins — {data?.xField ?? "x"} vs {data?.field ?? "trade"}
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 text-xs">Sort:</span>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  sortMode === mode
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                {SORT_LABELS[mode]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowTrimmed((v) => !v)}
            className={`px-2 py-1 rounded text-xs transition-colors border ${
              showTrimmed
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200 border-zinc-600"
            }`}
          >
            {showTrimmed ? "Trimmed avg" : "Avg"}
          </button>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="label" stroke="#888" tick={{ fontSize: 10 }} />
            <YAxis stroke="#888" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const bin = sorted.find((b) => b.label === d.label);
                if (!bin) return null;
                return (
                  <div className="bg-zinc-900 border border-white/10 rounded p-3 text-xs space-y-1 font-mono">
                    <div className="text-zinc-300 font-semibold">{bin.label}</div>
                    <div>n: {bin.n}</div>
                    <div className={bin.avg >= 0 ? "text-emerald-300" : "text-red-300"}>avg: {fmt2(bin.avg)}</div>
                    <div className={bin.trimmedAvg >= 0 ? "text-emerald-300" : "text-red-300"}>
                      trimmed avg: {fmt2(bin.trimmedAvg)} (n={bin.trimmedN})
                    </div>
                    <div className="text-amber-300">tail damage: {fmt2(bin.tailDamage)} ({fmtPct(bin.tailDamageRatio * 100)})</div>
                    <div className="text-zinc-400">tail n: {bin.tailN}</div>
                    <div>bat%: {fmtPct(bin.batPct)}</div>
                    <div>W/L: {fmt2(bin.wl)}</div>
                    <div>sum: {fmt2(bin.sum)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey={yKey}>
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry[yKey as keyof typeof entry] >= 0 ? "#3b82f6" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tail damage table */}
      <div className="mt-6">
        <div className="text-zinc-400 text-xs font-semibold mb-2 uppercase tracking-wider">
          Tail damage detail (head + tail 20% of x-distribution)
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-zinc-500">
                <th className="text-left py-1 pr-3">bin</th>
                <th className="text-right py-1 px-2">n</th>
                <th className="text-right py-1 px-2">avg</th>
                <th className="text-right py-1 px-2">trimmed avg</th>
                <th className="text-right py-1 px-2">tail n</th>
                <th className="text-right py-1 px-2">tail damage</th>
                <th className="text-right py-1 px-2">damage %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.label} className="border-t border-white/[0.04]">
                  <td className="py-1 pr-3 text-zinc-300">{b.label}</td>
                  <td className="py-1 px-2 text-right">{b.n}</td>
                  <td className={`py-1 px-2 text-right ${b.avg >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {fmt2(b.avg)}
                  </td>
                  <td className={`py-1 px-2 text-right ${b.trimmedAvg >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {fmt2(b.trimmedAvg)}
                  </td>
                  <td className="py-1 px-2 text-right text-zinc-400">{b.tailN}</td>
                  <td className="py-1 px-2 text-right text-amber-300">{fmt2(b.tailDamage)}</td>
                  <td className="py-1 px-2 text-right text-amber-300">{fmtPct(b.tailDamageRatio * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500">
          Tail damage = sum of losses in the head + tail 20% of situations sorted by X. High value = filter X-range to improve.
        </div>
      </div>
    </section>
  );
}
