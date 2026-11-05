import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the OPGRootation Scanner's AUTO OPTIMIZER (bridge: PaperOPGRootationController.FilterSearch).
 *
 * Mirrors lib/scanner/opgReversalAutoOptimizer.ts 1-to-1 in shape (OPG•Rootation started as a clone
 * of OPG•Reversal's own pipeline, 2026-11-04) — same three numeric dials (MIN DEV short/long/max, no
 * END/MinHoldCandles — the exit is the fixed, never-swept ExitClass) and six ThresholdUnit pills
 * (pct/sigma/alpha/gamma/atr/lambda). `sweepValues` is imported rather than duplicated — it is
 * generic over any FROM/TO/STEP grid.
 */

export type OPGRootationAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type OPGRootationAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type OPGRootationAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGRootationAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: OPGRootationAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The OPGRootation Scanner exactly as it is on screen — see OPGRootationScanner.tsx's own buildOPGRootationPostRequest. */
export type PaperOPGRootationRequestLike = Record<string, unknown>;

export type OPGRootationAutoOptStartRequest = {
  base: PaperOPGRootationRequestLike;
  objective: OPGRootationAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: OPGRootationAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type OPGRootationAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type OPGRootationAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type OPGRootationAutoOptDenied = { key: string; label: string; values: string[] };
export type OPGRootationAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: OPGRootationAutoOptUnit | null;
};

export type OPGRootationAutoOptRow = {
  thresholds: OPGRootationAutoOptThresholds;
  constraints: OPGRootationAutoOptConstraint[];
  denied: OPGRootationAutoOptDenied[];
  objective: number;
  train: OPGRootationAutoOptMetrics;
  test: OPGRootationAutoOptMetrics | null;
  all: OPGRootationAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type OPGRootationAutoOptVariant = { thresholds: OPGRootationAutoOptThresholds; train: OPGRootationAutoOptMetrics; objective: number; refined: boolean };

export type OPGRootationAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: OPGRootationAutoOptRow;
  results: OPGRootationAutoOptRow[];
  variants: OPGRootationAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type OPGRootationAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: OPGRootationAutoOptResult | null;
};

export async function loadOPGRootationAutoOptParameters(base: string): Promise<OPGRootationAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: OPGRootationAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startOPGRootationAutoOptimizer(base: string, req: OPGRootationAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollOPGRootationAutoOptimizer(base: string, jobId: string): Promise<OPGRootationAutoOptJobStatus> {
  return apiGet<OPGRootationAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelOPGRootationAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
