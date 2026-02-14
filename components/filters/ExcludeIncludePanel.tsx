"use client";

import React from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1 } from "@/lib/filters/arbitrageFilterConfigV1";

export default function ExcludeIncludePanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const ex = cfg.exclude ?? {};
  const inc = cfg.include ?? {};

  function setExclude(key: keyof NonNullable<ArbitrageFilterConfigV1["exclude"]>, v: boolean) {
    setCfg({ ...cfg, exclude: { ...ex, [key]: v } });
  }

  function setInclude(key: keyof NonNullable<ArbitrageFilterConfigV1["include"]>, v: boolean) {
    setCfg({ ...cfg, include: { ...inc, [key]: v } });
  }

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 space-y-4 transition-all hover:border-neutral-700">
      <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] border-b border-neutral-800 pb-2">
        Binary Logic Gates
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EXCLUDE COLUMN */}
        <div className="space-y-2">
          <div className="text-[9px] font-bold text-rose-500/80 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-1 h-1 bg-rose-500 rounded-full animate-pulse" />
            Exclude Filters
          </div>
          <div className="space-y-1">
            <TerminalToggle label="Dividend" checked={!!ex.dividend} onChange={(v) => setExclude("dividend", v)} variant="rose" />
            <TerminalToggle label="News" checked={!!ex.news} onChange={(v) => setExclude("news", v)} variant="rose" />
            <TerminalToggle label="PTP" checked={!!ex.ptp} onChange={(v) => setExclude("ptp", v)} variant="rose" />
            <TerminalToggle label="SSR" checked={!!ex.ssr} onChange={(v) => setExclude("ssr", v)} variant="rose" />
            <TerminalToggle label="Report" checked={!!ex.report} onChange={(v) => setExclude("report", v)} variant="rose" />
            <TerminalToggle label="ETF" checked={!!ex.etf} onChange={(v) => setExclude("etf", v)} variant="rose" />
            <TerminalToggle label="Crap (< $5)" checked={!!ex.crap} onChange={(v) => setExclude("crap", v)} variant="rose" />
          </div>
        </div>

        {/* INCLUDE COLUMN */}
        <div className="space-y-2">
          <div className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
            Include Filters
          </div>
          <div className="space-y-1">
            <TerminalToggle label="USA Only" checked={!!inc.usaOnly} onChange={(v) => setInclude("usaOnly", v)} variant="emerald" />
            <TerminalToggle label="China/HK Only" checked={!!inc.chinaOnly} onChange={(v) => setInclude("chinaOnly", v)} variant="emerald" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalToggle({
  label,
  checked,
  onChange,
  variant,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  variant: "emerald" | "rose";
}) {
  return (
    <label className="flex items-center justify-between group cursor-pointer bg-black/20 hover:bg-black/40 p-1.5 px-2 rounded transition-colors border border-transparent hover:border-neutral-800">
      <span className="text-[11px] font-mono text-neutral-400 group-hover:text-neutral-200 transition-colors">
        {label}
      </span>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className={clsx(
        "text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all font-mono",
        checked 
          ? variant === "emerald" 
            ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
            : "bg-rose-500/10 border-rose-500/50 text-rose-500"
          : "bg-neutral-800 border-neutral-700 text-neutral-600"
      )}>
        {checked ? "TRUE" : "FALSE"}
      </div>
    </label>
  );
}