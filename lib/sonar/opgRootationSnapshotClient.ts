import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OPG•Rootation Sonar panel, computed server-side — byte-for-byte opgReversalSnapshotClient.ts's
 * own shape (OPG•Rootation started as a clone of OPG•Reversal's own pipeline, 2026-11-04):
 * OPGRootationGate.Check is cloned from OPGReversalGate unchanged (same 09:20-09:25 deviation/gamma
 * candidate pre-filter, same three same-day exit classes exit0945/exit1000/exit1030) — this snapshot
 * is still that pre-filter's own candidate list, NOT the live 09:30:40 price-vs-anchor trigger, which
 * runs on its own schedule on the bridge and isn't shaped by this toolbar at all. Reuses
 * OpenDoorLiveFilters/toOpenDoorSonarFilters as-is, same reason OPGReversal's own client does.
 */
export type OPGRootationExitClass = "exit0945" | "exit1000" | "exit1030";

/** Mirrors OPGRootationThresholdUnit's own doc comment (OPGRootationGate.cs, cloned from
 * OPGReversalGate) — what MinDevAbsShort/Long/Max are measured in. */
export type OPGRootationThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGRootationSonarLiveParams = {
  exitClass: OPGRootationExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGRootationThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type OPGRootationSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  signalDev: number | null;
  gamma: number | null;
  gammaN: number;
  /** The same (exitClass, sign) cell's published win_rate/total — see OPGRootationGate.Decision. */
  winRate: number | null;
  total: number;
  /** The ticker's own published alpha, sign-matched to `side`. */
  alpha: number | null;
  /** The ticker's published static Stack% dispersion — ticker-level, unrelated to side. */
  sigma: number | null;
  /** The ticker's CURRENT live ATR14% reading — what the τ threshold unit divides by. Unlike
   * alpha/sigma this is not a ratings-table constant. */
  atr14Pct: number | null;
  /** The ticker's own published lambda — ticker-level, not sign-matched, like sigma — what the λ
   * threshold unit divides by. */
  lambda: number | null;
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

export type OPGRootationSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /** False outside OPG•Rootation's 09:20-09:25 NY candidate-filter window — rows is then always empty
   * too, for a different, non-transient reason than timedOut. */
  inWindow: boolean;
  rows: OPGRootationSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toOPGRootationSonarLiveParams(args: {
  exitClass: OPGRootationExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGRootationThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): OPGRootationSonarLiveParams {
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

export async function pushOPGRootationSonarLiveParams(params: OPGRootationSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/opgrootation/params"), {
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

export function fetchOPGRootationSonarSnapshot(): Promise<OPGRootationSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/opgrootation/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OPGRootationSonarSnapshot);
}
