import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * OPGFade's STREAM-tab toolbar, pushed to the bridge — mirrors lib/reversal/liveParamsClient.ts
 * byte-for-byte (see that file's own doc comment for the shape rationale). Points at
 * `/api/stream/opgfade/params`, backed by OPGFadeLiveParamsService/OPGFadeServerStrategy
 * (wired 2026-10-01 — see lib/strategies/registry.ts's own "opgfade" entry). Hotkeys.
 * OPGFadeBuy/Sell default to Ctrl+F7/Ctrl+F8 (bound 2026-10-02). AutoEnabled still defaults
 * false, so saving this toolbar alone cannot send a real order yet.
 */
export type OPGFadeThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors OPGFadePriceMode (TapeOPGFadeModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See OPGFadeParams.PriceMode's own doc comment. */
export type OPGFadePriceMode = "LastPrint" | "BidAsk";

/** OPGFadeTiming.Default's own three same-day exits — 09:45 / 10:00 / 10:30, NOT Reversal's own
 * five (no print/exit18/exit21/exit04/exit07 here, every OPG exit lands the same calendar day). */
export type OPGFadeExitClass = "exit0945" | "exit1000" | "exit1030";

export type OPGFadeStreamLiveParams = {
  exitClass: OPGFadeExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGFadeThresholdUnit;
  priceMode: OPGFadePriceMode;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export function toOPGFadeStreamLiveParams(args: {
  exitClass: OPGFadeExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGFadeThresholdUnit;
  priceMode: OPGFadePriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  source: string;
}): OPGFadeStreamLiveParams {
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

export async function pushOPGFadeStreamLiveParams(params: OPGFadeStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgfade/params"), {
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

export async function fetchOPGFadeStreamLiveParams(): Promise<OPGFadeStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgfade/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as OPGFadeStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}
