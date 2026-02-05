"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import clsx from "clsx";
import { tapeClient, TapeMinuteRow } from "@/lib/tapeClient";

// --- Helpers ---
function toTickersList(s: string): string[] {
  return s.split(/[,\s]+/g).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

// Конвертація Індексу (986) у Час (16:26)
const idxToTime = (idx: number) => {
  const h = Math.floor(idx / 60).toString().padStart(2, '0');
  const m = (idx % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

// Конвертація Часу (16:26) в Індекс (986)
const timeToIdx = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const DEFAULT_COLS = [
  "Ticker", "MinuteNy", "MinuteIdx", "Band", "Bid", "Ask", "Mid", "Spread",
  "SpreadBps", "BidPct", "AskPct", "LstPrcLstClsPct", "LstPrcTOpenPct",
  "TOpen", "TCls", "VWAP", "Hi", "Lo", "ATR14", "Vol", "PreMktVolNF",
  "Adv20", "Adv90", "BenchTicker", "BenchBidPct", "BenchAskPct",
  "ZapPctS", "ZapPctL", "SigmaZapS", "SigmaZapL", "Beta", "Sigma",
  "MarketCapM", "Exchange", "SectorL3",
] as const;

type ViewMode = "Default" | "AllKeys" | "Custom";

interface ColumnFilter {
  op: "none" | ">" | "<" | "range";
  v1: string;
  v2: string;
}

function getVal(row: any, key: string) {
  if (!row) return undefined;
  if (key in row) return row[key];
  const camel = key.charAt(0).toLowerCase() + key.slice(1);
  if (camel in row) return row[camel];
  const lower = key.toLowerCase();
  if (lower in row) return row[lower];
  return undefined;
}

function fmt(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(0);
    if (abs >= 100) return v.toFixed(2);
    if (abs >= 10) return v.toFixed(3);
    return v.toFixed(4);
  }
  if (typeof v === "boolean") return v ? "YES" : "NO";
  const s = String(v);
  return s.length ? s : "—";
}

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const ReloadIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

function ControlInput({ label, value, onChange, placeholder, type = "text", min, max }: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{label}</label>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} max={max}
        className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
      />
    </div>
  );
}

export default function TapePage() {
  const [days, setDays] = useState<string[]>([]);
  const [dateNy, setDateNy] = useState<string>("");
  const [minuteIdx, setMinuteIdx] = useState<number>(986);
  const [tickers, setTickers] = useState<string>("");
  const [minSigmaZap, setMinSigmaZap] = useState<string>("");
  const [minZapPct, setMinZapPct] = useState<string>("");
  const [limit, setLimit] = useState<number>(0);
  const [mode, setMode] = useState<ViewMode>("Default");

  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [customSelected, setCustomSelected] = useState<string[]>(["Mid", "Spread", "Sigma"]);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [showConfig, setShowConfig] = useState(false);

  const [rows, setRows] = useState<TapeMinuteRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const isSyncingTop = useRef(false);
  const isSyncingTable = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await tapeClient.availableDays();
        setDays(d);
        if (!dateNy && d.length) setDateNy(d[d.length - 1]);
      } catch (e: any) { setErr(e?.message); }
    })();
  }, []);

  function buildCols(list: TapeMinuteRow[]): string[] {
    const keysSet = new Set<string>();
    for (const r of list.slice(0, 50)) Object.keys(r || {}).forEach((k) => keysSet.add(k));
    const allKeys = Array.from(keysSet).sort();
    if (allKeys.length > availableKeys.length) setAvailableKeys(allKeys);

    const base = ["Ticker", "MinuteNy", "MinuteIdx", "Band"];
    if (mode === "Custom") return ["Ticker", ...customSelected.filter(k => k !== "Ticker")];
    if (mode === "Default") {
      const presentOrdered = DEFAULT_COLS.filter((c) => keysSet.has(c as string)).map(String);
      if (presentOrdered.length === 0) return base;
      const basePresent = base.filter((b) => presentOrdered.includes(b));
      const rest = presentOrdered.filter((x) => !base.includes(x));
      return [...basePresent, ...rest];
    }
    const rest = allKeys.filter((c) => !base.includes(c));
    return [...base, ...rest];
  }

  async function loadMinute() {
    if (!dateNy) return;
    setLoading(true); setErr("");
    try {
      const t = tickers.trim();
      const s1 = minSigmaZap.trim();
      const s2 = minZapPct.trim();
      const hasFilters = t.length || s1.length || s2.length || (limit && limit > 0);
      let got: TapeMinuteRow[] = [];
      const req: any = { dateNy, minuteFrom: minuteIdx, minuteTo: minuteIdx };

      if (!hasFilters) {
        try { got = await tapeClient.minute(dateNy, minuteIdx); } catch { got = await tapeClient.query(req); }
      } else {
        if (t.length) req.tickers = toTickersList(t);
        if (s1.length) req.minSigmaZap = Number(s1);
        if (s2.length) req.minZapPct = Number(s2);
        if (limit) req.limit = limit;
        got = await tapeClient.query(req);
      }
      setRows(got); 
      setCols(buildCols(got));
    } catch (e: any) { setErr(e?.message); setRows([]); setCols([]); } 
    finally { setLoading(false); }
  }

  useEffect(() => { setCols(buildCols(rows)); }, [mode, customSelected]);
  useEffect(() => { if (dateNy) loadMinute(); }, [dateNy, minuteIdx]);

  const displayRows = useMemo(() => {
    if (mode !== "Custom") return rows;
    return rows.filter(r => {
        return Object.entries(filters).every(([col, f]) => {
            if (f.op === "none") return true;
            const val = getVal(r, col);
            if (!isFiniteNumber(val)) return true;
            const v1 = parseFloat(f.v1);
            const v2 = parseFloat(f.v2);
            if (f.op === ">") return val > v1;
            if (f.op === "<") return val < v1;
            if (f.op === "range") return val >= v1 && val <= v2;
            return true;
        });
    });
  }, [rows, filters, mode]);

  const header = useMemo(() => cols, [cols]);

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;
    const updateWidth = () => {
        if(tableEl.scrollWidth !== contentWidth) setContentWidth(tableEl.scrollWidth);
    };
    const observer = new ResizeObserver(updateWidth);
    if (tableEl.firstElementChild) observer.observe(tableEl.firstElementChild);
    updateWidth();
    return () => observer.disconnect();
  }, [displayRows, cols, loading, contentWidth]);

  const handleTopScroll = () => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;
    if (isSyncingTable.current) { isSyncingTable.current = false; return; }
    isSyncingTop.current = true;
    table.scrollLeft = top.scrollLeft;
  };

  const handleTableScroll = () => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;
    if (isSyncingTop.current) { isSyncingTop.current = false; return; }
    isSyncingTable.current = true;
    top.scrollLeft = table.scrollLeft;
  };

  return (
    <div className="flex flex-col h-screen bg-transparent text-neutral-200 font-sans overflow-hidden">
      
      <style jsx global>{`
        #tape-explorer-top-scroll::-webkit-scrollbar,
        #tape-explorer-table-scroll::-webkit-scrollbar {
            display: block !important;
            height: 12px !important;
            width: 12px !important;
            background: #050505 !important;
        }
        #tape-explorer-top-scroll::-webkit-scrollbar-thumb,
        #tape-explorer-table-scroll::-webkit-scrollbar-thumb {
            background-color: #10b981 !important;
            border-radius: 6px !important;
            border: 3px solid #050505 !important;
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
            width: 6px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
            background: #222;
            border-radius: 10px;
        }
      `}</style>

      {/* HEADER */}
      <div className="flex-none p-4 border-b border-neutral-800 bg-transparent z-50">
        <div className="flex justify-between items-end gap-4 mb-4">
          <div>
             <h1 className="text-xl font-bold text-white">Tape <span className="text-emerald-500">Explorer</span></h1>
             <div className="text-[10px] text-neutral-500 font-mono">/api/tape &bull; Inspector</div>
          </div>
          <div className="flex gap-2">
            {mode === "Custom" && (
                <button 
                    onClick={() => setShowConfig(!showConfig)}
                    className={clsx(
                        "h-8 px-4 rounded border text-[10px] font-bold uppercase transition-all",
                        showConfig ? "bg-emerald-500 text-black border-emerald-400" : "bg-neutral-800 border-neutral-700 text-neutral-300"
                    )}
                >
                    {showConfig ? "Close Config" : "Select Columns / Filters"}
                </button>
            )}
            <button onClick={loadMinute} disabled={loading} className="flex items-center gap-2 h-8 px-4 rounded border text-[10px] font-bold uppercase bg-emerald-950/30 border-emerald-800 text-emerald-400 hover:bg-emerald-900/50">
                <ReloadIcon className={clsx("w-3 h-3", loading && "animate-spin")} /> {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
            <div className="w-32"><ControlInput label="Date" value={dateNy} onChange={(e:any) => setDateNy(e.target.value)} /></div>
            
            {/* TIME INPUT */}
            <div className="w-24">
                <ControlInput 
                    label="Time (NY)" 
                    type="time" 
                    value={idxToTime(minuteIdx)} 
                    onChange={(e:any) => setMinuteIdx(timeToIdx(e.target.value))} 
                />
            </div>

            <div className="w-20"><ControlInput label="Min Idx" type="number" value={minuteIdx} onChange={(e:any) => setMinuteIdx(Number(e.target.value))} /></div>
            <div className="w-40"><ControlInput label="Tickers" placeholder="AAPL..." value={tickers} onChange={(e:any) => setTickers(e.target.value)} /></div>
            <div className="w-24"><ControlInput label="Min Sigma" value={minSigmaZap} onChange={(e:any) => setMinSigmaZap(e.target.value)} /></div>
            <div className="w-24"><ControlInput label="Min Zap%" value={minZapPct} onChange={(e:any) => setMinZapPct(e.target.value)} /></div>
            <div className="w-20"><ControlInput label="Limit" type="number" value={limit} onChange={(e:any) => setLimit(Number(e.target.value))} /></div>
            <div className="w-32">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-1.5">Cols Mode</label>
                <select value={mode} onChange={(e:any) => setMode(e.target.value as ViewMode)} className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:border-emerald-500/50 outline-none">
                    <option value="Default">Standard</option>
                    <option value="AllKeys">All Keys</option>
                    <option value="Custom">Custom Selection</option>
                </select>
            </div>
        </div>
      </div>

      {/* --- CUSTOM CONFIG PANEL --- */}
      {mode === "Custom" && showConfig && (
        <div className="flex-none bg-[#0a0a0a] border-b border-emerald-900/30 p-4 max-h-[40vh] overflow-y-auto custom-scrollbar-thin shadow-2xl z-40">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {availableKeys.map(key => {
                    const isSelected = customSelected.includes(key);
                    const f = filters[key] || { op: "none", v1: "", v2: "" };
                    return (
                        <div key={key} className={clsx(
                            "p-2 rounded border transition-all",
                            isSelected ? "bg-emerald-950/10 border-emerald-500/40" : "bg-neutral-900/40 border-neutral-800"
                        )}>
                            <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" checked={isSelected} onChange={(e) => {
                                    if (isSelected) setCustomSelected(customSelected.filter(k => k !== key));
                                    else setCustomSelected([...customSelected, key]);
                                }} className="accent-emerald-500" />
                                <span className="text-[11px] font-bold truncate text-neutral-300">{key}</span>
                            </div>
                            {isSelected && (
                                <div className="flex flex-col gap-1 mt-2">
                                    <select className="bg-black text-[9px] h-6 border border-neutral-800 rounded px-1 outline-none text-emerald-400" value={f.op} onChange={(e) => setFilters({...filters, [key]: {...f, op: e.target.value as any}})}>
                                        <option value="none">No Filter</option>
                                        <option value=">">{`>`}</option>
                                        <option value="<">{`<`}</option>
                                        <option value="range">Range</option>
                                    </select>
                                    {f.op !== "none" && (
                                        <div className="flex gap-1">
                                            <input className="w-full bg-black border border-neutral-800 rounded h-6 px-1 text-[10px] font-mono" placeholder={f.op === "range" ? "Min" : "Val"} value={f.v1} onChange={(e) => setFilters({...filters, [key]: {...f, v1: e.target.value}})} />
                                            {f.op === "range" && <input className="w-full bg-black border border-neutral-800 rounded h-6 px-1 text-[10px] font-mono" placeholder="Max" value={f.v2} onChange={(e) => setFilters({...filters, [key]: {...f, v2: e.target.value}})} />}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      )}

      {/* --- SCROLLS --- */}
      <div id="tape-explorer-top-scroll" ref={topScrollRef} onScroll={handleTopScroll} className="flex-none w-full overflow-x-scroll overflow-y-hidden bg-transparent border-b border-neutral-800" style={{ height: '12px' }}>
        <div style={{ width: contentWidth || '100%', height: '1px' }} />
      </div>

      {/* --- TABLE AREA --- */}
      <div className="flex-1 overflow-hidden relative bg-transparent">
        <div id="tape-explorer-table-scroll" ref={tableScrollRef} onScroll={handleTableScroll} className="absolute inset-0 overflow-auto scrollbar-visible">
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-20 bg-[#0a0a0a] shadow-sm shadow-white/10">
              <tr>
                {header.map((c) => (
                  <th key={c} className={clsx("px-3 py-2 text-[10px] uppercase font-bold text-neutral-500 border-b border-r border-neutral-800 select-none bg-[#0a0a0a]", c === "Ticker" && "sticky left-0 z-30 border-r-2 border-r-neutral-700 text-neutral-300")}>
                    {c} {filters[c]?.op !== "none" && mode === "Custom" && <span className="ml-1 text-emerald-500 font-black">!</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {displayRows.length === 0 && !loading && <tr><td colSpan={header.length} className="p-8 text-center text-neutral-600">No data found</td></tr>}
              {displayRows.map((r, i) => (
                <tr key={`${(r as any)?.Ticker}-${i}`} className="hover:bg-neutral-900/50 border-b border-neutral-900/50 group">
                    {header.map((c) => {
                      const v = getVal(r, c);
                      const isColored = ["Sigma", "Pct", "Spread", "LstPrc"].some(k => c.includes(k));
                      const numV = isFiniteNumber(v) ? v : 0;
                      return (
                        <td key={c} className={clsx("px-3 py-1 border-r border-neutral-800/40 tabular-nums", c === "Ticker" && "sticky left-0 z-10 bg-black group-hover:bg-[#0d0d0d] border-r-2 border-r-neutral-800 text-white font-bold", isColored && numV > 0 && "text-emerald-400", isColored && numV < 0 && "text-rose-400", !isColored && c !== "Ticker" && "text-neutral-400")}>
                          {fmt(v)}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex-none bg-transparent border-t border-neutral-800 px-4 py-1 text-[10px] text-neutral-600 font-mono flex justify-between items-center uppercase">
        <div className="flex gap-4">
            <span>Rows: {displayRows.length} {displayRows.length !== rows.length && `(Filtered)`}</span>
            <span>Cols: {header.length}</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Data Stream</span>
        </div>
      </div>
    </div>
  );
}