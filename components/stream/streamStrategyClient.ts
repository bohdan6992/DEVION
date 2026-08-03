"use client";

import { bridgeUrl } from "../../lib/bridgeBase";

/**
 * Client for the bridge-side strategy arbiter (see StreamStrategyRegistry.cs).
 *
 * Why this exists: several strategy instances, each in its own browser tab, decide entries at the
 * SAME instant (the first poll after a minute boundary). If two of them want the same ticker,
 * exactly one order may be sent or the position doubles on that symbol. Tabs cannot agree among
 * themselves — the bridge decides, by strategy priority.
 */

export type StreamLeaseDecision = {
  granted: boolean;
  ticker: string;
  reason: string;
  decideAtUtc?: string | null;
  lease?: {
    ticker: string;
    strategyId: string;
    priority: number;
    side?: string | null;
    intentId?: string | null;
    status: string;
    claimedAtUtc: string;
    decideAtUtc: string;
    committedAtUtc?: string | null;
    preemptedStrategyId?: string | null;
  } | null;
};

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(bridgeUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok === false) return null;
    return json as T;
  } catch {
    return null;
  }
}

export async function registerStreamStrategy(params: {
  strategyId: string;
  label?: string;
  priority: number;
  clientId?: string;
  signalClass?: string | null;
  betaMode?: boolean;
}): Promise<boolean> {
  const result = await postJson<{ ok: boolean }>("/api/stream/strategies/register", {
    strategyId: params.strategyId,
    label: params.label ?? params.strategyId,
    priority: params.priority,
    clientId: params.clientId ?? null,
    signalClass: params.signalClass ?? null,
    betaMode: params.betaMode ?? false,
  });
  return result != null;
}

export async function heartbeatStreamStrategy(strategyId: string): Promise<{ registered: boolean } | null> {
  return postJson<{ ok: boolean; registered: boolean }>("/api/stream/strategies/heartbeat", { strategyId });
}

/**
 * Phase 1 — reserve the ticker and open/join the arbitration window.
 * granted=false means do not send: someone else already owns or outranks this claim.
 */
export async function claimStreamTicker(params: {
  strategyId: string;
  ticker: string;
  side?: string;
  intentId?: string;
}): Promise<StreamLeaseDecision | null> {
  const result = await postJson<{ decision: StreamLeaseDecision }>("/api/stream/strategies/claim", params);
  return result?.decision ?? null;
}

/**
 * Phase 2 — blocks server-side for the remainder of the arbitration window, then returns the
 * FINAL answer. Only granted=true authorizes actually sending the order.
 */
export async function commitStreamTicker(params: {
  strategyId: string;
  ticker: string;
  intentId?: string;
}): Promise<StreamLeaseDecision | null> {
  const result = await postJson<{ decision: StreamLeaseDecision }>("/api/stream/strategies/commit", params);
  return result?.decision ?? null;
}

export async function releaseStreamTicker(params: {
  strategyId: string;
  ticker: string;
  reason?: string;
}): Promise<void> {
  await postJson("/api/stream/strategies/release", params);
}

export async function releaseAllStreamTickers(strategyId: string): Promise<void> {
  await postJson("/api/stream/strategies/release-all", { strategyId });
}

/**
 * Runs the full claim → commit handshake for one ticker.
 *
 * Returns true only when this strategy is authorized to send. A null/failed response from the
 * bridge is treated as GRANTED so that a temporarily unreachable arbiter degrades to today's
 * behaviour (send) rather than silently halting all trading — the arbiter is a de-duplicator,
 * not the trading permission system. Callers that want fail-closed semantics should pass
 * `failClosed: true`.
 */
export async function acquireStreamTicker(params: {
  strategyId: string;
  ticker: string;
  side?: string;
  intentId?: string;
  failClosed?: boolean;
  /**
   * Re-registers this strategy with the arbiter. Required for self-healing: the arbiter drops a
   * strategy that stops heartbeating (StrategyTtlSeconds), and background browser tabs — which is
   * exactly how these run — get their timers throttled hard, plus a sleeping laptop stops them
   * entirely. Coming back to a swept registration WITHOUT this would make every claim return
   * "strategy is not registered", i.e. a valid deny, which fail-open does not cover: entries
   * would be silently skipped until the next heartbeat happened to re-register.
   */
  ensureRegistered?: () => Promise<boolean>;
}): Promise<{ granted: boolean; reason: string }> {
  const fallback = params.failClosed
    ? { granted: false, reason: "arbiter unreachable (fail-closed)" }
    : { granted: true, reason: "arbiter unreachable (fail-open)" };

  let claim = await claimStreamTicker(params);
  if (claim == null) return fallback;

  if (!claim.granted && isNotRegistered(claim.reason) && params.ensureRegistered) {
    const registered = await params.ensureRegistered();
    if (registered) {
      claim = await claimStreamTicker(params);
      if (claim == null) return fallback;
    }
  }

  if (!claim.granted) return { granted: false, reason: claim.reason };

  const commit = await commitStreamTicker({
    strategyId: params.strategyId,
    ticker: params.ticker,
    intentId: params.intentId,
  });
  if (commit == null) return fallback;
  return { granted: commit.granted, reason: commit.reason };
}

function isNotRegistered(reason: string | null | undefined): boolean {
  return (reason ?? "").toLowerCase().includes("not registered");
}
