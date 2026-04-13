"use client";

import { useSyncExternalStore } from "react";
import type { MoneyOrderIntent } from "./moneyEngine";

export type MoneyOrderIntentMeta = {
  queuedCount: number;
};

const EMPTY_META: MoneyOrderIntentMeta = {
  queuedCount: 0,
};

function sameIntent(left: MoneyOrderIntent, right: MoneyOrderIntent): boolean {
  return (
    left.id === right.id &&
    left.ticker === right.ticker &&
    left.benchmark === right.benchmark &&
    left.side === right.side &&
    left.intent === right.intent &&
    left.sequence === right.sequence &&
    left.priceRef === right.priceRef &&
    left.status === right.status &&
    left.reason === right.reason &&
    left.createdAt === right.createdAt
  );
}

function sameIntentArray(left: MoneyOrderIntent[], right: MoneyOrderIntent[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameIntent(left[index], right[index])) return false;
  }
  return true;
}

class MoneyOrderIntentStore {
  private rows: MoneyOrderIntent[] = [];
  private meta: MoneyOrderIntentMeta = EMPTY_META;
  private listeners = new Set<() => void>();

  getRows(): MoneyOrderIntent[] {
    return this.rows;
  }

  getMeta(): MoneyOrderIntentMeta {
    return this.meta;
  }

  applySnapshot(rows: MoneyOrderIntent[]): void {
    const nextRows = rows.slice();
    const nextMeta: MoneyOrderIntentMeta = {
      queuedCount: nextRows.filter((row) => row.status === "QUEUED").length,
    };
    const rowsChanged = !sameIntentArray(this.rows, nextRows);
    const metaChanged = this.meta.queuedCount !== nextMeta.queuedCount;
    if (!rowsChanged && !metaChanged) return;
    this.rows = nextRows;
    this.meta = nextMeta;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    if (!this.rows.length && this.meta.queuedCount === 0) return;
    this.rows = [];
    this.meta = EMPTY_META;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const moneyOrderIntentStore = new MoneyOrderIntentStore();

export function useMoneyOrderIntentRows(): MoneyOrderIntent[] {
  return useSyncExternalStore(
    moneyOrderIntentStore.subscribe,
    () => moneyOrderIntentStore.getRows(),
    () => []
  );
}

export function useMoneyOrderIntentMeta(): MoneyOrderIntentMeta {
  return useSyncExternalStore(
    moneyOrderIntentStore.subscribe,
    () => moneyOrderIntentStore.getMeta(),
    () => EMPTY_META
  );
}
