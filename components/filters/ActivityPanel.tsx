"use client";

import React from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1, ActiveMode } from "@/lib/filters/arbitrageFilterConfigV1";

export default function ActivityPanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const activity = cfg.activity ?? { mode: "off" as ActiveMode };
  const currentMode = activity.mode ?? "off";

  // Визначаємо колір індикатора залежно від режиму
  const getStatusColor = () => {
    switch (currentMode) {
      case "onlyActive": return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
      case "onlyInactive": return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]";
      default: return "bg-neutral-600";
    }
  };

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 space-y-3 transition-all hover:border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          Activity Monitor
        </div>
        <div className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", getStatusColor())} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight">
          Position BP Logic (≠ 0)
        </label>
        
        <div className="relative">
          <select
            className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
            value={currentMode}
            onChange={(e) =>
              setCfg({
                ...cfg,
                activity: { ...activity, mode: e.target.value as ActiveMode },
              })
            }
          >
            <option value="off">OFF (ALL_DATA)</option>
            <option value="onlyActive">ONLY_ACTIVE</option>
            <option value="onlyInactive">ONLY_INACTIVE</option>
          </select>
          
          {/* Кастомна стрілка для селекту */}
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-neutral-600">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1L5 5L9 1" />
            </svg>
          </div>
        </div>
      </div>

      <div className="text-[9px] font-mono text-neutral-600 italic">
        {currentMode === "off" && "> system: bypassing activity check"}
        {currentMode === "onlyActive" && "> system: filtering for active Bp"}
        {currentMode === "onlyInactive" && "> system: excluding active positions"}
      </div>
    </div>
  );
}