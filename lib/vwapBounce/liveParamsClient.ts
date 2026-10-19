import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * VWAPBounce's STREAM-tab toolbar, pushed to the bridge — mirrors lib/reversal/liveParamsClient.ts
 * byte-for-byte (see that file's own doc comment for the shape rationale). Points at
 * `/api/stream/vwapbounce/params` - the Stream strategy does NOT exist on the bridge yet (Sonar and the
 * tape Scanner do), so this push is a no-op until it does.
 */
export type VWAPBounceThresholdUnit = "sigma" | "alpha" | "gamma" | "lambda";

/** What an entry / add is FILLED at. The signal itself is always the Stack% print. */
export type VWAPBouncePriceMode = "LastPrint" | "BidAsk";

export type VWAPBounceStreamLiveParams = {
  /** Floor on |tech_z| (distance from VWAP in sigmas) and |rel_z| (residual vs market + sector). Spec: 2 / 2. */
  minTechZ: number;
  minRelZ: number;
  /** Upper cap on score = min(|tech_z|, |rel_z|); null = none. */
  maxScore: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: VWAPBounceThresholdUnit;
  priceMode: VWAPBouncePriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toVWAPBounceStreamLiveParams(args: {
  minTechZ: number;
  minRelZ: number;
  maxScore: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: VWAPBounceThresholdUnit;
  priceMode: VWAPBouncePriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): VWAPBounceStreamLiveParams {
  return {
    minTechZ: args.minTechZ,
    minRelZ: args.minRelZ,
    maxScore: args.maxScore,
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

export async function pushVWAPBounceStreamLiveParams(params: VWAPBounceStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/vwapbounce/params"), {
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

export async function fetchVWAPBounceStreamLiveParams(): Promise<VWAPBounceStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/vwapbounce/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as VWAPBounceStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
