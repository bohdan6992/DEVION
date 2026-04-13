"use client";

import { useSyncExternalStore } from "react";
import { getMoneyDecisionRow, moneyDecisionStore } from "./moneyDecisionStore";
import type { MoneyDecisionRow, MoneyPosition } from "./moneyEngine";

export type MoneyPositionMeta = {
  activeCount: number;
  openCount: number;
  exitBlockedCount: number;
  closedCount: number;
};

export type MoneyActiveDecisionRow = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  netEdge: number | null;
  status: MoneyDecisionRow["status"] | MoneyPosition["status"];
};

const EMPTY_META: MoneyPositionMeta = {
  activeCount: 0,
  openCount: 0,
  exitBlockedCount: 0,
  closedCount: 0,
};

function sameNullableNumber(left: number | null | undefined, right: number | null | undefined): boolean {
  if (left == null && right == null) return true;
  return left === right;
}

function samePosition(left: MoneyPosition, right: MoneyPosition): boolean {
  return (
    left.ticker === right.ticker &&
    left.benchmark === right.benchmark &&
    left.side === right.side &&
    sameNullableNumber(left.entrySignal, right.entrySignal) &&
    sameNullableNumber(left.lastSignal, right.lastSignal) &&
    sameNullableNumber(left.lastScaleSignal, right.lastScaleSignal) &&
    sameNullableNumber(left.spread, right.spread) &&
    left.status === right.status &&
    left.reason === right.reason &&
    left.entryCount === right.entryCount &&
    left.lockedForPrint === right.lockedForPrint &&
    left.pendingIntent === right.pendingIntent &&
    sameNullableNumber(left.entryDispatchedAt, right.entryDispatchedAt) &&
    sameNullableNumber(left.lastConfirmedActiveAt, right.lastConfirmedActiveAt) &&
    left.openedAt === right.openedAt &&
    left.updatedAt === right.updatedAt
  );
}

function samePositionArray(left: MoneyPosition[], right: MoneyPosition[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!samePosition(left[index], right[index])) return false;
  }
  return true;
}

function sameActiveRow(left: MoneyActiveDecisionRow, right: MoneyActiveDecisionRow): boolean {
  return (
    left.ticker === right.ticker &&
    left.benchmark === right.benchmark &&
    left.side === right.side &&
    sameNullableNumber(left.signal, right.signal) &&
    sameNullableNumber(left.spread, right.spread) &&
    sameNullableNumber(left.netEdge, right.netEdge) &&
    left.status === right.status
  );
}

function sameActiveRowArray(left: MoneyActiveDecisionRow[], right: MoneyActiveDecisionRow[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameActiveRow(left[index], right[index])) return false;
  }
  return true;
}

function sameMeta(left: MoneyPositionMeta, right: MoneyPositionMeta): boolean {
  return (
    left.activeCount === right.activeCount &&
    left.openCount === right.openCount &&
    left.exitBlockedCount === right.exitBlockedCount &&
    left.closedCount === right.closedCount
  );
}

function countsAsOpen(position: MoneyPosition): boolean {
  return (
    (position.status === "OPEN" || position.status === "PRINT_PENDING" || position.status === "EXIT_BLOCKED") &&
    (
      position.entryDispatchedAt != null ||
      position.lastConfirmedActiveAt != null ||
      (position.pendingIntent !== "ENTER_LONG_AGGRESSIVE" && position.pendingIntent !== "ENTER_SHORT_AGGRESSIVE")
    )
  );
}

function buildActiveRows(positions: MoneyPosition[]): MoneyActiveDecisionRow[] {
  const rows = new Map<string, MoneyActiveDecisionRow>();

  for (const position of positions) {
    if (position.status === "CLOSED" || position.status === "PENDING_ENTRY") continue;
    const decision = getMoneyDecisionRow(position.ticker);
    const signal = decision?.signal ?? position.lastSignal ?? position.entrySignal;
    const spread = decision?.spread ?? position.spread;
    const netEdge = decision?.netEdge ?? (signal != null ? Math.max(0, Math.abs(signal) - Math.max(0, spread ?? 0)) : null);
    rows.set(position.ticker, {
      ticker: position.ticker,
      benchmark: decision?.benchmark ?? position.benchmark,
      side: decision?.side ?? position.side,
      signal,
      spread,
      netEdge,
      status: position.status,
    });
  }

  return Array.from(rows.values()).sort((left, right) => left.ticker.localeCompare(right.ticker));
}

function buildMeta(positions: MoneyPosition[], activeRows: MoneyActiveDecisionRow[]): MoneyPositionMeta {
  return {
    activeCount: activeRows.length,
    openCount: positions.filter((row) => countsAsOpen(row)).length,
    exitBlockedCount: positions.filter((row) => row.status === "EXIT_BLOCKED").length,
    closedCount: positions.filter((row) => row.status === "CLOSED").length,
  };
}

class MoneyPositionStore {
  private rows: MoneyPosition[] = [];
  private activeRows: MoneyActiveDecisionRow[] = [];
  private meta: MoneyPositionMeta = EMPTY_META;
  private listeners = new Set<() => void>();

  constructor() {
    moneyDecisionStore.subscribeToVersion(() => {
      this.recomputeDerived();
    });
  }

  getRows(): MoneyPosition[] {
    return this.rows;
  }

  getActiveRows(): MoneyActiveDecisionRow[] {
    return this.activeRows;
  }

  getMeta(): MoneyPositionMeta {
    return this.meta;
  }

  applySnapshot(rows: MoneyPosition[]): void {
    const nextRows = rows.slice();
    const rowsChanged = !samePositionArray(this.rows, nextRows);
    if (rowsChanged) {
      this.rows = nextRows;
    }
    this.recomputeDerived(rowsChanged);
  }

  clear(): void {
    if (!this.rows.length && !this.activeRows.length && sameMeta(this.meta, EMPTY_META)) return;
    this.rows = [];
    this.activeRows = [];
    this.meta = EMPTY_META;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private recomputeDerived(forceNotify = false): void {
    const nextActiveRows = buildActiveRows(this.rows);
    const nextMeta = buildMeta(this.rows, nextActiveRows);
    const activeChanged = !sameActiveRowArray(this.activeRows, nextActiveRows);
    const metaChanged = !sameMeta(this.meta, nextMeta);
    if (!forceNotify && !activeChanged && !metaChanged) return;
    this.activeRows = nextActiveRows;
    this.meta = nextMeta;
    this.listeners.forEach((listener) => listener());
  }
}

export const moneyPositionStore = new MoneyPositionStore();

export function useMoneyPositionRows(): MoneyPosition[] {
  return useSyncExternalStore(
    moneyPositionStore.subscribe,
    () => moneyPositionStore.getRows(),
    () => []
  );
}

export function useMoneyActiveDecisionRows(): MoneyActiveDecisionRow[] {
  return useSyncExternalStore(
    moneyPositionStore.subscribe,
    () => moneyPositionStore.getActiveRows(),
    () => []
  );
}

export function useMoneyPositionMeta(): MoneyPositionMeta {
  return useSyncExternalStore(
    moneyPositionStore.subscribe,
    () => moneyPositionStore.getMeta(),
    () => EMPTY_META
  );
}
