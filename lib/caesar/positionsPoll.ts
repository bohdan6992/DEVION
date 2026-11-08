"use client";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "./sharedPoll";

export type CaesarTrackedPosition = {
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  side: "Long" | "Short";
  priority?: number;
  entryDispatched: boolean;
  awaitingFill?: boolean;
  entrySignal: number | null;
  entryCount: number;
  openedAtUtc: string;
  lastReason: string;
  lastSignal?: number | null;
  lastSpread?: number | null;
  fixedExitAtUtc?: string | null;
  beta: number | null;
  corr: number | null;
  sigma: number | null;
};

export type CaesarPruneEvent = {
  atUtc: string;
  strategyId: string;
  ticker: string;
  pairKey: string | null;
  reason: string;
  wasEverSeenLive: boolean;
  exitEmitted: boolean;
};

export type CaesarPositionsSnapshot = {
  ok: boolean;
  positions: CaesarTrackedPosition[];
  closedOwners: Record<string, string[]>;
  prunes: CaesarPruneEvent[];
};

export const CAESAR_POSITIONS_POLL_MS = 2_000;
let cachedSnapshot: CaesarPositionsSnapshot | null = null;

const fetchCaesarPositions = async (): Promise<CaesarPositionsSnapshot> => {
  const response = await fetchWithTimeout(bridgeUrl("/api/stream/caesar/positions"), { cache: "no-cache" });
  if (response.status === 304 && cachedSnapshot) return cachedSnapshot;
  if (!response.ok) throw new Error(`caesar positions unavailable (${response.status})`);
  const body = await response.json() as Partial<CaesarPositionsSnapshot>;
  cachedSnapshot = {
    ok: body.ok === true,
    positions: body.positions ?? [],
    closedOwners: body.closedOwners ?? {},
    prunes: body.prunes ?? [],
  };
  return cachedSnapshot;
};

/** One bridge request per Caesar tab, shared by panels and browser stream engines. */
export function subscribeCaesarPositions(
  listener: (value: CaesarPositionsSnapshot | null, error: string | null) => void,
): () => void {
  return subscribeSharedPoll(
    "caesar-positions-snapshot",
    fetchCaesarPositions,
    CAESAR_POSITIONS_POLL_MS,
    listener,
  );
}
