import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The Morning Launch Sonar panel, computed server-side — same wire shape as
 * opgReversalSnapshotClient.ts, with ONE difference that changes how every row reads:
 *
 *   signalDev here is a one-minute MOVE, not a level.
 *
 * Every other strategy's Sonar shows how far a stack sits from yesterday's close. This one shows how
 * far it travelled in a minute inside 03:50-04:20, which is why the row also carries fromDev/
 * fromMinuteIdx (where the move started) and lastDev (where it arrived) — a move without its endpoints
 * is a number with no meaning. One exit class, the 9:30 open.
 *
 * Reuses OpenDoorLiveFilters/toOpenDoorSonarFilters as-is, same reason every sibling client does.
 */
export type MorLaunchExitClass = "gap0930";

/** Mirrors MorLaunchThresholdUnit (MorLaunchGate.cs) — what MinDevAbsShort/Long/Max are measured in.
 * Sigma is the unit this pattern was actually validated in. */
export type MorLaunchThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type MorLaunchSonarLiveParams = {
  exitClass: MorLaunchExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: MorLaunchThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type MorLaunchSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  /** The one-minute MOVE that qualified this ticker — a DELTA, not a level. Positive was taken Short. */
  signalDev: number | null;
  /** The remembered reading the move was measured FROM, and the minute it was sampled at. */
  fromDev: number | null;
  fromMinuteIdx: number;
  /** The current print — the level the move arrived AT. */
  lastDev: number | null;
  /** What the position would be filled at: ask for a Long, bid for a Short, under BIDASK. */
  entryDev: number | null;
  gamma: number | null;
  gammaN: number;
  /** The same (exitClass, sign) cell's published win_rate/total — see MorLaunchGate.Decision. */
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
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

export type MorLaunchSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /**
   * True only inside Morning Launch's 03:50-04:20 NY window. UNLIKE every sibling panel's copy of this
   * flag it does NOT mean rows is empty: the gate runs all day so the panel stays readable and the move
   * memory can be watched filling. It means "now is a minute this strategy would actually act in", so a
   * row shown while this is false is informational, not actionable.
   */
  inWindow: boolean;
  /**
   * Tickers with a live reading but no usable previous-minute sample yet, so no move could be formed.
   * Specific to this strategy: its gate needs memory, so a high count means the bridge has not been
   * polled long enough to know anything — warm-up, not an empty market.
   */
  noSampleCount: number;
  rows: MorLaunchSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toMorLaunchSonarLiveParams(args: {
  exitClass: MorLaunchExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: MorLaunchThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): MorLaunchSonarLiveParams {
  return {
    exitClass: args.exitClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minGammaTotal: args.minGammaTotal,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    thresholdUnit: args.thresholdUnit,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushMorLaunchSonarLiveParams(params: MorLaunchSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/morlaunch/params"), {
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

export function fetchMorLaunchSonarSnapshot(): Promise<MorLaunchSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/morlaunch/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as MorLaunchSonarSnapshot);
}
