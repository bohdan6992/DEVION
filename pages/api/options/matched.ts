import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse, MatchedContract } from "@/lib/insider/types";
import { readMatchedContracts } from "@/lib/insider/server";

type CacheEntry = {
  data: MatchedContract[];
  cachedAt: number;
};

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<MatchedContract[]>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ data: [], error: "Method not allowed" });
  }

  const now = Date.now();

  try {
    const source =
      cache && now - cache.cachedAt < CACHE_TTL_MS
        ? cache.data
        : (() => {
            const matched = readMatchedContracts();
            cache = { data: matched, cachedAt: now };
            return matched;
          })();

    return res.status(200).json({
      data: source,
      cachedAt: new Date(cache?.cachedAt ?? now).toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      data: [],
      error: error instanceof Error ? error.message : "Failed to load matched contracts",
    });
  }
}
