import type { ScopeEventRow } from "@/lib/scopeApi";

export type PerfStats = {
  sum: number;
  avg: number;
  median: number;
  std: number;
  n: number;
  n_win: number;
  n_loss: number;
  "W/L": number;
  "bat%": number;
  "avg win": number;
  "avg loss": number;
  p_10: number;
  p_90: number;
};

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

function median(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// linear interpolation quantile, like numpy default
function quantile(xs: number[], q: number) {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  if (n === 1) return a[0];
  const pos = (n - 1) * q;
  const i = Math.floor(pos);
  const frac = pos - i;
  return a[i] + frac * (a[i + 1] - a[i]);
}

// sample std (ddof=1) — як у бекенда
function stdSample(xs: number[]) {
  const n = xs.length;
  if (n <= 1) return 0;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

export function calcPerf(trades: number[]): PerfStats {
  const n = trades.length;
  const wins = trades.filter((x) => x >= 0);
  const losses = trades.filter((x) => x < 0);

  const sumAll = trades.reduce((a, b) => a + b, 0);
  const sumWins = wins.reduce((a, b) => a + b, 0);
  const sumLossAbs = Math.abs(losses.reduce((a, b) => a + b, 0)); // abs(sum negative)

  return {
    sum: sumAll,
    avg: n ? sumAll / n : 0,
    median: median(trades),
    std: stdSample(trades),
    n,
    n_win: wins.length,
    n_loss: losses.length,
    "W/L": sumLossAbs > 0 ? sumWins / sumLossAbs : 0,
    "bat%": n ? (wins.length / n) * 100 : 0,
    "avg win": wins.length ? mean(wins) : 0,
    "avg loss": losses.length ? mean(losses) : 0,
    p_10: quantile(trades, 0.1),
    p_90: quantile(trades, 0.9),
  };
}

export function groupByTicker(rows: ScopeEventRow[]) {
  const map = new Map<string, ScopeEventRow[]>();
  for (const r of rows) {
    const t = r.ticker;
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(r);
  }
  return map;
}
