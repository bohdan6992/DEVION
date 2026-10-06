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
  /** RATE/UNIVERSE — drops the eligibility gate entirely when true, ignoring signalsMinRate/
   * signalsMinTotal. Added 2026-09-27, replacing the removed ALL/TOP + SESSION/BIN/BINS row. */
  ignoreRatings: boolean;
  /** PR ("LastPrint": deviation from the print) or BIDASK ("BidAsk": bid/ask per side). */
  priceMode: "LastPrint" | "BidAsk";
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
  /**
   * The full signal rows the panel draws detail from — every listed ticker, plus the few rows its
   * hedge / gold / sector-correlation widgets read. Chosen on the bridge; the page filters nothing.
   */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing — the panel's "raw" count. */
  rawCount: number;
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function toArbitrageSonarLiveParams(args: {
  snapshot: SonarExactFilterSnapshot & {
    cls?: unknown; type?: unknown; minRate?: unknown; minTotal?: unknown; ratingMode?: unknown;
    ignoreRatings?: unknown; priceMode?: unknown;
  };
  source: string;
}): ArbitrageSonarLiveParams {
  const s = args.snapshot;
  const ratingMode = s.ratingMode === "BIN" || s.ratingMode === "BINS" ? s.ratingMode : "SESSION";
  return {
    // "global" is a display-only aggregate on the bridge now, never something to gate live
    // signals on (ArbitrageFilesService.NormalizeRatingClass) - "pre" is the Sonar's own default.
    signalsClass: String(s.cls ?? "pre"),
    signalsType: String(s.type ?? "any"),
    signalsMinRate: num(s.minRate),
    signalsMinTotal: num(s.minTotal),
    ratingMode,
    ignoreRatings: !!s.ignoreRatings,
    priceMode: s.priceMode === "LastPrint" ? "LastPrint" : "BidAsk",
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
  // fetchWithTimeout's ceiling ends when the headers arrive, so a body that stalls would leave the
  // shared poll "in flight" forever and freeze the panel silently. The body read gets its own.
  const bodyTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("sonar snapshot body timed out")), 15_000)
  );
  // If fetchWithTimeout itself rejects first (bridge down/aborted), the .then below never runs, so
  // bodyTimeout's own rejection 15s later would otherwise have no handler attached anywhere and
  // surface as an unhandled promise rejection (crashing the page in dev) — a SEPARATE, silent
  // subscriber here prevents that without affecting the real race below.
  bodyTimeout.catch(() => {});
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/arbitrage/snapshot"), { cache: "no-store" })
    .then((res) => Promise.race([res.json(), bodyTimeout]))
    .then((body: any) => body.snapshot as ArbitrageSonarSnapshot);
}
