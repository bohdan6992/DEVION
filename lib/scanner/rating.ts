import { getBestParams, normalizeSide, optNumOrNull, safeObj } from "./format";
import type { PaperArbMetric, PaperArbRatingBand, PaperArbRatingMode, PaperArbRatingRule, PaperArbSession, TapeArbSide } from "./types";

export const PAPER_ARB_RATING_BANDS: PaperArbRatingBand[] = ["BLUE", "ARK", "PRE", "OPEN", "INTRA", "PRINT", "POST", "GLOBAL"];

export function normalizePaperArbRatingRules(
  rules: Array<{ band: PaperArbRatingBand; minRate: number; minTotal: number }>
): PaperArbRatingRule[] {
  const byBand = new Map<PaperArbRatingBand, PaperArbRatingRule>();
  for (const band of PAPER_ARB_RATING_BANDS) {
    byBand.set(band, { band, minRate: 0, minTotal: 0 });
  }
  for (const rule of rules) {
    if (!PAPER_ARB_RATING_BANDS.includes(rule.band)) continue;
    byBand.set(rule.band, {
      band: rule.band,
      minRate: Number(rule.minRate) || 0,
      minTotal: Number(rule.minTotal) || 0,
    });
  }
  return PAPER_ARB_RATING_BANDS.map((band) => byBand.get(band)!);
}

export function ratingBandFromSession(session: PaperArbSession): PaperArbRatingBand {
  switch (session) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "PRE":
      return "PRE";
    case "OPEN":
      return "OPEN";
    case "INTRA":
      return "INTRA";
    case "POST":
      return "POST";
    case "NIGHT":
    case "GLOB":
    default:
      return "GLOBAL";
  }
}

export function ratingBandToBinClassKey(band: PaperArbRatingBand): string {
  switch (band) {
    case "BLUE":
      return "blue";
    case "ARK":
      return "ark";
    case "PRE":
      return "pre";
    case "OPEN":
      return "open";
    case "INTRA":
      return "intra";
    case "PRINT":
      return "print";
    case "POST":
      return "post";
    default:
      return "global";
  }
}

export function binSignKeyForSide(side: TapeArbSide): "pos" | "neg" | null {
  const normalized = normalizeSide(side);
  if (normalized.isLong === true) return "neg";
  if (normalized.isLong === false) return "pos";
  return null;
}

export type BinInterval = { lo: number; hi: number; rate: number; total: number };

export const EMPTY_BIN_INTERVALS: BinInterval[] = [];

// best_params payloads are large, deeply nested and immutable for the lifetime of a row object,
// but the rating/window helpers below used to re-walk and re-parse them for every row on every
// filter pass. These WeakMaps parse each payload once and let the entries be collected with the
// rows they came from.
export const binIntervalsCache = new WeakMap<object, BinInterval[]>();

export function parseBinIntervals(value: any): BinInterval[] {
  if (!Array.isArray(value)) return EMPTY_BIN_INTERVALS;
  const cached = binIntervalsCache.get(value);
  if (cached) return cached;
  const out: BinInterval[] = [];
  for (const item of value) {
    const obj = safeObj(item);
    const lo = optNumOrNull(obj?.lo ?? obj?.from ?? obj?.min ?? obj?.Min);
    const hi = optNumOrNull(obj?.hi ?? obj?.to ?? obj?.max ?? obj?.Max);
    const rate = optNumOrNull(obj?.rate ?? obj?.Rate ?? obj?.rating ?? obj?.Rating);
    const total = optNumOrNull(obj?.total ?? obj?.Total ?? obj?.count ?? obj?.Count);
    if (lo == null || hi == null || rate == null || total == null) continue;
    out.push({ lo: Math.min(lo, hi), hi: Math.max(lo, hi), rate, total });
  }
  binIntervalsCache.set(value, out);
  return out;
}

export type ParsedBestParams = {
  sigmaPeakBins: Record<string, any> | null;
  sigmaBinStats: Record<string, any> | null;
  sigmaBinStep: number;
  sigmaBinMin: number;
  sigmaBinMax: number;
  topWindows: Record<string, any> | null;
};

export const EMPTY_PARSED_BEST_PARAMS: ParsedBestParams = {
  sigmaPeakBins: null,
  sigmaBinStats: null,
  sigmaBinStep: 0.5,
  sigmaBinMin: 0.5,
  sigmaBinMax: 10.0,
  topWindows: null,
};

export const parsedBestParamsCache = new WeakMap<object, ParsedBestParams>();

export function parseBestParams(row: any): ParsedBestParams {
  const root = safeObj(getBestParams(row));
  if (!root) return EMPTY_PARSED_BEST_PARAMS;
  const cached = parsedBestParamsCache.get(root);
  if (cached) return cached;

  const bwAny = safeObj(root.best_windows_any ?? root.BestWindowsAny);
  const stitched = safeObj(bwAny?.stitched ?? bwAny?.Stitched);
  const sigBinParams = safeObj(bwAny?.sigma_bin_params ?? bwAny?.SigmaBinParams);
  const parsed: ParsedBestParams = {
    sigmaPeakBins: safeObj(stitched?.sigma_peak_bins ?? stitched?.SigmaPeakBins),
    sigmaBinStats: safeObj(stitched?.sigma_bin_stats ?? stitched?.SigmaBinStats),
    sigmaBinStep: Number(sigBinParams?.step ?? 0.5),
    sigmaBinMin: Number(sigBinParams?.min ?? 0.5),
    sigmaBinMax: Number(sigBinParams?.max ?? 10.0),
    topWindows: safeObj(root.top_windows ?? root.TopWindows),
  };
  parsedBestParamsCache.set(root, parsed);
  return parsed;
}

export function bestParamsBinIntervals(parsed: ParsedBestParams, classKey: string, signKey: "pos" | "neg"): BinInterval[] {
  const classBins = safeObj(parsed.sigmaPeakBins?.[classKey]);
  return parseBinIntervals(classBins?.[signKey]);
}

export function scannerBinRatingSnapshot(args: {
  row: any;
  session: PaperArbSession;
  side: TapeArbSide;
  sigmaAbs: number | null | undefined;
}) {
  const { row, session, side, sigmaAbs } = args;
  const signKey = binSignKeyForSide(side);
  if (!signKey || sigmaAbs == null || !Number.isFinite(sigmaAbs)) return null;
  const classKey = ratingBandToBinClassKey(ratingBandFromSession(session));
  const intervals = bestParamsBinIntervals(parseBestParams(row), classKey, signKey);
  if (!intervals.length) return null;
  const absSigma = Math.abs(sigmaAbs);
  const match = intervals.find((interval) => absSigma >= interval.lo && absSigma <= interval.hi);
  return match ?? null;
}

export function passesBinRatingByBestParams(args: {
  row: any;
  classKey: string;
  signKey: "pos" | "neg" | null;
  sigmaAbs: number | null | undefined;
  minRate: number;
  minTotal: number;
}) {
  const { row, classKey, signKey, sigmaAbs, minRate, minTotal } = args;
  if (!signKey || sigmaAbs == null || !Number.isFinite(sigmaAbs)) return false;
  const intervals = bestParamsBinIntervals(parseBestParams(row), classKey, signKey);
  if (!intervals.length) return false;

  const effectiveMinRate = Math.max(0, Number(minRate) || 0);
  const effectiveMinTotal = Math.max(0, Math.trunc(Number(minTotal) || 0));
  const absSigma = Math.abs(sigmaAbs);

  return intervals.some((interval) =>
    absSigma >= interval.lo &&
    absSigma <= interval.hi &&
    interval.rate >= effectiveMinRate &&
    interval.total >= effectiveMinTotal
  );
}

export function scannerBinFilterEnabled(args: {
  ratingMode: PaperArbRatingMode;
  metric: PaperArbMetric;
}) {
  return args.ratingMode === "BIN" && args.metric === "SigmaZap";
}

export function scannerSigBinSnapshot(args: {
  row: any;
  session: PaperArbSession;
  side: TapeArbSide;
  sigmaAbs: number | null | undefined;
}): { rate: number; total: number } | null {
  const { row, session, side, sigmaAbs } = args;
  const signKey = binSignKeyForSide(side);
  if (!signKey || sigmaAbs == null || !Number.isFinite(sigmaAbs)) return null;
  const classKey = ratingBandToBinClassKey(ratingBandFromSession(session));
  const parsed = parseBestParams(row);
  const clsStats = safeObj(parsed.sigmaBinStats?.[classKey]);
  const signStats = safeObj(clsStats?.[signKey]);
  // compute bin key matching Python: floor(abs / step) * step formatted to 1 decimal
  const step = parsed.sigmaBinStep;
  const min = parsed.sigmaBinMin;
  const max = parsed.sigmaBinMax;
  const v = Math.max(min, Math.min(max, Math.abs(sigmaAbs)));
  const binKey = (Math.floor(v / step) * step).toFixed(1);
  const entry = safeObj(signStats?.[binKey]);
  if (!entry) return null;
  const rate = optNumOrNull(entry.r ?? entry.rate ?? entry.Rate);
  const total = optNumOrNull(entry.t ?? entry.total ?? entry.Total);
  if (rate == null || total == null) return null;
  return { rate, total };
}

export function scannerTopWindowSnapshot(args: {
  row: any;
  session: PaperArbSession;
  side: TapeArbSide;
  sigmaAbs: number | null | undefined;
}): { sigma: { lo: number; hi: number } | null; bench: { lo: number; hi: number } | null; time: { band: string } | null } | null {
  const { row, session, side, sigmaAbs } = args;
  const signKey = binSignKeyForSide(side);
  if (!signKey) return null;
  const classKey = ratingBandToBinClassKey(ratingBandFromSession(session));
  const tw = safeObj(parseBestParams(row).topWindows?.[classKey]);
  const entry = safeObj(tw?.[signKey]);
  if (!entry) return null;
  const sigmaTw = safeObj(entry.sigma);
  const benchTw = safeObj(entry.bench);
  const timeTw = safeObj(entry.time);
  return {
    sigma: sigmaTw && optNumOrNull(sigmaTw.lo) != null && optNumOrNull(sigmaTw.hi) != null
      ? { lo: Number(sigmaTw.lo), hi: Number(sigmaTw.hi) }
      : null,
    bench: benchTw && optNumOrNull(benchTw.lo) != null && optNumOrNull(benchTw.hi) != null
      ? { lo: Number(benchTw.lo), hi: Number(benchTw.hi) }
      : null,
    time: timeTw && typeof timeTw.band === "string" ? { band: timeTw.band } : null,
  };
}

export function scannerCurrentTimeBand(bandMinutes: number): string {
  const now = new Date();
  const etMs = now.getTime() - 4 * 60 * 60 * 1000;
  const et = new Date(etMs);
  const h = et.getUTCHours();
  const m = Math.floor(et.getUTCMinutes() / bandMinutes) * bandMinutes;
  const totalEnd = h * 60 + m + bandMinutes;
  const eh = Math.floor(totalEnd / 60) % 24;
  const em = totalEnd % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function passesScannerBinRatingFilter(args: {
  enabled: boolean;
  row: any;
  session: PaperArbSession;
  side: TapeArbSide;
  sigmaAbs: number | null | undefined;
  minRate: number;
  minTotal: number;
}) {
  const { enabled, row, session, side, sigmaAbs, minRate, minTotal } = args;
  if (!enabled) return true;
  const signKey = binSignKeyForSide(side);
  const classKey = ratingBandToBinClassKey(ratingBandFromSession(session));
  return passesBinRatingByBestParams({
    row,
    classKey,
    signKey,
    sigmaAbs,
    minRate,
    minTotal,
  });
}

export function passesDeltaZapGate(args: {
  side: TapeArbSide;
  metricAbs: number | null | undefined;
  deltaAbs: number | null | undefined;
  printMedianPos?: number | null;
  printMedianNeg?: number | null;
}) {
  const { side, metricAbs, deltaAbs, printMedianPos, printMedianNeg } = args;
  if (metricAbs == null || !Number.isFinite(metricAbs)) return false;
  if (deltaAbs == null || !Number.isFinite(deltaAbs)) return false;
  const sideInfo = normalizeSide(side);
  const FALLBACK_PRINT_MEDIAN = 0.1;
  if (sideInfo.isLong === true) {
    const threshold = Math.abs(printMedianNeg ?? FALLBACK_PRINT_MEDIAN) + Math.max(0, deltaAbs);
    return Math.abs(metricAbs) >= threshold;
  }
  if (sideInfo.isLong === false) {
    const threshold = Math.abs(printMedianPos ?? FALLBACK_PRINT_MEDIAN) + Math.max(0, deltaAbs);
    return Math.abs(metricAbs) >= threshold;
  }
  return false;
}
