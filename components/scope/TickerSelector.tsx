import React from "react";

export default function TickerSelector({
  tickers,
  value,
  onChange,
}: {
  tickers: string[];
  value: string; // "ALL" або тикер
  onChange: (v: string) => void;
}) {
  const items = ["ALL", ...tickers];

  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Charts:</div>

      <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
        <select
          className="bg-transparent outline-none text-zinc-200 font-mono text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {items.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <div className="text-zinc-500 text-xs font-mono">
        {value === "ALL" ? "aggregate" : `ticker=${value}`}
      </div>
    </div>
  );
}
