import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The Reversal Sonar panel, computed server-side — see openDoorSnapshotClient.ts for the shared
 * shape/reasoning. Reuses OpenDoorLiveFilters/toOpenDoorSonarFilters as-is (the non-rating half of
 * the toolbar — bounds, flag exclusions, country/exchange/sector selects — is generic across every
 * strategy family, not an OpenDoor-only shape) rather than declaring a byte-identical Reversal copy.
 *
 * No useStack/useBench/useDevSig, no upMinRate/upMinTotal/upMinMove/downMin*: ReversalGate.Check has
 * none of OpenDoor's per-param bin toggles — see ReversalGate.cs. Just an exit class, the split
 * |15:50 dev| floors/cap (minDevAbsShort/minDevAbsLong/minDevAbsMax), a sample-size floor on the
 * matched gamma (minGammaTotal) and the ignoreRatings escape hatch — mirrors
 * ReversalScanner.tsx's own buildReversalParams 1-to-1 (the single shared minDevAbs field this type
 * used to carry was removed from the bridge's PaperReversalRequest/ReversalLiveEngine when that
 * split landed; ReversalSonarLiveParamsService.MinDevAbsShort/Long/Max/MinGammaTotal already existed
 * on the bridge side, this file was just never updated to send them).
 */
export type ReversalExitClass = "exit18" | "exit21" | "exit04" | "exit07" | "print";

/** Mirrors ReversalThresholdUnit's own doc comment (ReversalGate.cs) — what MinDevAbsShort/Long/Max
 * are measured in. "atr" (τ), added 2026-09-25, divides by the ticker's CURRENT live ATR14%. */
export type ReversalThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type ReversalSonarLiveParams = {
  exitClass: ReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ReversalThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type ReversalSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  signalDev: number | null;
  gamma: number | null;
  gammaN: number;
  /** The same (exitClass, sign) cell's published win_rate/total — see ReversalGate.Decision. */
  winRate: number | null;
  total: number;
  /** The ticker's own published alpha, sign-matched to `side`. */
  alpha: number | null;
  /** The ticker's published static Stack% dispersion — ticker-level, unrelated to side. */
  sigma: number | null;
  /** The ticker's CURRENT live ATR14% reading — what the τ threshold unit divides by. Unlike
   * alpha/sigma this is not a ratings-table constant. */
  atr14Pct: number | null;
  /** The ticker's own published lambda (Reversal.ipynb's compute_lambda) — ticker-level, not
   * sign-matched, like sigma — what the λ threshold unit divides by. */
  lambda: number | null;
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

export type ReversalSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /** False outside Reversal's 15:45-15:55 NY signal window — rows is then always empty too, for a
   * different, non-transient reason than timedOut. */
  inWindow: boolean;
  rows: ReversalSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toReversalSonarLiveParams(args: {
  exitClass: ReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: ReversalThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): ReversalSonarLiveParams {
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

export async function pushReversalSonarLiveParams(params: ReversalSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/reversal/params"), {
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

export function fetchReversalSonarSnapshot(): Promise<ReversalSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/reversal/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as ReversalSonarSnapshot);
}
