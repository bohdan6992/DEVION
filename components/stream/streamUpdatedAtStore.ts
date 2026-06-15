"use client";

import { useSyncExternalStore } from "react";

class StreamUpdatedAtStore {
  private updatedAt: number | null = null;
  private listeners = new Set<() => void>();

  getValue(): number | null {
    return this.updatedAt;
  }

  setValue(nextValue: number | null): void {
    if (this.updatedAt === nextValue) return;
    this.updatedAt = nextValue;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    if (this.updatedAt == null) return;
    this.updatedAt = null;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const streamUpdatedAtStore = new StreamUpdatedAtStore();

export function useStreamUpdatedAt(): number | null {
  return useSyncExternalStore(
    streamUpdatedAtStore.subscribe,
    () => streamUpdatedAtStore.getValue(),
    () => null
  );
}
