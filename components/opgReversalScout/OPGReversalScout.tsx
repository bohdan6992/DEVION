"use client";

/**
 * OPG-REVERSAL SCOUT — copied from ReversalScout (components/reversalScout/ReversalScout.tsx) 1-to-1
 * in look and control mechanism; the data underneath is OPG-Reversal's own. What is genuinely
 * different, not a styling choice — see lib/opgReversalScout/types.ts's own header comment:
 *
 *   3 same-morning exit classes (EXIT0945/EXIT1000/EXIT1030), not 5 spanning into the next day
 *   4 unit modes (%/σ/α/γ), same family as Reversal's own — no beta/corr/delta per ticker;
 *   σ here is the PUBLISHED per-ticker static sigma (final.parquet's own "sigma" column, passed
 *   through untouched end to end), not a locally recomputed stdev
 *   WIN/LOSS, not hard/soft — RATING (published) and WIN (of the trades in view) both survive
 *   no peak/gap → no "by time" reversion chart group, only the equity curve
 *   BEST SETTINGS is not wired yet (said out loud below, not silently dropped)
 *
 * OPG-Reversal's own trade: at the 09:20-09:25 signal read the stack's own Stack% value; |it| > 0.5
 * pp is a signal — SHORT a HIGH one, LONG a LOW one. Entry fills at the 09:30 open regardless of when
 * inside the signal window it was sent; exit at the class's own clock time (09:45/10:00/10:30). PnL is
 * gap-anchored at ENTRY (the settled opening Gap%), not at exit — see TapeOPGReversalEngine.cs's own
 * header comment.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import { useTickerLists } from "../shared/filters/useTickerLists";
import TickerListPanels from "../shared/filters/TickerListPanels";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
import SharedRatingModeRow from "../shared/filters/SharedRatingModeRow";
import SharedClassRow from "../shared/filters/SharedClassRow";
import SharedFilterPresetBar from "../shared/filters/SharedFilterPresetBar";
import type { RangeKey } from "../../lib/opgReversalScout/ranges";
import { FilterRangeBoxes } from "../shared/filters/FilterRatingRow";
import type { SectorCorrExclusion } from "../../lib/filters/sectorCorr";
import { SECTOR_CORR_DEFAULT } from "../../lib/filters/sectorCorr";
import { useUi } from "../UiProvider";
import { EquityChart } from "../scanner/shared/charts";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { intn, minuteIdxToClockLabel, ratePctFromFraction, ratePctToFraction, fmtSessionDate } from "../../lib/scanner/format";
import type { TriMode } from "../../lib/scanner/types";
import {
  buildCurve,
  computeOPGReversalAnalytics,
  computeOPGReversalScout,
  maxDrawdown,
  OPG_REVERSAL_MODES,
  sortRows,
  tickerSeries,
  tickerTradeRows,
} from "../../lib/opgReversalScout/compute";
import type { SortDir } from "../../lib/opgReversalScout/compute";
import { loadOPGReversalScoutMeta, loadOPGReversalScoutSlice } from "../../lib/opgReversalScout/client";
import type {
  OPGReversalClass,
  OPGReversalCurveMode,
  OPGReversalMeta,
  OPGReversalMode,
  OPGReversalParams,
  OPGReversalRegime,
  OPGReversalSide,
  OPGReversalSlice,
  OPGReversalSortKey,
  OPGReversalWindow,
} from "../../lib/opgReversalScout/types";
import SpinnerInput from "../scout/SpinnerInput";
import ScoutUnitBar from "../scout/ScoutUnitBar";
import { daysBehind } from "../../lib/scout/freshness";
import OPGReversalRangeBox from "./OPGReversalRangeBox";
import { EMPTY_RANGE_TEXT, loadRangeText, parseRanges, type RangeText } from "../../lib/opgReversalScout/ranges";

const CLASSES: Array<{ key: OPGReversalClass; label: string; hint: string }> = [
  { key: "exit0945", label: "09:45", hint: "exit at 09:45" },
  { key: "exit1000", label: "10:00", hint: "exit at 10:00" },
  { key: "exit1030", label: "10:30", hint: "exit at 10:30" },
];
const SIDES: Array<{ key: OPGReversalSide; label: string; hint: string }> = [
  { key: "short", label: "SHORT", hint: "the stack was HIGH at the 09:20-09:25 signal (+dev) → SHORT it" },
  { key: "long", label: "LONG", hint: "the stack was LOW at the 09:20-09:25 signal (−dev) → LONG it" },
  { key: "both", label: "BOTH", hint: "both directions together" },
];
const WINDOWS: OPGReversalWindow[] = [5, 20, 40, 65];

// How SPY and QQQ stand at the open: the 16:00 -> 09:30 move, published per session by the bridge
// (OvernightRegimeService). The operator asked for 21:00 -> 09:30; the END is the same and the
// anchor moved to the official close because the 21:00 print is a thin-book quote - measured, see
// that service's header. The bands are 0.5 of each index's OWN sigma, since no published standard
// exists: practitioners count a "real gap" from a flat 0.1% and call 1% big, and this file lands
// on those same figures. UNK is a real bucket, never a synonym for FLAT.
const REGIMES: Array<{ key: OPGReversalRegime; label: string; hint: string }> = [
  { key: "all", label: "ALL", hint: "every session in the window, however the market opened" },
  { key: "up", label: "UP", hint: "BOTH SPY and QQQ open above +0.5 sigma of the 16:00->09:30 move (SPY +0.316%, QQQ +0.428%)" },
  { key: "down", label: "DOWN", hint: "BOTH SPY and QQQ open below -0.5 sigma of the 16:00->09:30 move (SPY -0.316%, QQQ -0.428%)" },
  { key: "flat", label: "FLAT", hint: "BOTH SPY and QQQ open inside the band - the session starts where it closed" },
  { key: "mixed", label: "MIXED", hint: "SPY and QQQ disagree about the open - one cleared its band, the other did not" },
  { key: "unk", label: "UNK", hint: "no usable 09:30 print for one of them - a real bucket, never folded into FLAT" },
];
const MODES: OPGReversalMode[] = ["pct", "sigma", "alpha", "gamma"];
const SORT_BUTTONS: Array<{ key: OPGReversalSortKey; label: string }> = [
  { key: "alpha", label: "ALPHA" },
  { key: "rating", label: "RATING" },
  { key: "start", label: "START" },
  { key: "pnl", label: "P&L" },
  { key: "trades", label: "TRADES" },
];

const UI_KEY = "scout.opgreversal.ui.v1";
const PAGE_ROWS = 200;

type Bounds = Record<OPGReversalMode, { start: number; to: number }>;
type UiState = {
  cls: OPGReversalClass;
  side: OPGReversalSide;
  window: OPGReversalWindow;
  regime: OPGReversalRegime;
  mode: OPGReversalMode;
  bounds: Bounds;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  ratingMode: "live" | "asof" | "asofew";
  ratingsFrozen: boolean;
  coreOnly: boolean;
  outcomeRule: "norm" | "narrow";
  outcomeType: "any" | "hard" | "soft";
  scopeMode: "ALL" | "TOP";
  topN: number;
  ranges: RangeText;
  capPct: number;
  sizeUsd: number;
  sortKey: OPGReversalSortKey;
  sortDir: SortDir;
  curveMode: OPGReversalCurveMode;
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
  cls: "exit1000",
  side: "both",
  window: 20,
  regime: "all",
  mode: "pct",
  bounds: {
    pct: { start: 0.5, to: 0 },
    sigma: { start: 0, to: 0 },
    alpha: { start: 0, to: 0 },
    gamma: { start: 0, to: 0 },
  },
  minRate: 0,
  minTotal: 2,
  ignoreRatings: false,
  ratingMode: "asof",
  ratingsFrozen: false,
  coreOnly: false,
  outcomeRule: "norm",
  outcomeType: "any",
  scopeMode: "ALL",
  topN: 100,
  ranges: EMPTY_RANGE_TEXT,
  // a print this wide is a broken Stack%, not a trade — same bar the other two Scouts use
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
      if (b) bounds[m] = { start: numOr(b.start, 0), to: numOr(b.to, 0) };
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
      ignoreRatings: j.ignoreRatings === true,
      ratingMode: pick(j.ratingMode, ["live", "asof", "asofew"] as const, DEFAULT_UI.ratingMode),
      ratingsFrozen: j.ratingsFrozen === true,
      coreOnly: j.coreOnly === true,
      outcomeRule: pick(j.outcomeRule, ["norm", "narrow"] as const, DEFAULT_UI.outcomeRule),
      outcomeType: pick(j.outcomeType, ["any", "hard", "soft"] as const, DEFAULT_UI.outcomeType),
      scopeMode: pick(j.scopeMode, ["ALL", "TOP"] as const, DEFAULT_UI.scopeMode),
      topN: numOr(j.topN, DEFAULT_UI.topN),
      ranges: loadRangeText(j.ranges),
      capPct: numOr(j.capPct, DEFAULT_UI.capPct),
      sizeUsd: numOr(j.sizeUsd, DEFAULT_UI.sizeUsd),
      sortKey: pick(j.sortKey, ["ticker", "alpha", "rating", "start", "entryTime", "trades", "pnl", "avgPnl", "win"] as OPGReversalSortKey[], DEFAULT_UI.sortKey),
      sortDir: pick(j.sortDir, ["asc", "desc"] as SortDir[], DEFAULT_UI.sortDir),
      curveMode: pick(j.curveMode, ["daily", "trade"] as OPGReversalCurveMode[], DEFAULT_UI.curveMode),
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

export default function OPGReversalScout() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";

  const [ui, setUi] = useState<UiState>(loadUi);
  // Keyed per PAGE, not per strategy: a Scout ignore list ("not interesting in my
  // research table") is a different statement from a Sonar one ("do not trade today").
  const lists = useTickerLists("opg-reversal-scout");
  const [showPresetPanel, setShowPresetPanel] = useState(false);
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
  const [meta, setMeta] = useState<OPGReversalMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(true);

  const loadMeta = useCallback((force: boolean) => {
    setMetaBusy(true);
    setMetaError(null);
    loadOPGReversalScoutMeta(force)
      .then((m) => { setMeta(m); })
      .catch((e) => setMetaError(String(e?.message ?? e)))
      .finally(() => setMetaBusy(false));
  }, []);
  useEffect(() => { loadMeta(false); }, [loadMeta]);

  const signs = ui.side === "short" ? (["pos"] as const) : ui.side === "long" ? (["neg"] as const) : (["pos", "neg"] as const);
  const sliceKey = `${ui.cls}:${signs.join("+")}`;
  const [slices, setSlices] = useState<{ key: string; data: OPGReversalSlice[] } | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const sliceReq = useRef(0);

  useEffect(() => {
    if (!meta) return;
    const req = ++sliceReq.current;
    setSliceError(null);
    Promise.all(signs.map((s) => loadOPGReversalScoutSlice(ui.cls, s)))
      .then((data) => { if (req === sliceReq.current) setSlices({ key: sliceKey, data }); })
      .catch((e) => { if (req === sliceReq.current) setSliceError(String(e?.message ?? e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sliceKey]);

  const activeSlices = slices && slices.key === sliceKey ? slices.data : null;
  const sliceLoading = !!meta && !activeSlices && !sliceError;

  // ---- compute
  const countriesSet = useMemo(() => new Set(ui.countries), [ui.countries]);
  const sectorsSet = useMemo(() => new Set(ui.sectors), [ui.sectors]);
  const exchangesSet = useMemo(() => new Set(ui.exchanges), [ui.exchanges]);
  // sigma / alpha / gamma, in the Sonar's own order. Text values so a half-typed "-" survives.
  const setRangeBound = useCallback((k: RangeKey, end: "min" | "max", v: string) => {
    setUi((prev) => ({ ...prev, ranges: { ...prev.ranges, [k]: { ...prev.ranges[k], [end]: v } } }));
  }, []);
  const RATING_RANGE_FIELDS = useMemo(() => ([
    { label: "\u03c3", title: "Sigma - the ticker's published static dispersion (final.parquet's own \"sigma\" column)", minValue: ui.ranges.sigma.min, maxValue: ui.ranges.sigma.max, setMin: (v: string) => setRangeBound("sigma", "min", v), setMax: (v: string) => setRangeBound("sigma", "max", v), step: 0.1 },
    { label: "\u03b1", title: "Alpha - the ticker's own modal signal reading, sign-matched to the side in scope", minValue: ui.ranges.alpha.min, maxValue: ui.ranges.alpha.max, setMin: (v: string) => setRangeBound("alpha", "min", v), setMax: (v: string) => setRangeBound("alpha", "max", v), step: 0.1 },
    { label: "\u03b3", title: "Gamma - the PUBLISHED gamma of the (class, side) cell itself. A level filter, not a rating gate: it keeps applying under UNIVERSE.", minValue: ui.ranges.gamma.min, maxValue: ui.ranges.gamma.max, setMin: (v: string) => setRangeBound("gamma", "min", v), setMax: (v: string) => setRangeBound("gamma", "max", v), step: 0.1 },
  ]), [ui.ranges, setRangeBound]);
  const params: OPGReversalParams = useMemo(() => ({
    window: ui.window,
    regime: ui.regime,
    mode: ui.mode,
    start: ui.bounds[ui.mode].start,
    to: ui.bounds[ui.mode].to,
    minRate: ui.minRate,
    minTotal: ui.minTotal,
    ignoreRatings: ui.ignoreRatings,
    ranges: parseRanges(ui.ranges),
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
  }), [ui.window, ui.regime, ui.mode, ui.bounds, ui.minRate, ui.minTotal, ui.ignoreRatings, ui.ranges, ui.capPct, ui.sizeUsd, ui.excludeEtf, ui.excludeItb, ui.excludeHard, ui.excludePtp, ui.excludeSsr, ui.excludeCrap, ui.excludeNews, ui.excludeReport, ui.includeUsa, ui.includeChina, ui.excludeDividend, ui.excludeAnom, ui.exchangeMode, exchangesSet, ui.countryMode, countriesSet, ui.sectorMode, sectorsSet]);

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
    () => (meta && activeSlices ? computeOPGReversalScout(meta, activeSlices, params) : null),
    [meta, activeSlices, params],
  );

  const sorted = useMemo(
    () => {
      // IGNORE/APPLY hide rows; PIN only reorders them. Only the mode the header has
      // selected applies - see useTickerLists.allows/pinRank.
      if (!meta || !result) return [];
      const bySort = sortRows(meta, result.rows, ui.sortKey, ui.sortDir, ui.side);
      const kept = bySort.filter((r) => lists.allows(meta.tickers[r.i].t));
      return lists.listMode === "pin"
        ? [...kept].sort((a, b) => lists.pinRank(meta.tickers[a.i].t) - lists.pinRank(meta.tickers[b.i].t))
        : kept;
    },
    [meta, result, ui.sortKey, ui.sortDir, ui.side, lists],
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

  const analyticsSummary = useMemo(() => computeOPGReversalAnalytics(tradeRows, ui.sizeUsd), [tradeRows, ui.sizeUsd]);

  const onSort = (key: OPGReversalSortKey) =>
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
  const btn = (active: boolean, disabled = false) =>
    clsx(TOOLBAR_BUTTON_BASE, disabled ? "cursor-not-allowed border-transparent text-zinc-700" : active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  // The class row's groups carry NO container tint - that is how the Scanner draws them.
  const rowGroupClass = "flex h-7 items-center gap-2";
  const separator = <div className="h-7 w-px self-center bg-white/5" />;

  const modeInfo = OPG_REVERSAL_MODES[ui.mode];
  const D = meta?.recentDates.length ?? 0;
  const winFrom = meta ? meta.recentDates[Math.max(0, D - ui.window)] : null;
  const winTo = meta ? meta.recentDates[D - 1] : null;
  const busy = metaBusy || sliceLoading;
  const behind = meta ? daysBehind(meta.mostRecentSession) : null;
  const selectedTicker = meta && selected !== null ? meta.tickers[selected].t : null;

  const th = (label: string, key: OPGReversalSortKey | null, title?: string, left = false) => (
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
        {/* The header every surface shares - components/scanner/shell/panels/ScannerHeader.
            Scout is a reference table over the published file and has no per-ticker
            ignore/apply/pin lists, so it passes showLists={false}. It renders THIS component
            rather than the private copy that used to sit here, which is how three Scout pages
            ended up titled after a different strategy. */}
        <ScannerHeader
          scannerShellTitle="OPG•REVERSAL•SCOUT"
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref="/opg-reversal/stream"
          navScannerHref="/opg-reversal/scanner"
          navSonarHref="/opg-reversal/sonar"
          navScoutHref="/opg-reversal/scout"
          navSpectrHref="/opg-reversal/spectr"
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
          canRun={!(metaBusy)}
          run={() => { setSelected(null); loadMeta(true); }}
          busy={busy}
          variantString="Reload the published opgreversal_rolling_perf file from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* The SAME rating row the Sonar renders - components/shared/filters/FilterRatingRow, with
            the strip's look from components/shared/filters/ActiveStrip. Order matches the Sonar
            exactly: the strip on the left, then RATE, MINRATE, MINTOTAL and the sigma/alpha/gamma
            ranges on the right. */}
        {/* The Scanner's rating row - components/shared/filters/SharedRatingModeRow.
            This family publishes neither the ASOF/EXPO rebuilds nor a hard/soft split, so
            those pills hold their state and say so in their tooltips; RATE/UNIVERSE and
            MINRATE/MINTOTAL are real. The ACTIVE/INACTIVE/ALL strip is gone on purpose:
            the Scanner row has none, it came from the Sonar this page was copied from. */}
        <SharedRatingModeRow
          ratingsIgnored={ui.ignoreRatings}
          setRatingsIgnored={(v) => patch({ ignoreRatings: v })}
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
          modesInert
          rangesSlot={
            <FilterRangeBoxes ranges={RATING_RANGE_FIELDS} />
          }
        />

                <SharedClassRow
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `${c.label} — ${c.hint}` }))}
          cls={ui.cls}
          setCls={(k) => { patch({ cls: k }); setSelected(null); }}
          scopeMode={ui.scopeMode}
          setScopeMode={(m2) => patch({ scopeMode: m2 })}
          topN={ui.topN}
          outcomeType={ui.outcomeType}
          setOutcomeType={(rt) => patch({ outcomeType: rt })}
          outcomeInert
          rightSlot={
  <SharedFilterPresetBar
                  getConfigJson={() => JSON.stringify({ minSigma: ui.ranges.sigma.min, maxSigma: ui.ranges.sigma.max })}
                  applyConfigJson={(json) => {
                    try {
                      const j = JSON.parse(json) as Record<string, unknown>;
                      const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                      patch({ ranges: { ...ui.ranges, sigma: { min: txt(j.minSigma), max: txt(j.maxSigma) } } });
                      return true;
                    } catch {
                      return false; // older build, or hand-edited - leave the filters alone
                    }
                  }}
                  onClear={() => patch({ ranges: { ...ui.ranges, sigma: { min: "", max: "" } } })}
                  showPanel={showPresetPanel}
                  setShowPanel={setShowPresetPanel}
                />
          }
          infoSlot={meta ? (
                <>
                  <span>SESSIONS {fmtSessionDate(winFrom, true)} → {fmtSessionDate(winTo, true)}</span>
                  <span>{ui.cls.toUpperCase()} · {ui.side === "both" ? "SHORT+LONG" : ui.side.toUpperCase()} · ${ui.sizeUsd.toLocaleString("en-US")}/trade · entry 09:30 (the open print), exit the class's own clock time</span>
                  {result && result.cappedOut > 0 && <span>{result.cappedOut.toLocaleString("en-US")} trades excluded by CAP</span>}
                  {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
                </>
          ) : null}
        />

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
          {/* SIDE / WINDOW / SORT / DAILY-TRADE: this page's own controls, so they sit on
              its own line - the class row above is the Scanner's and holds only what the
              Scanner has there. */}
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
            <div className={groupClass} title="Sort the table (click the active one again to flip)">
              {SORT_BUTTONS.map((s) => (
                <button key={s.key} type="button" onClick={() => onSort(s.key)} className={btn(ui.sortKey === s.key)}>
                  {s.label}{sortMark(ui.sortKey === s.key, ui.sortDir)}
                </button>
              ))}
            </div>
            {separator}
            <div className={groupClass}>
              {(["daily", "trade"] as OPGReversalCurveMode[]).map((m) => (
                <button key={m} type="button" onClick={() => patch({ curveMode: m })} className={btn(ui.curveMode === m)}
                  title={m === "daily" ? "one point per session" : "one point per trade, in date order"}>
                  {m === "daily" ? "DAILY" : "TRADE"}
                </button>
              ))}
            </div>
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
              options={MODES.map((m) => ({ key: m, label: OPG_REVERSAL_MODES[m].label, title: OPG_REVERSAL_MODES[m].hint }))}
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
              The published file ends {meta.mostRecentSession} — {behind} days ago. Re-run OPG-Reversal's own notebook and publish opgreversal_rolling_perf.json.gz again{meta.generatedAt ? ` (file generated ${meta.generatedAt.slice(0, 16).replace("T", " ")}Z)` : ""}.
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

            {/* Equity curve — no "by time" peak/reversion chart group: OPGReversal's trades are one
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
                      {th("ALPHA", "alpha", "modal |09:20-09:25 signal reading|, sign-matched to the side(s) shown (pos/short | neg/long)")}
                      {th("γ", null, "gamma level for the class+side shown — best reversal-entry deviation")}
                      {th(`START ${modeInfo.unit}`, "start", "mean entry deviation of the trades in scope, in the chosen unit")}
                      {th("ENTRY", "entryTime", "mean entry clock time of the trades in scope (09:30, snapped)")}
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
                          {/* Entry always shown as 09:30 (the open print) — same convention Reversal's own Scout uses for its fixed-clock entry. */}
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">09:30</td>
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
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 09:20-09:25 signal's clock time">SIGNAL</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">ENTRY</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">EXIT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">P&L $</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 09:20-09:25 signal reading, %">DEV %</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 09:20-09:25 signal reading, × the ticker's own alpha">DEV α</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 09:20-09:25 signal reading, × the ticker's published sigma">DEV σ</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="the 09:20-09:25 signal reading, × the published gamma for this class and side">DEV γ</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeRows.slice(0, tradesShown).map((t, idx) => (
                      <tr key={idx} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.ticker}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-400">{fmtSessionDate(meta.recentDates[t.date]) || "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-400">{t.cls.toUpperCase()}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-bold", t.side === "short" ? "text-sky-300" : "text-amber-300")}>
                          {t.side.toUpperCase()}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.signalMinuteIdx)}</td>
                        {/* Entry always shown as 09:30 (the open print) — same convention Reversal's own Scout uses for its fixed-clock entry. */}
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">09:30</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{minuteIdxToClockLabel(t.exitMinuteIdx)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right font-semibold", signTone(t.pnlPct, isLightTheme))}>{fx(t.pnlPct, 3)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right", signTone(t.pnlUsd, isLightTheme))}>{usd(t.pnlUsd, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devPct, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devAlpha, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devSigma, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.devGamma, 2)}</td>
                        <td className={clsx("whitespace-nowrap px-2.5 py-[5px] text-right uppercase", t.status === "win" ? "text-[#6ee7b7]" : SOFT_LOSS_TEXT_CLASS)}>
                          {t.status}
                        </td>
                      </tr>
                    ))}
                    {tradeRows.length === 0 && (
                      <tr>
                        <td colSpan={14} className="px-4 py-10 text-center text-[11px] text-zinc-600">
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
