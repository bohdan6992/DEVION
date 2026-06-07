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

type SortKey = "ticker" | "sector" | (typeof COLS)[number]["key"];
type SortDir = "asc" | "desc";
type GroupMode = "ticker" | "sector";

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
  const [groupMode, setGroupMode] = useState<GroupMode>("ticker");

  const tickerItems = useMemo(() => {
    if (!rows?.length) return [];
    const g = groupByTicker(rows);
    return Array.from(g.entries()).map(([ticker, rs]) => {
      const sector = rs.find((r) => r.sectorL3)?.sectorL3 ?? "";
      return { ticker, sector, stats: calcPerf(rs.map((r) => r.trade)) };
    });
  }, [rows]);

  const sectorItems = useMemo(() => {
    if (!rows?.length) return [];
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const sector = r.sectorL3?.trim() || "(none)";
      const existing = groups.get(sector);
      if (existing) existing.push(r.trade ?? 0);
      else groups.set(sector, [r.trade ?? 0]);
    }
    return Array.from(groups.entries()).map(([sector, trades]) => ({
      ticker: sector,
      sector,
      stats: calcPerf(trades),
    }));
  }, [rows]);

  const baseItems = groupMode === "sector" ? sectorItems : tickerItems;

  const items = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...baseItems].sort((a, b) => {
      if (sortKey === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === "sector") return dir * (a.sector ?? "").localeCompare(b.sector ?? "");
      const av = asNumber((a.stats as any)[sortKey]);
      const bv = asNumber((b.stats as any)[sortKey]);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [baseItems, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" || key === "sector" ? "asc" : "desc"); }
  }

  function sortGlyph(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const labelKey = groupMode === "sector" ? "sector" : "ticker";

  return (
    <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="text-white text-lg font-semibold">
          {groupMode === "sector" ? "Sector summary (lvl2)" : "Per-ticker summary"}
        </h2>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(["ticker", "sector"] as GroupMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setGroupMode(m); setSortKey(m === "sector" ? "sector" : "ticker"); setSortDir("asc"); }}
                className={`px-3 py-1 text-xs transition-colors ${
                  groupMode === m
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {m === "ticker" ? "By ticker" : "By sector"}
              </button>
            ))}
          </div>
          <div className="text-zinc-500 text-xs font-mono">
            {groupMode === "sector" ? `sectors: ${items.length}` : `tickers: ${items.length}`}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th className="text-left font-semibold py-2 pr-4">
                <button
                  type="button"
                  onClick={() => toggleSort(labelKey as SortKey)}
                  className="hover:text-zinc-200 transition-colors"
                >
                  {groupMode === "sector" ? "sector" : "ticker"}{sortGlyph(labelKey as SortKey)}
                </button>
              </th>

              {groupMode === "ticker" && (
                <th className="text-left font-semibold py-2 pr-4">
                  <button type="button" onClick={() => toggleSort("sector")} className="hover:text-zinc-200 transition-colors">
                    sector{sortGlyph("sector")}
                  </button>
                </th>
              )}

              {COLS.map((c) => (
                <th key={c.key} className="text-right font-semibold py-2 px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="hover:text-zinc-200 transition-colors"
                  >
                    {labelize(c.label)}{sortGlyph(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.map((it) => (
              <tr key={it.ticker} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-2 pr-4 font-mono text-zinc-200">{it.ticker}</td>

                {groupMode === "ticker" && (
                  <td className="py-2 pr-4 font-mono text-zinc-400 text-xs">{it.sector || "-"}</td>
                )}

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
        Click column headers to sort. Green = positive, Red = negative (for signed metrics).
        {groupMode === "ticker" && " Sector = SectorL3 (lvl2) from tape metadata."}
      </div>
    </section>
  );
}
