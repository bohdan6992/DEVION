import { intn, minuteIdxToClockLabel, num, optNumOrNull, toYmd } from "./format";
import { SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL, SCOPE_RESEARCH_RESULT_OPTIONS_ALL } from "./scopeParameters";
import type { ScannerScopeCatalog } from "./scopeParameters";
import type { PaperArbClosedDto, ScopeResearchBinRow, ScopeResearchComputed, ScopeResearchDraft, ScopeResearchOption, ScopeResearchParameterKey, ScopeResearchPoint, ScopeResearchResultKey, ScopeResearchSelection, ScopeResearchStats, ScopeResearchThresholdRow, ScopeResearchValueFormat } from "./types";

export function getEpisodeDateKey(row: PaperArbClosedDto, fallbackDate?: string | null) {
  const extractYmd = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const head = raw.slice(0, 10);
    if (toYmd(head)) return head;
    const match = raw.match(/\b\d{4}-\d{2}-\d{2}\b/);
    return match?.[0] && toYmd(match[0]) ? match[0] : null;
  };

  const tsCandidates = [row.startTsNy, row.peakTsNy, row.endTsNy, row.episodeId];
  for (const candidate of tsCandidates) {
    const ymd = extractYmd(candidate);
    if (ymd) return ymd;
  }

  const candidates = [
    row.dateNy,
    row.date,
    row.day,
    row.tradeDateNy,
    row.tradeDate,
    row.sessionDateNy,
    row.sessionDate,
    fallbackDate ?? null,
  ];

  for (const candidate of candidates) {
    const ymd = extractYmd(candidate);
    if (ymd) return ymd;
  }
  return null;
}

export function scopeResearchParameterValue(row: PaperArbClosedDto, key: ScopeResearchParameterKey): number | null {
  switch (key) {
    case "startMinuteIdx":
      return Number.isFinite(row.startMinuteIdx) ? row.startMinuteIdx : null;
    case "peakMinuteIdx":
      return Number.isFinite(row.peakMinuteIdx) ? row.peakMinuteIdx : null;
    case "endMinuteIdx":
      return Number.isFinite(row.endMinuteIdx) ? row.endMinuteIdx : null;
    case "timeToPeak":
      return Number.isFinite(row.startMinuteIdx) && Number.isFinite(row.peakMinuteIdx)
        ? row.peakMinuteIdx - row.startMinuteIdx
        : null;
    case "timeToClose":
      return Number.isFinite(row.startMinuteIdx) && Number.isFinite(row.endMinuteIdx)
        ? row.endMinuteIdx - row.startMinuteIdx
        : null;
    case "startMetricAbs":
      return row.startMetricAbs ?? null;
    case "peakMetricAbs":
      return row.peakMetricAbs ?? null;
    case "endMetricAbs":
      return row.endMetricAbs ?? null;
    case "reversionAbs": {
      const peak = row.peakMetricAbs ?? null;
      const end = row.endMetricAbs ?? null;
      return peak != null && end != null ? peak - end : null;
    }
    case "reversionPct": {
      const peak = row.peakMetricAbs ?? null;
      const end = row.endMetricAbs ?? null;
      return peak != null && end != null && peak !== 0 ? (peak - end) / peak : null;
    }
    case "minHoldCandles":
      return row.minHoldCandles ?? null;
    case "rating":
      return row.rating ?? null;
    case "ratingTotal":
      return row.ratingTotal ?? null;
    case "corr":
      return row.corr ?? null;
    case "beta":
      return row.beta ?? null;
    case "sigma":
      return row.sigma ?? null;
    case "adv20":
      return row.adv20 ?? null;
    case "adv20NF":
      return row.adv20NF ?? null;
    case "adv90":
      return row.adv90 ?? null;
    case "adv90NF":
      return row.adv90NF ?? null;
    case "avPreMhv":
      return row.avPreMhv ?? null;
    case "roundLot":
      return row.roundLot ?? null;
    case "vwap":
      return row.vwap ?? null;
    case "spread":
      return row.spreadBidPct ?? null;
    case "lstPrcL":
      return row.lstPrcL ?? null;
    case "lstCls":
      return row.lstCls ?? null;
    case "yCls":
      return row.yCls ?? null;
    case "tCls":
      return row.tCls ?? null;
    case "clsToClsPct":
      return row.clsToClsPct ?? null;
    case "lo":
      return row.lo ?? null;
    case "newsCnt":
      return row.newsCnt ?? null;
    case "marketCapM":
      return row.marketCapM ?? null;
    case "preMktVolNF":
      return row.preMktVolNF ?? null;
    case "volNFfromLstCls":
      return row.volNFfromLstCls ?? null;
    case "avPostMhVol90NF":
      return row.avPostMhVol90NF ?? null;
    case "avPreMhVol90NF":
      return row.avPreMhVol90NF ?? null;
    case "avPreMhValue20NF":
      return row.avPreMhValue20NF ?? null;
    case "avPreMhValue90NF":
      return row.avPreMhValue90NF ?? null;
    case "avgDailyValue20":
      return row.avgDailyValue20 ?? null;
    case "avgDailyValue90":
      return row.avgDailyValue90 ?? null;
    case "volatility20":
      return row.volatility20 ?? null;
    case "volatility90":
      return row.volatility90 ?? null;
    case "preMhMDV20NF":
      return row.preMhMDV20NF ?? null;
    case "preMhMDV90NF":
      return row.preMhMDV90NF ?? null;
    case "volRel":
      return row.volRel ?? null;
    case "preMhBidLstPrcPct":
      return row.preMhBidLstPrcPct ?? null;
    case "preMhLoLstPrcPct":
      return row.preMhLoLstPrcPct ?? null;
    case "preMhHiLstClsPct":
      return row.preMhHiLstClsPct ?? null;
    case "preMhLoLstClsPct":
      return row.preMhLoLstClsPct ?? null;
    case "lstPrcLstClsPct":
      return row.lstPrcLstClsPct ?? null;
    case "imbExch925":
      return row.imbExch925 ?? null;
    case "imbExch1555":
      return row.imbExch1555 ?? null;
  }
}

export function scopeResearchResultValue(row: PaperArbClosedDto, key: ScopeResearchResultKey): number | null {
  switch (key) {
    case "avgPnlUsd":
    case "totalPnlUsd":
    case "winRate":
    case "score":
      return row.totalPnlUsd ?? null;
    case "rawPnlUsd":
      return row.rawPnlUsd ?? null;
    case "benchPnlUsd":
      return row.benchPnlUsd ?? null;
    case "hedgedPnlUsd":
      return row.hedgedPnlUsd ?? null;
    case "peakMetricAbs":
      return row.peakMetricAbs ?? null;
    case "endMetricAbs":
      return row.endMetricAbs ?? null;
  }
}

export function scopeResearchMetricValue(row: ScopeResearchStats, key: ScopeResearchResultKey): number {
  switch (key) {
    case "avgPnlUsd":
      return row.avg;
    case "totalPnlUsd":
      return row.total;
    case "winRate":
      return row.winRate;
    case "score":
      return row.score;
    default:
      return row.avg;
  }
}

export function scopeResearchMetricLabel(key: ScopeResearchResultKey): string {
  switch (key) {
    case "avgPnlUsd":
      return "avg/trade";
    case "totalPnlUsd":
      return "total";
    case "winRate":
      return "win";
    case "score":
      return "score";
    default:
      return "avg";
  }
}

export function scopeResearchSourceResultKey(key: ScopeResearchResultKey): ScopeResearchResultKey {
  switch (key) {
    case "avgPnlUsd":
    case "totalPnlUsd":
    case "winRate":
    case "score":
      return "totalPnlUsd";
    default:
      return key;
  }
}

export function scopeResearchOptionByValue<T extends string>(options: Array<ScopeResearchOption<T>>, value: T): ScopeResearchOption<T> {
  return options.find((option) => option.value === value) ?? options[0];
}

export function scopeResearchPercentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const pos = Math.max(0, Math.min(sortedValues.length - 1, (sortedValues.length - 1) * p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  const left = sortedValues[lo] ?? sortedValues[0] ?? 0;
  const right = sortedValues[hi] ?? sortedValues[sortedValues.length - 1] ?? left;
  return left + (right - left) * weight;
}

// Same stats as scopeResearchSummarize, but for an array that is ALREADY sorted ascending.
// Callers that build sorted subsets incrementally (bucket merges, threshold prefixes) use this
// to avoid re-sorting the same values once per bucket/threshold.
export function scopeResearchSummarizeSorted(sorted: number[]): ScopeResearchStats {
  const count = sorted.length;
  let total = 0;
  let wins = 0;
  for (let i = 0; i < count; i += 1) {
    const value = sorted[i] ?? 0;
    total += value;
    if (value > 0) wins += 1;
  }
  const avg = count ? total / count : 0;
  const median = scopeResearchPercentile(sorted, 0.5);
  const q1 = scopeResearchPercentile(sorted, 0.25);
  const q3 = scopeResearchPercentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - iqr * 1.5;
  const upperFence = q3 + iqr * 1.5;
  return {
    count,
    total,
    avg,
    median,
    winRate: count ? wins / count : 0,
    score: avg,
    q1,
    q3,
    lowerFence,
    upperFence,
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
  };
}

export function scopeResearchSummarize(values: number[]): ScopeResearchStats {
  return scopeResearchSummarizeSorted([...values].sort((a, b) => a - b));
}

// Merges two ascending arrays into a new ascending array without re-sorting.
export function mergeSortedNumbers(left: number[], right: number[]): number[] {
  if (!left.length) return right.slice();
  if (!right.length) return left.slice();
  const out = new Array<number>(left.length + right.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < left.length && j < right.length) {
    out[k++] = (left[i] ?? 0) <= (right[j] ?? 0) ? left[i++]! : right[j++]!;
  }
  while (i < left.length) out[k++] = left[i++]!;
  while (j < right.length) out[k++] = right[j++]!;
  return out;
}

export function scopeResearchEdges(values: number[], bucketCount: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const minValue = sorted[0] ?? 0;
  const maxValue = sorted[sorted.length - 1] ?? minValue;
  if (minValue === maxValue) return [minValue - 0.5, maxValue + 0.5];

  const count = Math.max(2, Math.min(32, Math.trunc(bucketCount) || 8));
  const quantileEdges = Array.from({ length: count + 1 }, (_, index) => {
    const p = index / count;
    return scopeResearchPercentile(sorted, p);
  });
  quantileEdges[0] = minValue;
  quantileEdges[quantileEdges.length - 1] = maxValue;

  const deduped = quantileEdges.filter((edge, index, arr) => {
    if (index === 0) return true;
    return Math.abs(edge - (arr[index - 1] ?? edge)) > 1e-9;
  });

  if (deduped.length >= 3) {
    return deduped;
  }

  const step = (maxValue - minValue) / count;
  const fallbackEdges = Array.from({ length: count + 1 }, (_, index) => minValue + step * index);
  fallbackEdges[0] = minValue;
  fallbackEdges[fallbackEdges.length - 1] = maxValue;
  return fallbackEdges;
}

export function scopeResearchFormatValue(value: number, format: ScopeResearchValueFormat, digits = 2): string {
  if (!Number.isFinite(value)) return "-";
  switch (format) {
    case "currency":
      return `$${num(value, digits)}`;
    case "clock":
      return minuteIdxToClockLabel(Math.round(value));
    case "minutes":
      return `${intn(value)}m`;
    case "percent":
      return `${num(value * 100, 1)}%`;
    case "number":
    default:
      return num(value, digits);
  }
}

export function scopeResearchRangeLabel(from: number, to: number, format: ScopeResearchValueFormat): string {
  return `${scopeResearchFormatValue(from, format, format === "percent" ? 3 : 2)} .. ${scopeResearchFormatValue(
    to,
    format,
    format === "percent" ? 3 : 2
  )}`;
}

export function scopeResearchLabelLines(label: string): [string, string?] {
  const trimmed = label.trim();
  if (trimmed.includes(" .. ")) {
    const [left, right] = trimmed.split(" .. ");
    return [left?.trim() ?? trimmed, `.. ${right?.trim() ?? ""}`.trim()];
  }
  if (trimmed.startsWith(">=") || trimmed.startsWith("<=")) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return [parts.slice(0, 2).join(" "), parts.slice(2).join(" ") || undefined];
    }
  }
  const mid = Math.ceil(trimmed.length / 2);
  if (trimmed.length > 18) {
    return [trimmed.slice(0, mid).trim(), trimmed.slice(mid).trim()];
  }
  return [trimmed];
}

export function scopeResearchDailySeries(points: ScopeResearchPoint[]) {
  const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey || a.parameter - b.parameter);
  const grouped = Array.from(
    sorted.reduce((map, point) => {
      const entry = map.get(point.dateKey) ?? { dateKey: point.dateKey, total: 0, count: 0, avgParam: 0, items: [] as ScopeResearchPoint[] };
      entry.total += point.result;
      entry.count += 1;
      entry.avgParam += point.parameter;
      entry.items.push(point);
      map.set(point.dateKey, entry);
      return map;
    }, new Map<string, { dateKey: string; total: number; count: number; avgParam: number; items: ScopeResearchPoint[] }>())
  ).map(([, entry]) => ({
    ...entry,
    avgParam: entry.count ? entry.avgParam / entry.count : 0,
  }));

  let running = 0;
  return grouped.map((row, index) => {
    running += row.total;
    return { ...row, index, cumulative: running };
  });
}

export function buildScopeResearchSelectionFromDraft(
  draft: ScopeResearchDraft,
  catalog: ScannerScopeCatalog
): ScopeResearchSelection {
  return {
    chartType: draft.chartType,
    parameterKey: draft.parameterKey,
    resultKey: catalog.normalizeResultKey(draft.chartType, draft.resultKey),
    bucketCount: draft.bucketCount,
    minSamples: draft.minSamples,
    thresholdMode: draft.thresholdMode,
    domainFrom: optNumOrNull(draft.domainFrom),
    domainTo: optNumOrNull(draft.domainTo),
    extraFilters: draft.extraFilters.map((filter) => ({
      id: filter.id,
      parameterKey: filter.parameterKey,
      from: optNumOrNull(filter.from),
      to: optNumOrNull(filter.to),
    })),
    parallelFilters: draft.parallelFilters.map((filter) => ({
      id: filter.id,
      parameterKey: filter.parameterKey,
      from: optNumOrNull(filter.from),
      to: optNumOrNull(filter.to),
    })),
  };
}

export function scopeResearchFilterMatchesRow(
  row: PaperArbClosedDto,
  filters: Array<{ parameterKey: ScopeResearchParameterKey; from: number | null; to: number | null }>
) {
  return filters.every((filter) => {
    const value = scopeResearchParameterValue(row, filter.parameterKey);
    if (value == null || !Number.isFinite(value)) return false;
    const lo = filter.from != null && filter.to != null ? Math.min(filter.from, filter.to) : filter.from;
    const hi = filter.from != null && filter.to != null ? Math.max(filter.from, filter.to) : filter.to;
    if (lo != null && value < lo) return false;
    if (hi != null && value > hi) return false;
    return true;
  });
}

export function scopeResearchFilterLabel(
  filter: { parameterKey: ScopeResearchParameterKey; from: number | null; to: number | null }
) {
  const option = scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL, filter.parameterKey);
  const lo = filter.from != null && filter.to != null ? Math.min(filter.from, filter.to) : filter.from;
  const hi = filter.from != null && filter.to != null ? Math.max(filter.from, filter.to) : filter.to;
  if (lo != null && hi != null) {
    return `${option.label} ${scopeResearchFormatValue(lo, option.format)} .. ${scopeResearchFormatValue(hi, option.format)}`;
  }
  if (lo != null) return `${option.label} >= ${scopeResearchFormatValue(lo, option.format)}`;
  if (hi != null) return `${option.label} <= ${scopeResearchFormatValue(hi, option.format)}`;
  return option.label;
}

export function computeScopeResearch(
  rows: PaperArbClosedDto[],
  selection: ScopeResearchSelection | null,
  fallbackDate: string,
  fixedEdges?: number[],
  includeParallel = true
): ScopeResearchComputed | null {
  if (!selection) return null;

  const parameter = scopeResearchOptionByValue(SCOPE_RESEARCH_PARAMETER_OPTIONS_ALL, selection.parameterKey);
  const result = scopeResearchOptionByValue(SCOPE_RESEARCH_RESULT_OPTIONS_ALL, selection.resultKey);
  const sourceResult = scopeResearchOptionByValue(SCOPE_RESEARCH_RESULT_OPTIONS_ALL, scopeResearchSourceResultKey(selection.resultKey));
  const rawPoints = rows
    .filter((row) => scopeResearchFilterMatchesRow(row, selection.extraFilters))
    .map((row) => {
      const parameterValue = scopeResearchParameterValue(row, selection.parameterKey);
      const resultValue = scopeResearchResultValue(row, selection.resultKey);
      const dateKey = getEpisodeDateKey(row, fallbackDate) ?? "unknown";
      return {
        row,
        parameter: parameterValue,
        result: resultValue,
        dateKey,
        sortKey: Number(dateKey.replace(/-/g, "")) || 0,
      };
    })
    .filter(
      (point): point is ScopeResearchPoint =>
        point.parameter != null && point.result != null && Number.isFinite(point.parameter) && Number.isFinite(point.result)
    );
  const domainLo = selection.domainFrom != null && selection.domainTo != null ? Math.min(selection.domainFrom, selection.domainTo) : selection.domainFrom;
  const domainHi = selection.domainFrom != null && selection.domainTo != null ? Math.max(selection.domainFrom, selection.domainTo) : selection.domainTo;
  const points = rawPoints.filter((point) => {
    if (domainLo != null && point.parameter < domainLo) return false;
    if (domainHi != null && point.parameter > domainHi) return false;
    return true;
  });

  if (!points.length) {
    return {
      selection,
      parameter,
        result,
        sourceResult,
        sourceCount: 0,
      points: [],
      bins: [],
      thresholds: [],
      bestBin: null,
      bestThreshold: null,
      bestBox: null,
      parallelSeries: [],
      parallelPointSeries: [],
    };
  }

  const parameterValues = points.map((point) => point.parameter);
  const edges = fixedEdges && fixedEdges.length >= 2 ? fixedEdges : scopeResearchEdges(parameterValues, selection.bucketCount);
  const minSamples = Math.max(1, Math.trunc(selection.minSamples) || 1);

  // Sorting once by parameter turns bucket assignment into a single merge pass (was O(points x buckets)
  // with a rescan from bucket 0 per point) and turns each threshold subset into a contiguous slice
  // (was a full predicate scan over every point, per threshold).
  const pointsByParameter = [...points].sort((a, b) => a.parameter - b.parameter);
  const rawBuckets =
    edges.length < 2
      ? []
      : Array.from({ length: edges.length - 1 }, (_, i) => ({
          from: edges[i] ?? 0,
          to: edges[i + 1] ?? 0,
          values: [] as number[],
        }));

  if (rawBuckets.length) {
    const lastIdx = rawBuckets.length - 1;
    let bucketIdx = 0;
    for (const point of pointsByParameter) {
      const p = point.parameter;
      // Advance past buckets this (and every later) point has already cleared.
      while (bucketIdx <= lastIdx) {
        const b = rawBuckets[bucketIdx]!;
        if (p < b.from) break;
        if (bucketIdx === lastIdx ? p <= b.to : p < b.to) break;
        bucketIdx += 1;
      }
      if (bucketIdx > lastIdx) break; // remaining points sit past the last bucket
      const b = rawBuckets[bucketIdx]!;
      if (p >= b.from && (bucketIdx === lastIdx ? p <= b.to : p < b.to)) {
        b.values.push(point.result);
      }
    }
  }

  // Bucket values arrive in parameter order; sort each bucket once so both the bin summary and the
  // threshold prefixes below can be built without any further sorting.
  const bucketSortedValues = rawBuckets.map((bucket) => bucket.values.sort((a, b) => a - b));

  const bins: ScopeResearchBinRow[] = [];
  for (let i = 0; i < rawBuckets.length; i += 1) {
    const bucket = rawBuckets[i]!;
    const sortedValues = bucketSortedValues[i]!;
    if (sortedValues.length < minSamples) continue;
    bins.push({
      label: scopeResearchRangeLabel(bucket.from, bucket.to, parameter.format),
      from: bucket.from,
      to: bucket.to,
      values: sortedValues,
      ...scopeResearchSummarizeSorted(sortedValues),
    });
  }

  const thresholdSeeds = edges.slice(1, -1).length ? edges.slice(1, -1) : edges.slice(0, -1);
  const isLessThan = selection.thresholdMode === "less_than";
  const thresholds: ScopeResearchThresholdRow[] = [];
  if (thresholdSeeds.length) {
    // Threshold subsets are nested (each `<=` prefix contains the previous one, each `>=` suffix is
    // contained by the previous one), so walk them in that order and merge the new slice into the
    // running sorted array instead of rebuilding and re-sorting the whole subset every time.
    const segmentBoundary = (threshold: number) => {
      // index of the first point strictly outside the `<=` prefix for this threshold
      let lo = 0;
      let hi = pointsByParameter.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const value = pointsByParameter[mid]!.parameter;
        const inside = isLessThan ? value <= threshold : value < threshold;
        if (inside) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const order = isLessThan
      ? thresholdSeeds.map((threshold, index) => ({ threshold, index }))
      : thresholdSeeds.map((threshold, index) => ({ threshold, index })).reverse();

    const rows: Array<ScopeResearchThresholdRow | null> = new Array(thresholdSeeds.length).fill(null);
    let running: number[] = [];
    let cursor = isLessThan ? 0 : pointsByParameter.length;

    for (const { threshold, index } of order) {
      const boundary = segmentBoundary(threshold);
      const segment: number[] = [];
      if (isLessThan) {
        for (let i = cursor; i < boundary; i += 1) segment.push(pointsByParameter[i]!.result);
        cursor = Math.max(cursor, boundary);
      } else {
        for (let i = boundary; i < cursor; i += 1) segment.push(pointsByParameter[i]!.result);
        cursor = Math.min(cursor, boundary);
      }
      if (segment.length) {
        segment.sort((a, b) => a - b);
        running = mergeSortedNumbers(running, segment);
      }
      if (running.length < minSamples) continue;
      rows[index] = {
        label: `${isLessThan ? "<=" : ">="} ${scopeResearchFormatValue(
          threshold,
          parameter.format,
          parameter.format === "percent" ? 3 : 2
        )}`,
        threshold,
        ...scopeResearchSummarizeSorted(running),
      };
    }

    for (const row of rows) {
      if (row) thresholds.push(row);
    }
  }

  // Single linear pass instead of copying + fully sorting the array just to read element 0.
  // bestBin and bestBox were identical sorts of the same array.
  const pickBest = <T extends ScopeResearchStats>(candidates: T[]): T | null => {
    let best: T | null = null;
    let bestMetric = 0;
    for (const candidate of candidates) {
      const metric = scopeResearchMetricValue(candidate, selection.resultKey);
      if (best == null || metric > bestMetric || (metric === bestMetric && candidate.count > best.count)) {
        best = candidate;
        bestMetric = metric;
      }
    }
    return best;
  };
  const bestBin = pickBest(bins);
  const bestThreshold = pickBest(thresholds);
  const bestBox = bestBin;
  // Each parallel filter is evaluated exactly once; both the bin/threshold series and the
  // raw point series are read off that single result (they used to run the same recursive
  // computeScopeResearch twice with identical arguments).
  const parallelSeries: ScopeResearchComputed["parallelSeries"] = [];
  const parallelPointSeries: ScopeResearchComputed["parallelPointSeries"] = [];
  if (includeParallel) {
    for (const filter of selection.parallelFilters) {
      const computed = computeScopeResearch(
        rows,
        {
          ...selection,
          extraFilters: [...selection.extraFilters, filter],
          parallelFilters: [],
        },
        fallbackDate,
        edges,
        false
      );
      if (!computed) continue;
      const label = scopeResearchFilterLabel(filter);
      const seriesRows =
        selection.chartType === "results_more_less_parameter" ? computed.thresholds : computed.bins;
      if (seriesRows.length >= 2) {
        parallelSeries.push({ id: filter.id, label, rows: seriesRows });
      }
      if (computed.points.length) {
        parallelPointSeries.push({ id: filter.id, label, points: computed.points });
      }
    }
  }

  return {
    selection,
    parameter,
    result,
    sourceResult,
    sourceCount: points.length,
    points,
    bins,
    thresholds,
    bestBin,
    bestThreshold,
    bestBox,
    parallelSeries,
    parallelPointSeries,
  };
}
