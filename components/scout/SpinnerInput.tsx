"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";

/**
 * The numeric control from the Arbitrage Scanner / Sonar header — one shared pill for label + value,
 * arrows only on hover/focus, native spinners hidden (see AGENTS.md "Spinner Input Standard").
 *
 * The markup is the scanner's MINRATE / MINTOTAL block 1-to-1; the scanner has it inline several
 * times over and `FilterRatingRow`'s copy is module-private, so this is the reusable extraction.
 * Needs the `center-spin` rule from `ScannerTableStyles` on the page.
 *
 * The field keeps its own text while you type (so "0." and an empty box are legal mid-edit) and only
 * pushes a number up when the text parses; the arrows and outside changes rewrite the text.
 */
export type SpinnerInputProps = {
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Rounding for the arrows, so 0.1 + 0.2 does not become 0.30000000000000004. */
  decimals?: number;
  title?: string;
  /** Tailwind width of the input part; the scanner uses w-14. */
  widthClass?: string;
  ariaLabel?: string;
};

export default function SpinnerInput({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  decimals = 2,
  title,
  widthClass = "w-14",
  ariaLabel,
}: SpinnerInputProps) {
  const [text, setText] = useState(String(value));

  // An outside change (mode switch, restore, arrows) rewrites the text; typing does not, because
  // Number(text) === value already holds then.
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const onType = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n));
  };

  const bump = (dir: 1 | -1) => {
    const next = clamp(+((Number.isFinite(value) ? value : 0) + dir * step).toFixed(decimals + 2));
    setText(String(next));
    onChange(next);
  };

  return (
    <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45" title={title}>
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{label}</span>
      <div className={clsx("group relative h-7 overflow-hidden rounded-md", widthClass)}>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          aria-label={ariaLabel}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => setText(String(value))}
          className="center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99] accent-text"
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => bump(1)}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={`Increase ${ariaLabel ?? "value"}`}
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => bump(-1)}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={`Decrease ${ariaLabel ?? "value"}`}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
