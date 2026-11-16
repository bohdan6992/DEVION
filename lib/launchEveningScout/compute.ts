/**
 * LaunchEvening Scout — every number on the page is computed here, from the decoded trade log.
 * Mirrors lib/reversalScout/compute.ts 1-to-1 in shape; see that file for the pure-function
 * rationale. The differences are exactly the ones types.ts documents: ONE class ("eve1600"),
 * 4 modes (%/σ/α/γ), no hard/soft, no peak/gap.
 */

import { inSelectedRegions } from "../filters/region";
import { rowExcludedByBorrow } from "../filters/borrow";
import type {
  LaunchEveningAnalyticsSummary,
  LaunchEveningClass,
  LaunchEveningCurveMode,
  LaunchEveningCurvePoint,
  LaunchEveningMeta,
  LaunchEveningMetaWire,
  LaunchEveningMode,
  LaunchEveningParams,
  LaunchEveningRating,
  LaunchEveningResult,
  LaunchEveningSide,
  LaunchEveningSlice,
  LaunchEveningSliceWire,
  LaunchEveningSortKey,
  LaunchEveningTicker,
  LaunchEveningTickerRow,
  LaunchEveningTradeRow,
} from "./types";

export const LAUNCHEVENING_MODES: Record<LaunchEveningMode, { label: string; unit: string; step: number; hint: string }> = {
  pct: { label: "%", unit: "pp", step: 0.1, hint: "raw |Stack%| at the 15:50-16:20 signal, percentage points" },
  sigma: { label: "\u03c3", unit: "\u00d7\u03c3", step: 0.1, hint: "|Stack%| at the signal divided by the ticker's published static sigma (final.parquet's own \"sigma\" column)" },
  alpha: { label: "α", unit: "×α", step: 0.1, hint: "multiple of the ticker's own alpha (modal |15:50-16:20 signal reading|), sign-matched: pos/short over alphaPos, neg/long over alphaNeg" },
  gamma: { label: "\u03b3", unit: "\u00d7\u03b3", step: 0.1, hint: "|Stack%| at the signal divided by the published gamma for this class and side" },
};

const NAN = Number.NaN;
const num = (v: number | null | undefined): number => (v === null || v === undefined || !Number.isFinite(v) ? NAN : v);

// ---------------------------------------------------------------------------------------------
// decoding
// ---------------------------------------------------------------------------------------------

const CLASS_KEYS: LaunchEveningClass[] = ["eve1600"];

function ratingCell(rt: LaunchEveningMetaWire["tickers"][number]["rt"], cls: LaunchEveningClass, sign: "pos" | "neg"): LaunchEveningRating | null {
  const r = rt?.find((x) => x.cls === cls && x.sign === sign);
  if (!r || !(r.total > 0) || r.winRate === null || !Number.isFinite(r.winRate)) return null;
  return {
    total: r.total, wins: r.wins,
    winRate: r.winRate, winRateLb: num(r.winRateLb),
    meanPnl: num(r.meanPnl), pnlLb: num(r.pnlLb),
    gamma: num(r.gamma), gammaN: r.gammaN ?? 0, gammaRate: num(r.gammaRate),
  };
}

export function decodeMeta(w: LaunchEveningMetaWire): LaunchEveningMeta {
  return {
    generatedAt: w.meta.generatedAt,
    mostRecentSession: w.meta.mostRecentSession,
    positionUsd: w.meta.positionUsd,
    minDev: w.meta.minDev,
    pnlBasis: w.meta.pnlBasis,
    recentDates: w.meta.recentDates,
    // Pad rather than trust the lengths to agree: a short array would otherwise read
    // `undefined` for the newest sessions and drop them from every bucket at once.
    regimes: w.meta.recentDates.map((_, i) => w.meta.regimes?.[i] ?? "UNKNOWN"),
    tickers: w.tickers.map((r) => {
      const rating = {} as LaunchEveningTicker["rating"];
      for (const c of CLASS_KEYS) rating[c] = { pos: ratingCell(r.rt, c, "pos"), neg: ratingCell(r.rt, c, "neg") };
      return {
        t: r.t,
        alphaPos: num(r.alphaPos),
        alphaNeg: num(r.alphaNeg),
        sigma: num(r.sigma),
        lambda: num(r.lambda),
        rating,
        etf: r.etf ?? null,
        country: r.country ?? null,
        sector: r.sector ?? null,
        exchange: r.exchange ?? null,
        ptp: r.ptp ?? null,
        ssrOut: r.ssrOut ?? null,
        crap: r.crap ?? null,
        rep: r.rep ?? null,
        etb: r.etb ?? null,
        news: r.news ?? null,
      };
    }),
  };
}

export function decodeSlice(w: LaunchEveningSliceWire): LaunchEveningSlice {
  const n = w.n;
  const ticker = new Int32Array(n);
  const date = new Uint8Array(n);
  const status = new Uint8Array(n);
  const entryDev = new Float64Array(n);
  const pnl = new Float64Array(n);
  const signalMinuteIdx = new Float64Array(n);
  const entryMinuteIdx = new Float64Array(n);
  const exitMinuteIdx = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ticker[i] = w.t[i];
    date[i] = w.d[i];
    status[i] = w.st[i];
    entryDev[i] = w.ed[i];
    pnl[i] = num(w.p[i]);
    signalMinuteIdx[i] = num(w.sm[i]);
    entryMinuteIdx[i] = num(w.em[i]);
    exitMinuteIdx[i] = num(w.xm[i]);
  }
  return { cls: w.cls, sign: w.sign, n, ticker, date, status, entryDev, pnl, signalMinuteIdx, entryMinuteIdx, exitMinuteIdx };
}

// ---------------------------------------------------------------------------------------------
// scope: the one place a trade is admitted or dropped
// ---------------------------------------------------------------------------------------------

/** The ticker's own alpha for a trade's SIGN — pos/short reads alphaPos, neg/long reads alphaNeg,
 * the same sign-matching gamma already does per (class, sign). */
function alphaForSign(ticker: LaunchEveningTicker, sign: "pos" | "neg"): number {
  return sign === "pos" ? ticker.alphaPos : ticker.alphaNeg;
}

/** entry_dev (raw |Stack%| at the 15:50-16:20 signal) expressed as a multiple of the ticker's own metric, in the
 * given MODE. σ reads the notebook-PUBLISHED static sigma straight off the ticker (final.parquet's
 * own "sigma" column, passed through unmodified end to end) — not a locally recomputed stdev. */
function startValue(mode: LaunchEveningMode, s: LaunchEveningSlice, i: number, ticker: LaunchEveningTicker): number {
  if (mode === "pct") return s.entryDev[i];
  if (mode === "sigma") return ticker.sigma > 0 ? s.entryDev[i] / ticker.sigma : NAN;
  if (mode === "alpha") {
    const a = alphaForSign(ticker, s.sign);
    return a > 0 ? s.entryDev[i] / a : NAN;
  }
  const gamma = ticker.rating[s.cls][s.sign]?.gamma;
  return gamma != null && gamma > 0 ? s.entryDev[i] / gamma : NAN;
}

const EPS = 1e-9;

function inBound(v: number, b: { min: number | null; max: number | null }): boolean {
  if (b.min === null && b.max === null) return true;
  if (v !== v) return false;
  if (b.min !== null && v + EPS < b.min) return false;
  if (b.max !== null && v - EPS > b.max) return false;
  return true;
}

function tickerAllowed(meta: LaunchEveningMeta, p: LaunchEveningParams, t: number, sign: "pos" | "neg"): boolean {
  const tk = meta.tickers[t];
  if (p.excludeEtf && tk.etf === true) return false;
  // ITB/HARD go through the ONE borrow reader every surface shares, so the ITB/NO/YES spelling
  // and the "missing status is also excluded" rule live in a single place. `etb` is as of the
  // newest tape day that knew this ticker - a day snapshot, which is what a reference table wants.
  if ((p.excludeItb || p.excludeHard) && rowExcludedByBorrow({ b5etb: tk.etb }, p.excludeItb, p.excludeHard)) return false;
  if (p.excludePtp && tk.ptp === true) return false;
  if (p.excludeSsr && tk.ssrOut === true) return false;
  if (p.excludeCrap && tk.crap === true) return false;
  if (p.excludeNews && tk.news === true) return false;
  if (p.excludeReport && tk.rep === true) return false;
  if (p.exchangeMode !== "off" && p.exchanges.size > 0) {
    const has = tk.exchange != null && p.exchanges.has(tk.exchange);
    if (p.exchangeMode === "include" && !has) return false;
    if (p.exchangeMode === "exclude" && has) return false;
  }
  // The tape spells it "UNITED STATES"; see lib/filters/region.ts for why this is not inline.
  if (!inSelectedRegions(tk.country, p.includeUsa, p.includeChina)) return false;
  if (!inBound(alphaForSign(tk, sign), p.ranges.alpha)) return false;
  if (!inBound(tk.sigma, p.ranges.sigma)) return false;
  if (p.countryMode !== "off" && p.countries.size > 0) {
    const has = tk.country != null && p.countries.has(tk.country);
    if (p.countryMode === "include" && !has) return false;
    if (p.countryMode === "exclude" && has) return false;
  }
  if (p.sectorMode !== "off" && p.sectors.size > 0) {
    const has = tk.sector != null && p.sectors.has(tk.sector);
    if (p.sectorMode === "include" && !has) return false;
    if (p.sectorMode === "exclude" && has) return false;
  }
  return true;
}

/**
 * MINRATE / MINTOTAL gate on the PUBLISHED win rate of the trade's own class and side — the
 * all-history figure, never a rate recomputed inside the 5/20/40/65D window.
 */
function ratingPasses(cell: LaunchEveningRating | null, p: LaunchEveningParams): boolean {
  // gamma belongs to the (class, sign) CELL, so it is checked here where the cell is in
  // hand - tickerAllowed never sees the class. A level filter, so it also applies under
  // UNIVERSE, which only drops the rating gate below it.
  // NaN, not null: inBound already rejects NaN, which is the house rule - a cell with no
  // published gamma fails a gamma bound rather than slipping through it.
  if (!inBound(cell?.gamma ?? NaN, p.ranges.gamma)) return false;
  if (p.ignoreRatings) return true;
  if (p.minRate <= 0 && p.minTotal <= 0) return true;
  if (!cell) return false;
  return cell.total >= p.minTotal && cell.winRate + EPS >= p.minRate;
}

export function scan(
  meta: LaunchEveningMeta,
  slices: LaunchEveningSlice[],
  p: LaunchEveningParams,
  visit: (si: number, i: number, v: number) => void,
): number {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - p.window);
  // Which nights count. meta.regimes is parallel to recentDates, so the trade's own date index
  // reads its label directly. An empty array means the bridge has not published the file yet -
  // then "all" is the only setting that can match and the others legitimately show nothing.
  const regimeWanted = p.regime === "all" ? null : p.regime.toUpperCase();

  const hasStart = p.start > 0;
  const hasTo = p.to > 0 && p.to > p.start;
  const needsScale = p.mode !== "pct";
  let cappedOut = 0;

  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    for (let i = 0; i < s.n; i++) {
      if (s.date[i] < minDate) continue;
      if (regimeWanted !== null && meta.regimes[s.date[i]] !== regimeWanted) continue;
      if (!tickerAllowed(meta, p, s.ticker[i], s.sign)) continue;
      if (!ratingPasses(meta.tickers[s.ticker[i]].rating[s.cls][s.sign], p)) continue;

      const pnl = s.pnl[i];
      if (p.capPct > 0 && pnl === pnl && Math.abs(pnl) > p.capPct) {
        cappedOut++;
        continue;
      }

      const v = startValue(p.mode, s, i, meta.tickers[s.ticker[i]]);
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

export function devAllModes(meta: LaunchEveningMeta, s: LaunchEveningSlice, i: number): { pct: number; alpha: number; sigma: number; gamma: number } {
  const tk = meta.tickers[s.ticker[i]];
  return {
    pct: s.entryDev[i],
    alpha: startValue("alpha", s, i, tk),
    sigma: startValue("sigma", s, i, tk),
    gamma: startValue("gamma", s, i, tk),
  };
}

// ---------------------------------------------------------------------------------------------
// the table + totals + curves
// ---------------------------------------------------------------------------------------------

export function computeLaunchEveningScout(meta: LaunchEveningMeta, slices: LaunchEveningSlice[], p: LaunchEveningParams): LaunchEveningResult {
  const T = meta.tickers.length;
  const D = meta.recentDates.length;

  const trades = new Int32Array(T);
  const pnlN = new Int32Array(T);
  const winN = new Int32Array(T);
  const startN = new Int32Array(T);
  const sumPnl = new Float64Array(T);
  const sumStart = new Float64Array(T);
  const entryMinuteN = new Int32Array(T);
  const sumEntryMinute = new Float64Array(T);
  const exitMinuteN = new Int32Array(T);
  const sumExitMinute = new Float64Array(T);

  const keep: Uint8Array[] = slices.map((s) => new Uint8Array(s.n));
  let tradesInScope = 0;

  const cappedOut = scan(meta, slices, p, (si, i, v) => {
    const s = slices[si];
    const t = s.ticker[i];
    keep[si][i] = 1;
    tradesInScope++;
    trades[t]++;
    if (v === v) { sumStart[t] += v; startN[t]++; }
    const em = s.entryMinuteIdx[i];
    if (em === em) { sumEntryMinute[t] += em; entryMinuteN[t]++; }
    const xm = s.exitMinuteIdx[i];
    if (xm === xm) { sumExitMinute[t] += xm; exitMinuteN[t]++; }
    const pnl = s.pnl[i];
    if (pnl === pnl) {
      pnlN[t]++;
      sumPnl[t] += pnl;
      if (pnl > 0) winN[t]++;
    }
  });

  const pass = new Uint8Array(T);
  const rows: LaunchEveningTickerRow[] = [];
  let tickersInScope = 0;
  let gTrades = 0, gPnlN = 0, gWinN = 0, gPnlPct = 0;
  let rtTotal = 0, rtRate = 0;

  for (let t = 0; t < T; t++) {
    const n = trades[t];
    if (n === 0) continue;
    tickersInScope++;
    pass[t] = 1;

    let pubTotal = 0, pubRate = 0;
    for (const s of slices) {
      const c = meta.tickers[t].rating[s.cls][s.sign];
      if (!c) continue;
      pubTotal += c.total;
      pubRate += c.winRate * c.total;
    }
    const rating = pubTotal > 0 ? pubRate / pubTotal : NAN;
    rtTotal += pubTotal; rtRate += pubRate;

    rows.push({
      i: t,
      trades: n,
      rating,
      ratingTotal: pubTotal,
      start: startN[t] > 0 ? sumStart[t] / startN[t] : NAN,
      entryMinuteIdx: entryMinuteN[t] > 0 ? sumEntryMinute[t] / entryMinuteN[t] : NAN,
      exitMinuteIdx: exitMinuteN[t] > 0 ? sumExitMinute[t] / exitMinuteN[t] : NAN,
      pnlN: pnlN[t],
      pnlUsd: (p.sizeUsd * sumPnl[t]) / 100,
      avgPnlPct: pnlN[t] > 0 ? sumPnl[t] / pnlN[t] : NAN,
      win: pnlN[t] > 0 ? winN[t] / pnlN[t] : NAN,
    });
    gTrades += n;
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
      if (!k[i] || !pass[s.ticker[i]]) continue;
      const pnl = s.pnl[i];
      if (pnl !== pnl) continue;
      dailyUsd[s.date[i]] += (p.sizeUsd * pnl) / 100;
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
      if (!k[i] || !pass[s.ticker[i]]) continue;
      const pnl = s.pnl[i];
      if (pnl !== pnl) continue;
      const at = cursor[s.date[i]]++;
      tradeSeriesUsd[at] = (p.sizeUsd * pnl) / 100;
      tradeSeriesDate[at] = s.date[i];
    }
  }

  const tradeRows = buildTradeRows(meta, slices, p, keep, pass);

  return {
    rating: rtTotal > 0 ? rtRate / rtTotal : NAN,
    rows,
    tradeRows,
    tradesInScope,
    cappedOut,
    tickersInScope,
    trades: gTrades,
    pnlN: gPnlN,
    winN: gWinN,
    pnlUsd: (p.sizeUsd * gPnlPct) / 100,
    dailyUsd,
    tradeSeriesUsd,
    tradeSeriesDate,
  };
}

const STATUS_LABEL = ["loss", "win"] as const;

function buildTradeRows(
  meta: LaunchEveningMeta,
  slices: LaunchEveningSlice[],
  p: LaunchEveningParams,
  keep: Uint8Array[],
  pass: Uint8Array,
): LaunchEveningTradeRow[] {
  let count = 0;
  for (let si = 0; si < slices.length; si++) {
    const k = keep[si];
    const s = slices[si];
    for (let i = 0; i < s.n; i++) if (k[i] && pass[s.ticker[i]]) count++;
  }

  const out: LaunchEveningTradeRow[] = new Array(count);
  let w = 0;
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const k = keep[si];
    const side: "short" | "long" = s.sign === "pos" ? "short" : "long"; // Rootation: pos=SHORT, neg=LONG (same as Fade/Reversal — see this file's LaunchEveningSide note)
    for (let i = 0; i < s.n; i++) {
      if (!k[i] || !pass[s.ticker[i]]) continue;
      const tk = meta.tickers[s.ticker[i]];
      const pnl = s.pnl[i];
      const pnlUsd = pnl === pnl ? (p.sizeUsd * pnl) / 100 : null;
      const dev = devAllModes(meta, s, i);
      out[w] = {
        ticker: tk.t,
        date: s.date[i],
        cls: s.cls,
        side,
        status: STATUS_LABEL[s.status[i]] ?? "loss",
        signalMinuteIdx: s.signalMinuteIdx[i],
        entryMinuteIdx: s.entryMinuteIdx[i],
        exitMinuteIdx: s.exitMinuteIdx[i],
        pnlPct: pnl,
        pnlUsd: num(pnlUsd),
        devPct: dev.pct,
        devAlpha: dev.alpha,
        devSigma: dev.sigma,
        devGamma: dev.gamma,
      };
      w++;
    }
  }
  return out;
}

/** One ticker's trades in scope (the START/TO/window/cap filters, but NOT the MINRATE/MINTOTAL gate). */
export function tickerSeries(
  meta: LaunchEveningMeta,
  slices: LaunchEveningSlice[],
  p: LaunchEveningParams,
  tickerIdx: number,
): { dailyUsd: Float64Array; tradeUsd: number[]; tradeDate: number[] } {
  const D = meta.recentDates.length;
  const entries: Array<{ d: number; usd: number; order: number }> = [];
  let order = 0;
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.ticker[i] !== tickerIdx) return;
    const pnl = s.pnl[i];
    if (pnl !== pnl) return;
    entries.push({ d: s.date[i], usd: (p.sizeUsd * pnl) / 100, order: order++ });
  });
  entries.sort((a, b) => a.d - b.d || a.order - b.order);

  const dailyUsd = new Float64Array(D);
  for (const e of entries) dailyUsd[e.d] += e.usd;
  return { dailyUsd, tradeUsd: entries.map((e) => e.usd), tradeDate: entries.map((e) => e.d) };
}

export function tickerTradeRows(meta: LaunchEveningMeta, slices: LaunchEveningSlice[], p: LaunchEveningParams, tickerIdx: number): LaunchEveningTradeRow[] {
  const out: LaunchEveningTradeRow[] = [];
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.ticker[i] !== tickerIdx) return;
    const tk = meta.tickers[tickerIdx];
    const pnl = s.pnl[i];
    const pnlUsd = pnl === pnl ? (p.sizeUsd * pnl) / 100 : null;
    const dev = devAllModes(meta, s, i);
    out.push({
      ticker: tk.t, date: s.date[i], cls: s.cls, side: s.sign === "pos" ? "short" : "long", // Rootation: pos=SHORT, neg=LONG (same as Fade/Reversal)
      status: STATUS_LABEL[s.status[i]] ?? "loss", signalMinuteIdx: s.signalMinuteIdx[i],
      entryMinuteIdx: s.entryMinuteIdx[i], exitMinuteIdx: s.exitMinuteIdx[i],
      pnlPct: pnl, pnlUsd: num(pnlUsd), devPct: dev.pct, devAlpha: dev.alpha,
      devSigma: dev.sigma, devGamma: dev.gamma,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// curve + drawdown
// ---------------------------------------------------------------------------------------------

const MAX_TRADE_POINTS = 1500;

export function buildCurve(
  meta: LaunchEveningMeta,
  window: number,
  dailyUsd: ArrayLike<number>,
  tradeUsd: ArrayLike<number>,
  tradeDate: ArrayLike<number>,
  mode: LaunchEveningCurveMode,
): LaunchEveningCurvePoint[] {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - window);

  if (mode === "daily") {
    const out: LaunchEveningCurvePoint[] = [];
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
  const out: LaunchEveningCurvePoint[] = [];
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

export function maxDrawdown(points: LaunchEveningCurvePoint[]): number {
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

/** ALPHA is now two numbers (alphaPos/alphaNeg); for SHORT/LONG the relevant one sorts directly, for
 * BOTH (trades from both signs may be in scope at once) the average of whichever are finite stands
 * in as the ticker's representative alpha — display (the table cell) still shows both, sign-matched,
 * the same way the γ column already does. */
function alphaForSort(tk: LaunchEveningTicker, side: LaunchEveningSide): number {
  if (side === "short") return tk.alphaPos;
  if (side === "long") return tk.alphaNeg;
  const pos = tk.alphaPos, neg = tk.alphaNeg;
  if (pos === pos && neg === neg) return (pos + neg) / 2;
  if (pos === pos) return pos;
  return neg;
}

function sortValue(meta: LaunchEveningMeta, r: LaunchEveningTickerRow, key: LaunchEveningSortKey, side: LaunchEveningSide): number | string {
  switch (key) {
    case "ticker": return meta.tickers[r.i].t;
    case "alpha": return alphaForSort(meta.tickers[r.i], side);
    case "rating": return r.rating;
    case "start": return r.start;
    case "entryTime": return r.entryMinuteIdx;
    case "trades": return r.trades;
    case "pnl": return r.pnlUsd;
    case "avgPnl": return r.avgPnlPct;
    case "win": return r.win;
  }
}

export function sortRows(meta: LaunchEveningMeta, rows: LaunchEveningTickerRow[], key: LaunchEveningSortKey, dir: SortDir, side: LaunchEveningSide): LaunchEveningTickerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r) => ({ r, v: sortValue(meta, r, key, side), t: meta.tickers[r.i].t }))
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
// analytics summary card block (ported from lib/scout's computeScoutAnalytics)
// ---------------------------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computeLaunchEveningAnalytics(rows: LaunchEveningTradeRow[], sizeUsd: number): LaunchEveningAnalyticsSummary {
  const tickers = new Set<string>();
  let wins = 0, sumWin = 0, sumLossAbs = 0;
  let maxWinUsd = 0, maxLossUsd = 0, totalPnlUsd = 0, longs = 0, shorts = 0;
  const pnls: number[] = [];
  const dayTotals = new Map<number, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    tickers.add(r.ticker);
    const x = Number.isFinite(r.pnlUsd) ? r.pnlUsd : 0;
    totalPnlUsd += x;
    pnls.push(x);
    if (r.side === "long") longs++;
    else if (r.side === "short") shorts++;
    dayTotals.set(r.date, (dayTotals.get(r.date) ?? 0) + x);
    if (x > 0) { wins++; sumWin += x; }
    else if (x < 0) sumLossAbs -= x;
    if (i === 0 || x > maxWinUsd) maxWinUsd = x;
    if (i === 0 || x < maxLossUsd) maxLossUsd = x;
  }

  const n = rows.length;
  const winRate = n > 0 ? wins / n : 0;
  const losses = n - wins - pnls.filter((x) => x === 0).length;
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
    situations: tickers.size, trades: n, moneyflowUsd: sizeUsd * n, totalPnlUsd, winRate,
    maxWinUsd, maxLossUsd, avgWinUsd, avgLossUsd, top2WinShare, top2LossShare, avgTradeUsd,
    profitFactor, expectancyUsd, medianTradeUsd, medianDayUsd, dayCount, longs, shorts,
  };
}
