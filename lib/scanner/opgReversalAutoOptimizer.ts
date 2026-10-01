import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the OPGReversal Scanner's AUTO OPTIMIZER (bridge: PaperOPGReversalController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * OPGReversal's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — OPGReversal's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type OPGReversalAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type OPGReversalAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type OPGReversalAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGReversalAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: OPGReversalAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The OPGReversal Scanner exactly as it is on screen — see OPGReversalScanner.tsx's own buildOPGReversalPostRequest. */
export type PaperOPGReversalRequestLike = Record<string, unknown>;

export type OPGReversalAutoOptStartRequest = {
  base: PaperOPGReversalRequestLike;
  objective: OPGReversalAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: OPGReversalAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type OPGReversalAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type OPGReversalAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type OPGReversalAutoOptDenied = { key: string; label: string; values: string[] };
export type OPGReversalAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: OPGReversalAutoOptUnit | null;
};

export type OPGReversalAutoOptRow = {
  thresholds: OPGReversalAutoOptThresholds;
  constraints: OPGReversalAutoOptConstraint[];
  denied: OPGReversalAutoOptDenied[];
  objective: number;
  train: OPGReversalAutoOptMetrics;
  test: OPGReversalAutoOptMetrics | null;
  all: OPGReversalAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type OPGReversalAutoOptVariant = { thresholds: OPGReversalAutoOptThresholds; train: OPGReversalAutoOptMetrics; objective: number; refined: boolean };

export type OPGReversalAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: OPGReversalAutoOptRow;
  results: OPGReversalAutoOptRow[];
  variants: OPGReversalAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type OPGReversalAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: OPGReversalAutoOptResult | null;
};

export async function loadOPGReversalAutoOptParameters(base: string): Promise<OPGReversalAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: OPGReversalAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startOPGReversalAutoOptimizer(base: string, req: OPGReversalAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollOPGReversalAutoOptimizer(base: string, jobId: string): Promise<OPGReversalAutoOptJobStatus> {
  return apiGet<OPGReversalAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelOPGReversalAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
