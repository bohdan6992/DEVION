import type { ScopeEventRow } from "@/lib/scopeApi";
import { calcPerf } from "@/components/scope/tickerStats";

function sortNum(a: number, b: number) {
  return a - b;
}

function quantile(xs: number[], q: number) {
  const a = [...xs].sort(sortNum);
  const n = a.length;
  if (!n) return 0;
  if (n === 1) return a[0];
  const pos = (n - 1) * q;
  const i = Math.floor(pos);
  const frac = pos - i;
  return a[i] + frac * (a[i + 1] - a[i]);
}

function niceFloor(x: number, step: number) {
  return Math.floor(x / step) * step;
}
function niceCeil(x: number, step: number) {
  return Math.ceil(x / step) * step;
}

export function buildLocalPayloadsFromRows(rows: ScopeEventRow[], opts?: { binSize?: number; quantiles?: number }) {
  const binSize = opts?.binSize ?? 0.05;
  const q = opts?.quantiles ?? 5;

  const trades = rows.map((r) => r.trade ?? 0);

  // --- perf
  const perfStats = calcPerf(trades);
  const perf = { kind: "Performance", field: "trade", stats: perfStats };

  // --- cumsum (по даті: dailySum, cumsum)
  const byDate = new Map<number, number>();
  for (const r of rows) {
    byDate.set(r.dateNy, (byDate.get(r.dateNy) ?? 0) + (r.trade ?? 0));
  }
  const datesNy = Array.from(byDate.keys()).sort(sortNum);
  const dailySum = datesNy.map((d) => byDate.get(d) ?? 0);
  const cumsum: number[] = [];
  let acc = 0;
  for (const v of dailySum) {
    acc += v;
    cumsum.push(acc);
  }
  const cs = { kind: "Cumsum", field: "trade", datesNy, dailySum, cumsum, barBinSizeMs: 86400000 };

  // --- distribution (posCounts/negCounts по bins)
  let dist: any = null;
  if (trades.length) {
    const mn = Math.min(...trades);
    const mx = Math.max(...trades);
    const start = niceFloor(mn, binSize);
    const end = niceCeil(mx, binSize);

    const nBins = Math.max(1, Math.round((end - start) / binSize) + 1);
    const posCounts = new Array(nBins).fill(0);
    const negCounts = new Array(nBins).fill(0);

    for (const t of trades) {
      const idx = Math.min(nBins - 1, Math.max(0, Math.floor((t - start) / binSize)));
      if (t >= 0) posCounts[idx] += 1;
      else negCounts[idx] += 1;
    }

    dist = {
      kind: "Distribution",
      field: "trade",
      binStart: start,
      binEnd: end,
      binSize,
      posCounts,
      negCounts,
      mean: perfStats.avg,
      border: 0,
    };
  }

  // --- bins vs move_1000 (quantiles)
  let binsPayload: any = null;
  const pairs = rows
    .map((r) => ({
      x: (r.features as any)?.move_1000 as number | undefined,
      y: r.trade as number,
    }))
    .filter((p) => typeof p.x === "number" && Number.isFinite(p.x) && typeof p.y === "number" && Number.isFinite(p.y));

  if (pairs.length) {
    const xs = pairs.map((p) => p.x as number).sort(sortNum);

    // cut points: q bins => q+1 borders
    const borders: number[] = [];
    for (let i = 0; i <= q; i++) {
      borders.push(quantile(xs, i / q));
    }
    // ensure non-decreasing
    for (let i = 1; i < borders.length; i++) borders[i] = Math.max(borders[i], borders[i - 1]);

    const bins: any[] = [];

    for (let i = 0; i < q; i++) {
      const left = borders[i];
      const right = borders[i + 1];

      const inBin =
        i === q - 1
          ? pairs.filter((p) => (p.x as number) >= left && (p.x as number) <= right)
          : pairs.filter((p) => (p.x as number) >= left && (p.x as number) < right);

      const ys = inBin.map((p) => p.y);
      const st = calcPerf(ys);

      bins.push({
        left,
        right,
        label: `${left.toFixed(3)}..${right.toFixed(3)}`,
        n: st.n,
        sum: st.sum,
        avg: st.avg,
        median: st.median,
        std: st.std,
        batPct: st["bat%"],
        wl: st["W/L"],
        avgWin: st["avg win"],
        avgLoss: st["avg loss"],
      });
    }

    binsPayload = {
      kind: "Bins",
      field: "trade",
      xField: "move_1000",
      mode: "Quantiles",
      bins,
    };
  }

  return {
    perf,
    cs,
    ...(dist ? { dist } : {}),
    ...(binsPayload ? { bins: binsPayload } : {}),
  };
}
