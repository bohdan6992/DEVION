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
 * Ticker -> EVERY pair it is currently a leg of.
 *
 * NO EXCLUSIVITY (user, 2026-09-04). This used to be a greedy matching: a pair was taken only when
 * neither leg was already spoken for, so one ticker belonged to at most one trade. Measured on the
 * live intra universe that turned 301 diverged pairs into 71 — not a filter, a structural cap, and
 * the Sonar rightly showed all 301. The rule is now that a ticker may be a leg of as many pairs as
 * it has diverged from: SFNC apart from AUB, FIBK and UBSI is three trades, and SFNC is sold in
 * each of them.
 *
 * That is why this returns a LIST. A ticker no longer has "a" verdict — it has one per pair, and
 * in different pairs it can even sit on different sides (ahead of one name, behind another). The
 * per-ticker question the old gate answered cannot express that, so callers work per PAIR LEG and
 * the engine keys its bookkeeping by (ticker, pairKey) rather than by ticker alone.
 *
 * Widest first within each ticker, so anything that has to pick one still picks the strongest.
 */
export function buildPairFluxGateMap(pairs: readonly LivePair[]): Map<string, PairFluxGateEntry[]> {
  const out = new Map<string, PairFluxGateEntry[]>();
  const norm = (t: string) => t.trim().toUpperCase();

  const add = (ticker: string, entry: PairFluxGateEntry) => {
    const list = out.get(ticker);
    if (list) list.push(entry);
    else out.set(ticker, [entry]);
  };

  const seen = new Set<string>();
  for (const p of [...pairs].sort((a, b) => b.measure - a.measure)) {
    const ahead = norm(p.ahead);
    const behind = norm(p.behind);
    if (!ahead || !behind || ahead === behind) continue;
    const key = pairKeyOf(ahead, behind);
    // The same unordered pair can arrive twice if the universe ever ships both directions.
    if (seen.has(key)) continue;
    seen.add(key);

    const shared = { dev: p.dev, measure: p.measure, pairKey: key, toExit: p.toExit };
    // Sold at its bid — the leg that ran ahead.
    add(ahead, { up: false, down: true, partner: behind, ...shared });
    // Bought at its ask — the leg that lagged.
    add(behind, { up: true, down: false, partner: ahead, ...shared });
  }

  return out;
}

/** Every pair leg approved for this ticker, widest first. Empty when it is in no pair. */
export function pairFluxLegsFor(
  map: ReadonlyMap<string, PairFluxGateEntry[]>,
  ticker: unknown,
): readonly PairFluxGateEntry[] {
  const key = String(ticker ?? "").trim().toUpperCase();
  return key ? map.get(key) ?? [] : [];
}

/** The gate the engine calls, per signal. */
export function matchPairFluxGate(
  map: ReadonlyMap<string, PairFluxGateEntry[]>,
  ticker: unknown,
): PairFluxGateVerdict {
  const legs = pairFluxLegsFor(map, ticker);
  if (legs.length === 0) return NO;
  // A ticker that is ahead in one pair and behind in another is approved BOTH ways. The verdict
  // alone can no longer say which trade a row belongs to — that is what the expansion below is
  // for; this stays only so a ticker in no pair is still refused outright.
  return { up: legs.some((l) => l.up), down: legs.some((l) => l.down) };
}

/**
 * One signal row in, one row per approved pair out.
 *
 * The engine is built around "a row is a candidate"; it never had to represent one ticker being a
 * candidate three separate times. Rather than teach every part of it about pairs, the row itself
 * is duplicated per pair here, each copy carrying the pair it belongs to and pointed at the side
 * that pair needs. Downstream, a decision, a latch and a position are then keyed by
 * (ticker, pairKey) — see legIdentityOf in streamEngine — so the three SFNC shorts are three
 * independent situations that open, add and close on their own.
 *
 * The quote is shared deliberately: every copy is the same instrument at the same instant, so the
 * bid, the ask and the spread must be identical across them. Only the pair context differs.
 *
 * Returns [] for a ticker in no approved pair, which drops it exactly as the old gate did.
 */
export function expandPairFluxSignal<T extends { ticker?: unknown }>(
  map: ReadonlyMap<string, PairFluxGateEntry[]>,
  row: T,
): T[] {
  const legs = pairFluxLegsFor(map, row?.ticker);
  if (legs.length === 0) return [];
  return legs.map((leg) => ({
    ...row,
    // `down` is how the engine spells Short; the leg that ran ahead is the one being sold.
    direction: leg.down ? "down" : "up",
    pairKey: leg.pairKey,
    pairPartner: leg.partner,
  })) as T[];
}
