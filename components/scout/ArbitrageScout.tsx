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
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import SharedFilterPresetBar from "../shared/filters/SharedFilterPresetBar";
import SharedRatingModeRow from "../shared/filters/SharedRatingModeRow";
import SharedClassRow from "../shared/filters/SharedClassRow";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND } from "../../lib/presets/sharedFilterPreset";
import { useTickerLists } from "../shared/filters/useTickerLists";
import TickerListPanels from "../shared/filters/TickerListPanels";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
import type { SectorCorrExclusion } from "../../lib/filters/sectorCorr";
import { SECTOR_CORR_DEFAULT } from "../../lib/filters/sectorCorr";
import { useUi } from "../UiProvider";
import { EquityChart, PeakReversionTwoThirdsChart, PeakStrengthByTimeChart, StartsByTimeChart, StartsEndsByTimeChart } from "../scanner/shared/charts";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { getLiveStrategy } from "../../lib/strategies/registry";
import { intn, minuteIdxToClockLabel, sessionTimeChartRange, fmtSessionDate } from "../../lib/scanner/format";
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
  ScoutRegime,
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

// How SPY and QQQ stand at the open: the 16:00 -> 09:30 move, published per session by the bridge
// (OvernightRegimeService). The operator asked for 21:00 -> 09:30; the END is the same and the
// anchor moved to the official close because the 21:00 print is a thin-book quote - measured, see
// that service's header. The bands are 0.5 of each index's OWN sigma, since no published standard
// exists: practitioners count a "real gap" from a flat 0.1% and call 1% big, and this file lands
// on those same figures. UNK is a real bucket, never a synonym for FLAT.
const REGIMES: Array<{ key: ScoutRegime; label: string; hint: string }> = [
  { key: "all", label: "ALL", hint: "every session in the window, however the market opened" },
  { key: "up", label: "UP", hint: "BOTH SPY and QQQ open above +0.5 sigma of the 16:00->09:30 move (SPY +0.316%, QQQ +0.428%)" },
  { key: "down", label: "DOWN", hint: "BOTH SPY and QQQ open below -0.5 sigma of the 16:00->09:30 move (SPY -0.316%, QQQ -0.428%)" },
  { key: "flat", label: "FLAT", hint: "BOTH SPY and QQQ open inside the band - the session starts where it closed" },
  { key: "mixed", label: "MIXED", hint: "SPY and QQQ disagree about the open - one cleared its band, the other did not" },
  { key: "unk", label: "UNK", hint: "no usable 09:30 print for one of them - a real bucket, never folded into FLAT" },
];
const MODES: ScoutMode[] = ["pct", "sigma", "delta", "gamma", "alpha"];
const SORT_BUTTONS: Array<{ key: ScoutSortKey; label: string }> = [
  { key: "beta", label: "BETA" },
  { key: "rating", label: "RATING" },
  { key: "start", label: "START" },
  { key: "pnl", label: "P&L" },
  { key: "trades", label: "TRADES" },
];

const UI_KEY = "scout.arb.ui.v1";
const PAGE_ROWS = 200;

// start = the SHORT side's floor, startNeg = the LONG side's (0 = "as short"), to = the upper
// bound on start. Same three roles the Scanner's coral / mint / zinc boxes carry.
type Bounds = Record<ScoutMode, { start: number; startNeg: number; to: number }>;
type UiState = {
  cls: ScoutClass;
  side: ScoutSide;
  window: ScoutWindow;
  regime: ScoutRegime;
  mode: ScoutMode;
  bounds: Bounds;
  minRate: number;
  minTotal: number;
  ratingMode: "live" | "asof" | "asofew";
  outcomeType: "any" | "hard" | "soft";
  ratingsIgnored: boolean;
  /** FROZEN / CORE / NORM-NRRW: three independent switches beside the mode radio, as on the
   * Scanner. They need a per-day replay this page does not have, so they hold their state and
   * say so - the row is the Scanner's, control for control, at the operator's own request. */
  ratingsFrozen: boolean;
  coreOnly: boolean;
  outcomeRule: "norm" | "narrow";
  /** ALL shows every ticker; TOP caps the table at the best `topN` by the current sort. */
  scopeMode: "ALL" | "TOP";
  topN: number;
  ranges: RangeText;
  model0402: boolean;
  capPct: number;
  sizeUsd: number;
  sortKey: ScoutSortKey;
  sortDir: SortDir;
  curveMode: ScoutCurveMode;
  excludeEtf: boolean;
  excludeItb: boolean;
  excludeHard: boolean;
  excludePtp: boolean;
  excludeSsr: boolean;
  excludeCrap: boolean;
  excludeNews: boolean;
  excludeReport: boolean;
  includeUsa: boolean;
  includeChina: boolean;
  excludeDividend: boolean;
  excludeAnom: boolean;
  exchangeMode: TriMode;
  exchanges: string[];
  countryMode: TriMode;
  countries: string[];
  sectorMode: TriMode;
  sectors: string[];
};

/** This page has no episode replay to seed a sector-correlation set from, so the CORR pill
 * holds its state and rejects nothing - the same shape ArbitrageSpectr uses. */
const EMPTY_CORR_STATUS: SectorCorrExclusion = { excluded: new Set<string>(), seedCount: 0, loading: false, error: null };

const DEFAULT_UI: UiState = {
  cls: "open",
  side: "both",
  window: 20,
  regime: "all",
  mode: "sigma",
  bounds: {
    pct: { start: 0, startNeg: 0, to: 0 },
    sigma: { start: 0, startNeg: 0, to: 0 },
    gamma: { start: 0, startNeg: 0, to: 0 },
    delta: { start: 0, startNeg: 0, to: 0 },
    alpha: { start: 0, startNeg: 0, to: 0 },
  },
  minRate: 0,
  minTotal: 2,
  ratingMode: "asof",
  outcomeType: "any",
  ratingsIgnored: false,
  ratingsFrozen: false,
  coreOnly: false,
  outcomeRule: "norm",
  scopeMode: "ALL",
  topN: 100,
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
  excludeItb: false,
  excludeHard: false,
  excludePtp: false,
  excludeSsr: false,
  excludeCrap: false,
  excludeNews: false,
  excludeReport: false,
  includeUsa: false,
  includeChina: false,
  excludeDividend: false,
  excludeAnom: false,
  exchangeMode: "off",
  exchanges: [],
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
      if (b) bounds[m] = { start: numOr(b.start, 0), startNeg: numOr(b.startNeg, 0), to: numOr(b.to, 0) };
    }
    return {
      cls: pick(j.cls, CLASSES.map((c) => c.key), DEFAULT_UI.cls),
      side: pick(j.side, SIDES.map((s) => s.key), DEFAULT_UI.side),
      window: pick(j.window, WINDOWS, DEFAULT_UI.window),
      regime: pick(j.regime, REGIMES.map((r) => r.key), DEFAULT_UI.regime),
      mode: pick(j.mode, MODES, DEFAULT_UI.mode),
      bounds,
      minRate: numOr(j.minRate, DEFAULT_UI.minRate),
      minTotal: numOr(j.minTotal, DEFAULT_UI.minTotal),
      ratingMode: pick(j.ratingMode, ["live", "asof", "asofew"] as const, DEFAULT_UI.ratingMode),
      outcomeType: pick(j.outcomeType, ["any", "hard", "soft"] as const, DEFAULT_UI.outcomeType),
      ratingsIgnored: j.ratingsIgnored === true,
      ratingsFrozen: j.ratingsFrozen === true,
      coreOnly: j.coreOnly === true,
      outcomeRule: pick(j.outcomeRule, ["norm", "narrow"] as const, DEFAULT_UI.outcomeRule),
      scopeMode: pick(j.scopeMode, ["ALL", "TOP"] as const, DEFAULT_UI.scopeMode),
      topN: numOr(j.topN, DEFAULT_UI.topN),
      ranges: loadRangeText(j.ranges),
      model0402: j.model0402 === true,
      capPct: numOr(j.capPct, DEFAULT_UI.capPct),
      sizeUsd: numOr(j.sizeUsd, DEFAULT_UI.sizeUsd),
      sortKey: pick(j.sortKey, ["ticker", "beta", "rating", "hard", "soft", "start", "entryTime", "trades", "pnl", "avgPnl", "win", "corr", "sigma"] as ScoutSortKey[], DEFAULT_UI.sortKey),
      sortDir: pick(j.sortDir, ["asc", "desc"] as SortDir[], DEFAULT_UI.sortDir),
      curveMode: pick(j.curveMode, ["daily", "trade"] as ScoutCurveMode[], DEFAULT_UI.curveMode),
      excludeEtf: j.excludeEtf === true,
      excludeItb: j.excludeItb === true,
      excludeHard: j.excludeHard === true,
      excludePtp: j.excludePtp === true,
      excludeSsr: j.excludeSsr === true,
      excludeCrap: j.excludeCrap === true,
      excludeNews: j.excludeNews === true,
      excludeReport: j.excludeReport === true,
      includeUsa: j.includeUsa === true,
      includeChina: j.includeChina === true,
      excludeDividend: j.excludeDividend === true,
      excludeAnom: j.excludeAnom === true,
      exchangeMode: pick(j.exchangeMode, ["off", "include", "exclude"] as TriMode[], DEFAULT_UI.exchangeMode),
      exchanges: Array.isArray(j.exchanges) ? j.exchanges.filter((v): v is string => typeof v === "string") : DEFAULT_UI.exchanges,
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
  // Keyed per PAGE, not per strategy: a Scout ignore list ("not interesting in my
  // research table") is a different statement from a Sonar one ("do not trade today").
  const lists = useTickerLists("arbitrage-scout");
  // The eye at the end of the preset group. On the Scanner it reveals the shared min/max
  // panel; the equivalent here is the full preset manager, which is the one thing this page
  // has that does not fit in the compact bar.
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  // The CORR box keeps its own text so a half-typed value is not clamped mid-edit - the same
  // shape every other surface uses for it.
  const [corrThresholdInput, setCorrThresholdInput] = useState(String(SECTOR_CORR_DEFAULT));
  const corrThreshold = Number(corrThresholdInput) || SECTOR_CORR_DEFAULT;
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
  const exchangesSet = useMemo(() => new Set(ui.exchanges), [ui.exchanges]);
  const params: ScoutParams = useMemo(() => ({
    window: ui.window,
    regime: ui.regime,
    mode: ui.mode,
    start: ui.bounds[ui.mode].start,
    startNeg: ui.bounds[ui.mode].startNeg,
    to: ui.bounds[ui.mode].to,
    minRate: ui.minRate,
    minTotal: ui.minTotal,
    ratingMode: ui.ratingMode,
    outcomeType: ui.outcomeType,
    ratingsIgnored: ui.ratingsIgnored,
    ranges: parseRanges(ui.ranges),
    model0402: ui.model0402,
    capPct: ui.capPct,
    sizeUsd: ui.sizeUsd,
    excludeEtf: ui.excludeEtf,
    excludeItb: ui.excludeItb,
    excludeHard: ui.excludeHard,
    excludePtp: ui.excludePtp,
    excludeSsr: ui.excludeSsr,
    excludeCrap: ui.excludeCrap,
    excludeNews: ui.excludeNews,
    excludeReport: ui.excludeReport,
    includeUsa: ui.includeUsa,
    includeChina: ui.includeChina,
    excludeDividend: ui.excludeDividend,
    excludeAnom: ui.excludeAnom,
    exchangeMode: ui.exchangeMode,
    exchanges: exchangesSet,
    countryMode: ui.countryMode,
    countries: countriesSet,
    sectorMode: ui.sectorMode,
    sectors: sectorsSet,
  }), [ui.window, ui.regime, ui.mode, ui.bounds, ui.minRate, ui.minTotal, ui.ratingMode, ui.outcomeType, ui.ratingsIgnored, ui.ranges, ui.model0402, ui.capPct, ui.sizeUsd, ui.excludeEtf, ui.excludeItb, ui.excludeHard, ui.excludePtp, ui.excludeSsr, ui.excludeCrap, ui.excludeNews, ui.excludeReport, ui.includeUsa, ui.includeChina, ui.excludeDividend, ui.excludeAnom, ui.exchangeMode, exchangesSet, ui.countryMode, countriesSet, ui.sectorMode, sectorsSet]);

  // How many of the sessions the WINDOW admits carry each label. Without it, picking UP on a 5D
  // window just shows an empty table, which reads as a broken page rather than as "none of these
  // five nights was an up night".
  const regimeCounts = useMemo(() => {
    const out: Record<string, number> = {};
    if (!meta) return out;
    const from = Math.max(0, meta.recentDates.length - ui.window);
    for (let i = from; i < meta.recentDates.length; i++) {
      const k = (meta.regimes[i] ?? "UNKNOWN").toLowerCase();
      out[k] = (out[k] ?? 0) + 1;
      out.all = (out.all ?? 0) + 1;
    }
    return out;
  }, [meta, ui.window]);

  // distinct COUNTRY/SECTOR values observed across the published ticker universe
  const countryOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.country).filter((v): v is string => !!v))].sort();
  }, [meta]);
  const sectorOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.sector).filter((v): v is string => !!v))].sort();
  }, [meta]);
  const exchangeOptions = useMemo(() => {
    if (!meta) return [];
    return [...new Set(meta.tickers.map((t) => t.exchange).filter((v): v is string => !!v))].sort();
  }, [meta]);

  const result = useMemo(
    () => (meta && activeSlices ? computeScout(meta, activeSlices, params) : null),
    [meta, activeSlices, params],
  );

  const sorted = useMemo(
    () => {
      // IGNORE/APPLY hide rows; PIN only reorders them. Only the mode the header has
      // selected applies - see useTickerLists.allows/pinRank.
      if (!meta || !result) return [];
      const bySort = sortRows(meta, result.rows, ui.sortKey, ui.sortDir);
      const kept = bySort.filter((r) => lists.allows(meta.tickers[r.i].t));
      const ranked = lists.listMode === "pin"
        ? [...kept].sort((a, b) => lists.pinRank(meta.tickers[a.i].t) - lists.pinRank(meta.tickers[b.i].t))
        : kept;
      // TOP keeps the head of the CURRENT sort, so it narrows what you are looking at
      // rather than re-ranking it.
      return ui.scopeMode === "TOP" ? ranked.slice(0, Math.max(1, ui.topN)) : ranked;
    },
    [meta, result, ui.sortKey, ui.sortDir, lists],
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

  const setBound = (which: "start" | "startNeg" | "to", v: number) =>
    setUi((prev) => ({ ...prev, bounds: { ...prev.bounds, [prev.mode]: { ...prev.bounds[prev.mode], [which]: v } } }));

  // ---- header chrome, copied from the scanner
  const headerNavGroupClass = isLightTheme
    ? "flex h-7 items-center gap-2 rounded-lg border border-slate-900/10 bg-white/35"
    : "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const headerNavInactiveClass = isLightTheme
    ? "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const btn = (active: boolean, disabled = false) =>
    clsx(TOOLBAR_BUTTON_BASE, disabled ? "cursor-not-allowed border-transparent text-zinc-700" : active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  // The class row's own groups carry NO container tint - that is how the Scanner draws them, and
  // the tinted version is what made this row read as three boxed strips instead of three groups.
  const rowGroupClass = "flex h-7 items-center gap-2";
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
        {/* The header every surface shares - components/scanner/shell/panels/ScannerHeader. This
            page kept a private copy longest, because it sits in components/scout/ rather than
            components/<x>Scout/ and so missed the pass that converted its seven siblings. */}
        <ScannerHeader
          scannerShellTitle="ARBITRAGE•SCOUT"
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref={nav.stream}
          navScannerHref={nav.scanner}
          navSonarHref={nav.sonar}
          navScoutHref={nav.scout}
          navSpectrHref={nav.spectr}
          primaryPanel="scout"
          showLists
          listMode={lists.listMode}
          ignCount={lists.ignoreSet.size}
          appCount={lists.applySet.size}
          pinCount={lists.pinSet.size}
          showIgnore={lists.showIgnore}
          showApply={lists.showApply}
          showPin={lists.showPin}
          setShowIgnore={lists.setShowIgnore}
          setShowApply={lists.setShowApply}
          setShowPin={lists.setShowPin}
          setModeIgnore={lists.setModeIgnore}
          setModeApply={lists.setModeApply}
          setModePin={lists.setModePin}
          canRun={!metaBusy}
          run={() => { setSelected(null); loadMeta(true); }}
          busy={busy}
          variantString="Reload the published arbitrage_rolling_perf file and the gamma/delta levels from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* Controls — laid out like the Scanner: rating row on the right above the card, the
            class / side / window card, then the filter row with the ZAP unit group at its right end */}
        {/* The Scanner's rating row, as ONE component — components/shared/filters/SharedRatingModeRow.
            RATE/UNIVERSE, ASOF/EXPO/LIVE, the ❄/CORE/NORM switches and MINRATE/MINTOTAL all live
            there now; only the range boxes, which genuinely differ per strategy, stay here. */}
        <SharedRatingModeRow
          ratingsIgnored={ui.ratingsIgnored}
          setRatingsIgnored={(v) => patch({ ratingsIgnored: v })}
          ratingMode={ui.ratingMode}
          setRatingMode={(v) => patch({ ratingMode: v })}
          frozen={ui.ratingsFrozen}
          setFrozen={(v) => patch({ ratingsFrozen: v })}
          coreOnly={ui.coreOnly}
          setCoreOnly={(v) => patch({ coreOnly: v })}
          outcomeRule={ui.outcomeRule}
          setOutcomeRule={(v) => patch({ outcomeRule: v })}
          minRate={ui.minRate}
          setMinRate={(v) => patch({ minRate: v })}
          minTotal={ui.minTotal}
          setMinTotal={(v) => patch({ minTotal: Math.trunc(v) })}
          switchesInert
          rangesSlot={
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
          }
        />

                <SharedClassRow
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `${c.label} ${c.closes} — P&L marked at its close` }))}
          cls={ui.cls}
          setCls={(k) => { patch({ cls: k }); setSelected(null); }}
          scopeMode={ui.scopeMode}
          setScopeMode={(m2) => patch({ scopeMode: m2 })}
          topN={ui.topN}
          outcomeType={ui.outcomeType}
          setOutcomeType={(rt) => patch({ outcomeType: rt })}
          rightSlot={
  <SharedFilterPresetBar
                  getConfigJson={() => JSON.stringify({
                    minCorr: ui.ranges.corr.min, maxCorr: ui.ranges.corr.max,
                    minBeta: ui.ranges.beta.min, maxBeta: ui.ranges.beta.max,
                    minSigma: ui.ranges.sigma.min, maxSigma: ui.ranges.sigma.max,
                  })}
                  applyConfigJson={(json) => {
                    try {
                      const j = JSON.parse(json) as Record<string, unknown>;
                      const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                      patch({ ranges: {
                        ...ui.ranges,
                        corr: { min: txt(j.minCorr), max: txt(j.maxCorr) },
                        beta: { min: txt(j.minBeta), max: txt(j.maxBeta) },
                        sigma: { min: txt(j.minSigma), max: txt(j.maxSigma) },
                      } });
                      return true;
                    } catch {
                      return false; // older build, or hand-edited - leave the filters alone
                    }
                  }}
                  onClear={() => patch({ ranges: {
                    ...ui.ranges,
                    corr: { min: "", max: "" }, beta: { min: "", max: "" }, sigma: { min: "", max: "" },
                  } })}
                  showPanel={showPresetPanel}
                  setShowPanel={setShowPresetPanel}
                />
          }
          infoSlot={meta ? (
            <>
                    <span>SESSIONS {fmtSessionDate(winFrom, true)} → {fmtSessionDate(winTo, true)}</span>
                    {ui.model0402 && model0402Ready && <span className="accent-text">MODEL: trading starts 04:02</span>}
                    <span>{ui.cls.toUpperCase()} · {ui.side === "both" ? "SHORT+LONG" : ui.side.toUpperCase()} · ${ui.sizeUsd.toLocaleString("en-US")}/trade · exit = last print inside the window</span>
                    {result && result.cappedOut > 0 && <span>{result.cappedOut.toLocaleString("en-US")} trades excluded by CAP</span>}
                    {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
                    {!levelsOk && <span className="text-amber-300/80">γ/δ not published yet — % and σ only</span>}
            </>
          ) : null}
        />

        {showPresetPanel && (
          <PresetPicker
            kind={SHARED_FILTER_PRESET_API_KIND}
            scope="BOTH"
            sharedFilterOnly
            getCurrentConfigJson={() => JSON.stringify({
              minCorr: ui.ranges.corr.min, maxCorr: ui.ranges.corr.max,
              minBeta: ui.ranges.beta.min, maxBeta: ui.ranges.beta.max,
              minSigma: ui.ranges.sigma.min, maxSigma: ui.ranges.sigma.max,
            })}
            onApplyPresetJson={(presetJson) => {
              try {
                const j = JSON.parse(presetJson) as Record<string, unknown>;
                const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                patch({ ranges: {
                  ...ui.ranges,
                  corr: { min: txt(j.minCorr), max: txt(j.maxCorr) },
                  beta: { min: txt(j.minBeta), max: txt(j.maxBeta) },
                  sigma: { min: txt(j.minSigma), max: txt(j.maxSigma) },
                } });
              } catch {
                // older build, or hand-edited - leave the filters alone
              }
            }}
          />
        )}

        {/* The SAME toggle row the Scanner and Sonar render - components/shared/filters/FilterFlagsRow.
            Every pill here filters for real: the flags come off the tape (the session-static sidecar
            for ETF/PTP/SSR/CRAP/REP, the newest tape day for ITB/HARD and NEWS), the source the
            Scanner reads too. DIV is deliberately absent rather than drawn dead - `Dividend` is in
            the live DTO but has never existed on TapeRowV1, so no tape day carries it and the pill
            would reject nothing while looking like it works. ANOM likewise has no POST-window
            anomaly on a reference table. */}
        <FilterFlagsRow
          exclusions={[
            { label: "ITB", value: ui.excludeItb, set: (v) => patch({ excludeItb: v }), title: "Drop tickers whose borrow status is ITB, as of the newest tape day that knows them. A ticker with NO borrow status is dropped too - unknown is not freely borrowable." },
            { label: "HARD", value: ui.excludeHard, set: (v) => patch({ excludeHard: v }), title: "Drop tickers whose borrow status is NO (hard to borrow), as of the newest tape day. A ticker with no status is dropped too." },
            { label: "Div", value: ui.excludeDividend, set: (v) => patch({ excludeDividend: v }), title: "No dividend field reaches this page: `Dividend` exists in the live DTO but has never been a column on TapeRowV1, so no tape day carries it. The pill is here to match the Sonar row exactly; it holds its state and rejects nothing until the tape writer records the field." },
            { label: "News", value: ui.excludeNews, set: (v) => patch({ excludeNews: v }), title: "Drop tickers the newest tape day marked as carrying news. The news COUNT is not used: it moves all session, the marker does not." },
            { label: "PTP", value: ui.excludePtp, set: (v) => patch({ excludePtp: v }), title: "Drop PTP tickers (session constant, from the tape's static sidecar)." },
            { label: "SSR", value: ui.excludeSsr, set: (v) => patch({ excludeSsr: v }), title: "Drop tickers under the OUTSIDE-HOURS short-sale restriction. This is not the intraday trigger, which fires on a -10% move and is not published here." },
            { label: "ETF", value: ui.excludeEtf, set: (v) => patch({ excludeEtf: v }), title: "Drop every ticker the tape says is an ETF (a ticker with no ETF data yet still passes)." },
            { label: "CRAP", value: ui.excludeCrap, set: (v) => patch({ excludeCrap: v }), title: "Drop sub-price tickers (session constant, from the tape's static sidecar)." },
            { label: "ANOM", value: ui.excludeAnom, set: (v) => patch({ excludeAnom: v }), title: "The POST-window anomaly set is resolved by the bridge from an episode replay, which a reference table over the published file does not have. Here to match the Sonar row exactly; holds its state and rejects nothing." },
          ]}
          report={{ label: "REP", value: ui.excludeReport, set: (v) => patch({ excludeReport: v }), title: "Drop tickers the newest tape day marked as reporting." }}
          corr={{ label: "CORR", value: false, set: () => {}, title: "Sector-correlation exclusion needs the per-day seed set the Scanner builds from an episode replay; this page has no replay to seed from." }}
          corrThresholdInput={corrThresholdInput}
          setCorrThresholdInput={setCorrThresholdInput}
          corrThreshold={corrThreshold}
          corrStatus={EMPTY_CORR_STATUS}
          regions={[
            { label: "USA", value: ui.includeUsa, set: (v) => patch({ includeUsa: v }) },
            { label: "CHINA", value: ui.includeChina, set: (v) => patch({ includeChina: v }) },
          ]}
          zapSlot={
            // The violet unit strip belongs at the RIGHT END OF THIS ROW rather than on a line of
            // its own: that is where the Scanner keeps it, and FilterFlagsRow has a zapSlot for
            // exactly this. The row's own `flex-1` pushes it to the edge, which only works while it
            // is a child of the row itself.
                <ScoutUnitBar
                  options={MODES.map((m) => ({
                    key: m,
                    label: SCOUT_MODES[m].label === "δ" ? "Δ" : SCOUT_MODES[m].label,
                    title: (m === "gamma" || m === "delta") && !levelsOk ? "gamma/delta are not published in the current arbitrage_ratings.csv" : SCOUT_MODES[m].hint,
                    locked: (m === "gamma" || m === "delta") && !levelsOk,
                  }))}
                  mode={ui.mode}
                  onMode={(m) => patch({ mode: m })}
                  start={ui.bounds[ui.mode].start}
                  to={ui.bounds[ui.mode].to}
                  onStart={(v) => setBound("start", v)}
                  onTo={(v) => setBound("to", v)}
                  // The Scanner's four boxes, one colour per ROLE: coral short, mint long, zinc max,
                  // amber cap. The mint one left empty means "as short" - the single floor this page
                  // had before the split. The amber box is the |P&L| fault cap and is deliberately in
                  // PERCENTAGE POINTS whatever unit the pills are on; its own tooltip says so.
                  inputs={[
                    {
                      value: ui.bounds[ui.mode].start,
                      onChange: (v) => setBound("start", v),
                      placeholder: "start",
                      ariaLabel: "start short",
                      tone: "border-[#f3a6b2]/50",
                      title: `Floor on the entry deviation for POSITIVE readings (a SHORT entry), in ${modeInfo.hint}. 0 = no floor.`,
                    },
                    {
                      value: ui.bounds[ui.mode].startNeg,
                      onChange: (v) => setBound("startNeg", v),
                      placeholder: "as short",
                      ariaLabel: "start long",
                      tone: "border-[#6ee7b7]/45",
                      title: "Floor for NEGATIVE readings (a LONG entry). Empty = the same number as the short side.",
                    },
                    {
                      value: ui.bounds[ui.mode].to,
                      onChange: (v) => setBound("to", v),
                      placeholder: "start max",
                      ariaLabel: "start max",
                      tone: "border-zinc-200/35",
                      title: "Upper bound on the entry deviation, same unit. 0 = no upper bound.",
                    },
                    {
                      value: ui.capPct,
                      onChange: (v) => patch({ capPct: v }),
                      placeholder: "cap",
                      ariaLabel: "pnl cap",
                      tone: "border-amber-400/55",
                      step: 5,
                      title: "CAP: a trade whose |P&L| exceeds this many PERCENTAGE POINTS is a Stack% data fault, not a trade, and is dropped. Always in pp, whatever unit the pills are on. 0 = keep everything.",
                    },
                  ]}
                  step={modeInfo.step}
                  subject="entries"
                  unitHint={modeInfo.hint}
                />
          }
          selectsSlot={
            <>
                <MultiSelectFilter
                label="COUNTRY"
                options={countryOptions}
                selected={countriesSet}
                setSelected={(s) => patch({ countries: [...s] })}
                enabled={ui.countryMode}
                toggleEnabled={() => patch({ countryMode: ui.countryMode === "off" ? "include" : ui.countryMode === "include" ? "exclude" : "off" })}
              />
                <MultiSelectFilter
                  label="EXCHANGE"
                  options={exchangeOptions}
                  selected={exchangesSet}
                  setSelected={(s) => patch({ exchanges: [...s] })}
                  enabled={ui.exchangeMode}
                  toggleEnabled={() => patch({ exchangeMode: ui.exchangeMode === "off" ? "include" : ui.exchangeMode === "include" ? "exclude" : "off" })}
                />
              <MultiSelectFilter
                label="SECTOR"
                options={sectorOptions}
                selected={sectorsSet}
                setSelected={(s) => patch({ sectors: [...s] })}
                enabled={ui.sectorMode}
                toggleEnabled={() => patch({ sectorMode: ui.sectorMode === "off" ? "include" : ui.sectorMode === "include" ? "exclude" : "off" })}
              />
            </>
          }
        />

        {/* Below the shared row: the controls that are this page's own. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* SIDE / WINDOW / SORT / DAILY-TRADE: this page's own controls, so they sit on its
              own line rather than in the class row, which is the Scanner's row and holds only
              what the Scanner has there. */}
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
          {separator}
          <div className={groupClass} title="How the market stands at the open: SPY+QQQ from the previous 16:00 close to 09:30">
            {REGIMES.map((r) => (
              <button key={r.key} type="button" onClick={() => patch({ regime: r.key })} className={btn(ui.regime === r.key)}
              title={`${r.hint} — ${regimeCounts[r.key] ?? 0} of ${regimeCounts.all ?? 0} sessions in the current window`}>
                {r.label}
              </button>
            ))}
          </div>
            {separator}
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
              The published file ends {meta.mostRecentSession} — {behind} days ago. Nothing after that date is in these numbers: re-run ArbitRage.ipynb and publish arbitrage/arbitrage_rolling_perf.json.gz again{meta.generatedAt ? ` (file generated ${meta.generatedAt.slice(0, 16).replace("T", " ")}Z)` : ""}.
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
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-400">{fmtSessionDate(meta.recentDates[t.date]) || "—"}</td>
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
