"use client";

import { useRef } from "react";
import { EPISODES_SEARCH_CACHE_MAX, EPISODES_SEARCH_CACHE_TTL_MS } from "./api";

/**
 * Short-TTL cache for episodes-search results, with in-flight de-duplication.
 *
 * Two distinct jobs, and both are needed:
 *   the TTL map    stops a re-render or a tab switch from re-fetching rows that are seconds old;
 *   the in-flight  map means two callers asking for the same key at the same moment share one
 *                  request instead of racing — the episodes tab and the analytics tab routinely do.
 *
 * Refs rather than state on purpose: a cache write must not trigger a render.
 *
 * Eviction drops the oldest inserted key (Map preserves insertion order), not the least recently
 * used — with a handful of entries and a seconds-long TTL the difference does not pay for the
 * bookkeeping.
 */
export function useEpisodesSearchCache<TRow>() {
  const cacheRef = useRef<Map<string, { ts: number; rows: TRow[] }>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<TRow[]>>>(new Map());

  /**
   * Returns cached rows, joins an identical in-flight request, or runs `fetcher` — in that order.
   */
  async function get(key: string, fetcher: () => Promise<TRow[]>): Promise<TRow[]> {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.ts <= EPISODES_SEARCH_CACHE_TTL_MS) {
      return cached.rows;
    }

    const inFlight = inFlightRef.current.get(key);
    if (inFlight) return inFlight;

    const promise = fetcher()
      .then((rows) => {
        cacheRef.current.set(key, { ts: Date.now(), rows });
        if (cacheRef.current.size > EPISODES_SEARCH_CACHE_MAX) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey) cacheRef.current.delete(oldestKey);
        }
        return rows;
      })
      .finally(() => {
        inFlightRef.current.delete(key);
      });

    inFlightRef.current.set(key, promise);
    return promise;
  }

  return { get, cacheRef, inFlightRef };
}
