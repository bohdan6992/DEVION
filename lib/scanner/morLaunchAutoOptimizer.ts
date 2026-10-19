import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the MorLaunch Scanner's AUTO OPTIMIZER (bridge: PaperMorLaunchController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * MorLaunch's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — MorLaunch's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type MorLaunchAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type MorLaunchAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type MorLaunchAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type MorLaunchAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: MorLaunchAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The MorLaunch Scanner exactly as it is on screen — see MorLaunchScanner.tsx's own buildMorLaunchPostRequest. */
export type PaperMorLaunchRequestLike = Record<string, unknown>;

export type MorLaunchAutoOptStartRequest = {
  base: PaperMorLaunchRequestLike;
  objective: MorLaunchAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: MorLaunchAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type MorLaunchAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type MorLaunchAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type MorLaunchAutoOptDenied = { key: string; label: string; values: string[] };
export type MorLaunchAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: MorLaunchAutoOptUnit | null;
};

export type MorLaunchAutoOptRow = {
  thresholds: MorLaunchAutoOptThresholds;
  constraints: MorLaunchAutoOptConstraint[];
  denied: MorLaunchAutoOptDenied[];
  objective: number;
  train: MorLaunchAutoOptMetrics;
  test: MorLaunchAutoOptMetrics | null;
  all: MorLaunchAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type MorLaunchAutoOptVariant = { thresholds: MorLaunchAutoOptThresholds; train: MorLaunchAutoOptMetrics; objective: number; refined: boolean };

export type MorLaunchAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: MorLaunchAutoOptRow;
  results: MorLaunchAutoOptRow[];
  variants: MorLaunchAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type MorLaunchAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: MorLaunchAutoOptResult | null;
};

export async function loadMorLaunchAutoOptParameters(base: string): Promise<MorLaunchAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: MorLaunchAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startMorLaunchAutoOptimizer(base: string, req: MorLaunchAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollMorLaunchAutoOptimizer(base: string, jobId: string): Promise<MorLaunchAutoOptJobStatus> {
  return apiGet<MorLaunchAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelMorLaunchAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
