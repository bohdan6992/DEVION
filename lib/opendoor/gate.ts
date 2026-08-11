/**
 * OpenDoor's per-bin entry gate — the single implementation.
 *
 * The rule: for each ENABLED parameter (stack / bench / devsig), take the ticker's CURRENT live
 * value, find the historical bin it lands in for the selected exit horizon and direction, and
 * require that bin's own rate/total/avg_move to clear the gates. All enabled parameters are
 * ANDed; the two directions are judged independently.
 *
 * Why it lives here rather than inside a component: the same rule has to run in Sonar (display),
 * in the stream engine (which decides what to trade), and it already exists a third time in C#
 * (`OpenDoorGate.cs`) for the server strategy. Two of those three now share this file, so the
 * pair that must agree bit-for-bit — Sonar and Stream — cannot drift.
 *
 * The C# copy implements the identical rule (verified line by line: same bin steps, same
 * `value >= hi + step` bound, same rate/total/avgMove checks) but feeds it values computed from
 * a DIFFERENT pipeline (TapeWriter formulas over an RTD snapshot, not StrategyJoiner's), so its
 * verdicts legitimately differ. That is why the browser does not consume it.
 */

export type OpenDoorGateParams = {
  /** "10m" | "30m" — selects which bin columns to read. */
  exitClass: string;
  /**
   * ADVANCED ignores the per-parameter toggles (checks all three) and reads the "adv_"-prefixed
   * hourly-pooled bins instead of the standard 09:20-only ones.
   */
  advancedMode?: boolean;
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
};

export type OpenDoorGateValues = {
  /** AskLstClsΔ% (up) / BidLstClsΔ% (down) */
  stackUp: number | null;
  stackDown: number | null;
  /** askBench (up) / bidBench (down) */
  benchUp: number | null;
  benchDown: number | null;
  /** zapLsigma (up) / zapSsigma (down) */
  devUp: number | null;
  devDown: number | null;
};

export type OpenDoorGateVerdict = { up: boolean; down: boolean };

/**
 * Bin labels are signed FLOOR bins: label "0.0" with step 1.0 covers [0.0, 1.0), not the single
 * point 0.0. `lo`/`hi` are the first/last MERGED bin's own floor labels, so the true covered range
 * is [lo, hi + step). An unmerged single bin has lo === hi, and checking `value <= hi` would
 * reject nearly every real value except an exact match.
 */
const PARAM_BIN_STEP: Record<string, number> = {
  stack: 1.0,
  bench: 1.0,
  devsig: 0.3,
};

function toNum(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function matchOpenDoorGate(
  ratingsRow: Record<string, string> | undefined | null,
  values: OpenDoorGateValues,
  params: OpenDoorGateParams
): OpenDoorGateVerdict {
  // No ratings row means no historical bins to gate against. That is a reject, not a pass.
  if (!ratingsRow) return { up: false, down: false };

  const cls = params.exitClass;
  const prefix = params.advancedMode ? "adv_" : "";

  const checkDir = (dir: "up" | "down"): boolean => {
    const enabled: Array<{ param: string; value: number | null }> = [];
    if (params.advancedMode || params.useStack) {
      enabled.push({ param: "stack", value: dir === "up" ? values.stackUp : values.stackDown });
    }
    if (params.advancedMode || params.useBench) {
      enabled.push({ param: "bench", value: dir === "up" ? values.benchUp : values.benchDown });
    }
    if (params.advancedMode || params.useDevSig) {
      enabled.push({ param: "devsig", value: dir === "up" ? values.devUp : values.devDown });
    }
    if (enabled.length === 0) return false;

    const minRateGate = dir === "up" ? params.upMinRate : params.downMinRate;
    const minTotalGate = dir === "up" ? params.upMinTotal : params.downMinTotal;
    const minMoveGate = dir === "up" ? params.upMinMove : params.downMinMove;

    // summary.csv columns use Arbitrage's long/short vocabulary, not up/down.
    const colDir = dir === "up" ? "long" : "short";

    return enabled.every(({ param, value }) => {
      if (value == null || !Number.isFinite(value)) return false;
      const lo = toNum(ratingsRow[`${prefix}${param}_${cls}_best_${colDir}_lo`]);
      const hi = toNum(ratingsRow[`${prefix}${param}_${cls}_best_${colDir}_hi`]);
      const rate = toNum(ratingsRow[`${prefix}${param}_${cls}_best_${colDir}_rate`]);
      const total = toNum(ratingsRow[`${prefix}${param}_${cls}_best_${colDir}_total`]);
      const avgMove = toNum(ratingsRow[`${prefix}${param}_${cls}_best_${colDir}_avg_move`]);
      if (lo == null || hi == null || rate == null || total == null) return false;
      const step = PARAM_BIN_STEP[param] ?? 1.0;
      if (value < lo || value >= hi + step) return false;
      if (rate < minRateGate) return false;
      if (total < minTotalGate) return false;
      if (avgMove != null && Math.abs(avgMove) < minMoveGate) return false;
      return true;
    });
  };

  return { up: checkDir("up"), down: checkDir("down") };
}

/** Pulls the six gated values off a signal row, under every name the two feeds use. */
export function readOpenDoorGateValues(signal: any): OpenDoorGateValues {
  return {
    stackUp: toNum(signal?.["AskLstClsΔ%"] ?? signal?.AskLstClsDeltaPct),
    stackDown: toNum(signal?.["BidLstClsΔ%"] ?? signal?.BidLstClsDeltaPct),
    // Bench delta-% arrives as top-level bidBench/askBench (SignalItemDto.BidBench/AskBench,
    // camelCased by ASP.NET Core) — NOT a "BenchBidLstClsΔ%"-style key.
    benchUp: toNum(signal?.askBench),
    benchDown: toNum(signal?.bidBench),
    devUp: toNum(signal?.zapLsigma),
    devDown: toNum(signal?.zapSsigma),
  };
}
