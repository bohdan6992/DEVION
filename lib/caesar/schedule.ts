// lib/caesar/schedule.ts
//
// The Caesar trading-day model: one 24h axis that starts at 21:00 NY (not midnight), the session
// segments drawn on it, and the strategy-per-segment plan the user edits.
//
// Two coordinate systems live here, and mixing them up is the easy bug:
//
//   axis minutes   0 .. 1440, measured from 21:00 NY. Only used for drawing.
//   minute index   -180 .. 1259, minute-of-day NY where negatives count back into the previous
//                  calendar day (-180 = 21:00). This is the convention the scanner strategies
//                  already use (`ScannerStrategy.tradingWindow`, TapeArbClasses.PreFrom), so
//                  strategy windows are compared in this space, never in axis space.
//
// The offset between them is exactly DAY_START_HOUR * 60 - 1440 = -180.

import { STRATEGY_CATALOG, STRATEGY_BY_KEY } from "@/lib/strategyCatalog";
import { LIVE_STRATEGY_LIST } from "@/lib/strategies/registry";

export const DAY_START_HOUR = 21;
export const DAY_MINUTES = 24 * 60;

/** minuteIdx of axis minute 0. Negative because 21:00 belongs to the previous calendar day. */
export const AXIS_ORIGIN_MINUTE_IDX = DAY_START_HOUR * 60 - DAY_MINUTES; // -180

/** Wall-clock NY time -> axis minutes since 21:00. `axisMinutes(21) === 0`. */
export function axisMinutes(hour: number, minute = 0): number {
  return (((hour - DAY_START_HOUR) * 60 + minute) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
}

/** Axis minutes -> "HH:MM" NY. 0 and 1440 both render as "21:00" — the axis is a closed loop. */
export function clockLabel(axisMin: number): string {
  const abs = ((Math.round(axisMin) + DAY_START_HOUR * 60) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Axis minutes -> minuteIdx, the space strategy trading windows are expressed in. */
export function axisToMinuteIdx(axisMin: number): number {
  return axisMin + AXIS_ORIGIN_MINUTE_IDX;
}

/** minuteIdx -> "HH:MM" NY, for rendering a strategy's `tradingWindow` bounds. */
export function minuteIdxLabel(minuteIdx: number): string {
  return clockLabel(minuteIdx - AXIS_ORIGIN_MINUTE_IDX);
}

/** Axis minutes -> percentage across the 24h ruler. */
export function axisPct(axisMin: number): number {
  return (axisMin / DAY_MINUTES) * 100;
}

// =========================
// SEGMENTS
// =========================

export type CaesarSegmentKey = "pre" | "open" | "intra" | "post";

export type CaesarBand = {
  fromMin: number;
  toMin: number;
  color: string;
  /**
   * Name drawn inside the band. PRE splits into BLUE and ARK — both are real Arbitrage rating
   * classes (see `ratingClasses.keys` in components/scanner/ArbitrageScanner.tsx), not decoration.
   * A single-band segment repeats the segment label.
   */
  label: string;
};

export type CaesarSegment = {
  key: CaesarSegmentKey;
  label: string;
  fromMin: number;
  toMin: number;
  /** Colour for the card, connector and legend. For PRE this is the first band's colour. */
  color: string;
  /**
   * Colour sub-ranges inside the segment. PRE is one segment for scheduling purposes but is drawn
   * in two colours (the overnight stretch vs. the european/early pre-market run-up), so a segment
   * has bands rather than a single fill.
   */
  bands: CaesarBand[];
  hint: string;
};

const GREEN = "#34d399";
const YELLOW = "#facc15";
const RED = "#ef4444";
const ORANGE = "#f97316";
const VIOLET = "#a855f7";

export const CAESAR_SEGMENTS: readonly CaesarSegment[] = [
  {
    key: "pre",
    label: "PRE",
    fromMin: axisMinutes(21, 0), // 0
    toMin: axisMinutes(9, 0), // 720
    color: GREEN,
    bands: [
      { fromMin: axisMinutes(21, 0), toMin: axisMinutes(4, 0), color: GREEN, label: "BLUE" },
      { fromMin: axisMinutes(4, 0), toMin: axisMinutes(9, 0), color: YELLOW, label: "ARK" },
    ],
    hint: "Overnight 21:00–04:00, early pre-market 04:00–09:00",
  },
  {
    key: "open",
    label: "OPEN",
    fromMin: axisMinutes(9, 0),
    toMin: axisMinutes(10, 0),
    color: RED,
    bands: [{ fromMin: axisMinutes(9, 0), toMin: axisMinutes(10, 0), color: RED, label: "OPEN" }],
    hint: "Run-up into the bell and the first 30 minutes of the regular session",
  },
  {
    key: "intra",
    label: "INTRA",
    fromMin: axisMinutes(10, 0),
    toMin: axisMinutes(16, 0),
    color: ORANGE,
    bands: [{ fromMin: axisMinutes(10, 0), toMin: axisMinutes(16, 0), color: ORANGE, label: "INTRA" }],
    hint: "Regular session body, 10:00 to the close",
  },
  {
    key: "post",
    label: "POST",
    fromMin: axisMinutes(16, 0),
    toMin: DAY_MINUTES, // 21:00 — the axis end, not axisMinutes(21) which wraps to 0
    color: VIOLET,
    bands: [{ fromMin: axisMinutes(16, 0), toMin: DAY_MINUTES, color: VIOLET, label: "POST" }],
    hint: "After-hours through to the 21:00 roll into the next trading day",
  },
] as const;

export const SEGMENT_BY_KEY = Object.fromEntries(
  CAESAR_SEGMENTS.map((s) => [s.key, s])
) as Record<CaesarSegmentKey, CaesarSegment>;

export function segmentRangeLabel(seg: CaesarSegment): string {
  return `${clockLabel(seg.fromMin)} – ${clockLabel(seg.toMin)}`;
}

/** The segment's span in minuteIdx space, for comparison against strategy trading windows. */
export function segmentMinuteIdxRange(seg: CaesarSegment): { from: number; to: number } {
  return { from: axisToMinuteIdx(seg.fromMin), to: axisToMinuteIdx(seg.toMin) };
}

// =========================
// STRATEGIES
// =========================

export type CaesarStrategyNav = {
  stream: string;
  scanner: string;
  sonar: string;
};

export type CaesarStrategy = {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** Routes for a strategy that has a running stream. `null` while it is still catalog-only. */
  nav: CaesarStrategyNav | null;
  /**
   * Identity the BRIDGE knows this strategy by (`StreamInstance.strategyId`), which is not the
   * catalog key: the UI says "opendoor", the bridge says "stream.opendoor". The schedule is keyed
   * on this, so a strategy without one cannot be scheduled — it has no engine to start.
   */
  bridgeStrategyId: string | null;
  /**
   * The minuteIdx window the strategy can hold a position in, mirrored from its
   * `defineScannerStrategy({ tradingWindow })`. `null` when the strategy has no engine yet.
   *
   * Half-open: [fromMinuteIdx, toMinuteIdx). The scanner descriptors are not consistent about this
   * — Arbitrage writes an inclusive 1199 (19:59) while OpenDoor writes an exclusive 600 (10:00) —
   * so the registry below normalises both to exclusive. Without that, OpenDoor's 600 would overlap
   * INTRA by one minute and the segment would be reported as partially covered when it is not
   * covered at all.
   */
  window: { fromMinuteIdx: number; toMinuteIdx: number } | null;
  /**
   * The tie-breaker the bridge uses when two strategies claim the same ticker on the same minute
   * boundary — HIGHER WINS. Mirrors the `strategyPriority` prop each stream page passes.
   */
  defaultPriority: number;
};

/**
 * Live-surface strategies, read from the single registry in lib/strategies/registry.ts.
 *
 * This used to be a hand-maintained LIVE_STRATEGIES map here, with a comment asking whoever edited
 * a strategy to keep nav, window and priority in sync with the scanner descriptor and the stream
 * page. It did not stay in sync: Arbitrage's window was 1200 here and 1199 in the descriptor, and
 * `nav.sonar` pointed at `/sonar` — BridgeSonarSignals, not the Arbitrage Sonar.
 *
 * Caesar is the surface that will launch the streams of several strategies at once, so it must not
 * be reading a second-hand copy of what a strategy is.
 */
const LIVE_STRATEGIES: Record<
  string,
  {
    nav: CaesarStrategyNav;
    bridgeStrategyId: string;
    window: { fromMinuteIdx: number; toMinuteIdx: number };
    defaultPriority: number;
  }
> = Object.fromEntries(
  LIVE_STRATEGY_LIST.map((s) => [
    s.key,
    {
      nav: s.nav,
      bridgeStrategyId: s.bridgeStrategyId,
      // Already half-open in the registry — no per-strategy normalisation left to get wrong.
      window: s.tradingWindow,
      defaultPriority: s.priority,
    },
  ])
);

export const CAESAR_STRATEGIES: readonly CaesarStrategy[] = STRATEGY_CATALOG.map((meta) => {
  const live = LIVE_STRATEGIES[meta.key];
  return {
    key: meta.key,
    name: meta.name,
    icon: meta.icon ?? "•",
    description: meta.description,
    nav: live?.nav ?? null,
    bridgeStrategyId: live?.bridgeStrategyId ?? null,
    window: live?.window ?? null,
    defaultPriority: live?.defaultPriority ?? 10,
  };
});

export const CAESAR_STRATEGY_BY_KEY = Object.fromEntries(
  CAESAR_STRATEGIES.map((s) => [s.key, s])
) as Record<string, CaesarStrategy>;

export function strategyLabel(key: string): string {
  return CAESAR_STRATEGY_BY_KEY[key]?.name ?? STRATEGY_BY_KEY[key]?.name ?? key;
}

export type WindowFit = "full" | "partial" | "none" | "unknown";

/**
 * How much of `seg` the strategy's trading window actually covers. A strategy can be scheduled on
 * a segment its engine never trades in — that is a planning mistake worth surfacing, not an error.
 */
export function windowFit(strategy: CaesarStrategy, seg: CaesarSegment): WindowFit {
  if (!strategy.window) return "unknown";
  const { from, to } = segmentMinuteIdxRange(seg);
  const w = strategy.window;
  // Both ranges are half-open, see the `window` field docs.
  const overlap = Math.min(to, w.toMinuteIdx) - Math.max(from, w.fromMinuteIdx);
  if (overlap <= 0) return "none";
  return overlap >= to - from ? "full" : "partial";
}

// =========================
// PLAN
// =========================

export type CaesarAssignment = {
  strategyKey: string;
  /** HIGHER WINS, same semantics as `strategyPriority` on the stream pages. */
  priority: number;
  enabled: boolean;
};

export type CaesarPlan = Record<CaesarSegmentKey, CaesarAssignment[]>;

export const CAESAR_PLAN_LS_KEY = "caesar.plan.v1";

export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 999;
export const PRIORITY_STEP = 5;

export function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return MIN_PRIORITY;
  return Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, Math.round(value)));
}

/**
 * The plan that reproduces what the app does today: Arbitrage runs the whole session at 100,
 * OpenDoor only touches the open at 50.
 */
export function defaultCaesarPlan(): CaesarPlan {
  return {
    pre: [{ strategyKey: "arbitrage", priority: 100, enabled: true }],
    open: [
      { strategyKey: "arbitrage", priority: 100, enabled: true },
      { strategyKey: "opendoor", priority: 50, enabled: true },
    ],
    intra: [{ strategyKey: "arbitrage", priority: 100, enabled: true }],
    post: [{ strategyKey: "arbitrage", priority: 100, enabled: true }],
  };
}

function sanitizeAssignments(raw: unknown): CaesarAssignment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CaesarAssignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const key = String((item as any).strategyKey ?? "");
    // Drop strategies that have since left the catalog, and collapse duplicates — a segment holds
    // at most one row per strategy so priority stays unambiguous.
    if (!key || !CAESAR_STRATEGY_BY_KEY[key] || seen.has(key)) continue;
    seen.add(key);
    out.push({
      strategyKey: key,
      priority: clampPriority(Number((item as any).priority)),
      enabled: (item as any).enabled !== false,
    });
  }
  return out;
}

export function sanitizeCaesarPlan(raw: unknown): CaesarPlan {
  const base = defaultCaesarPlan();
  if (!raw || typeof raw !== "object") return base;
  const out = {} as CaesarPlan;
  for (const seg of CAESAR_SEGMENTS) {
    out[seg.key] = sanitizeAssignments((raw as any)[seg.key]);
  }
  return out;
}

export function loadCaesarPlan(): CaesarPlan {
  if (typeof window === "undefined") return defaultCaesarPlan();
  try {
    const raw = window.localStorage.getItem(CAESAR_PLAN_LS_KEY);
    if (!raw) return defaultCaesarPlan();
    return sanitizeCaesarPlan(JSON.parse(raw));
  } catch {
    return defaultCaesarPlan();
  }
}

export function saveCaesarPlan(plan: CaesarPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAESAR_PLAN_LS_KEY, JSON.stringify(plan));
  } catch {
    /* quota or private mode — the plan just does not persist */
  }
}

/**
 * Assignments in resolution order: highest priority first, so index 0 is the strategy that wins a
 * contested ticker. Disabled rows sink to the bottom; ties break on strategy name for stability.
 */
export function rankAssignments(assignments: CaesarAssignment[]): CaesarAssignment[] {
  return [...assignments].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return strategyLabel(a.strategyKey).localeCompare(strategyLabel(b.strategyKey));
  });
}

/** Priorities that appear more than once in a segment — the bridge cannot break those ties. */
export function conflictingPriorities(assignments: CaesarAssignment[]): Set<number> {
  const counts = new Map<number, number>();
  for (const a of assignments) {
    if (!a.enabled) continue;
    counts.set(a.priority, (counts.get(a.priority) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const [priority, count] of counts) if (count > 1) out.add(priority);
  return out;
}

/** Current NY wall clock as axis minutes, for the "now" marker. */
export function nyAxisMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return axisMinutes(h, m);
}

export function segmentAtAxisMinute(axisMin: number): CaesarSegment | null {
  return CAESAR_SEGMENTS.find((s) => axisMin >= s.fromMin && axisMin < s.toMin) ?? null;
}
