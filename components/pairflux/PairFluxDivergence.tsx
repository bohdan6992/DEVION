"use client";

/**
 * Live pair divergence for the Sonar, laid out the way the Arbitrage sonar lays out its signals:
 * one column per benchmark ETF, the leg that ran AHEAD on the left (sold at its bid, red) and the
 * one that LAGGED on the right (bought at its ask, green), with everything the two share written
 * once into a card between them.
 *
 * Answers one question: of the pairs PairFlux has published, which ones are APART right now?
 *
 * It computes nothing from history and gates on no rating — the published file supplies only the
 * list of pairs worth watching, each pair's hedge ratio and its spread sigma. The divergence itself
 * comes from the same live signal rows the Sonar is already rendering, so this panel never issues a
 * market-data request of its own.
 *
 * FILTERS. `signals` is the Sonar's FILTERED set, so every min/max control in the toolbar (ADV,
 * VWAP, spread, market cap, volume, ...) applies here too. A pair can only be priced when BOTH legs
 * are present, so those filters apply to BOTH TICKERS of the pair with no extra logic: drop either
 * leg and the pair goes with it. The header counts how many pairs were lost to exactly one leg
 * being filtered out — that is the number that tells you a threshold has gone too tight.
 *
 * The deviation follows the notebook's definition (OriON-strategies/notebooks/PairFlux.ipynb),
 * `dev = stack(A) - beta * stack(B)` in percentage points, where `stack` is a ticker's move against
 * its OWN previous close. Live that arrives as two numbers per ticker, `BidLstClsΔ%` and
 * `AskLstClsΔ%`.
 *
 * EXECUTABLE, not mid. A convergence trade shorts the leg that ran ahead and buys the one that
 * lagged, so it sells at a bid and buys at an ask — both sides give up their half-spread, and a
 * mid-to-mid reading overstates every row by roughly the sum of the two spreads. At a 0.3pp
 * threshold that is not a rounding difference, it is most of the edge. So:
 *
 *     devUp = bid(A) - beta * ask(B)     tradable when > 0:  SHORT A / LONG B
 *     devDn = ask(A) - beta * bid(B)     tradable when < 0:  SHORT B / LONG A
 *
 * Since bid <= ask these bracket the midpoint and at most one can be outside zero; when neither is,
 * the pair is apart on mid but the whole gap sits INSIDE the spreads and the row is dropped rather
 * than shown at zero. `cost` is what the two spreads eat: |dev_mid| - |dev_exec|.
 *
 * HEDGE RATIO. Use the published `beta`. It was audited against the staged 3-month data
 * (1 943 published QQQ INTRA pairs, scratchpad/audit_beta_bulk.py) and it is CORRECT:
 *   - an independent level-OLS recompute matches the published value to 2e-4;
 *   - it agrees with the median PER-DAY slope for 99% of pairs (14 of 1943 differ by >2x);
 *   - return-correlation and level-correlation agree (median 0.786 vs 0.822).
 *
 * A beta far from 1 is usually the pair's real ratio, not an artefact: IBIT/MSTX at 0.20 means IBIT
 * moves 0.2% while MSTX moves 1%, which is exactly their standing relationship. Hedging that pair
 * 1:1 would call a perfectly normal day an 8pp divergence.
 *
 * Measured cost of forcing 1:1 across those same pairs: the spread's sigma inflates >=2x for 19% of
 * pairs and >=5x for 8%, and in the |beta| < 0.5 band (367 pairs) the median inflation is 4.4x.
 * That is manufactured divergence, so the published beta is the only hedge used here.
 *
 * The pathological case that first suggested otherwise — XRPT/XXRP, corr 0.89 with beta 0.013 — is
 * one of only THREE pairs in 1943 whose level correlation falls below 0.1. It is an outlier to be
 * filtered on spread quality, not a reason to discard the hedge ratio everywhere.
 *
 * THE UNIT SELECTOR mirrors the Sonar's ZAP group: pick the unit a deviation is read in, then
 * gate on MIN and MAX in that unit and name the level the trade would EXIT at.
 *
 * In sigma or alpha mode a pair with no published sigma / alpha is EXCLUDED, not passed through.
 * That is the opposite of the old behaviour and it is deliberate: once the unit IS sigma, a pair
 * without one cannot be placed on the scale at all, so showing it would put an unmeasurable row
 * next to measured ones.
 *
 * THREE UNITS. A deviation in percentage points is unreadable on its own — 0.9pp is nothing on a
 * pair that routinely swings 3pp and enormous on one that lives inside 0.2pp — so every row is
 * also read against the pair's own scales, both of them per pair AND per class, and both computed
 * with that pair's own beta:
 *
 *     dev        percentage points, the executable quote-to-quote gap
 *     dev / σ    sigma = the LARGEST deviation this pair still reliably returns from.
 *                Above 1 the pair is stretched past the level it is known to come back from.
 *     dev / α    alpha = the MEDIAN peak of the episodes that did come back.
 *                Around 1 the pair is at its habitual stretch.
 *
 * A null sigma is a real answer, not missing data: the pair never cleared the convergence bar at
 * any level, so there is no distance it is known to return from. Those rows show "—".
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPairFluxRatings, type PairFluxClass, type PairFluxRow } from "../../lib/pairflux/client";
import type { ArbitrageSignal } from "../../lib/signals/signal";
import { getNumAny } from "../../lib/signals/signal";

/** Both sides of a ticker's move against its own previous close, in percentage points. */
type Quote = { bid: number; ask: number };

function stackQuote(s: ArbitrageSignal): Quote | null {
  const bid = getNumAny(s, ["BidLstClsΔ%", "BidLstClsDeltaPct", "bidLstClsDeltaPct"]);
  const ask = getNumAny(s, ["AskLstClsΔ%", "AskLstClsDeltaPct", "askLstClsDeltaPct"]);
  // One-sided quotes cannot price a spread trade: the missing side is exactly the one being
  // crossed. Fall back to the present side for BOTH only when that is all there is, and accept
  // that such a row reads like a zero-spread instrument.
  if (bid !== null && ask !== null) return { bid, ask };
  const only = bid ?? ask;
  return only === null ? null : { bid: only, ask: only };
}

type LivePair = {
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
  /** |deviation| in the unit currently selected. */
  measure: number;
  /** What running from here to the exit level would bank, in percentage points. */
  toExit: number;
  /** The pair's published sigma and alpha, pp. */
  sigma: number | null;
  alpha: number | null;
  /** The leg that ran ahead — the one to short. */
  ahead: string;
  /** The leg that lagged — the one to buy. */
  behind: string;
  /** Price the short is struck at (the ahead leg's bid). */
  aheadStack: number;
  /** Price the long is struck at (the lagging leg's ask). */
  behindStack: number;
  aheadMid: number;
  behindMid: number;
  /** RMS of the pair's converged peak deviations, pp — the SIG the Sonar prints per row. */
  /** The published beta, which is what the beta bucket and the toolbar's beta range both read. */
  betaPub: number | null;
};

// Benchmark order and beta buckets are LIFTED VERBATIM from the Arbitrage sonar
// (benchmarkOrder / betaLabels / betaOrder in components/sonar/PairFluxSonar.tsx) so the two panels
// read as one surface. Keep them in sync if that file's buckets ever change.
const BENCH_ORDER = ["QQQ", "SPY", "IWM", "XLF", "KRE", "XLE", "XLP", "SOXL", "GDX", "KWEB", "BITO"];

function benchRank(b: string): number {
  const i = BENCH_ORDER.indexOf(b);
  return i < 0 ? BENCH_ORDER.length : i;
}

type BetaKey = "lt1" | "b1_1_5" | "b1_5_2" | "gt2" | "unknown";

const BETA_LABELS: Record<BetaKey, string> = {
  lt1: "< 1.0",
  b1_1_5: "1.0 - 1.5",
  b1_5_2: "1.5 - 2.0",
  gt2: "> 2.0",
  unknown: "N/A",
};

const BETA_ORDER: BetaKey[] = ["lt1", "b1_1_5", "b1_5_2", "gt2", "unknown"];

/** Bucketed on |beta| — a negative hedge ratio is still a geared relationship of that size. */
function betaKeyOf(beta: number | null): BetaKey {
  if (beta === null || !Number.isFinite(beta)) return "unknown";
  const b = Math.abs(beta);
  if (b < 1.0) return "lt1";
  if (b < 1.5) return "b1_1_5";
  if (b < 2.0) return "b1_5_2";
  return "gt2";
}

export default function PairFluxDivergence({
  signals,
  // Owned by the Sonar so the switcher can sit in the shared filter toolbar next to every other
  // control, rather than this panel carrying a second one of its own.
  cls,
  // All four live in the Sonar toolbar, on the slot that used to hold Arbitrage's ZAP filters.
  unit: zapMode,
  minStr: zapMin,
  maxStr: zapMax,
  exitStr: zapExit,
  // The rho / beta / sigma / alpha boxes in the toolbar, each a [min, max] pair of raw strings.
  corrRange,
  betaRange,
  sigmaRange,
  alphaRange,
}: {
  signals: ArbitrageSignal[];
  cls: PairFluxClass;
  unit: "pct" | "sigma" | "alpha";
  minStr: string;
  maxStr: string;
  exitStr: string;
  corrRange: readonly [string, string];
  betaRange: readonly [string, string];
  sigmaRange: readonly [string, string];
  alphaRange: readonly [string, string];
}) {
  const [open, setOpen] = useState(true);
  const [pairs, setPairs] = useState<PairFluxRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The pair universe. includeInverted=false because each published pair is wanted ONCE here —
  // the mirrored row is the same spread read backwards and would double every card.
  const loadPairs = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetchPairFluxRatings({ cls, includeInverted: false, limit: 20000 });
      setPairs(res.rows ?? []);
      if (!res.ok && res.error) setLoadErr(res.error);
    } catch (e: any) {
      setLoadErr(String(e?.message ?? e));
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }, [cls]);

  useEffect(() => { void loadPairs(); }, [loadPairs]);

  const quoteByTicker = useMemo(() => {
    const m = new Map<string, Quote>();
    for (const s of signals ?? []) {
      const t = String(s?.ticker ?? "").trim().toUpperCase();
      if (!t) continue;
      const q = stackQuote(s);
      // Both directions of a ticker carry the same quote, so first one wins rather than last.
      if (q && Number.isFinite(q.bid) && Number.isFinite(q.ask) && !m.has(t)) m.set(t, q);
    }
    return m;
  }, [signals]);

  const [corrLo, corrHi] = corrRange;
  const [betaLo, betaHi] = betaRange;
  const [sigmaLo, sigmaHi] = sigmaRange;
  const [alphaLo, alphaHi] = alphaRange;

  // "0,7" is what a Ukrainian keyboard produces and it is what the user means by 0.7, but
  // Number("0,7") is NaN — which silently read as "no bound set" and switched the filter off.
  // Every box on this panel goes through here, so a comma is accepted anywhere a dot is.
  const numOrNull = (raw: string): number | null => {
    const t = raw.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // An empty box is no bound, and a value the pair does not carry fails a bound that was set:
  // once you ask for sigma >= 0.8 a pair without a sigma is not an unknown, it is a no.
  const inRange = (v: number | null | undefined, loRaw: string, hiRaw: string) => {
    const lo = numOrNull(loRaw);
    const hi = numOrNull(hiRaw);
    if (lo === null && hi === null) return true;
    if (v === null || v === undefined || !Number.isFinite(v)) return false;
    if (lo !== null && v < lo) return false;
    if (hi !== null && v > hi) return false;
    return true;
  };

  const rows = useMemo<LivePair[]>(() => {
    const lo = Math.abs(numOrNull(zapMin) ?? 0);
    const hi = Math.abs(numOrNull(zapMax) ?? Infinity);
    const exitAt = Math.abs(numOrNull(zapExit) ?? 0);
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

      // Pair-level gates from the toolbar, read on the pair's own published statistics.
      if (!inRange(p.corr, corrLo, corrHi)) continue;
      if (!inRange(p.beta === null ? null : Math.abs(p.beta), betaLo, betaHi)) continue;
      if (!inRange(sg, sigmaLo, sigmaHi)) continue;
      if (!inRange(al, alphaLo, alphaHi)) continue;
      const z = sg !== null && Number.isFinite(sg) && sg > 1e-9 ? dev / sg : null;
      const aRatio = al !== null && Number.isFinite(al) && al > 1e-9 ? dev / al : null;

      // The reading, in whichever unit is selected. `unit` converts that unit back to percentage
      // points, so a threshold set in sigmas can still be reported as a real take.
      let measure: number | null;
      let unit: number;
      if (zapMode === "sigma") { measure = z; unit = sg ?? NaN; }
      else if (zapMode === "alpha") { measure = aRatio; unit = al ?? NaN; }
      else { measure = dev; unit = 1; }

      // No published scale means the pair cannot be placed on this axis at all.
      if (measure === null || !Number.isFinite(measure) || !Number.isFinite(unit)) continue;

      const m = Math.abs(measure);
      if (m < lo || m > hi) continue;

      // What the trade banks if the spread runs from here to the exit level, in pp.
      const toExit = Math.max(0, m - exitAt) * Math.abs(unit);
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
        measure: m,
        toExit,
        sigma: sg,
        alpha: al,
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
  }, [pairs, quoteByTicker, zapMode, zapMin, zapMax, zapExit, corrLo, corrHi, betaLo, betaHi, sigmaLo, sigmaHi, alphaLo, alphaHi]);

  /**
   * Benchmark columns, each split into the Sonar's beta buckets. Nothing is capped — the toolbar
   * filters decide what is worth showing, so a column is long only when that many pairs are apart.
   */
  const benchBlocks = useMemo(() => {
    const taken = new Map<string, number>();
    const m = new Map<string, Map<BetaKey, LivePair[]>>();
    for (const r of rows) {
      const bench = r.bench || "—";
      taken.set(bench, (taken.get(bench) ?? 0) + 1);
      const buckets = m.get(bench) ?? new Map<BetaKey, LivePair[]>();
      const key = betaKeyOf(r.betaPub);
      const list = buckets.get(key) ?? [];
      list.push(r);
      buckets.set(key, list);
      m.set(bench, buckets);
    }
    return Array.from(m.entries())
      .sort((x, y) => {
        const d = benchRank(x[0]) - benchRank(y[0]);
        return d !== 0 ? d : (taken.get(y[0]) ?? 0) - (taken.get(x[0]) ?? 0);
      })
      .map(([bench, buckets]) => ({
        bench,
        buckets: BETA_ORDER
          .filter((k) => (buckets.get(k)?.length ?? 0) > 0)
          .map((k) => ({ key: k, label: BETA_LABELS[k], list: buckets.get(k)! })),
      }));
  }, [rows]);

  /**
   * How the pair universe survives the toolbar. `both` is what can be priced; `half` is the pairs
   * where exactly one leg cleared the filters — reported because a pair silently vanishing when its
   * partner is filtered out is indistinguishable from the pair simply not being apart.
   */
  const unitLabel = zapMode === "sigma" ? "σ" : zapMode === "alpha" ? "α" : "DEV";

  const coverage = useMemo(() => {
    let both = 0;
    let half = 0;
    for (const p of pairs) {
      const a = quoteByTicker.has(p.ticker);
      const b = quoteByTicker.has(p.partner);
      if (a && b) both++;
      else if (a || b) half++;
    }
    return { both, half };
  }, [pairs, quoteByTicker]);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[11px] font-bold tracking-[0.18em] text-sky-300 hover:text-sky-200"
        >
          {open ? "▾" : "▸"} РОЗХОДЖЕННЯ ПАР
        </button>

        <span className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">
          {loading
            ? "…"
            : `${rows.length} розійшлись · ${coverage.both} з ${pairs.length} пар обідві ноги` +
              (coverage.half > 0 ? ` · ${coverage.half} відсіяло по одній нозі` : "")}
        </span>
      </div>

      {loadErr && <div className="px-4 pb-2 font-mono text-[10px] text-rose-300/80">{loadErr}</div>}

      {open && (
        <div className="border-t border-white/[0.05] px-4 py-4">
          {benchBlocks.length === 0 ? (
            <div className="py-8 text-center font-mono text-[10px] text-zinc-600">
              {pairs.length === 0
                ? "Список пар порожній — рейтинги PairFlux ще не опубліковані."
                : coverage.both === 0
                  ? coverage.half > 0
                    ? `Жодна пара не має ОБІДВОХ ніг після фільтрів — у ${coverage.half} пар пройшла лише одна. Послабте пороги в тулбарі.`
                    : "Жодна пара не має котирувань обох ніг у поточній вибірці Сонара."
                  : zapMode === "pct"
                    ? `Жодна пара не розійшлась на ${zapMin || 0}pp або більше ПІСЛЯ перетину спредів.`
                    : `Жодна пара не пройшла пороги в ${zapMode === "sigma" ? "сігмах" : "альфах"} — пари без цієї величини в цьому режимі не показуються.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {benchBlocks.map(({ bench, buckets }) => (
                <div key={bench} className="flex min-w-0 flex-col self-start">
                  {/* Benchmark header, ruled both sides — HedgeHeaderMinimal's markup. */}
                  <div className="px-4 pt-3 pb-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="h-px bg-white/10" />
                      <div className="text-[19px] font-mono font-semibold leading-none tracking-wide text-zinc-200">
                        {bench}
                      </div>
                      <div className="h-px bg-white/10" />
                    </div>
                  </div>

                  <div className="px-4 pb-3">
                    <div className="h-px bg-white/5" />
                  </div>

                  <div className="space-y-6">
                    {buckets.map((bk) => (
                      <div
                        key={bk.key}
                        className="overflow-hidden rounded-xl border border-white/5 bg-[#0a0a0a]/40"
                      >
                        <div className="grid grid-cols-[20px_1fr_20px] items-center gap-2 border-b border-white/5 bg-[#0a0a0a]/40 px-3 py-2">
                          <div className="flex h-5 w-5 items-center justify-center text-rose-400/90">
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 12 12"
                              className="h-3.5 w-3.5 drop-shadow-[0_0_6px_rgba(251,113,133,0.2)]"
                              fill="currentColor"
                            >
                              <path d="M6 9.5 1.75 3h8.5L6 9.5Z" />
                            </svg>
                          </div>
                          <div className="text-center font-mono text-xs font-medium uppercase tracking-wide text-zinc-400">
                            {bk.label}
                          </div>
                          <div className="flex h-5 w-5 items-center justify-center text-[#6ee7b7]">
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 12 12"
                              className="h-3.5 w-3.5 drop-shadow-[0_0_6px_rgba(110,231,183,0.22)]"
                              fill="currentColor"
                            >
                              <path d="M6 2.5 10.25 9h-8.5L6 2.5Z" />
                            </svg>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 p-2">
                          {bk.list.map((r) => (
                            <PairCard key={`${r.a}|${r.b}`} r={r} unitLabel={unitLabel} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One pair, as two SignalCard-shaped legs side by side plus the strip of everything they share.
 *
 * Left leg is the one to SHORT (it ran ahead, struck at its bid), right leg is the one to BUY (it
 * lagged, struck at its ask). The legs are resolved by ROLE when the row is built, never by reading
 * the sign of a number here — that is the step that gets inverted under pressure.
 */
function PairCard({ r, unitLabel }: { r: LivePair; unitLabel: string }) {
  // Highlighted once the pair is stretched past the level it is known to return from.
  const hot = r.z !== null && Math.abs(r.z) >= 1;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2">
        <Leg ticker={r.ahead} side="bid" value={r.aheadStack} mid={r.aheadMid} alpha={r.alpha} sigma={r.sigma} tone="short" />
        <Leg ticker={r.behind} side="ask" value={r.behindStack} mid={r.behindMid} alpha={r.alpha} sigma={r.sigma} tone="long" />
      </div>

      {/* Everything the two legs share, written once. */}
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5 px-1 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-300">
          <span className="text-zinc-600">{unitLabel} </span>
          <b>{r.measure.toFixed(2)}</b>
        </span>
        <span title="Скільки pp дає хід звідси до рівня виходу" className="text-violet-300/80">
          <span className="text-zinc-600">→ </span>
          {r.toExit.toFixed(2)}<span className="text-zinc-600">pp</span>
        </span>
        <span
          title={`Сігма пари = найбільше відхилення, з якого вона ще повертається. Скільки сігм пари складає нинішнє відхилення${
            r.sigma === null ? " — для цієї пари такого рівня немає" : `. Сама σ = ${r.sigma.toFixed(2)}pp — це те, що читає фільтр σ і що показано під ногами`
          }`}
          className={hot ? "text-violet-300" : "text-zinc-500"}
        >
          <span className="text-zinc-600">dev/σ </span>
          {r.z === null ? "-" : Math.abs(r.z).toFixed(2)}
        </span>
        <span
          title={`Альфа пари = медіанний пік епізодів, що звелись. Скільки альф пари складає нинішнє відхилення${
            r.alpha === null ? "" : `. Сама α = ${r.alpha.toFixed(2)}pp — це те, що читає фільтр α і що показано під ногами`
          }`}
          className="text-sky-300/80"
        >
          <span className="text-zinc-600">dev/α </span>
          {r.aRatio === null ? "-" : Math.abs(r.aRatio).toFixed(2)}
        </span>
        <span
          title="Скільки забирають два спреди: |mid| − |виконуване|"
          className="text-amber-300/70"
        >
          <span className="text-zinc-600">сп </span>
          {r.cost.toFixed(2)}
        </span>
        <span title="Історична частка зведених епізодів" className="text-zinc-500">
          {r.rate === null ? "-" : `${(r.rate * 100).toFixed(0)}%`}
          <span className="text-zinc-600"> · {r.total}еп</span>
        </span>
        <span title="Застосований хедж-коефіцієнт" className="text-zinc-600">
          β {r.beta.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/**
 * One leg, in SignalCard's exact markup: ticker and the crossed quote on the first line, SIG left
 * and % / sigma right on the second. SIG and sigma are the PAIR's statistics — a pair has one of
 * each — so they read the same under both legs by construction, not by a copy-paste slip.
 */
function Leg({
  ticker, side, value, mid, alpha, sigma, tone,
}: {
  ticker: string;
  side: "bid" | "ask";
  value: number;
  mid: number;
  alpha: number | null;
  sigma: number | null;
  tone: "short" | "long";
}) {
  const pxColor = tone === "short" ? "text-rose-400" : "text-[#6ee7b7]";
  return (
    <div className="group relative flex w-full flex-col justify-between gap-1.5 rounded-xl border border-white/5 bg-transparent p-3 text-left transition-all duration-200 hover:border-white/10 hover:bg-white/5">
      <div className="flex w-full items-center justify-between">
        <span className="text-[15px] font-bold leading-none tracking-tight text-zinc-300 group-hover:text-zinc-100">
          {ticker}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] lowercase text-zinc-600">{side}</span>
          <span className={`font-mono text-[15px] font-bold leading-none tabular-nums ${pxColor}`}>
            {value.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex w-full items-center justify-between font-mono text-[10px] opacity-80">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-600">α</span>
          <span className="tabular-nums text-zinc-400">{alpha === null ? "-" : alpha.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">%</span>
            <span className="tabular-nums text-zinc-400">{mid.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">σ</span>
            <span className="tabular-nums text-zinc-400">{sigma === null ? "-" : sigma.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
