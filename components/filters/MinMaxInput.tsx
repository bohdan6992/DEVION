"use client";

import React from "react";
import type { MinMax } from "@/lib/filters/arbitrageFilterConfigV1";

export default function MinMaxInput({
  label,
  value,
  onChange,
  step,
  placeholderMin,
  placeholderMax,
}: {
  label: string;
  value?: MinMax;
  onChange: (v: MinMax) => void;
  step?: number;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  const min = value?.min ?? "";
  const max = value?.max ?? "";

  return (
    <div className="space-y-1 group">
      {/* Label зі стилістикою системного параметра */}
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-mono font-bold text-neutral-500 group-hover:text-emerald-500/80 transition-colors uppercase tracking-tight">
          {label}
        </label>
        {(min !== "" || max !== "") && (
          <span className="text-[8px] font-mono text-emerald-600 animate-pulse">● ACTIVE</span>
        )}
      </div>

      <div className="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded group-hover:border-neutral-700 transition-colors p-1">
        {/* MIN INPUT */}
        <input
          className="bg-transparent w-full px-1.5 py-0.5 text-xs font-mono text-neutral-200 focus:outline-none placeholder:text-neutral-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          type="number"
          step={step ?? "any"}
          placeholder={placeholderMin ?? "MIN"}
          value={min as any}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? undefined : Number(raw);
            onChange({ ...value, min: v });
          }}
        />

        {/* Слайдер-розділювач у стилі консолі */}
        <div className="text-neutral-700 font-mono text-[10px] px-1 select-none">
          :
        </div>

        {/* MAX INPUT */}
        <input
          className="bg-transparent w-full px-1.5 py-0.5 text-xs font-mono text-neutral-200 text-right focus:outline-none placeholder:text-neutral-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          type="number"
          step={step ?? "any"}
          placeholder={placeholderMax ?? "MAX"}
          value={max as any}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? undefined : Number(raw);
            onChange({ ...value, max: v });
          }}
        />
      </div>
    </div>
  );
}