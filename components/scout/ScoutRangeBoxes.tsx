"use client";

import React from "react";
import { FilterRangeBoxes, type FilterRangeField } from "../shared/filters/FilterRatingRow";
import type { RangeKey, RangeText } from "../../lib/scout/ranges";

/**
 * ρ / β / σ / α min-max boxes of the Scout toolbar — the very boxes the Scanner draws after
 * MINRATE / MINTOTAL (`FilterRangeBoxes`), fed from the Scout's own range text state.
 */
export default function ScoutRangeBoxes({
  value,
  onChange,
  titles,
}: {
  value: RangeText;
  onChange: (next: RangeText) => void;
  /** Tooltip per box: what the number IS on this page (a ticker's, or a pair's). */
  titles: Record<RangeKey, string>;
}) {
  const set = (k: RangeKey, end: "min" | "max", v: string) => onChange({ ...value, [k]: { ...value[k], [end]: v } });
  const field = (k: RangeKey, label: string, step: number): FilterRangeField => ({
    label,
    title: titles[k],
    minValue: value[k].min,
    maxValue: value[k].max,
    setMin: (v) => set(k, "min", v),
    setMax: (v) => set(k, "max", v),
    step,
  });
  return <FilterRangeBoxes ranges={[field("corr", "ρ", 0.05), field("beta", "β", 0.1), field("sigma", "σ", 0.1), field("alpha", "α", 0.1)]} />;
}
