"use client";

import { useSyncExternalStore } from "react";
import { useStreamStores } from "./streamStoreRegistry";

export type StreamDecisionStoreRow = {
  ticker: string;
  /** The situation this row belongs to; null for single-ticker strategies. */
  pairKey?: string | null;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  spreadBidPct: number | null;
  safePrice: number | null;
  netEdge: number | null;
  positionBp: number | null;
  report: string | null;
  status: "ENTRY_READY" | "HOLD" | "EXIT_READY" | "EXIT_BLOCKED" | "BLOCKED_SPREAD" | "BLOCKED_EDGE";
  reason: string;
  updatedAt: number;
};

/**
 * The row's identity in this store.
 *
 * The ticker alone was enough while a ticker could be in one situation at a time. PairFlux can
 * hold the same name against several partners at once, and keying by ticker would keep only the
 * last of them — 54 FMTM pairs would render as one row and 53 would silently vanish. Consumers
 * treat the id as opaque (they call getRow(id) and read row.ticker to display), so widening it
 * costs them nothing.
 */
function keyOf(row: { ticker: string; pairKey?: string | null }): string {
  return row.pairKey ? `${row.ticker}|${row.pairKey}` : row.ticker;
}

function sameNullableNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

function sameDecisionRow(a: StreamDecisionStoreRow | undefined, b: StreamDecisionStoreRow): boolean {
  if (!a) return false;
  return (
    a.ticker === b.ticker &&
    a.benchmark === b.benchmark &&
    a.side === b.side &&
    sameNullableNumber(a.signal, b.signal) &&
    sameNullableNumber(a.spread, b.spread) &&
    sameNullableNumber(a.spreadBidPct, b.spreadBidPct) &&
    sameNullableNumber(a.safePrice, b.safePrice) &&
    sameNullableNumber(a.netEdge, b.netEdge) &&
    sameNullableNumber(a.positionBp, b.positionBp) &&
    a.report === b.report &&
    a.status === b.status &&
    // `updatedAt` is diagnostic metadata. It is regenerated on every engine tick, while the
    // fields above are the actual row contents shown to the user and used by subscribers.
    a.reason === b.reason
  );
}

export class StreamDecisionStore {
  private rows = new Map<string, StreamDecisionStoreRow>();
  private ids: string[] = [];
  private version = 0;
  private idsListeners = new Set<() => void>();
  private versionListeners = new Set<() => void>();
  private rowListeners = new Map<string, Set<() => void>>();

  getIds(): string[] {
    return this.ids;
  }

  getVersion(): number {
    return this.version;
  }

  getRow(id: string): StreamDecisionStoreRow | null {
    return this.rows.get(id) ?? null;
  }

  subscribeToIds = (listener: () => void): (() => void) => {
    this.idsListeners.add(listener);
    return () => {
      this.idsListeners.delete(listener);
    };
  };

  subscribeToVersion = (listener: () => void): (() => void) => {
    this.versionListeners.add(listener);
    return () => {
      this.versionListeners.delete(listener);
    };
  };

  subscribeToRow = (id: string, listener: () => void): (() => void) => {
    let listeners = this.rowListeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.rowListeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = this.rowListeners.get(id);
      if (!current) return;
      current.delete(listener);
      if (!current.size) {
        this.rowListeners.delete(id);
      }
    };
  };

  /** Returns true only when the visible decision data actually changed. */
  applySnapshot(nextRows: StreamDecisionStoreRow[]): boolean {
    const nextIds = nextRows.map((row) => keyOf(row));
    const prevIds = this.ids;
    const prevIdSet = new Set(prevIds);
    const nextIdSet = new Set(nextIds);
    let idsChanged = prevIds.length !== nextIds.length;
    let anyRowChanged = false;

    if (!idsChanged) {
      for (let index = 0; index < prevIds.length; index += 1) {
        if (prevIds[index] !== nextIds[index]) {
          idsChanged = true;
          break;
        }
      }
    }

    for (const id of prevIds) {
      if (!nextIdSet.has(id)) {
        this.rows.delete(id);
        anyRowChanged = true;
      }
    }

    for (const row of nextRows) {
      const key = keyOf(row);
      const prev = this.rows.get(key);
      if (!sameDecisionRow(prev, row)) {
        this.rows.set(key, row);
        this.rowListeners.get(key)?.forEach((listener) => listener());
        anyRowChanged = true;
      }
      prevIdSet.delete(key);
    }

    if (idsChanged) {
      this.ids = nextIds;
      this.idsListeners.forEach((listener) => listener());
    }

    const changed = idsChanged || anyRowChanged;
    if (changed) {
      this.version += 1;
      this.versionListeners.forEach((listener) => listener());
    }
    return changed;
  }

  clear(): void {
    if (!this.ids.length && !this.rows.size) return;
    const prevIds = this.ids;
    this.rows.clear();
    this.ids = [];
    this.version += 1;
    this.idsListeners.forEach((listener) => listener());
    this.versionListeners.forEach((listener) => listener());
    prevIds.forEach((id) => this.rowListeners.get(id)?.forEach((listener) => listener()));
  }
}

export function useStreamDecisionIds(): string[] {
  const store = useStreamStores().decision;
  return useSyncExternalStore(
    store.subscribeToIds,
    () => store.getIds(),
    () => []
  );
}

export function useStreamDecisionVersion(): number {
  const store = useStreamStores().decision;
  return useSyncExternalStore(
    store.subscribeToVersion,
    () => store.getVersion(),
    () => 0
  );
}

export function useStreamDecisionRow(id: string): StreamDecisionStoreRow | null {
  const store = useStreamStores().decision;
  return useSyncExternalStore(
    (listener) => store.subscribeToRow(id, listener),
    () => store.getRow(id),
    () => null
  );
}
