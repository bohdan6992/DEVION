"use client";

import { useSyncExternalStore } from "react";
import type { StreamOrderIntent } from "./streamEngine";

export type StreamOrderIntentMeta = {
  queuedCount: number;
};

const EMPTY_META: StreamOrderIntentMeta = {
  queuedCount: 0,
};

function sameIntent(left: StreamOrderIntent, right: StreamOrderIntent): boolean {
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

function sameIntentArray(left: StreamOrderIntent[], right: StreamOrderIntent[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameIntent(left[index], right[index])) return false;
  }
  return true;
}

class StreamOrderIntentStore {
  private rows: StreamOrderIntent[] = [];
  private meta: StreamOrderIntentMeta = EMPTY_META;
  private listeners = new Set<() => void>();

  getRows(): StreamOrderIntent[] {
    return this.rows;
  }

  getMeta(): StreamOrderIntentMeta {
    return this.meta;
  }

  applySnapshot(rows: StreamOrderIntent[]): void {
    const nextRows = rows.slice();
    const nextMeta: StreamOrderIntentMeta = {
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

export const streamOrderIntentStore = new StreamOrderIntentStore();

export function useStreamOrderIntentRows(): StreamOrderIntent[] {
  return useSyncExternalStore(
    streamOrderIntentStore.subscribe,
    () => streamOrderIntentStore.getRows(),
    () => []
  );
}

export function useStreamOrderIntentMeta(): StreamOrderIntentMeta {
  return useSyncExternalStore(
    streamOrderIntentStore.subscribe,
    () => streamOrderIntentStore.getMeta(),
    () => EMPTY_META
  );
}
