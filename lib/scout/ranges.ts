/**
 * The ρ/β/σ/α min/max boxes, as both Scout pages keep them: the raw TEXT of each box in the UI state
 * (so "-", "0." and a decimal comma survive mid-typing, and the value persists as typed), parsed to
 * numbers only when the compute params are built.
 */

import type { ScoutBound, ScoutRanges } from "./types";

export type RangeKey = keyof ScoutRanges;
export type RangeText = Record<RangeKey, { min: string; max: string }>;

export const RANGE_KEYS: readonly RangeKey[] = ["corr", "beta", "sigma", "alpha"];

export const EMPTY_RANGE_TEXT: RangeText = {
  corr: { min: "", max: "" },
  beta: { min: "", max: "" },
  sigma: { min: "", max: "" },
  alpha: { min: "", max: "" },
};

/** "" / garbage = not set. A decimal comma is accepted (Ukrainian layout). */
export function parseBoundText(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseRanges(t: RangeText): ScoutRanges {
  const one = (k: RangeKey): ScoutBound => ({ min: parseBoundText(t[k].min), max: parseBoundText(t[k].max) });
  return { corr: one("corr"), beta: one("beta"), sigma: one("sigma"), alpha: one("alpha") };
}

/** Whatever was stored, coerced to a well-formed RangeText (a missing or odd field becomes empty). */
export function loadRangeText(raw: unknown): RangeText {
  const out: RangeText = { corr: { min: "", max: "" }, beta: { min: "", max: "" }, sigma: { min: "", max: "" }, alpha: { min: "", max: "" } };
  if (!raw || typeof raw !== "object") return out;
  for (const k of RANGE_KEYS) {
    const b = (raw as Record<string, unknown>)[k] as { min?: unknown; max?: unknown } | undefined;
    if (b && typeof b.min === "string") out[k].min = b.min;
    if (b && typeof b.max === "string") out[k].max = b.max;
  }
  return out;
}
