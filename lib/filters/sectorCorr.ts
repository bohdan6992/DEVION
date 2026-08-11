"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/scanner/api";
import { getToken } from "@/lib/authClient";
import { rowReportAffectsSession, type ReportSessionDay } from "@/lib/filters/reportTiming";

/**
 * CORR filter: names that move with a ticker reporting today carry that report's risk without
 * having a report of their own, so REP alone does not remove them.
 *
 * Seeds come from the SAME rule the REP button uses (`rowReportAffectsSession`) applied to the
 * full sample, not to the already-filtered view — a reporting name the user filtered out for
 * unrelated reasons still drags its correlated peers. Live surfaces judge that rule against today;
 * the Scanner passes the tape day of each row, since the marker carries only day/month.
 *
 * The correlation table stays on the bridge — see `SectorCorrService` for the index, the |corr|
 * >= 0.5 floor, and why the pairs must be read in one direction only.
 */

/** Lowest threshold the bridge holds pairs for; the input cannot go below it. */
export const SECTOR_CORR_MIN = 0.5;
export const SECTOR_CORR_MAX = 1.0;
export const SECTOR_CORR_DEFAULT = 0.8;

export function clampSectorCorrThreshold(value: number): number {
  if (!Number.isFinite(value)) return SECTOR_CORR_DEFAULT;
  return Math.min(SECTOR_CORR_MAX, Math.max(SECTOR_CORR_MIN, value));
}

/** Parses the raw input box; returns null while the user is mid-typing something unusable. */
export function parseSectorCorrThreshold(raw: string): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (n < SECTOR_CORR_MIN || n > SECTOR_CORR_MAX) return null;
  return n;
}

export type SectorCorrExclusion = {
  /** Tickers to drop (uppercase). Empty whenever the filter is off or nothing has loaded yet. */
  excluded: Set<string>;
  /** Reporting tickers the peers were derived from — shown in the filter hint. */
  seedCount: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: SectorCorrExclusion = {
  excluded: new Set<string>(),
  seedCount: 0,
  loading: false,
  error: null,
};

// One in-flight request and one answer per (seeds, threshold), shared across every scanner/sonar
// mounted in the tab. Without it four components asking the same question hit the bridge four
// times for an answer that is identical by construction.
const cache = new Map<string, Promise<string[]>>();

async function fetchPeers(seeds: string[], threshold: number): Promise<string[]> {
  const key = `${threshold}|${seeds.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const token = getToken();
  const request = fetch(apiUrl("/api/signals/sector-corr/peers"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tickers: seeds, minAbsCorr: threshold }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      const peers = Array.isArray(json?.peers) ? json.peers : [];
      return peers.map((x: unknown) => String(x).toUpperCase());
    })
    .catch((e) => {
      // A failed lookup must not be remembered as "no peers" — clear it so the next render retries.
      cache.delete(key);
      throw e;
    });

  cache.set(key, request);
  if (cache.size > 32) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined && oldest !== key) cache.delete(oldest);
  }
  return request;
}

function rowTicker(row: any): string {
  return String(row?.ticker ?? row?.Ticker ?? row?.symbol ?? "").trim().toUpperCase();
}

/** Resolves the session a row's report marker is judged against. See `reportTiming`. */
export type ReportSessionResolver = (row: any) => ReportSessionDay | null;

/**
 * @param rows      the full sample, before UI filters
 * @param active    whether the CORR button is on — seeds are still computed when off (cheap), but
 *                  nothing is fetched, so an unused filter costs no request
 * @param threshold |corr| cutoff
 * @param sessionForRow  omit on live surfaces (judged against today); the Scanner passes the tape
 *                  day of each row, without which a replayed day yields no seeds at all
 */
export function useSectorCorrExclusion(
  rows: any[] | null | undefined,
  active: boolean,
  threshold: number,
  sessionForRow?: ReportSessionResolver
): SectorCorrExclusion {
  const [state, setState] = useState<SectorCorrExclusion>(EMPTY);
  const seedsKey = useMemo(() => {
    if (!active || !rows?.length) return "";
    // The report marker is per-ticker static data, so the rule is evaluated once per ticker rather
    // than once per row — a scanner day is hundreds of thousands of rows over a few thousand names.
    const seeds = new Set<string>();
    const seen = new Set<string>();
    for (const row of rows) {
      const ticker = rowTicker(row);
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      if (rowReportAffectsSession(row, sessionForRow?.(row) ?? null)) seeds.add(ticker);
    }
    return Array.from(seeds).sort().join(",");
  }, [rows, active, sessionForRow]);

  const requestRef = useRef(0);

  useEffect(() => {
    if (!active || !seedsKey) {
      setState(EMPTY);
      return;
    }

    const seeds = seedsKey.split(",");
    const clamped = clampSectorCorrThreshold(threshold);
    const requestId = ++requestRef.current;

    setState((prev) => ({ ...prev, seedCount: seeds.length, loading: true, error: null }));

    fetchPeers(seeds, clamped)
      .then((peers) => {
        // A slower earlier request must not overwrite a newer answer.
        if (requestRef.current !== requestId) return;
        setState({ excluded: new Set(peers), seedCount: seeds.length, loading: false, error: null });
      })
      .catch((e) => {
        if (requestRef.current !== requestId) return;
        setState({
          excluded: new Set<string>(),
          seedCount: seeds.length,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
  }, [active, seedsKey, threshold]);

  return state;
}

/** True when this row must be dropped by CORR. Seeds themselves are left to the REP button. */
export function rowExcludedByCorr(row: any, excluded: Set<string>): boolean {
  if (!excluded.size) return false;
  const ticker = rowTicker(row);
  return ticker.length > 0 && excluded.has(ticker);
}
