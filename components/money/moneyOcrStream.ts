"use client";

import { bridgeUrl } from "../../lib/bridgeBase";
import { moneyExecutionStore } from "./moneyExecutionStore";
import { moneyBookStore, moneyMainWindowStore } from "./moneyOcrStores";

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
    moneyBookStore.applySnapshot(payload);
  });

  source.addEventListener("book_patch", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    moneyBookStore.applyPatch(payload);
  });

  source.addEventListener("book_unbound", () => {
    moneyBookStore.setUnbound();
  });

  source.addEventListener("mainwindow_snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    moneyMainWindowStore.applySnapshot(payload);
  });

  source.addEventListener("mainwindow_patch", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    moneyMainWindowStore.applyPatch(payload);
  });

  source.addEventListener("mainwindow_unbound", () => {
    moneyMainWindowStore.setUnbound();
  });

  source.addEventListener("execution_snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    moneyExecutionStore.applySnapshot(payload);
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

export function connectMoneyOcrStream(): () => void {
  subscriberCount += 1;
  ensureConnected();

  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    disconnectIfUnused();
  };
}
