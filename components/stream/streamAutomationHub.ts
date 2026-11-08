"use client";

import { bridgeUrl, fetchWithTimeout } from "../../lib/bridgeBase";

export type StreamAutomationRemoteState = {
  autoEnabled?: boolean;
  strategyModeEnabled?: boolean;
};

type Entry = {
  strategyId: string;
  clientId: string;
  onState: (state: StreamAutomationRemoteState | null) => void;
};

const entries = new Map<string, Entry>();
let timer: number | null = null;
let inFlight = false;

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

async function tick(): Promise<void> {
  if (inFlight || entries.size === 0 || !visible()) return;
  inFlight = true;
  const current = [...entries.values()];
  try {
    await fetchWithTimeout(bridgeUrl("/api/stream/automation/heartbeat-batch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: current.map((entry) => ({
          clientId: entry.clientId,
          source: "stream-page",
          strategyId: entry.strategyId,
        })),
      }),
    });

    if (!visible()) return;
    const response = await fetchWithTimeout(bridgeUrl("/api/stream/automation/states"), { cache: "no-store" });
    const body = await response.json() as { states?: Array<StreamAutomationRemoteState & { strategyId?: string }> };
    const states = body.states ?? [];
    for (const entry of current) {
      const state = states.find((item) => item.strategyId?.toLowerCase() === entry.strategyId.toLowerCase()) ?? null;
      entry.onState(state);
    }
  } catch {
    // Connectivity is best-effort; the next shared tick retries for every active stream.
  } finally {
    inFlight = false;
  }
}

function ensureRunning(): void {
  if (timer != null) return;
  void tick();
  timer = window.setInterval(() => { void tick(); }, 10_000);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onFocus);
}

function stopIfUnused(): void {
  if (entries.size !== 0 || timer == null) return;
  window.clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("focus", onFocus);
}

function onVisibilityChange(): void {
  if (visible()) void tick();
}

function onFocus(): void {
  if (visible()) void tick();
}

/** One heartbeat and one state read for all Caesar-hosted browser strategies in this tab. */
export function registerStreamAutomation(
  strategyId: string,
  clientId: string,
  onState: (state: StreamAutomationRemoteState | null) => void,
): () => void {
  const key = strategyId.toLowerCase();
  entries.set(key, { strategyId, clientId, onState });
  ensureRunning();
  return () => {
    if (entries.get(key)?.clientId === clientId) entries.delete(key);
    stopIfUnused();
  };
}
