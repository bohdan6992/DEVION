import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the Reversal Scanner's AUTO OPTIMIZER (bridge: PaperReversalController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * Reversal's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — Reversal's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type ReversalAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type ReversalAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type ReversalAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type ReversalAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: ReversalAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The Reversal Scanner exactly as it is on screen — see ReversalScanner.tsx's own buildReversalPostRequest. */
export type PaperReversalRequestLike = Record<string, unknown>;

export type ReversalAutoOptStartRequest = {
  base: PaperReversalRequestLike;
  objective: ReversalAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: ReversalAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type ReversalAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type ReversalAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type ReversalAutoOptDenied = { key: string; label: string; values: string[] };
export type ReversalAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: ReversalAutoOptUnit | null;
};

export type ReversalAutoOptRow = {
  thresholds: ReversalAutoOptThresholds;
  constraints: ReversalAutoOptConstraint[];
  denied: ReversalAutoOptDenied[];
  objective: number;
  train: ReversalAutoOptMetrics;
  test: ReversalAutoOptMetrics | null;
  all: ReversalAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type ReversalAutoOptVariant = { thresholds: ReversalAutoOptThresholds; train: ReversalAutoOptMetrics; objective: number; refined: boolean };

export type ReversalAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: ReversalAutoOptRow;
  results: ReversalAutoOptRow[];
  variants: ReversalAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type ReversalAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: ReversalAutoOptResult | null;
};

export async function loadReversalAutoOptParameters(base: string): Promise<ReversalAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: ReversalAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startReversalAutoOptimizer(base: string, req: ReversalAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollReversalAutoOptimizer(base: string, jobId: string): Promise<ReversalAutoOptJobStatus> {
  return apiGet<ReversalAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelReversalAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
