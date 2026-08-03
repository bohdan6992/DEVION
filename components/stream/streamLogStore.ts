"use client";

import { useSyncExternalStore } from "react";
import { useStreamStores } from "./streamStoreRegistry";

// ---- types ----------------------------------------------------------------

export type StreamLogEvent = "ENTRY" | "ADD" | "EXIT" | "EXIT_PRINT" | "CLOSE_ALL";

export type StreamLogEntry = {
  seq: number;              // monotonic counter
  ts: number;               // unix ms
  timeStr: string;          // "HH:MM:SS.mmm"
  event: StreamLogEvent;
  status: "SENT" | "FAILED" | "SIMULATED";
  betaMode: boolean;
  session: string | null;
  ruleBand: string | null;
  signalClass: string | null;
  ratingMode: string | null;
  ratingType: string | null;

  // Diagnostic: duplication & repair tracking
  intentId: string | null;       // unique intent ID — same ID dispatched twice = duplication bug
  isHedge: boolean;              // true for hedge-leg dispatches
  latchBounces: number;          // how many times signal dropped/recovered before dispatch (ремонт count)
  latchOrigin: string | null;    // "new" | "hist" | "primed" | "cont" — how the latch was (re)created
  exitSigmaAbs: number | null;   // for EXIT events: opposite-side σ that triggered the cover

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
// Base key only — each strategy instance appends its own namespace (see StreamLogStore's
// constructor). Two instances sharing one key would merge their simulation logs and, worse,
// overwrite each other's on every debounced save.
const STORAGE_KEY_BASE = "stream.simulation-log.v1";

/**
 * Which "day" a log entry belongs to.
 *
 * The default is the plain calendar day, which is WRONG for an overnight session: with START at
 * 21:00 the trading day runs 21:00 -> next morning, but a calendar-day key rolls over at
 * midnight, so at 00:00 everything logged during the 21:00-23:59 stretch stopped matching "today"
 * — and because the store rewrites storage right after filtering, that half of the session was
 * not just hidden but permanently deleted.
 *
 * The engine replaces this with a resolver anchored to the session's own START (see
 * setDayKeyResolver), so the log keeps the whole overnight run as one day.
 */
type StreamLogDayKeyResolver = (timestamp: number) => string;

function localDayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filterEntriesToDay(
  entries: StreamLogEntry[],
  resolver: StreamLogDayKeyResolver,
  dayKey: string
): StreamLogEntry[] {
  return entries.filter((entry) => Number.isFinite(entry.ts) && resolver(entry.ts) === dayKey);
}

function loadFromStorage(storageKey: string): StreamLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StreamLogEntry[];
  } catch {
    return [];
  }
}

function saveToStorage(storageKey: string, entries: StreamLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // quota exceeded — ignore
  }
}

// ---- store ----------------------------------------------------------------

export class StreamLogStore {
  private entries: StreamLogEntry[] | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyPending = false;
  private readonly storageKey: string;
  private dayKeyResolver: StreamLogDayKeyResolver = localDayKey;

  constructor(namespace?: string) {
    this.storageKey = namespace ? `${STORAGE_KEY_BASE}.${namespace}` : STORAGE_KEY_BASE;
  }

  /**
   * Anchors the log's "day" to the session's own START instead of calendar midnight. Called by
   * the engine once the configured START is known; re-applying it re-evaluates what is currently
   * in memory, so an entry logged before the resolver arrived is not stranded under the old key.
   */
  setDayKeyResolver(resolver: StreamLogDayKeyResolver): void {
    if (this.dayKeyResolver === resolver) return;
    this.dayKeyResolver = resolver;
    if (this.entries !== null) {
      this.entries = filterEntriesToDay(this.entries, resolver, resolver(Date.now()));
      this.scheduleSave();
      this.scheduleNotify();
    }
  }

  private ensureLoaded(): StreamLogEntry[] {
    const dayKey = this.dayKeyResolver(Date.now());
    if (this.entries === null) {
      // Filter AFTER loading rather than inside loadFromStorage: the resolver may not be set yet
      // on the very first read, and pruning storage against the wrong (calendar) day is exactly
      // how the pre-midnight half of an overnight session used to get deleted.
      this.entries = filterEntriesToDay(loadFromStorage(this.storageKey), this.dayKeyResolver, dayKey);
      this.seq = this.entries.reduce((max, e) => Math.max(max, e.seq), 0);
      saveToStorage(this.storageKey, this.entries);
      return this.entries;
    }
    const filtered = filterEntriesToDay(this.entries, this.dayKeyResolver, dayKey);
    if (filtered.length !== this.entries.length) {
      this.entries = filtered;
      this.seq = this.entries.reduce((max, e) => Math.max(max, e.seq), 0);
      saveToStorage(this.storageKey, this.entries);
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
      saveToStorage(this.storageKey, this.entries ?? []);
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
    const currentDayEntries = filterEntriesToDay(entries, this.dayKeyResolver, this.dayKeyResolver(entry.ts));
    if (currentDayEntries.length !== entries.length) {
      this.entries = currentDayEntries;
    }
    const full: StreamLogEntry = { seq: ++this.seq, ...entry };
    if (this.entries!.length >= MAX_ENTRIES) {
      this.entries = this.entries!.slice(this.entries!.length - MAX_ENTRIES + 1);
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
    saveToStorage(this.storageKey, []);
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

// ---- hooks ----------------------------------------------------------------

export function useStreamLogEntries(): StreamLogEntry[] {
  const store = useStreamStores().log;
  return useSyncExternalStore(
    store.subscribe,
    () => store.getEntries(),
    () => []
  );
}

// ---- CSV export -----------------------------------------------------------

const CSV_HEADERS = [
  "seq", "date", "time",
  "intentId", "isHedge", "latchBounces", "latchOrigin", "exitSigmaAbs",
  "event", "status", "betaMode", "session", "ruleBand", "signalClass", "ratingMode", "ratingType",
  "ticker", "bench", "side",
  "sigmaZap", "sigmaAbs", "zapSsigma", "zapLsigma", "zapPct",
  "bidPct", "askPct", "benchBidPct", "benchAskPct",
  "corr", "beta", "stockSigma", "rating", "ratingTotal",
  "filtersOk",
  "spread", "netEdge",
  "holdSec", "holdCandles", "qualifiedAt",
  "sequence", "entrySignal", "addThreshold", "dilutionStep", "maxAdds",
  "exitMode", "hedgeMode", "scaleMode", "minNetEdge", "minHoldCandles", "notionalUsd",
  "hedgeRequired",
  "decisionContext", "gateContext", "scaleContext", "execContext",
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
    const decisionContext = [
      `session=${e.session ?? "-"}`,
      `band=${e.ruleBand ?? "-"}`,
      `class=${e.signalClass ?? "-"}`,
      `mode=${e.ratingMode ?? "-"}`,
      `type=${e.ratingType ?? "-"}`,
    ].join(" | ");
    const gateContext = [
      `netEdge>=${e.minNetEdge != null ? e.minNetEdge.toFixed(3) : "-"}`,
      `hold>=${e.minHoldMinutes != null ? `${e.minHoldMinutes}m` : "-"}`,
      `spread=${e.spread != null ? e.spread.toFixed(3) : "-"}`,
      `edge=${e.netEdge != null ? e.netEdge.toFixed(3) : "-"}`,
      `qualified=${e.qualifiedAtStr ?? "-"}`,
    ].join(" | ");
    const scaleContext = [
      `seq=${e.sequence}`,
      `entryσ=${e.entrySignal != null ? e.entrySignal.toFixed(3) : "-"}`,
      `add@=${e.addThreshold != null ? e.addThreshold.toFixed(3) : "-"}`,
      `step=${e.dilutionStep != null ? e.dilutionStep.toFixed(3) : "-"}`,
      `maxAdds=${e.maxAdds ?? "-"}`,
    ].join(" | ");
    const executionContext = [
      `exit=${e.exitMode}`,
      `hedge=${e.hedgeMode}`,
      `scale=${e.scaleMode}`,
      `usd=${e.notionalUsd != null ? e.notionalUsd.toFixed(0) : "-"}`,
      `beta=${e.betaMode ? "on" : "off"}`,
    ].join(" | ");
    rows.push([
      e.seq,
      localDayKey(e.ts),
      csvCell(e.timeStr),
      csvCell(e.intentId ?? ""),
      e.isHedge ? "1" : "0",
      e.latchBounces,
      csvCell(e.latchOrigin ?? ""),
      fmt4(e.exitSigmaAbs),
      e.event,
      e.status,
      e.betaMode ? "1" : "0",
      csvCell(e.session ?? ""),
      csvCell(e.ruleBand ?? ""),
      csvCell(e.signalClass ?? ""),
      csvCell(e.ratingMode ?? ""),
      csvCell(e.ratingType ?? ""),
      csvCell(e.ticker),
      csvCell(e.benchmark),
      e.side,
      fmt4(e.sigmaZap),
      e.sigmaZap != null ? Math.abs(e.sigmaZap).toFixed(4) : "",
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
      e.holdMs != null ? String(Math.round(e.holdMs / 60000)) : "",
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
      e.notionalUsd != null ? e.notionalUsd.toFixed(2) : "",
      e.hedgeRequired ? "1" : "0",
      csvCell(decisionContext),
      csvCell(gateContext),
      csvCell(scaleContext),
      csvCell(executionContext),
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
