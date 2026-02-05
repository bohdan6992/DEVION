"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import clsx from "clsx";
import { tapeClient, TapeMinuteRow } from "@/lib/tapeClient";

// --- Helpers ---
function toTickersList(s: string): string[] {
  return s
    .split(/[,\s]+/g)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

// IMPORTANT: keys are case-sensitive -> DO NOT upper-case
function toKeysList(s: string): string[] {
  return s
    .split(/[,\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Конвертація Індексу (986) у Час (16:26)
const idxToTime = (idx: number) => {
  const h = Math.floor(idx / 60).toString().padStart(2, "0");
  const m = (idx % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

// Конвертація Часу (16:26) в Індекс (986)
const timeToIdx = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const DEFAULT_COLS = [
  "Ticker",
  "MinuteNy",
  "MinuteIdx",
  "Band",
  "Bid",
  "Ask",
  "Mid",
  "Spread",
  "SpreadBps",
  "BidPct",
  "AskPct",
  "LstPrcLstClsPct",
  "LstPrcTOpenPct",
  "TOpen",
  "TCls",
  "VWAP",
  "Hi",
  "Lo",
  "ATR14",
  "Vol",
  "PreMktVolNF",
  "Adv20",
  "Adv90",
  "BenchTicker",
  "BenchBidPct",
  "BenchAskPct",
  "ZapPctS",
  "ZapPctL",
  "SigmaZapS",
  "SigmaZapL",
  "Beta",
  "Sigma",
  "MarketCapM",
  "Exchange",
  "SectorL3",
] as const;

type ViewMode = "Default" | "AllKeys" | "Custom";

// NEW: 3 data modes
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

const ReloadIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

function ControlInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
}: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
      />
    </div>
  );
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

export default function TapePage() {
  const [days, setDays] = useState<string[]>([]);
  const [dateNy, setDateNy] = useState<string>("");

  // Mode 1 (current)
  const [minuteIdx, setMinuteIdx] = useState<number>(986);
  const [tickers, setTickers] = useState<string>("");
  const [minSigmaZap, setMinSigmaZap] = useState<string>("");
  const [minZapPct, setMinZapPct] = useState<string>("");
  const [limit, setLimit] = useState<number>(0);
  const [mode, setMode] = useState<ViewMode>("Default");

  // NEW: Data mode switch
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

  // Avoid race conditions: only last request can commit results
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
        if (!rangeFrom && d.length)
          setRangeFrom(d[Math.max(0, d.length - 5)]);
        if (!rangeTo && d.length) setRangeTo(d[d.length - 1]);
      } catch (e: any) {
        setErr(e?.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear stale view on mode switch (prevents "sticking" old mode results)
  useEffect(() => {
    setRows([]);
    setCols([]);
    setErr("");
    setShowConfig(false);
  }, [dataMode]);

  // Keep availableKeys fresh for Mode2/Mode3 dropdowns
  function updateAvailableKeysFromRows(list: any[]) {
    const keysSet = new Set<string>();
    for (const r of list.slice(0, 50))
      Object.keys(r || {}).forEach((k) => keysSet.add(k));
    const allKeys = Array.from(keysSet).sort();
    if (allKeys.length > availableKeys.length) setAvailableKeys(allKeys);
  }

  // ===== Mode 1 columns builder (existing logic preserved) =====
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

  // ===== LOADERS =====
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
        try {
          got = await tapeClient.minute(dateNy, minuteIdx);
        } catch {
          got = await tapeClient.query(req);
        }
      } else {
        if (t.length) req.tickers = toTickersList(t);
        if (s1.length) req.minSigmaZap = Number(s1);
        if (s2.length) req.minZapPct = Number(s2);
        if (limit) req.limit = limit;
        got = await tapeClient.query(req);
      }

      if (mySeq !== reqSeq.current) return; // stale response
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
    if (!selectedDays.length) return;
    if (!tlist.length) return;

    const mySeq = ++reqSeq.current;
    setLoading(true);
    setErr("");
    try {
      const matrix: any[] = [];

      for (const d of selectedDays) {
        const req: any = {
          dateNy: d,
          minuteFrom: minuteIdx,
          minuteTo: minuteIdx,
          tickers: tlist,
        };

        if (minSigmaZap.trim().length) req.minSigmaZap = Number(minSigmaZap.trim());
        if (minZapPct.trim().length) req.minZapPct = Number(minZapPct.trim());
        if (limit) req.limit = limit;

        const got: TapeMinuteRow[] = await tapeClient.query(req);
        updateAvailableKeysFromRows(got as any);

        const row: any = { DateNy: d };
        for (const tk of tlist) row[tk] = undefined;

        for (const r of got) {
          const tk = String(getVal(r, "Ticker") ?? "").toUpperCase();
          if (!tk) continue;
          if (!tlist.includes(tk)) continue;
          row[tk] = getVal(r, gridKey);
        }

        matrix.push(row);

        if (mySeq !== reqSeq.current) return; // stop early if stale
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
    if (!selectedDays.length) return;
    if (!tk) return;

    const from = Math.min(minuteFrom, minuteTo);
    const to = Math.max(minuteFrom, minuteTo);

    const mySeq = ++reqSeq.current;
    setLoading(true);
    setErr("");
    try {
      const out: any[] = [];

      for (const d of selectedDays) {
        const req: any = {
          dateNy: d,
          minuteFrom: from,
          minuteTo: to,
          tickers: [tk],
        };

        const got: TapeMinuteRow[] = await tapeClient.query(req);
        updateAvailableKeysFromRows(got as any);

        for (const r of got) {
          const flat: any = {
            DateNy: d,
            Ticker: getVal(r, "Ticker"),
            MinuteNy: getVal(r, "MinuteNy"),
            MinuteIdx: getVal(r, "MinuteIdx"),
            Band: getVal(r, "Band"),
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

  // ===== reactive re-build for mode 1 custom columns only =====
  useEffect(() => {
    if (dataMode !== "MinuteSnapshot") return;
    setCols(buildColsMinute(rows as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, customSelected, dataMode]);

  // Auto-load: include EVERYTHING that affects requests
  useEffect(() => {
    if (!days.length) return;

    if (dataMode === "MinuteSnapshot") {
      if (dateNy) loadMinuteSnapshot();
    }
    if (dataMode === "DaysTickersOneKey") {
      if (rangeFrom && rangeTo) loadDaysTickersOneKey();
    }
    if (dataMode === "TickerDaysRange") {
      if (rangeFrom && rangeTo && singleTicker) loadTickerDaysRange();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataMode,
    days.length,
    dateNy,
    minuteIdx,
    rangeFrom,
    rangeTo,
    tickers,     // IMPORTANT
    singleTicker,
    minuteFrom,
    minuteTo,
    gridKey,
    rangeKeys,   // IMPORTANT
    minSigmaZap, // IMPORTANT
    minZapPct,   // IMPORTANT
    limit,       // IMPORTANT
  ]);

  // ===== Display Rows =====
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

  const header = useMemo(() => cols, [cols]);

  // ===== Scroll sync =====
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
    if (isSyncingTable.current) {
      isSyncingTable.current = false;
      return;
    }
    isSyncingTop.current = true;
    table.scrollLeft = top.scrollLeft;
  };

  const handleTableScroll = () => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    isSyncingTable.current = true;
    top.scrollLeft = table.scrollLeft;
  };

  const showColsConfig = dataMode === "MinuteSnapshot" && mode === "Custom";

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
            <h1 className="text-xl font-bold text-white">
              Tape <span className="text-emerald-500">Explorer</span>
            </h1>
            <div className="text-[10px] text-neutral-500 font-mono">
              /api/tape &bull; Inspector
            </div>
          </div>

          <div className="flex gap-2">
            {showColsConfig && (
              <button
                onClick={() => setShowConfig(!showConfig)}
                className={clsx(
                  "h-8 px-4 rounded border text-[10px] font-bold uppercase transition-all",
                  showConfig
                    ? "bg-emerald-500 text-black border-emerald-400"
                    : "bg-neutral-800 border-neutral-700 text-neutral-300"
                )}
              >
                {showConfig ? "Close Config" : "Select Columns / Filters"}
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 h-8 px-4 rounded border text-[10px] font-bold uppercase bg-emerald-950/30 border-emerald-800 text-emerald-400 hover:bg-emerald-900/50"
            >
              <ReloadIcon className={clsx("w-3 h-3", loading && "animate-spin")} />{" "}
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap gap-2 items-end">
          {/* Data Mode switch */}
          <div className="w-56">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-1.5">
              Data Mode
            </label>
            <select
              value={dataMode}
              onChange={(e: any) => setDataMode(e.target.value as DataMode)}
              className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:border-emerald-500/50 outline-none"
            >
              <option value="MinuteSnapshot">
                1) One Day • One Minute • Many Tickers • Many Params
              </option>
              <option value="DaysTickersOneKey">
                2) Many Days • Many Tickers • One Param • One Minute
              </option>
              <option value="TickerDaysRange">
                3) One Ticker • Many Days • Many Params • Minute Range
              </option>
            </select>
          </div>

          {/* Shared: minute picker (used in mode1+mode2) */}
          {(dataMode === "MinuteSnapshot" || dataMode === "DaysTickersOneKey") && (
            <>
              {/* date only in mode1 */}
              {dataMode === "MinuteSnapshot" && (
                <div className="w-32">
                  <ControlInput
                    label="Date"
                    value={dateNy}
                    onChange={(e: any) => setDateNy(e.target.value)}
                  />
                </div>
              )}

              <div className="w-24">
                <ControlInput
                  label="Time (NY)"
                  type="time"
                  value={idxToTime(minuteIdx)}
                  onChange={(e: any) => setMinuteIdx(timeToIdx(e.target.value))}
                />
              </div>

              <div className="w-20">
                <ControlInput
                  label="Min Idx"
                  type="number"
                  value={minuteIdx}
                  onChange={(e: any) => setMinuteIdx(Number(e.target.value))}
                />
              </div>
            </>
          )}

          {/* Shared day range (mode2+mode3) */}
          {(dataMode === "DaysTickersOneKey" || dataMode === "TickerDaysRange") && (
            <>
              <div className="w-32">
                <ControlInput
                  label="From"
                  value={rangeFrom}
                  onChange={(e: any) => setRangeFrom(e.target.value)}
                />
              </div>
              <div className="w-32">
                <ControlInput
                  label="To"
                  value={rangeTo}
                  onChange={(e: any) => setRangeTo(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Mode1: tickers + filters + cols mode */}
          {dataMode === "MinuteSnapshot" && (
            <>
              <div className="w-40">
                <ControlInput
                  label="Tickers"
                  placeholder="AAPL..."
                  value={tickers}
                  onChange={(e: any) => setTickers(e.target.value)}
                />
              </div>
              <div className="w-24">
                <ControlInput
                  label="Min Sigma"
                  value={minSigmaZap}
                  onChange={(e: any) => setMinSigmaZap(e.target.value)}
                />
              </div>
              <div className="w-24">
                <ControlInput
                  label="Min Zap%"
                  value={minZapPct}
                  onChange={(e: any) => setMinZapPct(e.target.value)}
                />
              </div>
              <div className="w-20">
                <ControlInput
                  label="Limit"
                  type="number"
                  value={limit}
                  onChange={(e: any) => setLimit(Number(e.target.value))}
                />
              </div>

              <div className="w-32">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-1.5">
                  Cols Mode
                </label>
                <select
                  value={mode}
                  onChange={(e: any) => setMode(e.target.value as ViewMode)}
                  className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:border-emerald-500/50 outline-none"
                >
                  <option value="Default">Standard</option>
                  <option value="AllKeys">All Keys</option>
                  <option value="Custom">Custom Selection</option>
                </select>
              </div>
            </>
          )}

          {/* Mode2: tickers + one key */}
          {dataMode === "DaysTickersOneKey" && (
            <>
              <div className="w-52">
                <ControlInput
                  label="Tickers (cols)"
                  placeholder="GOOGL META AMZN..."
                  value={tickers}
                  onChange={(e: any) => setTickers(e.target.value)}
                />
              </div>

              <div className="w-40">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-1.5">
                  Value Key
                </label>
                <select
                  value={gridKey}
                  onChange={(e: any) => setGridKey(e.target.value)}
                  className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:border-emerald-500/50 outline-none"
                >
                  {(availableKeys.length ? availableKeys : Array.from(DEFAULT_COLS)).map(
                    (k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="w-24">
                <ControlInput
                  label="Min Sigma"
                  value={minSigmaZap}
                  onChange={(e: any) => setMinSigmaZap(e.target.value)}
                />
              </div>
              <div className="w-24">
                <ControlInput
                  label="Min Zap%"
                  value={minZapPct}
                  onChange={(e: any) => setMinZapPct(e.target.value)}
                />
              </div>
              <div className="w-20">
                <ControlInput
                  label="Limit"
                  type="number"
                  value={limit}
                  onChange={(e: any) => setLimit(Number(e.target.value))}
                />
              </div>
            </>
          )}

          {/* Mode3: one ticker + minute range + keys multi */}
          {dataMode === "TickerDaysRange" && (
            <>
              <div className="w-32">
                <ControlInput
                  label="Ticker"
                  placeholder="AAPL"
                  value={singleTicker}
                  onChange={(e: any) => setSingleTicker(e.target.value)}
                />
              </div>

              <div className="w-28">
                <ControlInput
                  label="From (NY)"
                  type="time"
                  value={idxToTime(minuteFrom)}
                  onChange={(e: any) => setMinuteFrom(timeToIdx(e.target.value))}
                />
              </div>
              <div className="w-20">
                <ControlInput
                  label="Idx From"
                  type="number"
                  value={minuteFrom}
                  onChange={(e: any) => setMinuteFrom(Number(e.target.value))}
                />
              </div>

              <div className="w-28">
                <ControlInput
                  label="To (NY)"
                  type="time"
                  value={idxToTime(minuteTo)}
                  onChange={(e: any) => setMinuteTo(timeToIdx(e.target.value))}
                />
              </div>
              <div className="w-20">
                <ControlInput
                  label="Idx To"
                  type="number"
                  value={minuteTo}
                  onChange={(e: any) => setMinuteTo(Number(e.target.value))}
                />
              </div>

              <div className="w-64">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-1.5">
                  Keys (comma/space)
                </label>
                <input
                  value={rangeKeys.join(",")}
                  onChange={(e) => setRangeKeys(toKeysList(e.target.value))} // FIXED
                  placeholder="Mid, ZapPctS, SigmaZapS..."
                  className="w-full h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-sm text-neutral-200 focus:border-emerald-500/50 outline-none font-mono"
                />
              </div>
            </>
          )}
        </div>

        {/* Error line */}
        {err && <div className="mt-3 text-[11px] text-rose-400 font-mono">{err}</div>}
      </div>

      {/* CUSTOM CONFIG PANEL (Mode1 only) */}
      {showColsConfig && showConfig && (
        <div className="flex-none bg-[#0a0a0a] border-b border-emerald-900/30 p-4 max-h-[40vh] overflow-y-auto custom-scrollbar-thin shadow-2xl z-40">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {availableKeys.map((key) => {
              const isSelected = customSelected.includes(key);
              const f = filters[key] || { op: "none", v1: "", v2: "" };
              return (
                <div
                  key={key}
                  className={clsx(
                    "p-2 rounded border transition-all",
                    isSelected ? "bg-emerald-950/10 border-emerald-500/40" : "bg-neutral-900/40 border-neutral-800"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) setCustomSelected(customSelected.filter((k) => k !== key));
                        else setCustomSelected([...customSelected, key]);
                      }}
                      className="accent-emerald-500"
                    />
                    <span className="text-[11px] font-bold truncate text-neutral-300">{key}</span>
                  </div>
                  {isSelected && (
                    <div className="flex flex-col gap-1 mt-2">
                      <select
                        className="bg-black text-[9px] h-6 border border-neutral-800 rounded px-1 outline-none text-emerald-400"
                        value={f.op}
                        onChange={(e) => setFilters({ ...filters, [key]: { ...f, op: e.target.value as any } })}
                      >
                        <option value="none">No Filter</option>
                        <option value=">">{`>`}</option>
                        <option value="<">{`<`}</option>
                        <option value="range">Range</option>
                      </select>
                      {f.op !== "none" && (
                        <div className="flex gap-1">
                          <input
                            className="w-full bg-black border border-neutral-800 rounded h-6 px-1 text-[10px] font-mono"
                            placeholder={f.op === "range" ? "Min" : "Val"}
                            value={f.v1}
                            onChange={(e) => setFilters({ ...filters, [key]: { ...f, v1: e.target.value } })}
                          />
                          {f.op === "range" && (
                            <input
                              className="w-full bg-black border border-neutral-800 rounded h-6 px-1 text-[10px] font-mono"
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
        </div>
      )}

      {/* SCROLLS */}
      <div
        id="tape-explorer-top-scroll"
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="flex-none w-full overflow-x-scroll overflow-y-hidden bg-transparent border-b border-neutral-800"
        style={{ height: "12px" }}
      >
        <div style={{ width: contentWidth || "100%", height: "1px" }} />
      </div>

      {/* TABLE AREA */}
      <div className="flex-1 overflow-hidden relative bg-transparent">
        <div
          id="tape-explorer-table-scroll"
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="absolute inset-0 overflow-auto scrollbar-visible"
        >
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-20 bg-[#0a0a0a] shadow-sm shadow-white/10">
              <tr>
                {cols.map((c) => (
                  <th
                    key={c}
                    className={clsx(
                      "px-3 py-2 text-[10px] uppercase font-bold text-neutral-500 border-b border-r border-neutral-800 select-none bg-[#0a0a0a]",
                      (c === "Ticker" || c === "DateNy") &&
                        "sticky left-0 z-30 border-r-2 border-r-neutral-700 text-neutral-300"
                    )}
                  >
                    {c}{" "}
                    {filters[c]?.op !== "none" &&
                      dataMode === "MinuteSnapshot" &&
                      mode === "Custom" && <span className="ml-1 text-emerald-500 font-black">!</span>}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="font-mono text-xs">
              {displayRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={cols.length} className="p-8 text-center text-neutral-600">
                    No data found
                  </td>
                </tr>
              )}

              {displayRows.map((r: any, i: number) => (
                <tr
                  key={`${String(getVal(r, "Ticker") ?? getVal(r, "DateNy") ?? "row")}-${i}`}
                  className="hover:bg-neutral-900/50 border-b border-neutral-900/50 group"
                >
                  {cols.map((c) => {
                    const v = getVal(r, c);

                    const isColored =
                      ["Sigma", "Pct", "Spread", "LstPrc", "Zap", "Bench"].some((k) => c.includes(k)) ||
                      (dataMode !== "MinuteSnapshot" && typeof v === "number");

                    const numV = isFiniteNumber(v) ? v : 0;
                    const sticky = c === "Ticker" || c === "DateNy";

                    return (
                      <td
                        key={c}
                        className={clsx(
                          "px-3 py-1 border-r border-neutral-800/40 tabular-nums",
                          sticky &&
                            "sticky left-0 z-10 bg-black group-hover:bg-[#0d0d0d] border-r-2 border-r-neutral-800 text-white font-bold",
                          isColored && numV > 0 && "text-emerald-400",
                          isColored && numV < 0 && "text-rose-400",
                          !sticky && !isColored && "text-neutral-400"
                        )}
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
      </div>

      <div className="flex-none bg-transparent border-t border-neutral-800 px-4 py-1 text-[10px] text-neutral-600 font-mono flex justify-between items-center uppercase">
        <div className="flex gap-4">
          <span>
            Rows: {displayRows.length}{" "}
            {dataMode === "MinuteSnapshot" && displayRows.length !== rows.length && `(Filtered)`}
          </span>
          <span>Cols: {cols.length}</span>
          <span className="text-neutral-700">
            {dataMode === "MinuteSnapshot" && "Mode1"}
            {dataMode === "DaysTickersOneKey" && "Mode2"}
            {dataMode === "TickerDaysRange" && "Mode3"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Data Stream</span>
        </div>
      </div>
    </div>
  );
}
