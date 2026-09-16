"use client";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import {
  CAESAR_SEGMENTS,
  CAESAR_STRATEGY_BY_KEY,
  axisToMinuteIdx,
} from "./schedule";
import type { CaesarPlan } from "./schedule";

/**
 * Client for the bridge-side Caesar schedule (see CaesarPlanService.cs).
 *
 * The plan is edited here but ACTED ON there: a schedule that only ran while its tab was open
 * would put us back where the stream engine already is. Closing this page must not stop the day.
 */

export type BridgePlanAssignment = {
  strategyId: string;
  priority: number;
  enabled: boolean;
};

export type BridgePlanSegment = {
  key: string;
  fromMinuteIdx: number;
  toMinuteIdx: number;
  assignments: BridgePlanAssignment[];
};

export type BridgePlan = {
  enabled: boolean;
  segments: BridgePlanSegment[];
};

export type BridgePlanResponse = {
  plan: BridgePlan;
  nowMinuteIdx: number;
  /** Bridge strategy id -> whether the schedule wants it running right now. */
  running: Record<string, boolean>;
};

/**
 * UI plan -> bridge payload. Segment bounds are converted from axis minutes into the minuteIdx
 * space the bridge and the strategy descriptors both use, and catalog keys are translated to
 * bridge strategy ids.
 *
 * Strategies with no `bridgeStrategyId` are dropped: they have no engine, so there is nothing for
 * the schedule to start, and sending them would put ids in the bridge's state file that no
 * strategy will ever answer to.
 */
export function toBridgePlan(plan: CaesarPlan, enabled: boolean): BridgePlan {
  return {
    enabled,
    segments: CAESAR_SEGMENTS.map((seg) => ({
      key: seg.key,
      fromMinuteIdx: axisToMinuteIdx(seg.fromMin),
      toMinuteIdx: axisToMinuteIdx(seg.toMin),
      assignments: plan[seg.key].flatMap((row) => {
        const bridgeStrategyId = CAESAR_STRATEGY_BY_KEY[row.strategyKey]?.bridgeStrategyId;
        if (!bridgeStrategyId) return [];
        return [{ strategyId: bridgeStrategyId, priority: row.priority, enabled: row.enabled }];
      }),
    })),
  };
}

/**
 * A plain `fetch` with no timeout waits forever if the response never lands — a dropped packet,
 * the tab briefly suspended mid-flight, anything short of an outright connection error. That is
 * exactly what stuck the Caesar control bar's START key: `toggleSchedule`'s `finally` clears
 * `scheduleBusy`, but only once every awaited call here has settled, and an unsettled promise
 * never reaches it — the button sits on its busy dot until the page is reloaded. The bridge itself
 * answers in milliseconds (checked live), so this is a client-side hang, not a slow server; an
 * 8s abort is generous for that and short enough that the button recovers on its own.
 */
const REQUEST_TIMEOUT_MS = 8_000;

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchWithTimeout(bridgeUrl(path), {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok === false) return null;
    return json as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBridgePlan(): Promise<BridgePlanResponse | null> {
  return request<BridgePlanResponse>("/api/stream/caesar/plan");
}

export async function pushBridgePlan(plan: CaesarPlan, enabled: boolean): Promise<boolean> {
  const result = await request<{ ok: boolean }>("/api/stream/caesar/plan", {
    method: "PUT",
    body: JSON.stringify(toBridgePlan(plan, enabled)),
  });
  return result != null;
}

/** Master switch: whether the schedule may start and stop strategies at all. */
export async function setBridgeScheduleEnabled(enabled: boolean): Promise<BridgePlan | null> {
  const result = await request<{ plan: BridgePlan }>("/api/stream/caesar/enabled", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
  return result?.plan ?? null;
}

export type BridgeEngineStatus = {
  enabled: boolean;
  polls: number;
  ticks: number;
  /** Bridge strategy id -> whether it is currently shadow (record-only) or live (real dispatch). */
  strategyShadowMode: Record<string, boolean>;
};

/**
 * The engine's own master switch (ServerEngineControlService.Enabled) — one level below the
 * Schedule switch above. Off, ServerStrategyRunner.TickAsync returns on its very first line: no
 * strategy ever ticks, not even to compute a candidate for preview. It ships off by default
 * (appsettings' ServerStrategyEngine.Enabled) and is persisted per machine under
 * %APPDATA%\Axion\state\stream\engine-control.json — a fresh deploy to a machine that has never
 * had this flipped starts with it off, which reads as "no signals anywhere" with no error banner,
 * because every request the UI makes still succeeds; it just always answers empty.
 */
export async function fetchBridgeEngineStatus(): Promise<BridgeEngineStatus | null> {
  const result = await request<{ engine: BridgeEngineStatus }>("/api/stream/caesar/engine");
  return result?.engine ?? null;
}

export async function setBridgeEngineEnabled(enabled: boolean): Promise<BridgeEngineStatus | null> {
  const result = await request<{ engine: BridgeEngineStatus }>("/api/stream/caesar/engine", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
  return result?.engine ?? null;
}

/**
 * Per-strategy shadow override: true records only (no real order), false dispatches for real,
 * null clears the override back to the machine's own default. This used to have no UI control at
 * all — the only way to flip a strategy from shadow to live was a raw POST, awkward or impossible
 * on a machine reached only through the deployed (Vercel) frontend with no terminal open on it.
 */
export async function setBridgeStrategyShadow(strategyId: string, shadowMode: boolean | null): Promise<BridgeEngineStatus | null> {
  const result = await request<{ engine: BridgeEngineStatus }>("/api/stream/caesar/engine", {
    method: "POST",
    body: JSON.stringify({ strategy: strategyId, shadowMode }),
  });
  return result?.engine ?? null;
}

/**
 * Starts one strategy DIRECTLY, bypassing the schedule's own segment check.
 *
 * CaesarPlanService.Apply() only starts a strategy once the wall clock is inside a segment that
 * assigns it — so flipping the schedule switch outside that window does nothing for it, which
 * reads as "I pressed START and it looks on, but nothing is actually running". This is what the
 * Caesar control bar's START key calls, for every browser-hosted strategy the plan names anywhere,
 * so the button's own promise (both strategies, right now) does not depend on what segment the
 * clock happens to be standing in.
 */
export async function startStrategyNow(bridgeStrategyId: string): Promise<boolean> {
  const result = await request<{ ok: boolean }>("/api/stream/automation/start", {
    method: "POST",
    body: JSON.stringify({ source: "caesar-control-bar", strategyId: bridgeStrategyId }),
  });
  return result != null;
}

/**
 * Stops one strategy directly — the STOP-side twin of startStrategyNow. Scoped to this one
 * strategyId (drops only its own queued orders), never the operator's all-strategies panic form.
 */
export async function stopStrategyNow(bridgeStrategyId: string): Promise<boolean> {
  const result = await request<{ ok: boolean }>("/api/stream/automation/stop", {
    method: "POST",
    body: JSON.stringify({ source: "caesar-control-bar", strategyId: bridgeStrategyId }),
  });
  return result != null;
}
