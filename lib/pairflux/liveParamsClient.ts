import { bridgeUrl } from "../bridgeBase";
import type { StreamAutomationConfig } from "../../components/stream/streamEngine";
import type { SonarExactFilterSnapshot } from "../../components/sonar/ArbitrageSonar";
import { toArbitrageServerSonarFilters, type ArbitrageServerSonarFilters } from "../arbitrage/liveParamsClient";

/**
 * The PairFlux toolbar, pushed to the bridge so the server engine trades what the page shows.
 *
 * Same split, and the same reason, as Arbitrage's own client: the page owns editing these, the
 * bridge owns acting on them. The shape mirrors PairFluxLiveParams on the bridge.
 *
 * PairFlux has no toolbar-vs-Sonar fork the way Arbitrage does — the stream tab always screens
 * each leg through the SAME Sonar-shaped exclude-flag chain the divergence panel uses
 * (applyExactSonarClientFilters), so `legFilters` is never null here the way Arbitrage's `sonar`
 * is. It reuses ArbitrageServerSonarFilters' shape because the bridge reuses SonarFilterConfig for
 * it — same type, same reason both surfaces read the same live pairs.
 */
export type PairFluxLiveParams = {
  endSignalThreshold: number;
  minHoldMinutes: number;
  maxAdds: number;
  dilutionStep: number;
  addDelayMinutes: number;
  scaleMode: "single" | "scale_in";
  exitExecutionMode: "active" | "passive";
  noSpreadExit: boolean;
  maxSpread: number | null;
  minNetEdge: number;
  addMaxDeviation: number | null;
  maxOpenPositions: number;
  entryCutoffEnabled: boolean;
  entryStopTime: string | null;
  startCutoffTime: string | null;
  sessionStartTime: string | null;
  /** "pre" | "open" | "intra" — which published rating class this trades. */
  cls: "pre" | "open" | "intra";
  /** "pct" | "sigma" | "alpha" | "gamma" — what min/max/exit are measured in. */
  unit: "pct" | "sigma" | "alpha" | "gamma";
  minDeviation: number;
  maxDeviation: number | null;
  exitAt: number;
  /** The PAIR's own rating floor for cls — converged/total, not a per-ticker figure. */
  minRate: number;
  minTotal: number;
  corrRange: Bound | null;
  betaRange: Bound | null;
  sigmaRange: Bound | null;
  alphaRange: Bound | null;
  legFilters: ArbitrageServerSonarFilters | null;
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

const clsOf = (session: unknown): PairFluxLiveParams["cls"] => {
  const s = String(session ?? "").trim().toLowerCase();
  return s === "pre" ? "pre" : s === "open" ? "open" : "intra";
};

/** devUnit on the page is "pp" | "sigma" | "alpha" | "gamma"; the bridge spells the first "pct". */
const unitOf = (devUnit: unknown): PairFluxLiveParams["unit"] => {
  const u = String(devUnit ?? "").trim().toLowerCase();
  return u === "sigma" ? "sigma" : u === "alpha" ? "alpha" : u === "gamma" ? "gamma" : "pct";
};

export function toPairFluxLiveParams(args: {
  automation: StreamAutomationConfig;
  /** PRE | OPEN | INTRA, whatever casing the page uses. */
  session: string;
  /** devUnit: "pp" | "sigma" | "alpha" | "gamma". */
  unit: string;
  /** startAbs — the entry floor, in `unit`. */
  minDeviation: unknown;
  /** startAbsMax — the entry ceiling, in `unit`; empty/undefined means no ceiling. */
  maxDeviation: unknown;
  /** endAbs — the level a converging pair is judged normalized at, in `unit`. */
  exitAt: unknown;
  minRate: number;
  minTotal: number;
  corr: readonly [unknown, unknown];
  beta: readonly [unknown, unknown];
  sigma: readonly [unknown, unknown];
  alpha: readonly [unknown, unknown];
  /** The per-leg exclude-flag chain every candidate leg must pass — never optional here. */
  sonar: SonarExactFilterSnapshot;
  source: string;
}): PairFluxLiveParams {
  const a = args.automation;
  const maxDeviation = numOrNull(args.maxDeviation);
  return {
    endSignalThreshold: num(a.endSignalThreshold),
    minHoldMinutes: num(a.minHoldMinutes),
    maxAdds: num(a.maxAdds),
    dilutionStep: num(a.dilutionStep),
    addDelayMinutes: num(a.addDelayMinutes),
    scaleMode: a.scaleMode === "scale_in" ? "scale_in" : "single",
    exitExecutionMode: a.exitExecutionMode === "passive" ? "passive" : "active",
    noSpreadExit: a.noSpreadExit !== false,
    // No dedicated strategy-level spread-limit control on this toolbar today (only the
    // NoSpreadExit switch above) — null means no cap, the same inert default every other
    // unset threshold on this page gets.
    maxSpread: null,
    minNetEdge: num(a.minNetEdge),
    // Reuses the entry ceiling, same as Arbitrage's own client does with startAbsMax: a level
    // above which the toolbar said it would not enter is also the level above which it should
    // not scale in further.
    addMaxDeviation: maxDeviation,
    maxOpenPositions: num(a.maxOpenPositions),
    entryCutoffEnabled: true,
    entryStopTime: a.entryStopTime?.trim() || null,
    startCutoffTime: a.startCutoffTime?.trim() || null,
    sessionStartTime: (a as { preStartTime?: string }).preStartTime?.trim() || null,
    cls: clsOf(args.session),
    unit: unitOf(args.unit),
    minDeviation: Math.abs(num(args.minDeviation)),
    maxDeviation,
    exitAt: Math.abs(num(args.exitAt)),
    minRate: num(args.minRate),
    minTotal: num(args.minTotal),
    corrRange: bound(args.corr[0], args.corr[1]),
    betaRange: bound(args.beta[0], args.beta[1]),
    sigmaRange: bound(args.sigma[0], args.sigma[1]),
    alphaRange: bound(args.alpha[0], args.alpha[1]),
    legFilters: toArbitrageServerSonarFilters(args.sonar),
    source: args.source,
  };
}

export async function pushPairFluxLiveParams(params: PairFluxLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/pairflux/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    // Best-effort, like Arbitrage's own client: the bridge keeps whatever it last received and
    // the toolbar is unaffected.
    return false;
  }
}
