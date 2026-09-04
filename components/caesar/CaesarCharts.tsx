"use client";

/**
 * Two pictures of the segment: what the situations are split into right now, and how they arrived.
 *
 * FORMS. The split is a composition of one whole across a handful of strategies, so it is a single
 * stacked bar rather than a donut: shares are read by comparing lengths along one baseline, which
 * an arc makes harder for no gain. The arrivals are counts over time, which is a line — one per
 * strategy, on one axis.
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

export default function CaesarCharts({ instances, segment, fromMin, toMin, nowMin }: CaesarChartsProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
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
  const maxCount = Math.max(1, ...series.map((s) => s.entered));

  // ---- the time scale ------------------------------------------------------------------------
  const W = 520;
  const H = 132;
  const PAD_L = 26;
  const PAD_R = 34;
  const PAD_T = 10;
  const PAD_B = 18;
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

  if (instances.length === 0) return null;

  return (
    <section
      className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06] shadow-xl backdrop-blur-md"
      style={{ backgroundColor: "rgba(10,10,10,0.6)" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-300">
            Situations
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {segment ? `${segment} segment` : "outside every segment"}
          </span>
        </div>
        {/* The table is the non-visual route to the same numbers. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {showTable ? "Chart" : "Table"}
        </button>
      </header>

      {showTable ? (
        <table className="w-full font-mono text-[11px]">
          <thead className="text-zinc-500">
            <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.14em]">
              <th>Strategy</th>
              <th className="text-right">Active now</th>
              <th className="text-right">Share</th>
              <th className="text-right">Entered today</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.key} className="border-t border-white/[0.04] [&>td]:px-4 [&>td]:py-1.5">
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
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {/* ---------- SHARE ---------- */}
          <figure className="m-0">
            <figcaption className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Active now
            </figcaption>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[26px] font-bold leading-none tabular-nums text-zinc-100">
                {totalActive}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                situation{totalActive === 1 ? "" : "s"}
              </span>
            </div>

            {/* One bar, 16px thick. Segments separated by a 2px gap in the surface colour — the
                gap does the separating, never a stroke. */}
            <div className="mt-3 flex h-4 w-full overflow-hidden rounded-[4px]" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              {totalActive > 0 &&
                series.map((s, i) =>
                  s.active === 0 ? null : (
                    <div
                      key={s.key}
                      title={`${s.key.toUpperCase()}: ${s.active} of ${totalActive}`}
                      style={{
                        width: `${(s.active / totalActive) * 100}%`,
                        backgroundColor: s.color,
                        marginLeft: i === 0 ? 0 : 2,
                      }}
                    />
                  )
                )}
            </div>

            {/* Legend — always present for two or more series, so identity is never colour alone. */}
            <ul className="mt-3 flex flex-col gap-1.5 p-0">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-zinc-400">{s.key.toUpperCase()}</span>
                  <span className="ml-auto tabular-nums text-zinc-200">{s.active}</span>
                  <span className="w-9 text-right tabular-nums text-zinc-600">
                    {totalActive > 0 ? `${Math.round((s.active / totalActive) * 100)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </figure>

          {/* ---------- ARRIVALS ---------- */}
          <figure className="m-0">
            <figcaption className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Entered during the segment
            </figcaption>
            <svg
              ref={plotRef}
              viewBox={`0 0 ${W} ${H}`}
              className="mt-2 w-full"
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
                <line x1={x(nowMin)} y1={PAD_T} x2={x(nowMin)} y2={H - PAD_B} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
              )}

              {hoverMin != null && (
                <line x1={x(hoverMin)} y1={PAD_T} x2={x(hoverMin)} y2={H - PAD_B} stroke="rgba(255,255,255,0.30)" strokeWidth={1} />
              )}

              {endMarks.map((m) => (
                <g key={m.key}>
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
              ))}
            </svg>

            {hoverValues && (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 font-mono text-[10px]">
                <span className="text-zinc-500">{clockLabel(hoverMin ?? 0)}</span>
                {hoverValues.map((v) => (
                  <span key={v.key} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: v.color }} />
                    <span className="text-zinc-500">{v.key}</span>
                    <span className="tabular-nums text-zinc-300">{v.count}</span>
                  </span>
                ))}
              </div>
            )}
          </figure>
        </div>
      )}
    </section>
  );
}
