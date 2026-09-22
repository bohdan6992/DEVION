"use client";

import React from "react";
import {
  FILTER_GROUP_BASE,
  FILTER_GROUP_TONES,
  FILTER_PILL,
  type FilterGroupRole,
} from "./styles";
import {
  SECTOR_CORR_MAX,
  SECTOR_CORR_MIN,
  type SectorCorrExclusion,
} from "../../../lib/filters/sectorCorr";

/**
 * The toggle row of the filter toolbar: exclusions (ITB/HARD/DIV/NEWS/PTP/SSR/ETF/CRAP), the
 * report group (REP/CORR + its |corr| threshold), and the region group (USA/CHINA).
 *
 * WHY THIS IS SHARED AND THE SELECTS ARE NOT
 * These toggles are the part that keeps changing together: adding CORR meant the same edit in
 * four files, and getting it wrong in one of them is invisible until a filter silently passes
 * everything. The COUNTRY/EXCHANGE/SECTOR and sort controls, by contrast, are already different
 * implementations per surface (the Scanner has its own `MultiSelectFilter`), and the ZAP group
 * exists only on Arbitrage. Those come in as slots, so each surface keeps the control it already
 * has while the volatile part has exactly one definition.
 *
 * Adding a filter to all three surfaces is therefore: add it to `exclusions` (or to the model the
 * caller builds), and add the rule to the shared predicate in `lib/filters`.
 */

export type FilterToggle = {
  label: string;
  value: boolean;
  set: (next: boolean) => void;
  title?: string;
};

const CORR_STEP = 0.05;

/** Steps the |corr| cutoff and keeps it inside the range the bridge can answer for. */
function stepCorr(current: number, delta: number): number {
  const next = +(current + delta).toFixed(4);
  return Math.min(SECTOR_CORR_MAX, Math.max(SECTOR_CORR_MIN, next));
}

function ToggleGroup({ role, toggles }: { role: FilterGroupRole; toggles: FilterToggle[] }) {
  const tone = FILTER_GROUP_TONES[role];
  return (
    <>
      {toggles.map((toggle) => (
        <button
          key={toggle.label}
          type="button"
          onClick={() => toggle.set(!toggle.value)}
          title={toggle.title}
          className={`${FILTER_PILL} ${toggle.value ? tone.on : tone.off}`}
        >
          {toggle.label}
        </button>
      ))}
    </>
  );
}

export type FilterFlagsRowProps = {
  /** Red group. Order is the display order. */
  exclusions: FilterToggle[];
  /** Pink group: the report toggle and the correlation toggle it seeds. */
  report: FilterToggle;
  corr: FilterToggle;
  /** Raw text of the |corr| box, kept as a string so a half-typed value is not clamped mid-edit. */
  corrThresholdInput: string;
  setCorrThresholdInput: (next: string) => void;
  /** The parsed and clamped value the filter actually uses. */
  corrThreshold: number;
  corrStatus: SectorCorrExclusion;
  /** Green group. */
  regions: FilterToggle[];
  /** COUNTRY/EXCHANGE/SECTOR — each surface passes its own control. */
  selectsSlot?: React.ReactNode;
  /**
   * Rendered immediately after selectsSlot, BEFORE the `flex-1` spacer that pushes the sort/trailing/
   * zap groups to the row's far right edge — for a strategy-specific control that belongs beside
   * COUNTRY/EXCHANGE/SECTOR rather than pinned to the far edge (e.g. Reversal's GAMMA/RAW + threshold
   * group, which the user asked to sit right after SECTOR and before the sort dropdown).
   */
  strategySlot?: React.ReactNode;
  /** Sort control. */
  sortSlot?: React.ReactNode;
  /**
   * Rendered AFTER the sort group, as its own element rather than inside it. A strategy-specific
   * control belongs next to the sort pill, not within its border — putting it in sortSlot wraps it
   * in the sort group's own frame and the two read as one control.
   */
  trailingSlot?: React.ReactNode;
  /** ZAP group; Arbitrage only, absent on OpenDoor. */
  zapSlot?: React.ReactNode;
  /**
   * Extra classes for the row itself. Needed because this must BE the flex row, not sit inside
   * one: `flex-1`/`ml-auto` push the sort and ZAP groups to the right edge, and they measure
   * against the element's own width. Wrapping it in another flex container shrinks it to content
   * and the right-hand groups stop aligning — which is exactly how the Scanner drifted from the
   * Sonar. Callers that need layout classes (e.g. `order-1`) pass them here instead of wrapping.
   */
  className?: string;
};

export default function FilterFlagsRow({
  exclusions,
  report,
  corr,
  corrThresholdInput,
  setCorrThresholdInput,
  corrThreshold,
  corrStatus,
  regions,
  selectsSlot,
  strategySlot,
  sortSlot,
  trailingSlot,
  zapSlot,
  className,
}: FilterFlagsRowProps) {
  const corrTitle = corrStatus.error
    ? `CORR unavailable: ${corrStatus.error}`
    : corr.value
      ? `Exclude |corr| ≥ ${corrThreshold} with ${corrStatus.seedCount} reporting tickers` +
        (corrStatus.loading ? " (loading…)" : ` — ${corrStatus.excluded.size} excluded`)
      : `Exclude tickers correlated with today's reports (|corr| ≥ ${corrThreshold})`;

  return (
    <div className={`flex flex-wrap items-center gap-3${className ? ` ${className}` : ""}`}>
      <div className={`${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.exclude.group}`}>
        <ToggleGroup role="exclude" toggles={exclusions} />
      </div>

      <div className={`${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.report.group}`}>
        <ToggleGroup role="report" toggles={[report, { ...corr, title: corrTitle }]} />
        {/*
          |corr| cutoff. 0.5 is the floor the bridge indexes down to, so lower is not offered.
          Styled exactly like the ZAP threshold box next to it — same width, same neutral dark
          field, same hover-revealed steppers. A number box should not change appearance just
          because it sits in the pink group rather than the violet one.
        */}
        <div className={`group relative w-[78px]${corr.value ? "" : " opacity-60"}`}>
          <input
            type="number"
            step={CORR_STEP}
            min={SECTOR_CORR_MIN}
            max={SECTOR_CORR_MAX}
            value={corrThresholdInput}
            onChange={(e) => setCorrThresholdInput(e.target.value)}
            onBlur={() => setCorrThresholdInput(String(corrThreshold))}
            title={`|correlation| cutoff, ${SECTOR_CORR_MIN}–${SECTOR_CORR_MAX}`}
            className="center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center"
          />
          <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCorrThresholdInput(String(stepCorr(corrThreshold, CORR_STEP)))}
              className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Increase correlation threshold"
            >
              ▲
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCorrThresholdInput(String(stepCorr(corrThreshold, -CORR_STEP)))}
              className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
              aria-label="Decrease correlation threshold"
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      <div className={`${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.region.group}`}>
        <ToggleGroup role="region" toggles={regions} />
      </div>

      {selectsSlot != null && (
        <div className={`${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.select.group}`}>{selectsSlot}</div>
      )}

      {strategySlot}

      <div className="flex-1" />

      {sortSlot != null && (
        <div className={`ml-auto ${FILTER_GROUP_BASE} ${FILTER_GROUP_TONES.sort.group}`}>{sortSlot}</div>
      )}

      {trailingSlot}

      {zapSlot}
    </div>
  );
}
