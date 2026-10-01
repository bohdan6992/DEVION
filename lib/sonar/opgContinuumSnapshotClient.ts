import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OPG•Continuum Sonar panel, computed server-side — byte-for-byte opgReversalSnapshotClient.ts's
 * own shape (see that file's own header comment): OPGContinuumGate.Check is Continuum's own unchanged
 * thesis, just OPG's shared clock (09:20-09:25 signal, not 15:45-15:55) and three same-day exit
 * classes (exit0945/exit1000/exit1030).
 */
export type OPGContinuumExitClass = "exit0945" | "exit1000" | "exit1030";

export type OPGContinuumThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGContinuumSonarLiveParams = {
  exitClass: OPGContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGContinuumThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type OPGContinuumSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  signalDev: number | null;
  gamma: number | null;
  gammaN: number;
  winRate: number | null;
  total: number;
  alpha: number | null;
  sigma: number | null;
  atr14Pct: number | null;
  lambda: number | null;
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

export type OPGContinuumSonarSnapshot = {
  timedOut: boolean;
  inWindow: boolean;
  rows: OPGContinuumSonarRow[];
  items: unknown[];
  rawCount: number;
};

export function toOPGContinuumSonarLiveParams(args: {
  exitClass: OPGContinuumExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGContinuumThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): OPGContinuumSonarLiveParams {
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

export async function pushOPGContinuumSonarLiveParams(params: OPGContinuumSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/opgcontinuum/params"), {
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

export function fetchOPGContinuumSonarSnapshot(): Promise<OPGContinuumSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/opgcontinuum/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OPGContinuumSonarSnapshot);
}
