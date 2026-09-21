/**
 * Arbitrage Scout adapter for the "best settings" search (see optimizeCore.ts): flattens the trades
 * that pass the gates the search does NOT own into an OptTable, and reads the page's current
 * settings back as an OptConfig for the comparison row.
 */

import type { ScoutMeta, ScoutMode, ScoutParams, ScoutSlice, ScoutWindow } from "./types";
import { devAllModes, scan, SCOUT_MODES } from "./compute";
import { buildScope, neutralConfig, type OptConfig, type OptScope, type OptTable } from "./optimizeCore";

const OFF = { min: null, max: null };
const UNIT_ORDER: ScoutMode[] = ["pct", "sigma", "delta", "gamma"];

export function scoutOptTable(meta: ScoutMeta, slices: ScoutSlice[], p: ScoutParams, opts: { multi: boolean; windows: number[]; validate: boolean }): { table: OptTable; scope: OptScope } {
  const D = meta.recentDates.length;
  const { scope, tableWindow } = buildScope(D, p.window, opts.windows, opts.multi, opts.validate);
  // Everything the search tunes is switched off here; window / ETF / country / sector / cap stay.
  const scanScope: ScoutParams = { ...p, window: tableWindow as ScoutWindow, mode: "pct", start: 0, to: 0, minRate: 0, minTotal: 0, ranges: { corr: OFF, beta: OFF, sigma: OFF, alpha: OFF } };

  const pnl: number[] = [], date: number[] = [];
  const unitVals: Record<ScoutMode, number[]> = { pct: [], sigma: [], gamma: [], delta: [] };
  const corr: number[] = [], beta: number[] = [], sigma: number[] = [], alpha: number[] = [];
  const rate: number[] = [], total: number[] = [];

  scan(meta, slices, scanScope, (si, i) => {
    const s = slices[si];
    const pv = s.pnl[i];
    if (pv !== pv) return; // an unknown P&L is neither a win nor a loss
    const signIdx: 0 | 1 = s.sign === "pos" ? 0 : 1;
    const tk = meta.tickers[s.ticker[i]];
    const d = devAllModes(meta, s, i, signIdx);
    pnl.push(pv);
    date.push(s.date[i]);
    unitVals.pct.push(d.pct); unitVals.sigma.push(d.sigma); unitVals.gamma.push(d.gamma); unitVals.delta.push(d.delta);
    corr.push(tk.corr);
    beta.push(Math.abs(tk.beta));
    sigma.push(tk.sigma);
    alpha.push(Math.abs(tk.alpha[signIdx]));
    const r = tk.rating[s.cls][s.sign];
    rate.push(r ? r.rate : NaN);
    total.push(r ? r.total : NaN);
  });

  const minDate = Math.max(0, D - tableWindow);
  const table: OptTable = {
    n: pnl.length,
    D,
    pnl: Float64Array.from(pnl),
    date: Uint8Array.from(date),
    midDate: minDate + Math.floor((D - minDate) / 2),
    units: UNIT_ORDER.map((m) => ({
      key: m,
      label: SCOUT_MODES[m].label,
      needsScale: m === "gamma" || m === "delta",
      values: Float64Array.from(unitVals[m]),
    })),
    corr: Float64Array.from(corr),
    beta: Float64Array.from(beta),
    sigma: Float64Array.from(sigma),
    alpha: Float64Array.from(alpha),
    rate: Float64Array.from(rate),
    total: Float64Array.from(total),
  };
  return { table, scope };
}

export function scoutCurrentConfig(p: ScoutParams): OptConfig {
  return { ...neutralConfig(p.mode), start: p.start, to: p.to, ...p.ranges, minRate: p.minRate, minTotal: p.minTotal };
}
