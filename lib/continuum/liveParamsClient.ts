import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * Continuum's STREAM-tab toolbar, pushed to the bridge — mirrors lib/reversal/liveParamsClient.ts
 * byte-for-byte (see that file's own doc comment for the shape rationale). Points at
 * `/api/stream/continuum/params`, which has no ContinuumLiveParamsService behind it yet (2026-09-30:
 * only the Scanner half of Continuum is wired — see lib/strategies/registry.ts's own "continuum"
 * entry). Until that service exists this PUTs into a 404 and pushReversalStreamLiveParams's own
 * try/catch swallows it the same way a bridge restart would — best-effort, never thrown at the
 * toolbar. Re-point nothing here when the live engine lands; only Program.cs needs a new
 * registration.
 */
export type ContinuumThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors ContinuumPriceMode (TapeContinuumModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See ContinuumParams.PriceMode's own doc comment. */
export type ContinuumPriceMode = "LastPrint" | "BidAsk";

export type ContinuumExitClass = "exit18" | "exit21" | "exit04" | "exit07" | "print";

export type ContinuumStreamLiveParams = {
  exitClass: ContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ContinuumThresholdUnit;
  priceMode: ContinuumPriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toContinuumStreamLiveParams(args: {
  exitClass: ContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ContinuumThresholdUnit;
  priceMode: ContinuumPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): ContinuumStreamLiveParams {
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

export async function pushContinuumStreamLiveParams(params: ContinuumStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/continuum/params"), {
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

export async function fetchContinuumStreamLiveParams(): Promise<ContinuumStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/continuum/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as ContinuumStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
