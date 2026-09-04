"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GlitchTitle } from "@/components/ui/GlitchTitle";
import { fetchBridgePlan, pushBridgePlan, setBridgeScheduleEnabled } from "@/lib/caesar/planClient";
import {
  CAESAR_SEGMENTS,
  CAESAR_STRATEGIES,
  CAESAR_STRATEGY_BY_KEY,
  MAX_PRIORITY,
  MIN_PRIORITY,
  PRIORITY_STEP,
  axisPct,
  clampPriority,
  clockLabel,
  conflictingPriorities,
  defaultCaesarPlan,
  loadCaesarPlan,
  minuteIdxLabel,
  nyAxisMinutesNow,
  rankAssignments,
  saveCaesarPlan,
  segmentAtAxisMinute,
  segmentRangeLabel,
  windowFit,
} from "@/lib/caesar/schedule";
import type {
  CaesarAssignment,
  CaesarPlan,
  CaesarSegment,
  CaesarSegmentKey,
  WindowFit,
} from "@/lib/caesar/schedule";

// =========================
// HELPERS
// =========================

/** #rrggbb -> rgba(). Segment colours are plain hex so they can be tinted for fills and glows. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Caesar renders on a dark surface in every theme, like the Sonar and Scanner shells.
 *
 * Two things force it: the shared `GlitchTitle` hardcodes white text with an accent glow, and the
 * segment bands are colour-over-dark (`withAlpha` fills tuned against black). Both wash out on a
 * light background, so the panels carry their own backdrop instead of following `useUi().isDark`.
 */
const PANEL = "border border-white/[0.06] bg-[#0a0a0a]/50 shadow-xl backdrop-blur-md";

const HOUR_TICKS = Array.from({ length: 25 }, (_, i) => i * 60);
const HALF_HOUR_TICKS = Array.from({ length: 24 }, (_, i) => i * 60 + 30);

const FIT_COPY: Record<WindowFit, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  full: { label: "COVERS SEGMENT", tone: "ok" },
  partial: { label: "PARTIAL WINDOW", tone: "warn" },
  none: { label: "OUTSIDE WINDOW", tone: "bad" },
  unknown: { label: "NO ENGINE YET", tone: "muted" },
};

// =========================
// COMPONENT
// =========================

export default function CaesarSchedule() {
  // The plan lives in localStorage, so it can only be read after mount — rendering the default
  // during SSR and swapping on mount would flash a wrong plan, so hold the UI until it is loaded.
  const [plan, setPlan] = useState<CaesarPlan | null>(null);
  const [selected, setSelected] = useState<CaesarSegmentKey>("intra");
  const [pickerFor, setPickerFor] = useState<CaesarSegmentKey | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  /**
   * The bridge's master switch: whether the stored plan is allowed to start and stop strategies.
   * `null` until the bridge answers, so the button never claims a state it has not confirmed.
   */
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setPlan(loadCaesarPlan());
  }, []);

  /**
   * Whether a toggle is in flight, and whether the bridge could be reached.
   *
   * Both exist because the button had neither: it read the bridge once at mount and never again,
   * so it could sit on "Schedule on" while the bridge had it off — and a click then looked like it
   * did nothing, because the state it was flipping to was the state already shown.
   */
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  /** Set while a value came FROM the bridge, so the auto-push does not echo it straight back. */
  const remoteEchoRef = useRef(false);

  const pullSchedule = useCallback(async () => {
    const remote = await fetchBridgePlan();
    if (remote == null) {
      setScheduleError(true);
      return;
    }
    setScheduleError(false);
    setScheduleEnabled((prev) => {
      const next = remote.plan.enabled;
      if (prev === next) return prev;
      remoteEchoRef.current = true;
      return next;
    });
  }, []);

  // Polled on the same cadence as the clock. The switch starts and stops real strategies, so a
  // stale reading of it is worse than no reading.
  useEffect(() => {
    void pullSchedule();
    const id = window.setInterval(() => { void pullSchedule(); }, 30_000);
    return () => window.clearInterval(id);
  }, [pullSchedule]);

  useEffect(() => {
    const tick = () => setNowMin(nyAxisMinutesNow());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const mutate = useCallback((next: CaesarPlan) => {
    setPlan(next);
    saveCaesarPlan(next);
  }, []);

  const updateSegment = useCallback(
    (key: CaesarSegmentKey, fn: (rows: CaesarAssignment[]) => CaesarAssignment[]) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const next: CaesarPlan = { ...prev, [key]: fn(prev[key]) };
        saveCaesarPlan(next);
        return next;
      });
    },
    []
  );

  const addStrategy = useCallback(
    (segKey: CaesarSegmentKey, strategyKey: string) => {
      const strategy = CAESAR_STRATEGY_BY_KEY[strategyKey];
      if (!strategy) return;
      updateSegment(segKey, (rows) => {
        if (rows.some((r) => r.strategyKey === strategyKey)) return rows;
        return [...rows, { strategyKey, priority: strategy.defaultPriority, enabled: true }];
      });
      setPickerFor(null);
    },
    [updateSegment]
  );

  const removeStrategy = useCallback(
    (segKey: CaesarSegmentKey, strategyKey: string) => {
      updateSegment(segKey, (rows) => rows.filter((r) => r.strategyKey !== strategyKey));
    },
    [updateSegment]
  );

  const setPriority = useCallback(
    (segKey: CaesarSegmentKey, strategyKey: string, priority: number) => {
      updateSegment(segKey, (rows) =>
        rows.map((r) => (r.strategyKey === strategyKey ? { ...r, priority: clampPriority(priority) } : r))
      );
    },
    [updateSegment]
  );

  const toggleStrategy = useCallback(
    (segKey: CaesarSegmentKey, strategyKey: string) => {
      updateSegment(segKey, (rows) =>
        rows.map((r) => (r.strategyKey === strategyKey ? { ...r, enabled: !r.enabled } : r))
      );
    },
    [updateSegment]
  );

  // Mirror every plan edit to the bridge. Debounced because the priority stepper fires per click,
  // and the bridge rewrites its state file on each PUT.
  useEffect(() => {
    if (plan == null || scheduleEnabled == null) return;
    // A value we just READ from the bridge must not be written back: that turns a poll into a
    // write loop, and worse, it would let a stale local value overwrite the bridge's own.
    if (remoteEchoRef.current) {
      remoteEchoRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void pushBridgePlan(plan, scheduleEnabled);
    }, 600);
    return () => window.clearTimeout(id);
  }, [plan, scheduleEnabled]);

  const toggleSchedule = useCallback(async () => {
    if (scheduleBusy) return;
    const next = !(scheduleEnabled ?? false);
    setScheduleBusy(true);
    try {
      // Push the plan first: enabling the switch against a stale server-side plan would run
      // yesterday's schedule for up to one tick.
      if (plan) await pushBridgePlan(plan, next);
      const result = await setBridgeScheduleEnabled(next);
      if (result == null) {
        // The bridge did not take it. Saying so beats showing the value we wanted, which is how a
        // switch ends up claiming to be on while nothing is scheduled.
        setScheduleError(true);
        await pullSchedule();
        return;
      }
      setScheduleError(false);
      setScheduleEnabled(result.enabled);
    } finally {
      setScheduleBusy(false);
    }
  }, [plan, scheduleEnabled, scheduleBusy, pullSchedule]);

  const nowSegment = nowMin == null ? null : segmentAtAxisMinute(nowMin);

  // NOT min-h-screen. This used to be the only thing on the page, so filling the viewport was
  // free; it is not any more. With ~645px of content the div still stretched to 100vh, and
  // everything rendered after it — the engines, the window binding, the positions terminal, the
  // live feed — started below the fold on a page that looked like it simply ended.
  return (
    <div className="w-full text-zinc-100">
      <div className="mx-auto w-full max-w-[1720px] px-6 py-8 lg:px-10">
        <Header
          nowLabel={nowMin == null ? null : clockLabel(nowMin)}
          nowSegment={nowSegment}
          scheduleEnabled={scheduleEnabled}
          scheduleBusy={scheduleBusy}
          scheduleError={scheduleError}
          onToggleSchedule={toggleSchedule}
          onReset={() => mutate(defaultCaesarPlan())}
        />

        {plan == null ? (
          <div className={`mt-6 rounded-2xl p-10 text-center text-sm text-white/45 ${PANEL}`}>
            Loading schedule…
          </div>
        ) : (
          <>
            {/* ---------- TIMELINE ---------- */}
            <section className={`mt-6 rounded-2xl p-5 ${PANEL}`}>
              <div className="overflow-x-auto pb-1">
                {/* px-6 keeps the 21:00 labels at both ends of the ruler — they are centred on a
                    tick at 0% / 100% — from being clipped by the scroll container. */}
                <div className="min-w-[1128px] px-6">
                  <Ruler />
                  <SessionBar selected={selected} nowMin={nowMin} onSelect={setSelected} />
                  <Connectors selected={selected} />

                  {/* ---------- SEGMENT CARDS ---------- */}
                  <div className="grid grid-cols-4 gap-3">
                    {CAESAR_SEGMENTS.map((seg) => (
                      <SegmentCard
                        key={seg.key}
                        seg={seg}
                        rows={plan[seg.key]}
                        selected={selected === seg.key}
                        isNow={nowSegment?.key === seg.key}
                        pickerOpen={pickerFor === seg.key}
                        onSelect={() => setSelected(seg.key)}
                        onTogglePicker={() => setPickerFor((cur) => (cur === seg.key ? null : seg.key))}
                        onAdd={(strategyKey) => addStrategy(seg.key, strategyKey)}
                        onRemove={(strategyKey) => removeStrategy(seg.key, strategyKey)}
                        onPriority={(strategyKey, value) => setPriority(seg.key, strategyKey, value)}
                        onToggle={(strategyKey) => toggleStrategy(seg.key, strategyKey)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- DETAIL PANEL ---------- */}
            <DetailPanel plan={plan} selected={selected} onSelect={setSelected} />
          </>
        )}
      </div>
    </div>
  );
}

// =========================
// HEADER
// =========================

/**
 * Same shell as the Sonar/Scanner headers: the shared GlitchTitle renders white text with an accent
 * glow, so it needs the dark surface underneath in every theme, not just the dark ones.
 */
function Header({
  nowLabel,
  nowSegment,
  scheduleEnabled,
  scheduleBusy,
  scheduleError,
  onToggleSchedule,
  onReset,
}: {
  nowLabel: string | null;
  nowSegment: CaesarSegment | null;
  scheduleEnabled: boolean | null;
  scheduleBusy: boolean;
  scheduleError: boolean;
  onToggleSchedule: () => void;
  onReset: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-3">
        <GlitchTitle text="CAESAR" />
      </div>

      <div className="flex items-center gap-3">
        {/* items-stretch makes the segment badge take the time's line-box height; the badge then
            centres its own label inside that box. */}
        {nowLabel && (
          <div className="flex items-stretch gap-2 px-1">
            <span className="font-mono text-3xl font-bold leading-none tabular-nums text-zinc-100">
              {nowLabel}
            </span>
            {nowSegment && (
              <span
                className="flex items-center rounded px-2 text-[10px] font-bold leading-none tracking-[0.15em]"
                style={{ backgroundColor: withAlpha(nowSegment.color, 0.16), color: nowSegment.color }}
              >
                {nowSegment.label}
              </span>
            )}
          </div>
        )}

        {/* The switch that decides whether the bridge may act on this plan. It starts and stops
            real strategies, so it is deliberately explicit rather than implied by editing. */}
        <button
          type="button"
          onClick={onToggleSchedule}
          disabled={scheduleEnabled == null || scheduleBusy}
          title={
            scheduleError
              ? "The bridge did not answer — this switch shows the last value it confirmed, not what you asked for."
              : "Let the bridge start and stop strategies at the edges of their segments"
          }
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors disabled:opacity-40 ${
            scheduleError
              ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
              : scheduleEnabled
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:border-emerald-300/70"
                : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25 hover:text-white"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              scheduleError
                ? "bg-rose-400"
                : scheduleEnabled
                  ? "bg-emerald-400 shadow-[0_0_8px_currentColor]"
                  : "bg-white/25"
            }`}
          />
          {scheduleBusy
            ? "Schedule …"
            : scheduleError
              ? "Bridge down"
              : scheduleEnabled == null
                ? "Schedule …"
                : scheduleEnabled
                  ? "Schedule on"
                  : "Schedule off"}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          Reset plan
        </button>
      </div>
    </header>
  );
}

// =========================
// RULER
// =========================

function Ruler() {
  return (
    <div className="relative h-11">
      {/* Half-hours: a bare dash, no label. */}
      {HALF_HOUR_TICKS.map((min) => (
        <div
          key={`half-${min}`}
          className="absolute bottom-0 w-px bg-white/10"
          style={{ left: `${axisPct(min)}%`, height: "6px" }}
        />
      ))}

      {/* Hours: tick + its own label. */}
      {HOUR_TICKS.map((min) => (
        <div key={`hour-${min}`} className="absolute bottom-0" style={{ left: `${axisPct(min)}%` }}>
          <div className="h-[11px] w-px bg-white/20" />
          <div className="absolute bottom-[13px] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tabular-nums text-white/45">
            {clockLabel(min)}
          </div>
        </div>
      ))}

      <div className="absolute bottom-0 h-px w-full bg-white/10" />
    </div>
  );
}

// =========================
// SESSION BAR
// =========================

function SessionBar({
  selected,
  nowMin,
  onSelect,
}: {
  selected: CaesarSegmentKey;
  nowMin: number | null;
  onSelect: (key: CaesarSegmentKey) => void;
}) {
  return (
    <div className="relative">
      {/* Grouping bracket, only where a segment is split across several bands: BLUE and ARK are two
          bands but one PRE segment, and the cards below are per segment, not per band. */}
      <div className="relative mb-1 h-4">
        {CAESAR_SEGMENTS.filter((seg) => seg.bands.length > 1).map((seg) => (
          <div
            key={`group-${seg.key}`}
            className="absolute inset-y-0 flex items-center gap-2"
            style={{ left: `${axisPct(seg.fromMin)}%`, width: `${axisPct(seg.toMin - seg.fromMin)}%` }}
          >
            <span className="h-px flex-1" style={{ backgroundColor: withAlpha(seg.color, 0.3) }} />
            <span
              className="text-[9px] font-bold tracking-[0.25em]"
              style={{ color: seg.color, opacity: selected === seg.key ? 1 : 0.7 }}
            >
              {seg.label}
            </span>
            <span className="h-px flex-1" style={{ backgroundColor: withAlpha(seg.color, 0.3) }} />
          </div>
        ))}
      </div>

      <div className="relative h-14 w-full overflow-hidden rounded-lg border border-white/10">
        {CAESAR_SEGMENTS.map((seg) =>
          seg.bands.map((band) => {
            const active = selected === seg.key;
            const widthPct = axisPct(band.toMin - band.fromMin);
            // OPEN is 60 of 1440 minutes — ~4.2% of the bar, about 45px wide. Every band keeps the
            // same type size; only the letter-spacing and padding are dropped on a narrow band,
            // since at 0.25em they alone would overflow "OPEN" past its own edges.
            const narrow = widthPct < 6;
            return (
              <button
                key={`${seg.key}-${band.fromMin}`}
                type="button"
                onClick={() => onSelect(seg.key)}
                title={`${seg.label} · ${band.label} · ${clockLabel(band.fromMin)} – ${clockLabel(band.toMin)}`}
                className="absolute inset-y-0 flex items-center justify-center overflow-hidden transition-all duration-200 focus:outline-none"
                style={{
                  left: `${axisPct(band.fromMin)}%`,
                  width: `${widthPct}%`,
                  backgroundColor: withAlpha(band.color, active ? 0.52 : 0.28),
                  boxShadow: active ? `inset 0 0 0 1px ${withAlpha(band.color, 0.8)}` : "none",
                }}
              >
                <span
                  className={`pointer-events-none truncate text-[11px] font-bold ${
                    narrow ? "px-0.5" : "px-2 tracking-[0.25em]"
                  }`}
                  style={{ color: "#ffffff", opacity: active ? 0.95 : 0.6 }}
                >
                  {band.label}
                </span>
              </button>
            );
          })
        )}

        {/* Segment boundaries, drawn over the bands so a band edge never reads as a colour seam. */}
        {CAESAR_SEGMENTS.slice(1).map((seg) => (
          <div
            key={`edge-${seg.key}`}
            className="pointer-events-none absolute inset-y-0 w-px bg-black/50"
            style={{ left: `${axisPct(seg.fromMin)}%` }}
          />
        ))}

        {nowMin != null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-white"
            style={{
              left: `${axisPct(nowMin)}%`,
              boxShadow: "0 0 10px rgba(255,255,255,0.65)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// =========================
// CONNECTORS
// =========================

/**
 * The bar is drawn to scale (OPEN is 2.8% of the day) but the cards below are an equal 4-column
 * grid, so each card needs a line back to the slice it edits.
 */
function Connectors({ selected }: { selected: CaesarSegmentKey }) {
  return (
    <svg className="h-9 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      {CAESAR_SEGMENTS.map((seg, i) => {
        const barX = axisPct((seg.fromMin + seg.toMin) / 2);
        const cardX = ((i + 0.5) / CAESAR_SEGMENTS.length) * 100;
        const active = selected === seg.key;
        return (
          <path
            key={seg.key}
            d={`M ${barX} 0 C ${barX} 55, ${cardX} 45, ${cardX} 100`}
            fill="none"
            stroke={seg.color}
            strokeOpacity={active ? 0.85 : 0.28}
            strokeWidth={active ? 1.6 : 1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <line
        x1="0"
        y1="99"
        x2="100"
        y2="99"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// =========================
// SEGMENT CARD
// =========================

function SegmentCard({
  seg,
  rows,
  selected,
  isNow,
  pickerOpen,
  onSelect,
  onTogglePicker,
  onAdd,
  onRemove,
  onPriority,
  onToggle,
}: {
  seg: CaesarSegment;
  rows: CaesarAssignment[];
  selected: boolean;
  isNow: boolean;
  pickerOpen: boolean;
  onSelect: () => void;
  onTogglePicker: () => void;
  onAdd: (strategyKey: string) => void;
  onRemove: (strategyKey: string) => void;
  onPriority: (strategyKey: string, value: number) => void;
  onToggle: (strategyKey: string) => void;
}) {
  const ranked = useMemo(() => rankAssignments(rows), [rows]);
  const conflicts = useMemo(() => conflictingPriorities(rows), [rows]);
  const assignedKeys = useMemo(() => new Set(rows.map((r) => r.strategyKey)), [rows]);

  return (
    <div
      onClick={onSelect}
      className="relative flex min-h-[132px] cursor-pointer flex-col rounded-xl border bg-white/[0.02] p-2.5 transition-all duration-200"
      style={{
        borderColor: selected ? withAlpha(seg.color, 0.55) : "rgba(255,255,255,0.08)",
        boxShadow: selected ? `0 0 24px ${withAlpha(seg.color, 0.13)}` : "none",
      }}
    >
      {/* Colour cap — a gradient for PRE, which spans two colours. */}
      <div
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl"
        style={{
          background:
            seg.bands.length > 1
              ? `linear-gradient(90deg, ${seg.bands
                  .map((b) => {
                    const from = ((b.fromMin - seg.fromMin) / (seg.toMin - seg.fromMin)) * 100;
                    const to = ((b.toMin - seg.fromMin) / (seg.toMin - seg.fromMin)) * 100;
                    return `${b.color} ${from}%, ${b.color} ${to}%`;
                  })
                  .join(", ")})`
              : seg.color,
          opacity: selected ? 1 : 0.55,
        }}
      />

      {/*
        The header is the segment's NAME and nothing else. The hours are already on the ruler
        directly above, the hint repeated what the name says, and the count is visible by looking.
        Three labels for one fact is three chances to read the wrong one.
      */}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[11px] font-black tracking-[0.2em]" style={{ color: seg.color }}>
          {seg.label}
        </span>
        {isNow && (
          <span className="rounded bg-white/15 px-1 py-px text-[8px] font-bold tracking-[0.15em] text-white">
            NOW
          </span>
        )}
      </div>

      {/* Two per row: a chip is an icon and a number, so a full-width one was mostly padding. */}
      <div className="mt-2 grid flex-1 grid-cols-2 content-start gap-1.5">
        {ranked.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-[10px] text-white/25">
            —
          </div>
        )}

        {ranked.map((row, index) => (
          <AssignmentChip
            key={row.strategyKey}
            row={row}
            rank={row.enabled ? index + 1 : null}
            seg={seg}
            conflicted={row.enabled && conflicts.has(row.priority)}
            onRemove={() => onRemove(row.strategyKey)}
            onPriority={(value) => onPriority(row.strategyKey, value)}
            onToggle={() => onToggle(row.strategyKey)}
          />
        ))}
      </div>

      <div className="relative mt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onTogglePicker();
          }}
          className="w-full rounded-lg border border-dashed border-white/12 py-1 text-[11px] leading-none text-white/35 transition-colors hover:border-white/30 hover:text-white/80"
        >
          {pickerOpen ? "×" : "+"}
        </button>

        {pickerOpen && (
          <StrategyPicker seg={seg} assigned={assignedKeys} onPick={onAdd} onClose={onTogglePicker} />
        )}
      </div>
    </div>
  );
}

// =========================
// ASSIGNMENT CHIP
// =========================

function AssignmentChip({
  row,
  rank,
  seg,
  conflicted,
  onRemove,
  onPriority,
  onToggle,
}: {
  row: CaesarAssignment;
  rank: number | null;
  seg: CaesarSegment;
  conflicted: boolean;
  onRemove: () => void;
  onPriority: (value: number) => void;
  onToggle: () => void;
}) {
  const strategy = CAESAR_STRATEGY_BY_KEY[row.strategyKey];
  if (!strategy) return null;

  const fit = windowFit(strategy, seg);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const iconInner = (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] transition-transform"
      style={{
        backgroundColor: withAlpha(seg.color, 0.14),
        boxShadow: `inset 0 0 0 1px ${withAlpha(seg.color, 0.3)}`,
      }}
    >
      {strategy.icon}
    </span>
  );

  // NO NAME. The icon identifies the strategy and the picker spells it out when you choose it;
  // repeating it on every chip is the single thing that forced these cards to be full width. The
  // name still reaches anyone who needs it, through the tooltip and the row below the cards.
  const label = `${strategy.name} · priority ${row.priority} · ${row.enabled ? "ON" : "OFF"}${
    fit === "full" ? "" : fit === "none" ? " · outside its trading window" : " · partly outside its window"
  }${conflicted ? " · priority clashes with another strategy here" : ""}`;

  return (
    <div
      title={label}
      className={`group flex items-center gap-1 rounded-lg border bg-white/[0.03] px-1 py-1 transition-opacity ${
        row.enabled ? "" : "opacity-40"
      }`}
      style={{
        // The only status colour left on the chip: a window that does not cover the segment, or a
        // priority two strategies share. Both change what actually happens; nothing else did.
        borderColor: conflicted
          ? "rgba(251,113,133,0.45)"
          : fit === "none"
            ? "rgba(251,146,60,0.35)"
            : "rgba(255,255,255,0.07)",
      }}
    >
      {strategy.nav ? (
        <Link href={strategy.nav.stream} onClick={stop} className="shrink-0 hover:scale-105">
          {iconInner}
        </Link>
      ) : (
        <span className="shrink-0 opacity-50">{iconInner}</span>
      )}

      {rank != null && (
        <span
          className={`shrink-0 rounded px-0.5 text-[8px] font-black tabular-nums ${
            rank === 1 ? "bg-amber-400/20 text-amber-300" : "bg-white/8 text-white/35"
          }`}
        >
          {rank}
        </span>
      )}

      {/* Priority — HIGHER WINS a contested ticker. */}
      <div onClick={stop} className="ml-auto flex shrink-0 items-center rounded-md bg-white/[0.05]">
        <StepButton label="−" onClick={() => onPriority(row.priority - PRIORITY_STEP)} />
        <input
          type="number"
          value={row.priority}
          min={MIN_PRIORITY}
          max={MAX_PRIORITY}
          onChange={(e) => onPriority(Number(e.target.value))}
          title="Priority — higher wins when two strategies claim the same ticker"
          className="w-7 border-0 bg-transparent p-0 text-center font-mono text-[11px] font-bold tabular-nums text-zinc-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <StepButton label="+" onClick={() => onPriority(row.priority + PRIORITY_STEP)} />
      </div>

      {/*
        ON / OFF for this segment.
        A 3px dot with no tooltip read as decoration rather than a control — compact is not the
        same as invisible. It is now a small switch: filled and pushed right when on, hollow and
        pushed left when off, and it says which in its title either way.
      */}
      <button
        type="button"
        onClick={(e) => { stop(e); onToggle(); }}
        title={row.enabled ? `${strategy.name}: ON — click to disable here` : `${strategy.name}: OFF — click to enable here`}
        aria-label={row.enabled ? "Disable on this segment" : "Enable on this segment"}
        aria-pressed={row.enabled}
        className="relative h-3.5 w-6 shrink-0 rounded-full border transition-colors"
        style={{
          borderColor: row.enabled ? withAlpha(seg.color, 0.65) : "rgba(255,255,255,0.22)",
          backgroundColor: row.enabled ? withAlpha(seg.color, 0.3) : "transparent",
        }}
      >
        <span
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full transition-all"
          style={{
            left: row.enabled ? "calc(100% - 10px)" : "2px",
            backgroundColor: row.enabled ? seg.color : "rgba(255,255,255,0.35)",
          }}
        />
      </button>

      {/* Faint until hovered rather than absent: a control you cannot find is not compact. */}
      <button
        type="button"
        onClick={(e) => { stop(e); onRemove(); }}
        title={`Remove ${strategy.name} from this segment`}
        aria-label="Remove from this segment"
        className="shrink-0 px-0.5 text-[12px] leading-none text-white/20 transition-colors hover:text-rose-300 group-hover:text-white/50"
      >
        ×
      </button>
    </div>
  );
}

function StepButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-1 text-[11px] font-bold leading-none text-white/35 transition-colors hover:text-white"
      style={{ paddingTop: 3, paddingBottom: 3 }}
    >
      {label}
    </button>
  );
}

function StrategyPicker({
  seg,
  assigned,
  onPick,
  onClose,
}: {
  seg: CaesarSegment;
  assigned: Set<string>;
  onPick: (strategyKey: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CAESAR_STRATEGIES.filter((s) => !assigned.has(s.key))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
      .sort((a, b) => {
        // Strategies with a real engine first — those are the ones that can actually run today.
        const aLive = a.nav ? 0 : 1;
        const bLive = b.nav ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return a.name.localeCompare(b.name);
      });
  }, [assigned, query]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-full left-0 z-30 mb-1.5 w-[280px] rounded-xl border border-white/12 bg-[#0b0b0c]/95 p-2 shadow-2xl backdrop-blur-xl"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Add to ${seg.label}…`}
        className="mb-1.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-zinc-100 outline-none placeholder:text-white/25"
      />
      <div className="max-h-[260px] overflow-y-auto">
        {options.length === 0 && (
          <div className="px-2 py-3 text-center text-[10px] text-white/30">Nothing left to add</div>
        )}
        {options.map((s) => {
          const fit = windowFit(s, seg);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onPick(s.key)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="w-5 shrink-0 text-center text-[13px]">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold text-zinc-200">{s.name}</span>
                <span className="block truncate text-[9px] text-white/35">
                  {s.nav ? FIT_COPY[fit].label : "no stream yet"}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/30">
                {s.defaultPriority}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =========================
// DETAIL PANEL
// =========================

function DetailPanel({
  plan,
  selected,
  onSelect,
}: {
  plan: CaesarPlan;
  selected: CaesarSegmentKey;
  onSelect: (key: CaesarSegmentKey) => void;
}) {
  const seg = CAESAR_SEGMENTS.find((s) => s.key === selected)!;
  const rows = useMemo(() => rankAssignments(plan[selected]), [plan, selected]);
  const conflicts = useMemo(() => conflictingPriorities(plan[selected]), [plan, selected]);


  return (
    <section className={`mt-5 rounded-2xl ${PANEL}`}>
      {/* Segment tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.07] p-2">
        {CAESAR_SEGMENTS.map((s) => {
          const active = s.key === selected;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] transition-colors"
              style={{
                backgroundColor: active ? withAlpha(s.color, 0.14) : "transparent",
                color: active ? s.color : "rgba(255,255,255,0.4)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="font-mono text-[10px] opacity-60">{plan[s.key].length}</span>
            </button>
          );
        })}
      </div>

      {/* The share-of-day figure was arithmetic anyone can do from the span, so only the span stays. */}
      <div className="flex flex-wrap items-baseline gap-x-4 px-4 pt-2">
        <span className="text-[12px] font-bold" style={{ color: seg.color }}>
          {seg.label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-white/55">{segmentRangeLabel(seg)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[11px] text-white/35">
          Nothing assigned to {seg.label}.
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-3 pt-2">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-left text-[9px] font-bold uppercase tracking-[0.15em] text-white/45">
                <th className="px-2 py-2">Rank</th>
                <th className="px-2 py-2">Strategy</th>
                <th className="px-2 py-2">Priority</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">Window</th>
                <th className="px-2 py-2">Pages</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const strategy = CAESAR_STRATEGY_BY_KEY[row.strategyKey];
                if (!strategy) return null;
                const fit = windowFit(strategy, seg);
                const conflicted = row.enabled && conflicts.has(row.priority);
                return (
                  <tr
                    key={row.strategyKey}
                    className={`border-t border-white/[0.05] text-[11px] ${row.enabled ? "" : "opacity-45"}`}
                  >
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums ${
                          row.enabled && index === 0
                            ? "bg-amber-400/20 text-amber-300"
                            : "bg-white/[0.06] text-white/40"
                        }`}
                      >
                        {row.enabled ? `#${index + 1}` : "—"}
                      </span>
                    </td>

                    {/*
                      This row is where the NAME lives — the chips above are icons only, so one
                      place has to spell them out. The description does not: it is a sentence about
                      the strategy, not about this assignment, and it doubled the row height.
                    */}
                    <td className="px-2 py-2" title={strategy.description}>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px]">{strategy.icon}</span>
                        {strategy.nav ? (
                          <Link
                            href={strategy.nav.stream}
                            className="font-semibold text-zinc-100 hover:underline"
                            style={{ textDecorationColor: seg.color }}
                          >
                            {strategy.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-white/70">{strategy.name}</span>
                        )}
                      </div>
                    </td>

                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-100">
                      {row.priority}
                      {conflicted && <span className="ml-1.5 text-[9px] font-bold text-amber-300">TIE</span>}
                    </td>

                    <td className="px-2 py-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em]"
                        style={{
                          backgroundColor: row.enabled ? withAlpha(seg.color, 0.15) : "transparent",
                          color: row.enabled ? seg.color : "rgba(255,255,255,0.35)",
                          boxShadow: row.enabled ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.12)",
                        }}
                      >
                        {row.enabled ? "ACTIVE" : "OFF"}
                      </span>
                    </td>

                    <td className="px-2 py-2 font-mono text-[11px] tabular-nums">
                      <span className={fit === "full" ? "text-white/70" : "text-amber-300"}>
                        {strategy.window
                          ? `${minuteIdxLabel(strategy.window.fromMinuteIdx)} – ${minuteIdxLabel(
                              strategy.window.toMinuteIdx
                            )}`
                          : "—"}
                      </span>
                      {fit !== "full" && (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-300/70">
                          {fit === "none" ? "outside" : "partial"}
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      {strategy.nav ? (
                        <div className="flex items-center gap-1.5">
                          {(
                            [
                              ["Stream", strategy.nav.stream],
                              ["Scanner", strategy.nav.scanner],
                              ["Sonar", strategy.nav.sonar],
                            ] as const
                          ).map(([label, href]) => (
                            <Link
                              key={label}
                              href={href}
                              className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/50 transition-colors hover:bg-white/[0.12] hover:text-white"
                            >
                              {label}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-white/45">not implemented</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-white/30">
        Priority mirrors the <span className="font-mono">strategyPriority</span> each stream passes to the bridge —
        higher wins when two strategies claim the same ticker at the same minute boundary. With the schedule ON this
        plan DOES drive the day: the bridge starts and stops each strategy on its segment, and the engines that have no
        bridge-side engine of their own are hosted below, so no stream page needs to stay open.
      </div>
    </section>
  );
}
