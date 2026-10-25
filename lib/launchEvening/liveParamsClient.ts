import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * Evening Launch's STREAM-tab toolbar, pushed to the bridge. Points at `/api/stream/launchevening/params`,
 * backed by LaunchEveningLiveParamsService/LaunchEveningServerStrategy (wired 2026-10-17).
 *
 * Two things differ from every sibling client here, and both matter when reading a row:
 *   - minDevAbsShort/Long/Max are floors on a one-minute MOVE inside 15:50-16:20, not on a level at a
 *     checkpoint minute.
 *   - priceMode changes only what a qualifying candidate would be FILLED at. It does NOT change the
 *     signal: the move is always measured on the print. See LaunchEveningPriceMode's own doc comment for
 *     the one-sided-quote measurement behind that.
 *
 * Hotkeys.LaunchEveningBuy/Sell default to Ctrl+F1/Ctrl+F2 and LaunchEveningEarlyBuy/Sell to Ctrl+F3/Ctrl+F4 —
 * this is the first strategy whose send window crosses the 04:00 EARLY/DAY boundary, so it has two
 * chords per side. AutoEnabled defaults false, so saving this toolbar alone cannot send a real order.
 */
export type LaunchEveningThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors LaunchEveningPriceMode (TapeLaunchEveningModels.cs) — what a candidate is FILLED at. Unlike the
 * OPG family's own PriceMode it does NOT move the gate's signal reading. */
export type LaunchEveningPriceMode = "LastPrint" | "BidAsk";

/** LaunchEveningTiming.Default's only class: the 16:00 jump (no exit clock - nothing live exits an evening position). */
export type LaunchEveningExitClass = "eve1600";

export type LaunchEveningStreamLiveParams = {
  exitClass: LaunchEveningExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LaunchEveningThresholdUnit;
  priceMode: LaunchEveningPriceMode;
  filters: OpenDoorLiveFilters | null;
  /** ITB/HARD (borrow status) — NOT part of `filters`, same split as the Sonar panel's own copy:
   * display-only, read by LaunchEveningStreamUniverseService for the EXECUTOR tab's universe list,
   * never folded into the dispatching engine's own params. */
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
};

export function toLaunchEveningStreamLiveParams(args: {
  exitClass: LaunchEveningExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LaunchEveningThresholdUnit;
  priceMode: LaunchEveningPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
}): LaunchEveningStreamLiveParams {
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
    priceMode: args.priceMode,
    filters: toOpenDoorLiveFilters(args.filters, args.multiModes),
    excludeItb: args.excludeItb,
    excludeHard: args.excludeHard,
    source: args.source,
  };
}

/** One row of signals/launchevening/launchevening_tickers.csv — flat and undirected, same shape Sonar's
 * LaunchEveningUniverseRow uses. */
export type LaunchEveningStreamUniverseRow = {
  ticker: string;
  rating: number | null;
  total: number | null;
  sigma: number | null;
  alpha: number | null;
};

export async function fetchLaunchEveningStreamUniverse(): Promise<LaunchEveningStreamUniverseRow[]> {
  const response = await fetch(bridgeUrl("/api/stream/launchevening/universe"), { cache: "no-store" });
  if (!response.ok) return [];
  const json = await response.json().catch(() => ({}));
  return Array.isArray(json?.rows) ? (json.rows as LaunchEveningStreamUniverseRow[]) : [];
}

export async function pushLaunchEveningStreamLiveParams(params: LaunchEveningStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/launchevening/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    // Best-effort, same as every other strategy's live-params push: the bridge keeps whatever it
    // last received and the toolbar is unaffected.
    return false;
  }
}

export async function fetchLaunchEveningStreamLiveParams(): Promise<LaunchEveningStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/launchevening/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as LaunchEveningStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
