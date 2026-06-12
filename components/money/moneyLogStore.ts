"use client";

import { useSyncExternalStore } from "react";

// ---- types ----------------------------------------------------------------

export type MoneyLogEvent = "ENTRY" | "ADD" | "EXIT" | "EXIT_PRINT" | "CLOSE_ALL";

export type MoneyLogEntry = {
  seq: number;              // monotonic counter
  ts: number;               // unix ms
  timeStr: string;          // "HH:MM:SS.mmm"
  event: MoneyLogEvent;
  status: "SENT" | "FAILED";

  ticker: string;
  benchmark: string;
  side: "Long" | "Short";

  // Signal at dispatch time (sigma)
  sigmaZap: number | null;
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

  // Hedge leg
  hedgeRequired: boolean;

  reason: string;
};

const MAX_ENTRIES = 5000;

// ---- store ----------------------------------------------------------------

class MoneyLogStore {
  private entries: MoneyLogEntry[] = [];
  private seq = 0;
  private listeners = new Set<() => void>();

  push(entry: Omit<MoneyLogEntry, "seq">): void {
    const full: MoneyLogEntry = { seq: ++this.seq, ...entry };
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES + 1);
    }
    this.entries = [...this.entries, full];
    this.listeners.forEach((l) => l());
  }

  getEntries(): MoneyLogEntry[] {
    return this.entries;
  }

  clear(): void {
    if (!this.entries.length) return;
    this.entries = [];
    this.seq = 0;
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const moneyLogStore = new MoneyLogStore();

// ---- hooks ----------------------------------------------------------------

export function useMoneyLogEntries(): MoneyLogEntry[] {
  return useSyncExternalStore(
    moneyLogStore.subscribe,
    () => moneyLogStore.getEntries(),
    () => []
  );
}

// ---- CSV export -----------------------------------------------------------

const CSV_HEADERS = [
  "seq", "time", "event", "status",
  "ticker", "benchmark", "side",
  "sigmaZap", "zapPct", "bidPct", "askPct", "benchBidPct", "benchAskPct",
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

export function moneyLogToCsv(entries: MoneyLogEntry[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const e of entries) {
    rows.push([
      e.seq,
      csvCell(e.timeStr),
      e.event,
      e.status,
      csvCell(e.ticker),
      csvCell(e.benchmark),
      e.side,
      fmt4(e.sigmaZap),
      fmt4(e.zapPct),
      fmt4(e.bidPct),
      fmt4(e.askPct),
      fmt4(e.benchBidPct),
      fmt4(e.benchAskPct),
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

export function downloadMoneyLog(entries: MoneyLogEntry[], filename?: string): void {
  const csv = moneyLogToCsv(entries);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = filename ?? `money-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
