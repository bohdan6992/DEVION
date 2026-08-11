import { num, numOrNull } from "./format";
import { scannerBinRatingSnapshot } from "./rating";
import { scopeResearchParameterValue } from "./scopeCompute";
import type { OptimizerRangeGroupKey, PaperArbClosedDto, PaperArbOptimizerParameterDto, PaperArbOptimizerRangeBucketDto, PaperArbSession, ScopeParameterDefinition, ScopeResearchParameterKey } from "./types";

export function getOptimizerFallbackValue(
  row: PaperArbClosedDto,
  key: "corr" | "beta" | "sigma",
  tickerMeta?: { corr?: number | null; beta?: number | null; sigma?: number | null } | null
): number | null {
  const anyRow = row as any;
  // Hot path: called up to 3x per row per filter pass. Short-circuits on the first hit instead of
  // building a 13-element rest array and parsing every candidate.
  const first = (a?: any, b?: any, c?: any, d?: any): number | null => {
    let parsed = numOrNull(a);
    if (parsed != null) return parsed;
    parsed = numOrNull(b);
    if (parsed != null) return parsed;
    parsed = numOrNull(c);
    if (parsed != null) return parsed;
    return numOrNull(d);
  };

  if (key === "corr") {
    return (
      first(row.corr, anyRow?.Corr, anyRow?.cor, anyRow?.Cor) ??
      first(anyRow?.correlation, anyRow?.Correlation, anyRow?.best?.corr, anyRow?.best?.Corr) ??
      first(anyRow?.meta?.corr, anyRow?.meta?.Corr, anyRow?.static?.corr, anyRow?.static?.Corr) ??
      numOrNull(tickerMeta?.corr)
    );
  }

  if (key === "beta") {
    return (
      first(row.beta, anyRow?.Beta, anyRow?.best?.beta, anyRow?.best?.Beta) ??
      first(anyRow?.meta?.beta, anyRow?.meta?.Beta, anyRow?.static?.beta, anyRow?.static?.Beta) ??
      numOrNull(tickerMeta?.beta)
    );
  }

  return (
    first(row.sigma, anyRow?.sig, anyRow?.Sig, anyRow?.Sigma) ??
    first(anyRow?.best?.sigma, anyRow?.best?.Sigma, anyRow?.meta?.sigma, anyRow?.meta?.Sigma) ??
    first(anyRow?.static?.sigma, anyRow?.static?.Sigma) ??
    numOrNull(tickerMeta?.sigma)
  );
}

// ---------------------------------------------------------------------------
// Numeric optimizer-parameter bucketing (shared engine)
//
// Every "fallback" optimizer parameter is the same shape of work: take one numeric value per
// episode, split the observed range into equal-width buckets, and summarise trades/wins/losses/PnL
// for each bucket plus a cumulative "<= to" and ">= from" tail per bucket.
//
// The previous implementation re-scanned the whole source array once per bucket AND once per tail
// bucket, i.e. 3 x rows x buckets predicate calls for every parameter, with a fresh intermediate
// array each time. With ~50 parameters that dominated the Analytics tab.
//
// This version sorts the values once and answers every bucket and tail from prefix sums in O(log n),
// which is exact — the binary-search boundaries reproduce the original half-open/closed comparisons
// element for element.
// ---------------------------------------------------------------------------
export type OptimizerValueEntry = { value: number; pnl: number };

export function buildNumericOptimizerParameter(args: {
  key: string;
  label: string;
  group: OptimizerRangeGroupKey;
  bucketCount: number;
  entries: OptimizerValueEntry[];
  valueDigits?: number;
}): PaperArbOptimizerParameterDto | null {
  const { key, label, group, bucketCount, entries, valueDigits = 2 } = args;
  if (!entries.length) return null;

  const sorted = entries.slice().sort((a, b) => a.value - b.value);
  const total = sorted.length;

  // prefix[i] covers sorted[0..i)
  const prefTotal = new Float64Array(total + 1);
  const prefWins = new Int32Array(total + 1);
  const prefLosses = new Int32Array(total + 1);
  for (let i = 0; i < total; i += 1) {
    const pnl = sorted[i]!.pnl;
    prefTotal[i + 1] = prefTotal[i]! + pnl;
    prefWins[i + 1] = prefWins[i]! + (pnl > 0 ? 1 : 0);
    prefLosses[i + 1] = prefLosses[i]! + (pnl < 0 ? 1 : 0);
  }

  // first index with value >= target
  const lowerBound = (target: number) => {
    let lo = 0;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]!.value < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // first index with value > target
  const upperBound = (target: number) => {
    let lo = 0;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]!.value <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const buildBucket = (
    bucketId: string,
    bucketLabel: string,
    lo: number,
    hi: number,
    fromValue?: number | null,
    toValue?: number | null
  ): PaperArbOptimizerRangeBucketDto => {
    const trades = Math.max(0, hi - lo);
    const totalPnlUsd = prefTotal[hi]! - prefTotal[lo]!;
    const wins = prefWins[hi]! - prefWins[lo]!;
    const losses = prefLosses[hi]! - prefLosses[lo]!;
    const avgPnlUsd = trades > 0 ? totalPnlUsd / trades : 0;
    return {
      bucketId,
      label: bucketLabel,
      fromValue: fromValue ?? null,
      toValue: toValue ?? null,
      trades,
      wins,
      losses,
      totalPnlUsd,
      avgPnlUsd,
      winRate: trades > 0 ? wins / trades : 0,
      score: avgPnlUsd,
      coveragePct: total > 0 ? trades / total : 0,
    };
  };

  const observedMin = sorted[0]!.value;
  const observedMax = sorted[total - 1]!.value;
  const safeBucketCount = Math.max(1, Math.min(24, Math.trunc(bucketCount) || 1));
  const span = observedMax - observedMin;

  const buckets: PaperArbOptimizerRangeBucketDto[] = [];
  if (span <= 0) {
    buckets.push(
      buildBucket(
        `${key}-bucket-0`,
        `${num(observedMin, valueDigits)} .. ${num(observedMax, valueDigits)}`,
        0,
        total,
        observedMin,
        observedMax
      )
    );
  } else {
    const step = span / safeBucketCount;
    for (let index = 0; index < safeBucketCount; index += 1) {
      const isLast = index === safeBucketCount - 1;
      const fromValue = observedMin + step * index;
      const toValue = isLast ? observedMax : observedMin + step * (index + 1);
      const lo = lowerBound(fromValue);
      const hi = isLast ? upperBound(toValue) : lowerBound(toValue);
      if (hi <= lo) continue;
      buckets.push(
        buildBucket(
          `${key}-bucket-${index}`,
          `${num(fromValue, valueDigits)} .. ${num(toValue, valueDigits)}`,
          lo,
          hi,
          fromValue,
          toValue
        )
      );
    }
  }

  const lowerTailBuckets = buckets.map((bucket, index) =>
    buildBucket(
      `${key}-lt-${index}`,
      `<= ${num(bucket.toValue, valueDigits)}`,
      0,
      bucket.toValue == null ? total : upperBound(bucket.toValue),
      observedMin,
      bucket.toValue ?? observedMax
    )
  );
  const upperTailBuckets = buckets.map((bucket, index) =>
    buildBucket(
      `${key}-gt-${index}`,
      `>= ${num(bucket.fromValue, valueDigits)}`,
      bucket.fromValue == null ? 0 : lowerBound(bucket.fromValue),
      total,
      bucket.fromValue ?? observedMin,
      observedMax
    )
  );

  const base = buildBucket("base", "base", 0, total, observedMin, observedMax);
  return {
    key,
    group,
    label,
    observedMin,
    observedMax,
    valueCount: total,
    baseTrades: base.trades,
    baseWins: base.wins,
    baseLosses: base.losses,
    baseTotalPnlUsd: base.totalPnlUsd,
    baseAvgPnlUsd: base.avgPnlUsd,
    baseWinRate: base.winRate,
    buckets,
    lowerTailBuckets,
    upperTailBuckets,
  };
}

export function buildFallbackOptimizerParameter(
  rows: PaperArbClosedDto[],
  key: "corr" | "beta" | "sigma",
  label: string,
  group: OptimizerRangeGroupKey,
  bucketCount: number,
  tickerMetaByTicker?: Record<string, { corr?: number | null; beta?: number | null; sigma?: number | null }>
): PaperArbOptimizerParameterDto | null {
  const entries: OptimizerValueEntry[] = [];
  for (const row of rows) {
    const value = getOptimizerFallbackValue(
      row,
      key,
      tickerMetaByTicker?.[String(row.ticker ?? "").trim().toUpperCase()] ?? null
    );
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    entries.push({ value, pnl: row.totalPnlUsd ?? 0 });
  }
  return buildNumericOptimizerParameter({ key, label, group, bucketCount, entries });
}

export function buildFallbackBinRatingOptimizerParameter(
  rows: PaperArbClosedDto[],
  key: "minrate" | "mintotal",
  label: string,
  group: OptimizerRangeGroupKey,
  bucketCount: number,
  session: PaperArbSession
): PaperArbOptimizerParameterDto | null {
  const entries: OptimizerValueEntry[] = [];
  for (const row of rows) {
    const snapshot = scannerBinRatingSnapshot({
      row,
      session,
      side: row.side,
      sigmaAbs: row.peakMetricAbs ?? row.startMetricAbs,
    });
    const value = key === "minrate" ? snapshot?.rate ?? null : snapshot?.total ?? null;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    entries.push({ value, pnl: row.totalPnlUsd ?? 0 });
  }
  return buildNumericOptimizerParameter({
    key,
    label,
    group,
    bucketCount,
    entries,
    valueDigits: key === "minrate" ? 2 : 0,
  });
}

export function optimizerKeyToScopeResearchParameterKey(key: string): ScopeResearchParameterKey | null {
  switch (key) {
    case "corr":
      return "corr";
    case "beta":
      return "beta";
    case "sigma":
      return "sigma";
    case "startabs":
      return "startMetricAbs";
    case "endabs":
      return "endMetricAbs";
    case "adv20":
      return "adv20";
    case "adv20nf":
      return "adv20NF";
    case "adv90":
      return "adv90";
    case "adv90nf":
      return "adv90NF";
    case "avpremhv":
      return "avPreMhv";
    case "roundlot":
      return "roundLot";
    case "vwap":
      return "vwap";
    case "spread":
      return "spread";
    case "lstprcl":
      return "lstPrcL";
    case "lstcls":
      return "lstCls";
    case "ycls":
      return "yCls";
    case "tcls":
      return "tCls";
    case "clstocls":
      return "clsToClsPct";
    case "lo":
      return "lo";
    case "lstclsnewscnt":
      return "newsCnt";
    case "marketcapm":
      return "marketCapM";
    case "premhvolnf":
      return "preMktVolNF";
    case "volnffromlstcls":
      return "volNFfromLstCls";
    case "avpostmhvol90nf":
      return "avPostMhVol90NF";
    case "avpremhvol90nf":
      return "avPreMhVol90NF";
    case "avpremhvalue20nf":
      return "avPreMhValue20NF";
    case "avpremhvalue90nf":
      return "avPreMhValue90NF";
    case "avgdailyvalue20":
      return "avgDailyValue20";
    case "avgdailyvalue90":
      return "avgDailyValue90";
    case "volatility20":
      return "volatility20";
    case "volatility90":
      return "volatility90";
    case "premhmdv20nf":
      return "preMhMDV20NF";
    case "premhmdv90nf":
      return "preMhMDV90NF";
    case "volrel":
      return "volRel";
    case "premhbidlstprc":
      return "preMhBidLstPrcPct";
    case "premhlolstprc":
      return "preMhLoLstPrcPct";
    case "premhhilstcls":
      return "preMhHiLstClsPct";
    case "premhlolstcls":
      return "preMhLoLstClsPct";
    case "lstprclstcls":
      return "lstPrcLstClsPct";
    case "imbexch925":
      return "imbExch925";
    case "imbexch1555":
      return "imbExch1555";
    default:
      return null;
  }
}

export function buildFallbackScopeOptimizerParameter(
  rows: PaperArbClosedDto[],
  definition: ScopeParameterDefinition,
  bucketCount: number
): PaperArbOptimizerParameterDto | null {
  const parameterKey = optimizerKeyToScopeResearchParameterKey(definition.key);
  if (!parameterKey) return null;

  const entries: OptimizerValueEntry[] = [];
  for (const row of rows) {
    const value = scopeResearchParameterValue(row, parameterKey);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    entries.push({ value, pnl: row.totalPnlUsd ?? 0 });
  }
  return buildNumericOptimizerParameter({
    key: definition.key,
    label: definition.label,
    group: definition.group,
    bucketCount,
    entries,
  });
}

// Builds a categorical PaperArbOptimizerParameterDto by grouping episodes on a string key.
// Each unique value (sector / benchTicker) becomes one "bucket".
export function buildCategoricalOptimizerParameter(
  rows: PaperArbClosedDto[],
  key: string,
  label: string,
  group: OptimizerRangeGroupKey,
  getValue: (row: PaperArbClosedDto) => string | null | undefined
): PaperArbOptimizerParameterDto | null {
  // Group rows by category value
  const groups = new Map<string, PaperArbClosedDto[]>();
  for (const row of rows) {
    const val = getValue(row);
    const k = val?.trim() || "(none)";
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  if (!groups.size) return null;

  const summarize = (rs: PaperArbClosedDto[]) => {
    const trades = rs.length;
    let wins = 0;
    let totalPnlUsd = 0;
    for (const r of rs) {
      const pnl = r.totalPnlUsd ?? 0;
      totalPnlUsd += pnl;
      if (pnl > 0) wins += 1;
    }
    const losses = trades - wins;
    const avgPnlUsd = trades > 0 ? totalPnlUsd / trades : 0;
    const winRate = trades > 0 ? wins / trades : 0;
    const coveragePct = rows.length > 0 ? trades / rows.length : 0;
    const score = winRate * Math.sign(avgPnlUsd) * Math.abs(avgPnlUsd);
    return { trades, wins, losses, totalPnlUsd, avgPnlUsd, winRate, coveragePct, score };
  };

  const base = summarize(rows);
  // Summarise each category once, then sort the finished buckets. The comparator used to call
  // summarize() on both operands, re-scanning whole categories O(n log n) times.
  const buckets: PaperArbOptimizerRangeBucketDto[] = Array.from(groups.entries())
    .map(([catVal, rs]) => ({
      bucketId: `${key}-cat-${catVal}`,
      label: catVal,
      fromValue: null,
      toValue: null,
      ...summarize(rs),
    }))
    .sort((a, b) => b.totalPnlUsd - a.totalPnlUsd);

  // Tail buckets: worst N (most negative) at each end — for categorical, "lower tail" = worst performers
  const sorted = [...buckets].sort((a, b) => a.totalPnlUsd - b.totalPnlUsd);
  const tailK = Math.max(1, Math.ceil(sorted.length * 0.3));
  const lowerTailBuckets = sorted.slice(0, tailK);
  const upperTailBuckets = sorted.slice(-tailK);

  return {
    key,
    group,
    label,
    observedMin: null,
    observedMax: null,
    valueCount: rows.length,
    baseTrades: base.trades,
    baseWins: base.wins,
    baseLosses: base.losses,
    baseTotalPnlUsd: base.totalPnlUsd,
    baseAvgPnlUsd: base.avgPnlUsd,
    baseWinRate: base.winRate,
    buckets,
    lowerTailBuckets,
    upperTailBuckets,
  };
}

export function scoreTailDamage(param: PaperArbOptimizerParameterDto, minTrades: number): number {
  // Sum of losses from both tail regions — measures how much can be recovered by trimming extremes
  const tailLoss = (buckets: PaperArbOptimizerRangeBucketDto[]) =>
    buckets
      .filter((b) => b.trades >= minTrades && b.totalPnlUsd < 0)
      .reduce((s, b) => s + Math.abs(b.totalPnlUsd), 0);
  return tailLoss(param.lowerTailBuckets ?? []) + tailLoss(param.upperTailBuckets ?? []);
}
