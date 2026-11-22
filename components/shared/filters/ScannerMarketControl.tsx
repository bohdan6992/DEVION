"use client";

import React from "react";
import clsx from "clsx";
import { MarketTypeToggle, type MarketTypePctStats } from "./MarketTypeToggle";
import { apiGet } from "../../../lib/scanner/api";
import type { MarketTypeKey, MarketTypeMeta } from "../../../lib/marketType";

/**
 * MARKET button + its icon list, ONE copy for every scanner (the operator's own instruction, 2026-11-22:
 * the same MARKET / RATE / STATS buttons everywhere). Off hides the list AND drops the restriction (the
 * request carries `marketTypes: null`); the pick is kept while off so turning it back on restores it. A
 * list that is hidden but still rejecting days would be a filter nobody can see.
 *
 * The bridge applies the choice per day for every strategy (PaperMarketTypeFilter, via the shared
 * PaperScannerEngine / the Arbitrage and PairFlux day loops), so it reaches the table, the SNAPSHOT summary
 * and the AUTO OPTIMIZER alike. It is deliberately not part of any variant key: it picks which built days
 * are shown, not what a day computes.
 */
// One fetch per page load, shared by every scanner that mounts the control.
let pctStatsPromise: Promise<MarketTypePctStats | null> | null = null;
function loadPctStats(): Promise<MarketTypePctStats | null> {
  if (!pctStatsPromise) {
    pctStatsPromise = apiGet<any>("/api/market-type/summary?days=120")
      .then((j) => (j?.types && typeof j.types === "object" ? (j.types as MarketTypePctStats) : null))
      .catch(() => {
        pctStatsPromise = null; // let the next mount retry
        return null;
      });
  }
  return pctStatsPromise;
}

export function useMarketFilter() {
  const [marketTypes, setMarketTypes] = React.useState<MarketTypeKey[]>([]);
  const [marketOn, setMarketOn] = React.useState(true);
  return { marketTypes, setMarketTypes, marketOn, setMarketOn };
}

export function ScannerMarketControl({
  on,
  setOn,
  value,
  onChange,
  meta,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  value: readonly MarketTypeKey[];
  onChange: (next: MarketTypeKey[]) => void;
  meta?: MarketTypeMeta | null;
}) {
  const [stats, setStats] = React.useState<MarketTypePctStats | null>(null);
  React.useEffect(() => {
    let dead = false;
    void loadPctStats().then((v) => { if (!dead) setStats(v); });
    return () => { dead = true; };
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOn(!on)}
        aria-pressed={on}
        title={
          on
            ? "MARKET on — only the days of the chosen market type(s) are shown (SPY, QQQ, VXX at 09:19 ET). Click to switch it off: the list hides and every day is shown again. Your pick is kept."
            : "MARKET off — no market-type restriction, every day is shown. Click to bring the list back with your last pick."
        }
        className={clsx(
          "flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase tracking-wide leading-none transition-all",
          on
            ? "bg-violet-500 text-white shadow-[0_0_16px_rgba(139,92,246,0.36)]"
            : "bg-black/20 text-zinc-400 hover:bg-white/5 hover:text-white"
        )}
      >
        MARKET
      </button>
      {on && <MarketTypeToggle value={value} onChange={onChange} meta={meta} stats={stats} />}
    </>
  );
}
