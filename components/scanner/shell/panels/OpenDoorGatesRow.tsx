import clsx from "clsx";
import React from "react";

import { clampInt, clampNumber } from "../../../../lib/scanner/format";

/**
 * OpenDoor's entry gates: the STACK / BENCH / DEV parameter toggles and the
 * MINRATE / MINTOTAL / MINMOVE thresholds.
 *
 * Extracted because the Scanner and the Sonar each had their own copy of this markup and had
 * already drifted apart: the Sonar still rendered the thresholds as two rows (UP and DOWN) after the
 * Scanner had merged them into one, and the two used different active-button classes. A control
 * added to one simply did not appear in the other — which is the whole reason this file exists.
 *
 * The Stream needs no wiring of its own: it is rendered by the same component as the Scanner, above
 * the primaryPanel switch, so it picks this up for free.
 */
export type OpenDoorGatesRowProps = {
  useStack: boolean;
  setUseStack: React.Dispatch<React.SetStateAction<boolean>>;
  useBench: boolean;
  setUseBench: React.Dispatch<React.SetStateAction<boolean>>;
  useDevSig: boolean;
  setUseDevSig: React.Dispatch<React.SetStateAction<boolean>>;

  /**
   * Thresholds. ONE control drives both directions: the engine still gates long and short
   * independently and the request still carries the Up and Down values separately, but a single
   * input writes both. The displayed value is the Up state, so a stored layout where the two had
   * diverged re-syncs on the first edit.
   */
  upMinRate: number;
  setUpMinRate: (v: number) => void;
  downMinRate: number;
  setDownMinRate: (v: number) => void;
  upMinTotal: number;
  setUpMinTotal: (v: number) => void;
  downMinTotal: number;
  setDownMinTotal: (v: number) => void;
  upMinMove: number;
  setUpMinMove: (v: number) => void;
  downMinMove: number;
  setDownMinMove: (v: number) => void;

  /** Active-toggle style. The Sonar passes its own; the Scanner uses the accent default. */
  activeClassName?: string;
  /** The Sonar hides the parameter toggles in advanced mode. */
  showParamToggles?: boolean;
};

export default function OpenDoorGatesRow({
  useStack, setUseStack,
  useBench, setUseBench,
  useDevSig, setUseDevSig,
  upMinRate, setUpMinRate, downMinRate, setDownMinRate,
  upMinTotal, setUpMinTotal, downMinTotal, setDownMinTotal,
  upMinMove, setUpMinMove, downMinMove, setDownMinMove,
  activeClassName = "accent-soft",
  showParamToggles = true,
}: OpenDoorGatesRowProps) {
  const fields = [
    {
      label: "MINRATE", value: upMinRate, step: 0.1, integer: false,
      set: (v: number) => { setUpMinRate(v); setDownMinRate(v); },
    },
    {
      label: "MINTOTAL", value: upMinTotal, step: 1, integer: true,
      set: (v: number) => { setUpMinTotal(v); setDownMinTotal(v); },
    },
    {
      label: "MINMOVE", value: upMinMove, step: 0.05, integer: false,
      set: (v: number) => { setUpMinMove(v); setDownMinMove(v); },
    },
  ];

  return (
    <>
      {showParamToggles && (
        <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
          {[
            { key: "stack", label: "STACK", on: useStack, set: setUseStack },
            { key: "bench", label: "BENCH", on: useBench, set: setUseBench },
            { key: "dev", label: "DEV", on: useDevSig, set: setUseDevSig },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => p.set((v) => !v)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                p.on ? activeClassName : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {fields.map((field) => (
        <div key={field.label} className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/45">
          <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{field.label}</span>
          <div className="group relative h-7 w-14 overflow-hidden rounded-md">
            <input
              type="number"
              inputMode={field.integer ? "numeric" : "decimal"}
              step={field.step}
              min={0}
              value={field.value}
              onChange={(e) => field.set(Math.max(0, field.integer ? clampInt(e.target.value, 0) : clampNumber(e.target.value, 0)))}
              className={clsx("center-spin w-full h-7 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
            />
            <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => field.set(Math.max(0, +((field.value ?? 0) + field.step).toFixed(4)))}
                className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label={`Increase ${field.label}`}
              >
                ▲
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => field.set(Math.max(0, +((field.value ?? 0) - field.step).toFixed(4)))}
                className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label={`Decrease ${field.label}`}
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
