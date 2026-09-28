import { apiGet, apiPost, apiUrl } from "./api";
import { getToken } from "@/lib/authClient";
import type { PaperArbAnalyticsRequest } from "./types";

/**
 * Client for the Arbitrage Scanner's AUTO OPTIMIZER (bridge: PaperArbitrageController.FilterSearch).
 *
 * The bridge searches the very same simulated trades the scanner lists, so a result reproduces once
 * it is written back into the toolbar. A search takes tens of seconds to minutes (every day of the
 * range is built from the tape), so it is a job: start, poll, optionally cancel.
 */

export type AutoOptObjective = "total" | "avg" | "pf" | "winrate" | "tstat";

export type AutoOptParameter = {
  key: string;
  group: "TAPE FILTERS" | "RATING GATES" | "FLAGS" | "CATEGORIES" | string;
  label: string;
  boolOnly: boolean;
};

export type AutoOptUnit = "zap" | "sigma" | "delta" | "gamma" | "alpha";

export type AutoOptThresholdSweep = {
  startAbs?: number[];
  /** null = "off" (the long side uses the short threshold) */
  startAbsNeg?: Array<number | null>;
  /** null = "off" (no upper cap on the start deviation) */
  startAbsMax?: Array<number | null>;
  endAbs?: number[];
  minHoldCandles?: number[];
  /** the ZAP unit pills to try; the same thresholds are tried under each */
  units?: AutoOptUnit[];
  maxVariants?: number;
  topVariants?: number;
};

export type AutoOptStartRequest = {
  base: PaperArbAnalyticsRequest;
  objective: AutoOptObjective;
  minTrades: number;
  validate: boolean;
  holdoutFraction?: number;
  topResults: number;
  /** Every parameter the search may change. Anything not listed keeps the toolbar's current value. */
  parameterKeys: string[];
  thresholds?: AutoOptThresholdSweep | null;
  /** Let MINRATE / MINTOTAL be searched below the scanner's current gate (builds every rated ticker: much bigger). */
  ratingFromZero?: boolean;
  /**
   * ITB / HARD are applied by the page after the bridge returns its rows, so the bridge cannot see
   * them in `base`. Sent separately: the search treats them as fixed and only looks at trades that pass.
   */
  excludeItb?: boolean;
  excludeHard?: boolean;
};

export type AutoOptMetrics = {
  trades: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  winRate: number;
  profitFactor: number;
  tStat: number;
};

export type AutoOptConstraint = { key: string; label: string; group: string; min: number | null; max: number | null };
export type AutoOptDenied = { key: string; label: string; values: string[] };
export type AutoOptThresholds = {
  startAbs: number | null;
  startAbsNeg: number | null;
  startAbsMax: number | null;
  endAbs: number | null;
  minHoldCandles: number | null;
  unit: AutoOptUnit | null;
};

export type AutoOptRow = {
  thresholds: AutoOptThresholds;
  constraints: AutoOptConstraint[];
  denied: AutoOptDenied[];
  objective: number;
  train: AutoOptMetrics;
  test: AutoOptMetrics | null;
  all: AutoOptMetrics;
  stability: { neighbours: number; share: number; worst: number } | null;
};

export type AutoOptVariant = { thresholds: AutoOptThresholds; train: AutoOptMetrics; objective: number; refined: boolean };

export type AutoOptResult = {
  objective: string;
  universe: number;
  days: number;
  testDays: number;
  minTrades: number;
  validate: boolean;
  current: AutoOptRow;
  results: AutoOptRow[];
  variants: AutoOptVariant[];
  notes: string[];
  elapsedSeconds: number;
};

export type AutoOptJobStatus = {
  ok: boolean;
  jobId: string;
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
  elapsedSeconds: number;
  result: AutoOptResult | null;
};

export async function loadAutoOptParameters(base: string): Promise<AutoOptParameter[]> {
  const j = await apiGet<{ parameters?: AutoOptParameter[] }>(`${base}/optimizer/search/parameters`);
  return Array.isArray(j?.parameters) ? j.parameters : [];
}

export async function startAutoOptimizer(base: string, req: AutoOptStartRequest): Promise<string> {
  const j = await apiPost<{ ok: boolean; jobId: string }>(`${base}/optimizer/search`, req);
  if (!j?.jobId) throw new Error("The bridge did not return a job id");
  return j.jobId;
}

export function pollAutoOptimizer(base: string, jobId: string): Promise<AutoOptJobStatus> {
  return apiGet<AutoOptJobStatus>(`${base}/optimizer/search/${encodeURIComponent(jobId)}`);
}

export async function cancelAutoOptimizer(base: string, jobId: string): Promise<void> {
  const token = getToken();
  await fetch(apiUrl(`${base}/optimizer/search/${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

/**
 * Values from `from` to `to` in steps of `step`, rounded to the step's own decimals (0.1 + 0.2 must
 * not become 0.30000000000000004 in a threshold that is then sent to the bridge). Capped, so a
 * mistyped step cannot ask for thousands of combinations.
 */
export function sweepValues(from: number, to: number, step: number, cap = 12): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0 || to < from) return [];
  const decimals = Math.min(6, (String(step).split(".")[1] ?? "").length);
  const out: number[] = [];
  for (let i = 0; i < cap; i += 1) {
    const v = +(from + i * step).toFixed(decimals);
    if (v > to + 1e-9) break;
    out.push(v);
  }
  return out;
}
