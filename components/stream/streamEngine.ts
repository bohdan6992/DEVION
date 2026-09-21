"use client";

/**
 * The browser side of a Stream: it DRAWS what the bridge says, and holds the operator's manual
 * controls. It screens nothing, decides nothing and sends nothing.
 *
 * Everything a Stream page lists is computed on the bridge, once, for every viewer:
 *   - the candidate list (filters, each strategy's gate, spread/edge screen) — GET /api/stream/screen/{strategy};
 *   - open positions and the recent orders — GET /api/stream/caesar/positions and /engine.
 * Every entry, add and exit is decided and dispatched there too, once a minute, on the same
 * start-of-minute readings the tape records.
 *
 * This file used to run its own copy of all of it in every open tab: a live SSE feed of thousands of
 * rows re-parsed and re-filtered every second, per-strategy gates, decision rules, latches, position
 * sync, an order queue and an arbiter registration. The copy was not harmless — the bridge stands
 * down while any tab holds dispatch ownership — and it was the single biggest cost of leaving a
 * Stream page open.
 *
 * What is left is timers that fetch three small JSON documents while the page is visible, plus the
 * operator's controls: bind windows, book reading, panic, start/stop, the queue, manual orders.
 */

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { bridgeUrl, fetchWithTimeout } from "../../lib/bridgeBase";
import type { ArbitrageFilterConfigV1 } from "../../lib/filters/arbitrageFilterConfigV1";
import { streamExecutionStore } from "./streamExecutionStore";
import { useStreamInstance, type StreamInstance } from "./streamInstance";
import { connectStreamOcrFeed } from "./streamOcrFeed";
import { resetStreamOcrStores } from "./streamOcrStores";
import { getStreamStores } from "./streamStoreRegistry";
import { acquireSharedStreamStores, releaseSharedStreamStores, hasOtherSharedStreamUsers } from "./streamSharedStores";

export type StreamDecisionStatus = "ENTRY_READY" | "HOLD" | "EXIT_READY" | "EXIT_BLOCKED" | "BLOCKED_SPREAD" | "BLOCKED_EDGE";

export type StreamDecisionRow = {
  ticker: string;
  benchmark: string;
  /**
   * The situation this row is one leg of, for strategies that trade more than one ticker at a
   * time. null for every single-ticker strategy. Legs sharing a key are judged together — see
   * reconcilePairedDecisions.
   */
  pairKey: string | null;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  spreadBidPct: number | null;
  safePrice: number | null;
  netEdge: number | null;
  positionBp: number | null;
  /** Raw B5-style Report value: "NO", "10/08 BMO", or a MMDDHHMM-ish code. Display only. */
  report: string | null;
  status: StreamDecisionStatus;
  reason: string;
  updatedAt: number;
};

export type StreamPosition = {
  ticker: string;
  /** The situation this position belongs to; null for single-ticker strategies. See legIdentityOf. */
  pairKey?: string | null;
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
  // Minute index at which the signal FIRST dropped below endSignalThreshold on this unbroken
  // streak (null when not currently below). Used to count belowThresholdTicks in whole minute
  // boundaries crossed, not poll ticks — see syncStreamPositions.
  belowThresholdSinceMinuteIdx?: number | null;
  lockedForPrint: boolean;
  pendingIntent: StreamOrderIntentType | null;
  entryDispatchedAt: number | null;
  lastDispatchedAt: number | null;
  lastConfirmedActiveAt: number | null;
  lastAboveAddCapAt: number | null;  // last time add signal exceeded ADD_MAX_SIGMA (resets add delay)
  openedAt: number;
  updatedAt: number;
  // ADD trigger bar value: addPeakAbs/addPeakSigned track the latest live poll within the
  // in-progress minute (continuously updated). confirmedAddAbs/confirmedAddSigned only
  // update once a minute boundary is crossed, to that minute's LAST observed value — i.e.
  // the value at the close of a fully-completed minute — mirroring SCANNER's bar-close
  // (only available for the following minute's evaluation) and the same hold-to-boundary
  // requirement already used for new entries (aboveSet): a trigger crossing must still be
  // true at its minute's close, not just at whichever poll first noticed it, before an add
  // can fire. The trigger check and lastScaleSignal anchor both read the CONFIRMED value.
  addPeakMinuteIdx?: number | null;
  addPeakAbs?: number | null;
  addPeakSigned?: number | null;
  confirmedAddAbs?: number | null;
  confirmedAddSigned?: number | null;
  // σ trigger threshold that armed the currently-pending add (captured at decision time in
  // syncStreamPositions, where `trigger` is exact) — read at dispatch time for logging instead
  // of recomputing, since lastScaleSignal is already overwritten to the new value by then.
  pendingAddTrigger?: number | null;
};

export type StreamActionLogKind = "ENTRY" | "ADD" | "CLOSE";

export type StreamActionLogEntry = {
  id: string;
  dayKey: string;
  ticker: string;
  /**
   * The situation this order belonged to; absent for single-ticker strategies and for entries
   * written before pairs existed. Without it a reload cannot tell three simultaneous FMTM pairs
   * apart, and the restore would collapse them into one position.
   */
  pairKey?: string | null;
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
  /** The situation this order belongs to; null for single-ticker strategies. See legIdentityOf. */
  pairKey?: string | null;
  benchmark: string;
  side: "Long" | "Short";
  intent: StreamOrderIntentType;
  sequence: number;
  priceRef: "BID" | "ASK" | "PRINT";
  status: "QUEUED" | "BLOCKED";
  reason: string;
  createdAt: number;
};

/**
 * What makes a situation distinct.
 *
 * For every single-ticker strategy this is just the ticker, and every map keyed by it behaves
 * exactly as before. For a strategy that can hold one ticker in several situations at once it is
 * (ticker, pairKey): SFNC sold against AUB and SFNC sold against FIBK are two positions that open,
 * add and close independently, and keying them by "SFNC" alone would silently collapse them into
 * one — the second dispatch deduped away, the second exit never sent.
 *
 * The TICKER ITSELF IS UNCHANGED. It is still the real symbol everywhere it leaves the engine —
 * the order, the bridge lease, the position table — because that is what it is. Only the internal
 * bookkeeping gains the second dimension.
 */
function legIdentityOf(row: { ticker: string; pairKey?: string | null }): string {
  return row.pairKey ? `${row.ticker}|${row.pairKey}` : row.ticker;
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
  note?: string | null;
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
  exitMode: "normalize" | "print";
  printStartTime: string;
  printCloseTime: string;
  noSpreadExit: boolean;
  betaMode: boolean;
  /**
   * Time-of-day (HH:MM, NY) at which the session-end hotkey fires — Arbitrage's Ctrl+Q -> Ctrl+O
   * pair, or OpenDoor's Ctrl+E. This is the CLOSE moment.
   */
  startCutoffTime: string;
  /**
   * Time-of-day (HH:MM, NY) after which NEW entries stop being taken, when that has to happen
   * BEFORE the close.
   *
   * OpenDoor needs the two separated: entries fire around 09:20 and the queue needs a few minutes
   * to flush, so dispatch runs until ~09:25 and everything is closed later at CUTOFF (e.g. 10:00).
   * Left undefined, entries stop at startCutoffTime — the original single-time behaviour, which is
   * what Arbitrage still uses.
   */
  entryStopTime?: string;
  /**
   * PRE session only: time-of-day (HH:MM, local) within the 21:00-09:30 window at which
   * position-taking actually begins. Defaults to 21:00 (the window's own start); e.g. "00:00"
   * skips the whole 21:00-23:59 evening portion and only goes live at midnight.
   */
  preStartTime: string;
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
  /** "off" leaves the zap gate out of the V1 config entirely — the caller's threshold is in a unit
   *  this engine cannot read (gamma, alpha), so it must not cut on the raw column instead. */
  zapMode: "sigma" | "zap" | "off";
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

export function parseTimeToMinutes(value: string | undefined, fallbackMinutes: number): number {
  if (!value) return fallbackMinutes;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallbackMinutes;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallbackMinutes;
  return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
}

function nyMinutesAt(timestamp: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(timestamp));
    const hh = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
    }
  } catch {
    // Fallback to local clock if Intl/timezone support is unavailable.
  }
  const at = new Date(timestamp);
  return at.getHours() * 60 + at.getMinutes();
}

export function currentMinutesLocal(): number {
  return nyMinutesAt(Date.now());
}

const PRE_SESSION_START_MINUTES = 21 * 60; // 1260 (21:00)
const PRE_SESSION_END_MINUTES = 9 * 60 + 30; // 570 (09:30, next-day continuation)

// Maps a wall-clock minute-of-day onto PRE's own axis (mirrors Scanner's
// TapeArbClasses.ResolvePrePhysical convention): negative for the 21:00-23:59 evening portion,
// non-negative for the 00:00-09:30 morning portion, null if outside the PRE window entirely
// (09:31-20:59 dead zone).
export function toPreRelativeMinutes(clockMinutes: number): number | null {
  if (clockMinutes >= PRE_SESSION_START_MINUTES) return clockMinutes - 1440;
  if (clockMinutes <= PRE_SESSION_END_MINUTES) return clockMinutes;
  return null;
}

// For a same-day window (start <= cutoff, e.g. START=04:00/CUTOFF=09:00), "past cutoff"
// is a plain nowMinutes>=cutoff comparison — true for the rest of the day too, which is
// harmless since there's no later same-day start to protect. For a WRAPPING window (start >
// cutoff, e.g. START=23:00/CUTOFF=09:00 next day), that same plain comparison would go
// permanently true the instant nowMinutes reaches cutoff and stay true through the evening's
// own start too, immediately force-closing/blocking a session that just began — so for a
// wrapping window, "past cutoff" only applies to the tail/morning portion (before the next
// start), never the evening portion right after start.
// wrapStartMinutes: the session's own configured START, used only to detect wraparound
// (wrapStartMinutes > cutoffMinutes) — pass null/omit for a window known to never wrap.
//
// PRE no longer gets a branch of its own here: it wraps exactly like any other START>CUTOFF
// window, so the generic wrap logic already covers it. See getStrategySessionStartMinutes.
export function isPastSessionCutoff(
  nowMinutes: number,
  cutoffMinutes: number,
  wrapStartMinutes: number | null = null
): boolean {
  if (wrapStartMinutes != null && wrapStartMinutes > cutoffMinutes) {
    return nowMinutes < wrapStartMinutes && nowMinutes >= cutoffMinutes;
  }
  return nowMinutes >= cutoffMinutes;
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


type UseStreamEngineArgs = {
  /**
   * Which strategy's screen to draw: arbitrage, pairflux, opendoor, daytwo, openfade or openride.
   * Omitted, it is the instance's own bridge id without its "stream." prefix.
   */
  screenKey?: string;
  /**
   * Which order type a MANUAL entry fires, per side. The bridge derives the hotkey solely from the
   * type — see TradingAppActionResolver — so a strategy with its own key pair must say so here or a
   * manual order goes out on the wrong key.
   */
  entryIntentTypes?: { long: string; short: string };
  /**
   * Identity of this strategy instance. Several instances run in parallel, so every store is
   * namespaced by this. Omit only in single-instance legacy usage.
   */
  instance?: StreamInstance;
  enabled: boolean;
  ocrEnabled?: boolean;
  initialAutoEnabled?: boolean;
  signalClass: string;
  automationConfig?: StreamAutomationConfig;
  onUpdated?: () => void;
  onError?: (message: string | null) => void;
};

// The bridge's own records, as its read endpoints serialise them.
type BridgeScreenRow = {
  ticker: string;
  benchmark?: string | null;
  pairKey?: string | null;
  side: string;
  signal?: number | null;
  spread?: number | null;
  spreadBidPct?: number | null;
  safePrice?: number | null;
  netEdge?: number | null;
  status: string;
  reason?: string | null;
  report?: string | null;
};

type BridgePosition = {
  strategyId: string;
  ticker: string;
  pairKey?: string | null;
  side: string;
  entryDispatched?: boolean;
  entrySignal?: number | null;
  entryCount?: number;
  openedAtUtc?: string;
  lastReason?: string | null;
  lastSignal?: number | null;
  lastSpread?: number | null;
};

type BridgeIntent = {
  atUtc: string;
  strategyId: string;
  ticker: string;
  action: string;
  side?: string | null;
  reason?: string | null;
  dispatched: boolean;
  outcome?: string | null;
};

type BridgeState = {
  positions: BridgePosition[];
  intents: BridgeIntent[];
  fetchedAt: number;
};

/** How often the candidate list is re-read while the page is visible. The bridge caches it for ~1.5 s. */
const SCREEN_POLL_MS = 2000;
/** How often the tab asks the bridge what it holds and what it sent. Nothing here is time critical. */
const BRIDGE_STATE_POLL_MS = 4000;
/** How often the TradingApp queue / panic flag is re-read while the page is visible. */
const EXECUTION_STATUS_POLL_MS = 3000;
/** A refused or arbitrated order stays on the "blocked" list this long. */
const BLOCKED_INTENT_WINDOW_MS = 10 * 60_000;
/** The bridge keeps a rolling window of recent orders; anything older than a session is not "today". */
const ACTION_LOG_WINDOW_MS = 20 * 60 * 60_000;

function pageIsHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function localDayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sideOf(value: string | null | undefined): "Long" | "Short" {
  return String(value ?? "").trim().toLowerCase().startsWith("s") ? "Short" : "Long";
}

function decisionStatusOf(value: string): StreamDecisionStatus {
  switch (value) {
    case "BLOCKED_SPREAD":
    case "BLOCKED_EDGE":
    case "HOLD":
    case "EXIT_READY":
    case "EXIT_BLOCKED":
      return value;
    default:
      return "ENTRY_READY";
  }
}

/** Bridge intent record -> the row the action log / blocked list shows. Null for actions we do not draw. */
function intentTypeOf(action: string, side: "Long" | "Short"): StreamOrderIntentType | null {
  const a = action.trim().toLowerCase();
  if (a === "entry" || a === "add") return side === "Short" ? "ENTER_SHORT_AGGRESSIVE" : "ENTER_LONG_AGGRESSIVE";
  if (a === "exit") return side === "Short" ? "EXIT_SHORT_AGGRESSIVE" : "EXIT_LONG_AGGRESSIVE";
  return null;
}

type TradingAppBoundWindowResponse = {
  ok?: boolean;
  bound?: TradingAppBoundWindowInfo | null;
  error?: string;
};

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


export function useStreamEngine({
  screenKey,
  entryIntentTypes,
  instance,
  enabled,
  ocrEnabled = false,
  initialAutoEnabled = true,
  signalClass,
  automationConfig,
  onUpdated,
  onError,
}: UseStreamEngineArgs) {
  // --- instance scoping ----------------------------------------------------
  // Falls back to the historical single-instance identity so call sites that do not pass an
  // instance keep their current store keys.
  const contextInstance = useStreamInstance();
  const resolvedInstance = instance ?? contextInstance;
  const instanceId = resolvedInstance.instanceId;
  const strategyId = resolvedInstance.strategyId;
  const resolvedScreenKey = (screenKey ?? strategyId.replace(/^stream\./i, "")).split(".")[0].toLowerCase();
  const stores = getStreamStores(instanceId);
  const {
    actionLog: streamActionLogStore,
    decision: streamDecisionStore,
    orderIntent: streamOrderIntentStore,
    position: streamPositionStore,
    signal: streamSignalStore,
    updatedAt: streamUpdatedAtStore,
    filterPassLog: streamFilterPassLogStore,
  } = stores;

  // What the bridge says it holds and sent — mirrored into React state for the callers that read
  // the hook's return value; the tables themselves read the stores.
  const [streamActionLog, setStreamActionLog] = useState<StreamActionLogEntry[]>([]);
  const [streamPositions, setStreamPositions] = useState<StreamPosition[]>([]);
  const [streamOrderIntents, setStreamOrderIntents] = useState<StreamOrderIntent[]>([]);
  const [streamAutoEnabled, setStreamAutoEnabledState] = useState<boolean>(initialAutoEnabled);
  const [streamEntryReadyCount, setStreamEntryReadyCount] = useState<number>(0);
  const [streamSessionStartedAt, setStreamSessionStartedAt] = useState<number | null>(null);
  const [streamSessionStoppedAt, setStreamSessionStoppedAt] = useState<number | null>(null);
  const [streamSentOrdersCount, setStreamSentOrdersCount] = useState<number>(0);
  const [streamManualExecutionBusy, setStreamManualExecutionBusy] = useState<boolean>(false);

  const streamAutoEnabledRef = useRef<boolean>(initialAutoEnabled);
  const streamExecutionSnapshotRef = useRef<TradingAppExecutionSnapshot | null>(streamExecutionStore.getSnapshot());
  const executionSnapshotSignatureRef = useRef<string>("");
  const lastStatusRefreshAtRef = useRef<number>(0);
  const statusRefreshInFlightRef = useRef(false);
  const onErrorRef = useRef<typeof onError>(onError);
  const onUpdatedRef = useRef<typeof onUpdated>(onUpdated);
  const strategyAutoWasRunningRef = useRef<boolean>(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  // Tickers|legs the operator dismissed from the tables. Display only: the bridge keeps tracking
  // a position until the account is flat, whatever this page hides.
  const dismissedTickersRef = useRef<Set<string>>(new Set());
  // Benchmark per listed ticker, so a position row can name its benchmark while it is held (the
  // candidate list no longer carries a ticker once the book does).
  const benchmarkByTickerRef = useRef<Map<string, string>>(new Map());
  const bridgeStateRef = useRef<BridgeState | null>(null);
  const bridgePollInFlightRef = useRef(false);
  const screenPollInFlightRef = useRef(false);
  const publishedRef = useRef({ positions: "", log: "", intents: "" });

  const setStreamAutoEnabled = useCallback((nextValue: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof nextValue === "function" ? nextValue(streamAutoEnabledRef.current) : nextValue;
    streamAutoEnabledRef.current = resolved;
    setStreamAutoEnabledState(resolved);
  }, []);

  // ── THE CANDIDATE LIST ──────────────────────────────────────────────────────────────────────
  // One small document, computed on the bridge from the SAME rows and the SAME screen the engine
  // decides on. Nothing is filtered or judged here.
  const pollScreen = useCallback(async () => {
    if (screenPollInFlightRef.current) return;
    screenPollInFlightRef.current = true;
    try {
      const response = await fetchWithTimeout(bridgeUrl(`/api/stream/screen/${encodeURIComponent(resolvedScreenKey)}`), { cache: "no-store" });
      if (!response.ok) {
        onErrorRef.current?.(`candidate list unavailable (${response.status})`);
        return;
      }
      const json = await response.json().catch(() => null);
      const screen = json?.screen;
      if (!screen) return;

      const asOf = Date.parse(String(screen.asOfUtc ?? "")) || Date.now();
      const rows: StreamDecisionRow[] = (Array.isArray(screen.rows) ? (screen.rows as BridgeScreenRow[]) : []).map((row) => ({
        ticker: String(row.ticker ?? "").toUpperCase(),
        benchmark: String(row.benchmark ?? "UNKNOWN"),
        pairKey: row.pairKey ?? null,
        side: sideOf(row.side),
        signal: toNum(row.signal),
        spread: toNum(row.spread),
        spreadBidPct: toNum(row.spreadBidPct),
        safePrice: toNum(row.safePrice),
        netEdge: toNum(row.netEdge),
        positionBp: null,
        report: row.report ?? null,
        status: decisionStatusOf(String(row.status ?? "")),
        reason: String(row.reason ?? ""),
        updatedAt: asOf,
      }));

      const benchmarks = new Map<string, string>();
      for (const row of rows) benchmarks.set(row.ticker, row.benchmark);
      benchmarkByTickerRef.current = benchmarks;

      const changed = streamDecisionStore.applySnapshot(rows);
      streamSignalStore.applyMeta({
        totalCount: rows.length,
        countries: Array.isArray(screen.countries) ? screen.countries : [],
        exchanges: Array.isArray(screen.exchanges) ? screen.exchanges : [],
        sectors: Array.isArray(screen.sectors) ? screen.sectors : [],
      });
      // The UPDATED indicator moves only when a visible row actually changed.
      if (changed) streamUpdatedAtStore.setValue(asOf);
      startTransition(() => {
        setStreamEntryReadyCount(rows.reduce((count, row) => (row.status === "ENTRY_READY" ? count + 1 : count), 0));
      });
      onUpdatedRef.current?.();
      onErrorRef.current?.(null);
    } catch (error: any) {
      onErrorRef.current?.(error?.message ?? String(error));
    } finally {
      screenPollInFlightRef.current = false;
    }
  }, [resolvedScreenKey, streamDecisionStore, streamSignalStore, streamUpdatedAtStore]);

  // ── THE BRIDGE'S POSITIONS AND ORDERS ───────────────────────────────────────────────────────
  // Positions and recent orders come from the engine that made them; this only shapes them into
  // the rows the tables already draw.
  const publishBridgeState = useCallback(() => {
    const state = bridgeStateRef.current;
    if (!state) return;
    const now = Date.now();
    const benchmarks = benchmarkByTickerRef.current;
    const mine = (row: { strategyId: string }) => row.strategyId.toLowerCase() === strategyId.toLowerCase();

    const positions: StreamPosition[] = [];
    for (const p of state.positions) {
      if (!mine(p)) continue;
      const ticker = p.ticker.toUpperCase();
      const leg = legIdentityOf({ ticker, pairKey: p.pairKey ?? null });
      if (dismissedTickersRef.current.has(leg) || dismissedTickersRef.current.has(ticker)) continue;
      const openedAt = p.openedAtUtc ? Date.parse(p.openedAtUtc) : now;
      const dispatched = p.entryDispatched !== false;
      positions.push({
        ticker,
        pairKey: p.pairKey ?? null,
        benchmark: benchmarks.get(ticker) ?? "",
        side: sideOf(p.side),
        entrySignal: p.entrySignal ?? null,
        lastSignal: p.lastSignal ?? null,
        lastScaleSignal: null,
        spread: p.lastSpread ?? null,
        spreadBidPct: null,
        status: dispatched ? "OPEN" : "PENDING_ENTRY",
        reason: p.lastReason ?? "",
        entryCount: p.entryCount ?? 1,
        belowThresholdTicks: 0,
        lockedForPrint: false,
        pendingIntent: null,
        entryDispatchedAt: dispatched ? openedAt : null,
        lastDispatchedAt: null,
        lastConfirmedActiveAt: null,
        lastAboveAddCapAt: null,
        openedAt: Number.isFinite(openedAt) ? openedAt : now,
        updatedAt: state.fetchedAt,
      });
    }
    positions.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const log: StreamActionLogEntry[] = [];
    const intents: StreamOrderIntent[] = [];
    let sent = 0;
    for (const r of state.intents) {
      if (!mine(r)) continue;
      const at = Date.parse(r.atUtc);
      if (!Number.isFinite(at)) continue;
      const side = sideOf(r.side);
      const type = intentTypeOf(r.action, side);
      if (!type) continue;
      const action = r.action.trim().toLowerCase();
      const ticker = r.ticker.toUpperCase();
      const benchmark = benchmarks.get(ticker) ?? "";
      const id = `${strategyId}|${r.atUtc}|${ticker}|${action}`;
      if (r.dispatched) {
        if (now - at > ACTION_LOG_WINDOW_MS) continue;
        if (sessionStartedAtRef.current != null && at >= sessionStartedAtRef.current) sent += 1;
        log.push({
          id,
          dayKey: localDayKey(at),
          ticker,
          pairKey: null,
          benchmark,
          side,
          kind: action === "entry" ? "ENTRY" : action === "add" ? "ADD" : "CLOSE",
          deviation: null,
          at,
          intent: type,
          reason: r.reason ?? undefined,
        });
      } else if (now - at <= BLOCKED_INTENT_WINDOW_MS) {
        const isEntry = action === "entry" || action === "add";
        intents.push({
          id,
          ticker,
          pairKey: null,
          benchmark,
          side,
          intent: type,
          sequence: action === "add" ? 2 : 1,
          priceRef: isEntry === (side === "Long") ? "ASK" : "BID",
          status: "BLOCKED",
          reason: [r.outcome, r.reason].filter(Boolean).join(" | "),
          createdAt: at,
        });
      }
    }
    log.sort((a, b) => b.at - a.at);
    intents.sort((a, b) => b.createdAt - a.createdAt);

    const positionsSig = positions
      .map((p) => `${legIdentityOf(p)}|${p.side}|${p.status}|${p.entryCount}|${p.lastSignal ?? ""}|${p.spread ?? ""}|${p.benchmark}|${p.reason}`)
      .join(";");
    if (positionsSig !== publishedRef.current.positions) {
      publishedRef.current.positions = positionsSig;
      streamPositionStore.applySnapshot(positions);
      startTransition(() => setStreamPositions(positions));
    }
    const logSig = log.map((row) => row.id).join(";");
    if (logSig !== publishedRef.current.log) {
      publishedRef.current.log = logSig;
      streamActionLogStore.applySnapshot(log);
      startTransition(() => setStreamActionLog(log));
    }
    const intentsSig = intents.map((row) => row.id).join(";");
    if (intentsSig !== publishedRef.current.intents) {
      publishedRef.current.intents = intentsSig;
      streamOrderIntentStore.applySnapshot(intents);
      startTransition(() => setStreamOrderIntents(intents));
    }
    setStreamSentOrdersCount((prev) => (prev === sent ? prev : sent));
  }, [strategyId, streamActionLogStore, streamOrderIntentStore, streamPositionStore]);

  const pollBridgeState = useCallback(async () => {
    if (bridgePollInFlightRef.current) return;
    bridgePollInFlightRef.current = true;
    try {
      const [positionsResponse, engineResponse] = await Promise.all([
        fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" }),
        fetchWithTimeout(bridgeUrl("/api/stream/caesar/engine"), { cache: "no-store" }),
      ]);
      const positionsJson = positionsResponse.ok ? await positionsResponse.json().catch(() => null) : null;
      const engineJson = engineResponse.ok ? await engineResponse.json().catch(() => null) : null;
      // Neither answered: keep showing the last picture rather than blanking the tables.
      if (!positionsJson && !engineJson) return;
      const previous = bridgeStateRef.current;
      bridgeStateRef.current = {
        positions: Array.isArray(positionsJson?.positions) ? positionsJson.positions : previous?.positions ?? [],
        intents: Array.isArray(engineJson?.engine?.recentIntents) ? engineJson.engine.recentIntents : previous?.intents ?? [],
        fetchedAt: Date.now(),
      };
      publishBridgeState();
    } catch {
      // The bridge may be down while the frontend is being worked on; the next tick tries again.
    } finally {
      bridgePollInFlightRef.current = false;
    }
  }, [publishBridgeState]);

  // ── THE TRADINGAPP QUEUE ────────────────────────────────────────────────────────────────────
  const refreshExecutionStatus = useCallback(async (force = false): Promise<TradingAppExecutionSnapshot | null> => {
    const now = Date.now();
    const currentExecutionSnapshot = streamExecutionSnapshotRef.current;
    if (!force && currentExecutionSnapshot && now - lastStatusRefreshAtRef.current < EXECUTION_STATUS_POLL_MS - 500) {
      return currentExecutionSnapshot;
    }
    if (!force && statusRefreshInFlightRef.current) {
      return currentExecutionSnapshot;
    }
    try {
      statusRefreshInFlightRef.current = true;
      const response = await fetchWithTimeout(tradingAppBridgeUrl("/status"), { cache: "no-store" });
      if (!response.ok) return null;
      const snapshot = (await response.json()) as TradingAppExecutionSnapshot;
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

  const bindStreamWindows = useCallback(async () => {
    const activeResponse = await fetchWithTimeout(tradingAppBridgeUrl("/bind-active-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const activeJson = await activeResponse.json().catch(() => ({} as TradingAppBoundWindowResponse));
    if (!activeResponse.ok || activeJson?.ok === false) {
      throw new Error(activeJson?.error || `Failed to bind Market Maker window (${activeResponse.status})`);
    }

    const mainResponse = await fetchWithTimeout(tradingAppBridgeUrl("/bind-main-window"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const mainJson = await mainResponse.json().catch(() => ({} as TradingAppBoundWindowResponse));
    if (!mainResponse.ok || mainJson?.ok === false || !mainJson?.bound) {
      throw new Error(mainJson?.error || `Failed to locate Main Window (${mainResponse.status})`);
    }

    await refreshExecutionStatus(true);
  }, [refreshExecutionStatus]);


  /**
   * Whether the bridge is scraping the market-maker BOOK from the bound window.
   *
   * Kept as its own switch rather than following the binding: binding is what order sending needs
   * and costs nothing, while the book is a screen capture plus an OCR pass several times a second.
   * The bridge defaults it to off, so binding a window no longer starts reading by itself.
   */
  const [streamBookReading, setStreamBookReadingState] = useState(false);

  const refreshStreamBookReading = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(tradingAppBridgeUrl("/book-reading"));
      const json = await response.json().catch(() => ({}));
      if (response.ok && json?.ok !== false) setStreamBookReadingState(Boolean(json?.bookReading));
    } catch {
      // Status is advisory here; a failed read leaves the toggle showing what it last knew.
    }
  }, []);

  const setStreamBookReading = useCallback(async (enabled: boolean) => {
    const response = await fetch(`${tradingAppBridgeUrl("/book-reading")}?enabled=${enabled ? "true" : "false"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to switch book reading (${response.status})`);
    }
    setStreamBookReadingState(Boolean(json?.bookReading));
  }, []);

  const clearStreamBoundWindow = useCallback(async () => {
    const response = await fetchWithTimeout(tradingAppBridgeUrl("/bound-window"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
    resetStreamOcrStores();
    // The bridge turns book reading off when the window goes away; keep the button in step.
    setStreamBookReadingState(false);
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear bound window (${response.status})`);
    }
  }, [refreshExecutionStatus]);

  const captureStreamTickerPoint = useCallback(async () => {
    const response = await fetchWithTimeout(tradingAppBridgeUrl("/capture-ticker-point"), {
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
    const response = await fetchWithTimeout(tradingAppBridgeUrl("/ticker-point"), {
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

  // START NAMES ITS STRATEGY.
  //
  // Omitting strategyId is the MACHINE form of this endpoint: StreamAutomationControlService.Start
  // then loops over every key it has ever seen and switches all of them on — OpenDoor, Day Two,
  // OpenFade, OpenRide and any stale key left in automation-state.json. Pressing START on one
  // stream started strategies nobody had opened, each of which then began dispatching as soon as
  // a host existed for it.
  const startStreamAutomation = useCallback(async () => {
    const response = await fetch(bridgeUrl("/api/stream/automation/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "workspace", strategyId }),
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to start automation (${response.status})`);
    }
  }, [refreshExecutionStatus, strategyId]);

  // STOP NAMES IT TOO — and does NOT reach for panic-off.
  //
  // The stream panel's stop used to be `POST /panic-off?enabled=true`, which is a property of the
  // SHARED TradingApp queue: it makes EnqueueAsync throw for every strategy on the machine, and
  // every engine's autoEnabled includes `!panicOff`. So stopping one strategy silently froze the
  // other one — it stayed mounted, connected and heartbeating, and simply never sent again.
  //
  // The strategy-scoped stop is the correct instrument: the bridge flips only this strategy's
  // flags, drops only this strategy's pending orders, and re-derives panic-off from whether
  // ANYTHING is still running (SyncPanicOffLocked). With one strategy up that is identical to the
  // old behaviour; with two it stops the one that was asked for.
  const stopStreamAutomation = useCallback(async () => {
    const response = await fetch(bridgeUrl("/api/stream/automation/stop"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "workspace", strategyId }),
    });
    const json = await response.json().catch(() => ({}));
    await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to stop automation (${response.status})`);
    }
  }, [refreshExecutionStatus, strategyId]);


  const clearStreamExecutionQueue = useCallback(async (options?: { thisStrategyOnly?: boolean }) => {
    const scoped = options?.thisStrategyOnly === true && Boolean(strategyId);
    const path = scoped
      ? `/queue?intentIdPrefix=${encodeURIComponent(`${strategyId}|`)}`
      : "/queue";
    const response = await fetchWithTimeout(tradingAppBridgeUrl(path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => ({}));
      await refreshExecutionStatus(true);
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `Failed to clear TradingApp queue (${response.status})`);
    }
  }, [refreshExecutionStatus, strategyId]);


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
      action === "buy" ? (entryIntentTypes?.long ?? "EnterLongAggressive")
        : action === "sell" ? (entryIntentTypes?.short ?? "EnterShortAggressive")
          : "ExitActive";

    setStreamManualExecutionBusy(true);
    try {
      for (const ticker of tickers) {
        const response = await fetchWithTimeout(tradingAppBridgeUrl("/queue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intentId: `manual|${action}|${ticker}|${Date.now()}`,
            ticker,
            type,
            source: "stream-manual",
            note: `manual ${action}`,
            signalClass: signalClass ?? null,
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
  }, [automationConfig?.queueDelayMaxSeconds, automationConfig?.queueDelayMinSeconds, refreshExecutionStatus, signalClass]);





  // ── REFRESH ─────────────────────────────────────────────────────────────────────────────────
  // What a caller asking for "refresh" means now: re-read the three documents. `refreshBridge:
  // false` skips the TradingApp queue read, which is the only one that talks to the desktop app.
  const refresh = useCallback(async (options?: { refreshBridge?: boolean }) => {
    await Promise.all([
      pollScreen(),
      pollBridgeState(),
      options?.refreshBridge === false ? Promise.resolve(null) : refreshExecutionStatus(false),
    ]);
  }, [pollBridgeState, pollScreen, refreshExecutionStatus]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  // Three small documents, fetched only while the page is on screen. A hidden tab does nothing at
  // all, and catches up the moment it is shown.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const screenTimer = window.setInterval(() => {
      if (!pageIsHidden()) void pollScreen();
    }, SCREEN_POLL_MS);
    const bridgeTimer = window.setInterval(() => {
      if (!pageIsHidden()) void pollBridgeState();
    }, BRIDGE_STATE_POLL_MS);
    const statusTimer = window.setInterval(() => {
      if (!pageIsHidden()) void refreshExecutionStatus(false);
    }, EXECUTION_STATUS_POLL_MS);
    const onVisibilityChange = () => {
      if (!pageIsHidden()) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(screenTimer);
      window.clearInterval(bridgeTimer);
      window.clearInterval(statusTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, pollBridgeState, pollScreen, refresh, refreshExecutionStatus]);

  // A different instance is a different set of tables.
  useEffect(() => {
    streamActionLogStore.clear();
    streamDecisionStore.clear();
    streamOrderIntentStore.clear();
    streamPositionStore.clear();
    streamSignalStore.clear();
    streamUpdatedAtStore.clear();
    streamFilterPassLogStore.clear();
    bridgeStateRef.current = null;
    publishedRef.current = { positions: "", log: "", intents: "" };
    dismissedTickersRef.current.clear();
    benchmarkByTickerRef.current = new Map();
    setStreamActionLog([]);
    setStreamPositions([]);
    setStreamOrderIntents([]);
    setStreamEntryReadyCount(0);
    setStreamSessionStartedAt(null);
    setStreamSessionStoppedAt(null);
    setStreamSentOrdersCount(0);
  }, [instanceId, streamActionLogStore, streamDecisionStore, streamFilterPassLogStore, streamOrderIntentStore, streamPositionStore, streamSignalStore, streamUpdatedAtStore]);

  // Marks this instance as a live consumer of the SHARED bridge stores (execution snapshot, OCR
  // book/main window). Those reflect global TradingApp state, so they are torn down only when the
  // last instance lets go — see streamSharedStores.ts.
  useEffect(() => {
    if (!enabled) return;
    acquireSharedStreamStores(instanceId);
    return () => {
      releaseSharedStreamStores(instanceId);
    };
  }, [enabled, instanceId]);

  useEffect(() => {
    if (enabled) return;
    streamExecutionSnapshotRef.current = null;
    executionSnapshotSignatureRef.current = "";
    lastStatusRefreshAtRef.current = 0;
    // Only this instance's own stores are cleared here. The shared execution/OCR stores are
    // released via the refcount effect above — clearing them directly would blank the execution
    // snapshot that OTHER running strategies show.
    streamActionLogStore.clear();
    streamDecisionStore.clear();
    streamOrderIntentStore.clear();
    streamPositionStore.clear();
    streamSignalStore.clear();
    streamUpdatedAtStore.clear();
    streamFilterPassLogStore.clear();
    bridgeStateRef.current = null;
    publishedRef.current = { positions: "", log: "", intents: "" };
  }, [enabled, streamActionLogStore, streamDecisionStore, streamFilterPassLogStore, streamOrderIntentStore, streamPositionStore, streamSignalStore, streamUpdatedAtStore]);

  useEffect(() => {
    if (!enabled || !ocrEnabled) return;
    return connectStreamOcrFeed();
  }, [enabled, ocrEnabled]);

  useEffect(() => {
    if (!enabled || ocrEnabled) return;
    // OCR snapshots are shared: only reset them if no other instance is still using them,
    // otherwise turning OCR off in one strategy blanks the book another one is displaying.
    if (!hasOtherSharedStreamUsers(instanceId)) resetStreamOcrStores();
  }, [enabled, instanceId, ocrEnabled]);

  // Session clock for the header: when the strategy was switched on / off.
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
      const startedAt = Date.now();
      sessionStartedAtRef.current = startedAt;
      setStreamSessionStartedAt(startedAt);
      setStreamSessionStoppedAt(null);
      setStreamSentOrdersCount(0);
    }
    void pollBridgeState();
  }, [automationConfig?.strategyModeEnabled, enabled, pollBridgeState, streamAutoEnabled]);

  // The bridge owns the position book, so there is nothing local to reset: this just re-reads it.
  const resetStreamAutomationState = useCallback(() => {
    void pollBridgeState();
  }, [pollBridgeState]);

  // Hides rows from THIS page's tables. The bridge keeps tracking a position until the account is
  // flat, and nothing here can stop it re-entering — that is what the bridge's own manual-close
  // memory is for.
  const dismissStreamActivePositions = useCallback((tickers: string[]) => {
    if (!tickers.length) return;
    for (const ticker of tickers) dismissedTickersRef.current.add(ticker.toUpperCase());
    publishBridgeState();
  }, [publishBridgeState]);

  return {
    streamEntryReadyCount,
    streamPositions,
    streamActionLog,
    streamOrderIntents,
    streamAutoEnabled,
    streamSessionStartedAt,
    streamSessionStoppedAt,
    streamSentOrdersCount,
    setStreamAutoEnabled,
    streamManualExecutionBusy,
    bindStreamWindows,
    streamBookReading,
    setStreamBookReading,
    refreshStreamBookReading,
    clearStreamBoundWindow,
    captureStreamTickerPoint,
    captureStreamTickerPointDelayed,
    clearStreamTickerPoint,
    toggleStreamPanicOff,
    startStreamAutomation,
    stopStreamAutomation,
    clearStreamExecutionQueue,
    resetStreamAutomationState,
    dismissStreamActivePositions,
    submitManualStreamOrders,
    refresh,
  };
}
