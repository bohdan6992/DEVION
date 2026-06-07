import React, { useMemo, useState } from "react";
import { fmt, labelize } from "@/components/scope/format";

type SectorRow = {
  sector: string;
  tickerCount: number;
  n: number;
  sum: number;
  avg: number;
  median: number;
  std: number;
  batPct: number;
  wl: number;
  avgWin: number;
  avgLoss: number;
};

const COLS: Array<{ key: keyof SectorRow; label: string; signed?: boolean }> = [
  { key: "n", label: "n" },
  { key: "tickerCount", label: "tickers" },
  { key: "sum", label: "sum", signed: true },
  { key: "avg", label: "avg", signed: true },
  { key: "median", label: "median", signed: true },
  { key: "std", label: "std" },
  { key: "batPct", label: "bat%" },
  { key: "wl", label: "W/L" },
  { key: "avgWin", label: "avg win", signed: true },
  { key: "avgLoss", label: "avg loss", signed: true },
];

function signedClass(signed: boolean | undefined, v: any) {
  if (!signed) return "text-zinc-200";
  const n = Number(v);
  if (!Number.isFinite(n)) return "text-zinc-200";
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-red-300";
  return "text-zinc-200";
}

type SortKey = "sector" | keyof SectorRow;
type SortDir = "asc" | "desc";

export default function SectorChart({ data }: { data: any }) {
  const [sortKey, setSortKey] = useState<SortKey>("sum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows: SectorRow[] = useMemo(() => {
    const raw: any[] = data?.rows ?? [];
    return raw.map((r) => ({
      sector: r.sector ?? "(none)",
      tickerCount: r.tickerCount ?? 0,
      n: r.n ?? 0,
      sum: r.sum ?? 0,
      avg: r.avg ?? 0,
      median: r.median ?? 0,
      std: r.std ?? 0,
      batPct: r.batPct ?? 0,
      wl: r.wl ?? 0,
      avgWin: r.avgWin ?? 0,
      avgLoss: r.avgLoss ?? 0,
    }));
  }, [data]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "sector") return dir * a.sector.localeCompare(b.sector);
      const av = Number(a[sortKey as keyof SectorRow]);
      const bv = Number(b[sortKey as keyof SectorRow]);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.sector.localeCompare(b.sector);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function glyph(key: SortKey) {
    return key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  }

  if (!rows.length) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="text-white text-lg font-semibold">Sector distribution (lvl2)</h2>
        <div className="text-zinc-500 text-xs font-mono">sectors: {rows.length}</div>
      </div>

      <div className="mt-4 overflow-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th className="text-left font-semibold py-2 pr-4">
                <button type="button" onClick={() => toggleSort("sector")} className="hover:text-zinc-200 transition-colors">
                  sector{glyph("sector")}
                </button>
              </th>
              {COLS.map((c) => (
                <th key={c.key} className="text-right font-semibold py-2 px-3">
                  <button type="button" onClick={() => toggleSort(c.key)} className="hover:text-zinc-200 transition-colors">
                    {labelize(c.label)}{glyph(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.sector} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-2 pr-4 font-mono text-zinc-200">{row.sector}</td>
                {COLS.map((c) => {
                  const v = row[c.key];
                  return (
                    <td key={c.key} className={`py-2 px-3 text-right font-mono ${signedClass(c.signed, v)}`}>
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
