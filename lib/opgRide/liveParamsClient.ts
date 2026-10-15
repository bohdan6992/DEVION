import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * OPGRide's STREAM-tab toolbar, pushed to the bridge — mirrors lib/reversal/liveParamsClient.ts
 * byte-for-byte (see that file's own doc comment for the shape rationale). Points at
 * `/api/stream/opgride/params`, backed by OPGRideLiveParamsService/OPGRideServerStrategy
 * (wired 2026-10-01 — see lib/strategies/registry.ts's own "opgride" entry). Hotkeys.
 * OPGRideBuy/Sell default to Ctrl+F7/Ctrl+F8 (bound 2026-10-02). AutoEnabled still defaults
 * false, so saving this toolbar alone cannot send a real order yet.
 */
export type OPGRideThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors OPGRidePriceMode (TapeOPGRideModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See OPGRideParams.PriceMode's own doc comment. */
export type OPGRidePriceMode = "LastPrint" | "BidAsk";

/** OPGRideTiming.Default's own three same-day exits — 09:45 / 10:00 / 10:30, NOT Reversal's own
 * five (no print/exit18/exit21/exit04/exit07 here, every OPG exit lands the same calendar day). */
export type OPGRideExitClass = "exit0945" | "exit1000" | "exit1030";

export type OPGRideStreamLiveParams = {
  exitClass: OPGRideExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGRideThresholdUnit;
  priceMode: OPGRidePriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toOPGRideStreamLiveParams(args: {
  exitClass: OPGRideExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGRideThresholdUnit;
  priceMode: OPGRidePriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): OPGRideStreamLiveParams {
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

export async function pushOPGRideStreamLiveParams(params: OPGRideStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgride/params"), {
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

export async function fetchOPGRideStreamLiveParams(): Promise<OPGRideStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgride/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as OPGRideStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
