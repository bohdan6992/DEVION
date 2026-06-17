"use client";

import { useSyncExternalStore } from "react";

// Records every ticker the first time it appears as ENTRY_READY (passed all stream filters).
// Accumulates in memory for the current session — download at end of day to compare with
// Scanner backtest episodes (same fields as PaperArbClosedDto + dispatch log).

export type StreamFilterPassEntry = {
  seq: number;
  ts: number;
  timeStr: string;

  ticker: string;
  benchmark: string;
  side: "Long" | "Short";

  // Signal metrics at first qualification
  signal: number | null;       // direction-specific sigma (zapLsigma or zapSsigma)
  zapLsigma: number | null;
  zapSsigma: number | null;
  zapL: number | null;
  zapS: number | null;
  spread: number | null;
  netEdge: number | null;
  safePrice: number | null;

  // Price data
  bidPct: number | null;
  askPct: number | null;
  benchBidPct: number | null;
  benchAskPct: number | null;
  lstCls: number | null;
  yCls: number | null;
  vwap: number | null;
  lstPrcL: number | null;

  // Stats from best_params / enrichment
  rating: number | null;
  ratingTotal: number | null;
  corr: number | null;
  beta: number | null;
  sigma: number | null;       // stock sigma from best_params

  // Fundamentals
  adv20: number | null;
  adv20NF: number | null;
  adv90: number | null;
  marketCapM: number | null;
  avPreMhv: number | null;

  // Classification
  country: string | null;
  exchange: string | null;
  sectorL3: string | null;

  // Decision status
  decisionStatus: string;
};

const MAX_ENTRIES = 5000;

function fmtMs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

class StreamFilterPassLogStore {
  private entries: StreamFilterPassEntry[] = [];
  private loggedTickers = new Set<string>();
  private seq = 0;
  private listeners = new Set<() => void>();
  private notifyPending = false;

  private scheduleNotify(): void {
    if (this.notifyPending) return;
    this.notifyPending = true;
    queueMicrotask(() => {
      this.notifyPending = false;
      this.listeners.forEach((l) => l());
    });
  }

  // Called from streamEngine refresh() for each ticker that is newly ENTRY_READY.
  // raw: the full ArbitrageSignal object for field extraction.
  // decision: the StreamDecisionRow for the ticker.
  tryLog(entry: Omit<StreamFilterPassEntry, "seq" | "timeStr">): void {
    const key = `${entry.ticker}|${entry.side}`;
    if (this.loggedTickers.has(key)) return;
    this.loggedTickers.add(key);

    const full: StreamFilterPassEntry = {
      seq: ++this.seq,
      timeStr: fmtMs(entry.ts),
      ...entry,
    };
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES + 1);
    }
    this.entries = [...this.entries, full];
    this.scheduleNotify();
  }

  getEntries(): StreamFilterPassEntry[] {
    return this.entries;
  }

  getCount(): number {
    return this.entries.length;
  }

  clear(): void {
    if (!this.entries.length && !this.loggedTickers.size) return;
    this.entries = [];
    this.loggedTickers.clear();
    this.seq = 0;
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const streamFilterPassLogStore = new StreamFilterPassLogStore();

// ---- React hook -----------------------------------------------------------

export function useStreamFilterPassLogCount(): number {
  return useSyncExternalStore(
    streamFilterPassLogStore.subscribe,
    () => streamFilterPassLogStore.getCount(),
    () => 0
  );
}

// ---- CSV export -----------------------------------------------------------

const CSV_HEADERS = [
  "seq", "time", "ticker", "benchmark", "side",
  "signal", "zapLsigma", "zapSsigma", "zapL", "zapS",
  "spread", "netEdge", "safePrice",
  "bidPct", "askPct", "benchBidPct", "benchAskPct",
  "lstCls", "yCls", "vwap", "lstPrcL",
  "rating", "ratingTotal", "corr", "beta", "sigma",
  "adv20", "adv20NF", "adv90", "marketCapM", "avPreMhv",
  "country", "exchange", "sectorL3",
  "decisionStatus",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmt4(v: number | null): string {
  return v == null ? "" : v.toFixed(4);
}

export function filterPassLogToCsv(entries: StreamFilterPassEntry[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const e of entries) {
    rows.push([
      e.seq,
      csvCell(e.timeStr),
      csvCell(e.ticker),
      csvCell(e.benchmark),
      e.side,
      fmt4(e.signal),
      fmt4(e.zapLsigma),
      fmt4(e.zapSsigma),
      fmt4(e.zapL),
      fmt4(e.zapS),
      fmt4(e.spread),
      fmt4(e.netEdge),
      fmt4(e.safePrice),
      fmt4(e.bidPct),
      fmt4(e.askPct),
      fmt4(e.benchBidPct),
      fmt4(e.benchAskPct),
      fmt4(e.lstCls),
      fmt4(e.yCls),
      fmt4(e.vwap),
      fmt4(e.lstPrcL),
      e.rating != null ? e.rating.toFixed(2) : "",
      e.ratingTotal != null ? String(e.ratingTotal) : "",
      fmt4(e.corr),
      fmt4(e.beta),
      fmt4(e.sigma),
      fmt4(e.adv20),
      fmt4(e.adv20NF),
      fmt4(e.adv90),
      fmt4(e.marketCapM),
      fmt4(e.avPreMhv),
      csvCell(e.country),
      csvCell(e.exchange),
      csvCell(e.sectorL3),
      csvCell(e.decisionStatus),
    ].join(","));
  }
  return rows.join("\n");
}

export function downloadFilterPassLog(entries: StreamFilterPassEntry[], filename?: string): void {
  const csv = filterPassLogToCsv(entries);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `stream-filter-pass-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadFilterPassLogJsonl(entries: StreamFilterPassEntry[], filename?: string): void {
  const lines = entries.map((e) => JSON.stringify(e));
  const blob = new Blob([lines.join("\n")], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `stream-filter-pass-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.jsonl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
