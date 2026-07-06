"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeUrl } from "../../lib/bridgeBase";
import { applyArbitrageFilters } from "../../lib/filters/arbitrageFilterEngine";
import type { ArbitrageFilterConfigV1 } from "../../lib/filters/arbitrageFilterConfigV1";
import { applyExactSonarClientFilters, buildSignalsStreamUrl, normalizeSignal, type ArbitrageSignal, type SonarExactFilterSnapshot } from "../sonar/ArbitrageSonar";
import { passesStreamRatingFilter } from "../../lib/arbitrage/ratingFilter";
import { streamActionLogStore } from "./streamActionLogStore";
import { getStreamDecisionRow, streamDecisionStore } from "./streamDecisionStore";
import { streamExecutionStore } from "./streamExecutionStore";
import { connectStreamOcrFeed } from "./streamOcrFeed";
import { streamOrderIntentStore } from "./streamOrderIntentStore";
import { streamBookStore, resetStreamOcrStores } from "./streamOcrStores";
import { streamPositionStore } from "./streamPositionStore";
import { streamSignalStore } from "./streamSignalStore";
import { streamUpdatedAtStore } from "./streamUpdatedAtStore";
import { streamLogStore, type StreamLogEvent } from "./streamLogStore";
import { streamFilterPassLogStore } from "./streamFilterPassLogStore";

export type StreamDecisionStatus = "ENTRY_READY" | "HOLD" | "EXIT_READY" | "EXIT_BLOCKED" | "BLOCKED_SPREAD" | "BLOCKED_EDGE";

export type StreamDecisionRow = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  spreadBidPct: number | null;
  safePrice: number | null;
  netEdge: number | null;
  positionBp: number | null;
  status: StreamDecisionStatus;
  reason: string;
  updatedAt: number;
};

export type StreamPosition = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  entrySignal: number | null;
  lastSignal: number | null;
  lastScaleSignal: number | null;
  spread: number | null;
  spreadBidPct: number | null;
  status: "PENDING_ENTRY" | "OPEN" | "EXIT_BLOCKED" | "CLOSED" | "PRINT_PENDING";
  reason: string;
  entryCount: number;
  belowThresholdTicks: number;
  lockedForPrint: boolean;
  pendingIntent: StreamOrderIntentType | null;
  entryDispatchedAt: number | null;
  lastDispatchedAt: number | null;
  lastConfirmedActiveAt: number | null;
  lastAboveAddCapAt: number | null;  // last time add signal exceeded ADD_MAX_SIGMA (resets add delay)
  openedAt: number;
  updatedAt: number;
  // Running peak |deviation| seen so far during the CURRENT (in-progress) minute, used for the
  // ADD trigger check so a threshold crossing between two polls isn't missed just because the
  // latest poll happens to read a lower value. Reset whenever the minute rolls over.
  addPeakMinuteIdx?: number | null;
  addPeakAbs?: number | null;
  addPeakSigned?: number | null;
};

export type StreamActionLogKind = "ENTRY" | "ADD" | "CLOSE";

export type StreamActionLogEntry = {
  id: string;
  dayKey: string;
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  kind: StreamActionLogKind;
  deviation: number | null;
  at: number;
  intent: StreamOrderIntentType | "MANUAL";
  reason?: string;
  // Extended display fields (optional — absent in entries restored from localStorage)
  sequence?: number;             // 1=initial entry, 2=add#1, 3=add#2 …
  addThreshold?: number | null;  // ADD: σ trigger threshold for this add
  sinceLastMs?: number | null;   // ADD: ms elapsed since previous dispatch (entry or last add)
  delayRequiredMs?: number | null; // ADD: configured addDelayMinutes × 60 000
  holdMs?: number | null;        // CLOSE: position hold duration ms (from entry dispatch)
  entryCount?: number | null;    // CLOSE: total dispatched entries+adds for this position
  filtersOk?: string;            // filters summary at dispatch time
};

export type StreamOrderIntentType =
  | "ENTER_LONG_AGGRESSIVE"
  | "ENTER_SHORT_AGGRESSIVE"
  | "EXIT_LONG_AGGRESSIVE"
  | "EXIT_SHORT_AGGRESSIVE"
  | "EXIT_LONG_PRINT"
  | "EXIT_SHORT_PRINT"
  | "CLOSE_ALL_PRINT";

export type StreamOrderIntent = {
  id: string;
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  intent: StreamOrderIntentType;
  sequence: number;
  priceRef: "BID" | "ASK" | "PRINT";
  status: "QUEUED" | "BLOCKED";
  reason: string;
  createdAt: number;
};

function isEntryOrderIntent(intent: StreamOrderIntentType | null | undefined): boolean {
  return intent === "ENTER_LONG_AGGRESSIVE" || intent === "ENTER_SHORT_AGGRESSIVE";
}

function isExitOrderIntent(intent: StreamOrderIntentType | null | undefined): boolean {
  return intent === "EXIT_LONG_AGGRESSIVE" ||
    intent === "EXIT_SHORT_AGGRESSIVE" ||
    intent === "EXIT_LONG_PRINT" ||
    intent === "EXIT_SHORT_PRINT";
}

export type TradingAppExecutionStep = {
  step: string;
  message: string;
  atUtc: string;
};

export type TradingAppBoundWindowInfo = {
  isBound: boolean;
  handle: number;
  processId: number;
  title: string;
  className: string;
  left: number;
  top: number;
  width: number;
  height: number;
  tickerPoint?: {
    isSet: boolean;
    relativeX: number;
    relativeY: number;
    screenX: number;
    screenY: number;
    capturedAtUtc: string;
  } | null;
  boundAtUtc: string;
};

export type TradingAppQueueItem = {
  intentId: string;
  ticker: string;
  type: string;
  source: string;
  status: string;
  message: string;
  hotkey?: string | null;
  delayMinMs?: number | null;
  delayMaxMs?: number | null;
  appliedDelayMs?: number | null;
  createdAtUtc: string;
  startedAtUtc?: string | null;
  finishedAtUtc?: string | null;
  steps: TradingAppExecutionStep[];
};

export type TradingAppExecutionSnapshot = {
  panicOff: boolean;
  isProcessing: boolean;
  executionMode: string;
  boundWindow?: TradingAppBoundWindowInfo | null;
  mainWindow?: TradingAppBoundWindowInfo | null;
  current?: TradingAppQueueItem | null;
  queue: TradingAppQueueItem[];
  history: TradingAppQueueItem[];
};

export type MarketMakerBookLevel = {
  size: number;
  exchange: string;
  price: number;
};

export type MarketMakerBookSnapshot = {
  windowTitle: string;
  capturedAtUtc: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  bidLevels: MarketMakerBookLevel[];
  askLevels: MarketMakerBookLevel[];
  ocrLines: string[];
  ocrText: string;
};

export type MainWindowDataField = {
  heading: string;
  value: string;
  rawLine: string;
};

export type MainWindowControlState = {
  label: string;
  state: "GREEN" | "RED" | "UNKNOWN";
};

export type MainWindowDataSnapshot = {
  windowTitle: string;
  capturedAtUtc: string;
  fields: MainWindowDataField[];
  controls: MainWindowControlState[];
  ocrLines: string[];
  ocrText: string;
};

export type StreamRatingBand = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
export type StreamRatingRule = {
  band: StreamRatingBand;
  minRate: number;
  minTotal: number;
};

export type StreamExecutionDescriptor = {
  signalClass: string;
  ratingRule: StreamRatingRule;
};

export type StreamManualOrderAction = "buy" | "sell" | "cover";

export type StreamAutomationConfig = {
  strategyModeEnabled: boolean;
  minNetEdge: number;
  endSignalThreshold: number;
  maxOpenPositions: number;
  maxAdds: number;
  queueDelayMinSeconds: number;
  queueDelayMaxSeconds: number;
  exitExecutionMode: "active" | "passive";
  hedgeMode: "hedged" | "unhedged";
  scaleMode: "single" | "scale_in";
  sizingMode: "USD" | "TIER";
  sizeValue: number;
  dilutionStep: number;
  addDelayMinutes: number;
  minHoldMinutes: number;
  exitConfirmTicks: number;
  exitMode: "normalize" | "print";
  printStartTime: string;
  printCloseTime: string;
  noSpreadExit: boolean;
  betaMode: boolean;
  /** Time-of-day (HH:MM, local) after which auto-dispatch of new ENTRY orders stops. */
  startCutoffTime: string;
};

type StreamSignalLatch = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  qualifiedSince: number;
  lastSeenAt: number;
};

type StreamMinMax = {
  min?: number;
  max?: number;
};

export type StreamFilterBuilderArgs = {
  signalClass: string;
  ratingType: string | null | undefined;
  minRate: number;
  minTotal: number;
  listMode: "off" | "ignore" | "apply" | "pin";
  ignoreTickers: string[];
  applyTickers: string[];
  pinnedTickers: string[];
  bounds: {
    ADV20?: StreamMinMax;
    ADV20NF?: StreamMinMax;
    ADV90?: StreamMinMax;
    ADV90NF?: StreamMinMax;
    AvPreMhv?: StreamMinMax;
    RoundLot?: StreamMinMax;
    VWAP?: StreamMinMax;
    SpreadBidPct?: StreamMinMax;
    LstPrcL?: StreamMinMax;
    LstCls?: StreamMinMax;
    YCls?: StreamMinMax;
    TCls?: StreamMinMax;
    ClsToClsPct?: StreamMinMax;
    Lo?: StreamMinMax;
    LstClsNewsCnt?: StreamMinMax;
    MarketCapM?: StreamMinMax;
    PreMhVolNF?: StreamMinMax;
    VolNFfromLstCls?: StreamMinMax;
    AvPostMhVol90NF?: StreamMinMax;
    AvPreMhVol90NF?: StreamMinMax;
    AvPreMhValue20NF?: StreamMinMax;
    AvPreMhValue90NF?: StreamMinMax;
    AvgDailyValue20?: StreamMinMax;
    AvgDailyValue90?: StreamMinMax;
    Volatility20?: StreamMinMax;
    Volatility90?: StreamMinMax;
    PreMhMDV20NF?: StreamMinMax;
    PreMhMDV90NF?: StreamMinMax;
    VolRel?: StreamMinMax;
  };
  exclude: {
    dividend: boolean;
    news: boolean;
    ptp: boolean;
    ssr: boolean;
    report: boolean;
    etf: boolean;
    crap: boolean;
  };
  include: {
    usaOnly: boolean;
    chinaOnly: boolean;
  };
  multi: {
    countries: string[];
    exchanges: string[];
    sectors: string[];
  };
  reportMode: "YES" | "NO" | "ALL";
  zapMode: "sigma" | "zap";
  zapThresholdAbs: number;
};

function toNum(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return null;
}

function sameNullableNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

function parseTimeToMinutes(value: string | undefined, fallbackMinutes: number): number {
  if (!value) return fallbackMinutes;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallbackMinutes;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallbackMinutes;
  return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
}

function currentMinutesLocal(): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date());
    const hh = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
    }
  } catch {
    // Fallback to local clock if Intl/timezone support is unavailable.
  }
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function intentId(parts: Array<string | number>): string {
  return parts.join("|");
}


function signalAbs(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  const raw = toNum(row.zapLsigma ?? row.zapSsigma ?? row.zapL ?? row.zapS ?? row.sig);
  return raw == null ? null : Math.abs(raw);
}

function signalSigned(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  return toNum(row.zapLsigma ?? row.zapSsigma ?? row.zapL ?? row.zapS ?? row.sig);
}

function numPositionBp(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  const anyRow = row as any;
  return toNum(
    anyRow?.PositionBp ??
      anyRow?.positionBp ??
      anyRow?.position_bp ??
      anyRow?.posBp ??
      anyRow?.PosBp ??
      anyRow?.meta?.PositionBp ??
      anyRow?.meta?.positionBp ??
      anyRow?.meta?.position_bp ??
      anyRow?.meta?.posBp ??
      anyRow?.meta?.PosBp ??
      anyRow?.positionBpAbs ??
      anyRow?.PositionBpAbs ??
      anyRow?.meta?.positionBpAbs ??
      anyRow?.meta?.PositionBpAbs
  );
}

function isActiveByPositionBp(row: ArbitrageSignal | null | undefined): boolean {
  if (!row) return false;
  const bp = numPositionBp(row);
  // Stream engine uses strict position activity: only PositionBp != 0 means active.
  return bp != null && bp !== 0;
}

function signalSpread(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  return toNum(row.Spread ?? row.spread);
}

function signalSpreadBidPct(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  return toNum(
    (row as any)["SpreadBid%"] ??
    (row as any).spreadBidPct ??
    (row as any).SpreadBidPct ??
    (row as any).Spread ??
    (row as any).spread
  );
}

function hasStrategyEntryCutoff(signalClass: string | undefined): boolean {
  const normalized = (signalClass ?? "").trim().toLowerCase();
  return normalized === "ark" || normalized === "pre";
}

function getStrategySessionStartMinutes(signalClass: string | undefined): number | null {
  const normalized = (signalClass ?? "").trim().toLowerCase();
  if (normalized === "ark") return ARK_SESSION_START_MINUTES;
  if (normalized === "pre") return 1;
  return null;
}

// ARK session start (mirrors Scanner's TapeArbClasses.ArkFrom window). The automation toggle
// can be switched on any time, but no new ENTRY latch/position is created before this minute —
// it just waits, same as BLUE effectively "waits" from 00:00 (i.e. never blocks).
const ARK_SESSION_START_MINUTES = 4 * 60; // 04:00

function normalizeLiveSnapshotItems(rawItems: any[]): ArbitrageSignal[] {
  return rawItems
    .map((item) => {
      if (!item) return null;
      const ticker = String(item?.ticker ?? item?.Ticker ?? "").trim().toUpperCase();
      if (!ticker) return null;
      const fields = item?.fields ?? item?.Fields ?? {};
      const positionBp = toNum(
        fields?.PositionBp ??
        fields?.positionBp ??
        fields?.position_bp ??
        fields?.posBp ??
        fields?.PosBp
      );
      const fallbackDirection =
        positionBp == null || positionBp === 0
          ? undefined
          : positionBp > 0
            ? "up"
            : "down";
      return normalizeSignal({
        ...fields,
        ticker,
        Ticker: ticker,
        benchmark: fields?.Benchmark ?? fields?.benchmark ?? fields?.bench ?? "UNKNOWN",
        direction: fields?.direction ?? fallbackDirection,
        meta: fields,
      });
    })
    .filter(Boolean) as ArbitrageSignal[];
}

function streamActionLogStorageKey(signalClass: string | undefined): string {
  const suffix = (signalClass ?? "global").trim().toLowerCase() || "global";
  return `stream.arbitrage.action-log.${suffix}`;
}

function localDayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayKeyAgeInDays(dayKey: string, now = Date.now()): number {
  const target = new Date(`${dayKey}T00:00:00`);
  const current = new Date(`${localDayKey(now)}T00:00:00`);
  return Math.floor((current.getTime() - target.getTime()) / 86_400_000);
}

function pruneStreamActionLog(entries: StreamActionLogEntry[], now = Date.now()): StreamActionLogEntry[] {
  return entries
    .filter((entry) => {
      const age = dayKeyAgeInDays(entry.dayKey, now);
      return age >= 0 && age < 3;
    })
    .sort((a, b) => a.at - b.at);
}

function readStreamActionLog(storageKey: string): StreamActionLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneStreamActionLog(parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<StreamActionLogEntry>;
        const ticker = String(row.ticker ?? "").trim().toUpperCase();
        if (!ticker) return null;
        return {
          id: String(row.id ?? "").trim() || `${ticker}|${String(row.kind ?? "ENTRY").trim()}|${Math.max(0, Math.trunc(toNum(row.at) ?? Date.now()))}`,
          dayKey: String(row.dayKey ?? localDayKey(toNum(row.at) ?? Date.now())).trim() || localDayKey(),
          ticker,
          benchmark: String(row.benchmark ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
          side: row.side === "Short" ? "Short" : "Long",
          kind: row.kind === "ADD" || row.kind === "CLOSE" ? row.kind : "ENTRY",
          deviation: toNum(row.deviation),
          at: Math.max(0, Math.trunc(toNum(row.at) ?? Date.now())),
          ...(typeof row.reason === "string" && row.reason ? { reason: row.reason } : {}),
          intent:
            row.intent === "ENTER_LONG_AGGRESSIVE" ||
            row.intent === "ENTER_SHORT_AGGRESSIVE" ||
            row.intent === "EXIT_LONG_AGGRESSIVE" ||
            row.intent === "EXIT_SHORT_AGGRESSIVE" ||
            row.intent === "EXIT_LONG_PRINT" ||
            row.intent === "EXIT_SHORT_PRINT" ||
            row.intent === "CLOSE_ALL_PRINT" ||
            row.intent === "MANUAL"
              ? row.intent
              : "MANUAL",
          ...(row.sequence != null ? { sequence: Math.trunc(Number(row.sequence)) } : {}),
          ...(toNum(row.addThreshold) != null ? { addThreshold: toNum(row.addThreshold) } : {}),
          ...(toNum(row.sinceLastMs) != null ? { sinceLastMs: toNum(row.sinceLastMs) } : {}),
          ...(toNum(row.delayRequiredMs) != null ? { delayRequiredMs: toNum(row.delayRequiredMs) } : {}),
          ...(toNum(row.holdMs) != null ? { holdMs: toNum(row.holdMs) } : {}),
          ...(toNum(row.entryCount) != null ? { entryCount: toNum(row.entryCount) } : {}),
          ...(typeof row.filtersOk === "string" && row.filtersOk ? { filtersOk: row.filtersOk } : {}),
        } satisfies StreamActionLogEntry;
      })
      .filter((row): row is StreamActionLogEntry => row !== null), Date.now());
  } catch {
    return [];
  }
}

function buildStreamPositionsFromActionLog(entries: StreamActionLogEntry[], dayKey = localDayKey()): StreamPosition[] {
  const todaysEntries = entries
    .filter((entry) => entry.dayKey === dayKey)
    .sort((a, b) => a.at - b.at);
  const openByTicker = new Map<string, StreamPosition>();

  for (const entry of todaysEntries) {
    if (entry.kind === "CLOSE") {
      openByTicker.delete(entry.ticker);
      continue;
    }

    const existing = openByTicker.get(entry.ticker);
    if (!existing) {
      openByTicker.set(entry.ticker, {
        ticker: entry.ticker,
        benchmark: entry.benchmark,
        side: entry.side,
        entrySignal: entry.deviation,
        lastSignal: entry.deviation,
        lastScaleSignal: entry.deviation,
        belowThresholdTicks: 0,
        spread: null,
        spreadBidPct: null,
        status: "OPEN",
        reason: entry.kind === "ADD" ? "restored add from action log" : "restored entry from action log",
        entryCount: entry.kind === "ADD" ? 2 : 1,
        lockedForPrint: false,
        pendingIntent: null,
        entryDispatchedAt: entry.at,
        lastDispatchedAt: entry.at,
        lastConfirmedActiveAt: entry.at,
        lastAboveAddCapAt: null,
        openedAt: entry.at,
        updatedAt: entry.at,
      });
      continue;
    }

    const nextEntryCount = entry.kind === "ADD" ? existing.entryCount + 1 : existing.entryCount;
    openByTicker.set(entry.ticker, {
      ...existing,
      benchmark: entry.benchmark || existing.benchmark,
      side: entry.side,
      lastSignal: entry.deviation ?? existing.lastSignal,
      lastScaleSignal: entry.kind === "ADD" ? (entry.deviation ?? existing.lastScaleSignal) : existing.lastScaleSignal,
      reason: entry.kind === "ADD" ? "restored add from action log" : existing.reason,
      entryCount: nextEntryCount,
      entryDispatchedAt: existing.entryDispatchedAt ?? entry.at,
      lastDispatchedAt: entry.at,
      lastConfirmedActiveAt: entry.at,
      updatedAt: entry.at,
    });
  }

  return Array.from(openByTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function buildOpenTickersFromActionLog(entries: StreamActionLogEntry[], dayKey = localDayKey()): Set<string> {
  return new Set(buildStreamPositionsFromActionLog(entries, dayKey).map((row) => row.ticker));
}

function hasExecutionDispatchConfirmation(
  snapshot: TradingAppExecutionSnapshot | null | undefined,
  intentId: string,
  entries: StreamActionLogEntry[] = [],
): boolean {
  if (!snapshot || !intentId) return false;
  const matchesIntent = (item: TradingAppQueueItem | null | undefined) =>
    item != null &&
    item.intentId === intentId &&
    (item.status === "Sent" || item.status === "Completed");

  if (matchesIntent(snapshot.current ?? null)) {
    return true;
  }

  if (snapshot.queue.some(matchesIntent) || snapshot.history.some(matchesIntent)) {
    return true;
  }

  if (!entries.length) return false;

  const fallbackMatch = (item: TradingAppQueueItem | null | undefined) =>
    item != null &&
    queueItemMatchesPendingActionLogEntry(item, entries[0]);

  return fallbackMatch(snapshot.current ?? null) ||
    snapshot.queue.some(fallbackMatch) ||
    snapshot.history.some(fallbackMatch);
}

function mapActionLogIntentToExecutionType(intent: StreamActionLogEntry["intent"]): TradingAppQueueItem["type"] | null {
  switch (intent) {
    case "ENTER_LONG_AGGRESSIVE":
      return "EnterLongAggressive";
    case "ENTER_SHORT_AGGRESSIVE":
      return "EnterShortAggressive";
    case "EXIT_LONG_AGGRESSIVE":
    case "EXIT_SHORT_AGGRESSIVE":
      return "ExitActive";
    case "EXIT_LONG_PRINT":
    case "EXIT_SHORT_PRINT":
    case "CLOSE_ALL_PRINT":
      return "ExitPrint";
    default:
      return null;
  }
}

function queueItemMatchesPendingActionLogEntry(
  item: TradingAppQueueItem,
  entry: StreamActionLogEntry | undefined,
): boolean {
  if (!entry) return false;
  if (item.status !== "Sent" && item.status !== "Completed") return false;
  if (item.ticker !== entry.ticker) return false;

  const expectedType = mapActionLogIntentToExecutionType(entry.intent);
  if (expectedType && item.type !== expectedType) return false;

  const itemTimestamp = Date.parse(item.finishedAtUtc ?? item.startedAtUtc ?? item.createdAtUtc);
  if (!Number.isFinite(itemTimestamp)) return false;

  // Allow a small backward window because the local log entry is created
  // immediately after enqueue, while backend timestamps are captured inside
  // the queue worker lifecycle.
  return itemTimestamp >= entry.at - 60_000;
}

function normalizeConfirmedActionLogReason(entry: StreamActionLogEntry): string | undefined {
  const reason = entry.reason?.trim();
  if (
    reason &&
    reason !== "awaiting entry dispatch" &&
    reason !== "order queued | waiting for execution confirmation" &&
    reason !== "order dispatched | awaiting execution confirmation"
  ) {
    return reason;
  }

  if (entry.kind === "CLOSE") {
    return "execution confirmed";
  }
  if (entry.kind === "ADD") {
    return "add confirmed";
  }
  return "entry confirmed";
}

function normalizeConfirmedActionLogEntries(entries: StreamActionLogEntry[]): StreamActionLogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    reason: normalizeConfirmedActionLogReason(entry),
  }));
}

function mergeStreamPositionsWithActionLog(
  prev: StreamPosition[],
  entries: StreamActionLogEntry[],
  dayKey = localDayKey()
): StreamPosition[] {
  const restored = buildStreamPositionsFromActionLog(entries, dayKey);
  const restoredByTicker = new Map(restored.map((row) => [row.ticker, row]));
  const prevByTicker = new Map(prev.map((row) => [row.ticker, row]));
  const transient = prev.filter((row) =>
    row.status !== "CLOSED" &&
    row.entryDispatchedAt == null &&
    isEntryOrderIntent(row.pendingIntent)
  );
  const transientByTicker = new Map(transient.map((row) => [row.ticker, row]));
  const merged = new Map<string, StreamPosition>();

  for (const [ticker, row] of restoredByTicker) {
    const existing = prevByTicker.get(ticker) ?? null;
    merged.set(ticker, existing ? {
      ...row,
      // Never regress entryCount below what the engine already pre-incremented.
      // The log lags behind: engine pre-increments on trigger, log only confirms on execution.
      // If we let the log overwrite with a lower count, the maxAdds guard can be bypassed.
      entryCount: Math.max(existing.entryCount, row.entryCount),
      spread: existing.spread ?? row.spread,
      spreadBidPct: existing.spreadBidPct ?? row.spreadBidPct,
      status: existing.status === "EXIT_BLOCKED" || existing.status === "PRINT_PENDING" ? existing.status : row.status,
      reason: existing.reason || row.reason,
      pendingIntent: isExitOrderIntent(existing.pendingIntent) ? existing.pendingIntent : null,
      lockedForPrint: existing.lockedForPrint,
      lastSignal: existing.lastSignal ?? row.lastSignal,
      updatedAt: Math.max(existing.updatedAt, row.updatedAt),
    } : row);
  }

  for (const [ticker, row] of transientByTicker) {
    if (!merged.has(ticker)) {
      merged.set(ticker, row);
    }
  }

  // Keep positions that have been dispatched but not yet confirmed in the action log.
  // Without this they'd be dropped from positionsBaseline, fall out of `seen` in
  // syncStreamPositions, and the latch would recreate them with a new openedAt →
  // different intentId → duplicate dispatch.
  for (const [ticker, row] of prevByTicker) {
    if (!merged.has(ticker) && row.status !== "CLOSED" && row.entryDispatchedAt != null) {
      merged.set(ticker, row);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function sameSignalList(a: ArbitrageSignal[], b: ArbitrageSignal[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameDecisionRows(a: StreamDecisionRow[], b: StreamDecisionRow[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.ticker !== right.ticker ||
      left.benchmark !== right.benchmark ||
      left.side !== right.side ||
      left.signal !== right.signal ||
      left.spread !== right.spread ||
      left.netEdge !== right.netEdge ||
      left.positionBp !== right.positionBp ||
      left.status !== right.status ||
      left.reason !== right.reason
    ) {
      return false;
    }
  }
  return true;
}

function syncStreamSignalLatches(
  prev: StreamSignalLatch[],
  decisions: StreamDecisionRow[],
  autoEnabled: boolean,
  automationConfig?: StreamAutomationConfig,
  entryCutoffEnabled = true,
  sessionStartMinutes: number | null = null,
  primeImmediately = false,
  latchHistory?: ReadonlyMap<string, { qualifiedSince: number; lastSeenAt: number }>,
  primedTickers?: ReadonlySet<string>,
  minuteQualifiedTickers?: ReadonlySet<string>
): StreamSignalLatch[] {
  if (!autoEnabled || !automationConfig?.strategyModeEnabled) return [];

  const now = Date.now();
  const minHoldMinutes = Math.max(0, automationConfig.minHoldMinutes ?? 0);
  const minHoldMs = minHoldMinutes * 60_000;
  const nowMinuteIdx = Math.floor(now / 60_000);
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig.printStartTime, 9 * 60 + 20);
  if (entryCutoffEnabled && nowMinutes >= printStartMinutes) return [];
  // Session hasn't started yet (e.g. ARK before 04:00) — automation can be toggled on early,
  // it just waits here instead of creating any latches.
  if (entryCutoffEnabled && sessionStartMinutes != null && nowMinutes < sessionStartMinutes) return [];

  const prevMap = new Map(prev.map((row) => [row.ticker, row]));
  const next: StreamSignalLatch[] = [];

  for (const row of decisions) {
    // Track all signal candidates (above startAbs threshold): ENTRY_READY,
    // BLOCKED_SPREAD, and BLOCKED_EDGE. HOLD means below threshold — skip.
    if (row.status === "HOLD") continue;
    const existing = prevMap.get(row.ticker);
    // Recover qualifiedSince from history if the latch briefly dropped (signal bounced
    // below threshold for < 1 min). Without this, sub-minute noise resets the hold
    // timer and the ticker never dispatches.
    const historic = !existing ? latchHistory?.get(row.ticker) : null;
    // If this ticker was already active in SCANNER when STREAM started, pre-seed its
    // qualifiedSince so it qualifies immediately (matching SCANNER candidate list).
    const isPrimed = !existing && !historic && !!primedTickers?.has(`${row.ticker}|${row.side}`);
    // For latches without a live predecessor (new or recovering from history): require the
    // signal to have been above threshold at the last minute boundary. This mirrors tape
    // behavior where a candle below threshold resets the consecutive streak — even a brief
    // sub-minute bounce must not survive a minute boundary that showed the signal below.
    if (!existing && !isPrimed) {
      const isMinuteQualified = minuteQualifiedTickers == null || minuteQualifiedTickers.has(`${row.ticker}|${row.side}`);
      if (!isMinuteQualified) continue;
    }
    // qualifiedSince is aligned to minute boundaries so hold check (minute index
    // arithmetic) gives integer-exact results matching tape candle counting.
    const minuteAlignedNow = nowMinuteIdx * 60_000;
    next.push({
      ticker: row.ticker,
      benchmark: row.benchmark,
      side: row.side,
      qualifiedSince: existing?.qualifiedSince ?? historic?.qualifiedSince ?? (isPrimed ? minuteAlignedNow - minHoldMs : minuteAlignedNow),
      lastSeenAt: now,
    });
  }

  return next.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function parseStreamSpreadLimit(value: unknown): number | null {
  return toNum(value);
}

export function deriveStreamSignalClass(ruleBand: "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL"): string {
  return ruleBand === "GLOBAL" ? "global" : ruleBand.toLowerCase();
}

export function deriveStreamRatingRule(ruleBand: StreamRatingBand, ratingRules: StreamRatingRule[]): StreamRatingRule {
  return ratingRules.find((rule) => rule.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 };
}

export function deriveStreamExecutionDescriptor(ruleBand: StreamRatingBand, ratingRules: StreamRatingRule[]): StreamExecutionDescriptor {
  return {
    signalClass: deriveStreamSignalClass(ruleBand),
    ratingRule: deriveStreamRatingRule(ruleBand, ratingRules),
  };
}

export function buildStreamFilterConfig(args: StreamFilterBuilderArgs): ArbitrageFilterConfigV1 {
  return {
    version: 1,
    source: {
      cls: args.signalClass,
      type: args.ratingType ?? undefined,
      mode: "all",
      tickers: args.applyTickers,
      minRate: args.minRate,
      minTotal: args.minTotal,
      limit: 5000,
    },
    lists: {
      mode: args.listMode,
      ignore: args.ignoreTickers,
      apply: args.applyTickers,
      pinned: args.pinnedTickers,
    },
    activity: {
      mode: "off",
    },
    bounds: args.bounds,
    exclude: args.exclude,
    include: args.include,
    multi: {
      countries: { enabled: args.multi.countries.length > 0, values: args.multi.countries },
      exchanges: { enabled: args.multi.exchanges.length > 0, values: args.multi.exchanges },
      sectors: { enabled: args.multi.sectors.length > 0, values: args.multi.sectors },
    },
    report: {
      hasReport: args.reportMode,
    },
    zap: {
      mode: args.zapMode,
      thresholdAbs: args.zapThresholdAbs,
    },
  };
}

export function computeStreamDecisionRows(
  signals: ArbitrageSignal[],
  maxSpreadValue: unknown,
  automationConfig?: StreamAutomationConfig,
  bookSnapshot?: MarketMakerBookSnapshot | null,
  metric: "SigmaZap" | "ZapPct" = "SigmaZap"
): StreamDecisionRow[] {
  const spreadLimit = parseStreamSpreadLimit(maxSpreadValue);
  const canApplyBook = signals.length === 1 && (bookSnapshot?.bestBid != null || bookSnapshot?.bestAsk != null);

  return signals.flatMap((row) => {
    const side: "Long" | "Short" = row.direction === "down" ? "Short" : "Long";
    // Direction-specific and metric-specific signal. null = no data → exclude candidate.
    const signal = metric === "SigmaZap"
      ? (side === "Long" ? toNum(row.zapLsigma) : toNum(row.zapSsigma))
      : (side === "Long" ? toNum(row.zapL) : toNum(row.zapS));
    if (signal == null) return []; // no data for this mode/direction → not a candidate
    const bid = toNum(row.Bid ?? row.bidStock ?? row.bid);
    const ask = toNum(row.Ask ?? row.askStock ?? row.ask);
    const bookBid = canApplyBook ? toNum(bookSnapshot?.bestBid) : null;
    const bookAsk = canApplyBook ? toNum(bookSnapshot?.bestAsk) : null;
    const effectiveBid = bookBid ?? bid;
    const effectiveAsk = bookAsk ?? ask;
    const rawSpread = toNum(row.Spread ?? row.spread);
    const spread = effectiveBid != null && effectiveAsk != null
      ? Math.max(0, effectiveAsk - effectiveBid)
      : rawSpread ?? (bid != null && ask != null ? Math.max(0, ask - bid) : null);
    const safePrice = side === "Long" ? effectiveBid : effectiveAsk;
    const edge = signal == null ? null : Math.abs(signal);
    const netEdge = edge == null ? null : Math.max(0, edge - Math.max(0, spread ?? 0));
    const positionBp = numPositionBp(row);
    const blockedBySpread = spreadLimit != null && spread != null && spread > spreadLimit;
    const minNetEdge = automationConfig?.minNetEdge ?? 0;
    const blockedByEdge = netEdge != null && netEdge < minNetEdge;
    const status = blockedBySpread ? "BLOCKED_SPREAD" : blockedByEdge ? "BLOCKED_EDGE" : "ENTRY_READY";
    const reason = blockedBySpread
      ? "spread too wide"
      : blockedByEdge
        ? `net edge below ${minNetEdge.toFixed(2)}`
        : "signal passes filters";

    return {
      ticker: row.ticker,
      benchmark: String(row.benchmark ?? "UNKNOWN"),
      side,
      signal,
      spread,
      spreadBidPct: signalSpreadBidPct(row),
      safePrice,
      netEdge,
      positionBp,
      status,
      reason,
      updatedAt: Date.now(),
    };
  });
}

export function syncStreamPositions(
  prev: StreamPosition[],
  decisions: StreamDecisionRow[],
  allSignals: ArbitrageSignal[],
  filteredSignals: ArbitrageSignal[],
  latches: StreamSignalLatch[],
  autoEnabled: boolean,
  maxSpreadValue: unknown,
  automationConfig?: StreamAutomationConfig,
  entryCutoffEnabled = true,
  sessionStartMinutes: number | null = null,
  loggedOpenTickers: ReadonlySet<string> = new Set(),
  dispatchingEntryTickers: ReadonlySet<string> = new Set()
): StreamPosition[] {
  const signalMap = new Map(allSignals.map((row) => [row.ticker, row]));
  const filteredSignalMap = new Map(filteredSignals.map((row) => [row.ticker, row]));
  const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));
  const spreadLimit = parseStreamSpreadLimit(maxSpreadValue);
  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const nowMinuteIdx = Math.floor(now / 60_000);
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  // After this time, no new ENTRY orders are auto-dispatched (existing positions are unaffected).
  const startCutoffMinutes = parseTimeToMinutes(automationConfig?.startCutoffTime, 9 * 60 + 20);
  const endThreshold = Math.max(0, automationConfig?.endSignalThreshold ?? 0);
  const minHoldMinutes = Math.max(0, automationConfig?.minHoldMinutes ?? 0);
  const minHoldMs = minHoldMinutes * 60_000;

  if (!autoEnabled) {
    return prev
      .filter((row) =>
        row.status !== "CLOSED" &&
        row.entryDispatchedAt != null &&
        loggedOpenTickers.has(row.ticker)
      )
      .map((existing) => {
        const raw = filteredSignalMap.get(existing.ticker) ?? signalMap.get(existing.ticker);
        const zapSigma = existing.side === "Long"
          ? toNum(raw?.zapLsigma)
          : toNum(raw?.zapSsigma);
        const currentSignal = zapSigma ?? signalSigned(raw) ?? signalAbs(raw) ?? existing.lastSignal;
        // Ctrl+O only ever fires as part of the Ctrl+Q -> 1s -> Ctrl+O cutoff pair (dispatch
        // loop, driven by startCutoffTime) — this printStartTime-driven auto print-exit is
        // disabled so no other path can arm/dispatch it.
        const inPrintWindow = false;
        return {
          ...existing,
          lastSignal: currentSignal,
          lastScaleSignal: existing.lastScaleSignal ?? existing.entrySignal ?? currentSignal,
          spread: signalSpread(raw) ?? existing.spread,
          spreadBidPct: signalSpreadBidPct(raw) ?? existing.spreadBidPct,
          status: inPrintWindow ? "PRINT_PENDING" : (existing.status === "EXIT_BLOCKED" ? "EXIT_BLOCKED" : "OPEN"),
          reason: inPrintWindow ? "09:20 print exit armed" : "restored active STREAM position from action log",
          lockedForPrint: inPrintWindow,
          pendingIntent: inPrintWindow && !existing.lockedForPrint
            ? (existing.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT")
            : null,
          entryDispatchedAt: existing.entryDispatchedAt ?? existing.openedAt ?? now,
          lastConfirmedActiveAt: existing.lastConfirmedActiveAt ?? existing.updatedAt ?? now,
          openedAt: existing.openedAt ?? (now - minHoldMs),
          updatedAt: now,
        } satisfies StreamPosition;
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  if (automationConfig?.strategyModeEnabled) {
    const next: StreamPosition[] = [];
    const seen = new Set<string>();
    const maxOpenAllowed = entryCutoffEnabled
      ? (automationConfig.maxOpenPositions ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

    for (const existing of prev) {
      const existsInActionLog = loggedOpenTickers.has(existing.ticker);
      const raw = signalMap.get(existing.ticker);
      const rawSeen = Boolean(raw);
      const filteredRaw = filteredSignalMap.get(existing.ticker);
      // Use direction-specific ZAP sigma field: zapLsigma for Long, zapSsigma for Short.
      // This matches the entry filter (applyExactSonarClientFilters σ ZAP mode) and
      // ensures exit threshold comparison uses the same metric as what the user sees.
      const anyRaw = filteredRaw ?? raw;
      const zapSigma = existing.side === "Long"
        ? (toNum(anyRaw?.zapLsigma) ?? toNum(raw?.zapLsigma))
        : (toNum(anyRaw?.zapSsigma) ?? toNum(raw?.zapSsigma));
      const currentSigned = zapSigma ?? signalSigned(filteredRaw ?? raw) ?? signalSigned(raw);
      const currentAbs = currentSigned == null ? signalAbs(raw) : Math.abs(currentSigned);
      const currentSpread = signalSpread(raw) ?? existing.spread;
      // Lazy-init: positions restored from action log may have null entrySignal (missing deviation).
      // Fill from current signal on first available tick so add triggers are anchored correctly.
      const resolvedEntrySignal = existing.entrySignal ?? currentSigned ?? null;
      const spreadBlocked = spreadLimit != null && currentSpread != null && currentSpread > spreadLimit;
      const holdBlocked = minHoldMs > 0 && now - existing.openedAt < minHoldMs;
      // Ctrl+O only ever fires as part of the Ctrl+Q -> 1s -> Ctrl+O cutoff pair (dispatch
      // loop, driven by startCutoffTime) — this printStartTime-driven auto print-exit is
      // disabled so no other path can arm/dispatch it.
      const inPrintWindow = false;
      const activeExitMode = (automationConfig.exitExecutionMode ?? "active") === "active";
      const belowEndThreshold = currentAbs != null && currentAbs < endThreshold;
      const atOrAboveEndThreshold = currentAbs != null && currentAbs >= endThreshold;
      const exitConfirmTicks = Math.max(1, automationConfig.exitConfirmTicks ?? 3);
      const belowThresholdTicks = belowEndThreshold
        ? (existing.belowThresholdTicks ?? 0) + 1
        : 0;
      const shouldNormalizeExit = activeExitMode && belowThresholdTicks >= exitConfirmTicks;

      let status: StreamPosition["status"] = existing.status;
      let reason = existing.reason;
      let pendingIntent: StreamPosition["pendingIntent"] = existing.pendingIntent;
      let lockedForPrint = existing.lockedForPrint;
      let entryCount = existing.entryCount;
      let lastScaleSignal = existing.lastScaleSignal ?? existing.entrySignal;
      let entryDispatchedAt = existing.entryDispatchedAt ?? null;
      let lastConfirmedActiveAt = existing.lastConfirmedActiveAt ?? null;
      let lastAboveAddCapAt = existing.lastAboveAddCapAt ?? null;
      // Running peak |deviation| for the CURRENT (in-progress) minute — reset on minute rollover.
      // Used by the ADD trigger check below so a threshold crossing between two polls isn't
      // missed just because the specific poll we're on right now reads a lower value.
      let addPeakMinuteIdx = existing.addPeakMinuteIdx ?? null;
      let addPeakAbs = addPeakMinuteIdx === nowMinuteIdx ? (existing.addPeakAbs ?? null) : null;
      let addPeakSigned = addPeakMinuteIdx === nowMinuteIdx ? (existing.addPeakSigned ?? null) : null;
      addPeakMinuteIdx = nowMinuteIdx;
      const decision = decisionMap.get(existing.ticker);
      const entryStillReady = decision?.status === "ENTRY_READY";
      const hasUndispatchedEntry =
        entryDispatchedAt == null &&
        (isEntryOrderIntent(existing.pendingIntent) || existing.entryCount <= 1);

      if (!hasUndispatchedEntry && entryDispatchedAt != null && !existsInActionLog) {
        // Keep in next so the position stays in state across refresh cycles.
        // Without this, setStreamPositions removes it → mergeStreamPositionsWithActionLog
        // can't restore it → latch recreates a new position with a different openedAt
        // → duplicate dispatch before action-log confirmation arrives.
        next.push({
          ...existing,
          lastSignal: currentSigned ?? currentAbs ?? existing.lastSignal,
          spread: currentSpread ?? existing.spread,
          spreadBidPct: signalSpreadBidPct(raw) ?? existing.spreadBidPct,
          status: "PENDING_ENTRY",
          reason: "order dispatched | awaiting execution confirmation",
          pendingIntent: null,
          updatedAt: now,
        });
        seen.add(existing.ticker); // block latch from recreating
        continue;
      }

      if (entryDispatchedAt != null) {
        lastConfirmedActiveAt = now;
      }

      if (hasUndispatchedEntry) {
        // Keep the PENDING_ENTRY alive for a brief window even if the signal
        // momentarily drops out of ENTRY_READY (e.g. brief spread spike between
        // the prime tick and the actual POST). Without this the position is
        // dropped before sendQueuedIntents can fire, so only the first ticker
        // in the batch ever dispatches.
        const pendingEntryAgeMs = now - (existing.openedAt ?? now);
        // Grace period only applies to temporary blocks (spread/edge) — NOT to HOLD
        // (signal out of the entry window). If signal is HOLD, cancel immediately so
        // entries don't fire at deviations far outside the configured startAbsMax cap.
        const entryIsHold = decision?.status === "HOLD";
        const withinGrace = !entryIsHold && pendingEntryAgeMs < 30000;
        if (inPrintWindow || entryIsHold || (!entryStillReady && !withinGrace)) {
          // If a real-mode dispatch is in-flight for this ticker (between
          // dispatchingEntryTickersRef.add and the post-dispatch state update), keep
          // the position alive so the latch cannot recreate it with a new qualifiedSince.
          // A new qualifiedSince would produce a different intentId and bypass
          // dispatchedIntentIdsRef, causing a duplicate ENTRY order to be sent.
          if (dispatchingEntryTickers.has(existing.ticker)) {
            next.push({
              ...existing,
              pendingIntent: null,
              reason: "dispatch in-flight — entry hold cancelled, keeping to block latch",
              updatedAt: now,
            });
            seen.add(existing.ticker);
          }
          continue;
        }

        status = "PENDING_ENTRY";
        reason = "awaiting entry dispatch";
        pendingIntent = isEntryOrderIntent(existing.pendingIntent)
          ? existing.pendingIntent
          : (existing.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE");

        next.push({
          ...existing,
          lastSignal: currentSigned ?? currentAbs ?? existing.lastSignal,
          lastScaleSignal,
          spread: currentSpread,
          spreadBidPct: signalSpreadBidPct(raw) ?? existing.spreadBidPct,
          status,
          reason,
          entryCount,
          lockedForPrint: false,
          pendingIntent,
          entryDispatchedAt: null,
          lastConfirmedActiveAt,
          updatedAt: now,
        });
        seen.add(existing.ticker);
        continue;
      }

      if (!rawSeen) {
        if (entryDispatchedAt == null) {
          status = "OPEN";
          reason = "awaiting entry dispatch";
        } else {
          status = inPrintWindow ? "PRINT_PENDING" : (existing.status === "EXIT_BLOCKED" ? "EXIT_BLOCKED" : "OPEN");
          reason = inPrintWindow ? "09:20 print exit armed" : "tracked from action log | waiting for live signal";
          if (inPrintWindow) {
            if (!existing.lockedForPrint) {
              pendingIntent = existing.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT";
              lockedForPrint = true;
            }
          } else if (!isExitOrderIntent(pendingIntent)) {
            pendingIntent = null;
          }
        }
      } else if (inPrintWindow) {
        status = "PRINT_PENDING";
        reason = "09:20 print exit armed";
        if (!existing.lockedForPrint) {
          pendingIntent = existing.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT";
          lockedForPrint = true;
        }
      } else if (shouldNormalizeExit) {
        if (spreadBlocked && automationConfig.noSpreadExit !== false) {
          status = "EXIT_BLOCKED";
          reason = "exit blocked by spread";
          pendingIntent = null;
        } else if (holdBlocked) {
          status = "OPEN";
          reason = `min hold ${automationConfig.minHoldMinutes}min not reached`;
          pendingIntent = null;
        } else {
          status = "CLOSED";
          reason = `signal below end threshold ${endThreshold.toFixed(2)}`;
          pendingIntent = existing.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE";
        }
      } else {
        status = "OPEN";
        reason = currentAbs == null
          ? "holding | awaiting live deviation"
          : belowEndThreshold
            ? activeExitMode
              ? `below end threshold | confirming exit (${belowThresholdTicks}/${exitConfirmTicks})`
              : "passive mode | holding below end threshold"
            : atOrAboveEndThreshold
              ? "holding above end threshold"
              : "holding";

        if (
          entryDispatchedAt != null &&
          atOrAboveEndThreshold &&
          !inPrintWindow &&
          automationConfig.scaleMode === "scale_in" &&
          entryCount - 1 < Math.max(0, automationConfig.maxAdds ?? 0)
        ) {
          const filteredSignal = filteredRaw;
          const filteredSignedZap = existing.side === "Long"
            ? (toNum(filteredSignal?.zapLsigma) ?? toNum(raw?.zapLsigma))
            : (toNum(filteredSignal?.zapSsigma) ?? toNum(raw?.zapSsigma));
          const filteredSigned = filteredSignedZap ?? signalSigned(filteredSignal) ?? signalSigned(raw);
          const filteredAbs = filteredSigned == null ? null : Math.abs(filteredSigned);

          // Trigger base is always the FIRST entry signal (never lastScaleSignal).
          const entryBase = resolvedEntrySignal;

          // Update this minute's running peak (same direction as entry only — an opposite-
          // direction excursion must not count toward the add trigger or the cap).
          if (
            filteredAbs != null &&
            filteredSigned != null &&
            entryBase != null &&
            entryBase !== 0 &&
            Math.sign(filteredSigned) === Math.sign(entryBase) &&
            (addPeakAbs == null || filteredAbs > addPeakAbs)
          ) {
            addPeakAbs = filteredAbs;
            addPeakSigned = filteredSigned;
          }
          // Effective value = the stronger of "right now" and "peak seen so far this minute" —
          // so a threshold crossing between two polls isn't lost just because the latest poll
          // happens to read a lower value (mirrors SCANNER's mid-minute Hi-sigma sampling).
          const effectiveAbs = addPeakAbs != null && (filteredAbs == null || addPeakAbs > filteredAbs) ? addPeakAbs : filteredAbs;
          const effectiveSigned = effectiveAbs === addPeakAbs && addPeakSigned != null ? addPeakSigned : filteredSigned;

          // Hard cap: no ADDs above this deviation. If exceeded, cancel any pending ADD
          // and restart the add delay timer (same hold protection as entry window).
          const ADD_MAX_SIGMA = 4.0;
          if (effectiveAbs != null && effectiveAbs > ADD_MAX_SIGMA) {
            lastAboveAddCapAt = now;
            if (isEntryOrderIntent(existing.pendingIntent)) pendingIntent = null;
            addPeakAbs = null;
            addPeakSigned = null;
          }
          if (entryBase == null || entryBase === 0) {
            if (!isEntryOrderIntent(existing.pendingIntent)) pendingIntent = null;
          } else {
          const addNumber = entryCount; // entryCount=1 before first add, =2 before second, etc.
          const trigger = Math.abs(entryBase) + Math.max(0, automationConfig.dilutionStep ?? 0) * addNumber;
          const sameSign =
            effectiveSigned != null &&
            Number.isFinite(effectiveSigned) &&
            effectiveSigned !== 0 &&
            Math.sign(effectiveSigned) === Math.sign(entryBase);
          const addDelayMs = Math.max(0, automationConfig.addDelayMinutes ?? 0) * 60_000;
          // Add delay restarts from the last cap breach — same protection as entry minHold.
          // If signal was above ADD_MAX_SIGMA, lastAboveAddCapAt records that moment so
          // the delay runs fresh after the signal returns into range.
          const lastDispatchOrBreach = Math.max(
            existing.lastDispatchedAt ?? existing.entryDispatchedAt ?? existing.openedAt,
            lastAboveAddCapAt ?? 0
          );
          // delay=0: block if an entry intent is already pending (one add per tick).
          // delay>0: use time-based check; also block if pending to prevent double-fire
          //          before the async dispatch updates lastDispatchedAt.
          const addDelayPassed = isEntryOrderIntent(existing.pendingIntent)
            ? false
            : addDelayMs === 0 || now - lastDispatchOrBreach >= addDelayMs;
          const belowAddCap = effectiveAbs == null || effectiveAbs <= ADD_MAX_SIGMA;
          if (effectiveAbs != null && effectiveAbs >= trigger && belowAddCap && sameSign && addDelayPassed) {
            entryCount += 1;
            lastScaleSignal = effectiveSigned;
            pendingIntent = existing.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE";
            reason = `scale-in add ${entryCount - 1}/${Math.max(0, automationConfig.maxAdds ?? 0)} | trigger=${trigger.toFixed(3)}σ`;
            // Consume the peak once acted on, so it doesn't immediately re-trigger next tick.
            addPeakAbs = null;
            addPeakSigned = null;
          } else {
            // Keep a pending ADD intent alive while signal is flat (hasn't crossed the
            // next threshold yet). But if signal reversed sign, clear the intent — the
            // position has moved against entry and the pending order is no longer valid.
            const signalReversed =
              filteredSigned != null &&
              Number.isFinite(filteredSigned) &&
              filteredSigned !== 0 &&
              Math.sign(filteredSigned) !== Math.sign(entryBase);
            if (!isEntryOrderIntent(existing.pendingIntent) || signalReversed) {
              pendingIntent = null;
            }
          }
          }
        } else if (!isExitOrderIntent(pendingIntent)) {
          pendingIntent = null;
        }
      }

      next.push({
        ...existing,
        entrySignal: resolvedEntrySignal,
        lastSignal: currentSigned ?? currentAbs,
        lastScaleSignal,
        belowThresholdTicks,
        spread: currentSpread,
        spreadBidPct: signalSpreadBidPct(raw) ?? existing.spreadBidPct,
        status,
        reason,
        entryCount,
        lockedForPrint,
        pendingIntent,
        entryDispatchedAt,
        lastConfirmedActiveAt,
        lastAboveAddCapAt,
        addPeakMinuteIdx,
        addPeakAbs,
        addPeakSigned,
        updatedAt: now,
      });
      seen.add(existing.ticker);
    }

    let openCount = next.filter((row) =>
      row.status === "OPEN" ||
      row.status === "PRINT_PENDING" ||
      (row.status === "PENDING_ENTRY" && row.entryDispatchedAt != null)
    ).length;
    for (const latch of latches) {
      if (seen.has(latch.ticker)) continue;
      if (entryCutoffEnabled && nowMinutes >= printStartMinutes) continue;
      if (entryCutoffEnabled && nowMinutes >= startCutoffMinutes) continue;
      // Session hasn't started yet (e.g. ARK before 04:00) — same wait-then-work behavior as
      // the latch gate above.
      if (entryCutoffEnabled && sessionStartMinutes != null && nowMinutes < sessionStartMinutes) continue;
      if (openCount >= maxOpenAllowed) continue;
      // Hold check uses minute-index arithmetic to match tape consecutive-candle counting:
      // qualifiedSince is minute-aligned, so this gives exact integer-minute comparison.
      if (nowMinuteIdx - Math.floor(latch.qualifiedSince / 60_000) < minHoldMinutes) continue;
      // Only enter when signal is fully ready — latches may exist for BLOCKED_SPREAD/
      // BLOCKED_EDGE tickers (tracked as candidates) but we don't enter until clear.
      const latchDecision = decisionMap.get(latch.ticker);
      if (!latchDecision || latchDecision.status !== "ENTRY_READY") continue;

      const raw = filteredSignalMap.get(latch.ticker) ?? signalMap.get(latch.ticker);
      const filteredRawEntry = filteredSignalMap.get(latch.ticker);
      const zapSigmaEntry = latch.side === "Long"
        ? (toNum(filteredRawEntry?.zapLsigma) ?? toNum(raw?.zapLsigma))
        : (toNum(filteredRawEntry?.zapSsigma) ?? toNum(raw?.zapSsigma));
      const currentSigned = zapSigmaEntry ?? signalSigned(raw) ?? signalAbs(raw);
      if (currentSigned == null) continue; // no signal — cannot anchor add triggers, skip
      const currentSpread = signalSpread(raw);
      next.push({
        ticker: latch.ticker,
        benchmark: latch.benchmark,
        side: latch.side,
        entrySignal: currentSigned,
        lastSignal: currentSigned,
        lastScaleSignal: currentSigned,
        belowThresholdTicks: 0,
        spread: currentSpread,
        spreadBidPct: signalSpreadBidPct(raw),
        status: "PENDING_ENTRY",
        reason: `entered after hold ${automationConfig.minHoldMinutes ?? 0}min`,
        entryCount: 1,
        lockedForPrint: false,
        pendingIntent: latch.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
        entryDispatchedAt: null,
        lastDispatchedAt: null,
        lastConfirmedActiveAt: null,
        lastAboveAddCapAt: null,
        openedAt: latch.qualifiedSince,
        updatedAt: now,
      });
      openCount += 1;
      seen.add(latch.ticker);
    }

    return next
      .filter((row) => row.status !== "CLOSED" || now - row.updatedAt < 15000)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  const printCloseMinutes = parseTimeToMinutes(automationConfig?.printCloseTime, 9 * 60 + 30);
  const printWindowEnabled = entryCutoffEnabled && automationConfig?.exitMode === "print";
  const next: StreamPosition[] = [];
  const seen = new Set<string>();

  for (const existing of prev) {
    if (existing.entryDispatchedAt != null && !loggedOpenTickers.has(existing.ticker)) {
      continue;
    }
    const current = decisionMap.get(existing.ticker);
    if (!current) {
      if (printWindowEnabled && nowMinutes < printCloseMinutes) {
        next.push({
          ...existing,
          openedAt: existing.openedAt,
          status: nowMinutes >= printStartMinutes ? "PRINT_PENDING" : "OPEN",
          reason: nowMinutes >= printStartMinutes ? "print order armed" : "holding for print window",
          entryDispatchedAt: existing.entryDispatchedAt,
          updatedAt: now,
        });
        seen.add(existing.ticker);
        continue;
      }
      next.push({
        ...existing,
        openedAt: existing.openedAt,
        status: "OPEN",
        reason: "holding | awaiting live deviation",
        entryDispatchedAt: existing.entryDispatchedAt,
        updatedAt: now,
      });
      seen.add(existing.ticker);
      continue;
    }

    if (current.status === "BLOCKED_SPREAD") {
      next.push({
        ...existing,
        openedAt: existing.openedAt,
        lastSignal: current.signal,
        spread: current.spread,
        spreadBidPct: current.spreadBidPct,
        status: automationConfig?.noSpreadExit === false ? "CLOSED" : "EXIT_BLOCKED",
        reason: automationConfig?.noSpreadExit === false ? "forced exit despite spread" : "exit blocked by spread",
        updatedAt: now,
      });
      seen.add(existing.ticker);
      continue;
    }

    next.push({
      ...existing,
      openedAt: existing.openedAt,
      lastScaleSignal: existing.lastScaleSignal,
      lastSignal: current.signal,
      spread: current.spread,
      spreadBidPct: current.spreadBidPct,
      status: printWindowEnabled && nowMinutes >= printStartMinutes ? "PRINT_PENDING" : "OPEN",
      reason:
        printWindowEnabled
          ? nowMinutes >= printStartMinutes
            ? "print exit armed"
            : "holding until print window"
          : automationConfig?.scaleMode === "scale_in"
            ? "holding filtered signal | scale-in enabled"
            : "holding filtered signal",
      entryCount: existing.entryCount,
      lockedForPrint: existing.lockedForPrint,
      pendingIntent: null,
      entryDispatchedAt: existing.entryDispatchedAt,
      updatedAt: now,
    });
    seen.add(existing.ticker);
  }

  return next
    .filter((row) => row.status !== "CLOSED" || now - row.updatedAt < 15000)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function buildStreamOrderIntents(
  decisions: StreamDecisionRow[],
  positions: StreamPosition[],
  autoEnabled: boolean,
  automationConfig?: StreamAutomationConfig,
  entryCutoffEnabled = false
): StreamOrderIntent[] {
  if (!autoEnabled) return [];

  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  const intents: StreamOrderIntent[] = [];
  const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));

  if (automationConfig?.strategyModeEnabled) {
    // Ctrl+O is only ever sent as part of the Ctrl+Q → 1s → Ctrl+O cutoff pair, driven by
    // startCutoffTime (see the dispatch loop). No other automatic path fires it here — entries
    // are already stopped at cutoff via syncStreamPositions/syncStreamSignalLatches.
    for (const position of positions) {
      if (!position.pendingIntent) continue;
      intents.push({
        id: intentId([position.ticker, "strategy", position.openedAt, position.pendingIntent, position.entryCount, nowMinutes >= printStartMinutes ? "print" : "live"]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.pendingIntent,
        sequence: position.entryCount,
        priceRef:
          position.pendingIntent === "EXIT_LONG_PRINT" || position.pendingIntent === "EXIT_SHORT_PRINT"
            ? "PRINT"
            : position.pendingIntent === "EXIT_LONG_AGGRESSIVE"
              ? (automationConfig.exitExecutionMode === "passive" ? "ASK" : "BID")
              : position.pendingIntent === "EXIT_SHORT_AGGRESSIVE"
                ? (automationConfig.exitExecutionMode === "passive" ? "BID" : "ASK")
                : position.side === "Long"
                  ? "ASK"
                  : "BID",
        status: position.status === "EXIT_BLOCKED" ? "BLOCKED" : "QUEUED",
        reason: position.reason,
        createdAt: now,
      });
    }

    return intents.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.intent.localeCompare(b.intent));
  }

  for (const row of decisions) {
    if (row.status === "ENTRY_READY") {
      if (entryCutoffEnabled && nowMinutes >= printStartMinutes) continue;
      intents.push({
        id: intentId([row.ticker, "enter", row.side]),
        ticker: row.ticker,
        benchmark: row.benchmark,
        side: row.side,
        intent: row.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
        sequence: 1,
        priceRef: row.side === "Long" ? "ASK" : "BID",
        status: "QUEUED",
        reason:
          `${automationConfig?.hedgeMode === "hedged" ? "hedged" : "unhedged"} aggressive entry | ${automationConfig?.sizingMode === "TIER" ? `tiers ${automationConfig?.sizeValue}` : `usd ${automationConfig?.sizeValue}`}${automationConfig?.scaleMode === "scale_in" ? ` | step ${automationConfig?.dilutionStep}` : ""}`,
        createdAt: now,
      });
    } else if (row.status === "BLOCKED_SPREAD" || row.status === "BLOCKED_EDGE") {
      intents.push({
        id: intentId([row.ticker, "blocked", row.status]),
        ticker: row.ticker,
        benchmark: row.benchmark,
        side: row.side,
        intent: row.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
        sequence: 1,
        priceRef: row.side === "Long" ? "ASK" : "BID",
        status: "BLOCKED",
        reason: row.reason,
        createdAt: now,
      });
    }
  }

  for (const position of positions) {
    const decision = decisionMap.get(position.ticker);
    const normalizeExitTriggered =
      decision?.signal != null &&
      Number.isFinite(decision.signal) &&
      Math.abs(decision.signal) < Math.max(0, automationConfig?.endSignalThreshold ?? 0);
    if (position.status === "EXIT_BLOCKED") {
      intents.push({
        id: intentId([position.ticker, "exit-blocked", position.side]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE",
        sequence: position.entryCount,
        priceRef: position.side === "Long" ? "BID" : "ASK",
        status: "BLOCKED",
        reason: position.reason,
        createdAt: now,
      });
      continue;
    }

    if (normalizeExitTriggered) {
      const holdBlocked = automationConfig?.minHoldMinutes != null && automationConfig.minHoldMinutes > 0 && now - position.openedAt < automationConfig.minHoldMinutes * 60_000;
      intents.push({
        id: intentId([position.ticker, "normalize-exit", position.side]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE",
        sequence: position.entryCount,
        priceRef: automationConfig?.exitExecutionMode === "passive" ? (position.side === "Long" ? "ASK" : "BID") : (position.side === "Long" ? "BID" : "ASK"),
        status: holdBlocked ? "BLOCKED" : "QUEUED",
        reason: holdBlocked
          ? `min hold ${automationConfig?.minHoldMinutes}min not reached`
          : `normalization exit | abs(signal) ${Math.abs(decision.signal!).toFixed(2)} < ${Math.max(0, automationConfig?.endSignalThreshold ?? 0).toFixed(2)} | ${automationConfig?.exitExecutionMode === "passive" ? "passive" : "active"}`,
        createdAt: now,
      });
    }
  }

  return intents.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.intent.localeCompare(b.intent));
}

function buildFallbackPendingEntryPositions(
  existingPositions: StreamPosition[],
  qualifiedLatches: StreamSignalLatch[],
  filteredSignals: ArbitrageSignal[],
  automationConfig: StreamAutomationConfig | undefined,
  entryCutoffEnabled: boolean,
  sessionStartMinutes: number | null,
): StreamPosition[] {
  if (!qualifiedLatches.length) return existingPositions;

  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  if (entryCutoffEnabled && nowMinutes >= printStartMinutes) return existingPositions;
  if (entryCutoffEnabled && sessionStartMinutes != null && nowMinutes < sessionStartMinutes) return existingPositions;

  // Respect the same entryCutoffEnabled guard used everywhere else:
  // global band (entryCutoffEnabled=false) has no position cap.
  const maxOpenAllowed = entryCutoffEnabled
    ? Math.max(1, automationConfig?.maxOpenPositions ?? 10)
    : Number.MAX_SAFE_INTEGER;
  const signalMap = new Map(filteredSignals.map((row) => [row.ticker, row]));
  const next = existingPositions.slice();
  const existingByTicker = new Set(existingPositions.map((row) => row.ticker));
  let openCount = existingPositions.filter((row) =>
    row.status === "OPEN" ||
    row.status === "PRINT_PENDING" ||
    row.status === "PENDING_ENTRY"
  ).length;

  for (const latch of qualifiedLatches) {
    if (existingByTicker.has(latch.ticker)) continue;
    if (openCount >= maxOpenAllowed) break;

    const raw = signalMap.get(latch.ticker);
    const signed = latch.side === "Long"
      ? (toNum(raw?.zapLsigma) ?? signalSigned(raw) ?? signalAbs(raw))
      : (toNum(raw?.zapSsigma) ?? signalSigned(raw) ?? signalAbs(raw));

    next.push({
      ticker: latch.ticker,
      benchmark: latch.benchmark,
      side: latch.side,
      entrySignal: signed,
      lastSignal: signed,
      lastScaleSignal: signed,
      belowThresholdTicks: 0,
      spread: signalSpread(raw),
      spreadBidPct: signalSpreadBidPct(raw),
      status: "PENDING_ENTRY",
      reason: `fallback pending entry after hold ${automationConfig?.minHoldMinutes ?? 0}m`,
      entryCount: 1,
      lockedForPrint: false,
      pendingIntent: latch.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
      entryDispatchedAt: null,
      lastDispatchedAt: null,
      lastConfirmedActiveAt: null,
      lastAboveAddCapAt: null,
      openedAt: latch.qualifiedSince,
      updatedAt: now,
    });

    existingByTicker.add(latch.ticker);
    openCount += 1;
  }

  return next.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

type UseStreamEngineArgs = {
  enabled: boolean;
  ocrEnabled?: boolean;
  trackedSignalsEnabled?: boolean;
  initialAutoEnabled?: boolean;
  signalClass: string;
  ruleBand?: string | null;
  ratingType: string | null | undefined;
  metric: "SigmaZap" | "ZapPct";
  ratingRule: { minRate: number; minTotal: number };
  startAbs?: number | null;
  startAbsMax?: number | null;
  endAbs?: number | null;
  closeMode?: "Active" | "Passive";
  minHoldCandles?: number | null;
  ratingMode?: string | null;
  session?: string | null;
  ratingMinRate?: number | null;
  ratingMinTotal?: number | null;
  tickersCsv?: string;
  minCorr?: number | null;
  maxCorr?: number | null;
  minBeta?: number | null;
  maxBeta?: number | null;
  minSigma?: number | null;
  maxSigma?: number | null;
  sideFilter?: "" | "Long" | "Short" | null;
  filterConfig: ArbitrageFilterConfigV1;
  exactSonarFilterSnapshot?: SonarExactFilterSnapshot;
  maxSpreadValue: unknown;
  automationConfig?: StreamAutomationConfig;
  /** Tickers currently active in SCANNER (already past minHoldCandles). Used as a
   *  quick fallback seed before the async fetch completes. */
  activeScannerTickers?: ReadonlyArray<{ ticker: string; side: "Long" | "Short" }>;
  /** Called once at automation startup to fetch the authoritative active list from the
   *  tape API. Result overwrites activeScannerTickers so the seed is always fresh. */
  onFetchActiveTickers?: () => Promise<ReadonlyArray<{ ticker: string; side: "Long" | "Short" }>>;
  onUpdated?: () => void;
  onError?: (message: string | null) => void;
};

type TradingAppBoundWindowResponse = {
  ok?: boolean;
  bound?: TradingAppBoundWindowInfo | null;
  error?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_LOCAL_TRADING_APP_BRIDGE = "http://localhost:5197";
const TRADING_APP_BRIDGE_QUERY_KEY = "tradingAppBridge";
const TRADING_APP_BRIDGE_STORAGE_KEY = "tradingAppBridgeBase";
const STREAM_AUTOMATION_TICK_MS = 1000;

function sanitizeTradingAppBridgeBase(x: string | null | undefined): string | null {
  const raw = (x ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/\/+$/, ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getTradingAppBridgeBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const currentUrl = new URL(window.location.href);
      const fromQuery = sanitizeTradingAppBridgeBase(currentUrl.searchParams.get(TRADING_APP_BRIDGE_QUERY_KEY));
      if (fromQuery) {
        window.localStorage.setItem(TRADING_APP_BRIDGE_STORAGE_KEY, fromQuery);
        return fromQuery;
      }
    } catch {
      // ignore query parsing issues
    }

    try {
      const fromStorage = sanitizeTradingAppBridgeBase(window.localStorage.getItem(TRADING_APP_BRIDGE_STORAGE_KEY));
      if (fromStorage) {
        return fromStorage;
      }
    } catch {
      // ignore storage issues
    }

    return DEFAULT_LOCAL_TRADING_APP_BRIDGE;
  }

  return (
    sanitizeTradingAppBridgeBase(process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL) ||
    sanitizeTradingAppBridgeBase(process.env.NEXT_PUBLIC_BRIDGE_API) ||
    ""
  );
}

const tradingAppBridgeUrl = (path: string) => {
  const base = getTradingAppBridgeBaseUrl();
  if (!base) {
    throw new Error("TradingApp bridge base URL is empty. Use client-side fetch or set NEXT_PUBLIC_TRADING_BRIDGE_URL.");
  }
  return `${base}/api/execution/tradingapp${path.startsWith("/") ? path : `/${path}`}`;
};

export function useStreamEngine({
  enabled,
  ocrEnabled = false,
  trackedSignalsEnabled = true,
  initialAutoEnabled = true,
  signalClass,
  ruleBand,
  ratingType,
  metric,
  ratingRule,
  startAbs,
  startAbsMax,
  endAbs,
  closeMode,
  minHoldCandles,
  ratingMode,
  session,
  ratingMinRate,
  ratingMinTotal,
  tickersCsv,
  minCorr,
  maxCorr,
  minBeta,
  maxBeta,
  minSigma,
  maxSigma,
  sideFilter,
  filterConfig,
  exactSonarFilterSnapshot,
  maxSpreadValue,
  automationConfig,
  activeScannerTickers,
  onFetchActiveTickers,
  onUpdated,
  onError,
}: UseStreamEngineArgs) {
  const STATUS_REFRESH_INTERVAL_MS = 2500;
  const AUTO_DISPATCH_COOLDOWN_MS = 15000;
  // After dismissStreamActivePositions, block auto-entry for this ticker for 5 minutes.
  // Prevents re-dispatch when signal is still ENTRY_READY after manual dismiss.
  const DISMISS_ENTRY_BLOCK_MS = 5 * 60_000;
  const SIGNAL_SURGE_GUARD_MIN_COUNT = 24;
  const SIGNAL_SURGE_GUARD_MULTIPLIER = 3;
  const SIGNAL_SURGE_GUARD_HOLD_MS = 10000;
  const SIGNAL_SURGE_GUARD_STABLE_TICKS = 2;
  const entryCutoffEnabled = hasStrategyEntryCutoff(signalClass);
  const strategySessionStartMinutes = getStrategySessionStartMinutes(signalClass);
  const actionLogStorageKey = streamActionLogStorageKey(signalClass);
  const [currentDayKey, setCurrentDayKey] = useState<string>(() => localDayKey());
  useEffect(() => {
    // Re-check day key every minute so the log resets at midnight without page reload.
    const timer = setInterval(() => {
      const next = localDayKey();
      setCurrentDayKey((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const [streamActionLog, setStreamActionLog] = useState<StreamActionLogEntry[]>(() => readStreamActionLog(actionLogStorageKey));
  const [streamPositions, setStreamPositions] = useState<StreamPosition[]>(() => buildStreamPositionsFromActionLog(readStreamActionLog(actionLogStorageKey), currentDayKey));
  const [streamOrderIntents, setStreamOrderIntents] = useState<StreamOrderIntent[]>([]);
  const [streamSignalLatches, setStreamSignalLatches] = useState<StreamSignalLatch[]>([]);
  const [streamAutoEnabled, setStreamAutoEnabledState] = useState<boolean>(initialAutoEnabled);
  const [streamEntryReadyCount, setStreamEntryReadyCount] = useState<number>(0);
  const [streamSessionStartedAt, setStreamSessionStartedAt] = useState<number | null>(null);
  const [streamSessionStoppedAt, setStreamSessionStoppedAt] = useState<number | null>(null);
  const [streamSentOrdersCount, setStreamSentOrdersCount] = useState<number>(0);
  const [streamManualExecutionBusy, setStreamManualExecutionBusy] = useState<boolean>(false);
  const [executionRevision, setExecutionRevision] = useState(0);
  const dispatchedIntentIdsRef = useRef<Set<string>>(new Set());
  const dispatchedHedgeIntentIdsRef = useRef<Set<string>>(new Set());
  const recentDispatchAttemptsRef = useRef<Map<string, number>>(new Map());
  // Tracks tickers whose initial ENTRY dispatch is currently in-flight (between
  // dispatchedIntentIdsRef.add and the post-dispatch setStreamPositions that sets
  // entryDispatchedAt). Checked synchronously in syncStreamPositions to prevent the
  // engine from dropping the position (via HOLD/grace-timeout path) and allowing the
  // latch to recreate it with a new qualifiedSince → different intentId → double entry.
  const dispatchingEntryTickersRef = useRef<Set<string>>(new Set());
  // Tickers manually dismissed via dismissStreamActivePositions: ticker → dismissedAt ms.
  // Prevents automatic re-entry dispatch for DISMISS_ENTRY_BLOCK_MS (5 min) after dismiss,
  // regardless of intentId or mode. Cleared on resetStreamAutomationState / startStreamAutomation.
  const dismissedEntryTickersRef = useRef<Map<string, number>>(new Map());
  const pendingActionLogEntriesRef = useRef<Map<string, StreamActionLogEntry[]>>(new Map());
  const streamAutoEnabledRef = useRef<boolean>(initialAutoEnabled);
  const primaryStreamSignalsRef = useRef<ArbitrageSignal[]>([]);
  const trackedStreamSignalsRef = useRef<ArbitrageSignal[]>([]);
  const streamActionLogRef = useRef<StreamActionLogEntry[]>(streamActionLog);
  const localRefreshTimerRef = useRef<number | null>(null);
  const streamExecutionSnapshotRef = useRef<TradingAppExecutionSnapshot | null>(streamExecutionStore.getSnapshot());
  const executionSnapshotSignatureRef = useRef<string>("");
  const actionLogVersionRef = useRef(0);
  const lastStatusRefreshAtRef = useRef<number>(0);
  const refreshInFlightRef = useRef(false);
  const statusRefreshInFlightRef = useRef(false);
  const prevFilteredCountRef = useRef<number>(0);
  const surgeGuardUntilRef = useRef<number>(0);
  const surgeGuardStableTicksRef = useRef<number>(0);
  const strategyAutoWasRunningRef = useRef<boolean>(false);
  const primeImmediateEntriesRef = useRef<boolean>(false);
  const activeScannerTickersRef = useRef<ReadonlyArray<{ ticker: string; side: "Long" | "Short" }>>(activeScannerTickers ?? []);
  const primedFromScannerRef = useRef<ReadonlySet<string>>(new Set());
  // Accumulates above-threshold tickers across ALL polls within the current (in-progress) minute.
  const minuteAccumRef = useRef<{ minuteIdx: number; aboveSet: Set<string> } | null>(null);
  // Frozen union set for the last FULLY completed minute — used to gate latch creation and
  // hold-streak eviction, so a ticker that only crossed threshold between polls (not caught by
  // a single point-in-time sample) still counts as qualified for that minute.
  const minuteSnapshotRef = useRef<{ minuteIdx: number; aboveSet: Set<string> } | null>(null);
  const latchQualifiedSinceHistoryRef = useRef<Map<string, { qualifiedSince: number; lastSeenAt: number }>>(new Map());
  // Tracks when each ticker first qualified above startAbs — always active, independent of automation.
  // Used for minHoldCandles display filter (same consecutive-candle logic as tape Scanner).
  const displayQualifiedSinceRef = useRef<Map<string, { qualifiedSince: number; lastSeenAt: number }>>(new Map());
  // Tracks signals that passed minHoldCandles — stays alive (visible) until sigma < endAbs or >60s gap.
  // Mirrors Scanner Active list: signal stays shown even when sigma decays below startAbs to [endAbs, startAbs).
  const signalDisplayedRef = useRef<Map<string, number>>(new Map());
  const streamPositionsRef = useRef<StreamPosition[]>(streamPositions);
  const streamSignalLatchesRef = useRef<StreamSignalLatch[]>([]);
  const rawSignalByTickerRef = useRef<Map<string, ArbitrageSignal>>(new Map());
  const dispatchLoopActiveRef = useRef(false);
  const dispatchLoopReplayRef = useRef(false);
  // Tracks the last "dayKey|startCutoffTime" for which the Ctrl+Q cutoff hotkey was
  // sent, so it fires exactly once per cutoff crossing (not once per dispatch tick).
  const cutoffHotkeySentKeyRef = useRef<string | null>(null);
  // Set by resetStreamAutomationState when called while a dispatch loop is active.
  // The loop's finally block detects this and clears dedup refs AFTER the in-flight
  // request completes, preventing the window where refs are clear but an order is in-flight.
  const pendingResetDispatchRefsRef = useRef(false);
  const refreshRef = useRef<((options?: { refreshBridge?: boolean }) => Promise<void>) | null>(null);
  const onErrorRef = useRef<typeof onError>(onError);
  const onFetchActiveTickersRef = useRef<typeof onFetchActiveTickers>(onFetchActiveTickers);

  const setStreamAutoEnabled = useCallback((nextValue: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof nextValue === "function" ? nextValue(streamAutoEnabledRef.current) : nextValue;
    streamAutoEnabledRef.current = resolved;
    setStreamAutoEnabledState(resolved);
  }, []);

  const appendStreamActionLogEntries = useCallback((entries: StreamActionLogEntry[]) => {
    if (!entries.length) return;
    const nextLog = pruneStreamActionLog([...streamActionLogRef.current, ...entries], Date.now());
    const entryLoggedTickers = new Set(
      entries
        .filter((row) => row.kind === "ENTRY" || row.kind === "ADD")
        .map((row) => row.ticker)
    );
    const closeLoggedTickers = new Set(
      entries
        .filter((row) => row.kind === "CLOSE")
        .map((row) => row.ticker)
    );
    actionLogVersionRef.current += 1;
    streamActionLogRef.current = nextLog;
    setStreamActionLog(nextLog);
    setStreamPositions((prev) => mergeStreamPositionsWithActionLog(prev, nextLog, localDayKey()));
    setStreamOrderIntents((prev) => prev.filter((intent) => {
      if (
        entryLoggedTickers.has(intent.ticker) &&
        (intent.intent === "ENTER_LONG_AGGRESSIVE" || intent.intent === "ENTER_SHORT_AGGRESSIVE")
      ) {
        return false;
      }
      if (
        closeLoggedTickers.has(intent.ticker) &&
        (
          intent.intent === "EXIT_LONG_AGGRESSIVE" ||
          intent.intent === "EXIT_SHORT_AGGRESSIVE" ||
          intent.intent === "EXIT_LONG_PRINT" ||
          intent.intent === "EXIT_SHORT_PRINT"
        )
      ) {
        return false;
      }
      if (intent.intent === "CLOSE_ALL_PRINT" && closeLoggedTickers.size > 0) {
        return false;
      }
      return true;
    }));
    queueMicrotask(() => {
      void refreshRef.current?.({ refreshBridge: false }).catch(() => {
        // best-effort local recompute after action log append
      });
    });
  }, []);

  const flushConfirmedPendingActionLogEntries = useCallback((snapshot: TradingAppExecutionSnapshot | null) => {
    if (!snapshot || pendingActionLogEntriesRef.current.size === 0) return;

    const confirmedEntries: StreamActionLogEntry[] = [];
    const confirmedIntentIds: string[] = [];

    pendingActionLogEntriesRef.current.forEach((entries, intentId) => {
      if (!hasExecutionDispatchConfirmation(snapshot, intentId, entries)) return;
      confirmedEntries.push(...normalizeConfirmedActionLogEntries(entries));
      confirmedIntentIds.push(intentId);
    });

    if (!confirmedIntentIds.length) return;

    for (const intentId of confirmedIntentIds) {
      pendingActionLogEntriesRef.current.delete(intentId);
    }

    appendStreamActionLogEntries(confirmedEntries);
  }, [appendStreamActionLogEntries]);

  const queuePendingActionLogEntries = useCallback((intentId: string, entries: StreamActionLogEntry[]) => {
    if (!intentId || !entries.length) return;
    pendingActionLogEntriesRef.current.set(intentId, entries);
    flushConfirmedPendingActionLogEntries(streamExecutionSnapshotRef.current);
  }, [flushConfirmedPendingActionLogEntries]);

  useEffect(() => {
    return streamExecutionStore.subscribe(() => {
      const snapshot = streamExecutionStore.getSnapshot();
      streamExecutionSnapshotRef.current = snapshot;
      flushConfirmedPendingActionLogEntries(snapshot);
      setExecutionRevision((prev) => prev + 1);
    });
  }, [flushConfirmedPendingActionLogEntries]);

  const openLoggedTickers = useMemo(
    () => buildOpenTickersFromActionLog(streamActionLog, currentDayKey),
    [currentDayKey, streamActionLog]
  );

  const primarySignalsStreamUrl = useMemo(() => buildSignalsStreamUrl({
    cls: signalClass as any,
    type: (ratingType ?? "any") as any,
    mode: (exactSonarFilterSnapshot?.mode ?? "all") as any,
    ratingMode: (ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) as any,
    zapMode: (exactSonarFilterSnapshot?.zapMode ?? (metric === "SigmaZap" ? "sigma" : "zap")) as any,
    minRate: ratingMinRate ?? ratingRule.minRate,
    minTotal: ratingMinTotal ?? ratingRule.minTotal,
    // Active mode: lower server threshold to endAbs so decaying signals (sigma in [endAbs, startAbs)) are returned.
    // Passive mode: endAbs is not a sigma threshold (exit = gap reversal) — keep server threshold at startAbs.
    startAbs: (closeMode !== "Passive" && endAbs != null && endAbs > 0 && endAbs < (startAbs ?? Infinity))
      ? endAbs
      : (startAbs ?? undefined),
    tickers: tickersCsv || undefined,
    minCorr: minCorr ?? undefined,
    maxCorr: maxCorr ?? undefined,
    minBeta: minBeta ?? undefined,
    maxBeta: maxBeta ?? undefined,
    minSigma: minSigma ?? undefined,
    maxSigma: maxSigma ?? undefined,
    limit: 5000,
    includeAll: false,
  }), [
    exactSonarFilterSnapshot,
    maxBeta,
    maxCorr,
    maxSigma,
    metric,
    minBeta,
    minCorr,
    minSigma,
    ratingMinRate,
    ratingMinTotal,
    ratingRule.minRate,
    ratingRule.minTotal,
    ratingType,
    signalClass,
    startAbs,
    endAbs,
    closeMode,
    ratingMode,
    tickersCsv,
  ]);

  const trackedSignalsStreamUrl = useMemo(() => {
    if (!trackedSignalsEnabled) return null;
    const activeTrackedTickers = Array.from(openLoggedTickers);
    if (!activeTrackedTickers.length) return null;
    return buildSignalsStreamUrl({
      cls: signalClass as any,
      type: (ratingType ?? "any") as any,
      mode: (exactSonarFilterSnapshot?.mode ?? "all") as any,
      ratingMode: (ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) as any,
      zapMode: (exactSonarFilterSnapshot?.zapMode ?? (metric === "SigmaZap" ? "sigma" : "zap")) as any,
      minRate: 0,
      minTotal: 1,
      tickers: activeTrackedTickers.join(","),
      minCorr: undefined,
      maxCorr: undefined,
      minBeta: undefined,
      maxBeta: undefined,
      minSigma: undefined,
      maxSigma: undefined,
      limit: Math.max(20, Math.min(80, activeTrackedTickers.length * 2)),
      includeAll: true,
    });
  }, [
    exactSonarFilterSnapshot,
    metric,
    openLoggedTickers,
    ratingType,
    signalClass,
    trackedSignalsEnabled,
  ]);

  useEffect(() => {
    const restoredLog = readStreamActionLog(actionLogStorageKey);
    streamActionLogStore.clear();
    streamDecisionStore.clear();
    streamOrderIntentStore.clear();
    streamPositionStore.clear();
    streamSignalStore.clear();
    streamUpdatedAtStore.clear();
    streamFilterPassLogStore.clear();
    actionLogVersionRef.current += 1;
    setStreamActionLog(restoredLog);
    setStreamPositions(buildStreamPositionsFromActionLog(restoredLog, localDayKey()));
    setStreamSignalLatches([]);
    setStreamOrderIntents([]);
    setStreamEntryReadyCount(0);
    setStreamSessionStartedAt(null);
    setStreamSessionStoppedAt(null);
    setStreamSentOrdersCount(0);
    latchQualifiedSinceHistoryRef.current.clear();
    displayQualifiedSinceRef.current.clear();
    signalDisplayedRef.current.clear();
    dispatchedIntentIdsRef.current.clear();
    dispatchedHedgeIntentIdsRef.current.clear();
    recentDispatchAttemptsRef.current.clear();
    dispatchingEntryTickersRef.current.clear();
    dismissedEntryTickersRef.current.clear();
  }, [actionLogStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const next = pruneStreamActionLog(streamActionLog, Date.now());
      if (!next.length) {
        window.localStorage.removeItem(actionLogStorageKey);
        return;
      }
      window.localStorage.setItem(actionLogStorageKey, JSON.stringify(next));
    } catch {
      // ignore storage issues
    }
  }, [actionLogStorageKey, streamActionLog]);

  const scheduleLocalRefresh = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    if (localRefreshTimerRef.current != null) return;
    localRefreshTimerRef.current = window.setTimeout(() => {
      localRefreshTimerRef.current = null;
      void refreshRef.current?.({ refreshBridge: false }).catch((error: any) => {
        onErrorRef.current?.(error?.message ?? String(error));
      });
    }, 180);
  }, [enabled]);

  const applyPrimaryStreamPayload = useCallback((payload: any) => {
    const rawItems: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const normalized = rawItems.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
    primaryStreamSignalsRef.current = normalized;
    scheduleLocalRefresh();
  }, [scheduleLocalRefresh]);

  const applyStreamDiffToRef = useCallback((
    targetRef: { current: ArbitrageSignal[] },
    payload: any
  ) => {
    const added = Array.isArray(payload?.added) ? payload.added : [];
    const updated = Array.isArray(payload?.updated) ? payload.updated : [];
    const removed = Array.isArray(payload?.removed) ? payload.removed : [];

    const normalizedAdded = added.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
    const normalizedUpdated = updated.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
    const removedTickers = new Set<string>(
      removed
        .map((ticker: any) => String(ticker ?? "").trim().toUpperCase())
        .filter((ticker): ticker is string => ticker.length > 0)
    );

    const nextMap = new Map(
      targetRef.current.map((row) => [row.ticker, row] as const)
    );

    for (const ticker of removedTickers) {
      nextMap.delete(ticker);
    }

    for (const row of normalizedAdded) {
      nextMap.set(row.ticker, row);
    }

    for (const row of normalizedUpdated) {
      nextMap.set(row.ticker, row);
    }

    targetRef.current = Array.from(nextMap.values());
    scheduleLocalRefresh();
  }, [scheduleLocalRefresh]);

  const applyTrackedStreamPayload = useCallback((payload: any) => {
    const rawItems: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const normalized = rawItems.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
    trackedStreamSignalsRef.current = normalized;
    scheduleLocalRefresh();
  }, [scheduleLocalRefresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const source = new EventSource(primarySignalsStreamUrl);
    const handlePayload = (event: MessageEvent<string>) => {
      try {
        applyPrimaryStreamPayload(JSON.parse(String(event.data)));
      } catch {
        // ignore malformed stream payloads and keep previous snapshot
      }
    };
    const handleDiff = (event: MessageEvent<string>) => {
      try {
        applyStreamDiffToRef(primaryStreamSignalsRef, JSON.parse(String(event.data)));
      } catch {
        // ignore malformed stream payloads and keep previous snapshot
      }
    };

    source.onmessage = handlePayload;
    source.addEventListener("snapshot", handlePayload as EventListener);
    source.addEventListener("diff", handleDiff as EventListener);

    return () => {
      source.close();
    };
  }, [applyPrimaryStreamPayload, applyStreamDiffToRef, enabled, primarySignalsStreamUrl]);

  useEffect(() => {
    if (!enabled || !trackedSignalsStreamUrl || typeof window === "undefined") {
      if (trackedStreamSignalsRef.current.length) {
        trackedStreamSignalsRef.current = [];
        scheduleLocalRefresh();
      }
      return;
    }

    const source = new EventSource(trackedSignalsStreamUrl);
    const handlePayload = (event: MessageEvent<string>) => {
      try {
        applyTrackedStreamPayload(JSON.parse(String(event.data)));
      } catch {
        // ignore malformed stream payloads and keep previous snapshot
      }
    };
    const handleDiff = (event: MessageEvent<string>) => {
      try {
        applyStreamDiffToRef(trackedStreamSignalsRef, JSON.parse(String(event.data)));
      } catch {
        // ignore malformed stream payloads and keep previous snapshot
      }
    };

    source.onmessage = handlePayload;
    source.addEventListener("snapshot", handlePayload as EventListener);
    source.addEventListener("diff", handleDiff as EventListener);

    return () => {
      source.close();
    };
  }, [applyStreamDiffToRef, applyTrackedStreamPayload, enabled, scheduleLocalRefresh, trackedSignalsStreamUrl]);

  useEffect(() => {
    setStreamPositions((prev) => {
      return mergeStreamPositionsWithActionLog(prev, streamActionLog, currentDayKey);
    });
  }, [currentDayKey, streamActionLog]);

  const refreshExecutionStatus = useCallback(async (force = false): Promise<TradingAppExecutionSnapshot | null> => {
    const now = Date.now();
    const currentExecutionSnapshot = streamExecutionSnapshotRef.current;
    if (!force && currentExecutionSnapshot && now - lastStatusRefreshAtRef.current < STATUS_REFRESH_INTERVAL_MS) {
      return currentExecutionSnapshot;
    }
    if (!force && statusRefreshInFlightRef.current) {
      return currentExecutionSnapshot;
    }
    try {
      statusRefreshInFlightRef.current = true;
      const response = await fetch(tradingAppBridgeUrl("/status"), { cache: "no-store" });
      if (!response.ok) return null;
      const json = await response.json();
      const snapshot = json as TradingAppExecutionSnapshot;
      lastStatusRefreshAtRef.current = now;
      const signature = JSON.stringify(snapshot);
      if (signature !== executionSnapshotSignatureRef.current) {
        executionSnapshotSignatureRef.current = signature;
        streamExecutionSnapshotRef.current = snapshot;
        streamExecutionStore.applySnapshot(snapshot);
      }
      return snapshot;
    } catch {
      // backend may be unavailable during frontend work
      return null;
    } finally {
      statusRefreshInFlightRef.current = false;
    }
  }, []);

  const bindStreamActiveWindow = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/bind-active-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to bind active window (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const bindStreamWindows = useCallback(async () => {
    const activeResponse = await fetch(tradingAppBridgeUrl("/bind-active-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const activeJson = await activeResponse.json().catch(() => ({} as TradingAppBoundWindowResponse));
    if (!activeResponse.ok || activeJson?.ok === false) {
      throw new Error(activeJson?.error || `Failed to bind Market Maker window (${activeResponse.status})`);
    }

    const mainResponse = await fetch(tradingAppBridgeUrl("/bind-main-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const mainJson = await mainResponse.json().catch(() => ({} as TradingAppBoundWindowResponse));
    if (!mainResponse.ok || mainJson?.ok === false || !mainJson?.bound) {
      throw new Error(mainJson?.error || `Failed to locate Main Window (${mainResponse.status})`);
    }

    await refreshExecutionStatus(true);
  }, [refreshExecutionStatus]);

  const bindStreamActiveWindowDelayed = useCallback(async (delayMs = 3000) => {
    const response = await fetch(`${tradingAppBridgeUrl("/bind-active-window-delayed")}?delayMs=${Math.max(250, Math.trunc(delayMs || 3000))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to bind delayed active window (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const clearStreamBoundWindow = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/bound-window"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    resetStreamOcrStores();
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear bound window (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const captureStreamTickerPoint = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/capture-ticker-point"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to capture ticker point (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const captureStreamTickerPointDelayed = useCallback(async (delayMs = 3000) => {
    const response = await fetch(`${tradingAppBridgeUrl("/capture-ticker-point-delayed")}?delayMs=${Math.max(250, Math.trunc(delayMs || 3000))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to capture delayed ticker point (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const clearStreamTickerPoint = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/ticker-point"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear ticker point (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const toggleStreamPanicOff = useCallback(async (enabled: boolean) => {
    const response = await fetch(`${tradingAppBridgeUrl("/panic-off")}?enabled=${enabled ? "true" : "false"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to toggle panic-off (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const startStreamAutomation = useCallback(async () => {
    const response = await fetch(bridgeUrl("/api/stream/automation/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "workspace" }),
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to start automation (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const clearStreamExecutionQueue = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/queue"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
      await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear TradingApp queue (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const resetStreamAutomationState = useCallback(() => {
    // Always safe: reset UI state. The dispatch loop uses a snapshot taken at loop start,
    // so changing streamPositions/latches/intents mid-loop is harmless for the current batch.
    setStreamSignalLatches([]);
    setStreamPositions(buildStreamPositionsFromActionLog(streamActionLog, localDayKey()));
    setStreamOrderIntents([]);
    setStreamSentOrdersCount(0);
    if (dispatchLoopActiveRef.current) {
      // A dispatch is in-flight. Clearing dedup refs NOW would create a window where
      // an in-flight order has no intentId or in-flight guard, letting the latch recreate
      // with a new qualifiedSince → different intentId → second ENTRY order.
      // Defer the ref-clear to the dispatch loop's finally block.
      pendingResetDispatchRefsRef.current = true;
      return;
    }
    dispatchedIntentIdsRef.current.clear();
    dispatchedHedgeIntentIdsRef.current.clear();
    recentDispatchAttemptsRef.current.clear();
    dispatchingEntryTickersRef.current.clear();
    dismissedEntryTickersRef.current.clear();
  }, [streamActionLog]);

  const dismissStreamActivePositions = useCallback((tickers: string[]) => {
    if (!tickers.length) return;
    const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
    const nextLog = pruneStreamActionLog(
      streamActionLogRef.current.filter((entry) => !tickerSet.has(entry.ticker)),
      Date.now()
    );
    actionLogVersionRef.current += 1;
    streamActionLogRef.current = nextLog;
    setStreamActionLog(nextLog);
    setStreamPositions((prev) => prev.filter((pos) => !tickerSet.has(pos.ticker)));
    setStreamSignalLatches((prev) => prev.filter((latch) => !tickerSet.has(latch.ticker)));
    setStreamOrderIntents((prev) => prev.filter((intent) => !tickerSet.has(intent.ticker)));
    pendingActionLogEntriesRef.current.forEach((entries, intentId) => {
      if (entries.some((e) => tickerSet.has(e.ticker))) {
        pendingActionLogEntriesRef.current.delete(intentId);
      }
    });
    // Block auto-entry re-dispatch for DISMISS_ENTRY_BLOCK_MS after dismiss.
    // Without this: after cooldown expiry (15s) the dispatch loop sees no action-log entry
    // and no dispatchedIntentId for the ticker → fires a second ENTRY order.
    const now = Date.now();
    tickerSet.forEach((ticker) => dismissedEntryTickersRef.current.set(ticker, now));
    queueMicrotask(() => {
      void refreshRef.current?.({ refreshBridge: false }).catch(() => {});
    });
  }, []);

  const submitManualStreamOrders = useCallback(async (tickersText: string, action: StreamManualOrderAction) => {
    const tickers = Array.from(new Set(
      tickersText
        .split(/[\s,]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    ));

    if (!tickers.length) {
      throw new Error("Enter at least one ticker.");
    }

    const type =
      action === "buy" ? "EnterLongAggressive"
        : action === "sell" ? "EnterShortAggressive"
          : "ExitActive";

    setStreamManualExecutionBusy(true);
    try {
      for (const ticker of tickers) {
        const response = await fetch(tradingAppBridgeUrl("/queue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intentId: `manual|${action}|${ticker}|${Date.now()}`,
            ticker,
            type,
            source: "stream-manual",
            note: `manual ${action}`,
            delayMinMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMinSeconds ?? 0) * 1000)),
            delayMaxMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMaxSeconds ?? 0) * 1000)),
          }),
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.ok === false) {
          throw new Error(json?.error || `Failed to queue manual ${action} for ${ticker} (${response.status})`);
        }
      }

      await refreshExecutionStatus(true);
    } finally {
      setStreamManualExecutionBusy(false);
    }
  }, [automationConfig?.queueDelayMaxSeconds, automationConfig?.queueDelayMinSeconds, refreshExecutionStatus]);

  const refresh = useCallback(async (options?: { refreshBridge?: boolean }) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
    const refreshBridge = options?.refreshBridge !== false;
    const normalizedByTicker = new Map(
      primaryStreamSignalsRef.current.map((row) => [row.ticker, row] as const)
    );

    for (const row of trackedStreamSignalsRef.current) {
      normalizedByTicker.set(row.ticker, row);
    }

    const nowMs = Date.now();
    const normalizedMerged = Array.from(normalizedByTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const normalized = normalizedMerged;
    const executionSnapshot = refreshBridge
      ? await refreshExecutionStatus(false)
      : streamExecutionSnapshotRef.current;
    const preFiltered = exactSonarFilterSnapshot
      ? applyExactSonarClientFilters(normalizedMerged, exactSonarFilterSnapshot)
      : applyArbitrageFilters(normalizedMerged, filterConfig) as ArbitrageSignal[];

    const filtered = sideFilter
      ? preFiltered.filter(row => {
          const dir = (row.direction ?? "").toLowerCase();
          const isLong = dir === "up" || dir === "long";
          const isShort = dir === "down" || dir === "short";
          if (sideFilter === "Long") return isLong;
          if (sideFilter === "Short") return isShort;
          return true;
        })
      : preFiltered;

    // Apply BIN / BINS / SESSION rating filter using best_params attached to each signal.
    // BIN/BINS only apply when metric is SigmaZap (same guard as Sonar zapMode=sigma / Scanner metric=SigmaZap).
    // When exactSonarFilterSnapshot is present, BIN/BINS were already applied by applyExactSonarClientFilters — skip.
    const ratingModeRaw = (ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")).toUpperCase();
    const ratingModeUpper = (ratingModeRaw === "BIN" || ratingModeRaw === "BINS") && metric !== "SigmaZap"
      ? "SESSION"
      : ratingModeRaw;
    const effectiveMinRate = ratingMinRate ?? ratingRule.minRate;
    const effectiveMinTotal = ratingMinTotal ?? ratingRule.minTotal;
    const skipRatingFilter = exactSonarFilterSnapshot && (ratingModeUpper === "BIN" || ratingModeUpper === "BINS");
    const ratingFiltered = skipRatingFilter ? filtered : filtered.filter(row => {
      const rowSide = row.direction === "down" ? "Short" : "Long";
      const rawSigma = rowSide === "Short"
        ? toNum(row.zapSsigma ?? row.zapS)
        : toNum(row.zapLsigma ?? row.zapL);
      return passesStreamRatingFilter({
        ratingMode: ratingModeUpper,
        signal: row,
        session: session ?? "GLOB",
        side: rowSide,
        sigmaAbs: rawSigma != null ? Math.abs(rawSigma) : null,
        minRate: effectiveMinRate,
        minTotal: effectiveMinTotal,
        ratingType: ratingType ?? "any",
      });
    });

    const bookSnapshot = streamBookStore.getState().snapshot;
    const decisions = computeStreamDecisionRows(
      ratingFiltered,
      maxSpreadValue,
      automationConfig,
      bookSnapshot,
      metric
    );

    const autoEnabledNow =
      streamAutoEnabledRef.current &&
      Boolean(automationConfig?.strategyModeEnabled) &&
      !(executionSnapshot?.panicOff ?? false);
    const currentCount = filtered.length;
    const prevCount = prevFilteredCountRef.current;
    prevFilteredCountRef.current = currentCount;

    const maxOpenPositions = Math.max(1, automationConfig?.maxOpenPositions ?? 10);
    const absoluteSpikeThreshold = Math.max(SIGNAL_SURGE_GUARD_MIN_COUNT, maxOpenPositions * 4);
    const relativeSpikeThreshold = Math.max(6, maxOpenPositions);
    const relativeSpike =
      prevCount >= relativeSpikeThreshold &&
      currentCount >= prevCount * SIGNAL_SURGE_GUARD_MULTIPLIER;
    const absoluteSpike = currentCount >= absoluteSpikeThreshold;

    if (autoEnabledNow && (relativeSpike || absoluteSpike)) {
      surgeGuardUntilRef.current = nowMs + SIGNAL_SURGE_GUARD_HOLD_MS;
      surgeGuardStableTicksRef.current = 0;
    }

    let surgeGuardActive = autoEnabledNow && nowMs < surgeGuardUntilRef.current;
    if (surgeGuardActive) {
      const stableCountThreshold = Math.max(12, maxOpenPositions * 2);
      if (currentCount <= stableCountThreshold) {
        surgeGuardStableTicksRef.current += 1;
      } else {
        surgeGuardStableTicksRef.current = 0;
      }

      if (surgeGuardStableTicksRef.current >= SIGNAL_SURGE_GUARD_STABLE_TICKS) {
        surgeGuardUntilRef.current = 0;
        surgeGuardStableTicksRef.current = 0;
        surgeGuardActive = false;
      }
    }

    const startAbsMin = Math.max(0, startAbs ?? 0);
    const effectiveStartAbsMax = (startAbsMax != null && startAbsMax > 0) ? startAbsMax : null;
    const hasEntryWindowUpperBound = effectiveStartAbsMax != null;

    const decisionsWithWindowGuard = decisions.map((row) => {
      if (row.status !== "ENTRY_READY") return row;
      const absSignal = Math.abs(row.signal ?? 0);
      if (absSignal < startAbsMin) {
        return { ...row, status: "HOLD" as const, reason: `entry guard: below start min ${startAbsMin.toFixed(2)}` };
      }
      if (hasEntryWindowUpperBound && effectiveStartAbsMax != null && absSignal > effectiveStartAbsMax) {
        return { ...row, status: "HOLD" as const, reason: `entry guard: above start max ${effectiveStartAbsMax.toFixed(2)}` };
      }
      return row;
    });

    // Track display qualification time for minHoldCandles filter (always active, no automation needed).
    // Mirrors Scanner's consecutive-candle logic: timer resets if signal exits [startAbs, startAbsMax] for >60s.
    const nowForDisplay = Date.now();
    const currentMinuteAligned = Math.floor(nowForDisplay / 60_000) * 60_000;
    const effectiveMinHoldMs = Math.max(0, minHoldCandles ?? 0) * 60_000;
    // endAbs close threshold — only applies in Active close mode (Passive exit = gap reversal, not sigma).
    const effectiveEndAbs = (closeMode !== "Passive" && endAbs != null && endAbs > 0) ? endAbs : 0;

    const currentMinuteIdx = Math.floor(nowForDisplay / 60_000);
    // Roll the accumulator over into the frozen "completed minute" snapshot once the minute
    // index advances. minuteAccumRef unions every poll's above-threshold tickers during the
    // minute it covers, so a ticker that crosses threshold between two polls (not caught by
    // whichever single poll used to define the old point-in-time snapshot) is still counted —
    // avoiding poll-timing luck deciding whether a real signal ever gets a latch at all.
    if (minuteAccumRef.current != null && minuteAccumRef.current.minuteIdx !== currentMinuteIdx) {
      minuteSnapshotRef.current = minuteAccumRef.current;
      minuteAccumRef.current = null;
    }
    // Mirror Scanner (TapeArbitrageEngine) exactly: at each minute boundary, any ticker whose
    // sigma was below startAbs for the ENTIRE boundary minute has its hold streak broken
    // (pending-start reset). Evict before the main loop so evicted tickers can be re-added with
    // a fresh qualifiedSince (counter=0), matching Scanner's "new pending start" semantics.
    const prevMinSnap = minuteSnapshotRef.current;
    if (prevMinSnap != null && prevMinSnap.minuteIdx === currentMinuteIdx - 1) {
      displayQualifiedSinceRef.current.forEach((_, k) => {
        if (!prevMinSnap.aboveSet.has(k)) displayQualifiedSinceRef.current.delete(k);
      });
    }

    for (const row of decisionsWithWindowGuard) {
      const key = `${row.ticker}|${row.side}`;
      const absSignal = Math.abs(row.signal ?? 0);
      const isAboveStartAbs = absSignal >= (startAbs ?? 0) && row.status !== "HOLD";
      const isAboveEndAbs = absSignal >= effectiveEndAbs;

      if (isAboveStartAbs) {
        // Fresh/strong signal: track timing for minHoldCandles
        if (!displayQualifiedSinceRef.current.has(key)) {
          displayQualifiedSinceRef.current.set(key, { qualifiedSince: currentMinuteAligned, lastSeenAt: nowForDisplay });
        } else {
          displayQualifiedSinceRef.current.get(key)!.lastSeenAt = nowForDisplay;
        }
        // Promote to "displayed" once minHoldCandles is met
        const history = displayQualifiedSinceRef.current.get(key)!;
        if (nowForDisplay - history.qualifiedSince >= effectiveMinHoldMs) {
          signalDisplayedRef.current.set(key, nowForDisplay);
        }
      } else if (isAboveEndAbs && signalDisplayedRef.current.has(key)) {
        // Decaying signal: sigma in [endAbs, startAbs) — still above endAbs close threshold, keep alive
        signalDisplayedRef.current.set(key, nowForDisplay);
      }
    }
    // Fallback eviction for data gaps: clear entries not seen for >2 minutes.
    // The primary eviction happens at each minute boundary via prevMinSnap above.
    displayQualifiedSinceRef.current.forEach((v, k) => {
      if (nowForDisplay - v.lastSeenAt > 120_000) displayQualifiedSinceRef.current.delete(k);
    });
    // Evict displayed: not seen >60s = dropped below endAbs or disappeared.
    signalDisplayedRef.current.forEach((lastSeen, k) => {
      if (nowForDisplay - lastSeen > 60_000) signalDisplayedRef.current.delete(k);
    });

    const displayDecisions = decisionsWithWindowGuard
      .filter(row => {
        const absSignal = Math.abs(row.signal ?? 0);
        // Never show above startAbsMax
        if (effectiveStartAbsMax != null && absSignal > effectiveStartAbsMax) return false;
        const key = `${row.ticker}|${row.side}`;
        // Decaying signals: below startAbs but above endAbs, previously passed minHoldCandles
        if (absSignal < (startAbs ?? 0)) {
          return signalDisplayedRef.current.has(key);
        }
        // Fresh signals: apply minHoldCandles
        if (effectiveMinHoldMs <= 0) return true;
        const history = displayQualifiedSinceRef.current.get(key);
        if (!history) return false;
        return nowForDisplay - history.qualifiedSince >= effectiveMinHoldMs;
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    // Union this poll's above-threshold tickers into the current (in-progress) minute's
    // accumulator. New latches are gated on minuteSnapshotRef — the frozen, fully-completed
    // previous minute — not this in-progress accumulator, so a ticker only needs to have
    // crossed threshold at SOME point during a minute, not at the specific instant we happened
    // to poll, to count as qualified for that minute.
    if (filtered.length > 0) {
      if (minuteAccumRef.current == null || minuteAccumRef.current.minuteIdx !== currentMinuteIdx) {
        minuteAccumRef.current = { minuteIdx: currentMinuteIdx, aboveSet: new Set<string>() };
      }
      for (const row of decisionsWithWindowGuard) {
        if (row.status !== "HOLD") minuteAccumRef.current.aboveSet.add(`${row.ticker}|${row.side}`);
      }
    }

    const decisionsForAutomation = decisionsWithWindowGuard;
    const wantsPrime = primeImmediateEntriesRef.current;
    const nextLatches = syncStreamSignalLatches(
      streamSignalLatches,
      decisionsForAutomation,
      autoEnabledNow,
      automationConfig,
      entryCutoffEnabled,
      strategySessionStartMinutes,
      wantsPrime,
      latchQualifiedSinceHistoryRef.current,
      wantsPrime ? primedFromScannerRef.current : undefined,
      minuteSnapshotRef.current?.aboveSet
    );
    // Consume the prime flag only when automation is running AND there were signals
    // to latch. If the stream wasn't ready yet (no decisions → no latches), keep the
    // flag so the next refresh that finds signals will still prime.
    // Also reset if automation is disabled — prime shouldn't outlive the enabled window.
    if (!wantsPrime || !autoEnabledNow || nextLatches.length > 0) {
      primeImmediateEntriesRef.current = false;
      if (primedFromScannerRef.current.size > 0) primedFromScannerRef.current = new Set();
    }
    // Update latch history so qualifiedSince survives brief signal bounces.
    // TTL = 60s (1 tape candle) — matches SCANNER's consecutive-candle behavior.
    // Any bounce lasting > 1 min resets the latch, just as a candle below threshold
    // resets the SCANNER consecutive count.
    const latchHistoryTTL = 60_000;
    for (const latch of nextLatches) {
      latchQualifiedSinceHistoryRef.current.set(latch.ticker, { qualifiedSince: latch.qualifiedSince, lastSeenAt: latch.lastSeenAt });
    }
    latchQualifiedSinceHistoryRef.current.forEach((v, k) => {
      if (nowMs - v.lastSeenAt > latchHistoryTTL) latchQualifiedSinceHistoryRef.current.delete(k);
    });
    // If a ticker's signal left the valid entry window [startAbsMin, startAbsMax] in
    // either direction, clear it from latch history so the hold timer restarts from
    // zero when the signal returns to range. The 60s TTL recovery is only meant for
    // brief spread/edge blocks (BLOCKED_SPREAD/BLOCKED_EDGE), not for signals that
    // exited the window — those must re-qualify from scratch.
    for (const row of decisionsWithWindowGuard) {
      if (row.status !== "HOLD") continue;
      const absSignal = Math.abs(row.signal ?? 0);
      const exitedBelow = absSignal < startAbsMin;
      const exitedAbove = hasEntryWindowUpperBound && startAbsMax != null && absSignal > startAbsMax;
      if (exitedBelow || exitedAbove) {
        latchQualifiedSinceHistoryRef.current.delete(row.ticker);
      }
    }
    const positionsBaseline = mergeStreamPositionsWithActionLog(streamPositions, streamActionLog, currentDayKey);
    const nextPositionsBase = syncStreamPositions(positionsBaseline, decisionsForAutomation, normalized, filtered, nextLatches, autoEnabledNow, maxSpreadValue, automationConfig, entryCutoffEnabled, strategySessionStartMinutes, openLoggedTickers, dispatchingEntryTickersRef.current);
    // Clear latch history for tickers whose positions just closed.
    // This prevents STREAM from reusing a stale qualifiedSince on re-entry after close,
    // which would cause STREAM to fire much faster than SCANNER (which requires fresh
    // consecutive tape candles after each episode close).
    for (const pos of nextPositionsBase) {
      if (pos.status === "CLOSED") {
        latchQualifiedSinceHistoryRef.current.delete(pos.ticker);
      }
    }
    const minHoldMinutesForDisplay = Math.max(0, automationConfig?.minHoldMinutes ?? 0);
    const now2 = Date.now();
    const now2MinuteIdx = Math.floor(now2 / 60_000);
    const entryReady = decisionsForAutomation.filter(d => d.status === "ENTRY_READY").length;
    const latched = nextLatches.length;
    const qualifiedLatches = nextLatches.filter((l) => now2MinuteIdx - Math.floor(l.qualifiedSince / 60_000) >= minHoldMinutesForDisplay);
    let nextPositions = nextPositionsBase;
    let intents = buildStreamOrderIntents(decisionsForAutomation, nextPositions, autoEnabledNow, automationConfig, entryCutoffEnabled);

    if (
      autoEnabledNow &&
      automationConfig?.strategyModeEnabled &&
      intents.length === 0 &&
      qualifiedLatches.length > 0
    ) {
      nextPositions = buildFallbackPendingEntryPositions(
        nextPositions,
        qualifiedLatches,
        filtered,
        automationConfig,
        entryCutoffEnabled,
        strategySessionStartMinutes,
      );
      intents = buildStreamOrderIntents(decisionsForAutomation, nextPositions, autoEnabledNow, automationConfig, entryCutoffEnabled);
    }

    const qualified = qualifiedLatches.length;
    const pendingEntry = nextPositions.filter(p => p.status === "PENDING_ENTRY").length;
    const dilutionStep = automationConfig?.dilutionStep ?? 0.3;

    if (intents.length > 0) {
      const ts = () => new Date().toTimeString().slice(0, 8);
      const sig = (v: number | null | undefined) => v != null ? v.toFixed(3) + "σ" : "n/a";
      const maxOpenCap = entryCutoffEnabled ? (automationConfig?.maxOpenPositions ?? "∞") : "∞";
      const openNow = nextPositions.filter(p => p.status === "OPEN" || p.status === "PENDING_ENTRY" || p.status === "PRINT_PENDING").length;
      const decisionMap2 = new Map(decisionsForAutomation.map(d => [d.ticker, d]));
      const positionMap2 = new Map(nextPositions.map(p => [p.ticker, p]));
      console.group(`[AUTO ${ts()}] auto=${autoEnabledNow} | entryReady=${entryReady} latched=${latched} qualified=${qualified} pendingEntry=${pendingEntry} intents=${intents.length} | open=${openNow}/${maxOpenCap} minHold=${minHoldMinutesForDisplay}min`);
      console.group(`  INTENTS (${intents.length}):`);
      for (const intent of intents) {
        const d2 = decisionMap2.get(intent.ticker);
        const pos2 = positionMap2.get(intent.ticker);
        const entryBase2 = pos2?.entrySignal ?? pos2?.lastScaleSignal;
        const isAdd2 = intent.sequence > 1;
        const isShort2 = intent.side === "Short";
        const addNum2 = intent.sequence - 1;
        const triggerMag2 = isAdd2 && entryBase2 != null ? Math.abs(entryBase2) + dilutionStep * addNum2 : null;
        const thresholdStr2 = triggerMag2 != null
          ? `${isShort2 ? "≤-" : "≥+"}${triggerMag2.toFixed(3)}σ`
          : "";
        console.log(
          `  [${intent.status}] ${intent.intent} ${intent.ticker}/${intent.benchmark}` +
          ` | ${isAdd2 ? `add#${addNum2}` : "entry"} ${intent.side}` +
          ` sig=${sig(d2?.signal)}${isAdd2 ? ` threshold=${thresholdStr2} (|${sig(entryBase2)}|+${addNum2}×${dilutionStep})` : ""}` +
          ` | "${intent.reason}"`
        );
      }
      console.groupEnd();
      console.groupEnd();
    }

    streamDecisionStore.applySnapshot(displayDecisions);
    streamSignalStore.applySnapshot(filtered);
    streamUpdatedAtStore.setValue(Date.now());

    // keep sync refs current so sendQueuedIntents can read signal/latch state without closure staleness
    // Use normalized (all signals) as base so open-position tickers that dropped out of
    // filtered (e.g. spread/edge gate closed temporarily) still have signal data for log entries.
    // filtered overrides normalized where both are present.
    const rawSigMap = new Map<string, ArbitrageSignal>();
    for (const sig of normalized) rawSigMap.set(sig.ticker, sig);
    for (const sig of filtered) rawSigMap.set(sig.ticker, sig);
    rawSignalByTickerRef.current = rawSigMap;

    // Log every ticker the first time it becomes ENTRY_READY — for comparison with Scanner backtest.
    const filterPassNow = Date.now();
    const readN = (...args: unknown[]): number | null => {
      for (const a of args) { const n = toNum(a); if (n != null) return n; }
      return null;
    };
    for (const decision of displayDecisions) {
      if (decision.status !== "ENTRY_READY") continue;
      const sig = rawSigMap.get(decision.ticker);
      const bp = sig ? (sig.best_params ?? sig.bestParams ?? sig.BestParams ?? null) : null;
      const bpBest = bp ? (bp.best ?? bp.Best ?? null) : null;
      const bpMeta = bp ? (bp.meta ?? bp.Meta ?? null) : null;
      const bpSt = bp ? (bp.static ?? bp.Static ?? null) : null;
      streamFilterPassLogStore.tryLog({
        ts: filterPassNow,
        ticker: decision.ticker,
        benchmark: decision.benchmark,
        side: decision.side,
        signal: decision.signal,
        zapLsigma: toNum(sig?.zapLsigma) ?? null,
        zapSsigma: toNum(sig?.zapSsigma) ?? null,
        zapL: toNum(sig?.zapL) ?? null,
        zapS: toNum(sig?.zapS) ?? null,
        spread: decision.spread,
        netEdge: decision.netEdge,
        safePrice: decision.safePrice,
        bidPct: toNum(sig?.["BidLstClsΔ%"]) ?? toNum(sig?.bidPct) ?? null,
        askPct: toNum(sig?.["AskLstClsΔ%"]) ?? toNum(sig?.askPct) ?? null,
        benchBidPct: toNum(sig?.["BenchBidLstClsΔ%"]) ?? toNum(sig?.benchBidPct) ?? null,
        benchAskPct: toNum(sig?.["BenchAskLstClsΔ%"]) ?? toNum(sig?.benchAskPct) ?? null,
        lstCls: toNum(sig?.LstCls ?? sig?.lstCls) ?? null,
        yCls: toNum(sig?.YCls ?? sig?.yCls) ?? null,
        vwap: toNum(sig?.VWAP ?? sig?.vwap) ?? null,
        lstPrcL: toNum(sig?.LstPrcL ?? sig?.lstPrcL) ?? null,
        rating: readN(sig?._bestRating, sig?.bestRating, bpBest?.rating, bpBest?.Rating),
        ratingTotal: readN(sig?._bestTotal, sig?.bestTotal, bpBest?.total, bpBest?.Total),
        corr: readN(bpBest?.corr, bpBest?.Corr, bpMeta?.corr, bpMeta?.Corr, bpSt?.corr, bpSt?.Corr),
        beta: readN(sig?.beta, sig?.Beta, bpBest?.beta, bpBest?.Beta, bpMeta?.beta, bpMeta?.Beta),
        sigma: readN(bpBest?.sigma, bpBest?.Sigma, bpMeta?.sigma, bpMeta?.Sigma, bpSt?.sigma, bpSt?.Sigma),
        adv20: toNum(sig?.ADV20 ?? sig?.adv20) ?? null,
        adv20NF: toNum(sig?.ADV20NF ?? sig?.adv20NF) ?? null,
        adv90: toNum(sig?.ADV90 ?? sig?.adv90) ?? null,
        marketCapM: toNum(sig?.MarketCapM ?? sig?.marketCapM) ?? null,
        avPreMhv: toNum(sig?.AvPreMhv ?? sig?.avPreMhv) ?? null,
        country: String(sig?.country ?? sig?.Country ?? sig?.CountryCode ?? "").trim() || null,
        exchange: String(sig?.exchange ?? sig?.Exchange ?? "").trim() || null,
        sectorL3: String(sig?.sectorL3 ?? sig?.SectorL3 ?? sig?.sector ?? "").trim() || null,
        decisionStatus: decision.status,
      });
    }
    streamSignalLatchesRef.current = nextLatches;

    startTransition(() => {
      setStreamEntryReadyCount(displayDecisions.reduce((count, row) => row.status === "ENTRY_READY" ? count + 1 : count, 0));
      setStreamSignalLatches(nextLatches);
      setStreamPositions(nextPositions);
      setStreamOrderIntents(intents);
    });
    onUpdated?.();
    onError?.(null);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    automationConfig,
    entryCutoffEnabled,
    filterConfig,
    exactSonarFilterSnapshot,
    maxBeta,
    maxCorr,
    maxSigma,
    maxSpreadValue,
    metric,
    minBeta,
    minCorr,
    minSigma,
    streamActionLog,
    streamPositions,
    streamSignalLatches,
    streamAutoEnabled,
    currentDayKey,
    openLoggedTickers,
    onError,
    onUpdated,
    refreshExecutionStatus,
    ratingRule.minRate,
    ratingRule.minTotal,
    ratingType,
    signalClass,
    tickersCsv,
  ]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onFetchActiveTickersRef.current = onFetchActiveTickers;
  }, [onFetchActiveTickers]);

  useEffect(() => {
    activeScannerTickersRef.current = activeScannerTickers ?? [];
  }, [activeScannerTickers]);

  useEffect(() => () => {
    if (localRefreshTimerRef.current != null) {
      window.clearTimeout(localRefreshTimerRef.current);
      localRefreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    streamActionLogRef.current = streamActionLog;
  }, [streamActionLog]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const bootstrapBridgeState = async () => {
      if (cancelled) return;
      try {
        await refreshRef.current?.({ refreshBridge: true });
      } catch (error: any) {
        if (!cancelled) onErrorRef.current?.(error?.message ?? String(error));
      }
    };
    void bootstrapBridgeState();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) return;
    streamExecutionSnapshotRef.current = null;
    executionSnapshotSignatureRef.current = "";
    lastStatusRefreshAtRef.current = 0;
    pendingActionLogEntriesRef.current.clear();
    streamExecutionStore.clear();
    resetStreamOcrStores();
    streamActionLogStore.clear();
    streamDecisionStore.clear();
    streamOrderIntentStore.clear();
    streamPositionStore.clear();
    streamSignalStore.clear();
    streamUpdatedAtStore.clear();
    streamFilterPassLogStore.clear();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ocrEnabled) return;
    return connectStreamOcrFeed();
  }, [enabled, ocrEnabled]);

  useEffect(() => {
    if (!enabled || ocrEnabled) return;
    resetStreamOcrStores();
  }, [enabled, ocrEnabled]);

  useEffect(() => {
    streamPositionStore.applySnapshot(streamPositions);
    streamPositionsRef.current = streamPositions;
  }, [streamPositions]);

  useEffect(() => {
    streamOrderIntentStore.applySnapshot(streamOrderIntents);
  }, [streamOrderIntents]);

  useEffect(() => {
    if (!enabled) return;
    const strategyAutoRunning = streamAutoEnabled && Boolean(automationConfig?.strategyModeEnabled);
    if (!strategyAutoRunning) {
      if (strategyAutoWasRunningRef.current) {
        setStreamSessionStoppedAt((prev) => prev ?? Date.now());
      }
      strategyAutoWasRunningRef.current = false;
      return;
    }

    if (!strategyAutoWasRunningRef.current) {
      strategyAutoWasRunningRef.current = true;
      setStreamSessionStartedAt(Date.now());
      setStreamSessionStoppedAt(null);
      setStreamSentOrdersCount(0);

      void (async () => {
        // Seed immediately from whatever activeRows the UI has right now so the
        // first refresh cycle doesn't wait for the fetch.
        const immediate = activeScannerTickersRef.current;
        if (immediate.length > 0) {
          primedFromScannerRef.current = new Set(immediate.map((r) => `${r.ticker}|${r.side}`));
        }

        // Fetch the authoritative active list from the tape API. This works even
        // when the user is not on the "active" tab (activeRows would be empty).
        const fetched = await onFetchActiveTickersRef.current?.().catch(() => null);
        if (fetched && fetched.length > 0) {
          primedFromScannerRef.current = new Set(fetched.map((r) => `${r.ticker}|${r.side}`));
        }

        primeImmediateEntriesRef.current = true;
        void refreshRef.current?.({ refreshBridge: true }).catch((err: any) => {
          onErrorRef.current?.(err?.message ?? String(err));
        });
      })();
      return;
    }

    void refreshRef.current?.({ refreshBridge: true }).catch((error: any) => {
      onErrorRef.current?.(error?.message ?? String(error));
    });
  }, [automationConfig?.minHoldMinutes, automationConfig?.strategyModeEnabled, enabled, streamAutoEnabled]);

  useEffect(() => {
    const activeQueuedIds = new Set(
      streamOrderIntents
        .filter((intent) => intent.status === "QUEUED")
        .map((intent) => intent.id)
    );
    const activeQueuedHedgeIds = new Set(Array.from(activeQueuedIds, (id) => `${id}|benchmark`));

    const now = Date.now();

    // Do not evict an ID while it is still within the dispatch cooldown window.
    // Evicting early creates a race where entryCount resets via mergeStreamPositionsWithActionLog
    // (before the action log confirms the ADD) and the same intent re-dispatches.
    dispatchedIntentIdsRef.current.forEach((id) => {
      if (!activeQueuedIds.has(id)) {
        const lastAttemptAt = recentDispatchAttemptsRef.current.get(id) ?? 0;
        if (now - lastAttemptAt >= AUTO_DISPATCH_COOLDOWN_MS) {
          dispatchedIntentIdsRef.current.delete(id);
        }
      }
    });
    dispatchedHedgeIntentIdsRef.current.forEach((id) => {
      if (!activeQueuedHedgeIds.has(id)) {
        const lastAttemptAt = recentDispatchAttemptsRef.current.get(id) ?? 0;
        if (now - lastAttemptAt >= AUTO_DISPATCH_COOLDOWN_MS) {
          dispatchedHedgeIntentIdsRef.current.delete(id);
        }
      }
    });

    recentDispatchAttemptsRef.current.forEach((timestamp, key) => {
      if (now - timestamp >= AUTO_DISPATCH_COOLDOWN_MS) {
        recentDispatchAttemptsRef.current.delete(key);
      }
    });
  }, [streamOrderIntents]);

  useEffect(() => {
    if (!enabled || !streamAutoEnabled) return;
    if (streamExecutionSnapshotRef.current?.panicOff) return;

    const nowMinutes = currentMinutesLocal();
    const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
    const arkPrintLockActive =
      Boolean(automationConfig?.strategyModeEnabled) &&
      entryCutoffEnabled &&
      nowMinutes >= printStartMinutes;

    const queued = streamOrderIntents.filter((intent) => {
      if (intent.status !== "QUEUED") return false;
      if (!arkPrintLockActive) return true;
      return intent.intent === "CLOSE_ALL_PRINT";
    });
    if (!queued.length) return;

    // Use a ref snapshot so setStreamPositions calls inside the loop don't abort and
    // restart the effect (streamPositions is excluded from deps for the same reason).
    const positionsSnapshot = streamPositionsRef.current;
    const positionByTicker = new Map(positionsSnapshot.map((row) => [row.ticker, row]));
    const openLoggedPositions = positionsSnapshot.filter((row) =>
      row.status !== "CLOSED" &&
      row.entryDispatchedAt != null &&
      openLoggedTickers.has(row.ticker)
    );

    if (dispatchLoopActiveRef.current) {
      dispatchLoopReplayRef.current = true;
      return;
    }

    const sendQueuedIntents = async () => {
      dispatchLoopActiveRef.current = true;
      const sentDispatchKeys = new Set<string>();

      // Entry cutoff pair: at the moment startCutoffTime is reached, fire Ctrl+Q (stop new
      // entries) then, 1s later, Ctrl+O (print-close everything open) — exactly once per
      // cutoff crossing. This runs before the separate printStartTime-driven CLOSE_ALL_PRINT
      // dispatch below, so if both times coincide Ctrl+Q still always reaches TradingApp first.
      const startCutoffMinutesNow = parseTimeToMinutes(automationConfig?.startCutoffTime, 9 * 60 + 20);
      if (entryCutoffEnabled && nowMinutes >= startCutoffMinutesNow) {
        const cutoffKey = `${localDayKey()}|${automationConfig?.startCutoffTime ?? "09:20"}`;
        if (cutoffHotkeySentKeyRef.current !== cutoffKey) {
          cutoffHotkeySentKeyRef.current = cutoffKey;
          try {
            // Mirror CLOSE_ALL_PRINT (Ctrl+O): the executor always injects intent.Ticker into
            // TradingApp's ticker field before sending the hotkey (TradingAppHotkeyExecutor.cs),
            // with no special case for a sentinel like "ALL". Ctrl+Q is a global hotkey — which
            // ticker gets injected doesn't matter for its effect — but it must be a real, valid
            // symbol or the injection step itself can fail/misbehave. Reuse an open position's
            // ticker the same way CLOSE_ALL_PRINT does; fall back to a always-valid ETF symbol
            // if nothing is open yet.
            const cutoffTicker =
              positionsSnapshot.find((p) => p.status !== "CLOSED" && p.status !== "PENDING_ENTRY")?.ticker ??
              positionsSnapshot[0]?.ticker ??
              "SPY";
            const response = await fetch(tradingAppBridgeUrl("/queue"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intentId: `cutoff-hotkey|${cutoffKey}`,
                ticker: cutoffTicker,
                type: "ExitActive",
                note: `entry cutoff reached at ${automationConfig?.startCutoffTime ?? "09:20"}`,
                source: "stream-auto",
                hotkeyOverride: "Ctrl+Q",
              }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || json?.ok === false) {
              throw new Error(json?.error || `Failed to queue cutoff hotkey (${response.status})`);
            }
            console.log(`[CUTOFF] Ctrl+Q sent at ${automationConfig?.startCutoffTime ?? "09:20"}`);

            // Ctrl+O follows Ctrl+Q by exactly 1s, same cutoff moment: stop new entries (Ctrl+Q)
            // then immediately print-close everything open (Ctrl+O), as one sequential pair.
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const responseO = await fetch(tradingAppBridgeUrl("/queue"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intentId: `cutoff-hotkey-o|${cutoffKey}`,
                ticker: cutoffTicker,
                type: "ExitPrint",
                note: `entry cutoff print-close at ${automationConfig?.startCutoffTime ?? "09:20"}`,
                source: "stream-auto",
                hotkeyOverride: "Ctrl+O",
              }),
            });
            const jsonO = await responseO.json().catch(() => ({}));
            if (!responseO.ok || jsonO?.ok === false) {
              throw new Error(jsonO?.error || `Failed to queue cutoff Ctrl+O (${responseO.status})`);
            }
            console.log(`[CUTOFF] Ctrl+O sent 1s after Ctrl+Q at ${automationConfig?.startCutoffTime ?? "09:20"}`);

            // Ctrl+O is one global hotkey — TradingApp closes every open position at once, not
            // just cutoffTicker. Mirror that in STREAM's own action log/state (same bookkeeping
            // the removed CLOSE_ALL_PRINT intent path used to do), so positions that never
            // self-normalized (ACTIVE mode) or never had another exit path (PASSIVE mode) show
            // as closed here too, not just in TradingApp.
            if (openLoggedPositions.length > 0) {
              const dispatchAt = Date.now();
              const closeEntries: StreamActionLogEntry[] = openLoggedPositions.map((row) => ({
                id: `${row.ticker}|CLOSE|${dispatchAt}`,
                dayKey: localDayKey(),
                ticker: row.ticker,
                benchmark: row.benchmark,
                side: row.side,
                kind: "CLOSE" as const,
                deviation: row.lastSignal ?? row.entrySignal,
                at: dispatchAt,
                intent: "CLOSE_ALL_PRINT" as const,
                reason: `entry cutoff print-close at ${automationConfig?.startCutoffTime ?? "09:20"}`,
              }));
              if (automationConfig?.betaMode === true) {
                appendStreamActionLogEntries(closeEntries);
              } else {
                queuePendingActionLogEntries(`cutoff-hotkey-o|${cutoffKey}`, closeEntries);
              }
            }
          } catch (err) {
            // Allow retry on the next tick instead of silently giving up for the day.
            cutoffHotkeySentKeyRef.current = null;
            console.error("[CUTOFF] Failed to send Ctrl+Q/Ctrl+O pair", err);
          }
        }
      }

      for (const intent of queued) {
        const type =
          intent.intent === "ENTER_LONG_AGGRESSIVE" ? "EnterLongAggressive"
            : intent.intent === "ENTER_SHORT_AGGRESSIVE" ? "EnterShortAggressive"
              : intent.intent === "EXIT_LONG_AGGRESSIVE" || intent.intent === "EXIT_SHORT_AGGRESSIVE" ? "ExitActive"
                : intent.intent === "EXIT_LONG_PRINT" || intent.intent === "EXIT_SHORT_PRINT" || intent.intent === "CLOSE_ALL_PRINT" ? "ExitPrint"
                  : null;

        if (!type) continue;

        const isEntryIntent =
          intent.intent === "ENTER_LONG_AGGRESSIVE" ||
          intent.intent === "ENTER_SHORT_AGGRESSIVE";
        const isExitIntent =
          intent.intent === "EXIT_LONG_AGGRESSIVE" ||
          intent.intent === "EXIT_SHORT_AGGRESSIVE" ||
          intent.intent === "EXIT_LONG_PRINT" ||
          intent.intent === "EXIT_SHORT_PRINT";
        const hedgeIntentId = `${intent.id}|benchmark`;
        const hedgeRequired =
          (isEntryIntent || isExitIntent) &&
          automationConfig?.hedgeMode === "hedged" &&
          intent.benchmark &&
          intent.benchmark !== "UNKNOWN" &&
          intent.benchmark !== "PRINT" &&
          intent.benchmark !== intent.ticker;
        const primaryAlreadyDispatched = dispatchedIntentIdsRef.current.has(intent.id);
        const hedgeAlreadyDispatched = dispatchedHedgeIntentIdsRef.current.has(hedgeIntentId);
        if (primaryAlreadyDispatched && (!hedgeRequired || hedgeAlreadyDispatched)) continue;

        const dispatchKey = intent.id;
        if (!primaryAlreadyDispatched && sentDispatchKeys.has(dispatchKey)) continue;
        const lastAttemptAt = recentDispatchAttemptsRef.current.get(dispatchKey) ?? 0;
        if (!primaryAlreadyDispatched && Date.now() - lastAttemptAt < AUTO_DISPATCH_COOLDOWN_MS) continue;

        // Block auto-entry re-dispatch for tickers recently dismissed by the user.
        // Covers the race where: dismiss clears action log → cooldown expires → signal still
        // ENTRY_READY → engine re-dispatches (same or new intentId depending on latch history).
        if (!primaryAlreadyDispatched && isEntryIntent && !intent.id.startsWith("manual|")) {
          const dismissedAt = dismissedEntryTickersRef.current.get(intent.ticker) ?? 0;
          if (Date.now() - dismissedAt < DISMISS_ENTRY_BLOCK_MS) continue;
        }

        const correspondingDecision = getStreamDecisionRow(intent.ticker);
        const correspondingPosition = positionByTicker.get(intent.ticker) ?? null;
        const actualPositionIsActive = openLoggedTickers.has(intent.ticker);

        if (!primaryAlreadyDispatched && isEntryIntent && intent.sequence <= 1 && actualPositionIsActive) {
          dispatchedIntentIdsRef.current.add(intent.id);
          continue;
        }

        const getNightHotkeyOverride = (intentType: string): string | undefined => {
          if (signalClass !== "blue" && signalClass !== "pre") return undefined;
          const h = new Date().getHours();
          if (h >= 4) return undefined;
          switch (intentType) {
            case "EnterLongAggressive": return "Ctrl+F3";
            case "EnterShortAggressive": return "Ctrl+F4";
            case "ExitActive":
            case "ExitPrint": return "Ctrl+B";
            default: return undefined;
          }
        };

        const queueLeg = async (payload: {
          intentId: string;
          ticker: string;
          type: string;
          note: string;
          hotkeyOverride?: string;
        }) => {
          const response = await fetch(tradingAppBridgeUrl("/queue"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intentId: payload.intentId,
              ticker: payload.ticker,
              type: payload.type,
              note: payload.note,
              source: "stream-auto",
              delayMinMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMinSeconds ?? 0) * 1000)),
              delayMaxMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMaxSeconds ?? 0) * 1000)),
              ...(payload.hotkeyOverride ? { hotkeyOverride: payload.hotkeyOverride } : {}),
            }),
          });

          const json = await response.json().catch(() => ({}));
          if (!response.ok || json?.ok === false) {
            throw new Error(json?.error || `Failed to queue TradingApp intent (${response.status})`);
          }
        };

        const queueLegWithRetry = async (payload: {
          intentId: string;
          ticker: string;
          type: string;
          note: string;
          hotkeyOverride?: string;
        }) => {
          let lastError: unknown = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await queueLeg(payload);
              return;
            } catch (error) {
              lastError = error;
              if (attempt < 2) {
                await delay(180);
              }
            }
          }
          throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Failed to queue TradingApp intent."));
        };

        if (!primaryAlreadyDispatched) {
          const dispatchAt = Date.now();
          const dispatchTs = new Date(dispatchAt).toTimeString().slice(0, 8);
          const sigStr = (v: number | null | undefined) => v != null ? v.toFixed(3) + "σ" : "n/a";
          const isAdd = intent.sequence > 1;

          // Dispatch-time entry window check: cancel initial ENTRY (not ADD) if the live
          // signal has moved outside [startAbsMin, startAbsMax] since the tick that
          // created the PENDING_ENTRY. SSE can update rawSignalByTickerRef between ticks.
          if (isAdd && isEntryIntent) {
            const _liveRaw = rawSignalByTickerRef.current.get(intent.ticker);
            const _liveSigned = intent.side === "Long"
              ? (toNum(_liveRaw?.zapLsigma) ?? toNum(_liveRaw?.zapL))
              : (toNum(_liveRaw?.zapSsigma) ?? toNum(_liveRaw?.zapS));
            const _liveAbs = _liveSigned != null ? Math.abs(_liveSigned) : null;
            if (_liveAbs != null && _liveAbs > 4.0) {
              console.log(`[CANCEL ADD] ${intent.ticker} live σ=${_liveAbs.toFixed(3)} above ADD_MAX_SIGMA 4.0 at dispatch`);
              continue;
            }
          }
          if (!isAdd && isEntryIntent) {
            const _liveRaw = rawSignalByTickerRef.current.get(intent.ticker);
            const _liveSigned = intent.side === "Long"
              ? (toNum(_liveRaw?.zapLsigma) ?? toNum(_liveRaw?.zapL))
              : (toNum(_liveRaw?.zapSsigma) ?? toNum(_liveRaw?.zapS));
            const _liveAbs = _liveSigned != null ? Math.abs(_liveSigned) : null;
            const _dispatchStartMin = Math.max(0, startAbs ?? 0);
            const _dispatchStartMax = (startAbsMax != null && startAbsMax > 0) ? startAbsMax : null;
            if (_liveAbs != null) {
              if (_liveAbs < _dispatchStartMin) {
                console.log(`[CANCEL ENTRY] ${intent.ticker} live σ=${_liveAbs.toFixed(3)} below min ${_dispatchStartMin} at dispatch`);
                continue;
              }
              if (_dispatchStartMax != null && _liveAbs > _dispatchStartMax) {
                console.log(`[CANCEL ENTRY] ${intent.ticker} live σ=${_liveAbs.toFixed(3)} above max ${_dispatchStartMax} at dispatch`);
                continue;
              }
            }
          }
          const pos3 = correspondingPosition;
          const curSig3 = correspondingDecision?.signal;
          const entryBase3 = pos3?.entrySignal;
          const dilution3 = automationConfig?.dilutionStep ?? 0.3;
          const addNum3 = intent.sequence - 1;
          const isShort3 = intent.side === "Short";
          const triggerMag3 = entryBase3 != null ? Math.abs(entryBase3) + dilution3 * addNum3 : null;
          const triggerStr3 = triggerMag3 != null
            ? `${isShort3 ? "≤-" : "≥+"}${triggerMag3.toFixed(3)}σ (|${sigStr(entryBase3)}|+${addNum3}×${dilution3})`
            : "n/a";
          console.log(
            `[SEND ${dispatchTs}] ${intent.intent} ${intent.ticker}/${intent.benchmark} ${intent.side}` +
            ` | ${isAdd
              ? `add#${addNum3} sig=${sigStr(curSig3)} threshold=${triggerStr3}`
              : `entry sig=${sigStr(curSig3)}`}` +
            ` | hedged=${hedgeRequired} reason="${intent.reason}"`
          );
          // Mark as dispatched and record attempt BEFORE the await so that
          // concurrent effect re-runs see this intent as already in-flight
          // and do not send it a second time.
          dispatchedIntentIdsRef.current.add(intent.id);
          recentDispatchAttemptsRef.current.set(dispatchKey, dispatchAt);
          sentDispatchKeys.add(dispatchKey);

          // Pre-build structured log fields (shared between SENT and FAILED paths)
          const _rawSig = rawSignalByTickerRef.current.get(intent.ticker);
          const _latch = streamSignalLatchesRef.current.find(l => l.ticker === intent.ticker);
          const _fmtMs = (ts: number) => {
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
          };
          const _isLong = intent.side === "Long";
          const _logEvent: StreamLogEvent =
            intent.intent === "CLOSE_ALL_PRINT" ? "CLOSE_ALL"
            : isExitIntent ? (intent.intent.includes("PRINT") ? "EXIT_PRINT" : "EXIT")
            : isAdd ? "ADD" : "ENTRY";
          // Helper: read best-params enrichment fields from signal
          const _bp = _rawSig ? (_rawSig.best_params ?? _rawSig.bestParams ?? _rawSig.BestParams ?? null) : null;
          const _bpSt = _bp ? (_bp.static ?? _bp.Static ?? null) : null;
          const _bpBest = _rawSig ? (_rawSig.best ?? _rawSig.Best ?? null) : null;
          const _bpMeta = _rawSig ? (_rawSig.meta ?? _rawSig.Meta ?? null) : null;
          const _readNum = (a: any, b: any, c: any, d: any) =>
            toNum(a) ?? toNum(b) ?? toNum(c) ?? toNum(d) ?? null;
          const _corr = _readNum(_bpBest?.corr ?? _bpBest?.Corr, _bpMeta?.corr ?? _bpMeta?.Corr, _bpSt?.corr ?? _bpSt?.Corr, null);
          const _beta = _readNum(_rawSig?.beta ?? _rawSig?.Beta, _bpBest?.beta ?? _bpBest?.Beta, _bpMeta?.beta ?? _bpMeta?.Beta, _bpSt?.beta ?? _bpSt?.Beta);
          const _stockSigma = _readNum(_bpBest?.sigma ?? _bpBest?.Sigma, _bpMeta?.sigma ?? _bpMeta?.Sigma, _bpSt?.sigma ?? _bpSt?.Sigma, null);
          const _rating = toNum(_rawSig?._bestRating ?? _rawSig?.bestRating) ?? null;
          const _ratingTotal = toNum(_rawSig?._bestTotal ?? _rawSig?.bestTotal ?? _bpBest?.total ?? _bpBest?.Total) ?? null;
          // Build filters-ok summary string
          const _cfg = automationConfig;
          const _sigAbs = Math.abs(correspondingDecision?.signal ?? 0);
          const _filterParts: string[] = [];
          if (_cfg) {
            if (_sigAbs > 0) _filterParts.push(`σ${_sigAbs.toFixed(2)}`);
            if (_cfg.minNetEdge > 0 && correspondingDecision?.netEdge != null) _filterParts.push(`edge${(correspondingDecision.netEdge).toFixed(3)}`);
            if (_cfg.noSpreadExit && correspondingDecision?.spread != null) _filterParts.push(`sprd${(correspondingDecision.spread).toFixed(3)}`);
            if (_cfg.minHoldMinutes > 0) _filterParts.push(`hold≥${_cfg.minHoldMinutes}m`);
            if (isEntryIntent && isAdd && triggerMag3 != null) _filterParts.push(`add#${addNum3}@${triggerMag3.toFixed(2)}`);
          }
          const _isBeta = automationConfig?.betaMode === true;
          const _effectiveRatingMode = (ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) || null;
          const _effectiveRatingType = ratingType ?? "any";
          const _logBase = {
            ts: dispatchAt,
            timeStr: _fmtMs(dispatchAt),
            event: _logEvent,
            betaMode: _isBeta,
            session: session ?? null,
            ruleBand: ruleBand ?? null,
            signalClass: signalClass ?? null,
            ratingMode: _effectiveRatingMode,
            ratingType: _effectiveRatingType,
            ticker: intent.ticker,
            benchmark: intent.benchmark,
            side: intent.side as "Long" | "Short",
            sigmaZap: _isLong
              ? (toNum(_rawSig?.zapLsigma) ?? correspondingDecision?.signal ?? null)
              : (toNum(_rawSig?.zapSsigma) ?? correspondingDecision?.signal ?? null),
            zapSsigma: _rawSig?.zapSsigma ?? null,
            zapLsigma: _rawSig?.zapLsigma ?? null,
            zapPct: _rawSig ? (_isLong ? (_rawSig.zapL ?? null) : (_rawSig.zapS ?? null)) : null,
            bidPct: _rawSig ? toNum(_rawSig["BidLstClsΔ%"]) : null,
            askPct: _rawSig ? toNum(_rawSig["AskLstClsΔ%"]) : null,
            benchBidPct: _rawSig ? toNum(_rawSig["BenchBidLstClsΔ%"]) : null,
            benchAskPct: _rawSig ? toNum(_rawSig["BenchAskLstClsΔ%"]) : null,
            corr: _corr,
            beta: _beta,
            stockSigma: _stockSigma,
            rating: _rating,
            ratingTotal: _ratingTotal,
            filtersOk: _filterParts.join(" | "),
            spread: correspondingDecision?.spread ?? null,
            netEdge: correspondingDecision?.netEdge ?? null,
            holdMs: _latch ? dispatchAt - _latch.qualifiedSince : null,
            qualifiedAtStr: _latch ? _fmtMs(_latch.qualifiedSince) : null,
            sequence: intent.sequence,
            entrySignal: pos3?.entrySignal ?? null,
            addThreshold: isAdd ? (triggerMag3 ?? null) : null,
            dilutionStep: dilution3,
            maxAdds: automationConfig?.maxAdds ?? null,
            exitMode: automationConfig?.exitExecutionMode ?? "n/a",
            hedgeMode: automationConfig?.hedgeMode ?? "n/a",
            scaleMode: automationConfig?.scaleMode ?? "n/a",
            minNetEdge: automationConfig?.minNetEdge ?? null,
            minHoldMinutes: automationConfig?.minHoldMinutes ?? null,
            notionalUsd: automationConfig?.sizeValue ?? null,
            hedgeRequired: !!hedgeRequired,
            reason: intent.reason,
          };

          // BETA MODE: simulate dispatch — skip real order, log as SIMULATED
          if (_isBeta) {
            streamLogStore.push({ ..._logBase, status: "SIMULATED" });
            console.log(`[BETA SIM] ${intent.ticker} ${intent.intent} — no order sent`);
          } else {
          // Mark ticker as having an in-flight ENTRY dispatch. This is checked
          // synchronously in syncStreamPositions to prevent the engine from dropping
          // the position (HOLD/grace path) while the HTTP request is outstanding.
          // The ref update is synchronous, guaranteeing visibility on the next engine
          // tick regardless of React's async state update scheduling.
          if (!isAdd && isEntryIntent) {
            dispatchingEntryTickersRef.current.add(intent.ticker);
          }
          // Pre-mark entryDispatchedAt before the HTTP round-trip so the engine
          // never sees entryDispatchedAt==null on the next tick and drops the position.
          // (Belt-and-suspenders alongside dispatchingEntryTickersRef.)
          if (!isAdd && isEntryIntent) {
            setStreamPositions((prev) => prev.map((row) => {
              if (row.ticker !== intent.ticker || row.entryDispatchedAt != null) return row;
              return { ...row, entryDispatchedAt: dispatchAt };
            }));
          }
          try {
            await queueLegWithRetry({
              intentId: intent.id,
              ticker: intent.ticker,
              type,
              note: intent.reason,
              hotkeyOverride: getNightHotkeyOverride(type),
            });
          } catch (err) {
            // Dispatch failed — roll back so it can be retried next cycle.
            dispatchedIntentIdsRef.current.delete(intent.id);
            recentDispatchAttemptsRef.current.delete(dispatchKey);
            sentDispatchKeys.delete(dispatchKey);
            if (!isAdd && isEntryIntent) {
              // Remove from in-flight tracking so next cycle can retry.
              dispatchingEntryTickersRef.current.delete(intent.ticker);
              // Roll back the pre-marked entryDispatchedAt so the engine re-generates the intent.
              setStreamPositions((prev) => prev.map((row) => {
                if (row.ticker !== intent.ticker) return row;
                return { ...row, entryDispatchedAt: null };
              }));
            }
            console.error(`[SEND FAIL] ${intent.ticker} ${intent.intent}`, err);
            streamLogStore.push({ ..._logBase, status: "FAILED" });
            throw err;
          }
          streamLogStore.push({ ..._logBase, status: "SENT" });
          } // end if (!_isBeta)
          if (!_isBeta) console.log(`[SENT OK] ${intent.ticker} → bridge queued`);
          if (!_isBeta) setStreamSentOrdersCount((prev) => prev + 1);
          setStreamPositions((prev) => prev.map((row) => {
            if (row.ticker !== intent.ticker) return row;
            return {
              ...row,
              // Beta mode: immediately mark entries as OPEN (no backend confirmation to wait for).
              // Real mode: keep PENDING_ENTRY until hasExecutionDispatchConfirmation.
              status: isEntryIntent
                ? (_isBeta ? "OPEN" : row.status)
                : intent.intent === "EXIT_LONG_PRINT" || intent.intent === "EXIT_SHORT_PRINT" || intent.intent === "CLOSE_ALL_PRINT"
                  ? "PRINT_PENDING"
                  : row.status,
              pendingIntent: isEntryIntent ? null : row.pendingIntent,
              entryDispatchedAt: row.entryDispatchedAt ?? dispatchAt,
              lastDispatchedAt: isEntryIntent ? dispatchAt : row.lastDispatchedAt,
              lastConfirmedActiveAt: _isBeta && isEntryIntent ? dispatchAt : row.lastConfirmedActiveAt,
              reason: _isBeta ? `[BETA] ${intent.reason}` : isEntryIntent && row.lastConfirmedActiveAt == null
                ? "order queued | waiting for execution confirmation"
                : row.reason,
              updatedAt: dispatchAt,
            };
          }));
          // entryDispatchedAt is now permanently set in state — the in-flight guard is no longer needed.
          if (!isAdd && isEntryIntent) {
            dispatchingEntryTickersRef.current.delete(intent.ticker);
          }
          // In beta mode: immediately confirm action log entries (no backend to confirm them).
          // In real mode: queue pending entries and wait for execution snapshot confirmation.
          const _dispatchActionLog = (entries: StreamActionLogEntry[]) => {
            if (_isBeta) {
              appendStreamActionLogEntries(entries);
            } else {
              queuePendingActionLogEntries(intent.id, entries);
            }
          };
          if (intent.intent === "CLOSE_ALL_PRINT") {
            _dispatchActionLog(
              openLoggedPositions
                .map((row) => ({
                  id: `${row.ticker}|CLOSE|${dispatchAt}`,
                  dayKey: localDayKey(),
                  ticker: row.ticker,
                  benchmark: row.benchmark,
                  side: row.side,
                  kind: "CLOSE" as const,
                  deviation: row.lastSignal ?? row.entrySignal,
                  at: dispatchAt,
                  intent: "CLOSE_ALL_PRINT" as const,
                  reason: "print window close all",
                }))
            );
          } else if (isEntryIntent && correspondingPosition) {
            const isAdd = correspondingPosition.entryCount > 1;
            const deviation = isAdd
              ? (correspondingPosition.lastScaleSignal ?? correspondingPosition.lastSignal ?? correspondingPosition.entrySignal)
              : (correspondingPosition.entrySignal ?? correspondingPosition.lastSignal);
            const _prevDispatch = correspondingPosition.lastDispatchedAt ?? correspondingPosition.entryDispatchedAt ?? null;
            _dispatchActionLog([{
              id: `${intent.ticker}|${isAdd ? "ADD" : "ENTRY"}|${dispatchAt}`,
              dayKey: localDayKey(),
              ticker: intent.ticker,
              benchmark: intent.benchmark,
              side: intent.side,
              kind: isAdd ? "ADD" : "ENTRY",
              deviation,
              at: dispatchAt,
              intent: intent.intent,
              reason: correspondingPosition.reason || undefined,
              sequence: intent.sequence,
              addThreshold: isAdd ? (triggerMag3 ?? null) : null,
              sinceLastMs: isAdd && _prevDispatch != null ? Math.max(0, dispatchAt - _prevDispatch) : null,
              delayRequiredMs: isAdd ? Math.max(0, (automationConfig?.addDelayMinutes ?? 0) * 60_000) : null,
              filtersOk: _filterParts.join(" | ") || undefined,
            }]);
          } else if (isExitIntent && correspondingPosition) {
            _dispatchActionLog([{
              id: `${intent.ticker}|CLOSE|${dispatchAt}`,
              dayKey: localDayKey(),
              ticker: intent.ticker,
              benchmark: intent.benchmark,
              side: intent.side,
              kind: "CLOSE",
              deviation: correspondingPosition.lastSignal ?? correspondingPosition.entrySignal,
              at: dispatchAt,
              intent: intent.intent,
              reason: correspondingPosition.reason || undefined,
              sequence: intent.sequence,
              holdMs: correspondingPosition.entryDispatchedAt != null
                ? Math.max(0, dispatchAt - correspondingPosition.entryDispatchedAt)
                : null,
              entryCount: correspondingPosition.entryCount ?? null,
              filtersOk: _filterParts.join(" | ") || undefined,
            }]);
          }
        }

        // Hedge leg: simulate in beta mode (log without sending), send real order otherwise
        if (hedgeRequired && !hedgeAlreadyDispatched) {
          const hedgeIsBeta = automationConfig?.betaMode === true;
          const benchmarkType =
            isEntryIntent
              ? (type === "EnterLongAggressive" ? "EnterShortAggressive" : "EnterLongAggressive")
              : type;
          const hedgeSide: "Long" | "Short" = isEntryIntent
            ? (intent.side === "Long" ? "Short" : "Long")
            : intent.side;
          dispatchedHedgeIntentIdsRef.current.add(hedgeIntentId);
          if (hedgeIsBeta) {
            const hedgeNow = Date.now();
            const hedgeRaw = rawSignalByTickerRef.current.get(intent.benchmark);
            const hedgeIsLong = hedgeSide === "Long";
            const hedgeLogEvent: StreamLogEvent =
              intent.intent === "CLOSE_ALL_PRINT" ? "CLOSE_ALL"
              : isExitIntent ? (intent.intent.includes("PRINT") ? "EXIT_PRINT" : "EXIT")
              : intent.sequence > 1 ? "ADD" : "ENTRY";
            const fmtHedgeMs = (ts: number) => {
              const d = new Date(ts);
              return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
            };
            streamLogStore.push({
              ts: hedgeNow,
              timeStr: fmtHedgeMs(hedgeNow),
              event: hedgeLogEvent,
              betaMode: true,
              status: "SIMULATED",
              session: session ?? null,
              ruleBand: ruleBand ?? null,
              signalClass: signalClass ?? null,
              ratingMode: (ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) || null,
              ratingType: ratingType ?? "any",
              ticker: intent.benchmark,
              benchmark: intent.ticker,
              side: hedgeSide,
              sigmaZap: hedgeIsLong ? (toNum(hedgeRaw?.zapLsigma) ?? null) : (toNum(hedgeRaw?.zapSsigma) ?? null),
              zapSsigma: toNum(hedgeRaw?.zapSsigma) ?? null,
              zapLsigma: toNum(hedgeRaw?.zapLsigma) ?? null,
              zapPct: hedgeRaw ? (hedgeIsLong ? (hedgeRaw.zapL ?? null) : (hedgeRaw.zapS ?? null)) : null,
              bidPct: hedgeRaw ? toNum(hedgeRaw["BidLstClsΔ%"]) : null,
              askPct: hedgeRaw ? toNum(hedgeRaw["AskLstClsΔ%"]) : null,
              benchBidPct: null,
              benchAskPct: null,
              spread: null,
              netEdge: null,
              corr: null,
              beta: null,
              stockSigma: null,
              rating: null,
              ratingTotal: null,
              filtersOk: "",
              holdMs: null,
              qualifiedAtStr: null,
              sequence: intent.sequence,
              entrySignal: null,
              addThreshold: null,
              dilutionStep: automationConfig?.dilutionStep ?? null,
              maxAdds: automationConfig?.maxAdds ?? null,
              exitMode: automationConfig?.exitExecutionMode ?? "n/a",
              hedgeMode: automationConfig?.hedgeMode ?? "n/a",
              scaleMode: automationConfig?.scaleMode ?? "n/a",
              minNetEdge: automationConfig?.minNetEdge ?? null,
              minHoldMinutes: automationConfig?.minHoldMinutes ?? null,
              notionalUsd: automationConfig?.sizeValue ?? null,
              hedgeRequired: true,
              reason: `${intent.reason} | benchmark ${isExitIntent ? "hedge exit" : "hedge"}`,
            });
            console.log(`[BETA HEDGE SIM] ${intent.benchmark} ${benchmarkType} (hedge for ${intent.ticker})`);
          } else {
            console.log(`[HEDGE] ${intent.benchmark} ${benchmarkType} (hedge for ${intent.ticker})`);
            try {
              await queueLegWithRetry({
                intentId: hedgeIntentId,
                ticker: intent.benchmark,
                type: benchmarkType,
                note: `${intent.reason} | benchmark ${isExitIntent ? "hedge exit" : "hedge"}`,
                hotkeyOverride: getNightHotkeyOverride(benchmarkType),
              });
            } catch (err) {
              dispatchedHedgeIntentIdsRef.current.delete(hedgeIntentId);
              throw err;
            }
            setStreamSentOrdersCount((prev) => prev + 1);
          }
        }
      }
      // Single status refresh after the full batch — avoids one round-trip per intent.
      await refreshExecutionStatus(true);
    };

    void sendQueuedIntents().catch((error: any) => {
      onError?.(error?.message ?? String(error));
    }).finally(() => {
      dispatchLoopActiveRef.current = false;
      // If resetStreamAutomationState was called while we were in-flight, it deferred
      // the ref-clear to here so no in-flight order loses its dedup coverage mid-flight.
      if (pendingResetDispatchRefsRef.current) {
        pendingResetDispatchRefsRef.current = false;
        dispatchedIntentIdsRef.current.clear();
        dispatchedHedgeIntentIdsRef.current.clear();
        recentDispatchAttemptsRef.current.clear();
        dispatchingEntryTickersRef.current.clear();
        dismissedEntryTickersRef.current.clear();
      }
      if (dispatchLoopReplayRef.current) {
        dispatchLoopReplayRef.current = false;
        queueMicrotask(() => setExecutionRevision((prev) => prev + 1));
      }
    });
  }, [automationConfig, enabled, entryCutoffEnabled, executionRevision, streamAutoEnabled, streamOrderIntents, onError, openLoggedTickers, queuePendingActionLogEntries, appendStreamActionLogEntries, refreshExecutionStatus]);

  useEffect(() => {
    if (!enabled) return;
    const strategyAutoRunning = streamAutoEnabled && Boolean(automationConfig?.strategyModeEnabled);
    if (!strategyAutoRunning) return;

    const timer = window.setInterval(() => {
      void refreshRef.current?.({ refreshBridge: true }).catch((error: any) => {
        onErrorRef.current?.(error?.message ?? String(error));
      });
    }, STREAM_AUTOMATION_TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [automationConfig?.strategyModeEnabled, enabled, streamAutoEnabled]);

  const todaysStreamActionLog = useMemo(() => (
    streamActionLog
      .filter((row) => row.dayKey === currentDayKey)
      .sort((a, b) => b.at - a.at)
  ), [currentDayKey, streamActionLog]);

  useEffect(() => {
    streamActionLogStore.applySnapshot(todaysStreamActionLog);
  }, [todaysStreamActionLog]);

  return {
    streamEntryReadyCount,
    streamPositions,
    streamActionLog: todaysStreamActionLog,
    streamOrderIntents,
    streamAutoEnabled,
    streamSessionStartedAt,
    streamSessionStoppedAt,
    streamSentOrdersCount,
    setStreamAutoEnabled,
    streamManualExecutionBusy,
    bindStreamWindows,
    bindStreamActiveWindow,
    bindStreamActiveWindowDelayed,
    clearStreamBoundWindow,
    captureStreamTickerPoint,
    captureStreamTickerPointDelayed,
    clearStreamTickerPoint,
    toggleStreamPanicOff,
    startStreamAutomation,
    clearStreamExecutionQueue,
    resetStreamAutomationState,
    dismissStreamActivePositions,
    submitManualStreamOrders,
    refresh,
  };
}
