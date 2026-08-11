"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Writes the scanner's filter payload to localStorage, debounced.
 *
 * The payload is a ~200-field object, so serialising and writing it synchronously on every keystroke
 * blocked the main thread. The write is debounced instead, the last state within the window wins,
 * and the timer is flushed on unmount so nothing is lost when navigating away.
 *
 * Both guards matter and are not interchangeable:
 *   hydrated  — nothing may be written before the saved payload has been read back, or the first
 *               render's defaults would overwrite the user's saved filters.
 *   restoring — nothing may be written *during* the restore, for the same reason.
 *
 * Restoring itself is deliberately NOT here. It is ~200 lines of per-field validation and
 * back-compat that each scanner still owns; folding it in without care silently drops settings,
 * which is exactly the class of bug this file's guards exist to prevent.
 */
export function usePersistedFilters(
  lsKey: string,
  payload: unknown,
  hydratedRef: MutableRefObject<boolean>,
  restoringRef: MutableRefObject<boolean>,
  debounceMs = 400
) {
  // Read through a ref so the unmount flush writes the LATEST payload rather than the one captured
  // when the effect was created.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const write = () => {
    try {
      localStorage.setItem(lsKey, JSON.stringify(payloadRef.current));
    } catch {
      // ignore quota/storage errors
    }
  };
  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (restoringRef.current) return;

    const timer = window.setTimeout(() => writeRef.current(), debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, lsKey, debounceMs]);

  useEffect(() => {
    return () => {
      if (!hydratedRef.current || restoringRef.current) return;
      writeRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);
}
