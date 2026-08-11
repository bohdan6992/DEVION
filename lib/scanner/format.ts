import type { PaperArbSession, PaperArbSizingMode, TapeArbSide } from "./types";

// =========================
// UTILS
// =========================
export function isNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined) return "-";
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(digits);
}

export function numSpaced(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined) return "-";
  if (!Number.isFinite(x)) return "-";
  const fixed = x.toFixed(digits);
  const [intPart, fracPart] = fixed.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const absInt = sign ? intPart.slice(1) : intPart;
  const grouped = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fracPart != null ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`;
}

export function intn(x: number | null | undefined): string {
  if (x === null || x === undefined) return "-";
  if (!Number.isFinite(x)) return "-";
  return String(Math.trunc(x));
}

export function numOrNull(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function optNumOrNull(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const normalized = typeof v === "string" ? v.trim().replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function minuteIdxToClockLabel(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  const idx = Math.trunc(x);
  const totalMin = idx; // absolute NY minute-of-day, e.g. 570 => 09:30
  const hh = Math.floor((((totalMin % 1440) + 1440) % 1440) / 60)
    .toString()
    .padStart(2, "0");
  const mm = ((((totalMin % 1440) + 1440) % 1440) % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function clampInt(x: any, def = 0) {
  const v = Number(x);
  if (!Number.isFinite(v)) return def;
  return Math.trunc(v);
}

export function clampNumber(x: any, def = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : def;
}

export function normalizeScannerSizeValue(mode: PaperArbSizingMode, value: number | null | undefined) {
  const raw = Math.abs(clampNumber(value, mode === "Tier" ? 1 : 1000));
  if (mode === "Tier") return Math.max(1, Math.round(raw));
  return Math.max(1000, Math.round(raw / 1000) * 1000);
}

export function stepScannerSizeValue(mode: PaperArbSizingMode, value: number, delta: number) {
  if (mode === "Tier") return normalizeScannerSizeValue(mode, value + delta);
  return normalizeScannerSizeValue(mode, value + (delta * 1000));
}

export function formatScannerSizeValue(mode: PaperArbSizingMode, value: number) {
  const normalized = normalizeScannerSizeValue(mode, value);
  return mode === "Notional" ? String(Math.trunc(normalized)) : String(Math.trunc(normalized));
}

export function normalizeDilutionStepValue(value: number | null | undefined) {
  const raw = Math.abs(clampNumber(value, 0.3));
  if (raw <= 0) return 0.3;
  return Math.round(raw * 1000) / 1000;
}

export function normalizeMaxAddsValue(value: number | null | undefined) {
  const raw = Math.trunc(clampNumber(value, 3));
  if (!Number.isFinite(raw)) return 3;
  return Math.max(0, Math.min(9, raw));
}

export function stepDilutionStepValue(value: number, delta: number) {
  return normalizeDilutionStepValue(value + (delta * 0.1));
}

export function formatDilutionStepValue(value: number) {
  return normalizeDilutionStepValue(value).toFixed(1).replace(/\.0$/, "");
}

export function splitList(s: string): string[] {
  return (s ?? "")
    .split(/[\s,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function splitListUpper(s: string): string[] {
  return splitList(s).map((x) => x.toUpperCase());
}

export function normalizeTicker(raw: string): string | null {
  const tk = (raw || "").trim().toUpperCase().replace(/"/g, "");
  if (!tk) return null;
  if (!/^[A-Z0-9.\-]+$/.test(tk)) return null;
  return tk;
}

export function parseTickersFromCsv(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];

  const detectDelim = (line: string) =>
    (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";

  const delim = detectDelim(lines[0]);
  const header = lines[0].split(delim).map((x) => x.trim().toLowerCase());
  const tickerIdx = header.findIndex((h) => h === "ticker");
  const start = tickerIdx !== -1 ? 1 : 0;

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((x) => x.trim());
    const raw = tickerIdx !== -1 ? parts[tickerIdx] : parts[0];
    const tk = normalizeTicker(raw || "");
    if (tk) out.push(tk);
  }
  return Array.from(new Set(out));
}

export function tickerKey(x: string | null | undefined): string {
  return String(x ?? "").trim().toUpperCase();
}

export function buildRangeValues(min: number, max: number, step: number): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const st = Math.max(0.0001, step);
  const out: number[] = [];
  for (let v = lo; v <= hi + st * 0.5; v += st) out.push(Number(v.toFixed(4)));
  return Array.from(new Set(out));
}

export function normalizeSide(
  side: TapeArbSide
): { label: "Long" | "Short" | string; isLong: boolean | null } {
  if (side === 0) return { label: "Long", isLong: true };
  if (side === 1) return { label: "Short", isLong: false };
  const s = String(side ?? "").trim();
  const low = s.toLowerCase();
  if (low.includes("long")) return { label: "Long", isLong: true };
  if (low.includes("short")) return { label: "Short", isLong: false };
  return { label: s.length ? s : "-", isLong: null };
}

export function getBestParams(row: any) {
  return row?.best_params ?? row?.bestParams ?? row?.BestParams ?? row?.best_params_row ?? null;
}

export function safeObj(value: any): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function toYmd(d: string) {
  // minimal client guard; server validates too
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export function fmtHms(d: Date | null): string {
  if (!d) return "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function sessionTimeChartRange(session: PaperArbSession): { from: number; to: number } {
  switch (session) {
    case "BLUE":  return { from: 0, to: 239 };
    case "PRE":   return { from: -180, to: 570 }; // 21:00 (prior day) -> 09:30
    case "ARK":   return { from: 241, to: 570 };
    case "OPEN":  return { from: 570, to: 600 };
    case "INTRA": return { from: 600, to: 959 };
    case "POST":  return { from: 960, to: 1199 };
    default:      return { from: 0, to: 1199 };
  }
}
