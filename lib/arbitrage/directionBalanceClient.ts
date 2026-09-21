"use client";

import { useEffect, useState } from "react";
import { bridgeUrl } from "../bridgeBase";

/**
 * What the bridge's direction auto-balance has done. The bridge decides everything - it counts the
 * book by side (every 10 min, every minute once a skew has triggered) and lowers the entry threshold of the under-represented side until the book is balanced - and
 * this is only its report, for the page to show.
 */
export type DirectionBalanceEvent = {
  atUtc: string;
  longs: number;
  shorts: number;
  action: string;
  reason?: string;
  shortAdjust: number;
  longAdjust: number;
};

export type DirectionBalanceState = {
  enabled: boolean;
  /** "watching" = trigger check every 10 min; "balancing" = a lowering is in force, re-checked every minute. */
  phase: string;
  /** How far the SHORT entry threshold (positive deviations) is currently lowered. */
  shortAdjust: number;
  /** How far the LONG entry threshold (negative deviations) is currently lowered. */
  longAdjust: number;
  lastLongs: number;
  lastShorts: number;
  lastCheckUtc: string | null;
  nextCheckUtc: string | null;
  lastAction: string;
  /** Why the last check did what it did - the counts against the trigger, in words. */
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
      lastLongs: Number(state.lastLongs) || 0,
      lastShorts: Number(state.lastShorts) || 0,
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
