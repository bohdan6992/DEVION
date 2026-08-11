"use client";

import { useLayoutEffect, type MutableRefObject } from "react";

/**
 * Reads the saved filter payload once and hands it to `apply`.
 *
 * The value here is the guard sequencing, which is easy to get subtly wrong and impossible to
 * notice when it is:
 *
 *   restoring = true  BEFORE anything is read, so the debounced writer cannot fire mid-restore and
 *                     persist a half-applied state.
 *   hydrated  = true  in `finally`, so it is set even when the payload is corrupt — otherwise a
 *                     single bad JSON blob would leave the scanner permanently unable to save.
 *   restoring = false in a microtask, not immediately: the setState calls `apply` just made have
 *                     not been flushed yet, and clearing the flag synchronously would let the
 *                     writer observe the pre-restore state and write it back.
 *
 * `useLayoutEffect` rather than `useEffect` so the restore lands before first paint and the user
 * never sees defaults flash over their saved filters.
 *
 * Per-field validation stays with the caller: each scanner checks ~200 fields against its own
 * vocabulary and carries back-compat for older payloads.
 */
export function useFilterRestore(
  lsKey: string,
  hydratedRef: MutableRefObject<boolean>,
  restoringRef: MutableRefObject<boolean>,
  apply: (saved: Record<string, any>) => void,
  deps: unknown[]
) {
  useLayoutEffect(() => {
    restoringRef.current = true;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) apply(JSON.parse(raw) as Record<string, any>);
    } catch {
      // ignore broken storage
    } finally {
      hydratedRef.current = true;
      queueMicrotask(() => {
        restoringRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
