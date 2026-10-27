import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * LIMITER's STREAM-tab toolbar. Points at `/api/stream/limiter/params`, which NOTHING on the bridge
 * answers — this whole client is the renamed copy of MorLaunch's own stateful one-minute-move-gate
 * client (its doc comment below still describes THAT mechanism), kept only because
 * LimiterStreamLiveParams' shape is still what pushLimiterStreamLiveParams's call site builds. The
 * push is therefore a harmless no-op today; it stays wired rather than deleted so re-enabling it
 * later is a backend change, not a frontend one. The real, working half of LIMITER's data — the
 * filtered ticker list with its Arbitrage PRE-class rating attached — is
 * lib/sonar/limiterRatingsClient.ts, not this file. See LimiterSonar.tsx's own header comment for
 * the full story, 2026-10-27.
 */
export type LimiterThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors LimiterPriceMode (TapeLimiterModels.cs) — what a candidate is FILLED at. Unlike the
 * OPG family's own PriceMode it does NOT move the gate's signal reading. */
export type LimiterPriceMode = "LastPrint" | "BidAsk";

/** LIMITER's only class: PRE, read off Arbitrage's own published file — see LimiterSonar.tsx's own
 * header comment. Not a class of its own thesis, so there is nothing else this will ever be. */
export type LimiterExitClass = "pre";

export type LimiterStreamLiveParams = {
  exitClass: LimiterExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LimiterThresholdUnit;
  priceMode: LimiterPriceMode;
  filters: OpenDoorLiveFilters | null;
  /** ITB/HARD (borrow status) — NOT part of `filters`, same split as the Sonar panel's own copy:
   * display-only, read by LimiterStreamUniverseService for the EXECUTOR tab's universe list,
   * never folded into the dispatching engine's own params. */
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
};

export function toLimiterStreamLiveParams(args: {
  exitClass: LimiterExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LimiterThresholdUnit;
  priceMode: LimiterPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
}): LimiterStreamLiveParams {
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

/** One row of signals/limiter/limiter_tickers.csv — flat and undirected, same shape Sonar's
 * LimiterUniverseRow uses. */
export type LimiterStreamUniverseRow = {
  ticker: string;
  rating: number | null;
  total: number | null;
  sigma: number | null;
  alpha: number | null;
};

export async function fetchLimiterStreamUniverse(): Promise<LimiterStreamUniverseRow[]> {
  const response = await fetch(bridgeUrl("/api/stream/limiter/universe"), { cache: "no-store" });
  if (!response.ok) return [];
  const json = await response.json().catch(() => ({}));
  return Array.isArray(json?.rows) ? (json.rows as LimiterStreamUniverseRow[]) : [];
}

export async function pushLimiterStreamLiveParams(params: LimiterStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/limiter/params"), {
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

export async function fetchLimiterStreamLiveParams(): Promise<LimiterStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/limiter/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as LimiterStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
