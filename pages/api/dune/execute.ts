import type { NextApiRequest, NextApiResponse } from "next";
import { executeDuneSql, type DunePerformance } from "@/lib/duneClient";

type ExecuteBody = {
  sql?: string;
  performance?: DunePerformance;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = (req.body ?? {}) as ExecuteBody;
    const sql = typeof body.sql === "string" ? body.sql.trim() : "";
    const performance = body.performance === "large" ? "large" : "medium";

    if (!sql) {
      return res.status(400).json({ error: "SQL is required." });
    }

    const execution = await executeDuneSql(sql, performance);
    return res.status(200).json(execution);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message ?? "Failed to execute Dune SQL.",
    });
  }
}
