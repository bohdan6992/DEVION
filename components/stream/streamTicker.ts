"use client";

/**
 * Timer that survives background-tab throttling.
 *
 * The engine's whole entry pipeline assumes MANY polls inside every minute: aboveSinceRef needs
 * ~10s of continuous qualification measured backward from a minute boundary, minuteAccumRef's
 * aboveSet is "state as of the last poll before the boundary", and minuteSnapshotRef is only
 * usable when consecutive minutes were actually observed (a skipped minute clears every streak).
 *
 * A plain window.setInterval cannot deliver that from a background tab. Chrome clamps hidden-page
 * timers to 1/second, then to 1/minute after ~5 minutes of being hidden ("intensive throttling").
 * One poll per minute degrades the entry logic to exactly the poll-timing lottery the minute
 * accumulator was built to eliminate — which is why "set START and walk away" silently fails.
 *
 * Worker timers are not subject to that clamping, so the interval lives in a worker and only the
 * tick notification crosses to the main thread. The worker is built from a Blob URL so no extra
 * bundler entry point is needed; if Worker or blob: URLs are unavailable (strict CSP, old
 * browser), it degrades to a normal setInterval rather than not ticking at all.
 *
 * What this does NOT fix: an actually sleeping machine. No page-level timer runs then. See
 * onMissedTicks for how that case is at least made visible instead of silent.
 */
export type StreamTickerHandle = {
  stop: () => void;
  /** True when the tick is coming from a worker (i.e. throttling-resistant). */
  isWorkerBacked: boolean;
};

export type StreamTickerOptions = {
  intervalMs: number;
  onTick: () => void;
  /**
   * Called when the gap between two ticks was far larger than intervalMs — the tab was throttled,
   * or the machine slept. Receives the observed gap so the caller can log/flag it.
   */
  onMissedTicks?: (gapMs: number, expectedMs: number) => void;
  /** Gap multiplier that counts as "missed". Default 5x the interval. */
  missedFactor?: number;
};

const WORKER_SOURCE = `
let timerId = null;
self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type === "start") {
    if (timerId !== null) clearInterval(timerId);
    timerId = setInterval(function () { self.postMessage("tick"); }, data.intervalMs);
  } else if (data.type === "stop") {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
  }
};
`;

export function startStreamTicker({
  intervalMs,
  onTick,
  onMissedTicks,
  missedFactor = 5,
}: StreamTickerOptions): StreamTickerHandle {
  let lastTickAt = Date.now();

  const fire = () => {
    const now = Date.now();
    const gap = now - lastTickAt;
    lastTickAt = now;
    if (onMissedTicks && gap > intervalMs * missedFactor) {
      onMissedTicks(gap, intervalMs);
    }
    onTick();
  };

  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    try {
      const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      worker.onmessage = fire;
      worker.postMessage({ type: "start", intervalMs });
      return {
        isWorkerBacked: true,
        stop: () => {
          try {
            worker.postMessage({ type: "stop" });
            worker.terminate();
          } catch {
            // worker already gone
          }
          URL.revokeObjectURL(url);
        },
      };
    } catch {
      // fall through to setInterval
    }
  }

  const id = setInterval(fire, intervalMs);
  return {
    isWorkerBacked: false,
    stop: () => clearInterval(id),
  };
}
