import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The VWAP•Bounce Sonar panel, computed server-side (VWAPBounceSonarSnapshotService, over the same
 * VWAPBounceLiveEngine a dispatching strategy will use).
 *
 * VWAP Bounce is an intraday fade of a DOUBLE stretch: a stock far from its own VWAP (tech_z) AND far
 * from what market + sector explain (rel_z), both ≥ the floors and of one sign. There is no entry
 * window clock, no exit-class dimension and no signed "deviation" like the OPG family this panel was
 * first copied from - the gate reads two z-scores, and the rating is ONE row per ticker.
 */

/** What the two leg floors are expressed in. "sigma" = as typed, in each leg's own sigma (vwap_sigma / div_sigma); the rest multiply the floors by the
 * ticker's own PUBLISHED alpha / gamma / lambda (and so need a published ratings row). */
export type VWAPBounceThresholdUnitName = "sigma" | "alpha" | "gamma" | "lambda";

export type VWAPBounceSonarLiveParams = {
  /** Floor on |tech_z| - distance from VWAP in sigmas. Spec: 2. */
  minTechZ: number;
  /** Floor on |rel_z| - residual vs market + sector in sigmas. Spec: 2. */
  minRelZ: number;
  /** Upper cap on score = min(|tech_z|, |rel_z|); null = none. */
  maxScore: number | null;
  minGammaTotal: number;
  /** Floor on the ticker's published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on the ticker's published total trade count. 0 = off. */
  minTotal: number;
  /** TRUE until vwapbounce_rolling_perf.json.gz exists: with ratings on, every ticker would be rejected. */
  ignoreRatings: boolean;
  thresholdUnit: VWAPBounceThresholdUnitName;
  /** Spec: ADV20 >= $25M. */
  minAdv20: number;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type VWAPBounceSonarRow = {
  ticker: string;
  /** The FADE side: stretched up = Short, stretched down = Long. */
  side: "Long" | "Short";
  techZ: number;
  relZ: number;
  /** min(|tech_z|, |rel_z|) - the number gamma is expressed in. */
  score: number;
  price: number;
  vwap: number;
  /** The technical leg's sigma in PRICE units (the stop / add distance). */
  vwapSigma: number;
  /** True = the notebook's per-ticker historical sigma; false = the live fallback (expanding std of the day's own samples). */
  vwapSigmaFromNotebook: boolean;
  /** The source's own deviation (final.parquet `deviation`: beta x Stack% - Bench%) in percentage points, and the per-ticker sigma it is measured in. */
  devPp: number;
  devSigmaPp: number;
  beta: number;
  bench: string | null;
  rvol: number | null;
  /** How many times the price crossed VWAP today (the spec's "saw-tooth" count). */
  vwapCross: number;
  gamma: number | null;
  gammaN: number;
  winRate: number | null;
  total: number;
  alpha: number | null;
  sigma: number | null;
  lambda: number | null;
  /** Long reads the Ask, Short the Bid. */
  entryPx: number | null;
  /** Target = VWAP; stop = entry -/+ 1.5 x vwap_sigma. */
  target: number | null;
  stop: number | null;
  bid: number | null;
  ask: number | null;
  atr14Pct: number | null;
};

export type VWAPBounceSonarSnapshot = {
  /** True when the bridge's own fetch timed out - rows is empty, not "nothing qualified". */
  timedOut: boolean;
  /** True between 10:00 and 15:55 NY. Outside it rows is always empty (the engine still warms up). */
  inWindow: boolean;
  /** Tickers whose VWAP-residual history is under the 5 minutes vwap_sigma needs. */
  warmingUpCount: number;
  missingInputCount: number;
  evaluatedCount: number;
  universeCount: number;
  /** The pre-open file (betas / div_sigma) is absent: rel_z cannot be formed, so the panel is empty for
   * that reason and not because nothing qualified. */
  liveDailyMissing: boolean;
  liveDailyAsOf: string | null;
  rows: VWAPBounceSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read. */
  items: unknown[];
  rawCount: number;
};

export function toVWAPBounceSonarLiveParams(args: {
  minTechZ: number;
  minRelZ: number;
  maxScore: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: VWAPBounceThresholdUnitName;
  minAdv20: number;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): VWAPBounceSonarLiveParams {
  return {
    minTechZ: args.minTechZ,
    minRelZ: args.minRelZ,
    maxScore: args.maxScore,
    minGammaTotal: args.minGammaTotal,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    thresholdUnit: args.thresholdUnit,
    minAdv20: args.minAdv20,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushVWAPBounceSonarLiveParams(params: VWAPBounceSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/vwapbounce/params"), {
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

export function fetchVWAPBounceSonarSnapshot(): Promise<VWAPBounceSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/vwapbounce/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as VWAPBounceSonarSnapshot);
}
