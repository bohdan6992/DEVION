import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the LaunchEvening Scanner's AUTO OPTIMIZER (bridge: PaperLaunchEveningController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * LaunchEvening's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — LaunchEvening's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type LaunchEveningAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type LaunchEveningAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type LaunchEveningAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type LaunchEveningAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: LaunchEveningAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The LaunchEvening Scanner exactly as it is on screen — see LaunchEveningScanner.tsx's own buildLaunchEveningPostRequest. */
export type PaperLaunchEveningRequestLike = Record<string, unknown>;

export type LaunchEveningAutoOptStartRequest = {
  base: PaperLaunchEveningRequestLike;
  objective: LaunchEveningAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: LaunchEveningAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type LaunchEveningAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type LaunchEveningAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type LaunchEveningAutoOptDenied = { key: string; label: string; values: string[] };
export type LaunchEveningAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: LaunchEveningAutoOptUnit | null;
};

export type LaunchEveningAutoOptRow = {
  thresholds: LaunchEveningAutoOptThresholds;
  constraints: LaunchEveningAutoOptConstraint[];
  denied: LaunchEveningAutoOptDenied[];
  objective: number;
  train: LaunchEveningAutoOptMetrics;
  test: LaunchEveningAutoOptMetrics | null;
  all: LaunchEveningAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type LaunchEveningAutoOptVariant = { thresholds: LaunchEveningAutoOptThresholds; train: LaunchEveningAutoOptMetrics; objective: number; refined: boolean };

export type LaunchEveningAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: LaunchEveningAutoOptRow;
  results: LaunchEveningAutoOptRow[];
  variants: LaunchEveningAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type LaunchEveningAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: LaunchEveningAutoOptResult | null;
};

export async function loadLaunchEveningAutoOptParameters(base: string): Promise<LaunchEveningAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: LaunchEveningAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startLaunchEveningAutoOptimizer(base: string, req: LaunchEveningAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollLaunchEveningAutoOptimizer(base: string, jobId: string): Promise<LaunchEveningAutoOptJobStatus> {
  return apiGet<LaunchEveningAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelLaunchEveningAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
