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

/**
 * Weekend-aware only. US market holidays are NOT handled: on the session after a holiday this
 * steps back to the holiday itself rather than to the last real trading day, so an AMC report from
 * the true previous session would be missed. Wiring a market calendar in here is the proper fix.
 */
export function getNewYorkPrevTradingMonthDay(): { month: number; day: number } {
  const { year, month, day } = getNewYorkYmd();
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
  const raw = pickReportValue(row);

  const byDate = parseReportDateAffectsTodaySession(raw);
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
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let month: number | null = null;
  let day: number | null = null;
  // null = decide from the text (AMC/BMO token or an HH:MM); set explicitly by the compact form.
  let afterCloseOverride: boolean | null = null;

  // Bulk of the live feed uses a separator-less DDMMHHMM stamp — "29070800" is 29/07 08:00 and
  // "28071600" is 28/07 16:00. It carries no AMC/BMO token and no colon, so every other branch
  // here misses it and the report silently reads as "none".
  const compact = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (compact) {
    const d = Number(compact[1]);
    const mo = Number(compact[2]);
    const hh = Number(compact[3]);
    const mi = Number(compact[4]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || hh > 23 || mi > 59) return null;
    day = d;
    month = mo;
    afterCloseOverride = hh * 60 + mi >= MARKET_CLOSE_MINUTE;
    const today = getNewYorkMonthDay();
    if (afterCloseOverride) {
      const prev = getNewYorkPrevTradingMonthDay();
      return month === prev.month && day === prev.day;
    }
    return month === today.month && day === today.day;
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
    const prev = getNewYorkPrevTradingMonthDay();
    return month === prev.month && day === prev.day;
  }

  // BMO / intraday / unqualified: belongs to its own day.
  const today = getNewYorkMonthDay();
  return month === today.month && day === today.day;
}
