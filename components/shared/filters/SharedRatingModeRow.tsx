"use client";

import React from "react";
import clsx from "clsx";
import { ratePctFromFraction, ratePctToFraction } from "../../../lib/scanner/format";

/**
 * The Scanner's rating row, as ONE component: RATE/UNIVERSE, the ASOF/EXPO/LIVE radio, the
 * ❄/CORE/NORM switches beside it, and the MINRATE/MINTOTAL steppers.
 *
 * It is the row that drifted worst. The Scanner had it inline, the Sonar had a second copy with
 * hand-rolled steppers, Scout had neither the mode radio nor the switches, Spectr had a third
 * variant — four answers to one question, and the operator had to point at screenshots twice before
 * it was obvious they were four. One component, so "the same row" is a fact rather than a habit.
 *
 * TWO CAPSULES, not one, and that is load-bearing: ASOF/EXPO/LIVE is a single exclusive choice,
 * while ❄, CORE and NORM/NRRW are independent switches. They get a ring-and-tint "on" instead of
 * the radio's solid fill, so "LIVE + CORE + NRRW lit at once" reads as three answers to three
 * questions rather than a broken radio group.
 *
 * MINRATE is shown as a PERCENT and held as a FRACTION — the single conversion pair in
 * lib/scanner/format.ts, so no surface invents a second one.
 */

export type RatingTableMode = "asof" | "asofew" | "live";
export type OutcomeRule = "norm" | "narrow";

export type SharedRatingModeRowProps = {
  ratingsIgnored: boolean;
  setRatingsIgnored: (next: boolean) => void;

  ratingMode: RatingTableMode;
  setRatingMode: (next: RatingTableMode) => void;

  frozen: boolean;
  setFrozen: (next: boolean) => void;
  coreOnly: boolean;
  setCoreOnly: (next: boolean) => void;
  outcomeRule: OutcomeRule;
  setOutcomeRule: (next: OutcomeRule) => void;

  /** Held as a fraction (0..1); rendered as a percent. */
  minRate: number;
  setMinRate: (next: number) => void;
  minTotal: number;
  setMinTotal: (next: number) => void;

  /**
   * Set on a surface that has no per-day replay — a reference table over a published file. The
   * three switches then say so in their tooltips instead of describing a behaviour they do not
   * have. They still render: the operator asked for this row to be the Scanner's, control for
   * control.
   */
  switchesInert?: boolean;
  /**
   * Set on a strategy whose bridge publishes no ASOF/EXPO rebuild - the OPG family and CLO do
   * not. The radio still renders (the operator asked for the Scanner's row, control for
   * control) and still selects, but every mode reads the one published table, and the tooltips
   * say so rather than describing a cut that is not there.
   */
  modesInert?: boolean;

  /** The surface's own left-hand group (OPTIMIZER / SCOPE / SNAPSHOT on the Scanner). */
  leftSlot?: React.ReactNode;
  /** The ρ/β/σ (or σ/α/γ) range boxes — these genuinely differ per strategy. */
  rangesSlot?: React.ReactNode;
};

const CAPSULE = "flex h-7 items-center gap-2 rounded-lg bg-black/20";
const PILL = "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border";
const SPIN_WRAP =
  "absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity";
const SPIN_BTN = "flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors";
const NUM =
  "center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]";

const MODES = [
  { key: "asof", label: "ASOF", tone: "text-[#6ee7b7]/80 hover:text-[#6ee7b7]",
    title: "AS-OF — the rating rebuilt from the trade log, cut before each day, so nothing a day could not have known reaches it." },
  { key: "asofew", label: "EXPO", tone: "text-violet-300/80 hover:text-violet-200",
    title: "AS-OF exponential — the same rebuild, weighted toward the newest sessions." },
  { key: "live", label: "LIVE", tone: "text-[#f3a6b2]/80 hover:text-[#f3a6b2]",
    title: "LIVE — today's published best_params rating." },
] as const;

function Stepper({
  label, title, value, onChange, step, min, max, integer, dimmed,
}: {
  label: string; title: string; value: number; onChange: (n: number) => void;
  step: number; min: number; max?: number; integer?: boolean; dimmed?: boolean;
}) {
  const bump = (d: number) => {
    const next = value + d;
    onChange(integer ? Math.max(min, Math.trunc(next)) : Math.max(min, +next.toFixed(4)));
  };
  return (
    <div className={clsx("flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45 transition-opacity", dimmed && "opacity-40")} title={title}>
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{label}</span>
      <div className="group relative h-7 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : min);
          }}
          className={NUM}
          aria-label={label.toLowerCase()}
        />
        <div className={SPIN_WRAP}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(step)} className={SPIN_BTN} aria-label={`Increase ${label}`}>▲</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-step)} className={clsx(SPIN_BTN, "border-t border-white/5")} aria-label={`Decrease ${label}`}>▼</button>
        </div>
      </div>
    </div>
  );
}

export default function SharedRatingModeRow({
  ratingsIgnored, setRatingsIgnored,
  ratingMode, setRatingMode,
  frozen, setFrozen, coreOnly, setCoreOnly, outcomeRule, setOutcomeRule,
  minRate, setMinRate, minTotal, setMinTotal,
  switchesInert = false,
  modesInert = false,
  leftSlot, rangesSlot,
}: SharedRatingModeRowProps) {
  const modeNote = modesInert
    ? " This strategy publishes only one rating table, so every mode here reads that same one."
    : "";
  const inertNote = switchesInert
    ? " This page is a reference table over the published file, with no per-day replay to apply it to, so it holds its state here."
    : "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {leftSlot}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setRatingsIgnored(!ratingsIgnored)}
          title={ratingsIgnored
            ? "UNIVERSE — ratings dropped: every ticker is eligible, ignoring MINRATE/MINTOTAL and the published rating gate entirely. Click to apply ratings again."
            : "RATE — ratings applied: MINRATE/MINTOTAL and the published rating gate are enforced. Click to drop ratings (UNIVERSE)."}
          className={clsx(
            "flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase tracking-wide leading-none transition-all",
            ratingsIgnored
              ? "bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.36)]"
              : "bg-amber-500 text-black shadow-[0_0_16px_rgba(245,158,11,0.36)]"
          )}
        >
          {ratingsIgnored ? "UNIVERSE" : "RATE"}
        </button>

        <div className={CAPSULE}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              title={m.title + modeNote}
              onClick={() => setRatingMode(m.key)}
              className={clsx(PILL, ratingMode === m.key ? "accent-soft" : clsx("border-transparent hover:bg-white/5", m.tone))}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* The second capsule — see this file's own header for why it is not a continuation. */}
        <div className={CAPSULE}>
          <button
            type="button"
            onClick={() => setFrozen(!frozen)}
            title={(frozen
              ? "FROZEN on — every day is judged as of ITSELF. LIVE reads the snapshot taken that morning; ASOF and EXPO cut the trade log at each day. Click for one table over the whole range."
              : "FROZEN off — one table for the whole range. Click to measure each day as of itself.") + inertNote}
            className={clsx("px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold leading-none transition-all border",
              frozen ? "border-sky-400/70 bg-sky-500/15 text-sky-200" : "border-transparent text-sky-300/70 hover:text-sky-200 hover:bg-white/5")}
            aria-label="Frozen: judge each day as of itself"
          >
            ❄
          </button>
          <button
            type="button"
            onClick={() => setCoreOnly(!coreOnly)}
            title={(coreOnly
              ? "CORE on — only the consistently-good tickers, rebuilt as of each day. NOTE: measured on OPG this list showed NO edge (per-ticker persistence corr +0.006); the stability is real, the edge is not."
              : "CORE off — every ticker the rating mode admits. Click to restrict to the consistently-good list.") + inertNote}
            className={clsx(PILL,
              coreOnly ? "border-amber-400/70 bg-amber-500/15 text-amber-200" : "border-transparent text-amber-300/80 hover:text-amber-200 hover:bg-white/5")}
          >
            CORE
          </button>
          <button
            type="button"
            onClick={() => setOutcomeRule(outcomeRule === "norm" ? "narrow" : "norm")}
            title={(outcomeRule === "narrow"
              ? "NRRW — a situation counts as successful when the deviation at the class close is SMALLER than at entry. Not in best_params, so it is computed from the trade log. Click for the published rule."
              : "NORM — the published rule: (hard + soft) / total, i.e. the event had to normalise. Click to score on whether the deviation simply came in by the close.") + inertNote}
            className={clsx(PILL,
              outcomeRule === "narrow" ? "border-lime-400/70 bg-lime-500/15 text-lime-200" : "border-transparent text-lime-300/80 hover:text-lime-200 hover:bg-white/5")}
          >
            {outcomeRule === "narrow" ? "NRRW" : "NORM"}
          </button>
        </div>

        <Stepper
          label="MINRATE"
          title="Floor on the matched (class, sign) cell's own published win rate. 0 = off."
          value={ratePctFromFraction(minRate)}
          onChange={(v) => setMinRate(ratePctToFraction(String(v)))}
          step={5}
          min={0}
          max={100}
          dimmed={ratingsIgnored}
        />
        <Stepper
          label="MINTOTAL"
          title="How many situations that rate has to rest on. 0 = off."
          value={minTotal}
          onChange={setMinTotal}
          step={1}
          min={0}
          integer
          dimmed={ratingsIgnored}
        />

        {rangesSlot}
      </div>
    </div>
  );
}
