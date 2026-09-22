/**
 * The α min/max box, as the other Scout pages keep their ranges (lib/scout/ranges.ts): raw TEXT in
 * the UI state so mid-typing values survive, parsed to numbers only when the compute params are
 * built. Reversal has only an ALPHA range box (no ρ/β — it has no benchmark pairing); the published
 * per-ticker sigma (v2) is parsed and available on ReversalTicker but has no range box of its own yet.
 */

import type { ReversalBound, ReversalRanges } from "./types";

export type RangeKey = "alpha";
export type RangeText = Record<RangeKey, { min: string; max: string }>;

export const RANGE_KEYS: readonly RangeKey[] = ["alpha"];

export const EMPTY_RANGE_TEXT: RangeText = { alpha: { min: "", max: "" } };

export function parseBoundText(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseRanges(t: RangeText): ReversalRanges {
  return { alpha: { min: parseBoundText(t.alpha.min), max: parseBoundText(t.alpha.max) } as ReversalBound };
}

export function loadRangeText(raw: unknown): RangeText {
  const out: RangeText = { alpha: { min: "", max: "" } };
  if (!raw || typeof raw !== "object") return out;
  const b = (raw as Record<string, unknown>).alpha as { min?: unknown; max?: unknown } | undefined;
  if (b && typeof b.min === "string") out.alpha.min = b.min;
  if (b && typeof b.max === "string") out.alpha.max = b.max;
  return out;
}
