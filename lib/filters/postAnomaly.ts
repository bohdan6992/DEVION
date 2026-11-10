"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/scanner/api";
import { getToken } from "@/lib/authClient";

/**
 * ANOM filter: a ticker whose post-market zap-sigma reading spiked past 1.5 sigma at any point
 * during that day's own 16:01-19:59 window is dropped from signals for the PRE session that
 * follows. No data for the ticker in that window drops it too (operator's own rule, 2026-11-10 —
 * see PostAnomalyService.cs on the bridge for the full spec).
 *
 * Same shape as sectorCorr.ts/CORR — a session-wide set computed on the bridge, fetched once and
 * shared across every mounted scanner/sonar — with one deliberate inversion: this holds the CLEAN
 * tickers, not the excluded ones, because the rule is fail-closed (absence => drop, whatever the
 * reason). Modelling it as an excluded set would need a second source of truth for "which tickers
 * exist" just to tell "spiked" and "no data" apart; a clean set needs none of that.
 */

export type PostAnomalyExclusion = {
  /** Tickers proven to have stayed within the threshold all window. Empty while unloaded — with
   * ANOM on, that fail-closed emptiness is what should happen, not a bug to work around. */
  clean: Set<string>;
  day: string | null;
  thresholdAbsSigma: number;
  loading: boolean;
  error: string | null;
};

const DEFAULT_THRESHOLD_ABS_SIGMA = 1.5;

const EMPTY: PostAnomalyExclusion = {
  clean: new Set<string>(),
  day: null,
  thresholdAbsSigma: DEFAULT_THRESHOLD_ABS_SIGMA,
  loading: false,
  error: null,
};

type FetchedClean = { day: string; clean: string[]; thresholdAbsSigma: number };

// One in-flight request and one answer shared across every scanner/sonar mounted in the tab — the
// clean set is the same answer for everyone on a given day, there is nothing per-caller to key on.
let cache: Promise<FetchedClean> | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 5 * 60_000;

async function fetchClean(): Promise<FetchedClean> {
  const now = Date.now();
  if (cache && now - cachedAtMs < CACHE_TTL_MS) return cache;

  const token = getToken();
  const request = fetch(apiUrl("/api/signals/anom/clean"), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      const clean = Array.isArray(json?.clean) ? json.clean.map((x: unknown) => String(x).toUpperCase()) : [];
      return {
        day: String(json?.day ?? ""),
        clean,
        thresholdAbsSigma: Number(json?.thresholdAbsSigma) || DEFAULT_THRESHOLD_ABS_SIGMA,
      };
    })
    .catch((e) => {
      // A failed fetch must not be remembered as "nothing is clean" forever — clear it so the
      // next render retries instead of fail-closed-ing every row for the rest of the session.
      cache = null;
      throw e;
    });

  cache = request;
  cachedAtMs = now;
  return request;
}

function rowTicker(row: any): string {
  return String(row?.ticker ?? row?.Ticker ?? row?.symbol ?? "").trim().toUpperCase();
}

/** @param active whether the ANOM button is on — nothing is fetched while it is off. */
export function usePostAnomalyExclusion(active: boolean): PostAnomalyExclusion {
  const [state, setState] = useState<PostAnomalyExclusion>(EMPTY);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setState(EMPTY);
      return;
    }

    const requestId = ++requestRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchClean()
      .then(({ day, clean, thresholdAbsSigma }) => {
        if (requestRef.current !== requestId) return; // a slower earlier request, discard
        setState({ clean: new Set(clean), day, thresholdAbsSigma, loading: false, error: null });
      })
      .catch((e) => {
        if (requestRef.current !== requestId) return;
        setState({
          clean: new Set<string>(),
          day: null,
          thresholdAbsSigma: DEFAULT_THRESHOLD_ABS_SIGMA,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
  }, [active]);

  return state;
}

/**
 * True when this row must be dropped by ANOM. A row with no ticker cannot be looked up, so it is
 * dropped (unknown rejects, same rule every other exclude flag in this codebase uses). A ticker
 * simply absent from the clean set is NOT "unknown" here the way it is for CORR — absence IS the
 * answer: either it spiked past the threshold, or the tape has nothing for it in the window, and
 * the operator's own rule treats both the same way.
 */
export function rowExcludedByAnom(row: any, clean: Set<string>): boolean {
  const ticker = rowTicker(row);
  if (!ticker) return true;
  return !clean.has(ticker);
}
