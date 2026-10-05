import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the VWAPBounce Scanner's AUTO OPTIMIZER (bridge: PaperVWAPBounceController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * VWAPBounce's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — VWAPBounce's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type VWAPBounceAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type VWAPBounceAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type VWAPBounceAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type VWAPBounceAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: VWAPBounceAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The VWAPBounce Scanner exactly as it is on screen — see VWAPBounceScanner.tsx's own buildVWAPBouncePostRequest. */
export type PaperVWAPBounceRequestLike = Record<string, unknown>;

export type VWAPBounceAutoOptStartRequest = {
  base: PaperVWAPBounceRequestLike;
  objective: VWAPBounceAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: VWAPBounceAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type VWAPBounceAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type VWAPBounceAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type VWAPBounceAutoOptDenied = { key: string; label: string; values: string[] };
export type VWAPBounceAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: VWAPBounceAutoOptUnit | null;
};

export type VWAPBounceAutoOptRow = {
  thresholds: VWAPBounceAutoOptThresholds;
  constraints: VWAPBounceAutoOptConstraint[];
  denied: VWAPBounceAutoOptDenied[];
  objective: number;
  train: VWAPBounceAutoOptMetrics;
  test: VWAPBounceAutoOptMetrics | null;
  all: VWAPBounceAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type VWAPBounceAutoOptVariant = { thresholds: VWAPBounceAutoOptThresholds; train: VWAPBounceAutoOptMetrics; objective: number; refined: boolean };

export type VWAPBounceAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: VWAPBounceAutoOptRow;
  results: VWAPBounceAutoOptRow[];
  variants: VWAPBounceAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type VWAPBounceAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: VWAPBounceAutoOptResult | null;
};

export async function loadVWAPBounceAutoOptParameters(base: string): Promise<VWAPBounceAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: VWAPBounceAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startVWAPBounceAutoOptimizer(base: string, req: VWAPBounceAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollVWAPBounceAutoOptimizer(base: string, jobId: string): Promise<VWAPBounceAutoOptJobStatus> {
  return apiGet<VWAPBounceAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelVWAPBounceAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
