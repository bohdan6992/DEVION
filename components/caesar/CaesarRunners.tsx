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

const ArbitrageStream = dynamic(() => import("../stream/ArbitrageStream"), { ssr: false });
const PairFluxStream = dynamic(() => import("../stream/PairFluxStream"), { ssr: false });
// Reads the account and the mounted engines' own stores; see CaesarPositions.
const CaesarPositions = dynamic(() => import("./CaesarPositions"), { ssr: false });
// Machine-level, not strategy-level: one bound window for the whole bridge. See CaesarWindowBinding.
const CaesarWindowBinding = dynamic(() => import("./CaesarWindowBinding"), { ssr: false });
// The live feed: counters and dispatches from both engines on one clock. See CaesarTerminal.
const CaesarTerminal = dynamic(() => import("./CaesarTerminal"), { ssr: false });

// The same two facts as pictures: how the segment's active situations split, and when they arrived.
const CaesarCharts = dynamic(() => import("./CaesarCharts"), { ssr: false });

/**
 * Each browser-hosted strategy's own STREAM, not its bare scanner.
 *
 * This used to hold the scanner components and mount them under a plain StreamPageContainer. That
 * container's defaults are Arbitrage's — session GLOB, entries cut off at 09:20 — and they are
 * correct for Arbitrage and wrong for anything else. PairFlux rates only pre/open/intra, so under
 * Caesar it opened on a class its ratings endpoint answers with zero rows: no pairs, therefore no
 * live pairs, therefore no gate, therefore no orders. Nothing logged an error, because nothing had
 * failed — it had been asked for a class that does not exist and correctly returned nothing.
 *
 * `PairFluxStream` already carries the right values and the stream PAGE already used it; only this
 * path went around it. Mounting the same wrapper both places is what keeps the strategy identical
 * whether it runs from its own tab or from here.
 *
 * Keyed rather than derived because a component cannot be named in the registry without dragging
 * every scanner into every bundle that imports it. A strategy marked `streamEngine: "browser"` and
 * missing here is reported below rather than silently skipped.
 */
const STREAMS: Record<string, React.ComponentType<any>> = {
  arbitrage: ArbitrageStream,
  pairflux: PairFluxStream,
};

type Runner = {
  strategy: LiveStrategy;
  priority: number;
  segment: CaesarSegmentKey;
  /**
   * Who runs it. "browser" is mounted below; "bridge" is listed but NOT mounted — it has an
   * IServerStrategy of its own and a second copy here would double every decision it makes.
   *
   * Listed rather than filtered out, because a strategy that is assigned, enabled and simply
   * absent from this strip reads as a fault. It is not: it is running, just not here.
   */
  host: "browser" | "bridge";
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
  // The charts plot the segment, not the day, so they need its edges and not just its name.
  const segBounds = useMemo(
    () => CAESAR_SEGMENTS.find((s) => s.key === seg) ?? null,
    [seg],
  );

  const runners = useMemo<Runner[]>(() => {
    if (!plan || !seg) return [];
    const out: Runner[] = [];
    for (const row of plan[seg] ?? []) {
      if (!row.enabled) continue;
      const strategy = LIVE_STRATEGIES[row.strategyKey];
      if (!strategy) continue;
      out.push({
        strategy,
        priority: row.priority,
        segment: seg,
        host: strategy.streamEngine === "browser" ? "browser" : "bridge",
      });
    }
    // Highest priority first, purely so the strip reads in the order ties resolve.
    return out.sort((a, b) => b.priority - a.priority);
  }, [plan, seg]);

  /** The ones this tab actually mounts. Everything below the strip is driven by these alone. */
  const hosted = useMemo(() => runners.filter((r) => r.host === "browser"), [runners]);

  const missing = hosted.filter((r) => !STREAMS[r.strategy.key]);

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
          runners.map((r) => {
            const here = r.host === "browser";
            return (
              <span
                key={r.strategy.key}
                title={
                  here
                    ? "Hosted by this tab — its decisions are made here."
                    : "Run by the bridge on its own engine. Listed for completeness; this tab does not host it, and mounting a second copy would double its decisions."
                }
                className={
                  "inline-flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[11px] " +
                  (here
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.03] text-zinc-400")
                }
              >
                <span
                  className={"h-1.5 w-1.5 rounded-full " + (here ? "bg-emerald-400" : "bg-zinc-500")}
                />
                {r.strategy.key.toUpperCase()}
                <span className={here ? "text-emerald-200/50" : "text-zinc-600"}>#{r.priority}</span>
                <span className={"uppercase tracking-widest " + (here ? "text-emerald-200/40" : "text-zinc-600")}>
                  {here ? "here" : "bridge"}
                </span>
                <a
                  href={r.strategy.nav.stream}
                  className={
                    "underline-offset-2 hover:underline " + (here ? "text-emerald-200/50" : "text-zinc-600")
                  }
                >
                  configure
                </a>
              </span>
            );
          })
        )}
      </div>

      {runners.length > hosted.length && (
        <div className="px-4 pb-3 font-mono text-[10px] text-zinc-600">
          {runners.length - hosted.length} of {runners.length} run on the bridge&apos;s own engine and
          are not hosted by this tab — they keep running with no browser open at all.
        </div>
      )}

      {missing.length > 0 && (
        <div className="px-4 pb-3 font-mono text-[11px] text-amber-300/80">
          No scanner wired for: {missing.map((m) => m.strategy.key).join(", ")} — assigned, but Caesar
          cannot host it.
        </div>
      )}

      {/*
        The window binding sits ABOVE the positions: nothing below it can be executed until a window
        is bound, so it is the first thing to be wrong and the first thing to check.
      */}
      <CaesarWindowBinding />

      {/*
        The terminal is fed by the SAME runner list that mounts the engines, so a strategy can never
        be running and absent from it, or listed and not running.
      */}
      <CaesarPositions
        instances={hosted.map((r) => ({
          key: r.strategy.key,
          instanceId: r.strategy.bridgeStrategyId,
          priority: r.priority,
        }))}
      />

      {/* Third time on the same list: the shape of what the two panels above state in numbers. */}
      <CaesarCharts
        segment={seg}
        fromMin={segBounds?.fromMin ?? null}
        toMin={segBounds?.toMin ?? null}
        nowMin={nowMin}
        instances={hosted.map((r) => ({
          key: r.strategy.key,
          instanceId: r.strategy.bridgeStrategyId,
          priority: r.priority,
        }))}
      />

      {/* Same runner list again: what is hosted, what it holds, and what it has been doing. */}
      <CaesarTerminal
        segment={seg}
        instances={hosted.map((r) => ({
          key: r.strategy.key,
          instanceId: r.strategy.bridgeStrategyId,
          priority: r.priority,
        }))}
      />

      {/*
        MOUNTED EITHER WAY. `hidden` keeps the panels out of the way without unmounting them: React
        keeps the effects, so the engines keep deciding. Unmounting to tidy the page would stop the
        very thing this component exists to run.
      */}
      <div className={showPanels ? "space-y-4 px-4 pb-4" : "hidden"}>
        {hosted.map((r) => {
          const Stream = STREAMS[r.strategy.key];
          if (!Stream) return null;
          return (
            <div key={r.strategy.key} className="overflow-hidden rounded-xl border border-white/[0.06]">
              <Stream
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
