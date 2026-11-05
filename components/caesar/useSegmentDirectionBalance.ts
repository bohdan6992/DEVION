"use client";

/**
 * The whole-PRE-segment QQQ direction hedge, as one piece of state for Caesar's own control bar —
 * same shape as useMarketMakerWindow.ts (the icon key's own click toggles `enabled` directly; the
 * panel that opens from it reads/edits ratio/minGapBp/checkIntervalMinutes and shows the live
 * status). See lib/caesar/segmentDirectionBalanceClient.ts / SegmentDirectionBalanceService.cs.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import {
  fetchSegmentDirectionBalanceParams,
  fetchSegmentDirectionBalanceStatus,
  pushSegmentDirectionBalanceParams,
  type SegmentDirectionBalanceParams,
  type SegmentDirectionBalanceStatus,
} from "@/lib/caesar/segmentDirectionBalanceClient";

const STATUS_POLL_MS = 5_000;
const PUSH_DEBOUNCE_MS = 600;

export type SegmentDirectionBalance = {
  enabled: boolean;
  ratio: number;
  minGapBp: number;
  checkIntervalMinutes: number;
  status: SegmentDirectionBalanceStatus | null;
  hydrated: boolean;
  setEnabled: (next: boolean) => void;
  setRatio: (next: number) => void;
  setMinGapBp: (next: number) => void;
  setCheckIntervalMinutes: (next: number) => void;
};

export function useSegmentDirectionBalance(): SegmentDirectionBalance {
  const [enabled, setEnabledState] = useState(false);
  const [ratio, setRatioState] = useState(2.0);
  const [minGapBp, setMinGapBpState] = useState(0);
  const [checkIntervalMinutes, setCheckIntervalMinutesState] = useState(10);
  const [status, setStatus] = useState<SegmentDirectionBalanceStatus | null>(null);
  const hydrated = useRef(false);
  const [hydratedFlag, setHydratedFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSegmentDirectionBalanceParams().then((p) => {
      if (cancelled) return;
      setEnabledState(p.enabled);
      setRatioState(p.ratio);
      setMinGapBpState(p.minGapBp);
      setCheckIntervalMinutesState(p.checkIntervalMinutes);
      hydrated.current = true;
      setHydratedFlag(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSharedPoll(
      "segment-direction-balance-status", fetchSegmentDirectionBalanceStatus, STATUS_POLL_MS,
      (value) => setStatus(value),
    );
    return unsubscribe;
  }, []);

  // One shared debounced push — every setter below lands here, same convention every other
  // toolbar in this codebase uses (edit a field, wait PUSH_DEBOUNCE_MS, push the whole set).
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      void pushSegmentDirectionBalanceParams({ enabled, ratio, minGapBp, checkIntervalMinutes });
    }, PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, ratio, minGapBp, checkIntervalMinutes]);

  const setEnabled = useCallback((next: boolean) => setEnabledState(next), []);
  const setRatio = useCallback((next: number) => setRatioState(Math.max(1.1, Math.min(20, Number.isFinite(next) ? next : 2))), []);
  const setMinGapBp = useCallback((next: number) => setMinGapBpState(Math.max(0, Math.min(1_000_000, Number.isFinite(next) ? Math.round(next) : 0))), []);
  const setCheckIntervalMinutes = useCallback(
    (next: number) => setCheckIntervalMinutesState(Math.max(1, Math.min(240, Number.isFinite(next) ? Math.round(next) : 10))),
    [],
  );

  return {
    enabled, ratio, minGapBp, checkIntervalMinutes, status, hydrated: hydratedFlag,
    setEnabled, setRatio, setMinGapBp, setCheckIntervalMinutes,
  };
}
