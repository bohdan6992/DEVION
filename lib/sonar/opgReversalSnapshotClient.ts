import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OPG•Reversal Sonar panel, computed server-side — byte-for-byte reversalSnapshotClient.ts's own
 * shape (see that file's own header comment): OPGReversalGate.Check is Reversal's own rule, unchanged,
 * just a different clock (09:20-09:25 signal, not 15:45-15:55) and three same-day exit classes
 * (exit0945/exit1000/exit1030, not print/exit18/exit21/exit04/exit07). Reuses
 * OpenDoorLiveFilters/toOpenDoorSonarFilters as-is, same reason Reversal's own client does.
 */
export type OPGReversalExitClass = "exit0945" | "exit1000" | "exit1030";

/** Mirrors OPGReversalThresholdUnit's own doc comment (OPGReversalGate.cs via Reversal's own) — what
 * MinDevAbsShort/Long/Max are measured in. */
export type OPGReversalThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGReversalSonarLiveParams = {
  exitClass: OPGReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGReversalThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type OPGReversalSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  signalDev: number | null;
  gamma: number | null;
  gammaN: number;
  /** The same (exitClass, sign) cell's published win_rate/total — see OPGReversalGate.Decision. */
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

export type OPGReversalSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /** False outside OPG•Reversal's 09:20-09:25 NY signal window — rows is then always empty too, for
   * a different, non-transient reason than timedOut. */
  inWindow: boolean;
  rows: OPGReversalSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toOPGReversalSonarLiveParams(args: {
  exitClass: OPGReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: OPGReversalThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): OPGReversalSonarLiveParams {
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

export async function pushOPGReversalSonarLiveParams(params: OPGReversalSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/opgreversal/params"), {
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

export function fetchOPGReversalSonarSnapshot(): Promise<OPGReversalSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/opgreversal/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OPGReversalSonarSnapshot);
}
