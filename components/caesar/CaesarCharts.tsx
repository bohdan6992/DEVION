"use client";

/**
 * Two pictures of the segment: what the situations are split into right now, and how they arrived.
 *
 * FORMS. The split is a composition of one whole across a handful of strategies, drawn as a DONUT.
 * A donut is only honest under two conditions and both hold here: at most a handful of segments
 * (Caesar hosts two browser engines and the palette folds a fifth into "Other", so never more than
 * five), and a reading that is "roughly how is the book split", not "is 31% bigger than 29%" — the
 * exact numbers are printed in the legend beside it and in the table behind it, so the arc never
 * has to carry a comparison it cannot make. The hole is not decoration: it holds the total, which
 * is the number actually asked most often, and turns the figure into a stat tile with a breakdown.
 *
 * The arrivals are counts over time, which is a line — one per strategy, on one axis.
 *
 * WHAT "APPEARED" MEANS. The line is the CUMULATIVE count of entries the strategy actually took
 * today, real dispatch or shadow — see ServerStrategyRunner.GetEntryLog on the bridge. This used to
 * read a BROWSER TAB's local action log, on the theory that the bridge engines had nothing of the
 * kind to chart. That was true the day it was written and has not been true since Arbitrage and
 * PairFlux migrated server-side: every strategy Caesar hosts today runs on the bridge, so that
 * source had gone permanently, silently empty — "0 total" forever, not because nothing happened but
 * because nothing was ever asked. Situations that were considered and not taken are counted by the
 * terminal above, not here — this line is about what happened.
 *
 * COLOUR. Categorical, by strategy identity, assigned in fixed order and never cycled: a filter
 * that changes how many strategies are shown must not repaint the survivors. The four dark steps
 * were validated against this surface (#0a0a0a) — lightness band, chroma floor, CVD separation,
 * normal-vision floor and 3:1 contrast all pass. Past four the fifth series folds into "Other"
 * rather than inventing a hue.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import {
  IDENTITY_LAVENDER_HEX,
  IDENTITY_ORANGE_HEX,
  IDENTITY_YELLOW_HEX,
  SOFT_LOSS_MUTED,
  SOFT_LOSS_SOLID,
  SOFT_LOSS_STROKE,
} from "@/components/scanner/shared/styles";

export type CaesarChartsProps = {
  instances: readonly { key: string; instanceId: string; priority: number; overnight?: boolean }[];
  /** Segment bounds on the NY axis (0 = 21:00), for the time scale. */
  fromMin: number | null;
  toMin: number | null;
  /** Minutes since 21:00 right now, for the "now" rule. */
  nowMin: number | null;
};

/**
 * Strategy IDENTITY colours — deliberately excludes mint/emerald and coral/rose. Those two are
 * reserved app-wide for POSITIVE/NEGATIVE (or long/short) — see the SOFT_LOSS_* constants in
 * components/scanner/shared/styles.ts and pnlTone() below. A strategy assigned one of those by
 * coincidence of palette order would read as "this strategy is good/bad" in any chart that also
 * shows a signed total nearby (exactly what LinesChart's legend does), which is not what the
 * colour is there to say. Lavender / orange / cyan / yellow / blue, in that order; OTHER is the
 * fold-over past five strategies.
 */
const SERIES = [IDENTITY_LAVENDER_HEX, IDENTITY_ORANGE_HEX, "#22d3ee", IDENTITY_YELLOW_HEX, "#60a5fa"] as const;
const OTHER = "#818cf8";
/**
 * The OVERNIGHT category's own colour family (Day Two, Reversal — see LiveStrategy.holdsOvernight):
 * strategies that enter at the close and are still held after the 21:00 roll. Fuchsia and a pale
 * orchid — neither is in SERIES, and neither is the mint/coral pair reserved for positive/negative,
 * so on every chart "magenta" reads as "carried overnight" whatever else is on screen.
 */
const OVERNIGHT_SERIES = ["#e879f9", "#f5d0fe"] as const;
const SURFACE = "#0a0a0a";

/**
 * LinesChart-only: the solid Total line is the hero, gold, regardless of sign — sign still reads
 * from valueFmt's own leading "+"/"-". Per-strategy dashed lines keep their own SERIES identity
 * colour (reverted 2026-09-18 — a uniform silver secondary tone made every strategy look alike).
 */
const GOLD_LINE = "#d4af37";
const MAX_SERIES = SERIES.length;

const AXIS = "rgba(255,255,255,0.10)";
/** The empty ring, and the unfilled remainder of a partial one. */
const TRACK = "rgba(255,255,255,0.055)";

/**
 * Shared axis-tick typography for every hand-drawn chart below (LongShortHistogram, LinesChart,
 * the arrivals step chart): same weight, colour, and SIZE, so none of the panels reads at a
 * different scale than its neighbours regardless of which grid row it sits in or how many columns
 * that row splits into. This used to need a hand-picked per-chart correction factor (the arrivals
 * chart scaled this value by a fixed 920/1100, assuming its column was exactly as wide as a
 * LinesChart's) because every chart drew into a FIXED viewBox width (1100, or 920) while its real
 * on-screen width was whatever the surrounding grid column computed — any mismatch between the
 * two left the SVG's default `preserveAspectRatio="xMidYMid meet"` silently rescaling the whole
 * plot, text included, to fit. Two charts in grid rows with a different number of columns (the top
 * row's three vs. the bottom row's two) never had matching column widths, so the correction factor
 * was only ever right for one specific case and visibly wrong for the rest (2026-10-08, reported by
 * the operator from a screenshot). Fixed at the root instead: every chart now measures its own
 * real rendered width via useMeasuredWidth and uses THAT as its viewBox width, so viewBox units
 * equal real screen px on both axes, 1-to-1, for every chart, in every column — no rescaling, so
 * this one constant now applies untouched everywhere.
 */
const AXIS_TICK_FONT_SIZE = 13;
const AXIS_TICK_FILL = "rgba(255,255,255,0.45)";

/**
 * A chart's real rendered width, read off its own <svg> via ResizeObserver instead of a hand-picked
 * constant — see AXIS_TICK_FONT_SIZE's own doc comment for why a fixed viewBox width was the root
 * cause of charts reading at different label scales. Returns `fallback` until the element has
 * mounted and been measured once (a single reflow on first paint, not a visible flash — every chart
 * here already animates its own contents in).
 */
function useMeasuredWidth(ref: React.RefObject<SVGSVGElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

type Point = { min: number; count: number };
type Series = { key: string; color: string; active: number; entered: number; points: Point[]; overnight?: boolean };
type AccountPosition = {
  ticker?: string | null;
  positionBp?: number | null;
  PositionBp?: number | null;
  isFlat?: boolean | null;
};

/** One of the bridge's own tracked positions — see CaesarPlanController's StreamOpenPositionDto. */
type BridgePosition = {
  strategyId: string;
  ticker: string;
  entryDispatched: boolean;
};

type BridgePositionsResponse = { ok: boolean; positions: BridgePosition[] };

/** One entry moment — see ServerStrategyRunner's EntryLogRecord. */
type EntryLogEntry = { atUtc: string; side: string; ticker: string };

/** GET api/stream/caesar/entries: bridge strategy id -> that strategy's own entries today. */
type EntryLogResponse = { ok: boolean; tradingDateNy: string; entries: Record<string, EntryLogEntry[]> };

/** GET api/stream/caesar/pnl-series: see StrategyPnlSeriesService on the bridge. */
type PnlSample = { total: number; situations: number };
type PnlSamplePoint = { atUtc: string; minuteOfDay: number; perStrategy: Record<string, PnlSample> };
type PnlSeriesResponse = { ok: boolean; tradingDateNy: string; points: PnlSamplePoint[] };

/** A generic multi-series line — shared shape for the PnL and average-trade charts. */
type ValuePoint = { min: number; value: number };
type ValueSeries = { key: string; color: string; dashed: boolean; points: ValuePoint[] };

function isAccountActive(position: AccountPosition): boolean {
  if (position.isFlat === true) return false;
  const bp = Number(position.positionBp ?? position.PositionBp ?? 0);
  return Number.isFinite(bp) && bp !== 0;
}

function clockLabel(axisMin: number): string {
  const m = ((Math.round(axisMin) + 21 * 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const NY_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * ms since epoch -> minutes on the NY axis where 0 = 21:00.
 *
 * Read off the NEW YORK wall clock, not the browser's. This used `getHours()`, i.e. the viewer's
 * own zone, which only agrees with the axis (and with the bridge's NY-anchored samples and the
 * "now" marker, both NY) on a machine whose clock is set to New York: opened from any other zone,
 * every entry and every P&L sample slid sideways by the zone offset.
 */
function axisMinuteOf(ts: number): number {
  const parts = NY_CLOCK.formatToParts(new Date(ts));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return ((h * 60 + m) - 21 * 60 + 1440) % 1440;
}

function dist(x0: number, y0: number, x1: number, y1: number): number {
  return Math.hypot(x1 - x0, y1 - y0);
}

/** The point `d` units from (x0,y0) along the segment toward (x1,y1). */
function towards(x0: number, y0: number, x1: number, y1: number, d: number): [number, number] {
  const len = dist(x0, y0, x1, y1);
  if (len <= 1e-6) return [x0, y0];
  const t = Math.min(1, d / len);
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

/**
 * A polyline with every sharp corner eased into a small curve instead — a standard trick for
 * softening a right-angle path without changing where it actually turns: pull back `radius`
 * along each side of the corner, then draw a quadratic curve through the original corner point
 * between those two pulled-back points. Degenerates to plain line segments if radius is 0 or
 * there is nothing to round.
 */
function roundedPolyline(points: readonly [number, number][], radius: number): string {
  if (points.length === 0) return "";
  if (points.length < 3 || radius <= 0) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const r1 = Math.min(radius, dist(x0, y0, x1, y1) / 2);
    const r2 = Math.min(radius, dist(x1, y1, x2, y2) / 2);
    const [ax, ay] = towards(x1, y1, x0, y0, r1);
    const [bx, by] = towards(x1, y1, x2, y2, r2);
    d += ` L ${ax} ${ay} Q ${x1} ${y1} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

// =========================================================================================
// DONUT GEOMETRY
// =========================================================================================

const DONUT_BOX = 240;
/**
 * Rendered size in CSS pixels. See the note in `Donut` on why this is not a class.
 * 413 = 344 * 1.2 — the block grew 20% (operator's own instruction), and this scales the ring with
 * it rather than leaving it floating in newly-blank space. Internal radii (R_OUT/R_IN/GAP_PX/
 * R_HOVER) are in DONUT_BOX's own 240-unit viewBox, not CSS pixels, so they need no change: the SVG
 * scales that viewBox to fill whatever this constant sets, same proportions either way.
 */
const DONUT_PX = 413;
const DONUT_C = DONUT_BOX / 2;
const R_OUT = 96;
const R_IN = 59;
/** How far the hovered wedge grows. Outward only, so the hole — and the total in it — never moves. */
const R_HOVER = 5;
/** The 2px surface gap the mark spec asks for between adjacent fills, expressed as an angle. */
const GAP_PX = 2;

/** 0 rad is 12 o'clock, angles run clockwise — the direction a share is read in. */
function polar(r: number, angle: number): [number, number] {
  return [DONUT_C + r * Math.sin(angle), DONUT_C - r * Math.cos(angle)];
}

/** One annular wedge. Full circles are drawn as a stroked circle instead; see `Donut`. */
function wedgePath(a0: number, a1: number, rIn: number, rOut: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(rOut, a0);
  const [x1o, y1o] = polar(rOut, a1);
  const [x1i, y1i] = polar(rIn, a1);
  const [x0i, y0i] = polar(rIn, a0);
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

type Wedge = { key: string; color: string; active: number; share: number; a0: number; a1: number };

/**
 * The share ring.
 *
 * Everything it shows is also in the legend to its right and the table behind it, so the arc is
 * never the only route to a number — which is what makes the form legal at all.
 */
function Donut({
  series,
  total,
  hoverKey,
  onHover,
}: {
  series: Series[];
  total: number;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const shown = series.filter((s) => s.active > 0);

  const wedges = useMemo<Wedge[]>(() => {
    if (total <= 0 || shown.length === 0) return [];
    const gap = shown.length > 1 ? GAP_PX / ((R_OUT + R_IN) / 2) : 0;
    let cursor = 0;
    return shown.map((s) => {
      const span = (s.active / total) * Math.PI * 2;
      const a0 = cursor + gap / 2;
      // A wedge thinner than its own gap would invert; hold it at a visible sliver instead, which
      // is honest — the legend beside it prints the count that made it that thin.
      const a1 = Math.max(a0 + 0.02, cursor + span - gap / 2);
      cursor += span;
      return { key: s.key, color: s.color, active: s.active, share: s.active / total, a0, a1 };
    });
  }, [shown, total]);

  const hovered = wedges.find((w) => w.key === hoverKey) ?? null;

  return (
    /*
      SIZED INLINE, NOT BY A CLASS. `globals.css` carries
      `.zoom-mode [class*="max-w-"] { max-width: none !important }`, so any Tailwind max-w-* on this
      wrapper is stripped app-wide and the ring inflates to fill whatever column it is in — measured
      at 371px against an intended 220. An inline width is not a `max-w-` class and survives it.
    */
    <div className="relative mx-auto shrink-0" style={{ width: DONUT_PX, height: DONUT_PX }}>
      {/* A single soft bloom behind the ring, in the leading strategy's hue. It is off the data —
          it sits under the hole, not under the arcs — so it tints the panel without lifting any
          one wedge above another. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-2xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${(shown[0]?.color ?? "#3987e5")}22 0%, transparent 62%)`,
        }}
      />
      <svg
        viewBox={`0 0 ${DONUT_BOX} ${DONUT_BOX}`}
        className="relative w-full animate-[caesar-donut-enter_700ms_cubic-bezier(0.16,1,0.3,1)_both]"
        role="img"
        aria-label={
          total > 0
            ? `Active situations by strategy: ${shown.map((s) => `${s.key} ${s.active}`).join(", ")}`
            : "No active situations"
        }
      >
        <defs>
          <filter id="caesar-donut-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor={shown[0]?.color ?? "#3987e5"} floodOpacity="0.34" />
          </filter>
        </defs>
        {/* The track is always drawn: an empty ring reads as "nothing open", where an empty box
            reads as "this did not load". */}
        <circle
          cx={DONUT_C}
          cy={DONUT_C}
          r={(R_OUT + R_IN) / 2}
          fill="none"
          stroke={TRACK}
          strokeWidth={R_OUT - R_IN}
        />

        {/* One strategy holding everything is a complete ring, and a 2π wedge path degenerates —
            so that case is a stroked circle rather than an arc. */}
        {wedges.length === 1 ? (
          <circle
            cx={DONUT_C}
            cy={DONUT_C}
            r={(R_OUT + R_IN) / 2 + (hoverKey === wedges[0].key ? R_HOVER / 2 : 0)}
            fill="none"
            stroke={wedges[0].color}
            strokeWidth={R_OUT - R_IN + (hoverKey === wedges[0].key ? R_HOVER : 0)}
            filter="url(#caesar-donut-shadow)"
            opacity={0.9}
            onMouseEnter={() => onHover(wedges[0].key)}
            onMouseLeave={() => onHover(null)}
          />
        ) : (
          wedges.map((w) => {
            const on = hoverKey === w.key;
            return (
              <path
                key={w.key}
                d={wedgePath(w.a0, w.a1, R_IN, R_OUT + (on ? R_HOVER : 0))}
                fill={w.color}
                // The 2px surface ring the spec asks for on overlapping marks: it keeps two
                // touching wedges countable when the gap alone is foreshortened by the curve.
                stroke="none"
                fillOpacity={0.88}
                opacity={hoverKey && !on ? 0.42 : 1}
                // Opacity only. The radius change is a new `d` ATTRIBUTE, and the CSS `d` property
                // animates only path data set through CSS — listing it here would read as a
                // transition that does not happen.
                style={{ transition: "opacity 140ms ease", filter: `drop-shadow(0 8px 8px ${w.color}55)` }}
                onMouseEnter={() => onHover(w.key)}
                onMouseLeave={() => onHover(null)}
              >
                <title>{`${w.key.toUpperCase()}: ${w.active} of ${total} (${Math.round(w.share * 100)}%)`}</title>
              </path>
            );
          })
        )}

        {/* ---- the hole: the number the ring is a breakdown of ---- */}
        <text
          x={DONUT_C}
          y={hovered ? DONUT_C - 4 : DONUT_C + 2}
          textAnchor="middle"
          fill={hovered ? hovered.color : "rgba(255,255,255,0.92)"}
          fontSize={hovered ? 26 : 32}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
          style={{ transition: "font-size 120ms ease" }}
        >
          {hovered ? hovered.active : total}
        </text>
        {hovered ? (
          <>
            <text
              x={DONUT_C}
              y={DONUT_C + 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.55)"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              letterSpacing="1.4"
            >
              {hovered.key.toUpperCase()}
            </text>
            <text
              x={DONUT_C}
              y={DONUT_C + 25}
              textAnchor="middle"
              fill="rgba(255,255,255,0.32)"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              {Math.round(hovered.share * 100)}% of {total}
            </text>
          </>
        ) : (
          <text
            x={DONUT_C}
            y={DONUT_C + 18}
            textAnchor="middle"
            fill="rgba(255,255,255,0.32)"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            letterSpacing="1.6"
          >
            {total === 1 ? "SITUATION" : "SITUATIONS"}
          </text>
        )}
      </svg>
    </div>
  );
}

// =========================================================================================
// MULTI-SERIES LINE CHART — shared by the PnL-over-time and average-trade charts. Total is always
// solid and glowed, coloured by its own sign (the app-wide emerald/soft-rose money convention);
// every per-strategy line is dashed. Same card shell, gradient/glow language, tick sizing and
// footer-stats-bar convention as the scanner's own EquityChart/StartsByTimeChart — see
// components/scanner/shared/charts.tsx, which this deliberately matches rather than invents a
// second visual language for.
// =========================================================================================

function LinesChart({
  series,
  fromMin,
  toMin,
  nowMin,
  valueFmt,
  title,
  meta,
  heightPx = 320,
  heightClass = "h-[320px]",
}: {
  series: ValueSeries[];
  fromMin: number | null;
  toMin: number | null;
  nowMin: number | null;
  valueFmt: (v: number) => string;
  title?: string;
  meta?: string;
  /**
   * Both describe the SAME height: `heightPx` drives the viewBox/padding math below, `heightClass`
   * is the literal Tailwind class applied to the wrapper (a template string here would not be
   * picked up by Tailwind's static scan — see AVERAGE TRADE's own call site, which passes
   * `h-[384px]` as a literal for exactly this reason).
   */
  heightPx?: number;
  heightClass?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const plotRef = useRef<SVGSVGElement | null>(null);
  const width = useMeasuredWidth(plotRef, 1100);
  const height = heightPx;
  const PAD_L = 20;
  // Just the value-tick text (right-aligned, growing leftward) — names/values moved to the hover
  // tooltip only (2026-09-18, operator asked for a less cluttered chart), so this no longer has
  // to leave room for an end-of-line label growing rightward from the last point.
  const PAD_R = 60;
  const PAD_T = 40;
  // No standing footer bar any more (2026-10-07, the operator's own instruction: every always-on
  // label becomes a hover-only one) — PAD_B now only has to clear the axis tick labels themselves.
  const PAD_B = 26;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const from = fromMin ?? 0;
  const to = toMin ?? 1440;
  const span = Math.max(1, to - from);

  const inRange = useCallback((s: ValueSeries) =>
    s.points.filter((p) => p.min >= from && p.min <= to).sort((a, b) => a.min - b.min), [from, to]);

  const allValues = series.flatMap((s) => inRange(s).map((p) => p.value));
  const maxVal = Math.max(0, ...allValues, 1e-6);
  const minVal = Math.min(0, ...allValues);
  const valSpan = Math.max(1e-6, maxVal - minVal);

  const x = useCallback((min: number) => PAD_L + ((min - from) / span) * plotW, [from, span, plotW]);
  const y = useCallback((value: number) => PAD_T + plotH - ((value - minVal) / valSpan) * plotH, [minVal, valSpan, plotH]);

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const val = maxVal - t * valSpan;
    return { y: y(val), val };
  });

  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(from / 60) * 60;
    const step = span > 600 ? 180 : span > 240 ? 60 : 30;
    for (let m = first; m <= to; m += step) out.push(m);
    return out;
  }, [from, to, span]);

  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px < PAD_L || px > width - PAD_R) { setHoverMin(null); return; }
    setHoverMin(from + ((px - PAD_L) / plotW) * span);
  }, [from, span, plotW]);

  const hoverValues = useMemo(() => {
    if (hoverMin == null) return null;
    return series.map((s) => {
      let nearest: number | null = null;
      let bestDiff = Infinity;
      for (const p of inRange(s)) {
        const diff = Math.abs(p.min - hoverMin);
        if (diff < bestDiff) { bestDiff = diff; nearest = p.value; }
      }
      return { key: s.key, color: s.dashed ? s.color : GOLD_LINE, value: nearest };
    });
  }, [hoverMin, series, inRange]);
  const hoverPct = hoverMin == null ? 0 : (x(hoverMin) / width) * 100;

  const zeroY = y(0);
  const zeroInRange = minVal <= 0 && maxVal >= 0;

  const total = series.find((s) => !s.dashed) ?? null;
  const totalPts = total ? inRange(total) : [];
  const totalAreaD = totalPts.length > 0
    ? `${roundedPolyline(totalPts.map((p): [number, number] => [x(p.min), y(p.value)]), 4)} L ${x(totalPts[totalPts.length - 1].min)} ${y(0)} L ${x(totalPts[0].min)} ${y(0)} Z`
    : "";

  return (
    <div className={`scanner-glass-card relative m-0 ${heightClass} w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80`}>
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <svg
        ref={plotRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-full w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverMin(null)}
        role="img"
        aria-label="Value over time, one line per strategy plus a solid total"
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(212,175,55,0.30)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0.02)" />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={PAD_L} x2={width - PAD_R} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <text x={width - 8} y={t.y - 5} fontSize={AXIS_TICK_FONT_SIZE} fill={AXIS_TICK_FILL} textAnchor="end" fontFamily="ui-monospace, monospace">
              {valueFmt(t.val)}
            </text>
          </g>
        ))}

        {zeroInRange && (
          <line x1={PAD_L} x2={width - PAD_R} y1={zeroY} y2={zeroY} stroke="rgba(244,63,94,0.25)" strokeDasharray="4 3" />
        )}
        {nowMin != null && nowMin >= from && nowMin <= to && (
          <line x1={x(nowMin)} y1={PAD_T} x2={x(nowMin)} y2={height - PAD_B} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        )}
        {hoverMin != null && (
          <line x1={x(hoverMin)} y1={PAD_T} x2={x(hoverMin)} y2={height - PAD_B} stroke="rgba(255,255,255,0.30)" strokeWidth={1} />
        )}

        {totalAreaD && <path d={totalAreaD} fill={`url(#${uid}-fill)`} className="caesar-chart-fade-up" />}

        {series.map((s, i) => {
          const pts = inRange(s);
          if (pts.length === 0) return null;
          const d = roundedPolyline(pts.map((p): [number, number] => [x(p.min), y(p.value)]), 4);
          const lastPt = pts[pts.length - 1];
          const isTotal = !s.dashed;
          const color = isTotal ? GOLD_LINE : s.color;
          return (
            // Fade-and-rise on mount, staggered per series (2026-10-07) — the same entrance style
            // the arrivals chart's own lines already use (caesar-line-reveal), adapted for a line
            // that needs its own dash pattern (8 4) intact, so it cannot also repurpose
            // strokeDasharray for a stroke-draw reveal the way arrivals does.
            <g key={s.key} className="caesar-chart-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isTotal ? 4 : 3.2}
                strokeDasharray={isTotal ? undefined : "8 4"}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={isTotal ? 1 : 0.95}
                filter={isTotal ? `url(#${uid}-glow)` : undefined}
              />
              <circle cx={x(lastPt.min)} cy={y(lastPt.value)} r={isTotal ? 5 : 4} fill={color} />
            </g>
          );
        })}

        <line x1={PAD_L} x2={width - PAD_R} y1={height - PAD_B} y2={height - PAD_B} stroke="rgba(255,255,255,0.12)" />
        {ticks.map((m) => {
          const px = x(m);
          if (px < PAD_L + 8) return null;
          return (
            <g key={m}>
              <line x1={px} x2={px} y1={PAD_T} y2={height - PAD_B} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />
              <text x={px} y={height - 8} textAnchor="middle" fontSize={AXIS_TICK_FONT_SIZE} fill={AXIS_TICK_FILL} fontFamily="ui-monospace, monospace">
                {clockLabel(m)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Names and values live here ONLY — no always-on label anywhere on the chart; hover the
          plot to read any series' value (including the gold total) at that moment, in one
          animated tooltip that follows the cursor. */}
      {hoverValues && (
        <div
          className="caesar-chart-tooltip pointer-events-none absolute top-0 z-10 min-w-[150px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 shadow-lg backdrop-blur-xl"
          style={{ left: `${hoverPct}%`, transform: hoverPct > 58 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
        >
          <div className="font-mono text-[12px] tabular-nums text-zinc-500">{clockLabel(hoverMin ?? 0)}</div>
          {hoverValues.map((v) => v.value != null && (
            <div key={v.key} className="mt-1 flex items-center gap-2 font-mono text-[13px]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: v.color }} />
              <span className="text-zinc-400">{v.key.toUpperCase()}</span>
              <span className="ml-auto font-bold tabular-nums text-zinc-100">{valueFmt(v.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================================
// LONGS/SHORTS SENT — a bar per 10-minute bucket, in the scanner's own START OK/START BAD
// gradient-bar language (emerald for long, the app-wide soft-rose for short).
// =========================================================================================

function LongShortHistogram({
  buckets,
  fromMin,
  toMin,
  nowMin,
  title,
  meta,
  heightPx = 320,
  heightClass = "h-[320px]",
}: {
  buckets: { min: number; long: number; short: number; overnight: number }[];
  fromMin: number | null;
  toMin: number | null;
  nowMin: number | null;
  title?: string;
  meta?: string;
  /** See LinesChart's own pair of the same name — same reason both are needed. */
  heightPx?: number;
  heightClass?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useMeasuredWidth(svgRef, 1100);
  const height = heightPx;
  const PAD_L = 22;
  const PAD_R = 40;
  const PAD_T = 40;
  // No standing footer bar any more (2026-10-07) — PAD_B only has to clear the axis tick labels.
  const PAD_B = 26;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const from = fromMin ?? 0;
  const to = toMin ?? 1440;
  const span = Math.max(1, to - from);
  const maxCount = Math.max(1, ...buckets.map((b) => Math.max(b.long, b.short, b.overnight)));
  // The overnight bar only takes space when the plan runs an overnight strategy at all, so a page
  // without one keeps its two-bar groups exactly as they were.
  const hasOvernight = buckets.some((b) => b.overnight > 0);
  const barsPerGroup = hasOvernight ? 3 : 2;

  const barGap = 2;
  const groupW = Math.max(4, Math.floor(plotW / Math.max(1, buckets.length)) - barGap);
  const barW = Math.max(2, Math.floor((groupW - (barsPerGroup - 1)) / barsPerGroup));
  const x = useCallback((min: number) => PAD_L + ((min - from) / span) * plotW, [from, span, plotW]);
  const y = useCallback((count: number) => PAD_T + plotH - (count / maxCount) * plotH, [maxCount, plotH]);
  const yTicks = [0, Math.ceil(maxCount * 0.33), Math.ceil(maxCount * 0.66), maxCount];

  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(from / 60) * 60;
    const step = span > 600 ? 180 : span > 240 ? 60 : 30;
    for (let m = first; m <= to; m += step) out.push(m);
    return out;
  }, [from, to, span]);

  // Every number below moved from an always-on footer bar into this hover-only readout
  // (2026-10-07, the operator's own instruction): LONG/SHORT/OVERNIGHT at the nearest bucket,
  // same crosshair-and-tooltip pattern LinesChart uses.
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px < PAD_L || px > width - PAD_R) { setHoverMin(null); return; }
    setHoverMin(from + ((px - PAD_L) / plotW) * span);
  }, [from, span, plotW]);

  const hoverBucket = useMemo(() => {
    if (hoverMin == null || buckets.length === 0) return null;
    let nearest = buckets[0];
    let bestDiff = Infinity;
    for (const b of buckets) {
      const diff = Math.abs(b.min - hoverMin);
      if (diff < bestDiff) { bestDiff = diff; nearest = b; }
    }
    return nearest;
  }, [hoverMin, buckets]);
  const hoverPct = hoverMin == null ? 0 : (x(hoverMin) / width) * 100;

  return (
    <div className={`scanner-glass-card relative m-0 ${heightClass} w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80`}>
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-full w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverMin(null)}
        role="img"
        aria-label="Longs and shorts sent per 10 minutes"
      >
        <defs>
          <linearGradient id={`${uid}-long`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(110,231,183,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0.25)" />
          </linearGradient>
          <linearGradient id={`${uid}-short`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SOFT_LOSS_SOLID} />
            <stop offset="100%" stopColor={SOFT_LOSS_MUTED} />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const ty = y(t);
          // Index, not the tick value: at a small max the ticks collide ([0,1,1,1]), and duplicate
          // keys make React drop or duplicate the gridlines.
          return (
            <g key={`y-${i}`}>
              <line x1={PAD_L} x2={width - PAD_R} y1={ty} y2={ty} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              {t > 0 && (
                <text x={width - 8} y={ty - 3} textAnchor="end" fontSize={AXIS_TICK_FONT_SIZE} fill={AXIS_TICK_FILL} fontFamily="ui-monospace, monospace">
                  {t}
                </text>
              )}
            </g>
          );
        })}

        {nowMin != null && nowMin >= from && nowMin <= to && (
          <line x1={x(nowMin)} y1={PAD_T} x2={x(nowMin)} y2={height - PAD_B} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        )}
        {hoverBucket && (
          <line x1={x(hoverBucket.min)} y1={PAD_T} x2={x(hoverBucket.min)} y2={height - PAD_B} stroke="rgba(255,255,255,0.30)" strokeWidth={1} />
        )}

        {buckets.map((b, i) => {
          const xBase = x(b.min);
          const hLong = plotH * (b.long / maxCount);
          const hShort = plotH * (b.short / maxCount);
          const yLong = PAD_T + plotH - hLong;
          const yShort = PAD_T + plotH - hShort;
          const on = hoverBucket?.min === b.min;
          // Grown from the baseline on mount, staggered left-to-right and capped so a long segment
          // (many buckets) finishes its whole reveal in under half a second rather than visibly
          // crawling across the chart (2026-10-07 — same entrance family as the lines/area above,
          // adapted to a bar: it grows, a line fades, both on the one shared easing curve).
          // transform, not the hover `opacity` already on the wrapping <g> above: the two never fight.
          const delay = Math.min(i * 6, 400);
          return (
            <g key={b.min} opacity={hoverBucket && !on ? 0.55 : 1} style={{ transition: "opacity 140ms ease" }}>
              <rect x={xBase} y={yLong} width={barW} height={hLong} rx="3" fill={`url(#${uid}-long)`} stroke="rgba(110,231,183,0.55)" strokeWidth="0.6" className="caesar-bar-grow" style={{ animationDelay: `${delay}ms` }} />
              <rect x={xBase + barW + 1} y={yShort} width={barW} height={hShort} rx="3" fill={`url(#${uid}-short)`} stroke={SOFT_LOSS_STROKE} strokeWidth="0.6" className="caesar-bar-grow" style={{ animationDelay: `${delay}ms` }} />
              {hasOvernight && b.overnight > 0 && (
                <rect
                  x={xBase + (barW + 1) * 2}
                  y={PAD_T + plotH - plotH * (b.overnight / maxCount)}
                  width={barW}
                  height={plotH * (b.overnight / maxCount)}
                  rx="3"
                  fill={OVERNIGHT_SERIES[0]}
                  fillOpacity={0.8}
                  stroke={OVERNIGHT_SERIES[0]}
                  strokeWidth="0.6"
                  className="caesar-bar-grow"
                  style={{ animationDelay: `${delay}ms` }}
                />
              )}
            </g>
          );
        })}

        <line x1={PAD_L} x2={width - PAD_R} y1={height - PAD_B} y2={height - PAD_B} stroke="rgba(255,255,255,0.15)" />
        {ticks.map((m) => {
          const px = x(m);
          if (px < PAD_L + 8) return null;
          return (
            <text key={m} x={px} y={height - 8} textAnchor="middle" fontSize={AXIS_TICK_FONT_SIZE} fill={AXIS_TICK_FILL} fontFamily="ui-monospace, monospace">
              {clockLabel(m)}
            </text>
          );
        })}
      </svg>

      {hoverBucket && (
        <div
          className="caesar-chart-tooltip pointer-events-none absolute top-0 z-10 min-w-[130px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 shadow-lg backdrop-blur-xl"
          style={{ left: `${hoverPct}%`, transform: hoverPct > 58 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
        >
          <div className="font-mono text-[12px] tabular-nums text-zinc-500">{clockLabel(hoverBucket.min)}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[13px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: "rgba(110,231,183,0.9)" }} />
            <span className="text-zinc-400">LONG</span>
            <span className="ml-auto font-bold tabular-nums text-zinc-100">{intnLike(hoverBucket.long)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[13px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: SOFT_LOSS_SOLID }} />
            <span className="text-zinc-400">SHORT</span>
            <span className="ml-auto font-bold tabular-nums text-zinc-100">{intnLike(hoverBucket.short)}</span>
          </div>
          {hasOvernight && (
            <div className="mt-1 flex items-center gap-2 font-mono text-[13px]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: OVERNIGHT_SERIES[0] }} />
              <span className="text-zinc-400">OVERNIGHT</span>
              <span className="ml-auto font-bold tabular-nums text-zinc-100">{intnLike(hoverBucket.overnight)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function intnLike(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// =========================================================================================

export default function CaesarCharts({ instances, fromMin, toMin, nowMin }: CaesarChartsProps) {
  const [accountActiveCount, setAccountActiveCount] = useState<number | null>(null);
  const [accountPositions, setAccountPositions] = useState<AccountPosition[]>([]);
  const [bridgePositions, setBridgePositions] = useState<BridgePosition[]>([]);
  const [bridgeEntries, setBridgeEntries] = useState<Record<string, EntryLogEntry[]>>({});
  const [pnlPoints, setPnlPoints] = useState<PnlSamplePoint[]>([]);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const plotRef = useRef<SVGSVGElement | null>(null);

  // ACTIVE NOW is account truth, not any engine's own memory. That distinction matters after
  // Caesar or a stream remounts: existing positions have PositionBp already, but no local entry.
  useEffect(() => {
    let alive = true;
    // Shares CaesarPositions' own poll of the same endpoint under the "account-positions" key
    // instead of running a second independent 4s interval — see sharedPoll.ts's doc comment.
    const fetchPositions = () =>
      fetchWithTimeout(bridgeUrl("/api/execution/tradingapp/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ positions?: AccountPosition[] }>);
    const unsubscribe = subscribeSharedPoll("account-positions", fetchPositions, 4000, (json) => {
      if (!alive || !json) return;
      const active = (json.positions ?? []).filter(isAccountActive);
      setAccountPositions(active);
      setAccountActiveCount(active.length);
      // Errors leave the last confirmed account count in place, same as before.
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Which strategy holds which ticker, straight from the bridge's own tracker — shares
  // CaesarBridgeDecisions' identical poll under the same key rather than running a second one.
  useEffect(() => {
    let alive = true;
    const fetchAll = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-store" })
        .then((res) => res.json() as Promise<BridgePositionsResponse>)
        .then((body) => body.positions);
    const unsubscribe = subscribeSharedPoll("bridge-all-positions", fetchAll, 2000, (value, err) => {
      if (!alive) return;
      if (!err && value) setBridgePositions(value);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Every strategy's own entry timestamps today — see ServerStrategyRunner.GetEntryLog. This is
  // cumulative history, not a live figure, so a slower poll than the two above is honest and cheap.
  useEffect(() => {
    let alive = true;
    const fetchEntries = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/entries"), { cache: "no-store" })
        .then((res) => res.json() as Promise<EntryLogResponse>)
        .then((body) => body.entries);
    const unsubscribe = subscribeSharedPoll("bridge-entries-log", fetchEntries, 10_000, (value, err) => {
      if (!alive) return;
      if (!err && value) setBridgeEntries(value);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Every strategy's own total P&L, sampled every 10 minutes — see StrategyPnlSeriesService. A new
  // point lands on the bridge only once per 10 minutes, so this polls far slower than the live
  // panels above; it exists purely to backfill/refresh, not to catch every tick.
  useEffect(() => {
    let alive = true;
    const fetchSeries = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/pnl-series"), { cache: "no-store" })
        .then((res) => res.json() as Promise<PnlSeriesResponse>)
        .then((body) => body.points);
    const unsubscribe = subscribeSharedPoll("bridge-pnl-series", fetchSeries, 30_000, (value, err) => {
      if (!alive) return;
      if (!err && value) setPnlPoints(value);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // One colour per strategy, assigned in order WITHIN its own category: the regular strategies walk
  // SERIES, the overnight ones walk OVERNIGHT_SERIES, so adding or removing an overnight strategy
  // never repaints a segment strategy (and vice versa) — the same never-cycled rule SERIES already
  // documents, applied per category.
  const colorByInstance = useMemo(() => {
    const map = new Map<string, string>();
    let regular = 0;
    let overnight = 0;
    for (const inst of instances) {
      if (inst.overnight) {
        map.set(inst.instanceId, overnight < OVERNIGHT_SERIES.length ? OVERNIGHT_SERIES[overnight] : OTHER);
        overnight += 1;
      } else {
        map.set(inst.instanceId, regular < MAX_SERIES ? SERIES[regular] : OTHER);
        regular += 1;
      }
    }
    return map;
  }, [instances]);

  const series = useMemo<Series[]>(() => instances.map((inst) => {
    // One step per ENTRY, in time order, carried forward as a running total — of the entries that
    // fall INSIDE the selected segment only. The chart is titled "Entered during the segment"; it
    // used to count every entry since 21:00, so on INTRA the line started at zero, jumped to
    // the whole morning's count in a vertical wall on the left edge, and "N total" disagreed with
    // the longs/shorts chart right beside it (which already counted the segment alone).
    const segFrom = fromMin ?? 0;
    const segTo = toMin ?? 1440;
    const orderedAt = (bridgeEntries[inst.instanceId] ?? [])
      .map((e) => new Date(e.atUtc).getTime())
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b);

    const points: Point[] = [];
    let running = 0;
    for (const ts of orderedAt) {
      const min = axisMinuteOf(ts);
      if (min < segFrom || min >= segTo) continue;
      running += 1;
      points.push({ min, count: running });
    }

    // Real (dispatched, not shadow) positions the bridge currently tracks for this strategy — the
    // account-truth recompute below overrides this the moment the account poll answers; this is
    // only what shows before that first response lands.
    const active = bridgePositions.filter((p) => p.strategyId === inst.instanceId && p.entryDispatched).length;

    return {
      key: inst.key,
      color: colorByInstance.get(inst.instanceId) ?? OTHER,
      active,
      entered: running,
      points,
      overnight: inst.overnight === true,
    };
  }), [instances, colorByInstance, bridgeEntries, bridgePositions, fromMin, toMin]);

  /**
   * Ticker -> the strategy instance key(s) currently claiming it, from the bridge's own tracked
   * (dispatched, not shadow) positions. Shared by activeSeries below (the donut) and
   * activeArrivalsSeries further down (the arrivals chart's second line) — both need the exact same
   * "whose ticker is this, right now" answer, and a ticker claimed by more than one strategy must
   * read the same way — ambiguous, owned by neither's own line — in both places.
   */
  const ownersByTicker = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const position of bridgePositions) {
      // Shadow-only: nothing in the real account to own, so it must never claim a real holding.
      if (!position.entryDispatched) continue;
      const ticker = position.ticker.trim().toUpperCase();
      if (!ticker) continue;
      const instance = instances.find((i) => i.instanceId === position.strategyId);
      if (!instance) continue;
      const owners = map.get(ticker) ?? [];
      if (!owners.includes(instance.key)) owners.push(instance.key);
      map.set(ticker, owners);
    }
    return map;
  }, [bridgePositions, instances]);

  const activeSeries = useMemo<Series[]>(() => {
    // Until the first account response, preserve the bridge-only display rather than pretending
    // that a zero account count is confirmed.
    if (accountActiveCount == null) return series;

    const counts = new Map<string, number>();
    for (const position of accountPositions) {
      const ticker = (position.ticker ?? "").trim().toUpperCase();
      const owners = ticker ? ownersByTicker.get(ticker) ?? [] : [];
      // Account reports one position per ticker. A ticker claimed by two strategies belongs in a
      // neutral shared slice, never twice in the ring.
      //
      // QQQ specifically (2026-10-08, the operator's own instruction): ReversalContinuumEntryHedgeService
      // and ArbitrageServerStrategy's own HEDGED mode both hedge an imbalance with QQQ, and neither
      // tracks that order as a position (DispatchHedgeBatchAsync's own doc comment: "never tracked as
      // a position" — the whole point is it bypasses the normal per-strategy book). ownersByTicker can
      // therefore never claim it, so without this it read as UNCLAIMED — "something is wrong, the
      // bridge lost track of this" — when it is working exactly as designed. No strategy ever trades
      // QQQ as an actual signal ticker, so this is a safe tell, not a guess from the ticker alone.
      const key = owners.length === 1
        ? owners[0]
        : owners.length > 1
          ? "shared"
          : ticker === "QQQ" ? "hedge" : "unclaimed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result = series
      .map((s) => ({ ...s, active: counts.get(s.key) ?? 0 }))
      .filter((s) => s.active > 0);
    const shared = counts.get("shared") ?? 0;
    const hedge = counts.get("hedge") ?? 0;
    const unclaimed = counts.get("unclaimed") ?? 0;
    // None of the three is a strategy identity or a sign — reuses CaesarPositions.tsx's own
    // sky/"shared" and amber/"unclaimed" badge colours, plus a new emerald/"hedge" one, rather than a
    // SERIES entry, which by design is reserved for actual strategies (see SERIES's own doc comment).
    if (shared > 0) result.push({ key: "shared", color: "#38bdf8", active: shared, entered: 0, points: [] });
    if (hedge > 0) result.push({ key: "hedge", color: "#34d399", active: hedge, entered: 0, points: [] });
    if (unclaimed > 0) result.push({ key: "unclaimed", color: "#fbbf24", active: unclaimed, entered: 0, points: [] });
    return result;
  }, [accountActiveCount, accountPositions, ownersByTicker, series]);
  const totalActive = activeSeries.reduce((sum, s) => sum + s.active, 0);
  const unclaimedActive = activeSeries.find((s) => s.key === "unclaimed")?.active ?? 0;
  const totalEntered = series.reduce((sum, s) => sum + s.entered, 0);
  const maxCount = Math.max(1, ...series.map((s) => s.entered));

  /**
   * The arrivals chart's own second line per strategy (2026-10-08, the operator's own instruction).
   * Not every dispatch becomes a real position — some get cancelled, some get retried several times
   * for the same ticker — so `series` above (every dispatch, including every retry) can run well
   * ahead of what is actually open. This counts each strategy's own currently-active (bpused /
   * PositionBp != 0) tickers ONCE each, at the earliest entry this strategy logged for that ticker
   * today — same `Series` shape as `series`, so it can share every render helper below
   * (stepsFor/pathFor/areaPathFor) without a second copy of any of them.
   */
  const activeArrivalsSeries = useMemo<Series[]>(() => {
    const segFrom = fromMin ?? 0;
    const segTo = toMin ?? 1440;

    const activeTickers = new Set<string>();
    for (const position of accountPositions) {
      if (!isAccountActive(position)) continue;
      const ticker = (position.ticker ?? "").trim().toUpperCase();
      if (ticker) activeTickers.add(ticker);
    }

    return instances.map((inst) => {
      // Earliest entry PER TICKER this strategy logged today — a ticker retried three times counts
      // once, at its first attempt, not three.
      const firstSeenAtByTicker = new Map<string, number>();
      for (const e of bridgeEntries[inst.instanceId] ?? []) {
        const ticker = (e.ticker ?? "").trim().toUpperCase();
        if (!ticker) continue;
        const ts = new Date(e.atUtc).getTime();
        if (!Number.isFinite(ts)) continue;
        const existing = firstSeenAtByTicker.get(ticker);
        if (existing == null || ts < existing) firstSeenAtByTicker.set(ticker, ts);
      }

      const ownedActiveAt = Array.from(firstSeenAtByTicker.entries())
        // Solely owned by THIS strategy (never a shared ticker) and currently active — the same
        // ownership rule ownersByTicker already enforces for the donut.
        .filter(([ticker]) => {
          const owners = ownersByTicker.get(ticker) ?? [];
          return owners.length === 1 && owners[0] === inst.key && activeTickers.has(ticker);
        })
        .map(([, ts]) => ts)
        .sort((a, b) => a - b);

      const points: Point[] = [];
      let running = 0;
      for (const ts of ownedActiveAt) {
        const min = axisMinuteOf(ts);
        if (min < segFrom || min >= segTo) continue;
        running += 1;
        points.push({ min, count: running });
      }

      return {
        key: inst.key,
        color: colorByInstance.get(inst.instanceId) ?? OTHER,
        active: 0, // unused here — the real "currently active" count lives on activeSeries
        entered: running,
        points,
        overnight: inst.overnight === true,
      };
    });
  }, [instances, colorByInstance, bridgeEntries, accountPositions, ownersByTicker, fromMin, toMin]);

  // ---- longs/shorts sent, bucketed into 10-minute bars ----------------------------------------
  //
  // Counts NEW entries dispatched inside each bucket — not a running total like the arrivals
  // chart above, since "how many were sent in THIS 10 minutes" is a different question from "how
  // many have arrived so far today". Pooled across every currently-scheduled strategy (`instances`
  // is already segment-scoped, same as the arrivals chart), since the operator asked for one
  // count, not a per-strategy breakdown.
  const BUCKET_MINUTES = 10;
  const longShortBuckets = useMemo(() => {
    const from = fromMin ?? 0;
    const to = toMin ?? 1440;
    const buckets = new Map<number, { long: number; short: number; overnight: number }>();
    for (let m = Math.floor(from / BUCKET_MINUTES) * BUCKET_MINUTES; m < to; m += BUCKET_MINUTES) {
      buckets.set(m, { long: 0, short: 0, overnight: 0 });
    }
    for (const inst of instances) {
      for (const e of bridgeEntries[inst.instanceId] ?? []) {
        const ts = new Date(e.atUtc).getTime();
        if (!Number.isFinite(ts)) continue;
        const min = axisMinuteOf(ts);
        if (min < from || min >= to) continue;
        const bucketStart = Math.floor(min / BUCKET_MINUTES) * BUCKET_MINUTES;
        const bucket = buckets.get(bucketStart);
        if (!bucket) continue;
        // Overnight strategies get their own bar (long + short together): they are a category of
        // their own on every chart, and folding their 15:50 entries into the pooled long/short
        // bars is what made them indistinguishable from the segment's strategies.
        if (inst.overnight) bucket.overnight += 1;
        else if (e.side?.toUpperCase() === "SHORT") bucket.short += 1;
        else bucket.long += 1;
      }
    }
    return Array.from(buckets.entries())
      .map(([min, counts]) => ({ min, ...counts }))
      .sort((a, b) => a.min - b.min);
  }, [instances, bridgeEntries, fromMin, toMin]);

  // ---- PnL-over-time and average-trade lines, from the bridge's own 10-minute samples ----------
  //
  // Total is POOLED (sum of every active strategy's own value at that sample), not an average of
  // averages — same convention the donut's own "total" already uses for situations.
  const pnlLineSeries = useMemo<ValueSeries[]>(() => {
    const perStrategy: ValueSeries[] = instances.map((inst) => ({
      key: inst.key,
      color: colorByInstance.get(inst.instanceId) ?? OTHER,
      dashed: true,
      points: pnlPoints
        .filter((p) => p.perStrategy[inst.instanceId] !== undefined)
        .map((p) => ({ min: axisMinuteOf(new Date(p.atUtc).getTime()), value: p.perStrategy[inst.instanceId].total })),
    }));
    const totalPoints: ValuePoint[] = pnlPoints.map((p) => ({
      min: axisMinuteOf(new Date(p.atUtc).getTime()),
      value: instances.reduce((sum, inst) => sum + (p.perStrategy[inst.instanceId]?.total ?? 0), 0),
    }));
    return [{ key: "total", color: "rgba(255,255,255,0.85)", dashed: false, points: totalPoints }, ...perStrategy];
  }, [instances, colorByInstance, pnlPoints]);

  const avgTradeLineSeries = useMemo<ValueSeries[]>(() => {
    const perStrategy: ValueSeries[] = instances.map((inst) => ({
      key: inst.key,
      color: colorByInstance.get(inst.instanceId) ?? OTHER,
      dashed: true,
      points: pnlPoints.flatMap((p) => {
        const s = p.perStrategy[inst.instanceId];
        if (!s || s.situations <= 0) return [];
        return [{ min: axisMinuteOf(new Date(p.atUtc).getTime()), value: s.total / s.situations }];
      }),
    }));
    const totalPoints: ValuePoint[] = pnlPoints.flatMap((p) => {
      let total = 0;
      let situations = 0;
      for (const inst of instances) {
        const s = p.perStrategy[inst.instanceId];
        if (!s) continue;
        total += s.total;
        situations += s.situations;
      }
      if (situations <= 0) return [];
      return [{ min: axisMinuteOf(new Date(p.atUtc).getTime()), value: total / situations }];
    });
    return [{ key: "total", color: "rgba(255,255,255,0.85)", dashed: false, points: totalPoints }, ...perStrategy];
  }, [instances, colorByInstance, pnlPoints]);

  // ---- the time scale ------------------------------------------------------------------------
  // W measured off the svg itself (useMeasuredWidth — see its own doc comment); H is simply the
  // figure's real height (384px, the same literal the wrapper below uses as h-[384px]). Measured
  // width + exact height means viewBox units equal real screen px on both axes, so there is no
  // preserveAspectRatio rescaling left to compensate for with a hand-picked number.
  const W = useMeasuredWidth(plotRef, 1100);
  const H = 384;
  const PAD_L = 42;
  const PAD_R = 54;
  const PAD_T = 24;
  const PAD_B = 38;
  const from = fromMin ?? 0;
  const to = toMin ?? 1440;
  const span = Math.max(1, to - from);

  const x = useCallback((min: number) => PAD_L + ((min - from) / span) * (W - PAD_L - PAD_R), [from, span]);
  const y = useCallback((count: number) => H - PAD_B - (count / maxCount) * (H - PAD_T - PAD_B), [maxCount]);

  /** Hour ticks inside the segment, thinned so labels never collide. */
  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(from / 60) * 60;
    const step = span > 600 ? 180 : span > 240 ? 60 : 30;
    for (let m = first; m <= to; m += step) out.push(m);
    return out;
  }, [from, to, span]);

  /**
   * The line, honestly spaced by the CLOCK, corner-to-corner — corrected 2026-09-16 twice over:
   * first the spacing (equal-width-by-rank made the chart lie about WHEN things happened; each
   * point now sits at `x(p.min)`, its real NY minute), then the shape. A full step (a flat tread
   * to the new x, THEN a vertical riser to the new count) draws two corners per entry and reads
   * as a staircase — "квадратним" (blocky). Connecting each entry's own APEX straight to the
   * next one instead is one corner per entry, and rounded (see cornerRadiusFor) it reads as a
   * rise, not a wall. The only flats left are the two that are actually true: nothing happened
   * before the first entry, and nothing has happened since the last one — those still hold at
   * their real value rather than fabricating a rise across dead time.
   */
  const stepsFor = useCallback((s: Series): [number, number][] => {
    const startX = x(from);
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    if (s.points.length === 0) return [[startX, y(0)], [endX, y(0)]];

    const firstPx = x(Math.max(from, s.points[0].min));
    const corners: [number, number][] = [[startX, y(0)], [firstPx, y(0)]];
    for (const p of s.points) {
      const px = x(Math.min(Math.max(p.min, from), to));
      corners.push([px, y(p.count)]);
    }
    corners.push([endX, y(s.points[s.points.length - 1].count)]);
    return corners;
  }, [from, to, nowMin, x, y]);

  /**
   * How far a corner rounds off — bounded by the TIGHTEST real gap between two of this series' own
   * points, not a fixed guess, so a burst of entries seconds apart never rounds far enough to eat
   * into its own neighbour.
   */
  const cornerRadiusFor = useCallback((corners: readonly [number, number][]) => {
    let minGap = Infinity;
    for (let i = 1; i < corners.length; i++) {
      const gap = Math.abs(corners[i][0] - corners[i - 1][0]);
      if (gap > 0.01 && gap < minGap) minGap = gap;
    }
    const unitHeight = (H - PAD_T - PAD_B) / maxCount;
    if (!Number.isFinite(minGap)) minGap = unitHeight;
    return Math.max(1.5, Math.min(7, minGap * 0.42, unitHeight * 0.42));
  }, [maxCount]);

  /**
   * The line itself, corners rounded off — a small curve through each turn instead of the turn.
   * A right angle read as a spike rather than a rise; this is what "зроби ріст плавнішим" asked
   * for, kept when the spacing itself was corrected back to real time.
   */
  const pathFor = useCallback((s: Series) => {
    const corners = stepsFor(s);
    return roundedPolyline(corners, cornerRadiusFor(corners));
  }, [stepsFor, cornerRadiusFor]);

  /**
   * The same line, closed down to the baseline — the shape a gradient fill paints INTO, so the
   * glow only ever sits under the line, fading out toward zero, never above it.
   */
  const areaPathFor = useCallback((s: Series) => {
    const line = pathFor(s);
    if (!line) return "";
    const startX = x(from);
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    return `${line} L ${endX} ${y(0)} L ${startX} ${y(0)} Z`;
  }, [pathFor, from, to, nowMin, x, y]);

  /**
   * Line, marker, and a label position that has been pushed clear of its neighbours.
   *
   * Early in a segment every strategy sits at zero, so without this the markers stack on the axis
   * and the labels print "0" on top of "0" — unreadable exactly when the chart is first looked at.
   * Markers stay on their true value (moving those would be a lie).
   *
   * The dodge logic that used to live here existed only to keep the always-on end-of-line NUMBER
   * label from colliding with its neighbours. That label is gone (2026-10-07, the operator's own
   * instruction — hover reads the exact count instead), so there is nothing left to dodge.
   */
  const endMarks = useMemo(() => {
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    return series.map((s, i) => ({
      key: s.key,
      color: s.color,
      d: pathFor(s),
      areaD: areaPathFor(s),
      gradientId: `caesar-arrival-fill-${i}`,
      endX,
      y: y(s.entered),
    }));
  }, [series, from, to, nowMin, x, y, pathFor, areaPathFor]);

  /**
   * The active-tickers line's own marks — same shape as endMarks, minus the area fill: this one is
   * a plain dashed stroke, drawn in its strategy's own colour so the two lines read as "this
   * strategy, two readings of it" rather than as a whole second palette to learn.
   */
  const activeEndMarks = useMemo(() => {
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    return activeArrivalsSeries.map((s) => ({
      key: s.key,
      color: s.color,
      d: pathFor(s),
      endX,
      y: y(s.entered),
    }));
  }, [activeArrivalsSeries, from, to, nowMin, x, y, pathFor]);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD_L || px > W - PAD_R) { setHoverMin(null); return; }
    setHoverMin(from + ((px - PAD_L) / (W - PAD_L - PAD_R)) * span);
  }, [from, span]);

  /** Each series' running total at the hovered minute, entered alongside active-with-bpused. */
  const hoverValues = useMemo(() => {
    if (hoverMin == null) return null;
    const countAt = (points: Point[], at: number) => {
      let count = 0;
      for (const p of points) { if (p.min <= at) count = p.count; else break; }
      return count;
    };
    return series.map((s) => {
      const activeSeriesForKey = activeArrivalsSeries.find((a) => a.key === s.key);
      return {
        key: s.key,
        color: s.color,
        count: countAt(s.points, hoverMin),
        activeCount: activeSeriesForKey ? countAt(activeSeriesForKey.points, hoverMin) : null,
      };
    });
  }, [hoverMin, series, activeArrivalsSeries]);

  /** Where to hang the tooltip. Past the middle it flips to the left of the crosshair. */
  const hoverPct = hoverMin == null ? 0 : (x(hoverMin) / W) * 100;

  // The account feed is useful even before a browser engine mounts, or outside a scheduled
  // segment: a held PositionBp must never make the operational overview disappear.
  if (instances.length === 0 && accountActiveCount == null) return null;

  return (
    <>
      {false ? (
        <table className="w-full font-mono text-[11px]">
          <thead className="bg-[#0a0a0a]/60 text-zinc-500">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.14em]">
              <th>Strategy</th>
              <th className="text-right">Active now</th>
              <th className="text-right">Share</th>
              <th className="text-right">Entered today</th>
            </tr>
          </thead>
          <tbody>
            {activeSeries.map((s) => (
              <tr key={s.key} className="border-t border-white/[0.04] [&>td]:px-3 [&>td]:py-1.5">
                <td className="flex items-center gap-2 text-zinc-300">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.key.toUpperCase()}
                </td>
                <td className="text-right tabular-nums text-zinc-200">{s.active}</td>
                <td className="text-right tabular-nums text-zinc-400">
                  {totalActive > 0 ? `${Math.round((s.active / totalActive) * 100)}%` : "—"}
                </td>
                <td className="text-right tabular-nums text-zinc-200">{s.entered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <>
      {/* The segment/overnight colour key used to sit here, always on. Removed (2026-10-07, the
          operator's own instruction): every chart below already names a series in its own hover
          tooltip, so a standing legend repeated the same colour→name mapping for nothing. */}

      {/* ---------- SITUATIONS / LONGS-SHORTS / AVG TRADE — three across, on top ----------
          The donut's column is a FIXED 384px — the operator's own instruction that the block be a
          perfect square, which an fr share can't guarantee since it stretches with viewport width.
          384 is deliberately the same number as the row's height (320 * 1.2), so width == height.
          The other two columns split whatever is left 1:1, same ratio as their original 2fr:2fr —
          taking space from both neighbours equally, same as the donut's own +20% did before this.
          All three blocks share the donut's new height via heightPx/heightClass, so the row stays
          one even line. */}
      <div className="mt-3 grid gap-4 lg:grid-cols-[384px_1fr_1fr]">
        <figure className="scanner-glass-card relative m-0 flex h-[384px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
          <figcaption className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            <span>ACTIVE ACCOUNT BOOK</span>
            <span className="text-zinc-600">{totalActive} total</span>
          </figcaption>
          <Donut series={activeSeries} total={totalActive} hoverKey={hoverKey} onHover={setHoverKey} />
        </figure>

        <LongShortHistogram
          buckets={longShortBuckets}
          fromMin={fromMin}
          toMin={toMin}
          nowMin={nowMin}
          title="LONGS / SHORTS SENT"
          meta="per 10m"
          heightPx={384}
          heightClass="h-[384px]"
        />

        <LinesChart
          series={avgTradeLineSeries}
          fromMin={fromMin}
          toMin={toMin}
          nowMin={nowMin}
          valueFmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
          title="AVERAGE TRADE"
          meta="total ÷ situations"
          heightPx={384}
          heightClass="h-[384px]"
        />
      </div>

      {/* ---------- ARRIVALS + PNL OVER TIME — two across, underneath ---------- */}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {/* ---------- ARRIVALS ---------- */}
          <figure className="scanner-glass-card relative m-0 h-[384px] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
            <div className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between">
              <figcaption className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Entered during the segment
              </figcaption>
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                {totalEntered} total
              </span>
            </div>
            <div className="relative h-full pt-6">
              <svg
                ref={plotRef}
                viewBox={`0 0 ${W} ${H}`}
                className="block h-full w-full"
                style={{ overflow: "visible" }}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverMin(null)}
                role="img"
                aria-label="Cumulative situations entered per strategy across the segment"
              >
                <defs>
                  <filter id="caesar-line-shadow" x="-10%" y="-30%" width="130%" height="170%">
                    <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#63e6be" floodOpacity="0.42" />
                  </filter>
                  {/*
                    ONE GRADIENT PER SERIES, in objectBoundingBox units (the SVG default) so each
                    fades from its OWN peak (y1 0%, near the line) down to its OWN baseline
                    (y2 100%) regardless of how tall that series' own step reaches — no per-series
                    coordinate math needed, the shape's own bounding box does it. Never painted
                    above the line: the fill it feeds is closed DOWN to the baseline only
                    (areaPathFor), so the glow only ever reads as sitting under the step, not
                    around it.
                  */}
                  {endMarks.map((m) => (
                    <linearGradient key={m.gradientId} id={m.gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity="0.38" />
                      <stop offset="55%" stopColor={m.color} stopOpacity="0.12" />
                      <stop offset="100%" stopColor={m.color} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>
                {/* Hairline, solid, recessive. */}
                <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke={AXIS} strokeWidth={1} />
                {ticks.map((m) => (
                  <g key={m}>
                    <line x1={x(m)} y1={PAD_T} x2={x(m)} y2={H - PAD_B} stroke={AXIS} strokeWidth={1} strokeDasharray="2 5" />
                    {/* A tick landing on the left edge — OPEN starts exactly on the hour, so its
                        first one always does — would centre its label over the y-axis numbers. The
                        gridline stays; only the label is dropped. */}
                    {x(m) > PAD_L + 16 && (
                      <text x={x(m)} y={H - 6} textAnchor="middle" fill={AXIS_TICK_FILL} fontSize={AXIS_TICK_FONT_SIZE} fontFamily="ui-monospace, monospace">
                        {clockLabel(m)}
                      </text>
                    )}
                  </g>
                ))}
                <text x={PAD_L - 6} y={y(maxCount) + 3} textAnchor="end" fill={AXIS_TICK_FILL} fontSize={AXIS_TICK_FONT_SIZE} fontFamily="ui-monospace, monospace">
                  {maxCount}
                </text>
                <text x={PAD_L - 6} y={y(0) + 3} textAnchor="end" fill={AXIS_TICK_FILL} fontSize={AXIS_TICK_FONT_SIZE} fontFamily="ui-monospace, monospace">
                  0
                </text>

                {nowMin != null && nowMin >= from && nowMin <= to && (
                  <>
                    <line x1={x(nowMin)} y1={PAD_T} x2={x(nowMin)} y2={H - PAD_B} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
                    <text
                      x={x(nowMin)}
                      y={PAD_T - 3}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.30)"
                      fontSize={7.5}
                      letterSpacing="1.2"
                      fontFamily="ui-monospace, monospace"
                    >
                      NOW
                    </text>
                    {unclaimedActive > 0 && (
                      <g transform={`translate(${x(nowMin) + 8} ${PAD_T + 8})`}>
                        {/* Amber, not coral — unclaimed is an ownership gap, not a negative result,
                            and coral is reserved for that. Matches CaesarPositions.tsx's own
                            UNCLAIMED badge. */}
                        <rect width="78" height="16" rx="4" fill="rgba(251,191,36,0.14)" stroke="rgba(251,191,36,0.38)" />
                        <text x="6" y="11" fill="#fbbf24" fontSize="7.5" letterSpacing="0.8" fontFamily="ui-monospace, monospace">
                          UNCLAIMED {unclaimedActive}
                        </text>
                      </g>
                    )}
                  </>
                )}

                {hoverMin != null && (
                  <line x1={x(hoverMin)} y1={PAD_T} x2={x(hoverMin)} y2={H - PAD_B} stroke="rgba(255,255,255,0.30)" strokeWidth={1} />
                )}

                {endMarks.map((m) => {
                  const dim = hoverKey != null && hoverKey !== m.key;
                  return (
                    <g
                      key={m.key}
                      opacity={dim ? 0.28 : 1}
                      style={{ transition: "opacity 140ms ease" }}
                      onMouseEnter={() => setHoverKey(m.key)}
                      onMouseLeave={() => setHoverKey(null)}
                    >
                      {/* The long, fading glow under the step — never above it, see the gradient's own note. */}
                      <path d={m.areaD} fill={`url(#${m.gradientId})`} stroke="none" className="caesar-chart-fade-up" />
                      <path d={m.d} fill="none" stroke={m.color} strokeWidth={8} strokeOpacity={0.18} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 7px 7px ${m.color}66)` }} />
                      <path d={m.d} fill="none" stroke={m.color} strokeOpacity={0.94} strokeWidth={2.7} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1} style={{ animation: "caesar-line-reveal 900ms cubic-bezier(0.16,1,0.3,1) forwards", filter: `drop-shadow(0 0 4px ${m.color}80)` }} />
                      {/* End marker: r 4 with a 2px ring in the surface colour, so series that sit on
                          the same value stay countable instead of merging into one blob. The count
                          itself is hover-only now (2026-10-07) — see the tooltip below the svg. */}
                      <circle cx={m.endX} cy={m.y} r={4} fill={m.color} stroke={SURFACE} strokeWidth={2} />
                    </g>
                  );
                })}

                {/*
                  ACTIVE, WITH BPUSED — the same strategy's own colour, dashed instead of solid
                  (2026-10-08, the operator's own instruction): not every dispatch above becomes a
                  real position, some get cancelled, some get retried several times for the same
                  ticker, so this counts each strategy's own currently-active tickers once each
                  instead. No area fill — a second glowing wedge per strategy would compete with the
                  first one instead of reading as "one more line to compare it against". Dims with
                  its own strategy's main line on hover, via the same hoverKey.
                */}
                {activeEndMarks.map((m) => {
                  const dim = hoverKey != null && hoverKey !== m.key;
                  return (
                    <g
                      key={`active-${m.key}`}
                      className="caesar-chart-fade-up"
                      opacity={dim ? 0.22 : 1}
                      style={{ transition: "opacity 140ms ease" }}
                    >
                      {/*
                        A REAL dash pattern (not the main line's pathLength=1 draw-in trick, which
                        would turn "5 4" into one unreadable dash the length of the whole line) —
                        this is the "different line type, same colour" the main line's own count
                        gets compared against, so the fade-up entrance above is enough on its own.
                      */}
                      <path
                        d={m.d}
                        fill="none"
                        stroke={m.color}
                        strokeOpacity={0.8}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      <circle cx={m.endX} cy={m.y} r={3} fill={SURFACE} stroke={m.color} strokeWidth={2} />
                    </g>
                  );
                })}
              </svg>

              {/* The crosshair's readout, hung off the rule itself rather than parked under the
                  plot — so the eye reads the value where it is pointing. */}
              {hoverValues && (
                <div
                  className="caesar-chart-tooltip pointer-events-none absolute top-0 z-10 min-w-[104px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-2 py-1.5 shadow-lg backdrop-blur-xl"
                  style={{
                    left: `${hoverPct}%`,
                    transform: hoverPct > 58 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
                  }}
                >
                  <div className="font-mono text-[10px] tabular-nums text-zinc-500">
                    {clockLabel(hoverMin ?? 0)}
                  </div>
                  {hoverValues.map((v) => (
                    <div key={v.key} className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: v.color }} />
                      <span className="text-zinc-500">{v.key.toUpperCase()}</span>
                      <span className="ml-auto tabular-nums text-zinc-200">{v.count}</span>
                      {/* The dashed line's own reading, right next to the solid line's — entered
                          vs. actually active, read together instead of one on each of two charts. */}
                      {v.activeCount != null && (
                        <span className="tabular-nums text-zinc-500">
                          <span className="mx-1 text-zinc-700">/</span>
                          {v.activeCount} active
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </figure>

          {/* ---------- PNL OVER TIME ---------- */}
          <LinesChart
            series={pnlLineSeries}
            fromMin={fromMin}
            toMin={toMin}
            nowMin={nowMin}
            valueFmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
            title="PNL OVER TIME"
            meta="open + closed, every 10m"
            heightPx={384}
            heightClass="h-[384px]"
          />
      </div>
      </>
      )}
      <style jsx global>{`
        @keyframes caesar-donut-enter {
          from { opacity: 0; transform: scale(0.82) rotate(-12deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes caesar-line-reveal {
          to { stroke-dashoffset: 0; }
        }
        /* Every hover tooltip across these charts (LinesChart, LongShortHistogram, arrivals) pops
           in the same way — a short rise-and-fade, never an instant snap — so a label appearing on
           hover reads as deliberate, not as content popping into existence. Animates opacity and
           margin-top only, never transform: each tooltip's own inline style already uses transform
           to flip sides of the crosshair, and a CSS animation on the same property would win the
           cascade over that inline value for its whole duration and freeze the tooltip mid-flip. */
        @keyframes caesar-tooltip-in {
          from { opacity: 0; margin-top: -4px; }
          to { opacity: 1; margin-top: 0; }
        }
        .caesar-chart-tooltip {
          animation: caesar-tooltip-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        /* The two remaining mark types' own entrance, same easing family as caesar-donut-enter/
           caesar-line-reveal/caesar-tooltip-in above — a line fades and rises, a bar grows from its
           own baseline, so every one of the five charts animates in rather than appearing instantly,
           without forcing an identical motion onto shapes that do not share one. */
        @keyframes caesar-chart-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .caesar-chart-fade-up {
          animation: caesar-chart-fade-up 550ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes caesar-bar-grow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        .caesar-bar-grow {
          transform-box: fill-box;
          transform-origin: bottom;
          animation: caesar-bar-grow 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
    </>
  );
}
