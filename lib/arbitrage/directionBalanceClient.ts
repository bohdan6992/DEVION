"use client";

import { useEffect, useState } from "react";
import { bridgeUrl } from "../bridgeBase";

/**
 * What the bridge's direction auto-balance has done. The bridge decides everything - it sums the
 * book's BPUsed by side (not a position count - a ticker scaled into several times carries more BP
 * than a single-shot one, see the bridge's own DirectionBalancer doc comment), every 10 min (every
 * minute once a skew has triggered), and either lowers the entry threshold of the under-represented
 * side (classic) or sends real QQQ hedge orders to close the gap directly (HEDGED) - this is only
 * its report, for the page to show.
 */
export type DirectionBalanceEvent = {
  atUtc: string;
  longsBp: number;
  shortsBp: number;
  action: string;
  reason?: string;
  shortAdjust: number;
  longAdjust: number;
};

export type DirectionBalanceState = {
  enabled: boolean;
  /** "watching" = trigger check every 10 min; "balancing" = an episode is in force, re-checked every minute. */
  phase: string;
  /** How far the SHORT entry threshold (positive deviations) is currently lowered. Classic mode only. */
  shortAdjust: number;
  /** How far the LONG entry threshold (negative deviations) is currently lowered. Classic mode only. */
  longAdjust: number;
  /** True for the whole current episode when it is running in HEDGED mode. */
  hedgedEpisode: boolean;
  /** The side HEDGED mode is currently manufacturing QQQ exposure for ("short"/"long"), or null. */
  hedgeSide: string | null;
  /** How many QQQ hotkey presses are currently open in that direction. */
  hedgeOrdersOut: number;
  lastLongsBp: number;
  lastShortsBp: number;
  lastCheckUtc: string | null;
  nextCheckUtc: string | null;
  lastAction: string;
  /** Why the last check did what it did - the BP sums against the trigger, in words. */
  lastReason: string;
  history: DirectionBalanceEvent[];
};

export async function fetchDirectionBalance(): Promise<DirectionBalanceState | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/arbitrage/balance"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => null);
    const state = json?.state;
    if (!state || typeof state !== "object") return null;
    return {
      enabled: !!state.enabled,
      phase: String(state.phase ?? "watching"),
      shortAdjust: Number(state.shortAdjust) || 0,
      longAdjust: Number(state.longAdjust) || 0,
      hedgedEpisode: !!state.hedgedEpisode,
      hedgeSide: typeof state.hedgeSide === "string" ? state.hedgeSide : null,
      hedgeOrdersOut: Number(state.hedgeOrdersOut) || 0,
      lastLongsBp: Number(state.lastLongsBp) || 0,
      lastShortsBp: Number(state.lastShortsBp) || 0,
      lastCheckUtc: state.lastCheckUtc ?? null,
      nextCheckUtc: state.nextCheckUtc ?? null,
      lastAction: String(state.lastAction ?? ""),
      lastReason: String(state.lastReason ?? ""),
      history: Array.isArray(state.history) ? state.history : [],
    };
  } catch {
    return null;
  }
}

/** Polls the report while the switch is on (and the tab is visible); null while it is off. */
export function useDirectionBalanceStatus(enabled: boolean, pollMs = 10_000): DirectionBalanceState | null {
  const [state, setState] = useState<DirectionBalanceState | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let alive = true;
    const pull = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const next = await fetchDirectionBalance();
      if (alive && next) setState(next);
    };
    void pull();
    // The push that turned the switch on is debounced, so the first answers can still say "off":
    // ask again shortly rather than showing nothing for a whole poll period.
    const soon = window.setTimeout(pull, 2500);
    const timer = window.setInterval(pull, pollMs);
    return () => {
      alive = false;
      window.clearTimeout(soon);
      window.clearInterval(timer);
    };
  }, [enabled, pollMs]);

  return state;
}
