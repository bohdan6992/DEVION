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
    case "ARK":  return "ark";
    case "PRE":  return "pre";
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
  /** Which total bucket to check in SESSION mode: "hard" | "soft" | "any" (default "any"). */
  ratingType?: string | null;
};

/**
 * Returns true if the signal passes the rating filter for the given ratingMode.
 *
 * SESSION: server already applies minRate/minTotal → always returns true client-side.
 * BIN:     checks sigma_peak_bins at current sigma; returns false if no data.
 * BINS:    checks sigma_bin_stats bucket at current sigma; returns false if no data.
 */
export function passesStreamRatingFilter(args: RatingFilterArgs): boolean {
  const { ratingMode, signal, session, side, sigmaAbs, minRate, minTotal, ratingType } = args;
  const mode = (ratingMode ?? "SESSION").toUpperCase();

  const effRate = Math.max(0, Number(minRate) || 0);
  const effTotal = Math.max(0, Math.trunc(Number(minTotal) || 0));

  if (mode === "SESSION") {
    // Server already pre-filters by minRate/minTotal, but client re-checks for consistency with Sonar/Scanner.
    if (effRate === 0 && effTotal === 0) return true;
    // Sonar SESSION mode reads signal.best.rating (session-specific, server pre-computes for requested cls).
    // _bestRating is normalizeSignal's capture of signal.best.rating — use it as primary source.
    // best_params.best is a fallback (may be global, not session-specific).
    const bestParams = getBestParamsRaw(signal);
    const bpBest = safeObj(bestParams?.best ?? bestParams?.Best);
    const r = optNum(
      signal?._bestRating ?? signal?.bestRating ??
      bpBest?.rating ?? bpBest?.Rating ?? bpBest?.rate ?? bpBest?.Rate ??
      signal?.rating ?? signal?.Rating
    );
    // Respect ratingType (hard/soft/any) matching Sonar's getBestTotalByType behavior.
    const type = (ratingType ?? "any").toLowerCase();
    let t: number | null;
    // Fallback chain for total: type-specific → aggregate best → flat ratingTotal from server row.
    // The ratingTotal fallback keeps Scanner active rows (which lack best_params) working correctly.
    const anyTotal = (() => {
      const hardV = optNum(signal?._bestHard ?? bpBest?.hard ?? bpBest?.Hard);
      const softV = optNum(signal?._bestSoft ?? bpBest?.soft ?? bpBest?.Soft);
      return hardV != null || softV != null
        ? (hardV ?? 0) + (softV ?? 0)
        : optNum(signal?._bestTotal ?? signal?.bestTotal ?? bpBest?.total ?? bpBest?.Total ?? bpBest?.count ?? bpBest?.Count ?? signal?.ratingTotal ?? signal?.RatingTotal);
    })();
    if (type === "hard") {
      t = optNum(signal?._bestHard ?? bpBest?.hard ?? bpBest?.Hard) ?? anyTotal;
    } else if (type === "soft") {
      t = optNum(signal?._bestSoft ?? bpBest?.soft ?? bpBest?.Soft) ?? anyTotal;
    } else {
      t = anyTotal;
    }
    if (r == null || t == null) return false;
    if (r < effRate) return false;
    if (t < effTotal) return false;
    return true;
  }

  if (sigmaAbs == null || !Number.isFinite(sigmaAbs)) return false;
  const signKey = sideToSignKey(side);
  if (!signKey) return false;
  const classKey = sessionToClassKey(session);
  const bestParams = getBestParamsRaw(signal);

  if (mode === "BIN") {
    // pass if sigma falls in ANY interval that satisfies minRate/minTotal
    const bwa = safeObj(bestParams?.best_windows_any ?? bestParams?.BestWindowsAny);
    const stitched = safeObj(bwa?.stitched ?? bwa?.Stitched);
    const sigmaPeakBins = safeObj(stitched?.sigma_peak_bins ?? stitched?.SigmaPeakBins);
    const classBins = safeObj(sigmaPeakBins?.[classKey]);
    const intervals = parseBinIntervals(classBins?.[signKey]);
    if (!intervals.length) return false;
    const abs = Math.abs(sigmaAbs);
    return intervals.some(iv => abs >= iv.lo && abs <= iv.hi && iv.rate >= effRate && iv.total >= effTotal);
  }

  if (mode === "BINS") {
    // BIN interval check: pass if sigma falls in ANY interval that satisfies minRate/minTotal
    const bwa = safeObj(bestParams?.best_windows_any ?? bestParams?.BestWindowsAny);
    const stitched = safeObj(bwa?.stitched ?? bwa?.Stitched);
    const sigmaPeakBins = safeObj(stitched?.sigma_peak_bins ?? stitched?.SigmaPeakBins);
    const classBins = safeObj(sigmaPeakBins?.[classKey]);
    const intervals = parseBinIntervals(classBins?.[signKey]);
    if (!intervals.length) return false;
    const abs = Math.abs(sigmaAbs);
    if (!intervals.some(iv => abs >= iv.lo && abs <= iv.hi && iv.rate >= effRate && iv.total >= effTotal)) return false;
    // Additional BINS sigma-bucket check
    const sigSnap = sigBinSnapshotFromBestParams(bestParams, classKey, signKey, sigmaAbs);
    if (!sigSnap) return false;
    return sigSnap.rate >= effRate && sigSnap.total >= effTotal;
  }

  return true; // unknown mode → don't filter
}
