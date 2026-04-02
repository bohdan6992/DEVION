import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse, ScanSummary } from "@/lib/insider/types";
import { buildScanSummary } from "@/lib/insider/server";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ScanSummary>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      data: {
        scannedAt: "",
        totalContracts: 0,
        flaggedContracts: 0,
        smartMoneyActors: 0,
        topSignals: [],
        putCallImbalances: [],
      },
      error: "Method not allowed",
    });
  }

  try {
    return res.status(200).json({ data: buildScanSummary() });
  } catch (error) {
    return res.status(500).json({
      data: {
        scannedAt: "",
        totalContracts: 0,
        flaggedContracts: 0,
        smartMoneyActors: 0,
        topSignals: [],
        putCallImbalances: [],
      },
      error: error instanceof Error ? error.message : "Failed to load summary",
    });
  }
}
