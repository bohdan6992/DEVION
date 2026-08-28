"use client";

import { bridgeUrl } from "@/lib/bridgeBase";
import type { ArbitrageFilterConfigV1 } from "@/lib/filters/arbitrageFilterConfigV1";

/**
 * Client for the bridge-side OpenDoor gate settings (see OpenDoorLiveParamsService.cs).
 *
 * This is the operator's whole saved filter state: the ten rating-gate values the OpenDoor toolbar
 * edits AND the rest of the filters (bounds, flag exclusions, country/exchange/sector selects,
 * ticker lists, report mode). They are pushed here because the server-side engine gates on them at
 * 09:20 whether or not a tab is open — before this existed it ran on the descriptor defaults
 * (10m, 0.6/20/0) over an otherwise unfiltered universe.
 *
 * Push-only by design: the toolbar stays the source of truth (it also persists to localStorage),
 * and the bridge is the follower. Pulling on mount would let a stale server copy overwrite what
 * the operator is looking at.
 */

/**
 * The non-rating half of the toolbar, in the shape LiveRowFilter.cs reads.
 *
 * Derived from the SAME `ArbitrageFilterConfigV1` the browser engine filters live rows with, minus
 * two blocks the server deliberately does not honour for OpenDoor:
 *  - `zap`: Arbitrage's sigma gate, driven by controls (`metric`, `startAbs`) that the OpenDoor
 *    toolbar does not have and OpenDoorScanner does not even restore. OpenDoor's deviation gate is
 *    `devsig` against its own bins.
 *  - `source`: Arbitrage's flat rate/total floor, replaced by the per-direction bin floors.
 */
export type OpenDoorLiveMultiSel = {
  mode: "off" | "include" | "exclude";
  values: string[];
};

export type OpenDoorLiveFilters = {
  lists?: ArbitrageFilterConfigV1["lists"];
  activityMode?: "off" | "onlyActive" | "onlyInactive";
  bounds?: ArbitrageFilterConfigV1["bounds"];
  exclude?: ArbitrageFilterConfigV1["exclude"];
  include?: ArbitrageFilterConfigV1["include"];
  multi?: {
    countries?: OpenDoorLiveMultiSel;
    exchanges?: OpenDoorLiveMultiSel;
    sectors?: OpenDoorLiveMultiSel;
  };
  reportMode?: "ALL" | "YES" | "NO";
  equityType?: string;
};

export type OpenDoorLiveParams = {
  /** Strategy-specific: OpenDoor rates 10m/30m, Day Two POST1..BLUE3. */
  exitClass: string;
  useStack: boolean;
  useBench: boolean;
  useDevSig: boolean;
  upMinRate: number;
  upMinTotal: number;
  upMinMove: number;
  downMinRate: number;
  downMinTotal: number;
  downMinMove: number;
  sizeValue: number;
  filters?: OpenDoorLiveFilters;
  source?: string;
};

/** The COUNTRY / EXCHANGE / SECTOR chips are tri-state, not on/off. */
export type MultiTriModes = {
  countries: "off" | "include" | "exclude";
  exchanges: "off" | "include" | "exclude";
  sectors: "off" | "include" | "exclude";
};

/**
 * Strips the two blocks above off the config the stream engine already builds, and re-attaches the
 * tri-state modes.
 *
 * `buildStreamFilterConfig` forwards only the SELECTED VALUES for country/exchange/sector and then
 * sets `enabled: values.length > 0` — so the mode is lost: a selection left "off" still filters,
 * and an "exclude" selection filters inverted, as an include. That is how the browser engine
 * behaves today; rather than reproduce it server-side, the modes are sent explicitly and
 * LiveRowFilter honours them. Fixing the browser means touching buildStreamFilterConfig, which
 * Arbitrage's stream shares — a separate decision.
 */
export function toOpenDoorLiveFilters(
  cfg: ArbitrageFilterConfigV1,
  modes: MultiTriModes,
): OpenDoorLiveFilters {
  return {
    lists: cfg.lists,
    activityMode: cfg.activity?.mode ?? "off",
    bounds: cfg.bounds,
    exclude: cfg.exclude,
    include: cfg.include,
    multi: {
      countries: { mode: modes.countries, values: cfg.multi?.countries?.values ?? [] },
      exchanges: { mode: modes.exchanges, values: cfg.multi?.exchanges?.values ?? [] },
      sectors: { mode: modes.sectors, values: cfg.multi?.sectors?.values ?? [] },
    },
    reportMode: cfg.report?.hasReport ?? "ALL",
    equityType: cfg.equityType,
  };
}

/**
 * Which strategy's live params to write. The bridge keeps one set per strategy: OpenDoor trades on
 * its set at 09:20 and Day Two on its own at 15:50, so a shared endpoint would let the afternoon
 * toolbar silently redefine what the morning strategy trades.
 */
export type LiveParamsStrategy = "opendoor" | "daytwo" | "openfade" | "openride";

export async function pushOpenDoorLiveParams(
  params: OpenDoorLiveParams,
  strategy: LiveParamsStrategy = "opendoor"
): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl(`/api/stream/${strategy}/params`), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    // Best-effort: the bridge keeps whatever it last received. The toolbar is unaffected.
    return false;
  }
}

export async function fetchOpenDoorLiveParams(): Promise<OpenDoorLiveParams | null> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/opendoor/params"), { cache: "no-store" });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return (json?.params as OpenDoorLiveParams) ?? null;
  } catch {
    return null;
  }
}
