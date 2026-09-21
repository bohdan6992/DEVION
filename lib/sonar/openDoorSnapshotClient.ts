import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * The OpenDoor Sonar panel, computed server-side — pushes the panel's own toolbar to
 * OpenDoorSonarLiveParamsService so OpenDoorSonarSnapshotService (the SAME OpenDoorLiveEngine the
 * Stream tab trades on) gates with exactly what the operator sees, then fetches the result.
 * Separate from lib/opendoor/liveParamsClient.ts (the Stream/Scanner tab's own push) — the Sonar
 * toolbar's state was never pushed anywhere before this.
 */
export type OpenDoorSonarLiveParams = {
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
  ignoreRatings: boolean;
  filters: OpenDoorLiveFilters | null;
  source: string;
};

export type OpenDoorSonarRow = {
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

export type OpenDoorSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  rows: OpenDoorSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
};

export function toOpenDoorSonarLiveParams(args: {
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
  filters: OpenDoorSonarFilterSource;
  source: string;
}): OpenDoorSonarLiveParams {
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

export async function pushOpenDoorSonarLiveParams(params: OpenDoorSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/opendoor/params"), {
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

export function fetchOpenDoorSonarSnapshot(): Promise<OpenDoorSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/opendoor/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as OpenDoorSonarSnapshot);
}
