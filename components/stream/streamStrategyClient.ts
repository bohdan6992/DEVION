"use client";

import { bridgeUrl, fetchWithTimeout } from "../../lib/bridgeBase";

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
    // commit blocks server-side for ArbitrationWindowMs (400ms, per StreamStrategyRegistryOptions)
    // before answering, well inside the default timeout — the timeout here is only a ceiling
    // against the client-side hang class described in fetchWithTimeout's doc comment.
    const response = await fetchWithTimeout(bridgeUrl(path), {
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

export type StreamStrategyRegistrationResult = {
  registered: boolean;
  /**
   * Whether THIS client owns dispatch for the strategy.
   *
   * One strategy is one engine. Caesar hosts Arbitrage and PairFlux so the day runs with no stream
   * page open; opening one of those pages anyway would put a second engine on the same strategy,
   * and the two would not agree — their positions drift, so identical intent ids stop protecting
   * anything. The bridge hands ownership to whoever registered first and takes it back a TTL after
   * they stop. A client that is not the owner still shows everything; it just does not send.
   */
  isOwner: boolean;
  ownerClientId: string | null;
};

export async function registerStreamStrategy(params: {
  strategyId: string;
  label?: string;
  priority: number;
  clientId?: string;
  signalClass?: string | null;
  betaMode?: boolean;
  /** Take dispatch away from a client that still holds it. Only ever set from a user action. */
  takeOwnership?: boolean;
}): Promise<StreamStrategyRegistrationResult> {
  const result = await postJson<{ ok: boolean; registration?: { ownerClientId?: string | null } }>(
    "/api/stream/strategies/register",
    {
      strategyId: params.strategyId,
      label: params.label ?? params.strategyId,
      priority: params.priority,
      clientId: params.clientId ?? null,
      signalClass: params.signalClass ?? null,
      betaMode: params.betaMode ?? false,
      takeOwnership: params.takeOwnership ?? false,
    },
  );
  if (result == null) return { registered: false, isOwner: false, ownerClientId: null };
  const ownerClientId = result.registration?.ownerClientId ?? null;
  return {
    registered: true,
    // A bridge that reports no owner at all is one that predates ownership; treating that as
    // "not the owner" would stop every strategy dead, so an absent owner means nobody is claiming
    // and this client proceeds.
    isOwner: ownerClientId == null || ownerClientId === (params.clientId ?? null),
    ownerClientId,
  };
}

export async function heartbeatStreamStrategy(strategyId: string): Promise<{ registered: boolean } | null> {
  return postJson<{ ok: boolean; registered: boolean }>("/api/stream/strategies/heartbeat", { strategyId });
}

/**
 * Whether the SERVER-SIDE engine (ServerEngineControlService) has been given real dispatch
 * authority for this strategy — i.e. shadow mode is off. See ServerStrategyRunner.TickAsync: even
 * with shadow off, the bridge still stands down while a browser tab owns dispatch
 * (StreamStrategyRegistry.GetDispatchOwner), so a tab must stop competing for ownership once this
 * returns false, or flipping shadow off server-side changes nothing observable.
 *
 * Returns `true` (shadow on) for anything this cannot positively rule out — unreachable bridge,
 * malformed response, or a strategyId the engine does not know — so the SAFE default is always
 * "the tab keeps dispatching," never "assume the bridge has it."
 */
export async function fetchServerEngineShadowMode(strategyId: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(bridgeUrl("/api/stream/caesar/engine"), { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok === false) return true;
    const map = json?.engine?.strategyShadowMode;
    const value = map && typeof map === "object" ? map[strategyId] : undefined;
    return value !== false;
  } catch {
    return true;
  }
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
