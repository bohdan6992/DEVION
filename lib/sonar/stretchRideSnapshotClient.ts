import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The STRETCH•RIDE Sonar panel, computed server-side. Same wire plumbing as every sibling client
 * (lib/sonar/pullBackSnapshotClient.ts is the one this was built from), with four differences that
 * change how a row reads:
 *
 *   1. THE SIGNAL IS IN SIGMAS. `signalDev` is final.parquet's own `dev_sig` - ZAP SIG - the
 *      benchmark-relative stretch divided by the ticker's own dispersion. Every threshold on this
 *      panel is therefore a sigma count, never a percentage point, and is not comparable to the
 *      identically-named field on any sibling strategy.
 *   2. THE ENTRY IS A PRE-OPEN PRINT, NOT THE OPEN. The window 09:15-09:21 is both the signal
 *      window and the entry window: the first minute at which |ZAP SIG| clears the floor AND a
 *      price exists IS the fill. `inWindow` therefore does not mean "a signal is forming" the way
 *      it does on a sibling panel - it means "now is a minute this strategy would FILL in". The
 *      live engine judges the present moment and keeps no memory of earlier ones, so there is
 *      deliberately no per-row "minute it triggered" field: that answer only exists in the
 *      backtest, where the whole window can be replayed.
 *   3. ONE CLASS. EXIT0930 alone (STRETCH-RIDE.ipynb: EXIT_CLASSES), so `exitClass` is informational
 *      rather than a selector. The hold is 9 to 15 minutes.
 *   4. THE DIRECTION RIDES THE READING'S OWN SIGN — STRETCH•FADE's own exact opposite (operator,
 *      2026-11-16: "позитивне відхилення це бай"): a POSITIVE ZAP SIG is a LONG (buy the stock
 *      that is already stretched up away from its benchmark), a negative one a SHORT.
 *
 * THE BACKEND EXISTS (2026-11-16, StretchRideSonarSnapshotService), but NO RATINGS DATA EXISTS YET:
 * this is a genuinely new, never-backtested trade rule - STRETCH-FADE.ipynb never answered the
 * opposite question - so `/api/stream/sonar/stretchride/snapshot` returns a real, empty snapshot
 * (rows: []) until a STRETCH-RIDE.ipynb publishes `stretchride_rolling_perf.json.gz`.
 *
 * Reuses OpenDoorLiveFilters/toOpenDoorSonarFilters as-is, same reason every sibling client does.
 */
/** Lowercase on the wire, exactly like every OPG sibling's ExitClass. The notebook's own
 * uppercase EXIT0930 is the PUBLISHED `cls` value, not a request field - keeping both spellings
 * for one class is how a gate ends up silently matching nothing. */
export type StretchRideExitClass = "exit0930";

/** What MinDevAbsShort/Long/Max are measured in - see StretchRideThresholdUnit in
 * lib/stretchRide/liveParamsClient.ts for why the list is only three long. "sig" is the raw ZAP SIG
 * reading; alpha and gamma are the notebook's own published levels, which are ALSO in sigmas, so
 * both ratios are dimensionless. There is deliberately no pct/sigma/atr/lambda. */
export type StretchRideThresholdUnitName = "sig" | "alpha" | "gamma";

export type StretchRideSonarLiveParams = {
  exitClass: StretchRideExitClass;
  /** IN SIGMAS, strict >, matching the notebook's `min_dev_sig` (default 1.0). */
  minDevAbsShort: number;
  minDevAbsLong: number;
  /** IN SIGMAS. Ceiling that rejects a sigma-near-zero blow-up, null = off. */
  minDevAbsMax: number | null;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchRideThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type StretchRideSonarRow = {
  ticker: string;
  /** A POSITIVE ZAP SIG is a Long, a negative one a Short - the ride this strategy exists for. */
  side: "Long" | "Short";
  /** ZAP SIG right now, IN SIGMAS: the benchmark-relative stretch over the ticker's own dispersion. */
  signalDev: number | null;
  /** What the position would be filled at: ask for a Long, bid for a Short, under BIDASK. The
   * spread matters more here than in the 09:30-entry families - this is a pre-open print. */
  entryDev: number | null;
  /** The published per-(class, sign) gamma - the lowest ZAP SIG level at which this ticker has
   * actually paid. IN SIGMAS, like everything else on this panel. */
  gammaPos: number | null;
  gammaNeg: number | null;
  /** The same (exitClass, sign) cell's published win_rate/total. */
  winRate: number | null;
  total: number;
  /** The ticker's own published alpha, sign-matched to `side`. IN SIGMAS (STRETCH-RIDE.ipynb's
   * compute_alpha runs over `signals.dev`, which is a ZAP SIG reading). */
  alpha: number | null;
  /** The ticker's published static Stack% dispersion. INFORMATIONAL ONLY, and specifically NOT the
   * denominator of signalDev: CRACEN divides by the ROLLING `sigma_day`, while this field is the
   * static `sigma` column. The two differ by more than 10% on most rows, so this must never be used
   * to convert a sigma reading back into percentage points. */
  sigma: number | null;
  /** The ticker's CURRENT live ATR14% reading, in PERCENTAGE POINTS. Carried for the shared filter
   * rows only - it is NOT a threshold unit on this strategy, unlike every sibling panel's tau pill. */
  atr14Pct: number | null;
  /** The ticker's own published lambda, also in PERCENTAGE POINTS. Same story as atr14Pct: a shared
   * filter reads it, nothing here divides by it. */
  lambda: number | null;
  /** Always exit0930 - carried so the row shape matches every sibling's. */
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

export type StretchRideSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) - rows is empty, not "no matches". */
  timedOut: boolean;
  /** True only inside 09:15-09:21, the signal-and-entry window. It does NOT mean rows is empty -
   * the bridge gate runs all morning so the panel stays readable - it means "now is a minute this
   * strategy would fill in", so a row shown while this is false is informational, not actionable. */
  inWindow: boolean;
  /** Always exit0930, plus the exit minute (09:30) the hold ends at. */
  exitClass: string;
  exitMinuteIdx: number;
  /** The window this snapshot's signal was read over, as minute indices: [09:15, 09:21]. */
  signalWindow: [number, number];
  /** Tickers with a live price but no finite ZAP SIG yet - no benchmark print that minute, so the
   * strategy cannot signal on them. On measured data that is roughly a third of the window's
   * prints, which is a data property, not an absence of moves. */
  noSignalCount: number;
  rows: StretchRideSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read - chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toStretchRideSonarLiveParams(args: {
  exitClass: StretchRideExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchRideThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): StretchRideSonarLiveParams {
  return {
    exitClass: args.exitClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    thresholdUnit: args.thresholdUnit,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushStretchRideSonarLiveParams(params: StretchRideSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/stretchride/params"), {
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

export function fetchStretchRideSonarSnapshot(): Promise<StretchRideSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/stretchride/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as StretchRideSonarSnapshot);
}
