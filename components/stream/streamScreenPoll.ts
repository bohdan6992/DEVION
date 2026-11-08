"use client";

import { bridgeUrl, fetchWithTimeout } from "../../lib/bridgeBase";
import { subscribeSharedPoll, forceSharedPollNow } from "../../lib/caesar/sharedPoll";

export type StreamScreenSnapshot = {
  screen?: {
    asOfUtc?: string;
    rows?: unknown[];
    countries?: string[];
    exchanges?: string[];
    sectors?: string[];
  } | null;
};

function screenUrl(screenKey: string): string {
  return bridgeUrl(`/api/stream/screen/${encodeURIComponent(screenKey)}`);
}

function channelKey(screenKey: string): string {
  // Include the resolved bridge URL: a user can change the bridge target in localStorage while
  // the app remains mounted, and snapshots from two bridge instances must never mix.
  return `stream-screen:${screenUrl(screenKey)}`;
}

function fetchScreen(screenKey: string): Promise<StreamScreenSnapshot> {
  return fetchWithTimeout(screenUrl(screenKey), { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`candidate list unavailable (${response.status})`);
    return await response.json() as StreamScreenSnapshot;
  });
}

/**
 * One screen request and one JSON parse per unique strategy screen in this browser tab.
 * Multiple mounts of the same strategy receive the same immutable response and do not create
 * competing 2-second timers or duplicate bridge work.
 */
export function subscribeStreamScreen(
  screenKey: string,
  listener: (snapshot: StreamScreenSnapshot | null, error: string | null) => void,
): () => void {
  return subscribeSharedPoll(channelKey(screenKey), () => fetchScreen(screenKey), 2_000, listener);
}

export function refreshStreamScreen(screenKey: string): void {
  forceSharedPollNow(channelKey(screenKey), () => fetchScreen(screenKey));
}
