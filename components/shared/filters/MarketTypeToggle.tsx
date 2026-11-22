"use client";

import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { MARKET_TYPES, type MarketTypeKey, type MarketTypeMeta } from "../../../lib/marketType";

/**
 * The MARKET TYPE strip: keep only the days of the chosen type(s). One or several at once; FULL (the
 * default) means no restriction.
 *
 * ICONS, NOT WORDS (the operator's own instruction, 2026-11-22): a row of four-letter abbreviations
 * (PNIC / ROFF / RION ...) had to be decoded, while the picture of what the market did reads at a
 * glance - a crash, a slide, a flat line, a climb. Each type keeps its own hue, and the same line-icon
 * language as the STREAM / SCANNER / SONAR nav (stroke 2, round caps). The full name and meaning are
 * the tooltip, and `aria-label` carries the key, so nothing is lost for a screen reader.
 *
 * Secondary Button Standard (AGENTS.md): one shared `h-7` container, the standard pill classes. A
 * SELECTED type keeps its own hue (brighter, on a lifted fill) instead of the page's accent, because
 * with nine icons the colour is how you tell which ones are on.
 *
 * Selecting every type is normalised back to FULL: it is the same set of days, and two spellings of
 * one answer is how a filter ends up looking active while rejecting nothing.
 *
 * TOOLTIPS are our own card, not the browser's `title` bubble: the app's glass surface (GlassCard:
 * `bg-[#0a0a0a]` + `backdrop-blur-xl`, `rounded-2xl`; a little more opaque for legibility; mono uppercase title,
 * mono body) with the border and soft shadow in the
 * type's own hue. It is rendered through a portal and positioned from the button's rect, clamped to the
 * viewport - a toolbar clips or transforms anything drawn inside it, and the last icons sit at the right edge.
 *
 * `meta` is whatever the bridge last said about the range (see lib/marketType.ts). It only drives the
 * tooltip counts and dims a pill that would bring in zero days; it never changes what a click does.
 */
const SVG = {
  "aria-hidden": true as const,
  width: "14",
  height: "14",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<MarketTypeKey, React.ReactNode> = {
  // a crash: a jagged line that falls off a cliff, with the arrowhead
  PANIC: (
    <svg {...SVG} className="shrink-0">
      <path d="M3 4 9 12l4-3 8 11" />
      <path d="M21 14v6h-6" />
    </svg>
  ),
  // a steady slide down (trending-down)
  RISK_OFF: (
    <svg {...SVG} className="shrink-0">
      <path d="m22 17-8.5-8.5-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  ),
  // no clear direction: a line that keeps changing its mind
  MIXED: (
    <svg {...SVG} className="shrink-0">
      <path d="M3 12 7 6l4 12 4-10 3 6 3-2" />
    </svg>
  ),
  // protection being bought: a shield
  HEDGE_BID: (
    <svg {...SVG} className="shrink-0">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    </svg>
  ),
  // flat: a straight line with its end ticks
  QUIET: (
    <svg {...SVG} className="shrink-0">
      <path d="M3 12h18" />
      <path d="M3 9v6M21 9v6" />
    </svg>
  ),
  // volatility draining out: an arrow pressed into a floor
  VOL_CRUSH: (
    <svg {...SVG} className="shrink-0">
      <path d="M12 3v13" />
      <path d="m6 11 6 6 6-6" />
      <path d="M5 21h14" />
    </svg>
  ),
  // a steady climb (trending-up)
  RISK_ON: (
    <svg {...SVG} className="shrink-0">
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  ),
  // a spike up: a steep line that shoots off the top
  EUPHORIA: (
    <svg {...SVG} className="shrink-0">
      <path d="M3 20 9 12l4 3 8-11" />
      <path d="M15 4h6v6" />
    </svg>
  ),
  // nobody measured it
  UNKNOWN: (
    <svg {...SVG} className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9.2a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.3" />
      <path d="M12 17.6h.01" />
    </svg>
  ),
};

/** FULL: every type at once - the "all bars" glyph the ACTIVE / INACTIVE / ALL strip uses. */
const FULL_ICON = (
  <svg {...SVG} className="shrink-0">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const TIP_W = 288;

/** Mean SPY / QQQ / VXX move vs last close at 09:19 ET (in percent) over the days of one type - GET /api/market-type/summary. */
export type MarketTypePctStats = Record<string, { days: number; spy: number | null; qqq: number | null; vxx: number | null }>;

const fmtPct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);

type Tip = { title: string; body: string; pct?: string; footer?: string; tone: string; glow: string; left: number; top: number };

/** What one type's tooltip says: its name, what it means (the hint minus its own "NAME - " prefix), the count. */
function tipFor(t: (typeof MARKET_TYPES)[number], n: number | undefined, total: number, stats?: MarketTypePctStats | null): Omit<Tip, "left" | "top"> {
  const st = stats?.[t.key];
  return {
    pct: st && st.days > 0 ? `avg of ${st.days} days · SPY ${fmtPct(st.spy)} · QQQ ${fmtPct(st.qqq)} · VXX ${fmtPct(st.vxx)}` : undefined,
    title: t.key.replace(/_/g, " "),
    body: t.hint.replace(/^[A-Z_]+ - /, ""),
    footer: total > 0 ? `${n ?? 0} of ${total} days in this range` : undefined,
    tone: t.toneOn,
    glow: t.glow,
  };
}

function TipCard({ tip }: { tip: Tip }) {
  return (
    <div
      role="tooltip"
      className={clsx("pointer-events-none rounded-2xl border bg-[#0a0a0a]/70 px-3.5 py-2.5 backdrop-blur-xl", tip.glow)}
      // position/z-index INLINE: themes.css forces `position: relative; z-index: 1` on every direct child
      // of <body>, which beats the `fixed` / `z-*` classes (see GlobalTooltip).
      style={{ position: "fixed", zIndex: 2147483000, left: tip.left, top: tip.top, width: TIP_W }}
    >
      <div className={clsx("text-[10px] font-mono font-bold uppercase tracking-[0.16em]", tip.tone)}>{tip.title}</div>
      <div className="mt-1 text-[11px] font-mono leading-snug text-zinc-400">{tip.body}</div>
      {tip.pct ? <div className="mt-1.5 text-[10px] font-mono text-zinc-300">{tip.pct}</div> : null}
      {tip.footer ? <div className="mt-1.5 text-[10px] font-mono text-zinc-500">{tip.footer}</div> : null}
      <div className="mt-1.5 border-t border-white/5 pt-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-600">
        09:19 ET &middot; SPY QQQ VXX &middot; size, not direction
      </div>
    </div>
  );
}

export function MarketTypeToggle({
  value,
  onChange,
  meta,
  stats,
  className,
}: {
  value: readonly MarketTypeKey[];
  onChange: (next: MarketTypeKey[]) => void;
  meta?: MarketTypeMeta | null;
  stats?: MarketTypePctStats | null;
  className?: string;
}) {
  const chosen = React.useMemo(() => new Set<string>(value), [value]);
  const allActive = chosen.size === 0;

  const toggle = (key: MarketTypeKey) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Every type chosen = no restriction at all.
    if (next.size >= MARKET_TYPES.length) {
      onChange([]);
      return;
    }
    onChange(MARKET_TYPES.filter((t) => next.has(t.key)).map((t) => t.key));
  };

  const total = meta?.totalDays ?? 0;
  const matched = meta?.matchedDays ?? 0;

  const [tip, setTip] = React.useState<Tip | null>(null);
  const show = (el: HTMLElement, data: Omit<Tip, "left" | "top">) => {
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - TIP_W - 8, r.left + r.width / 2 - TIP_W / 2));
    setTip({ ...data, left, top: r.bottom + 8 });
  };
  const hide = () => setTip(null);
  // A tooltip left behind by a re-render or a scroll would point at nothing.
  React.useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip]);

  return (
    <>
    <div
      // bg-black/45 = the MINRATE / MINTOTAL boxes' fill (the operator asked for this strip to match them); the
      // other Secondary Button Standard strips use bg-black/20.
      className={clsx("flex h-7 items-center gap-1 rounded-lg bg-black/45", className)}
      role="group"
      aria-label="Market type: show only days of the chosen type"
    >
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={allActive}
        aria-label="FULL: every day, no market-type restriction"
        onMouseEnter={(e) => show(e.currentTarget, {
          title: "FULL", body: "Every day - no market-type restriction.",
          footer: meta && total > 0 ? `${matched} of ${total} days shown` : undefined,
          tone: "text-zinc-200", glow: "border-white/15 shadow-[0_10px_30px_rgba(255,255,255,0.06)]",
        })}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget, {
          title: "FULL", body: "Every day - no market-type restriction.",
          footer: meta && total > 0 ? `${matched} of ${total} days shown` : undefined,
          tone: "text-zinc-200", glow: "border-white/15 shadow-[0_10px_30px_rgba(255,255,255,0.06)]",
        })}
        onBlur={hide}
        className={clsx(
          "inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg transition-all border",
          allActive ? "accent-soft" : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
        )}
      >
        {FULL_ICON}
      </button>
      {MARKET_TYPES.map((t) => {
        const on = chosen.has(t.key);
        const n = meta?.counts?.[t.key];
        const empty = meta != null && total > 0 && n === 0;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => toggle(t.key)}
            aria-pressed={on}
            aria-label={t.key}
            onMouseEnter={(e) => show(e.currentTarget, tipFor(t, n, total, stats))}
            onMouseLeave={hide}
            onFocus={(e) => show(e.currentTarget, tipFor(t, n, total, stats))}
            onBlur={hide}
            className={clsx(
              "inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg transition-all border",
              on
                ? clsx("border-white/20 bg-white/10", t.toneOn)
                : clsx("border-transparent hover:bg-white/5", t.tone),
              empty && !on && "opacity-40"
            )}
          >
            {ICONS[t.key]}
          </button>
        );
      })}
    </div>
    {tip && typeof document !== "undefined" ? createPortal(<TipCard tip={tip} />, document.body) : null}
    </>
  );
}
