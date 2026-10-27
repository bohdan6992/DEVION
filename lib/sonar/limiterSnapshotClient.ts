import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import { toOpenDoorSonarFilters, type OpenDoorSonarFilterSource } from "./openDoorFamilyFilters";
import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * DEAD CLIENT — nothing on the bridge answers fetchLimiterSonarSnapshot/pushLimiterSonarLiveParams
 * below (the renamed copy of LaunchEvening's own stateful one-minute-move-gate client; its own doc
 * comment still described THAT mechanism, which was never LIMITER's). LimiterSonar.tsx's real data
 * now comes from lib/sonar/limiterRatingsClient.ts instead — this file is kept only because
 * LimiterSonarRow/LimiterUniverseRow are still the shape every render/sort/filter site in
 * LimiterSonar.tsx is written against (translated from Arbitrage's own row shape there). See
 * LimiterSonar.tsx's own header comment for the full story, 2026-10-27.
 */
export type LimiterExitClass = "pre";

/** Mirrors LimiterThresholdUnit (LimiterGate.cs) — what MinDevAbsShort/Long/Max are measured in.
 * */
export type LimiterThresholdUnitName = "pct" | "sigma" | "alpha" | "gamma" | "atr" | "lambda";

export type LimiterSonarLiveParams = {
  exitClass: LimiterExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  /** Floor on the matched (class, sign) cell's own published win_rate (0-1). 0 = off. */
  minRate: number;
  /** Floor on that same cell's own published total trade count. 0 = off. */
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LimiterThresholdUnitName;
  filters: OpenDoorLiveFilters | null;
  /** ITB/HARD (borrow status) — NOT part of `filters`, see LimiterSonarLiveParams.ExcludeItb's own
   * doc comment on the bridge for why these two are checked separately, server-side. */
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
};

export type LimiterSonarRow = {
  ticker: string;
  side: "Long" | "Short";
  /** The one-minute MOVE that qualified this ticker — a DELTA, not a level. Positive was taken Short. */
  signalDev: number | null;
  /** The remembered reading the move was measured FROM, and the minute it was sampled at. */
  fromDev: number | null;
  fromMinuteIdx: number;
  /** The current print — the level the move arrived AT. */
  lastDev: number | null;
  /** What the position would be filled at: ask for a Long, bid for a Short, under BIDASK. */
  entryDev: number | null;
  gamma: number | null;
  gammaN: number;
  /** The same (exitClass, sign) cell's published win_rate/total — see LimiterGate.Decision. */
  winRate: number | null;
  total: number;
  /** The ticker's own published alpha, sign-matched to `side`. */
  alpha: number | null;
  /** The ticker's published static Stack% dispersion — ticker-level, unrelated to side. */
  sigma: number | null;
  /** The ticker's CURRENT live ATR14% reading — what the τ threshold unit divides by. Unlike
   * alpha/sigma this is not a ratings-table constant. */
  atr14Pct: number | null;
  /** The ticker's own published lambda — ticker-level, not sign-matched, like sigma — what the λ
   * threshold unit divides by. */
  lambda: number | null;
  exitClass: string;
  bid: number | null;
  ask: number | null;
};

/**
 * One row of signals/limiter/limiter_tickers.csv — flat and undirected, no side/move/gamma.
 * The operator's own words (2026-10-23): "Тут немає шорт чи Лонг, просто відображай... список
 * тікерів без умов, але фільтри повинні відчувати тікери" — just the ticker with its own
 * rating/total/sigma/alpha, already narrowed server-side by the same toolbar filters the SHORT/LONG
 * columns use (ADV20/SSR/ETF/CRAP/REP/country/exchange/sector/...).
 */
export type LimiterUniverseRow = {
  ticker: string;
  rating: number | null;
  total: number | null;
  sigma: number | null;
  alpha: number | null;
};

export type LimiterSonarSnapshot = {
  /** True when the bridge's own fetch timed out (no live feed) — rows is empty, not "no matches". */
  timedOut: boolean;
  /**
   * True only inside Limiter's 15:50-16:20 NY window. UNLIKE every sibling panel's copy of this
   * flag it does NOT mean rows is empty: the gate runs all day so the panel stays readable and the move
   * memory can be watched filling. It means "now is a minute this strategy would actually act in", so a
   * row shown while this is false is informational, not actionable.
   */
  inWindow: boolean;
  /**
   * Tickers with a live reading but no usable previous-minute sample yet, so no move could be formed.
   * Specific to this strategy: its gate needs memory, so a high count means the bridge has not been
   * polled long enough to know anything — warm-up, not an empty market.
   */
  noSampleCount: number;
  rows: LimiterSonarRow[];
  /** Full signal rows for the listed tickers plus the few the panel's widgets read — chosen on the bridge. */
  items: unknown[];
  /** How many tickers the bridge looked at before choosing. */
  rawCount: number;
  /** limiter_tickers.csv's own flat list, already narrowed by the toolbar's own generic filters —
   * see LimiterUniverseRow's own doc comment. Empty, not missing, before the CSV publishes or
   * when nothing currently passes the filters. */
  universeRows: LimiterUniverseRow[];
};

export function toLimiterSonarLiveParams(args: {
  exitClass: LimiterExitClass;
  minDevAbsShort: number;
  minDevAbsLong: number;
  minDevAbsMax: number | null;
  minGammaTotal: number;
  minRate: number;
  minTotal: number;
  ignoreRatings: boolean;
  thresholdUnit: LimiterThresholdUnitName;
  filters: OpenDoorSonarFilterSource;
  excludeItb: boolean;
  excludeHard: boolean;
  source: string;
}): LimiterSonarLiveParams {
  return {
    exitClass: args.exitClass,
    minDevAbsShort: args.minDevAbsShort,
    minDevAbsLong: args.minDevAbsLong,
    minDevAbsMax: args.minDevAbsMax,
    minGammaTotal: args.minGammaTotal,
    minRate: args.minRate,
    minTotal: args.minTotal,
    ignoreRatings: args.ignoreRatings,
    thresholdUnit: args.thresholdUnit,
    filters: toOpenDoorSonarFilters(args.filters),
    excludeItb: args.excludeItb,
    excludeHard: args.excludeHard,
    source: args.source,
  };
}

export async function pushLimiterSonarLiveParams(params: LimiterSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/limiter/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    return false;
  }
}

export function fetchLimiterSonarSnapshot(): Promise<LimiterSonarSnapshot> {
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/limiter/snapshot"), { cache: "no-store" })
    .then((res) => res.json())
    .then((body) => body.snapshot as LimiterSonarSnapshot);
}
