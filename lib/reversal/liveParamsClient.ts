import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";
import type { ReversalExitClass } from "../sonar/reversalSnapshotClient";

/**
 * Reversal's STREAM-tab toolbar, pushed to the bridge — see ReversalLiveParamsService.cs's own doc
 * comment for the gap this closes (2026-09-25): before this, nothing on the frontend PUT here at
 * all, so ReversalServerStrategy traded permanently on the service's own defaults regardless of what
 * ReversalScanner.tsx showed in Stream mode. Byte-for-byte the same shape
 * lib/sonar/reversalSnapshotClient.ts's ReversalSonarLiveParams already uses — Stream and Sonar keep
 * SEPARATE stores on the bridge (ReversalLiveParamsService vs ReversalSonarLiveParamsService), but the
 * params object itself is identical, so this reuses OpenDoorLiveFilters/toOpenDoorLiveFilters the same
 * way lib/arbitrage/liveParamsClient.ts does for Arbitrage's own Stream push.
 */
export type ReversalThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors ReversalPriceMode (TapeReversalModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See ReversalLiveParams.PriceMode's own doc comment. */
export type ReversalPriceMode = "LastPrint" | "BidAsk";

export type ReversalStreamLiveParams = {
  exitClass: ReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. Added
   * 2026-09-29 — a genuine Scanner-vs-Stream parity gap: the Scanner already sent this to
   * PaperReversalController, but nothing ever pushed it here, so the live engine always ran with
   * MinRate=0 regardless of what the Scanner's own MINRATE box showed. */
  minRate: number;
  /** Floor on the same cell's own published total trade count. 0 = off. Same parity gap as minRate. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ReversalThresholdUnit;
  /** "LastPrint" (default) | "BidAsk" — added 2026-09-29 (the operator's own instruction: "стрім
   * повинен набирати ситуації по білу і аску"). Another genuine Scanner-vs-Stream parity gap: the
   * Scanner's own PriceMode toggle changed which reading its backtest gated on
   * (TapeReversalEngine.SignalDev), but the live engine had no such field at all and always judged
   * the plain print — see ReversalLiveParams.PriceMode's own doc comment. */
  priceMode: ReversalPriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toReversalStreamLiveParams(args: {
  exitClass: ReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ReversalThresholdUnit;
  priceMode: ReversalPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): ReversalStreamLiveParams {
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

export async function pushReversalStreamLiveParams(params: ReversalStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/reversal/params"), {
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

export async function fetchReversalStreamLiveParams(): Promise<ReversalStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/reversal/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as ReversalStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
