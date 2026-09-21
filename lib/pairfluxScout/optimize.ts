/**
 * PairFlux Scout adapter for the "best settings" search (see lib/scout/optimizeCore.ts). Same shape
 * as the Arbitrage one; ρ/β/σ/α are the PAIR's published constants for the episode's own class.
 */

import type { PfScoutMeta, PfScoutMode, PfScoutParams, PfScoutSlice, PfScoutWindow } from "./types";
import { PF_SCOUT_MODES, pfStartValue, scan } from "./compute";
import { buildScope, neutralConfig, type OptConfig, type OptScope, type OptTable } from "../scout/optimizeCore";

const OFF = { min: null, max: null };
const UNIT_ORDER: PfScoutMode[] = ["pct", "sigma", "gamma", "alpha"];

export function pfOptTable(meta: PfScoutMeta, slices: PfScoutSlice[], p: PfScoutParams, opts: { multi: boolean; windows: number[]; validate: boolean }): { table: OptTable; scope: OptScope } {
  const D = meta.recentDates.length;
  const { scope, tableWindow } = buildScope(D, p.window, opts.windows, opts.multi, opts.validate);
  const scanScope: PfScoutParams = { ...p, window: tableWindow as PfScoutWindow, mode: "pct", start: 0, to: 0, minRate: 0, minTotal: 0, ranges: { corr: OFF, beta: OFF, sigma: OFF, alpha: OFF } };

  const pnl: number[] = [], date: number[] = [];
  const unitVals: Record<PfScoutMode, number[]> = { pct: [], sigma: [], gamma: [], alpha: [] };
  const corr: number[] = [], beta: number[] = [], sigma: number[] = [], alpha: number[] = [];
  const rate: number[] = [], total: number[] = [];

  scan(meta, slices, scanScope, (si, i) => {
    const s = slices[si];
    const pv = s.capture[i];
    if (pv !== pv) return;
    const pair = meta.pairs[s.pair[i]];
    const lv = pair.levels[s.cls];
    pnl.push(pv);
    date.push(s.date[i]);
    for (const m of UNIT_ORDER) unitVals[m].push(pfStartValue(m, s, i, meta));
    corr.push(lv.corr);
    beta.push(Math.abs(lv.beta));
    sigma.push(lv.sigma);
    alpha.push(lv.alpha);
    const r = pair.rating[s.cls][s.sign];
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
      label: PF_SCOUT_MODES[m].label,
      needsScale: m !== "pct",
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

export function pfCurrentConfig(p: PfScoutParams): OptConfig {
  return { ...neutralConfig(p.mode), start: p.start, to: p.to, ...p.ranges, minRate: p.minRate, minTotal: p.minTotal };
}
