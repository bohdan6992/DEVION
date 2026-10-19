import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the PullBack Scanner's AUTO OPTIMIZER (bridge: PaperPullBackController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * PullBack's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — PullBack's
 * exit is a single 09:30 clock time shared by every class, and the class is the never-swept
 * EntryClass) and its ThresholdUnit pills (pct/sigma/alpha/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type PullBackAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type PullBackAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type PullBackAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type PullBackAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: PullBackAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The PullBack Scanner exactly as it is on screen — see PullBackScanner.tsx's own buildPullBackPostRequest. */
export type PaperPullBackRequestLike = Record<string, unknown>;

export type PullBackAutoOptStartRequest = {
  base: PaperPullBackRequestLike;
  objective: PullBackAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: PullBackAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type PullBackAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type PullBackAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type PullBackAutoOptDenied = { key: string; label: string; values: string[] };
export type PullBackAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: PullBackAutoOptUnit | null;
};

export type PullBackAutoOptRow = {
  thresholds: PullBackAutoOptThresholds;
  constraints: PullBackAutoOptConstraint[];
  denied: PullBackAutoOptDenied[];
  objective: number;
  train: PullBackAutoOptMetrics;
  test: PullBackAutoOptMetrics | null;
  all: PullBackAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type PullBackAutoOptVariant = { thresholds: PullBackAutoOptThresholds; train: PullBackAutoOptMetrics; objective: number; refined: boolean };

export type PullBackAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: PullBackAutoOptRow;
  results: PullBackAutoOptRow[];
  variants: PullBackAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type PullBackAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: PullBackAutoOptResult | null;
};

export async function loadPullBackAutoOptParameters(base: string): Promise<PullBackAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: PullBackAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startPullBackAutoOptimizer(base: string, req: PullBackAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollPullBackAutoOptimizer(base: string, jobId: string): Promise<PullBackAutoOptJobStatus> {
  return apiGet<PullBackAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelPullBackAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
