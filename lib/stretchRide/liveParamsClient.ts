import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * STRETCH•RIDE's STREAM-tab toolbar, pushed to the bridge. Same wire plumbing as every sibling
 * live-params client (lib/pullBack/liveParamsClient.ts is the nearest one), with the differences
 * that make this strategy its own:
 *
 *   * THE THRESHOLD IS IN SIGMAS, NOT PERCENTAGE POINTS. The signal is final.parquet's own
 *     `dev_sig` column - what the operator calls ZAP SIG - which is already a deviation divided by
 *     the ticker's own dispersion. A floor of 1.0 here means "one sigma", not "one pp", and is NOT
 *     comparable to the `minDevAbs*` of any other OPG strategy.
 *   * ONE CLASS. The notebook publishes EXIT0930 alone (STRETCH-RIDE.ipynb: EXIT_CLASSES), so there
 *     is no class selector to push - the field is kept on the wire so the bridge's own request
 *     shape stays identical to its siblings', and so a second exit can be added without a protocol
 *     change.
 *   * THE ENTRY IS NOT THE OPEN. Every other OPG family signals in the pre-open and fills at 09:30;
 *     here the entry IS the first minute inside 09:15-09:21 at which |ZAP SIG| clears the floor AND
 *     a price exists, and 09:30 is the EXIT.
 *
 * STRETCH•RIDE is STRETCH•FADE's own exact opposite-direction mirror (operator, 2026-11-16:
 * "позитивне відхилення це бай"): a positive ZAP SIG now admits a LONG instead of a SHORT, and a
 * negative one a SHORT instead of a LONG - see `minDevAbsShort`/`minDevAbsLong` below.
 *
 * THE BACKEND EXISTS (2026-11-16, StretchRideLiveParamsService/StretchRideServerStrategy), but NO
 * RATINGS DATA EXISTS YET: this trade rule has never been backtested (STRETCH-FADE.ipynb only ever
 * answered the opposite question), so the gate rejects every ticker until a STRETCH-RIDE.ipynb
 * publishes `stretchride_rolling_perf.json.gz` - these calls succeed, they just can't admit a real
 * order yet.
 */

/**
 * What MinDevAbsShort/Long/Max are measured in. DELIBERATELY SHORTER THAN EVERY SIBLING'S LIST,
 * because on a sigma axis most of the usual units are a unit error rather than a choice:
 *   * "sig"   - the raw ZAP SIG reading, unscaled. The natural unit here.
 *   * "alpha" - divided by the ticker's own published alpha, which STRETCH-RIDE.ipynb computes from
 *               `signals.dev` and therefore publishes IN SIGMAS too, so the ratio is dimensionless.
 *   * "gamma" - same argument: gamma comes from `trades.entry_dev`, also a ZAP SIG reading.
 * There is no "pct", "sigma", "atr" or "lambda" option. Dividing a sigma reading by sigma again is
 * a double division; lambda and ATR14% are in percentage points and would silently mix units.
 */
export type StretchRideThresholdUnit = "sig" | "alpha" | "gamma";

/** Mirrors the sibling PriceMode enums - what the GATE's own reading is computed from, not just
 * entry/exit pricing. BidAsk matters more here than in the 09:30-entry families: the fill is a
 * PRE-OPEN print, where the spread is widest. */
export type StretchRidePriceMode = "LastPrint" | "BidAsk";

/** The single published class (STRETCH-RIDE.ipynb: EXIT_CLASSES = ("EXIT0930",)). */
export type StretchRideExitClass = "exit0930";

export type StretchRideStreamLiveParams = {
  exitClass: StretchRideExitClass;
  /** IN SIGMAS. Floor on the ZAP SIG reading that admits a SHORT (a NEGATIVE reading - flipped
   * from STRETCH•FADE). Strict >, matching the notebook's own `min_dev_sig` gate, so exactly 1.0
   * does not trade. */
  minDevAbsShort: number;
  /** IN SIGMAS. The same floor for a LONG (a POSITIVE reading - flipped from STRETCH•FADE). */
  minDevAbsLong: number;
  /** IN SIGMAS. Ceiling - a reading past this is a sigma near zero dividing a real deviation, not a
   * real signal. Null = off. */
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchRideThresholdUnit;
  priceMode: StretchRidePriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toStretchRideStreamLiveParams(args: {
  exitClass: StretchRideExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchRideThresholdUnit;
  priceMode: StretchRidePriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): StretchRideStreamLiveParams {
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

export async function pushStretchRideStreamLiveParams(params: StretchRideStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/stretchride/params"), {
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

export async function fetchStretchRideStreamLiveParams(): Promise<StretchRideStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/stretchride/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as StretchRideStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
