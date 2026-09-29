"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import SpinnerInput from "../scout/SpinnerInput";
import {
  cancelReversalAutoOptimizer,
  loadReversalAutoOptParameters,
  pollReversalAutoOptimizer,
  startReversalAutoOptimizer,
  sweepValues,
  type PaperReversalRequestLike,
  type ReversalAutoOptConstraint,
  type ReversalAutoOptMetrics,
  type ReversalAutoOptObjective,
  type ReversalAutoOptParameter,
  type ReversalAutoOptResult,
  type ReversalAutoOptRow,
  type ReversalAutoOptStartRequest,
  type ReversalAutoOptUnit,
} from "../../lib/scanner/reversalAutoOptimizer";

/**
 * AUTO OPTIMIZER — the Reversal Scanner's counterpart to Arbitrage's own AutoOptimizer.tsx (see that
 * file's own header for the shared design this mirrors 1-to-1). The differences all come from
 * Reversal's own model, not from taste:
 *
 *   * No numeric END/EndAbs at all — the exit is the fixed, categorical ExitClass, which per an
 *     explicit user decision is NEVER swept or exposed here, so there is no END row and no
 *     CloseMode-inert logic anywhere in this file (Reversal's CloseMode is a confirmed no-op
 *     regardless of ExitClass).
 *   * Three MIN DEV rows (short / long / max) instead of Arbitrage's four (start short / start long /
 *     start max / end).
 *   * Six ThresholdUnit pills (%, σ, α, γ, τ, λ = pct/sigma/alpha/gamma/atr/lambda) instead of
 *     Arbitrage's five ZAP units.
 *
 * Ticking a unit pill auto-freezes RATING GATES / TAPE FILTERS (held exactly as the scanner has them)
 * and MIN DEV MAX (held), but MIN DEV (short) and MIN DEV (long) keep sweeping independently — shorts
 * and longs are different trades — each on its own FROM/TO, STEP forced to 0.1. This mirrors the
 * SHAPE of Arbitrage's own unitOnly rule, not its exact key names.
 */

const RATING_GROUP = "RATING GATES";
const TAPE_GROUP = "TAPE FILTERS";
const GROUP_ORDER = [RATING_GROUP, TAPE_GROUP] as const;
const GROUP_TITLE: Record<string, string> = { [RATING_GROUP]: "ρ β σ", [TAPE_GROUP]: "TAPE FILTERS" };
const GROUP_HINT: Record<string, string> = {
  [RATING_GROUP]: "ρ · β · σ (MINRATE / MINTOTAL / MinGammaTotal are yours and stay as set)",
  [TAPE_GROUP]: "the same ~34 min / max boxes as the toolbar: ADV, VWAP, spread, volumes, gaps, imbalances…",
};

const UNITS: Array<{ key: ReversalAutoOptUnit; label: string; title: string }> = [
  { key: "pct", label: "%", title: "Raw Stack% points — MIN DEV entered as flat percentage points" },
  { key: "sigma", label: "σ", title: "MIN DEV entered as a multiple of each ticker's own published sigma" },
  { key: "alpha", label: "α", title: "MIN DEV entered as a multiple of each ticker's own published alpha, sign-matched" },
  { key: "gamma", label: "γ", title: "MIN DEV entered as a multiple of each ticker's own matched gamma for this (class, sign)" },
  { key: "atr", label: "τ", title: "MIN DEV entered as a multiple of each ticker's own CURRENT live ATR14% reading" },
  { key: "lambda", label: "λ", title: "MIN DEV entered as a multiple of each ticker's own published lambda" },
];

const OBJECTIVES: Array<{ key: ReversalAutoOptObjective; label: string; title: string }> = [
  { key: "total", label: "TOTAL P&L", title: "Sum of P&L. Rewards trade count - MIN TRADES keeps it honest" },
  { key: "avg", label: "AVG / TRADE", title: "Average P&L per trade" },
  { key: "pf", label: "PROFIT FACTOR", title: "Gross profit / gross loss" },
  { key: "winrate", label: "WIN %", title: "Share of trades that made money" },
  { key: "tstat", label: "T-STAT", title: "mean / (stdev / sqrt(n)): average P&L discounted for how few and how noisy the trades are - the most overfit-resistant" },
];

const RANGE_PRESETS = [5, 10, 20, 40, 65] as const;

type SweepKey = "minDevAbsShort" | "minDevAbsLong" | "minDevAbsMax";
/** Rows that keep sweeping on their own even while a ThresholdUnit is ticked - shorts and longs are
 * different trades, so both keep tuning independently instead of collapsing to one. */
const UNIT_SWEPT_KEYS: SweepKey[] = ["minDevAbsShort", "minDevAbsLong"];
type SweepRow = {
  key: SweepKey; label: string; title: string; on: boolean; from: number; to: number; step: number; decimals: number;
  /** also try the field switched OFF (max only: no cap) */
  offOption: boolean;
  includeOff: boolean;
};

export type ReversalAutoOptimizerCurrent = {
  minDevAbsShort: number;
  minDevAbsLong: string;
  minDevAbsMax: string;
  /** the ThresholdUnit pill the scanner is in */
  unit: ReversalAutoOptUnit;
};

export type ReversalAutoOptimizerProps = {
  open: boolean;
  onClose: () => void;
  /** e.g. `/api/paper/reversal` */
  apiBase: string;
  /** The scanner's own request for a date range - every current setting included. */
  buildBase: (from: string, to: string) => PaperReversalRequestLike;
  /** Trading days, ascending. */
  tradingDays: string[];
  initialFrom: string;
  initialTo: string;
  current: ReversalAutoOptimizerCurrent;
  /** Page-side toggles the bridge cannot see: fixed for the search (ITB / HARD). */
  fixedToggles: { excludeItb: boolean; excludeHard: boolean };
  /**
   * Write a result into the toolbar. `searchedKeys` are the parameters this run was allowed to change;
   * `range` is the date range the run was over, so the page can show the same days.
   */
  onApply: (row: ReversalAutoOptRow, searchedKeys: string[], range: { from: string; to: string }) => void;
  /**
   * Rendered in the page instead of as a window over it: no overlay, no close button, always visible.
   * Selecting a result then applies it and the page below re-draws.
   */
  inline?: boolean;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function defaultSweep(cur: ReversalAutoOptimizerCurrent): SweepRow[] {
  const short = cur.minDevAbsShort > 0 ? cur.minDevAbsShort : 0.5;
  const long = Number(cur.minDevAbsLong) > 0 ? Number(cur.minDevAbsLong) : short;
  const max = Number(cur.minDevAbsMax) > 0 ? Number(cur.minDevAbsMax) : short * 3;
  const stepOf = (v: number) => (v < 0.3 ? 0.05 : 0.1);
  return [
    { key: "minDevAbsShort", label: "MIN DEV (short)", title: "Floor on |15:50 deviation| for a POSITIVE reading (a SHORT entry) - the coral box. Tuned on its own, separately from the long one", on: true, offOption: false, includeOff: false, from: r2(Math.max(0.05, short * 0.6)), to: r2(short * 1.6), step: stepOf(short), decimals: 2 },
    { key: "minDevAbsLong", label: "MIN DEV (long)", title: "Floor on |15:50 deviation| for a NEGATIVE reading (a LONG entry) - the mint box. Tuned on its own, separately from the short one", on: true, offOption: false, includeOff: false, from: r2(Math.max(0.05, long * 0.6)), to: r2(long * 1.6), step: stepOf(long), decimals: 2 },
    { key: "minDevAbsMax", label: "MIN DEV MAX", title: "Upper cap on |15:50 deviation|, either side - the silver box. OFF = no cap", on: false, offOption: true, includeOff: true, from: r2(max * 0.7), to: r2(max * 1.6), step: r2(Math.max(0.1, max * 0.3)), decimals: 2 },
  ];
}

// ---- formatting ---------------------------------------------------------------------------------

const POS = "text-[#6ee7b7]";
const NEG = "text-[#f3a6b2]";
const tone = (v: number) => (v > 0 ? POS : v < 0 ? NEG : "text-zinc-400");
const money = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const money2 = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—");
const pf = (v: number) => (v >= 999999 ? "∞" : Number.isFinite(v) ? v.toFixed(2) : "—");

function numText(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 10) return String(+v.toFixed(2));
  return String(+v.toPrecision(4));
}

function objectiveText(objective: string, v: number): string {
  if (!Number.isFinite(v)) return "—";
  switch (objective) {
    case "total": return money(v);
    case "avg": return money2(v);
    case "pf": return pf(v);
    case "winrate": return pct(v);
    default: return v.toFixed(2);
  }
}

function constraintText(c: ReversalAutoOptConstraint): string {
  if (c.min != null && c.max != null) return `${c.label} ${numText(c.min)} … ${numText(c.max)}`;
  if (c.min != null) return `${c.label} ≥ ${numText(c.min)}`;
  if (c.max != null) return `${c.label} ≤ ${numText(c.max)}`;
  return c.label;
}

/** test average per trade / train average per trade - the share of the edge that carried over. */
function hold(row: ReversalAutoOptRow): number | null {
  if (!row.test || row.test.trades === 0 || row.train.trades === 0) return null;
  if (row.train.avgPnlUsd <= 0) return null;
  return row.test.avgPnlUsd / row.train.avgPnlUsd;
}

function holdTone(h: number | null): string {
  if (h == null) return "text-zinc-500";
  return h >= 0.7 ? POS : h >= 0.3 ? "text-amber-200/90" : NEG;
}

function Metric({ label, value, className, title }: { label: string; value: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className="flex min-w-[64px] flex-col" title={title}>
      <span className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <span className={clsx("text-[12px] font-bold tabular-nums", className ?? "text-zinc-200")}>{value}</span>
    </div>
  );
}

function MetricsBlock({ m, prefix }: { m: ReversalAutoOptMetrics; prefix: string }) {
  return (
    <>
      <Metric label={`${prefix} trades`} value={m.trades.toLocaleString("en-US")} />
      <Metric label={`${prefix} P&L`} value={money(m.totalPnlUsd)} className={tone(m.totalPnlUsd)} />
      <Metric label="avg" value={money2(m.avgPnlUsd)} className={tone(m.avgPnlUsd)} />
      <Metric label="win" value={pct(m.winRate)} />
      <Metric label="PF" value={pf(m.profitFactor)} />
    </>
  );
}

// =================================================================================================

export default function ReversalAutoOptimizer(props: ReversalAutoOptimizerProps) {
  const { open, onClose, apiBase, buildBase, tradingDays, initialFrom, initialTo, current, onApply, inline = false, fixedToggles } = props;

  const [objective, setObjective] = useState<ReversalAutoOptObjective>("total");
  const [preset, setPreset] = useState<number | "custom">(20);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [minTrades, setMinTrades] = useState(50);
  const [validate, setValidate] = useState(true);
  const [topResults, setTopResults] = useState(5);

  const [catalog, setCatalog] = useState<ReversalAutoOptParameter[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** Group switches: a switched-off group is left exactly as it is on the scanner. */
  const [groupOn, setGroupOn] = useState<Record<string, boolean>>({ [RATING_GROUP]: true, [TAPE_GROUP]: true });
  /** UNIT row: the ThresholdUnit pills to try (none ticked = keep the scanner's own unit). */
  const [units, setUnits] = useState<Set<ReversalAutoOptUnit>>(new Set());

  const [sweepOn, setSweepOn] = useState(false);
  const [sweep, setSweep] = useState<SweepRow[]>(() => defaultSweep(current));
  const [maxCombos, setMaxCombos] = useState(40);
  const [refineTop, setRefineTop] = useState(2);

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error" | "cancelled">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReversalAutoOptResult | null>(null);
  const [searchedKeys, setSearchedKeys] = useState<string[]>([]);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  /** The days the current result was searched over - what selecting it shows. */
  const [resultRange, setResultRange] = useState<{ from: string; to: string }>({ from: initialFrom, to: initialTo });
  const [mounted, setMounted] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // The parameter list comes from the bridge, so the picker can never offer something it would not search.
  useEffect(() => {
    if (!open || catalog.length > 0) return;
    let alive = true;
    loadReversalAutoOptParameters(apiBase)
      .then((list) => {
        if (!alive) return;
        setCatalog(list);
        setCatalogError(null);
        setSelected(new Set(list.map((p) => p.key)));
      })
      .catch((e) => alive && setCatalogError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [open, apiBase, catalog.length]);

  // The date range follows the preset, ending on the newest trading day; "custom" is the two boxes.
  useEffect(() => {
    if (preset === "custom" || tradingDays.length === 0) return;
    const end = tradingDays[tradingDays.length - 1];
    const startIdx = Math.max(0, tradingDays.length - preset);
    setFrom(tradingDays[startIdx]);
    setTo(end);
  }, [preset, tradingDays]);

  // Fresh defaults for the threshold grid when the scanner's own thresholds change.
  useEffect(() => {
    setSweep((prev) => {
      const fresh = defaultSweep(current);
      return prev.map((row) => {
        const freshRow = fresh.find((f) => f.key === row.key);
        return row.on ? row : freshRow ?? row;
      });
    });
  }, [current.minDevAbsShort, current.minDevAbsLong, current.minDevAbsMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReversalAutoOptParameter[]>();
    for (const p of catalog) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, params: map.get(g)! }));
  }, [catalog]);

  const toggleParam = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleGroupParams = (params: ReversalAutoOptParameter[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = params.every((p) => next.has(p.key));
      for (const p of params) { if (allOn) next.delete(p.key); else next.add(p.key); }
      return next;
    });

  /**
   * Ticking a ThresholdUnit pill narrows the whole search to that unit and MIN DEV (short)/(long):
   * RATING GATES / TAPE FILTERS are held exactly as they are on the scanner (never touched), and of
   * MIN DEV short / long / max only short and long stay swept - shorts and longs are different
   * trades, so both keep tuning independently, each on its own FROM/TO/STEP. MIN DEV MAX is held at
   * its current scanner value too. Every swept row always starts from the scanner's own value
   * (defaultSweep already centres FROM/TO on it) and is always checked in steps of 0.1.
   */
  const unitOnly = units.size > 0;
  const sweepRowsAll = sweep.filter((r) => r.on);
  const sweepRows = unitOnly ? sweepRowsAll.filter((r) => UNIT_SWEPT_KEYS.includes(r.key)) : sweepRowsAll;
  const comboCount = (sweepRows.length || units.size ? 1 : 0)
    + sweepRows.reduce((acc, r) => acc + sweepValues(r.from, r.to, unitOnly ? 0.1 : r.step).length + (r.offOption && r.includeOff ? 1 : 0), 0)
    + (units.size > 1 ? units.size : 0);

  const busy = status === "running";
  const rangeOk = !!from && !!to && from <= to;
  const activeKeys = useMemo(
    () => (unitOnly ? [] : catalog.filter((p) => selected.has(p.key) && groupOn[p.group] !== false).map((p) => p.key)),
    [catalog, selected, groupOn, unitOnly],
  );
  const canRun = !busy && rangeOk && activeKeys.length + (sweepOn && (sweepRows.length || units.size) ? 1 : 0) > 0;

  const run = useCallback(async () => {
    if (!canRun) return;
    setError(null);
    setResult(null);
    setAppliedIndex(null);
    setResultRange({ from, to });
    setProgress(0);
    setMessage("starting");
    setStatus("running");
    const keys = activeKeys;
    setSearchedKeys(keys);

    const valuesFor = (key: SweepKey): Array<number | null> | undefined => {
      const row = sweep.find((r) => r.key === key);
      if (!row || !row.on) return undefined;
      if (unitOnly && !UNIT_SWEPT_KEYS.includes(row.key)) return undefined;
      const values: Array<number | null> = sweepValues(row.from, row.to, unitOnly ? 0.1 : row.step);
      if (row.offOption && row.includeOff) values.unshift(null);
      return values;
    };
    const numbers = (key: SweepKey): number[] | undefined => valuesFor(key)?.filter((v): v is number => v != null);
    const thresholds = sweepOn && (sweepRows.length || units.size)
      ? {
          minDevAbsShort: numbers("minDevAbsShort"),
          minDevAbsLong: numbers("minDevAbsLong"),
          minDevAbsMax: valuesFor("minDevAbsMax"),
          units: units.size ? Array.from(units) : undefined,
          maxVariants: maxCombos,
          topVariants: refineTop,
        }
      : null;

    const body: ReversalAutoOptStartRequest = {
      base: buildBase(from, to),
      objective,
      minTrades,
      validate,
      topResults,
      parameterKeys: keys,
      thresholds,
      excludeItb: fixedToggles.excludeItb,
      excludeHard: fixedToggles.excludeHard,
    };

    try {
      const id = await startReversalAutoOptimizer(apiBase, body);
      setJobId(id);
      stopPolling();
      const tick = async () => {
        try {
          const s = await pollReversalAutoOptimizer(apiBase, id);
          setProgress(s.progress);
          setMessage(s.message);
          if (s.status === "running") return;
          stopPolling();
          setStatus(s.status);
          if (s.status === "done") setResult(s.result);
          if (s.status === "error") setError(s.error ?? "search failed");
        } catch (e: any) {
          if (/404/.test(String(e?.message))) {
            stopPolling();
            setStatus("error");
            setError("The bridge no longer knows this search (it restarted?). Run it again.");
          }
        }
      };
      pollRef.current = window.setInterval(tick, 1200);
      void tick();
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  }, [canRun, activeKeys, sweepOn, sweepRows, sweep, units, maxCombos, refineTop, buildBase, from, to, objective, minTrades, validate, topResults, fixedToggles.excludeItb, fixedToggles.excludeHard, apiBase, stopPolling]);

  const cancel = useCallback(async () => {
    if (jobId) await cancelReversalAutoOptimizer(apiBase, jobId);
  }, [apiBase, jobId]);

  if (!inline && (!mounted || !open)) return null;

  const cell = "whitespace-nowrap";
  const rows: Array<{ tag: string; row: ReversalAutoOptRow; isCurrent: boolean; index: number }> = [];
  if (result) {
    rows.push({ tag: "CURRENT", row: result.current, isCurrent: true, index: -1 });
    result.results.forEach((row, i) => rows.push({ tag: `#${i + 1}`, row, isCurrent: false, index: i }));
  }
  const hasTest = !!result && result.validate && result.testDays > 0;

  const card = (
      <div className={inline
        ? "scanner-glass-card relative w-full rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl"
        : "scanner-glass-card relative w-full max-w-[1480px] rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/95 shadow-[0_20px_80px_rgba(0,0,0,0.55)]"}>
        {/* ---- title ---- */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[13px] font-bold uppercase tracking-[0.2em] accent-text">AUTO OPTIMIZER</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">finds the best filter configuration over a date range</span>
          </div>
          {!inline && (
            <button type="button" onClick={onClose} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)} title="Close (a running search keeps going)">✕</button>
          )}
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* ---- objective / range / floor - one row ---- */}
          <section className="flex flex-col gap-3">
            <div className="flex h-7 flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">metric</span>
              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                {OBJECTIVES.map((o) => (
                  <button key={o.key} type="button" title={o.title} disabled={busy} onClick={() => setObjective(o.key)}
                    className={clsx(TOOLBAR_BUTTON_BASE, objective === o.key ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}>
                    {o.label}
                  </button>
                ))}
              </div>

              <span className="h-7 w-px self-center bg-white/5" />

              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">dates</span>
              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                {RANGE_PRESETS.map((d) => (
                  <button key={d} type="button" disabled={busy} onClick={() => setPreset(d)} title={`The last ${d} trading days`}
                    className={clsx(TOOLBAR_BUTTON_BASE, preset === d ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}>
                    {d}D
                  </button>
                ))}
                <button type="button" disabled={busy} onClick={() => setPreset("custom")}
                  className={clsx(TOOLBAR_BUTTON_BASE, preset === "custom" ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}>
                  CUSTOM
                </button>
              </div>
              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/45 px-3">
                <input type="date" value={from} disabled={busy || preset !== "custom"} onChange={(e) => setFrom(e.target.value)}
                  className="h-7 bg-transparent font-mono text-[11px] text-zinc-200 outline-none disabled:opacity-60" aria-label="from" />
                <span className="font-mono text-[10px] text-zinc-600">→</span>
                <input type="date" value={to} disabled={busy || preset !== "custom"} onChange={(e) => setTo(e.target.value)}
                  className="h-7 bg-transparent font-mono text-[11px] text-zinc-200 outline-none disabled:opacity-60" aria-label="to" />
              </div>
              {!rangeOk && <span className="font-mono text-[10px] text-rose-300">pick a valid range</span>}

              <span className="h-7 w-px self-center bg-white/5" />

              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">limits</span>
              <SpinnerInput label="MIN TRADES" ariaLabel="min trades" widthClass="w-16" value={minTrades} step={10} min={1} decimals={0}
                title="A configuration that leaves fewer trades than this (in the training days when VALIDATE is on) is never considered - the guard against a lucky handful"
                onChange={(v) => setMinTrades(Math.max(1, Math.trunc(v)))} />
              <button type="button" disabled={busy} onClick={() => setValidate((v) => !v)}
                className={clsx(TOOLBAR_BUTTON_BASE, validate ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
                title="Search on the OLDEST 70% of the days and report each result on the NEWEST 30%, which the search never saw">
                VALIDATE 70/30
              </button>
              <SpinnerInput label="SHOW TOP" ariaLabel="results shown" widthClass="w-12" value={topResults} step={1} min={1} max={20} decimals={0}
                title="How many configurations to list" onChange={(v) => setTopResults(Math.max(1, Math.min(20, Math.trunc(v))))} />
            </div>
          </section>

          {/* ---- what may be changed: two groups ---- */}
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                what the search may change <span className="text-zinc-700">- two groups; everything else on the scanner is left alone</span>
              </span>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-500">
              <span className="uppercase tracking-widest text-zinc-400">never touched:</span> MINRATE · MINTOTAL · MinGammaTotal, EXIT CLASS, the red toggles (ITB · HARD · NEWS · PTP · SSR · ETF · CRAP), REP, USA / CHINA and the COUNTRY / EXCHANGE / SECTOR lists.
              The gate is baked into the day build itself, so every result implicitly keeps it: only trades that already cleared it were ever simulated.
            </div>
            {catalogError && <div className="font-mono text-[11px] text-rose-300">Could not load the parameter list: {catalogError}</div>}

            {grouped.map(({ group, params }) => {
              const enabled = !unitOnly && groupOn[group] !== false;
              const onCount = params.filter((p) => selected.has(p.key)).length;
              const isOpen = expanded[group] ?? false;
              return (
                <div key={group} className={clsx("rounded-xl border bg-black/20", enabled ? "border-white/[0.08]" : "border-white/[0.04] opacity-60")}>
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <button type="button" disabled={busy || unitOnly} onClick={() => setGroupOn((g) => ({ ...g, [group]: !enabled }))}
                      className={clsx(TOOLBAR_BUTTON_BASE, "w-[120px]", enabled ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
                      title={unitOnly ? "Held as it is on the scanner while a ThresholdUnit is ticked - untick every unit to tune this group again" : enabled ? "Switch the whole group off: the search leaves it exactly as it is on the scanner" : "Switch the group on: the search may tune it"}>
                      {GROUP_TITLE[group] ?? group}
                    </button>
                    <span className="font-mono text-[10px] text-zinc-500">{enabled ? onCount : 0}/{params.length} boxes</span>
                    <span className="hidden font-mono text-[10px] text-zinc-600 md:inline">{unitOnly ? "held at its scanner value - a ThresholdUnit is ticked" : GROUP_HINT[group]}</span>
                    <button type="button" onClick={() => setExpanded((p) => ({ ...p, [group]: !isOpen }))}
                      className="ml-auto font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200">
                      {isOpen ? "hide boxes ▴" : "pick boxes ▾"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.04] px-3 py-2">
                      <button type="button" disabled={busy || !enabled} onClick={() => toggleGroupParams(params)}
                        className="h-6 rounded-md border border-transparent bg-black/30 px-2 font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-100">
                        {onCount === params.length ? "none" : "all"}
                      </button>
                      {params.map((p) => (
                        <button key={p.key} type="button" disabled={busy || !enabled} onClick={() => toggleParam(p.key)}
                          className={clsx(
                            "h-6 rounded-md border px-2 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors",
                            selected.has(p.key)
                              ? "border-white/15 bg-white/10 text-zinc-100"
                              : "border-transparent bg-black/30 text-zinc-500 hover:text-zinc-300",
                          )}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ---- UNIT: ThresholdUnit pills + MIN DEV thresholds ---- */}
            <div className={clsx("rounded-xl border bg-black/20", sweepOn ? "border-white/[0.08]" : "border-white/[0.04] opacity-60")}>
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button type="button" disabled={busy} onClick={() => setSweepOn((v) => !v)}
                  className={clsx(TOOLBAR_BUTTON_BASE, "w-[120px]", sweepOn ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
                  title="Also tune the ThresholdUnit and the MIN DEV thresholds. Each combination rebuilds every day from the tape, so this is slow - keep the grid small">
                  UNIT
                </button>
                <span className="font-mono text-[10px] text-zinc-500">
                  {sweepOn
                    ? `${sweepRows.length || units.size ? comboCount.toLocaleString("en-US") : 0}-${sweepRows.length || units.size ? comboCount * 2 : 0} day builds${comboCount > maxCombos ? ` (capped at ${maxCombos})` : ""}: shorts and longs are tuned separately, each dimension in turn`
                    : "off - unit and thresholds stay as they are on the scanner"}
                </span>
              </div>
              {sweepOn && (
                <div className="flex flex-col gap-2 border-t border-white/[0.04] px-3 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-[112px] font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">unit</span>
                    <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                      {UNITS.map((u) => (
                        <button key={u.key} type="button" disabled={busy} title={u.title}
                          onClick={() => setUnits((prev) => { const n = new Set(prev); if (n.has(u.key)) n.delete(u.key); else n.add(u.key); return n; })}
                          className={clsx(TOOLBAR_BUTTON_BASE, units.has(u.key) ? "bg-violet-500 text-white border-transparent" : TOOLBAR_BUTTON_INACTIVE)}>
                          {u.label}
                        </button>
                      ))}
                    </div>
                    <span className="font-mono text-[10px] text-zinc-600">
                      {unitOnly
                        ? `only the unit and MIN DEV (short / long) are tuned, each on its own, from the scanner's own values in steps of 0.1 - RATING GATES, TAPE FILTERS and MIN DEV MAX stay exactly as they are`
                        : `none ticked - keeps the scanner's own unit (${UNITS.find((u) => u.key === current.unit)?.label ?? "%"})`}
                    </span>
                  </div>
                  {sweep.map((row) => {
                    const isSwept = row.on && (!unitOnly || UNIT_SWEPT_KEYS.includes(row.key));
                    const heldByUnit = unitOnly && row.on && !UNIT_SWEPT_KEYS.includes(row.key);
                    return (
                    <div key={row.key} className="flex flex-wrap items-center gap-3">
                      <button type="button" disabled={busy} title={row.title}
                        onClick={() => setSweep((prev) => prev.map((r) => (r.key === row.key ? { ...r, on: !r.on } : r)))}
                        className={clsx(TOOLBAR_BUTTON_BASE, "w-[128px]", row.on ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}>
                        {row.label}
                      </button>
                      {isSwept ? (
                        <>
                          <SpinnerInput label="FROM" ariaLabel={`${row.label} from`} widthClass="w-14" value={row.from} step={unitOnly ? 0.1 : row.step} min={0} decimals={row.decimals}
                            onChange={(v) => setSweep((prev) => prev.map((r) => (r.key === row.key ? { ...r, from: v } : r)))} />
                          <SpinnerInput label="TO" ariaLabel={`${row.label} to`} widthClass="w-14" value={row.to} step={unitOnly ? 0.1 : row.step} min={0} decimals={row.decimals}
                            onChange={(v) => setSweep((prev) => prev.map((r) => (r.key === row.key ? { ...r, to: v } : r)))} />
                          {unitOnly ? (
                            <span className="flex h-7 items-center gap-2 pl-3 pr-3 rounded-lg bg-black/45 font-mono text-[10px] text-zinc-500" title="Fixed at 0.1 while a ThresholdUnit is ticked">
                              STEP <span className="text-zinc-300">0.1</span>
                            </span>
                          ) : (
                            <SpinnerInput label="STEP" ariaLabel={`${row.label} step`} widthClass="w-14" value={row.step} step={0.05} min={0.01} decimals={2}
                              onChange={(v) => setSweep((prev) => prev.map((r) => (r.key === row.key ? { ...r, step: v } : r)))} />
                          )}
                          {row.offOption && !unitOnly && (
                            <button type="button" disabled={busy}
                              onClick={() => setSweep((prev) => prev.map((r) => (r.key === row.key ? { ...r, includeOff: !r.includeOff } : r)))}
                              className={clsx(TOOLBAR_BUTTON_BASE, row.includeOff ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
                              title="Also try this box switched OFF, so the search can decide whether it is worth using at all">
                              + OFF
                            </button>
                          )}
                          <span className="font-mono text-[10px] text-zinc-600">
                            {[...(row.offOption && row.includeOff && !unitOnly ? ["off"] : []), ...sweepValues(row.from, row.to, unitOnly ? 0.1 : row.step)].join(" · ") || "no values"}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-[10px] text-zinc-700">
                          {heldByUnit
                            ? "held - only MIN DEV (short / long) are swept while a ThresholdUnit is ticked"
                            : row.key === "minDevAbsShort" ? `now ${current.minDevAbsShort}` : row.key === "minDevAbsLong" ? (current.minDevAbsLong ? `now ${current.minDevAbsLong}` : "now off (same as short)") : (current.minDevAbsMax ? `now ${current.minDevAbsMax}` : "now off")}
                        </span>
                      )}
                    </div>
                  );})}
                  <div className="flex flex-wrap items-center gap-3">
                    <SpinnerInput label="MAX BUILDS" ariaLabel="max builds" widthClass="w-14" value={maxCombos} step={4} min={1} max={60} decimals={0}
                      title="Hard ceiling on threshold combinations whose days are built from the tape" onChange={(v) => setMaxCombos(Math.max(1, Math.min(60, Math.trunc(v))))} />
                    <SpinnerInput label="REFINE TOP" ariaLabel="refine top" widthClass="w-12" value={refineTop} step={1} min={1} max={6} decimals={0}
                      title="How many of the best combinations then get the full filter search" onChange={(v) => setRefineTop(Math.max(1, Math.min(6, Math.trunc(v))))} />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ---- run ---- */}
          <section className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={run} disabled={!canRun}
              className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE, "!h-8 px-5", !canRun && "cursor-not-allowed opacity-50")}>
              {busy ? "SEARCHING…" : result ? "RUN AGAIN" : "RUN"}
            </button>
            {busy && (
              <button type="button" onClick={cancel} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE, "!h-8")}>CANCEL</button>
            )}
            {(busy || status === "cancelled") && (
              <div className="flex min-w-[260px] flex-1 items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-white/40 transition-all duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className="font-mono text-[10px] text-zinc-500">{status === "cancelled" ? "cancelled" : `${Math.round(progress * 100)}% · ${message}`}</span>
              </div>
            )}
            {error && <span className="font-mono text-[11px] text-rose-300">Search failed: {error}</span>}
          </section>

          {/* ---- results ---- */}
          {result && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] text-zinc-500">
                <span>{result.universe.toLocaleString("en-US")} trades over {result.days} days</span>
                {hasTest && <span>train {result.days - result.testDays}d · test {result.testDays}d</span>}
                <span>metric: {OBJECTIVES.find((o) => o.key === result.objective)?.label ?? result.objective}</span>
                <span>{result.elapsedSeconds.toFixed(1)}s</span>
              </div>

              {result.results.length === 0 && (
                <div className="font-mono text-[11px] text-amber-200/90">
                  No configuration keeps at least {result.minTrades} trades{result.validate ? " in the training days" : ""}
                  {result.universe === 0 ? " — there are no trades in this range with the scanner's current engine settings." : ". Lower MIN TRADES, widen the dates or tick fewer parameters."}
                </div>
              )}

              {result.results.length > 0 && hasTest && (() => {
                const h = hold(result.results[0]);
                return h != null && h < 0.3 ? (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 font-mono text-[11px] text-amber-200/90">
                    The best configuration kept only {Math.round(h * 100)}% of its per-trade edge on the held-out days: it looks fitted to the training days. Prefer a row with a higher HOLD and STABLE, or widen the dates.
                  </div>
                ) : null;
              })()}

              <div className="flex flex-col gap-2">
                {rows.map(({ tag, row, isCurrent, index }) => {
                  const h = hold(row);
                  const dObj = row.objective - result.current.objective;
                  const th = row.thresholds;
                  const cur = result.current.thresholds;
                  const thresholdChanged = th.minDevAbsShort !== cur.minDevAbsShort || th.minDevAbsLong !== cur.minDevAbsLong || th.minDevAbsMax !== cur.minDevAbsMax || th.unit !== cur.unit;
                  return (
                    <div key={tag}
                      onClick={isCurrent ? undefined : () => { onApply(row, searchedKeys, resultRange); setAppliedIndex(index); }}
                      className={clsx(
                        "rounded-xl border px-3 py-2.5 transition-colors",
                        isCurrent ? "border-white/[0.05] bg-white/[0.02]" : "cursor-pointer bg-black/25 hover:border-white/[0.16]",
                        !isCurrent && (appliedIndex === index ? "border-white/30 bg-white/[0.05]" : "border-white/[0.08]"),
                      )}>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono">
                        <div className="flex w-[72px] flex-col">
                          <span className={clsx("text-[12px] font-bold", isCurrent ? "text-zinc-500" : "accent-text")}>{tag}</span>
                          {!isCurrent && Number.isFinite(dObj) && (
                            <span className={clsx("text-[9px]", tone(dObj))} title="Change of the chosen metric against CURRENT, on the training days">
                              Δ {objectiveText(result.objective, dObj)}
                            </span>
                          )}
                        </div>
                        <MetricsBlock m={row.train} prefix={hasTest ? "train" : ""} />
                        {hasTest && row.test && (
                          <>
                            <span className="h-8 w-px bg-white/10" />
                            <Metric label="test trades" value={row.test.trades.toLocaleString("en-US")} />
                            <Metric label="test P&L" value={money(row.test.totalPnlUsd)} className={tone(row.test.totalPnlUsd)} />
                            <Metric label="hold" value={h == null ? "—" : `${Math.round(h * 100)}%`} className={holdTone(h)} title="test average per trade / train average per trade" />
                          </>
                        )}
                        {row.stability && (
                          <Metric label="stable" className={row.stability.share >= 0.7 ? POS : row.stability.share >= 0.4 ? "text-amber-200/90" : NEG}
                            value={`${Math.round(row.stability.share * 100)}%`}
                            title={`${row.stability.neighbours} neighbouring settings tried; the weakest kept ${Math.round(row.stability.worst * 100)}% of the score`} />
                        )}
                        <div className="ml-auto">
                          {isCurrent ? (
                            <span className="text-[10px] uppercase tracking-widest text-zinc-600">your toolbar now</span>
                          ) : (
                            <button type="button" className={clsx(TOOLBAR_BUTTON_BASE, appliedIndex === index ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
                              onClick={() => { onApply(row, searchedKeys, resultRange); setAppliedIndex(index); }}
                              title="Write this configuration into the scanner's toolbar and show its trades, charts and statistics">
                              {appliedIndex === index ? "SHOWING ✓" : "SHOW"}
                            </button>
                          )}
                        </div>
                      </div>

                      {(thresholdChanged || isCurrent) && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-400">
                          <span className="uppercase tracking-widest text-zinc-600">thresholds</span>
                          <span>UNIT {UNITS.find((u) => u.key === th.unit)?.label ?? "%"}</span>
                          <span>MIN DEV(short) {th.minDevAbsShort ?? "—"}</span>
                          <span>MIN DEV(long) {th.minDevAbsLong ?? "—"}</span>
                          <span>MIN DEV MAX {th.minDevAbsMax ?? "off"}</span>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.constraints.length === 0 && row.denied.length === 0 && (
                          <span className="font-mono text-[10px] text-zinc-600">{isCurrent ? "no tunable filters set" : "no filters — the unfiltered universe"}</span>
                        )}
                        {row.constraints.map((c) => (
                          <span key={c.key} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-zinc-300" title={c.group}>
                            {constraintText(c)}
                          </span>
                        ))}
                        {row.denied.map((d) => (
                          <span key={d.key} className="rounded-md border border-[rgba(243,166,178,0.2)] bg-[rgba(243,166,178,0.06)] px-2 py-0.5 font-mono text-[10px] text-[#f3a6b2]/90"
                            title={d.values.join(", ")}>
                            ✕ {d.label}: {d.values.length > 3 ? `${d.values.slice(0, 3).join(", ")} +${d.values.length - 3}` : d.values.join(", ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {result.variants.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    thresholds tried — the best filter configuration re-scored under each, best first (✓ = also searched in full)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-mono text-[11px]">
                      <thead>
                        <tr className="text-[9px] tracking-[0.12em] text-zinc-600">
                          {["", "UNIT", "MIN DEV (short)", "MIN DEV (long)", "MIN DEV MAX", "TRADES", "P&L", "AVG", "WIN", "PF"].map((h, i) => (
                            <th key={i} className={clsx("px-2 py-1.5 font-semibold", i === 0 ? "text-left" : "text-right")}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.variants.map((v, i) => (
                          <tr key={i} className="border-t border-white/[0.04] text-zinc-300">
                            <td className={clsx(cell, "px-2 py-1 text-left", v.refined ? "accent-text" : "text-zinc-700")}>{v.refined ? "✓" : ""}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{UNITS.find((u) => u.key === v.thresholds.unit)?.label ?? "%"}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{v.thresholds.minDevAbsShort ?? "—"}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{v.thresholds.minDevAbsLong ?? "—"}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{v.thresholds.minDevAbsMax ?? "off"}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{v.train.trades.toLocaleString("en-US")}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right font-bold", tone(v.train.totalPnlUsd))}>{money(v.train.totalPnlUsd)}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right", tone(v.train.avgPnlUsd))}>{money2(v.train.avgPnlUsd)}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{pct(v.train.winRate)}</td>
                            <td className={clsx(cell, "px-2 py-1 text-right")}>{pf(v.train.profitFactor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="font-mono text-[10px] leading-relaxed text-zinc-500">
                {result.notes.map((n, i) => <div key={i}>• {n}</div>)}
                <div>
                  • CURRENT is your toolbar scored on exactly these trades by the scanner's own filters - the number a result has to beat. Results are grown one constraint at a time
                  (best single move first, several starting moves in parallel, then polished), so they are good local optima, not a proof of the global one.
                </div>
                <div>
                  • HOLD = test average per trade / train average: near or above 100% means the edge carried over, far below (or red) means it was fitted to noise.
                  STABLE = share of one-step-away settings that keep at least 80% of the score: high is a plateau, low is a needle only these exact numbers hit.
                </div>
                <div>• Selecting a configuration writes every parameter this run was allowed to change into the toolbar (those in the result take its value, the ticked ones it left out are cleared), sets the same dates, and re-draws the statistics and charts below. The rest of the toolbar is untouched.</div>
              </div>
            </section>
          )}
        </div>
      </div>
  );

  if (inline) return card;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {card}
    </div>,
    document.body,
  );
}
