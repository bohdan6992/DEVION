"use client";

import { bridgeUrl } from "../../lib/bridgeBase";
import { streamExecutionStore } from "./streamExecutionStore";
import { streamBookStore, streamMainWindowStore } from "./streamOcrStores";

let streamSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let subscriberCount = 0;

function clearReconnectTimer(): void {
  if (reconnectTimer == null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function ensureConnected(): void {
  if (typeof window === "undefined") return;
  if (streamSource) return;

  const source = new EventSource(bridgeUrl("/api/execution/tradingapp/ocr-stream"));
  streamSource = source;

  source.addEventListener("book_snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    streamBookStore.applySnapshot(payload);
  });

  source.addEventListener("book_patch", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    streamBookStore.applyPatch(payload);
  });

  source.addEventListener("book_unbound", () => {
    streamBookStore.setUnbound();
  });

  source.addEventListener("mainwindow_snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    streamMainWindowStore.applySnapshot(payload);
  });

  source.addEventListener("mainwindow_patch", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    streamMainWindowStore.applyPatch(payload);
  });

  source.addEventListener("mainwindow_unbound", () => {
    streamMainWindowStore.setUnbound();
  });

  source.addEventListener("execution_snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    streamExecutionStore.applySnapshot(payload);
  });

  source.onerror = () => {
    source.close();
    if (streamSource === source) {
      streamSource = null;
    }
    clearReconnectTimer();
    if (subscriberCount > 0) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        ensureConnected();
      }, 3000);
    }
  };
}

function disconnectIfUnused(): void {
  if (subscriberCount > 0) return;
  clearReconnectTimer();
  if (!streamSource) return;
  streamSource.close();
  streamSource = null;
}

export function connectStreamOcrFeed(): () => void {
  subscriberCount += 1;
  ensureConnected();

  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    disconnectIfUnused();
  };
}
