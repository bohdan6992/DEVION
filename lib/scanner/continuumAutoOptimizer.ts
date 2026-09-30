import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the Continuum Scanner's AUTO OPTIMIZER (bridge: PaperContinuumController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * Continuum's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — Continuum's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type ContinuumAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type ContinuumAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type ContinuumAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type ContinuumAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: ContinuumAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The Continuum Scanner exactly as it is on screen — see ContinuumScanner.tsx's own buildContinuumPostRequest. */
export type PaperContinuumRequestLike = Record<string, unknown>;

export type ContinuumAutoOptStartRequest = {
  base: PaperContinuumRequestLike;
  objective: ContinuumAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: ContinuumAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type ContinuumAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type ContinuumAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type ContinuumAutoOptDenied = { key: string; label: string; values: string[] };
export type ContinuumAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: ContinuumAutoOptUnit | null;
};

export type ContinuumAutoOptRow = {
  thresholds: ContinuumAutoOptThresholds;
  constraints: ContinuumAutoOptConstraint[];
  denied: ContinuumAutoOptDenied[];
  objective: number;
  train: ContinuumAutoOptMetrics;
  test: ContinuumAutoOptMetrics | null;
  all: ContinuumAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type ContinuumAutoOptVariant = { thresholds: ContinuumAutoOptThresholds; train: ContinuumAutoOptMetrics; objective: number; refined: boolean };

export type ContinuumAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: ContinuumAutoOptRow;
  results: ContinuumAutoOptRow[];
  variants: ContinuumAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type ContinuumAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: ContinuumAutoOptResult | null;
};

export async function loadContinuumAutoOptParameters(base: string): Promise<ContinuumAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: ContinuumAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startContinuumAutoOptimizer(base: string, req: ContinuumAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollContinuumAutoOptimizer(base: string, jobId: string): Promise<ContinuumAutoOptJobStatus> {
  return apiGet<ContinuumAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelContinuumAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
