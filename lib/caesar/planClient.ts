"use client";

import { bridgeUrl } from "@/lib/bridgeBase";
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

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(bridgeUrl(path), {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok === false) return null;
    return json as T;
  } catch {
    return null;
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
