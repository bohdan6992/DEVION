"use client";

import { useSyncExternalStore } from "react";

// ---- types ----------------------------------------------------------------

export type StreamLogEvent = "ENTRY" | "ADD" | "EXIT" | "EXIT_PRINT" | "CLOSE_ALL";

export type StreamLogEntry = {
  seq: number;              // monotonic counter
  ts: number;               // unix ms
  timeStr: string;          // "HH:MM:SS.mmm"
  event: StreamLogEvent;
  status: "SENT" | "FAILED" | "SIMULATED";
  betaMode: boolean;

  ticker: string;
  benchmark: string;
  side: "Long" | "Short";

  // Signal at dispatch time (sigma)
  sigmaZap: number | null;
  zapSsigma: number | null;   // normalized short sigma
  zapLsigma: number | null;   // normalized long sigma
  // ZAP in % (raw pct, not sigma)
  zapPct: number | null;
  // Stock bid/ask vs last close %
  bidPct: number | null;
  askPct: number | null;
  // Benchmark bid/ask vs last close %
  benchBidPct: number | null;
  benchAskPct: number | null;
  // Spread and net edge at dispatch
  spread: number | null;
  netEdge: number | null;

  // Best-params enrichment
  corr: number | null;
  beta: number | null;
  stockSigma: number | null;
  rating: number | null;
  ratingTotal: number | null;

  // Filters satisfied at entry/add decision
  filtersOk: string;

  // How long the signal was in ENTRY_READY before dispatch
  holdMs: number | null;
  qualifiedAtStr: string | null; // "HH:MM:SS.mmm" when signal first qualified

  // Scale-in context
  sequence: number;              // 1 = initial entry, 2 = add#1, 3 = add#2 …
  entrySignal: number | null;    // σ of the original entry (for adds)
  addThreshold: number | null;   // σ threshold that triggered this add
  dilutionStep: number | null;
  maxAdds: number | null;

  // Automation config at dispatch time
  exitMode: string;
  hedgeMode: string;
  scaleMode: string;
  minNetEdge: number | null;
  minHoldMinutes: number | null;
  notionalUsd: number | null;

  // Hedge leg
  hedgeRequired: boolean;

  reason: string;
};

const MAX_ENTRIES = 5000;
const STORAGE_KEY = "stream.simulation-log.v1";

function loadFromStorage(): StreamLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StreamLogEntry[];
  } catch {
    return [];
  }
}

function saveToStorage(entries: StreamLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded — ignore
  }
}

// ---- store ----------------------------------------------------------------

class StreamLogStore {
  private entries: StreamLogEntry[] | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyPending = false;

  private ensureLoaded(): StreamLogEntry[] {
    if (this.entries === null) {
      this.entries = loadFromStorage();
      this.seq = this.entries.reduce((max, e) => Math.max(max, e.seq), 0);
    }
    return this.entries;
  }

  // Debounce localStorage write — at most once per 3 seconds.
  // Prevents blocking the main thread when many entries are pushed in rapid succession
  // (e.g. 27 CLOSE_ALL events in beta mode firing in the same tick).
  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveToStorage(this.entries ?? []);
    }, 3000);
  }

  // Batch listener notifications via microtask so many pushes in the same
  // synchronous execution cause only ONE React re-render, not N re-renders.
  private scheduleNotify(): void {
    if (this.notifyPending) return;
    this.notifyPending = true;
    queueMicrotask(() => {
      this.notifyPending = false;
      this.listeners.forEach((l) => l());
    });
  }

  push(entry: Omit<StreamLogEntry, "seq">): void {
    const entries = this.ensureLoaded();
    const full: StreamLogEntry = { seq: ++this.seq, ...entry };
    if (entries.length >= MAX_ENTRIES) {
      this.entries = entries.slice(entries.length - MAX_ENTRIES + 1);
    }
    this.entries = [...this.entries!, full];
    this.scheduleSave();
    this.scheduleNotify();
  }

  getEntries(): StreamLogEntry[] {
    return this.ensureLoaded();
  }

  clear(): void {
    const entries = this.ensureLoaded();
    if (!entries.length) return;
    this.entries = [];
    this.seq = 0;
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    saveToStorage([]);
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const streamLogStore = new StreamLogStore();

// ---- hooks ----------------------------------------------------------------

export function useStreamLogEntries(): StreamLogEntry[] {
  return useSyncExternalStore(
    streamLogStore.subscribe,
    () => streamLogStore.getEntries(),
    () => []
  );
}

// ---- CSV export -----------------------------------------------------------

const CSV_HEADERS = [
  "seq", "time", "event", "status", "betaMode",
  "ticker", "benchmark", "side",
  "sigmaZap", "zapSsigma", "zapLsigma", "zapPct",
  "bidPct", "askPct", "benchBidPct", "benchAskPct",
  "corr", "beta", "stockSigma", "rating", "ratingTotal",
  "filtersOk",
  "spread", "netEdge",
  "holdSec", "qualifiedAt",
  "sequence", "entrySignal", "addThreshold", "dilutionStep", "maxAdds",
  "exitMode", "hedgeMode", "scaleMode", "minNetEdge", "minHoldMin",
  "hedgeRequired",
  "reason",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmt4(v: number | null): string {
  return v == null ? "" : v.toFixed(4);
}

export function streamLogToCsv(entries: StreamLogEntry[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const e of entries) {
    rows.push([
      e.seq,
      csvCell(e.timeStr),
      e.event,
      e.status,
      e.betaMode ? "1" : "0",
      csvCell(e.ticker),
      csvCell(e.benchmark),
      e.side,
      fmt4(e.sigmaZap),
      fmt4(e.zapSsigma),
      fmt4(e.zapLsigma),
      fmt4(e.zapPct),
      fmt4(e.bidPct),
      fmt4(e.askPct),
      fmt4(e.benchBidPct),
      fmt4(e.benchAskPct),
      fmt4(e.corr),
      fmt4(e.beta),
      fmt4(e.stockSigma),
      e.rating != null ? e.rating.toFixed(2) : "",
      e.ratingTotal != null ? String(e.ratingTotal) : "",
      csvCell(e.filtersOk),
      fmt4(e.spread),
      fmt4(e.netEdge),
      e.holdMs != null ? (e.holdMs / 1000).toFixed(1) : "",
      csvCell(e.qualifiedAtStr ?? ""),
      e.sequence,
      fmt4(e.entrySignal),
      fmt4(e.addThreshold),
      fmt4(e.dilutionStep),
      e.maxAdds ?? "",
      csvCell(e.exitMode),
      csvCell(e.hedgeMode),
      csvCell(e.scaleMode),
      fmt4(e.minNetEdge),
      e.minHoldMinutes ?? "",
      e.hedgeRequired ? "1" : "0",
      csvCell(e.reason),
    ].join(","));
  }
  return rows.join("\n");
}

export function downloadStreamLog(entries: StreamLogEntry[], filename?: string): void {
  const csv = streamLogToCsv(entries);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = filename ?? `stream-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
