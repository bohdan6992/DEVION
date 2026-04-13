"use client";

import { useSyncExternalStore } from "react";

export type MoneyDecisionStoreRow = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  safePrice: number | null;
  netEdge: number | null;
  positionBp: number | null;
  status: "ENTRY_READY" | "HOLD" | "EXIT_READY" | "EXIT_BLOCKED" | "BLOCKED_SPREAD" | "BLOCKED_EDGE";
  reason: string;
  updatedAt: number;
};

function sameNullableNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

function sameDecisionRow(a: MoneyDecisionStoreRow | undefined, b: MoneyDecisionStoreRow): boolean {
  if (!a) return false;
  return (
    a.ticker === b.ticker &&
    a.benchmark === b.benchmark &&
    a.side === b.side &&
    sameNullableNumber(a.signal, b.signal) &&
    sameNullableNumber(a.spread, b.spread) &&
    sameNullableNumber(a.safePrice, b.safePrice) &&
    sameNullableNumber(a.netEdge, b.netEdge) &&
    sameNullableNumber(a.positionBp, b.positionBp) &&
    a.status === b.status &&
    a.reason === b.reason &&
    a.updatedAt === b.updatedAt
  );
}

class MoneyDecisionStore {
  private rows = new Map<string, MoneyDecisionStoreRow>();
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

  getRow(id: string): MoneyDecisionStoreRow | null {
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

  applySnapshot(nextRows: MoneyDecisionStoreRow[]): void {
    const nextIds = nextRows.map((row) => row.ticker);
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
      const prev = this.rows.get(row.ticker);
      if (!sameDecisionRow(prev, row)) {
        this.rows.set(row.ticker, row);
        this.rowListeners.get(row.ticker)?.forEach((listener) => listener());
        anyRowChanged = true;
      }
      prevIdSet.delete(row.ticker);
    }

    if (idsChanged) {
      this.ids = nextIds;
      this.idsListeners.forEach((listener) => listener());
    }

    if (idsChanged || anyRowChanged) {
      this.version += 1;
      this.versionListeners.forEach((listener) => listener());
    }
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

export const moneyDecisionStore = new MoneyDecisionStore();

export function getMoneyDecisionRow(id: string): MoneyDecisionStoreRow | null {
  return moneyDecisionStore.getRow(id);
}

export function useMoneyDecisionIds(): string[] {
  return useSyncExternalStore(
    moneyDecisionStore.subscribeToIds,
    () => moneyDecisionStore.getIds(),
    () => []
  );
}

export function useMoneyDecisionVersion(): number {
  return useSyncExternalStore(
    moneyDecisionStore.subscribeToVersion,
    () => moneyDecisionStore.getVersion(),
    () => 0
  );
}

export function useMoneyDecisionRow(id: string): MoneyDecisionStoreRow | null {
  return useSyncExternalStore(
    (listener) => moneyDecisionStore.subscribeToRow(id, listener),
    () => moneyDecisionStore.getRow(id),
    () => null
  );
}
