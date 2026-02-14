"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";
import type { ArbitrageFilterConfigV1, MultiSel } from "@/lib/filters/arbitrageFilterConfigV1";

type Kind = "countries" | "exchanges" | "sectors";

export default function MultiSelectPanel({
  cfg,
  setCfg,
  kind,
  label,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
  kind: Kind;
  label: string;
}) {
  const multi = cfg.multi ?? {};
  const ms: MultiSel = (multi as any)[kind] ?? { enabled: false, values: [] };

  const [input, setInput] = useState("");

  const values = useMemo(
    () => (ms.values ?? []).map((x) => String(x).trim()).filter(Boolean),
    [ms.values]
  );

  function setMs(next: MultiSel) {
    setCfg({
      ...cfg,
      multi: {
        ...multi,
        [kind]: {
          enabled: !!next.enabled,
          values: (next.values ?? [])
            .map((x) => String(x).trim().toUpperCase())
            .filter(Boolean),
        },
      },
    });
  }

  function addFromInput() {
    const items = input
      .split(/[,\s]+/g)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    if (items.length === 0) return;

    const set = new Set(values.map((x) => x.toUpperCase()));
    for (const it of items) set.add(it);
    setMs({ ...ms, values: Array.from(set) });
    setInput("");
  }

  function removeOne(v: string) {
    setMs({ ...ms, values: values.filter((x) => x !== v) });
  }

  return (
    <div className={clsx(
      "bg-neutral-900/40 border rounded-xl p-3 space-y-3 transition-all",
      ms.enabled ? "border-neutral-700" : "border-neutral-800 opacity-60"
    )}>
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          {label}
        </div>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            className="hidden"
            checked={!!ms.enabled}
            onChange={(e) => setMs({ ...ms, enabled: e.target.checked })}
          />
          <span className={clsx(
            "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-all",
            ms.enabled 
              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
              : "bg-neutral-800 border-neutral-700 text-neutral-600"
          )}>
            {ms.enabled ? "ENABLED" : "DISABLED"}
          </span>
        </label>
      </div>

      {/* INPUT AREA */}
      <div className="flex gap-2">
        <input
          className="bg-black border border-neutral-800 rounded px-2 py-1.5 w-full text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/50 placeholder:text-neutral-700"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFromInput()}
          placeholder="ADD_VALUES (CSV)..."
          disabled={!ms.enabled}
        />
        <button 
          className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all disabled:opacity-50"
          onClick={addFromInput}
          disabled={!ms.enabled || !input.trim()}
        >
          EXEC
        </button>
      </div>

      {/* TAGS CLOUD */}
      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 bg-neutral-800/50 border border-neutral-700 rounded px-2 py-0.5 text-[10px] font-mono text-neutral-300 group hover:border-rose-500/50 transition-colors"
          >
            {v}
            <button
              className="text-neutral-600 hover:text-rose-500 transition-colors font-bold"
              onClick={() => removeOne(v)}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <div className="text-[10px] font-mono text-neutral-700 italic">
            // null_vector
          </div>
        )}
      </div>

      {/* FOOTER TIPS */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-neutral-700 font-mono text-[10px] tracking-tighter">
          {ms.enabled 
            ? "> status: active_filtering" 
            : "> status: idle (bypass_mode)"}
        </span>
      </div>
    </div>
  );
}