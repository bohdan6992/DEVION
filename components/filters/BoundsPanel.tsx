"use client";

import React from "react";
import type { ArbitrageFilterConfigV1 } from "@/lib/filters/arbitrageFilterConfigV1";
import MinMaxInput from "@/components/filters/MinMaxInput";

const KEYS: Array<{ key: string; label: string; step?: number }> = [
  { key: "ADV20", label: "ADV20", step: 1 },
  { key: "ADV20NF", label: "ADV20NF", step: 1 },
  { key: "ADV90", label: "ADV90", step: 1 },
  { key: "ADV90NF", label: "ADV90NF", step: 1 },
  { key: "AvPreMhv", label: "AvPreMhv", step: 1 },
  { key: "RoundLot", label: "RoundLot", step: 1 },
  { key: "VWAP", label: "VWAP", step: 0.001 },
  { key: "Spread", label: "Spread", step: 0.001 },
  { key: "LstPrcL", label: "LstPrcL", step: 0.001 },
  { key: "LstCls", label: "LstCls", step: 0.001 },
  { key: "YCls", label: "YCls", step: 0.001 },
  { key: "TCls", label: "TCls", step: 0.001 },
  { key: "ClsToClsPct", label: "ClsToClsPct", step: 0.001 },
  { key: "Lo", label: "Lo", step: 0.001 },
  { key: "LstClsNewsCnt", label: "LstClsNewsCnt", step: 1 },
  { key: "MarketCapM", label: "MarketCapM", step: 1 },
  { key: "PreMhVolNF", label: "PreMhVolNF", step: 1 },
  { key: "VolNFfromLstCls", label: "VolNFfromLstCls", step: 1 },
];

export default function BoundsPanel({
  cfg,
  setCfg,
}: {
  cfg: ArbitrageFilterConfigV1;
  setCfg: (c: ArbitrageFilterConfigV1) => void;
}) {
  const bounds = cfg.bounds ?? {};

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 space-y-4 transition-all hover:border-neutral-700">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          Range Constraints
        </div>
        <div className="text-[9px] font-mono text-neutral-600 uppercase">
          {KEYS.length} Metrics Active
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {KEYS.map(({ key, label, step }) => (
          <div key={key} className="group transition-opacity duration-200">
            <MinMaxInput
              label={label}
              step={step}
              value={(bounds as any)[key]}
              onChange={(v) => {
                setCfg({
                  ...cfg,
                  bounds: {
                    ...bounds,
                    [key]: v,
                  },
                });
              }}
            />
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-neutral-800/50">
        <div className="flex items-start gap-2">
          <span className="text-emerald-500 font-mono text-[10px] select-none animate-pulse">
            &gt;
          </span>
          <div className="text-[9px] font-mono text-neutral-600 leading-tight">
            System: Bounds are applied as inclusive ranges. Empty fields default to +/- Infinity.
          </div>
        </div>
      </div>
    </div>
  );
}