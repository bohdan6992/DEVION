import { getNumAny, getStrAny, toNum } from "@/lib/signals/signal";

/**
 * The eight headline stats of the active-ticker strip, derived from ONE signal row.
 *
 * This lived inline in Arbitrage Sonar and was copied verbatim into the other four Sonars, while
 * Scanner and Stream showed a shorter, different list built from a live-snapshot fetch. Three
 * surfaces, three answers for the same ticker. The derivation is here so every surface reads the
 * same fields in the same order, and so the next field is added once.
 *
 * The input is the live signal row (what the Sonar calls `activeItem`): the SSE row for that
 * ticker, carrying `best` (the resolved rating bin) and `best_params`. A null row yields the same
 * eight labels with dashes, which is what the strip shows before a ticker is picked — the labels
 * are the point, not the values.
 */

export type ActiveTickerStat = { label: string; value: string; accent?: boolean };

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v)
    ? "-"
    : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const fmtMaybeInt = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "-" : Math.round(v).toLocaleString("en-US");

const safeObj = (v: any) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const getBestParams = (d: any) => d?.best_params ?? d?.bestParams ?? d?.BestParams ?? null;

/**
 * Which N the rating shows. Arbitrage's toolbar can restrict the count to hard-to-borrow or
 * easy-to-borrow observations; "any" sums both. Surfaces without that control pass nothing and
 * get the sum, which is the number the bin was actually measured on.
 */
export type ActiveTickerRatingType = "hard" | "soft" | string | null | undefined;

export function buildActiveTickerStats(row: any, ratingType?: ActiveTickerRatingType): ActiveTickerStat[] {
  const best = row?.best ?? row?.Best ?? null;
  const bestParams = getBestParams(row);
  const printMedian = safeObj(bestParams?.dev_print_last5_median ?? bestParams?.DevPrintLast5Median);

  const bench = (row?.benchmark ? String(row.benchmark) : getStrAny(row, ["benchmark", "Benchmark"], "-")).toUpperCase();
  const exchange = getStrAny(row, ["exchange", "Exchange"], "-");
  const beta = toNum(best?.beta ?? best?.Beta ?? row?._bestBeta);
  const sigma = toNum(best?.sigma ?? best?.Sigma) ?? getNumAny(row, ["sig", "Sig", "sigma", "Sigma"]);

  const mdPrintPos =
    toNum(best?.printMedianPos ?? best?.PrintMedianPos) ??
    toNum(printMedian?.pos ?? printMedian?.Pos);
  const mdPrintNeg =
    toNum(best?.printMedianNeg ?? best?.PrintMedianNeg) ??
    toNum(printMedian?.neg ?? printMedian?.Neg);

  const rating = toNum(best?.rating);
  const totalHard = toNum(best?.hard);
  const totalSoft = toNum(best?.soft);
  const totalAny =
    totalHard != null || totalSoft != null ? (totalHard ?? 0) + (totalSoft ?? 0) : toNum(best?.total);
  const totalEff = ratingType === "hard" ? totalHard : ratingType === "soft" ? totalSoft : totalAny;

  return [
    { label: "Exchange", value: exchange !== "-" ? exchange : "-" },
    { label: "Bench", value: bench !== "-" ? bench : "-" },
    { label: "Beta", value: beta == null ? "-" : fmtNum(beta, 2) },
    { label: "Sig", value: sigma == null ? "-" : fmtNum(sigma, 2) },
    { label: "Rate", value: rating == null ? "-" : `${Math.round(rating * 100)}%`, accent: true },
    { label: "N", value: totalEff == null ? "-" : fmtMaybeInt(totalEff) },
    { label: "MD Print Pos", value: mdPrintPos == null ? "-" : fmtNum(mdPrintPos, 2) },
    { label: "MD Print Neg", value: mdPrintNeg == null ? "-" : fmtNum(mdPrintNeg, 2) },
  ];
}
