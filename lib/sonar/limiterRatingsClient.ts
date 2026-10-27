import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";
import type { ArbitrageSonarLiveParams, ArbitrageSonarSnapshot } from "./arbitrageSnapshotClient";

/**
 * LIMITER's own RATING source — separate from limiterSnapshotClient.ts, which carries the filtered
 * TICKER LIST (the "signals same as the LAUNCH group" half). This half is the per-ticker RATING
 * value (the operator's own instruction, 2026-10-27: "рейтинги беруться із файлу арбітража"): same
 * body shape as the Arbitrage Sonar's own params/snapshot (Arbitrage-shaped — same signals
 * universe, same filter chain), but its own bridge route and its own file, so this page never
 * writes into the Arbitrage Sonar's rating gate. Same sibling pattern as
 * pushPairFluxGridSonarLiveParams/fetchPairFluxGridSonarSnapshot in pairfluxSnapshotClient.ts — see
 * LimiterSonarController on the bridge. The default ArbitrageSonarLiveParams.signalsClass the
 * bridge hands back is "pre", not Arbitrage's own "global": LIMITER's per-ticker rating is always
 * Arbitrage's own PRE-class value.
 */
export async function pushLimiterRatingsLiveParams(params: ArbitrageSonarLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/sonar/limiter-ratings/params"), {
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

export function fetchLimiterRatingsSnapshot(): Promise<ArbitrageSonarSnapshot> {
  // Same body-timeout guard as fetchArbitrageSonarSnapshot/fetchPairFluxGridSonarSnapshot: the
  // shared poll must never stay in flight.
  const bodyTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("limiter sonar snapshot body timed out")), 15_000)
  );
  bodyTimeout.catch(() => {});
  return fetchWithTimeout(bridgeUrl("/api/stream/sonar/limiter-ratings/snapshot"), { cache: "no-store" })
    .then((res) => Promise.race([res.json(), bodyTimeout]))
    .then((body: any) => body.snapshot as ArbitrageSonarSnapshot);
}
