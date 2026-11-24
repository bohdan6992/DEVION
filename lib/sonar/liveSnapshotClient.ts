import { bridgeUrl, fetchWithTimeout } from "../bridgeBase";

const LIVE_FIELDS = [
  "AvPreMhVol90NF", "AvPreMhValue20NF", "AvPreMhValue90NF",
  "PreMhMDV90NF", "PreMhMDV20NF", "AvPostMhVol90NF",
  "Volatility20", "Volatility90", "VolRel",
  "LstPrcLstClsΔ%",
  "PreMhBidLstPrcΔ%", "PreMhLoLstPrcΔ%", "PreMhHiLstClsΔ%", "PreMhLoLstClsΔ%",
  "ImbExch9:25", "ImbExch15:55",
  "PreMhVol", "PreMhVolNF", "SpreadBid%",
].join(",");

type CachedRequest = {
  promise: Promise<Record<string, unknown> | null>;
  expiresAt: number;
};

// Detail panels are opened independently in each Sonar. Deduplicate only the short burst while
// panels mount/select the same ticker; do not turn this one-shot detail request into another
// permanent poller. The existing server-side Sonar snapshot remains the live polling channel.
const requests = new Map<string, CachedRequest>();
const CACHE_MS = 5_000;

export function fetchSharedLiveSnapshot(
  ticker: string,
  fields = LIVE_FIELDS,
): Promise<Record<string, unknown> | null> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return Promise.resolve(null);

  const key = `${normalized}|${fields}`;
  const now = Date.now();
  const existing = requests.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = fetchWithTimeout(
    `${bridgeUrl("/api/live/snapshot")}?tickers=${encodeURIComponent(normalized)}&fields=${encodeURIComponent(fields)}`,
    { cache: "no-store" },
  )
    .then((response) => response.json())
    .then((data: any) => {
      const item = Array.isArray(data?.items) ? data.items[0] : null;
      return (item?.Fields ?? item?.fields ?? null) as Record<string, unknown> | null;
    })
    .catch((err) => {
      // A hung/failed bridge must not block retries for the rest of CACHE_MS — only a
      // SUCCESSFUL fetch is worth deduplicating. Evict immediately so the next caller (a
      // re-select, a remount) gets a fresh attempt instead of the same rejection.
      const current = requests.get(key);
      if (current?.promise === promise) requests.delete(key);
      throw err;
    });

  requests.set(key, { promise, expiresAt: now + CACHE_MS });
  window.setTimeout(() => {
    const current = requests.get(key);
    if (current?.promise === promise) requests.delete(key);
  }, CACHE_MS);
  return promise;
}
