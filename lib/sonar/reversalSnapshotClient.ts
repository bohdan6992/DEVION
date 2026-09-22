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

export type ReversalSonarLiveParams = {
  exitClass: ReversalExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  ignoreRatings: boolean;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type ReversalSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  signalDev: number | null;
  gamma: number | null;
  gammaN: number;
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
  ignoreRatings: boolean;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): ReversalSonarLiveParams {
  return {
    exitClass: args.exitClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minGammaTotal: args.minGammaTotal,
    ignoreRatings: args.ignoreRatings,
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
