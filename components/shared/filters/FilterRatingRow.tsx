"use client";

import React from "react";

/**
 * The rating row of the toolbar: the ACTIVE/INACTIVE/ALL position strip, then whatever mode
 * controls the strategy has, then the numeric gates (MINRATE/MINTOTAL) and the ρ/β/σ ranges.
 *
 * The middle is a SLOT because the strategies genuinely disagree there: Arbitrage shows
 * ALL/TOP with σ/MKT/TIME sub-toggles and SESSION/BIN/BINS, OpenDoor shows ADVANCED with
 * STACK/BENCH/DEV. Forcing one shape would have meant a conditional per strategy inside a
 * "shared" component, which is the thing worth avoiding. The strip and the steppers on either
 * side are byte-identical across surfaces and are what this owns.
 */

export type FilterActiveMode = "off" | "onlyActive" | "onlyInactive";

/** A single-value stepper: MINRATE, MINTOTAL. */
export type FilterNumField = {
  label: string;
  val: number;
  set: (next: number) => void;
  step: number;
  min: number;
  /** Absent means fractional — the Sonar's own NumField type leaves it optional. */
  integer?: boolean;
};

/** A min/max pair sharing one symbol: ρ, β, σ. Values stay strings so "-" mid-typing survives. */
export type FilterRangeField = {
  label: string;
  title: string;
  minValue: string;
  maxValue: string;
  setMin: (next: string) => void;
  setMax: (next: string) => void;
  step: number;
};

const SPINNER_WRAP =
  "absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity";
const SPINNER_BUTTON =
  "flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors";
const NUM_INPUT =
  "center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]";

function Spinner({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <div className={SPINNER_WRAP}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onUp} className={SPINNER_BUTTON}>
        ▲
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDown}
        className={`${SPINNER_BUTTON} border-t border-white/5`}
      >
        ▼
      </button>
    </div>
  );
}

function bump(field: FilterNumField, delta: number) {
  const next = field.val + delta;
  field.set(field.integer ? Math.max(field.min, Math.trunc(next)) : Math.max(field.min, +next.toFixed(4)));
}

function shift(current: string, delta: number): string {
  return String(+(((Number(normalizeDecimal(current)) || 0) + delta).toFixed(4)));
}

/**
 * A decimal comma is what a Ukrainian keyboard layout produces, and `type="number"` REJECTS it:
 * the browser leaves "0,7" visible in the box while `e.target.value` comes back "", so the state
 * stays empty and the range silently stops filtering while it looks set. These are text inputs
 * for that reason; the comma is folded to a dot here so every consumer still parses a dot form.
 */
function normalizeDecimal(raw: string): string {
  return raw.replace(",", ".");
}

export type FilterRatingRowProps = {
  activeMode: FilterActiveMode;
  setActiveMode: (next: FilterActiveMode) => void;
  /** Strip styling comes from the host so each surface keeps its accent. */
  stripClass: string;
  stripButtonBaseClass: string;
  stripButtonActiveClass: string;
  stripButtonInactiveClass: string;
  renderActiveIcon?: (kind: "active" | "inactive" | "all", on: boolean) => React.ReactNode;
  /** Strategy-specific mode controls, rendered between the strip and the steppers. */
  modeSlot?: React.ReactNode;
  steppers?: FilterNumField[];
  ranges?: FilterRangeField[];
};

export default function FilterRatingRow({
  activeMode,
  setActiveMode,
  stripClass,
  stripButtonBaseClass,
  stripButtonActiveClass,
  stripButtonInactiveClass,
  renderActiveIcon,
  modeSlot,
  steppers = [],
  ranges = [],
}: FilterRatingRowProps) {
  const strip: Array<{ mode: FilterActiveMode; label: string; kind: "active" | "inactive" | "all"; title: string }> = [
    { mode: "onlyActive", label: "ACTIVE", kind: "active", title: "Show only ACTIVE positions (PositionBp != 0)" },
    { mode: "onlyInactive", label: "INACTIVE", kind: "inactive", title: "Show only INACTIVE positions (PositionBp == 0)" },
    { mode: "off", label: "ALL", kind: "all", title: "Show ALL positions" },
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className={stripClass}>
        {strip.map((item) => {
          const on = activeMode === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => setActiveMode(item.mode)}
              className={[stripButtonBaseClass, on ? stripButtonActiveClass : stripButtonInactiveClass].join(" ")}
              title={item.title}
            >
              {renderActiveIcon?.(item.kind, on)}
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap justify-end gap-3">
        {modeSlot}

        {steppers.map((field) => (
          <div key={field.label} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45">
            <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
              {field.label}
            </span>
            <div className="group relative h-7 w-14 overflow-hidden rounded-md">
              <input
                type="number"
                inputMode={field.integer ? "numeric" : "decimal"}
                step={field.step}
                min={field.min}
                value={field.val}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) {
                    field.set(field.min);
                    return;
                  }
                  field.set(field.integer ? Math.max(field.min, Math.trunc(next)) : Math.max(field.min, +next.toFixed(4)));
                }}
                className={NUM_INPUT}
              />
              <Spinner onUp={() => bump(field, field.step)} onDown={() => bump(field, -field.step)} />
            </div>
          </div>
        ))}

        {ranges.map((field) => (
          <div
            key={field.title}
            className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45"
            title={field.title}
          >
            <span className="flex h-7 min-w-4 items-center justify-center text-[12px] font-mono text-zinc-500 leading-none">
              {field.label}
            </span>
            <div className="group relative h-7 w-14 overflow-hidden rounded-md">
              <input
                type="text"
                inputMode="decimal"
                value={field.minValue}
                onChange={(e) => field.setMin(normalizeDecimal(e.target.value))}
                className={NUM_INPUT}
                placeholder="min"
              />
              <Spinner
                onUp={() => field.setMin(shift(field.minValue, field.step))}
                onDown={() => field.setMin(shift(field.minValue, -field.step))}
              />
            </div>
            <div className="group relative h-7 w-14 overflow-hidden rounded-md">
              <input
                type="text"
                inputMode="decimal"
                value={field.maxValue}
                onChange={(e) => field.setMax(normalizeDecimal(e.target.value))}
                className={NUM_INPUT}
                placeholder="max"
              />
              <Spinner
                onUp={() => field.setMax(shift(field.maxValue, field.step))}
                onDown={() => field.setMax(shift(field.maxValue, -field.step))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
