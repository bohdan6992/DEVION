/**
 * The feed's 00:00 and 04:00 rollovers, as the Scout pages see them.
 *
 * Measured on the published logs (2026-09-20): PairFlux PRE exits pile up at exactly 00:00 (1183 vs 15 the
 * minute before, 99.8% "wins") and at 04:00; Arbitrage PRE births spike at 00:00 (1445 vs 106) and just
 * after 04:00. The Stack% baseline rolls over there, so a deviation appears or vanishes on the clock rather
 * than in the market. The notebooks now cut/guard those minutes when they are re-run; this is the same rule
 * applied to what is ALREADY published, as the EXCL 00:00/04:00 toggle.
 *
 * A trade is dropped when it was born within GUARD minutes after a rollover, or was alive across one.
 * Minutes are on the PRE-wrapped axis (evening negative, 00:00 = 0, 04:00 = 240). A trade with no known
 * start time cannot be judged and is kept.
 */

export const ROLLOVER_MINUTES: readonly number[] = [0, 240];
export const ROLLOVER_GUARD_MIN = 10;

export function touchesRollover(start: number, exit: number): boolean {
  if (start !== start) return false;
  for (const b of ROLLOVER_MINUTES) {
    if (start >= b && start < b + ROLLOVER_GUARD_MIN) return true; // born on the new baseline
    if (exit === exit && start < b && exit >= b) return true; // alive across the rollover
  }
  return false;
}

/**
 * How many whole days the newest session in the file is behind today (New York calendar), or null when
 * the date cannot be read. Used for the "data has not been refreshed" banner.
 */
export function daysBehind(mostRecentSession: string | null | undefined, now: Date = new Date()): number | null {
  if (!mostRecentSession || !/^\d{4}-\d{2}-\d{2}/.test(mostRecentSession)) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const a = Date.parse(`${mostRecentSession.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
