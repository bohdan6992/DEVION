import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OpenFade Sonar panel, computed server-side. OpenFade selects on the band alone
 * (fadeMinAbs/fadeMaxAbs) — the rating-gate fields below are still sent (kept, not deleted, same
 * "public shape, vestigial field" situation as the client's own matchOpenDoor already has) but are
 * unread by the reused OpenFadeLiveEngine.BandPass path.
 */
export type OpenFadeSonarLiveParams = {
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

export type OpenFadeSonarRow = {
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

export type OpenFadeSonarSnapshot = {
  timedOut: boolean;
  rows: OpenFadeSonarRow[];
};

export function toOpenFadeSonarLiveParams(args: {
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
}): OpenFadeSonarLiveParams {
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

export async function pushOpenFadeSonarLiveParams(params: OpenFadeSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/openfade/params"), {
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

export function fetchOpenFadeSonarSnapshot(): Promise<OpenFadeSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/openfade/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OpenFadeSonarSnapshot);
}
