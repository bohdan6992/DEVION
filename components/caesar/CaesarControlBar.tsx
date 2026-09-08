"use client";

/**
 * The three controls that actually start the day, on one row under the timeline.
 *
 * They used to be in three places: the schedule switch and the reset button in the page header,
 * the Market Maker bind three panels further down inside "Live engines". That is the wrong shape
 * for what they are — a pre-flight checklist, run in order, once, before anything trades:
 *
 *   1. bind the Market Maker window   — without it hotkeys go to whatever has focus
 *   2. start the schedule             — without it CaesarPlanService returns on its first line
 *   3. (reset the plan)               — the escape hatch, deliberately last and quietest
 *
 * Under the timeline is where that belongs — but OUTSIDE its frame, on the page itself: they act
 * on the plan rather than being part of it, and the two things you look at before pressing START
 * are still both on screen at once.
 *
 * STYLE. Soft glass keys, not outlined buttons: a flat translucent white fill that lifts on hover,
 * one radius, one height, icons at 1.5px stroke. START is the same key stretched to hold a word,
 * so it reads as the primary of a set rather than a different kind of control.
 */

import React from "react";

import { useMarketMakerWindow } from "./useMarketMakerWindow";

export type CaesarControlBarProps = {
  /** null until the bridge answers — the switch never claims a state it has not confirmed. */
  scheduleEnabled: boolean | null;
  scheduleBusy: boolean;
  scheduleError: boolean;
  onToggleSchedule: () => void;
  onReset: () => void;
  /** Colour of the segment the clock is standing in, for the running glow. */
  accent?: string;
};

const KEY =
  "group relative flex h-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.06] text-zinc-300 transition-all duration-150 hover:bg-white/[0.12] hover:text-white active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35";

/** Crosshair: aim at the window you want captured. */
function IconCrosshair(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width={17} height={17} {...p}>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3.4M12 18.6V22M2 12h3.4M18.6 12H22" />
    </svg>
  );
}

/** Counter-clockwise arrow: put the plan back the way it started. */
function IconReset(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={17} height={17} {...p}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4.5V10h5.5" />
    </svg>
  );
}

export default function CaesarControlBar({
  scheduleEnabled,
  scheduleBusy,
  scheduleError,
  onToggleSchedule,
  onReset,
  accent = "#3ddc97",
}: CaesarControlBarProps) {
  const mm = useMarketMakerWindow();
  const running = scheduleEnabled === true;
  const arming = mm.countdown != null;

  return (
    /* No padding and no frame: standing on the page between two panels, the row aligns to their
       OUTER edge, which is what makes it read as a separate thing acting on the plan rather than a
       footer belonging to it. */
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* ---- the keys ---- */}
      <div className="flex items-center gap-2">
        {/*
          MARKET MAKER. One button, two meanings, because the bind has exactly two states and a
          second button for the other one is how you end up clearing a window you meant to rebind.
          Bound -> clears. Not bound -> arms the 3s delayed capture, which is the only variant that
          can work from a browser click (see useMarketMakerWindow).
        */}
        <button
          type="button"
          disabled={mm.busy != null && !arming}
          onClick={() => void (mm.isBound ? mm.clear() : mm.bindDelayed())}
          title={
            mm.error
              ? `Bridge unreachable — ${mm.error}`
              : mm.isBound
                ? `Bound to ${mm.boundTitle || "(no title)"} — click to unbind`
                : "Connect the Market Maker: waits 3 seconds, then binds whatever window is in front. Bring the Market Maker up during the countdown."
          }
          aria-label={mm.isBound ? "Unbind the Market Maker window" : "Connect the Market Maker window"}
          className={KEY + (arming ? " w-[74px] px-0" : " w-10")}
          style={
            mm.isBound && !arming
              ? { color: "#6ee7b7", backgroundColor: "rgba(110,231,183,0.10)", borderColor: "rgba(110,231,183,0.22)" }
              : mm.error
                ? { color: "#fda4af", backgroundColor: "rgba(253,164,175,0.08)", borderColor: "rgba(253,164,175,0.20)" }
                : undefined
          }
        >
          {arming ? (
            <span className="font-mono text-[11px] font-bold tabular-nums text-amber-200">
              {mm.countdown}s
            </span>
          ) : (
            <IconCrosshair />
          )}
          {/* A live bind is a state you must be able to see without hovering. */}
          {mm.isBound && !arming && (
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 6px rgba(110,231,183,0.9)" }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          title="Reset the plan to its defaults. Edits are pushed to the bridge, so this changes what the schedule runs."
          aria-label="Reset plan"
          className={KEY + " w-10"}
        >
          <IconReset />
        </button>

        {/*
          START. The one that lets the bridge act on the plan at all — CaesarPlanService.Apply
          returns immediately while this is off, so nothing starts and nothing stops, whatever the
          timeline above shows.
        */}
        <button
          type="button"
          onClick={onToggleSchedule}
          disabled={scheduleEnabled == null || scheduleBusy}
          title={
            scheduleError
              ? "The bridge did not answer — this shows the last value it confirmed, not what you asked for."
              : running
                ? "Running: the bridge starts and stops each strategy at the edges of its segment. Click to stop scheduling."
                : "Let the bridge start and stop strategies at the edges of their segments."
          }
          className={KEY + " gap-2 px-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"}
          style={
            scheduleError
              ? { color: "#fda4af", backgroundColor: "rgba(253,164,175,0.10)", borderColor: "rgba(253,164,175,0.24)" }
              : running
                ? {
                    color: accent,
                    backgroundColor: `${accent}1c`,
                    borderColor: `${accent}44`,
                    boxShadow: `0 0 22px -8px ${accent}`,
                  }
                : undefined
          }
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {running && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ backgroundColor: accent }}
              />
            )}
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: scheduleError ? "#fb7185" : running ? accent : "rgba(255,255,255,0.28)",
              }}
            />
          </span>
          {scheduleBusy || scheduleEnabled == null
            ? "…"
            : scheduleError
              ? "Bridge down"
              : running
                ? "Stop auto"
                : "Start auto"}
        </button>
      </div>

      {/* ---- what the keys are reporting ----
          Beside them, not under them: three buttons whose state you have to hover to read is how
          a day starts with an unbound window. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="uppercase tracking-[0.16em] text-zinc-600">MM</span>
          <span className={"truncate " + (mm.error ? "text-rose-300/80" : mm.isBound ? "text-emerald-300/80" : "text-amber-300/80")}>
            {mm.error
              ? "bridge unreachable"
              : mm.isBound
                ? mm.boundTitle || "bound (no title)"
                : "not bound — hotkeys follow focus"}
          </span>
        </span>
        <span className="text-white/10">·</span>
        <span className="flex items-center gap-1.5">
          <span className="uppercase tracking-[0.16em] text-zinc-600">Schedule</span>
          <span className={scheduleError ? "text-rose-300/80" : running ? "text-emerald-300/80" : "text-zinc-500"}>
            {scheduleEnabled == null ? "reading…" : scheduleError ? "unreachable" : running ? "driving the day" : "off — nothing starts"}
          </span>
        </span>
      </div>
    </div>
  );
}
