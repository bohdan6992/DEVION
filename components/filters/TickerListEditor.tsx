"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";

export default function TickerListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const normalized = useMemo(
    () => values.map((x) => x.trim().toUpperCase()).filter(Boolean),
    [values]
  );

  function addFromInput() {
    const items = input
      .split(/[,\s]+/g)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);

    if (items.length === 0) return;

    const set = new Set(normalized);
    for (const it of items) set.add(it);

    onChange(Array.from(set));
    setInput("");
  }

  function removeOne(v: string) {
    onChange(normalized.filter((x) => x !== v));
  }

  function clear() {
    onChange([]);
  }

  return (
    <div className="space-y-2 group">
      {/* HEADER */}
      <div className="flex items-center justify-between px-1">
        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight">
          {label} <span className="text-neutral-700 font-mono">[{normalized.length}]</span>
        </label>
        {normalized.length > 0 && (
          <button 
            className="text-[8px] font-mono text-rose-500/60 hover:text-rose-500 uppercase tracking-tighter transition-colors"
            onClick={clear}
          >
            [PURGE_LIST]
          </button>
        )}
      </div>

      {/* COMMAND INPUT */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500/50 font-mono text-xs select-none">
            &gt;
          </span>
          <input
            className="bg-black border border-neutral-800 rounded px-2 py-1.5 pl-5 w-full text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/50 placeholder:text-neutral-700 transition-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFromInput()}
            placeholder={placeholder ?? "TICKER, CSV..."}
            spellCheck={false}
          />
        </div>
        <button 
          className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all active:scale-95"
          onClick={addFromInput}
        >
          PUSH
        </button>
      </div>

      {/* TICKER CLOUD */}
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
        {normalized.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 bg-neutral-800/30 border border-neutral-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 hover:border-emerald-500/30 hover:text-emerald-400 transition-all group/tag"
          >
            {v}
            <button
              className="text-neutral-700 hover:text-rose-500 transition-colors font-bold text-[12px] leading-none"
              onClick={() => removeOne(v)}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
        {normalized.length === 0 && (
          <div className="text-[10px] font-mono text-neutral-800 italic px-1 pt-1">
            // list_is_empty
          </div>
        )}
      </div>
    </div>
  );
}