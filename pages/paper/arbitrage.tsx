"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { todayNyYmd } from "../../lib/time";
import { getToken } from "../../lib/authClient";
import clsx from "clsx";

// --- TYPES (Unchanged) ---
type TabKey = "active" | "closed";
type TapeArbSide = "Long" | "Short" | number | string;

type TapeArbSnapshot = {
  ok: boolean;
  dateNy: string;
  lastMinuteIdx: number;
  activeCount: number;
  closedCount: number;
  updatedUtc: string;
};

type TapeArbActive = {
  status: "Active";
  dateNy: string;
  minuteIdx: number;
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;
  startDev: number;
  startMinuteIdx: number;
  peakDevAbs: number;
  peakDev: number;
  peakMinuteIdx: number;
  lastDev: number;
  rating?: number | null;
  total?: number | null;
  tierBp?: number | null;
  beta?: number | null;
  hedgeNotional?: number | null;
  stockEntryPct?: number | null;
  benchEntryPct?: number | null;
};

type TapeArbClosed = {
  status: "Closed";
  dateNy: string;
  ticker: string;
  benchTicker: string;
  side: TapeArbSide;
  startMinuteIdx: number;
  peakMinuteIdx: number;
  endMinuteIdx: number;
  startDev: number;
  peakDev: number;
  endDev: number;
  rating?: number | null;
  total?: number | null;
  tierBp?: number | null;
  beta?: number | null;
  hedgeNotional?: number | null;
  stockEntryPct?: number | null;
  stockExitPct?: number | null;
  benchEntryPct?: number | null;
  benchExitPct?: number | null;
  stockPnlUsd?: number | null;
  hedgePnlUsd?: number | null;
  totalPnlUsd?: number | null;
};

// --- UTILS (Unchanged) ---

function isNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined) return "—";
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

function intn(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  if (!Number.isFinite(x)) return "—";
  return String(Math.trunc(x));
}

function clampNumber(x: any, def = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : def;
}

function normalizeSide(side: TapeArbSide): { label: "Long" | "Short" | string; isLong: boolean | null } {
  if (side === 0) return { label: "Long", isLong: true };
  if (side === 1) return { label: "Short", isLong: false };
  const s = String(side ?? "").trim();
  const low = s.toLowerCase();
  if (low.includes("long")) return { label: "Long", isLong: true };
  if (low.includes("short")) return { label: "Short", isLong: false };
  return { label: s.length ? s : "—", isLong: null };
}

async function apiGet<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

// --- DESIGN SYSTEM COMPONENTS ---

function NebulaBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 bg-black">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015]" />
      <div
        className="absolute inset-x-0 bottom-0 h-[55vh]"
        style={{
          backgroundImage:
            "radial-gradient(70% 55% at 50% 100%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.05) 28%, rgba(0,0,0,0) 70%)",
          maskImage: "linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))",
        }}
      />
    </div>
  );
}

function GlassCard({ children, className, glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div
      className={clsx(
        "bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-xl transition-all duration-300",
        glow && "shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)] border-white/[0.1]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ADDED MISSING COMPONENT
function GlassInput({
  value,
  onChange,
  placeholder,
  type = "text",
  width,
  className,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  width?: number | string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width }}
      className={clsx(
        "bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900/80 transition-all font-mono",
        className
      )}
    />
  );
}

// ADDED MISSING COMPONENT
function GlassSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={clsx(
          "appearance-none bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-xs text-white focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900/80 transition-all font-mono cursor-pointer",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-zinc-400">
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1L5 5L9 1" />
        </svg>
      </div>
    </div>
  );
}

type Range = { min?: number; max?: number };

// The "MinMax" component
const MinMax = React.memo(function MinMax({
  label,
  value,
  setValue,
  width = "w-full",
}: {
  label: string;
  value: Range;
  setValue: (r: Range) => void;
  width?: string;
}) {
  const setMin = (v: string) => setValue({ ...value, min: v === "" ? undefined : clampNumber(v) });
  const setMax = (v: string) => setValue({ ...value, max: v === "" ? undefined : clampNumber(v) });

  const hasVal = value.min !== undefined || value.max !== undefined;

  return (
    <div
      className={clsx(
        "group flex flex-col gap-1 p-2 rounded-xl border transition-all",
        hasVal ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10",
        width
      )}
    >
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono truncate mr-1">{label}</span>
        {hasVal && (
          <button
            type="button"
            onClick={() => setValue({})}
            className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
          >
            CLR
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="w-full bg-black/20 border border-white/5 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 tabular-nums text-center focus:outline-none focus:border-emerald-500/30 transition-colors"
          value={value.min ?? ""}
          placeholder="min"
          type="number"
          onChange={(e) => setMin(e.target.value)}
        />
        <input
          className="w-full bg-black/20 border border-white/5 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 tabular-nums text-center focus:outline-none focus:border-emerald-500/30 transition-colors"
          value={value.max ?? ""}
          placeholder="max"
          type="number"
          onChange={(e) => setMax(e.target.value)}
        />
      </div>
    </div>
  );
});

function inRange(x: number, r: Range) {
  if (!Number.isFinite(x)) return false;
  if (isNum(r.min) && x < r.min!) return false;
  if (isNum(r.max) && x > r.max!) return false;
  return true;
}

function SideBadge({ side }: { side: TapeArbSide }) {
  const s = normalizeSide(side);
  const isLong = s.isLong === true;
  const isShort = s.isLong === false;
  const colorClass = isLong
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : isShort
    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
    : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50";

  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap",
        colorClass
      )}
    >
      {s.label}
    </span>
  );
}

// --- DETAILS PANEL ---

function DetailsPanel({
  tab,
  item,
  onClose,
}: {
  tab: TabKey;
  item: TapeArbActive | TapeArbClosed | null;
  onClose: () => void;
}) {
  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center border border-white/5 bg-white/[0.01] rounded-2xl">
         <div className="w-12 h-12 rounded-full bg-zinc-800/30 flex items-center justify-center mb-4 border border-white/5 text-zinc-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div className="text-zinc-500 text-sm font-mono uppercase tracking-widest">Select an episode</div>
      </div>
    );
  }

  const commonHeader = (
    <div className="flex justify-between items-start px-4 py-3 border-b border-white/5 bg-white/[0.02]">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-widest">
              {(item as any).status === "Active" ? "ACTIVE EPISODE" : "CLOSED EPISODE"}
            </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
             <span className="text-2xl font-bold text-white tracking-tight">{item.ticker}</span>
             <span className="text-sm text-zinc-500 font-mono">vs {item.benchTicker || "—"}</span>
        </div>
      </div>
      
      <div className="flex gap-2">
         <SideBadge side={item.side} />
         <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      </div>
    </div>
  );

  const renderCell = (label: string, val: string | number, highlight = false) => (
      <div className="flex flex-col gap-1 p-2 border border-white/5 rounded bg-black/20">
        <span className="text-[10px] text-zinc-500 font-mono uppercase">{label}</span>
        <span className={clsx("text-xs font-mono tabular-nums", highlight ? "text-white font-bold" : "text-zinc-300")}>{val}</span>
      </div>
  )

  if (tab === "active" && (item as any).status === "Active") {
    const r = item as TapeArbActive;
    const dur = (r.minuteIdx ?? 0) - (r.startMinuteIdx ?? 0);

    return (
      <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.08] border-l-4 border-l-emerald-500 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
        {commonHeader}
        <div className="p-4 space-y-4">
            
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-3 gap-2">
                {renderCell("Current Dev", num(r.lastDev), true)}
                {renderCell("Peak Dev", num(r.peakDev))}
                {renderCell("|Peak|", num(r.peakDevAbs))}
            </div>

             {/* Sections */}
             <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-white/5 bg-white/[0.02] flex justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Timing</span>
                </div>
                <div className="p-2 grid grid-cols-2 gap-2">
                    {renderCell("Start Min", intn(r.startMinuteIdx))}
                    {renderCell("Last Min", intn(r.minuteIdx))}
                    {renderCell("Duration", `${intn(dur)}m`)}
                    {renderCell("Start Dev", num(r.startDev))}
                </div>
             </div>

             <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-white/5 bg-white/[0.02] flex justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Position & Sizing</span>
                </div>
                <div className="p-2 grid grid-cols-2 gap-2">
                    {renderCell("Stock Entry", `${num(r.stockEntryPct)}%`)}
                    {renderCell("Bench Entry", `${num(r.benchEntryPct)}%`)}
                    {renderCell("Tier Bp", num(r.tierBp))}
                    {renderCell("Hedge $", num(r.hedgeNotional))}
                    {renderCell("Beta", num(r.beta))}
                    {renderCell("Rating", `${num(r.rating)} / ${intn(r.total)}`)}
                </div>
             </div>
        </div>
      </div>
    );
  }

  // closed
  const c = item as TapeArbClosed;
  const dur = (c.endMinuteIdx ?? 0) - (c.startMinuteIdx ?? 0);
  const pnlColor = (c.totalPnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.08] border-l-4 border-l-zinc-500 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
      {commonHeader}
      <div className="p-4 space-y-4">

         {/* PnL Hero */}
         <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
             <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Total PnL</span>
             <span className={clsx("text-3xl font-mono font-bold tracking-tighter", pnlColor)}>
                 ${num(c.totalPnlUsd)}
             </span>
             <div className="flex gap-4 mt-2">
                 <span className="text-[10px] font-mono text-zinc-500">Stock: {num(c.stockPnlUsd)}</span>
                 <span className="text-[10px] font-mono text-zinc-500">Hedge: {num(c.hedgePnlUsd)}</span>
             </div>
         </div>

         <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
            <div className="px-3 py-1.5 border-b border-white/5 bg-white/[0.02] flex justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Execution</span>
            </div>
            <div className="p-2 grid grid-cols-2 gap-2">
                {renderCell("Start→End", `${intn(c.startMinuteIdx)} → ${intn(c.endMinuteIdx)}`)}
                {renderCell("Duration", `${intn(dur)}m`)}
                {renderCell("Start Dev", num(c.startDev))}
                {renderCell("End Dev", num(c.endDev))}
                {renderCell("Peak Dev", num(c.peakDev))}
                {renderCell("|Peak|", num(Math.abs(c.peakDev ?? 0)))}
            </div>
         </div>

         <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
            <div className="px-3 py-1.5 border-b border-white/5 bg-white/[0.02] flex justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Entry / Exit</span>
            </div>
            <div className="p-2 grid grid-cols-2 gap-2">
                {renderCell("Stock In", `${num(c.stockEntryPct)}%`)}
                {renderCell("Stock Out", `${num(c.stockExitPct)}%`)}
                {renderCell("Bench In", `${num(c.benchEntryPct)}%`)}
                {renderCell("Bench Out", `${num(c.benchExitPct)}%`)}
            </div>
         </div>
      </div>
    </div>
  );
}


// --- MAIN PAGE COMPONENT ---

export default function PaperArbitrageTapePage() {
  const [tab, setTab] = useState<TabKey>("active");

  const [days, setDays] = useState<string[]>([]);
  const [dateNy, setDateNy] = useState<string>(todayNyYmd());
  const [snapshot, setSnapshot] = useState<TapeArbSnapshot | null>(null);

  const [activeRows, setActiveRows] = useState<TapeArbActive[]>([]);
  const [closedRows, setClosedRows] = useState<TapeArbClosed[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [qTicker, setQTicker] = useState("");
  const [qBench, setQBench] = useState("");
  const [qSide, setQSide] = useState<"" | "Long" | "Short">("");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // numeric ranges
  const [absDevR, setAbsDevR] = useState<Range>({ min: 0 });
  const [absPeakR, setAbsPeakR] = useState<Range>({});
  const [startMinR, setStartMinR] = useState<Range>({});
  const [endMinR, setEndMinR] = useState<Range>({});
  const [durR, setDurR] = useState<Range>({});
  const [pnlR, setPnlR] = useState<Range>({});
  const [ratingR, setRatingR] = useState<Range>({});
  const [totalR, setTotalR] = useState<Range>({});
  const [tierBpR, setTierBpR] = useState<Range>({});
  const [betaR, setBetaR] = useState<Range>({});
  const [hedgeR, setHedgeR] = useState<Range>({});

  // sort
  const [sortKey, setSortKey] = useState<any>("lastDevAbs");
  const [sortDesc, setSortDesc] = useState(true);

  // details selection
  const [selectedKey, setSelectedKey] = useState<string>("");
  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    if (tab === "active") return activeRows.find((x) => x.ticker === selectedKey) ?? null;
    // closed selection: key is ticker|idx
    const [t, idxs] = selectedKey.split("|");
    const idx = Number(idxs);
    if (!Number.isFinite(idx)) return null;
    const rows = closedRows.filter((x) => x.ticker === t);
    return rows[idx] ?? null;
  }, [selectedKey, tab, activeRows, closedRows]);

  // SSE
  const esRef = useRef<EventSource | null>(null);
  const [sseOn, setSseOn] = useState(true);

  // --- API CALLS (Unchanged) ---
  async function loadDays() {
    const j = await apiGet<{ ok: boolean; days: string[] }>("/api/tape/available-days");
    setDays(j.days ?? []);
    if (j.days?.length && !j.days.includes(dateNy)) setDateNy(j.days[0]);
  }
  async function loadSnapshot(d: string) {
    const j = await apiGet<TapeArbSnapshot>(`/api/tape/arbitrage/snapshot?dateNy=${encodeURIComponent(d)}`);
    setSnapshot(j);
  }
  async function loadActive(d: string) {
    const j = await apiGet<{ ok: boolean; dateNy: string; rows: TapeArbActive[] }>(`/api/tape/arbitrage/active?dateNy=${encodeURIComponent(d)}`);
    setActiveRows(j.rows ?? []);
  }
  async function loadClosed(d: string) {
    const j = await apiGet<{ ok: boolean; dateNy: string; rows: TapeArbClosed[] }>(`/api/tape/arbitrage/closed?dateNy=${encodeURIComponent(d)}`);
    setClosedRows(j.rows ?? []);
  }
  async function refreshAll(d: string) {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([loadSnapshot(d), loadActive(d), loadClosed(d)]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setQTicker(""); setQBench(""); setQSide("");
    setAbsDevR({ min: 0 }); setAbsPeakR({}); setStartMinR({}); setEndMinR({});
    setDurR({}); setPnlR({}); setRatingR({}); setTotalR({}); setTierBpR({}); setBetaR({}); setHedgeR({});
  }

  useEffect(() => { loadDays().catch((e) => setErr(String(e))); }, []);
  useEffect(() => { setSelectedKey(""); refreshAll(dateNy); }, [dateNy]);

  useEffect(() => {
    if (!sseOn) { esRef.current?.close(); esRef.current = null; return; }
    esRef.current?.close();
    const url = `/api/tape/stream?dateNy=${encodeURIComponent(dateNy)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = () => {
      loadSnapshot(dateNy).catch(() => {});
      if (tab === "active") loadActive(dateNy).catch(() => {});
      else loadClosed(dateNy).catch(() => {});
    };
    return () => es.close();
  }, [dateNy, sseOn, tab]);

  // --- FILTER & SORT LOGIC (Unchanged) ---
  const filteredActive = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    const bq = qBench.trim().toUpperCase();
    return activeRows.filter((r) => {
      if (tq && !r.ticker.toUpperCase().includes(tq)) return false;
      if (bq && !(r.benchTicker ?? "").toUpperCase().includes(bq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      const absDev = Math.abs(r.lastDev ?? 0);
      const absPeak = Math.abs(r.peakDev ?? 0);
      const dur = (r.minuteIdx ?? 0) - (r.startMinuteIdx ?? 0);
      if (!inRange(absDev, absDevR)) return false;
      if (!inRange(absPeak, absPeakR)) return false;
      if (!inRange(r.startMinuteIdx ?? 0, startMinR)) return false;
      if (!inRange(r.minuteIdx ?? 0, endMinR)) return false;
      if (!inRange(dur, durR)) return false;
      if (!inRange(r.rating ?? NaN, ratingR)) return false;
      if (!inRange(r.total ?? NaN, totalR)) return false;
      if (!inRange(r.tierBp ?? NaN, tierBpR)) return false;
      if (!inRange(r.beta ?? NaN, betaR)) return false;
      if (!inRange(r.hedgeNotional ?? NaN, hedgeR)) return false;
      return true;
    });
  }, [activeRows, qTicker, qBench, qSide, absDevR, absPeakR, startMinR, endMinR, durR, ratingR, totalR, tierBpR, betaR, hedgeR]);

  const filteredClosed = useMemo(() => {
    const tq = qTicker.trim().toUpperCase();
    const bq = qBench.trim().toUpperCase();
    return closedRows.filter((r) => {
      if (tq && !r.ticker.toUpperCase().includes(tq)) return false;
      if (bq && !(r.benchTicker ?? "").toUpperCase().includes(bq)) return false;
      if (qSide) {
        const s = normalizeSide(r.side);
        if (qSide === "Long" && s.isLong !== true) return false;
        if (qSide === "Short" && s.isLong !== false) return false;
      }
      const absDev = Math.abs(r.endDev ?? 0);
      const absPeak = Math.abs(r.peakDev ?? 0);
      const dur = (r.endMinuteIdx ?? 0) - (r.startMinuteIdx ?? 0);
      if (!inRange(absDev, absDevR)) return false;
      if (!inRange(absPeak, absPeakR)) return false;
      if (!inRange(r.startMinuteIdx ?? 0, startMinR)) return false;
      if (!inRange(r.endMinuteIdx ?? 0, endMinR)) return false;
      if (!inRange(dur, durR)) return false;
      if (!inRange(r.totalPnlUsd ?? NaN, pnlR)) return false;
      if (!inRange(r.rating ?? NaN, ratingR)) return false;
      if (!inRange(r.total ?? NaN, totalR)) return false;
      if (!inRange(r.tierBp ?? NaN, tierBpR)) return false;
      if (!inRange(r.beta ?? NaN, betaR)) return false;
      if (!inRange(r.hedgeNotional ?? NaN, hedgeR)) return false;
      return true;
    });
  }, [closedRows, qTicker, qBench, qSide, absDevR, absPeakR, startMinR, endMinR, durR, pnlR, ratingR, totalR, tierBpR, betaR, hedgeR]);

  function sortRows<T extends any>(rows: T[], getAbsLast: (r: T) => number, getAbsPeak: (r: T) => number, getStart: (r: T) => number, getEnd: (r: T) => number, getPnl: (r: T) => number) {
    const mul = sortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === "ticker") return mul * String((a as any).ticker).localeCompare(String((b as any).ticker));
      if (sortKey === "lastDevAbs") return mul * (getAbsLast(a) - getAbsLast(b));
      if (sortKey === "peakDevAbs") return mul * (getAbsPeak(a) - getAbsPeak(b));
      if (sortKey === "startMinute") return mul * (getStart(a) - getStart(b));
      if (sortKey === "endMinute") return mul * (getEnd(a) - getEnd(b));
      if (sortKey === "duration") return mul * ((getEnd(a) - getStart(a)) - (getEnd(b) - getStart(b)));
      if (sortKey === "pnl") return mul * (getPnl(a) - getPnl(b));
      return 0;
    });
  }

  const activeSorted = useMemo(() => sortRows(filteredActive, (r) => Math.abs(r.lastDev ?? 0), (r) => Math.abs(r.peakDev ?? 0), (r) => r.startMinuteIdx ?? 0, (r) => r.minuteIdx ?? 0, () => 0), [filteredActive, sortKey, sortDesc]);
  const closedSorted = useMemo(() => sortRows(filteredClosed, (r) => Math.abs(r.endDev ?? 0), (r) => Math.abs(r.peakDev ?? 0), (r) => r.startMinuteIdx ?? 0, (r) => r.endMinuteIdx ?? 0, (r) => r.totalPnlUsd ?? 0), [filteredClosed, sortKey, sortDesc]);


  return (
    <div className="relative min-h-screen w-full bg-black text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-white p-4 overflow-x-hidden">
      <NebulaBackground />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="bg-[#0a0a0a]/60 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
               <span className={`w-2.5 h-2.5 rounded-full border border-white/10 ${loading ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"}`} />
               <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                 PAPER ARBITRAGE TAPE
               </h1>
            </div>
             <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
               <span>{snapshot ? `UPDATED ${new Date(snapshot.updatedUtc).toLocaleTimeString()}` : "CONNECTING..."}</span>
               <span className="text-zinc-700 mx-1">•</span>
               <span>{snapshot?.activeCount ?? 0} Active</span>
               <span className="text-zinc-700 mx-1">•</span>
               <span>{snapshot?.closedCount ?? 0} Closed</span>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
                <input
                  type="date"
                  value={dateNy}
                  onChange={(e) => setDateNy(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-transparent text-[11px] font-mono text-zinc-300 border border-transparent focus:border-white/10 focus:bg-white/5 outline-none transition-all"
                />
                <button
                    onClick={() => refreshAll(dateNy)}
                    disabled={loading}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                    title="Refresh"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
                </button>
             </div>

             <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
                <button
                  onClick={() => setSseOn(!sseOn)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                    sseOn ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  SSE: {sseOn ? "ON" : "OFF"}
                </button>
             </div>
          </div>
        </header>

        {/* ERROR */}
        {err && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-sm text-center">
               ERROR: {err}
            </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 items-start">
             
             {/* LEFT COLUMN: TABLE & FILTERS */}
             <div className="flex flex-col gap-4">
                 
                 {/* CONTROLS */}
                 <div className="flex flex-col gap-3 bg-[#0a0a0a]/40 backdrop-blur-sm border border-white/[0.04] rounded-xl p-3">
                     <div className="flex flex-wrap gap-3 items-center">
                        {/* Tabs */}
                        <div className="flex gap-1 p-1 bg-black/40 rounded-lg border border-white/5">
                            {(["active", "closed"] as const).map(k => (
                                <button
                                    key={k}
                                    onClick={() => setTab(k)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all",
                                        tab === k ? "bg-zinc-800 text-white shadow-sm border border-white/10" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    {k}
                                </button>
                            ))}
                        </div>
                        
                        <div className="w-px h-6 bg-white/5 mx-2" />

                        <GlassInput value={qTicker} onChange={e => setQTicker(e.target.value)} placeholder="TICKER" width={80} />
                        <GlassInput value={qBench} onChange={e => setQBench(e.target.value)} placeholder="BENCH" width={80} />
                        <GlassSelect 
                            value={qSide} 
                            onChange={e => setQSide(e.target.value as any)} 
                            options={[{value:"", label:"ALL"}, {value:"Long", label:"LONG"}, {value:"Short", label:"SHORT"}]} 
                            className="w-24"
                        />

                        <div className="flex-1" />

                        <GlassSelect
                             value={sortKey}
                             onChange={e => setSortKey(e.target.value)}
                             options={[
                                { value: "lastDevAbs", label: tab === "active" ? "|LAST DEV|" : "|END DEV|" },
                                { value: "peakDevAbs", label: "|PEAK DEV|" },
                                { value: "startMinute", label: "START TIME" },
                                { value: "endMinute", label: "END TIME" },
                                { value: "duration", label: "DURATION" },
                                ...(tab === "closed" ? [{ value: "pnl", label: "PNL" }] : []),
                                { value: "ticker", label: "TICKER" },
                             ]}
                             className="w-32"
                        />
                        <button
                            onClick={() => setSortDesc(!sortDesc)}
                            className="px-3 py-1.5 bg-zinc-800 rounded-lg border border-white/10 text-xs text-zinc-300 font-mono uppercase hover:bg-zinc-700 transition-all"
                        >
                            {sortDesc ? "DESC" : "ASC"}
                        </button>
                        
                         <button
                            onClick={() => setFiltersCollapsed(!filtersCollapsed)}
                            className={clsx(
                                "px-3 py-1.5 rounded-lg border text-[10px] font-mono hover:bg-white/10 transition-colors",
                                filtersCollapsed ? "border-white/10 bg-white/5 text-zinc-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            )}
                         >
                            {filtersCollapsed ? "EXPAND" : "FILTERS"}
                         </button>
                         <button onClick={resetFilters} className="px-3 py-1.5 text-[10px] font-mono text-zinc-500 hover:text-rose-400 transition-colors uppercase">Reset</button>
                     </div>

                     {!filtersCollapsed && (
                         <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-2 border-t border-white/[0.04]">
                             <MinMax label={tab === "active" ? "|LAST|" : "|END|"} value={absDevR} setValue={setAbsDevR} />
                             <MinMax label="|PEAK|" value={absPeakR} setValue={setAbsPeakR} />
                             <MinMax label="START T" value={startMinR} setValue={setStartMinR} />
                             <MinMax label="END T" value={endMinR} setValue={setEndMinR} />
                             <MinMax label="DUR" value={durR} setValue={setDurR} />
                             {tab === "closed" && <MinMax label="PNL $" value={pnlR} setValue={setPnlR} />}
                             <MinMax label="RATING" value={ratingR} setValue={setRatingR} />
                             <MinMax label="TIER BP" value={tierBpR} setValue={setTierBpR} />
                         </div>
                     )}
                 </div>

                 {/* TABLE */}
                 <GlassCard className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.08] bg-white/[0.01]">
                                    {["Ticker", "Side", "Bench", tab === "active" ? "Last Dev" : "End Dev", "|Peak|", "Times", tab === "active" ? "Tier BP" : "PnL $", "Rating"].map((h, i) => (
                                        <th key={i} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold whitespace-nowrap">{h}</th>
                                    ))}
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {tab === "active" ? activeSorted.map(r => {
                                    const isSelected = selectedKey === r.ticker;
                                    return (
                                        <tr 
                                            key={r.ticker} 
                                            onClick={() => setSelectedKey(r.ticker)}
                                            className={clsx(
                                                "group border-b border-white/[0.04] transition-colors cursor-pointer text-sm font-mono",
                                                isSelected ? "bg-emerald-500/10" : "hover:bg-white/[0.02]"
                                            )}
                                        >
                                            <td className="px-4 py-3 font-bold text-white">{r.ticker}</td>
                                            <td className="px-4 py-3"><SideBadge side={r.side} /></td>
                                            <td className="px-4 py-3 text-zinc-400">{r.benchTicker || "—"}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-300 group-hover:text-white">{num(r.lastDev)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-300">{num(r.peakDevAbs)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-500 text-xs">{intn(r.startMinuteIdx)} → {intn(r.minuteIdx)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-400">{num(r.tierBp)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-500 text-xs">{num(r.rating)}</td>
                                            <td className="px-4 py-3 text-right"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 group-hover:bg-emerald-400 animate-pulse ml-auto" /></td>
                                        </tr>
                                    );
                                }) : closedSorted.map((r, idxAll) => {
                                    const key = `${r.ticker}|${closedSorted.filter(x => x.ticker === r.ticker).indexOf(r)}`;
                                    const isSelected = selectedKey === key;
                                    return (
                                        <tr 
                                            key={`${r.ticker}-${idxAll}`} 
                                            onClick={() => setSelectedKey(key)}
                                            className={clsx(
                                                "group border-b border-white/[0.04] transition-colors cursor-pointer text-sm font-mono",
                                                isSelected ? "bg-emerald-500/10" : "hover:bg-white/[0.02]"
                                            )}
                                        >
                                            <td className="px-4 py-3 font-bold text-white">{r.ticker}</td>
                                            <td className="px-4 py-3"><SideBadge side={r.side} /></td>
                                            <td className="px-4 py-3 text-zinc-400">{r.benchTicker || "—"}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-300">{num(r.endDev)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-300">{num(Math.abs(r.peakDev ?? 0))}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-500 text-xs">{intn(r.startMinuteIdx)} → {intn(r.endMinuteIdx)}</td>
                                            <td className={clsx("px-4 py-3 tabular-nums font-bold", (r.totalPnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{num(r.totalPnlUsd)}</td>
                                            <td className="px-4 py-3 tabular-nums text-zinc-500 text-xs">{num(r.rating)}</td>
                                            <td className="px-4 py-3 text-right"></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {(tab === "active" ? activeSorted : closedSorted).length === 0 && (
                            <div className="p-8 text-center text-zinc-500 font-mono text-sm tracking-widest italic">No episodes found matching filters.</div>
                        )}
                    </div>
                 </GlassCard>
             </div>

             {/* RIGHT COLUMN: DETAILS */}
             <div className="sticky top-6 h-[calc(100vh-6rem)] overflow-hidden flex flex-col">
                 <DetailsPanel tab={tab} item={selectedItem} onClose={() => setSelectedKey("")} />
             </div>

        </div>
      </div>
    </div>
  );
}