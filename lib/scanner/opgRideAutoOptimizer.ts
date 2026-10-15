import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the OPGRide Scanner's AUTO OPTIMIZER (bridge: PaperOPGRideController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * OPGRide's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — OPGRide's
 * exit is the fixed, never-swept ExitClass) and its six ThresholdUnit pills (pct/sigma/alpha/gamma/
 * atr/lambda) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 */

export type OPGRideAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type OPGRideAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type OPGRideAutoOptUnit = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type OPGRideAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: OPGRideAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The OPGRide Scanner exactly as it is on screen — see OPGRideScanner.tsx's own buildOPGRidePostRequest. */
export type PaperOPGRideRequestLike = Record<string, unknown>;

export type OPGRideAutoOptStartRequest = {
  base: PaperOPGRideRequestLike;
  objective: OPGRideAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: OPGRideAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type OPGRideAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type OPGRideAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type OPGRideAutoOptDenied = { key: string; label: string; values: string[] };
export type OPGRideAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: OPGRideAutoOptUnit | null;
};

export type OPGRideAutoOptRow = {
  thresholds: OPGRideAutoOptThresholds;
  constraints: OPGRideAutoOptConstraint[];
  denied: OPGRideAutoOptDenied[];
  objective: number;
  train: OPGRideAutoOptMetrics;
  test: OPGRideAutoOptMetrics | null;
  all: OPGRideAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type OPGRideAutoOptVariant = { thresholds: OPGRideAutoOptThresholds; train: OPGRideAutoOptMetrics; objective: number; refined: boolean };

export type OPGRideAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: OPGRideAutoOptRow;
  results: OPGRideAutoOptRow[];
  variants: OPGRideAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type OPGRideAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: OPGRideAutoOptResult | null;
};

export async function loadOPGRideAutoOptParameters(base: string): Promise<OPGRideAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: OPGRideAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startOPGRideAutoOptimizer(base: string, req: OPGRideAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollOPGRideAutoOptimizer(base: string, jobId: string): Promise<OPGRideAutoOptJobStatus> {
  return apiGet<OPGRideAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelOPGRideAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
