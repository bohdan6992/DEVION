"use client";

import React from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1, ReportMode } from "@/lib/filters/arbitrageFilterConfigV1";

export default function ReportEquityPanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const mode: ReportMode = (cfg.report?.hasReport ?? "ALL") as any;
  const equityType = cfg.equityType ?? "";

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 space-y-4 transition-all hover:border-neutral-700">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          Corporate & Asset Metadata
        </div>
        <div className="flex gap-2">
           <span className={clsx(
             "text-[8px] px-1.5 py-0.5 rounded border font-mono",
             mode !== "ALL" ? "border-amber-500/50 text-amber-500 bg-amber-500/5" : "border-neutral-800 text-neutral-600"
           )}>
             REP: {mode}
           </span>
           {equityType && (
             <span className="text-[8px] px-1.5 py-0.5 rounded border border-emerald-500/50 text-emerald-500 bg-emerald-500/5 font-mono">
               EQT: MATCH
             </span>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* REPORT SELECTOR */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight">
            Earnings Report Presence
          </label>
          <div className="relative">
            <select
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              value={mode}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  report: { ...cfg.report, hasReport: e.target.value as ReportMode },
                })
              }
            >
              <option value="ALL">LOG_ALL_REPORTS</option>
              <option value="YES">FILTER_ONLY_YES</option>
              <option value="NO">FILTER_ONLY_NO</option>
            </select>
            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-neutral-600">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1L5 5L9 1" />
              </svg>
            </div>
          </div>
        </div>

        {/* EQUITY TYPE INPUT */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight flex justify-between">
            Equity Type Substring
            {equityType && <span className="text-emerald-500">{"// active"}</span>}
          </label>
          <div className="relative group">
            <input
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/50 placeholder:text-neutral-700 transition-colors"
              value={equityType}
              onChange={(e) => setCfg({ ...cfg, equityType: e.target.value })}
              placeholder="E.G. ADR, COMMON..."
              spellCheck={false}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER LOG */}
      <div className="pt-1">
        <div className="text-[9px] font-mono text-neutral-600 leading-tight flex items-center gap-2">
          <span className="w-1 h-1 bg-neutral-700 rounded-full" />
          {equityType 
            ? `Search logic: grep -i "${equityType}" assets.db`
            : "Search logic: match_all_assets"}
        </div>
      </div>
    </div>
  );
}