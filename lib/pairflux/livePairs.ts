/**
 * The live pair reading, in one place.
 *
 * This was computed inside the Sonar's divergence panel. The stream needs the SAME reading — a
 * stream showing different pairs, or the same pairs at different levels, from the panel the user
 * just set their thresholds on is worse than a stream showing nothing. So the arithmetic moved
 * here and both surfaces call it; neither can drift from the other by editing.
 *
 * EXECUTABLE, not mid. A convergence trade shorts the leg that ran ahead and buys the one that
 * lagged, so it sells at a bid and buys at an ask — both sides give up their half-spread, and a
 * mid-to-mid reading overstates every row by roughly the sum of the two spreads. At a 0.3pp
 * threshold that is not a rounding difference, it is most of the edge:
 *
 *     devUp = bid(A) - beta * ask(B)     tradable when > 0:  SHORT A / LONG B
 *     devDn = ask(A) - beta * bid(B)     tradable when < 0:  SHORT B / LONG A
 *
 * Since bid <= ask these bracket the midpoint and at most one can be outside zero; when neither
 * is, the pair is apart on mid but the whole gap sits INSIDE the spreads and the row is dropped
 * rather than shown at zero.
 *
 * It is the same rule the tape engine replays (TapePairFluxEngine.TradableDev), so a pair that
 * shows here is a pair the backtest would have entered.
 */

import type { ArbitrageSignal } from "@/lib/signals/signal";
import { getNumAny } from "@/lib/signals/signal";
import type { PairFluxRow } from "@/lib/pairflux/client";

export type Quote = { bid: number; ask: number };

export type LivePairUnit = "pct" | "sigma" | "alpha" | "gamma";

export type LivePair = {
  a: string;
  b: string;
  bench: string;
  beta: number;
  /** From the published row, shown for context only — nothing here is gated on it. */
  rate: number | null;
  total: number;
  /** Quote-to-quote deviation actually available. */
  dev: number;
  /** Mid-to-mid deviation, for comparison only. */
  devMid: number;
  /** What the two spreads take: |devMid| - |dev|. Never negative. */
  cost: number;
  /** dev / sigma — stretch against the largest level this pair still returns from. */
  z: number | null;
  /** dev / alpha — stretch against this pair's habitual converged peak. */
  aRatio: number | null;
  /**
   * dev / gamma — stretch against the level from which entry pays off WITH CONFIDENCE.
   *
   * `gRatio >= 1` is the entry the notebook measured. Null for most pairs, because most pairs have
   * no such level at all; in gamma mode those are dropped rather than measured on a scale they do
   * not have, the same way sigma mode drops a pair with no sigma.
   */
  gRatio: number | null;
  /** |deviation| in the unit currently selected. */
  measure: number;
  /** What running from here to the exit level would bank, in percentage points. */
  toExit: number;
  /** The pair's published sigma, alpha and gamma, pp. */
  sigma: number | null;
  alpha: number | null;
  gamma: number | null;
  /** Mean capture entering at gamma, pp, GROSS — costs are not in it. Context only. */
  gammaCap: number | null;
  /** The leg that ran ahead — the one to SHORT. */
  ahead: string;
  /** The leg that lagged — the one to BUY. */
  behind: string;
  /** Price the short is struck at (the ahead leg's bid). */
  aheadStack: number;
  /** Price the long is struck at (the lagging leg's ask). */
  behindStack: number;
  aheadMid: number;
  behindMid: number;
  /** The published beta, which is what the beta bucket and the toolbar's beta range both read. */
  betaPub: number | null;
};

export function stackQuote(s: ArbitrageSignal): Quote | null {
  const bid = getNumAny(s, ["BidLstClsΔ%", "BidLstClsDeltaPct", "bidLstClsDeltaPct"]);
  const ask = getNumAny(s, ["AskLstClsΔ%", "AskLstClsDeltaPct", "askLstClsDeltaPct"]);
  // One-sided quotes cannot price a spread trade: the missing side is exactly the one being
  // crossed. Fall back to the present side for BOTH only when that is all there is, and accept
  // that such a row reads like a zero-spread instrument.
  if (bid !== null && ask !== null) return { bid, ask };
  const only = bid ?? ask;
  return only === null ? null : { bid: only, ask: only };
}

/** Ticker -> its live quote, off whatever signal set the caller has already filtered. */
export function buildQuoteIndex(signals: readonly ArbitrageSignal[] | null | undefined): Map<string, Quote> {
  const m = new Map<string, Quote>();
  for (const s of signals ?? []) {
    const t = String(s?.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const q = stackQuote(s);
    // Both directions of a ticker carry the same quote, so first one wins rather than last.
    if (q && Number.isFinite(q.bid) && Number.isFinite(q.ask) && !m.has(t)) m.set(t, q);
  }
  return m;
}

/**
 * "0,7" is what a Ukrainian keyboard produces and it is what the user means by 0.7, but
 * Number("0,7") is NaN — which silently read as "no bound set" and switched the filter off.
 */
export function numOrNull(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * An empty box is no bound, and a value the pair does not carry fails a bound that was set:
 * once you ask for sigma >= 0.8 a pair without a sigma is not an unknown, it is a no.
 */
export function inRange(v: number | null | undefined, loRaw: string, hiRaw: string): boolean {
  const lo = numOrNull(loRaw);
  const hi = numOrNull(hiRaw);
  if (lo === null && hi === null) return true;
  if (v === null || v === undefined || !Number.isFinite(v)) return false;
  if (lo !== null && v < lo) return false;
  if (hi !== null && v > hi) return false;
  return true;
}

export type LivePairArgs = {
  /** The published universe for the class being watched. */
  pairs: readonly PairFluxRow[];
  /** Ticker -> quote, from the caller's FILTERED signal set: every toolbar min/max applies. */
  quoteByTicker: ReadonlyMap<string, Quote>;
  unit: LivePairUnit;
  minStr: string;
  maxStr: string;
  exitStr: string;
  corrRange: readonly [string, string];
  betaRange: readonly [string, string];
  sigmaRange: readonly [string, string];
  alphaRange: readonly [string, string];
  /**
   * The PAIR's rating floor for the class being watched — `converged / total` and the episode
   * count, straight from signals/pairflux/summary.csv.
   *
   * This is the gate the replay applies (TapePairFluxEngine: `rating.Total < MinTotal`,
   * `rating.Rate < MinRate`, both read from ByClass[cls]). The stream used to apply no pair gate at
   * all and instead filtered each LEG by the ticker's Arbitrage rating against its benchmark ETF —
   * a different measurement of a different thing, applied twice. Measured on 2026-09-08: of 16 923
   * INTRA pairs only 26 had both legs surviving that, because a per-leg pass rate is squared once
   * a pair needs both.
   *
   * Omit or pass 0 for no floor.
   */
  minRate?: number;
  minTotal?: number;
};

/**
 * The pair's convergence reading for an OPEN position — always computable, unlike
 * computeLivePairs.dev.
 *
 * computeLivePairs drops a pair the moment neither devUp nor devDn crosses zero ("apart on mid,
 * but the whole gap sits inside the two spreads") — correct for its own question, "is this pair
 * enterable right now", because a gap that small cannot be opened at a profitable cross. But a
 * position that is ALREADY OPEN needs the opposite question answered continuously: how close is
 * the spread to the level that closes it — and that stays answerable, and in fact becomes the most
 * important number in the position, in exactly the region computeLivePairs stops reporting.
 *
 * EXIT ON THE OPPOSITE SIDE. A convergence trade opened by selling A and buying B unwinds by
 * buying A back and selling B back — the reverse crossing, not the one that opened it. So the
 * exit reading for a leg is the executable spread on the OTHER of {devUp, devDn} than the one that
 * would have opened this leg's own side — mirrors TapePairFluxEngine.Replay's execUp/execDn,
 * computed unconditionally at every reading rather than gated to "outside zero".
 *
 * Pass the PUBLISHED pair (from the full universe, not the filtered/live one) and a QUOTE INDEX
 * built from the UNFILTERED signal set — an open position must keep reporting its exit level
 * regardless of a toolbar range filter that would have excluded it as a fresh entry.
 */
export function pairExitDeviation(
  pair: PairFluxRow,
  quoteByTicker: ReadonlyMap<string, Quote>,
  unit: LivePairUnit,
  legTicker: string,
  legSide: "Long" | "Short",
): { signed: number; abs: number } | null {
  const aTicker = pair.ticker.trim().toUpperCase();
  const bTicker = pair.partner.trim().toUpperCase();
  const qa = quoteByTicker.get(aTicker);
  const qb = quoteByTicker.get(bTicker);
  if (!qa || !qb) return null;

  const beta =
    pair.beta !== null && Number.isFinite(pair.beta) && Math.abs(pair.beta) > 1e-9 ? pair.beta : 1;

  const bHigh = beta >= 0 ? qb.ask : qb.bid;
  const bLow = beta >= 0 ? qb.bid : qb.ask;
  // Raw and UNCONDITIONAL — the one difference from computeLivePairs' devUp/devDn, which only
  // exist as "dev" when one of them is outside zero. Both are always meaningful quantities; which
  // one closes THIS leg's trade depends only on which one opened it.
  const up = qa.bid - beta * bHigh;   // SHORT A(pair.ticker) / LONG B(pair.partner)
  const dn = qa.ask - beta * bLow;    // SHORT B(pair.partner) / LONG A(pair.ticker)

  const legIsA = legTicker.trim().toUpperCase() === aTicker;
  // True when this leg's position was opened off the "up" branch — A short (this leg, if it IS a)
  // or B long (this leg, if it is b). The unwind reads the OTHER branch.
  const entryWasUp = legIsA ? legSide === "Short" : legSide === "Long";
  const raw = entryWasUp ? dn : up;

  const unitScale =
    unit === "sigma" ? pair.sigma
      : unit === "alpha" ? pair.alpha
        : unit === "gamma" ? pair.gamma
          : 1;
  if (unitScale === null || unitScale === undefined || !Number.isFinite(unitScale) || Math.abs(unitScale) < 1e-9) {
    return null;
  }

  const signed = raw / unitScale;
  return { signed, abs: Math.abs(signed) };
}

export function computeLivePairs(args: LivePairArgs): LivePair[] {
  const { pairs, quoteByTicker, unit: zapMode, minStr, maxStr, exitStr } = args;
  const [corrLo, corrHi] = args.corrRange;
  const [betaLo, betaHi] = args.betaRange;
  const [sigmaLo, sigmaHi] = args.sigmaRange;
  const [alphaLo, alphaHi] = args.alphaRange;
  const minRate = Number.isFinite(args.minRate as number) ? Math.max(0, args.minRate as number) : 0;
  const minTotal = Number.isFinite(args.minTotal as number) ? Math.max(0, Math.trunc(args.minTotal as number)) : 0;

  const lo = Math.abs(numOrNull(minStr) ?? 0);
  const hi = Math.abs(numOrNull(maxStr) ?? Infinity);
  const exitAt = Math.abs(numOrNull(exitStr) ?? 0);
  const out: LivePair[] = [];

  for (const p of pairs) {
    const qa = quoteByTicker.get(p.ticker);
    const qb = quoteByTicker.get(p.partner);
    // A pair is only live when BOTH legs are quoted — one-sided is not a spread.
    if (!qa || !qb) continue;
    // Falls back to 1 only when the published beta is missing or degenerate — not as a policy.
    const beta =
      p.beta !== null && Number.isFinite(p.beta) && Math.abs(p.beta) > 1e-9 ? p.beta : 1;

    // Cross the quotes the way the trade would. A negative beta flips which side of B's quote is
    // being hit, so pick the unfavourable side explicitly rather than assuming beta > 0.
    const bHigh = beta >= 0 ? qb.ask : qb.bid;   // the B price that shrinks a positive dev
    const bLow = beta >= 0 ? qb.bid : qb.ask;    // the B price that shrinks a negative dev
    const devUp = qa.bid - beta * bHigh;         // > 0 -> SHORT A / LONG B
    const devDn = qa.ask - beta * bLow;          // < 0 -> SHORT B / LONG A

    let dev = 0;
    if (devUp > 0) dev = devUp;
    else if (devDn < 0) dev = devDn;
    else continue; // apart on mid, but the whole gap sits inside the two spreads

    if (!Number.isFinite(dev)) continue;

    const midA = (qa.bid + qa.ask) / 2;
    const midB = (qb.bid + qb.ask) / 2;
    const devMid = midA - beta * midB;

    const sg = p.sigma;
    const al = p.alpha;
    const gm = p.gamma;

    // Pair-level gates from the toolbar, read on the pair's own published statistics.
    //
    // The rating floor comes first because it is the strategy's own contract: rate is
    // converged/total for THIS pair in THIS class. A pair with no published rating for the class
    // has no rate, and is refused rather than measured against a floor it cannot answer — the same
    // way the replay skips a pair missing from ByClass[cls].
    if (minTotal > 0 && (p.total ?? 0) < minTotal) continue;
    if (minRate > 0 && (p.rate ?? -1) < minRate) continue;
    if (!inRange(p.corr, corrLo, corrHi)) continue;
    if (!inRange(p.beta === null ? null : Math.abs(p.beta), betaLo, betaHi)) continue;
    if (!inRange(sg, sigmaLo, sigmaHi)) continue;
    if (!inRange(al, alphaLo, alphaHi)) continue;
    const z = sg !== null && Number.isFinite(sg) && sg > 1e-9 ? dev / sg : null;
    const aRatio = al !== null && Number.isFinite(al) && al > 1e-9 ? dev / al : null;
    const gRatio = gm !== null && Number.isFinite(gm) && gm > 1e-9 ? dev / gm : null;

    // The reading, in whichever unit is selected. `unit` converts that unit back to percentage
    // points, so a threshold set in sigmas can still be reported as a real take.
    let measure: number | null;
    let unitScale: number;
    if (zapMode === "sigma") { measure = z; unitScale = sg ?? NaN; }
    else if (zapMode === "alpha") { measure = aRatio; unitScale = al ?? NaN; }
    else if (zapMode === "gamma") { measure = gRatio; unitScale = gm ?? NaN; }
    else { measure = dev; unitScale = 1; }

    // No published scale means the pair cannot be placed on this axis at all.
    if (measure === null || !Number.isFinite(measure) || !Number.isFinite(unitScale)) continue;

    const m = Math.abs(measure);
    if (m < lo || m > hi) continue;

    // What the trade banks if the spread runs from here to the exit level, in pp.
    const toExit = Math.max(0, m - exitAt) * Math.abs(unitScale);
    const aAhead = dev > 0;
    out.push({
      a: p.ticker, b: p.partner, bench: p.bench, beta,
      rate: p.rate, total: p.total,
      dev,
      devMid,
      // What crossing costs. Clamped at 0: a one-sided quote makes the two readings coincide,
      // and float noise must not render as a negative cost.
      cost: Math.max(0, Math.abs(devMid) - Math.abs(dev)),
      z,
      aRatio,
      gRatio,
      measure: m,
      toExit,
      sigma: sg,
      alpha: al,
      gamma: gm,
      gammaCap: p.gammaCap ?? null,
      ahead: aAhead ? p.ticker : p.partner,
      behind: aAhead ? p.partner : p.ticker,
      // The price each leg is actually struck at: the ahead leg is sold at its bid, the lagging
      // leg is bought at its ask.
      aheadStack: aAhead ? qa.bid : qb.bid,
      behindStack: aAhead ? qb.ask : qa.ask,
      aheadMid: aAhead ? midA : midB,
      behindMid: aAhead ? midB : midA,
      betaPub: p.beta,
    });
  }

  out.sort((x, y) => Math.abs(y.dev) - Math.abs(x.dev));
  return out;
}
