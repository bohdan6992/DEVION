"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { todayNyYmd } from "../../lib/time";
import { getToken } from "../../lib/authClient";
import { bridgeUrl, getBridgeBaseUrl } from "../../lib/bridgeBase";
import clsx from "clsx";

// =========================
// API base (Tape/Scope style)
// =========================
// In browser getBridgeBaseUrl() MUST fallback to DEFAULT_LOCAL (bridgeBase.ts),
// so we DO NOT throw "NOT SET" here. We always build absolute URL via bridgeUrl.
function apiUrl(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/")) pathAndQuery = `/${pathAndQuery}`;
  return bridgeUrl(pathAndQuery);
}

// --- TYPES ---
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

type ApiSnapshotPoint = {
  minuteIdx: number;
  metric: number | null;
  metricAbs: number | null;

  bidPct?: number | null;
  askPct?: number | null;

  benchBidPct?: number | null;
  benchAskPct?: number | null;

  lstPrcLstClsPct?: number | null;
  benchLstPrcLstClsPct?: number | null;
};

type ApiArbRow = {
  isActive: boolean;
  side: TapeArbSide;
  ticker: string;
  benchTicker: string;

  start?: ApiSnapshotPoint | null;
  peak?: ApiSnapshotPoint | null;

  // active
  last?: ApiSnapshotPoint | null;

  // closed (на бекові може бути end або last — робимо обидва)
  end?: ApiSnapshotPoint | null;

  tierBp?: number | null;
  beta?: number | null;
  hedgeNotional?: number | null;

  rating?: number | null;
  total?: number | null;

  stockPnlUsd?: number | null;
  hedgePnlUsd?: number | null;
  totalPnlUsd?: number | null;

  startClass?: string | null;
  exitReason?: string | null;
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

// --- UTILS ---
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

function normalizeSide(
  side: TapeArbSide
): { label: "Long" | "Short" | string; isLong: boolean | null } {
  if (side === 0) return { label: "Long", isLong: true };
  if (side === 1) return { label: "Short", isLong: false };
  const s = String(side ?? "").trim();
  const low = s.toLowerCase();
  if (low.includes("long")) return { label: "Long", isLong: true };
  if (low.includes("short")) return { label: "Short", isLong: false };
  return { label: s.length ? s : "—", isLong: null };
}

function flattenActive(dateNy: string, r: ApiArbRow): TapeArbActive {
  const startMin = r.start?.minuteIdx ?? 0;
  const lastMin = r.last?.minuteIdx ?? startMin;
  const peakMin = r.peak?.minuteIdx ?? startMin;

  const startDev = (r.start?.metric ?? 0) as number;
  const lastDev = (r.last?.metric ?? 0) as number;
  const peakDev = (r.peak?.metric ?? 0) as number;

  const peakDevAbs =
    (r.peak?.metricAbs ??
      (Number.isFinite(peakDev) ? Math.abs(peakDev) : 0)) as number;

  return {
    status: "Active",
    dateNy,
    ticker: r.ticker,
    benchTicker: r.benchTicker,
    side: r.side,

    startMinuteIdx: startMin,
    minuteIdx: lastMin,
    peakMinuteIdx: peakMin,

    startDev,
    lastDev,
    peakDev,
    peakDevAbs,

    tierBp: r.tierBp ?? null,
    beta: r.beta ?? null,
    hedgeNotional: r.hedgeNotional ?? null,
    rating: r.rating ?? null,
    total: r.total ?? null,

    // optional (якщо захочеш у деталях/таблиці)
    stockEntryPct: r.start?.bidPct ?? null,
    benchEntryPct: r.start?.benchBidPct ?? null,
  };
}

function flattenClosed(dateNy: string, r: ApiArbRow): TapeArbClosed {
  const startMin = r.start?.minuteIdx ?? 0;
  const endPoint = r.end ?? r.last ?? null;
  const endMin = endPoint?.minuteIdx ?? startMin;
  const peakMin = r.peak?.minuteIdx ?? startMin;

  const startDev = (r.start?.metric ?? 0) as number;
  const endDev = (endPoint?.metric ?? 0) as number;
  const peakDev = (r.peak?.metric ?? 0) as number;

  return {
    status: "Closed",
    dateNy,
    ticker: r.ticker,
    benchTicker: r.benchTicker,
    side: r.side,

    startMinuteIdx: startMin,
    endMinuteIdx: endMin,
    peakMinuteIdx: peakMin,

    startDev,
    endDev,
    peakDev,

    tierBp: r.tierBp ?? null,
    beta: r.beta ?? null,
    hedgeNotional: r.hedgeNotional ?? null,
    rating: r.rating ?? null,
    total: r.total ?? null,

    stockEntryPct: r.start?.bidPct ?? null,
    stockExitPct: endPoint?.askPct ?? null,
    benchEntryPct: r.start?.benchBidPct ?? null,
    benchExitPct: endPoint?.benchAskPct ?? null,

    stockPnlUsd: r.stockPnlUsd ?? null,
    hedgePnlUsd: r.hedgePnlUsd ?? null,
    totalPnlUsd: r.totalPnlUsd ?? null,
  };
}

async function apiGet<T>(url: string): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(url);
  const res = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText} for ${fullUrl}${text ? ` :: ${text}` : ""}`
    );
  }
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
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))",
        }}
      />
    </div>
  );
}

function GlassCard({
  children,
  className,
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
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
          <option
            key={opt.value}
            value={opt.value}
            className="bg-zinc-900 text-white"
          >
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-zinc-400">
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
  const setMin = (v: string) =>
    setValue({ ...value, min: v === "" ? undefined : clampNumber(v) });
  const setMax = (v: string) =>
    setValue({ ...value, max: v === "" ? undefined : clampNumber(v) });

  const hasVal = value.min !== undefined || value.max !== undefined;

  return (
    <div
      className={clsx(
        "group flex flex-col gap-1 p-2 rounded-xl border transition-all",
        hasVal
          ? "border-emerald-500/30 bg-emerald-500/[0.05]"
          : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10",
        width
      )}
    >
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono truncate mr-1">
          {label}
        </span>
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
  const hasMin = isNum(r.min);
  const hasMax = isNum(r.max);

  // якщо фільтр НЕ заданий — пропускаємо все, навіть NaN/null
  if (!hasMin && !hasMax) return true;

  // якщо фільтр заданий — тоді значення мусить бути числом
  if (!Number.isFinite(x)) return false;

  if (hasMin && x < r.min!) return false;
  if (hasMax && x > r.max!) return false;
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
          Select an episode
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-mono tracking-widest uppercase text-zinc-400">
          Details — {tab === "active" ? "Active" : "Closed"}
        </div>
        <button
          onClick={onClose}
          className="text-[10px] font-mono px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
        >
          CLOSE
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-mono">
        <pre className="whitespace-pre-wrap break-words text-zinc-300">
          {JSON.stringify(item, null, 2)}
        </pre>
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
  const [absDevR, setAbsDevR] = useState<Range>({});
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
    if (tab === "active")
      return activeRows.find((x) => x.ticker === selectedKey) ?? null;

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
    const j = await apiGet<{ ok: boolean; days: string[] }>(
      "/api/tape/available-days"
    );
    setDays(j.days ?? []);
    if (j.days?.length && !j.days.includes(dateNy)) setDateNy(j.days[0]);
  }

  async function loadSnapshot(d: string) {
    const j = await apiGet<TapeArbSnapshot>(
      `/api/tape/arbitrage/snapshot?dateNy=${encodeURIComponent(d)}`
    );
    setSnapshot(j);
  }

async function loadActive(d: string) {
  const j = await apiGet<{ ok: boolean; dateNy: string; rows: ApiArbRow[] }>(
    `/api/tape/arbitrage/active?dateNy=${encodeURIComponent(d)}`
  );
  const rows = (j.rows ?? []).map((r) => flattenActive(j.dateNy ?? d, r));
  setActiveRows(rows);
}

async function loadClosed(d: string) {
  const j = await apiGet<{ ok: boolean; dateNy: string; rows: ApiArbRow[] }>(
    `/api/tape/arbitrage/closed?dateNy=${encodeURIComponent(d)}`
  );
  const rows = (j.rows ?? []).map((r) => flattenClosed(j.dateNy ?? d, r));
  setClosedRows(rows);
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
    setAbsDevR({});
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
    loadDays().catch((e) => setErr(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedKey("");
    refreshAll(dateNy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateNy]);

  // ✅ FIX: backend sends SSE with "event: minute", not default "message"
  useEffect(() => {
    if (!sseOn) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    esRef.current?.close();

    const t = getToken();
    const url =
      `/api/tape/stream?dateNy=${encodeURIComponent(dateNy)}` +
      (t ? `&token=${encodeURIComponent(t)}` : "");

    const es = new EventSource(apiUrl(url));
    esRef.current = es;

    const onMinute = () => {
      loadSnapshot(dateNy).catch(() => {});
      if (tab === "active") loadActive(dateNy).catch(() => {});
      else loadClosed(dateNy).catch(() => {});
    };

    es.addEventListener("minute", onMinute);

    es.onerror = () => {
      setErr(
        (prev) =>
          prev ??
          "SSE connection failed (likely auth or network). Try SSE OFF or check token/stream auth."
      );
    };

    return () => {
      es.removeEventListener("minute", onMinute);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [
    activeRows,
    qTicker,
    qBench,
    qSide,
    absDevR,
    absPeakR,
    startMinR,
    endMinR,
    durR,
    ratingR,
    totalR,
    tierBpR,
    betaR,
    hedgeR,
  ]);

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
  }, [
    closedRows,
    qTicker,
    qBench,
    qSide,
    absDevR,
    absPeakR,
    startMinR,
    endMinR,
    durR,
    pnlR,
    ratingR,
    totalR,
    tierBpR,
    betaR,
    hedgeR,
  ]);

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
      if (sortKey === "ticker")
        return (
          mul *
          String((a as any).ticker).localeCompare(String((b as any).ticker))
        );
      if (sortKey === "lastDevAbs") return mul * (getAbsLast(a) - getAbsLast(b));
      if (sortKey === "peakDevAbs") return mul * (getAbsPeak(a) - getAbsPeak(b));
      if (sortKey === "startMinute") return mul * (getStart(a) - getStart(b));
      if (sortKey === "endMinute") return mul * (getEnd(a) - getEnd(b));
      if (sortKey === "duration")
        return (
          mul *
          ((getEnd(a) - getStart(a)) - (getEnd(b) - getStart(b)))
        );
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

  // ===== UI =====
  const tabRows = tab === "active" ? activeSorted : closedSorted;
  const counts = snapshot
    ? `${snapshot.activeCount} active / ${snapshot.closedCount} closed`
    : `${activeRows.length} active / ${closedRows.length} closed`;

  return (
    <div className="relative min-h-screen w-full bg-black text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-white p-4 overflow-x-hidden">
      <NebulaBackground />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-lg font-semibold tracking-wide">
              Tape Arbitrage — Paper (Viewer)
            </div>
            <div className="text-xs font-mono text-zinc-500">
              BRIDGE API BASE: {getBridgeBaseUrl()} · {counts}
              {snapshot?.updatedUtc ? ` · updated ${snapshot.updatedUtc}` : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <GlassSelect
              value={dateNy}
              onChange={(e) => setDateNy(e.target.value)}
              options={(days?.length ? days : [dateNy]).map((d) => ({
                value: d,
                label: d,
              }))}
            />

            <button
              onClick={() => refreshAll(dateNy)}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-xs font-mono"
            >
              REFRESH
            </button>

            <button
              onClick={() => setSseOn((x) => !x)}
              className={clsx(
                "px-3 py-1.5 rounded-lg border text-xs font-mono",
                sseOn
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              )}
            >
              SSE {sseOn ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => resetFilters()}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-xs font-mono"
            >
              RESET FILTERS
            </button>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-200 text-xs font-mono p-3">
            {err}
          </div>
        )}

        {/* Snapshot cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard className="p-3">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
              DATE (NY)
            </div>
            <div className="text-sm font-mono mt-1">{dateNy}</div>
          </GlassCard>
          <GlassCard className="p-3">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
              LAST MIN IDX
            </div>
            <div className="text-sm font-mono mt-1">
              {snapshot ? intn(snapshot.lastMinuteIdx) : "—"}
            </div>
          </GlassCard>
          <GlassCard className="p-3">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
              ACTIVE
            </div>
            <div className="text-sm font-mono mt-1">
              {snapshot ? intn(snapshot.activeCount) : intn(activeRows.length)}
            </div>
          </GlassCard>
          <GlassCard className="p-3">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
              CLOSED
            </div>
            <div className="text-sm font-mono mt-1">
              {snapshot ? intn(snapshot.closedCount) : intn(closedRows.length)}
            </div>
          </GlassCard>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("active")}
            className={clsx(
              "px-3 py-1.5 rounded-lg border text-xs font-mono",
              tab === "active"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            )}
          >
            ACTIVE ({activeRows.length})
          </button>
          <button
            onClick={() => setTab("closed")}
            className={clsx(
              "px-3 py-1.5 rounded-lg border text-xs font-mono",
              tab === "closed"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            )}
          >
            CLOSED ({closedRows.length})
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setFiltersCollapsed((x) => !x)}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-xs font-mono"
          >
            FILTERS {filtersCollapsed ? "▸" : "▾"}
          </button>
        </div>

        {/* Filters */}
        {!filtersCollapsed && (
          <GlassCard className="p-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
                  TICKER
                </div>
                <GlassInput
                  value={qTicker}
                  onChange={(e) => setQTicker(e.target.value)}
                  placeholder="AAPL"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
                  BENCH
                </div>
                <GlassInput
                  value={qBench}
                  onChange={(e) => setQBench(e.target.value)}
                  placeholder="SPY"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
                  SIDE
                </div>
                <GlassSelect
                  value={qSide}
                  onChange={(e) => setQSide(e.target.value as any)}
                  options={[
                    { value: "", label: "Any" },
                    { value: "Long", label: "Long" },
                    { value: "Short", label: "Short" },
                  ]}
                />
              </div>

              <MinMax label="Abs Dev" value={absDevR} setValue={setAbsDevR} />
              <MinMax label="Abs Peak" value={absPeakR} setValue={setAbsPeakR} />
              <MinMax label="Start Min" value={startMinR} setValue={setStartMinR} />
              <MinMax label="End Min" value={endMinR} setValue={setEndMinR} />
              <MinMax label="Duration" value={durR} setValue={setDurR} />
              <MinMax label="PnL USD (Closed)" value={pnlR} setValue={setPnlR} />
              <MinMax label="Rating" value={ratingR} setValue={setRatingR} />
              <MinMax label="Total" value={totalR} setValue={setTotalR} />
              <MinMax label="TierBp" value={tierBpR} setValue={setTierBpR} />
              <MinMax label="Beta" value={betaR} setValue={setBetaR} />
              <MinMax
                label="Hedge Notional"
                value={hedgeR}
                setValue={setHedgeR}
              />
            </div>
          </GlassCard>
        )}

        {/* Main grid: table + details */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <GlassCard className="xl:col-span-2 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">
                {tab === "active" ? "ACTIVE EPISODES" : "CLOSED EPISODES"} ·
                rows {tabRows.length}
              </div>

              <div className="flex items-center gap-2">
                <GlassSelect
                  value={String(sortKey)}
                  onChange={(e) => setSortKey(e.target.value)}
                  options={[
                    { value: "lastDevAbs", label: tab === "active" ? "Last |Dev|" : "End |Dev|" },
                    { value: "peakDevAbs", label: "Peak |Dev|" },
                    { value: "startMinute", label: "Start Minute" },
                    { value: "endMinute", label: tab === "active" ? "Now Minute" : "End Minute" },
                    { value: "duration", label: "Duration" },
                    { value: "pnl", label: "PnL (closed)" },
                    { value: "ticker", label: "Ticker" },
                  ]}
                />
                <button
                  onClick={() => setSortDesc((x) => !x)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-xs font-mono"
                >
                  {sortDesc ? "DESC" : "ASC"}
                </button>
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-white/5">
              <table className="min-w-[1100px] w-full text-xs font-mono">
                <thead className="bg-white/[0.03] text-zinc-400">
                  <tr>
                    <th className="text-left p-2">Ticker</th>
                    <th className="text-left p-2">Bench</th>
                    <th className="text-left p-2">Side</th>
                    <th className="text-right p-2">
                      {tab === "active" ? "LastDev" : "EndDev"}
                    </th>
                    <th className="text-right p-2">PeakDev</th>
                    <th className="text-right p-2">Start</th>
                    <th className="text-right p-2">
                      {tab === "active" ? "Now" : "End"}
                    </th>
                    <th className="text-right p-2">Dur</th>
                    <th className="text-right p-2">TierBp</th>
                    <th className="text-right p-2">Beta</th>
                    <th className="text-right p-2">Hedge</th>
                    <th className="text-right p-2">Rating</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">PnL</th>
                  </tr>
                </thead>

                <tbody>
                  {tab === "active" &&
                    (activeSorted as TapeArbActive[]).map((r) => {
                      const dur =
                        (r.minuteIdx ?? 0) - (r.startMinuteIdx ?? 0);
                      const key = r.ticker;
                      const isSel = selectedKey === key;

                      return (
                        <tr
                          key={key}
                          onClick={() => setSelectedKey(key)}
                          className={clsx(
                            "border-t border-white/5 hover:bg-white/[0.03] cursor-pointer",
                            isSel && "bg-emerald-500/[0.06]"
                          )}
                        >
                          <td className="p-2 text-zinc-200">{r.ticker}</td>
                          <td className="p-2 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2">
                            <SideBadge side={r.side} />
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.lastDev, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.peakDev, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(r.startMinuteIdx)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(r.minuteIdx)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(dur)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.tierBp ?? null, 0)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.beta ?? null, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.hedgeNotional ?? null, 0)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.rating ?? null, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.total ?? null, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">—</td>
                        </tr>
                      );
                    })}

                  {tab === "closed" &&
                    (closedSorted as TapeArbClosed[]).map((r, i) => {
                      const dur =
                        (r.endMinuteIdx ?? 0) - (r.startMinuteIdx ?? 0);
                      const key = `${r.ticker}|${i}`;
                      const isSel = selectedKey === key;

                      return (
                        <tr
                          key={key}
                          onClick={() => setSelectedKey(key)}
                          className={clsx(
                            "border-t border-white/5 hover:bg-white/[0.03] cursor-pointer",
                            isSel && "bg-emerald-500/[0.06]"
                          )}
                        >
                          <td className="p-2 text-zinc-200">{r.ticker}</td>
                          <td className="p-2 text-zinc-400">{r.benchTicker}</td>
                          <td className="p-2">
                            <SideBadge side={r.side} />
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.endDev, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.peakDev, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(r.startMinuteIdx)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(r.endMinuteIdx)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {intn(dur)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.tierBp ?? null, 0)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.beta ?? null, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.hedgeNotional ?? null, 0)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.rating ?? null, 2)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.total ?? null, 2)}
                          </td>
                          <td
                            className={clsx(
                              "p-2 text-right tabular-nums",
                              (r.totalPnlUsd ?? 0) > 0
                                ? "text-emerald-300"
                                : (r.totalPnlUsd ?? 0) < 0
                                ? "text-rose-300"
                                : "text-zinc-300"
                            )}
                          >
                            {num(r.totalPnlUsd ?? null, 2)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {loading && (
              <div className="mt-3 text-xs font-mono text-zinc-500">
                Loading…
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-3">
            <DetailsPanel
              tab={tab}
              item={selectedItem}
              onClose={() => setSelectedKey("")}
            />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}