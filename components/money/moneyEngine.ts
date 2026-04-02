"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyArbitrageFilters } from "../../lib/filters/arbitrageFilterEngine";
import type { ArbitrageFilterConfigV1 } from "../../lib/filters/arbitrageFilterConfigV1";
import { applyExactSonarClientFilters, buildSignalsUrl, normalizeSignal, type ArbitrageSignal, type SonarExactFilterSnapshot } from "../sonar/ArbitrageSonar";

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
  status: "OPEN" | "EXIT_BLOCKED" | "CLOSED" | "PRINT_PENDING";
  reason: string;
  entryCount: number;
  lockedForPrint: boolean;
  pendingIntent: MoneyOrderIntentType | null;
  openedAt: number;
  updatedAt: number;
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
  priceRef: "BID" | "ASK" | "PRINT";
  status: "QUEUED" | "BLOCKED";
  reason: string;
  createdAt: number;
};

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

function sanitizeBookSnapshot(snapshot: MarketMakerBookSnapshot): MarketMakerBookSnapshot {
  return {
    windowTitle: snapshot.windowTitle,
    capturedAtUtc: snapshot.capturedAtUtc,
    bestBid: snapshot.bestBid ?? null,
    bestAsk: snapshot.bestAsk ?? null,
    bidLevels: Array.isArray(snapshot.bidLevels) ? snapshot.bidLevels.slice(0, 5) : [],
    askLevels: Array.isArray(snapshot.askLevels) ? snapshot.askLevels.slice(0, 5) : [],
    ocrLines: [],
    ocrText: "",
  };
}

function sanitizeMainWindowSnapshot(snapshot: MainWindowDataSnapshot): MainWindowDataSnapshot {
  return {
    windowTitle: snapshot.windowTitle,
    capturedAtUtc: snapshot.capturedAtUtc,
    fields: Array.isArray(snapshot.fields)
      ? snapshot.fields
          .filter((field) => field && (field.heading || field.value))
          .map((field) => ({
            heading: String(field.heading ?? "").trim(),
            value: String(field.value ?? "").trim(),
            rawLine: String(field.rawLine ?? "").trim(),
          }))
      : [],
    controls: Array.isArray(snapshot.controls)
      ? snapshot.controls
          .filter((control) => control && control.label)
          .map((control) => ({
            label: String(control.label ?? "").trim().toUpperCase(),
            state: control.state === "GREEN" || control.state === "RED" ? control.state : "UNKNOWN",
          }))
      : [],
    ocrLines: Array.isArray(snapshot.ocrLines)
      ? snapshot.ocrLines
          .map((line) => String(line ?? "").trim())
          .filter((line) => line.length > 0)
      : [],
    ocrText: String(snapshot.ocrText ?? "").trim(),
  };
}

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
      anyRow?.positionBpAbs ??
      anyRow?.PositionBpAbs
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
  const minHoldMs = Math.max(0, automationConfig.minHoldMinutes ?? 0) * 60 * 1000;
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
  entryCutoffEnabled = true
): MoneyPosition[] {
  if (!autoEnabled) return prev;

  if (automationConfig?.strategyModeEnabled) {
    const spreadLimit = parseMoneySpreadLimit(maxSpreadValue);
    const POSITION_ACTIVATION_GRACE_MS = 8_000;
    const now = Date.now();
    const nowMinutes = currentMinutesLocal();
    const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
    const signalMap = new Map(allSignals.map((row) => [row.ticker, row]));
    const filteredSignalMap = new Map(filteredSignals.map((row) => [row.ticker, row]));
    const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));
    const next: MoneyPosition[] = [];
    const seen = new Set<string>();
    const endThreshold = Math.max(0, automationConfig.endSignalThreshold ?? 0);
    const minHoldMs = Math.max(0, automationConfig.minHoldMinutes ?? 0) * 60 * 1000;
    const passiveMode = automationConfig.exitExecutionMode === "passive";
    const maxOpenAllowed = entryCutoffEnabled
      ? (automationConfig.maxOpenPositions ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

    for (const existing of prev) {
      const raw = signalMap.get(existing.ticker);
      const currentAbs = signalAbs(raw);
      const currentSpread = signalSpread(raw) ?? existing.spread;
      const spreadBlocked = spreadLimit != null && currentSpread != null && currentSpread > spreadLimit;
      const holdBlocked = minHoldMs > 0 && now - existing.openedAt < minHoldMs;
      const activationGraceActive = now - existing.openedAt < POSITION_ACTIVATION_GRACE_MS;
      const positionIsActive = isActiveByPositionBp(raw);
      const inPrintWindow = entryCutoffEnabled && nowMinutes >= printStartMinutes;
      const stillAboveEnd = currentAbs != null && currentAbs >= endThreshold;
      const shouldNormalizeExit = !passiveMode && !stillAboveEnd;

      let status: MoneyPosition["status"] = existing.status;
      let reason = existing.reason;
      let pendingIntent: MoneyPosition["pendingIntent"] = null;
      let lockedForPrint = existing.lockedForPrint;
      let entryCount = existing.entryCount;
      let lastScaleSignal = existing.lastScaleSignal ?? existing.entrySignal;
      const decision = decisionMap.get(existing.ticker);

      if (!positionIsActive) {
        if (activationGraceActive) {
          status = "OPEN";
          reason = "awaiting PositionBp activation";
        } else {
          status = "CLOSED";
          reason = decision?.status === "ENTRY_READY"
            ? "entry was sent but PositionBp did not confirm activation"
            : "position not active (PositionBp=0), no entry signal";
        }
      } else if (inPrintWindow && passiveMode) {
        status = "PRINT_PENDING";
        reason = "09:20 print window active";
        if (!existing.lockedForPrint) {
          pendingIntent = existing.side === "Long" ? "EXIT_LONG_PRINT" : "EXIT_SHORT_PRINT";
          lockedForPrint = true;
        }
      } else if (shouldNormalizeExit) {
        if (spreadBlocked && automationConfig.noSpreadExit !== false) {
          status = "EXIT_BLOCKED";
          reason = "exit blocked by spread";
        } else if (holdBlocked) {
          status = "OPEN";
          reason = `min hold ${automationConfig.minHoldMinutes}m not reached`;
        } else {
          status = "CLOSED";
          reason = `signal below end threshold ${endThreshold.toFixed(2)}`;
          pendingIntent = existing.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE";
        }
      } else {
        status = "OPEN";
        reason = automationConfig.exitExecutionMode === "passive"
          ? "passive accumulation until 09:20"
          : "holding until end threshold breaks";

        if (!inPrintWindow && automationConfig.scaleMode === "scale_in" && entryCount - 1 < Math.max(0, automationConfig.maxAdds ?? 0)) {
          const filteredSignal = filteredSignalMap.get(existing.ticker);
          const filteredSigned = signalSigned(filteredSignal);
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
          const posActive = isActiveByPositionBp(filteredSignal) || isActiveByPositionBp(raw);
          if (filteredAbs != null && filteredAbs >= trigger && sameSign && posActive) {
            entryCount += 1;
            lastScaleSignal = filteredSigned;
            pendingIntent = existing.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE";
            reason = `scale-in add ${entryCount - 1}/${Math.max(0, automationConfig.maxAdds ?? 0)}`;
          }
        }
      }

      next.push({
        ...existing,
        lastSignal: currentAbs,
        lastScaleSignal,
        spread: currentSpread,
        status,
        reason,
        entryCount,
        lockedForPrint,
        pendingIntent,
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
      const currentAbs = signalAbs(raw);
      const currentSigned = signalSigned(raw);
      const currentSpread = signalSpread(raw);
      next.push({
        ticker: latch.ticker,
        benchmark: latch.benchmark,
        side: latch.side,
        entrySignal: currentSigned ?? currentAbs,
        lastSignal: currentSigned ?? currentAbs,
        lastScaleSignal: currentSigned ?? currentAbs,
        spread: currentSpread,
        status: "OPEN",
        reason: `entered after hold ${automationConfig.minHoldMinutes}m`,
        entryCount: 1,
        lockedForPrint: false,
        pendingIntent: latch.side === "Long" ? "ENTER_LONG_AGGRESSIVE" : "ENTER_SHORT_AGGRESSIVE",
        openedAt: now,
        updatedAt: now,
      });
      openCount += 1;
    }

    return next
      .filter((row) => row.status !== "CLOSED" || now - row.updatedAt < 15000)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  const spreadLimit = parseMoneySpreadLimit(maxSpreadValue);
  const now = Date.now();
  const nowMinutes = currentMinutesLocal();
  const printStartMinutes = parseTimeToMinutes(automationConfig?.printStartTime, 9 * 60 + 20);
  const printCloseMinutes = parseTimeToMinutes(automationConfig?.printCloseTime, 9 * 60 + 30);
  const printWindowEnabled = entryCutoffEnabled && automationConfig?.exitMode === "print";
  const maxOpenAllowed = entryCutoffEnabled
    ? (automationConfig?.maxOpenPositions ?? Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER;
  const decisionMap = new Map(decisions.map((row) => [row.ticker, row]));
  const next: MoneyPosition[] = [];
  const seen = new Set<string>();

  for (const existing of prev) {
    const current = decisionMap.get(existing.ticker);
    if (!current) {
      if (printWindowEnabled && nowMinutes < printCloseMinutes) {
        next.push({
          ...existing,
          openedAt: existing.openedAt,
          status: nowMinutes >= printStartMinutes ? "PRINT_PENDING" : "OPEN",
          reason: nowMinutes >= printStartMinutes ? "print order armed" : "holding for print window",
          updatedAt: now,
        });
        seen.add(existing.ticker);
        continue;
      }
      const blocked = existing.spread != null && spreadLimit != null && existing.spread > spreadLimit;
      next.push({
        ...existing,
        openedAt: existing.openedAt,
        status: blocked && automationConfig?.noSpreadExit !== false ? "EXIT_BLOCKED" : "CLOSED",
        reason: blocked && automationConfig?.noSpreadExit !== false ? "exit blocked by spread" : "signal cleared",
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
      updatedAt: now,
    });
    seen.add(existing.ticker);
  }

  let openCount = next.filter((row) => row.status === "OPEN").length;
  for (const row of decisions) {
    if (seen.has(row.ticker) || row.status !== "ENTRY_READY") continue;
    if (entryCutoffEnabled && nowMinutes >= printStartMinutes) continue;
    if (openCount >= maxOpenAllowed) continue;
    next.push({
      ticker: row.ticker,
      benchmark: row.benchmark,
      side: row.side,
      entrySignal: row.signal,
      lastSignal: row.signal,
      lastScaleSignal: row.signal,
      spread: row.spread,
      status: "OPEN",
      reason:
        `${automationConfig?.hedgeMode === "hedged" ? "auto-enter hedged" : "auto-enter unhedged"} | ${automationConfig?.sizingMode === "TIER" ? `tiers ${automationConfig?.sizeValue}` : `usd ${automationConfig?.sizeValue}`}${automationConfig?.scaleMode === "scale_in" ? ` | step ${automationConfig?.dilutionStep}` : ""}`,
      entryCount: 1,
      lockedForPrint: false,
      pendingIntent: null,
      openedAt: now,
      updatedAt: now,
    });
    openCount += 1;
  }

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
    for (const position of positions) {
      if (!position.pendingIntent) continue;
      const isEntryIntent =
        position.pendingIntent === "ENTER_LONG_AGGRESSIVE" ||
        position.pendingIntent === "ENTER_SHORT_AGGRESSIVE";
      if (entryCutoffEnabled && nowMinutes >= printStartMinutes && isEntryIntent) continue;
      intents.push({
        id: intentId([position.ticker, "strategy", position.pendingIntent, position.entryCount, nowMinutes >= printStartMinutes ? "print" : "live"]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.pendingIntent,
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
        priceRef: row.side === "Long" ? "ASK" : "BID",
        status: "BLOCKED",
        reason: row.reason,
        createdAt: now,
      });
    }
  }

  for (const position of positions) {
    const decision = decisionMap.get(position.ticker);
    if (position.status === "EXIT_BLOCKED") {
      intents.push({
        id: intentId([position.ticker, "exit-blocked", position.side]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE",
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
        priceRef: "PRINT",
        status: "QUEUED",
        reason: "print exit window active",
        createdAt: now,
      });
      continue;
    }

    if (!decision || (decision.status !== "ENTRY_READY" && !printWindowEnabled)) {
      const holdBlocked = automationConfig?.minHoldMinutes != null && automationConfig.minHoldMinutes > 0 && now - position.openedAt < automationConfig.minHoldMinutes * 60 * 1000;
      intents.push({
        id: intentId([position.ticker, "normalize-exit", position.side]),
        ticker: position.ticker,
        benchmark: position.benchmark,
        side: position.side,
        intent: position.side === "Long" ? "EXIT_LONG_AGGRESSIVE" : "EXIT_SHORT_AGGRESSIVE",
        priceRef: automationConfig?.exitExecutionMode === "passive" ? (position.side === "Long" ? "ASK" : "BID") : (position.side === "Long" ? "BID" : "ASK"),
        status: holdBlocked ? "BLOCKED" : "QUEUED",
        reason: holdBlocked ? `min hold ${automationConfig?.minHoldMinutes}m not reached` : `normalization exit | ${automationConfig?.exitExecutionMode === "passive" ? "passive" : "active"}`,
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

type TradingAppBookResponse = {
  ok?: boolean;
  snapshot?: MarketMakerBookSnapshot;
  error?: string;
};

type TradingAppMainWindowResponse = {
  ok?: boolean;
  snapshot?: MainWindowDataSnapshot;
  error?: string;
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
  const BOOK_REFRESH_INTERVAL_MS = 2500;
  const AUTO_DISPATCH_COOLDOWN_MS = 15000;
  const SIGNAL_SURGE_GUARD_MIN_COUNT = 24;
  const SIGNAL_SURGE_GUARD_MULTIPLIER = 3;
  const SIGNAL_SURGE_GUARD_HOLD_MS = 10000;
  const SIGNAL_SURGE_GUARD_STABLE_TICKS = 2;
  const entryCutoffEnabled = hasStrategyEntryCutoff(signalClass);
  const [moneySignals, setMoneySignals] = useState<ArbitrageSignal[]>([]);
  const [moneyDecisions, setMoneyDecisions] = useState<MoneyDecisionRow[]>([]);
  const [moneyPositions, setMoneyPositions] = useState<MoneyPosition[]>([]);
  const [moneyOrderIntents, setMoneyOrderIntents] = useState<MoneyOrderIntent[]>([]);
  const [moneySignalLatches, setMoneySignalLatches] = useState<MoneySignalLatch[]>([]);
  const [moneyAutoEnabled, setMoneyAutoEnabledState] = useState<boolean>(initialAutoEnabled);
  const [moneyExecutionSnapshot, setMoneyExecutionSnapshot] = useState<TradingAppExecutionSnapshot | null>(null);
  const [moneyBookSnapshot, setMoneyBookSnapshot] = useState<MarketMakerBookSnapshot | null>(null);
  const [moneyMainWindowSnapshot, setMoneyMainWindowSnapshot] = useState<MainWindowDataSnapshot | null>(null);
  const [moneyManualExecutionBusy, setMoneyManualExecutionBusy] = useState<boolean>(false);
  const dispatchedIntentIdsRef = useRef<Set<string>>(new Set());
  const recentDispatchAttemptsRef = useRef<Map<string, number>>(new Map());
  const moneyAutoEnabledRef = useRef<boolean>(initialAutoEnabled);
  const lastBookRefreshAtRef = useRef<number>(0);
  const lastMainWindowRefreshAtRef = useRef<number>(0);
  const refreshInFlightRef = useRef(false);
  const bookRefreshInFlightRef = useRef(false);
  const mainWindowRefreshInFlightRef = useRef(false);
  const prevFilteredCountRef = useRef<number>(0);
  const surgeGuardUntilRef = useRef<number>(0);
  const surgeGuardStableTicksRef = useRef<number>(0);
  const strategyAutoWasRunningRef = useRef<boolean>(false);
  const primeImmediateEntriesRef = useRef<boolean>(false);

  const setMoneyAutoEnabled = useCallback((nextValue: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof nextValue === "function" ? nextValue(moneyAutoEnabledRef.current) : nextValue;
    moneyAutoEnabledRef.current = resolved;
    setMoneyAutoEnabledState(resolved);
  }, []);

  const refreshExecutionStatus = useCallback(async (): Promise<TradingAppExecutionSnapshot | null> => {
    try {
      const response = await fetch(tradingAppBridgeUrl("/status"), { cache: "no-store" });
      if (!response.ok) return null;
      const json = await response.json();
      const snapshot = json as TradingAppExecutionSnapshot;
      setMoneyExecutionSnapshot(snapshot);
      return snapshot;
    } catch {
      // backend may be unavailable during frontend work
      return null;
    }
  }, []);

  const refreshBookSnapshot = useCallback(async (force = false): Promise<MarketMakerBookSnapshot | null> => {
    if (!force && !moneyExecutionSnapshot?.boundWindow?.isBound) {
      return null;
    }
    const now = Date.now();
    if (!force && moneyBookSnapshot && now - lastBookRefreshAtRef.current < BOOK_REFRESH_INTERVAL_MS) {
      return moneyBookSnapshot;
    }
    if (bookRefreshInFlightRef.current) {
      return moneyBookSnapshot;
    }

    try {
      bookRefreshInFlightRef.current = true;
      const response = await fetch(tradingAppBridgeUrl("/book"), { cache: "no-store" });
      const json = await response.json().catch(() => ({} as TradingAppBookResponse));
      if (!response.ok || json?.ok === false || !json?.snapshot) return null;
      const sanitized = sanitizeBookSnapshot(json.snapshot);
      lastBookRefreshAtRef.current = now;
      setMoneyBookSnapshot(sanitized);
      return sanitized;
    } catch {
      // backend may be unavailable during frontend work
      return null;
    } finally {
      bookRefreshInFlightRef.current = false;
    }
  }, [moneyBookSnapshot, moneyExecutionSnapshot?.boundWindow?.isBound]);

  const refreshMainWindowSnapshot = useCallback(async (force = false): Promise<MainWindowDataSnapshot | null> => {
    if (!force && !moneyExecutionSnapshot?.mainWindow?.isBound) {
      return null;
    }
    const now = Date.now();
    if (!force && moneyMainWindowSnapshot && now - lastMainWindowRefreshAtRef.current < BOOK_REFRESH_INTERVAL_MS) {
      return moneyMainWindowSnapshot;
    }
    if (mainWindowRefreshInFlightRef.current) {
      return moneyMainWindowSnapshot;
    }

    try {
      mainWindowRefreshInFlightRef.current = true;
      const response = await fetch(tradingAppBridgeUrl("/main-window-data"), { cache: "no-store" });
      const json = await response.json().catch(() => ({} as TradingAppMainWindowResponse));
      if (!response.ok || json?.ok === false || !json?.snapshot) return null;
      const sanitized = sanitizeMainWindowSnapshot(json.snapshot);
      lastMainWindowRefreshAtRef.current = now;
      setMoneyMainWindowSnapshot(sanitized);
      return sanitized;
    } catch {
      return null;
    } finally {
      mainWindowRefreshInFlightRef.current = false;
    }
  }, [moneyExecutionSnapshot?.mainWindow?.isBound, moneyMainWindowSnapshot]);

  const bindMoneyActiveWindow = useCallback(async () => {
    const response = await fetch(tradingAppBridgeUrl("/bind-active-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus();
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

    await refreshExecutionStatus();

    let nextBookSnapshot: MarketMakerBookSnapshot | null = null;
    let nextMainWindowSnapshot: MainWindowDataSnapshot | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await delay(180);
      }
      const [book, main] = await Promise.all([
        refreshBookSnapshot(true),
        refreshMainWindowSnapshot(true),
      ]);
      nextBookSnapshot = nextBookSnapshot ?? book;
      nextMainWindowSnapshot = nextMainWindowSnapshot ?? main;
      if (nextBookSnapshot && nextMainWindowSnapshot) {
        break;
      }
    }

    if (!nextBookSnapshot) {
      throw new Error("Market Maker window bound, but book data did not load after capture.");
    }
  }, [refreshBookSnapshot, refreshExecutionStatus, refreshMainWindowSnapshot]);

  const bindMoneyActiveWindowDelayed = useCallback(async (delayMs = 3000) => {
    const response = await fetch(`${tradingAppBridgeUrl("/bind-active-window-delayed")}?delayMs=${Math.max(250, Math.trunc(delayMs || 3000))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus();
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
    setMoneyBookSnapshot(null);
    setMoneyMainWindowSnapshot(null);
    lastBookRefreshAtRef.current = 0;
    lastMainWindowRefreshAtRef.current = 0;
    await refreshExecutionStatus();
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
    await refreshExecutionStatus();
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
    await refreshExecutionStatus();
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
    await refreshExecutionStatus();
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
    await refreshExecutionStatus();
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
    await refreshExecutionStatus();
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear TradingApp queue (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const resetMoneyAutomationState = useCallback(() => {
    setMoneySignalLatches([]);
    setMoneyPositions([]);
    setMoneyOrderIntents([]);
    dispatchedIntentIdsRef.current.clear();
    recentDispatchAttemptsRef.current.clear();
  }, []);

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

      await refreshExecutionStatus();
    } finally {
      setMoneyManualExecutionBusy(false);
    }
  }, [automationConfig?.queueDelayMaxSeconds, automationConfig?.queueDelayMinSeconds, refreshExecutionStatus]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
    const snapshotTickers = exactSonarFilterSnapshot?.tickersFilterNorm?.trim() ?? "";
    const url = buildSignalsUrl({
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
    });

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    const json = await response.json();
    const rawItems: any[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
    const normalized = rawItems.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
    const filtered = exactSonarFilterSnapshot
      ? applyExactSonarClientFilters(normalized, exactSonarFilterSnapshot)
      : applyArbitrageFilters(normalized, filterConfig) as ArbitrageSignal[];
    const [bookSnapshot] = await Promise.all([
      refreshBookSnapshot(false),
      refreshMainWindowSnapshot(false),
    ]);
    const decisions = computeMoneyDecisionRows(
      filtered,
      maxSpreadValue,
      automationConfig,
      bookSnapshot ?? moneyBookSnapshot
    );

    const autoEnabledNow = moneyAutoEnabledRef.current;
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

    const decisionsForAutomation = decisionsWithWindowGuard;
    const nextLatches = syncMoneySignalLatches(
      moneySignalLatches,
      decisionsForAutomation,
      autoEnabledNow,
      automationConfig,
      entryCutoffEnabled,
      primeImmediateEntriesRef.current
    );
    const nextPositions = syncMoneyPositions(moneyPositions, decisionsForAutomation, normalized, filtered, nextLatches, autoEnabledNow, maxSpreadValue, automationConfig, entryCutoffEnabled);
    const intents = buildMoneyOrderIntents(decisionsForAutomation, nextPositions, autoEnabledNow, automationConfig, entryCutoffEnabled);
    primeImmediateEntriesRef.current = false;

    setMoneySignals(filtered);
    setMoneyDecisions(decisionsWithWindowGuard);
    setMoneySignalLatches(nextLatches);
    setMoneyPositions(nextPositions);
    setMoneyOrderIntents(intents);
    await refreshExecutionStatus();
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
    moneyPositions,
    moneySignalLatches,
    moneyAutoEnabled,
    moneyBookSnapshot,
    refreshMainWindowSnapshot,
    onError,
    onUpdated,
    refreshBookSnapshot,
    refreshExecutionStatus,
    ratingRule.minRate,
    ratingRule.minTotal,
    ratingType,
    signalClass,
    tickersCsv,
  ]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await refresh();
      } catch (error: any) {
        if (!cancelled) onError?.(error?.message ?? String(error));
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, onError, refresh]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tickBook = async () => {
      if (cancelled) return;
      try {
        await refreshBookSnapshot(false);
      } catch {
        // ignore book refresh errors in background cycle
      }
    };

    void tickBook();
    const timer = window.setInterval(() => {
      void tickBook();
    }, BOOK_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, refreshBookSnapshot]);

  useEffect(() => {
    if (!enabled) return;

    if (!moneyExecutionSnapshot?.boundWindow?.isBound && moneyBookSnapshot) {
      setMoneyBookSnapshot(null);
      lastBookRefreshAtRef.current = 0;
    }

    if (!moneyExecutionSnapshot?.mainWindow?.isBound && moneyMainWindowSnapshot) {
      setMoneyMainWindowSnapshot(null);
      lastMainWindowRefreshAtRef.current = 0;
    }
  }, [
    enabled,
    moneyBookSnapshot,
    moneyExecutionSnapshot?.boundWindow?.isBound,
    moneyExecutionSnapshot?.mainWindow?.isBound,
    moneyMainWindowSnapshot,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const strategyAutoRunning = moneyAutoEnabled && Boolean(automationConfig?.strategyModeEnabled);
    if (!strategyAutoRunning) {
      strategyAutoWasRunningRef.current = false;
      return;
    }

    if (!strategyAutoWasRunningRef.current) {
      primeImmediateEntriesRef.current = Math.max(0, automationConfig?.minHoldMinutes ?? 0) === 0;
    }
    strategyAutoWasRunningRef.current = true;

    void refresh().catch((error: any) => {
      onError?.(error?.message ?? String(error));
    });
  }, [automationConfig?.strategyModeEnabled, enabled, moneyAutoEnabled, onError, refresh]);

  useEffect(() => {
    const activeQueuedIds = new Set(
      moneyOrderIntents
        .filter((intent) => intent.status === "QUEUED" && intent.intent !== "CLOSE_ALL_PRINT")
        .map((intent) => intent.id)
    );

    dispatchedIntentIdsRef.current.forEach((id) => {
      if (!activeQueuedIds.has(id)) {
        dispatchedIntentIdsRef.current.delete(id);
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
    if (moneyExecutionSnapshot?.panicOff) return;

    const queued = moneyOrderIntents.filter((intent) => intent.status === "QUEUED" && intent.intent !== "CLOSE_ALL_PRINT");
    if (!queued.length) return;

    const abort = new AbortController();

    const sendQueuedIntents = async () => {
      const sentBatchKeys = new Set<string>();

      for (const intent of queued) {
        if (abort.signal.aborted) return;
        if (dispatchedIntentIdsRef.current.has(intent.id)) continue;

        const type =
          intent.intent === "ENTER_LONG_AGGRESSIVE" ? "EnterLongAggressive"
            : intent.intent === "ENTER_SHORT_AGGRESSIVE" ? "EnterShortAggressive"
              : intent.intent === "EXIT_LONG_AGGRESSIVE" || intent.intent === "EXIT_SHORT_AGGRESSIVE" ? "ExitActive"
                : intent.intent === "EXIT_LONG_PRINT" || intent.intent === "EXIT_SHORT_PRINT" ? "ExitPrint"
                  : null;

        if (!type) continue;

        const batchKey = `${intent.ticker}|${type}`;
        if (sentBatchKeys.has(batchKey)) continue;
        const lastAttemptAt = recentDispatchAttemptsRef.current.get(batchKey) ?? 0;
        if (Date.now() - lastAttemptAt < AUTO_DISPATCH_COOLDOWN_MS) continue;

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

        await queueLegWithRetry({
          intentId: intent.id,
          ticker: intent.ticker,
          type,
          note: intent.reason,
        });
        recentDispatchAttemptsRef.current.set(batchKey, Date.now());
        sentBatchKeys.add(batchKey);

        const isEntryIntent =
          intent.intent === "ENTER_LONG_AGGRESSIVE" ||
          intent.intent === "ENTER_SHORT_AGGRESSIVE";

        if (
          isEntryIntent &&
          automationConfig?.hedgeMode === "hedged" &&
          intent.benchmark &&
          intent.benchmark !== "UNKNOWN" &&
          intent.benchmark !== "PRINT" &&
          intent.benchmark !== intent.ticker
        ) {
          const benchmarkType =
            type === "EnterLongAggressive" ? "EnterShortAggressive"
              : type === "EnterShortAggressive" ? "EnterLongAggressive"
                : type;

          // Hedge leg must follow every entry leg in hedged mode (1:1), without cooldown suppression.
          await queueLegWithRetry({
            intentId: `${intent.id}|benchmark`,
            ticker: intent.benchmark,
            type: benchmarkType,
            note: `${intent.reason} | benchmark hedge`,
          });
        }

        dispatchedIntentIdsRef.current.add(intent.id);
        await refreshExecutionStatus();
      }
    };

    void sendQueuedIntents().catch((error: any) => {
      if (!abort.signal.aborted) {
        onError?.(error?.message ?? String(error));
      }
    });

    return () => abort.abort();
  }, [automationConfig, enabled, moneyAutoEnabled, moneyExecutionSnapshot, moneyOrderIntents, onError, refreshExecutionStatus]);

  return {
    moneySignals,
    moneyDecisions,
    moneyPositions,
    moneyOrderIntents,
    moneyAutoEnabled,
    setMoneyAutoEnabled,
    moneyExecutionSnapshot,
    moneyBookSnapshot,
    moneyMainWindowSnapshot,
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
