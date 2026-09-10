"use client";

/**
 * The bound Market Maker window, as one piece of state.
 *
 * This was the body of `CaesarWindowBinding`, which owned both the polling and the panel it drew.
 * The control now lives in the toolbar under the timeline, and the panel keeps the detail — two
 * surfaces, one fact. Two copies of this fetch loop would be two answers to "is it bound", so the
 * state is a hook and the surfaces are just renderers of it.
 *
 * HOW THE CAPTURE ACTUALLY WORKS — this got the comment above wrong for a while, which is why
 * both a delayed and an immediate variant exist below: `BindForegroundWindow()` on the bridge
 * (despite its name) never reads the OS foreground at all. It finds the Market Maker Window by
 * TITLE (EnumWindows + a title match) and binds whatever that turns up, foreground or not,
 * minimized or not. `bindDelayed`'s 3-second wait was built on the assumption that the browser
 * stealing focus would bind the wrong window — it cannot, because the bind never looks at focus.
 * `bindNow` is what every caller should use; `bindDelayed` is kept only in case something still
 * calls it, not because waiting accomplishes anything.
 *
 * The bind is a MACHINE-level fact, not a strategy one: `_boundWindowStore` on the bridge is a
 * singleton, so there is one bound window no matter how many engines are mounted. Binding for
 * Arbitrage binds it for PairFlux too, and clearing from either clears it for both.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";

type BoundWindow = { title?: string | null; bound?: boolean | null } | null;

export type MarketMakerStatus = {
  boundWindow: BoundWindow;
  mainWindow: BoundWindow;
  panicOff?: boolean | null;
  executionMode?: string | null;
  transportMode?: string | null;
};

// Whether the window is bound rarely changes tick to tick (only when someone actually binds or
// clears it) — polling it every 4s bought almost nothing over polling it every 10s, while adding a
// request to the SAME small pool of HTTP/1.1 connections that two permanent SSE feeds (one per
// mounted strategy) already narrow. Measured live 2026-09-09: even a 3s timeout kept getting
// aborted repeatedly at 4s cadence — the queueing pressure, not the timeout length, was the
// problem. A less frequent poll is a direct cut to that pressure.
const POLL_MS = 10_000;
export const MARKET_MAKER_BIND_DELAY_MS = 3000;

export type MarketMakerWindow = {
  status: MarketMakerStatus | null;
  error: string | null;
  isBound: boolean;
  boundTitle: string | null;
  mainTitle: string | null;
  /** Seconds left in the delayed bind, or null when one is not running. */
  countdown: number | null;
  busy: string | null;
  bindDelayed: () => Promise<void>;
  bindNow: () => Promise<void>;
  clear: () => Promise<void>;
};

export function useMarketMakerWindow(): MarketMakerWindow {
  const [status, setStatus] = useState<MarketMakerStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const alive = useRef(true);

  const fetchStatus = useCallback(async () => {
    const res = await fetchWithTimeout(bridgeUrl("/api/execution/tradingapp/status"), { cache: "no-store" });
    return (await res.json()) as MarketMakerStatus;
  }, []);

  useEffect(() => {
    alive.current = true;
    // ONE poll of /status shared across every mounted instance of this hook (CaesarControlBar AND
    // CaesarWindowBinding both call it) — see sharedPoll.ts's doc comment for why that mattered:
    // two independent 4s pollers here were part of what pushed a Caesar tab over Chrome's 6
    // concurrent connections per origin (plain http, so HTTP/1.1).
    const unsubscribe = subscribeSharedPoll("mm-status", fetchStatus, POLL_MS, (value, err) => {
      if (!alive.current) return;
      if (err) {
        setError(err);
      } else {
        setStatus(value);
        setError(null);
      }
    });
    return () => { alive.current = false; unsubscribe(); };
  }, [fetchStatus]);

  const call = useCallback(async (label: string, path: string, method: "POST" | "DELETE") => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetchWithTimeout(bridgeUrl(path), { method, headers: { "Content-Type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `${res.status}`);
      // Updates THIS instance immediately rather than waiting on the shared poll's next tick (up
      // to POLL_MS away) — every other mounted instance still catches up within that same window,
      // which is fine for a secondary panel reflecting a bind this one just made.
      const fresh = await fetchStatus();
      if (alive.current) { setStatus(fresh); setError(null); }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
      setCountdown(null);
    }
  }, [fetchStatus]);

  /** The one that is actually usable from a browser: bind what is in front AFTER the delay. */
  const bindDelayed = useCallback(async () => {
    setCountdown(Math.round(MARKET_MAKER_BIND_DELAY_MS / 1000));
    const tick = window.setInterval(() => {
      setCountdown((c) => (c == null || c <= 1 ? null : c - 1));
    }, 1000);
    try {
      await call(
        "delayed",
        `/api/execution/tradingapp/bind-active-window-delayed?delayMs=${MARKET_MAKER_BIND_DELAY_MS}`,
        "POST",
      );
    } finally {
      window.clearInterval(tick);
    }
  }, [call]);

  const bindNow = useCallback(
    () => call("now", "/api/execution/tradingapp/bind-active-window", "POST"),
    [call],
  );

  const clear = useCallback(
    () => call("clear", "/api/execution/tradingapp/bound-window", "DELETE"),
    [call],
  );

  return {
    status,
    error,
    isBound: Boolean(status?.boundWindow),
    boundTitle: status?.boundWindow?.title ?? null,
    mainTitle: status?.mainWindow?.title ?? null,
    countdown,
    busy,
    bindDelayed,
    bindNow,
    clear,
  };
}
