import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the Limiter Scanner's AUTO OPTIMIZER (bridge: PaperLimiterController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * Limiter's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — Limiter's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type LimiterAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type LimiterAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type LimiterAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type LimiterAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: LimiterAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The Limiter Scanner exactly as it is on screen — see LimiterScanner.tsx's own buildLimiterPostRequest. */
export type PaperLimiterRequestLike = Record<string, unknown>;

export type LimiterAutoOptStartRequest = {
  base: PaperLimiterRequestLike;
  objective: LimiterAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: LimiterAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type LimiterAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type LimiterAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type LimiterAutoOptDenied = { key: string; label: string; values: string[] };
export type LimiterAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: LimiterAutoOptUnit | null;
};

export type LimiterAutoOptRow = {
  thresholds: LimiterAutoOptThresholds;
  constraints: LimiterAutoOptConstraint[];
  denied: LimiterAutoOptDenied[];
  objective: number;
  train: LimiterAutoOptMetrics;
  test: LimiterAutoOptMetrics | null;
  all: LimiterAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type LimiterAutoOptVariant = { thresholds: LimiterAutoOptThresholds; train: LimiterAutoOptMetrics; objective: number; refined: boolean };

export type LimiterAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: LimiterAutoOptRow;
  results: LimiterAutoOptRow[];
  variants: LimiterAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type LimiterAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: LimiterAutoOptResult | null;
};

export async function loadLimiterAutoOptParameters(base: string): Promise<LimiterAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: LimiterAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startLimiterAutoOptimizer(base: string, req: LimiterAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollLimiterAutoOptimizer(base: string, jobId: string): Promise<LimiterAutoOptJobStatus> {
  return apiGet<LimiterAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelLimiterAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
