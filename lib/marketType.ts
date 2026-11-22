/**
 * MARKET TYPE of a session - the label the bridge reads from the tape at 09:19 ET from how far SPY,
 * QQQ and VXX stand from their last close (MarketTypeClassifier.cs owns the definition and the
 * bands; this file only names the labels for the UI).
 *
 * Measured on 686 sessions, the label does NOT predict which way the market goes after the open - it
 * predicts HOW FAR it goes (rest-of-day sigma 0.56 QUIET .. 1.25 EUPHORIA vs 0.82 overall). So it is
 * a volatility-regime selector for a strategy's days, not a directional signal. The tooltips below
 * say this in the one place a reader sees it, because the pill names alone read as direction.
 *
 * `UNKNOWN` is a real bucket (the tape missed the pre-open minutes, so nobody measured the session)
 * and is never folded into QUIET.
 */
export type MarketTypeKey =
  | "PANIC"
  | "RISK_OFF"
  | "MIXED"
  | "HEDGE_BID"
  | "QUIET"
  | "VOL_CRUSH"
  | "RISK_ON"
  | "EUPHORIA"
  | "UNKNOWN";

export type MarketTypeInfo = {
  key: MarketTypeKey;
  /** FOUR characters, like the ASOF / EXPO / LIVE / CORE strip beside it, so the row reads as equal-width words. The full name is the tooltip. */
  label: string;
  /** Inactive icon colour - each type keeps its own hue, as the toolbar's other strips do. */
  tone: string;
  /** Same hue, brighter, for the selected state (a selected pill must still say WHICH type it is). */
  toneOn: string;
  /** Border + soft shadow of the tooltip card, in the type's own hue (same recipe as the chart tooltips). */
  glow: string;
  /** Full meaning, shown as the tooltip. */
  hint: string;
};

/** Bearish to bullish, then UNKNOWN - the order the pills are drawn in. */
export const MARKET_TYPES: readonly MarketTypeInfo[] = [
  {
    key: "PANIC",
    label: "PNIC",
    tone: "text-[#f3a6b2]/80 hover:text-[#f3a6b2]",
    toneOn: "text-[#f3a6b2]",
    glow: "border-[#f3a6b2]/25 shadow-[0_10px_30px_rgba(243,166,178,0.14)]",
    hint: "PANIC - equities anomalously LOW (SPY/QQQ <= -2 sigma on average) and VXX bid hard (>= +1.5 sigma). Rare (~5% of sessions) and the widest-ranging days.",
  },
  {
    key: "RISK_OFF",
    label: "ROFF",
    tone: "text-orange-300/80 hover:text-orange-200",
    toneOn: "text-orange-200",
    glow: "border-orange-400/25 shadow-[0_10px_30px_rgba(251,146,60,0.14)]",
    hint: "RISK_OFF - equities down (<= -0.5 sigma) and VXX up (>= +0.5 sigma). The two agree the market is under pressure.",
  },
  {
    key: "MIXED",
    label: "MIXD",
    tone: "text-zinc-400 hover:text-white",
    toneOn: "text-zinc-100",
    glow: "border-zinc-400/25 shadow-[0_10px_30px_rgba(161,161,170,0.14)]",
    hint: "MIXED - the three do not line up, or the move is middling: equities and VXX disagree, or only one of them moved.",
  },
  {
    key: "HEDGE_BID",
    label: "HEDG",
    tone: "text-sky-300/80 hover:text-sky-200",
    toneOn: "text-sky-200",
    glow: "border-sky-400/25 shadow-[0_10px_30px_rgba(56,189,248,0.14)]",
    hint: "HEDGE_BID - equities flat but VXX bid (>= +1 sigma): someone is buying protection into a quiet tape. Rare (~1%), so any result cut by it is thin.",
  },
  {
    key: "QUIET",
    label: "CALM",
    tone: "text-[#6ee7b7]/80 hover:text-[#6ee7b7]",
    toneOn: "text-[#6ee7b7]",
    glow: "border-[#6ee7b7]/25 shadow-[0_10px_30px_rgba(110,231,183,0.14)]",
    hint: "QUIET - near zero on all three (|equities| < 0.5 sigma, |VXX| < 0.5 sigma). The narrowest-ranging days: rest-of-day sigma 0.56 vs 0.82 overall.",
  },
  {
    key: "VOL_CRUSH",
    label: "CRSH",
    tone: "text-violet-300/80 hover:text-violet-200",
    toneOn: "text-violet-200",
    glow: "border-violet-400/25 shadow-[0_10px_30px_rgba(167,139,250,0.14)]",
    hint: "VOL_CRUSH - equities flat but VXX sold (<= -1 sigma): volatility is draining out of a flat tape. Rare (~1%), so any result cut by it is thin.",
  },
  {
    key: "RISK_ON",
    label: "RION",
    tone: "text-emerald-300/80 hover:text-emerald-200",
    toneOn: "text-emerald-200",
    glow: "border-emerald-400/25 shadow-[0_10px_30px_rgba(52,211,153,0.14)]",
    hint: "RISK_ON - equities up (>= +0.5 sigma) and VXX down (<= -0.5 sigma). The two agree the market is easing.",
  },
  {
    key: "EUPHORIA",
    label: "EUPH",
    tone: "text-yellow-300/80 hover:text-yellow-200",
    toneOn: "text-yellow-200",
    glow: "border-yellow-400/25 shadow-[0_10px_30px_rgba(250,204,21,0.14)]",
    hint: "EUPHORIA - equities anomalously HIGH (>= +2 sigma on average) with VXX sold (<= -0.5 sigma). Rare (~5%) and wide-ranging, like PANIC.",
  },
  {
    key: "UNKNOWN",
    label: "UNKN",
    tone: "text-zinc-500 hover:text-zinc-300",
    toneOn: "text-zinc-200",
    glow: "border-zinc-500/25 shadow-[0_10px_30px_rgba(113,113,122,0.14)]",
    hint: "UNKNOWN - the tape has no pre-open minute (09:16-09:19) for this session, or one of SPY/QQQ/VXX had no print. Not the same as QUIET: nobody measured it.",
  },
] as const;

const KEYS: ReadonlySet<string> = new Set(MARKET_TYPES.map((t) => t.key));

/** Loose spellings in, canonical keys out; anything unrecognised is dropped. Order follows MARKET_TYPES. */
export function parseMarketTypes(v: unknown): MarketTypeKey[] {
  if (!Array.isArray(v)) return [];
  const want = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const k = x.trim().replace(/[\s-]+/g, "_").toUpperCase();
    if (KEYS.has(k)) want.add(k);
  }
  return MARKET_TYPES.filter((t) => want.has(t.key)).map((t) => t.key);
}

/**
 * What the bridge says about the range it just answered. `counts` is over EVERY day in the range
 * (before the choice is applied), so a pill can say how many days it would bring in.
 */
export type MarketTypeMeta = {
  selected: string[] | null;
  counts: Record<string, number>;
  matchedDays: number;
  totalDays: number;
  byDay: Record<string, string>;
  anchor: string;
};

export function parseMarketTypeMeta(j: unknown): MarketTypeMeta | null {
  const m = (j as any)?.marketTypes;
  if (!m || typeof m !== "object") return null;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.counts ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n)) counts[k] = n;
  }
  const byDay: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.byDay ?? {})) if (typeof v === "string") byDay[k] = v;
  return {
    selected: Array.isArray(m.selected) ? m.selected.filter((x: unknown): x is string => typeof x === "string") : null,
    counts,
    matchedDays: Number.isFinite(Number(m.matchedDays)) ? Number(m.matchedDays) : 0,
    totalDays: Number.isFinite(Number(m.totalDays)) ? Number(m.totalDays) : 0,
    byDay,
    anchor: typeof m.anchor === "string" ? m.anchor : "09:19",
  };
}
