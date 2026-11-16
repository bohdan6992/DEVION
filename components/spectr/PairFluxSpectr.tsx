"use client";

/**
 * PAIRFLUX SPECTR — the pair analogue of ArbitrageSpectr.tsx. A row is a PAIR (a, b, bench), not a
 * single ticker (see lib/pairfluxScout/types.ts's own header comment). The real structural
 * difference from Arbitrage/Reversal: PairFlux's sigma/gamma/alpha/corr/beta are published PER
 * CLASS (PRE/OPEN/INTRA), never split by sign — one row per pair per class, not one row per pair
 * total. So this page carries its own CLASS selector (Secondary Button Standard, AGENTS.md) that
 * picks which class's levels and ratings are shown; switching it reads a different slice of the
 * SAME already-loaded meta object, no new fetch.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../ui/GlitchTitle";
import { useUi } from "../UiProvider";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { GlassCard, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { getLiveStrategy } from "../../lib/strategies/registry";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import SharedRatingModeRow from "../shared/filters/SharedRatingModeRow";
import { useTickerLists } from "../shared/filters/useTickerLists";
import TickerListPanels from "../shared/filters/TickerListPanels";
import SharedClassRow from "../shared/filters/SharedClassRow";
import SharedFilterPresetBar from "../shared/filters/SharedFilterPresetBar";
import { FilterRangeBoxes } from "../shared/filters/FilterRatingRow";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND } from "../../lib/presets/sharedFilterPreset";
import { loadPfScoutMeta } from "../../lib/pairfluxScout/client";
import type { PfScoutClass, PfScoutMeta, PfScoutPair } from "../../lib/pairfluxScout/types";

const CLASSES: Array<{ key: PfScoutClass; label: string }> = [
  { key: "pre", label: "PRE" },
  { key: "open", label: "OPEN" },
  { key: "intra", label: "INTRA" },
];

type SortKey = "pair" | "bench" | "sigma" | "gamma" | "alpha" | "corr" | "beta";
type SortDir = "asc" | "desc";

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

function RatingCell({ rating }: { rating: { rate: number; total: number } | null }) {
  if (!rating || rating.total === 0) return <span className="text-zinc-600">—</span>;
  return (
    <span className={ratingTone(rating.rate)}>
      {pct0(rating.rate)} <span className="text-zinc-600">/{rating.total}</span>
    </span>
  );
}

export default function PairFluxSpectr() {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const nav = getLiveStrategy("pairflux")!.nav;

  const [meta, setMeta] = useState<PfScoutMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback((force: boolean) => {
    setBusy(true);
    setError(null);
    loadPfScoutMeta(force)
      .then((m) => setMeta(m))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(false); }, [load]);

  const [cls, setCls] = useState<PfScoutClass>("open");
  const [search, setSearch] = useState("");
  const lists = useTickerLists("pairflux-spectr");
  const [sortKey, setSortKey] = useState<SortKey>("pair");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(PAGE_ROWS);

  // ---- The SCOUT header's own state, same controls PairFluxScout now mounts. This strategy
  // publishes no ASOF/EXPO rebuild and no hard/soft split, so those pills hold their state and say
  // so in their tooltips rather than being left out.
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
  const [minCorr, setMinCorr] = useState("");
  const [maxCorr, setMaxCorr] = useState("");
  const [minBeta, setMinBeta] = useState("");
  const [maxBeta, setMaxBeta] = useState("");
  const [minSigma, setMinSigma] = useState("");
  const [maxSigma, setMaxSigma] = useState("");
  const RATING_RANGE_FIELDS = useMemo(() => ([
    { label: "\u03c1", title: "Correlation of the pair's legs, for the selected class", minValue: minCorr, maxValue: maxCorr, setMin: setMinCorr, setMax: setMaxCorr, step: 0.05 },
    { label: "\u03b2", title: "Beta - the pair's hedge ratio on Stack% levels for the selected class (magnitude)", minValue: minBeta, maxValue: maxBeta, setMin: setMinBeta, setMax: setMaxBeta, step: 0.1 },
    { label: "\u03c3", title: "Sigma - the pair's published sigma level for the selected class", minValue: minSigma, maxValue: maxSigma, setMin: setMinSigma, setMax: setMaxSigma, step: 0.1 },
  ]), [minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

  const filtered = useMemo(() => {
    if (!meta) return [];
    const q = search.trim().toUpperCase();
    let rows = meta.pairs;
    if (q) rows = rows.filter((p) => p.a.includes(q) || p.b.includes(q));
    // The header's MINRATE/MINTOTAL gate, scoped to the selected class - the same question
    // PairFluxScout's own gate asks, so the two pages agree on which pairs are "rated enough".
    // A pair passes if EITHER direction's cell clears both bars.
    if (!ratingsIgnored && (minRate > 0 || minTotal > 0)) {
      const rated = (r: { rate: number; total: number } | null | undefined) =>
        !!r && r.total >= minTotal && r.rate + 1e-9 >= minRate;
      rows = rows.filter((p) => {
        const cell = p.rating[cls];
        return rated(cell?.pos) || rated(cell?.neg);
      });
    }
    // ρ/β/σ of the PAIR for the selected class. A set bound REJECTS a pair with no such number -
    // the house rule every filter in this app follows, so an unknown never slips through.
    const inRange = (v: number | null | undefined, lo: string, hi: string) => {
      const l = lo.trim() === "" ? null : Number(lo);
      const h = hi.trim() === "" ? null : Number(hi);
      if ((l === null || !Number.isFinite(l)) && (h === null || !Number.isFinite(h))) return true;
      if (!isNum(v)) return false;
      if (l !== null && Number.isFinite(l) && v < l) return false;
      if (h !== null && Number.isFinite(h) && v > h) return false;
      return true;
    };
    rows = rows.filter((p) => {
      const lv = p.levels[cls];
      return inRange(lv?.corr, minCorr, maxCorr)
        && inRange(isNum(lv?.beta) ? Math.abs(lv.beta) : null, minBeta, maxBeta)
        && inRange(lv?.sigma, minSigma, maxSigma);
    });
    // IGNORE/APPLY hide pairs unless BOTH legs pass; PIN only reorders (below).
    return rows.filter((p) => lists.allows(p.a) && lists.allows(p.b));
  }, [meta, search, cls, ratingsIgnored, minRate, minTotal, tableMode, outcomeType, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma, lists]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "pair") return `${a.a}/${a.b}`.localeCompare(`${b.a}/${b.b}`) * dir;
      if (sortKey === "bench") return (a.bench ?? "").localeCompare(b.bench ?? "") * dir;
      const av = a.levels[cls][sortKey];
      const bv = b.levels[cls][sortKey];
      const an = isNum(av), bn = isNum(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return (av - bv) * dir;
    });
    if (lists.listMode === "pin") {
      const rank = (p: PfScoutPair) => Math.min(lists.pinRank(p.a), lists.pinRank(p.b));
      rows.sort((x, y) => rank(x) - rank(y)); // stable: pinned pairs first, the chosen sort inside each group
    }
    return rows;
  }, [filtered, sortKey, sortDir, cls, lists]);

  useEffect(() => { setShown(PAGE_ROWS); }, [search, cls, sortKey, sortDir, ratingsIgnored, minRate, minTotal, tableMode, outcomeType, minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma]);

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
  const navPill = "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5";
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
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

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        <ScannerHeader
          scannerShellTitle="PAIRFLUX•SPECTR"
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
          canRun={!busy}
          run={() => load(true)}
          busy={busy}
          variantString="Reload the published summary from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* The header is the SCOUT header, control for control: the same two components
            PairFluxScout mounts. This page's own control (SEARCH) sits BELOW them.

            No flags row here: ITB/HARD/NEWS/PTP/... come off the tape per TICKER and nothing
            publishes them per PAIR, so those pills would reject nothing while looking like they
            work. */}
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
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `Show ${c.label}'s own levels and ratings, and restrict the MINRATE/MINTOTAL gate to it` }))}
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
              getConfigJson={() => JSON.stringify({ minCorr, maxCorr, minBeta, maxBeta, minSigma, maxSigma })}
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
              {!meta.levelsAvailable && <span className="text-amber-300/80">levels not published yet</span>}
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

        {/* Below the shared header: the controls that are this page's own. */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH LEG…"
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
              <SummaryMetricCard label="PAIRS" value={`${sorted.length.toLocaleString("en-US")} / ${meta.pairs.length.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="SESSIONS SEEN" value={meta.recentDates.length.toLocaleString("en-US")} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="MOST RECENT" value={meta.mostRecentSession ?? "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="CLASS SHOWN" value={CLASSES.find((c) => c.key === cls)?.label ?? "—"} valueClassName="accent-text" />
            </div>

            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[78vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.1em] text-zinc-500">
                      {th("PAIR", "pair", undefined, true)}
                      {th("BENCH", "bench", undefined, true)}
                      {th("SIGMA", "sigma", `${cls.toUpperCase()} dispersion`)}
                      {th("GAMMA", "gamma", `${cls.toUpperCase()} best reversal-entry deviation`)}
                      {th("ALPHA", "alpha", `${cls.toUpperCase()} level`)}
                      {th("CORR", "corr", "5-bar return correlation, forward (a,b) direction")}
                      {th("BETA", "beta", "hedge beta, forward (a,b) direction")}
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls.toUpperCase()} published rating, POS direction — rate / total episodes`}>RATE POS</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap" title={`${cls.toUpperCase()} published rating, NEG direction — rate / total episodes`}>RATE NEG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, shown).map((p: PfScoutPair) => {
                      const lv = p.levels[cls];
                      const rt = p.rating[cls];
                      return (
                        <tr key={`${p.a}/${p.b}`} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{p.a}/{p.b}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-left text-zinc-500">{p.bench ?? "—"}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(lv.sigma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(lv.gamma, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(lv.alpha, 2)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.corr, 3)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(lv.beta, 3)}</td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={rt.pos} /></td>
                          <td className="whitespace-nowrap px-2.5 py-[5px] text-right"><RatingCell rating={rt.neg} /></td>
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No pair matches this search.
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
