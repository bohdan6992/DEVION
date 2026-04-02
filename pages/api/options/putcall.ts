import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse, PutCallImbalance } from "@/lib/insider/types";
import { computePutCallFlow } from "@/lib/insider/server";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<PutCallImbalance[]>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ data: [], error: "Method not allowed" });
  }

  try {
    return res.status(200).json({ data: computePutCallFlow() });
  } catch (error) {
    return res.status(500).json({
      data: [],
      error: error instanceof Error ? error.message : "Failed to load put/call flow",
    });
  }
}
