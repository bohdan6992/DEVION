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
 * during the segment, read from its own action log. That log carries real timestamps and survives a
 * reload; the live stores only know the present, so anything drawn from them would be a history
 * invented at mount and lost on refresh. Situations that were considered and not taken are counted
 * by the terminal above, not here — this line is about what happened.
 *
 * COLOUR. Categorical, by strategy identity, assigned in fixed order and never cycled: a filter
 * that changes how many strategies are shown must not repaint the survivors. The four dark steps
 * were validated against this surface (#0a0a0a) — lightness band, chroma floor, CVD separation,
 * normal-vision floor and 3:1 contrast all pass. Past four the fifth series folds into "Other"
 * rather than inventing a hue.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStreamStores } from "@/components/stream/streamStoreRegistry";
import CaesarPanel, { CAESAR_PILL, CAESAR_PILL_IDLE, CAESAR_PILL_ON } from "./CaesarPanel";

export type CaesarChartsProps = {
  instances: readonly { key: string; instanceId: string; priority: number }[];
  segment: string | null;
  /** Segment bounds on the NY axis (0 = 21:00), for the time scale. */
  fromMin: number | null;
  toMin: number | null;
  /** Minutes since 21:00 right now, for the "now" rule. */
  nowMin: number | null;
};

/** Validated dark categorical steps. See the header. */
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const;
const OTHER = "#8a8a80";
const SURFACE = "#0a0a0a";
const MAX_SERIES = SERIES.length;

const AXIS = "rgba(255,255,255,0.10)";
const INK_MUTED = "rgba(255,255,255,0.35)";
/** The empty ring, and the unfilled remainder of a partial one. */
const TRACK = "rgba(255,255,255,0.055)";

type Point = { min: number; count: number };
type Series = { key: string; color: string; active: number; entered: number; points: Point[] };

function clockLabel(axisMin: number): string {
  const m = ((Math.round(axisMin) + 21 * 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** ms since epoch -> minutes on the NY axis where 0 = 21:00. */
function axisMinuteOf(ts: number): number {
  const d = new Date(ts);
  return ((d.getHours() * 60 + d.getMinutes()) - 21 * 60 + 1440) % 1440;
}

// =========================================================================================
// DONUT GEOMETRY
// =========================================================================================

const DONUT_BOX = 188;
/** Rendered size in CSS pixels. See the note in `Donut` on why this is not a class. */
const DONUT_PX = 196;
const DONUT_C = DONUT_BOX / 2;
const R_OUT = 74;
const R_IN = 49;
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
        className="relative w-full"
        role="img"
        aria-label={
          total > 0
            ? `Active situations by strategy: ${shown.map((s) => `${s.key} ${s.active}`).join(", ")}`
            : "No active situations"
        }
      >
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
                stroke={SURFACE}
                strokeWidth={1}
                opacity={hoverKey && !on ? 0.42 : 1}
                // Opacity only. The radius change is a new `d` ATTRIBUTE, and the CSS `d` property
                // animates only path data set through CSS — listing it here would read as a
                // transition that does not happen.
                style={{ transition: "opacity 140ms ease" }}
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

export default function CaesarCharts({ instances, segment, fromMin, toMin, nowMin }: CaesarChartsProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const plotRef = useRef<SVGSVGElement | null>(null);

  const instanceKey = instances.map((i) => `${i.key}:${i.instanceId}`).join(",");

  const recompute = useCallback(() => {
    const out: Series[] = [];
    instances.forEach((inst, index) => {
      const stores = getStreamStores(inst.instanceId);
      // The SAME rows the ACTIVE table shows — not a second definition of "active" derived from
      // raw positions. A chart that counted `status !== "CLOSED"` would include entries that were
      // decided but never dispatched, and would then disagree with the table right beside it.
      const active = stores.position.getActiveRows().length;

      // One step per ENTRY, in time order, carried forward as a running total.
      const entries = stores.log
        .getEntries()
        .filter((e) => e.event === "ENTRY")
        .sort((a, b) => a.ts - b.ts);

      const points: Point[] = [];
      let running = 0;
      for (const e of entries) {
        running += 1;
        points.push({ min: axisMinuteOf(e.ts), count: running });
      }

      out.push({
        key: inst.key,
        color: index < MAX_SERIES ? SERIES[index] : OTHER,
        active,
        entered: running,
        points,
      });
    });
    setSeries(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey]);

  useEffect(() => {
    recompute();
    const unsubs: Array<() => void> = [];
    for (const inst of instances) {
      const s = getStreamStores(inst.instanceId);
      unsubs.push(s.position.subscribe(recompute));
      unsubs.push(s.log.subscribe(recompute));
    }
    const id = window.setInterval(recompute, 5000);
    return () => { for (const u of unsubs) u(); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey, recompute]);

  const totalActive = series.reduce((sum, s) => sum + s.active, 0);
  const totalEntered = series.reduce((sum, s) => sum + s.entered, 0);
  const maxCount = Math.max(1, ...series.map((s) => s.entered));

  // ---- the time scale ------------------------------------------------------------------------
  const W = 520;
  const H = 150;
  const PAD_L = 26;
  const PAD_R = 34;
  const PAD_T = 12;
  const PAD_B = 20;
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

  /** A step line: the count holds until the next entry, which is what a running total does. */
  const pathFor = useCallback((s: Series) => {
    // A strategy that has entered nothing yet is drawn flat along zero, not omitted. Omitting it
    // makes "running, no entries" and "not running" look identical, and the legend beside it then
    // names a series the plot does not contain.
    if (s.points.length === 0) {
      const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
      return `M ${x(from)} ${y(0)} L ${endX} ${y(0)}`;
    }
    const parts: string[] = [`M ${x(Math.max(from, s.points[0].min))} ${y(0)}`];
    let prev = 0;
    for (const p of s.points) {
      const px = x(Math.min(Math.max(p.min, from), to));
      parts.push(`L ${px} ${y(prev)}`, `L ${px} ${y(p.count)}`);
      prev = p.count;
    }
    const endX = x(Math.min(Math.max(nowMin ?? to, from), to));
    parts.push(`L ${endX} ${y(prev)}`);
    return parts.join(" ");
  }, [from, to, nowMin, x, y]);

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
    const marks = series.map((s) => ({
      key: s.key,
      color: s.color,
      entered: s.entered,
      d: pathFor(s),
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
  }, [series, from, to, nowMin, x, y, pathFor]);

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

  if (instances.length === 0) return null;

  return (
    <CaesarPanel
      title="Situations"
      subtitle={segment ? `${segment} segment` : "outside every segment"}
      accent={series[0]?.color ?? "#3987e5"}
      className="mt-3"
      right={
        // The table is the non-visual route to the same numbers.
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className={CAESAR_PILL + (showTable ? CAESAR_PILL_ON : CAESAR_PILL_IDLE)}
        >
          {showTable ? "Chart" : "Table"}
        </button>
      }
    >
      {showTable ? (
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
            {series.map((s) => (
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
        <div className="grid gap-5 px-3 py-4 lg:grid-cols-[460px_minmax(0,1fr)]">
          {/* ---------- SHARE ---------- */}
          <figure className="m-0">
            <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Active now
            </figcaption>

            {/* Flex, not a grid: the ring is a fixed 196px and the legend takes what is left, which
                a fractional grid cannot express once the max-w classes are stripped. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Donut series={series} total={totalActive} hoverKey={hoverKey} onHover={setHoverKey} />

              {/* Legend — always present for two or more series, so identity is never colour alone,
                  and it is the hover surface too: pointing at a row lights its wedge. */}
              {/* Width is inline for the same reason the ring's is: a `max-w-` class would be
                  stripped, and without a cap the value column drifts half a panel away from the
                  name it belongs to. */}
              <ul className="flex flex-col gap-1 p-0" style={{ flex: "1 1 168px", maxWidth: 236 }}>
                {series.map((s) => {
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
          </figure>

          {/* ---------- ARRIVALS ---------- */}
          <figure className="relative m-0">
            <div className="flex items-baseline justify-between">
              <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
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
            <div className="relative mt-2" style={{ maxWidth: 660 }}>
              <svg
                ref={plotRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ overflow: "visible" }}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverMin(null)}
                role="img"
                aria-label="Cumulative situations entered per strategy across the segment"
              >
                {/* Hairline, solid, recessive. */}
                <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke={AXIS} strokeWidth={1} />
                {ticks.map((m) => (
                  <g key={m}>
                    <line x1={x(m)} y1={PAD_T} x2={x(m)} y2={H - PAD_B} stroke={AXIS} strokeWidth={1} />
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
                      <path d={m.d} fill="none" stroke={m.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
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
    </CaesarPanel>
  );
}
