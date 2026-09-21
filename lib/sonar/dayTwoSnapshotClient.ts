import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The Day Two Sonar panel, computed server-side — see openDoorSnapshotClient.ts for the shared
 * shape/reasoning. Separate params store from the Stream tab's (DayTwoLiveParamsService) and from
 * OpenDoor's own Sonar store, same as the bridge keeps them separate.
 */
export type DayTwoExitClass = "POST1" | "POST2" | "BLUE1" | "BLUE2" | "BLUE3" | "PRINT";

export type DayTwoSonarLiveParams = {
  exitClass: DayTwoExitClass;
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
  ignoreRatings: boolean;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type DayTwoSonarRow = {
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

export type DayTwoSonarSnapshot = {
  timedOut: boolean;
  rows: DayTwoSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toDayTwoSonarLiveParams(args: {
  exitClass: DayTwoExitClass;
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
  filters: OpenDoorSonarFilterSource;
  source: string;
}): DayTwoSonarLiveParams {
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
    ignoreRatings: false,
    filters: toOpenDoorSonarFilters(args.filters),
    source: args.source,
  };
}

export async function pushDayTwoSonarLiveParams(params: DayTwoSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/daytwo/params"), {
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

export function fetchDayTwoSonarSnapshot(): Promise<DayTwoSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/daytwo/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as DayTwoSonarSnapshot);
}
