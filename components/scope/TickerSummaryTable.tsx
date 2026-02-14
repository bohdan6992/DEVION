import React, { useMemo, useState } from "react";
import type { ScopeEventRow } from "@/lib/scopeApi";
import { calcPerf, groupByTicker } from "@/components/scope/tickerStats";
import { fmt, labelize } from "@/components/scope/format";

const COLS: Array<{ key: string; label: string; numeric?: boolean }> = [
  { key: "n", label: "n", numeric: true },
  { key: "sum", label: "sum", numeric: true },
  { key: "avg", label: "avg", numeric: true },
  { key: "median", label: "median", numeric: true },
  { key: "std", label: "std", numeric: true },
  { key: "n_win", label: "n_win", numeric: true },
  { key: "n_loss", label: "n_loss", numeric: true },
  { key: "bat%", label: "bat%", numeric: true },
  { key: "W/L", label: "W/L", numeric: true },
  { key: "avg win", label: "avg win", numeric: true },
  { key: "avg loss", label: "avg loss", numeric: true },
  { key: "p_10", label: "p_10", numeric: true },
  { key: "p_90", label: "p_90", numeric: true },
];

type SortKey = "ticker" | (typeof COLS)[number]["key"];
type SortDir = "asc" | "desc";

function asNumber(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isSignedMetric(key: SortKey): boolean {
  return (
    key === "sum" ||
    key === "avg" ||
    key === "median" ||
    key === "p_10" ||
    key === "p_90" ||
    key === "avg win" ||
    key === "avg loss"
  );
}

function signedClass(key: SortKey, v: any): string {
  if (!isSignedMetric(key)) return "text-zinc-200";
  const n = asNumber(v);
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-red-300";
  return "text-zinc-200";
}

export default function TickerSummaryTable({ rows }: { rows: ScopeEventRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const items = useMemo(() => {
    if (!rows?.length) return [];

    const g = groupByTicker(rows);

    const base = Array.from(g.entries()).map(([ticker, rs]) => {
      const trades = rs.map((r) => r.trade);
      return { ticker, stats: calcPerf(trades) };
    });

    const dir = sortDir === "asc" ? 1 : -1;

    const sorted = [...base].sort((a, b) => {
      if (sortKey === "ticker") return dir * a.ticker.localeCompare(b.ticker);

      const av = asNumber((a.stats as any)[sortKey]);
      const bv = asNumber((b.stats as any)[sortKey]);

      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.ticker.localeCompare(b.ticker);
    });

    return sorted;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  }

  function sortGlyph(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="text-white text-lg font-semibold">Per-ticker summary</h2>
        <div className="text-zinc-500 text-xs font-mono">tickers: {items.length}</div>
      </div>

      <div className="mt-4 overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th className="text-left font-semibold py-2 pr-4">
                <button
                  type="button"
                  onClick={() => toggleSort("ticker")}
                  className="hover:text-zinc-200 transition-colors"
                  title="Sort by ticker"
                >
                  ticker{sortGlyph("ticker")}
                </button>
              </th>

              {COLS.map((c) => (
                <th key={c.key} className="text-right font-semibold py-2 px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="hover:text-zinc-200 transition-colors"
                    title={`Sort by ${c.label}`}
                  >
                    {labelize(c.label)}
                    {sortGlyph(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.map((it) => (
              <tr key={it.ticker} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-2 pr-4 font-mono text-zinc-200">{it.ticker}</td>

                {COLS.map((c) => {
                  const v = (it.stats as any)[c.key];
                  return (
                    <td key={c.key} className={`py-2 px-3 text-right font-mono ${signedClass(c.key, v)}`}>
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-zinc-500">
        Tip: click column headers to sort. Green = positive, Red = negative (for signed metrics).
      </div>
    </section>
  );
}
