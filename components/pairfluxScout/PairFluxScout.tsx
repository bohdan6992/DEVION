"use client";

/**
 * PAIRFLUX SCOUT — how a class has been paying over the last 5/20/40/65 sessions, per PAIR, with
 * the entry threshold ("start") set in whichever unit is useful:
 *
 *   %  raw |entry_dev| at the confirmed entry, pp    σ  a multiple of the pair's own sigma level
 *   γ  a multiple of the pair's own gamma level      α  a multiple of the pair's own alpha
 *
 * (all three levels are per PAIR and per CLASS — never split by sign, unlike Arbitrage's γ/δ —
 * because the notebook's own per-class row publishes one alpha/sigma/gamma covering both
 * directions; see PairFluxScoutService's class doc comment for how the bridge joins them in
 * without picking up the wrong direction's rescaled value).
 *
 * The pair analogue of components/scout/ArbitrageScout.tsx — same architecture (the bridge serves
 * a published rolling_perf file as an episode log; every filter/aggregate/sort/curve is computed
 * client-side in lib/pairfluxScout/compute.ts), same look (copied header/toolbar/table chrome).
 * One real difference beyond the pair-vs-ticker row and the mode set: PEAK STRENGTH BY TIME / PEAK
 * REVERSION >= 2/3 are NOT shown — PairFlux's episode log carries the peak's VALUE but not its row
 * position, so there is no real peakMinuteIdx to bin on (see PfScoutEpisode's doc comment in
 * lib/pairfluxScout/types.ts). START VS END BY TIME and START EVENTS BY TIME (OK/BAD) both work
 * unmodified because they only need start/end minute.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import { useUi } from "../UiProvider";
import { EquityChart, StartsByTimeChart, StartsEndsByTimeChart } from "../scanner/shared/charts";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { getLiveStrategy } from "../../lib/strategies/registry";
import { intn, minuteIdxToClockLabel } from "../../lib/scanner/format";
import {
  buildPfCurve,
  computePfAnalytics,
  computePfScout,
  pairEpisodes,
  pairSeries,
  pairTradeRows,
  PF_SCOUT_MODES,
  pfMaxDrawdown,
  sortPfRows,
} from "../../lib/pairfluxScout/compute";
import type { SortDir } from "../../lib/pairfluxScout/compute";
import { loadPfScoutMeta, loadPfScoutSlice } from "../../lib/pairfluxScout/client";
import type {
  PfScoutClass,
  PfScoutCurveMode,
  PfScoutMeta,
  PfScoutMode,
  PfScoutParams,
  PfScoutSide,
  PfScoutSlice,
  PfScoutSortKey,
  PfScoutWindow,
} from "../../lib/pairfluxScout/types";
import SpinnerInput from "../scout/SpinnerInput";
import ScoutUnitBar from "../scout/ScoutUnitBar";
import { daysBehind } from "../../lib/scout/rollover";
import ScoutRangeBoxes from "../scout/ScoutRangeBoxes";
import ScoutOptimizer from "../scout/ScoutOptimizer";
import { boundText, findBestSettings, type OptConfig, type OptObjective, type OptProgress } from "../../lib/scout/optimizeCore";
import { pfCurrentConfig, pfOptTable } from "../../lib/pairfluxScout/optimize";
import { EMPTY_RANGE_TEXT, loadRangeText, parseRanges, type RangeText } from "../../lib/scout/ranges";

const CLASSES: Array<{ key: PfScoutClass; label: string; window: string; from: number; to: number }> = [
  // from/to: NY session-minute, PRE-wrapped exactly like the notebook's _to_smin (a prior-day
  // evening minute is negative) - taken straight from PairFlux.ipynb's CLASS_WINDOWS_DEFAULT,
  // NOT reused from Arbitrage's sessionTimeChartRange, whose bounds are different minutes.
  { key: "pre", label: "PRE", window: "21:00 → 09:30", from: -180, to: 570 },
  { key: "open", label: "OPEN", window: "09:00 → 10:00", from: 540, to: 600 },
  { key: "intra", label: "INTRA", window: "09:45 → 16:00", from: 585, to: 960 },
];
const SIDES: Array<{ key: PfScoutSide; label: string; hint: string }> = [
  { key: "pos", label: "POS", hint: "leg A ran ahead of its B-implied value at entry — converges SHORT A / LONG B" },
  { key: "neg", label: "NEG", hint: "leg A lagged its B-implied value at entry — converges LONG A / SHORT B" },
  { key: "both", label: "BOTH", hint: "both directions together" },
];
const WINDOWS: PfScoutWindow[] = [5, 20, 40, 65];
const MODES: PfScoutMode[] = ["pct", "sigma", "gamma", "alpha"];
const SORT_BUTTONS: Array<{ key: PfScoutSortKey; label: string }> = [
  { key: "rating", label: "RATING" },
  { key: "start", label: "START" },
  { key: "pnl", label: "P&L" },
  { key: "trades", label: "TRADES" },
];

const UI_KEY = "scout.pairflux.ui.v1";
const PAGE_ROWS = 200;

type Bounds = Record<PfScoutMode, { start: number; to: number }>;
type UiState = {
  cls: PfScoutClass;
  side: PfScoutSide;
  window: PfScoutWindow;
  mode: PfScoutMode;
  bounds: Bounds;
  minRate: number;
  minTotal: number;
  ranges: RangeText;
  excludeRollover: boolean;
  capPct: number;
  sizeUsd: number;
  sortKey: PfScoutSortKey;
  sortDir: SortDir;
  curveMode: PfScoutCurveMode;
};

const DEFAULT_UI: UiState = {
  cls: "intra",
  side: "both",
  window: 20,
  mode: "pct",
  bounds: {
    pct: { start: 0, to: 0 },
    sigma: { start: 0, to: 0 },
    gamma: { start: 0, to: 0 },
    alpha: { start: 0, to: 0 },
  },
  minRate: 0,
  minTotal: 2,
  ranges: EMPTY_RANGE_TEXT,
  excludeRollover: false,
  // matches PairFlux.ipynb's own artefact guard on gamma (gamma_max_dev_pp=25.0) — a print this
  // wide is a broken Stack%, not a spread.
  capPct: 25,
  sizeUsd: 1000,
  sortKey: "rating",
  sortDir: "desc",
  curveMode: "daily",
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
      excludeRollover: j.excludeRollover === true,
      capPct: numOr(j.capPct, DEFAULT_UI.capPct),
      sizeUsd: numOr(j.sizeUsd, DEFAULT_UI.sizeUsd),
      sortKey: pick(j.sortKey, ["pair", "rating", "hard", "soft", "start", "entryTime", "trades", "pnl", "avgPnl", "win"] as PfScoutSortKey[], DEFAULT_UI.sortKey),
      sortDir: pick(j.sortDir, ["asc", "desc"] as SortDir[], DEFAULT_UI.sortDir),
      curveMode: pick(j.curveMode, ["daily", "trade"] as PfScoutCurveMode[], DEFAULT_UI.curveMode),
    };
  } catch {
    return DEFAULT_UI;
  }
}

// ---------------------------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------------------------

const isNum = (v: number) => Number.isFinite(v);
const fx = (v: number, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
const pct1 = (v: number) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : "—");
function usd(v: number, d = 0): string {
  if (!isNum(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v < 0 ? "−" : ""}$${s}`;
}
// Space-grouped thousands, no currency sign — matches the Scanner's own analytics block (MONEYFLOW).
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

export default function PairFluxScout() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const nav = getLiveStrategy("pairflux")!.nav;

  const [ui, setUi] = useState<UiState>(loadUi);
  const patch = useCallback((p: Partial<UiState>) => setUi((prev) => ({ ...prev, ...p })), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { window.localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [ui]);

  // ---- data
  const [meta, setMeta] = useState<PfScoutMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(true);

  const loadMeta = useCallback((force: boolean) => {
    setMetaBusy(true);
    setMetaError(null);
    loadPfScoutMeta(force)
      .then((m) => { setMeta(m); })
      .catch((e) => setMetaError(String(e?.message ?? e)))
      .finally(() => setMetaBusy(false));
  }, []);
  useEffect(() => { loadMeta(false); }, [loadMeta]);

  const signs = ui.side === "pos" ? (["pos"] as const) : ui.side === "neg" ? (["neg"] as const) : (["pos", "neg"] as const);
  const sliceKey = `${ui.cls}:${signs.join("+")}`;
  const [slices, setSlices] = useState<{ key: string; data: PfScoutSlice[] } | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const sliceReq = useRef(0);

  useEffect(() => {
    if (!meta) return;
    const req = ++sliceReq.current;
    setSliceError(null);
    Promise.all(signs.map((s) => loadPfScoutSlice(ui.cls, s)))
      .then((data) => { if (req === sliceReq.current) setSlices({ key: sliceKey, data }); })
      .catch((e) => { if (req === sliceReq.current) setSliceError(String(e?.message ?? e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sliceKey]);

  const activeSlices = slices && slices.key === sliceKey ? slices.data : null;
  const sliceLoading = !!meta && !activeSlices && !sliceError;

  const params: PfScoutParams = useMemo(() => ({
    window: ui.window,
    mode: ui.mode,
    start: ui.bounds[ui.mode].start,
    to: ui.bounds[ui.mode].to,
    minRate: ui.minRate,
    minTotal: ui.minTotal,
    ranges: parseRanges(ui.ranges),
    excludeRollover: ui.excludeRollover,
    capPct: ui.capPct,
    sizeUsd: ui.sizeUsd,
  }), [ui.window, ui.mode, ui.bounds, ui.minRate, ui.minTotal, ui.ranges, ui.excludeRollover, ui.capPct, ui.sizeUsd]);

  const result = useMemo(
    () => (meta && activeSlices ? computePfScout(meta, activeSlices, params) : null),
    [meta, activeSlices, params],
  );

  const sorted = useMemo(
    () => (meta && result ? sortPfRows(meta, result.rows, ui.sortKey, ui.sortDir) : []),
    [meta, result, ui.sortKey, ui.sortDir],
  );

  const [selected, setSelected] = useState<number | null>(null);
  // ---- BEST SETTINGS: the search runs over the episodes in view, with everything it tunes switched off
  const [optOpen, setOptOpen] = useState(false);
  const [optSeq, setOptSeq] = useState(0);
  const optScopeKeyAll = `${ui.cls}|${ui.side}|${ui.excludeRollover}|${ui.capPct}|${ui.sizeUsd}`;
  const optScopeKey = `${optScopeKeyAll}|${ui.window}`;
  const runOpt = useCallback(
    (o: { objective: OptObjective; minTrades: number; multi: boolean; validate: boolean; onProgress: OptProgress; cancelled: () => boolean }) => {
      const { table, scope } = pfOptTable(meta!, activeSlices!, params, { multi: o.multi, windows: WINDOWS, validate: o.validate });
      return findBestSettings(table, { sizeUsd: ui.sizeUsd, scope, current: pfCurrentConfig(params), objective: o.objective, minTrades: o.minTrades, onProgress: o.onProgress, cancelled: o.cancelled });
    },
    [meta, activeSlices, params, ui.sizeUsd],
  );
  const applyOpt = (c: OptConfig) => {
    const unit = c.unit as PfScoutMode;
    patch({
      mode: unit,
      bounds: { ...ui.bounds, [unit]: { start: c.start, to: c.to > c.start ? c.to : 0 } },
      minRate: c.minRate,
      minTotal: c.minTotal,
      ranges: { corr: boundText(c.corr), beta: boundText(c.beta), sigma: boundText(c.sigma), alpha: boundText(c.alpha) },
    });
  };

  const [shown, setShown] = useState(PAGE_ROWS);
  useEffect(() => { setShown(PAGE_ROWS); }, [ui.cls, ui.side, ui.window, ui.mode, ui.sortKey, ui.sortDir, params.start, params.to, ui.minRate, ui.minTotal]);

  const curve = useMemo(() => {
    if (!meta || !result || !activeSlices) return null;
    if (selected !== null) {
      const s = pairSeries(meta, activeSlices, params, selected);
      return buildPfCurve(meta, ui.window, s.dailyUsd, s.tradeUsd, s.tradeDate, ui.curveMode);
    }
    return buildPfCurve(meta, ui.window, result.dailyUsd, result.tradeSeriesUsd, result.tradeSeriesDate, ui.curveMode);
  }, [meta, result, activeSlices, params, selected, ui.window, ui.curveMode]);

  const dd = useMemo(() => (curve ? pfMaxDrawdown(curve) : NaN), [curve]);

  const episodes = useMemo(() => {
    if (!meta || !result || !activeSlices) return [];
    return selected !== null ? pairEpisodes(meta, activeSlices, params, selected) : result.episodes;
  }, [meta, result, activeSlices, params, selected]);

  const classInfo = CLASSES.find((c) => c.key === ui.cls)!;

  const tradeRows = useMemo(() => {
    if (!meta || !result || !activeSlices) return [];
    const rows = selected !== null ? pairTradeRows(meta, activeSlices, params, selected) : result.tradeRows;
    return [...rows].sort((a, b) => a.date - b.date || a.entryMinuteIdx - b.entryMinuteIdx);
  }, [meta, result, activeSlices, params, selected]);
  const [tradesShown, setTradesShown] = useState(PAGE_ROWS);
  useEffect(() => { setTradesShown(PAGE_ROWS); }, [tradeRows]);

  // The Scanner's own analytics summary block, ported to Scout's episode log (lib/pairfluxScout/compute.ts).
  const analyticsSummary = useMemo(() => computePfAnalytics(tradeRows, ui.sizeUsd), [tradeRows, ui.sizeUsd]);

  const onSort = (key: PfScoutSortKey) =>
    setUi((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key ? (prev.sortDir === "asc" ? "desc" : "asc") : "desc",
    }));

  const setBound = (which: "start" | "to", v: number) =>
    setUi((prev) => ({ ...prev, bounds: { ...prev.bounds, [prev.mode]: { ...prev.bounds[prev.mode], [which]: v } } }));

  // ---- header chrome, copied from Arbitrage Scout
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

  const modeInfo = PF_SCOUT_MODES[ui.mode];
  const levelsOk = meta?.levelsAvailable ?? false;
  const D = meta?.recentDates.length ?? 0;
  const winFrom = meta ? meta.recentDates[Math.max(0, D - ui.window)] : null;
  const winTo = meta ? meta.recentDates[D - 1] : null;
  const busy = metaBusy || sliceLoading;
  const behind = meta ? daysBehind(meta.mostRecentSession) : null;
  const selectedPair = meta && selected !== null ? meta.pairs[selected] : null;
  const selectedLabel = selectedPair ? `${selectedPair.a}/${selectedPair.b}` : null;


  const th = (label: string, key: PfScoutSortKey | null, title?: string, left = false) => (
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

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <header className="scanner-header-surface bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <GlitchTitle text="PAIRFLUX SCOUT" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className={headerNavGroupClass}>
              <Link href={nav.stream} className={clsx(navPill, headerNavInactiveClass)} title="Open STREAM">
                <svg {...svgProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                STREAM
              </Link>
              <Link href={nav.scanner} className={clsx(navPill, headerNavInactiveClass)} title="Open SCANNER">
                <svg {...svgProps}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                SCANNER
              </Link>
              <Link href={nav.sonar} className={clsx(navPill, headerNavInactiveClass)} title="Open SONAR">
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
              title="Reload the published rolling_perf file from the bridge"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={busy ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
        </header>

        {/* Controls — laid out like the Scanner: rating row on the right above the card, the
            class / side / window card, then the filter row with the ZAP unit group at its right end */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SpinnerInput label="MINRATE" ariaLabel="min rate" title="Published rating of the class and direction (all history, not the window): converged / total must be at least this"
            value={ui.minRate} onChange={(v) => patch({ minRate: v })} step={0.05} min={0} max={1} decimals={2} />
          <SpinnerInput label="MINTOTAL" ariaLabel="min total" title="Published rating of the class and direction must rest on at least this many episodes"
            value={ui.minTotal} onChange={(v) => patch({ minTotal: Math.trunc(v) })} step={1} min={0} decimals={0} />
          <ScoutRangeBoxes
            value={ui.ranges}
            onChange={(ranges) => patch({ ranges })}
            titles={{
              corr: "Correlation of the pair's legs — 5-bar returns, for this class",
              beta: "Beta — the pair's hedge ratio on Stack% levels, for this class (magnitude)",
              sigma: "Sigma — the pair's published sigma level for this class",
              alpha: "Alpha — the pair's median converged peak for this class, pp",
            }}
          />
        </div>

        <div className="scanner-control-surface flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className={groupClass}>
              {CLASSES.map((c) => (
                <button key={c.key} type="button" onClick={() => { patch({ cls: c.key }); setSelected(null); }} className={btn(ui.cls === c.key)} title={`${c.label} ${c.window}`}>
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
                {(["daily", "trade"] as PfScoutCurveMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => patch({ curveMode: m })} className={btn(ui.curveMode === m)}
                    title={m === "daily" ? "one point per session" : "one point per episode, in date order"}>
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
                <span>{ui.cls.toUpperCase()} · {ui.side === "both" ? "POS+NEG" : ui.side.toUpperCase()} · ${ui.sizeUsd.toLocaleString("en-US")}/episode · equal-notional legs</span>
                {result && result.cappedOut > 0 && <span>{result.cappedOut.toLocaleString("en-US")} episodes excluded by CAP</span>}
                {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
                {!levelsOk && <span className="text-amber-300/80">σ/γ/α not published yet — % only</span>}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SpinnerInput label="CAP %" ariaLabel="cap" title="An episode whose |capture| exceeds this many percentage points is a Stack% data fault, not a trade, and is dropped. 0 = keep everything."
            value={ui.capPct} onChange={(v) => patch({ capPct: v })} step={5} min={0} decimals={1} />
          <SpinnerInput label="SIZE $" ariaLabel="position size" title="Notional deployed across both legs (equal-notional), per episode"
            value={ui.sizeUsd} onChange={(v) => patch({ sizeUsd: v })} step={100} min={0} decimals={0} widthClass="w-16" />
          <button
            type="button"
            onClick={() => patch({ excludeRollover: !ui.excludeRollover })}
            className={btn(ui.excludeRollover)}
            title="Drop trades born in the first 10 minutes after the feed's 00:00 / 04:00 rollover, or alive across one - the baseline resets there, so a deviation appears or vanishes on the clock (measured: PairFlux PRE exits pile up at exactly 00:00)"
          >
            EXCL 00:00/04:00
          </button>
          <button
            type="button"
            onClick={() => { setOptOpen(true); setOptSeq((n) => n + 1); }}
            className={clsx(TOOLBAR_BUTTON_BASE, optOpen ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
            title="Search the entry threshold, ρ/β/σ/α ranges and rating gates for the best result on the trades in view (class, side, window and filters as selected)"
          >
            ✦ BEST SETTINGS
          </button>
          {selectedLabel && (
            <button type="button" onClick={() => setSelected(null)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE, "gap-2")} title="Show the whole table's curve again">
              {selectedLabel} <span aria-hidden="true">✕</span>
            </button>
          )}
          <div className="ml-auto">
            <ScoutUnitBar
              options={MODES.map((m) => ({
                key: m,
                label: PF_SCOUT_MODES[m].label,
                title: m !== "pct" && !levelsOk ? "sigma/gamma/alpha are not published in the current summary.csv" : PF_SCOUT_MODES[m].hint,
                locked: m !== "pct" && !levelsOk,
              }))}
              mode={ui.mode}
              onMode={(m) => patch({ mode: m })}
              start={ui.bounds[ui.mode].start}
              to={ui.bounds[ui.mode].to}
              onStart={(v) => setBound("start", v)}
              onTo={(v) => setBound("to", v)}
              step={modeInfo.step}
              subject="episodes"
              unitHint={modeInfo.hint}
            />
          </div>
        </div>

        {optOpen && (
          <ScoutOptimizer
            runSeq={optSeq}
            scopeKey={optScopeKey}
            scopeKeyAll={optScopeKeyAll}
            windowDays={ui.window}
            ready={!!meta && !!activeSlices}
            run={runOpt}
            unitLabel={(k) => `${PF_SCOUT_MODES[k as PfScoutMode].label} ${PF_SCOUT_MODES[k as PfScoutMode].unit}`}
            onApply={applyOpt}
            onClose={() => setOptOpen(false)}
          />
        )}

        {/* States */}
        {meta && behind !== null && behind >= 5 && (
          <GlassCard hoverable={false} className="border-amber-300/25 bg-amber-300/[0.04] px-4 py-3">
            <div className="font-mono text-[11px] text-amber-200/90">
              The published file ends {meta.mostRecentSession} — {behind} days ago. Nothing after that date is in these numbers: re-run PairFlux.ipynb and publish pairflux/rolling_perf.json.gz again{meta.generatedAt ? ` (file generated ${meta.generatedAt.slice(0, 16).replace("T", " ")}Z)` : ""}.
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
              {meta ? "loading episodes…" : "loading — the first request after a bridge restart downloads and parses the published file…"}
            </div>
          </GlassCard>
        )}

        {meta && result && (
          <>
            {/* MINRATE/MINTOTAL gate the PUBLISHED (all-history) rating of the class and direction. */}
            {result.rows.length === 0 && (ui.minRate > 0 || ui.minTotal > 0) && (
              <GlassCard hoverable={false} className="flex flex-wrap items-center justify-between gap-3 border-amber-300/25 bg-amber-300/[0.04] px-4 py-3">
                <div className="font-mono text-[11px] text-amber-200/90">
                  No pair has a published {ui.cls.toUpperCase()} rating with TOTAL ≥ {ui.minTotal} and RATE ≥ {ui.minRate} for the direction(s) shown (START/TO filters apply too).
                </div>
                <button type="button" onClick={() => patch({ minRate: 0, minTotal: 2 })} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>
                  RESET GATES
                </button>
              </GlassCard>
            )}

            {/* Totals — the gate/classification numbers Scout adds on top of P&L */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryMetricCard label="PAIRS" value={`${result.rows.length.toLocaleString("en-US")} / ${result.pairsInScope.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="RATING" value={pct1(result.rating)} valueClassName={ratingTone(result.rating)} />
              <SummaryMetricCard label="HARD / SOFT (window)" value={result.trades ? `${pct1(result.hard / result.trades)} / ${pct1(result.soft / result.trades)}` : "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MAX DRAWDOWN" value={isNum(dd) ? usd(-dd) : "—"} valueClassName={dd > 0 ? (isLightTheme ? "text-rose-700" : SOFT_LOSS_TEXT_CLASS) : "text-zinc-400"} />
            </div>

            {/* Analytics summary — ported card-for-card from the Arbitrage Scanner's own
                analyticsSummary block (lib/pairfluxScout/compute.ts's computePfAnalytics). */}
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
                <SummaryMetricCard label="POS" value={intn(analyticsSummary.posCount)} inline valueClassName="text-sky-300" />

                <SummaryMetricCard label="EPISODES" value={intn(analyticsSummary.trades)} inline />
                <SummaryMetricCard label="NEG" value={intn(analyticsSummary.negCount)} inline valueClassName="text-amber-300" />

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

                <SummaryMetricCard label="AVG EPISODE" value={fx(analyticsSummary.avgTradeUsd, 2)} inline valueClassName={signTone(analyticsSummary.avgTradeUsd, isLightTheme)} />
                <SummaryMetricCard label="MEDIAN EPISODE" value={fx(analyticsSummary.medianTradeUsd, 2)} inline valueClassName={signTone(analyticsSummary.medianTradeUsd, isLightTheme)} />

                <SummaryMetricCard label="PROFIT FACTOR" value={analyticsSummary.profitFactor == null ? "—" : fx(analyticsSummary.profitFactor, 2)} inline />
                <SummaryMetricCard
                  label={analyticsSummary.dayCount > 1 ? `MEDIAN DAY (${intn(analyticsSummary.dayCount)}d)` : "MEDIAN DAY"}
                  value={analyticsSummary.dayCount > 1 ? fx(analyticsSummary.medianDayUsd, 2) : "—"}
                  inline
                  valueClassName={analyticsSummary.dayCount <= 1 ? "text-zinc-500" : signTone(analyticsSummary.medianDayUsd, isLightTheme)}
                />
              </div>
            </div>

            {/* Equity curve + START VS END BY TIME (peak-position charts intentionally omitted - see file header) */}
            {curve && curve.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <EquityChart
                  points={curve}
                  title={`EQUITY CURVE | ${selectedLabel ?? "ALL SELECTED"} | ${ui.curveMode.toUpperCase()}`}
                  meta={`${ui.cls.toUpperCase()} · ${ui.window}D · $${ui.sizeUsd.toLocaleString("en-US")}/episode`}
                />
                <StartsEndsByTimeChart
                  rows={episodes}
                  title="START VS END BY TIME | 5M"
                  meta={`rows ${episodes.length}`}
                  xFrom={classInfo.from}
                  xTo={classInfo.to}
                />
              </div>
            ) : (
              <GlassCard hoverable={false} className="px-4 py-10 text-center text-[11px] font-mono text-zinc-600">
                No episodes in scope for these settings.
              </GlassCard>
            )}

            {episodes.length > 0 && (
              <StartsByTimeChart
                rows={episodes}
                title="START EVENTS BY TIME (OK/BAD) | 5M"
                meta={`rows ${episodes.length}`}
                xFrom={classInfo.from}
                xTo={classInfo.to}
              />
            )}

            {/* Table */}
            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.12em] text-zinc-500">
                      {th("PAIR", "pair", undefined, true)}
                      {th("BENCH", null, undefined, true)}
                      {th("σ", null, "sigma — break-even entry level for this class, pp")}
                      {th("γ", null, "gamma — rare-but-reliable entry level for this class, pp")}
                      {th("α", null, "alpha — median peak among converged episodes for this class, pp")}
                      {th(`START ${modeInfo.unit}`, "start", `mean entry value of the episodes in scope, in the chosen unit (${modeInfo.hint})`)}
                      {th("ENTRY", "entryTime", "mean entry clock time of the episodes in scope (NY)")}
                      {th("EPISODES", "trades")}
                      {th("RATING", "rating", "published rating (all history) of the class and direction(s) shown: converged / total")}
                      {th("TOTAL", null, "episodes behind the published rating")}
                      {th("HARD", "hard")}
                      {th("SOFT", "soft")}
                      {th("WIN", "win", "share of episodes with capture > 0")}
                      {th("AVG %", "avgPnl", "mean capture per episode, percentage points")}
                      {th("P&L $", "pnl")}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, shown).map((r) => {
                      const pr = meta.pairs[r.i];
                      return (
                        <tr
                          key={r.i}
                          onClick={() => setSelected((cur) => (cur === r.i ? null : r.i))}
                          className={clsx(
                            "cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03]",
                            selected === r.i && "bg-white/[0.06]",
                          )}
                        >
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{pr.a}/{pr.b}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{pr.bench ?? "—"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(pr.levels[ui.cls].sigma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(pr.levels[ui.cls].gamma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(pr.levels[ui.cls].alpha, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(r.start, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{minuteIdxToClockLabel(r.entryMinuteIdx)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{r.trades}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", ratingTone(r.rating))}>{pct1(r.rating)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{intn(r.ratingTotal)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{pct1(r.hardRate)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{pct1(r.softRate)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{pct1(r.win)}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(r.avgPnlPct, isLightTheme))}>{fx(r.avgPnlPct, 3)}</td>
                          <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(r.pnlUsd, isLightTheme))}>{usd(r.pnlUsd, 2)}</td>
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={15} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No pair clears these settings.
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

            {/* Per-episode detail */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">
                EPISODES{selectedLabel ? ` | ${selectedLabel}` : " | ALL SELECTED"} | rows {tradeRows.length.toLocaleString("en-US")}
              </div>
            </div>
            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.12em] text-zinc-500">
                      <th className="px-2.5 py-2 text-left text-[9px] font-semibold whitespace-nowrap">PAIR</th>
                      <th className="px-2.5 py-2 text-left text-[9px] font-semibold whitespace-nowrap">DATE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">SIDE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="clock time of the confirmed entry (NY)">ENTRY</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="clock time of the confirmed exit (NY) — real per-episode data, not a fixed class close">EXIT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="|dev| at the confirmed entry">ENTRY DEV</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the largest |dev| this episode reached">PEAK</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry → exit, percentage points, signed positive = profit">CAPTURE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L $</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeRows.slice(0, tradesShown).map((t, idx) => (
                      <tr key={idx} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.a}/{t.b}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-400">{meta.recentDates[t.date] ?? "—"}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", t.side === "pos" ? "text-sky-300" : "text-amber-300")}>
                          {t.side.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{minuteIdxToClockLabel(t.entryMinuteIdx)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.exitMinuteIdx)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{fx(t.entryDev, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.peak, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(t.capture, isLightTheme))}>{fx(t.capture, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(t.pnlUsd, isLightTheme))}>{usd(t.pnlUsd, 2)}</td>
                        <td
                          className={clsx(
                            "whitespace-nowrap px-2.5 py-[5px] text-right uppercase",
                            t.status === "hard" ? "text-[#6ee7b7]" : t.status === "soft" ? "text-amber-300" : "text-zinc-500",
                          )}
                        >
                          {t.status}
                        </td>
                      </tr>
                    ))}
                    {tradeRows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No episodes in scope for these settings.
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
