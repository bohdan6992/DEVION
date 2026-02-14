"use client";

import React from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1, ZapMode } from "@/lib/filters/arbitrageFilterConfigV1";

export default function ZapPanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const zap = cfg.zap ?? { mode: "off" as ZapMode, thresholdAbs: 0.3 };
  const isActive = zap.mode !== "off";

  return (
    <div className={clsx(
      "bg-neutral-900/40 border rounded-xl p-3 space-y-4 transition-all hover:border-neutral-700",
      isActive ? "border-amber-500/30" : "border-neutral-800"
    )}>
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-amber-500 uppercase tracking-[0.2em]">
            Zap / Sigma Trigger
          </div>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
        </div>
        <div className="text-[9px] font-mono text-neutral-600 uppercase tracking-tighter">
          Engine_v1.0
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* MODE SELECTOR */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight">
            Detection Mode
          </label>
          <div className="relative">
            <select
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 outline-none focus:border-amber-500/50 appearance-none cursor-pointer"
              value={zap.mode}
              onChange={(e) => setCfg({ ...cfg, zap: { ...zap, mode: e.target.value as ZapMode } })}
            >
              <option value="off">MODE_DISABLED</option>
              <option value="zap">ZAP_VOLATILITY</option>
              <option value="sigma">SIGMA_DEVIATION</option>
            </select>
            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-neutral-600">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1L5 5L9 1" />
              </svg>
            </div>
          </div>
        </div>

        {/* THRESHOLD INPUT */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight flex justify-between">
            Threshold Abs
            <span className="text-amber-500/50 font-mono">{(zap.thresholdAbs ?? 0).toFixed(2)}</span>
          </label>
          <div className="relative">
            <input
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-700 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              step="any"
              value={zap.thresholdAbs ?? 0.3}
              onChange={(e) => {
                const v = e.target.value === "" ? undefined : Number(e.target.value);
                setCfg({ ...cfg, zap: { ...zap, thresholdAbs: v } });
              }}
              placeholder="0.30"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-neutral-700 pointer-events-none font-mono">
              VAL
            </div>
          </div>
        </div>
      </div>

      {/* WARNINGS & INFO */}
      <div className="pt-2 border-t border-neutral-800/50 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-mono text-[10px] select-none">&gt;</span>
          <div className="text-[9px] font-mono text-neutral-600 leading-tight">
            Safety clamps: zap <span className="text-neutral-400">≥ 0.3</span>, sigma <span className="text-neutral-400">≥ 0.05</span>
          </div>
        </div>
        {isActive && (
          <div className="text-[8px] font-mono text-amber-500/40 uppercase tracking-widest pl-3 italic">
            // WARNING: strict_mode_active. results_may_drop
          </div>
        )}
      </div>
    </div>
  );
}