"use client";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "./sharedPoll";

export type CaesarEngineResponse = {
  ok: boolean;
  engine?: { recentIntents?: unknown[] };
};

let cachedEngine: CaesarEngineResponse | null = null;

async function fetchCaesarEngine(): Promise<CaesarEngineResponse> {
  const response = await fetchWithTimeout(bridgeUrl("/api/stream/caesar/engine"), { cache: "no-cache" });
  if (response.status === 304 && cachedEngine) return cachedEngine;
  if (!response.ok) throw new Error(`caesar engine unavailable (${response.status})`);
  cachedEngine = await response.json() as CaesarEngineResponse;
  return cachedEngine;
}

/** One engine-status request per Caesar tab, shared by all browser strategies. */
export function subscribeCaesarEngine(
  listener: (value: CaesarEngineResponse | null, error: string | null) => void,
): () => void {
  return subscribeSharedPoll("caesar-engine-status", fetchCaesarEngine, 4_000, listener);
}
