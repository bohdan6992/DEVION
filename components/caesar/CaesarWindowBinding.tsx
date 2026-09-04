"use client";

/**
 * Binding the Market Maker window, from the tab that actually runs the day.
 *
 * The bind is a MACHINE-level fact, not a strategy one: `_boundWindowStore` on the bridge is a
 * singleton, so there is one bound window no matter how many engines are mounted. Binding from
 * Arbitrage's panel binds it for PairFlux too, and clearing from either clears it for both.
 *
 * It nonetheless lived only inside the per-strategy stream panel — which Caesar keeps `hidden`, and
 * a display:none button cannot be clicked or tabbed to. So on the tab that hosts both engines the
 * control was unreachable without first expanding a panel belonging to one arbitrary strategy.
 *
 * HOW THE CAPTURE ACTUALLY WORKS, because it is not obvious and gets people the first time:
 * BindForegroundWindow() takes whatever window is in the FOREGROUND at the instant the request
 * lands. Click a button in the browser and the foreground window is the browser. That is what the
 * delayed variant is for — it waits, you bring the Market Maker window up, and it binds that.
 * "Bind now" is only useful from a keyboard shortcut or a second machine.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { bridgeUrl } from "@/lib/bridgeBase";

type BoundWindow = { title?: string | null; bound?: boolean | null } | null;

type Status = {
  boundWindow: BoundWindow;
  mainWindow: BoundWindow;
  panicOff?: boolean | null;
  executionMode?: string | null;
  transportMode?: string | null;
};

const POLL_MS = 4000;
const DELAY_MS = 3000;

export default function CaesarWindowBinding() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const alive = useRef(true);

  const pull = useCallback(async () => {
    try {
      const res = await fetch(bridgeUrl("/api/execution/tradingapp/status"), { cache: "no-store" });
      const json = (await res.json()) as Status;
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
    setCountdown(Math.round(DELAY_MS / 1000));
    const tick = window.setInterval(() => {
      setCountdown((c) => (c == null || c <= 1 ? null : c - 1));
    }, 1000);
    try {
      await call("delayed", `/api/execution/tradingapp/bind-active-window-delayed?delayMs=${DELAY_MS}`, "POST");
    } finally {
      window.clearInterval(tick);
    }
  }, [call]);

  const boundTitle = status?.boundWindow?.title ?? null;
  const mainTitle = status?.mainWindow?.title ?? null;
  const isBound = Boolean(status?.boundWindow);

  const btn =
    "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40";

  return (
    <div className="border-t border-white/[0.06] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Market Maker window
          </div>
          <div
            className={
              "mt-0.5 truncate font-mono text-[11px] " + (isBound ? "text-emerald-300" : "text-amber-300")
            }
          >
            {error
              ? `bridge unreachable — ${error}`
              : isBound
                ? boundTitle || "bound (no title)"
                : "not bound — hotkeys will go to whatever window has focus"}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
            main window: {mainTitle || "—"}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void bindDelayed()}
            className={btn + " border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"}
            title="Waits 3 seconds, then binds whatever window is in front — bring the Market Maker window up during the countdown."
          >
            {countdown != null ? `binding in ${countdown}…` : "Bind in 3s"}
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void call("now", "/api/execution/tradingapp/bind-active-window", "POST")}
            className={btn + " border-white/10 text-zinc-400 hover:text-zinc-200"}
            title="Binds the foreground window immediately — which, clicked from here, is this browser."
          >
            Bind now
          </button>
          <button
            type="button"
            disabled={busy != null || !isBound}
            onClick={() => void call("clear", "/api/execution/tradingapp/bound-window", "DELETE")}
            className={btn + " border-white/10 text-zinc-500 hover:text-rose-300"}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 font-mono text-[10px] text-white/25">
        One bound window for the whole bridge, shared by every mounted engine — binding here binds it
        for both strategies, and clearing clears it for both.
      </div>
    </div>
  );
}
