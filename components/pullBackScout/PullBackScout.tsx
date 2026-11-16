"use client";

/**
 * PULLBACK SCOUT — honest about what PullBack's published file actually contains: there is NO
 * per-trade columnar log (see lib/pullBackScout/types.ts's own header), so unlike every sibling
 * Scout (Reversal, the OPG family, MorLaunch) this page cannot offer a threshold-tunable trade-log
 * recompute, an equity curve, or a per-trade detail table — there is no raw trade data to build
 * any of those from. The published (class, sign) cells ARE the whole of what exists.
 *
 * What this page DOES do, for real: a MINRATE/MINTOTAL gate (same Spinner Input Standard as every
 * sibling Scout/Scanner, AGENTS.md) over the SELECTED class/side's published rating, narrowing the
 * full ticker list down to a shortlist — the "which tickers currently clear a rating bar" question,
 * answered from the same meta Spectr reads. For the full unfiltered browse of every class/ticker at
 * once, see PullBackSpectr.tsx.
 *
 * SIGN→SIDE: checked `PullBackGate.cs` directly — `isLong = d < 0`, pos=SHORT / neg=LONG, the SAME
 * convention as MorLaunch/OPG-Fade/OPG-Reversal/OPG-Rootation.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import ScannerHeader from "../scanner/shell/panels/ScannerHeader";
import { useUi } from "../UiProvider";
import SharedRatingModeRow from "../shared/filters/SharedRatingModeRow";
import { useTickerLists } from "../shared/filters/useTickerLists";
import TickerListPanels from "../shared/filters/TickerListPanels";
import SharedClassRow from "../shared/filters/SharedClassRow";
import SharedFilterPresetBar from "../shared/filters/SharedFilterPresetBar";
import { FilterRangeBoxes } from "../shared/filters/FilterRatingRow";
import PresetPicker from "../presets/PresetPicker";
import { SHARED_FILTER_PRESET_API_KIND } from "../../lib/presets/sharedFilterPreset";
import { ScannerTableStyles, ScannerThemeStyles } from "../scanner/shared/ScannerGlobalStyles";
import { GlassCard, SummaryMetricCard } from "../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import { ratePctFromFraction, ratePctToFraction } from "../../lib/scanner/format";
import { loadPullBackScoutMeta } from "../../lib/pullBackScout/client";
import { PULLBACK_CLASSES } from "../../lib/pullBackScout/types";
import type { PullBackClass, PullBackMeta, PullBackSign, PullBackTicker } from "../../lib/pullBackScout/types";

const CLASSES: Array<{ key: PullBackClass; label: string }> = PULLBACK_CLASSES.map((c) => ({ key: c, label: c }));
const SIDES: Array<{ key: PullBackSign; label: string }> = [
  { key: "pos", label: "SHORT" },
  { key: "neg", label: "LONG" },
];

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const fx = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
const pct0 = (v: number | null | undefined) => (isNum(v) ? `${Math.round(v * 100)}%` : "—");

export default function PullBackScout() {
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
  const [sign, setSign] = useState<PullBackSign>("pos");
  const [minRate, setMinRate] = useState(0.6);
  const [minTotal, setMinTotal] = useState(10);
  // ---- The rest of the Scanner's header, the same two rows every other Scout mounts. PullBack
  // publishes no ASOF/EXPO rebuild and no hard/soft split, so those pills hold their state and say
  // so in their tooltips; RATE/UNIVERSE and MINRATE/MINTOTAL are real.
  const [ratingsIgnored, setRatingsIgnored] = useState(false);
  const [tableMode, setTableMode] = useState<"asof" | "asofew" | "live">("asof");
  const [frozen, setFrozen] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const [outcomeRule, setOutcomeRule] = useState<"norm" | "narrow">("norm");
  const [scopeMode, setScopeMode] = useState<"ALL" | "TOP">("ALL");
  const [outcomeType, setOutcomeType] = useState<"any" | "hard" | "soft">("any");
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [minSigma, setMinSigma] = useState("");
  const [maxSigma, setMaxSigma] = useState("");
  const RATING_RANGE_FIELDS = useMemo(() => ([
    { label: "\u03c3", title: "Sigma - the ticker's published static dispersion", minValue: minSigma, maxValue: maxSigma, setMin: setMinSigma, setMax: setMaxSigma, step: 0.1 },
  ]), [minSigma, maxSigma]);

  const [search, setSearch] = useState("");
  const lists = useTickerLists("pullback-scout");

  const rows = useMemo(() => {
    if (!meta) return [];
    const q = search.trim().toUpperCase();
    return meta.tickers
      .filter((t) => (q ? t.t.includes(q) : true))
      .map((t) => ({ t, rt: t.rating[cls][sign === "pos" ? "pos" : "neg"] }))
      // UNIVERSE drops the gate entirely, the same thing RATE/UNIVERSE means on every other
      // surface - without this the pill would light up and change nothing.
      .filter((r) => ratingsIgnored || (r.rt && r.rt.total >= minTotal && (r.rt.winRate ?? 0) >= minRate))
      // The header's sigma box. A set bound REJECTS a ticker with no sigma - the house rule every
      // filter in this app follows, so an unknown never slips through a filter.
      .filter((r) => {
        const lo = minSigma.trim() === "" ? null : Number(minSigma);
        const hi = maxSigma.trim() === "" ? null : Number(maxSigma);
        if ((lo === null || !Number.isFinite(lo)) && (hi === null || !Number.isFinite(hi))) return true;
        const v = r.t.sigma;
        if (typeof v !== "number" || !Number.isFinite(v)) return false;
        if (lo !== null && Number.isFinite(lo) && v < lo) return false;
        if (hi !== null && Number.isFinite(hi) && v > hi) return false;
        return true;
      })
      // Null-safe: under UNIVERSE an unrated ticker is kept, so `rt` can be null here.
      // IGNORE/APPLY hide rows; PIN only reorders them (see useTickerLists.allows/pinRank).
      .filter((r) => lists.allows(r.t.t))
      .sort((a, b) => (lists.listMode === "pin" ? lists.pinRank(a.t.t) - lists.pinRank(b.t.t) : 0)
        || (b.rt?.winRate ?? 0) - (a.rt?.winRate ?? 0));
  }, [meta, cls, sign, minRate, minTotal, search, ratingsIgnored, minSigma, maxSigma, lists]);

  const headerNavGroupClass = isLightTheme
    ? "flex h-7 items-center gap-2 rounded-lg border border-slate-900/10 bg-white/35"
    : "flex h-7 items-center gap-2 rounded-lg bg-black/20";
  const headerNavInactiveClass = isLightTheme
    ? "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";
  const btn = (active: boolean) => clsx(TOOLBAR_BUTTON_BASE, active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);
  const groupClass = "flex h-7 items-center gap-2 rounded-lg bg-black/20";

  return (
    <div className={clsx("scanner-borderless relative min-h-screen w-full bg-transparent text-zinc-200 font-sans selection:text-white p-4 overflow-x-clip", "accent-selection", isLightTheme && "scanner-light-theme")}>
      <ScannerTableStyles />
      <ScannerThemeStyles />

      <div className="relative z-10 max-w-[1920px] mx-auto space-y-4">
        <ScannerHeader
          scannerShellTitle="PULLBACK•SCOUT"
          headerNavGroupClass={headerNavGroupClass}
          headerNavInactiveClass={headerNavInactiveClass}
          navStreamHref="/pull-back/scanner"
          navScannerHref="/pull-back/scanner"
          navSonarHref="/pull-back/sonar"
          navScoutHref="/pull-back/scout"
          navSpectrHref="/pull-back/spectr"
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
          canRun={!busy}
          run={() => load(true)}
          busy={busy}
          variantString="Reload the published pullback_rolling_perf file from the bridge"
        />

        <TickerListPanels lists={lists} />

        {/* The Scanner's two header rows - shared/filters/SharedRatingModeRow and SharedClassRow -
            the same ones every other Scout and every Spectr mount. SEARCH and the SIDE pills are
            this page's own and sit on the line below.

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
          classes={CLASSES.map((c) => ({ key: c.key, label: c.label, title: `Check ${c.label}'s own published rating` }))}
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

        {/* Below the shared rows: the controls that are this page's own. */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH TICKER…"
            className="h-7 w-40 rounded-lg bg-black/20 px-3 text-[10px] font-mono font-bold uppercase tracking-wide text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-white/20"
          />
          <div className={groupClass} title="Which side \u2014 pos=SHORT, neg=LONG (checked PullBackGate.cs directly)">
            {SIDES.map((s) => (
              <button key={s.key} type="button" onClick={() => setSign(s.key)} className={btn(sign === s.key)}>{s.label}</button>
            ))}
          </div>
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
              <SummaryMetricCard label="SHORTLIST" value={`${rows.length.toLocaleString("en-US")} / ${meta.tickers.length.toLocaleString("en-US")}`} valueClassName="text-zinc-200" />
              <SummaryMetricCard label="CLASS / SIDE" value={`${cls} ${sign === "pos" ? "SHORT" : "LONG"}`} valueClassName="accent-text" />
              <SummaryMetricCard label="MOST RECENT" value={meta.mostRecentSession ?? "—"} valueClassName="text-zinc-200" />
              <SummaryMetricCard
                label="MEAN RATE (SHORTLIST)"
                value={pct0(rows.length ? rows.reduce((s, r) => s + (r.rt!.winRate ?? 0), 0) / rows.length : null)}
                valueClassName="text-zinc-200"
              />
            </div>

            <GlassCard hoverable={false} className="overflow-hidden p-0">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#090a0f]/90 backdrop-blur">
                    <tr className="tracking-[0.1em] text-zinc-500">
                      <th className="px-2.5 py-2 text-left text-[9px] font-semibold whitespace-nowrap">TICKER</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">SIGMA</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">WIN RATE</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">TOTAL</th>
                      <th className="px-2.5 py-2 text-right text-[9px] font-semibold whitespace-nowrap">MEAN PNL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ t, rt }: { t: PullBackTicker; rt: NonNullable<PullBackTicker["rating"][PullBackClass]["pos"]> }) => (
                      <tr key={t.t} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-left font-bold text-zinc-100">{t.t}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-300">{fx(t.sigma, 2)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right accent-text">{pct0(rt.winRate)}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{rt.total}</td>
                        <td className="whitespace-nowrap px-2.5 py-[5px] text-right text-zinc-500">{fx(rt.meanPnl, 2)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-[11px] text-zinc-600">
                          No ticker clears MINRATE/MINTOTAL for this class/side.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </div>
  );
}
