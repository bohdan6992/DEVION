"use client";

/**
 * ARBITRAGE SCOUT — how a class has been paying over the last 5 / 20 / 40 sessions, per ticker,
 * with the entry threshold ("start") set in whichever unit is useful:
 *
 *   %  raw Stack%−Bench% gap at entry     σ  |dev_sig| at entry
 *   γ  a multiple of the ticker's gamma    δ  a multiple of the ticker's |delta|
 *
 * The bridge serves the published rolling_perf file as a trade log; every filter, aggregate, sort
 * and the $ P&L curve is computed HERE from it (lib/scout/compute.ts), so no control comes back to
 * the bridge and the table follows every keystroke.
 *
 * P&L model, fixed by the notebook that wrote the file: SHORT on a + deviation, LONG on a −
 * deviation, entry at the Stack% the class fired on, exit at that class's window close (09:30 PRE,
 * 10:00 OPEN, 16:00 INTRA, 20:00 POST) whether or not it normalised first; sized at $1000 by default.
 *
 * Look and toggles are the Arbitrage Scanner's — same header, control row, button families and
 * spinner (AGENTS.md), same accent classes and the shared EquityChart / GlassCard / metric cards.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import { useUi } from "../UiProvider";
import { EquityChart, PeakReversionTwoThirdsChart, PeakStrengthByTimeChart, StartsByTimeChart, StartsEndsByTimeChart } from "../scanner/shared/charts";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { getLiveStrategy } from "../../lib/strategies/registry";
import { intn, minuteIdxToClockLabel, sessionTimeChartRange } from "../../lib/scanner/format";
import type { PaperArbSession, TriMode } from "../../lib/scanner/types";
import {
  buildCurve,
  CLASS_CLOSE_MINUTE_IDX,
  computeScout,
  computeScoutAnalytics,
  maxDrawdown,
  SCOUT_MODES,
  sortRows,
  tickerEpisodes,
  tickerSeries,
  tickerTradeRows,
} from "../../lib/scout/compute";
import type { SortDir } from "../../lib/scout/compute";
import { loadScoutMeta, loadScoutSlice } from "../../lib/scout/client";
import type {
  ScoutClass,
  ScoutCurveMode,
  ScoutMeta,
  ScoutMode,
  ScoutParams,
  ScoutSide,
  ScoutSlice,
  ScoutSortKey,
  ScoutTradeRow,
  ScoutWindow,
} from "../../lib/scout/types";
import SpinnerInput from "./SpinnerInput";
import ScoutUnitBar from "./ScoutUnitBar";
import { daysBehind } from "../../lib/scout/freshness";
import ScoutRangeBoxes from "./ScoutRangeBoxes";
import ScoutOptimizer from "./ScoutOptimizer";
import { boundText, findBestSettings, type OptConfig, type OptObjective, type OptProgress } from "../../lib/scout/optimizeCore";
import { scoutCurrentConfig, scoutOptTable } from "../../lib/scout/optimize";
import { EMPTY_RANGE_TEXT, loadRangeText, parseRanges, type RangeText } from "../../lib/scout/ranges";

const CLASSES: Array<{ key: ScoutClass; label: string; closes: string }> = [
  { key: "pre", label: "PRE", closes: "21:00 → 09:30" },
  { key: "open", label: "OPEN", closes: "09:20 → 10:00" },
  { key: "intra", label: "INTRA", closes: "09:45 → 16:00" },
  { key: "post", label: "POST", closes: "16:00 → 20:00" },
];
const SIDES: Array<{ key: ScoutSide; label: string; hint: string }> = [
  { key: "short", label: "SHORT", hint: "+ deviation: the stack ran ahead of its bench → SHORT the stack" },
  { key: "long", label: "LONG", hint: "− deviation: the stack lagged its bench → LONG the stack" },
  { key: "both", label: "BOTH", hint: "both directions together" },
];
const WINDOWS: ScoutWindow[] = [5, 20, 40, 65];
const MODES: ScoutMode[] = ["pct", "sigma", "delta", "gamma"];
const SORT_BUTTONS: Array<{ key: ScoutSortKey; label: string }> = [
  { key: "beta", label: "BETA" },
  { key: "rating", label: "RATING" },
  { key: "start", label: "START" },
  { key: "pnl", label: "P&L" },
  { key: "trades", label: "TRADES" },
];

const UI_KEY = "scout.arb.ui.v1";
const PAGE_ROWS = 200;

type Bounds = Record<ScoutMode, { start: number; to: number }>;
type UiState = {
  cls: ScoutClass;
  side: ScoutSide;
  window: ScoutWindow;
  mode: ScoutMode;
  bounds: Bounds;
  minRate: number;
  minTotal: number;
  ranges: RangeText;
  model0402: boolean;
  capPct: number;
  sizeUsd: number;
  sortKey: ScoutSortKey;
  sortDir: SortDir;
  curveMode: ScoutCurveMode;
  excludeEtf: boolean;
  countryMode: TriMode;
  countries: string[];
  sectorMode: TriMode;
  sectors: string[];
};

const DEFAULT_UI: UiState = {
  cls: "open",
  side: "both",
  window: 20,
  mode: "sigma",
  bounds: {
    pct: { start: 0, to: 0 },
    sigma: { start: 0, to: 0 },
    gamma: { start: 0, to: 0 },
    delta: { start: 0, to: 0 },
  },
  minRate: 0,
  minTotal: 2,
  ranges: EMPTY_RANGE_TEXT,
  model0402: false,
  // GAMMA drops any single result past 25pp as "a data fault, not a trade"; the published file has
  // ~1.6k of them (one Stack% print of +2854pp alone is worth $28k at $1000). Same bar here.
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
      model0402: j.model0402 === true,
      capPct: numOr(j.capPct, DEFAULT_UI.capPct),
      sizeUsd: numOr(j.sizeUsd, DEFAULT_UI.sizeUsd),
      sortKey: pick(j.sortKey, ["ticker", "beta", "rating", "hard", "soft", "start", "entryTime", "trades", "pnl", "avgPnl", "win", "corr", "sigma"] as ScoutSortKey[], DEFAULT_UI.sortKey),
      sortDir: pick(j.sortDir, ["asc", "desc"] as SortDir[], DEFAULT_UI.sortDir),
      curveMode: pick(j.curveMode, ["daily", "trade"] as ScoutCurveMode[], DEFAULT_UI.curveMode),
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
// Mint / coral are the app-wide sign colours (feedback_color_semantics): P&L and direction only.
// The light theme has no override for the arbitrary-hex classes, so it gets the darker tailwind pair.
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

// ---------------------------------------------------------------------------------------------
// icons (STREAM / SCANNER / SONAR are copied from ScannerHeader so the row reads as one family)
// ---------------------------------------------------------------------------------------------

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

export default function ArbitrageScout() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const nav = getLiveStrategy("arbitrage")!.nav;

  const [ui, setUi] = useState<UiState>(loadUi);
  const patch = useCallback((p: Partial<UiState>) => setUi((prev) => ({ ...prev, ...p })), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { window.localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [ui]);

  // ---- data
  const [meta, setMeta] = useState<ScoutMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(true);

  const loadMeta = useCallback((force: boolean) => {
    setMetaBusy(true);
    setMetaError(null);
    loadScoutMeta(force)
      .then((m) => { setMeta(m); })
      .catch((e) => setMetaError(String(e?.message ?? e)))
      .finally(() => setMetaBusy(false));
  }, []);
  useEffect(() => { loadMeta(false); }, [loadMeta]);

  const signs = ui.side === "short" ? (["pos"] as const) : ui.side === "long" ? (["neg"] as const) : (["pos", "neg"] as const);
  const sliceKey = `${ui.cls}:${signs.join("+")}`;
  const [slices, setSlices] = useState<{ key: string; data: ScoutSlice[] } | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const sliceReq = useRef(0);

  useEffect(() => {
    if (!meta) return;
    const req = ++sliceReq.current;
    setSliceError(null);
    Promise.all(signs.map((s) => loadScoutSlice(ui.cls, s)))
      .then((data) => { if (req === sliceReq.current) setSlices({ key: sliceKey, data }); })
      .catch((e) => { if (req === sliceReq.current) setSliceError(String(e?.message ?? e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sliceKey]);

  const activeSlices = slices && slices.key === sliceKey ? slices.data : null;
  const sliceLoading = !!meta && !activeSlices && !sliceError;

  // ---- compute (re-runs on every control change; a few ms even for 130k trades)
  const countriesSet = useMemo(() => new Set(ui.countries), [ui.countries]);
  const sectorsSet = useMemo(() => new Set(ui.sectors), [ui.sectors]);
  const params: ScoutParams = useMemo(() => ({
    window: ui.window,
    mode: ui.mode,
    start: ui.bounds[ui.mode].start,
    to: ui.bounds[ui.mode].to,
    minRate: ui.minRate,
    minTotal: ui.minTotal,
    ranges: parseRanges(ui.ranges),
    model0402: ui.model0402,
    capPct: ui.capPct,
    sizeUsd: ui.sizeUsd,
    excludeEtf: ui.excludeEtf,
    countryMode: ui.countryMode,
    countries: countriesSet,
    sectorMode: ui.sectorMode,
    sectors: sectorsSet,
  }), [ui.window, ui.mode, ui.bounds, ui.minRate, ui.minTotal, ui.ranges, ui.model0402, ui.capPct, ui.sizeUsd, ui.excludeEtf, ui.countryMode, countriesSet, ui.sectorMode, sectorsSet]);

  // distinct COUNTRY/SECTOR values observed across the published ticker universe
  const countryOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.country).filter((v): v is string => !!v))].sort();
  }, [meta]);
  const sectorOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.sector).filter((v): v is string => !!v))].sort();
  }, [meta]);

  const result = useMemo(
    () => (meta && activeSlices ? computeScout(meta, activeSlices, params) : null),
    [meta, activeSlices, params],
  );

  const sorted = useMemo(
    () => (meta && result ? sortRows(meta, result.rows, ui.sortKey, ui.sortDir) : []),
    [meta, result, ui.sortKey, ui.sortDir],
  );

  const [selected, setSelected] = useState<number | null>(null);
  // ---- BEST SETTINGS: the search runs over the trades in view, with everything it tunes switched off
  const [optOpen, setOptOpen] = useState(false);
  const [optSeq, setOptSeq] = useState(0);
  const optScopeKeyAll = `${ui.cls}|${ui.side}|${ui.model0402}|${ui.capPct}|${ui.sizeUsd}|${ui.excludeEtf}|${ui.countryMode}:${ui.countries.join(",")}|${ui.sectorMode}:${ui.sectors.join(",")}`;
  const optScopeKey = `${optScopeKeyAll}|${ui.window}`;
  const runOpt = useCallback(
    (o: { objective: OptObjective; minTrades: number; multi: boolean; validate: boolean; onProgress: OptProgress; cancelled: () => boolean }) => {
      const { table, scope } = scoutOptTable(meta!, activeSlices!, params, { multi: o.multi, windows: WINDOWS, validate: o.validate });
      return findBestSettings(table, { sizeUsd: ui.sizeUsd, scope, current: scoutCurrentConfig(params), objective: o.objective, minTrades: o.minTrades, onProgress: o.onProgress, cancelled: o.cancelled });
    },
    [meta, activeSlices, params, ui.sizeUsd],
  );
  const applyOpt = (c: OptConfig) => {
    const unit = c.unit as ScoutMode;
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
      const s = tickerSeries(meta, activeSlices, params, selected);
      return buildCurve(meta, ui.window, s.dailyUsd, s.tradeUsd, s.tradeDate, ui.curveMode);
    }
    return buildCurve(meta, ui.window, result.dailyUsd, result.tradeSeriesUsd, result.tradeSeriesDate, ui.curveMode);
  }, [meta, result, activeSlices, params, selected, ui.window, ui.curveMode]);

  const dd = useMemo(() => (curve ? maxDrawdown(curve) : NaN), [curve]);

  // Episodes feed the same "by time" chart group the Arbitrage Scanner draws (components/scanner/
  // shared/charts.tsx) — selecting a ticker narrows them exactly like the equity curve does.
  const episodes = useMemo(() => {
    if (!meta || !result || !activeSlices) return [];
    return selected !== null ? tickerEpisodes(meta, activeSlices, params, selected) : result.episodes;
  }, [meta, result, activeSlices, params, selected]);
  const chartRange = useMemo(() => sessionTimeChartRange(ui.cls.toUpperCase() as PaperArbSession), [ui.cls]);

  // The per-trade detail table: date/entry/exit/start%/end%/sum%/direction/deviation-in-every-unit.
  // Selecting a ticker narrows it exactly like the equity curve and the charts above.
  const tradeRows = useMemo(() => {
    if (!meta || !result || !activeSlices) return [];
    const rows = selected !== null ? tickerTradeRows(meta, activeSlices, params, selected) : result.tradeRows;
    return [...rows].sort((a, b) => a.date - b.date || a.entryMinuteIdx - b.entryMinuteIdx);
  }, [meta, result, activeSlices, params, selected]);
  const [tradesShown, setTradesShown] = useState(PAGE_ROWS);
  useEffect(() => { setTradesShown(PAGE_ROWS); }, [tradeRows]);

  // The Scanner's own analytics summary block, ported to Scout's trade log (lib/scout/compute.ts).
  const analyticsSummary = useMemo(() => computeScoutAnalytics(tradeRows, ui.sizeUsd), [tradeRows, ui.sizeUsd]);

  const onSort = (key: ScoutSortKey) =>
    setUi((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key ? (prev.sortDir === "asc" ? "desc" : "asc") : "desc",
    }));

  const setBound = (which: "start" | "to", v: number) =>
    setUi((prev) => ({ ...prev, bounds: { ...prev.bounds, [prev.mode]: { ...prev.bounds[prev.mode], [which]: v } } }));

  // ---- header chrome, copied from the scanner
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

  const modeInfo = SCOUT_MODES[ui.mode];
  const levelsOk = meta?.levelsAvailable ?? false;
  const D = meta?.recentDates.length ?? 0;
  const winFrom = meta ? meta.recentDates[Math.max(0, D - ui.window)] : null;
  const winTo = meta ? meta.recentDates[D - 1] : null;
  const busy = metaBusy || sliceLoading;
  const behind = meta ? daysBehind(meta.mostRecentSession) : null;
  const model0402Ready = !!meta?.model0402 && ui.cls === "pre";
  const selectedTicker = meta && selected !== null ? meta.tickers[selected].t : null;


  const th = (label: string, key: ScoutSortKey | null, title?: string, left = false) => (
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

  const lvl = (a: [number, number]) => {
    if (ui.side === "short") return fx(a[0]);
    if (ui.side === "long") return fx(a[1]);
    return `${fx(a[0])} | ${fx(a[1])}`;
  };

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <header className="scanner-header-surface bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <GlitchTitle text="ARBITRAGE SCOUT" />
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
              title="Reload the published rolling_perf file and the gamma/delta levels from the bridge"
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
          <SpinnerInput label="MINRATE" ariaLabel="min rate" title="Published rating of the class and side (all history, not the window): (hard + soft) / total must be at least this"
            value={ui.minRate} onChange={(v) => patch({ minRate: v })} step={0.05} min={0} max={1} decimals={2} />
          <SpinnerInput label="MINTOTAL" ariaLabel="min total" title="Published rating of the class and side must rest on at least this many situations"
            value={ui.minTotal} onChange={(v) => patch({ minTotal: Math.trunc(v) })} step={1} min={0} decimals={0} />
          <ScoutRangeBoxes
            value={ui.ranges}
            onChange={(ranges) => patch({ ranges })}
            titles={{
              corr: "Correlation of the ticker to its benchmark",
              beta: "Beta to the benchmark (magnitude)",
              sigma: "Sigma of the ticker's deviation",
              alpha: "Alpha — the ticker's own level per side (magnitude), for the side of each trade",
            }}
          />
        </div>

        <div className="scanner-control-surface flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className={groupClass}>
              {CLASSES.map((c) => (
                <button key={c.key} type="button" onClick={() => { patch({ cls: c.key }); setSelected(null); }} className={btn(ui.cls === c.key)} title={`${c.label} ${c.closes} — P&L marked at its close`}>
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
                {(["daily", "trade"] as ScoutCurveMode[]).map((m) => (
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
                {ui.model0402 && model0402Ready && <span className="accent-text">MODEL: trading starts 04:02</span>}
                <span>{ui.cls.toUpperCase()} · {ui.side === "both" ? "SHORT+LONG" : ui.side.toUpperCase()} · ${ui.sizeUsd.toLocaleString("en-US")}/trade · exit = last print inside the window</span>
                {result && result.cappedOut > 0 && <span>{result.cappedOut.toLocaleString("en-US")} trades excluded by CAP</span>}
                {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
                {!levelsOk && <span className="text-amber-300/80">γ/δ not published yet — % and σ only</span>}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => patch({ excludeEtf: !ui.excludeEtf })}
            className={btn(ui.excludeEtf)}
            title="Drop every ticker DailyStaticStore says is an ETF (a ticker with no ETF data yet still passes)"
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
          <button
            type="button"
            disabled={!model0402Ready}
            onClick={() => patch({ model0402: !ui.model0402 })}
            className={btn(ui.model0402 && model0402Ready, !model0402Ready)}
            title={
              !meta?.model0402
                ? "Not in the published file yet - re-run ArbitRage.ipynb (it now also writes the 04:02 track)."
                : ui.cls !== "pre"
                  ? "The 04:02 model only exists for PRE - switch the class to PRE."
                  : "MODEL: trading only STARTS at 04:02. PRE then shows the second track from the notebook - every deviation already open at 04:02 is taken at its 04:02 price (not the overnight one), a name whose overnight deviation had normalised can start a new one later, all held to 09:30 - and every table, chart and total is recomputed on it. The MINRATE/MINTOTAL ratings stay the published ones, computed on the 21:00 model."
            }
          >
            FROM 04:02
          </button>
          <button
            type="button"
            onClick={() => { setOptOpen(true); setOptSeq((n) => n + 1); }}
            className={clsx(TOOLBAR_BUTTON_BASE, optOpen ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
            title="Search the entry threshold, ρ/β/σ/α ranges and rating gates for the best result on the trades in view (class, side, window and filters as selected)"
          >
            ✦ BEST SETTINGS
          </button>
          {selectedTicker && (
            <button type="button" onClick={() => setSelected(null)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE, "gap-2")} title="Show the whole table's curve again">
              {selectedTicker} <span aria-hidden="true">✕</span>
            </button>
          )}
          <div className="ml-auto">
            <ScoutUnitBar
              options={MODES.map((m) => ({
                key: m,
                label: SCOUT_MODES[m].label === "δ" ? "Δ" : SCOUT_MODES[m].label,
                title: (m === "gamma" || m === "delta") && !levelsOk ? "gamma/delta are not published in the current best_params file" : SCOUT_MODES[m].hint,
                locked: (m === "gamma" || m === "delta") && !levelsOk,
              }))}
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

        {optOpen && (
          <ScoutOptimizer
            runSeq={optSeq}
            scopeKey={optScopeKey}
            scopeKeyAll={optScopeKeyAll}
            windowDays={ui.window}
            ready={!!meta && !!activeSlices}
            run={runOpt}
            unitLabel={(k) => `${SCOUT_MODES[k as ScoutMode].label} ${SCOUT_MODES[k as ScoutMode].unit}`}
            onApply={applyOpt}
            onClose={() => setOptOpen(false)}
          />
        )}

        {/* States */}
        {meta && behind !== null && behind >= 5 && (
          <GlassCard hoverable={false} className="border-amber-300/25 bg-amber-300/[0.04] px-4 py-3">
            <div className="font-mono text-[11px] text-amber-200/90">
              The published file ends {meta.mostRecentSession} — {behind} days ago. Nothing after that date is in these numbers: re-run ArbitRage.ipynb and publish arbitrage/rolling_perf.json.gz again{meta.generatedAt ? ` (file generated ${meta.generatedAt.slice(0, 16).replace("T", " ")}Z)` : ""}.
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
              {meta ? "loading trades…" : "loading — the first request after a bridge restart downloads and parses the published file (~10 s)…"}
            </div>
          </GlassCard>
        )}

        {meta && result && (
          <>
            {/* MINRATE/MINTOTAL gate the PUBLISHED (all-history) rating of the class and side. */}
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

            {/* Totals — the gate/classification numbers Scout adds on top of P&L */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryMetricCard label="TICKERS" value={`${result.rows.length.toLocaleString("en-US")} / ${result.tickersInScope.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="RATING" value={pct1(result.rating)} valueClassName={ratingTone(result.rating)} />
              <SummaryMetricCard label="HARD / SOFT" value={isNum(result.rating) ? `${pct1(result.ratingHard)} / ${pct1(result.ratingSoft)}` : "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MAX DRAWDOWN" value={isNum(dd) ? usd(-dd) : "—"} valueClassName={dd > 0 ? (isLightTheme ? "text-rose-700" : SOFT_LOSS_TEXT_CLASS) : "text-zinc-400"} />
            </div>

            {/* Analytics summary — ported card-for-card from the Arbitrage Scanner's own
                analyticsSummary block (lib/scout/compute.ts's computeScoutAnalytics). */}
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

            {/* Equity curve + the same "by time" chart group the Arbitrage Scanner draws */}
            {curve && curve.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <EquityChart
                  points={curve}
                  title={`EQUITY CURVE | ${selectedTicker ?? "ALL SELECTED"} | ${ui.curveMode.toUpperCase()}`}
                  meta={`${ui.cls.toUpperCase()} · ${ui.window}D · $${ui.sizeUsd.toLocaleString("en-US")}/trade`}
                />
                <StartsEndsByTimeChart
                  rows={episodes}
                  title="START VS END BY TIME | 5M"
                  meta={`rows ${episodes.length}`}
                  xFrom={chartRange.from}
                  xTo={chartRange.to}
                />
              </div>
            ) : (
              <GlassCard hoverable={false} className="px-4 py-10 text-center text-[11px] font-mono text-zinc-600">
                No trades in scope for these settings.
              </GlassCard>
            )}

            {episodes.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <StartsByTimeChart
                  rows={episodes}
                  title="START EVENTS BY TIME (OK/BAD) | 5M"
                  meta={`rows ${episodes.length}`}
                  xFrom={chartRange.from}
                  xTo={chartRange.to}
                />
                <PeakStrengthByTimeChart
                  rows={episodes}
                  title="PEAK STRENGTH BY TIME | 5M"
                  meta={`rows ${episodes.length}`}
                  xFrom={chartRange.from}
                  xTo={chartRange.to}
                />
                <PeakReversionTwoThirdsChart
                  rows={episodes}
                  title="PEAK REVERSION ≥ 2/3 | 5M"
                  meta={`rows ${episodes.length}`}
                  xFrom={chartRange.from}
                  xTo={chartRange.to}
                />
              </div>
            )}

            {/* Table */}
            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.12em] text-zinc-500">
                      {th("TICKER", "ticker", undefined, true)}
                      {th("BENCH", null, undefined, true)}
                      {th("BETA", "beta", "β to the benchmark")}
                      {th("CORR", "corr", "ρ to the benchmark")}
                      {th("SIGMA", "sigma", "the ticker's own volatility")}
                      {th("γ", null, "gamma level — best reversal-entry deviation (dev_sig units)")}
                      {th("δ", null, "delta — median dev_sig at the 09:30 open over the last 5 days")}
                      {th(`START ${modeInfo.unit}`, "start", "mean entry deviation of the trades in scope, in the chosen unit")}
                      {th("ENTRY", "entryTime", "mean entry clock time of the trades in scope (NY)")}
                      {th("EXIT", null, "when the exit mark was really printed: the last print inside the class window (a thin name can stop printing hours before the close)")}
                      {th("TRADES", "trades")}
                      {th("RATING", "rating", "published rating (all history) of the class and side(s) shown: (hard + soft) / total")}
                      {th("TOTAL", null, "situations behind the published rating")}
                      {th("HARD", "hard", "published hard share")}
                      {th("SOFT", "soft", "published soft share")}
                      {th("WIN", "win", "share of trades with P&L > 0")}
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
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{tk.bench ?? "—"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(tk.beta, 3)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(tk.corr, 3)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(tk.sigma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{lvl(tk.gamma)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{lvl(tk.delta)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(r.start, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{minuteIdxToClockLabel(r.entryMinuteIdx)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(r.exitMinuteIdx)}</td>
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
                        <td colSpan={18} className="px-4 py-10 text-center text-[11px] text-zinc-600">
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

            {/* Per-trade detail — date/entry/exit/start%/end%/sum%/direction/deviation in every unit */}
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
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">SIDE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="clock time the class fired (NY)">ENTRY</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="when the exit mark was really printed (last print inside the class window)">EXIT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="minutes without a print before the run that became this trade; large = first print after a long silence (stale-price suspect)">GAP MIN</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="Stack%−Bench% at birth">START %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="Stack%−Bench% at the window close">END %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry → class close, percentage points">SUM %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L $</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry deviation, %">DEV %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry deviation, σ">DEV σ</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry deviation, × the ticker's own γ">DEV γ</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="entry deviation, × the ticker's own δ">DEV δ</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeRows.slice(0, tradesShown).map((t, idx) => (
                      <tr key={idx} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.ticker}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-400">{meta.recentDates[t.date] ?? "—"}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", t.side === "short" ? "text-sky-300" : "text-amber-300")}>
                          {t.side.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{minuteIdxToClockLabel(t.entryMinuteIdx)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.exitMinuteIdx)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", t.birthGapMin > 10 ? "text-amber-300" : "text-zinc-600")}>{fx(t.birthGapMin, 0)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{fx(t.startGapPct, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{fx(t.endGapPct, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(t.pnlPct, isLightTheme))}>{fx(t.pnlPct, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(t.pnlUsd, isLightTheme))}>{usd(t.pnlUsd, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devPct, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devSigma, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devGamma, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devDelta, 2)}</td>
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
                        <td colSpan={15} className="px-4 py-10 text-center text-[11px] text-zinc-600">
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
