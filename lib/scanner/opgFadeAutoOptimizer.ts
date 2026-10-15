import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the OPGFade Scanner's AUTO OPTIMIZER (bridge: PaperOPGFadeController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * OPGFade's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — OPGFade's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type OPGFadeAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type OPGFadeAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type OPGFadeAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGFadeAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: OPGFadeAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The OPGFade Scanner exactly as it is on screen — see OPGFadeScanner.tsx's own buildOPGFadePostRequest. */
export type PaperOPGFadeRequestLike = Record<string, unknown>;

export type OPGFadeAutoOptStartRequest = {
  base: PaperOPGFadeRequestLike;
  objective: OPGFadeAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: OPGFadeAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type OPGFadeAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type OPGFadeAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type OPGFadeAutoOptDenied = { key: string; label: string; values: string[] };
export type OPGFadeAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: OPGFadeAutoOptUnit | null;
};

export type OPGFadeAutoOptRow = {
  thresholds: OPGFadeAutoOptThresholds;
  constraints: OPGFadeAutoOptConstraint[];
  denied: OPGFadeAutoOptDenied[];
  objective: number;
  train: OPGFadeAutoOptMetrics;
  test: OPGFadeAutoOptMetrics | null;
  all: OPGFadeAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type OPGFadeAutoOptVariant = { thresholds: OPGFadeAutoOptThresholds; train: OPGFadeAutoOptMetrics; objective: number; refined: boolean };

export type OPGFadeAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: OPGFadeAutoOptRow;
  results: OPGFadeAutoOptRow[];
  variants: OPGFadeAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type OPGFadeAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: OPGFadeAutoOptResult | null;
};

export async function loadOPGFadeAutoOptParameters(base: string): Promise<OPGFadeAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: OPGFadeAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startOPGFadeAutoOptimizer(base: string, req: OPGFadeAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollOPGFadeAutoOptimizer(base: string, jobId: string): Promise<OPGFadeAutoOptJobStatus> {
  return apiGet<OPGFadeAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelOPGFadeAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
