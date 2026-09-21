/**
 * "Best settings" search shared by both Scout pages.
 *
 * The page hands over one flat TABLE of every trade that survives the gates the search does NOT touch
 * (window, ETF/country/sector, the |pnl| cap), with each searchable number precomputed per trade:
 * its entry value in every unit, ρ/β/σ/α, and the published rating of its own class and side. A
 * candidate configuration is then scored by ONE pass over the table - no per-candidate rebuild - so a
 * few thousand candidates cost a second or two on 100k trades.
 *
 * The search is a coordinate ascent, run once per unit (%, σ, γ, …): start with everything off, and
 * for one setting at a time try every candidate value (quantiles of the data itself) and keep the best,
 * cycling until a full round changes nothing. It finds a good LOCAL optimum, not a proven global one, and
 * it is IN-SAMPLE by construction - the trades it is scored on are the ones it tuned on. So every result
 * carries the same score split over the older and the newer half of the window: a setting that only
 * works in one half is a fit to noise, and the two halves are what shows it.
 *
 * Two scopes. SELECTED WINDOW scores the one window the page shows. ALL WINDOWS scores every window
 * (5/20/40/65D) at once, in ONE pass, because the windows are nested - a trade of date d is in every
 * window whose cutoff is <= d. The score there is the MEAN of the per-window scores (P&L per DAY, so a
 * short window is not drowned by the long one that contains it; average/PF as is), and a setting must
 * clear MIN TRADES on the longest window and a proportional share (floor 5) on each shorter one, so it
 * cannot win on one window while the others hold nothing. Every window's own P&L is returned so a setting
 * that only works in some of them is visible, not averaged away.
 *
 * VALIDATE (single window only): the window's dates are split, the OLDEST 70% is the training sample and the
 * NEWEST 30% is held out. The search sees, scores and tunes on training trades ONLY; the held-out trades are
 * accumulated in the same pass purely to report what the chosen setting then did on days it never saw. That
 * is the honest number - the in-sample one is by construction flattering. A setting whose test average per
 * trade is a small fraction of its training average was fitted to noise.
 *
 * STABILITY: for each result, every active setting is nudged one candidate step up and down and the score
 * re-measured. The share of those neighbours that keep at least 80% of the score says whether the setting sits
 * on a plateau (robust) or on a needle-thin peak (an accident of these exact thresholds).
 *
 * The gate semantics are the compute.ts `scan()` ones, so applying a result on the page reproduces the
 * table's numbers: a set bound REJECTS a trade that has no such number; a unit that needs a per-ticker
 * scale (γ/δ/σ-of-pair/…) never admits a trade without one.
 */

import type { ScoutBound } from "./types";

const EPS = 1e-9;

export type OptUnit = {
  key: string;
  label: string;
  /** true = a trade with no value in this unit is never admitted (gamma/delta/…); false = only when a bound is set */
  needsScale: boolean;
  /** entry value per trade, NaN = cannot be expressed in this unit */
  values: Float64Array;
};

export type OptTable = {
  n: number;
  /** number of session dates in the file (the windows are the last N of them) */
  D: number;
  /** trade P&L in percentage points (NaN rows are not in the table) */
  pnl: Float64Array;
  /** date index; a trade is in the older half when date < midDate */
  date: Uint8Array;
  midDate: number;
  units: OptUnit[];
  corr: Float64Array;
  beta: Float64Array; // magnitude
  sigma: Float64Array;
  alpha: Float64Array;
  /** published rating of the trade's own class and side; NaN = none published */
  rate: Float64Array;
  total: Float64Array;
};

/** Which windows a candidate is scored on. `days` ascending; `cuts[k]` = first date index inside window k. */
export type OptScope = { days: number[]; cuts: number[]; multi: boolean; /** first HELD-OUT date index (single window only); null = no hold-out */ holdout: number | null };

/**
 * `windows` are the page's window choices, `selected` the one on screen. The table must hold the
 * trades of `tableWindow` (the longest window in scope) - scan() with that window builds it.
 */
/** Share of a window's dates (the newest ones) held out when validating. */
export const HOLDOUT_FRACTION = 0.3;

export function buildScope(D: number, selected: number, windows: number[], multi: boolean, validate = false): { scope: OptScope; tableWindow: number } {
  const clamp = (w: number) => Math.max(1, Math.min(w, D));
  const days = multi ? [...new Set(windows.map(clamp))].sort((a, b) => a - b) : [clamp(selected)];
  const cuts = days.map((d) => D - d);
  let holdout: number | null = null;
  if (validate && days.length === 1 && days[0] >= 2) {
    const testDays = Math.max(1, Math.min(days[0] - 1, Math.round(days[0] * HOLDOUT_FRACTION)));
    holdout = D - testDays;
  }
  return { scope: { days, cuts, multi: days.length > 1, holdout }, tableWindow: days[days.length - 1] };
}

export type OptConfig = {
  unit: string;
  start: number; // 0 = off
  to: number; // 0 = off
  corr: ScoutBound;
  beta: ScoutBound;
  sigma: ScoutBound;
  alpha: ScoutBound;
  minRate: number;
  minTotal: number;
};

export type OptObjective = "pnl" | "avg" | "pf";

export type OptTest = { days: number; n: number; pnlUsd: number; avgUsd: number; winRate: number; profitFactor: number };
export type OptStability = {
  /** neighbours tried (each active setting one candidate step up and down) */
  neighbours: number;
  /** share of them that keep >= 80% of the score */
  share: number;
  /** the lowest score ratio among them (0 when a neighbour is not even feasible) */
  worst: number;
};

export type OptResult = {
  config: OptConfig;
  n: number;
  /** $ figures use the page's position size */
  pnlUsd: number;
  avgUsd: number;
  winRate: number;
  profitFactor: number; // Infinity when there is no losing trade
  half1Usd: number;
  half2Usd: number;
  half1N: number;
  half2N: number;
  /** VALIDATE only: the same setting on the held-out (newest) days; null otherwise */
  test: OptTest | null;
  /** how flat the score is around this setting; null = nothing to nudge (no active setting) */
  stability: OptStability | null;
  /** per window in scope, ascending; the headline figures above are the LONGEST one */
  windows: Array<{ days: number; n: number; pnlUsd: number }>;
  score: number;
};

const NONE: ScoutBound = { min: null, max: null };

export function neutralConfig(unit: string): OptConfig {
  return { unit, start: 0, to: 0, corr: NONE, beta: NONE, sigma: NONE, alpha: NONE, minRate: 0, minTotal: 0 };
}

/** One pass over the table: every gate of `scan()` that the search owns, then the sums. */
export function evaluate(t: OptTable, cfg: OptConfig, sizeUsd: number, objective: OptObjective, minTrades: number, scope: OptScope): OptResult {
  const unit = t.units.find((u) => u.key === cfg.unit) ?? t.units[0];
  const uv = unit.values;
  const needsScale = unit.needsScale;
  const hasStart = cfg.start > 0;
  const hasTo = cfg.to > 0 && cfg.to > cfg.start;
  const ratingOn = cfg.minRate > 0 || cfg.minTotal > 0;
  const c = cfg.corr, b = cfg.beta, s = cfg.sigma, a = cfg.alpha;
  const cOn = c.min !== null || c.max !== null;
  const bOn = b.min !== null || b.max !== null;
  const sOn = s.min !== null || s.max !== null;
  const aOn = a.min !== null || a.max !== null;
  const cMin = c.min ?? -Infinity, cMax = c.max ?? Infinity;
  const bMin = b.min ?? -Infinity, bMax = b.max ?? Infinity;
  const sMin = s.min ?? -Infinity, sMax = s.max ?? Infinity;
  const aMin = a.min ?? -Infinity, aMax = a.max ?? Infinity;

  const K = scope.cuts.length;
  const cuts = scope.cuts;
  const nK = new Array<number>(K).fill(0), sumK = new Array<number>(K).fill(0), winsK = new Array<number>(K).fill(0);
  const swK = new Array<number>(K).fill(0), slK = new Array<number>(K).fill(0);
  let s1 = 0, s2 = 0, n1 = 0, n2 = 0;
  const ho = scope.holdout;
  let tN = 0, tSum = 0, tWins = 0, tSw = 0, tSl = 0;
  for (let i = 0; i < t.n; i++) {
    if (ratingOn) {
      const tot = t.total[i];
      if (tot !== tot) continue;
      if (tot < cfg.minTotal || t.rate[i] + EPS < cfg.minRate) continue;
    }
    const v = uv[i];
    if (v !== v) {
      if (needsScale || hasStart || hasTo) continue;
    } else {
      if (hasStart && v + EPS < cfg.start) continue;
      if (hasTo && v - EPS > cfg.to) continue;
    }
    if (cOn) { const x = t.corr[i]; if (x !== x || x + EPS < cMin || x - EPS > cMax) continue; }
    if (bOn) { const x = t.beta[i]; if (x !== x || x + EPS < bMin || x - EPS > bMax) continue; }
    if (sOn) { const x = t.sigma[i]; if (x !== x || x + EPS < sMin || x - EPS > sMax) continue; }
    if (aOn) { const x = t.alpha[i]; if (x !== x || x + EPS < aMin || x - EPS > aMax) continue; }

    const p = t.pnl[i];
    const d = t.date[i];
    if (ho !== null && d >= ho) {
      // held out: measured, never scored
      tN++;
      tSum += p;
      if (p > 0) { tWins++; tSw += p; } else if (p < 0) tSl -= p;
      continue;
    }
    for (let k = 0; k < K; k++) {
      if (d < cuts[k]) continue;
      nK[k]++;
      sumK[k] += p;
      if (p > 0) { winsK[k]++; swK[k] += p; } else if (p < 0) slK[k] -= p;
    }
    if (d < t.midDate) { s1 += p; n1++; } else { s2 += p; n2++; }
  }

  const usdPerPp = sizeUsd / 100;
  const L = K - 1; // the longest window carries the headline figures
  const n = nK[L], sum = sumK[L], wins = winsK[L], sumWin = swK[L], sumLoss = slK[L];
  const pfOf = (w: number, l: number, cnt: number) => (l > 0 ? w / l : cnt > 0 && w > 0 ? Infinity : NaN);
  const pf = pfOf(sumWin, sumLoss, n);

  let score = -Infinity;
  const need = (k: number) => (k === L ? Math.max(1, minTrades) : Math.max(5, Math.ceil((minTrades * scope.days[k]) / scope.days[L])));
  let feasible = true;
  for (let k = 0; k < K; k++) if (nK[k] < need(k)) { feasible = false; break; }
  if (feasible) {
    if (!scope.multi) {
      if (objective === "pnl") score = sum * usdPerPp;
      else if (objective === "avg") score = (sum * usdPerPp) / n;
      else score = pf === Infinity ? 1e6 : pf === pf ? pf : -Infinity;
    } else {
      let acc = 0;
      let ok = true;
      for (let k = 0; k < K; k++) {
        if (objective === "pnl") acc += (sumK[k] * usdPerPp) / scope.days[k];
        else if (objective === "avg") acc += (sumK[k] * usdPerPp) / nK[k];
        else {
          const f = pfOf(swK[k], slK[k], nK[k]);
          if (f !== f) { ok = false; break; }
          acc += Math.min(f, 1e3);
        }
      }
      if (ok) score = acc / K;
    }
  }
  return {
    config: cfg,
    n,
    pnlUsd: sum * usdPerPp,
    avgUsd: n ? (sum * usdPerPp) / n : NaN,
    winRate: n ? wins / n : NaN,
    profitFactor: pf,
    half1Usd: s1 * usdPerPp,
    half2Usd: s2 * usdPerPp,
    half1N: n1,
    half2N: n2,
    test: ho === null ? null : {
      days: t.D - ho,
      n: tN,
      pnlUsd: tSum * usdPerPp,
      avgUsd: tN ? (tSum * usdPerPp) / tN : NaN,
      winRate: tN ? tWins / tN : NaN,
      profitFactor: pfOf(tSw, tSl, tN),
    },
    stability: null,
    windows: scope.days.map((days, k) => ({ days, n: nK[k], pnlUsd: sumK[k] * usdPerPp })),
    score,
  };
}

// ---------------------------------------------------------------------------------------------
// candidate values
// ---------------------------------------------------------------------------------------------

/** 2 significant digits: a value that lands in a 56px box must read whole, and a threshold this fine is already finer than the data. */
const tidy = (x: number) => +x.toPrecision(2);

function quantiles(col: Float64Array, qs: number[], positiveOnly = false): number[] {
  const xs: number[] = [];
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    if (v === v && Number.isFinite(v) && (!positiveOnly || v > 0)) xs.push(v);
  }
  if (xs.length < 8) return [];
  xs.sort((p, q) => p - q);
  const out = new Set<number>();
  for (const q of qs) out.add(tidy(xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]));
  return [...out].sort((p, q) => p - q);
}

const LOW_Q = [0.03, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92];
const HIGH_Q = [0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92, 0.97];
const RATE_CANDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const TOTAL_CANDS = [2, 3, 5, 8, 10, 15, 20, 30, 50];

type Dim =
  | { kind: "start" }
  | { kind: "to" }
  | { kind: "bound"; field: "corr" | "beta" | "sigma" | "alpha"; end: "min" | "max" }
  | { kind: "minRate" }
  | { kind: "minTotal" };

function withDim(cfg: OptConfig, dim: Dim, v: number | null): OptConfig {
  switch (dim.kind) {
    case "start": return { ...cfg, start: v ?? 0 };
    case "to": return { ...cfg, to: v ?? 0 };
    case "minRate": return { ...cfg, minRate: v ?? 0 };
    case "minTotal": return { ...cfg, minTotal: v ?? 0 };
    case "bound": return { ...cfg, [dim.field]: { ...cfg[dim.field], [dim.end]: v } };
  }
}

export type OptProgress = (done: number, total: number) => void;

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** The value a Dim currently holds in a config; null = off. */
function dimValue(cfg: OptConfig, dim: Dim): number | null {
  switch (dim.kind) {
    case "start": return cfg.start > 0 ? cfg.start : null;
    case "to": return cfg.to > 0 && cfg.to > cfg.start ? cfg.to : null;
    case "minRate": return cfg.minRate > 0 ? cfg.minRate : null;
    case "minTotal": return cfg.minTotal > 0 ? cfg.minTotal : null;
    case "bound": return cfg[dim.field][dim.end];
  }
}

const STABLE_KEEP = 0.8;

/** Nudge every active setting one candidate step each way and see how much of the score survives. */
function stabilityOf(
  t: OptTable, best: OptResult, dims: Array<{ dim: Dim; cands: number[] }>,
  sizeUsd: number, objective: OptObjective, minTrades: number, scope: OptScope,
): OptStability | null {
  if (!(best.score > 0)) return null; // a ratio to a non-positive score means nothing
  let neighbours = 0, kept = 0, worst = Infinity;
  for (const { dim, cands } of dims) {
    const v = dimValue(best.config, dim);
    if (v === null) continue;
    const at = cands.indexOf(v);
    if (at < 0) continue;
    for (const j of [at - 1, at + 1]) {
      if (j < 0 || j >= cands.length) continue;
      const r = evaluate(t, withDim(best.config, dim, cands[j]), sizeUsd, objective, minTrades, scope);
      const ratio = r.score > 0 ? r.score / best.score : 0;
      neighbours++;
      if (ratio >= STABLE_KEEP) kept++;
      if (ratio < worst) worst = ratio;
    }
  }
  return neighbours === 0 ? null : { neighbours, share: kept / neighbours, worst };
}

/**
 * The search. Resolves with one result per unit that can satisfy `minTrades` at all (best first) and
 * the CURRENT settings scored on the same table for comparison. `cancelled()` is polled between
 * settings so a page that navigates away or re-runs stops the old search.
 */
export async function findBestSettings(
  t: OptTable,
  opts: {
    sizeUsd: number;
    objective: OptObjective;
    minTrades: number;
    scope: OptScope;
    current: OptConfig;
    onProgress?: OptProgress;
    cancelled?: () => boolean;
  },
): Promise<{ results: OptResult[]; current: OptResult; scopeTrades: number }> {
  const { sizeUsd, objective, minTrades, scope } = opts;
  const results: OptResult[] = [];
  const current = evaluate(t, opts.current, sizeUsd, objective, minTrades, scope);

  const ratingHas = (() => { for (let i = 0; i < t.n; i++) if (t.total[i] === t.total[i]) return true; return false; })();
  const cand = {
    corrLo: quantiles(t.corr, LOW_Q), corrHi: quantiles(t.corr, HIGH_Q),
    betaLo: quantiles(t.beta, LOW_Q), betaHi: quantiles(t.beta, HIGH_Q),
    sigmaLo: quantiles(t.sigma, LOW_Q), sigmaHi: quantiles(t.sigma, HIGH_Q),
    alphaLo: quantiles(t.alpha, LOW_Q), alphaHi: quantiles(t.alpha, HIGH_Q),
  };

  const units = t.units.filter((u) => {
    for (let i = 0; i < u.values.length; i++) if (u.values[i] === u.values[i]) return true;
    return false;
  });
  let done = 0;
  // upper bound of the work, used only for the progress bar
  const stepsPerUnit = 12 * 3;
  const totalSteps = Math.max(1, units.length * stepsPerUnit);

  for (const unit of units) {
    const dims: Array<{ dim: Dim; cands: number[] }> = [];
    const uLow = quantiles(unit.values, LOW_Q, true);
    const uHigh = quantiles(unit.values, HIGH_Q, true);
    if (uLow.length) dims.push({ dim: { kind: "start" }, cands: uLow });
    if (uHigh.length) dims.push({ dim: { kind: "to" }, cands: uHigh });
    const add = (field: "corr" | "beta" | "sigma" | "alpha", lo: number[], hi: number[]) => {
      if (lo.length) dims.push({ dim: { kind: "bound", field, end: "min" }, cands: lo });
      if (hi.length) dims.push({ dim: { kind: "bound", field, end: "max" }, cands: hi });
    };
    add("corr", cand.corrLo, cand.corrHi);
    add("beta", cand.betaLo, cand.betaHi);
    add("sigma", cand.sigmaLo, cand.sigmaHi);
    add("alpha", cand.alphaLo, cand.alphaHi);
    if (ratingHas) {
      dims.push({ dim: { kind: "minRate" }, cands: RATE_CANDS });
      dims.push({ dim: { kind: "minTotal" }, cands: TOTAL_CANDS });
    }

    let best = evaluate(t, neutralConfig(unit.key), sizeUsd, objective, minTrades, scope);
    if (best.score === -Infinity) { done += stepsPerUnit; opts.onProgress?.(Math.min(done, totalSteps), totalSteps); continue; }

    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const { dim, cands } of dims) {
        if (opts.cancelled?.()) return { results, current, scopeTrades: t.n };
        let bestHere = best;
        // "off" first, then every candidate: a setting can be switched back OFF by a later round
        let tried = 0;
        for (const v of [null, ...cands]) {
          const trial = evaluate(t, withDim(best.config, dim, v), sizeUsd, objective, minTrades, scope);
          if (trial.score > bestHere.score + 1e-9) bestHere = trial;
          if (++tried % 4 === 0) await yieldToUi(); // a long table must not freeze the page between settings
        }
        if (bestHere !== best) { best = bestHere; improved = true; }
        done++;
        opts.onProgress?.(Math.min(done, totalSteps), totalSteps);
        await yieldToUi();
      }
      if (!improved) break;
    }
    done = Math.max(done, (results.length + 1) * stepsPerUnit);
    results.push({ ...best, stability: stabilityOf(t, best, dims, sizeUsd, objective, minTrades, scope) });
  }

  results.sort((p, q) => q.score - p.score);
  // % and σ (and any two units left with no START/TO) select the very same trades once the other
  // settings match - one row says it, the second would only look like a second finding.
  const seen = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const key = `${results[i].n}|${results[i].pnlUsd.toFixed(2)}`;
    if (seen.has(key)) { results.splice(i, 1); i--; } else seen.add(key);
  }
  opts.onProgress?.(totalSteps, totalSteps);
  return { results, current, scopeTrades: t.n };
}

/** The boxes' text for a bound the search chose ("" = not set). */
export const boundText = (b: ScoutBound): { min: string; max: string } => ({
  min: b.min === null ? "" : String(b.min),
  max: b.max === null ? "" : String(b.max),
});
