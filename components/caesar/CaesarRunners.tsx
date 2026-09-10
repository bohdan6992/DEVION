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
import React, { useEffect, useMemo, useRef, useState } from "react";

import { LIVE_STRATEGIES, type LiveStrategy } from "@/lib/strategies/registry";
import CaesarPanel, { CAESAR_PILL, CAESAR_PILL_IDLE, CAESAR_PILL_ON } from "./CaesarPanel";
import {
  CAESAR_SEGMENTS,
  clockLabel,
  loadCaesarPlan,
  nyAxisMinutesNow,
  type CaesarPlan,
  type CaesarSegmentKey,
} from "@/lib/caesar/schedule";

const ArbitrageStream = dynamic(() => import("../stream/ArbitrageStream"), { ssr: false });
const PairFluxStream = dynamic(() => import("../stream/PairFluxStream"), { ssr: false });
// Machine-level, not strategy-level: one bound window for the whole bridge. See CaesarWindowBinding.
const CaesarWindowBinding = dynamic(() => import("./CaesarWindowBinding"), { ssr: false });
// The live feed: counters and dispatches from both engines on one clock. See CaesarTerminal.
const CaesarTerminal = dynamic(() => import("./CaesarTerminal"), { ssr: false });


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
  /** The segment that assigned it, or null for one that is only still HOLDING (see `holding`). */
  segment: CaesarSegmentKey | null;
  /**
   * True when the clock has left this strategy's segment but the engine is still mounted.
   *
   * Hosting is not permission. Whether a strategy may open anything is the bridge's per-strategy
   * automation flag, which CaesarPlanService turns off at the segment edge; what this tab decides
   * is only whether the engine EXISTS. Unmounting it is not the same as stopping it — an engine
   * that has been removed cannot close what it opened, cannot sync its positions and cannot send
   * an exit. So once mounted it stays mounted, and the plan governs entries.
   */
  holding: boolean;
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

  // Re-read on every edit made by the schedule above, and re-check the clock, on the same cadence
  // the schedule paints its "now" marker with.
  //
  // COMPARED, NOT JUST STORED. loadCaesarPlan() parses localStorage and therefore returns a fresh
  // object every tick; setting it unconditionally changed React's identity twice a minute and
  // re-rendered both mounted strategy trees — two full scanners — for a plan that had not moved.
  // The serialized form is the honest change signal.
  const planJsonRef = useRef<string>("");
  useEffect(() => {
    const tick = () => {
      setNowMin(nyAxisMinutesNow());
      const next = loadCaesarPlan();
      const json = JSON.stringify(next);
      if (json === planJsonRef.current) return;
      planJsonRef.current = json;
      setPlan(next);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const seg = activeSegment(nowMin);
  const caesarEntryStopTime = useMemo(
    () => seg ? clockLabel(CAESAR_SEGMENTS.find((candidate) => candidate.key === seg)?.toMin ?? 0) : undefined,
    [seg],
  );

  /** What the PLAN assigns to the segment the clock is in right now. */
  const segmentRunners = useMemo<Runner[]>(() => {
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
        holding: false,
        host: strategy.streamEngine === "browser" ? "browser" : "bridge",
      });
    }
    return out;
  }, [plan, seg]);

  /*
    WHAT THIS TAB HAS TAKEN RESPONSIBILITY FOR.

    Measured on 2026-09-08: the plan put Arbitrage and PairFlux on `pre` (21:00-09:00) and only
    OpenRide on `open`. At 09:00:49 NY `stream.arbitrage` sent its last UI heartbeat and never sent
    another, while the bridge still had it flagged autoEnabled — because the segment changed, the
    strategy left `hosted`, and React unmounted the engine. Everything it had open at 09:00 was
    then held by nobody: no position sync, no exit, no cutoff.

    So the mounted set only ever GROWS while the plan still lists a strategy. The clock leaving a
    segment stops new entries — that is the bridge's automation flag, applied by CaesarPlanService
    — it does not delete the thing holding the positions. Removing the strategy from the plan does
    unmount it, because that is an operator saying so rather than a clock edge.
  */
  const [held, setHeld] = useState<Record<string, number>>({});

  const assignedAnywhere = useMemo(() => {
    const set = new Set<string>();
    if (plan) {
      for (const s of CAESAR_SEGMENTS) {
        for (const row of plan[s.key] ?? []) if (row.enabled) set.add(row.strategyKey);
      }
    }
    return set;
  }, [plan]);

  useEffect(() => {
    setHeld((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      // Keep what is still in the plan, at its latest priority; drop what the operator removed.
      for (const [key, priority] of Object.entries(prev)) {
        if (assignedAnywhere.has(key)) next[key] = priority;
        else changed = true;
      }
      for (const r of segmentRunners) {
        if (r.host !== "browser") continue;
        if (next[r.strategy.key] === r.priority) continue;
        next[r.strategy.key] = r.priority;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [assignedAnywhere, segmentRunners]);

  /** The plan's view of now, plus anything still held past its segment. */
  const runners = useMemo<Runner[]>(() => {
    const inSegment = new Set(segmentRunners.map((r) => r.strategy.key));
    const out = [...segmentRunners];
    for (const [key, priority] of Object.entries(held)) {
      if (inSegment.has(key)) continue;
      const strategy = LIVE_STRATEGIES[key];
      if (!strategy || strategy.streamEngine !== "browser") continue;
      out.push({ strategy, priority, segment: null, holding: true, host: "browser" });
    }
    // Highest priority first, purely so the strip reads in the order ties resolve.
    return out.sort((a, b) => b.priority - a.priority);
  }, [segmentRunners, held]);

  /** The ones this tab actually mounts. Everything below the strip is driven by these alone. */
  const hosted = useMemo(() => runners.filter((r) => r.host === "browser"), [runners]);

  const missing = hosted.filter((r) => !STREAMS[r.strategy.key]);

  return (
    /*
      ONE STACK, NOT ONE BOX INSIDE ANOTHER. These used to be nested: every panel below rendered
      inside the "live engines" section, which drew a frame around four frames. They are siblings
      now, on a single rhythm, exactly like the panels on a stream board.
    */
    <div className="mt-3 space-y-3">
      <CaesarPanel
        title="Live engines"
        subtitle={seg ? `${seg} segment` : "outside every segment"}
        accent="#199e70"
        right={
          <button
            type="button"
            onClick={() => setShowPanels((v) => !v)}
            className={CAESAR_PILL + (showPanels ? CAESAR_PILL_ON : CAESAR_PILL_IDLE)}
          >
            {showPanels ? "Hide panels" : "Show panels"}
          </button>
        }
      >
      <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap gap-2">
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
                  r.holding
                    ? "Past its segment, still mounted. The plan has stopped its entries; the engine stays so it can still manage and close what it opened."
                    : here
                      ? "Hosted by this tab — its decisions are made here."
                      : "Run by the bridge on its own engine. Listed for completeness; this tab does not host it, and mounting a second copy would double its decisions."
                }
                className={
                  "group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors " +
                  (here
                    ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200 shadow-[0_0_22px_-12px_rgba(52,211,153,0.9)] hover:bg-emerald-500/[0.13]"
                    : "border-white/[0.07] bg-black/25 text-zinc-400 hover:bg-white/[0.05]")
                }
              >
                {/* The dot PULSES only when this tab is the thing keeping the engine alive — that
                    is the one state where closing the tab changes what the day does. */}
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  {here && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  )}
                  <span
                    className={"relative inline-flex h-1.5 w-1.5 rounded-full " + (here ? "bg-emerald-400" : "bg-zinc-600")}
                  />
                </span>
                <span className="font-bold tracking-[0.12em]">{r.strategy.key.toUpperCase()}</span>
                <span
                  className={
                    "rounded px-1 py-px text-[9px] tabular-nums " +
                    (here ? "bg-emerald-400/10 text-emerald-200/70" : "bg-white/[0.04] text-zinc-600")
                  }
                >
                  #{r.priority}
                </span>
                <span className={"text-[9px] uppercase tracking-[0.18em] " + (here ? "text-emerald-200/40" : "text-zinc-600")}>
                  {r.holding ? "holding" : here ? "here" : "bridge"}
                </span>
                <a
                  href={r.strategy.nav.stream}
                  className={
                    "text-[9px] uppercase tracking-[0.14em] underline-offset-2 hover:underline " +
                    (here ? "text-emerald-200/45 hover:text-emerald-100" : "text-zinc-600 hover:text-zinc-300")
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
        <div className="font-mono text-[10px] text-zinc-600">
          {runners.length - hosted.length} of {runners.length} run on the bridge&apos;s own engine and
          are not hosted by this tab — they keep running with no browser open at all.
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 font-mono text-[11px] text-amber-300/80">
          No scanner wired for: {missing.map((m) => m.strategy.key).join(", ")} — assigned, but Caesar
          cannot host it.
        </div>
      )}

      </div>

      {/*
        The window binding sits ABOVE the positions: nothing below it can be executed until a window
        is bound, so it is the first thing to be wrong and the first thing to check.
      */}
      <CaesarWindowBinding />
      </CaesarPanel>

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
      <div className={showPanels ? "space-y-3" : "hidden"}>
        {hosted.map((r) => {
          const Stream = STREAMS[r.strategy.key];
          if (!Stream) return null;
          return (
            <div key={r.strategy.key} className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0a0a]/75 p-3 backdrop-blur-xl">
              <Stream
                instanceId={r.strategy.bridgeStrategyId}
                lsKeyPrefix={r.strategy.storage.streamPrefix}
                strategyLabel={r.strategy.key.toUpperCase()}
                headerTitle={`${r.strategy.key.toUpperCase()} STREAM`}
                // From the PLAN, not the registry default: this is the number the two strategies
                // resolve against each other by, and the schedule is where it is set.
                strategyPriority={r.priority}
                // Do not let a standalone Stream cutoff (e.g. Arbitrage's saved 09:20) veto a
                // strategy Caesar has explicitly scheduled through the current segment.
                caesarEntryStopTime={r.segment ? caesarEntryStopTime : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
