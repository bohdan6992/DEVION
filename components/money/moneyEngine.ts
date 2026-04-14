"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeUrl } from "../../lib/bridgeBase";
import { applyArbitrageFilters } from "../../lib/filters/arbitrageFilterEngine";
import type { ArbitrageFilterConfigV1 } from "../../lib/filters/arbitrageFilterConfigV1";
import { applyExactSonarClientFilters, buildSignalsStreamUrl, normalizeSignal, type ArbitrageSignal, type SonarExactFilterSnapshot } from "../sonar/ArbitrageSonar";
import { moneyActionLogStore } from "./moneyActionLogStore";
import { getMoneyDecisionRow, moneyDecisionStore } from "./moneyDecisionStore";
import { moneyExecutionStore } from "./moneyExecutionStore";
import { connectMoneyOcrStream } from "./moneyOcrStream";
import { moneyOrderIntentStore } from "./moneyOrderIntentStore";
import { moneyBookStore, resetMoneyOcrStores } from "./moneyOcrStores";
import { moneyPositionStore } from "./moneyPositionStore";
import { moneySignalStore } from "./moneySignalStore";
import { moneyUpdatedAtStore } from "./moneyUpdatedAtStore";

export type MoneyDecisionStatus = "ENTRY_READY" | "HOLD" | "EXIT_READY" | "EXIT_BLOCKED" | "BLOCKED_SPREAD" | "BLOCKED_EDGE";

export type MoneyDecisionRow = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  safePrice: number | null;
  netEdge: number | null;
  positionBp: number | null;
  status: MoneyDecisionStatus;
  reason: string;
  updatedAt: number;
};

export type MoneyPosition = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  entrySignal: number | null;
  lastSignal: number | null;
  lastScaleSignal: number | null;
  spread: number | null;
  status: "PENDING_ENTRY" | "OPEN" | "EXIT_BLOCKED" | "CLOSED" | "PRINT_PENDING";
  reason: string;
  entryCount: number;
  lockedForPrint: boolean;
  pendingIntent: MoneyOrderIntentType | null;
  entryDispatchedAt: number | null;
  lastConfirmedActiveAt: number | null;
  openedAt: number;
  updatedAt: number;
};

export type MoneyActionLogKind = "ENTRY" | "ADD" | "CLOSE";

export type MoneyActionLogEntry = {
  id: string;
  dayKey: string;
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  kind: MoneyActionLogKind;
  deviation: number | null;
  at: number;
  intent: MoneyOrderIntentType | "MANUAL";
};

export type MoneyOrderIntentType =
  | "ENTER_LONG_AGGRESSIVE"
  | "ENTER_SHORT_AGGRESSIVE"
  | "EXIT_LONG_AGGRESSIVE"
  | "EXIT_SHORT_AGGRESSIVE"
  | "EXIT_LONG_PRINT"
  | "EXIT_SHORT_PRINT"
  | "CLOSE_ALL_PRINT";

export type MoneyOrderIntent = {
  id: string;
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  intent: MoneyOrderIntentType;
  sequence: number;
  priceRef: "BID" | "ASK" | "PRINT";
  status: "QUEUED" | "BLOCKED";
  reason: string;
  createdAt: number;
};

function isEntryOrderIntent(intent: MoneyOrderIntentType | null | undefined): boolean {
  return intent === "ENTER_LONG_AGGRESSIVE" || intent === "ENTER_SHORT_AGGRESSIVE";
}

function isExitOrderIntent(intent: MoneyOrderIntentType | null | undefined): boolean {
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

export type MoneyRatingBand = "BLUE" | "ARK" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
export type MoneyRatingRule = {
  band: MoneyRatingBand;
  minRate: number;
  minTotal: number;
};

export type MoneyExecutionDescriptor = {
  signalClass: string;
  ratingRule: MoneyRatingRule;
};

export type MoneyManualOrderAction = "buy" | "sell" | "cover";

export type MoneyAutomationConfig = {
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
  minHoldMinutes: number;
  exitMode: "normalize" | "print";
  printStartTime: string;
  printCloseTime: string;
  noSpreadExit: boolean;
};

type MoneySignalLatch = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  qualifiedSince: number;
  lastSeenAt: number;
};

type MoneyMinMax = {
  min?: number;
  max?: number;
};

export type MoneyFilterBuilderArgs = {
  signalClass: string;
  ratingType: string | null | undefined;
  minRate: number;
  minTotal: number;
  listMode: "off" | "ignore" | "apply" | "pin";
  ignoreTickers: string[];
  applyTickers: string[];
  pinnedTickers: string[];
  bounds: {
    ADV20?: MoneyMinMax;
    ADV20NF?: MoneyMinMax;
    ADV90?: MoneyMinMax;
    ADV90NF?: MoneyMinMax;
    AvPreMhv?: MoneyMinMax;
    RoundLot?: MoneyMinMax;
    VWAP?: MoneyMinMax;
    Spread?: MoneyMinMax;
    LstPrcL?: MoneyMinMax;
    LstCls?: MoneyMinMax;
    YCls?: MoneyMinMax;
    TCls?: MoneyMinMax;
    ClsToClsPct?: MoneyMinMax;
    Lo?: MoneyMinMax;
    LstClsNewsCnt?: MoneyMinMax;
    MarketCapM?: MoneyMinMax;
    PreMhVolNF?: MoneyMinMax;
    VolNFfromLstCls?: MoneyMinMax;
    AvPostMhVol90NF?: MoneyMinMax;
    AvPreMhVol90NF?: MoneyMinMax;
    AvPreMhValue20NF?: MoneyMinMax;
    AvPreMhValue90NF?: MoneyMinMax;
    AvgDailyValue20?: MoneyMinMax;
    AvgDailyValue90?: MoneyMinMax;
    Volatility20?: MoneyMinMax;
    Volatility90?: MoneyMinMax;
    PreMhMDV20NF?: MoneyMinMax;
    PreMhMDV90NF?: MoneyMinMax;
    VolRel?: MoneyMinMax;
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

function signalSide(row: ArbitrageSignal): "Long" | "Short" {
  return row.direction === "down" ? "Short" : "Long";
}

function signalAbs(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  const raw = toNum(row.sig ?? row.zapLsigma ?? row.zapSsigma ?? row.zapL ?? row.zapS);
  return raw == null ? null : Math.abs(raw);
}

function signalSigned(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  return toNum(row.sig ?? row.zapLsigma ?? row.zapSsigma ?? row.zapL ?? row.zapS);
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
  // Money engine uses strict position activity: only PositionBp != 0 means active.
  return bp != null && bp !== 0;
}

function signalSpread(row: ArbitrageSignal | null | undefined): number | null {
  if (!row) return null;
  return toNum(row.Spread ?? row.spread);
}

function hasStrategyEntryCutoff(signalClass: string | undefined): boolean {
  return (signalClass ?? "").trim().toLowerCase() === "ark";
}

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

function moneyActionLogStorageKey(signalClass: string | undefined): string {
  const suffix = (signalClass ?? "global").trim().toLowerCase() || "global";
  return `money.arbitrage.action-log.${suffix}`;
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

function pruneMoneyActionLog(entries: MoneyActionLogEntry[], now = Date.now()): MoneyActionLogEntry[] {
  return entries
    .filter((entry) => {
      const age = dayKeyAgeInDays(entry.dayKey, now);
      return age >= 0 && age < 3;
    })
    .sort((a, b) => a.at - b.at);
}

function readMoneyActionLog(storageKey: string): MoneyActionLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneMoneyActionLog(parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<MoneyActionLogEntry>;
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
        } satisfies MoneyActionLogEntry;
      })
      .filter((row): row is MoneyActionLogEntry => row !== null), Date.now());
  } catch {
    return [];
  }
}

function buildMoneyPositionsFromActionLog(entries: MoneyActionLogEntry[], dayKey = localDayKey()): MoneyPosition[] {
  const todaysEntries = entries
    .filter((entry) => entry.dayKey === dayKey)
    .sort((a, b) => a.at - b.at);
  const openByTicker = new Map<string, MoneyPosition>();

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
        spread: null,
        status: "OPEN",
        reason: entry.kind === "ADD" ? "restored add from action log" : "restored entry from action log",
        entryCount: entry.kind === "ADD" ? 2 : 1,
        lockedForPrint: false,
        pendingIntent: null,
        entryDispatchedAt: entry.at,
        lastConfirmedActiveAt: entry.at,
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
      lastConfirmedActiveAt: entry.at,
      updatedAt: entry.at,
    });
  }

  return Array.from(openByTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function buildOpenTickersFromActionLog(entries: MoneyActionLogEntry[], dayKey = localDayKey()): Set<string> {
  return new Set(buildMoneyPositionsFromActionLog(entries, dayKey).map((row) => row.ticker));
}

function hasExecutionDispatchConfirmation(
  snapshot: TradingAppExecutionSnapshot | null | undefined,
  intentId: string,
): boolean {
  if (!snapshot || !intentId) return false;
  const matchesIntent = (item: TradingAppQueueItem | null | undefined) =>
    item != null &&
    item.intentId === intentId &&
    (item.status === "Sent" || item.status === "Completed");

  if (matchesIntent(snapshot.current ?? null)) {
    return true;
  }

  return snapshot.queue.some(matchesIntent) || snapshot.history.some(matchesIntent);
}

function mergeMoneyPositionsWithActionLog(
  prev: MoneyPosition[],
  entries: MoneyActionLogEntry[],
  dayKey = localDayKey()
): MoneyPosition[] {
  const restored = buildMoneyPositionsFromActionLog(entries, dayKey);
  const restoredByTicker = new Map(restored.map((row) => [row.ticker, row]));
  const prevByTicker = new Map(prev.map((row) => [row.ticker, row]));
  const transient = prev.filter((row) =>
    row.status !== "CLOSED" &&
    row.entryDispatchedAt == null &&
    isEntryOrderIntent(row.pendingIntent)
  );
  const transientByTicker = new Map(transient.map((row) => [row.ticker, row]));
  const merged = new Map<string, MoneyPosition>();

  for (const [ticker, row] of restoredByTicker) {
    const existing = prevByTicker.get(ticker) ?? null;
    merged.set(ticker, existing ? {
      ...row,
      spread: existing.spread ?? row.spread,
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

function sameDecisionRows(a: MoneyDecisionRow[], b: MoneyDecisionRow[]): boolean {
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

function syncMoneySignalLatches(
  prev: MoneySignalLatch[],
  decisions: MoneyDecisionRow[],
  autoEnabled: boolean,
  automationConfig?: MoneyAutomationConfig,
  entryCutoffEnabled = true,
  primeImmediately = false
): MoneySignalLatch[] {
  if (!autoEnabled || !automationConfig?.strategyModeEnabled) return [];

  const now = Date.now();
  const minHoldMs = Math.max(0, automationConfig.minHoldMinutes ?? 0) * 1000;
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig.printStartTime, 9 * 60 + 20);
  if (entryCutoffEnabled && nowMinutes >= printStartMinutes) return [];

  const prevMap = new Map(prev.map((row) => [row.ticker, row]));
  const next: MoneySignalLatch[] = [];

  for (const row of decisions) {
    if (row.status !== "ENTRY_READY") continue;
    const existing = prevMap.get(row.ticker);
    next.push({
      ticker: row.ticker,
      benchmark: row.benchmark,
      side: row.side,
      qualifiedSince: existing?.qualifiedSince ?? (primeImmediately ? now - minHoldMs : now),
      lastSeenAt: now,
    });
  }

  return next.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function parseMoneySpreadLimit(value: unknown): number | null {
  return toNum(value);
}

export function deriveMoneySignalClass(ruleBand: "BLUE" | "ARK" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL"): string {
  return ruleBand === "GLOBAL" ? "global" : ruleBand.toLowerCase();
}

export function deriveMoneyRatingRule(ruleBand: MoneyRatingBand, ratingRules: MoneyRatingRule[]): MoneyRatingRule {
  return ratingRules.find((rule) => rule.band === ruleBand) ?? { band: ruleBand, minRate: 0, minTotal: 0 };
}

export function deriveMoneyExecutionDescriptor(ruleBand: MoneyRatingBand, ratingRules: MoneyRatingRule[]): MoneyExecutionDescriptor {
  return {
    signalClass: deriveMoneySignalClass(ruleBand),
    ratingRule: deriveMoneyRatingRule(ruleBand, ratingRules),
  };
}

export function buildMoneyFilterConfig(args: MoneyFilterBuilderArgs): ArbitrageFilterConfigV1 {
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

export function computeMoneyDecisionRows(
  signals: ArbitrageSignal[],
  maxSpreadValue: unknown,
  automationConfig?: MoneyAutomationConfig,
  bookSnapshot?: MarketMakerBookSnapshot | null
): MoneyDecisionRow[] {
  const spreadLimit = parseMoneySpreadLimit(maxSpreadValue);
  const canApplyBook = signals.length === 1 && (bookSnapshot?.bestBid != null || bookSnapshot?.bestAsk != null);

  return signals.map((row) => {
    const side: "Long" | "Short" = row.direction === "down" ? "Short" : "Long";
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
    const signal = toNum(row.sig ?? row.zapLsigma ?? row.zapSsigma ?? row.zapL ?? row.zapS);
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
      safePrice,
      netEdge,
      positionBp,
      status,
      reason,
      updatedAt: Date.now(),
    };
  });
}

export function syncMoneyPositions(
  prev: MoneyPosition[],
  decisions: MoneyDecisionRow[],
  allSignals: ArbitrageSignal[],
  filteredSignals: ArbitrageSignal[],
  latches: MoneySignalLatch[],
  autoEnabled: boolean,
  maxSpreadValue: unknown,
  automationConfig?: MoneyAutomationConfig,
  entryCutoffEnabled = true,
  loggedOpenTickers: ReadonlySet<string> = new Set()
): MoneyPosition[] {
  const signalMap = new Map(allSignals.map((row) => [row.ticker, row]));
  const filteredSignalMap = new Map(filteredSignals.map((row) => [row.ticker, row]));
  const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));
  const spreadLimit = parseMoneySpreadLimit(maxSpreadValue);
  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  const endThreshold = Math.max(0, automationConfig?.endSignalThreshold ?? 0);
  const minHoldMs = Math.max(0, automationConfig?.minHoldMinutes ?? 0) * 1000;

  if (!autoEnabled) {
    return prev
      .filter((row) =>
        row.status !== "CLOSED" &&
        row.entryDispatchedAt != null &&
        loggedOpenTickers.has(row.ticker)
      )
      .map((existing) => {
        const raw = filteredSignalMap.get(existing.ticker) ?? signalMap.get(existing.ticker);
        const currentSignal = signalSigned(raw) ?? signalAbs(raw) ?? existing.lastSignal;
        const inPrintWindow = entryCutoffEnabled && nowMinutes >= printStartMinutes;
        return {
          ...existing,
          lastSignal: currentSignal,
          lastScaleSignal: existing.lastScaleSignal ?? existing.entrySignal ?? currentSignal,
          spread: signalSpread(raw) ?? existing.spread,
          status: inPrintWindow ? "PRINT_PENDING" : (existing.status === "EXIT_BLOCKED" ? "EXIT_BLOCKED" : "OPEN"),
          reason: inPrintWindow ? "09:20 print exit armed" : "restored active MONEY position from action log",
          lockedForPrint: inPrintWindow,
          pendingIntent: inPrintWindow && !existing.lockedForPrint
            ? (existing.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT")
            : null,
          entryDispatchedAt: existing.entryDispatchedAt ?? existing.openedAt ?? now,
          lastConfirmedActiveAt: existing.lastConfirmedActiveAt ?? existing.updatedAt ?? now,
          openedAt: existing.openedAt ?? (now - minHoldMs),
          updatedAt: now,
        } satisfies MoneyPosition;
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  if (automationConfig?.strategyModeEnabled) {
    const next: MoneyPosition[] = [];
    const seen = new Set<string>();
    const maxOpenAllowed = entryCutoffEnabled
      ? (automationConfig.maxOpenPositions ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

    for (const existing of prev) {
      const existsInActionLog = loggedOpenTickers.has(existing.ticker);
      const raw = signalMap.get(existing.ticker);
      const rawSeen = Boolean(raw);
      const filteredRaw = filteredSignalMap.get(existing.ticker);
      const currentSigned = signalSigned(filteredRaw ?? raw) ?? signalSigned(raw);
      const currentAbs = currentSigned == null ? signalAbs(raw) : Math.abs(currentSigned);
      const currentSpread = signalSpread(raw) ?? existing.spread;
      const spreadBlocked = spreadLimit != null && currentSpread != null && currentSpread > spreadLimit;
      const holdBlocked = minHoldMs > 0 && now - existing.openedAt < minHoldMs;
      const inPrintWindow = entryCutoffEnabled && nowMinutes >= printStartMinutes;
      const activeExitMode = (automationConfig.exitExecutionMode ?? "active") === "active";
      const belowEndThreshold = currentAbs != null && currentAbs < endThreshold;
      const atOrAboveEndThreshold = currentAbs != null && currentAbs >= endThreshold;
      const shouldNormalizeExit = activeExitMode && belowEndThreshold;

      let status: MoneyPosition["status"] = existing.status;
      let reason = existing.reason;
      let pendingIntent: MoneyPosition["pendingIntent"] = existing.pendingIntent;
      let lockedForPrint = existing.lockedForPrint;
      let entryCount = existing.entryCount;
      let lastScaleSignal = existing.lastScaleSignal ?? existing.entrySignal;
      let entryDispatchedAt = existing.entryDispatchedAt ?? null;
      let lastConfirmedActiveAt = existing.lastConfirmedActiveAt ?? null;
      const decision = decisionMap.get(existing.ticker);
      const entryStillReady = decision?.status === "ENTRY_READY";
      const hasUndispatchedEntry =
        entryDispatchedAt == null &&
        (isEntryOrderIntent(existing.pendingIntent) || existing.entryCount <= 1);

      if (!hasUndispatchedEntry && entryDispatchedAt != null && !existsInActionLog) {
        continue;
      }

      if (entryDispatchedAt != null) {
        lastConfirmedActiveAt = now;
      }

      if (hasUndispatchedEntry) {
        if (inPrintWindow || !entryStillReady) {
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
          reason = `min hold ${automationConfig.minHoldMinutes}s not reached`;
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
            ? "passive mode | waiting for print exit"
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
          const filteredSigned = signalSigned(filteredSignal) ?? signalSigned(raw);
          const filteredAbs = filteredSigned == null ? null : Math.abs(filteredSigned);
          const triggerBaseSigned = lastScaleSignal ?? existing.entrySignal ?? 0;
          const triggerBaseAbs = Math.abs(triggerBaseSigned);
          const trigger = triggerBaseAbs + Math.max(0, automationConfig.dilutionStep ?? 0);
          let sameSign = true;
          if (
            filteredSigned != null &&
            Number.isFinite(filteredSigned) &&
            Number.isFinite(triggerBaseSigned) &&
            filteredSigned !== 0 &&
            triggerBaseSigned !== 0
          ) {
            sameSign = Math.sign(filteredSigned) === Math.sign(triggerBaseSigned);
          }
          if (filteredAbs != null && filteredAbs >= trigger && sameSign) {
            entryCount += 1;
            lastScaleSignal = filteredSigned;
            pendingIntent = existing.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE";
            reason = `scale-in add ${entryCount - 1}/${Math.max(0, automationConfig.maxAdds ?? 0)}`;
          } else {
            pendingIntent = null;
          }
        } else if (!isExitOrderIntent(pendingIntent)) {
          pendingIntent = null;
        }
      }

      next.push({
        ...existing,
        lastSignal: currentSigned ?? currentAbs,
        lastScaleSignal,
        spread: currentSpread,
        status,
        reason,
        entryCount,
        lockedForPrint,
        pendingIntent,
        entryDispatchedAt,
        lastConfirmedActiveAt,
        updatedAt: now,
      });
      seen.add(existing.ticker);
    }

    let openCount = next.filter((row) => row.status === "OPEN" || row.status === "PRINT_PENDING").length;
    for (const latch of latches) {
      if (seen.has(latch.ticker)) continue;
      if (entryCutoffEnabled && nowMinutes >= printStartMinutes) continue;
      if (openCount >= maxOpenAllowed) continue;
      if (now - latch.qualifiedSince < minHoldMs) continue;

      const raw = filteredSignalMap.get(latch.ticker) ?? signalMap.get(latch.ticker);
      const currentSigned = signalSigned(raw) ?? signalAbs(raw);
      const currentSpread = signalSpread(raw);
      next.push({
        ticker: latch.ticker,
        benchmark: latch.benchmark,
        side: latch.side,
        entrySignal: currentSigned,
        lastSignal: currentSigned,
        lastScaleSignal: currentSigned,
        spread: currentSpread,
        status: "PENDING_ENTRY",
        reason: `entered after hold ${automationConfig.minHoldMinutes}s`,
        entryCount: 1,
        lockedForPrint: false,
        pendingIntent: latch.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
        entryDispatchedAt: null,
        lastConfirmedActiveAt: null,
        openedAt: now,
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
  const maxOpenAllowed = entryCutoffEnabled
    ? (automationConfig?.maxOpenPositions ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
  const next: MoneyPosition[] = [];
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

  let openCount = next.filter((row) => row.status === "OPEN").length;
  return next
    .filter((row) => row.status !== "CLOSED" || now - row.updatedAt < 15000)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function buildMoneyOrderIntents(
  decisions: MoneyDecisionRow[],
  positions: MoneyPosition[],
  autoEnabled: boolean,
  automationConfig?: MoneyAutomationConfig,
  entryCutoffEnabled = false
): MoneyOrderIntent[] {
  if (!autoEnabled) return [];

  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  const printWindowEnabled = entryCutoffEnabled && automationConfig?.exitMode === "print";
  const intents: MoneyOrderIntent[] = [];
  const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));

  if (automationConfig?.strategyModeEnabled) {
    if (entryCutoffEnabled && nowMinutes >= printStartMinutes) {
      const representativePosition = positions.find((position) =>
        position.status !== "CLOSED" &&
        position.status !== "PENDING_ENTRY"
      ) ?? null;
      if (!representativePosition) return [];
      return [{
        id: intentId(["close-all-print", "strategy", "armed"]),
        ticker: representativePosition.ticker,
        benchmark: "PRINT",
        side: representativePosition.side,
        intent: "CLOSE_ALL_PRINT",
        sequence: 0,
        priceRef: "PRINT",
        status: "QUEUED",
        reason: `print exit window active | global Ctrl+O at ${automationConfig.printStartTime}`,
        createdAt: now,
      }];
    }

    for (const position of positions) {
      if (!position.pendingIntent) continue;
      const isEntryIntent =
        position.pendingIntent === "ENTER_LONG_AGGRESSIVE" ||
        position.pendingIntent === "ENTER_SHORT_AGGRESSIVE";
      if (entryCutoffEnabled && nowMinutes >= printStartMinutes && isEntryIntent) continue;
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

    if (printWindowEnabled && nowMinutes >= printStartMinutes) {
      intents.push({
        id: intentId([position.ticker, "print-exit", position.side]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT",
        sequence: position.entryCount,
        priceRef: "PRINT",
        status: "QUEUED",
        reason: "print exit window active",
        createdAt: now,
      });
      continue;
    }

    if (normalizeExitTriggered) {
      const holdBlocked = automationConfig?.minHoldMinutes != null && automationConfig.minHoldMinutes > 0 && now - position.openedAt < automationConfig.minHoldMinutes * 1000;
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
          ? `min hold ${automationConfig?.minHoldMinutes}s not reached`
          : `normalization exit | abs(signal) ${Math.abs(decision.signal!).toFixed(2)} < ${Math.max(0, automationConfig?.endSignalThreshold ?? 0).toFixed(2)} | ${automationConfig?.exitExecutionMode === "passive" ? "passive" : "active"}`,
        createdAt: now,
      });
    }
  }

  if (printWindowEnabled && positions.length > 0 && nowMinutes >= printStartMinutes) {
    intents.push({
      id: intentId(["close-all-print", nowMinutes >= printStartMinutes ? "armed" : "idle"]),
      ticker: "ALL",
      benchmark: "PRINT",
      side: "Long",
      intent: "CLOSE_ALL_PRINT",
      sequence: 0,
      priceRef: "PRINT",
      status: "QUEUED",
      reason: `close all remaining positions at ${automationConfig.printCloseTime}`,
      createdAt: now,
    });
  }

  return intents.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.intent.localeCompare(b.intent));
}

type UseMoneyEngineArgs = {
  enabled: boolean;
  ocrEnabled?: boolean;
  trackedSignalsEnabled?: boolean;
  initialAutoEnabled?: boolean;
  signalClass: string;
  ratingType: string | null | undefined;
  metric: "SigmaZap" | "ZapPct";
  ratingRule: { minRate: number; minTotal: number };
  tickersCsv?: string;
  minCorr?: number | null;
  maxCorr?: number | null;
  minBeta?: number | null;
  maxBeta?: number | null;
  minSigma?: number | null;
  maxSigma?: number | null;
  filterConfig: ArbitrageFilterConfigV1;
  exactSonarFilterSnapshot?: SonarExactFilterSnapshot;
  maxSpreadValue: unknown;
  automationConfig?: MoneyAutomationConfig;
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

export function useMoneyEngine({
  enabled,
  ocrEnabled = false,
  trackedSignalsEnabled = true,
  initialAutoEnabled = true,
  signalClass,
  ratingType,
  metric,
  ratingRule,
  tickersCsv,
  minCorr,
  maxCorr,
  minBeta,
  maxBeta,
  minSigma,
  maxSigma,
  filterConfig,
  exactSonarFilterSnapshot,
  maxSpreadValue,
  automationConfig,
  onUpdated,
  onError,
}: UseMoneyEngineArgs) {
  const STATUS_REFRESH_INTERVAL_MS = 2500;
  const AUTO_DISPATCH_COOLDOWN_MS = 15000;
  const SIGNAL_SURGE_GUARD_MIN_COUNT = 24;
  const SIGNAL_SURGE_GUARD_MULTIPLIER = 3;
  const SIGNAL_SURGE_GUARD_HOLD_MS = 10000;
  const SIGNAL_SURGE_GUARD_STABLE_TICKS = 2;
  const entryCutoffEnabled = hasStrategyEntryCutoff(signalClass);
  const actionLogStorageKey = moneyActionLogStorageKey(signalClass);
  const currentDayKey = localDayKey();
  const [moneyActionLog, setMoneyActionLog] = useState<MoneyActionLogEntry[]>(() => readMoneyActionLog(actionLogStorageKey));
  const [moneyPositions, setMoneyPositions] = useState<MoneyPosition[]>(() => buildMoneyPositionsFromActionLog(readMoneyActionLog(actionLogStorageKey), currentDayKey));
  const [moneyOrderIntents, setMoneyOrderIntents] = useState<MoneyOrderIntent[]>([]);
  const [moneySignalLatches, setMoneySignalLatches] = useState<MoneySignalLatch[]>([]);
  const [moneyAutoEnabled, setMoneyAutoEnabledState] = useState<boolean>(initialAutoEnabled);
  const [moneyEntryReadyCount, setMoneyEntryReadyCount] = useState<number>(0);
  const [moneySessionStartedAt, setMoneySessionStartedAt] = useState<number | null>(null);
  const [moneySessionStoppedAt, setMoneySessionStoppedAt] = useState<number | null>(null);
  const [moneySentOrdersCount, setMoneySentOrdersCount] = useState<number>(0);
  const [moneyManualExecutionBusy, setMoneyManualExecutionBusy] = useState<boolean>(false);
  const [executionRevision, setExecutionRevision] = useState(0);
  const dispatchedIntentIdsRef = useRef<Set<string>>(new Set());
  const dispatchedHedgeIntentIdsRef = useRef<Set<string>>(new Set());
  const recentDispatchAttemptsRef = useRef<Map<string, number>>(new Map());
  const pendingActionLogEntriesRef = useRef<Map<string, MoneyActionLogEntry[]>>(new Map());
  const moneyAutoEnabledRef = useRef<boolean>(initialAutoEnabled);
  const primaryStreamSignalsRef = useRef<ArbitrageSignal[]>([]);
  const trackedStreamSignalsRef = useRef<ArbitrageSignal[]>([]);
  const moneyActionLogRef = useRef<MoneyActionLogEntry[]>(moneyActionLog);
  const localRefreshTimerRef = useRef<number | null>(null);
  const moneyExecutionSnapshotRef = useRef<TradingAppExecutionSnapshot | null>(moneyExecutionStore.getSnapshot());
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
  const refreshRef = useRef<((options?: { refreshBridge?: boolean }) => Promise<void>) | null>(null);
  const onErrorRef = useRef<typeof onError>(onError);

  const setMoneyAutoEnabled = useCallback((nextValue: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof nextValue === "function" ? nextValue(moneyAutoEnabledRef.current) : nextValue;
    moneyAutoEnabledRef.current = resolved;
    setMoneyAutoEnabledState(resolved);
  }, []);

  const appendMoneyActionLogEntries = useCallback((entries: MoneyActionLogEntry[]) => {
    if (!entries.length) return;
    const nextLog = pruneMoneyActionLog([...moneyActionLogRef.current, ...entries], Date.now());
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
    moneyActionLogRef.current = nextLog;
    setMoneyActionLog(nextLog);
    setMoneyPositions((prev) => mergeMoneyPositionsWithActionLog(prev, nextLog, localDayKey()));
    setMoneyOrderIntents((prev) => prev.filter((intent) => {
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

    const confirmedEntries: MoneyActionLogEntry[] = [];
    const confirmedIntentIds: string[] = [];

    pendingActionLogEntriesRef.current.forEach((entries, intentId) => {
      if (!hasExecutionDispatchConfirmation(snapshot, intentId)) return;
      confirmedEntries.push(...entries);
      confirmedIntentIds.push(intentId);
    });

    if (!confirmedIntentIds.length) return;

    for (const intentId of confirmedIntentIds) {
      pendingActionLogEntriesRef.current.delete(intentId);
    }

    appendMoneyActionLogEntries(confirmedEntries);
  }, [appendMoneyActionLogEntries]);

  const queuePendingActionLogEntries = useCallback((intentId: string, entries: MoneyActionLogEntry[]) => {
    if (!intentId || !entries.length) return;
    pendingActionLogEntriesRef.current.set(intentId, entries);
    flushConfirmedPendingActionLogEntries(moneyExecutionSnapshotRef.current);
  }, [flushConfirmedPendingActionLogEntries]);

  useEffect(() => {
    return moneyExecutionStore.subscribe(() => {
      const snapshot = moneyExecutionStore.getSnapshot();
      moneyExecutionSnapshotRef.current = snapshot;
      flushConfirmedPendingActionLogEntries(snapshot);
      setExecutionRevision((prev) => prev + 1);
    });
  }, [flushConfirmedPendingActionLogEntries]);

  const openLoggedTickers = useMemo(
    () => buildOpenTickersFromActionLog(moneyActionLog, currentDayKey),
    [currentDayKey, moneyActionLog]
  );

  const snapshotTickers = exactSonarFilterSnapshot?.tickersFilterNorm?.trim() ?? "";
  const primarySignalsStreamUrl = useMemo(() => buildSignalsStreamUrl({
    cls: (exactSonarFilterSnapshot?.cls ?? signalClass) as any,
    type: (exactSonarFilterSnapshot?.type ?? ratingType ?? "any") as any,
    mode: (exactSonarFilterSnapshot?.mode ?? "all") as any,
    ratingMode: (exactSonarFilterSnapshot?.ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) as any,
    zapMode: (exactSonarFilterSnapshot?.zapMode ?? (metric === "SigmaZap" ? "sigma" : "zap")) as any,
    minRate: toNum(exactSonarFilterSnapshot?.minRate) ?? ratingRule.minRate,
    minTotal: toNum(exactSonarFilterSnapshot?.minTotal) ?? ratingRule.minTotal,
    tickers: snapshotTickers || tickersCsv || undefined,
    minCorr: toNum(exactSonarFilterSnapshot?.corrMin) ?? minCorr ?? undefined,
    maxCorr: toNum(exactSonarFilterSnapshot?.corrMax) ?? maxCorr ?? undefined,
    minBeta: toNum(exactSonarFilterSnapshot?.betaMin) ?? minBeta ?? undefined,
    maxBeta: toNum(exactSonarFilterSnapshot?.betaMax) ?? maxBeta ?? undefined,
    minSigma: toNum(exactSonarFilterSnapshot?.sigmaMin) ?? minSigma ?? undefined,
    maxSigma: toNum(exactSonarFilterSnapshot?.sigmaMax) ?? maxSigma ?? undefined,
    // Keep MONEY candidate coverage aligned with SONAR. Shared stream paging
    // happens before local client-only filters, so a smaller upstream limit
    // can hide otherwise matching rows.
    limit: 500,
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
    ratingRule.minRate,
    ratingRule.minTotal,
    ratingType,
    signalClass,
    snapshotTickers,
    tickersCsv,
  ]);

  const trackedSignalsStreamUrl = useMemo(() => {
    if (!trackedSignalsEnabled) return null;
    const activeTrackedTickers = Array.from(openLoggedTickers);
    if (!activeTrackedTickers.length) return null;
    return buildSignalsStreamUrl({
      cls: (exactSonarFilterSnapshot?.cls ?? signalClass) as any,
      type: (exactSonarFilterSnapshot?.type ?? ratingType ?? "any") as any,
      mode: (exactSonarFilterSnapshot?.mode ?? "all") as any,
      ratingMode: (exactSonarFilterSnapshot?.ratingMode ?? (metric === "SigmaZap" ? "BIN" : "SESSION")) as any,
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
    const restoredLog = readMoneyActionLog(actionLogStorageKey);
    moneyActionLogStore.clear();
    moneyDecisionStore.clear();
    moneyOrderIntentStore.clear();
    moneyPositionStore.clear();
    moneySignalStore.clear();
    moneyUpdatedAtStore.clear();
    actionLogVersionRef.current += 1;
    setMoneyActionLog(restoredLog);
    setMoneyPositions(buildMoneyPositionsFromActionLog(restoredLog, localDayKey()));
    setMoneySignalLatches([]);
    setMoneyOrderIntents([]);
    setMoneyEntryReadyCount(0);
    setMoneySessionStartedAt(null);
    setMoneySessionStoppedAt(null);
    setMoneySentOrdersCount(0);
    dispatchedIntentIdsRef.current.clear();
    dispatchedHedgeIntentIdsRef.current.clear();
    recentDispatchAttemptsRef.current.clear();
  }, [actionLogStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const next = pruneMoneyActionLog(moneyActionLog, Date.now());
      if (!next.length) {
        window.localStorage.removeItem(actionLogStorageKey);
        return;
      }
      window.localStorage.setItem(actionLogStorageKey, JSON.stringify(next));
    } catch {
      // ignore storage issues
    }
  }, [actionLogStorageKey, moneyActionLog]);

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
    setMoneyPositions((prev) => {
      return mergeMoneyPositionsWithActionLog(prev, moneyActionLog, currentDayKey);
    });
  }, [currentDayKey, moneyActionLog]);

  const refreshExecutionStatus = useCallback(async (force = false): Promise<TradingAppExecutionSnapshot | null> => {
    const now = Date.now();
    const currentExecutionSnapshot = moneyExecutionSnapshotRef.current;
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
        moneyExecutionSnapshotRef.current = snapshot;
        moneyExecutionStore.applySnapshot(snapshot);
      }
      return snapshot;
    } catch {
      // backend may be unavailable during frontend work
      return null;
    } finally {
      statusRefreshInFlightRef.current = false;
    }
  }, []);

  const bindMoneyActiveWindow = useCallback(async () => {
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

  const bindMoneyWindows = useCallback(async () => {
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

  const bindMoneyActiveWindowDelayed = useCallback(async (delayMs = 3000) => {
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

  const clearMoneyBoundWindow = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/bound-window"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    resetMoneyOcrStores();
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear bound window (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const captureMoneyTickerPoint = useCallback(async () => {
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

  const captureMoneyTickerPointDelayed = useCallback(async (delayMs = 3000) => {
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

  const clearMoneyTickerPoint = useCallback(async () => {
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

  const toggleMoneyPanicOff = useCallback(async (enabled: boolean) => {
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

  const clearMoneyExecutionQueue = useCallback(async () => {
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

  const resetMoneyAutomationState = useCallback(() => {
    setMoneySignalLatches([]);
    setMoneyPositions(buildMoneyPositionsFromActionLog(moneyActionLog, localDayKey()));
    setMoneyOrderIntents([]);
    setMoneySentOrdersCount(0);
    dispatchedIntentIdsRef.current.clear();
    dispatchedHedgeIntentIdsRef.current.clear();
    recentDispatchAttemptsRef.current.clear();
  }, [moneyActionLog]);

  const submitManualMoneyOrders = useCallback(async (tickersText: string, action: MoneyManualOrderAction) => {
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

    setMoneyManualExecutionBusy(true);
    try {
      for (const ticker of tickers) {
        const response = await fetch(tradingAppBridgeUrl("/queue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intentId: `manual|${action}|${ticker}|${Date.now()}`,
            ticker,
            type,
            source: "money-manual",
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
      setMoneyManualExecutionBusy(false);
    }
  }, [automationConfig?.queueDelayMaxSeconds, automationConfig?.queueDelayMinSeconds, refreshExecutionStatus]);

  const refresh = useCallback(async (options?: { refreshBridge?: boolean }) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
    const refreshActionLogVersion = actionLogVersionRef.current;
    const refreshBridge = options?.refreshBridge !== false;
    const normalizedByTicker = new Map(
      primaryStreamSignalsRef.current.map((row) => [row.ticker, row] as const)
    );

    for (const row of trackedStreamSignalsRef.current) {
      normalizedByTicker.set(row.ticker, row);
    }

    const normalizedMerged = Array.from(normalizedByTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const normalized = normalizedMerged;
    const executionSnapshot = refreshBridge
      ? await refreshExecutionStatus(false)
      : moneyExecutionSnapshotRef.current;
    const filtered = exactSonarFilterSnapshot
      ? applyExactSonarClientFilters(normalizedMerged, exactSonarFilterSnapshot)
      : applyArbitrageFilters(normalizedMerged, filterConfig) as ArbitrageSignal[];
    const bookSnapshot = moneyBookStore.getState().snapshot;
    const decisions = computeMoneyDecisionRows(
      filtered,
      maxSpreadValue,
      automationConfig,
      bookSnapshot
    );

    const autoEnabledNow =
      moneyAutoEnabledRef.current &&
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

    const nowMs = Date.now();
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

    const startAbsMin = Math.max(0, toNum(exactSonarFilterSnapshot?.zapShowAbs) ?? 0);
    const startAbsMaxRaw = toNum(exactSonarFilterSnapshot?.zapSilverAbs);
    const startAbsMax = startAbsMaxRaw != null && startAbsMaxRaw > 0 ? startAbsMaxRaw : null;
    const hasEntryWindowUpperBound = startAbsMax != null;

    const decisionsWithWindowGuard = decisions.map((row) => {
      if (row.status !== "ENTRY_READY") return row;
      const absSignal = Math.abs(row.signal ?? 0);
      if (absSignal < startAbsMin) {
        return { ...row, status: "HOLD" as const, reason: `entry guard: below start min ${startAbsMin.toFixed(2)}` };
      }
      if (hasEntryWindowUpperBound && startAbsMax != null && absSignal > startAbsMax) {
        return { ...row, status: "HOLD" as const, reason: `entry guard: above start max ${startAbsMax.toFixed(2)}` };
      }
      return row;
    });

    const displayDecisions = decisionsWithWindowGuard
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    const decisionsForAutomation = decisionsWithWindowGuard;
    const nextLatches = syncMoneySignalLatches(
      moneySignalLatches,
      decisionsForAutomation,
      autoEnabledNow,
      automationConfig,
      entryCutoffEnabled,
      primeImmediateEntriesRef.current
    );
    const positionsBaseline = mergeMoneyPositionsWithActionLog(moneyPositions, moneyActionLog, currentDayKey);
    const nextPositions = syncMoneyPositions(positionsBaseline, decisionsForAutomation, normalized, filtered, nextLatches, autoEnabledNow, maxSpreadValue, automationConfig, entryCutoffEnabled, openLoggedTickers);
    const intents = buildMoneyOrderIntents(decisionsForAutomation, nextPositions, autoEnabledNow, automationConfig, entryCutoffEnabled);
    primeImmediateEntriesRef.current = false;

    moneyDecisionStore.applySnapshot(displayDecisions);
    moneySignalStore.applySnapshot(filtered);
    moneyUpdatedAtStore.setValue(Date.now());

    startTransition(() => {
      setMoneyEntryReadyCount(displayDecisions.reduce((count, row) => row.status === "ENTRY_READY" ? count + 1 : count, 0));
      setMoneySignalLatches(nextLatches);
      if (actionLogVersionRef.current === refreshActionLogVersion) {
        setMoneyPositions(nextPositions);
        setMoneyOrderIntents(intents);
      }
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
    moneyActionLog,
    moneyPositions,
    moneySignalLatches,
    moneyAutoEnabled,
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

  useEffect(() => () => {
    if (localRefreshTimerRef.current != null) {
      window.clearTimeout(localRefreshTimerRef.current);
      localRefreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    moneyActionLogRef.current = moneyActionLog;
  }, [moneyActionLog]);

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
    moneyExecutionSnapshotRef.current = null;
    executionSnapshotSignatureRef.current = "";
    lastStatusRefreshAtRef.current = 0;
    pendingActionLogEntriesRef.current.clear();
    moneyExecutionStore.clear();
    resetMoneyOcrStores();
    moneyActionLogStore.clear();
    moneyDecisionStore.clear();
    moneyOrderIntentStore.clear();
    moneyPositionStore.clear();
    moneySignalStore.clear();
    moneyUpdatedAtStore.clear();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ocrEnabled) return;
    return connectMoneyOcrStream();
  }, [enabled, ocrEnabled]);

  useEffect(() => {
    if (!enabled || ocrEnabled) return;
    resetMoneyOcrStores();
  }, [enabled, ocrEnabled]);

  useEffect(() => {
    moneyPositionStore.applySnapshot(moneyPositions);
  }, [moneyPositions]);

  useEffect(() => {
    moneyOrderIntentStore.applySnapshot(moneyOrderIntents);
  }, [moneyOrderIntents]);

  useEffect(() => {
    if (!enabled) return;
    const strategyAutoRunning = moneyAutoEnabled && Boolean(automationConfig?.strategyModeEnabled);
    if (!strategyAutoRunning) {
      if (strategyAutoWasRunningRef.current) {
        setMoneySessionStoppedAt((prev) => prev ?? Date.now());
      }
      strategyAutoWasRunningRef.current = false;
      return;
    }

    if (!strategyAutoWasRunningRef.current) {
      primeImmediateEntriesRef.current = Math.max(0, automationConfig?.minHoldMinutes ?? 0) === 0;
      setMoneySessionStartedAt(Date.now());
      setMoneySessionStoppedAt(null);
      setMoneySentOrdersCount(0);
    }
    strategyAutoWasRunningRef.current = true;

    void refreshRef.current?.({ refreshBridge: true }).catch((error: any) => {
      onErrorRef.current?.(error?.message ?? String(error));
    });
  }, [automationConfig?.minHoldMinutes, automationConfig?.strategyModeEnabled, enabled, moneyAutoEnabled]);

  useEffect(() => {
    const activeQueuedIds = new Set(
      moneyOrderIntents
        .filter((intent) => intent.status === "QUEUED")
        .map((intent) => intent.id)
    );
    const activeQueuedHedgeIds = new Set(Array.from(activeQueuedIds, (id) => `${id}|benchmark`));

    dispatchedIntentIdsRef.current.forEach((id) => {
      if (!activeQueuedIds.has(id)) {
        dispatchedIntentIdsRef.current.delete(id);
      }
    });
    dispatchedHedgeIntentIdsRef.current.forEach((id) => {
      if (!activeQueuedHedgeIds.has(id)) {
        dispatchedHedgeIntentIdsRef.current.delete(id);
      }
    });

    const now = Date.now();
    recentDispatchAttemptsRef.current.forEach((timestamp, key) => {
      if (now - timestamp >= AUTO_DISPATCH_COOLDOWN_MS) {
        recentDispatchAttemptsRef.current.delete(key);
      }
    });
  }, [moneyOrderIntents]);

  useEffect(() => {
    if (!enabled || !moneyAutoEnabled) return;
    if (moneyExecutionSnapshotRef.current?.panicOff) return;

    const nowMinutes = currentMinutesLocal();
    const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
    const arkPrintLockActive =
      Boolean(automationConfig?.strategyModeEnabled) &&
      entryCutoffEnabled &&
      nowMinutes >= printStartMinutes;

    const queued = moneyOrderIntents.filter((intent) => {
      if (intent.status !== "QUEUED") return false;
      if (!arkPrintLockActive) return true;
      return intent.intent === "CLOSE_ALL_PRINT";
    });
    if (!queued.length) return;

    const abort = new AbortController();
    const positionByTicker = new Map(moneyPositions.map((row) => [row.ticker, row]));
    const openLoggedPositions = moneyPositions.filter((row) =>
      row.status !== "CLOSED" &&
      row.entryDispatchedAt != null &&
      openLoggedTickers.has(row.ticker)
    );

    const sendQueuedIntents = async () => {
      const sentDispatchKeys = new Set<string>();

      for (const intent of queued) {
        if (abort.signal.aborted) return;

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

        const correspondingDecision = getMoneyDecisionRow(intent.ticker);
        const correspondingPosition = positionByTicker.get(intent.ticker) ?? null;
        const actualPositionIsActive = openLoggedTickers.has(intent.ticker);

        if (!primaryAlreadyDispatched && isEntryIntent && intent.sequence <= 1 && actualPositionIsActive) {
          dispatchedIntentIdsRef.current.add(intent.id);
          continue;
        }

        const queueLeg = async (payload: {
          intentId: string;
          ticker: string;
          type: string;
          note: string;
        }) => {
          const response = await fetch(tradingAppBridgeUrl("/queue"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              source: "money-auto",
              delayMinMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMinSeconds ?? 0) * 1000)),
              delayMaxMs: Math.max(0, Math.trunc((automationConfig?.queueDelayMaxSeconds ?? 0) * 1000)),
            }),
            signal: abort.signal,
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
          await queueLegWithRetry({
            intentId: intent.id,
            ticker: intent.ticker,
            type,
            note: intent.reason,
          });
          setMoneySentOrdersCount((prev) => prev + 1);
          setMoneyPositions((prev) => prev.map((row) => {
            if (row.ticker !== intent.ticker) return row;
            return {
              ...row,
              status: isEntryIntent
                ? "OPEN"
                : intent.intent === "EXIT_LONG_PRINT" || intent.intent === "EXIT_SHORT_PRINT" || intent.intent === "CLOSE_ALL_PRINT"
                  ? "PRINT_PENDING"
                  : row.status,
              pendingIntent: isEntryIntent ? null : row.pendingIntent,
              entryDispatchedAt: row.entryDispatchedAt ?? dispatchAt,
              reason: isEntryIntent && row.lastConfirmedActiveAt == null
                ? "entry queued | recorded in action log"
                : row.reason,
              updatedAt: dispatchAt,
            };
          }));
          if (intent.intent === "CLOSE_ALL_PRINT") {
            queuePendingActionLogEntries(intent.id,
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
                }))
            );
          } else if (isEntryIntent && correspondingPosition) {
            const isAdd = correspondingPosition.entryCount > 1;
            const deviation = isAdd
              ? (correspondingPosition.lastScaleSignal ?? correspondingPosition.lastSignal ?? correspondingPosition.entrySignal)
              : (correspondingPosition.entrySignal ?? correspondingPosition.lastSignal);
            queuePendingActionLogEntries(intent.id, [{
              id: `${intent.ticker}|${isAdd ? "ADD" : "ENTRY"}|${dispatchAt}`,
              dayKey: localDayKey(),
              ticker: intent.ticker,
              benchmark: intent.benchmark,
              side: intent.side,
              kind: isAdd ? "ADD" : "ENTRY",
              deviation,
              at: dispatchAt,
              intent: intent.intent,
            }]);
          } else if (isExitIntent && correspondingPosition) {
            queuePendingActionLogEntries(intent.id, [{
              id: `${intent.ticker}|CLOSE|${dispatchAt}`,
              dayKey: localDayKey(),
              ticker: intent.ticker,
              benchmark: intent.benchmark,
              side: intent.side,
              kind: "CLOSE",
              deviation: correspondingPosition.lastSignal ?? correspondingPosition.entrySignal,
              at: dispatchAt,
              intent: intent.intent,
            }]);
          }
          dispatchedIntentIdsRef.current.add(intent.id);
          recentDispatchAttemptsRef.current.set(dispatchKey, Date.now());
          sentDispatchKeys.add(dispatchKey);
        }

        if (hedgeRequired && !hedgeAlreadyDispatched) {
          const benchmarkType =
            isEntryIntent
              ? (type === "EnterLongAggressive" ? "EnterShortAggressive" : "EnterLongAggressive")
              : type;

          // Hedge leg must follow every entry/add and every exit in hedged mode (1:1), without cooldown suppression.
          await queueLegWithRetry({
            intentId: hedgeIntentId,
            ticker: intent.benchmark,
            type: benchmarkType,
            note: `${intent.reason} | benchmark ${isExitIntent ? "hedge exit" : "hedge"}`,
          });
          setMoneySentOrdersCount((prev) => prev + 1);
          dispatchedHedgeIntentIdsRef.current.add(hedgeIntentId);
        }

        await refreshExecutionStatus(true);
      }
    };

    void sendQueuedIntents().catch((error: any) => {
      if (!abort.signal.aborted) {
        onError?.(error?.message ?? String(error));
      }
    });

    return () => abort.abort();
  }, [automationConfig, enabled, entryCutoffEnabled, executionRevision, moneyAutoEnabled, moneyOrderIntents, moneyPositions, onError, openLoggedTickers, queuePendingActionLogEntries, refreshExecutionStatus]);

  const todaysMoneyActionLog = useMemo(() => (
    moneyActionLog
      .filter((row) => row.dayKey === currentDayKey)
      .sort((a, b) => b.at - a.at)
  ), [currentDayKey, moneyActionLog]);

  useEffect(() => {
    moneyActionLogStore.applySnapshot(todaysMoneyActionLog);
  }, [todaysMoneyActionLog]);

  return {
    moneyEntryReadyCount,
    moneyPositions,
    moneyActionLog: todaysMoneyActionLog,
    moneyOrderIntents,
    moneyAutoEnabled,
    moneySessionStartedAt,
    moneySessionStoppedAt,
    moneySentOrdersCount,
    setMoneyAutoEnabled,
    moneyManualExecutionBusy,
    bindMoneyWindows,
    bindMoneyActiveWindow,
    bindMoneyActiveWindowDelayed,
    clearMoneyBoundWindow,
    captureMoneyTickerPoint,
    captureMoneyTickerPointDelayed,
    clearMoneyTickerPoint,
    toggleMoneyPanicOff,
    clearMoneyExecutionQueue,
    resetMoneyAutomationState,
    submitManualMoneyOrders,
    refresh,
  };
}
