"use client";

import { useSyncExternalStore } from "react";
import type { TradingAppBoundWindowInfo, TradingAppExecutionSnapshot } from "./moneyEngine";

function sameSteps(
  left: { step: string; message: string; atUtc: string }[],
  right: { step: string; message: string; atUtc: string }[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].step !== right[index].step ||
      left[index].message !== right[index].message ||
      left[index].atUtc !== right[index].atUtc
    ) {
      return false;
    }
  }
  return true;
}

function sameTickerPoint(
  left: TradingAppBoundWindowInfo["tickerPoint"],
  right: TradingAppBoundWindowInfo["tickerPoint"],
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    left.isSet === right.isSet &&
    left.relativeX === right.relativeX &&
    left.relativeY === right.relativeY &&
    left.screenX === right.screenX &&
    left.screenY === right.screenY &&
    left.capturedAtUtc === right.capturedAtUtc
  );
}

function sameWindowInfo(
  left: TradingAppExecutionSnapshot["boundWindow"] | null | undefined,
  right: TradingAppExecutionSnapshot["boundWindow"] | null | undefined,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    left.isBound === right.isBound &&
    left.handle === right.handle &&
    left.processId === right.processId &&
    left.title === right.title &&
    left.className === right.className &&
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height &&
    left.boundAtUtc === right.boundAtUtc &&
    sameTickerPoint(left.tickerPoint, right.tickerPoint)
  );
}

function sameQueueItem(
  left: TradingAppExecutionSnapshot["queue"][number],
  right: TradingAppExecutionSnapshot["queue"][number],
): boolean {
  return (
    left.intentId === right.intentId &&
    left.ticker === right.ticker &&
    left.type === right.type &&
    left.source === right.source &&
    left.status === right.status &&
    left.message === right.message &&
    left.hotkey === right.hotkey &&
    left.delayMinMs === right.delayMinMs &&
    left.delayMaxMs === right.delayMaxMs &&
    left.appliedDelayMs === right.appliedDelayMs &&
    left.createdAtUtc === right.createdAtUtc &&
    left.startedAtUtc === right.startedAtUtc &&
    left.finishedAtUtc === right.finishedAtUtc &&
    sameSteps(left.steps, right.steps)
  );
}

function sameQueue(
  left: TradingAppExecutionSnapshot["queue"],
  right: TradingAppExecutionSnapshot["queue"],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameQueueItem(left[index], right[index])) return false;
  }
  return true;
}

function sameExecutionSnapshot(
  left: TradingAppExecutionSnapshot | null,
  right: TradingAppExecutionSnapshot | null,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    left.panicOff === right.panicOff &&
    left.isProcessing === right.isProcessing &&
    left.executionMode === right.executionMode &&
    sameWindowInfo(left.boundWindow, right.boundWindow) &&
    sameWindowInfo(left.mainWindow, right.mainWindow) &&
    (
      (left.current == null && right.current == null) ||
      (left.current != null && right.current != null && sameQueueItem(left.current, right.current))
    ) &&
    sameQueue(left.queue, right.queue) &&
    sameQueue(left.history, right.history)
  );
}

class MoneyExecutionStore {
  private snapshot: TradingAppExecutionSnapshot | null = null;
  private listeners = new Set<() => void>();

  getSnapshot(): TradingAppExecutionSnapshot | null {
    return this.snapshot;
  }

  applySnapshot(snapshot: TradingAppExecutionSnapshot | null): void {
    if (sameExecutionSnapshot(this.snapshot, snapshot)) return;
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    if (this.snapshot == null) return;
    this.snapshot = null;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const moneyExecutionStore = new MoneyExecutionStore();

export function useMoneyExecutionSnapshot(): TradingAppExecutionSnapshot | null {
  return useSyncExternalStore(
    moneyExecutionStore.subscribe,
    () => moneyExecutionStore.getSnapshot(),
    () => null
  );
}
