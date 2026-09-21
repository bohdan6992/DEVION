"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { FILTER_GROUP_BASE, FILTER_GROUP_TONES, FILTER_PILL } from "../shared/filters/styles";

/**
 * The Scout's "what START / TO are measured in" control, in the look of the Scanner's ZAP row:
 * one violet group holding the unit pills (`%`, `σ`, … - symbols only, the tooltip names the unit) followed by two bare number boxes.
 *
 * The markup is the Scanner's `zapSlot` 1-to-1 (group = FILTER_GROUP_BASE + FILTER_GROUP_TONES.zap,
 * pills = FILTER_PILL + the zap on/off tones, inputs = `w-[78px]` `bg-black/20` boxes with the
 * hover-only arrow column). Two differences that come from the data, not from styling:
 *  - a unit is always selected (there is no "off" gate to drop back to), so pressing the lit pill
 *    does nothing;
 *  - the boxes carry no label, like the Scanner's; a bound of 0 means "no bound" and is shown as an
 *    empty box with the `start` / `to` placeholder, the way the Scanner shows an unset `start max`.
 * Needs the `center-spin` rule from `ScannerTableStyles` on the page.
 */
export type ScoutUnitOption<K extends string> = {
  key: K;
  label: string;
  title: string;
  /** Not available in the published data; the pill is dimmed and inert. */
  locked?: boolean;
};

type ZapNumberInputProps = {
  value: number;
  onChange: (v: number) => void;
  step: number;
  placeholder: string;
  title: string;
  ariaLabel: string;
};

const INPUT_CLASS =
  "center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center";
const ARROWS_CLASS =
  "absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity";

const show = (v: number) => (v === 0 ? "" : String(v));

function ZapNumberInput({ value, onChange, step, placeholder, title, ariaLabel }: ZapNumberInputProps) {
  const [text, setText] = useState(show(value));

  // An outside change (unit switch, restore, arrows) rewrites the text; typing does not, because
  // Number(text) === value already holds then.
  useEffect(() => {
    if (Number(text || 0) !== value) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onType = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") { onChange(0); return; }
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.max(0, n));
  };

  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, +((Number.isFinite(value) ? value : 0) + dir * step).toFixed(4));
    setText(show(next));
    onChange(next);
  };

  return (
    <div className="group relative w-[78px]" title={title}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setText(show(value))}
        className={INPUT_CLASS}
      />
      <div className={ARROWS_CLASS}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(1)}
          className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label={`Increase ${ariaLabel}`}
        >
          ▲
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-1)}
          className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
          aria-label={`Decrease ${ariaLabel}`}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export type ScoutUnitBarProps<K extends string> = {
  options: ScoutUnitOption<K>[];
  mode: K;
  onMode: (k: K) => void;
  start: number;
  to: number;
  onStart: (v: number) => void;
  onTo: (v: number) => void;
  step: number;
  /** Noun for the tooltips: "entries" (Arbitrage) or "episodes" (PairFlux). */
  subject: string;
  /** The current unit's own explanation, appended to the START tooltip. */
  unitHint: string;
};

export default function ScoutUnitBar<K extends string>({
  options, mode, onMode, start, to, onStart, onTo, step, subject, unitHint,
}: ScoutUnitBarProps<K>) {
  return (
    <div className={clsx(FILTER_GROUP_BASE, FILTER_GROUP_TONES.zap.group)} title="What START / TO are measured in">
      {options.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            disabled={o.locked}
            onClick={() => { if (!on) onMode(o.key); }}
            className={clsx(
              `${FILTER_PILL} gap-1`,
              on ? FILTER_GROUP_TONES.zap.on : FILTER_GROUP_TONES.zap.off,
              o.locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-violet-300/70",
            )}
            title={o.title}
          >
            <span className="leading-none" style={{ textTransform: "none" }}>{o.label}</span>
          </button>
        );
      })}
      <ZapNumberInput
        value={start}
        onChange={onStart}
        step={step}
        placeholder="start"
        ariaLabel="start"
        title={`Only ${subject} at least this large (${unitHint}). Empty / 0 = no lower bound.`}
      />
      <ZapNumberInput
        value={to}
        onChange={onTo}
        step={step}
        placeholder="to"
        ariaLabel="to"
        title={`Only ${subject} at most this large, in the same unit. Empty / 0 = no upper bound.`}
      />
    </div>
  );
}
