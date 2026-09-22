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
import { SOFT_LOSS_MUTED, SOFT_LOSS_SOLID, SOFT_LOSS_STROKE } from "@/components/scanner/shared/styles";

export type CaesarChartsProps = {
  instances: readonly { key: string; instanceId: string; priority: number }[];
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
const SERIES = ["#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#60a5fa"] as const;
const OTHER = "#818cf8";
const SURFACE = "#0a0a0a";

/**
 * LinesChart-only: the solid Total line is the hero, gold, regardless of sign — sign still reads
 * from valueFmt's own leading "+"/"-". Per-strategy dashed lines keep their own SERIES identity
 * colour (reverted 2026-09-18 — a uniform silver secondary tone made every strategy look alike).
 */
const GOLD_LINE = "#d4af37";
const MAX_SERIES = SERIES.length;

const AXIS = "rgba(255,255,255,0.10)";
const INK_MUTED = "rgba(255,255,255,0.35)";
/** The empty ring, and the unfilled remainder of a partial one. */
const TRACK = "rgba(255,255,255,0.055)";

type Point = { min: number; count: number };
type Series = { key: string; color: string; active: number; entered: number; points: Point[] };
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
type EntryLogEntry = { atUtc: string; side: string };

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
/** Rendered size in CSS pixels. See the note in `Donut` on why this is not a class. */
const DONUT_PX = 344;
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
}: {
  series: ValueSeries[];
  fromMin: number | null;
  toMin: number | null;
  nowMin: number | null;
  valueFmt: (v: number) => string;
  title?: string;
  meta?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const width = 1100;
  const height = 320;
  const PAD_L = 20;
  // Just the value-tick text (right-aligned, growing leftward) — names/values moved to the hover
  // tooltip only (2026-09-18, operator asked for a less cluttered chart), so this no longer has
  // to leave room for an end-of-line label growing rightward from the last point.
  const PAD_R = 60;
  const PAD_T = 40;
  const footerH = 40;
  const PAD_B = 56;
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
  const plotRef = useRef<SVGSVGElement | null>(null);
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
  const lastTotal = totalPts.length > 0 ? totalPts[totalPts.length - 1] : null;
  const totalAreaD = totalPts.length > 0
    ? `${roundedPolyline(totalPts.map((p): [number, number] => [x(p.min), y(p.value)]), 4)} L ${x(totalPts[totalPts.length - 1].min)} ${y(0)} L ${x(totalPts[0].min)} ${y(0)} Z`
    : "";

  return (
    <div className="scanner-glass-card relative m-0 h-[320px] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
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
            <text x={width - 8} y={t.y - 5} fontSize="17" textAnchor="end" className="fill-zinc-300 font-mono">
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

        {totalAreaD && <path d={totalAreaD} fill={`url(#${uid}-fill)`} />}

        {series.map((s) => {
          const pts = inRange(s);
          if (pts.length === 0) return null;
          const d = roundedPolyline(pts.map((p): [number, number] => [x(p.min), y(p.value)]), 4);
          const lastPt = pts[pts.length - 1];
          const isTotal = !s.dashed;
          const color = isTotal ? GOLD_LINE : s.color;
          return (
            <g key={s.key}>
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
              <text x={px} y={h_text(height, footerH)} textAnchor="middle" fontSize="17" className="fill-zinc-400 font-mono">
                {clockLabel(m)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Names and values live here ONLY (2026-09-18) — no more always-on end-of-line text
          crowding the chart; hover the plot to read any series' value at that moment. */}
      {hoverValues && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[150px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 shadow-lg backdrop-blur-xl"
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

      {lastTotal && (
        <div className="absolute bottom-0 inset-x-0 h-[40px] border-t border-white/[0.08] bg-[#0a0a0a]/55 px-3 py-1.5 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-[12px] font-mono">
            <span className="font-bold" style={{ color: GOLD_LINE }}>
              total {valueFmt(lastTotal.value)}
            </span>
            {series.filter((s) => s.dashed).map((s) => {
              const pts = inRange(s);
              const last = pts.length > 0 ? pts[pts.length - 1] : null;
              return (
                <span key={s.key} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
                  {s.key.toUpperCase()}: <span style={{ color: s.color }}>{last ? valueFmt(last.value) : "—"}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Y coordinate for an x-axis tick label, matching the scanner charts' own footer-clearance math. */
function h_text(height: number, footerH: number): number {
  return height - footerH + 12;
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
}: {
  buckets: { min: number; long: number; short: number }[];
  fromMin: number | null;
  toMin: number | null;
  nowMin: number | null;
  title?: string;
  meta?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const width = 1100;
  const height = 320;
  const PAD_L = 22;
  const PAD_R = 40;
  const PAD_T = 40;
  const footerH = 40;
  const PAD_B = 56;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const from = fromMin ?? 0;
  const to = toMin ?? 1440;
  const span = Math.max(1, to - from);
  const maxCount = Math.max(1, ...buckets.map((b) => Math.max(b.long, b.short)));

  const barGap = 2;
  const groupW = Math.max(4, Math.floor(plotW / Math.max(1, buckets.length)) - barGap);
  const barW = Math.max(2, Math.floor((groupW - 1) / 2));
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

  const totalLong = buckets.reduce((s, b) => s + b.long, 0);
  const totalShort = buckets.reduce((s, b) => s + b.short, 0);
  const total = totalLong + totalShort;
  const longShare = total > 0 ? totalLong / total : 0;
  const bestBucket = buckets.reduce((best, cur) => (cur.long + cur.short > best.long + best.short ? cur : best), buckets[0] ?? { min: from, long: 0, short: 0 });

  return (
    <div className="scanner-glass-card relative m-0 h-[320px] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
      {(title || meta) && (
        <div className="absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{title}</div>
          <div className="text-[10px] font-mono text-zinc-600">{meta}</div>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label="Longs and shorts sent per 10 minutes">
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
                <text x={width - 8} y={ty - 3} textAnchor="end" fontSize="16" className="fill-zinc-300 font-mono">
                  {t}
                </text>
              )}
            </g>
          );
        })}

        {nowMin != null && nowMin >= from && nowMin <= to && (
          <line x1={x(nowMin)} y1={PAD_T} x2={x(nowMin)} y2={height - PAD_B} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        )}

        {buckets.map((b) => {
          const xBase = x(b.min);
          const hLong = plotH * (b.long / maxCount);
          const hShort = plotH * (b.short / maxCount);
          const yLong = PAD_T + plotH - hLong;
          const yShort = PAD_T + plotH - hShort;
          return (
            <g key={b.min}>
              <rect x={xBase} y={yLong} width={barW} height={hLong} rx="3" fill={`url(#${uid}-long)`} stroke="rgba(110,231,183,0.55)" strokeWidth="0.6">
                <title>{`${clockLabel(b.min)} LONG: ${b.long}`}</title>
              </rect>
              <rect x={xBase + barW + 1} y={yShort} width={barW} height={hShort} rx="3" fill={`url(#${uid}-short)`} stroke={SOFT_LOSS_STROKE} strokeWidth="0.6">
                <title>{`${clockLabel(b.min)} SHORT: ${b.short}`}</title>
              </rect>
            </g>
          );
        })}

        <line x1={PAD_L} x2={width - PAD_R} y1={height - PAD_B} y2={height - PAD_B} stroke="rgba(255,255,255,0.15)" />
        {ticks.map((m) => {
          const px = x(m);
          if (px < PAD_L + 8) return null;
          return (
            <text key={m} x={px} y={h_text(height, footerH)} textAnchor="middle" fontSize="14" className="fill-zinc-200 font-mono">
              {clockLabel(m)}
            </text>
          );
        })}
      </svg>

      <div className="absolute bottom-0 inset-x-0 h-[40px] border-t border-white/[0.08] bg-[#0a0a0a]/55 px-3 py-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-emerald-300/90">long {intnLike(totalLong)}</span>
          <span style={{ color: SOFT_LOSS_SOLID }}>short {intnLike(totalShort)}</span>
          <span className="text-zinc-500">long share {(longShare * 100).toFixed(1)}%</span>
          <span className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-zinc-400">
            busiest: <span className="text-zinc-200">{clockLabel(bestBucket.min)}</span> ({intnLike(bestBucket.long + bestBucket.short)})
          </span>
        </div>
      </div>
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

  const series = useMemo<Series[]>(() => instances.map((inst, index) => {
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
      color: index < MAX_SERIES ? SERIES[index] : OTHER,
      active,
      entered: running,
      points,
    };
  }), [instances, bridgeEntries, bridgePositions, fromMin, toMin]);

  const activeSeries = useMemo<Series[]>(() => {
    // Until the first account response, preserve the bridge-only display rather than pretending
    // that a zero account count is confirmed.
    if (accountActiveCount == null) return series;

    const ownersByTicker = new Map<string, string[]>();
    for (const position of bridgePositions) {
      // Shadow-only: nothing in the real account to own, so it must never claim a real holding.
      if (!position.entryDispatched) continue;
      const ticker = position.ticker.trim().toUpperCase();
      if (!ticker) continue;
      const instance = instances.find((i) => i.instanceId === position.strategyId);
      if (!instance) continue;
      const owners = ownersByTicker.get(ticker) ?? [];
      if (!owners.includes(instance.key)) owners.push(instance.key);
      ownersByTicker.set(ticker, owners);
    }

    const counts = new Map<string, number>();
    for (const position of accountPositions) {
      const ticker = (position.ticker ?? "").trim().toUpperCase();
      const owners = ticker ? ownersByTicker.get(ticker) ?? [] : [];
      // Account reports one position per ticker. A ticker claimed by two strategies belongs in a
      // neutral shared slice, never twice in the ring.
      const key = owners.length === 1 ? owners[0] : owners.length > 1 ? "shared" : "unclaimed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result = series
      .map((s) => ({ ...s, active: counts.get(s.key) ?? 0 }))
      .filter((s) => s.active > 0);
    const shared = counts.get("shared") ?? 0;
    const unclaimed = counts.get("unclaimed") ?? 0;
    // Neither a strategy identity nor a sign — reuses CaesarPositions.tsx's own sky/"shared" and
    // amber/"unclaimed" badge colours rather than a SERIES entry, which by design is now reserved
    // for actual strategies (see SERIES's own doc comment).
    if (shared > 0) result.push({ key: "shared", color: "#38bdf8", active: shared, entered: 0, points: [] });
    if (unclaimed > 0) result.push({ key: "unclaimed", color: "#fbbf24", active: unclaimed, entered: 0, points: [] });
    return result;
  }, [accountActiveCount, accountPositions, bridgePositions, instances, series]);
  const totalActive = activeSeries.reduce((sum, s) => sum + s.active, 0);
  const unclaimedActive = activeSeries.find((s) => s.key === "unclaimed")?.active ?? 0;
  const totalEntered = series.reduce((sum, s) => sum + s.entered, 0);
  const maxCount = Math.max(1, ...series.map((s) => s.entered));

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
    const buckets = new Map<number, { long: number; short: number }>();
    for (let m = Math.floor(from / BUCKET_MINUTES) * BUCKET_MINUTES; m < to; m += BUCKET_MINUTES) {
      buckets.set(m, { long: 0, short: 0 });
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
        if (e.side?.toUpperCase() === "SHORT") bucket.short += 1;
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
    const perStrategy: ValueSeries[] = instances.map((inst, index) => ({
      key: inst.key,
      color: index < MAX_SERIES ? SERIES[index] : OTHER,
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
  }, [instances, pnlPoints]);

  const avgTradeLineSeries = useMemo<ValueSeries[]>(() => {
    const perStrategy: ValueSeries[] = instances.map((inst, index) => ({
      key: inst.key,
      color: index < MAX_SERIES ? SERIES[index] : OTHER,
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
  }, [instances, pnlPoints]);

  // ---- the time scale ------------------------------------------------------------------------
  const W = 920;
  const H = 270;
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
   * Markers stay on their true value (moving those would be a lie); only the LABELS are dodged,
   * by the least amount that separates them.
   */
  const endMarks = useMemo(() => {
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    const marks = series.map((s, i) => ({
      key: s.key,
      color: s.color,
      entered: s.entered,
      d: pathFor(s),
      areaD: areaPathFor(s),
      gradientId: `caesar-arrival-fill-${i}`,
      endX,
      y: y(s.entered),
      labelY: y(s.entered),
    }));
    const MIN_GAP = 11;
    const TOP = PAD_T;
    const BOTTOM = H - PAD_B;
    const order = marks.slice().sort((a, b) => a.labelY - b.labelY); // top-most first

    // Push DOWN off the top edge. A single upward pass is not enough: when every strategy is tied
    // at the segment's maximum they all start at PAD_T, and separating them upwards walks the
    // labels straight out of the plot (measured: y = -23 for the fourth of four).
    for (let i = 0; i < order.length; i += 1) {
      const floor = i === 0 ? TOP : order[i - 1].labelY + MIN_GAP;
      if (order[i].labelY < floor) order[i].labelY = floor;
    }
    // Then push UP off the bottom edge, for the mirror case where everything sits on zero.
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const ceiling = i === order.length - 1 ? BOTTOM : order[i + 1].labelY - MIN_GAP;
      if (order[i].labelY > ceiling) order[i].labelY = ceiling;
    }
    return marks;
  }, [series, from, to, nowMin, x, y, pathFor, areaPathFor]);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = plotRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD_L || px > W - PAD_R) { setHoverMin(null); return; }
    setHoverMin(from + ((px - PAD_L) / (W - PAD_L - PAD_R)) * span);
  }, [from, span]);

  /** Each series' running total at the hovered minute. */
  const hoverValues = useMemo(() => {
    if (hoverMin == null) return null;
    return series.map((s) => {
      let count = 0;
      for (const p of s.points) { if (p.min <= hoverMin) count = p.count; else break; }
      return { key: s.key, color: s.color, count };
    });
  }, [hoverMin, series]);

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
      {/* ---------- SITUATIONS / LONGS-SHORTS / AVG TRADE — three across, on top ---------- */}
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_2fr_2fr]">
        <figure className="scanner-glass-card relative m-0 flex h-[320px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
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
        />

        <LinesChart
          series={avgTradeLineSeries}
          fromMin={fromMin}
          toMin={toMin}
          nowMin={nowMin}
          valueFmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
          title="AVERAGE TRADE"
          meta="total ÷ situations"
        />
      </div>

      {/* ---------- ARRIVALS + PNL OVER TIME — two across, underneath ---------- */}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {/* ---------- ARRIVALS ---------- */}
          <figure className="scanner-glass-card relative m-0 h-[320px] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
            <div className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between">
              <figcaption className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Entered during the segment
              </figcaption>
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                {totalEntered} total
              </span>
            </div>
            {/*
              CAPPED. The svg is `w-full` over a fixed viewBox, so its height follows its width: let
              it fill a 900px column and the 150-unit plot renders 260px tall, which turns a two-line
              chart into a wall. The cap holds the aspect near the ratio it was drawn for. It is
              inline for the usual reason — a `max-w-` class is stripped app-wide — and it caps the
              CONTAINER, not the svg, so the hover math (client x over container width) stays exact.
            */}
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
                      <text x={x(m)} y={H - 6} textAnchor="middle" fill={INK_MUTED} fontSize={8} fontFamily="ui-monospace, monospace">
                        {clockLabel(m)}
                      </text>
                    )}
                  </g>
                ))}
                <text x={PAD_L - 6} y={y(maxCount) + 3} textAnchor="end" fill={INK_MUTED} fontSize={8} fontFamily="ui-monospace, monospace">
                  {maxCount}
                </text>
                <text x={PAD_L - 6} y={y(0) + 3} textAnchor="end" fill={INK_MUTED} fontSize={8} fontFamily="ui-monospace, monospace">
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
                      <path d={m.areaD} fill={`url(#${m.gradientId})`} stroke="none" />
                      <path d={m.d} fill="none" stroke={m.color} strokeWidth={8} strokeOpacity={0.18} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 7px 7px ${m.color}66)` }} />
                      <path d={m.d} fill="none" stroke={m.color} strokeOpacity={0.94} strokeWidth={2.7} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1} style={{ animation: "caesar-line-reveal 900ms cubic-bezier(0.16,1,0.3,1) forwards", filter: `drop-shadow(0 0 4px ${m.color}80)` }} />
                      {/* End marker: r 4 with a 2px ring in the surface colour, so series that sit on
                          the same value stay countable instead of merging into one blob. */}
                      <circle cx={m.endX} cy={m.y} r={4} fill={m.color} stroke={SURFACE} strokeWidth={2} />
                      {/* Direct label at the end only — never a number on every point. */}
                      <text
                        x={m.endX + 8}
                        y={m.labelY + 3}
                        fill="rgba(255,255,255,0.75)"
                        fontSize={9}
                        fontFamily="ui-monospace, monospace"
                      >
                        {m.entered}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* The crosshair's readout, hung off the rule itself rather than parked under the
                  plot — so the eye reads the value where it is pointing. */}
              {hoverValues && (
                <div
                  className="pointer-events-none absolute top-0 z-10 min-w-[104px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-2 py-1.5 shadow-lg backdrop-blur-xl"
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
      `}</style>
    </>
  );
}
