/**
 * The hedge leg's half of the tape filters.
 *
 * A PairFlux row is one trade on TWO names, so every filter that describes a tradable name has to
 * be true of both of them. Most of the toolbar is judged on the bridge, where the engine now runs
 * the same `PassesStaticMetaFilters` over the partner's static block before the pair is replayed
 * at all. Three toggles cannot be: REP and CORR need the report marker's date and release time,
 * which the tape's boolean has already thrown away, and ITB/HARD read the raw borrow string — all
 * three are therefore applied in the browser, and until the partner's two markers were carried on
 * the row they could only ever see the ticker leg. A pair shorting a hard-to-borrow partner passed
 * HARD untouched.
 *
 * The partner's markers arrive as `benchReport` / `benchB5Etb` (PairFluxClosed.PartnerReport and
 * .PartnerB5Etb). They are fed to the SAME readers the ticker leg uses through a one-field shim,
 * so the two sides are judged by one rule rather than by a second copy of it.
 */

import { rowExcludedByBorrow } from "@/lib/filters/borrow";
import { rowExcludedByCorr } from "@/lib/filters/sectorCorr";
import { rowReportClassification, type ReportSessionDay } from "@/lib/filters/reportTiming";

/** The partner's ticker as the row spells it, uppercased; "" when the row carries no hedge leg. */
export function benchTickerOf(row: any): string {
  return String(row?.benchTicker ?? row?.BenchTicker ?? "").trim().toUpperCase();
}

function benchReportShim(row: any) {
  return { report: row?.benchReport ?? row?.BenchReport ?? null };
}

function benchBorrowShim(row: any) {
  return { b5etb: row?.benchB5Etb ?? row?.BenchB5Etb ?? null };
}

export type PairLegFilterOpts = {
  requireHasReport: boolean;
  excludeHasReport: boolean;
  excludeItb: boolean;
  excludeHard: boolean;
  excludeCorr: boolean;
  corrExcluded: Set<string>;
  /** The tape day the report marker is judged against; null = today in New York. */
  session: ReportSessionDay | null;
};

/**
 * True when the HEDGE leg fails one of the three browser-side toggles.
 *
 * THE RULE: a partner that lacks what a toggle reads is rejected, whichever way the toggle is set.
 * No partner ticker at all, no report marker, no borrow status — each is unknown, and unknown is
 * not "clear". (The pair is one trade on two names; a leg we know nothing about cannot vouch for it.)
 */
export function benchLegExcluded(row: any, o: PairLegFilterOpts): boolean {
  const anyToggle = o.requireHasReport || o.excludeHasReport || o.excludeItb || o.excludeHard || o.excludeCorr;
  const bench = benchTickerOf(row);
  if (!bench) return anyToggle;

  if (o.requireHasReport || o.excludeHasReport) {
    const affects = rowReportClassification(benchReportShim(row), o.session);
    if (affects == null) return true;
    if (o.excludeHasReport && affects) return true;
    if (o.requireHasReport && !affects) return true;
  }

  if (rowExcludedByBorrow(benchBorrowShim(row), o.excludeItb, o.excludeHard)) return true;

  if (o.excludeCorr && rowExcludedByCorr({ ticker: bench }, o.corrExcluded)) return true;

  return false;
}
