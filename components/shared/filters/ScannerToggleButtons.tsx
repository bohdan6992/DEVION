"use client";

import React from "react";
import clsx from "clsx";

/**
 * The RATE and STATS on/off buttons of the scanner toolbar, ONE copy for every scanner (the operator's own
 * instruction, 2026-11-22: the same MARKET / RATE / STATS buttons everywhere). Look = the OPG Reversal
 * scanner's: a solid coloured pill while on, a gray `bg-black/20` pill while off, the word never changes.
 *
 * RATE off = "UNIVERSE": the ratings are dropped and the flat floor/cap alone gates (the same
 * `ignoreRatings` escape hatch the Sonars drive). The prop is therefore `ignoreRatings`, not `on`.
 *
 * STATS hides the sigma / alpha / gamma min-max boxes AND stops them filtering - see useStatsToggle.
 */
const BASE =
  "flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase tracking-wide leading-none transition-all";
const OFF = "bg-black/20 text-zinc-400 hover:bg-white/5 hover:text-white";

export function ScannerRateButton({
  ignoreRatings,
  onToggle,
}: {
  ignoreRatings: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!ignoreRatings}
      title={
        ignoreRatings
          ? "RATE off (UNIVERSE) — ratings dropped: gate on the flat floor/cap alone, ignoring the ticker's own published gamma and MINRATE/MINTOTAL/MinGammaTotal. Click to apply ratings again."
          : "RATE on — ratings applied: gate on the flat floor/cap AND the ticker's own published gamma, MINRATE/MINTOTAL/MinGammaTotal enforced. Click to drop ratings (UNIVERSE)."
      }
      className={clsx(BASE, ignoreRatings ? OFF : "bg-amber-500 text-black shadow-[0_0_16px_rgba(245,158,11,0.36)]")}
    >
      RATE
    </button>
  );
}

export function ScannerStatsButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? "STATS on — the σ / α / γ min-max boxes are shown and applied: floors/ceilings on the ticker's published static sigma, alpha, and the gamma level a row cleared. Click to hide them: the boxes disappear AND stop filtering (your values are kept and come back)."
          : "STATS off — the σ / α / γ boxes are hidden and nothing is filtered by them. Click to bring them back with your last values."
      }
      className={clsx(BASE, on ? "bg-sky-500 text-black shadow-[0_0_16px_rgba(14,165,233,0.36)]" : OFF)}
    >
      STATS
    </button>
  );
}

/**
 * State behind the STATS button. The min/max values feed the request, the client filter, the optimizer
 * and the scope view from many places, so "hidden" is done the one way that is safe everywhere: switching
 * OFF parks the values in a stash and CLEARS them (an empty box filters nothing, wherever it is read);
 * switching ON puts them back. A hidden box can therefore never be rejecting rows. If something sets a
 * value while the group is off (a preset, an optimizer result) the group switches itself back ON - the
 * filter that just arrived is shown, not applied in the dark.
 */
export function useStatsToggle(
  values: Record<string, string>,
  setters: Record<string, (v: string) => void>
) {
  const [statsOn, setStatsOn] = React.useState(true);
  const stash = React.useRef<Record<string, string>>({});
  const keys = Object.keys(values);
  const toggleStats = () => {
    if (statsOn) {
      stash.current = { ...values };
      for (const k of keys) setters[k]("");
      setStatsOn(false);
    } else {
      for (const k of keys) if (!values[k] && stash.current[k]) setters[k](stash.current[k]);
      stash.current = {};
      setStatsOn(true);
    }
  };
  const sig = keys.map((k) => String(values[k] ?? "")).join("\u0001");
  React.useEffect(() => {
    if (!statsOn && keys.some((k) => String(values[k] ?? "").trim() !== "")) setStatsOn(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsOn, sig]);
  return { statsOn, toggleStats };
}
