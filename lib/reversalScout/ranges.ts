/**
 * The α/σ min/max boxes, as the other Scout pages keep their ranges (lib/scout/ranges.ts): raw TEXT
 * in the UI state so mid-typing values survive, parsed to numbers only when the compute params are
 * built. Reversal has no ρ/β (no benchmark pairing) — α (sign-matched modal reading) and σ (the
 * published per-ticker static dispersion) are the two it does have.
 */

import type { ReversalBound, ReversalRanges } from "./types";

export type RangeKey = "alpha" | "sigma";
export type RangeText = Record<RangeKey, { min: string; max: string }>;

export const RANGE_KEYS: readonly RangeKey[] = ["alpha", "sigma"];

export const EMPTY_RANGE_TEXT: RangeText = { alpha: { min: "", max: "" }, sigma: { min: "", max: "" } };

export function parseBoundText(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseRanges(t: RangeText): ReversalRanges {
  return {
    alpha: { min: parseBoundText(t.alpha.min), max: parseBoundText(t.alpha.max) } as ReversalBound,
    sigma: { min: parseBoundText(t.sigma.min), max: parseBoundText(t.sigma.max) } as ReversalBound,
  };
}

export function loadRangeText(raw: unknown): RangeText {
  const out: RangeText = { alpha: { min: "", max: "" }, sigma: { min: "", max: "" } };
  if (!raw || typeof raw !== "object") return out;
  for (const k of RANGE_KEYS) {
    const b = (raw as Record<string, unknown>)[k] as { min?: unknown; max?: unknown } | undefined;
    if (b && typeof b.min === "string") out[k].min = b.min;
    if (b && typeof b.max === "string") out[k].max = b.max;
  }
  return out;
}
