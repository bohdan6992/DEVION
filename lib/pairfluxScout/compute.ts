/**
 * PairFlux Scout — every number on the page is computed here, from the decoded episode log.
 *
 * Pure functions, no React and no fetch — the pair analogue of lib/scout/compute.ts (Arbitrage
 * Scout). See that file for the shared reasoning (typed arrays throughout, no lookahead, sparse
 * gates). Two real differences: rows are PAIRS, and `endMinuteIdx` is genuine per-episode data
 * (PairFlux's exit is confirmed convergence or a forced end-of-day exit) rather than a fixed
 * class-close constant.
 */

import type {
  PfScoutAnalyticsSummary,
  PfScoutClass,
  PfScoutCurveMode,
  PfScoutCurvePoint,
  PfScoutEpisode,
  PfScoutMeta,
  PfScoutMetaWire,
  PfScoutMode,
  PfScoutPair,
  PfScoutLevels,
  PfScoutParams,
  PfScoutPairRow,
  PfScoutRating,
  PfScoutResult,
  PfScoutSlice,
  PfScoutSliceWire,
  PfScoutSortKey,
  PfScoutTradeRow,
} from "./types";
import { touchesRollover } from "../scout/rollover";

/** Display facts per start mode. `step` is the spinner increment. sigma/gamma/alpha are a
 * MULTIPLE of the pair's own published level for the CURRENT class (see PfScoutMode's doc
 * comment) — locked in the UI whenever `!meta.levelsAvailable`. */
export const PF_SCOUT_MODES: Record<PfScoutMode, { label: string; unit: string; step: number; hint: string }> = {
  pct: { label: "%", unit: "pp", step: 0.1, hint: "|entry_dev| at the confirmed entry, percentage points" },
  sigma: { label: "σ", unit: "×σ", step: 0.1, hint: "multiple of the pair's own sigma level for this class (break-even entry)" },
  gamma: { label: "γ", unit: "×γ", step: 0.1, hint: "multiple of the pair's own gamma level for this class (rare-but-reliable entry)" },
  alpha: { label: "α", unit: "×α", step: 0.1, hint: "multiple of the pair's own alpha for this class (median peak among converged episodes)" },
};

const NAN = Number.NaN;
const num = (v: number | null | undefined): number => (v === null || v === undefined || !Number.isFinite(v) ? NAN : v);

// ---------------------------------------------------------------------------------------------
// decoding
// ---------------------------------------------------------------------------------------------

const PF_CLASSES: PfScoutClass[] = ["pre", "open", "intra"];

function ratingCell(a: number[] | undefined): PfScoutRating | null {
  if (!a || a.length < 2 || !(a[1] > 0) || !Number.isFinite(a[0])) return null;
  return { rate: a[0], total: a[1] };
}

export function decodePfMeta(w: PfScoutMetaWire): PfScoutMeta {
  return {
    generatedAt: w.meta.generatedAt,
    mostRecentSession: w.meta.mostRecentSession,
    positionUsd: w.meta.positionUsd,
    levelsAvailable: w.meta.levelsAvailable,
    pnlBasis: w.meta.pnlBasis,
    recentDates: w.meta.recentDates,
    pairs: w.pairs.map((r) => {
      const levels = {} as Record<PfScoutClass, PfScoutLevels>;
      for (const cls of PF_CLASSES) {
        const lv = r.lv?.[cls];
        levels[cls] = { sigma: num(lv?.s), gamma: num(lv?.g), alpha: num(lv?.a), corr: num(lv?.c), beta: num(lv?.bt) };
      }
      const rating = {} as PfScoutPair["rating"];
      for (const cls of PF_CLASSES) {
        rating[cls] = { pos: ratingCell(r.lv?.[cls]?.rp), neg: ratingCell(r.lv?.[cls]?.rn) };
      }
      return { a: r.a, b: r.b, bench: r.bench, levels, rating };
    }),
  };
}

export function decodePfSlice(w: PfScoutSliceWire): PfScoutSlice {
  const n = w.n;
  const pair = new Int32Array(n);
  const date = new Uint8Array(n);
  const status = new Uint8Array(n);
  const entryDev = new Float64Array(n);
  const peak = new Float64Array(n);
  const capture = new Float64Array(n);
  const entryMinute = new Float64Array(n);
  const exitMinute = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    pair[i] = w.p[i];
    date[i] = w.d[i];
    status[i] = w.st[i];
    entryDev[i] = num(w.ed[i]);
    peak[i] = num(w.pk[i]);
    capture[i] = num(w.cp[i]);
    entryMinute[i] = num(w.em[i]);
    exitMinute[i] = num(w.xm[i]);
  }
  return { cls: w.cls, sign: w.sign, n, pair, date, status, entryDev, peak, capture, entryMinute, exitMinute };
}

// ---------------------------------------------------------------------------------------------
// scope: the one place an episode is admitted or dropped
// ---------------------------------------------------------------------------------------------

const EPS = 1e-9;

/**
 * MINRATE / MINTOTAL gate on the PUBLISHED rating of the episode's own class and direction - the
 * all-history figure from summary.csv, never a hit-rate recomputed inside the 5/20/40/65D window.
 * A direction with no published rating is rejected; with both gates at 0 nothing is asked.
 */
/** A set bound needs a number to compare: a missing one fails it (NaN never passes). */
function inBound(v: number, b: { min: number | null; max: number | null }): boolean {
  if (b.min === null && b.max === null) return true;
  if (v !== v) return false;
  if (b.min !== null && v + EPS < b.min) return false;
  if (b.max !== null && v - EPS > b.max) return false;
  return true;
}

/** ρ/β/σ/α are the PAIR's published constants for the episode's own class (β as a magnitude, like the Scanner's box). */
function pairStatsPass(lv: PfScoutLevels, p: PfScoutParams): boolean {
  const r = p.ranges;
  return inBound(lv.corr, r.corr) && inBound(Math.abs(lv.beta), r.beta) && inBound(lv.sigma, r.sigma) && inBound(lv.alpha, r.alpha);
}

function ratingPasses(cell: PfScoutRating | null, p: PfScoutParams): boolean {
  if (p.minRate <= 0 && p.minTotal <= 0) return true;
  if (!cell) return false;
  return cell.total >= p.minTotal && cell.rate + EPS >= p.minRate;
}

/** The episode's start value in the current mode's unit; NaN when the pair has no published
 * level for this class (sigma/gamma/alpha modes only — "pct" always resolves). */
export function pfStartValue(mode: PfScoutMode, s: PfScoutSlice, i: number, meta: PfScoutMeta): number {
  const absDev = s.entryDev[i];
  if (mode === "pct") return absDev;
  const lv = meta.pairs[s.pair[i]].levels[s.cls];
  const level = mode === "sigma" ? lv.sigma : mode === "gamma" ? lv.gamma : lv.alpha;
  return level > 0 ? absDev / level : NAN;
}

/**
 * Calls `visit(sliceIdx, epIdx, startValue)` for every episode that passes the window and the
 * |capture| cap and the START/TO bounds. Returns how many were dropped by the cap.
 *
 * An episode whose start value cannot be expressed in the current mode (no sigma/gamma/alpha
 * published for that pair's class) is excluded whenever a bound is set, exactly like Arbitrage
 * Scout's gamma/delta modes.
 */
export function scan(
  meta: PfScoutMeta,
  slices: PfScoutSlice[],
  p: PfScoutParams,
  visit: (si: number, i: number, v: number) => void,
): number {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - p.window);
  const hasStart = p.start > 0;
  const hasTo = p.to > 0 && p.to > p.start;
  const needsScale = p.mode !== "pct";
  let cappedOut = 0;

  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    for (let i = 0; i < s.n; i++) {
      if (s.date[i] < minDate) continue;
      if (p.excludeRollover && touchesRollover(s.entryMinute[i], s.exitMinute[i])) continue;
      if (!ratingPasses(meta.pairs[s.pair[i]].rating[s.cls][s.sign], p)) continue;
      if (!pairStatsPass(meta.pairs[s.pair[i]].levels[s.cls], p)) continue;

      const cap = s.capture[i];
      if (p.capPct > 0 && cap === cap && Math.abs(cap) > p.capPct) {
        cappedOut++;
        continue;
      }

      const v = pfStartValue(p.mode, s, i, meta);
      if (v !== v) {
        if (needsScale || hasStart || hasTo) continue;
      } else {
        if (hasStart && v + EPS < p.start) continue;
        if (hasTo && v - EPS > p.to) continue;
      }
      visit(si, i, v);
    }
  }
  return cappedOut;
}

// ---------------------------------------------------------------------------------------------
// the table + totals + curves
// ---------------------------------------------------------------------------------------------

export function computePfScout(meta: PfScoutMeta, slices: PfScoutSlice[], p: PfScoutParams): PfScoutResult {
  const T = meta.pairs.length;
  const D = meta.recentDates.length;

  const trades = new Int32Array(T);
  const hard = new Int32Array(T);
  const soft = new Int32Array(T);
  const pnlN = new Int32Array(T);
  const winN = new Int32Array(T);
  const startN = new Int32Array(T);
  const sumPnl = new Float64Array(T);
  const sumStart = new Float64Array(T);
  const entryMinuteN = new Int32Array(T);
  const sumEntryMinute = new Float64Array(T);

  const keep: Uint8Array[] = slices.map((s) => new Uint8Array(s.n));
  let tradesInScope = 0;

  const cappedOut = scan(meta, slices, p, (si, i, v) => {
    const s = slices[si];
    const t = s.pair[i];
    keep[si][i] = 1;
    tradesInScope++;
    trades[t]++;
    const st = s.status[i];
    if (st === 2) hard[t]++;
    else if (st === 1) soft[t]++;
    sumStart[t] += v;
    startN[t]++;
    const em = s.entryMinute[i];
    if (em === em) {
      sumEntryMinute[t] += em;
      entryMinuteN[t]++;
    }
    const cap = s.capture[i];
    if (cap === cap) {
      pnlN[t]++;
      sumPnl[t] += cap;
      if (cap > 0) winN[t]++;
    }
  });

  const pass = new Uint8Array(T);
  const rows: PfScoutPairRow[] = [];
  let pairsInScope = 0;
  let gTrades = 0, gHard = 0, gSoft = 0, gPnlN = 0, gWinN = 0, gPnlPct = 0;
  let rtTotal = 0, rtRate = 0;

  for (let t = 0; t < T; t++) {
    const n = trades[t];
    if (n === 0) continue;
    pairsInScope++;
    pass[t] = 1;

    // RATING = the published one of the direction(s) shown, pooled by total.
    let pubTotal = 0, pubRate = 0;
    for (const s of slices) {
      const c = meta.pairs[t].rating[s.cls][s.sign];
      if (!c) continue;
      pubTotal += c.total;
      pubRate += c.rate * c.total;
    }
    const rating = pubTotal > 0 ? pubRate / pubTotal : NAN;
    rtTotal += pubTotal; rtRate += pubRate;

    rows.push({
      i: t,
      trades: n,
      hard: hard[t],
      soft: soft[t],
      rating,
      ratingTotal: pubTotal,
      hardRate: hard[t] / n,
      softRate: soft[t] / n,
      start: startN[t] > 0 ? sumStart[t] / startN[t] : NAN,
      entryMinuteIdx: entryMinuteN[t] > 0 ? sumEntryMinute[t] / entryMinuteN[t] : NAN,
      pnlN: pnlN[t],
      pnlUsd: (p.sizeUsd * sumPnl[t]) / 100,
      avgPnlPct: pnlN[t] > 0 ? sumPnl[t] / pnlN[t] : NAN,
      win: pnlN[t] > 0 ? winN[t] / pnlN[t] : NAN,
    });
    gTrades += n;
    gHard += hard[t];
    gSoft += soft[t];
    gPnlN += pnlN[t];
    gWinN += winN[t];
    gPnlPct += sumPnl[t];
  }

  const dailyUsd = new Float64Array(D);
  const perDate = new Int32Array(D + 1);
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const k = keep[si];
    for (let i = 0; i < s.n; i++) {
      if (!k[i] || !pass[s.pair[i]]) continue;
      const cap = s.capture[i];
      if (cap !== cap) continue;
      dailyUsd[s.date[i]] += (p.sizeUsd * cap) / 100;
      perDate[s.date[i] + 1]++;
    }
  }
  for (let d = 0; d < D; d++) perDate[d + 1] += perDate[d];

  const total = perDate[D];
  const tradeSeriesUsd = new Float64Array(total);
  const tradeSeriesDate = new Uint8Array(total);
  const cursor = perDate.slice(0, D);
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const k = keep[si];
    for (let i = 0; i < s.n; i++) {
      if (!k[i] || !pass[s.pair[i]]) continue;
      const cap = s.capture[i];
      if (cap !== cap) continue;
      const at = cursor[s.date[i]]++;
      tradeSeriesUsd[at] = (p.sizeUsd * cap) / 100;
      tradeSeriesDate[at] = s.date[i];
    }
  }

  const { episodes, tradeRows } = buildEpisodesAndTrades(meta, slices, p, keep, pass);

  return {
    rating: rtTotal > 0 ? rtRate / rtTotal : NAN,
    rows,
    episodes,
    tradeRows,
    tradesInScope,
    cappedOut,
    pairsInScope,
    trades: gTrades,
    hard: gHard,
    soft: gSoft,
    pnlN: gPnlN,
    winN: gWinN,
    pnlUsd: (p.sizeUsd * gPnlPct) / 100,
    dailyUsd,
    tradeSeriesUsd,
    tradeSeriesDate,
  };
}

const STATUS_LABEL = ["none", "soft", "hard"] as const;

function buildEpisodesAndTrades(
  meta: PfScoutMeta,
  slices: PfScoutSlice[],
  p: PfScoutParams,
  keep: Uint8Array[],
  pass: Uint8Array,
): { episodes: PfScoutEpisode[]; tradeRows: PfScoutTradeRow[] } {
  let count = 0;
  for (let si = 0; si < slices.length; si++) {
    const k = keep[si];
    const s = slices[si];
    for (let i = 0; i < s.n; i++) if (k[i] && pass[s.pair[i]]) count++;
  }

  const episodes: PfScoutEpisode[] = new Array(count);
  const tradeRows: PfScoutTradeRow[] = new Array(count);
  let w = 0;
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const k = keep[si];
    const side: "short" | "long" = s.sign === "pos" ? "short" : "long";
    for (let i = 0; i < s.n; i++) {
      if (!k[i] || !pass[s.pair[i]]) continue;
      const pr = meta.pairs[s.pair[i]];
      const cap = s.capture[i];
      const pnlUsd = cap === cap ? (p.sizeUsd * cap) / 100 : null;
      const startMinuteIdx = s.entryMinute[i];
      episodes[w] = {
        ticker: `${pr.a}/${pr.b}`,
        benchTicker: pr.bench ?? "",
        side,
        startMinuteIdx,
        peakMinuteIdx: startMinuteIdx, // placeholder - see PfScoutEpisode's doc comment
        endMinuteIdx: s.exitMinute[i],
        peakMetricAbs: Number.isFinite(s.peak[i]) ? s.peak[i] : null,
        endMetricAbs: null, // not tracked separately from peak/capture in the episode log
        totalPnlUsd: pnlUsd,
      };
      tradeRows[w] = {
        a: pr.a, b: pr.b,
        side: s.sign,
        status: STATUS_LABEL[s.status[i]] ?? "none",
        date: s.date[i],
        entryMinuteIdx: s.entryMinute[i],
        exitMinuteIdx: s.exitMinute[i],
        entryDev: s.entryDev[i],
        peak: s.peak[i],
        capture: cap,
        pnlUsd: num(pnlUsd),
      };
      w++;
    }
  }
  return { episodes, tradeRows };
}

/** One pair's episodes in scope (the START/TO/window/cap filters, but NOT the MINRATE/MINTOTAL gate). */
export function pairSeries(
  meta: PfScoutMeta,
  slices: PfScoutSlice[],
  p: PfScoutParams,
  pairIdx: number,
): { dailyUsd: Float64Array; tradeUsd: number[]; tradeDate: number[] } {
  const D = meta.recentDates.length;
  const entries: Array<{ d: number; usd: number; order: number }> = [];
  let order = 0;
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.pair[i] !== pairIdx) return;
    const cap = s.capture[i];
    if (cap !== cap) return;
    entries.push({ d: s.date[i], usd: (p.sizeUsd * cap) / 100, order: order++ });
  });
  entries.sort((a, b) => a.d - b.d || a.order - b.order);

  const dailyUsd = new Float64Array(D);
  for (const e of entries) dailyUsd[e.d] += e.usd;
  return { dailyUsd, tradeUsd: entries.map((e) => e.usd), tradeDate: entries.map((e) => e.d) };
}

/** One pair's episodes in scope, for the "by time" charts (mirrors {@link pairSeries}). */
export function pairEpisodes(meta: PfScoutMeta, slices: PfScoutSlice[], p: PfScoutParams, pairIdx: number): PfScoutEpisode[] {
  const out: PfScoutEpisode[] = [];
  const pr = meta.pairs[pairIdx];
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.pair[i] !== pairIdx) return;
    const cap = s.capture[i];
    const startMinuteIdx = s.entryMinute[i];
    out.push({
      ticker: `${pr.a}/${pr.b}`,
      benchTicker: pr.bench ?? "",
      side: s.sign === "pos" ? "short" : "long",
      startMinuteIdx,
      peakMinuteIdx: startMinuteIdx,
      endMinuteIdx: s.exitMinute[i],
      peakMetricAbs: Number.isFinite(s.peak[i]) ? s.peak[i] : null,
      endMetricAbs: null,
      totalPnlUsd: cap === cap ? (p.sizeUsd * cap) / 100 : null,
    });
  });
  return out;
}

/** One pair's trade rows in scope (mirrors {@link pairEpisodes}, for the per-trade table). */
export function pairTradeRows(meta: PfScoutMeta, slices: PfScoutSlice[], p: PfScoutParams, pairIdx: number): PfScoutTradeRow[] {
  const out: PfScoutTradeRow[] = [];
  const pr = meta.pairs[pairIdx];
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.pair[i] !== pairIdx) return;
    const cap = s.capture[i];
    const pnlUsd = cap === cap ? (p.sizeUsd * cap) / 100 : null;
    out.push({
      a: pr.a, b: pr.b,
      side: s.sign,
      status: STATUS_LABEL[s.status[i]] ?? "none",
      date: s.date[i],
      entryMinuteIdx: s.entryMinute[i],
      exitMinuteIdx: s.exitMinute[i],
      entryDev: s.entryDev[i],
      peak: s.peak[i],
      capture: cap,
      pnlUsd: num(pnlUsd),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// curve + drawdown
// ---------------------------------------------------------------------------------------------

const MAX_TRADE_POINTS = 1500;

export function buildPfCurve(
  meta: PfScoutMeta,
  window: number,
  dailyUsd: ArrayLike<number>,
  tradeUsd: ArrayLike<number>,
  tradeDate: ArrayLike<number>,
  mode: PfScoutCurveMode,
): PfScoutCurvePoint[] {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - window);

  if (mode === "daily") {
    const out: PfScoutCurvePoint[] = [];
    let eq = 0;
    for (let d = minDate; d < D; d++) {
      eq += dailyUsd[d];
      out.push({ key: meta.recentDates[d], equity: eq, pnl: dailyUsd[d] });
    }
    return out;
  }

  const n = tradeUsd.length;
  if (n === 0) return [];
  const stride = Math.max(1, Math.ceil(n / MAX_TRADE_POINTS));
  const out: PfScoutCurvePoint[] = [];
  let eq = 0;
  let stepSum = 0;
  for (let i = 0; i < n; i++) {
    eq += tradeUsd[i];
    stepSum += tradeUsd[i];
    if ((i + 1) % stride === 0 || i === n - 1) {
      out.push({ key: meta.recentDates[tradeDate[i]], equity: eq, pnl: stepSum });
      stepSum = 0;
    }
  }
  return out;
}

export function pfMaxDrawdown(points: PfScoutCurvePoint[]): number {
  let peak = 0;
  let worst = 0;
  for (const pt of points) {
    if (pt.equity > peak) peak = pt.equity;
    worst = Math.max(worst, peak - pt.equity);
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------
// sorting
// ---------------------------------------------------------------------------------------------

export type SortDir = "asc" | "desc";

function sortValue(meta: PfScoutMeta, r: PfScoutPairRow, key: PfScoutSortKey): number | string {
  switch (key) {
    case "pair": return `${meta.pairs[r.i].a}/${meta.pairs[r.i].b}`;
    case "rating": return r.rating;
    case "hard": return r.hardRate;
    case "soft": return r.softRate;
    case "start": return r.start;
    case "entryTime": return r.entryMinuteIdx;
    case "trades": return r.trades;
    case "pnl": return r.pnlUsd;
    case "avgPnl": return r.avgPnlPct;
    case "win": return r.win;
  }
}

/** A sorted COPY. Unknown values (NaN) go last in either direction. */
export function sortPfRows(meta: PfScoutMeta, rows: PfScoutPairRow[], key: PfScoutSortKey, dir: SortDir): PfScoutPairRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r) => ({ r, v: sortValue(meta, r, key), t: `${meta.pairs[r.i].a}/${meta.pairs[r.i].b}` }))
    .sort((a, b) => {
      const an = typeof a.v === "number" && a.v !== a.v;
      const bn = typeof b.v === "number" && b.v !== b.v;
      if (an !== bn) return an ? 1 : -1;
      if (!an) {
        const av = a.v as number;
        const bv = b.v as number;
        if (av < bv) return -sign;
        if (av > bv) return sign;
      }
      return a.t < b.t ? -1 : a.t > b.t ? 1 : 0;
    })
    .map((x) => x.r);
}

// ---------------------------------------------------------------------------------------------
// analytics summary card block (ported from ArbitrageScanner's own analyticsSummary — see
// lib/scout/compute.ts's computeScoutAnalytics for the same formulas, single-ticker flavoured)
// ---------------------------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** `rows` should be the FULL filtered scope (before any display pagination slice). */
export function computePfAnalytics(rows: PfScoutTradeRow[], sizeUsd: number): PfScoutAnalyticsSummary {
  const pairs = new Set<string>();
  let wins = 0, losses = 0, sumWin = 0, sumLossAbs = 0;
  let maxWinUsd = 0, maxLossUsd = 0, totalPnlUsd = 0, posCount = 0, negCount = 0;
  const pnls: number[] = [];
  const dayTotals = new Map<number, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    pairs.add(`${r.a}/${r.b}`);
    const x = Number.isFinite(r.pnlUsd) ? r.pnlUsd : 0;
    totalPnlUsd += x;
    pnls.push(x);
    if (r.side === "pos") posCount++;
    else negCount++;
    dayTotals.set(r.date, (dayTotals.get(r.date) ?? 0) + x);
    if (x > 0) { wins++; sumWin += x; }
    else if (x < 0) { losses++; sumLossAbs -= x; }
    if (i === 0 || x > maxWinUsd) maxWinUsd = x;
    if (i === 0 || x < maxLossUsd) maxLossUsd = x;
  }

  const n = rows.length;
  const winRate = n > 0 ? wins / n : 0;
  const profitFactor = sumLossAbs <= 0 ? null : sumWin / sumLossAbs;
  const avgTradeUsd = n > 0 ? totalPnlUsd / n : 0;
  const avgWinUsd = wins > 0 ? sumWin / wins : 0;
  const avgLossUsd = losses > 0 ? -(sumLossAbs / losses) : 0;
  const expectancyUsd = winRate * avgWinUsd - (1 - winRate) * avgLossUsd;

  const medianTradeUsd = median(pnls);
  const dayCount = dayTotals.size;
  const medianDayUsd = dayCount > 0 ? median([...dayTotals.values()]) : 0;

  const winsDesc = pnls.filter((x) => x > 0).sort((a, b) => b - a);
  const lossesDesc = pnls.filter((x) => x < 0).map((x) => -x).sort((a, b) => b - a);
  const top2WinShare = winsDesc.length >= 3 && sumWin > 0 ? (winsDesc[0]! + (winsDesc[1] ?? 0)) / sumWin : null;
  const top2LossShare = lossesDesc.length >= 3 && sumLossAbs > 0 ? (lossesDesc[0]! + (lossesDesc[1] ?? 0)) / sumLossAbs : null;

  return {
    situations: pairs.size,
    trades: n,
    moneyflowUsd: sizeUsd * n,
    totalPnlUsd,
    winRate,
    maxWinUsd,
    maxLossUsd,
    avgWinUsd,
    avgLossUsd,
    top2WinShare,
    top2LossShare,
    avgTradeUsd,
    profitFactor,
    expectancyUsd,
    medianTradeUsd,
    medianDayUsd,
    dayCount,
    posCount,
    negCount,
  };
}
