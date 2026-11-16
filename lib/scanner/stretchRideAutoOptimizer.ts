import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the StretchRide Scanner's AUTO OPTIMIZER (bridge: PaperStretchRideController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * StretchRide's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — StretchRide's
 * exit is the single 09:30 open and its ExitClass is never swept) and its THREE ThresholdUnit pills
 * (sig/alpha/gamma) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 *
 * EVERY MIN DEV VALUE SWEPT HERE IS IN SIGMAS, not percentage points: the signal is final.parquet's
 * `dev_sig` (ZAP SIG), already a deviation over a dispersion. A grid of 0.5..3.0 means half a sigma
 * to three sigmas. There is deliberately no %, σ-as-divisor, τ or λ pill — see
 * STRETCHRideScanner.tsx's own stretchRideUnitMode comment for why each of those is a unit error on
 * this axis rather than a choice.
 */

export type StretchRideAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type StretchRideAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type StretchRideAutoOptUnit = "sig" | "alpha" | "gamma";

export type StretchRideAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: StretchRideAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The StretchRide Scanner exactly as it is on screen — see StretchRideScanner.tsx's own buildStretchRidePostRequest. */
export type PaperStretchRideRequestLike = Record<string, unknown>;

export type StretchRideAutoOptStartRequest = {
  base: PaperStretchRideRequestLike;
  objective: StretchRideAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: StretchRideAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type StretchRideAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type StretchRideAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type StretchRideAutoOptDenied = { key: string; label: string; values: string[] };
export type StretchRideAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: StretchRideAutoOptUnit | null;
};

export type StretchRideAutoOptRow = {
  thresholds: StretchRideAutoOptThresholds;
  constraints: StretchRideAutoOptConstraint[];
  denied: StretchRideAutoOptDenied[];
  objective: number;
  train: StretchRideAutoOptMetrics;
  test: StretchRideAutoOptMetrics | null;
  all: StretchRideAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type StretchRideAutoOptVariant = { thresholds: StretchRideAutoOptThresholds; train: StretchRideAutoOptMetrics; objective: number; refined: boolean };

export type StretchRideAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: StretchRideAutoOptRow;
  results: StretchRideAutoOptRow[];
  variants: StretchRideAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type StretchRideAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: StretchRideAutoOptResult | null;
};

export async function loadStretchRideAutoOptParameters(base: string): Promise<StretchRideAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: StretchRideAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startStretchRideAutoOptimizer(base: string, req: StretchRideAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollStretchRideAutoOptimizer(base: string, jobId: string): Promise<StretchRideAutoOptJobStatus> {
  return apiGet<StretchRideAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelStretchRideAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
