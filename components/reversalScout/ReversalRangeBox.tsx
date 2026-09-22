"use client";

import React from "react";
import { FilterRangeBoxes, type FilterRangeField } from "../shared/filters/FilterRatingRow";
import type { RangeText } from "../../lib/reversalScout/ranges";

/** The α min-max box — the one range Reversal actually has (it has no ρ/β/σ). */
export default function ReversalRangeBox({
  value,
  onChange,
  title,
}: {
  value: RangeText;
  onChange: (next: RangeText) => void;
  title: string;
}) {
  const field: FilterRangeField = {
    label: "α",
    title,
    minValue: value.alpha.min,
    maxValue: value.alpha.max,
    setMin: (v) => onChange({ alpha: { ...value.alpha, min: v } }),
    setMax: (v) => onChange({ alpha: { ...value.alpha, max: v } }),
    step: 0.1,
  };
  return <FilterRangeBoxes ranges={[field]} />;
}
