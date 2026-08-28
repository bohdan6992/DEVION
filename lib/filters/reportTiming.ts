/**
 * Shared parsing for the "Report" field.
 *
 * `Report` is an RTD passthrough from TradingApp: a free-form marker that is usually an earnings
 * date plus a session qualifier, e.g. "28/07 AMC". The vendor vocabulary is not documented in this
 * repo — "AMC" is the only qualifier confirmed against live data.
 *
 * The qualifier decides WHICH session a report belongs to: an AMC release lands after its own
 * day's close, so it belongs to the NEXT trading day; a BMO (or unqualified) release belongs to
 * its own day. A report is relevant to the CURRENT session when that effective session is today:
 *
 *   today = 29/07     28/07 BMO -> stale, keep      29/07 BMO -> relevant, filter out
 *                     28/07 AMC -> relevant, filter 29/07 AMC -> lands after today's close, keep
 *
 * Unqualified dates are treated as BMO-like: the release can hit during its own session, so a
 * same-day unqualified report is filtered and an older one is not.
 *
 * This module owns only the date/qualifier half of the decision. When the value carries no parsable
 * date it returns null, and each caller falls back to its own boolean vocabulary — that keeps the
 * existing per-caller behaviour for values like "YES"/"NO" untouched.
 */

const AFTER_CLOSE_RE = /\bamc\b|after[\s-]*(market|close|hours)/i;

// The feed also states the release as a clock time ("29/07 08:00"), not only as AMC/BMO. A time at
// or after the closing bell belongs to the next trading day exactly like an AMC tag; anything
// earlier belongs to its own session. Without this, an afternoon report was treated as same-day
// (filtering a session it cannot affect) and the previous evening's was missed entirely.
const TIME_RE = /\b(\d{1,2}):(\d{2})\b/;
const MARKET_CLOSE_MINUTE = 16 * 60;

function isAfterCloseRelease(raw: string): boolean {
  if (AFTER_CLOSE_RE.test(raw)) return true;

  const t = TIME_RE.exec(raw);
  if (!t) return false;

  const hh = Number(t[1]);
  const mm = Number(t[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return false;

  return hh * 60 + mm >= MARKET_CLOSE_MINUTE;
}

export function getNewYorkYmd(): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value ?? NaN);
    const month = Number(parts.find((part) => part.type === "month")?.value ?? NaN);
    const day = Number(parts.find((part) => part.type === "day")?.value ?? NaN);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch {
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function getNewYorkMonthDay(): { month: number; day: number } {
  const { month, day } = getNewYorkYmd();
  return { month, day };
}

/** Minutes since NY midnight, for deciding which side of the closing bell we are on. */
function getNewYorkMinuteOfDay(): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
    // Intl can render midnight as hour 24 in the h23/h24 pair; normalise so 24:xx is not "tomorrow".
    if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
  } catch {
  }
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Weekend-aware step forward. Holidays are not handled, exactly like the backward step below. */
function nextTradingDay(from: ReportSessionDay): ReportSessionDay {
  const d = new Date(Date.UTC(from.year, from.month - 1, from.day));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The session a live REP verdict is judged against — and it is NOT the calendar day.
 *
 * A trading session here runs 04:00 -> 04:00 NY, and earnings land after the 16:00 close. Anchoring
 * on the calendar date meant the verdict flipped at NY MIDNIGHT, in the middle of the night
 * session: a "26/08 AMC" report read as "belongs to tomorrow, keep" from 16:00 to 23:59 and as
 * "belongs to today, drop" from 00:01. Measured on 2026-08-26 — tickers that had just reported
 * (VEEV 26/08 AMC, CRM 26/08 16:00) passed REP all evening and then vanished on their own after
 * midnight, which is exactly what the desk saw.
 *
 * Rolling at the close instead makes the whole post-market and night read the same way the next
 * morning will: once a name has reported, REP keeps dropping it until that session ends.
 */
export function getNewYorkReportSessionYmd(): ReportSessionDay {
  const today = getNewYorkYmd();
  return getNewYorkMinuteOfDay() < MARKET_CLOSE_MINUTE ? today : nextTradingDay(today);
}

/**
 * The session a report is judged against. Live surfaces leave it null and get today in New York;
 * the Scanner replays a past tape day and must pass THAT day, or every marker reads as stale and
 * the REP/CORR filters quietly pass everything through.
 */
export type ReportSessionDay = { year: number; month: number; day: number };

/** Parses "YYYY-MM-DD" (the tape's dateNy). Returns null for anything else. */
export function parseSessionDay(dateNy: string | null | undefined): ReportSessionDay | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateNy ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Weekend-aware only. US market holidays are NOT handled: on the session after a holiday this
 * steps back to the holiday itself rather than to the last real trading day, so an AMC report from
 * the true previous session would be missed. Wiring a market calendar in here is the proper fix.
 */
export function getNewYorkPrevTradingMonthDay(session?: ReportSessionDay | null): { month: number; day: number } {
  const { year, month, day } = session ?? getNewYorkYmd();
  const d = new Date(Date.UTC(year, month - 1, day));
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function readLooseBool(value: any): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off", "-", "null", "undefined", "none"].includes(s)) return false;
  return null;
}

/**
 * Pulls the raw report marker off a row, wherever it happens to live.
 *
 * The signal DTO carries the live tape row verbatim under `Meta`, and a .NET dictionary serializes
 * its keys with their ORIGINAL casing — while lookups on the C# side are case-insensitive, so the
 * server never notices which casing the feed used. JavaScript property access is case-sensitive,
 * so probing only `report`/`Report` silently misses a feed that spells it any other way, and the
 * filter then behaves as if no report existed at all. Hence the case-insensitive sweep.
 */
export function pickReportValue(row: any): any {
  if (row == null) return null;

  const direct = row.report ?? row.Report;
  if (direct != null && String(direct).trim() !== "") return direct;

  for (const container of [row.meta, row.Meta]) {
    if (!container || typeof container !== "object") continue;
    for (const key of Object.keys(container)) {
      if (key.toLowerCase() !== "report") continue;
      const value = container[key];
      if (value != null && String(value).trim() !== "") return value;
    }
  }

  return null;
}

/**
 * Whole-row verdict: does this row's report land on today's session?
 *
 * Date/qualifier first; if the marker carries no date, fall back to plain boolean spellings, then
 * to any precomputed flag the row already has. Shared by Sonar, Stream and the filter engine so a
 * ticker cannot be filtered on one surface and shown on another.
 */
export function rowReportAffectsTodaySession(row: any): boolean {
  return rowReportAffectsSession(row, null);
}

/**
 * Same verdict against an explicit session. `session = null` means "today in New York", which is
 * what every live surface wants; the Scanner passes the tape day it is replaying.
 */
export function rowReportAffectsSession(row: any, session?: ReportSessionDay | null): boolean {
  const raw = pickReportValue(row);

  const byDate = parseReportDateAffectsSession(raw, session);
  if (byDate != null) return byDate;

  const byBool = readLooseBool(raw);
  if (byBool != null) return byBool;

  // Last resort: precomputed flags. Note the signals API's own HasReport is `Report == "YES"`,
  // which is false for every date-formatted marker — useful only for feeds that really send YES.
  const flag = readLooseBool(row?._reportBool) ?? readLooseBool(row?.hasReport ?? row?.HasReport);
  return flag === true;
}

/**
 * Returns true/false when `value` carries a parsable date, null when it does not (caller should
 * then fall back to its own boolean parsing).
 */
export function parseReportDateAffectsTodaySession(value: any): boolean | null {
  return parseReportDateAffectsSession(value, null);
}

/** Date/qualifier half of the verdict, judged against `session` (null = today in New York). */
export function parseReportDateAffectsSession(value: any, session?: ReportSessionDay | null): boolean | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let month: number | null = null;
  let day: number | null = null;
  // null = decide from the text (AMC/BMO token or an HH:MM); set explicitly by the compact form.
  let afterCloseOverride: boolean | null = null;

  // Bulk of the live feed uses a separator-less DDMMHHMM stamp — "29070800" is 29/07 08:00 and
  // "28071600" is 28/07 16:00. It carries no AMC/BMO token and no colon, so every other branch
  // here misses it and the report silently reads as "none".
  // The feed drops the day's leading zero, so the same stamp arrives as 7 digits for the 1st-9th
  // of a month ("7081610" = 07/08 16:10). Requiring exactly 8 made every such report parse as no
  // date at all, fall through to the boolean fallback, and read as "no report" — silently blind
  // on roughly a third of the days in each month.
  const compactRaw = /^\d{7,8}$/.test(raw) ? raw.padStart(8, "0") : raw;
  const compact = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(compactRaw);
  if (compact) {
    const d = Number(compact[1]);
    const mo = Number(compact[2]);
    const hh = Number(compact[3]);
    const mi = Number(compact[4]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || hh > 23 || mi > 59) return null;
    day = d;
    month = mo;
    afterCloseOverride = hh * 60 + mi >= MARKET_CLOSE_MINUTE;
    const anchor = session ?? getNewYorkReportSessionYmd();
    if (afterCloseOverride) {
      const prev = getNewYorkPrevTradingMonthDay(anchor);
      return month === prev.month && day === prev.day;
    }
    return month === anchor.month && day === anchor.day;
  }

  const iso = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(raw);
  if (iso) {
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const slash = /(^|\D)(\d{1,2})[./-](\d{1,2})(?=\D|$)/.exec(raw);
    if (slash) {
      const left = Number(slash[2]);
      const right = Number(slash[3]);
      // Live data is day-first ("28/07 AMC"). Flip to month-first only when the right-hand number
      // is too large to be a month.
      day = left;
      month = right;
      if (left <= 12 && right > 12) {
        month = left;
        day = right;
      }
    }
  }

  if (month == null || day == null) return null;

  if (afterCloseOverride ?? isAfterCloseRelease(raw)) {
    // An after-close release belongs to the next trading day, so it is relevant today only when
    // dated the previous trading day. Today's own after-close report lands after today's close and
    // cannot move today's session.
    const prev = getNewYorkPrevTradingMonthDay(session ?? getNewYorkReportSessionYmd());
    return month === prev.month && day === prev.day;
  }

  // BMO / intraday / unqualified: belongs to its own day.
  const anchor = session ?? getNewYorkReportSessionYmd();
  return month === anchor.month && day === anchor.day;
}
