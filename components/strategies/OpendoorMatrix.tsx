"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getOpenDoorSummary } from "@/lib/trapClient";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Filter,
  X,
  DoorOpen,
  Clock,
  BarChart2,
} from "lucide-react";

/* ============================= Types ============================= */

type RawRow = Record<string, string>;

type SortKey =
  | "ticker"
  | "open_glob_total"
  | "open_glob_up_rate"
  | "open_glob_down_rate"
  | "open_5m_total"
  | "open_5m_up_rate"
  | "open_5m_down_rate"
  | "open_10m_total"
  | "open_10m_up_rate"
  | "open_10m_down_rate"
  | "open_15m_total"
  | "open_15m_up_rate"
  | "open_15m_down_rate"
  | "open_20m_total"
  | "open_20m_up_rate"
  | "open_20m_down_rate"
  | "open_30m_total"
  | "open_30m_up_rate"
  | "open_30m_down_rate";

type SortDir = "asc" | "desc";

type DisplayRow = {
  ticker: string;

  open_glob_total: string;
  open_glob_up_rate: string;
  open_glob_down_rate: string;

  open_5m_total: string;
  open_5m_up_rate: string;
  open_5m_down_rate: string;

  open_10m_total: string;
  open_10m_up_rate: string;
  open_10m_down_rate: string;

  open_15m_total: string;
  open_15m_up_rate: string;
  open_15m_down_rate: string;

  open_20m_total: string;
  open_20m_up_rate: string;
  open_20m_down_rate: string;

  open_30m_total: string;
  open_30m_up_rate: string;
  open_30m_down_rate: string;

  __raw: RawRow;
};

type FilterState = Record<string, { min: string; max: string }>;

/* ============================= UI Config ============================= */

const GROUPS = [
  {
    id: "glob",
    label: "OPEN GLOBAL",
    color: "text-orange-300",
    border: "border-orange-500",
    bg: "bg-orange-500/10",
    icon: DoorOpen,
    cols: ["open_glob_total", "open_glob_up_rate", "open_glob_down_rate"],
  },
  {
    id: "m5",
    label: "OPEN 5M",
    color: "text-emerald-400",
    border: "border-emerald-500",
    bg: "bg-emerald-500/10",
    icon: Clock,
    cols: ["open_5m_total", "open_5m_up_rate", "open_5m_down_rate"],
  },
  {
    id: "m10",
    label: "OPEN 10M",
    color: "text-cyan-400",
    border: "border-cyan-500",
    bg: "bg-cyan-500/10",
    icon: Clock,
    cols: ["open_10m_total", "open_10m_up_rate", "open_10m_down_rate"],
  },
  {
    id: "m15",
    label: "OPEN 15M",
    color: "text-violet-400",
    border: "border-violet-500",
    bg: "bg-violet-500/10",
    icon: Clock,
    cols: ["open_15m_total", "open_15m_up_rate", "open_15m_down_rate"],
  },
  {
    id: "m20",
    label: "OPEN 20M",
    color: "text-fuchsia-400",
    border: "border-fuchsia-500",
    bg: "bg-fuchsia-500/10",
    icon: Clock,
    cols: ["open_20m_total", "open_20m_up_rate", "open_20m_down_rate"],
  },
  {
    id: "m30",
    label: "OPEN 30M",
    color: "text-amber-400",
    border: "border-amber-500",
    bg: "bg-amber-500/10",
    icon: BarChart2,
    cols: ["open_30m_total", "open_30m_up_rate", "open_30m_down_rate"],
  },
] as const;

const COL_LABELS: Record<string, string> = {
  open_glob_total: "Tot",
  open_glob_up_rate: "Up",
  open_glob_down_rate: "Dn",

  open_5m_total: "Tot",
  open_5m_up_rate: "Up",
  open_5m_down_rate: "Dn",

  open_10m_total: "Tot",
  open_10m_up_rate: "Up",
  open_10m_down_rate: "Dn",

  open_15m_total: "Tot",
  open_15m_up_rate: "Up",
  open_15m_down_rate: "Dn",

  open_20m_total: "Tot",
  open_20m_up_rate: "Up",
  open_20m_down_rate: "Dn",

  open_30m_total: "Tot",
  open_30m_up_rate: "Up",
  open_30m_down_rate: "Dn",
};

const ROWS_PER_PAGE = 50;

/* ============================= Helpers ============================= */

function pick(row: RawRow, keys: string[], fallback = ""): string {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return fallback;
}

function toStr(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
}

function numOrNaN(x: any) {
  const n = parseFloat(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function fmtPct(x: string) {
  const v = numOrNaN(x);
  if (Number.isNaN(v)) return <span className="text-zinc-800">—</span>;
  return `${(v * 100).toFixed(0)}%`;
}

function getRateColor(valStr: string) {
  const v = numOrNaN(valStr);
  if (Number.isNaN(v) || v === 0) return "text-zinc-600 font-light";
  if (v < 0.2) return "text-zinc-400";
  if (v < 0.4) return "text-blue-400";
  if (v < 0.6) return "text-emerald-400";
  if (v < 0.8)
    return "text-emerald-300 font-semibold drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]";
  return "text-white font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]";
}

// summary items are "flat-ish", but keep defensive normalization
function flattenItem(item: any): RawRow {
  const out: RawRow = {};
  if (!item || typeof item !== "object") return out;

  // 1) top-level
  for (const [k, v] of Object.entries(item)) {
    if (k === "extras" || k === "Extras") continue;
    out[String(k)] = toStr(v);
  }

  // 2) merge extras (саме там open_* поля)
  const extras = (item as any).extras ?? (item as any).Extras ?? null;
  if (extras && typeof extras === "object") {
    for (const [k, v] of Object.entries(extras)) {
      const key = String(k);

      // ✅ прибираємо mean/median повністю
      if (key.endsWith("_mean_move") || key.endsWith("_median_move")) continue;

      out[key] = toStr(v);
    }
  }

  // normalize ticker
  const t = out.ticker || (item as any).Ticker;
  if (t != null) out.ticker = String(t).trim().toUpperCase();

  return out;
}


function toDisplayRow(r: RawRow): DisplayRow {
  const ticker = (pick(r, ["ticker", "Ticker"]) || "").toUpperCase();

  const row: any = { ticker, __raw: r };
  for (const g of GROUPS) {
    for (const col of g.cols) row[col] = pick(r, [col], "");
  }
  return row as DisplayRow;
}

/* ============================= FilterInput ============================= */

const FilterInput = ({
  label,
  colKey,
  filters,
  onChange,
}: {
  label: string;
  colKey: string;
  filters: FilterState;
  onChange: (key: string, type: "min" | "max", val: string) => void;
}) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase text-zinc-500 font-bold tracking-wider">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="Min"
          step="0.1"
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-emerald-400 focus:border-emerald-500/50 outline-none placeholder:text-zinc-700"
          value={filters[colKey]?.min || ""}
          onChange={(e) => onChange(colKey, "min", e.target.value)}
        />
        <span className="text-zinc-700">-</span>
        <input
          type="number"
          placeholder="Max"
          step="0.1"
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-emerald-400 focus:border-emerald-500/50 outline-none placeholder:text-zinc-700"
          value={filters[colKey]?.max || ""}
          onChange={(e) => onChange(colKey, "max", e.target.value)}
        />
      </div>
    </div>
  );
};

/* ============================= Page ============================= */

export default function OpenDoorMatrixPage() {
  const router = useRouter();

  const [rawRows, setRawRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("open_glob_total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const json = await getOpenDoorSummary();
        const items = Array.isArray((json as any)?.items) ? (json as any).items : [];

        const display = items.map(flattenItem).map(toDisplayRow).filter((x) => x.ticker);

        if (!cancelled) setRawRows(display);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const processedRows = useMemo(() => {
    let data = rawRows;

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      data = data.filter((r) => r.ticker.includes(q));
    }

    const activeFilters = Object.entries(filters).filter(([_, v]) => v.min !== "" || v.max !== "");
    if (activeFilters.length > 0) {
      data = data.filter((row) => {
        return activeFilters.every(([key, { min, max }]) => {
          const val = numOrNaN((row as any)[key]);
          if (Number.isNaN(val)) return false;
          const minNum = min === "" ? -Infinity : parseFloat(min);
          const maxNum = max === "" ? Infinity : parseFloat(max);
          return val >= minNum && val <= maxNum;
        });
      });
    }

    return [...data].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const isNum = sortKey !== "ticker";

      if (isNum) {
        const an = numOrNaN(av);
        const bn = numOrNaN(bv);
        const va = isNaN(an) ? -Infinity : an;
        const vb = isNaN(bn) ? -Infinity : bn;
        return sortDir === "asc" ? va - vb : vb - va;
      }

      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rawRows, search, filters, sortKey, sortDir]);

  const totalPages = Math.ceil(processedRows.length / ROWS_PER_PAGE) || 1;
  const pageRows = processedRows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleFilterChange = (key: string, type: "min" | "max", val: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], [type]: val },
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* BG */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[1000px] h-[500px] bg-orange-900/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[10%] w-[800px] h-[600px] bg-emerald-900/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-[1920px] mx-auto p-4 md:p-6 flex flex-col gap-6">
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link
              href="/guide"
              className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
            >
              <ArrowLeft size={12} /> Back to Dashboard
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tighter flex items-center gap-3">
              OpenDoor <span className="text-orange-400">Matrix</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-1 font-mono">Open-window stats: totals, up/down rates</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group w-full md:w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-emerald-400 transition-colors"
                size={14}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH TICKER..."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`h-10 px-4 rounded-lg border flex items-center gap-2 text-xs font-bold tracking-wide transition-all ${
                showFilters || Object.keys(filters).length > 0
                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                  : "bg-zinc-900/50 border-white/10 text-zinc-400 hover:bg-white/5"
              }`}
            >
              <SlidersHorizontal size={14} />
              FILTERS
              {Object.keys(filters).length > 0 && (
                <span className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-black rounded-full text-[10px]">
                  {Object.keys(filters).length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* FILTERS */}
        {showFilters && (
          <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-5 backdrop-blur-md animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Filter size={14} className="text-emerald-500" /> Threshold Configuration
              </h3>
              <button onClick={clearFilters} className="text-[10px] text-zinc-500 hover:text-white flex items-center gap-1">
                <X size={12} />
                CLEAR ALL
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {GROUPS.map((group) => (
                <div key={group.id} className="space-y-3">
                  <div
                    className={`text-[10px] font-bold ${group.color} uppercase border-b ${group.border} border-opacity-30 pb-1 flex items-center gap-1.5`}
                  >
                    {group.icon && <group.icon size={10} />}
                    {group.label}
                  </div>
                  <div className="space-y-2">
                    {group.cols.map((col) => (
                      <FilterInput key={col} label={COL_LABELS[col]} colKey={col} filters={filters} onChange={handleFilterChange} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LOADING / ERROR */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center text-zinc-600 animate-pulse">
            <RefreshCw className="animate-spin mb-4 text-emerald-500" size={32} />
            <span className="text-sm font-mono">LOADING OPENDOOR STATS...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-3">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* TABLE */}
        {!loading && !error && (
          <div className="relative w-full rounded-xl border border-white/5 bg-zinc-950/60 shadow-2xl backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="sticky left-0 z-30 bg-black/90 border-r border-white/10 min-w-[140px]" />
                    {GROUPS.map((g) => (
                      <th
                        key={g.id}
                        colSpan={g.cols.length}
                        className={`py-2 text-center text-[10px] font-bold tracking-[0.2em] border-l border-white/5 ${g.bg} ${g.color}`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {g.icon && <g.icon size={12} strokeWidth={2.5} />}
                          {g.label}
                        </div>
                      </th>
                    ))}
                  </tr>

                  <tr className="bg-zinc-900/50 border-b border-white/5 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    <th
                      onClick={() => handleSort("ticker")}
                      className="sticky left-0 z-30 bg-zinc-900 px-4 py-3 cursor-pointer hover:text-white border-r border-white/10 group transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        TICKER
                        <span
                          className={`transition-opacity ${
                            sortKey === "ticker" ? "opacity-100 text-emerald-400" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {sortDir === "asc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                        </span>
                      </div>
                    </th>

                    {GROUPS.map((g) =>
                      g.cols.map((col, idx) => {
                        const isActive = sortKey === (col as SortKey);
                        return (
                          <th
                            key={col}
                            onClick={() => handleSort(col as SortKey)}
                            className={`
                              px-2 py-3 cursor-pointer text-right min-w-[70px] select-none hover:bg-white/5 transition-colors border-l border-white/[0.03]
                              ${isActive ? "text-emerald-400 bg-emerald-500/5" : ""}
                              ${idx === 0 ? "border-l border-white/10" : ""}
                            `}
                          >
                            <div className="flex items-center justify-end gap-1">
                              {COL_LABELS[col]}
                              {isActive && (sortDir === "asc" ? <ArrowUp size={8} /> : <ArrowDown size={8} />)}
                            </div>
                          </th>
                        );
                      })
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/[0.02]">
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={40} className="py-12 text-center text-zinc-600 font-mono text-xs">
                        NO DATA MATCHING FILTERS
                      </td>
                    </tr>
                  )}

                  {pageRows.map((row) => (
                    <tr
                      key={row.ticker}
                      onClick={() => router.push(`/stats/opendoor/${row.ticker}`)}
                      className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="sticky left-0 z-20 bg-black border-r border-white/10 group-hover:bg-zinc-900 transition-colors">
                        <div className="px-4 py-3 flex flex-col justify-center h-full">
                          <span className="text-sm font-bold text-white font-mono group-hover:text-emerald-400 transition-colors">
                            {row.ticker}
                          </span>
                        </div>
                      </td>

                      {GROUPS.map((g) =>
                        g.cols.map((col, idx) => {
                          const val = (row as any)[col] as string;
                          const isRate = col.endsWith("_rate");
                          const isTotal = col.endsWith("_total");

                          return (
                            <td
                              key={col}
                              className={`px-2 py-3 text-right text-xs font-mono border-l border-white/[0.03] ${
                                idx === 0 ? "border-l border-white/10" : ""
                              }`}
                            >
                              {isRate ? (
                                <span className={getRateColor(val)}>{fmtPct(val)}</span>
                              ) : isTotal ? (
                                <span className={numOrNaN(val) > 0 ? "text-zinc-300" : "text-zinc-700"}>
                                  {Number.isNaN(numOrNaN(val)) ? "—" : numOrNaN(val).toFixed(0)}
                                </span>
                              ) : (
                                <span className="text-zinc-300">{String(val ?? "")}</span>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* pagination */}
            <div className="border-t border-white/5 bg-zinc-900/30 px-4 py-3 flex items-center justify-between">
              <div className="text-xs text-zinc-500 font-mono">
                SHOWING{" "}
                <span className="text-white">{processedRows.length === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1}</span> -{" "}
                <span className="text-white">{Math.min(page * ROWS_PER_PAGE, processedRows.length)}</span> OF{" "}
                <span className="text-white">{processedRows.length}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg:white/10 text-zinc-400 disabled:opacity-30 transition-colors"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>

                <span className="px-3 text-xs font-mono text-zinc-300">
                  PAGE {page} / {totalPages}
                </span>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 disabled:opacity-30 transition-colors"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 10px;
          background: #09090b;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 5px;
          border: 2px solid #09090b;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </div>
  );
}
