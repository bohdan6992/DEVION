"use client";

import React from "react";
import clsx from "clsx";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "./styles";

/**
 * The Scanner's CLASS row, as ONE component: the class pills, ALL/TOP, ANY/HARD/SOFT, whatever the
 * surface pins to the right (the compact PRESET/SAVE/DEL group), and the grey summary line under
 * them — all inside the Scanner's own control card.
 *
 * Same reason `SharedRatingModeRow` exists, and the same history: Scout had one copy per strategy,
 * Spectr had a hand-rolled variant of its own, and the operator had to point at screenshots to show
 * they had drifted. With one component, "Scout and Spectr have the same header" is a fact about the
 * code rather than a claim about two files that happen to look alike today.
 *
 * WHAT STAYS OUT. Only the Scanner's own controls belong in this row. A surface's private controls
 * (SIDE, WINDOW, SORT, DAILY/TRADE, SEARCH) go on their own line BELOW it — the operator's explicit
 * instruction, and the reason this row can be shared at all.
 *
 * THE SUMMARY LINE is `infoSlot`, and it is rendered only when the caller passes something. As an
 * always-present wrapper it would be an EMPTY flex child before the data loads, and the card's own
 * `gap-3` still reserves that space — which reads as a larger bottom padding than top (see
 * scripts/lib/no-phantom-gap.mjs, which exists because of exactly this bug).
 */

export type ScopeMode = "ALL" | "TOP";
export type OutcomeType = "any" | "hard" | "soft";

export type SharedClassRowProps<K extends string> = {
  classes: ReadonlyArray<{ key: K; label: string; title?: string }>;
  cls: K;
  setCls: (next: K) => void;

  scopeMode: ScopeMode;
  setScopeMode: (next: ScopeMode) => void;
  /** Only used in TOP's tooltip, so the row can say how many "the best N" is. */
  topN?: number;

  outcomeType: OutcomeType;
  setOutcomeType: (next: OutcomeType) => void;
  /**
   * Set on a strategy that publishes no hard/soft split (everything but Arbitrage scores plain
   * win/loss). The pills still render and still select — the operator asked for the Scanner's row,
   * control for control — but they say in their tooltips that they change nothing, instead of
   * describing a breakdown that is not in the file.
   */
  outcomeInert?: boolean;
  /**
   * Set where ALL/TOP has nothing to bound (a flat reference table that always shows every row).
   * Same treatment: it renders and selects, and says so.
   */
  scopeInert?: boolean;

  /** Pinned to the right edge of the row — in practice `SharedFilterPresetBar`. */
  rightSlot?: React.ReactNode;
  /** The grey one-line summary under the row. Omit it and nothing (not even a gap) is rendered. */
  infoSlot?: React.ReactNode;
};

const GROUP = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
const SEPARATOR = <div className="h-7 w-px self-center bg-white/5" />;

const OUTCOMES_REAL = [
  { key: "any", label: "ANY", title: "ANY - the published rule: (hard + soft) / total." },
  { key: "hard", label: "HARD", title: "HARD - MINTOTAL counts only the situations that hit the hard bar. The RATE is unchanged: per the bridge's own contract this type moves the TOTAL, never the rate." },
  { key: "soft", label: "SOFT", title: "SOFT - MINTOTAL counts only the situations that hit the soft bar. The RATE is unchanged." },
] as const;

const OUTCOMES_INERT = [
  { key: "any", label: "ANY", title: "ANY - every rated situation." },
  { key: "hard", label: "HARD", title: "HARD - the Arbitrage hard/soft split. This strategy scores win/loss and publishes no such breakdown, so this holds its state and changes nothing." },
  { key: "soft", label: "SOFT", title: "SOFT - the Arbitrage hard/soft split. Not published for this strategy; holds its state." },
] as const;

export default function SharedClassRow<K extends string>({
  classes, cls, setCls,
  scopeMode, setScopeMode, topN,
  outcomeType, setOutcomeType, outcomeInert, scopeInert,
  rightSlot, infoSlot,
}: SharedClassRowProps<K>) {
  const btn = (active: boolean) => clsx(TOOLBAR_BUTTON_BASE, active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE);
  const outcomes = outcomeInert ? OUTCOMES_INERT : OUTCOMES_REAL;

  return (
    <div className="scanner-control-surface flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
      <div className="flex flex-wrap items-center gap-3">
        <div className={GROUP}>
          {classes.map((c) => (
            <button key={c.key} type="button" onClick={() => setCls(c.key)} className={btn(cls === c.key)} title={c.title}>
              {c.label}
            </button>
          ))}
        </div>

        {SEPARATOR}

        {/* Scope, as on the Scanner: ALL is every ticker, TOP keeps the best N by the current sort.
            There it bounds what the bridge returns; on a table it bounds the table. */}
        <div className={GROUP}>
          {(["ALL", "TOP"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setScopeMode(m)}
              className={btn(scopeMode === m)}
              title={scopeInert
                ? "ALL/TOP - the Scanner's episode-ranking scope. A flat reference table has no ranking to cut, so this holds its state and shows every row."
                : m === "ALL" ? "Every ticker that passes the filters" : `Only the best ${topN ?? 100} by the current sort`}
            >
              {m}
            </button>
          ))}
        </div>

        {SEPARATOR}

        {/* RatingType. Its place on the Scanner is HERE, in the class row - beside the mode capsule
            above it would read as a fourth rating mode rather than a different question about the
            same one. */}
        <div className={GROUP}>
          {outcomes.map((rt) => (
            <button key={rt.key} type="button" title={rt.title} onClick={() => setOutcomeType(rt.key)} className={btn(outcomeType === rt.key)}>
              {rt.label}
            </button>
          ))}
        </div>

        {rightSlot && <div className="ml-auto flex flex-wrap items-center gap-3">{rightSlot}</div>}
      </div>

      {infoSlot && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-zinc-600">{infoSlot}</div>
      )}
    </div>
  );
}
