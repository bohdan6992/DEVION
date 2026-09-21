/** Is the published file up to date? Used for the "data has not been refreshed" banner on both Scout pages. */

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
