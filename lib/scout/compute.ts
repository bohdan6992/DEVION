/**
 * Arbitrage Scout — every number on the page is computed here, from the decoded trade log.
 *
 * Pure functions, no React and no fetch, so the page can re-run the whole pipeline on every
 * keystroke (a few hundred thousand trades at most, typed arrays throughout) and so the maths can be
 * tested against an independent implementation.
 */

import type {
  ScoutAnalyticsSummary,
  ScoutClass,
  ScoutCurveMode,
  ScoutCurvePoint,
  ScoutEpisode,
  ScoutMeta,
  ScoutMetaWire,
  ScoutMode,
  ScoutParams,
  ScoutRating,
  ScoutResult,
  ScoutSlice,
  ScoutSliceWire,
  ScoutSortKey,
  ScoutTicker,
  ScoutTickerRow,
  ScoutTradeRow,
} from "./types";

/** Display facts per start mode. `step` is the spinner increment. */
export const SCOUT_MODES: Record<ScoutMode, { label: string; unit: string; step: number; hint: string }> = {
  pct: { label: "%", unit: "pp", step: 0.1, hint: "raw Stack%−Bench% gap at entry, percentage points" },
  sigma: { label: "σ", unit: "σ", step: 0.1, hint: "|dev_sig| at entry — the unit the classes trigger on" },
  gamma: { label: "γ", unit: "×γ", step: 0.1, hint: "multiple of the ticker's own gamma level (best reversal-entry deviation)" },
  delta: { label: "δ", unit: "×δ", step: 0.1, hint: "multiple of the ticker's own |delta| (median dev_sig at the 09:30 open, last 5 days)" },
};

const NAN = Number.NaN;
const num = (v: number | null | undefined): number => (v === null || v === undefined || !Number.isFinite(v) ? NAN : v);

// ---------------------------------------------------------------------------------------------
// decoding
// ---------------------------------------------------------------------------------------------

const CLASS_KEYS: ScoutClass[] = ["pre", "open", "intra", "post"];

function ratingCell(a: number[] | undefined): ScoutRating | null {
  if (!a || a.length < 4 || !(a[1] > 0) || !Number.isFinite(a[0])) return null;
  return { rate: a[0], total: a[1], hard: a[2], soft: a[3] };
}

function decodeRatings(rt: ScoutMetaWire["tickers"][number]["rt"]): ScoutTicker["rating"] {
  const out = {} as ScoutTicker["rating"];
  for (const c of CLASS_KEYS) out[c] = { pos: ratingCell(rt?.[c]?.p), neg: ratingCell(rt?.[c]?.n) };
  return out;
}

export function decodeMeta(w: ScoutMetaWire): ScoutMeta {
  return {
    generatedAt: w.meta.generatedAt,
    mostRecentSession: w.meta.mostRecentSession,
    positionUsd: w.meta.positionUsd,
    levelsAvailable: w.meta.levelsAvailable,
    model0402: w.meta.model0402 === true,
    pnlBasis: w.meta.pnlBasis,
    recentDates: w.meta.recentDates,
    tickers: w.tickers.map((r) => ({
      t: r.t,
      bench: r.bench,
      corr: num(r.corr),
      beta: num(r.beta),
      sigma: num(r.sigma),
      gamma: [num(r.gp), num(r.gn)],
      delta: [num(r.dp), num(r.dn)],
      alpha: [num(r.ap), num(r.an)],
      rating: decodeRatings(r.rt),
      etf: r.etf ?? null,
      country: r.country ?? null,
      sector: r.sector ?? null,
    })),
  };
}

export function decodeSlice(w: ScoutSliceWire): ScoutSlice {
  const n = w.n;
  const ticker = new Int32Array(n);
  const date = new Uint8Array(n);
  const status = new Uint8Array(n);
  const startDev = new Float64Array(n);
  const gap = new Float64Array(n);
  const pnl = new Float64Array(n);
  const startMinuteIdx = new Float64Array(n);
  const peakMinuteIdx = new Float64Array(n);
  const peakDevAbs = new Float64Array(n);
  const endDevAbs = new Float64Array(n);
  const endGapPct = new Float64Array(n);
  const exitMinuteIdx = new Float64Array(n);
  const birthGapMin = new Float64Array(n);
  const alt = new Uint8Array(n);
  if (w.al) for (let i = 0; i < n; i++) alt[i] = w.al[i] ? 1 : 0;
  for (let i = 0; i < n; i++) {
    ticker[i] = w.t[i];
    date[i] = w.d[i];
    status[i] = w.st[i];
    startDev[i] = w.sd[i];
    gap[i] = num(w.gp[i]);
    pnl[i] = num(w.p[i]);
    startMinuteIdx[i] = num(w.sm?.[i]);
    peakMinuteIdx[i] = num(w.pm?.[i]);
    peakDevAbs[i] = num(w.pa?.[i]);
    endDevAbs[i] = num(w.ea?.[i]);
    endGapPct[i] = num(w.eg?.[i]);
    exitMinuteIdx[i] = num(w.xm?.[i]);
    birthGapMin[i] = num(w.bg?.[i]);
  }
  return { cls: w.cls, sign: w.sign, n, ticker, date, status, startDev, gap, pnl, startMinuteIdx, peakMinuteIdx, peakDevAbs, endDevAbs, endGapPct, exitMinuteIdx, birthGapMin, alt };
}

/** The class's own window-close minute (NY minute-of-day, PRE-wrapped) — every trade's exit mark. */
export const CLASS_CLOSE_MINUTE_IDX: Record<ScoutClass, number> = {
  pre: 570, // 09:30
  open: 600, // 10:00
  intra: 960, // 16:00
  post: 1200, // 20:00
};

// ---------------------------------------------------------------------------------------------
// scope: the one place a trade is admitted or dropped
// ---------------------------------------------------------------------------------------------

/** The trade's start value in the current mode's unit; NaN when the mode cannot express it. */
function startValue(mode: ScoutMode, s: ScoutSlice, i: number, signIdx: 0 | 1, meta: ScoutMeta): number {
  switch (mode) {
    case "sigma":
      return s.startDev[i];
    case "pct":
      return Math.abs(s.gap[i]);
    case "gamma": {
      const g = meta.tickers[s.ticker[i]].gamma[signIdx];
      return g > 0 ? s.startDev[i] / g : NAN;
    }
    case "delta": {
      const d = Math.abs(meta.tickers[s.ticker[i]].delta[signIdx]);
      return d > 0 ? s.startDev[i] / d : NAN;
    }
  }
}

const EPS = 1e-9;

/** A set bound needs a number to compare: a missing one fails it (NaN never passes). */
function inBound(v: number, b: { min: number | null; max: number | null }): boolean {
  if (b.min === null && b.max === null) return true;
  if (v !== v) return false;
  if (b.min !== null && v + EPS < b.min) return false;
  if (b.max !== null && v - EPS > b.max) return false;
  return true;
}

/** ETF/country/sector/ρ/β/σ are per-TICKER, constant across all of a ticker's trades — checked once. */
function tickerAllowed(meta: ScoutMeta, p: ScoutParams, t: number): boolean {
  const tk = meta.tickers[t];
  if (p.excludeEtf && tk.etf === true) return false;
  if (!inBound(tk.corr, p.ranges.corr)) return false;
  if (!inBound(Math.abs(tk.beta), p.ranges.beta)) return false; // magnitude, like the Scanner's box
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
 * MINRATE / MINTOTAL gate on the PUBLISHED rating of the trade's own class and side (the same
 * all-history figure the Scanner gates on) — never a hit-rate recomputed inside the 5/20/40/65D
 * window, which is why the same ticker no longer flips in and out as the window changes. A side
 * with no published rating is rejected, like every other filter on a missing field; with both
 * gates at 0 nothing is being asked, so it passes.
 */
function ratingPasses(cell: ScoutRating | null, p: ScoutParams): boolean {
  if (p.minRate <= 0 && p.minTotal <= 0) return true;
  if (!cell) return false;
  return cell.total >= p.minTotal && cell.rate + EPS >= p.minRate;
}

/**
 * Calls `visit(sliceIdx, tradeIdx, startValue)` for every trade that passes the window, the ticker
 * ETF/country/sector filters, the |pnl| cap and the START/TO bounds. Returns how many were dropped
 * by the cap.
 *
 * A trade whose start value cannot be expressed in the current mode (no gamma/delta published for
 * that ticker, no Stack%/Bench% at birth) is excluded — always in gamma/delta mode, where the
 * ticker has no scale to be measured on, and whenever a bound is set in any mode.
 */
export function scan(
  meta: ScoutMeta,
  slices: ScoutSlice[],
  p: ScoutParams,
  visit: (si: number, i: number, v: number) => void,
): number {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - p.window);
  const hasStart = p.start > 0;
  const hasTo = p.to > 0 && p.to > p.start;
  const needsScale = p.mode === "gamma" || p.mode === "delta";
  let cappedOut = 0;

  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const signIdx: 0 | 1 = s.sign === "pos" ? 0 : 1;
    for (let i = 0; i < s.n; i++) {
      if (s.date[i] < minDate) continue;
      if (!tickerAllowed(meta, p, s.ticker[i])) continue;
      // PRE has two separate sets of trades: the ordinary 21:00 model and the 04:02 one; the toggle picks which
      if (s.cls === "pre" && s.alt[i] !== (p.model0402 ? 1 : 0)) continue;
      if (!ratingPasses(meta.tickers[s.ticker[i]].rating[s.cls][s.sign], p)) continue;
      if (!inBound(Math.abs(meta.tickers[s.ticker[i]].alpha[signIdx]), p.ranges.alpha)) continue; // the trade's own side

      const pnl = s.pnl[i];
      if (p.capPct > 0 && pnl === pnl && Math.abs(pnl) > p.capPct) {
        cappedOut++;
        continue;
      }

      const v = startValue(p.mode, s, i, signIdx, meta);
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

/** The entry deviation in every unit the START/TO threshold can be set in, for one trade. */
export function devAllModes(meta: ScoutMeta, s: ScoutSlice, i: number, signIdx: 0 | 1): { pct: number; sigma: number; gamma: number; delta: number } {
  return {
    pct: Math.abs(s.gap[i]),
    sigma: s.startDev[i],
    gamma: startValue("gamma", s, i, signIdx, meta),
    delta: startValue("delta", s, i, signIdx, meta),
  };
}

// ---------------------------------------------------------------------------------------------
// the table + totals + curves
// ---------------------------------------------------------------------------------------------

export function computeScout(meta: ScoutMeta, slices: ScoutSlice[], p: ScoutParams): ScoutResult {
  const T = meta.tickers.length;
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
  const sumExitMinute = new Float64Array(T);

  const keep: Uint8Array[] = slices.map((s) => new Uint8Array(s.n));
  let tradesInScope = 0;

  // pass 1 — per-ticker aggregates over the trades in scope
  const cappedOut = scan(meta, slices, p, (si, i, v) => {
    const s = slices[si];
    const t = s.ticker[i];
    keep[si][i] = 1;
    tradesInScope++;
    trades[t]++;
    const st = s.status[i];
    if (st === 2) hard[t]++;
    else if (st === 1) soft[t]++;
    if (v === v) {
      sumStart[t] += v;
      startN[t]++;
    }
    const em = s.startMinuteIdx[i];
    if (em === em) {
      sumEntryMinute[t] += em;
      entryMinuteN[t]++;
    }
    sumExitMinute[t] += exitAt(s, i, CLASS_CLOSE_MINUTE_IDX[s.cls]);
    const pnl = s.pnl[i];
    if (pnl === pnl) {
      pnlN[t]++;
      sumPnl[t] += pnl;
      if (pnl > 0) winN[t]++;
    }
  });

  // Every trade in scope already cleared the PUBLISHED rating gate (in scan()), so a ticker with
  // any trade left is a row. Its RATING is the published one of the sides being viewed.
  const pass = new Uint8Array(T);
  const rows: ScoutTickerRow[] = [];
  let tickersInScope = 0;
  let gTrades = 0, gHard = 0, gSoft = 0, gPnlN = 0, gWinN = 0, gPnlPct = 0;
  let rtTotal = 0, rtRate = 0, rtHard = 0, rtSoft = 0;

  for (let t = 0; t < T; t++) {
    const n = trades[t];
    if (n === 0) continue;
    tickersInScope++;
    pass[t] = 1;

    let pubTotal = 0, pubRate = 0, pubHard = 0, pubSoft = 0;
    for (const s of slices) {
      const c = meta.tickers[t].rating[s.cls][s.sign];
      if (!c) continue;
      pubTotal += c.total;
      pubRate += c.rate * c.total;
      pubHard += c.hard;
      pubSoft += c.soft;
    }
    const rating = pubTotal > 0 ? pubRate / pubTotal : NAN;
    rtTotal += pubTotal; rtRate += pubRate; rtHard += pubHard; rtSoft += pubSoft;

    rows.push({
      i: t,
      trades: n,
      hard: hard[t],
      soft: soft[t],
      rating,
      ratingTotal: pubTotal,
      hardRate: pubTotal > 0 ? pubHard / pubTotal : NAN,
      softRate: pubTotal > 0 ? pubSoft / pubTotal : NAN,
      start: startN[t] > 0 ? sumStart[t] / startN[t] : NAN,
      entryMinuteIdx: entryMinuteN[t] > 0 ? sumEntryMinute[t] / entryMinuteN[t] : NAN,
      exitMinuteIdx: sumExitMinute[t] / n,
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

  // pass 2 — the curve, over the trades of the tickers that passed the gate
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

  // pass 3 — chart episodes + the per-trade detail table: every kept trade of a gated ticker,
  // pnl known or not, built in one pass since both read the exact same (keep && pass) predicate.
  const { episodes, tradeRows } = buildEpisodesAndTrades(meta, slices, p, keep, pass);

  return {
    rating: rtTotal > 0 ? rtRate / rtTotal : NAN,
    ratingHard: rtTotal > 0 ? rtHard / rtTotal : NAN,
    ratingSoft: rtTotal > 0 ? rtSoft / rtTotal : NAN,
    rows,
    episodes,
    tradeRows,
    tradesInScope,
    cappedOut,
    tickersInScope,
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

/**
 * When the trade's exit mark was REALLY printed. The P&L is marked at the last print inside the class
 * window, and a thin name can stop printing hours before the close (overnight PRE especially), so the
 * class close is only a fallback for a file published before the notebook recorded it.
 */
function exitAt(s: ScoutSlice, i: number, closeIdx: number): number {
  const m = s.exitMinuteIdx[i];
  return m === m ? m : closeIdx;
}

const STATUS_LABEL = ["none", "soft", "hard"] as const;

function buildEpisodesAndTrades(
  meta: ScoutMeta,
  slices: ScoutSlice[],
  p: ScoutParams,
  keep: Uint8Array[],
  pass: Uint8Array,
): { episodes: ScoutEpisode[]; tradeRows: ScoutTradeRow[] } {
  let count = 0;
  for (let si = 0; si < slices.length; si++) {
    const k = keep[si];
    const s = slices[si];
    for (let i = 0; i < s.n; i++) if (k[i] && pass[s.ticker[i]]) count++;
  }

  const episodes: ScoutEpisode[] = new Array(count);
  const tradeRows: ScoutTradeRow[] = new Array(count);
  let w = 0;
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    const k = keep[si];
    const signIdx: 0 | 1 = s.sign === "pos" ? 0 : 1;
    const closeIdx = CLASS_CLOSE_MINUTE_IDX[s.cls];
    const side: "short" | "long" = s.sign === "pos" ? "short" : "long";
    for (let i = 0; i < s.n; i++) {
      if (!k[i] || !pass[s.ticker[i]]) continue;
      const tk = meta.tickers[s.ticker[i]];
      const pnl = s.pnl[i];
      const pnlUsd = pnl === pnl ? (p.sizeUsd * pnl) / 100 : null;
      episodes[w] = {
        ticker: tk.t,
        benchTicker: tk.bench ?? "",
        side,
        startMinuteIdx: s.startMinuteIdx[i],
        peakMinuteIdx: s.peakMinuteIdx[i],
        endMinuteIdx: exitAt(s, i, closeIdx),
        peakMetricAbs: Number.isFinite(s.peakDevAbs[i]) ? s.peakDevAbs[i] : null,
        endMetricAbs: Number.isFinite(s.endDevAbs[i]) ? s.endDevAbs[i] : null,
        totalPnlUsd: pnlUsd,
      };
      const dev = devAllModes(meta, s, i, signIdx);
      tradeRows[w] = {
        ticker: tk.t,
        date: s.date[i],
        side,
        status: STATUS_LABEL[s.status[i]] ?? "none",
        entryMinuteIdx: s.startMinuteIdx[i],
        exitMinuteIdx: exitAt(s, i, closeIdx),
        birthGapMin: s.birthGapMin[i],
        startGapPct: s.gap[i],
        endGapPct: s.endGapPct[i],
        pnlPct: pnl,
        pnlUsd: num(pnlUsd),
        devPct: dev.pct,
        devSigma: dev.sigma,
        devGamma: dev.gamma,
        devDelta: dev.delta,
      };
      w++;
    }
  }
  return { episodes, tradeRows };
}

/** One ticker's episodes in scope (mirrors {@link tickerSeries}, for the by-time charts). */
export function tickerEpisodes(
  meta: ScoutMeta,
  slices: ScoutSlice[],
  p: ScoutParams,
  tickerIdx: number,
): ScoutEpisode[] {
  const out: ScoutEpisode[] = [];
  const tk = meta.tickers[tickerIdx];
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.ticker[i] !== tickerIdx) return;
    const pnl = s.pnl[i];
    out.push({
      ticker: tk.t,
      benchTicker: tk.bench ?? "",
      side: s.sign === "pos" ? "short" : "long",
      startMinuteIdx: s.startMinuteIdx[i],
      peakMinuteIdx: s.peakMinuteIdx[i],
      endMinuteIdx: exitAt(s, i, CLASS_CLOSE_MINUTE_IDX[s.cls]),
      peakMetricAbs: Number.isFinite(s.peakDevAbs[i]) ? s.peakDevAbs[i] : null,
      endMetricAbs: Number.isFinite(s.endDevAbs[i]) ? s.endDevAbs[i] : null,
      totalPnlUsd: pnl === pnl ? (p.sizeUsd * pnl) / 100 : null,
    });
  });
  return out;
}

/** One ticker's trade rows in scope (mirrors {@link tickerEpisodes}, for the per-trade table). */
export function tickerTradeRows(
  meta: ScoutMeta,
  slices: ScoutSlice[],
  p: ScoutParams,
  tickerIdx: number,
): ScoutTradeRow[] {
  const out: ScoutTradeRow[] = [];
  const tk = meta.tickers[tickerIdx];
  scan(meta, slices, p, (si, i) => {
    const s = slices[si];
    if (s.ticker[i] !== tickerIdx) return;
    const signIdx: 0 | 1 = s.sign === "pos" ? 0 : 1;
    const pnl = s.pnl[i];
    const pnlUsd = pnl === pnl ? (p.sizeUsd * pnl) / 100 : null;
    const dev = devAllModes(meta, s, i, signIdx);
    out.push({
      ticker: tk.t,
      date: s.date[i],
      side: s.sign === "pos" ? "short" : "long",
      status: STATUS_LABEL[s.status[i]] ?? "none",
      entryMinuteIdx: s.startMinuteIdx[i],
      exitMinuteIdx: exitAt(s, i, CLASS_CLOSE_MINUTE_IDX[s.cls]),
      birthGapMin: s.birthGapMin[i],
      startGapPct: s.gap[i],
      endGapPct: s.endGapPct[i],
      pnlPct: pnl,
      pnlUsd: num(pnlUsd),
      devPct: dev.pct,
      devSigma: dev.sigma,
      devGamma: dev.gamma,
      devDelta: dev.delta,
    });
  });
  return out;
}

/** One ticker's trades in scope (the START/TO/window/cap filters, but NOT the MINRATE/MINTOTAL gate). */
export function tickerSeries(
  meta: ScoutMeta,
  slices: ScoutSlice[],
  p: ScoutParams,
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

// ---------------------------------------------------------------------------------------------
// curve + drawdown
// ---------------------------------------------------------------------------------------------

const MAX_TRADE_POINTS = 1500;

/** Points in the shape EquityChart takes: cumulative $ (equity) and the step's $ (pnl). */
export function buildCurve(
  meta: ScoutMeta,
  window: number,
  dailyUsd: ArrayLike<number>,
  tradeUsd: ArrayLike<number>,
  tradeDate: ArrayLike<number>,
  mode: ScoutCurveMode,
): ScoutCurvePoint[] {
  const D = meta.recentDates.length;
  const minDate = Math.max(0, D - window);

  if (mode === "daily") {
    const out: ScoutCurvePoint[] = [];
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
  const out: ScoutCurvePoint[] = [];
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

/** Largest peak-to-trough fall of the equity series, as a positive $ amount. */
export function maxDrawdown(points: ScoutCurvePoint[]): number {
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

function sortValue(meta: ScoutMeta, r: ScoutTickerRow, key: ScoutSortKey): number | string {
  switch (key) {
    case "ticker": return meta.tickers[r.i].t;
    case "beta": return meta.tickers[r.i].beta;
    case "corr": return meta.tickers[r.i].corr;
    case "sigma": return meta.tickers[r.i].sigma;
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

/**
 * A sorted COPY. Unknown values (NaN) go last in either direction — a ticker with no beta is not
 * the "lowest beta". Ties fall back to the ticker symbol so the order is stable while typing.
 */
export function sortRows(meta: ScoutMeta, rows: ScoutTickerRow[], key: ScoutSortKey, dir: SortDir): ScoutTickerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r) => ({ r, v: sortValue(meta, r, key), t: meta.tickers[r.i].t }))
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
// analytics summary card block (ported from ArbitrageScanner's own analyticsSummary)
// ---------------------------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** `rows` should be the FULL filtered scope (before any display pagination slice). */
export function computeScoutAnalytics(rows: ScoutTradeRow[], sizeUsd: number): ScoutAnalyticsSummary {
  const tickers = new Set<string>();
  let wins = 0, losses = 0, sumWin = 0, sumLossAbs = 0;
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
    situations: tickers.size,
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
    longs,
    shorts,
  };
}
