"use client";

/**
 * The controls that actually start the day, on one row under the timeline.
 *
 * They used to be in three places: the schedule switch and the reset button in the page header,
 * the Market Maker bind three panels further down inside "Live engines". That is the wrong shape
 * for what they are — a pre-flight checklist, run in order, once, before anything trades:
 *
 *   0. turn the engine on             — without it NOTHING ticks anywhere, not even preview
 *   1. bind the Market Maker window   — without it hotkeys go to whatever has focus
 *   2. start the schedule             — without it CaesarPlanService returns on its first line
 *
 * (The reset-the-plan key that used to sit here is gone, 2026-11-05 — the operator's own
 * instruction: unneeded.)
 *
 * Under the timeline is where that belongs — but OUTSIDE its frame, on the page itself: they act
 * on the plan rather than being part of it, and the two things you look at before pressing START
 * are still both on screen at once.
 *
 * WHY ENGINE IS SEPARATE FROM SCHEDULE. ServerEngineControlService.Enabled gates the very first
 * line of ServerStrategyRunner.TickAsync — off, no strategy ever ticks, so every candidate screen
 * reads "never ticked" and stays that way, with no error banner anywhere (every request the UI
 * makes still succeeds; it just always answers empty). It ships off by default and is persisted
 * per machine, so a fresh deploy to a machine that has never had this flipped looks exactly like a
 * broken bridge until someone finds this switch — which, before this button existed, had no UI at
 * all and required a raw POST. Schedule (below) is one level up: it only decides whether the
 * ENGINE'S ticks are allowed to start/stop real automation, so it means nothing while this is off.
 *
 * STYLE. Soft glass keys, not outlined buttons: a flat translucent white fill that lifts on hover,
 * one radius, one height, icons at 1.5px stroke. START is the same key stretched to hold a word,
 * so it reads as the primary of a set rather than a different kind of control.
 */

import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { getBridgeBaseUrl } from "@/lib/bridgeBase";
import { useMarketMakerWindow } from "./useMarketMakerWindow";
import { useSegmentDirectionBalance } from "./useSegmentDirectionBalance";

export type CaesarControlBarProps = {
  /** null until the bridge answers — the switch never claims a state it has not confirmed. */
  engineEnabled: boolean | null;
  engineBusy: boolean;
  engineError: boolean;
  onToggleEngine: () => void;
  scheduleEnabled: boolean | null;
  scheduleBusy: boolean;
  scheduleError: boolean;
  onToggleSchedule: () => void;
};

/**
 * RUNNING IS RED, ALWAYS — not the current segment's band colour.
 *
 * This key used to glow whatever colour the clock's own segment carried (green/yellow/red/orange
 * depending on the hour), which answers "what band is this" rather than "is real money moving
 * right now". Those are different questions and the button only needs to answer the second one —
 * a single fixed, unmistakable colour for "live", so a glance never has to also remember which
 * band is which colour today.
 */
const RUNNING_RED = "#f43f5e";

/**
 * Deliberately not RUNNING_RED: the engine being on does not mean real money is moving (that is
 * still Schedule's job below) — it means the tick loop is alive and candidate screens populate.
 * A calmer "system is alive" colour keeps the two questions visually distinct.
 */
const ENGINE_ON = "#38bdf8";

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

/** Power glyph: the engine's own master switch. */
function IconPower(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={14} height={14} {...p}>
      <path d="M12 3v8" />
      <path d="M7 5.5a8 8 0 1 0 10 0" />
    </svg>
  );
}

/** A balance scale: the whole-PRE-segment direction hedge. */
function IconScale(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16} {...p}>
      <path d="M12 3v15" />
      <path d="M7 6h10" />
      <path d="M4 10l3-4 3 4" />
      <path d="M14 10l3-4 3 4" />
      <path d="M4 10a3 3 0 0 0 6 0" />
      <path d="M14 10a3 3 0 0 0 6 0" />
      <path d="M8 21h8" />
    </svg>
  );
}

/** One labeled row inside the HEDGE panel — label + spinner in a single h-7 pill, Spinner Input
 * Standard shape (one shared outer pill, label and input vertically centered together). */
function HedgeFieldRow({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20" title={title}>
      <span className="flex h-7 w-14 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );
}

/** The spinner box itself — Spinner Input Standard: transparent, centered mono digits, arrows flush
 * right, hover/focus only. `valueClassName` colors the digits per field (RATIO/GAP/PERIOD each get
 * their own role color, operator's own instruction — same "one color per role" shape the Spinner
 * Input Standard's coral/mint/silver/amber boxes already use elsewhere, just applied to the digits
 * here since this control's three fields share one outer pill rather than three separate ones). */
function HedgeNumberInput({
  value, step, min, onChange, valueClassName,
}: { value: number; step: number; min: number; onChange: (v: number) => void; valueClassName?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n) && n >= min) onChange(n);
  };
  const bump = (dir: 1 | -1) => {
    const next = Math.max(min, +((Number.isFinite(value) ? value : min) + dir * step).toFixed(4));
    setText(String(next));
    onChange(next);
  };

  return (
    // w-16, not the usual Spinner Input Standard w-14 — this is its own local component (not the
    // shared SpinnerInput.tsx every other w-14 box in the app reuses), and GAP's own step (500)
    // reaches 5-digit values (10000+) routinely; w-14's 36px of text room clipped them against the
    // always-reserved arrow-column padding (operator's own report, 2026-11-09).
    <div className="group relative h-7 w-16 overflow-hidden rounded-md">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={text}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onBlur={() => setText(String(value))}
        aria-label="Hedge setting"
        className={clsx(
          "center-spin h-7 w-full bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]",
          valueClassName ?? "text-zinc-200"
        )}
      />
      <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(1)} className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Increase">▲</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-1)} className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Decrease">▼</button>
      </div>
    </div>
  );
}

export default function CaesarControlBar({
  engineEnabled,
  engineBusy,
  engineError,
  onToggleEngine,
  scheduleEnabled,
  scheduleBusy,
  scheduleError,
  onToggleSchedule,
}: CaesarControlBarProps) {
  const mm = useMarketMakerWindow();
  const hedge = useSegmentDirectionBalance();
  const running = scheduleEnabled === true;
  const engineOn = engineEnabled === true;

  // The hedge key's own inline reveal — NOT a floating panel: clicking it grows the row itself to
  // show the same pill group the old ArbitrageScanner.tsx toolbar used (segmented ON/OFF, RATIO/GAP
  // boxes, S/L status), in place, same h-7 row (the operator's own explicit style reference,
  // 2026-11-05).
  const [hedgePanelOpen, setHedgePanelOpen] = useState(false);
  const hedgePanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hedgePanelOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (hedgePanelRef.current && !hedgePanelRef.current.contains(e.target as Node)) setHedgePanelOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setHedgePanelOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hedgePanelOpen]);

  /*
   * "Bridge down" with the bridge itself answering curl in 3ms, CORS clean, was traced to
   * `getBridgeBaseUrl()` — a `?bridge=` query param used once (a headless test, a tunnel, a
   * second machine) writes to `localStorage["bridgeApiBase"]` and every request goes there
   * FOREVER after, silently, surviving reloads and rebuilds. Surfacing the resolved base right
   * on the error state is the whole fix for next time: no more guessing whether it's the
   * server or a five-months-stale localStorage key (2026-09-09).
   */
  const resolvedBridgeBase = getBridgeBaseUrl();

  return (
    /* No padding and no frame: standing on the page between two panels, the row aligns to their
       OUTER edge, which is what makes it read as a separate thing acting on the plan rather than a
       footer belonging to it. */
    <div className="mt-3 flex items-center justify-between">
      {/* HedgeNumberInput's own `.center-spin` rule only hides the native number-input steppers on
          pages that mount ScannerGlobalStyles — the Caesar page never does, so the browser's own
          up/down arrows were showing doubled up with this component's own ▲▼ buttons (operator's own
          report, 2026-11-09). Scoped locally here instead of pulling in that whole component (which
          carries other Scanner-specific rules this page has no business inheriting). */}
      <style jsx global>{`
        input.center-spin[type="number"] {
          -moz-appearance: textfield;
        }
        input.center-spin[type="number"]::-webkit-outer-spin-button,
        input.center-spin[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
      {/* ---- the keys ---- */}
      <div className="flex items-center gap-2">
        {/*
          ENGINE. The master switch one level below Schedule — see the file header for why it is
          separate. Off, nothing below it (Schedule, MM bind, any candidate screen) can produce
          anything, so this is deliberately the first key in the row.
        */}
        <button
          type="button"
          onClick={onToggleEngine}
          disabled={engineBusy || (engineEnabled == null && !engineError)}
          title={
            engineError
              ? `The bridge did not answer at ${resolvedBridgeBase} — this shows the last value it confirmed, not what you asked for. If that address is wrong, clear localStorage["bridgeApiBase"] or drop the ?bridge= param and reload.`
              : engineOn
                ? "Engine running: strategies tick and their candidate screens populate. Click to stop the tick loop entirely — nothing will tick anywhere, not even for preview."
                : "Engine off: nothing ticks anywhere, so every strategy reads \"never ticked\" with no error shown — this is the master switch underneath Schedule. Click to start the tick loop."
          }
          className={KEY + " gap-2 px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"}
          style={
            engineError
              ? { color: "#fda4af", backgroundColor: "rgba(253,164,175,0.10)", borderColor: "rgba(253,164,175,0.24)" }
              : engineOn
                ? { color: ENGINE_ON, backgroundColor: `${ENGINE_ON}1c`, borderColor: `${ENGINE_ON}44` }
                : undefined
          }
        >
          <IconPower />
          {engineBusy || engineEnabled == null
            ? "…"
            : engineError
              ? "Retry bridge"
              : engineOn
                ? "Engine on"
                : "Engine off"}
        </button>

        {/* Arbitrage and PairFlux no longer have a shadow toggle here — the bridge now forces
            both permanently live (ServerEngineControlService.IsShadow, 2026-09-18), so there is
            nothing left for a button to switch. */}

        {/*
          MARKET MAKER. One button, two meanings, because the bind has exactly two states and a
          second button for the other one is how you end up clearing a window you meant to rebind.
          Bound -> clears. Not bound -> binds immediately.

          NOT a delayed capture. `bind-active-window` (BindForegroundWindow, despite its name)
          finds the Market Maker Window by TITLE — EnumWindows + a title match — and never reads
          the OS foreground at all. The 3-second countdown this used to run was solving a problem
          that does not exist: it cannot matter whether the browser or the Market Maker has focus,
          since the bind never looks. Waiting only made the button slower and suggested a manual
          window-switch that was never necessary — verified straight from the C# locator, which is
          also why the detail panel's own "Bind now" button already used the immediate call.
        */}
        <button
          type="button"
          disabled={mm.busy != null}
          onClick={() => void (mm.isBound ? mm.clear() : mm.bindNow())}
          title={
            mm.error
              ? `Bridge unreachable at ${resolvedBridgeBase} — ${mm.error}. If that is not your bridge's real address, clear localStorage["bridgeApiBase"] or drop the ?bridge= param.`
              : mm.isBound
                ? `Bound to ${mm.boundTitle || "(no title)"} — click to unbind`
                : "Connect the Market Maker window — finds it by title and binds it immediately, wherever it is (foreground, minimized, another monitor)."
          }
          aria-label={mm.isBound ? "Unbind the Market Maker window" : "Connect the Market Maker window"}
          className={KEY + " w-10"}
          style={
            mm.isBound
              ? { color: "#6ee7b7", backgroundColor: "rgba(110,231,183,0.10)", borderColor: "rgba(110,231,183,0.22)" }
              : mm.error
                ? { color: "#fda4af", backgroundColor: "rgba(253,164,175,0.08)", borderColor: "rgba(253,164,175,0.20)" }
                : undefined
          }
        >
          <IconCrosshair />
          {/* A live bind is a state you must be able to see without hovering. */}
          {mm.isBound && (
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 6px rgba(110,231,183,0.9)" }}
            />
          )}
        </button>

        {/*
          START. The one that lets the bridge act on the plan at all — CaesarPlanService.Apply
          returns immediately while this is off, so nothing starts and nothing stops, whatever the
          timeline above shows.
        */}
        <button
          type="button"
          onClick={onToggleSchedule}
          disabled={scheduleBusy || (scheduleEnabled == null && !scheduleError)}
          title={
            scheduleError
              ? `The bridge did not answer at ${resolvedBridgeBase} — this shows the last value it confirmed, not what you asked for. If that address is wrong, clear localStorage["bridgeApiBase"] or drop the ?bridge= param and reload.`
              : running
                ? "Running: Arbitrage and PairFlux are started, and the bridge keeps handing off the rest of the day at each segment edge. Click to stop both."
                : "Starts Arbitrage and PairFlux right now, and lets the bridge take over segment handoffs for the rest of the day."
          }
          className={KEY + " gap-2 px-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"}
          style={
            scheduleError
              ? { color: "#fda4af", backgroundColor: "rgba(253,164,175,0.10)", borderColor: "rgba(253,164,175,0.24)" }
              : running
                ? {
                    color: RUNNING_RED,
                    backgroundColor: `${RUNNING_RED}1c`,
                    borderColor: `${RUNNING_RED}44`,
                    boxShadow: `0 0 22px -8px ${RUNNING_RED}`,
                  }
                : undefined
          }
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {running && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ backgroundColor: RUNNING_RED }}
              />
            )}
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: scheduleError ? "#fb7185" : running ? RUNNING_RED : "rgba(255,255,255,0.28)",
              }}
            />
          </span>
          {scheduleBusy || scheduleEnabled == null
            ? "…"
            : scheduleError
              ? "Retry bridge"
              : running
                ? "Stop auto"
                : "Start auto"}
        </button>

      </div>

      {/*
        HEDGE. The whole-PRE-segment QQQ direction hedge (operator's own instruction, 2026-11-05) —
        moved here from ArbitrageScanner.tsx's own BALANCE/HEDGED/RATIO/GAP toolbar, now judging the
        combined book of every ACTIVE PRE strategy instead of just Arbitrage's own.
        PLACEMENT (operator's own instruction, 2026-11-05): the opposite side of the row's FULL
        screen width, not just after the other keys — `justify-between` on the outer row puts this
        group at the far right regardless of how wide the left cluster is.
        REVEAL STYLE (operator's own instruction, 2026-11-05): NOT a floating popover — clicking the
        icon grows this group INLINE, in place, into the exact pill style ArbitrageScanner.tsx's old
        toolbar used (DirectionBalanceControls, before it moved here): one segmented switch pill,
        then one RATIO/GAP/status pill, both h-7, `rounded-lg bg-black/20` — same shapes, just OFF/
        HEDGE instead of BALANCE/HEDGED now that classic (threshold-lowering) mode is gone.
      */}
      <div ref={hedgePanelRef} className="flex items-center gap-2">
        {hedgePanelOpen && (
          <>
            {/* ONE toggle, not a segmented OFF/HEDGE pair — a single mode is active at a time by
                construction now (operator's own instruction, 2026-11-09), click flips hedge.enabled.
                Active = green, inactive = red (operator's own explicit color choice) — not this
                control's own former violet accent, which stays on the icon key only. */}
            <button
              type="button"
              onClick={() => hedge.setEnabled(!hedge.enabled)}
              aria-pressed={hedge.enabled}
              title={
                hedge.enabled
                  ? "HEDGE on — click to turn off."
                  : "HEDGE off — click to turn on. On a skew, sends real QQQ buy/sell orders across the whole PRE segment's combined book to close the BP gap."
              }
              className={clsx(
                "flex h-7 items-center justify-center rounded-lg px-3 text-[10px] font-mono font-bold uppercase tracking-wide leading-none transition-all",
                hedge.enabled
                  ? "bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.36)]"
                  : "bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.36)]"
              )}
            >
              {hedge.enabled ? "HEDGE" : "OFF"}
            </button>

            <div
              className={clsx("flex h-7 items-center gap-1 pl-2 pr-2 rounded-lg bg-black/20", !hedge.enabled && "opacity-60")}
            >
              {/* RATIO and GAP are mutually exclusive, not additive — DirectionBalancer.cs's own
                  `gapMode = s.MinGapBp > 0` is a flat switch, RATIO is not even read once GAP>0
                  (operator's own question, 2026-11-09: "як зрозуміти який режим зараз працює").
                  Dims whichever rule is NOT currently deciding, same "grayed out while inert" treatment
                  OPGRootationScanner.tsx's own RATE/UNIVERSE pair already uses for MINRATE/MINTOTAL. */}
              <span
                className={clsx("flex h-7 items-center text-[10px] font-mono uppercase tracking-wide", hedge.minGapBp > 0 ? "text-zinc-600" : "text-zinc-500")}
                title={hedge.minGapBp > 0 ? "RATIO is inactive — GAP above 0 overrides it." : "Trigger ratio: how many times more BP one side must hold than the other before the hedge acts. 2 = twice the notional on one side. Active now."}
              >
                RATIO
              </span>
              <HedgeNumberInput
                value={hedge.ratio} step={0.5} min={1.1} onChange={hedge.setRatio}
                valueClassName={hedge.minGapBp > 0 ? "text-violet-300/40" : "text-violet-300"}
              />
              <span
                className={clsx("flex h-7 items-center pl-1 text-[10px] font-mono uppercase tracking-wide", hedge.minGapBp > 0 ? "text-zinc-500" : "text-zinc-600")}
                title={hedge.minGapBp > 0 ? "MIN GAP (BP) — active now, overriding RATIO: any difference of at least this many BP is a skew." : "MIN GAP (BP). 0 = off, RATIO decides. Above 0 it replaces the ratio rule entirely."}
              >
                GAP
              </span>
              <HedgeNumberInput
                value={hedge.minGapBp} step={500} min={0} onChange={hedge.setMinGapBp}
                valueClassName={hedge.minGapBp > 0 ? "text-amber-300" : "text-amber-300/40"}
              />
              <span
                className="flex h-7 items-center pl-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wide"
                title="How often the combined book is checked and, if skewed, re-hedged — in minutes."
              >
                PERIOD
              </span>
              <HedgeNumberInput value={hedge.checkIntervalMinutes} step={5} min={1} onChange={hedge.setCheckIntervalMinutes} valueClassName="text-sky-300" />
              {hedge.enabled && (
                <span className="flex h-7 items-center gap-1.5 pl-2 text-[10px] font-mono tabular-nums select-none">
                  {hedge.status?.hedgedEpisode ? (
                    <span className={hedge.status.hedgeSide === "short" ? "text-rose-400/80" : "text-emerald-400/80"}>
                      QQQ {hedge.status.hedgeSide === "short" ? "−" : "+"}{hedge.status.hedgeOrdersOut}
                    </span>
                  ) : (
                    <>
                      <span className="text-emerald-400/80">S {hedge.status?.lastShortsBp ? Math.round(hedge.status.lastShortsBp).toLocaleString() : "·"}</span>
                      <span className="text-rose-400/80">L {hedge.status?.lastLongsBp ? Math.round(hedge.status.lastLongsBp).toLocaleString() : "·"}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setHedgePanelOpen((v) => !v)}
          title={
            hedge.enabled
              ? `HEDGE on — every ${hedge.checkIntervalMinutes}min, sums long/short BP across every active PRE strategy's combined book and sends real QQQ orders to close a skew of ratio ${hedge.ratio.toFixed(1)}:1${hedge.minGapBp > 0 ? ` or a gap of ${hedge.minGapBp.toLocaleString()} BP` : ""}. Click to show/hide settings.`
              : "HEDGE off — click to show/hide settings."
          }
          aria-label="Toggle hedge settings"
          aria-pressed={hedgePanelOpen}
          className={KEY + " w-10"}
          style={
            hedge.enabled
              ? { color: "#c4b5fd", backgroundColor: "rgba(196,181,253,0.10)", borderColor: "rgba(196,181,253,0.24)" }
              : undefined
          }
        >
          <IconScale />
          {hedge.status?.hedgedEpisode && (
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-violet-400"
              style={{ boxShadow: "0 0 6px rgba(196,181,253,0.9)" }}
              title="A hedge episode is currently open"
            />
          )}
        </button>
      </div>
    </div>
  );
}
