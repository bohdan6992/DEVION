import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toArbitrageServerSonarFilters, type ArbitrageServerSonarFilters } from "../arbitrage/liveParamsClient";
import type { SonarExactFilterSnapshot } from "../../components/sonar/ArbitrageSonar";

/**
 * The Arbitrage Sonar panel, computed server-side — the panel's own toolbar, pushed to the bridge
 * so ArbitrageSonarSnapshotService filters with exactly what the operator sees, plus the fetch of
 * the result. Separate from lib/arbitrage/liveParamsClient.ts (the Stream tab's own push): Sonar's
 * toolbar state was never pushed anywhere before this — see ArbitrageSonarLiveParamsService.
 */
export type ArbitrageSonarLiveParams = {
  signalsClass: string;
  signalsType: string;
  signalsMinRate: number;
  signalsMinTotal: number;
  ratingMode: "SESSION" | "BIN" | "BINS";
  filters: ArbitrageServerSonarFilters | null;
  source: string;
};

export type SonarSignalRow = {
  ticker: string;
  side: string;
  bid: number | null;
  ask: number | null;
  sig: number | null;
  zap: number | null;
  zapSigma: number | null;
  corr: number | null;
  beta: number | null;
  rate: number | null;
  total: number | null;
};

/**
 * Per-stage rejection counts from SonarSignalFilter — built so "0 visible" has an answer besides
 * re-reading the toolbar: when every row dies at the SAME stage, that stage is the toggle actually
 * responsible, not whichever one looks most suspicious.
 */
export type SonarFilterFunnel = {
  raw: number;
  rejectedByTicker: number;
  rejectedByActivity: number;
  rejectedByList: number;
  rejectedByRange: number;
  rejectedByRating: number;
  rejectedByTopWindow: number;
  rejectedByExclude: number;
  rejectedByGeo: number;
  rejectedByReport: number;
  rejectedByEquityType: number;
  rejectedByZap: number;
  passed: number;
};

export type ArbitrageSonarSnapshot = {
  requestedRatingMode: string;
  /** What was actually served — SESSION always, today. See the handoff doc's BIN/BINS note. */
  servedRatingMode: string;
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  rows: SonarSignalRow[];
  /** Null on a timeout (nothing ran). */
  funnel: SonarFilterFunnel | null;
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function toArbitrageSonarLiveParams(args: {
  snapshot: SonarExactFilterSnapshot & {
    cls?: unknown; type?: unknown; minRate?: unknown; minTotal?: unknown; ratingMode?: unknown;
  };
  source: string;
}): ArbitrageSonarLiveParams {
  const s = args.snapshot;
  const ratingMode = s.ratingMode === "BIN" || s.ratingMode === "BINS" ? s.ratingMode : "SESSION";
  return {
    signalsClass: String(s.cls ?? "global"),
    signalsType: String(s.type ?? "any"),
    signalsMinRate: num(s.minRate),
    signalsMinTotal: num(s.minTotal),
    ratingMode,
    filters: toArbitrageServerSonarFilters(s),
    source: args.source,
  };
}

export async function pushArbitrageSonarLiveParams(params: ArbitrageSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/arbitrage/params"), {
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

export function fetchArbitrageSonarSnapshot(): Promise<ArbitrageSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/arbitrage/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as ArbitrageSonarSnapshot);
}
