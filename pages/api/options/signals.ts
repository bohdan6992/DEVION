import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse, ScoredContract } from "@/lib/insider/types";
import { maybeRunInsiderPipeline, readFlaggedContracts } from "@/lib/insider/server";
import fs from "fs";
import path from "path";

type CacheEntry = {
  data: ScoredContract[];
  cachedAt: number;
};

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function filterContracts(contracts: ScoredContract[], minScore: number, minPremium: number) {
  return contracts
    .filter((contract) => contract.anomalyScore >= minScore && contract.totalPremiumUsd >= minPremium)
    .sort((a, b) =>
      b.anomalyScore !== a.anomalyScore
        ? b.anomalyScore - a.anomalyScore
        : b.totalPremiumUsd - a.totalPremiumUsd
    );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ScoredContract[]>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ data: [], error: "Method not allowed" });
  }

  const minScore = Number(req.query.minScore ?? 2) || 2;
  const minPremium = Number(req.query.minPremium ?? 0) || 0;
  const forceRefresh = req.query.refresh === "true";
  const now = Date.now();
  let bootstrapError: string | null = null;

  try {
    if (!forceRefresh && cache && now - cache.cachedAt < CACHE_TTL_MS) {
      return res.status(200).json({
        data: filterContracts(cache.data, minScore, minPremium),
        cachedAt: new Date(cache.cachedAt).toISOString(),
      });
    }

    const flaggedPath = path.join(process.cwd(), "data", "insider", "options_flagged.csv");
    const shouldBootstrap = !fs.existsSync(flaggedPath);

    if (forceRefresh || shouldBootstrap) {
      try {
        await maybeRunInsiderPipeline();
      } catch (error) {
        bootstrapError = error instanceof Error ? error.message : "Insider pipeline failed";
        console.warn("[/api/options/signals] refresh pipeline skipped:", error);
      }
    }

    const contracts = readFlaggedContracts();
    if (!contracts.length && bootstrapError) {
      return res.status(503).json({
        data: [],
        error: bootstrapError,
      });
    }

    cache = { data: contracts, cachedAt: now };

    return res.status(200).json({
      data: filterContracts(contracts, minScore, minPremium),
      cachedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("[/api/options/signals]", error);
    return res.status(500).json({
      data: [],
      error: error instanceof Error ? error.message : "Failed to load insider signals",
    });
  }
}
