"use client";

import React from "react";
import { FilterRangeBoxes, type FilterRangeField } from "../shared/filters/FilterRatingRow";
import type { RangeKey, RangeText } from "../../lib/stretchFadeScout/ranges";

/** The α + σ min-max boxes — the two ranges STRETCH-FADE actually has (it has no ρ/β). */
export default function StretchFadeRangeBox({
  value,
  onChange,
  titles,
}: {
  value: RangeText;
  onChange: (next: RangeText) => void;
  /** Tooltip per box: what the number IS on this page. */
  titles: Record<RangeKey, string>;
}) {
  const set = (k: RangeKey, end: "min" | "max", v: string) => onChange({ ...value, [k]: { ...value[k], [end]: v } });
  const field = (k: RangeKey, label: string): FilterRangeField => ({
    label,
    title: titles[k],
    minValue: value[k].min,
    maxValue: value[k].max,
    setMin: (v) => set(k, "min", v),
    setMax: (v) => set(k, "max", v),
    step: 0.1,
  });
  return <FilterRangeBoxes ranges={[field("alpha", "α"), field("sigma", "σ")]} />;
}
