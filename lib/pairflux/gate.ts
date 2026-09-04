/**
 * The PairFlux stream gate: which live tickers the stream may act on, and on which side.
 *
 * The stream used to pass NO gate at all, so it fell through to the engine's default — Arbitrage's
 * per-ticker ZAP band. That is a different rule about a different thing, which is why the stream
 * tab and the Sonar disagreed: the Sonar was showing pairs that were APART, the stream was showing
 * whatever tickers happened to clear a sigma threshold on their own benchmark.
 *
 * Here the verdict comes from the SAME `computeLivePairs` the Sonar's divergence panel renders, so
 * "the same signals as the Sonar" is structural rather than a thing to keep re-checking.
 *
 * TWO TICKERS, ONE EVENT. A pair trade is two positions, so BOTH legs are approved from one live
 * pair — the leg that ran ahead to be SOLD, the leg that lagged to be BOUGHT. The engine is already
 * per-ticker: two approvals become two decisions and two order intents, which is exactly the two
 * orders the desk has to send. Nothing downstream needed a notion of "pair" for that to work.
 *
 * DIRECTION. The engine reads `down` as Short and anything else as Long, and re-points a row at
 * whichever side the gate approved. So the ahead leg is approved DOWN and the lagging leg UP.
 */

import type { LivePair } from "@/lib/pairflux/livePairs";

export type PairFluxGateVerdict = { up: boolean; down: boolean };

export type PairFluxGateEntry = PairFluxGateVerdict & {
  /** The other leg of the pair this ticker was approved as part of. */
  partner: string;
  /** Signed pair deviation, pp, at the moment of approval. */
  dev: number;
  /** |deviation| in the unit the toolbar is set to. */
  measure: number;
  /**
   * The two legs' shared identity: the pair, not the ticker.
   *
   * Both legs carry the SAME key, which is what lets everything downstream judge the pair once
   * instead of judging each leg on its own numbers and letting the two answers disagree.
   */
  pairKey: string;
  /**
   * What the trade banks running from here to the exit level, in PERCENTAGE POINTS.
   *
   * This is the pair's real edge and it is already net of crossing — `dev` is built from bid and
   * ask, not mid, so both half-spreads are paid inside it. It exists here because the engine's
   * generic edge test subtracts a leg's dollar spread from the signal, and when the toolbar is set
   * to sigmas or alphas that subtracts dollars from sigmas. Supplying the edge outright keeps the
   * comparison in one unit.
   */
  toExit: number;
};

/** The unordered identity of a pair: A|B and B|A are one situation, so they get one key. */
export function pairKeyOf(a: string, b: string): string {
  const x = a.trim().toUpperCase();
  const y = b.trim().toUpperCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

const NO: PairFluxGateVerdict = { up: false, down: false };

/**
 * Ticker -> verdict, built once per live-pair refresh so the gate itself is a map lookup.
 *
 * PAIRS ARE MATCHED, NOT TICKERS SCORED.
 *
 * A ticker is usually a leg of many live pairs at once — the miners all diverge from each other,
 * so do the bitcoin proxies. Claiming each ticker independently by its own widest reading looks
 * right per ticker and is wrong per trade: measured live, 78% of approved tickers ended up
 * pointing at a partner that was itself paired with somebody else. CIFR approved against IREN
 * while IREN traded against CLSK is not a pair trade, it is a naked directional position on a
 * strategy that exists to have two hedged legs.
 *
 * So this is a greedy matching, widest first: a pair is taken only when NEITHER leg is already
 * spoken for. Every approved ticker therefore has a partner that names it back, and the two
 * orders that go out are two halves of one trade.
 *
 * The cost is real and worth naming: the second-widest pair sharing a leg is skipped entirely,
 * not re-pointed at someone else. That is the correct answer — its edge was measured against a
 * partner that is no longer available.
 */
export function buildPairFluxGateMap(pairs: readonly LivePair[]): Map<string, PairFluxGateEntry> {
  const out = new Map<string, PairFluxGateEntry>();

  const norm = (t: string) => t.trim().toUpperCase();

  // Widest first, so the strongest divergence gets first refusal on its legs.
  const ordered = [...pairs].sort((a, b) => b.measure - a.measure);

  for (const p of ordered) {
    const ahead = norm(p.ahead);
    const behind = norm(p.behind);
    if (!ahead || !behind || ahead === behind) continue;
    // Either leg already committed to a wider pair: this one cannot be traded as a pair at all.
    if (out.has(ahead) || out.has(behind)) continue;

    const shared = { dev: p.dev, measure: p.measure, pairKey: pairKeyOf(ahead, behind), toExit: p.toExit };
    // Sold at its bid — the leg that ran ahead.
    out.set(ahead, { up: false, down: true, partner: behind, ...shared });
    // Bought at its ask — the leg that lagged.
    out.set(behind, { up: true, down: false, partner: ahead, ...shared });
  }

  return out;
}

/** The gate the engine calls, per signal. */
export function matchPairFluxGate(
  map: ReadonlyMap<string, PairFluxGateEntry>,
  ticker: unknown,
): PairFluxGateVerdict {
  const key = String(ticker ?? "").trim().toUpperCase();
  if (!key) return NO;
  const hit = map.get(key);
  return hit ? { up: hit.up, down: hit.down } : NO;
}
