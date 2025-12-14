import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const client = await pool.connect();
  try {
    if (req.method === "GET") {
      const { rows } = await client.query("SELECT * FROM trades WHERE id=$1", [id]);
      res.status(200).json(rows[0]);
    } else if (req.method === "PUT") {
      const { ticker, trade_date, entry_amount, result, screenshot_url } = req.body;
      const { rows } = await client.query(
        "UPDATE trades SET ticker=$1, trade_date=$2, entry_amount=$3, result=$4, screenshot_url=$5 WHERE id=$6 RETURNING *",
        [ticker, trade_date, entry_amount, result, screenshot_url, id]
      );
      res.status(200).json(rows[0]);
    } else if (req.method === "DELETE") {
      await client.query("DELETE FROM trades WHERE id=$1", [id]);
      res.status(204).end();
    } else {
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } finally {
    client.release();
  }
}
