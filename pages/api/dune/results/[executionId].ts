import type { NextApiRequest, NextApiResponse } from "next";
import { getDuneExecutionResult } from "@/lib/duneClient";

function parseIntegerParam(value: string | string[] | undefined) {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
    const result = await getDuneExecutionResult(executionId, {
      limit: parseIntegerParam(req.query.limit),
      offset: parseIntegerParam(req.query.offset),
      allowPartialResults: req.query.allowPartialResults === "true",
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message ?? "Failed to fetch Dune execution result.",
    });
  }
}
