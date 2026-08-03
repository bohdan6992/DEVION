"use client";

import { StreamActionLogStore } from "./streamActionLogStore";
import { StreamDecisionStore } from "./streamDecisionStore";
import { StreamFilterPassLogStore } from "./streamFilterPassLogStore";
import { StreamLogStore } from "./streamLogStore";
import { StreamOrderIntentStore } from "./streamOrderIntentStore";
import { StreamPositionStore } from "./streamPositionStore";
import { StreamSignalStore } from "./streamSignalStore";
import { StreamUpdatedAtStore } from "./streamUpdatedAtStore";
import { useStreamInstance } from "./streamInstance";

/**
 * Per-instance store bundle.
 *
 * These stores hold state that belongs to ONE strategy: its decisions, its positions, its action
 * log. They used to be module-level singletons, which silently made every strategy instance share
 * one set — two instances on the same page overwrote each other's positions on every tick.
 *
 * NOT included here, deliberately: the execution snapshot and the OCR book/main-window stores.
 * Those mirror global bridge/TradingApp state (one queue, one bound window), so all instances
 * must see the SAME values — see streamSharedStores.ts.
 */
export type StreamStores = {
  decision: StreamDecisionStore;
  position: StreamPositionStore;
  signal: StreamSignalStore;
  orderIntent: StreamOrderIntentStore;
  actionLog: StreamActionLogStore;
  updatedAt: StreamUpdatedAtStore;
  log: StreamLogStore;
  filterPassLog: StreamFilterPassLogStore;
};

const registry = new Map<string, StreamStores>();

function createStreamStores(instanceId: string): StreamStores {
  const decision = new StreamDecisionStore();
  return {
    decision,
    // Position rows are derived from this instance's own decisions — hence the injection.
    position: new StreamPositionStore(decision),
    signal: new StreamSignalStore(),
    orderIntent: new StreamOrderIntentStore(),
    actionLog: new StreamActionLogStore(),
    updatedAt: new StreamUpdatedAtStore(),
    log: new StreamLogStore(instanceId),
    filterPassLog: new StreamFilterPassLogStore(),
  };
}

/**
 * Stores for one strategy instance, created on first use. Stable across re-renders, so the
 * `subscribe` identities stay stable for useSyncExternalStore.
 */
export function getStreamStores(instanceId: string): StreamStores {
  let stores = registry.get(instanceId);
  if (!stores) {
    stores = createStreamStores(instanceId);
    registry.set(instanceId, stores);
  }
  return stores;
}

export function useStreamStores(): StreamStores {
  return getStreamStores(useStreamInstance().instanceId);
}

/**
 * Drops an instance's stores. Only call this when a strategy is being removed for good — NOT on
 * unmount of a panel that may come back, because the action log and simulation log are the
 * in-memory mirror of what that strategy currently holds.
 */
export function disposeStreamStores(instanceId: string): void {
  const stores = registry.get(instanceId);
  if (!stores) return;
  stores.position.dispose();
  registry.delete(instanceId);
}

/** Clears every per-instance store without destroying the bundle (used on disable/reset). */
export function clearStreamStores(instanceId: string): void {
  const stores = registry.get(instanceId);
  if (!stores) return;
  stores.decision.clear();
  stores.position.clear();
  stores.signal.clear();
  stores.orderIntent.clear();
  stores.actionLog.clear();
  stores.updatedAt.clear();
  stores.filterPassLog.clear();
}

export function listStreamStoreInstances(): string[] {
  return Array.from(registry.keys());
}
