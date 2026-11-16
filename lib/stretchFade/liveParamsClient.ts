import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * STRETCH•FADE's STREAM-tab toolbar, pushed to the bridge. Same wire plumbing as every sibling
 * live-params client (lib/pullBack/liveParamsClient.ts is the nearest one), with the differences
 * that make this strategy its own:
 *
 *   * THE THRESHOLD IS IN SIGMAS, NOT PERCENTAGE POINTS. The signal is final.parquet's own
 *     `dev_sig` column - what the operator calls ZAP SIG - which is already a deviation divided by
 *     the ticker's own dispersion. A floor of 1.0 here means "one sigma", not "one pp", and is NOT
 *     comparable to the `minDevAbs*` of any other OPG strategy.
 *   * ONE CLASS. The notebook publishes EXIT0930 alone (STRETCH-FADE.ipynb: EXIT_CLASSES), so there
 *     is no class selector to push - the field is kept on the wire so the bridge's own request
 *     shape stays identical to its siblings', and so a second exit can be added without a protocol
 *     change.
 *   * THE ENTRY IS NOT THE OPEN. Every other OPG family signals in the pre-open and fills at 09:30;
 *     here the entry IS the first minute inside 09:15-09:21 at which |ZAP SIG| clears the floor AND
 *     a price exists, and 09:30 is the EXIT.
 *
 * NO BRIDGE BACKEND EXISTS YET (2026-11-15): there is no StretchFadeLiveParamsService and no
 * StretchFadeServerStrategy, so these calls 404 and return false/null. That is deliberate - the
 * toolbar is wired first so the shape is pinned before the C# side is written - but it means
 * nothing here can send a real order.
 */

/**
 * What MinDevAbsShort/Long/Max are measured in. DELIBERATELY SHORTER THAN EVERY SIBLING'S LIST,
 * because on a sigma axis most of the usual units are a unit error rather than a choice:
 *   * "sig"   - the raw ZAP SIG reading, unscaled. The natural unit here.
 *   * "alpha" - divided by the ticker's own published alpha, which STRETCH-FADE.ipynb computes from
 *               `signals.dev` and therefore publishes IN SIGMAS too, so the ratio is dimensionless.
 *   * "gamma" - same argument: gamma comes from `trades.entry_dev`, also a ZAP SIG reading.
 * There is no "pct", "sigma", "atr" or "lambda" option. Dividing a sigma reading by sigma again is
 * a double division; lambda and ATR14% are in percentage points and would silently mix units.
 */
export type StretchFadeThresholdUnit = "sig" | "alpha" | "gamma";

/** Mirrors the sibling PriceMode enums - what the GATE's own reading is computed from, not just
 * entry/exit pricing. BidAsk matters more here than in the 09:30-entry families: the fill is a
 * PRE-OPEN print, where the spread is widest. */
export type StretchFadePriceMode = "LastPrint" | "BidAsk";

/** The single published class (STRETCH-FADE.ipynb: EXIT_CLASSES = ("EXIT0930",)). */
export type StretchFadeExitClass = "exit0930";

export type StretchFadeStreamLiveParams = {
  exitClass: StretchFadeExitClass;
  /** IN SIGMAS. Floor on the ZAP SIG reading that admits a SHORT (a positive reading). Strict >,
   * matching the notebook's own `min_dev_sig` gate, so exactly 1.0 does not trade. */
  minDevAbsShort: number;
  /** IN SIGMAS. The same floor for a LONG (a negative reading). */
  minDevAbsLong: number;
  /** IN SIGMAS. Ceiling - a reading past this is a sigma near zero dividing a real deviation, not a
   * real signal. Null = off. */
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchFadeThresholdUnit;
  priceMode: StretchFadePriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toStretchFadeStreamLiveParams(args: {
  exitClass: StretchFadeExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: StretchFadeThresholdUnit;
  priceMode: StretchFadePriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): StretchFadeStreamLiveParams {
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

export async function pushStretchFadeStreamLiveParams(params: StretchFadeStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/stretchfade/params"), {
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

export async function fetchStretchFadeStreamLiveParams(): Promise<StretchFadeStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/stretchfade/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as StretchFadeStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
