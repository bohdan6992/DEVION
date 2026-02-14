"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { todayNyYmd } from "../../lib/time";
import { getToken } from "../../lib/authClient";
import clsx from "clsx";

// =========================
// API base (works on Vercel)
// =========================
// Set NEXT_PUBLIC_AXI_BASE_URL on Vercel to your public API (or tunnel URL), e.g. https://xxxxx.ngrok.io
const AXI_BASE = (process.env.NEXT_PUBLIC_AXI_BASE_URL || "").replace(/\/+$/, "");

// Build URL:
// - If AXI_BASE set => call API directly (bypass /api rewrites)
// - else => fallback to relative /api (works locally with next rewrites)
function apiUrl(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/")) pathAndQuery = `/${pathAndQuery}`;
  // expected inputs like "/api/tape/available-days" or "/api/tape/stream?..."
  return AXI_BASE ? `${AXI_BASE}${pathAndQuery}` : pathAndQuery;
}

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
  const fullUrl = apiUrl(url);
  const res = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${fullUrl}`);
  return (await res.json()) as T;
}

// --- DESIGN SYSTEM COMPONENTS ---
// (rest unchanged)
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
          <button type="button" onClick={() => setValue({})} className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors">
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
    <span className={clsx("px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap", colorClass)}>
      {s.label}
    </span>
  );
}

// --- DETAILS PANEL ---
// (unchanged, omitted here for brevity in explanation — keep your current DetailsPanel)
function DetailsPanel({
  tab,
  item,
  onClose,
}: {
  tab: TabKey;
  item: TapeArbActive | TapeArbClosed | null;
  onClose: () => void;
}) {
  // ... keep exactly as you have it ...
  // (I’m not changing this part.)
  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center border border-white/5 bg-white/[0.01] rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-zinc-800/30 flex items-center justify-center mb-4 border border-white/5 text-zinc-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div className="text-zinc-500 text-sm font-mono uppercase tracking-widest">Select an episode</div>
      </div>
    );
  }

  // (rest of your DetailsPanel remains unchanged)
  // ... SNIP ...
  return <div className="h-full" />;
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
    const [t, idxs] = selectedKey.split("|");
    const idx = Number(idxs);
    if (!Number.isFinite(idx)) return null;
    const rows = closedRows.filter((x) => x.ticker === t);
    return rows[idx] ?? null;
  }, [selectedKey, tab, activeRows, closedRows]);

  // SSE
  const esRef = useRef<EventSource | null>(null);
  const [sseOn, setSseOn] = useState(true);

  // --- API CALLS ---
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
    const j = await apiGet<{ ok: boolean; dateNy: string; rows: TapeArbActive[] }>(
      `/api/tape/arbitrage/active?dateNy=${encodeURIComponent(d)}`
    );
    setActiveRows(j.rows ?? []);
  }
  async function loadClosed(d: string) {
    const j = await apiGet<{ ok: boolean; dateNy: string; rows: TapeArbClosed[] }>(
      `/api/tape/arbitrage/closed?dateNy=${encodeURIComponent(d)}`
    );
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
    setQTicker("");
    setQBench("");
    setQSide("");
    setAbsDevR({ min: 0 });
    setAbsPeakR({});
    setStartMinR({});
    setEndMinR({});
    setDurR({});
    setPnlR({});
    setRatingR({});
    setTotalR({});
    setTierBpR({});
    setBetaR({});
    setHedgeR({});
  }

  useEffect(() => {
    loadDays().catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    setSelectedKey("");
    refreshAll(dateNy);
  }, [dateNy]);

  useEffect(() => {
    if (!sseOn) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    esRef.current?.close();

    // IMPORTANT: add token via query (EventSource can't send headers)
    const t = getToken();
    const url =
      `/api/tape/stream?dateNy=${encodeURIComponent(dateNy)}` +
      (t ? `&token=${encodeURIComponent(t)}` : "");

    const es = new EventSource(apiUrl(url));
    esRef.current = es;

    es.onmessage = () => {
      loadSnapshot(dateNy).catch(() => {});
      if (tab === "active") loadActive(dateNy).catch(() => {});
      else loadClosed(dateNy).catch(() => {});
    };

    es.onerror = () => {
      // helpful error instead of silent fail
      setErr((prev) => prev ?? "SSE connection failed (likely auth or network). Try SSE OFF or check token/stream auth.");
    };

    return () => es.close();
  }, [dateNy, sseOn, tab]);

  // --- FILTER & SORT LOGIC ---
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

  function sortRows<T extends any>(
    rows: T[],
    getAbsLast: (r: T) => number,
    getAbsPeak: (r: T) => number,
    getStart: (r: T) => number,
    getEnd: (r: T) => number,
    getPnl: (r: T) => number
  ) {
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

  const activeSorted = useMemo(
    () =>
      sortRows(
        filteredActive,
        (r) => Math.abs((r as any).lastDev ?? 0),
        (r) => Math.abs((r as any).peakDev ?? 0),
        (r) => (r as any).startMinuteIdx ?? 0,
        (r) => (r as any).minuteIdx ?? 0,
        () => 0
      ),
    [filteredActive, sortKey, sortDesc]
  );

  const closedSorted = useMemo(
    () =>
      sortRows(
        filteredClosed,
        (r) => Math.abs((r as any).endDev ?? 0),
        (r) => Math.abs((r as any).peakDev ?? 0),
        (r) => (r as any).startMinuteIdx ?? 0,
        (r) => (r as any).endMinuteIdx ?? 0,
        (r) => (r as any).totalPnlUsd ?? 0
      ),
    [filteredClosed, sortKey, sortDesc]
  );

  // ===== UI BELOW: keep your existing JSX unchanged =====
  return (
    <div className="relative min-h-screen w-full bg-black text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-white p-4 overflow-x-hidden">
      <NebulaBackground />
      {/* keep rest of your JSX as-is */}
      <div className="relative z-10 max-w-[1920px] mx-auto space-y-6">
        {/* ... your existing UI ... */}
        <div className="p-4 rounded-xl border border-white/10 text-xs font-mono text-zinc-500">
          API BASE: {AXI_BASE || "(using /api rewrites)"}{" "}
          {!AXI_BASE && <span className="text-rose-400">— set NEXT_PUBLIC_AXI_BASE_URL on Vercel</span>}
        </div>
      </div>
    </div>
  );
}