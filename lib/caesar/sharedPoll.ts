"use client";

/**
 * One fetch loop per key, no matter how many components ask for it.
 *
 * Root cause found live 2026-09-09: `useMarketMakerWindow()` is called from BOTH CaesarControlBar
 * AND CaesarWindowBinding (two separate hook instances, two independent setInterval polls of
 * /status), and /api/execution/tradingapp/positions is polled independently by BOTH
 * CaesarPositions AND CaesarCharts. With two strategies also each running their own
 * heartbeat/state loops, a single Caesar tab had 8+ independent interval-driven pollers all
 * hitting http://localhost:5197 — which, being plain http (HTTP/1.1, not h2), caps Chrome at 6
 * concurrent connections PER ORIGIN. Requests past that cap don't fail outright — they sit
 * "pending" in the browser with no request line ever sent ("Provisional headers are shown", empty
 * response), until something frees a slot or fetchWithTimeout's own abort fires first — which is
 * exactly the "signal is aborted without reason" error the UI showed, even though a bare curl to
 * the same endpoint answered in milliseconds the whole time.
 *
 * The fix is not a longer timeout — it's fewer concurrent requests. This turns any number of
 * subscribers into exactly one fetch loop per (key, intervalMs): the first subscriber starts it,
 * the last unsubscribing stops it, and every subscriber gets the same result at the same time.
 */

type Fetcher<T> = () => Promise<T>;
type Listener<T> = (value: T | null, error: string | null) => void;

type Channel<T> = {
  value: T | null;
  error: string | null;
  listeners: Set<Listener<T>>;
  timer: number | null;
  inFlight: boolean;
  consecutiveFailures: number;
};

/**
 * A single missed tick right after mount — the moment SSE connections are still being established
 * and several pollers fire their first request together — is not "down", it is normal startup
 * contention that the very next tick (ERROR_THRESHOLD * intervalMs away, a few seconds) clears on
 * its own. Surfacing it immediately painted "BRIDGE DOWN" on a bridge that answered in 3ms the
 * whole time, every single time the page loaded. Requiring a few CONSECUTIVE failures before
 * reporting one is the fix: a real outage still surfaces, just not on its first, most easily
 * transient tick.
 */
const ERROR_THRESHOLD = 2;

const channels = new Map<string, Channel<any>>();

function getChannel<T>(key: string): Channel<T> {
  let ch = channels.get(key);
  if (!ch) {
    ch = { value: null, error: null, listeners: new Set(), timer: null, inFlight: false, consecutiveFailures: 0 };
    channels.set(key, ch);
  }
  return ch;
}

async function tick<T>(key: string, fetcher: Fetcher<T>) {
  const ch = getChannel<T>(key);
  if (ch.inFlight) return; // never stack a second poll of the SAME key on an unfinished one
  ch.inFlight = true;
  try {
    const value = await fetcher();
    ch.value = value;
    ch.error = null;
    ch.consecutiveFailures = 0;
  } catch (e: any) {
    ch.consecutiveFailures += 1;
    // Below threshold: keep the last good value on screen and say nothing was wrong yet — see
    // ERROR_THRESHOLD's doc comment.
    if (ch.consecutiveFailures >= ERROR_THRESHOLD) {
      ch.error = String(e?.message ?? e);
    }
  } finally {
    ch.inFlight = false;
    for (const listener of ch.listeners) listener(ch.value, ch.error);
  }
}

/**
 * Subscribe to a shared poll. The underlying fetch loop is created on the first subscriber for
 * `key` and torn down when the last one unsubscribes — every other subscriber in between just
 * receives the same result, with no extra network traffic of its own.
 */
export function subscribeSharedPoll<T>(
  key: string,
  fetcher: Fetcher<T>,
  intervalMs: number,
  listener: Listener<T>,
): () => void {
  const ch = getChannel<T>(key);
  ch.listeners.add(listener);

  // A subscriber joining after the channel already has data should see it immediately, not wait
  // for the next tick — otherwise a component that mounts between ticks renders "loading" for up
  // to `intervalMs` for no reason.
  if (ch.value !== null || ch.error !== null) {
    listener(ch.value, ch.error);
  }

  if (ch.timer == null) {
    void tick(key, fetcher);
    ch.timer = window.setInterval(() => void tick(key, fetcher), intervalMs);
  }

  return () => {
    ch.listeners.delete(listener);
    if (ch.listeners.size === 0 && ch.timer != null) {
      window.clearInterval(ch.timer);
      ch.timer = null;
    }
  };
}
