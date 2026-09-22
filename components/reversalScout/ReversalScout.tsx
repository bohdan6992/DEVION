"use client";

/**
 * REVERSAL SCOUT — copied from ArbitrageScout (components/scout/ArbitrageScout.tsx) 1-to-1 in look
 * and control mechanism; the data underneath is Reversal's own. What is genuinely different, not a
 * styling choice — see lib/reversalScout/types.ts's own header comment for the full list:
 *
 *   5 exit classes (EXIT18/EXIT21/EXIT04/EXIT07/PRINT=09:30), not 4 birth windows
 *   4 unit modes (%/σ/α/γ), not Arbitrage's own set — Reversal has no beta/corr/delta per ticker;
 *   σ here is a LOCAL per-ticker stdev of entry deviations in view, distinct from the published
 *   per-ticker sigma the v2 wire also carries (parsed, not yet wired into this toggle)
 *   WIN/LOSS, not hard/soft — RATING (published) and WIN (of the trades in view) both survive
 *   no peak/gap → no "by time" reversion chart group, only the equity curve
 *   BEST SETTINGS is not wired yet (said out loud below, not silently dropped)
 *
 * Reversal's own trade: at 15:50 read the stack's own Stack% value; |it| > 0.5 pp is a signal — SHORT
 * a HIGH one, LONG a LOW one. Entry at 16:00, exit at the class's own clock time (a checkpoint with no
 * exact print reads the nearest one — see Reversal.ipynb). PnL is the raw Stack% move, no bench.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import { useUi } from "../UiProvider";
import { EquityChart } from "../scanner/shared/charts";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { intn, minuteIdxToClockLabel } from "../../lib/scanner/format";
import type { TriMode } from "../../lib/scanner/types";
import {
  buildCurve,
  computeReversalAnalytics,
  computeReversalScout,
  maxDrawdown,
  REVERSAL_MODES,
  sortRows,
  tickerSeries,
  tickerTradeRows,
} from "../../lib/reversalScout/compute";
import type { SortDir } from "../../lib/reversalScout/compute";
import { loadReversalScoutMeta, loadReversalScoutSlice } from "../../lib/reversalScout/client";
import type {
  ReversalClass,
  ReversalCurveMode,
  ReversalMeta,
  ReversalMode,
  ReversalParams,
  ReversalSide,
  ReversalSlice,
  ReversalSortKey,
  ReversalWindow,
} from "../../lib/reversalScout/types";
import SpinnerInput from "../scout/SpinnerInput";
import ScoutUnitBar from "../scout/ScoutUnitBar";
import { daysBehind } from "../../lib/scout/freshness";
import ReversalRangeBox from "./ReversalRangeBox";
import { EMPTY_RANGE_TEXT, loadRangeText, parseRanges, type RangeText } from "../../lib/reversalScout/ranges";

const CLASSES: Array<{ key: ReversalClass; label: string; hint: string }> = [
  { key: "exit18", label: "EXIT18", hint: "exit at 18:00" },
  { key: "exit21", label: "EXIT21", hint: "exit at 21:00" },
  { key: "exit04", label: "EXIT04", hint: "exit at 04:00 the next morning" },
  { key: "exit07", label: "EXIT07", hint: "exit at 07:00 the next morning" },
  { key: "print", label: "PRINT", hint: "exit at 09:30 the next morning (the notebook's own name for it)" },
];
const SIDES: Array<{ key: ReversalSide; label: string; hint: string }> = [
  { key: "short", label: "SHORT", hint: "the stack was HIGH at 15:50 (+dev) → SHORT it" },
  { key: "long", label: "LONG", hint: "the stack was LOW at 15:50 (−dev) → LONG it" },
  { key: "both", label: "BOTH", hint: "both directions together" },
];
const WINDOWS: ReversalWindow[] = [5, 20, 40, 65];
const MODES: ReversalMode[] = ["pct", "sigma", "alpha", "gamma"];
const SORT_BUTTONS: Array<{ key: ReversalSortKey; label: string }> = [
  { key: "alpha", label: "ALPHA" },
  { key: "rating", label: "RATING" },
  { key: "start", label: "START" },
  { key: "pnl", label: "P&L" },
  { key: "trades", label: "TRADES" },
];

const UI_KEY = "scout.reversal.ui.v1";
const PAGE_ROWS = 200;

type Bounds = Record<ReversalMode, { start: number; to: number }>;
type UiState = {
  cls: ReversalClass;
  side: ReversalSide;
  window: ReversalWindow;
  mode: ReversalMode;
  bounds: Bounds;
  minRate: number;
  minTotal: number;
  ranges: RangeText;
  capPct: number;
  sizeUsd: number;
  sortKey: ReversalSortKey;
  sortDir: SortDir;
  curveMode: ReversalCurveMode;
  excludeEtf: boolean;
  countryMode: TriMode;
  countries: string[];
  sectorMode: TriMode;
  sectors: string[];
};

const DEFAULT_UI: UiState = {
  cls: "print",
  side: "both",
  window: 20,
  mode: "pct",
  bounds: {
    pct: { start: 0.5, to: 0 },
    sigma: { start: 0, to: 0 },
    alpha: { start: 0, to: 0 },
    gamma: { start: 0, to: 0 },
  },
  minRate: 0,
  minTotal: 2,
  ranges: EMPTY_RANGE_TEXT,
  // a print this wide is a broken Stack%, not a trade — same bar the other two Scouts use
  capPct: 25,
  sizeUsd: 1000,
  sortKey: "rating",
  sortDir: "desc",
  curveMode: "daily",
  excludeEtf: false,
  countryMode: "off",
  countries: [],
  sectorMode: "off",
  sectors: [],
};

function loadUi(): UiState {
  try {
    if (typeof window === "undefined") return DEFAULT_UI;
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT_UI;
    const j = JSON.parse(raw) as Partial<UiState>;
    const pick = <T,>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
    const numOr = (v: unknown, d: number, lo = 0) => (typeof v === "number" && Number.isFinite(v) && v >= lo ? v : d);
    const bounds = { ...DEFAULT_UI.bounds };
    for (const m of MODES) {
      const b = (j.bounds as Partial<Bounds> | undefined)?.[m];
      if (b) bounds[m] = { start: numOr(b.start, 0), to: numOr(b.to, 0) };
    }
    return {
      cls: pick(j.cls, CLASSES.map((c) => c.key), DEFAULT_UI.cls),
      side: pick(j.side, SIDES.map((s) => s.key), DEFAULT_UI.side),
      window: pick(j.window, WINDOWS, DEFAULT_UI.window),
      mode: pick(j.mode, MODES, DEFAULT_UI.mode),
      bounds,
      minRate: numOr(j.minRate, DEFAULT_UI.minRate),
      minTotal: numOr(j.minTotal, DEFAULT_UI.minTotal),
      ranges: loadRangeText(j.ranges),
      capPct: numOr(j.capPct, DEFAULT_UI.capPct),
      sizeUsd: numOr(j.sizeUsd, DEFAULT_UI.sizeUsd),
      sortKey: pick(j.sortKey, ["ticker", "alpha", "rating", "start", "entryTime", "trades", "pnl", "avgPnl", "win"] as ReversalSortKey[], DEFAULT_UI.sortKey),
      sortDir: pick(j.sortDir, ["asc", "desc"] as SortDir[], DEFAULT_UI.sortDir),
      curveMode: pick(j.curveMode, ["daily", "trade"] as ReversalCurveMode[], DEFAULT_UI.curveMode),
      excludeEtf: j.excludeEtf === true,
      countryMode: pick(j.countryMode, ["off", "include", "exclude"] as TriMode[], DEFAULT_UI.countryMode),
      countries: Array.isArray(j.countries) ? j.countries.filter((v): v is string => typeof v === "string") : DEFAULT_UI.countries,
      sectorMode: pick(j.sectorMode, ["off", "include", "exclude"] as TriMode[], DEFAULT_UI.sectorMode),
      sectors: Array.isArray(j.sectors) ? j.sectors.filter((v): v is string => typeof v === "string") : DEFAULT_UI.sectors,
    };
  } catch {
    return DEFAULT_UI;
  }
}

// ---------------------------------------------------------------------------------------------
// formatting (identical to ArbitrageScout's own)
// ---------------------------------------------------------------------------------------------

const isNum = (v: number) => Number.isFinite(v);
const fx = (v: number, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
const pct1 = (v: number) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : "—");
function usd(v: number, d = 0): string {
  if (!isNum(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v < 0 ? "−" : ""}$${s}`;
}
function numSpaced(v: number, d = 2): string {
  if (!isNum(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, " ");
}
const signTone = (v: number, light: boolean) =>
  !isNum(v) || v === 0
    ? "text-zinc-400"
    : v > 0
      ? light ? "text-emerald-700" : "text-[#6ee7b7]"
      : light ? "text-rose-700" : SOFT_LOSS_TEXT_CLASS;
const ratingTone = (v: number) => (!isNum(v) ? "text-zinc-600" : v >= 0.5 ? "accent-text" : v >= 0.3 ? "text-zinc-200" : "text-zinc-500");

function sortMark(active: boolean, dir: SortDir) {
  return active ? (dir === "asc" ? " ↑" : " ↓") : "";
}

const svgProps = {
  "aria-hidden": true,
  width: 11,
  height: 11,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ---------------------------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------------------------

export default function ReversalScout() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";

  const [ui, setUi] = useState<UiState>(loadUi);
  const patch = useCallback((p: Partial<UiState>) => setUi((prev) => ({ ...prev, ...p })), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { window.localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [ui]);

  // ---- data
  const [meta, setMeta] = useState<ReversalMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(true);

  const loadMeta = useCallback((force: boolean) => {
    setMetaBusy(true);
    setMetaError(null);
    loadReversalScoutMeta(force)
      .then((m) => { setMeta(m); })
      .catch((e) => setMetaError(String(e?.message ?? e)))
      .finally(() => setMetaBusy(false));
  }, []);
  useEffect(() => { loadMeta(false); }, [loadMeta]);

  const signs = ui.side === "short" ? (["pos"] as const) : ui.side === "long" ? (["neg"] as const) : (["pos", "neg"] as const);
  const sliceKey = `${ui.cls}:${signs.join("+")}`;
  const [slices, setSlices] = useState<{ key: string; data: ReversalSlice[] } | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const sliceReq = useRef(0);

  useEffect(() => {
    if (!meta) return;
    const req = ++sliceReq.current;
    setSliceError(null);
    Promise.all(signs.map((s) => loadReversalScoutSlice(ui.cls, s)))
      .then((data) => { if (req === sliceReq.current) setSlices({ key: sliceKey, data }); })
      .catch((e) => { if (req === sliceReq.current) setSliceError(String(e?.message ?? e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sliceKey]);

  const activeSlices = slices && slices.key === sliceKey ? slices.data : null;
  const sliceLoading = !!meta && !activeSlices && !sliceError;

  // ---- compute
  const countriesSet = useMemo(() => new Set(ui.countries), [ui.countries]);
  const sectorsSet = useMemo(() => new Set(ui.sectors), [ui.sectors]);
  const params: ReversalParams = useMemo(() => ({
    window: ui.window,
    mode: ui.mode,
    start: ui.bounds[ui.mode].start,
    to: ui.bounds[ui.mode].to,
    minRate: ui.minRate,
    minTotal: ui.minTotal,
    ranges: parseRanges(ui.ranges),
    capPct: ui.capPct,
    sizeUsd: ui.sizeUsd,
    excludeEtf: ui.excludeEtf,
    countryMode: ui.countryMode,
    countries: countriesSet,
    sectorMode: ui.sectorMode,
    sectors: sectorsSet,
  }), [ui.window, ui.mode, ui.bounds, ui.minRate, ui.minTotal, ui.ranges, ui.capPct, ui.sizeUsd, ui.excludeEtf, ui.countryMode, countriesSet, ui.sectorMode, sectorsSet]);

  const countryOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.country).filter((v): v is string => !!v))].sort();
  }, [meta]);
  const sectorOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.sector).filter((v): v is string => !!v))].sort();
  }, [meta]);

  const result = useMemo(
    () => (meta && activeSlices ? computeReversalScout(meta, activeSlices, params) : null),
    [meta, activeSlices, params],
  );

  const sorted = useMemo(
    () => (meta && result ? sortRows(meta, result.rows, ui.sortKey, ui.sortDir, ui.side) : []),
    [meta, result, ui.sortKey, ui.sortDir, ui.side],
  );

  const [selected, setSelected] = useState<number | null>(null);

  const [shown, setShown] = useState(PAGE_ROWS);
  useEffect(() => { setShown(PAGE_ROWS); }, [ui.cls, ui.side, ui.window, ui.mode, ui.sortKey, ui.sortDir, params.start, params.to, ui.minRate, ui.minTotal]);

  const curve = useMemo(() => {
    if (!meta || !result || !activeSlices) return null;
    if (selected !== null) {
      const s = tickerSeries(meta, activeSlices, params, selected);
      return buildCurve(meta, ui.window, s.dailyUsd, s.tradeUsd, s.tradeDate, ui.curveMode);
    }
    return buildCurve(meta, ui.window, result.dailyUsd, result.tradeSeriesUsd, result.tradeSeriesDate, ui.curveMode);
  }, [meta, result, activeSlices, params, selected, ui.window, ui.curveMode]);

  const dd = useMemo(() => (curve ? maxDrawdown(curve) : NaN), [curve]);

  const tradeRows = useMemo(() => {
    if (!meta || !result || !activeSlices) return [];
    const rows = selected !== null ? tickerTradeRows(meta, activeSlices, params, selected) : result.tradeRows;
    return [...rows].sort((a, b) => a.date - b.date || a.entryMinuteIdx - b.entryMinuteIdx);
  }, [meta, result, activeSlices, params, selected]);
  const [tradesShown, setTradesShown] = useState(PAGE_ROWS);
  useEffect(() => { setTradesShown(PAGE_ROWS); }, [tradeRows]);

  const analyticsSummary = useMemo(() => computeReversalAnalytics(tradeRows, ui.sizeUsd), [tradeRows, ui.sizeUsd]);

  const onSort = (key: ReversalSortKey) =>
    setUi((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key ? (prev.sortDir === "asc" ? "desc" : "asc") : "desc",
    }));

  const setBound = (which: "start" | "to", v: number) =>
    setUi((prev) => ({ ...prev, bounds: { ...prev.bounds, [prev.mode]: { ...prev.bounds[prev.mode], [which]: v } } }));

  const headerNavGroupClass = isLightTheme
    ? "flex h-7 items-center gap-2 rounded-lg border border-slate-900/10 bg-white/35"
    : "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const headerNavInactiveClass = isLightTheme
    ? "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const navPill = "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5";
  const btn = (active: boolean, disabled = false) =>
    clsx(TOOLBAR_BUTTON_BASE, disabled ? "cursor-not-allowed border-transparent text-zinc-700" : active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const separator = <div className="h-7 w-px self-center bg-white/5" />;

  const modeInfo = REVERSAL_MODES[ui.mode];
  const D = meta?.recentDates.length ?? 0;
  const winFrom = meta ? meta.recentDates[Math.max(0, D - ui.window)] : null;
  const winTo = meta ? meta.recentDates[D - 1] : null;
  const busy = metaBusy || sliceLoading;
  const behind = meta ? daysBehind(meta.mostRecentSession) : null;
  const selectedTicker = meta && selected !== null ? meta.tickers[selected].t : null;

  const th = (label: string, key: ReversalSortKey | null, title?: string, left = false) => (
    <th
      key={label}
      title={title}
      onClick={key ? () => onSort(key) : undefined}
      className={clsx(
        "px-2.5 py-2 text-[9px] font-semibold select-none whitespace-nowrap",
        left ? "text-left" : "text-right",
        key && "cursor-pointer hover:text-white",
        key && ui.sortKey === key && "accent-text",
      )}
    >
      {label}{key ? sortMark(ui.sortKey === key, ui.sortDir) : ""}
    </th>
  );

  // gamma of the ticker for the CURRENT class + side (side="both" shows pos | neg, same as Arbitrage's γ column)
  const gammaCell = (tIdx: number) => {
    const tk = meta!.tickers[tIdx];
    const r = tk.rating[ui.cls];
    if (ui.side === "short") return fx(r.pos?.gamma ?? NaN);
    if (ui.side === "long") return fx(r.neg?.gamma ?? NaN);
    return `${fx(r.pos?.gamma ?? NaN)} | ${fx(r.neg?.gamma ?? NaN)}`;
  };

  // alpha is sign-split (alphaPos/alphaNeg); side="both" shows pos | neg, same pattern as gammaCell
  const alphaCell = (tIdx: number) => {
    const tk = meta!.tickers[tIdx];
    if (ui.side === "short") return fx(tk.alphaPos, 3);
    if (ui.side === "long") return fx(tk.alphaNeg, 3);
    return `${fx(tk.alphaPos, 3)} | ${fx(tk.alphaNeg, 3)}`;
  };

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <header className="scanner-header-surface bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <GlitchTitle text="REVERSAL SCOUT" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className={headerNavGroupClass}>
              <Link href="/reversal/stream" className={clsx(navPill, headerNavInactiveClass)} title="Open STREAM">
                <svg {...svgProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                STREAM
              </Link>
              <Link href="/reversal/scanner" className={clsx(navPill, headerNavInactiveClass)} title="Open SCANNER">
                <svg {...svgProps}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                SCANNER
              </Link>
              <Link href="/reversal/sonar" className={clsx(navPill, headerNavInactiveClass)} title="Open SONAR">
                <svg {...svgProps}><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                SONAR
              </Link>
              <span className={clsx(navPill, "accent-soft")} title="SCOUT (current)">
                <svg {...svgProps}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>
                SCOUT
              </span>
            </div>

            <button
              type="button"
              onClick={() => { setSelected(null); loadMeta(true); }}
              disabled={metaBusy}
              className={clsx(
                "h-7 w-7 flex items-center justify-center rounded-full transition-all active:scale-95",
                metaBusy ? "text-zinc-600 cursor-not-allowed" : "accent-text hover:opacity-80",
              )}
              title="Reload the published reversal_rolling_perf file from the bridge"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={busy ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <SpinnerInput label="MINRATE" ariaLabel="min rate" title="Published win rate of the class and side (all history, not the window) must be at least this"
            value={ui.minRate} onChange={(v) => patch({ minRate: v })} step={0.05} min={0} max={1} decimals={2} />
          <SpinnerInput label="MINTOTAL" ariaLabel="min total" title="Published win rate of the class and side must rest on at least this many trades"
            value={ui.minTotal} onChange={(v) => patch({ minTotal: Math.trunc(v) })} step={1} min={0} decimals={0} />
          <ReversalRangeBox
            value={ui.ranges}
            onChange={(ranges) => patch({ ranges })}
            title="Alpha — the ticker's own modal |15:50 reading|, sign-matched (pos/short vs alphaPos, neg/long vs alphaNeg)"
          />
        </div>

        <div className="scanner-control-surface flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className={groupClass}>
              {CLASSES.map((c) => (
                <button key={c.key} type="button" onClick={() => { patch({ cls: c.key }); setSelected(null); }} className={btn(ui.cls === c.key)} title={`${c.label} — ${c.hint}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {separator}
            <div className={groupClass}>
              {SIDES.map((s) => (
                <button key={s.key} type="button" onClick={() => { patch({ side: s.key }); setSelected(null); }} className={btn(ui.side === s.key)} title={s.hint}>
                  {s.label}
                </button>
              ))}
            </div>
            {separator}
            <div className={groupClass}>
              {WINDOWS.map((w) => (
                <button key={w} type="button" onClick={() => patch({ window: w })} className={btn(ui.window === w)} title={`the last ${w} sessions in the file`}>
                  {w}D
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <div className={groupClass} title="Sort the table (click the active one again to flip)">
                {SORT_BUTTONS.map((s) => (
                  <button key={s.key} type="button" onClick={() => onSort(s.key)} className={btn(ui.sortKey === s.key)}>
                    {s.label}{sortMark(ui.sortKey === s.key, ui.sortDir)}
                  </button>
                ))}
              </div>
              {separator}
              <div className={groupClass}>
                {(["daily", "trade"] as ReversalCurveMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => patch({ curveMode: m })} className={btn(ui.curveMode === m)}
                    title={m === "daily" ? "one point per session" : "one point per trade, in date order"}>
                    {m === "daily" ? "DAILY" : "TRADE"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-zinc-600">
            {meta && (
              <>
                <span>SESSIONS {winFrom} → {winTo}</span>
                <span>{ui.cls.toUpperCase()} · {ui.side === "both" ? "SHORT+LONG" : ui.side.toUpperCase()} · ${ui.sizeUsd.toLocaleString("en-US")}/trade · entry 16:00, exit the class's own clock time</span>
                {result && result.cappedOut > 0 && <span>{result.cappedOut.toLocaleString("en-US")} trades excluded by CAP</span>}
                {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => patch({ excludeEtf: !ui.excludeEtf })}
            className={btn(ui.excludeEtf)}
            title="Drop every ticker the tape says is an ETF (a ticker with no ETF data yet still passes)"
          >
            EXCL ETF
          </button>
          <MultiSelectFilter
            label="COUNTRY"
            options={countryOptions}
            selected={countriesSet}
            setSelected={(s) => patch({ countries: [...s] })}
            enabled={ui.countryMode}
            toggleEnabled={() => patch({ countryMode: ui.countryMode === "off" ? "include" : ui.countryMode === "include" ? "exclude" : "off" })}
          />
          <MultiSelectFilter
            label="SECTOR"
            options={sectorOptions}
            selected={sectorsSet}
            setSelected={(s) => patch({ sectors: [...s] })}
            enabled={ui.sectorMode}
            toggleEnabled={() => patch({ sectorMode: ui.sectorMode === "off" ? "include" : ui.sectorMode === "include" ? "exclude" : "off" })}
          />
          <SpinnerInput label="CAP %" ariaLabel="cap" title="A trade whose |P&L| exceeds this many percentage points is a Stack% data fault, not a trade, and is dropped. 0 = keep everything."
            value={ui.capPct} onChange={(v) => patch({ capPct: v })} step={5} min={0} decimals={1} />
          <SpinnerInput label="SIZE $" ariaLabel="position size" title="Position size per trade"
            value={ui.sizeUsd} onChange={(v) => patch({ sizeUsd: v })} step={100} min={0} decimals={0} widthClass="w-16" />
          {selectedTicker && (
            <button type="button" onClick={() => setSelected(null)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE, "gap-2")} title="Show the whole table's curve again">
              {selectedTicker} <span aria-hidden="true">✕</span>
            </button>
          )}
          <div className="ml-auto">
            <ScoutUnitBar
              options={MODES.map((m) => ({ key: m, label: REVERSAL_MODES[m].label, title: REVERSAL_MODES[m].hint }))}
              mode={ui.mode}
              onMode={(m) => patch({ mode: m })}
              start={ui.bounds[ui.mode].start}
              to={ui.bounds[ui.mode].to}
              onStart={(v) => setBound("start", v)}
              onTo={(v) => setBound("to", v)}
              step={modeInfo.step}
              subject="entries"
              unitHint={modeInfo.hint}
            />
          </div>
        </div>

        {/* States */}
        {meta && behind !== null && behind >= 5 && (
          <GlassCard hoverable={false} className="border-amber-300/25 bg-amber-300/[0.04] px-4 py-3">
            <div className="font-mono text-[11px] text-amber-200/90">
              The published file ends {meta.mostRecentSession} — {behind} days ago. Re-run Reversal.ipynb and publish reversal_rolling_perf.json.gz again{meta.generatedAt ? ` (file generated ${meta.generatedAt.slice(0, 16).replace("T", " ")}Z)` : ""}.
            </div>
          </GlassCard>
        )}
        {(metaError || sliceError) && (
          <GlassCard className="border-rose-400/25 bg-rose-400/[0.05] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-[11px] text-rose-200/85 break-all">{metaError ?? sliceError}</div>
              <button type="button" onClick={() => loadMeta(false)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>RETRY</button>
            </div>
          </GlassCard>
        )}
        {busy && !metaError && (
          <GlassCard hoverable={false} className="px-4 py-3">
            <div className="font-mono text-[11px] text-zinc-500">
              {meta ? "loading trades…" : "loading — the first request after a bridge restart downloads and parses the published file…"}
            </div>
          </GlassCard>
        )}

        {meta && result && (
          <>
            {result.rows.length === 0 && (ui.minRate > 0 || ui.minTotal > 0) && (
              <GlassCard hoverable={false} className="flex flex-wrap items-center justify-between gap-3 border-amber-300/25 bg-amber-300/[0.04] px-4 py-3">
                <div className="font-mono text-[11px] text-amber-200/90">
                  No ticker has a published {ui.cls.toUpperCase()} rating with TOTAL ≥ {ui.minTotal} and RATE ≥ {ui.minRate} for the side(s) shown (ETF/country/sector and START/TO filters apply too).
                </div>
                <button type="button" onClick={() => patch({ minRate: 0, minTotal: 2 })} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>
                  RESET GATES
                </button>
              </GlassCard>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryMetricCard label="TICKERS" value={`${result.rows.length.toLocaleString("en-US")} / ${result.tickersInScope.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="RATING" value={pct1(result.rating)} valueClassName={ratingTone(result.rating)} />
              <SummaryMetricCard label="TRADES IN SCOPE" value={intn(result.tradesInScope)} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MAX DRAWDOWN" value={isNum(dd) ? usd(-dd) : "—"} valueClassName={dd > 0 ? (isLightTheme ? "text-rose-700" : SOFT_LOSS_TEXT_CLASS) : "text-zinc-400"} />
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,6fr)]">
              <SummaryMetricCard
                label="TOTAL PNL"
                value={fx(analyticsSummary.totalPnlUsd, 2)}
                className="h-full xl:min-h-[124px]"
                valueClassName={clsx(
                  "text-4xl md:text-6xl font-bold",
                  analyticsSummary.totalPnlUsd > 0 ? "text-[#6ee7b7]" : analyticsSummary.totalPnlUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200",
                )}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-flow-col xl:grid-rows-2 xl:[grid-template-columns:1fr_1fr_4fr_2fr_2fr_2fr_2fr_2fr_2fr]">
                <SummaryMetricCard label="SITUATIONS" value={intn(analyticsSummary.situations)} inline />
                <SummaryMetricCard label="LONGS" value={intn(analyticsSummary.longs)} inline valueClassName="text-[#6ee7b7]" />

                <SummaryMetricCard label="TRADES" value={intn(analyticsSummary.trades)} inline />
                <SummaryMetricCard label="SHORTS" value={intn(analyticsSummary.shorts)} inline valueClassName={SOFT_LOSS_TEXT_CLASS} />

                <SummaryMetricCard label="MONEYFLOW" value={numSpaced(analyticsSummary.moneyflowUsd, 2)} inline valueClassName="accent-text" />
                <SummaryMetricCard label="MAX DRAWDOWN" value={fx(dd, 2)} inline />

                <SummaryMetricCard label="WIN RATE" value={pct1(analyticsSummary.winRate)} inline />
                <SummaryMetricCard label="EXPECTANCY" value={fx(analyticsSummary.expectancyUsd, 2)} inline />

                <SummaryMetricCard label="MAX WIN" value={fx(analyticsSummary.maxWinUsd, 2)} inline valueClassName={analyticsSummary.maxWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"} />
                <SummaryMetricCard label="MAX LOSS" value={fx(analyticsSummary.maxLossUsd, 2)} inline valueClassName={analyticsSummary.maxLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"} />

                <SummaryMetricCard label="AVG WIN" value={fx(analyticsSummary.avgWinUsd, 2)} inline valueClassName={analyticsSummary.avgWinUsd > 0 ? "text-[#6ee7b7]" : "text-zinc-200"} />
                <SummaryMetricCard label="AVG LOSS" value={fx(analyticsSummary.avgLossUsd, 2)} inline valueClassName={analyticsSummary.avgLossUsd < 0 ? SOFT_LOSS_TEXT_CLASS : "text-zinc-200"} />

                <SummaryMetricCard
                  label="TOP2 WIN %"
                  value={analyticsSummary.top2WinShare == null ? "—" : pct1(analyticsSummary.top2WinShare)}
                  inline
                  valueClassName={analyticsSummary.top2WinShare == null ? "text-zinc-500" : analyticsSummary.top2WinShare >= 0.6 ? "text-amber-300" : "text-[#6ee7b7]"}
                />
                <SummaryMetricCard
                  label="TOP2 LOSS %"
                  value={analyticsSummary.top2LossShare == null ? "—" : pct1(analyticsSummary.top2LossShare)}
                  inline
                  valueClassName={analyticsSummary.top2LossShare == null ? "text-zinc-500" : analyticsSummary.top2LossShare >= 0.6 ? "text-amber-300" : SOFT_LOSS_TEXT_CLASS}
                />

                <SummaryMetricCard label="AVG TRADE" value={fx(analyticsSummary.avgTradeUsd, 2)} inline valueClassName={signTone(analyticsSummary.avgTradeUsd, isLightTheme)} />
                <SummaryMetricCard label="MEDIAN TRADE" value={fx(analyticsSummary.medianTradeUsd, 2)} inline valueClassName={signTone(analyticsSummary.medianTradeUsd, isLightTheme)} />

                <SummaryMetricCard label="PROFIT FACTOR" value={analyticsSummary.profitFactor == null ? "—" : fx(analyticsSummary.profitFactor, 2)} inline />
                <SummaryMetricCard
                  label={analyticsSummary.dayCount > 1 ? `MEDIAN DAY (${intn(analyticsSummary.dayCount)}d)` : "MEDIAN DAY"}
                  value={analyticsSummary.dayCount > 1 ? fx(analyticsSummary.medianDayUsd, 2) : "—"}
                  inline
                  valueClassName={analyticsSummary.dayCount <= 1 ? "text-zinc-500" : signTone(analyticsSummary.medianDayUsd, isLightTheme)}
                />
              </div>
            </div>

            {/* Equity curve — no "by time" peak/reversion chart group: Reversal's trades are one
                snapshot + one entry + one exit, not a birth->peak->window event, so there is no peak
                to chart. Said here rather than faked. */}
            {curve && curve.length > 0 ? (
              <EquityChart
                points={curve}
                title={`EQUITY CURVE | ${selectedTicker ?? "ALL SELECTED"} | ${ui.curveMode.toUpperCase()}`}
                meta={`${ui.cls.toUpperCase()} · ${ui.window}D · $${ui.sizeUsd.toLocaleString("en-US")}/trade`}
              />
            ) : (
              <GlassCard hoverable={false} className="px-4 py-10 text-center text-[11px] font-mono text-zinc-600">
                No trades in scope for these settings.
              </GlassCard>
            )}

            {/* Table */}
            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.12em] text-zinc-500">
                      {th("TICKER", "ticker", undefined, true)}
                      {th("ALPHA", "alpha", "modal |15:50 reading|, sign-matched to the side(s) shown (pos/short | neg/long)")}
                      {th("γ", null, "gamma level for the class+side shown — best reversal-entry deviation")}
                      {th(`START ${modeInfo.unit}`, "start", "mean entry deviation of the trades in scope, in the chosen unit")}
                      {th("ENTRY", "entryTime", "mean entry clock time of the trades in scope (16:00, snapped)")}
                      {th("EXIT", null, "mean exit clock time of the trades in scope")}
                      {th("TRADES", "trades")}
                      {th("RATING", "rating", "published win rate (all history) of the class and side(s) shown")}
                      {th("TOTAL", null, "trades behind the published rating")}
                      {th("WIN", "win", "share of the trades in the CURRENT scope with P&L > 0")}
                      {th("AVG %", "avgPnl", "mean P&L per trade, percentage points")}
                      {th("P&L $", "pnl")}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, shown).map((r) => {
                      const tk = meta.tickers[r.i];
                      return (
                        <tr
                          key={r.i}
                          onClick={() => setSelected((cur) => (cur === r.i ? null : r.i))}
                          className={clsx(
                            "cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03]",
                            selected === r.i && "bg-white/[0.06]",
                          )}
                        >
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{tk.t}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{alphaCell(r.i)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{gammaCell(r.i)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(r.start, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{minuteIdxToClockLabel(r.entryMinuteIdx)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(r.exitMinuteIdx)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{r.trades}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", ratingTone(r.rating))}>{pct1(r.rating)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{intn(r.ratingTotal)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{pct1(r.win)}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(r.avgPnlPct, isLightTheme))}>{fx(r.avgPnlPct, 3)}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(r.pnlUsd, isLightTheme))}>{usd(r.pnlUsd, 2)}</td>
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No ticker clears these settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {sorted.length > shown && (
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.04] px-3 py-2 text-[10px] font-mono text-zinc-500">
                  <span>showing {shown.toLocaleString("en-US")} of {sorted.length.toLocaleString("en-US")}</span>
                  <button type="button" onClick={() => setShown((n) => n + PAGE_ROWS)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>
                    SHOW MORE
                  </button>
                </div>
              )}
            </GlassCard>

            {/* Per-trade detail */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                TRADES{selectedTicker ? ` | ${selectedTicker}` : " | ALL SELECTED"} | rows {tradeRows.length.toLocaleString("en-US")}
              </div>
            </div>
            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.12em] text-zinc-500">
                      <th className="px-2.5 py-2 text-left text-[9px] font-semibold whitespace-nowrap">TICKER</th>
                      <th className="px-2.5 py-2 text-left text-[9px] font-semibold whitespace-nowrap">DATE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">CLASS</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">SIDE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 15:50 reading's clock time">SIGNAL</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">ENTRY</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">EXIT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L $</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 15:50 reading, %">DEV %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 15:50 reading, × the ticker's own alpha">DEV α</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeRows.slice(0, tradesShown).map((t, idx) => (
                      <tr key={idx} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.ticker}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-400">{meta.recentDates[t.date] ?? "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{t.cls.toUpperCase()}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", t.side === "short" ? "text-sky-300" : "text-amber-300")}>
                          {t.side.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.signalMinuteIdx)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{minuteIdxToClockLabel(t.entryMinuteIdx)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.exitMinuteIdx)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(t.pnlPct, isLightTheme))}>{fx(t.pnlPct, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(t.pnlUsd, isLightTheme))}>{usd(t.pnlUsd, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devPct, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devAlpha, 2)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right uppercase", t.status === "win" ? "text-[#6ee7b7]" : SOFT_LOSS_TEXT_CLASS)}>
                          {t.status}
                        </td>
                      </tr>
                    ))}
                    {tradeRows.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No trades in scope for these settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {tradeRows.length > tradesShown && (
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.04] px-3 py-2 text-[10px] font-mono text-zinc-500">
                  <span>showing {tradesShown.toLocaleString("en-US")} of {tradeRows.length.toLocaleString("en-US")}</span>
                  <button type="button" onClick={() => setTradesShown((n) => n + PAGE_ROWS)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>
                    SHOW MORE
                  </button>
                </div>
              )}
            </GlassCard>
          </>
        )}
      </div>
    </div>
  );
}
