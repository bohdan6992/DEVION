import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import { sweepValues } from "./autoOptimizer";

/**
 * Client for the StretchFade Scanner's AUTO OPTIMIZER (bridge: PaperStretchFadeController.FilterSearch).
 *
 * Mirrors lib/scanner/autoOptimizer.ts (Arbitrage's own client) 1-to-1 in shape, retargeted at
 * StretchFade's own three numeric dials (MIN DEV short/long/max, no END/MinHoldCandles — StretchFade's
 * exit is the single 09:30 open and its ExitClass is never swept) and its THREE ThresholdUnit pills
 * (sig/alpha/gamma) instead of Arbitrage's five ZAP units. `sweepValues` is imported rather than
 * duplicated — it is generic over any FROM/TO/STEP grid.
 *
 * EVERY MIN DEV VALUE SWEPT HERE IS IN SIGMAS, not percentage points: the signal is final.parquet's
 * `dev_sig` (ZAP SIG), already a deviation over a dispersion. A grid of 0.5..3.0 means half a sigma
 * to three sigmas. There is deliberately no %, σ-as-divisor, τ or λ pill — see
 * StretchFadeScanner.tsx's own stretchFadeUnitMode comment for why each of those is a unit error on
 * this axis rather than a choice.
 */

export type StretchFadeAutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type StretchFadeAutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | string;
  label: string;
  boolOnly: boolean;
};

export type StretchFadeAutoOptUnit = "sig" | "alpha" | "gamma";

export type StretchFadeAutoOptThresholdSweep = {
  minDevAbsShort?: number[];
  minDevAbsLong?: number[];
  /** null = "off" (no upper cap) */
  minDevAbsMax?: Array<number | null>;
  /** the ThresholdUnit pills to try; the same MIN DEV values are tried under each */
  units?: StretchFadeAutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

/** The StretchFade Scanner exactly as it is on screen — see StretchFadeScanner.tsx's own buildStretchFadePostRequest. */
export type PaperStretchFadeRequestLike = Record<string, unknown>;

export type StretchFadeAutoOptStartRequest = {
  base: PaperStretchFadeRequestLike;
  objective: StretchFadeAutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: StretchFadeAutoOptThresholdSweep | null;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type StretchFadeAutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type StretchFadeAutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type StretchFadeAutoOptDenied = { key: string; label: string; values: string[] };
export type StretchFadeAutoOptThresholds = {
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  unit: StretchFadeAutoOptUnit | null;
};

export type StretchFadeAutoOptRow = {
  thresholds: StretchFadeAutoOptThresholds;
  constraints: StretchFadeAutoOptConstraint[];
  denied: StretchFadeAutoOptDenied[];
  objective: number;
  train: StretchFadeAutoOptMetrics;
  test: StretchFadeAutoOptMetrics | null;
  all: StretchFadeAutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type StretchFadeAutoOptVariant = { thresholds: StretchFadeAutoOptThresholds; train: StretchFadeAutoOptMetrics; objective: number; refined: boolean };

export type StretchFadeAutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: StretchFadeAutoOptRow;
  results: StretchFadeAutoOptRow[];
  variants: StretchFadeAutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type StretchFadeAutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: StretchFadeAutoOptResult | null;
};

export async function loadStretchFadeAutoOptParameters(base: string): Promise<StretchFadeAutoOptParameter[]> {
  const j = await apiGet<{ parameters?: StretchFadeAutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startStretchFadeAutoOptimizer(base: string, req: StretchFadeAutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollStretchFadeAutoOptimizer(base: string, jobId: string): Promise<StretchFadeAutoOptJobStatus> {
  return apiGet<StretchFadeAutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelStretchFadeAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

export { sweepValues };
