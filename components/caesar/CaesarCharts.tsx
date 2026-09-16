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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";

export type CaesarChartsProps = {
  instances: readonly { key: string; instanceId: string; priority: number }[];
  /** Segment bounds on the NY axis (0 = 21:00), for the time scale. */
  fromMin: number | null;
  toMin: number | null;
  /** Minutes since 21:00 right now, for the "now" rule. */
  nowMin: number | null;
};

/** Scanner's fixed mint, coral, lavender, turquoise, gold and orange analytics palette. */
const SERIES = ["#63e6be", "#f3a6b2", "#a78bfa", "#2dd4bf", "#facc15", "#fb923c"] as const;
const OTHER = "#fb923c";
const SURFACE = "#0a0a0a";
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

/** GET api/stream/caesar/entries: bridge strategy id -> that strategy's own entry timestamps today. */
type EntryLogResponse = { ok: boolean; tradingDateNy: string; entries: Record<string, string[]> };

function isAccountActive(position: AccountPosition): boolean {
  if (position.isFlat === true) return false;
  const bp = Number(position.positionBp ?? position.PositionBp ?? 0);
  return Number.isFinite(bp) && bp !== 0;
}

function clockLabel(axisMin: number): string {
  const m = ((Math.round(axisMin) + 21 * 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** ms since epoch -> minutes on the NY axis where 0 = 21:00. */
function axisMinuteOf(ts: number): number {
  const d = new Date(ts);
  return ((d.getHours() * 60 + d.getMinutes()) - 21 * 60 + 1440) % 1440;
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

export default function CaesarCharts({ instances, fromMin, toMin, nowMin }: CaesarChartsProps) {
  const [accountActiveCount, setAccountActiveCount] = useState<number | null>(null);
  const [accountPositions, setAccountPositions] = useState<AccountPosition[]>([]);
  const [bridgePositions, setBridgePositions] = useState<BridgePosition[]>([]);
  const [bridgeEntries, setBridgeEntries] = useState<Record<string, string[]>>({});
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

  const series = useMemo<Series[]>(() => instances.map((inst, index) => {
    // One step per ENTRY, in time order, carried forward as a running total.
    const orderedAt = (bridgeEntries[inst.instanceId] ?? [])
      .map((iso) => new Date(iso).getTime())
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b);

    const points: Point[] = [];
    let running = 0;
    for (const ts of orderedAt) {
      running += 1;
      points.push({ min: axisMinuteOf(ts), count: running });
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
  }), [instances, bridgeEntries, bridgePositions]);

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
    if (shared > 0) result.push({ key: "shared", color: "#2dd4bf", active: shared, entered: 0, points: [] });
    if (unclaimed > 0) result.push({ key: "unclaimed", color: "#fb923c", active: unclaimed, entered: 0, points: [] });
    return result;
  }, [accountActiveCount, accountPositions, bridgePositions, instances, series]);
  const totalActive = activeSeries.reduce((sum, s) => sum + s.active, 0);
  const unclaimedActive = activeSeries.find((s) => s.key === "unclaimed")?.active ?? 0;
  const totalEntered = series.reduce((sum, s) => sum + s.entered, 0);
  const maxCount = Math.max(1, ...series.map((s) => s.entered));

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
   * A step line, each step an equal width apart — not spaced by the clock.
   *
   * Plotted at the real minute, a burst of entries reads as a near-vertical wall and a quiet
   * stretch before it reads as one very long tread — measured live 2026-09-16, a slow trickle
   * then a late rush made the first few situations invisible against the ones that followed. The
   * count of things that happened is what this line exists to show, not how bunched in time they
   * were, so every entry gets the SAME horizontal share of the segment. The first tread and the
   * "now" marker still land on the segment's real start and now — the axis stays honest — but
   * what happens between them is spaced by RANK. This also means N situations always fit: each
   * one's share is 1/N of the same span, so it shrinks on its own as N grows instead of needing a
   * separate "too many, zoom out" case.
   */
  const stepsFor = useCallback((s: Series): [number, number][] => {
    const startX = x(from);
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    if (s.points.length === 0) return [[startX, y(0)], [endX, y(0)]];

    const n = s.points.length;
    const stepWidth = (endX - startX) / n;
    const corners: [number, number][] = [[startX, y(0)]];
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const px = startX + (i + 1) * stepWidth;
      corners.push([px, y(prev)], [px, y(s.points[i].count)]);
      prev = s.points[i].count;
    }
    return corners;
  }, [from, to, nowMin, x, y]);

  /** How far a corner rounds off before it would visibly eat into its own step. */
  const cornerRadiusFor = useCallback((s: Series) => {
    const startX = x(from);
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    const n = Math.max(1, s.points.length);
    const stepWidth = (endX - startX) / n;
    const unitHeight = (H - PAD_T - PAD_B) / maxCount;
    return Math.max(1.5, Math.min(7, stepWidth * 0.42, unitHeight * 0.42));
  }, [from, to, nowMin, x, maxCount]);

  /**
   * The line itself, corners rounded off — a small curve through each turn instead of the turn.
   * A right angle read as a spike rather than a rise, more so once equal-width steps put them
   * shoulder to shoulder; this is what "зроби ріст плавнішим" asked for.
   */
  const pathFor = useCallback((s: Series) => roundedPolyline(stepsFor(s), cornerRadiusFor(s)), [stepsFor, cornerRadiusFor]);

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
      <div className="mt-3 grid items-center gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          {/* ---------- SHARE ---------- */}
          <figure className="scanner-glass-card relative m-0 flex h-[400px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
            <figcaption className="absolute left-3 right-3 top-2 z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <span>Active account book</span>
              <span className="text-zinc-600">{totalActive} total</span>
            </figcaption>

            {/* Flex, not a grid: the ring is a fixed 196px and the legend takes what is left, which
                a fractional grid cannot express once the max-w classes are stripped. */}
            <div className="mt-7 flex flex-col items-center gap-3 xl:flex-row xl:justify-center">
              <Donut series={activeSeries} total={totalActive} hoverKey={hoverKey} onHover={setHoverKey} />

              {/* Legend — always present for two or more series, so identity is never colour alone,
                  and it is the hover surface too: pointing at a row lights its wedge. */}
              {/* Width is inline for the same reason the ring's is: a `max-w-` class would be
                  stripped, and without a cap the value column drifts half a panel away from the
                  name it belongs to. */}
              <ul className="hidden" style={{ flex: "1 1 168px", maxWidth: 236 }}>
                {activeSeries.map((s) => {
                  const on = hoverKey === s.key;
                  return (
                    <li
                      key={s.key}
                      onMouseEnter={() => setHoverKey(s.key)}
                      onMouseLeave={() => setHoverKey(null)}
                      className={
                        "flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 font-mono text-[11px] transition-colors " +
                        (on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")
                      }
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{
                          backgroundColor: s.color,
                          boxShadow: on ? `0 0 8px ${s.color}` : undefined,
                        }}
                      />
                      <span className={on ? "text-zinc-200" : "text-zinc-400"}>{s.key.toUpperCase()}</span>
                      <span className="ml-auto tabular-nums text-zinc-200">{s.active}</span>
                      <span className="w-9 text-right tabular-nums text-zinc-600">
                        {totalActive > 0 ? `${Math.round((s.active / totalActive) * 100)}%` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="hidden">
              <div><div className="text-[9px] uppercase tracking-widest text-zinc-600">Active</div><div className="mt-0.5 text-lg font-bold tabular-nums text-zinc-100">{totalActive}</div></div>
              <div><div className="text-[9px] uppercase tracking-widest text-zinc-600">Entries</div><div className="mt-0.5 text-lg font-bold tabular-nums text-zinc-100">{totalEntered}</div></div>
              <div><div className="text-[9px] uppercase tracking-widest text-zinc-600">Streams</div><div className="mt-0.5 text-lg font-bold tabular-nums text-zinc-100">{series.length}</div></div>
            </div>
          </figure>

          {/* ---------- ARRIVALS ---------- */}
          <figure className="scanner-glass-card relative m-0 h-[400px] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-xl transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/80">
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
                        <rect width="78" height="16" rx="4" fill="rgba(243,166,178,0.14)" stroke="rgba(243,166,178,0.38)" />
                        <text x="6" y="11" fill="#f3a6b2" fontSize="7.5" letterSpacing="0.8" fontFamily="ui-monospace, monospace">
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
        </div>
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
