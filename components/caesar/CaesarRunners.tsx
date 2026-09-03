"use client";

/**
 * Caesar hosts the stream engines that have nowhere else to run.
 *
 * The bridge already schedules the day: CaesarPlanService ticks every 15s and calls
 * StreamAutomationControlService.Start/Stop per strategy id, independently of any tab. That is
 * enough for OpenDoor, Day Two, OpenFade and OpenRide, because each of those has an IServerStrategy
 * registered in Program.cs — the bridge decides and dispatches on its own.
 *
 * Arbitrage and PairFlux have no such engine. Their decisions are made by useStreamEngine inside a
 * mounted page, so "Caesar started Arbitrage" meant nothing unless somebody had left the Arbitrage
 * stream tab open. Two strategies meant two tabs, and closing either silently stopped half the day
 * while the schedule went on reporting both as running.
 *
 * So this mounts them. One Caesar tab, both engines, side by side — which is what the stream
 * instance provider was built for: every store, action log and bridge ticker lease is keyed by
 * instanceId, so two engines share nothing but the market feed.
 *
 * WHAT IT DOES NOT DO. It does not configure anything. Each strategy still reads the settings its
 * own stream page saved under that strategy's localStorage prefix, so the workflow is unchanged:
 * open /pairflux/stream by link, set it up there, and Caesar runs exactly that. The only thing
 * Caesar overrides is PRIORITY, because priority is a statement about how two strategies resolve
 * against each other and therefore belongs to the plan that runs both, not to either page.
 */

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";

import { LIVE_STRATEGIES, type LiveStrategy } from "@/lib/strategies/registry";
import {
  CAESAR_SEGMENTS,
  loadCaesarPlan,
  nyAxisMinutesNow,
  type CaesarPlan,
  type CaesarSegmentKey,
} from "@/lib/caesar/schedule";

const StreamPageContainer = dynamic(() => import("../stream/StreamPageContainer"), { ssr: false });
const ArbitrageScanner = dynamic(() => import("../scanner/ArbitrageScanner"), { ssr: false });
const PairFluxScanner = dynamic(() => import("../scanner/PairFluxScanner"), { ssr: false });

/**
 * The scanner that carries each browser-hosted strategy's rule.
 *
 * Keyed rather than derived because a component cannot be named in the registry without dragging
 * every scanner into every bundle that imports it. A strategy marked `streamEngine: "browser"` and
 * missing here is reported below rather than silently skipped.
 */
const SCANNERS: Record<string, React.ComponentType<any>> = {
  arbitrage: ArbitrageScanner,
  pairflux: PairFluxScanner,
};

type Runner = {
  strategy: LiveStrategy;
  priority: number;
  segment: CaesarSegmentKey;
};

/** The segment the NY clock is in right now, or null outside every segment. */
function activeSegment(nowMin: number | null): CaesarSegmentKey | null {
  if (nowMin === null) return null;
  for (const seg of CAESAR_SEGMENTS) {
    if (nowMin >= seg.fromMin && nowMin < seg.toMin) return seg.key;
  }
  return null;
}

export default function CaesarRunners() {
  const [plan, setPlan] = useState<CaesarPlan | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [showPanels, setShowPanels] = useState(false);

  useEffect(() => { setPlan(loadCaesarPlan()); }, []);

  // Re-read on every edit made by the schedule above, and re-check the clock, on the same cadence
  // the schedule paints its "now" marker with.
  useEffect(() => {
    const tick = () => {
      setNowMin(nyAxisMinutesNow());
      setPlan(loadCaesarPlan());
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const seg = activeSegment(nowMin);

  const runners = useMemo<Runner[]>(() => {
    if (!plan || !seg) return [];
    const out: Runner[] = [];
    for (const row of plan[seg] ?? []) {
      if (!row.enabled) continue;
      const strategy = LIVE_STRATEGIES[row.strategyKey];
      // The bridge runs its own; mounting one here would double every decision.
      if (!strategy || strategy.streamEngine !== "browser") continue;
      out.push({ strategy, priority: row.priority, segment: seg });
    }
    // Highest priority first, purely so the strip reads in the order ties resolve.
    return out.sort((a, b) => b.priority - a.priority);
  }, [plan, seg]);

  const missing = runners.filter((r) => !SCANNERS[r.strategy.key]);

  return (
    <section className="mt-4 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 shadow-xl backdrop-blur-md">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
            Live engines
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {seg ? `${seg} segment` : "outside every segment"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowPanels((v) => !v)}
          className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {showPanels ? "Hide panels" : "Show panels"}
        </button>
      </header>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {runners.length === 0 ? (
          <span className="font-mono text-[11px] text-zinc-600">
            Nothing assigned to this segment that Caesar has to host — the bridge runs the rest.
          </span>
        ) : (
          runners.map((r) => (
            <span
              key={r.strategy.key}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {r.strategy.key.toUpperCase()}
              <span className="text-emerald-200/50">#{r.priority}</span>
              <a href={r.strategy.nav.stream} className="text-emerald-200/50 underline-offset-2 hover:underline">
                configure
              </a>
            </span>
          ))
        )}
      </div>

      {missing.length > 0 && (
        <div className="px-4 pb-3 font-mono text-[11px] text-amber-300/80">
          No scanner wired for: {missing.map((m) => m.strategy.key).join(", ")} — assigned, but Caesar
          cannot host it.
        </div>
      )}

      {/*
        MOUNTED EITHER WAY. `hidden` keeps the panels out of the way without unmounting them: React
        keeps the effects, so the engines keep deciding. Unmounting to tidy the page would stop the
        very thing this component exists to run.
      */}
      <div className={showPanels ? "space-y-4 px-4 pb-4" : "hidden"}>
        {runners.map((r) => {
          const Scanner = SCANNERS[r.strategy.key];
          if (!Scanner) return null;
          return (
            <div key={r.strategy.key} className="overflow-hidden rounded-xl border border-white/[0.06]">
              <StreamPageContainer
                ScannerComponent={Scanner}
                instanceId={r.strategy.bridgeStrategyId}
                lsKeyPrefix={r.strategy.storage.streamPrefix}
                strategyLabel={r.strategy.key.toUpperCase()}
                headerTitle={`${r.strategy.key.toUpperCase()} STREAM`}
                // From the PLAN, not the registry default: this is the number the two strategies
                // resolve against each other by, and the schedule is where it is set.
                strategyPriority={r.priority}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
