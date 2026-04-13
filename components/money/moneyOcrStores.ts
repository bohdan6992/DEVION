"use client";

import { useSyncExternalStore } from "react";
import type {
  MainWindowDataField,
  MainWindowDataSnapshot,
  MainWindowControlState,
  MarketMakerBookLevel,
  MarketMakerBookSnapshot,
} from "./moneyEngine";

export type MoneyOcrSnapshotState<T> = {
  initialized: boolean;
  snapshot: T | null;
};

type BookPatch = {
  windowTitle?: string;
  capturedAtUtc?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  bidLevels?: MarketMakerBookLevel[];
  askLevels?: MarketMakerBookLevel[];
};

type MainWindowPatch = {
  windowTitle?: string;
  capturedAtUtc?: string;
  fields?: MainWindowDataField[];
  controls?: MainWindowControlState[];
};

const EMPTY_BOOK_STATE: MoneyOcrSnapshotState<MarketMakerBookSnapshot> = {
  initialized: false,
  snapshot: null,
};

const EMPTY_MAIN_WINDOW_STATE: MoneyOcrSnapshotState<MainWindowDataSnapshot> = {
  initialized: false,
  snapshot: null,
};

function sameBookLevel(
  left: MarketMakerBookLevel | null | undefined,
  right: MarketMakerBookLevel | null | undefined,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.exchange === right.exchange && left.size === right.size && left.price === right.price;
}

function sameBookLevels(
  left: MarketMakerBookLevel[],
  right: MarketMakerBookLevel[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameBookLevel(left[index], right[index])) return false;
  }
  return true;
}

function sameBookSnapshot(
  left: MarketMakerBookSnapshot | null,
  right: MarketMakerBookSnapshot | null,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    left.windowTitle === right.windowTitle &&
    left.bestBid === right.bestBid &&
    left.bestAsk === right.bestAsk &&
    sameBookLevels(left.bidLevels, right.bidLevels) &&
    sameBookLevels(left.askLevels, right.askLevels)
  );
}

function sameMainWindowField(
  left: MainWindowDataField | null | undefined,
  right: MainWindowDataField | null | undefined,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.heading === right.heading && left.value === right.value && left.rawLine === right.rawLine;
}

function sameMainWindowFields(
  left: MainWindowDataField[],
  right: MainWindowDataField[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameMainWindowField(left[index], right[index])) return false;
  }
  return true;
}

function sameMainWindowControl(
  left: MainWindowControlState | null | undefined,
  right: MainWindowControlState | null | undefined,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.label === right.label && left.state === right.state;
}

function sameMainWindowControls(
  left: MainWindowControlState[],
  right: MainWindowControlState[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameMainWindowControl(left[index], right[index])) return false;
  }
  return true;
}

function sameMainWindowSnapshot(
  left: MainWindowDataSnapshot | null,
  right: MainWindowDataSnapshot | null,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    left.windowTitle === right.windowTitle &&
    sameMainWindowFields(left.fields, right.fields) &&
    sameMainWindowControls(left.controls, right.controls)
  );
}

function normalizeBookSnapshot(snapshot: MarketMakerBookSnapshot): MarketMakerBookSnapshot {
  return {
    windowTitle: snapshot.windowTitle,
    capturedAtUtc: snapshot.capturedAtUtc,
    bestBid: snapshot.bestBid ?? null,
    bestAsk: snapshot.bestAsk ?? null,
    bidLevels: Array.isArray(snapshot.bidLevels) ? snapshot.bidLevels.slice(0, 5) : [],
    askLevels: Array.isArray(snapshot.askLevels) ? snapshot.askLevels.slice(0, 5) : [],
    ocrLines: Array.isArray(snapshot.ocrLines) ? snapshot.ocrLines.filter(Boolean) : [],
    ocrText: String(snapshot.ocrText ?? ""),
  };
}

function normalizeMainWindowSnapshot(snapshot: MainWindowDataSnapshot): MainWindowDataSnapshot {
  return {
    windowTitle: snapshot.windowTitle,
    capturedAtUtc: snapshot.capturedAtUtc,
    fields: Array.isArray(snapshot.fields)
      ? snapshot.fields.map((field) => ({
          heading: String(field.heading ?? "").trim(),
          value: String(field.value ?? "").trim(),
          rawLine: String(field.rawLine ?? "").trim(),
        }))
      : [],
    controls: Array.isArray(snapshot.controls)
      ? snapshot.controls.map((control) => ({
          label: String(control.label ?? "").trim().toUpperCase(),
          state: control.state === "GREEN" || control.state === "RED" ? control.state : "UNKNOWN",
        }))
      : [],
    ocrLines: Array.isArray(snapshot.ocrLines) ? snapshot.ocrLines.map((line) => String(line ?? "").trim()).filter(Boolean) : [],
    ocrText: String(snapshot.ocrText ?? "").trim(),
  };
}

class MoneyBookStore {
  private state: MoneyOcrSnapshotState<MarketMakerBookSnapshot> = EMPTY_BOOK_STATE;
  private listeners = new Set<() => void>();

  getState(): MoneyOcrSnapshotState<MarketMakerBookSnapshot> {
    return this.state;
  }

  applySnapshot(snapshot: MarketMakerBookSnapshot): void {
    const normalizedSnapshot = normalizeBookSnapshot(snapshot);
    if (sameBookSnapshot(this.state.snapshot, normalizedSnapshot) && this.state.initialized) return;
    this.state = {
      initialized: true,
      snapshot: normalizedSnapshot,
    };
    this.listeners.forEach((listener) => listener());
  }

  applyPatch(patch: BookPatch): void {
    if (!this.state.snapshot) return;
    const nextSnapshot: MarketMakerBookSnapshot = {
      ...this.state.snapshot,
      ...(patch.windowTitle !== undefined ? { windowTitle: patch.windowTitle } : {}),
      ...(patch.capturedAtUtc !== undefined ? { capturedAtUtc: patch.capturedAtUtc } : {}),
      ...(patch.bestBid !== undefined ? { bestBid: patch.bestBid } : {}),
      ...(patch.bestAsk !== undefined ? { bestAsk: patch.bestAsk } : {}),
      ...(patch.bidLevels !== undefined ? { bidLevels: patch.bidLevels.slice(0, 5) } : {}),
      ...(patch.askLevels !== undefined ? { askLevels: patch.askLevels.slice(0, 5) } : {}),
    };
    if (sameBookSnapshot(this.state.snapshot, nextSnapshot)) return;
    this.state = {
      initialized: true,
      snapshot: nextSnapshot,
    };
    this.listeners.forEach((listener) => listener());
  }

  setUnbound(): void {
    if (this.state.initialized && this.state.snapshot == null) return;
    this.state = {
      initialized: true,
      snapshot: null,
    };
    this.listeners.forEach((listener) => listener());
  }

  reset(): void {
    if (!this.state.initialized && this.state.snapshot == null) return;
    this.state = EMPTY_BOOK_STATE;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

class MoneyMainWindowStore {
  private state: MoneyOcrSnapshotState<MainWindowDataSnapshot> = EMPTY_MAIN_WINDOW_STATE;
  private listeners = new Set<() => void>();

  getState(): MoneyOcrSnapshotState<MainWindowDataSnapshot> {
    return this.state;
  }

  applySnapshot(snapshot: MainWindowDataSnapshot): void {
    const normalizedSnapshot = normalizeMainWindowSnapshot(snapshot);
    if (sameMainWindowSnapshot(this.state.snapshot, normalizedSnapshot) && this.state.initialized) return;
    this.state = {
      initialized: true,
      snapshot: normalizedSnapshot,
    };
    this.listeners.forEach((listener) => listener());
  }

  applyPatch(patch: MainWindowPatch): void {
    if (!this.state.snapshot) return;

    const nextSnapshot: MainWindowDataSnapshot = {
      ...this.state.snapshot,
      ...(patch.windowTitle !== undefined ? { windowTitle: patch.windowTitle } : {}),
      ...(patch.capturedAtUtc !== undefined ? { capturedAtUtc: patch.capturedAtUtc } : {}),
      fields: patch.fields ? mergeFields(this.state.snapshot.fields, patch.fields) : this.state.snapshot.fields,
      controls: patch.controls ? mergeControls(this.state.snapshot.controls, patch.controls) : this.state.snapshot.controls,
    };
    if (sameMainWindowSnapshot(this.state.snapshot, nextSnapshot)) return;

    this.state = {
      initialized: true,
      snapshot: nextSnapshot,
    };
    this.listeners.forEach((listener) => listener());
  }

  setUnbound(): void {
    if (this.state.initialized && this.state.snapshot == null) return;
    this.state = {
      initialized: true,
      snapshot: null,
    };
    this.listeners.forEach((listener) => listener());
  }

  reset(): void {
    if (!this.state.initialized && this.state.snapshot == null) return;
    this.state = EMPTY_MAIN_WINDOW_STATE;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

function mergeFields(previous: MainWindowDataField[], patchFields: MainWindowDataField[]): MainWindowDataField[] {
  const fieldMap = new Map<string, MainWindowDataField>();
  for (const field of previous) {
    fieldMap.set(field.heading, field);
  }
  for (const field of patchFields) {
    fieldMap.set(field.heading, field);
  }
  return Array.from(fieldMap.values());
}

function mergeControls(previous: MainWindowControlState[], patchControls: MainWindowControlState[]): MainWindowControlState[] {
  const controlMap = new Map<string, MainWindowControlState>();
  for (const control of previous) {
    controlMap.set(control.label, control);
  }
  for (const control of patchControls) {
    controlMap.set(control.label, control);
  }
  return Array.from(controlMap.values());
}

export const moneyBookStore = new MoneyBookStore();
export const moneyMainWindowStore = new MoneyMainWindowStore();

export function resetMoneyOcrStores(): void {
  moneyBookStore.reset();
  moneyMainWindowStore.reset();
}

export function useMoneyBookSnapshotState(): MoneyOcrSnapshotState<MarketMakerBookSnapshot> {
  return useSyncExternalStore(
    moneyBookStore.subscribe,
    () => moneyBookStore.getState(),
    () => EMPTY_BOOK_STATE
  );
}

export function useMoneyMainWindowSnapshotState(): MoneyOcrSnapshotState<MainWindowDataSnapshot> {
  return useSyncExternalStore(
    moneyMainWindowStore.subscribe,
    () => moneyMainWindowStore.getState(),
    () => EMPTY_MAIN_WINDOW_STATE
  );
}
