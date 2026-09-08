"use client";

/**
 * The bound Market Maker window, as one piece of state.
 *
 * This was the body of `CaesarWindowBinding`, which owned both the polling and the panel it drew.
 * The control now lives in the toolbar under the timeline, and the panel keeps the detail — two
 * surfaces, one fact. Two copies of this fetch loop would be two answers to "is it bound", so the
 * state is a hook and the surfaces are just renderers of it.
 *
 * HOW THE CAPTURE ACTUALLY WORKS, because it is not obvious and gets people the first time:
 * BindForegroundWindow() takes whatever window is in the FOREGROUND at the instant the request
 * lands. Click a button in the browser and the foreground window is the browser. That is what the
 * delayed variant is for — it waits, you bring the Market Maker window up, and it binds that.
 * "Bind now" is only useful from a keyboard shortcut or a second machine.
 *
 * The bind is a MACHINE-level fact, not a strategy one: `_boundWindowStore` on the bridge is a
 * singleton, so there is one bound window no matter how many engines are mounted. Binding for
 * Arbitrage binds it for PairFlux too, and clearing from either clears it for both.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { bridgeUrl } from "@/lib/bridgeBase";

type BoundWindow = { title?: string | null; bound?: boolean | null } | null;

export type MarketMakerStatus = {
  boundWindow: BoundWindow;
  mainWindow: BoundWindow;
  panicOff?: boolean | null;
  executionMode?: string | null;
  transportMode?: string | null;
};

const POLL_MS = 4000;
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

  const pull = useCallback(async () => {
    try {
      const res = await fetch(bridgeUrl("/api/execution/tradingapp/status"), { cache: "no-store" });
      const json = (await res.json()) as MarketMakerStatus;
      if (!alive.current) return;
      setStatus(json);
      setError(null);
    } catch (e: any) {
      if (!alive.current) return;
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void pull();
    const id = window.setInterval(pull, POLL_MS);
    return () => { alive.current = false; window.clearInterval(id); };
  }, [pull]);

  const call = useCallback(async (label: string, path: string, method: "POST" | "DELETE") => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(bridgeUrl(path), { method, headers: { "Content-Type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `${res.status}`);
      await pull();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
      setCountdown(null);
    }
  }, [pull]);

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
