import type { NextApiRequest, NextApiResponse } from "next";
import { getDuneExecutionResultCsv } from "@/lib/duneClient";

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
    const csv = await getDuneExecutionResultCsv(executionId, {
      allowPartialResults: req.query.allowPartialResults === "true",
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(csv);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message ?? "Failed to fetch Dune execution CSV result.",
    });
  }
}
