import { bridgeUrl } from "../bridgeBase";
import { toOpenDoorLiveFilters, type OpenDoorLiveFilters, type MultiTriModes } from "../opendoor/liveParamsClient";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";

/**
 * OPGRootation's STREAM-tab toolbar, pushed to the bridge — mirrors lib/opgReversal/liveParamsClient.ts
 * byte-for-byte in shape (OPG•Rootation started as a clone of OPG•Reversal's own pipeline, 2026-11-04 —
 * see lib/strategies/registry.ts's own "opgrootation" entry). Points at
 * `/api/stream/opgrootation/params`, backed by OPGRootationLiveParamsService. The real live trade
 * decision (price vs the 09:30 anchor) is NOT driven by this toolbar at all — it lives in a dedicated
 * sub-minute trigger service on the bridge; this toolbar only shapes the candidate pre-filter
 * (minDevAbsShort/Long/Max, gamma/rate/total floors, ignoreRatings) the same way OPGReversal's own
 * toolbar shapes ITS candidate list.
 */
// REPURPOSED 2026-11-04 (operator's own instruction): minDevAbsShort/Long/Max no longer feed a
// 9:20-9:25 backtest pre-filter the way OPGReversal's own copy still does. For Rootation they ARE
// the live trigger's own entry thresholds (minimum % move down/up from the 09:30 anchor for a
// SHORT/LONG, and a shared max-cap anomaly filter), read directly by
// OPGRootationEntryTriggerService.BuildIntents. minGammaTotal is still sent but no longer consulted
// by the live trigger (the candidate pre-filter/OPGRootationGate is not called from the live path at
// all anymore). cancelBelowMovePct below is the new post-fire cancel floor.
export type OPGRootationThresholdUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

/** Mirrors OPGRootationPriceMode (TapeOPGRootationModels.cs) — what the GATE's own signal reading is
 * computed from, not just entry/exit pricing. See OPGRootationParams.PriceMode's own doc comment. */
export type OPGRootationPriceMode = "LastPrint" | "BidAsk";

/** OPGRootationTiming.Default's own three same-day exits — 09:45 / 10:00 / 10:30, cloned unchanged
 * from OPGReversalTiming.Default. */
export type OPGRootationExitClass = "exit0945" | "exit1000" | "exit1030";

export type OPGRootationStreamLiveParams = {
  exitClass: OPGRootationExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  /** AMBER box's own meaning: the floor an already-fired, not-yet-filled ticker's |% move| from the
   * anchor must stay above. If it shrinks back under this before the position opens (fill can take
   * 3-4 minutes), the pending order is cancelled. 0 = off. */
  cancelBelowMovePct: number;
  thresholdUnit: OPGRootationThresholdUnit;
  priceMode: OPGRootationPriceMode;
  filters: OpenDoorLiveFilters | null;
  /** CORR toggle (operator's own instruction, 2026-11-06): drop any ticker correlated at or above
   * corrThreshold with ANY ticker reporting earnings today. Outside `filters` on purpose — it needs
   * an async whole-universe lookup server-side (UniverseReportCorrService/SectorCorrService), not a
   * value already sitting on the row the way everything in `filters` is. */
  excludeCorr: boolean;
  corrThreshold: number;
  source: string;
};

export function toOPGRootationStreamLiveParams(args: {
  exitClass: OPGRootationExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  cancelBelowMovePct: number;
  thresholdUnit: OPGRootationThresholdUnit;
  priceMode: OPGRootationPriceMode;
  filters: ArbitrageFilterConfigV1;
  multiModes: MultiTriModes;
  excludeCorr: boolean;
  corrThreshold: number;
  source: string;
}): OPGRootationStreamLiveParams {
  return {
    exitClass: args.exitClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minGammaTotal: args.minGammaTotal,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    cancelBelowMovePct: args.cancelBelowMovePct,
    thresholdUnit: args.thresholdUnit,
    priceMode: args.priceMode,
    filters: toOpenDoorLiveFilters(args.filters, args.multiModes),
    excludeCorr: args.excludeCorr,
    corrThreshold: args.corrThreshold,
    source: args.source,
  };
}

export async function pushOPGRootationStreamLiveParams(params: OPGRootationStreamLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgrootation/params"), {
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

export async function fetchOPGRootationStreamLiveParams(): Promise<OPGRootationStreamLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgrootation/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as OPGRootationStreamLiveParams) ?? null;
  } catch {
    return null;
  }
}

/**
 * One ticker's live state inside OPGRootationEntryTriggerService's own window — mirrors
 * OPGRootationCandidateRowDto (Services/Stream/Engine/OPGRootationCandidateSnapshot.cs) exactly.
 * anchor930/currentPrice are the operator's own "LstPrc" DAS-watchlist field (2026-11-05 FINAL fix —
 * see the DTO's own doc comment for the full "which field" history this session went through) and
 * null until a 09:30 anchor/live price is known; everything else always has a value.
 */
export type OPGRootationCandidateRow = {
  ticker: string;
  anchor930: number | null;
  currentPrice: number | null;
  movePct: number | null;
  side: "Long" | "Short" | null;
  meetsThreshold: boolean;
  /** Has this ticker's official opening print (GAP%/TOpen) landed yet — status only, see the DTO's
   * own doc comment. False does not mean "not tradeable"; TrdStatus is the real gate. */
  gapKnown: boolean;
  trdStatus: string | null;
  fired: boolean;
  awaitingFill: boolean;
  firedAtUtc: string | null;
};

/** `GET /api/stream/opgrootation/candidates` — the operator's own ask (2026-11-04): see which
 * candidates are already past their move% threshold even before GAP% has settled. Polled from both
 * OPGRootationScanner.tsx (covers Scanner and Stream, which embeds it) and OPGRootationSonar.tsx via
 * OPGRootationCandidatesPanel.tsx. */
export async function fetchOPGRootationCandidates(): Promise<OPGRootationCandidateRow[]> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opgrootation/candidates"), { cache: "no-store" });
    if (!response.ok) return [];
    const json = await response.json().catch(() => ({}));
    const rows = json?.candidates;
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      ticker: String(r?.ticker ?? r?.Ticker ?? ""),
      anchor930: r?.anchor930 ?? r?.Anchor930 ?? null,
      currentPrice: r?.currentPrice ?? r?.CurrentPrice ?? null,
      movePct: r?.movePct ?? r?.MovePct ?? null,
      side: (r?.side ?? r?.Side ?? null) as "Long" | "Short" | null,
      meetsThreshold: Boolean(r?.meetsThreshold ?? r?.MeetsThreshold),
      gapKnown: Boolean(r?.gapKnown ?? r?.GapKnown),
      trdStatus: r?.trdStatus ?? r?.TrdStatus ?? null,
      fired: Boolean(r?.fired ?? r?.Fired),
      awaitingFill: Boolean(r?.awaitingFill ?? r?.AwaitingFill),
      firedAtUtc: r?.firedAtUtc ?? r?.FiredAtUtc ?? null,
    }));
  } catch {
    return [];
  }
}
