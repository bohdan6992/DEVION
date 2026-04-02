import type { NextApiRequest, NextApiResponse } from "next";
import type { ActorProfile, ApiResponse } from "@/lib/insider/types";
import { readActorProfiles } from "@/lib/insider/server";

type CacheEntry = {
  data: ActorProfile[];
  cachedAt: number;
};

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ActorProfile[]>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ data: [], error: "Method not allowed" });
  }

  const onlySmartMoney = req.query.smartMoney === "true";
  const now = Date.now();

  try {
    const source =
      cache && now - cache.cachedAt < CACHE_TTL_MS
        ? cache.data
        : (() => {
            const actors = readActorProfiles();
            cache = { data: actors, cachedAt: now };
            return actors;
          })();

    const data = onlySmartMoney ? source.filter((item) => item.isSmartMoney) : source;
    return res.status(200).json({
      data,
      cachedAt: new Date(cache?.cachedAt ?? now).toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      data: [],
      error: error instanceof Error ? error.message : "Failed to load actor profiles",
    });
  }
}
