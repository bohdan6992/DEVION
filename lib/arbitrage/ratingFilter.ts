/**
 * Shared arbitrage rating filter — applies BIN / BINS / SESSION rating gates
 * identically in Scanner (filteredActive) and Stream (displayDecisions).
 *
 * Uses best_params data that the server attaches to every signal item
 * via SignalItemDto.BestParamsRow ([JsonPropertyName("best_params")]).
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeObj(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function optNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Reads best_params from a signal row (supports multiple field name conventions). */
export function getBestParamsRaw(row: any): Record<string, any> | null {
  return safeObj(
    row?.best_params ?? row?.bestParams ?? row?.BestParams ?? row?.best_params_row ?? null
  );
}

/**
 * Maps session string (e.g. "ARK", "ark", "GLOB") to the bin class key
 * used inside best_params sigma_bin_stats / sigma_peak_bins.
 */
export function sessionToClassKey(session: string): string {
  switch ((session ?? "").toUpperCase()) {
    case "BLUE": return "blue";
    case "ARK":
    case "PRE":  return "ark";
    case "OPEN": return "open";
    case "INTRA": return "intra";
    case "PRINT": return "print";
    case "POST": return "post";
    default:     return "global";
  }
}

/**
 * Maps signal side to the sign key used in best_params bin dicts.
 * Long position (stock up relative to bench) → negative ZAP direction → "neg".
 * Short position → positive ZAP direction → "pos".
 */
export function sideToSignKey(side: string): "pos" | "neg" | null {
  const s = (side ?? "").toLowerCase().trim();
  if (s === "long" || s === "l" || s === "buy" || s === "up") return "neg";
  if (s === "short" || s === "s" || s === "sell" || s === "down") return "pos";
  return null;
}

// ---------------------------------------------------------------------------
// BIN filter — uses sigma_peak_bins (interval-based lookup at current sigma)
// ---------------------------------------------------------------------------

type BinInterval = { lo: number; hi: number; rate: number; total: number };

function parseBinIntervals(value: unknown): BinInterval[] {
  if (!Array.isArray(value)) return [];
  const result: BinInterval[] = [];
  for (const item of value) {
    const obj = safeObj(item);
    if (!obj) continue;
    const lo = optNum(obj.lo ?? obj.from ?? obj.min ?? obj.Min);
    const hi = optNum(obj.hi ?? obj.to ?? obj.max ?? obj.Max);
    const rate = optNum(obj.rate ?? obj.Rate ?? obj.rating ?? obj.Rating);
    const total = optNum(obj.total ?? obj.Total ?? obj.count ?? obj.Count);
    if (lo == null || hi == null || rate == null || total == null) continue;
    result.push({ lo: Math.min(lo, hi), hi: Math.max(lo, hi), rate, total });
  }
  return result;
}

function binRatingSnapshotFromBestParams(
  bestParams: Record<string, any> | null,
  classKey: string,
  signKey: "pos" | "neg",
  sigmaAbs: number
): BinInterval | null {
  if (!bestParams) return null;
  const bwa = safeObj(bestParams.best_windows_any ?? bestParams.BestWindowsAny);
  const stitched = safeObj(bwa?.stitched ?? bwa?.Stitched);
  const sigmaPeakBins = safeObj(stitched?.sigma_peak_bins ?? stitched?.SigmaPeakBins);
  const classBins = safeObj(sigmaPeakBins?.[classKey]);
  const intervals = parseBinIntervals(classBins?.[signKey]);
  if (!intervals.length) return null;
  const abs = Math.abs(sigmaAbs);
  return intervals.find(iv => abs >= iv.lo && abs <= iv.hi) ?? null;
}

// ---------------------------------------------------------------------------
// BINS filter — uses sigma_bin_stats (fixed-width bucket lookup at current sigma)
// ---------------------------------------------------------------------------

function sigBinSnapshotFromBestParams(
  bestParams: Record<string, any> | null,
  classKey: string,
  signKey: "pos" | "neg",
  sigmaAbs: number
): { rate: number; total: number } | null {
  if (!bestParams) return null;
  const bwa = safeObj(bestParams.best_windows_any ?? bestParams.BestWindowsAny);
  const stitched = safeObj(bwa?.stitched ?? bwa?.Stitched);
  const allStats = safeObj(stitched?.sigma_bin_stats ?? stitched?.SigmaBinStats);
  const clsStats = safeObj(allStats?.[classKey]);
  const signStats = safeObj(clsStats?.[signKey]);

  const sigBinParams = safeObj(bwa?.sigma_bin_params ?? bwa?.SigmaBinParams);
  const step = Number(sigBinParams?.step ?? 0.5);
  const min = Number(sigBinParams?.min ?? 0.5);
  const max = Number(sigBinParams?.max ?? 10.0);

  const v = Math.max(min, Math.min(max, Math.abs(sigmaAbs)));
  const binKey = (Math.floor(v / step) * step).toFixed(1);
  const entry = safeObj(signStats?.[binKey]);
  if (!entry) return null;

  const rate = optNum(entry.r ?? entry.rate ?? entry.Rate);
  const total = optNum(entry.t ?? entry.total ?? entry.Total);
  if (rate == null || total == null) return null;
  return { rate, total };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RatingFilterArgs = {
  /** "BIN" | "BINS" | "SESSION" (case-insensitive). SESSION is handled server-side; no client filter needed. */
  ratingMode: string;
  /** The signal row (must have best_params attached). */
  signal: any;
  /** Session string, e.g. "ARK", "GLOB", "ark". */
  session: string;
  /** Signal side: "Long" | "Short" (or variants). */
  side: string;
  /** Current absolute sigma value for the signal. */
  sigmaAbs: number | null | undefined;
  /** Minimum win rate threshold (e.g. 0.6). */
  minRate: number;
  /** Minimum trade total threshold (e.g. 3). */
  minTotal: number;
};

/**
 * Returns true if the signal passes the rating filter for the given ratingMode.
 *
 * SESSION: server already applies minRate/minTotal → always returns true client-side.
 * BIN:     checks sigma_peak_bins at current sigma; returns false if no data.
 * BINS:    checks sigma_bin_stats bucket at current sigma; returns false if no data.
 */
export function passesStreamRatingFilter(args: RatingFilterArgs): boolean {
  const { ratingMode, signal, session, side, sigmaAbs, minRate, minTotal } = args;
  const mode = (ratingMode ?? "SESSION").toUpperCase();

  // SESSION: filtering is done server-side via EligibilityPolicy (minRate/minTotal in URL).
  if (mode === "SESSION") return true;

  if (sigmaAbs == null || !Number.isFinite(sigmaAbs)) return false;
  const signKey = sideToSignKey(side);
  if (!signKey) return false;
  const classKey = sessionToClassKey(session);
  const bestParams = getBestParamsRaw(signal);

  const effRate = Math.max(0, Number(minRate) || 0);
  const effTotal = Math.max(0, Math.trunc(Number(minTotal) || 0));

  if (mode === "BIN") {
    const snap = binRatingSnapshotFromBestParams(bestParams, classKey, signKey, sigmaAbs);
    if (!snap) return false; // no data = exclude (matches Scanner behavior)
    return snap.rate >= effRate && snap.total >= effTotal;
  }

  if (mode === "BINS") {
    // BIN interval check first (same as BIN mode)
    const binSnap = binRatingSnapshotFromBestParams(bestParams, classKey, signKey, sigmaAbs);
    if (!binSnap) return false;
    if (binSnap.rate < effRate || binSnap.total < effTotal) return false;
    // Additional BINS sigma-bucket check
    const sigSnap = sigBinSnapshotFromBestParams(bestParams, classKey, signKey, sigmaAbs);
    if (!sigSnap) return false;
    return sigSnap.rate >= effRate && sigSnap.total >= effTotal;
  }

  return true; // unknown mode → don't filter
}
