"use client";

import clsx from "clsx";
import { clampNumber } from "../../../../lib/scanner/format";
import { FILTER_GROUP_BASE, FILTER_GROUP_TONES, FILTER_PILL } from "../../../shared/filters/styles";

/** Which reading the band measures. Mirrors Arbitrage's % ZAP / σ ZAP pair. */
export type FadeMetric = "sigma" | "pct";

export type SigmaDevBandProps = {
  metric: FadeMetric;
  setMetric: (v: FadeMetric) => void;
  /** Lower bound on |sigma|. A ticker under it is not traded at all. */
  minAbs: number;
  setMinAbs: (v: number) => void;
  /** Upper bound. null means unbounded — an empty field, not a zero. */
  maxAbs: number | null;
  setMaxAbs: (v: number | null) => void;
};

/**
 * OpenFade's entire selection rule in one control: which reading to measure (sigmas or raw zap
 * percent, the same pair Arbitrage switches with % ZAP / σ ZAP) and the band that reading must fall
 * inside. The SIGN then picks the side — negative fades up (buy), positive fades down (sell) — so
 * the band itself is about magnitude only.
 *
 * The step stays 0.1 for both readings even though a percent moves on a different scale than a
 * sigma; the field takes any typed value, and forcing two step sizes here would be guessing at how
 * the desk thinks in each unit.
 *
 * It lives in its own file because it is rendered in the sort row of both the Scanner and the
 * Sonar, next to the sort select. It started inside OpenDoorGatesRow, which put it in the ratings
 * row where nothing else applies to OpenFade.
 *
 * Styling is the ZAP group's, imported rather than copied, so a change to the toolbar's look moves
 * this with it.
 */
export default function SigmaDevBand({ metric, setMetric, minAbs, setMinAbs, maxAbs, setMaxAbs }: SigmaDevBandProps) {
  const spinner = (up: () => void, down: () => void, upLabel: string, downLabel: string) => (
    <div className="absolute right-[1px] top-[1px] bottom-[1px] w-4 border-l border-white/10 bg-transparent flex flex-col overflow-hidden rounded-r-[5px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={up}
        className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label={upLabel}
      >
        ▲
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={down}
        className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
        aria-label={downLabel}
      >
        ▼
      </button>
    </div>
  );

  const INPUT =
    "center-spin w-full h-7 bg-black/20 border-0 rounded-md !pl-2 !pr-5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-0 focus:bg-black/30 transition-all active:scale-[0.99] font-mono tabular-nums text-center";

  return (
    <div className={clsx(FILTER_GROUP_BASE, FILTER_GROUP_TONES.zap.group)}>
      {([
        { key: "pct" as FadeMetric, label: "% DEV", title: "Deviation as a raw zap percentage (ZapPct)" },
        { key: "sigma" as FadeMetric, label: "σ DEV", title: "Deviation in sigmas (SigmaZap)" },
      ]).map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setMetric(m.key)}
          title={`${m.title}. Negative buys, positive sells; only |value| inside the band trades.`}
          className={clsx(
            FILTER_PILL,
            "gap-1",
            metric === m.key ? FILTER_GROUP_TONES.zap.on : FILTER_GROUP_TONES.zap.off
          )}
        >
          <span className="leading-none" style={{ textTransform: "none" }}>{m.label}</span>
        </button>
      ))}

      <div className="group relative w-[78px]">
        <input
          type="number"
          step={0.1}
          min={0}
          value={minAbs ?? 0}
          onChange={(e) => setMinAbs(Math.max(0, clampNumber(e.target.value, 0)))}
          placeholder="min"
          className={INPUT}
        />
        {spinner(
          () => setMinAbs(Math.max(0, +((minAbs ?? 0) + 0.1).toFixed(4))),
          () => setMinAbs(Math.max(0, +((minAbs ?? 0) - 0.1).toFixed(4))),
          "Increase min sigma",
          "Decrease min sigma"
        )}
      </div>

      <div className="group relative w-[78px]">
        <input
          type="number"
          step={0.1}
          min={0}
          value={maxAbs ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            setMaxAbs(raw === "" ? null : Math.max(0, clampNumber(raw, 0)));
          }}
          placeholder="max"
          className={INPUT}
        />
        {spinner(
          () => setMaxAbs(Math.max(0, +((maxAbs ?? 0) + 0.1).toFixed(4))),
          // Stepping below 0.1 clears the field rather than pinning it to zero: empty means "no
          // upper bound", while zero would reject every ticker.
          () => setMaxAbs(maxAbs == null || maxAbs <= 0.1 ? null : +(maxAbs - 0.1).toFixed(4)),
          "Increase max sigma",
          "Decrease max sigma"
        )}
      </div>

    </div>
  );
}
