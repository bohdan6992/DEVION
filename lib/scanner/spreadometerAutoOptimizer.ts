import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the Spreadometer Scanner's AUTO OPTIMIZER (bridge: PaperLimiterController.FilterSearch
 * — the paper endpoint itself is still named for Limiter, the universe this screen filters; see
 * registry.ts's own note on why Spreadometer and Limiter share one `/api/paper/limiter` base).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * this screen's three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — the exit is
 * the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid. File renamed from limiterAutoOptimizer.ts
 * 2026-11-02, the operator's own instruction — see SpreadometerScanner.tsx's own header comment.
 */

export type SpreadometerAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type SpreadometerAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type SpreadometerAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type SpreadometerAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: SpreadometerAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The Scanner exactly as it is on screen — see SpreadometerScanner.tsx's own buildLimiterPostRequest. */
export type PaperLimiterRequestLike = Record<string, unknown>;

export type SpreadometerAutoOptStartRequest = {
  base: PaperLimiterRequestLike;
  objective: SpreadometerAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: SpreadometerAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type SpreadometerAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type SpreadometerAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type SpreadometerAutoOptDenied = { key: string; label: string; values: string[] };
export type SpreadometerAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: SpreadometerAutoOptUnit | null;
};

export type SpreadometerAutoOptRow = {
  thresholds: SpreadometerAutoOptThresholds;
  constraints: SpreadometerAutoOptConstraint[];
  denied: SpreadometerAutoOptDenied[];
  objective: number;
  train: SpreadometerAutoOptMetrics;
  test: SpreadometerAutoOptMetrics | null;
  all: SpreadometerAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type SpreadometerAutoOptVariant = { thresholds: SpreadometerAutoOptThresholds; train: SpreadometerAutoOptMetrics; objective: number; refined: boolean };

export type SpreadometerAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: SpreadometerAutoOptRow;
  results: SpreadometerAutoOptRow[];
  variants: SpreadometerAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type SpreadometerAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: SpreadometerAutoOptResult | null;
};

export async function loadSpreadometerAutoOptParameters(base: string): Promise<SpreadometerAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: SpreadometerAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startSpreadometerAutoOptimizer(base: string, req: SpreadometerAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollSpreadometerAutoOptimizer(base: string, jobId: string): Promise<SpreadometerAutoOptJobStatus> {
  return apiGet<SpreadometerAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelSpreadometerAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
