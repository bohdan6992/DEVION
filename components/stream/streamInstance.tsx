"use client";

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";

/**
 * Identity of one STREAM strategy instance.
 *
 * Several instances run in parallel over the SAME live signal feed, each with its own filters,
 * thresholds, positions and action log. Everything that used to be a module-level singleton
 * (stores, localStorage keys, order intent ids) is keyed by `instanceId` so two instances can
 * never read or overwrite each other's state.
 *
 * `strategyId` is the identity the BRIDGE knows this instance by. It must be stable across
 * reloads of the same strategy (unlike a random per-mount id), because the bridge holds ticker
 * leases against it — a strategy that comes back with a new id after F5 would look like a
 * different competitor and could be outranked by its own previous leases until they expire.
 */
export type StreamInstance = {
  /** Stable identity, unique per strategy. Used for stores, storage keys and bridge leases. */
  instanceId: string;
  /** Identity the bridge arbitrates on. Defaults to instanceId. */
  strategyId: string;
  /** Human label shown in the UI and in the bridge's strategy snapshot. */
  label: string;
  /**
   * Arbitration priority — HIGHER WINS. When two instances want the same ticker at the same
   * minute boundary, the bridge grants it to the higher number. Ties fall back to whoever
   * claimed first, so give every strategy a distinct priority if the order matters.
   */
  priority: number;
  /** localStorage namespace root, e.g. "stream.arbitrage". */
  lsPrefix: string;
};

const DEFAULT_INSTANCE: StreamInstance = {
  instanceId: "stream.arbitrage",
  strategyId: "stream.arbitrage",
  label: "Arbitrage Stream",
  priority: 0,
  lsPrefix: "stream.arbitrage",
};

const StreamInstanceContext = createContext<StreamInstance>(DEFAULT_INSTANCE);

export type StreamInstanceProviderProps = {
  instanceId: string;
  strategyId?: string;
  label?: string;
  priority?: number;
  lsPrefix?: string;
  children: ReactNode;
};

export function StreamInstanceProvider({
  instanceId,
  strategyId,
  label,
  priority,
  lsPrefix,
  children,
}: StreamInstanceProviderProps) {
  const value = useMemo<StreamInstance>(() => ({
    instanceId,
    strategyId: strategyId ?? instanceId,
    label: label ?? instanceId,
    priority: priority ?? 0,
    lsPrefix: lsPrefix ?? instanceId,
  }), [instanceId, label, lsPrefix, priority, strategyId]);

  return createElement(StreamInstanceContext.Provider, { value }, children);
}

export function useStreamInstance(): StreamInstance {
  return useContext(StreamInstanceContext);
}

/** Namespaced localStorage key for this instance. */
export function streamInstanceKey(instance: StreamInstance, ...parts: Array<string | number>): string {
  return [instance.lsPrefix, ...parts].join(".");
}

export { DEFAULT_INSTANCE as defaultStreamInstance };
