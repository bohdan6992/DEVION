"use client";

import React from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1, ListMode } from "@/lib/filters/arbitrageFilterConfigV1";
import TickerListEditor from "@/components/filters/TickerListEditor";

export default function ListModePanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const lists = cfg.lists ?? { mode: "off" as ListMode };
  const mode = lists.mode ?? "off";

  function setMode(m: ListMode) {
    setCfg({ ...cfg, lists: { ...lists, mode: m } });
  }

  function setIgnore(v: string[]) {
    setCfg({ ...cfg, lists: { ...lists, ignore: v } });
  }
  function setApply(v: string[]) {
    setCfg({ ...cfg, lists: { ...lists, apply: v } });
  }
  function setPinned(v: string[]) {
    setCfg({ ...cfg, lists: { ...lists, pinned: v } });
  }

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 space-y-4 transition-all hover:border-neutral-700">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          Ticker Management
        </div>
        <div className={clsx(
          "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase",
          mode === "off" ? "bg-neutral-800 text-neutral-500" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
        )}>
          Mode: {mode}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight">
          Routing Logic
        </label>
        <div className="relative">
          <select
            className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
            value={mode}
            onChange={(e) => setMode(e.target.value as ListMode)}
          >
            <option value="off">BYPASS_ALL (off)</option>
            <option value="ignore">EXCLUDE_LIST (ignore)</option>
            <option value="apply">WHITE_LIST (apply only)</option>
            <option value="pin">RESTRICT_PINNED (pin only)</option>
          </select>
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-neutral-600">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1L5 5L9 1" />
            </svg>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1">
          {["ignore", "apply", "pin"].map((m) => (
            <div key={m} className={clsx(
              "text-[8px] text-center py-0.5 rounded border font-mono uppercase tracking-tighter",
              mode === m ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5" : "border-transparent text-neutral-600"
            )}>
              {m}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 pt-2">
        <div className={clsx("transition-opacity", mode !== "ignore" && mode !== "off" && "opacity-40")}>
          <TickerListEditor
            label="Ignore List"
            values={lists.ignore ?? []}
            onChange={setIgnore}
            placeholder="AAPL, MSFT…"
          />
        </div>
        <div className={clsx("transition-opacity", mode !== "apply" && mode !== "off" && "opacity-40")}>
          <TickerListEditor
            label="Apply-Only List"
            values={lists.apply ?? []}
            onChange={setApply}
            placeholder="AAPL, MSFT…"
          />
        </div>
        <div className={clsx("transition-opacity", mode !== "pin" && mode !== "off" && "opacity-40")}>
          <TickerListEditor
            label="Pinned List"
            values={lists.pinned ?? []}
            onChange={setPinned}
            placeholder="AAPL, MSFT…"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 pt-2 border-t border-neutral-800/50">
        <span className="text-emerald-500 font-mono text-[10px]">&gt;_</span>
        <div className="text-[9px] font-mono text-neutral-600 leading-tight">
          System: Lists are mutually exclusive when active. Delimiters: [comma, space, newline].
        </div>
      </div>
    </div>
  );
}