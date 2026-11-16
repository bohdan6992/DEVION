/**
 * The USA / CHINA region pills, in one place.
 *
 * The country field is the tape's own spelling, and the United States is **"UNITED STATES"** — not
 * "USA". Measured on the tape's static sidecar for 2026-11-13: UNITED STATES 15,570, CANADA 594,
 * CHINA 555, ISRAEL 286, BRITAIN 211, HONG KONG 202. A pill that compares against "USA" matches
 * nothing, so turning it on empties the table instead of narrowing it — which looks like a broken
 * page rather than a filter with a typo in it. That is exactly what happened here before this file
 * existed; ArbitrageSpectr had the right spelling and the pages written after it did not.
 *
 * Both spellings are accepted anyway: the comparison is cheap and a second source (a different
 * vendor field, a hand-maintained list) spelling it "USA" should narrow the table, not blank it.
 */

const USA = new Set(["UNITED STATES", "USA", "US", "UNITED STATES OF AMERICA"]);
const CHINA = new Set(["CHINA", "CN", "PEOPLES REPUBLIC OF CHINA"]);

function norm(country: string | null | undefined): string {
  return String(country ?? "").trim().toUpperCase();
}

export function isUsa(country: string | null | undefined): boolean {
  return USA.has(norm(country));
}

export function isChina(country: string | null | undefined): boolean {
  return CHINA.has(norm(country));
}

/**
 * The region pills as a predicate. Neither on means no constraint; either on means the ticker must
 * be in one of the enabled regions. A ticker with no country fails a region that is on, which is
 * the house rule for a row missing the field a filter reads.
 */
export function inSelectedRegions(
  country: string | null | undefined,
  includeUsa: boolean,
  includeChina: boolean
): boolean {
  if (!includeUsa && !includeChina) return true;
  return (includeUsa && isUsa(country)) || (includeChina && isChina(country));
}
