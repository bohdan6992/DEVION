import type { PaperArbCloseMode, PaperArbDilutionMode, PaperArbPnlMode, PaperArbPriceMode, PaperArbSizingMode, PaperArbSnap, TapeArbSide } from "./types";

export function scannerTickerAmountUsd(
  sizingMode: PaperArbSizingMode,
  sizeValue: number,
  tierBp: number | null | undefined,
  entryCount: number | null | undefined,
  dilutionMode: PaperArbDilutionMode
): number | null {
  const entries =
    dilutionMode === "Diluted" && Number.isFinite(entryCount ?? NaN) && Number(entryCount) > 0
      ? Math.max(1, Math.trunc(Number(entryCount)))
      : 1;
  if (sizingMode === "Notional") {
    return Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue * entries : null;
  }
  if (!Number.isFinite(tierBp ?? NaN) || !Number.isFinite(sizeValue) || sizeValue <= 0) return null;
  return Number(tierBp) * sizeValue * entries;
}

export function scannerRealtimePnlUsd(args: {
  side: TapeArbSide;
  beta: number | null | undefined;
  trancheAmountUsd: number | null | undefined;
  entrySnaps: PaperArbSnap[] | null | undefined;
  start: PaperArbSnap | null | undefined;
  last: PaperArbSnap | null | undefined;
  pnlMode: PaperArbPnlMode;
  priceMode: PaperArbPriceMode;
  closeMode?: PaperArbCloseMode;
  gapPct?: number | null;
  benchGapPct?: number | null;
  startClass?: string | null;
  /**
   * When a Passive close marks against the open gap instead of live prices.
   *
   * - "preArkOnly" — only PRE/ARK starts; every other session stays on live mark-to-market until
   *   the passive window actually ends. Needs `startClass` on the row.
   * - "always" — every Passive close uses the gap. This is the right setting for a strategy whose
   *   rows carry no start class (OpenDoor): with "preArkOnly" an absent `startClass` would silently
   *   disable gap exit altogether.
   */
  passiveGapExit?: "preArkOnly" | "always";
}): { rawPnlUsd: number | null; benchPnlUsd: number | null; hedgedPnlUsd: number | null; totalPnlUsd: number | null } {
  const { side, beta, trancheAmountUsd, entrySnaps, start, last, pnlMode, priceMode, closeMode, gapPct, benchGapPct, startClass, passiveGapExit } = args;
  const isPassive = closeMode === "Passive";
  const useGapExit =
    isPassive && (passiveGapExit === "always" || startClass === "PRE" || startClass === "ARK");
  const null4 = { rawPnlUsd: null, benchPnlUsd: null, hedgedPnlUsd: null, totalPnlUsd: null };
  if (!Number.isFinite(trancheAmountUsd ?? NaN) || Number(trancheAmountUsd) <= 0) return null4;
  if (!last) return null4;

  const normalizedSide = String(side).toLowerCase() === "short" ? "Short" : "Long";
  const hedgeSide = normalizedSide === "Short" ? "Long" : "Short";

  // Prefer per-tranche entrySnaps (server sends them); fall back to single start snap.
  const snaps: PaperArbSnap[] = (entrySnaps && entrySnaps.length > 0) ? entrySnaps : (start ? [start] : []);
  if (snaps.length === 0) return null4;

  // Per-tranche P&L: each tranche invests equal USD, so per-tranche summation
  // correctly captures the asymmetry of buying more shares at lower prices.
  let rawSum = 0, rawAny = false;
  let benchSum = 0, benchAny = false;

  // Exit: gap-eligible Passive → GapPct/benchGapPct (see passiveGapExit above).
  // BidAsk+Active → bid/ask. Print+Active → lstPrcLstClsPct.
  const exitStockPct = useGapExit
    ? (gapPct ?? null)
    : (priceMode === "BidAsk"
      ? (normalizedSide === "Long" ? (last.bidPct ?? last.lstPrcLstClsPct) : (last.askPct ?? last.lstPrcLstClsPct))
      : last.lstPrcLstClsPct);
  const exitBenchPct = useGapExit
    ? (benchGapPct ?? null)
    : (priceMode === "BidAsk"
      ? (hedgeSide === "Long" ? (last.benchBidPct ?? last.benchLstPrcLstClsPct) : (last.benchAskPct ?? last.benchLstPrcLstClsPct))
      : last.benchLstPrcLstClsPct);

  for (const entry of snaps) {
    // Entry: BidAsk → bid/ask (regardless of Passive/Active). Print → lstPrcLstClsPct.
    const entryStockPct = priceMode === "BidAsk"
      ? (normalizedSide === "Long" ? (entry.askPct ?? entry.lstPrcLstClsPct) : (entry.bidPct ?? entry.lstPrcLstClsPct))
      : entry.lstPrcLstClsPct;
    // BidAsk: delta formula (pct diff). Print: ratio.
    const stockFrac = priceMode === "BidAsk"
      ? scannerBidAskPctDelta(entryStockPct, exitStockPct, normalizedSide)
      : scannerLastPriceReturnFrac(entryStockPct, exitStockPct, normalizedSide);
    if (stockFrac != null) { rawSum += Number(trancheAmountUsd) * stockFrac; rawAny = true; }

    if (pnlMode === "Hedged" && Number.isFinite(beta ?? NaN)) {
      const entryBenchPct = priceMode === "BidAsk"
        ? (hedgeSide === "Long" ? (entry.benchAskPct ?? entry.benchLstPrcLstClsPct) : (entry.benchBidPct ?? entry.benchLstPrcLstClsPct))
        : entry.benchLstPrcLstClsPct;
      const benchFrac = priceMode === "BidAsk"
        ? scannerBidAskPctDelta(entryBenchPct, exitBenchPct, hedgeSide)
        : scannerLastPriceReturnFrac(entryBenchPct, exitBenchPct, hedgeSide);
      if (benchFrac != null) { benchSum += Number(trancheAmountUsd) * Number(beta) * benchFrac; benchAny = true; }
    }
  }

  const rawPnlUsd = rawAny ? rawSum : null;
  let benchPnlUsd: number | null = benchAny ? benchSum : null;
  const hedgedPnlUsd =
    pnlMode === "RawOnly"
      ? rawPnlUsd
      : rawPnlUsd != null || benchPnlUsd != null
        ? (rawPnlUsd ?? 0) + (benchPnlUsd ?? 0)
        : null;

  return {
    rawPnlUsd,
    benchPnlUsd: pnlMode === "RawOnly" ? null : benchPnlUsd,
    hedgedPnlUsd,
    totalPnlUsd: pnlMode === "RawOnly" ? rawPnlUsd : hedgedPnlUsd,
  };
}

export function scannerLastPriceReturnFrac(
  entryPct: number | null | undefined,
  exitPct: number | null | undefined,
  side: "Long" | "Short"
): number | null {
  if (!Number.isFinite(entryPct ?? NaN) || !Number.isFinite(exitPct ?? NaN)) return null;
  const entryFactor = 1 + Number(entryPct) / 100;
  const exitFactor = 1 + Number(exitPct) / 100;
  if (entryFactor <= 0 || exitFactor <= 0) return null;
  return side === "Long" ? exitFactor / entryFactor - 1 : entryFactor / exitFactor - 1;
}

// BidAsk mode: pct delta — consistent with ZAP units (bidPct − benchAskPct × beta).
export function scannerBidAskPctDelta(
  entryPct: number | null | undefined,
  exitPct: number | null | undefined,
  side: "Long" | "Short"
): number | null {
  if (!Number.isFinite(entryPct ?? NaN) || !Number.isFinite(exitPct ?? NaN)) return null;
  return side === "Long"
    ? (Number(exitPct) - Number(entryPct)) / 100
    : (Number(entryPct) - Number(exitPct)) / 100;
}
