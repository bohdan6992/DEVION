import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OpenRide Sonar panel, computed server-side.
 *
 * OPERATOR DECISION, 2026-09-13: unlike this panel's OWN client-side matchOpenDoor (band AND the
 * rating-bin gate, unless "ignore ratings" is on), the backend snapshot selects on the band ALONE
 * — matching what OpenRideLiveEngine.BandPass actually trades on for the live Stream. See
 * OpenRideSonarLiveParamsService.cs. ignoreRatings/useStack/etc. are still sent (kept, not
 * deleted) but are unread by the reused band path.
 */
export type OpenRideSonarLiveParams = {
  exitClass: "10m" | "30m";
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
  fadeMetric: "sigma" | "pct";
  fadeMinAbs: number;
  fadeMaxAbs: number | null;
  ignoreRatings: boolean;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type OpenRideSonarRow = {
  ticker: string;
  bench: string | null;
  side: "Long" | "Short";
  stack: number | null;
  benchDev: number | null;
  devSig: number | null;
  gateRate: number;
  gateTotal: number;
  bid: number | null;
  ask: number | null;
};

export type OpenRideSonarSnapshot = {
  timedOut: boolean;
  rows: OpenRideSonarRow[];
};

export function toOpenRideSonarLiveParams(args: {
  exitClass: "10m" | "30m";
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
  fadeMetric: "sigma" | "pct";
  fadeMinAbs: number;
  fadeMaxAbs: number | null;
  ignoreRatings: boolean;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): OpenRideSonarLiveParams {
  return {
    exitClass: args.exitClass,
    useStack: args.useStack,
    useBench: args.useBench,
    useDevSig: args.useDevSig,
    upMinRate: args.upMinRate,
    upMinTotal: args.upMinTotal,
    upMinMove: args.upMinMove,
    downMinRate: args.downMinRate,
    downMinTotal: args.downMinTotal,
    downMinMove: args.downMinMove,
    fadeMetric: args.fadeMetric,
    fadeMinAbs: args.fadeMinAbs,
    fadeMaxAbs: args.fadeMaxAbs,
    ignoreRatings: args.ignoreRatings,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushOpenRideSonarLiveParams(params: OpenRideSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/openride/params"), {
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

export function fetchOpenRideSonarSnapshot(): Promise<OpenRideSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/openride/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OpenRideSonarSnapshot);
}
