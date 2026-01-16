// lib/time.ts

export function todayNyYmd(): string {
  // "YYYY-MM-DD" in New York timezone
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function fmtNyTime(ts: string | undefined | null): string {
  if (!ts) return "—";

  // If backend already returns "HH:mm:ss" or similar, keep as-is
  // Try ISO parse; if fails, return original string
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;

  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

