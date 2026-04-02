import type { NextApiRequest, NextApiResponse } from "next";
import { getDuneExecutionStatus } from "@/lib/duneClient";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const executionId =
    typeof req.query.executionId === "string" ? req.query.executionId.trim() : "";

  if (!executionId) {
    return res.status(400).json({ error: "executionId is required." });
  }

  try {
    const status = await getDuneExecutionStatus(executionId);
    return res.status(200).json(status);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message ?? "Failed to fetch Dune execution status.",
    });
  }
}
