import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * OPGContinuum's STREAM-tab toolbar, pushed to the bridge — byte-for-byte
 * lib/opgReversal/liveParamsClient.ts's own shape (see that file's own doc comment for the shape
 * rationale). Points at `/api/stream/opgcontinuum/params`, backed by
 * OPGContinuumLiveParamsService/OPGContinuumServerStrategy (wired 2026-10-01 — see
 * lib/strategies/registry.ts's own "opgcontinuum" entry). AutoEnabled still defaults false and
 * Hotkeys.OPGContinuumBuy/Sell are still unbound, so saving this toolbar alone cannot send a real
 * order yet.
 */
export type OPGContinuumThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors OPGContinuumPriceMode (TapeOPGContinuumModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See OPGContinuumParams.PriceMode's own doc comment. */
export type OPGContinuumPriceMode = "LastPrint" | "BidAsk";

/** OPGContinuumTiming.Default's own three same-day exits — 09:45 / 10:00 / 10:30, NOT Continuum's own
 * five (no print/exit18/exit21/exit04/exit07 here, every OPG exit lands the same calendar day). */
export type OPGContinuumExitClass = "exit0945" | "exit1000" | "exit1030";

export type OPGContinuumStreamLiveParams = {
  exitClass: OPGContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGContinuumThresholdUnit;
  priceMode: OPGContinuumPriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toOPGContinuumStreamLiveParams(args: {
  exitClass: OPGContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGContinuumThresholdUnit;
  priceMode: OPGContinuumPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): OPGContinuumStreamLiveParams {
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

export async function pushOPGContinuumStreamLiveParams(params: OPGContinuumStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgcontinuum/params"), {
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

export async function fetchOPGContinuumStreamLiveParams(): Promise<OPGContinuumStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgcontinuum/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as OPGContinuumStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
