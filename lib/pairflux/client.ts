/**
 * PairFlux ratings client.
 *
 * The one endpoint family that currently has real data behind it. The forked Arbitrage scanner
 * calls /episodes/search, /active, /analytics, /optimizer/ranges and /scope/evaluate under the same
 * base — none of those exist for PairFlux, because there is no tape engine for a pair spread yet.
 * Anything reading pair data should come through here instead.
 *
 * Row model: TICKER with an attached PARTNER, per the strategy decision. The backend indexes each
 * published pair under both of its legs, so a query for ticker A returns the rows where A was
 * ticker_a AND the mirrored rows where it was ticker_b (`inverted: true`).
 */

import { apiGet } from "../scanner/api";
import { getLiveStrategy } from "../strategies/registry";

const BASE = getLiveStrategy("pairflux")!.api.paperBase;

/** Class keys as the notebook publishes them. */
export type PairFluxClass = "pre" | "open" | "intra";

export type PairFluxRow = {
  ticker: string;
  partner: string;
  bench: string;
  /**
   * True when this row is the mirror of the published (partner, ticker) row: long/short are
   * swapped and beta is reported as 1/beta. Undirected fields (total, converged, rate, corr)
   * are identical either way. A mirrored beta is an ESTIMATE — an OLS slope is not symmetric.
   */
  inverted: boolean;
  cls: PairFluxClass;

  /** Every divergence episode in the class window. */
  total: number;
  converged: number;
  unresolved: number;
  /** converged / total — the rating, a proportion. */
  rate: number | null;
  /** Wilson 95% lower bound. Rank on this, not on rate. */
  rateLb: number | null;
  /** Episodes ending in profit / all. Null on published builds older than the forced-exit change. */
  winRate: number | null;
  /** Completed diverge->converge cycles per session. Null on older builds. */
  convPerDay: number | null;
  /** Expected take per episode, pp. Signed. Null on older builds. */
  capMean: number | null;
  capP10: number | null;
  capLb: number | null;
  /**
   * ALPHA — median peak deviation among the episodes that came back, pp. "How far this pair
   * typically stretches before converging", so dev / alpha reads a deviation against its habit.
   */
  alpha: number | null;
  /**
   * SIGMA — the LARGEST deviation this pair still returns from, pp. Null when the pair never
   * clears the bar at any level, which is a real answer and not missing data.
   */
  sigma: number | null;
  /** Convergence at that sigma level, and how many episodes it rests on. */
  sigmaRate: number | null;
  sigmaN: number;
  /** The spread's own standard deviation over the class window, pp. */
  residStd: number | null;
  medianBars: number | null;
  corr: number | null;
  beta: number | null;
  longTotal: number;
  longRate: number | null;
  shortTotal: number;
  shortRate: number | null;
  nDays: number;
};

export type PairFluxRatingsResponse = {
  ok: boolean;
  count: number;
  totalMatched?: number;
  classes?: string[];
  /**
   * Columns the published file does not carry. Surface this — a null convPerDay means "the build
   * predates the column", not "this pair never converges", and the two must not look the same.
   */
  missingColumns?: string[];
  rows: PairFluxRow[];
  error?: string;
};

export type PairFluxStatus = {
  ok: boolean;
  pairs: number;
  tickers: number;
  classes: string[];
  missingColumns: string[];
  note: string | null;
};

export type PairFluxQuery = {
  cls?: PairFluxClass;
  bench?: string;
  minRate?: number;
  minTotal?: number;
  minConvPerDay?: number;
  minCorr?: number;
  /** Drop the mirrored rows, leaving one row per published pair. */
  includeInverted?: boolean;
  sort?: "convPerDay" | "rate" | "rateLb" | "total" | "capMean";
  limit?: number;
};

function qs(q: PairFluxQuery): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Whether ratings are published at all, and which optional columns the build is missing. */
export function fetchPairFluxStatus(): Promise<PairFluxStatus> {
  return apiGet<PairFluxStatus>(`${BASE}/ratings/status`);
}

/** The pair table as flat ticker x partner x class rows. */
export function fetchPairFluxRatings(q: PairFluxQuery = {}): Promise<PairFluxRatingsResponse> {
  return apiGet<PairFluxRatingsResponse>(`${BASE}/ratings${qs(q)}`);
}

/** Every partner published against one ticker, both directions. */
export function fetchPairFluxForTicker(
  ticker: string,
  cls?: PairFluxClass
): Promise<{ ok: boolean; ticker: string; count?: number; rows: PairFluxRow[] }> {
  const t = encodeURIComponent(ticker.trim().toUpperCase());
  const suffix = cls ? `?cls=${encodeURIComponent(cls)}` : "";
  return apiGet(`${BASE}/ratings/${t}${suffix}`);
}
