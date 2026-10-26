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

import { CLO_HEDGE_KEY, ARBITRAGE_HEDGE_KEY } from "@/lib/caesar/hedge";
import { PRE_CHECKPOINT_BRIDGE_IDS, OPG_CHECKPOINT_BRIDGE_IDS } from "@/lib/caesar/checkpoints";
import { SERIES, OTHER, OVERNIGHT_SERIES, MAX_SERIES, buildColorByInstance } from "@/lib/caesar/colors";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import {
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
  /**
   * Strategy keys genuinely assigned to the segment currently being viewed (Caesar's own plan row
   * for it), or null when the whole day is in view. PNL OVER TIME and AVERAGE TRADE's hover
   * tooltips use this to drop a strategy that only appears in `instances` as an overnight carryover
   * (e.g. Reversal, held through to POST) but is not actually scheduled in the segment on screen —
   * the LINE itself and the pooled total are unaffected, only the tooltip's own strategy list.
   */
  assignedKeys?: ReadonlySet<string> | null;
  /**
   * The STABLE, registry-ordered colour map (see lib/caesar/colors.ts) — CaesarSchedule builds this
   * once from its own full `positionInstances` and hands the SAME map to CaesarPositions, so a
   * strategy's chart line and its card title are provably the same colour. Omitted falls back to
   * computing it from `instances` alone (keeps this component usable standalone), which can
   * repaint survivors across a segment change the shared map does not.
   */
  colorByInstanceId?: ReadonlyMap<string, string>;
  /** Shared with CaesarPositions: hovering either surface highlights the same strategy on both. */
  hoveredStrategyKey?: string | null;
  onHoverStrategy?: (key: string | null) => void;
};

const SURFACE = "#0a0a0a";

/**
 * LinesChart-only: the solid Total line is the hero, gold, regardless of sign — sign still reads
 * from valueFmt's own leading "+"/"-". Per-strategy dashed lines keep their own SERIES identity
 * colour (reverted 2026-09-18 — a uniform silver secondary tone made every strategy look alike).
 */
const GOLD_LINE = "#d4af37";

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
// RADAR (petal) CHART — one polygon per strategy, five axes, EACH AXIS SCALED INDEPENDENTLY
// (min..max across whichever strategies are currently shown lands on 0..100 for THAT axis) so a
// strategy that leads on one metric and trails on another still draws a readable, non-degenerate
// shape — a single shared scale would flatten every axis but whichever has the largest raw numbers.
// Same hover-dims-the-rest convention as the donut right beside it (hoverKey/onHover is the SAME
// state both already share), so hovering a strategy's wedge highlights its own petal shape too.
// =========================================================================================

const RADAR_SIZE = 384;
const RADAR_C = RADAR_SIZE / 2;
const RADAR_R = RADAR_SIZE / 2 - 56; // leaves room for the axis labels ringing the outside

function RadarChart({
  axes,
  series,
  hoverKey,
  onHover,
}: {
  axes: readonly { key: string; label: string }[];
  series: { key: string; color: string; values: number[] }[];
  hoverKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const n = axes.length;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i: number, radius: number): readonly [number, number] => {
    const a = angleFor(i);
    return [RADAR_C + radius * Math.cos(a), RADAR_C + radius * Math.sin(a)];
  };

  // Per-axis min..max across the series actually shown — see this section's own header comment.
  const ranges = useMemo(
    () => axes.map((_, i) => {
      const vals = series.map((s) => s.values[i] ?? 0);
      return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 1 };
    }),
    [axes, series],
  );
  const radiusFor = (axisIdx: number, value: number) => {
    const { min, max } = ranges[axisIdx];
    // Every strategy tied on this axis (often true for a single-strategy day): sit at the SAME
    // mid radius rather than dividing by zero, which would otherwise collapse to the centre.
    if (max === min) return RADAR_R * 0.55;
    return RADAR_R * ((value - min) / (max - min));
  };
  const polygonFor = (s: { values: number[] }) =>
    axes.map((_, i) => pointAt(i, radiusFor(i, s.values[i] ?? 0)).join(",")).join(" ");

  const RINGS = [0.25, 0.5, 0.75, 1];
  const hovered = series.find((s) => s.key === hoverKey) ?? null;

  return (
    <div className="relative mx-auto shrink-0" style={{ width: RADAR_SIZE, height: RADAR_SIZE }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-50 blur-2xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${(hovered ?? series[0])?.color ?? "#3987e5"}22 0%, transparent 62%)`,
        }}
      />
      <svg
        viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
        className="relative w-full"
        role="img"
        aria-label={
          series.length > 0
            ? `Per-strategy shape across ${axes.map((a) => a.label).join(", ")}: ${series.map((s) => s.key).join(", ")}`
            : "No active strategy to shape today"
        }
      >
        {RINGS.map((f) => (
          <polygon
            key={f}
            points={axes.map((_, i) => pointAt(i, RADAR_R * f).join(",")).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}
        {axes.map((ax, i) => {
          const [x, y] = pointAt(i, RADAR_R);
          const [lx, ly] = pointAt(i, RADAR_R + 20);
          return (
            <g key={ax.key}>
              <line x1={RADAR_C} y1={RADAR_C} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.6"
              >
                {ax.label}
              </text>
            </g>
          );
        })}
        {series.length === 0 ? (
          <text
            x={RADAR_C}
            y={RADAR_C}
            textAnchor="middle"
            fill="rgba(255,255,255,0.32)"
            fontSize={11}
            fontFamily="ui-monospace, monospace"
          >
            NOTHING ACTIVE
          </text>
        ) : (
          series.map((s) => {
            const on = hoverKey === s.key;
            return (
              <polygon
                key={s.key}
                points={polygonFor(s)}
                fill={s.color}
                fillOpacity={on ? 0.3 : 0.14}
                stroke={s.color}
                strokeWidth={on ? 2.5 : 1.5}
                opacity={hoverKey && !on ? 0.35 : 1}
                style={{ transition: "opacity 140ms ease, fill-opacity 140ms ease", cursor: "pointer" }}
                onMouseEnter={() => onHover(s.key)}
                onMouseLeave={() => onHover(null)}
              >
                <title>{s.key.toUpperCase()}</title>
              </polygon>
            );
          })
        )}
      </svg>
    </div>
  );
}

// =========================================================================================
// SETTLE BREAKDOWN — one grouped pair of bars per strategy: CLOSED BY its own checkpoint (solid)
// vs CLOSED AFTER it (outlined), the same split CaesarPositions.tsx's own cards already print as
// small text under two of them (2026-10-23, the operator's own instruction — option 1 of the five
// offered). A categorical x-axis (one slot per strategy), not time — the one chart in this file
// that is not a time series, because the question it answers ("how much of each strategy's own
// closed total came in before vs after its own settle clock") is a snapshot, not a trend.
// =========================================================================================

function SettleBreakdownChart({
  rows,
  hoverKey,
  onHover,
  title,
  meta,
  heightPx = 384,
  heightClass = "h-[384px]",
}: {
  rows: { key: string; color: string; ready: boolean; checkpointLabel: string; byCheckpoint: number; afterCheckpoint: number }[];
  hoverKey: string | null;
  onHover: (key: string | null) => void;
  title?: string;
  meta?: string;
  heightPx?: number;
  heightClass?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useMeasuredWidth(svgRef, 1100);
  const height = heightPx;
  const PAD_L = 46;
  const PAD_R = 16;
  const PAD_T = 36;
  const PAD_B = 30;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.byCheckpoint), Math.abs(r.afterCheckpoint)]));
  const yZero = PAD_T + plotH / 2;
  const yFor = (v: number) => yZero - (v / maxAbs) * (plotH / 2);
  const yTicks = [maxAbs, 0, -maxAbs];

  const n = Math.max(1, rows.length);
  const groupW = plotW / n;
  const barW = Math.max(8, Math.min(36, groupW * 0.3));
  const barGap = 4;

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
        role="img"
        aria-label="Closed by checkpoint versus closed after checkpoint, per strategy"
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={width - PAD_R} y1={yFor(t)} y2={yFor(t)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <text x={PAD_L - 8} y={yFor(t) + 3} textAnchor="end" fontSize={AXIS_TICK_FONT_SIZE} fill={AXIS_TICK_FILL} fontFamily="ui-monospace, monospace">
              {t >= 0 ? "+" : ""}{t.toFixed(0)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={width - PAD_R} y1={yZero} y2={yZero} stroke="rgba(255,255,255,0.15)" />

        {rows.length === 0 ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgba(255,255,255,0.32)" fontSize={11} fontFamily="ui-monospace, monospace">
            NOTHING SETTLED YET
          </text>
        ) : (
          rows.map((r, i) => {
            const gx = PAD_L + groupW * i + groupW / 2;
            const on = hoverKey === r.key;
            const dim = hoverKey != null && !on;
            const byY = yFor(r.byCheckpoint);
            const afterY = yFor(r.afterCheckpoint);
            return (
              <g
                key={r.key}
                opacity={dim ? 0.4 : 1}
                style={{ transition: "opacity 140ms ease", cursor: "pointer" }}
                onMouseEnter={() => onHover(r.key)}
                onMouseLeave={() => onHover(null)}
              >
                <rect
                  x={gx - barGap / 2 - barW}
                  y={Math.min(yZero, byY)}
                  width={barW}
                  height={Math.max(0.5, Math.abs(yZero - byY))}
                  rx={3}
                  fill={r.color}
                  fillOpacity={0.85}
                />
                <rect
                  x={gx + barGap / 2}
                  y={Math.min(yZero, afterY)}
                  width={barW}
                  height={Math.max(0.5, Math.abs(yZero - afterY))}
                  rx={3}
                  fill={r.color}
                  fillOpacity={0.22}
                  stroke={r.color}
                  strokeWidth={1}
                />
                <text
                  x={gx}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={9}
                  fill={on ? r.color : "rgba(255,255,255,0.5)"}
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="0.3"
                >
                  {r.key.toUpperCase()}
                </text>
                {!r.ready && (
                  <text x={gx} y={PAD_T - 10} textAnchor="middle" fontSize={8} fill="rgba(251,191,36,0.75)" fontFamily="ui-monospace, monospace">
                    pending
                  </text>
                )}
                <title>
                  {`${r.key.toUpperCase()}: by ${r.checkpointLabel} ${r.byCheckpoint >= 0 ? "+" : ""}${r.byCheckpoint.toFixed(2)}, after ${r.checkpointLabel} ${r.afterCheckpoint >= 0 ? "+" : ""}${r.afterCheckpoint.toFixed(2)}${r.ready ? "" : " (checkpoint has not fired yet today)"}`}
                </title>
              </g>
            );
          })
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
  assignedKeys = null,
  hoverKey = null,
  onHoverKey,
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
  /** See CaesarChartsProps' own doc comment — null means "don't filter" (whole day in view). */
  assignedKeys?: ReadonlySet<string> | null;
  /**
   * Shared with the donut/arrivals chart (and, through them, CaesarPositions' own cards) — hovering
   * a per-strategy line here dims every other one, and hovering anywhere else that sets the same
   * key does too. The gold Total line is never dimmed; it is not any one strategy's own identity.
   */
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
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
    // The segment's own END must always read on the axis (operator's own instruction, 2026-10-20:
    // "ЧАСОВА ШКАЛА МАЄ БУТИ ДО 9:30") — a whole-hour step can land short of it (09:00, not 09:30),
    // which used to make the chart look like it stopped at the hour even though the plotted area
    // already extended the rest of the way. Within half a step of the last tick, MOVE that tick to
    // the endpoint instead of adding a second one right beside it (there is nothing to render a
    // collision check here, so two close labels would simply overlap); otherwise append it as its
    // own extra tick.
    if (out.length === 0 || out[out.length - 1] !== to) {
      if (out.length > 0 && to - out[out.length - 1] < step / 2) out[out.length - 1] = to;
      else out.push(to);
    }
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
    return series
      // The total (s.dashed === false) always shows; a per-strategy row is dropped when a specific
      // segment is in view (assignedKeys non-null) and that strategy is not actually scheduled in
      // it — the overnight carryover case (Reversal still charted on PRE/INTRA because its book is
      // still held, but not really "this segment's own strategy"). Whole-day view passes null here
      // and nothing is filtered.
      .filter((s) => !s.dashed || assignedKeys == null || assignedKeys.has(s.key))
      .map((s) => {
        let nearest: number | null = null;
        let bestDiff = Infinity;
        for (const p of inRange(s)) {
          const diff = Math.abs(p.min - hoverMin);
          if (diff < bestDiff) { bestDiff = diff; nearest = p.value; }
        }
        return { key: s.key, color: s.dashed ? s.color : GOLD_LINE, value: nearest };
      });
  }, [hoverMin, series, inRange, assignedKeys]);
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
          // Total is the pooled sum, not any one strategy's own identity — never dimmed, and never
          // itself the thing a hover picks (no onMouseEnter below for it).
          const dim = !isTotal && hoverKey != null && hoverKey !== s.key;
          return (
            // Fade-and-rise on mount, staggered per series (2026-10-07) — the same entrance style
            // the arrivals chart's own lines already use (caesar-line-reveal), adapted for a line
            // that needs its own dash pattern (8 4) intact, so it cannot also repurpose
            // strokeDasharray for a stroke-draw reveal the way arrivals does.
            <g
              key={s.key}
              className="caesar-chart-fade-up"
              style={{ animationDelay: `${i * 70}ms` }}
              onMouseEnter={isTotal ? undefined : () => onHoverKey?.(s.key)}
              onMouseLeave={isTotal ? undefined : () => onHoverKey?.(null)}
            >
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isTotal ? 4 : 3.2}
                strokeDasharray={isTotal ? undefined : "8 4"}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.25 : isTotal ? 1 : 0.95}
                filter={isTotal ? `url(#${uid}-glow)` : undefined}
                style={{ transition: "opacity 140ms ease" }}
              />
              <circle cx={x(lastPt.min)} cy={y(lastPt.value)} r={isTotal ? 5 : 4} fill={color} opacity={dim ? 0.25 : 1} style={{ transition: "opacity 140ms ease" }} />
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

  /**
   * NET (long minus short, running) — overlaid on the bars (2026-10-23, the operator's own
   * instruction: the bars alone, per 10-minute bucket only, read as empty/sparse on a quiet day
   * and never say whether the ACCOUNT as a whole is skewing long or short). A SEPARATE y-scale from
   * the bars' own (0..maxCount): net is a running SUM across the whole segment so far, a completely
   * different magnitude than one bucket's own count, and zero sits at the plot's own vertical
   * middle so a swing either way reads symmetrically rather than clipping against one edge.
   */
  const netPoints = useMemo(() => {
    let running = 0;
    return buckets.map((b) => {
      running += b.long - b.short;
      return { min: b.min, value: running };
    });
  }, [buckets]);
  const maxAbsNet = Math.max(1, ...netPoints.map((p) => Math.abs(p.value)));
  const yNet = useCallback((v: number) => PAD_T + plotH / 2 - (v / maxAbsNet) * (plotH / 2), [maxAbsNet, plotH]);
  const netPathD = netPoints.length > 0
    ? roundedPolyline(netPoints.map((p): [number, number] => [x(p.min) + barW / 2, yNet(p.value)]), 4)
    : "";
  const lastNet = netPoints.length > 0 ? netPoints[netPoints.length - 1] : null;

  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(from / 60) * 60;
    const step = span > 600 ? 180 : span > 240 ? 60 : 30;
    for (let m = first; m <= to; m += step) out.push(m);
    // The segment's own END must always read on the axis (operator's own instruction, 2026-10-20:
    // "ЧАСОВА ШКАЛА МАЄ БУТИ ДО 9:30") — a whole-hour step can land short of it (09:00, not 09:30),
    // which used to make the chart look like it stopped at the hour even though the plotted area
    // already extended the rest of the way. Within half a step of the last tick, MOVE that tick to
    // the endpoint instead of adding a second one right beside it (there is nothing to render a
    // collision check here, so two close labels would simply overlap); otherwise append it as its
    // own extra tick.
    if (out.length === 0 || out[out.length - 1] !== to) {
      if (out.length > 0 && to - out[out.length - 1] < step / 2) out[out.length - 1] = to;
      else out.push(to);
    }
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
  const hoverNet = hoverBucket ? netPoints.find((p) => p.min === hoverBucket.min)?.value ?? null : null;
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
        aria-label="Longs and shorts sent per 10 minutes, with a running net long-minus-short line"
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
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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

        {/* NET's own zero line — a separate reference from the bars' own baseline at the bottom,
            since net can swing either side of it. */}
        <line x1={PAD_L} x2={width - PAD_R} y1={yNet(0)} y2={yNet(0)} stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
        {netPathD && (
          <g className="caesar-chart-fade-up">
            <path
              d={netPathD}
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              filter={`url(#${uid}-glow)`}
            />
            {lastNet && (
              <circle cx={x(lastNet.min) + barW / 2} cy={yNet(lastNet.value)} r={4} fill="rgba(255,255,255,0.9)" />
            )}
          </g>
        )}

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
          {hoverNet != null && (
            <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1 font-mono text-[13px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.85)" }} />
              <span className="text-zinc-400">NET (running)</span>
              <span className="ml-auto font-bold tabular-nums text-zinc-100">{hoverNet >= 0 ? "+" : ""}{intnLike(hoverNet)}</span>
            </div>
          )}
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

export default function CaesarCharts({
  instances, fromMin, toMin, nowMin, assignedKeys = null,
  colorByInstanceId, hoveredStrategyKey, onHoverStrategy,
}: CaesarChartsProps) {
  const [accountActiveCount, setAccountActiveCount] = useState<number | null>(null);
  const [accountPositions, setAccountPositions] = useState<AccountPosition[]>([]);
  const [bridgePositions, setBridgePositions] = useState<BridgePosition[]>([]);
  const [bridgeEntries, setBridgeEntries] = useState<Record<string, EntryLogEntry[]>>({});
  const [pnlPoints, setPnlPoints] = useState<PnlSamplePoint[]>([]);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  // Controlled by the parent when it passes hoveredStrategyKey/onHoverStrategy (CaesarSchedule, so
  // CaesarPositions' own cards can drive this chart's highlight too); otherwise self-contained,
  // exactly as before — every internal hover (the donut, the arrivals lines) still works standalone.
  const [internalHoverKey, setInternalHoverKey] = useState<string | null>(null);
  const hoverKey = hoveredStrategyKey !== undefined ? hoveredStrategyKey : internalHoverKey;
  const setHoverKey = onHoverStrategy ?? setInternalHoverKey;
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

  // SETTLE BREAKDOWN — feeds the "closed by checkpoint / after checkpoint" chart below. Same two
  // shared-poll keys CaesarPositions.tsx's own cards already use ("bridge-pnl-breakdown-pre"/"-opg"),
  // so this never runs a second independent poll of the same endpoint.
  const [preBreakdown, setPreBreakdown] = useState<{ ready: boolean; perStrategy: Record<string, { closedByCheckpoint: number; closedAfterCheckpoint: number }> }>({ ready: false, perStrategy: {} });
  const [opgBreakdown, setOpgBreakdown] = useState<{ ready: boolean; perStrategy: Record<string, { closedByCheckpoint: number; closedAfterCheckpoint: number }> }>({ ready: false, perStrategy: {} });
  useEffect(() => {
    let aliveP = true;
    const fetchPre = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/pnl-breakdown?checkpoint=pre"), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ ok: boolean; ready?: boolean; perStrategy?: Record<string, { closedByCheckpoint: number; closedAfterCheckpoint: number }> }>);
    const unsubscribe = subscribeSharedPoll("bridge-pnl-breakdown-pre", fetchPre, 6_000, (body, err) => {
      if (aliveP && !err && body) setPreBreakdown({ ready: body.ready === true, perStrategy: body.perStrategy ?? {} });
    });
    return () => { aliveP = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    let aliveO = true;
    const fetchOpg = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/pnl-breakdown?checkpoint=opg"), { cache: "no-store" })
        .then((res) => res.json() as Promise<{ ok: boolean; ready?: boolean; perStrategy?: Record<string, { closedByCheckpoint: number; closedAfterCheckpoint: number }> }>);
    const unsubscribe = subscribeSharedPoll("bridge-pnl-breakdown-opg", fetchOpg, 6_000, (body, err) => {
      if (aliveO && !err && body) setOpgBreakdown({ ready: body.ready === true, perStrategy: body.perStrategy ?? {} });
    });
    return () => { aliveO = false; unsubscribe(); };
  }, []);

  // The parent's STABLE, registry-ordered map (see CaesarChartsProps.colorByInstanceId's own doc
  // comment) when given — falls back to computing it from `instances` alone so this component
  // still works with no parent wiring, exactly as before.
  const colorByInstance = useMemo(
    () => colorByInstanceId ?? buildColorByInstance(instances),
    [colorByInstanceId, instances],
  );

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
      // QQQ / TQQQ specifically (2026-10-08, the operator's own instruction; TQQQ added 2026-10-20
      // when ReversalContinuumEntryHedgeService's own hedge ticker moved to it for its 3x leverage,
      // split into its own "clo-hedge" class the same day — see this function's own CLO_HEDGE_KEY/
      // ARBITRAGE_HEDGE_KEY import): ArbitrageServerStrategy's own HEDGED mode hedges with QQQ (1x)
      // and ReversalContinuumEntryHedgeService hedges with TQQQ — neither tracks that order as a
      // position (DispatchHedgeBatchAsync's own doc comment: "never tracked as a position" — the
      // whole point is it bypasses the normal per-strategy book). ownersByTicker can therefore never
      // claim either, so without this it read as UNCLAIMED — "something is wrong, the bridge lost
      // track of this" — when it is working exactly as designed. No strategy ever trades QQQ or
      // TQQQ as an actual signal ticker, so this is a safe tell, not a guess from the ticker alone.
      const key = owners.length === 1
        ? owners[0]
        : owners.length > 1
          ? "shared"
          : ticker === "TQQQ" ? CLO_HEDGE_KEY : ticker === "QQQ" ? ARBITRAGE_HEDGE_KEY : "unclaimed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Both hedge classes are already real entries in `series` (chartInstances appends HEDGE_INSTANCES
    // unconditionally, with their own fixed colour via colorByInstance), so the map/filter below
    // already picks each one up whenever `counts` has a non-zero entry for its key — whether that
    // count came from the normal owners.length===1 path above or the ticker-based fallback. Pushing
    // a SECOND entry for them here (as this used to) double-counted the exact same total into two
    // adjacent wedges of the same colour — "one wedge that looks cut into two parts" (the operator's
    // own report, 2026-10-21) — now that hedges are tracked as real claims, the normal path already
    // finds them every time; the ticker fallback above only still matters for the brief window right
    // after a press, before the next account poll has caught up.
    const result = series
      .map((s) => ({ ...s, active: counts.get(s.key) ?? 0 }))
      .filter((s) => s.active > 0);
    const shared = counts.get("shared") ?? 0;
    const unclaimed = counts.get("unclaimed") ?? 0;
    // Neither of these is a strategy identity or a sign — reuses CaesarPositions.tsx's own sky/
    // "shared" and amber/"unclaimed" badge colours rather than a SERIES entry, which by design is
    // reserved for actual strategies (see SERIES's own doc comment).
    if (shared > 0) result.push({ key: "shared", color: "#38bdf8", active: shared, entered: 0, points: [] });
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
  //
  // BAD SAMPLE WINDOW (2026-10-13, the operator's own instruction): the bridge's own 10-minute
  // sampler lands one reading inside 03:59-04:01 NY that is wrong — a spike neither the total nor
  // any one strategy's own line should ever show. Dropped for both charts below rather than fixed
  // at the source, since the source of the bad number has not been diagnosed; this just keeps it
  // off screen.
  const cleanPnlPoints = useMemo(
    () => pnlPoints.filter((p) => {
      const m = axisMinuteOf(new Date(p.atUtc).getTime());
      return m < 419 || m > 421;
    }),
    [pnlPoints],
  );

  const pnlLineSeries = useMemo<ValueSeries[]>(() => {
    const perStrategy: ValueSeries[] = instances.map((inst) => ({
      key: inst.key,
      color: colorByInstance.get(inst.instanceId) ?? OTHER,
      dashed: true,
      points: cleanPnlPoints
        .filter((p) => p.perStrategy[inst.instanceId] !== undefined)
        .map((p) => ({ min: axisMinuteOf(new Date(p.atUtc).getTime()), value: p.perStrategy[inst.instanceId].total })),
    }));
    const totalPoints: ValuePoint[] = cleanPnlPoints.map((p) => ({
      min: axisMinuteOf(new Date(p.atUtc).getTime()),
      value: instances.reduce((sum, inst) => sum + (p.perStrategy[inst.instanceId]?.total ?? 0), 0),
    }));
    return [{ key: "total", color: "rgba(255,255,255,0.85)", dashed: false, points: totalPoints }, ...perStrategy];
  }, [instances, colorByInstance, cleanPnlPoints]);

  /**
   * STRATEGY SHAPE (radar/petal) — replaces the old AVERAGE TRADE line (2026-10-23, the operator's
   * own instruction). A radar's own strength is comparing strategies against EACH OTHER across
   * several axes at once, not one metric over time, so this is a snapshot (right now), not a
   * history — unlike every other chart in this row. Five axes, all already computed elsewhere in
   * this file for other charts (no new endpoint): TOTAL P&L and AVG/TRADE from the same latest
   * pnl-series sample AVERAGE TRADE used to read; ENTERED reuses `series[i].entered` (the same
   * segment-scoped count the arrivals chart below already shows, so this never disagrees with it);
   * OPEN NOW reuses `activeSeries[i].active` (the account-verified count the donut itself shows);
   * LONG SKEW is the one new computation, the same segment-scoped entries `longShortBuckets` already
   * sums, just split per strategy instead of pooled.
   */
  const RADAR_AXES = [
    { key: "total", label: "TOTAL P&L" },
    { key: "avg", label: "AVG/TRADE" },
    { key: "entered", label: "ENTERED" },
    { key: "open", label: "OPEN NOW" },
    { key: "skew", label: "LONG SKEW" },
  ] as const;

  const radarSeries = useMemo(() => {
    const segFrom = fromMin ?? 0;
    const segTo = toMin ?? 1440;
    const latest = cleanPnlPoints.length > 0 ? cleanPnlPoints[cleanPnlPoints.length - 1] : null;
    const activeByKey = new Map(activeSeries.map((s) => [s.key, s.active]));
    const enteredByKey = new Map(series.map((s) => [s.key, s.entered]));

    return instances
      .map((inst) => {
        const sample = latest?.perStrategy[inst.instanceId];
        const total = sample?.total ?? 0;
        const avg = sample && sample.situations > 0 ? sample.total / sample.situations : 0;
        const entered = enteredByKey.get(inst.key) ?? 0;
        const open = activeByKey.get(inst.key) ?? 0;

        let long = 0;
        let short = 0;
        for (const e of bridgeEntries[inst.instanceId] ?? []) {
          const ts = new Date(e.atUtc).getTime();
          if (!Number.isFinite(ts)) continue;
          const min = axisMinuteOf(ts);
          if (min < segFrom || min >= segTo) continue;
          if (e.side?.toUpperCase() === "SHORT") short += 1; else long += 1;
        }
        const skew = long + short > 0 ? (long / (long + short)) * 100 : 50;

        return {
          key: inst.key,
          color: colorByInstance.get(inst.instanceId) ?? OTHER,
          values: [total, avg, entered, open, skew],
          hasActivity: entered > 0 || open > 0,
        };
      })
      // Same declutter rule the donut's own wedges already apply (active > 0) — a strategy with
      // nothing to show today would otherwise sit as a flat dot at the centre on every axis.
      .filter((s) => s.hasActivity);
  }, [instances, colorByInstance, cleanPnlPoints, series, activeSeries, bridgeEntries, fromMin, toMin]);

  /**
   * SETTLE BREAKDOWN — one of the five options the operator picked from (2026-10-23): per strategy,
   * how much of today's CLOSED total was already settled by that strategy's own checkpoint (09:35
   * for the PRE family, 10:35 for OPG) versus closed AFTER it — the same split CaesarPositions.tsx's
   * own cards already print as small text under two of them, given its own chart here instead of
   * staying buried in a footnote. Only a strategy classified into one of the two checkpoint families
   * (PRE_CHECKPOINT_BRIDGE_IDS/OPG_CHECKPOINT_BRIDGE_IDS) and currently shown in this segment is
   * included — the same "nothing to add if it was not named" rule the cards already follow.
   */
  const settleRows = useMemo(() => {
    return instances.flatMap((inst) => {
      const family = PRE_CHECKPOINT_BRIDGE_IDS.has(inst.instanceId)
        ? { breakdown: preBreakdown, label: "09:35" }
        : OPG_CHECKPOINT_BRIDGE_IDS.has(inst.instanceId)
          ? { breakdown: opgBreakdown, label: "10:35" }
          : null;
      if (!family) return [];
      const b = family.breakdown.perStrategy[inst.instanceId];
      if (!b) return [];
      return [{
        key: inst.key,
        color: colorByInstance.get(inst.instanceId) ?? OTHER,
        ready: family.breakdown.ready,
        checkpointLabel: family.label,
        byCheckpoint: b.closedByCheckpoint,
        afterCheckpoint: b.closedAfterCheckpoint,
      }];
    });
  }, [instances, colorByInstance, preBreakdown, opgBreakdown]);

  // ---- the time scale ------------------------------------------------------------------------
  // W measured off the svg itself (useMeasuredWidth — see its own doc comment); H is simply the
  // figure's real height (384px, the same literal the wrapper below uses as h-[384px]). Measured
  // width + exact height means viewBox units equal real screen px on both axes, so there is no
  // preserveAspectRatio rescaling left to compensate for with a hand-picked number.
  const W = useMeasuredWidth(plotRef, 1100);
  const H = 384;
  const PAD_L = 42;
  const PAD_R = 54;
  // 40, not 24 (MOVED 2026-10-26, alongside the x()/y() fix below and the wrapping div's own
  // className — the operator's own report: "Цей графік іноді обрізається... допомагає клік по
  // загальному і потім по проміжку"). This chart used to reserve top clearance for the
  // absolutely-positioned figcaption via a `pt-6` CSS padding on the <svg>'s own wrapper div,
  // stacked on top of this PAD_T — except that padding shrank the <svg>'s real rendered CSS height
  // below H (384), so viewBox and the actual box silently disagreed and the browser's own
  // preserveAspectRatio="xMidYMid meet" fallback (no explicit attribute was ever set) uniformly
  // rescaled the whole chart to fit, including every margin computed in this file's own coordinate
  // space. Dropping `pt-6` (see that div's own className) makes the <svg> truly fill the figure at
  // exactly H CSS pixels — no mismatch, no implicit rescale — and PAD_T alone now has to cover what
  // the removed padding used to, so it is widened to the same 40 every sibling chart in this file
  // already reserves for its own absolutely-positioned caption (see e.g. SETTLE BREAKDOWN's own
  // PAD_T). A real but minor defect — NOT the reported one; see x()'s own doc comment for that.
  const PAD_T = 40;
  const PAD_B = 38;
  const from = fromMin ?? 0;
  const to = toMin ?? 1440;
  const span = Math.max(1, to - from);

  // THE REPORTED BUG (2026-10-26): `W` is read inside this closure but was missing from its own
  // dependency array below. useCallback does not re-create the function when a value it merely
  // CLOSES OVER changes — only when a listed dependency does — so once this had memoized with
  // whatever W was on an early render (often still the 1100 fallback, before useMeasuredWidth's
  // ResizeObserver had delivered its first real measurement), it kept computing every tick, the NOW
  // marker and the line's own end-mark against that STALE width forever, even after the <svg>'s own
  // viewBox (read fresh every render, never memoized) moved on to the real one. Verified live
  // (Playwright against a running instance): viewBox read "0 0 600.65 384" while this function's own
  // x(09:30) still answered 1046 — a tick positioned at x=1046 inside a 600-wide box, invisible
  // because the figure's own overflow-hidden cut it, not because anything was actually drawn wrong.
  // `from`/`span` DO change on their own (picking a different segment), which is exactly why
  // reselecting one "fixed" it — that forced this useCallback to recompute, and by then
  // useMeasuredWidth had long since caught up to the real width, so the NEW memo finally captured a
  // correct W. W now sits in the dependency list where it always needed to.
  const x = useCallback((min: number) => PAD_L + ((min - from) / span) * (W - PAD_L - PAD_R), [from, span, W]);
  const y = useCallback((count: number) => H - PAD_B - (count / maxCount) * (H - PAD_T - PAD_B), [maxCount]);

  /** Hour ticks inside the segment, thinned so labels never collide. */
  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(from / 60) * 60;
    const step = span > 600 ? 180 : span > 240 ? 60 : 30;
    for (let m = first; m <= to; m += step) out.push(m);
    // The segment's own END must always read on the axis (operator's own instruction, 2026-10-20:
    // "ЧАСОВА ШКАЛА МАЄ БУТИ ДО 9:30") — a whole-hour step can land short of it (09:00, not 09:30),
    // which used to make the chart look like it stopped at the hour even though the plotted area
    // already extended the rest of the way. Within half a step of the last tick, MOVE that tick to
    // the endpoint instead of adding a second one right beside it (there is nothing to render a
    // collision check here, so two close labels would simply overlap); otherwise append it as its
    // own extra tick.
    if (out.length === 0 || out[out.length - 1] !== to) {
      if (out.length > 0 && to - out[out.length - 1] < step / 2) out[out.length - 1] = to;
      else out.push(to);
    }
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
   *
   * ENTERED/DISPATCHED is the plain dashed line now (2026-10-13, swapped from the previous
   * 2026-10-08 assignment — see activeEndMarks, which took over the solid glow treatment): no area
   * fill or gradient needed here any more, the same way activeEndMarks never needed one before.
   */
  const endMarks = useMemo(() => {
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    return series.map((s) => ({
      key: s.key,
      color: s.color,
      d: pathFor(s),
      endX,
      y: y(s.entered),
    }));
  }, [series, from, to, nowMin, x, y, pathFor]);

  /**
   * The active-tickers line's own marks — same shape as endMarks, area fill included: ACTIVE is the
   * solid, glowing line now (2026-10-13, the operator's own instruction — swapped from the previous
   * 2026-10-08 assignment), drawn in its strategy's own colour so the two lines still read as "this
   * strategy, two readings of it" rather than as a whole second palette to learn.
   */
  const activeEndMarks = useMemo(() => {
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    return activeArrivalsSeries.map((s, i) => ({
      key: s.key,
      color: s.color,
      d: pathFor(s),
      areaD: areaPathFor(s),
      gradientId: `caesar-active-fill-${i}`,
      endX,
      y: y(s.entered),
    }));
  }, [activeArrivalsSeries, from, to, nowMin, x, y, pathFor, areaPathFor]);

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

      {/* ---------- ACCOUNT BOOK / PNL OVER TIME / STRATEGY SHAPE — three across, on top ----------
          The donut's and radar's own columns are a FIXED 384px each, bookending the row — the
          operator's own instruction that both read as the same perfect-square block AND that the
          wide middle column sit between them (2026-10-23). 384 is deliberately the same number as
          the row's height (320 * 1.2), so width == height for both squares. Everything left over
          goes to the middle column alone — PNL OVER TIME here now, swapped with LONGS/SHORTS SENT
          below (same date, the operator's own instruction to trade both place AND size with it).
          All three blocks share the donut's own height via heightPx/heightClass, so the row stays
          one even line. */}
      <div className="mt-3 grid gap-4 lg:grid-cols-[384px_1fr_384px]">
        <figure className="scanner-glass-card relative m-0 flex h-[384px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
          <figcaption className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            <span>ACTIVE ACCOUNT BOOK</span>
            <span className="text-zinc-600">{totalActive} total</span>
          </figcaption>
          <Donut series={activeSeries} total={totalActive} hoverKey={hoverKey} onHover={setHoverKey} />
        </figure>

        {/* PNL OVER TIME — swapped here with LONGS/SHORTS SENT below (2026-10-23, the operator's
            own instruction: trade BOTH place and size), so it now gets the wide middle column
            instead of half of the row underneath. */}
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
          assignedKeys={assignedKeys}
          hoverKey={hoverKey}
          onHoverKey={setHoverKey}
        />

        <figure className="scanner-glass-card relative m-0 flex h-[384px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
          <figcaption className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            <span>STRATEGY SHAPE</span>
            <span className="text-zinc-600">now, per axis</span>
          </figcaption>
          <RadarChart axes={RADAR_AXES} series={radarSeries} hoverKey={hoverKey} onHover={setHoverKey} />
        </figure>
      </div>

      {/* ---------- ARRIVALS + SETTLE BREAKDOWN + LONGS/SHORTS SENT — three equal across, underneath
          (2026-10-23, the operator's own instruction: add the new chart "в нижньому ряді по
          середині" — in the bottom row, in the middle — and make all three equal width). ---------- */}
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
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
            <div className="relative h-full">
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
                  {activeEndMarks.map((m) => (
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

                {/*
                  ACTIVE, WITH BPUSED — the solid, glowing line now (2026-10-13, swapped from the
                  previous 2026-10-08 assignment, the operator's own instruction): not every dispatch
                  below becomes a real position, some get cancelled, some get retried several times
                  for the same ticker, so this counts each strategy's own currently-active tickers
                  once each instead. Carries the hover interaction (onMouseEnter/Leave) — the other
                  line just dims with it via the same hoverKey.
                */}
                {activeEndMarks.map((m) => {
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
                  ENTERED/DISPATCHED — the plain dashed line now (2026-10-13, swapped from the
                  previous 2026-10-08 assignment): a dispatch is not yet a confirmed position (see
                  ACTIVE above), so this reads as the secondary line to compare the solid one
                  against. No area fill — a second glowing wedge per strategy would compete with the
                  first one instead of reading as "one more line to compare it against". Dims with
                  its own strategy's main line on hover, via the same hoverKey.
                */}
                {endMarks.map((m) => {
                  const dim = hoverKey != null && hoverKey !== m.key;
                  return (
                    <g
                      key={`entered-${m.key}`}
                      className="caesar-chart-fade-up"
                      opacity={dim ? 0.22 : 1}
                      style={{ transition: "opacity 140ms ease" }}
                    >
                      {/*
                        A REAL dash pattern (not the other line's pathLength=1 draw-in trick, which
                        would turn "5 4" into one unreadable dash the length of the whole line) —
                        this is the "different line type, same colour" the solid line's own count
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

          {/* ---------- SETTLE BREAKDOWN ---------- */}
          <SettleBreakdownChart
            rows={settleRows}
            hoverKey={hoverKey}
            onHover={setHoverKey}
            title="SETTLE BREAKDOWN"
            meta="solid=by checkpoint, outline=after"
            heightPx={384}
            heightClass="h-[384px]"
          />

          {/* ---------- LONGS / SHORTS SENT ---------- */}
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
