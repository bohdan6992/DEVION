"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchWithTimeout } from "@/lib/bridgeBase";
import { apiUrl } from "./api";

/**
 * What the bridge says about this strategy's scheduled START. All of it is the bridge's own
 * record — the page only displays it — so it is still true after a reload or a restart.
 */
export type ScheduledStartStatus = {
  /** The instant the bridge will start the strategy, or null when nothing is armed. */
  armedAtUtc: string | null;
  /** The START (NY "HH:mm") it was armed with. */
  startNyTime: string | null;
  /** What the last scheduled start did: "started on time", "started N min late …", "missed …". */
  lastOutcome: string | null;
  lastAtUtc: string | null;
};

type BridgeAutomationState = {
  scheduledStartEnabled?: boolean;
  scheduledStartAtUtc?: string | null;
  scheduledStartNyTime?: string | null;
  lastScheduledStartAtUtc?: string | null;
  lastScheduledStartOutcome?: string | null;
};

const HHMM = /^\d{1,2}:\d{1,2}$/;
const STATUS_POLL_MS = 30_000;
// Long enough that dragging the START stepper (one request per notch) does not fire a request
// per notch; short enough that pressing Start and looking away is safe.
const ARM_DEBOUNCE_MS = 600;

function toStatus(state: BridgeAutomationState | null | undefined): ScheduledStartStatus | null {
  if (!state) return null;
  return {
    armedAtUtc: state.scheduledStartEnabled ? state.scheduledStartAtUtc ?? null : null,
    startNyTime: state.scheduledStartEnabled ? state.scheduledStartNyTime ?? null : null,
    lastOutcome: state.lastScheduledStartOutcome ?? null,
    lastAtUtc: state.lastScheduledStartAtUtc ?? null,
  };
}

/**
 * Keeps the BRIDGE's scheduled start in step with the START/CUTOFF steppers, so the strategy
 * starts at START whether or not this tab is open, awake or even still loaded.
 *
 * The page never compares clocks. It hands the bridge START and CUTOFF and the bridge decides —
 * wrap-aware, so START 21:00 / CUTOFF 09:00 is the overnight session — whether START is still
 * ahead (it arms) or the session is already running (nothing to wait for). That replaces a
 * same-day comparison done here in the browser, which could not arm a start after midnight and
 * never re-armed when the stepper moved after Start had been pressed.
 *
 * Arms whenever the strategy is RUNNING and START/CUTOFF change. Disarming stays with the Stop
 * button, exactly as before: this hook never disarms just because the page has not learned yet
 * that the strategy is running (a fresh load reads "not running" for a moment).
 */
export function useScheduledStartArm(opts: {
  strategyId: string;
  running: boolean;
  startNyTime: string;
  cutoffNyTime: string;
}): ScheduledStartStatus | null {
  const { strategyId, running, startNyTime, cutoffNyTime } = opts;
  const [status, setStatus] = useState<ScheduledStartStatus | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!strategyId) return;
    try {
      const res = await fetchWithTimeout(
        apiUrl(`/api/stream/automation/state?strategyId=${encodeURIComponent(strategyId)}`),
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as { state?: BridgeAutomationState } | null;
      if (aliveRef.current && res.ok) setStatus(toStatus(json?.state));
    } catch {
      // Display only; the next poll tries again.
    }
  }, [strategyId]);

  // Read what the bridge holds now, then keep it fresh (a start that fired, or was missed, while
  // this tab sat idle shows up here).
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, running]);

  useEffect(() => {
    if (!running || !strategyId || !HHMM.test(startNyTime)) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(apiUrl("/api/stream/automation/scheduled-start"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            nyTime: startNyTime,
            cutoffNyTime: HHMM.test(cutoffNyTime) ? cutoffNyTime : undefined,
            strategyId,
          }),
        });
        const json = (await res.json().catch(() => null)) as { state?: BridgeAutomationState } | null;
        if (aliveRef.current && res.ok) setStatus(toStatus(json?.state));
      } catch {
        // Best effort: the immediate Start already covers this session; the poll above shows
        // whether anything is actually armed.
      }
    }, ARM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [running, strategyId, startNyTime, cutoffNyTime]);

  return status;
}
