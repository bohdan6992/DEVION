"use client";

import { streamExecutionStore } from "./streamExecutionStore";
import { resetStreamOcrStores } from "./streamOcrStores";

/**
 * Refcounted lifetime for the stores that mirror GLOBAL bridge state.
 *
 * The TradingApp execution queue and the bound Market Maker / Main window are singular: there is
 * one queue and one bound window no matter how many strategy instances are running. So those
 * stores stay shared — two instances must never disagree about what the bridge is doing.
 *
 * The problem that makes this file necessary: the engine clears those stores when an instance is
 * disabled. With one instance that was correct. With several, instance A going idle would wipe
 * the execution snapshot that instance B is actively trading against — B would then see
 * `panicOff: undefined` and lose its dispatch-confirmation source until the next poll.
 *
 * So instead of clearing directly, each instance acquires on enable and releases on disable, and
 * the shared state is only torn down once the LAST user lets go.
 */
const activeInstances = new Set<string>();

export function acquireSharedStreamStores(instanceId: string): void {
  activeInstances.add(instanceId);
}

export function releaseSharedStreamStores(instanceId: string): void {
  if (!activeInstances.delete(instanceId)) return;
  if (activeInstances.size > 0) return;
  streamExecutionStore.clear();
  resetStreamOcrStores();
}

/**
 * True while at least one other instance still depends on the shared bridge state. Callers use
 * this to decide whether a local teardown may also reset shared OCR state.
 */
export function hasOtherSharedStreamUsers(instanceId: string): boolean {
  for (const id of activeInstances) {
    if (id !== instanceId) return true;
  }
  return false;
}

export function listSharedStreamUsers(): string[] {
  return Array.from(activeInstances);
}
