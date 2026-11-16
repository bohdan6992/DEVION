"use client";

/**
 * PULLBACK SPECTR — a flat reference table over every ticker in the published file, reading
 * nothing but `/api/pull-back/scout/meta` (there is no trade-log slice to read: PullBack's file
 * carries no per-trade columnar log at all — see lib/pullBackScout/types.ts's own header).
 *
 * UNLIKE every sibling Spectr (Reversal, the OPG family, MorLaunch), PullBack's alpha/gamma are
 * PER CLASS, not per ticker — a ticker carries one levels entry per class (T0430/T0500/T0530),
 * each holding BOTH signs inside it. So this page carries its own CLASS selector (Secondary Button
 * Standard, AGENTS.md — same pattern PairFluxSpectr.tsx uses for its own per-class, not-per-sign
 * levels) that picks which class's α/γ levels and realised rating are shown; SIGMA and LAMBDA are
 * row-level constants shown regardless of the class picked.
 *
 * GAMMA here is the MAXIMUM EXCURSION the stack made between the selected class and 09:30 — large
 * by construction (median ~16pp on the real file), never a qualifying entry level the way the OPG
 * family's gamma is. Do not read "γ SHORT 16.1" as a tight gate; it is a ceiling, not a trigger.
 *
 * SIGN→SIDE: checked `PullBackGate.cs` directly — `isLong = d < 0`, the SAME convention as
 * MorLaunch/OPG-Fade/OPG-Reversal/OPG-Rootation. pos (stack standing high) is sold SHORT, neg
 * (standing low) is bought LONG.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import FilterFlagsRow from "../shared/filters/FilterFlagsRow";
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
import type { SectorCorrExclusion } from "../../lib/filters/sectorCorr";
import { SECTOR_CORR_DEFAULT } from "../../lib/filters/sectorCorr";
import { useUi } from "../UiProvider";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { GlassCard, MultiSelectFilter, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import type { TriMode } from "../../lib/scanner/types";
import { loadPullBackScoutMeta } from "../../lib/pullBackScout/client";
import { PULLBACK_CLASSES } from "../../lib/pullBackScout/types";
import type { PullBackClass, PullBackMeta, PullBackRatingCell, PullBackTicker } from "../../lib/pullBackScout/types";

const CLASSES: Array<{ key: PullBackClass; label: string }> = PULLBACK_CLASSES.map((c) => ({ key: c, label: c }));

type SortKey = "ticker" | "sigma" | "lambda" | "country" | "sector";
type SortDir = "asc" | "desc";

/** No episode replay here to seed a sector-correlation set from — same shape ArbitrageSpectr/
 * MorLaunchSpectr use for the same reason. */
const EMPTY_CORR_STATUS: SectorCorrExclusion = { excluded: new Set<string>(), seedCount: 0, loading: false, error: null };

const PAGE_ROWS = 200;

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const fx = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
const pct0 = (v: number | null | undefined) => (isNum(v) ? `${Math.round(v * 100)}%` : "—");
const ratingTone = (v: number | null | undefined) => (!isNum(v) ? "text-zinc-600" : v >= 0.5 ? "accent-text" : v >= 0.3 ? "text-zinc-200" : "text-zinc-500");

function RatingCell({ rating }: { rating: PullBackRatingCell | null }) {
  if (!rating || rating.total === 0) return <span className="text-zinc-600">—</span>;
  return (
    <span className={ratingTone(rating.winRate)}>
      {pct0(rating.winRate)} <span className="text-zinc-600">/{rating.total}</span>
    </span>
  );
}

export default function PullBackSpectr() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";

  const [meta, setMeta] = useState<PullBackMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback((force: boolean) => {
    setBusy(true);
    setError(null);
    loadPullBackScoutMeta(force)
      .then((m) => setMeta(m))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(false); }, [load]);

  const [cls, setCls] = useState<PullBackClass>("T0430");
  const [search, setSearch] = useState("");
  const [excludeEtf, setExcludeEtf] = useState(false);
  const [countryMode, setCountryMode] = useState<TriMode>("off");
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [sectorMode, setSectorMode] = useState<TriMode>("off");
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(PAGE_ROWS);
  const lists = useTickerLists("pullback-spectr");

  const [excludeItb, setExcludeItb] = useState(false);
  const [excludeHard, setExcludeHard] = useState(false);
  const [excludeDividend, setExcludeDividend] = useState(false);
  const [excludeNews, setExcludeNews] = useState(false);
  const [excludePtp, setExcludePtp] = useState(false);
  const [excludeSsr, setExcludeSsr] = useState(false);
  const [excludeCrap, setExcludeCrap] = useState(false);
  const [excludeAnom, setExcludeAnom] = useState(false);
  const [excludeReport, setExcludeReport] = useState(false);
  const [includeUsa, setIncludeUsa] = useState(false);
  const [includeChina, setIncludeChina] = useState(false);
  const [exchangeMode, setExchangeMode] = useState<TriMode>("off");
  const [exchanges, setExchanges] = useState<Set<string>>(new Set());
  const [corrThresholdInput, setCorrThresholdInput] = useState(String(SECTOR_CORR_DEFAULT));
  const corrThreshold = Number(corrThresholdInput) || SECTOR_CORR_DEFAULT;

  // ---- The SCOUT header's own state.
  // Same controls Scout has. PullBack publishes no ASOF/EXPO rebuild and no hard/soft split, so
  // those pills hold their state and say so in their tooltips rather than being left out: the
  // header is meant to be the same row, control for control. The class pills already existed on
  // this page (`cls`), so the shared row drives THAT state - one class selection, not two.
  const [ratingsIgnored, setRatingsIgnored] = useState(false);
  const [tableMode, setTableMode] = useState<"asof" | "asofew" | "live">("asof");
  const [frozen, setFrozen] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const [outcomeRule, setOutcomeRule] = useState<"norm" | "narrow">("norm");
  const [minRate, setMinRate] = useState(0);
  const [minTotal, setMinTotal] = useState(0);
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  const [outcomeType, setOutcomeType] = useState<"any" | "hard" | "soft">("any");
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [minSigma, setMinSigma] = useState("");
  const [maxSigma, setMaxSigma] = useState("");
  const RATING_RANGE_FIELDS = useMemo(() => ([
    { label: "\u03c3", title: "Sigma - the ticker's published static dispersion", minValue: minSigma, maxValue: maxSigma, setMin: setMinSigma, setMax: setMaxSigma, step: 0.1 },
  ]), [minSigma, maxSigma]);

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
    if (excludeItb || excludeHard) rows = rows.filter((t) => !rowExcludedByBorrow({ b5etb: t.etb }, excludeItb, excludeHard));
    if (excludeNews) rows = rows.filter((t) => t.news !== true);
    if (excludePtp) rows = rows.filter((t) => t.ptp !== true);
    if (excludeSsr) rows = rows.filter((t) => t.ssrOut !== true);
    if (excludeCrap) rows = rows.filter((t) => t.crap !== true);
    if (excludeReport) rows = rows.filter((t) => t.rep !== true);
    rows = rows.filter((t) => inSelectedRegions(t.country, includeUsa, includeChina));
    if (exchangeMode !== "off" && exchanges.size > 0) {
      rows = rows.filter((t) => (exchangeMode === "include" ? t.exchange != null && exchanges.has(t.exchange) : !(t.exchange != null && exchanges.has(t.exchange))));
    }
    // The header's MINRATE/MINTOTAL gate, scoped to the selected class - the same question
    // PullBack's own Scout gate asks, so the two pages agree on which tickers are "rated enough".
    if (!ratingsIgnored && (minRate > 0 || minTotal > 0)) {
      const rated = (r: { total: number; winRate: number | null } | null | undefined) =>
        !!r && r.total >= minTotal && (r.winRate ?? -1) + 1e-9 >= minRate;
      rows = rows.filter((t) => {
        const cell = t.rating[cls];
        return rated(cell?.pos) || rated(cell?.neg);
      });
    }
    // A set bound REJECTS a ticker with no such number - the house rule every filter here follows.
    const inRange = (v: number | null | undefined, lo: string, hi: string) => {
      const l = lo.trim() === "" ? null : Number(lo);
      const h = hi.trim() === "" ? null : Number(hi);
      if ((l === null || !Number.isFinite(l)) && (h === null || !Number.isFinite(h))) return true;
      if (!isNum(v)) return false;
      if (l !== null && Number.isFinite(l) && v < l) return false;
      if (h !== null && Number.isFinite(h) && v > h) return false;
      return true;
    };
    rows = rows.filter((t) => inRange(t.sigma, minSigma, maxSigma));
    rows = rows.filter((t) => lists.allows(t.t));
    return rows;
  }, [meta, search, excludeEtf, countryMode, countries, sectorMode, sectors, excludeItb, excludeHard, excludeNews, excludePtp, excludeSsr, excludeCrap, excludeReport, includeUsa, includeChina, exchangeMode, exchanges, lists, ratingsIgnored, minRate, minTotal, cls, tableMode, outcomeType, minSigma, maxSigma]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "ticker") return a.t.localeCompare(b.t) * dir;
      if (sortKey === "country") return (a.country ?? "").localeCompare(b.country ?? "") * dir;
      if (sortKey === "sector") return (a.sector ?? "").localeCompare(b.sector ?? "") * dir;
      const av = sortKey === "lambda" ? a.lambda : a.sigma;
      const bv = sortKey === "lambda" ? b.lambda : b.sigma;
      const an = isNum(av), bn = isNum(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return (av - bv) * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => { setShown(PAGE_ROWS); }, [search, excludeEtf, countryMode, countries, sectorMode, sectors, sortKey, sortDir, cls, ratingsIgnored, minRate, minTotal, cls, tableMode, outcomeType, minSigma, maxSigma]);

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
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";

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

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        <ScannerHeader
          scannerShellTitle="PULLBACK•SPECTR"
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref="/pull-back/scanner"
          navScannerHref="/pull-back/scanner"
          navSonarHref="/pull-back/sonar"
          navScoutHref="/pull-back/scout"
          navSpectrHref="/pull-back/spectr"
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
          canRun={!busy}
          run={() => load(true)}
          busy={busy}
          variantString="Reload the published pullback_rolling_perf file from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* The header is the SCOUT header, control for control: the same two components Scout
            mounts - shared/filters/SharedRatingModeRow and shared/filters/SharedClassRow. This
            page's own control (SEARCH) sits on its own line BELOW the shared rows.

            `setCls` is wrapped rather than passed bare: a useState setter takes SetStateAction<T>,
            which is not a string, and handing it over bare drags the row's class type down to
            plain `string`. */}
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
          modesInert
          rangesSlot={<FilterRangeBoxes ranges={RATING_RANGE_FIELDS} />}
        />

        <SharedClassRow
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `Show ${c.label}'s own \u03b1/\u03b3 levels and rating, and restrict the MINRATE/MINTOTAL gate to it` }))}
          cls={cls}
          setCls={(k) => setCls(k)}
          scopeMode={scopeMode}
          setScopeMode={setScopeMode}
          scopeInert
          outcomeType={outcomeType}
          setOutcomeType={setOutcomeType}
          outcomeInert
          rightSlot={
            <SharedFilterPresetBar
              getConfigJson={() => JSON.stringify({ minSigma, maxSigma })}
              applyConfigJson={(json) => {
                try {
                  const j = JSON.parse(json) as Record<string, unknown>;
                  const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                  setMinSigma(txt(j.minSigma));
                  setMaxSigma(txt(j.maxSigma));
                  return true;
                } catch {
                  return false; // older build, or hand-edited - leave the filters alone
                }
              }}
              onClear={() => { setMinSigma(""); setMaxSigma(""); }}
              showPanel={showPresetPanel}
              setShowPanel={setShowPresetPanel}
            />
          }
          infoSlot={meta ? (
            <>
              <span>{meta.mostRecentSession ? `through ${meta.mostRecentSession}` : ""}</span>
              {meta.generatedAt && <span>file {meta.generatedAt.slice(0, 16).replace("T", " ")}Z</span>}
            </>
          ) : null}
        />

        {showPresetPanel && (
          <PresetPicker
            kind={SHARED_FILTER_PRESET_API_KIND}
            scope="BOTH"
            sharedFilterOnly
            getCurrentConfigJson={() => JSON.stringify({ minSigma, maxSigma })}
            onApplyPresetJson={(presetJson) => {
              try {
                const j = JSON.parse(presetJson) as Record<string, unknown>;
                const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
                setMinSigma(txt(j.minSigma));
                setMaxSigma(txt(j.maxSigma));
              } catch {
                // older build, or hand-edited - leave the filters alone
              }
            }}
          />
        )}

          <FilterFlagsRow
            exclusions={[
              { label: "ITB", value: excludeItb, set: setExcludeItb, title: "Borrow status ITB, as of the newest tape day that knows the ticker. One with NO status is dropped too." },
              { label: "HARD", value: excludeHard, set: setExcludeHard, title: "Borrow status NO (hard to borrow), as of the newest tape day." },
              { label: "Div", value: excludeDividend, set: setExcludeDividend, title: "No dividend field reaches this page. Holds its state and rejects nothing." },
              { label: "News", value: excludeNews, set: setExcludeNews, title: "The newest tape day marked this ticker as carrying news." },
              { label: "PTP", value: excludePtp, set: setExcludePtp, title: "PTP (session constant, tape static sidecar)." },
              { label: "SSR", value: excludeSsr, set: setExcludeSsr, title: "The OUTSIDE-HOURS short-sale restriction." },
              { label: "ETF", value: excludeEtf, set: setExcludeEtf, title: "Drop every ticker the tape says is an ETF." },
              { label: "CRAP", value: excludeCrap, set: setExcludeCrap, title: "Sub-price tickers (session constant, tape static sidecar)." },
              { label: "ANOM", value: excludeAnom, set: setExcludeAnom, title: "No episode replay on this reference table to resolve the POST anomaly set from. Holds state, rejects nothing." },
            ]}
            report={{ label: "REP", value: excludeReport, set: setExcludeReport, title: "The newest tape day marked this ticker as reporting." }}
            corr={{ label: "CORR", value: false, set: () => {}, title: "Needs a per-day seed set this reference table has no replay to build." }}
            corrThresholdInput={corrThresholdInput}
            setCorrThresholdInput={setCorrThresholdInput}
            corrThreshold={corrThreshold}
            corrStatus={EMPTY_CORR_STATUS}
            regions={[
              { label: "USA", value: includeUsa, set: setIncludeUsa },
              { label: "CHINA", value: includeChina, set: setIncludeChina },
            ]}
            selectsSlot={
              <>
                <MultiSelectFilter label="COUNTRY" options={countryOptions} selected={countries} setSelected={setCountries}
                  enabled={countryMode} toggleEnabled={() => setCountryMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))} />
                <MultiSelectFilter label="EXCHANGE" options={exchangeOptions} selected={exchanges} setSelected={setExchanges}
                  enabled={exchangeMode} toggleEnabled={() => setExchangeMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))} />
                <MultiSelectFilter label="SECTOR" options={sectorOptions} selected={sectors} setSelected={setSectors}
                  enabled={sectorMode} toggleEnabled={() => setSectorMode((m) => (m === "off" ? "include" : m === "include" ? "exclude" : "off"))} />
              </>
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
              {meta ? "loading…" : "loading — the first request after a bridge restart downloads and parses the published file…"}
            </div>
          </GlassCard>
        )}

        {meta && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryMetricCard label="TICKERS" value={`${sorted.length.toLocaleString("en-US")} / ${meta.tickers.length.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="SESSIONS SEEN" value={meta.sessionsSeen.toLocaleString("en-US")} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MOST RECENT" value={meta.mostRecentSession ?? "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="CLASS SHOWN" value={cls} valueClassName="accent-text" />
            </div>

            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[78vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.1em] text-zinc-500">
                      {th("TICKER", "ticker", undefined, true)}
                      {th("COUNTRY", "country", undefined, true)}
                      {th("SECTOR", "sector", undefined, true)}
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">ETF</th>
                      {th("SIGMA", "sigma", "static per-ticker dispersion figure")}
                      {th("LAMBDA", "lambda", "RMS of the per-session max |Stack%| over 04:04-09:30")}
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} α SHORT — RMS displacement at this class's checkpoint, positive readings`}>α SHORT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} α LONG — RMS displacement at this class's checkpoint, negative readings`}>α LONG</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} γ SHORT — MAXIMUM excursion between ${cls} and 09:30, not a qualifying level`}>γ SHORT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} γ LONG — MAXIMUM excursion between ${cls} and 09:30, not a qualifying level`}>γ LONG</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} published win rate, SHORT side (pos)`}>{cls} SHORT</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls} published win rate, LONG side (neg)`}>{cls} LONG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, shown).map((t: PullBackTicker) => {
                      const lv = t.levels[cls];
                      const rt = t.rating[cls];
                      return (
                        <tr key={t.t} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.t}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{t.country ?? "—"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{t.sector ?? "—"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{t.etf === true ? "YES" : t.etf === false ? "—" : "?"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(t.sigma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(t.lambda, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.alphaPos, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.alphaNeg, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.gammaPos, 1)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.gammaNeg, 1)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={rt.pos} /></td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={rt.neg} /></td>
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-[11px] text-zinc-600">
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
