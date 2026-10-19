import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * Morning Launch's STREAM-tab toolbar, pushed to the bridge. Points at `/api/stream/morlaunch/params`,
 * backed by MorLaunchLiveParamsService/MorLaunchServerStrategy (wired 2026-10-17).
 *
 * Two things differ from every sibling client here, and both matter when reading a row:
 *   - minDevAbsShort/Long/Max are floors on a one-minute MOVE inside 03:50-04:20, not on a level at a
 *     checkpoint minute.
 *   - priceMode changes only what a qualifying candidate would be FILLED at. It does NOT change the
 *     signal: the move is always measured on the print. See MorLaunchPriceMode's own doc comment for
 *     the one-sided-quote measurement behind that.
 *
 * Hotkeys.MorLaunchBuy/Sell default to Ctrl+F1/Ctrl+F2 and MorLaunchEarlyBuy/Sell to Ctrl+F3/Ctrl+F4 —
 * this is the first strategy whose send window crosses the 04:00 EARLY/DAY boundary, so it has two
 * chords per side. AutoEnabled defaults false, so saving this toolbar alone cannot send a real order.
 */
export type MorLaunchThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors MorLaunchPriceMode (TapeMorLaunchModels.cs) — what a candidate is FILLED at. Unlike the
 * OPG family's own PriceMode it does NOT move the gate's signal reading. */
export type MorLaunchPriceMode = "LastPrint" | "BidAsk";

/** MorLaunchTiming.Default's only class — every trade exits at the 9:30 open. */
export type MorLaunchExitClass = "gap0930";

export type MorLaunchStreamLiveParams = {
  exitClass: MorLaunchExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: MorLaunchThresholdUnit;
  priceMode: MorLaunchPriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toMorLaunchStreamLiveParams(args: {
  exitClass: MorLaunchExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: MorLaunchThresholdUnit;
  priceMode: MorLaunchPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): MorLaunchStreamLiveParams {
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
    source: args.source,
  };
}

export async function pushMorLaunchStreamLiveParams(params: MorLaunchStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/morlaunch/params"), {
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

export async function fetchMorLaunchStreamLiveParams(): Promise<MorLaunchStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/morlaunch/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as MorLaunchStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
