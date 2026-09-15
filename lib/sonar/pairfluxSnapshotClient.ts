import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toArbitrageServerSonarFilters, type ArbitrageServerSonarFilters } from "../arbitrage/liveParamsClient";
import type { SonarExactFilterSnapshot } from "../../components/sonar/ArbitrageSonar";
import type { LivePair } from "../pairflux/livePairs";

/**
 * The PairFlux Sonar panel (bucket grid + PairFluxDivergence), computed server-side. Separate from
 * lib/pairflux/liveParamsClient.ts (the Stream tab's own push) — Sonar's toolbar state was never
 * pushed anywhere before this, see PairFluxSonarLiveParamsService.
 */
export type PairFluxSonarLiveParams = {
  cls: "pre" | "open" | "intra";
  unit: "pct" | "sigma" | "alpha" | "gamma";
  minDeviation: number;
  maxDeviation: number | null;
  exitAt: number;
  minRate: number;
  minTotal: number;
  corrRange: Bound | null;
  betaRange: Bound | null;
  sigmaRange: Bound | null;
  alphaRange: Bound | null;
  filters: ArbitrageServerSonarFilters | null;
  source: string;
};

type Bound = { min?: number | null; max?: number | null };

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
/**
 * `Number(null)` and `Number("")` are BOTH `0` in JS, not NaN — reading either the naive way turns
 * an untouched min/max box into a live `{min:0, max:0}` bound instead of "unset" (see the full
 * explanation in lib/arbitrage/liveParamsClient.ts's own `num`, which had the identical bug).
 */
const numOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const bound = (loRaw: unknown, hiRaw: unknown): Bound | null => {
  const lo = numOrNull(loRaw);
  const hi = numOrNull(hiRaw);
  return lo == null && hi == null ? null : { min: lo, max: hi };
};
const clsOf = (session: unknown): PairFluxSonarLiveParams["cls"] => {
  const s = String(session ?? "").trim().toLowerCase();
  return s === "pre" ? "pre" : s === "open" ? "open" : "intra";
};
const unitOf = (devUnit: unknown): PairFluxSonarLiveParams["unit"] => {
  const u = String(devUnit ?? "").trim().toLowerCase();
  return u === "sigma" ? "sigma" : u === "alpha" ? "alpha" : u === "gamma" ? "gamma" : "pct";
};

export function toPairFluxSonarLiveParams(args: {
  /** The Sonar's cls (session), same string PairFluxDivergence's `cls` prop reads. */
  cls: string;
  /** PairFluxDivergence's `unit` prop: "pct" | "sigma" | "alpha" | "gamma". */
  unit: string;
  minDeviation: unknown;
  maxDeviation: unknown;
  exitAt: unknown;
  minRate: number;
  minTotal: number;
  corr: readonly [unknown, unknown];
  beta: readonly [unknown, unknown];
  sigma: readonly [unknown, unknown];
  alpha: readonly [unknown, unknown];
  /** The per-ticker exclude-flag chain — the OUTER Sonar snapshot, corr/beta/sigma already blanked. */
  sonar: SonarExactFilterSnapshot;
  source: string;
}): PairFluxSonarLiveParams {
  return {
    cls: clsOf(args.cls),
    unit: unitOf(args.unit),
    minDeviation: Math.abs(num(args.minDeviation)),
    maxDeviation: numOrNull(args.maxDeviation),
    exitAt: Math.abs(num(args.exitAt)),
    minRate: num(args.minRate),
    minTotal: num(args.minTotal),
    corrRange: bound(args.corr[0], args.corr[1]),
    betaRange: bound(args.beta[0], args.beta[1]),
    sigmaRange: bound(args.sigma[0], args.sigma[1]),
    alphaRange: bound(args.alpha[0], args.alpha[1]),
    filters: toArbitrageServerSonarFilters(args.sonar),
    source: args.source,
  };
}

export async function pushPairFluxSonarLiveParams(params: PairFluxSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/pairflux/params"), {
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

export type PairFluxSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — pairs is empty, not "nothing apart". */
  timedOut: boolean;
  pairs: LivePair[];
  /** Per-stage rejection counts from the leg filter — see ArbitrageSonarSnapshot's twin. Null on timeout. */
  funnel: import("./arbitrageSnapshotClient").SonarFilterFunnel | null;
};

export function fetchPairFluxSonarSnapshot(): Promise<PairFluxSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/pairflux/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as PairFluxSonarSnapshot);
}
