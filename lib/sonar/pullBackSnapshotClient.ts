import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The PullBack Sonar panel, computed server-side. Same wire plumbing as every sibling client, with
 * three differences that change how a row reads:
 *
 *   1. The class is an ENTRY time, not an exit time. T0430 / T0500 / T0530 are the three reversal
 *      START times; the exit is a single 09:30 open shared by all of them.
 *   2. signalDev is the DISPLACEMENT from yesterday's close right now - what is being faded - and it
 *      comes with baseDev (the latched 04:04 reference) and moveDev (how far it has travelled since).
 *   3. Each row carries an `admission` of "level" | "move" | "both", because PullBack has TWO entry
 *      triggers. On measured data the edge is entirely in "both", so that field is the first thing to
 *      read, not a footnote.
 *
 * Reuses OpenDoorLiveFilters/toOpenDoorSonarFilters as-is, same reason every sibling client does.
 */
export type PullBackEntryClass = "T0430" | "T0500" | "T0530";

/** Mirrors PullBackThresholdUnit (PullBackGate.cs) - what MinDevAbsShort/Long/Max are measured in.
 * NOTE there is no "gamma" here, unlike every sibling: PullBack's gamma is a maximum excursion, not a
 * level, so scaling an entry floor by it would demand a move the stack almost never makes at entry. */
export type PullBackThresholdUnitName = "pct" | "sigma" | "alpha" | "atr" | "lambda";

export type PullBackSonarLiveParams = {
  entryClass: PullBackEntryClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: PullBackThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type PullBackSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  /** The DISPLACEMENT from yesterday's close right now - what is being faded. */
  signalDev: number | null;
  /** The latched 04:04 reference and the minute it was taken, then the move since. Null before the
   * latch has anything - never a zero stand-in. */
  baseDev: number | null;
  baseMinuteIdx: number;
  moveDev: number | null;
  /** "level" | "move" | "both" - which of the two triggers admitted this row. */
  admission: string;
  /** What the position would be filled at: ask for a Long, bid for a Short, under BIDASK. */
  entryDev: number | null;
  /** The published maximum excursion between this class and 09:30. For a Short, gammaPos is how far it
   * can run AGAINST the position. NOT an entry threshold. */
  gammaPos: number | null;
  gammaNeg: number | null;
  /** The same (exitClass, sign) cell's published win_rate/total — see PullBackGate.Decision. */
  winRate: number | null;
  total: number;
  /** The ticker's own published alpha, sign-matched to `side`. */
  alpha: number | null;
  /** The ticker's published static Stack% dispersion — ticker-level, unrelated to side. */
  sigma: number | null;
  /** The ticker's CURRENT live ATR14% reading — what the τ threshold unit divides by. Unlike
   * alpha/sigma this is not a ratings-table constant. */
  atr14Pct: number | null;
  /** The ticker's own published lambda — ticker-level, not sign-matched, like sigma — what the λ
   * threshold unit divides by. */
  lambda: number | null;
  /** Which reversal start time this row was judged for. */
  entryClass: string;
  bid: number | null;
  ask: number | null;
};

export type PullBackSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /** True only inside the SELECTED class's own +/-5 entry window. It does NOT mean rows is empty - the
   * bridge gate runs all day so the panel stays readable - it means "now is a minute this strategy
   * would act in", so a row shown while this is false is informational, not actionable. */
  inWindow: boolean;
  /** Which of the three reversal start times this snapshot was computed for, and its minute. */
  entryClass: string;
  entryMinuteIdx: number;
  /** Tickers with a live reading but no latched 04:04 reference yet, so only the LEVEL trigger could
   * apply. Before ~04:03 that is the whole universe - warm-up, not an absence of moves. */
  noReferenceCount: number;
  rows: PullBackSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toPullBackSonarLiveParams(args: {
  entryClass: PullBackEntryClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: PullBackThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): PullBackSonarLiveParams {
  return {
    entryClass: args.entryClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    thresholdUnit: args.thresholdUnit,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushPullBackSonarLiveParams(params: PullBackSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/pullback/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    return false;
  }
}

export function fetchPullBackSonarSnapshot(): Promise<PullBackSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/pullback/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as PullBackSonarSnapshot);
}
