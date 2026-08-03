"use client";

import { useSyncExternalStore } from "react";
import { useStreamStores } from "./streamStoreRegistry";

export class StreamUpdatedAtStore {
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

export function useStreamUpdatedAt(): number | null {
  const store = useStreamStores().updatedAt;
  return useSyncExternalStore(
    store.subscribe,
    () => store.getValue(),
    () => null
  );
}
