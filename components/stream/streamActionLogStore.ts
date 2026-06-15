"use client";

import { useSyncExternalStore } from "react";
import type { StreamActionLogEntry } from "./streamEngine";

function sameEntry(left: StreamActionLogEntry, right: StreamActionLogEntry): boolean {
  return (
    left.id === right.id &&
    left.dayKey === right.dayKey &&
    left.ticker === right.ticker &&
    left.benchmark === right.benchmark &&
    left.side === right.side &&
    left.kind === right.kind &&
    left.deviation === right.deviation &&
    left.at === right.at &&
    left.intent === right.intent
  );
}

function sameEntryArray(left: StreamActionLogEntry[], right: StreamActionLogEntry[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameEntry(left[index], right[index])) return false;
  }
  return true;
}

class StreamActionLogStore {
  private rows: StreamActionLogEntry[] = [];
  private listeners = new Set<() => void>();

  getRows(): StreamActionLogEntry[] {
    return this.rows;
  }

  applySnapshot(rows: StreamActionLogEntry[]): void {
    const nextRows = rows.slice();
    if (sameEntryArray(this.rows, nextRows)) return;
    this.rows = nextRows;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    if (!this.rows.length) return;
    this.rows = [];
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const streamActionLogStore = new StreamActionLogStore();

export function useStreamActionLogRows(): StreamActionLogEntry[] {
  return useSyncExternalStore(
    streamActionLogStore.subscribe,
    () => streamActionLogStore.getRows(),
    () => []
  );
}
