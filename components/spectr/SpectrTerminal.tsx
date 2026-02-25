"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import clsx from "clsx";
import { tapeClient, TapeMinuteRow } from "@/lib/tapeClient";
import { 
  Activity, 
  Search, 
  Calendar, 
  Clock, 
  RefreshCw, 
  Settings2, 
  Filter, 
  Database,
  ArrowRightLeft,
  Table as TableIcon,
  Layers
} from "lucide-react";

// --- Design System Components ---

const GlassCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx(
    "relative bg-[#0a0a0a]/60 backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden",
    className
  )}>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
    {children}
  </label>
);

const GlassInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  icon: Icon
}: any) => (
  <div className="flex flex-col group">
    {label && <SectionLabel>{label}</SectionLabel>}
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full h-9 bg-zinc-900/50 border border-white/10 rounded-lg px-3 pl-9 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900/80 transition-all font-mono tabular-nums shadow-inner"
      />
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
      )}
    </div>
  </div>
);

const GlassSelect = ({ label, value, onChange, options, icon: Icon }: any) => (
  <div className="flex flex-col group">
    {label && <SectionLabel>{label}</SectionLabel>}
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full h-9 bg-zinc-900/50 border border-white/10 rounded-lg px-3 pl-9 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900/80 transition-all appearance-none cursor-pointer shadow-inner"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-300">
            {opt.label}
          </option>
        ))}
      </select>
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
      )}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  </div>
);

// --- Helpers ---
function toTickersList(s: string): string[] {
  return s.split(/[,\s]+/g).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

function toKeysList(s: string): string[] {
  return s.split(/[,\s]+/g).map((x) => x.trim()).filter(Boolean);
}

const idxToTime = (idx: number) => {
  const h = Math.floor(idx / 60).toString().padStart(2, "0");
  const m = (idx % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

const timeToIdx = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const DEFAULT_COLS = [
  "Ticker", "MinuteNy", "MinuteIdx", "Band", "Bid", "Ask", "Mid", "Spread", "SpreadBps",
  "BidPct", "AskPct", "LstPrcLstClsPct", "LstPrcTOpenPct", "TOpen", "TCls", "VWAP",
  "Hi", "Lo", "ATR14", "Vol", "PreMktVolNF", "Adv20", "Adv90", "BenchTicker",
  "BenchBidPct", "BenchAskPct", "ZapPctS", "ZapPctL", "SigmaZapS", "SigmaZapL",
  "Beta", "Sigma", "MarketCapM", "Exchange", "SectorL3",
] as const;

type ViewMode = "Default" | "AllKeys" | "Custom";
type DataMode = "MinuteSnapshot" | "DaysTickersOneKey" | "TickerDaysRange";

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

function toRangeDays(days: string[], from: string, to: string): string[] {
  if (!days.length) return [];
  const a = from || days[0];
  const b = to || days[days.length - 1];
  const ai = days.indexOf(a);
  const bi = days.indexOf(b);
  if (ai === -1 || bi === -1) return [];
  const lo = Math.min(ai, bi);
  const hi = Math.max(ai, bi);
  return days.slice(lo, hi + 1);
}

// --- Main Component ---

export  function TapePage() {
  const [days, setDays] = useState<string[]>([]);
  const [dateNy, setDateNy] = useState<string>("");

  // Mode 1 (current)
  const [minuteIdx, setMinuteIdx] = useState<number>(986);
  const [tickers, setTickers] = useState<string>("");
  const [minSigmaZap, setMinSigmaZap] = useState<string>("");
  const [minZapPct, setMinZapPct] = useState<string>("");
  const [limit, setLimit] = useState<number>(0);
  const [mode, setMode] = useState<ViewMode>("Default");

  // Data mode switch
  const [dataMode, setDataMode] = useState<DataMode>("MinuteSnapshot");

  // Mode 2 (many days, many tickers, one key, one minute)
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");
  const [gridKey, setGridKey] = useState<string>("ZapPctS");

  // Mode 3 (one ticker, many days, many params, minute range)
  const [singleTicker, setSingleTicker] = useState<string>("");
  const [minuteFrom, setMinuteFrom] = useState<number>(570); // 09:30
  const [minuteTo, setMinuteTo] = useState<number>(990); // 16:30
  const [rangeKeys, setRangeKeys] = useState<string[]>([
    "Mid",
    "ZapPctS",
    "SigmaZapS",
  ]);

  // Column picker (only Mode 1)
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [customSelected, setCustomSelected] = useState<string[]>([
    "Mid",
    "Spread",
    "Sigma",
  ]);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [showConfig, setShowConfig] = useState(false);

  // Table state (generic)
  const [rows, setRows] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const reqSeq = useRef(0);
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
        if (!rangeFrom && d.length) setRangeFrom(d[Math.max(0, d.length - 5)]);
        if (!rangeTo && d.length) setRangeTo(d[d.length - 1]);
      } catch (e: any) {
        setErr(e?.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRows([]);
    setCols([]);
    setErr("");
    setShowConfig(false);
  }, [dataMode]);

  function updateAvailableKeysFromRows(list: any[]) {
    const keysSet = new Set<string>();
    for (const r of list.slice(0, 50))
      Object.keys(r || {}).forEach((k) => keysSet.add(k));
    const allKeys = Array.from(keysSet).sort();
    if (allKeys.length > availableKeys.length) setAvailableKeys(allKeys);
  }

  function buildColsMinute(list: TapeMinuteRow[]): string[] {
    const keysSet = new Set<string>();
    for (const r of list.slice(0, 50))
      Object.keys(r || {}).forEach((k) => keysSet.add(k));
    const allKeys = Array.from(keysSet).sort();
    if (allKeys.length > availableKeys.length) setAvailableKeys(allKeys);

    const base = ["Ticker", "MinuteNy", "MinuteIdx", "Band"];
    if (mode === "Custom")
      return ["Ticker", ...customSelected.filter((k) => k !== "Ticker")];
    if (mode === "Default") {
      const presentOrdered = DEFAULT_COLS.filter((c) =>
        keysSet.has(c as string)
      ).map(String);
      if (presentOrdered.length === 0) return base;
      const basePresent = base.filter((b) => presentOrdered.includes(b));
      const rest = presentOrdered.filter((x) => !base.includes(x));
      return [...basePresent, ...rest];
    }
    const rest = allKeys.filter((c) => !base.includes(c));
    return [...base, ...rest];
  }

  function buildColsGrid(tickersList: string[]): string[] {
    const base = ["DateNy"];
    return [...base, ...tickersList];
  }

  function buildColsRange(selectedKeys: string[]): string[] {
    const base = ["DateNy", "MinuteNy", "MinuteIdx", "Band", "Ticker"];
    const uniq = Array.from(new Set(selectedKeys)).filter(Boolean);
    const rest = uniq.filter((k) => !base.includes(k));
    return [...base, ...rest];
  }

  async function loadMinuteSnapshot() {
    if (!dateNy) return;
    const mySeq = ++reqSeq.current;
    setLoading(true);
    setErr("");
    try {
      const t = tickers.trim();
      const s1 = minSigmaZap.trim();
      const s2 = minZapPct.trim();
      const hasFilters = t.length || s1.length || s2.length || (limit && limit > 0);
      let got: TapeMinuteRow[] = [];
      const req: any = { dateNy, minuteFrom: minuteIdx, minuteTo: minuteIdx };

      if (!hasFilters) {
        try { got = await tapeClient.minute(dateNy, minuteIdx); }
        catch { got = await tapeClient.query(req); }
      } else {
        if (t.length) req.tickers = toTickersList(t);
        if (s1.length) req.minSigmaZap = Number(s1);
        if (s2.length) req.minZapPct = Number(s2);
        if (limit) req.limit = limit;
        got = await tapeClient.query(req);
      }

      if (mySeq !== reqSeq.current) return;
      setRows(got);
      setCols(buildColsMinute(got));
    } catch (e: any) {
      if (mySeq !== reqSeq.current) return;
      setErr(e?.message);
      setRows([]);
      setCols([]);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }

  async function loadDaysTickersOneKey() {
    const tlist = toTickersList(tickers);
    const selectedDays = toRangeDays(days, rangeFrom, rangeTo);
    if (!selectedDays.length || !tlist.length) return;

    const mySeq = ++reqSeq.current;
    setLoading(true);
    setErr("");
    try {
      const matrix: any[] = [];
      for (const d of selectedDays) {
        const req: any = { dateNy: d, minuteFrom: minuteIdx, minuteTo: minuteIdx, tickers: tlist };
        if (minSigmaZap.trim().length) req.minSigmaZap = Number(minSigmaZap.trim());
        if (minZapPct.trim().length) req.minZapPct = Number(minZapPct.trim());
        if (limit) req.limit = limit;

        const got: TapeMinuteRow[] = await tapeClient.query(req);
        updateAvailableKeysFromRows(got as any);

        const row: any = { DateNy: d };
        for (const tk of tlist) row[tk] = undefined;
        for (const r of got) {
          const tk = String(getVal(r, "Ticker") ?? "").toUpperCase();
          if (!tk || !tlist.includes(tk)) continue;
          row[tk] = getVal(r, gridKey);
        }
        matrix.push(row);
        if (mySeq !== reqSeq.current) return;
      }
      if (mySeq !== reqSeq.current) return;
      setRows(matrix);
      setCols(buildColsGrid(tlist));
    } catch (e: any) {
      if (mySeq !== reqSeq.current) return;
      setErr(e?.message);
      setRows([]);
      setCols([]);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }

  async function loadTickerDaysRange() {
    const tk = (singleTicker || "").trim().toUpperCase();
    const selectedDays = toRangeDays(days, rangeFrom, rangeTo);
    if (!selectedDays.length || !tk) return;

    const from = Math.min(minuteFrom, minuteTo);
    const to = Math.max(minuteFrom, minuteTo);
    const mySeq = ++reqSeq.current;
    setLoading(true);
    setErr("");
    try {
      const out: any[] = [];
      for (const d of selectedDays) {
        const req: any = { dateNy: d, minuteFrom: from, minuteTo: to, tickers: [tk] };
        const got: TapeMinuteRow[] = await tapeClient.query(req);
        updateAvailableKeysFromRows(got as any);
        for (const r of got) {
          const flat: any = {
            DateNy: d, Ticker: getVal(r, "Ticker"), MinuteNy: getVal(r, "MinuteNy"),
            MinuteIdx: getVal(r, "MinuteIdx"), Band: getVal(r, "Band"),
          };
          for (const k of rangeKeys) flat[k] = getVal(r, k);
          out.push(flat);
        }
        if (mySeq !== reqSeq.current) return;
      }
      if (mySeq !== reqSeq.current) return;
      setRows(out);
      setCols(buildColsRange(rangeKeys));
    } catch (e: any) {
      if (mySeq !== reqSeq.current) return;
      setErr(e?.message);
      setRows([]);
      setCols([]);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }

  async function loadData() {
    if (dataMode === "MinuteSnapshot") return loadMinuteSnapshot();
    if (dataMode === "DaysTickersOneKey") return loadDaysTickersOneKey();
    return loadTickerDaysRange();
  }

  useEffect(() => {
    if (dataMode !== "MinuteSnapshot") return;
    setCols(buildColsMinute(rows as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, customSelected, dataMode]);

  useEffect(() => {
    if (!days.length) return;
    if (dataMode === "MinuteSnapshot" && dateNy) loadMinuteSnapshot();
    if (dataMode === "DaysTickersOneKey" && rangeFrom && rangeTo) loadDaysTickersOneKey();
    if (dataMode === "TickerDaysRange" && rangeFrom && rangeTo && singleTicker) loadTickerDaysRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataMode, days.length, dateNy, minuteIdx, rangeFrom, rangeTo, tickers,
    singleTicker, minuteFrom, minuteTo, gridKey, rangeKeys, minSigmaZap, minZapPct, limit
  ]);

  const displayRows = useMemo(() => {
    if (dataMode !== "MinuteSnapshot") return rows;
    if (mode !== "Custom") return rows;
    return (rows as any[]).filter((r) => {
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
  }, [rows, filters, mode, dataMode]);

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;
    const updateWidth = () => {
      if (tableEl.scrollWidth !== contentWidth) setContentWidth(tableEl.scrollWidth);
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

  const showColsConfig = dataMode === "MinuteSnapshot" && mode === "Custom";

  return (
    <div className="relative w-full h-screen bg-[#030303] text-zinc-200 font-sans overflow-hidden selection:bg-emerald-500/30 selection:text-white flex flex-col">
      {/* 1. Global Atmosphere */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[800px] bg-violet-500/5 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      {/* HEADER */}
      <div className="flex-none p-6 pb-2 z-10 relative">
        <div className="flex justify-between items-start gap-6 mb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 flex items-center gap-3">
              <Activity className="w-6 h-6 text-emerald-400" />
              SPECTR <span className="text-zinc-600 font-thin">|</span> <span className="text-emerald-500 font-mono tracking-wider text-lg">V.2.0</span>
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono uppercase tracking-widest pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              System Active &bull; /api/tape &bull; Inspector
            </div>
          </div>

          <div className="flex gap-3">
            {showColsConfig && (
              <button
                onClick={() => setShowConfig(!showConfig)}
                className={clsx(
                  "h-9 px-4 rounded-lg border text-[10px] font-bold uppercase transition-all flex items-center gap-2",
                  showConfig
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : "bg-zinc-900/50 border-white/10 text-zinc-400 hover:text-white hover:border-white/20"
                )}
              >
                <Settings2 className="w-3.5 h-3.5" />
                {showConfig ? "Close Config" : "Columns & Filters"}
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="group relative h-9 px-5 rounded-lg border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-500/40 transition-all text-[10px] font-bold uppercase tracking-widest overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
                {loading ? "SYNCING..." : "RELOAD DATA"}
              </span>
              {loading && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-emerald-500 animate-[loading_1s_ease-in-out_infinite] w-full" />
              )}
            </button>
          </div>
        </div>

        {/* CONTROLS CARD */}
        <GlassCard className="p-5 mb-2">
          <div className="flex flex-wrap gap-4 items-end">
            
            {/* Primary Mode Selector */}
            <div className="w-64">
              <GlassSelect
                label="Analysis Mode"
                value={dataMode}
                onChange={(e: any) => setDataMode(e.target.value as DataMode)}
                icon={Layers}
                options={[
                  { value: "MinuteSnapshot", label: "Minute Snapshot (Multi-Param)" },
                  { value: "DaysTickersOneKey", label: "Tickers Matrix (Multi-Day)" },
                  { value: "TickerDaysRange", label: "Single Ticker (Time Range)" },
                ]}
              />
            </div>

            <div className="w-[1px] h-10 bg-white/5 mx-2" />

            {/* Dynamic Controls based on Mode */}
            
            {/* 1. Time & Date Controls */}
            {(dataMode === "MinuteSnapshot" || dataMode === "DaysTickersOneKey") && (
              <>
                {dataMode === "MinuteSnapshot" && (
                  <div className="w-36">
                    <GlassInput label="Date" value={dateNy} onChange={(e: any) => setDateNy(e.target.value)} icon={Calendar} />
                  </div>
                )}
                <div className="w-28">
                  <GlassInput
                    label="Time (NY)"
                    type="time"
                    value={idxToTime(minuteIdx)}
                    onChange={(e: any) => setMinuteIdx(timeToIdx(e.target.value))}
                    icon={Clock}
                  />
                </div>
                <div className="w-20">
                  <GlassInput label="Index" type="number" value={minuteIdx} onChange={(e: any) => setMinuteIdx(Number(e.target.value))} placeholder="Idx" />
                </div>
              </>
            )}

            {/* Range Controls */}
            {(dataMode === "DaysTickersOneKey" || dataMode === "TickerDaysRange") && (
              <>
                <div className="w-32">
                  <GlassInput label="From Date" value={rangeFrom} onChange={(e: any) => setRangeFrom(e.target.value)} placeholder="YYYY-MM-DD" icon={Calendar} />
                </div>
                <div className="w-32">
                  <GlassInput label="To Date" value={rangeTo} onChange={(e: any) => setRangeTo(e.target.value)} placeholder="YYYY-MM-DD" icon={Calendar} />
                </div>
              </>
            )}

            <div className="w-[1px] h-10 bg-white/5 mx-2" />

            {/* 2. Filter & Entity Controls */}
            
            {dataMode === "MinuteSnapshot" && (
              <>
                <div className="w-48">
                  <GlassInput label="Tickers" placeholder="AAPL, MSFT, TSLA..." value={tickers} onChange={(e: any) => setTickers(e.target.value)} icon={Search} />
                </div>
                <div className="w-24">
                  <GlassInput label="Min σ" value={minSigmaZap} onChange={(e: any) => setMinSigmaZap(e.target.value)} placeholder="0.0" />
                </div>
                <div className="w-24">
                  <GlassInput label="Min Zap%" value={minZapPct} onChange={(e: any) => setMinZapPct(e.target.value)} placeholder="0" />
                </div>
                <div className="w-20">
                  <GlassInput label="Limit" type="number" value={limit} onChange={(e: any) => setLimit(Number(e.target.value))} placeholder="All" />
                </div>
                <div className="w-40">
                  <GlassSelect
                    label="View Layout"
                    value={mode}
                    onChange={(e: any) => setMode(e.target.value as ViewMode)}
                    icon={TableIcon}
                    options={[
                      { value: "Default", label: "Standard Columns" },
                      { value: "AllKeys", label: "All Available Keys" },
                      { value: "Custom", label: "Custom Filtered" },
                    ]}
                  />
                </div>
              </>
            )}

            {dataMode === "DaysTickersOneKey" && (
              <>
                <div className="w-56">
                  <GlassInput label="Tickers (Columns)" placeholder="GOOGL META AMZN..." value={tickers} onChange={(e: any) => setTickers(e.target.value)} icon={Search} />
                </div>
                <div className="w-48">
                  <GlassSelect
                    label="Value Metric"
                    value={gridKey}
                    onChange={(e: any) => setGridKey(e.target.value)}
                    icon={Database}
                    options={(availableKeys.length ? availableKeys : Array.from(DEFAULT_COLS)).map(k => ({ value: k, label: k }))}
                  />
                </div>
                {/* Extra filters */}
                <div className="w-20">
                   <GlassInput label="Min σ" value={minSigmaZap} onChange={(e: any) => setMinSigmaZap(e.target.value)} placeholder="0.0" />
                </div>
              </>
            )}

            {dataMode === "TickerDaysRange" && (
              <>
                <div className="w-32">
                  <GlassInput label="Ticker" placeholder="AAPL" value={singleTicker} onChange={(e: any) => setSingleTicker(e.target.value)} icon={Activity} />
                </div>
                <div className="w-24">
                  <GlassInput label="Start Time" type="time" value={idxToTime(minuteFrom)} onChange={(e: any) => setMinuteFrom(timeToIdx(e.target.value))} />
                </div>
                <div className="w-24">
                  <GlassInput label="End Time" type="time" value={idxToTime(minuteTo)} onChange={(e: any) => setMinuteTo(timeToIdx(e.target.value))} />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <GlassInput label="Metrics (comma separated)" value={rangeKeys.join(", ")} onChange={(e: any) => setRangeKeys(toKeysList(e.target.value))} placeholder="Mid, ZapPctS..." icon={Database} />
                </div>
              </>
            )}
          </div>
          
          {err && (
             <div className="mt-3 p-2 bg-rose-950/20 border border-rose-500/20 rounded text-rose-400 text-[10px] font-mono flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
               Error: {err}
             </div>
          )}
        </GlassCard>
      </div>

      {/* CONFIG PANEL OVERLAY */}
      {showColsConfig && showConfig && (
        <div className="absolute top-[280px] left-6 right-6 z-40">
           <GlassCard className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar shadow-2xl bg-[#0a0a0a]/95 backdrop-blur-xl border-emerald-500/20">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" /> Configure Columns & Filters
                 </h3>
                 <button onClick={() => setShowConfig(false)} className="text-[10px] text-zinc-500 hover:text-white uppercase">Close</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {availableKeys.map((key) => {
                  const isSelected = customSelected.includes(key);
                  const f = filters[key] || { op: "none", v1: "", v2: "" };
                  return (
                    <div
                      key={key}
                      className={clsx(
                        "p-3 rounded-lg border transition-all duration-200",
                        isSelected 
                          ? "bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_15px_-5px_rgba(16,185,129,0.1)]" 
                          : "bg-zinc-900/30 border-white/5 hover:bg-zinc-900/50 hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        <div 
                          onClick={() => {
                            if (isSelected) setCustomSelected(customSelected.filter((k) => k !== key));
                            else setCustomSelected([...customSelected, key]);
                          }}
                          className={clsx(
                             "w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors",
                             isSelected ? "bg-emerald-500 border-emerald-400" : "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
                          )}
                        >
                           {isSelected && <div className="w-2 h-2 bg-black rounded-sm" />}
                        </div>
                        <span className={clsx("text-[11px] font-mono font-bold truncate", isSelected ? "text-emerald-100" : "text-zinc-500")}>{key}</span>
                      </div>
                      
                      {isSelected && (
                        <div className="space-y-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <select
                            className="w-full bg-[#050505] text-[10px] h-6 border border-zinc-800 rounded px-1 outline-none text-emerald-400 focus:border-emerald-500/50"
                            value={f.op}
                            onChange={(e) => setFilters({ ...filters, [key]: { ...f, op: e.target.value as any } })}
                          >
                            <option value="none">No Filter</option>
                            <option value=">">Greater (&gt;)</option>
                            <option value="<">Less (&lt;)</option>
                            <option value="range">Range</option>
                          </select>
                          {f.op !== "none" && (
                            <div className="flex gap-1">
                              <input
                                className="w-full bg-[#050505] border border-zinc-800 rounded h-6 px-1.5 text-[10px] font-mono text-zinc-200 focus:border-emerald-500/50 outline-none"
                                placeholder={f.op === "range" ? "Min" : "Val"}
                                value={f.v1}
                                onChange={(e) => setFilters({ ...filters, [key]: { ...f, v1: e.target.value } })}
                              />
                              {f.op === "range" && (
                                <input
                                  className="w-full bg-[#050505] border border-zinc-800 rounded h-6 px-1.5 text-[10px] font-mono text-zinc-200 focus:border-emerald-500/50 outline-none"
                                  placeholder="Max"
                                  value={f.v2}
                                  onChange={(e) => setFilters({ ...filters, [key]: { ...f, v2: e.target.value } })}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
           </GlassCard>
        </div>
      )}

      {/* TABLE AREA */}
      <div className="flex-1 overflow-hidden relative flex flex-col mx-6 mb-4">
        {/* Top Scroll Sync */}
        <div
          id="tape-explorer-top-scroll"
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="flex-none w-full overflow-x-scroll overflow-y-hidden bg-transparent z-20 mb-1 custom-scrollbar-thin"
          style={{ height: "10px" }}
        >
          <div style={{ width: contentWidth || "100%", height: "1px" }} />
        </div>

        {/* Main Table Container */}
        <GlassCard className="flex-1 relative border-0 rounded-t-lg rounded-b-none bg-[#0a0a0a]/40">
           <div
            id="tape-explorer-table-scroll"
            ref={tableScrollRef}
            onScroll={handleTableScroll}
            className="absolute inset-0 overflow-auto custom-scrollbar"
          >
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead className="sticky top-0 z-30">
                <tr>
                  {cols.map((c, idx) => {
                     const isSticky = c === "Ticker" || c === "DateNy";
                     const isFilterActive = filters[c]?.op !== "none" && dataMode === "MinuteSnapshot" && mode === "Custom";
                     
                     return (
                      <th
                        key={c}
                        className={clsx(
                          "px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-zinc-500 border-b border-white/[0.08] select-none backdrop-blur-md",
                          isSticky 
                            ? "sticky left-0 z-40 bg-[#080808] border-r border-white/10 text-zinc-300 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]" 
                            : "bg-[#0a0a0a]/90",
                          "transition-colors hover:text-white hover:bg-white/[0.02]"
                        )}
                        style={isSticky && idx === 1 ? { left: '80px' } : {}} 
                      >
                        <div className="flex items-center gap-1">
                          {c}
                          {isFilterActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="font-mono text-[11px]">
                {displayRows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={cols.length} className="p-20 text-center">
                       <div className="flex flex-col items-center gap-4 text-zinc-600">
                          <Database className="w-12 h-12 opacity-20" />
                          <p className="uppercase tracking-widest text-xs">No Data Found</p>
                       </div>
                    </td>
                  </tr>
                )}

                {displayRows.map((r: any, i: number) => (
                  <tr
                    key={`${String(getVal(r, "Ticker") ?? getVal(r, "DateNy") ?? "row")}-${i}`}
                    className="group transition-colors hover:bg-white/[0.02]"
                  >
                    {cols.map((c, idx) => {
                      const v = getVal(r, c);
                      const isSticky = c === "Ticker" || c === "DateNy";
                      
                      // Semantic Color Logic
                      const isPositiveKey = ["BidPct", "AskPct", "ZapPct", "LstPrc"].some(k => c.includes(k));
                      const isNegativeKey = ["Spread", "Sigma"].some(k => c.includes(k));
                      
                      const numV = isFiniteNumber(v) ? v : 0;
                      let colorClass = "text-zinc-400";
                      
                      if (isFiniteNumber(v)) {
                         if (numV > 0 && isPositiveKey) colorClass = "text-emerald-400 font-bold text-shadow-sm";
                         else if (numV < 0) colorClass = "text-rose-400 font-bold text-shadow-sm";
                         else if (c.includes("Sigma")) colorClass = numV > 2 ? "text-violet-400 font-bold" : "text-zinc-400";
                         else if (numV > 0 && !isNegativeKey) colorClass = "text-emerald-400/80";
                         else colorClass = "text-zinc-300";
                      }
                      
                      if (isSticky) colorClass = "text-white font-bold";

                      return (
                        <td
                          key={c}
                          className={clsx(
                            "px-4 py-1.5 border-b border-white/[0.02] tabular-nums",
                            isSticky &&
                              "sticky left-0 z-20 bg-[#080808] border-r border-white/10 group-hover:bg-[#0e0e0e]",
                            colorClass
                          )}
                          style={isSticky && idx === 1 ? { left: '80px' } : {}} 
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* FOOTER */}
      <div className="flex-none bg-[#050505] border-t border-white/10 px-6 py-2 text-[10px] text-zinc-500 font-mono flex justify-between items-center uppercase tracking-wider z-20">
        <div className="flex gap-6">
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="w-3 h-3 text-zinc-600" />
            Rows: <span className="text-white">{displayRows.length}</span>
            {dataMode === "MinuteSnapshot" && displayRows.length !== rows.length && <span className="text-emerald-500">(Filtered from {rows.length})</span>}
          </span>
          <span className="flex items-center gap-2">
            <TableIcon className="w-3 h-3 text-zinc-600" />
            Cols: <span className="text-white">{cols.length}</span>
          </span>
          <span className="text-zinc-600 border-l border-zinc-800 pl-4">
             Mode: <span className="text-zinc-300">{dataMode}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
             {[1,2,3].map(i => <div key={i} className="w-0.5 h-2 bg-emerald-500/20" />)}
          </div>
          <span>Tape Stream: <span className="text-emerald-500">Connected</span></span>
        </div>
      </div>

      {/* Custom Styles for Scrollbars */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
          background: #050505;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #27272a;
          border: 2px solid #050505;
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #3f3f46;
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
          height: 4px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: #10b981;
          border-radius: 4px;
        }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}