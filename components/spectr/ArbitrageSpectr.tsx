"use client";

/**
 * ARBITRAGE SPECTR — a flat, filterless-by-default reference table: every ticker the published
 * best_params file knows about, with its constants against its benchmark (corr/beta/sigma),
 * its own gamma/alpha levels per side, and its PUBLISHED (all-history) rating per class and side.
 *
 * Unlike Scout, this reads nothing but `/api/arbitrage/scout/meta` — no trade-log slices, no
 * window/curve computation. Every number here is already sitting on `ScoutTicker`
 * (lib/scout/types.ts), decoded once by the same client Scout already uses. The whole page is a
 * client-side sort/filter/search over that one array.
 *
 * The toolbar below is a deliberate 1-to-1 visual copy of ArbitrageScanner's own filter row
 * (operator's own instruction) — same shared components (`FilterFlagsRow`, the Unit/ZAP and
 * Secondary Button standards from AGENTS.md), same labels, same colours. Most of those pills
 * (ITB/HARD/DIV/NEWS/PTP/SSR/CRAP/ANOM, REP/CORR, ASOF/EXPO/LIVE, ❄/CORE/NORM, ALL/TOP, the
 * %/σ/Δ/γ/α unit group) gate Scanner EPISODE rows — a per-day, per-signal replay Spectr simply does
 * not have. They hold their on/off state so the row looks and behaves the same, but do nothing
 * until a matching field is published. ETF/COUNTRY/SECTOR/USA/CHINA (real fields on `ScoutTicker`)
 * and ANY/HARD/SOFT (the `hard`/`soft` split every published rating already carries) are wired for
 * real, same as MINRATE/MINTOTAL/ρ/β/σ and RATE/UNIVERSE already were.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import { useUi } from "../UiProvider";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import {
  FILTER_GROUP_BASE,
  FILTER_GROUP_TONES,
  FILTER_PILL,
  TOOLBAR_BUTTON_ACTIVE,
  TOOLBAR_BUTTON_BASE,
  TOOLBAR_BUTTON_INACTIVE,
} from "../shared/filters/styles";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import TickerListPanels from "../shared/filters/TickerListPanels";
import SharedRatingModeRow from "../shared/filters/SharedRatingModeRow";
import SharedClassRow from "../shared/filters/SharedClassRow";
import SharedFilterPresetBar from "../shared/filters/SharedFilterPresetBar";
import { FilterRangeBoxes } from "../shared/filters/FilterRatingRow";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND } from "../../lib/presets/sharedFilterPreset";
import { useTickerLists } from "../shared/filters/useTickerLists";
import { rowExcludedByBorrow } from "../../lib/filters/borrow";
import { inSelectedRegions } from "../../lib/filters/region";
import { SECTOR_CORR_DEFAULT, type SectorCorrExclusion } from "../../lib/filters/sectorCorr";
import { getLiveStrategy } from "../../lib/strategies/registry";
import type { TriMode } from "../../lib/scanner/types";
import { ratePctFromFraction, ratePctToFraction } from "../../lib/scanner/format";
import { loadScoutMeta } from "../../lib/scout/client";
import type { ScoutClass, ScoutMeta, ScoutTicker } from "../../lib/scout/types";

const CLASSES: Array<{ key: ScoutClass; label: string }> = [
  { key: "pre", label: "PRE" },
  { key: "open", label: "OPEN" },
  { key: "intra", label: "INTRA" },
  { key: "post", label: "POST" },
];

type SortKey = "ticker" | "beta" | "corr" | "sigma" | "country" | "sector";
type SortDir = "asc" | "desc";
/** ANY = the published rule, (hard + soft) / total. HARD/SOFT isolate one half of it — both exist
 * on every `ScoutRating` already, so unlike most of the toolbar this one is real. */
type OutcomeType = "any" | "hard" | "soft";

const PAGE_ROWS = 200;

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const fx = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
const pct0 = (v: number | null | undefined) => (isNum(v) ? `${Math.round(v * 100)}%` : "—");
const ratingTone = (v: number | null | undefined) => (!isNum(v) ? "text-zinc-600" : v >= 0.5 ? "accent-text" : v >= 0.3 ? "text-zinc-200" : "text-zinc-500");

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

/** FilterFlagsRow's own CORR lookup needs a per-ticker report marker Spectr's static reference
 * table does not carry, so the REP/CORR pair in the toolbar never fetches — this is the permanent
 * "off" answer it renders against. */
const EMPTY_CORR_STATUS: SectorCorrExclusion = { excluded: new Set<string>(), seedCount: 0, loading: false, error: null };

type RatingValue = { rate: number; total: number; hard: number; soft: number };

/**
 * ANY/HARD/SOFT changes which count is the TOTAL — all situations, or just the ones that hit the
 * hard bar, or just the ones that hit the soft one — never the rate itself. That mirrors
 * `ArbitrageAsOfRatings.TryGet`'s own documented contract on the bridge: "the RATE is the same
 * number whatever the type, and only the TOTAL changes." A zero count under a rule that does not
 * define it (e.g. hard/soft are meaningless outside the Normalised outcome) falls back to the plain
 * total rather than reading as "no evidence".
 */
function effectiveTotal(r: RatingValue, outcome: OutcomeType): number {
  if (outcome === "hard") return r.hard > 0 ? r.hard : r.total;
  if (outcome === "soft") return r.soft > 0 ? r.soft : r.total;
  return r.total;
}

/** rate/total pair for one class and side, rendered as a single compact cell. */
function RatingCell({ rating, outcome }: { rating: RatingValue | null; outcome: OutcomeType }) {
  if (!rating || rating.total === 0) return <span className="text-zinc-600">—</span>;
  const total = effectiveTotal(rating, outcome);
  return (
    <span className={ratingTone(rating.rate)}>
      {pct0(rating.rate)} <span className="text-zinc-600">/{total}</span>
    </span>
  );
}

/** ASOF/EXPO — falls back to the always-present published `rating` when the bridge hasn't been
 * rebuilt with `ratingAsOf`/`ratingExpo` yet. */
function pickRatingTable(t: ScoutTicker, mode: "asof" | "asofew" | "live"): ScoutTicker["rating"] {
  if (mode === "asof") return t.ratingAsOf ?? t.rating;
  if (mode === "asofew") return t.ratingExpo ?? t.rating;
  return t.rating;
}

// NOTE: the page-scoped preset store that used to live here is gone with the old header. The
// PRESET group is now shared/filters/SharedFilterPresetBar, the same cross-surface one Scout
// and the Scanner use, so a preset saved on any of them applies on all of them.

export default function ArbitrageSpectr() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const nav = getLiveStrategy("arbitrage")!.nav;

  const [meta, setMeta] = useState<ScoutMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback((force: boolean) => {
    setBusy(true);
    setError(null);
    loadScoutMeta(force)
      .then((m) => setMeta(m))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(false); }, [load]);

  const [search, setSearch] = useState("");
  const [excludeEtf, setExcludeEtf] = useState(false);
  const [countryMode, setCountryMode] = useState<TriMode>("off");
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [sectorMode, setSectorMode] = useState<TriMode>("off");
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(PAGE_ROWS);
  const lists = useTickerLists("arbitrage-spectr");
  const [excludeExchange, setExcludeExchange] = useState<Set<string>>(new Set());
  const [exchangeMode, setExchangeMode] = useState<TriMode>("off");

  // Rating/ρ/β/σ filter row — same fields, same Spinner Input Standard markup as
  // ArbitrageScanner's own MINRATE/MINTOTAL/ρ/β/σ strip (AGENTS.md), reused 1-to-1. A row passes
  // the rating gate if ANY of its 8 class×side published ratings clears both floors — Spectr shows
  // every class/side at once, unlike the Scanner which judges one replayed situation at a time, so
  // there is no single "the" rating to gate on here.
  const [minRate, setMinRate] = useState(0);
  const [minTotal, setMinTotal] = useState(0);
  const [minCorr, setMinCorr] = useState("");
  const [maxCorr, setMaxCorr] = useState("");
  const [minBeta, setMinBeta] = useState("");
  const [maxBeta, setMaxBeta] = useState("");
  const [minSigma, setMinSigma] = useState("");
  const [maxSigma, setMaxSigma] = useState("");
  // RATE/UNIVERSE — real: drops the MINRATE/MINTOTAL gate entirely, same meaning as on the Scanner.
  const [ratingsIgnored, setRatingsIgnored] = useState(false);
  // ASOF/EXPO/LIVE — real (operator's own request, 2026-11-13): picks which of `rating`/`ratingAsOf`/
  // `ratingExpo` the table and the MINRATE/MINTOTAL gate read (see `pickRatingTable` below). ❄/CORE/
  // NORM stay inert — FROZEN/CORE are about per-day replay, which a flat table has none of, and
  // NORM/NRRW is a different success RULE that would need the trade log recomputed under Narrowed,
  // not just a different cutoff.
  const [tableMode, setTableMode] = useState<"asof" | "asofew" | "live">("asof");
  const [frozen, setFrozen] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const [outcomeRule, setOutcomeRule] = useState<"norm" | "narrow">("norm");

  // PRE/OPEN/INTRA/POST — single-select, exactly like ArbitrageScanner's own `ruleBand`: exactly
  // one class is always active, and the MINRATE/MINTOTAL gate checks ONLY that class (operator's
  // own correction, 2026-11-13, checked against the real Scanner). All 4 classes' columns still
  // always render — this picks the GATE's class, not which columns show.
  const [ratingClass, setRatingClass] = useState<ScoutClass>("pre");
  // ALL/TOP — Scanner-only episode ranking concept; inert.
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  // ANY/HARD/SOFT — real, see `effectiveTotal`.
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("any");

  // The ITB/HARD/DIV/NEWS/PTP/SSR/CRAP/ANOM pills + REP/CORR — no matching field on `ScoutTicker`
  // (no borrow status, dividend flag, news count, PTP/SSR flag, today's-report marker). State-only
  // until that data is published; ETF below is the one real exclusion in this group.
  const [excludeItb, setExcludeItb] = useState(false);
  const [excludeHard, setExcludeHard] = useState(false);
  const [excludeDividend, setExcludeDividend] = useState(false);
  const [excludeHasNews, setExcludeHasNews] = useState(false);
  const [excludePTP, setExcludePTP] = useState(false);
  const [excludeSSR, setExcludeSSR] = useState(false);
  const [excludeCrap, setExcludeCrap] = useState(false);
  const [excludeAnom, setExcludeAnom] = useState(false);
  const [excludeHasReport, setExcludeHasReport] = useState(false);
  const [excludeCorr, setExcludeCorr] = useState(false);
  const [corrThresholdInput, setCorrThresholdInput] = useState(String(SECTOR_CORR_DEFAULT));
  const corrThreshold = Number(corrThresholdInput) || SECTOR_CORR_DEFAULT;
  // USA/CHINA — real: narrows to tickers whose published `country` matches.
  const [includeUSA, setIncludeUSA] = useState(false);
  const [includeChina, setIncludeChina] = useState(false);

  // %/σ/Δ/γ/α unit group + its 4 coloured spinners — Scanner's live threshold-scan controls. Spectr
  // has no scan to threshold; kept purely as a visual match, local state only.
  const [zapMode, setZapMode] = useState<"off" | "zap" | "sigma" | "delta" | "gamma" | "alpha">("off");
  const [startAbs, setStartAbs] = useState(0.5);
  const [startAbsNeg, setStartAbsNeg] = useState("");
  const [startAbsMax, setStartAbsMax] = useState("");
  const [endAbs, setEndAbs] = useState(0.03);

  // PRESET — real, page-scoped (see the storage helpers above).
  // The ρ/β/σ boxes, as the field list the shared renderer takes - the same three the Scanner
  // and Scout pass it, so all three draw one control instead of three lookalikes.
  const RATING_RANGE_FIELDS = useMemo(() => ([
    { label: "\u03c1", title: "Correlation to benchmark", minValue: minCorr, maxValue: maxCorr, setMin: setMinCorr, setMax: setMaxCorr, step: 0.05 },
    { label: "\u03b2", title: "Beta to benchmark", minValue: minBeta, maxValue: maxBeta, setMin: setMinBeta, setMax: setMaxBeta, step: 0.1 },
    { label: "\u03c3", title: "The ticker's own volatility", minValue: minSigma, maxValue: maxSigma, setMin: setMinSigma, setMax: setMaxSigma, step: 0.1 },
  ]), [minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

  const [showPresetPanel, setShowPresetPanel] = useState(false);
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

  const filtered = useMemo(() => {
    if (!meta) return [];
    const q = search.trim().toUpperCase();
    let rows = meta.tickers;
    if (q) rows = rows.filter((t) => t.t.includes(q));
    if (excludeEtf) rows = rows.filter((t) => t.etf !== true);
    if (countryMode !== "off" && countries.size > 0) {
      rows = rows.filter((t) => (countryMode === "include" ? t.country != null && countries.has(t.country) : !(t.country != null && countries.has(t.country))));
    }
    if (sectorMode !== "off" && sectors.size > 0) {
      rows = rows.filter((t) => (sectorMode === "include" ? t.sector != null && sectors.has(t.sector) : !(t.sector != null && sectors.has(t.sector))));
    }
    rows = rows.filter((t) => inSelectedRegions(t.country, includeUSA, includeChina));
    if (!ratingsIgnored && (minRate > 0 || minTotal > 0)) {
      const passSide = (r: RatingValue | null) => !!r && r.total > 0 && r.rate >= minRate && effectiveTotal(r, outcomeType) >= minTotal;
      rows = rows.filter((t) => {
        const cell = pickRatingTable(t, tableMode)[ratingClass];
        return passSide(cell.pos) || passSide(cell.neg);
      });
    }
    const bound = (s: string) => {
      const n = Number(s);
      return s.trim() === "" || !Number.isFinite(n) ? null : n;
    };
    const minCorrN = bound(minCorr), maxCorrN = bound(maxCorr);
    const minBetaN = bound(minBeta), maxBetaN = bound(maxBeta);
    const minSigmaN = bound(minSigma), maxSigmaN = bound(maxSigma);
    if (minCorrN != null) rows = rows.filter((t) => isNum(t.corr) && t.corr >= minCorrN);
    if (maxCorrN != null) rows = rows.filter((t) => isNum(t.corr) && t.corr <= maxCorrN);
    if (minBetaN != null) rows = rows.filter((t) => isNum(t.beta) && t.beta >= minBetaN);
    if (maxBetaN != null) rows = rows.filter((t) => isNum(t.beta) && t.beta <= maxBetaN);
    if (minSigmaN != null) rows = rows.filter((t) => isNum(t.sigma) && t.sigma >= minSigmaN);
    if (maxSigmaN != null) rows = rows.filter((t) => isNum(t.sigma) && t.sigma <= maxSigmaN);
    return rows;
  }, [meta, search, excludeEtf, countryMode, countries, sectorMode, sectors, includeUSA, includeChina, ratingsIgnored, tableMode, outcomeType, ratingClass, minRate, minTotal, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "ticker") return a.t.localeCompare(b.t) * dir;
      if (sortKey === "country") return (a.country ?? "").localeCompare(b.country ?? "") * dir;
      if (sortKey === "sector") return (a.sector ?? "").localeCompare(b.sector ?? "") * dir;
      const av = sortKey === "beta" ? a.beta : sortKey === "corr" ? a.corr : a.sigma;
      const bv = sortKey === "beta" ? b.beta : sortKey === "corr" ? b.corr : b.sigma;
      const an = isNum(av), bn = isNum(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return (av - bv) * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => { setShown(PAGE_ROWS); }, [search, excludeEtf, countryMode, countries, sectorMode, sectors, sortKey, sortDir, includeUSA, includeChina, ratingsIgnored, tableMode, outcomeType, ratingClass, minRate, minTotal, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

  const onSort = (key: SortKey) => {
    setSortDir((prevDir) => (sortKey === key ? (prevDir === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };
  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  const headerNavGroupClass = isLightTheme
    ? "flex h-7 items-center gap-2 rounded-lg border border-slate-900/10 bg-white/35"
    : "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const headerNavInactiveClass = isLightTheme
    ? "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const btn = (active: boolean) => clsx(TOOLBAR_BUTTON_BASE, active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);

  const th = (label: string, key: SortKey | null, title?: string, left = false) => (
    <th
      key={label}
      title={title}
      onClick={key ? () => onSort(key) : undefined}
      className={clsx(
        "px-2.5 py-2 text-[9px] font-semibold select-none whitespace-nowrap",
        left ? "text-left" : "text-right",
        key && "cursor-pointer hover:text-white",
        key && sortKey === key && "accent-text",
      )}
    >
      {label}{key ? sortMark(key) : ""}
    </th>
  );

  // All 4 classes' columns always render — PRE/OPEN/INTRA/POST narrows the rating GATE, not the
  // table (operator's own correction, 2026-11-13).
  const totalColSpan = 12 + CLASSES.length * 2;

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        {/* The header every surface shares - scanner/shell/panels/ScannerHeader. */}
        <ScannerHeader
          scannerShellTitle="ARBITRAGE•SPECTR"
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref={nav.stream}
          navScannerHref={nav.scanner}
          navSonarHref={nav.sonar}
          navScoutHref={nav.scout}
          navSpectrHref={nav.spectr}
          primaryPanel="spectr"
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
          canRun={!(busy)}
          run={() => load(true)}
          busy={busy}
          variantString="Reload the published best_params/rolling_perf file from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* The header is the SCOUT header, control for control: the same two components Scout
            mounts - shared/filters/SharedRatingModeRow and shared/filters/SharedClassRow - rather
            than a third and fourth hand-rolled copy of them. This page's own control (SEARCH) sits
            on its own line BELOW the shared rows. */}
        <SharedRatingModeRow
          ratingsIgnored={ratingsIgnored}
          setRatingsIgnored={setRatingsIgnored}
          ratingMode={tableMode}
          setRatingMode={setTableMode}
          frozen={frozen}
          setFrozen={setFrozen}
          coreOnly={coreOnly}
          setCoreOnly={setCoreOnly}
          outcomeRule={outcomeRule}
          setOutcomeRule={setOutcomeRule}
          minRate={minRate}
          setMinRate={setMinRate}
          minTotal={minTotal}
          setMinTotal={(v) => setMinTotal(Math.trunc(v))}
          switchesInert
          rangesSlot={<FilterRangeBoxes ranges={RATING_RANGE_FIELDS} />}
        />

        {/* `setCls` is wrapped rather than passed bare: a useState setter takes SetStateAction<T>,
            which is not a string, and handing it over bare drags the row's class type down to
            plain `string`. */}
        <SharedClassRow
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `Restrict the MINRATE/MINTOTAL gate to ${c.label} only` }))}
          cls={ratingClass}
          setCls={(k) => setRatingClass(k)}
          scopeMode={scopeMode}
          setScopeMode={setScopeMode}
          scopeInert
          outcomeType={outcomeType}
          setOutcomeType={setOutcomeType}
          rightSlot={
            <SharedFilterPresetBar
              getConfigJson={() => JSON.stringify({
                minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma,
              })}
              applyConfigJson={(json) => {
                try {
                  const j = JSON.parse(json) as Record<string, unknown>;
                  const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                  setMinCorr(txt(j.minCorr)); setMaxCorr(txt(j.maxCorr));
                  setMinBeta(txt(j.minBeta)); setMaxBeta(txt(j.maxBeta));
                  setMinSigma(txt(j.minSigma)); setMaxSigma(txt(j.maxSigma));
                  return true;
                } catch {
                  return false; // older build, or hand-edited - leave the filters alone
                }
              }}
              onClear={() => {
                setMinCorr(""); setMaxCorr(""); setMinBeta(""); setMaxBeta(""); setMinSigma(""); setMaxSigma("");
              }}
              showPanel={showPresetPanel}
              setShowPanel={setShowPresetPanel}
            />
          }
          infoSlot={meta ? (
            <>
              <span>{meta.mostRecentSession ? `through ${meta.mostRecentSession}` : ""}</span>
              {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
              {!meta.levelsAvailable && <span className="text-amber-300/80">γ/α not published yet</span>}
            </>
          ) : null}
        />

        {showPresetPanel && (
          <PresetPicker
            kind={SHARED_FILTER_PRESET_API_KIND}
            scope="BOTH"
            sharedFilterOnly
            getCurrentConfigJson={() => JSON.stringify({ minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma })}
            onApplyPresetJson={(presetJson) => {
              try {
                const j = JSON.parse(presetJson) as Record<string, unknown>;
                const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                setMinCorr(txt(j.minCorr)); setMaxCorr(txt(j.maxCorr));
                setMinBeta(txt(j.minBeta)); setMaxBeta(txt(j.maxBeta));
                setMinSigma(txt(j.minSigma)); setMaxSigma(txt(j.maxSigma));
              } catch {
                // older build, or hand-edited - leave the filters alone
              }
            }}
          />
        )}

        {/* Row C — the shared ITB/HARD/DIV/NEWS/PTP/SSR/ETF/CRAP/ANOM + REP/CORR + USA/CHINA +
            COUNTRY/EXCHANGE/SECTOR + %/σ/Δ/γ/α strip, same `FilterFlagsRow` component the Scanner,
            Sonar and Stream all use (AGENTS.md: reuse, don't hand-roll a second copy). */}
        <FilterFlagsRow
          exclusions={[
            { label: "ITB", value: excludeItb, set: setExcludeItb, title: "Borrow status ITB, as of the newest tape day that knows the ticker. One with NO borrow status is dropped too - unknown is not freely borrowable." },
            { label: "HARD", value: excludeHard, set: setExcludeHard, title: "Borrow status NO (hard to borrow), as of the newest tape day. One with no status is dropped too." },
            { label: "Div", value: excludeDividend, set: setExcludeDividend, title: "No dividend field published for Spectr yet — placeholder." },
            { label: "News", value: excludeHasNews, set: setExcludeHasNews, title: "The newest tape day marked this ticker as carrying news. The news COUNT is not used: it moves all session, the marker does not." },
            { label: "PTP", value: excludePTP, set: setExcludePTP, title: "PTP (session constant, from the tape's static sidecar)." },
            { label: "SSR", value: excludeSSR, set: setExcludeSSR, title: "The OUTSIDE-HOURS short-sale restriction. Not the intraday trigger, which fires on a -10% move and is not published anywhere." },
            { label: "ETF", value: excludeEtf, set: setExcludeEtf, title: "Exclude every ticker DailyStaticStore says is an ETF." },
            { label: "CRAP", value: excludeCrap, set: setExcludeCrap, title: "Sub-price tickers (session constant, from the tape's static sidecar)." },
            { label: "ANOM", value: excludeAnom, set: setExcludeAnom, title: "No POST-window anomaly flag published for Spectr yet — placeholder." },
          ]}
          report={{ label: "REP", value: excludeHasReport, set: setExcludeHasReport, title: "The newest tape day marked this ticker as reporting." }}
          corr={{ label: "CORR", value: excludeCorr, set: setExcludeCorr }}
          corrThresholdInput={corrThresholdInput}
          setCorrThresholdInput={setCorrThresholdInput}
          corrThreshold={corrThreshold}
          corrStatus={EMPTY_CORR_STATUS}
          regions={[
            { label: "USA", value: includeUSA, set: setIncludeUSA },
            { label: "CHINA", value: includeChina, set: setIncludeChina },
          ]}
          selectsSlot={
            <>
              <MultiSelectFilter
                label="COUNTRY"
                options={countryOptions}
                selected={countries}
                setSelected={setCountries}
                enabled={countryMode}
                toggleEnabled={() => setCountryMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))}
                color="amber"
              />
              <MultiSelectFilter
                label="EXCHANGE"
                options={exchangeOptions}
                selected={excludeExchange}
                setSelected={setExcludeExchange}
                enabled={exchangeMode}
                toggleEnabled={() => setExchangeMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))}
                color="amber"
              />
              <MultiSelectFilter
                label="SECTOR"
                options={sectorOptions}
                selected={sectors}
                setSelected={setSectors}
                enabled={sectorMode}
                toggleEnabled={() => setSectorMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))}
                color="amber"
                panelWidth={220}
              />
            </>
          }
          zapSlot={
            <div className={`ml-auto ${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.zap.group}`} title="Live threshold-scan controls — Spectr runs no scan, placeholder.">
              {([
                { mode: "zap", label: "%", title: "Thresholds in PERCENT on the Scanner. No scan on Spectr — placeholder." },
                { mode: "sigma", label: "σ", title: "Thresholds in SIGMAS on the Scanner. Placeholder." },
                { mode: "delta", label: "Δ", title: "Median-relative gate on the Scanner. Placeholder." },
                { mode: "gamma", label: "γ", title: "Thresholds in GAMMAS on the Scanner. Placeholder." },
                { mode: "alpha", label: "α", title: "Thresholds in ALPHAS on the Scanner. Placeholder." },
              ] as const).map((u) => {
                const on = zapMode === u.mode;
                return (
                  <button
                    key={u.mode}
                    type="button"
                    onClick={() => setZapMode(on ? "off" : u.mode)}
                    className={clsx(`${FILTER_PILL} gap-1`, on ? FILTER_GROUP_TONES.zap.on : FILTER_GROUP_TONES.zap.off)}
                    title={u.title}
                  >
                    <span className="leading-none" style={{ textTransform: "none" }}>{u.label}</span>
                  </button>
                );
              })}

              <div className={clsx("group relative w-[78px] rounded-md border border-[#f3a6b2]/50", zapMode === "off" && "opacity-60")} title="Coral = short (placeholder, no scan on Spectr).">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={startAbs}
                  disabled={zapMode === "off"}
                  onChange={(e) => setStartAbs(Math.max(0.1, Number(e.target.value) || 0.1))}
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbs((v) => Math.max(0.1, +(v + 0.05).toFixed(4)))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">▲</button>
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbs((v) => Math.max(0.1, +(v - 0.05).toFixed(4)))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40">▼</button>
                </div>
              </div>
              <div className={clsx("group relative w-[78px] rounded-md border border-[#6ee7b7]/45", zapMode === "off" && "opacity-60")} title="Mint = long (placeholder, no scan on Spectr).">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={startAbsNeg}
                  disabled={zapMode === "off"}
                  onChange={(e) => setStartAbsNeg(e.target.value)}
                  placeholder="as short"
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbsNeg((prev) => String(Math.max(0.1, +((Number(prev) || startAbs) + 0.1).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">▲</button>
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbsNeg((prev) => String(Math.max(0.1, +((Number(prev) || startAbs) - 0.1).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40">▼</button>
                </div>
              </div>
              <div className={clsx("group relative w-[78px] rounded-md border border-zinc-200/35", zapMode === "off" && "opacity-60")} title="Silver = the ceiling (placeholder, no scan on Spectr).">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={startAbsMax}
                  disabled={zapMode === "off"}
                  onChange={(e) => setStartAbsMax(e.target.value)}
                  placeholder="start max"
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbsMax((prev) => String(Math.max(0, +((Number(prev) || 0) + 0.1).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">▲</button>
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setStartAbsMax((prev) => String(Math.max(0, +((Number(prev) || 0) - 0.1).toFixed(4))))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40">▼</button>
                </div>
              </div>
              <div className={clsx("group relative w-[78px] rounded-md border border-amber-400/55", zapMode === "off" && "opacity-60")} title="Gold = the exit (placeholder, no scan on Spectr).">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={endAbs}
                  disabled={zapMode === "off"}
                  onChange={(e) => setEndAbs(Math.max(0, Number(e.target.value) || 0))}
                  className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
                />
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setEndAbs((v) => Math.max(0, +(v + 0.05).toFixed(4)))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">▲</button>
                  <button type="button" disabled={zapMode === "off"} onMouseDown={(e) => e.preventDefault()} onClick={() => setEndAbs((v) => Math.max(0, +(v - 0.05).toFixed(4)))} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5 disabled:opacity-40">▼</button>
                </div>
              </div>
            </div>
          }
        />

        {/* Below the shared header: the controls that are this page's own. */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH TICKER…"
            className="h-7 w-40 rounded-lg bg-black/20 px-3 text-[10px] font-mono font-bold uppercase tracking-wide text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>

        {error && (
          <GlassCard className="border-rose-400/25 bg-rose-400/[0.05] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-[11px] text-rose-200/85 break-all">{error}</div>
              <button type="button" onClick={() => load(false)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE)}>RETRY</button>
            </div>
          </GlassCard>
        )}
        {busy && !error && (
          <GlassCard hoverable={false} className="px-4 py-3">
            <div className="font-mono text-[11px] text-zinc-500">
              {meta ? "loading…" : "loading — the first request after a bridge restart downloads and parses the published file (~10 s)…"}
            </div>
          </GlassCard>
        )}

        {meta && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryMetricCard label="TICKERS" value={`${sorted.length.toLocaleString("en-US")} / ${meta.tickers.length.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="SESSIONS SEEN" value={meta.recentDates.length.toLocaleString("en-US")} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MOST RECENT" value={meta.mostRecentSession ?? "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="LEVELS" value={meta.levelsAvailable ? "γ / α PUBLISHED" : "NOT PUBLISHED"} valueClassName={meta.levelsAvailable ? "accent-text" : (isLightTheme ? "text-rose-700" : SOFT_LOSS_TEXT_CLASS)} />
            </div>

            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[78vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.1em] text-zinc-500">
                      {th("TICKER", "ticker", undefined, true)}
                      {th("BENCH", null, undefined, true)}
                      {th("COUNTRY", "country", undefined, true)}
                      {th("SECTOR", "sector", undefined, true)}
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">ETF</th>
                      {th("CORR", "corr", "ρ to the benchmark")}
                      {th("BETA", "beta", "β to the benchmark")}
                      {th("SIGMA", "sigma", "the ticker's own volatility")}
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="gamma level, SHORT side">γ SHORT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="gamma level, LONG side">γ LONG</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="alpha level, SHORT side">α SHORT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title="alpha level, LONG side">α LONG</th>
                      {CLASSES.map((c) => (
                        <React.Fragment key={c.key}>
                          <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${c.label} published rating, SHORT side — rate / total situations`}>{c.label} SHORT</th>
                          <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${c.label} published rating, LONG side — rate / total situations`}>{c.label} LONG</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, shown).map((t: ScoutTicker) => (
                      <tr key={t.t} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.t}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{t.bench ?? "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{t.country ?? "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{t.sector ?? "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{t.etf === true ? "YES" : t.etf === false ? "—" : "?"}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(t.corr, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(t.beta, 3)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(t.sigma, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.gamma[0], 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.gamma[1], 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.alpha[0], 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.alpha[1], 2)}</td>
                        {CLASSES.map((c) => (
                          <React.Fragment key={c.key}>
                            <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={pickRatingTable(t, tableMode)[c.key].pos} outcome={outcomeType} /></td>
                            <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={pickRatingTable(t, tableMode)[c.key].neg} outcome={outcomeType} /></td>
                          </React.Fragment>
                        ))}
                      </tr>
                    ))}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={totalColSpan} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No ticker matches these filters.
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
          </>
        )}
      </div>
    </div>
  );
}
