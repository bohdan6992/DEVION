import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the OPGContinuum Scanner's AUTO OPTIMIZER (bridge: PaperOPGContinuumController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * OPGContinuum's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — OPGContinuum's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type OPGContinuumAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type OPGContinuumAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type OPGContinuumAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGContinuumAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: OPGContinuumAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The OPGContinuum Scanner exactly as it is on screen — see OPGContinuumScanner.tsx's own buildOPGContinuumPostRequest. */
export type PaperOPGContinuumRequestLike = Record<string, unknown>;

export type OPGContinuumAutoOptStartRequest = {
  base: PaperOPGContinuumRequestLike;
  objective: OPGContinuumAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: OPGContinuumAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type OPGContinuumAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type OPGContinuumAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type OPGContinuumAutoOptDenied = { key: string; label: string; values: string[] };
export type OPGContinuumAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: OPGContinuumAutoOptUnit | null;
};

export type OPGContinuumAutoOptRow = {
  thresholds: OPGContinuumAutoOptThresholds;
  constraints: OPGContinuumAutoOptConstraint[];
  denied: OPGContinuumAutoOptDenied[];
  objective: number;
  train: OPGContinuumAutoOptMetrics;
  test: OPGContinuumAutoOptMetrics | null;
  all: OPGContinuumAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type OPGContinuumAutoOptVariant = { thresholds: OPGContinuumAutoOptThresholds; train: OPGContinuumAutoOptMetrics; objective: number; refined: boolean };

export type OPGContinuumAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: OPGContinuumAutoOptRow;
  results: OPGContinuumAutoOptRow[];
  variants: OPGContinuumAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type OPGContinuumAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: OPGContinuumAutoOptResult | null;
};

export async function loadOPGContinuumAutoOptParameters(base: string): Promise<OPGContinuumAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: OPGContinuumAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startOPGContinuumAutoOptimizer(base: string, req: OPGContinuumAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollOPGContinuumAutoOptimizer(base: string, jobId: string): Promise<OPGContinuumAutoOptJobStatus> {
  return apiGet<OPGContinuumAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelOPGContinuumAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
