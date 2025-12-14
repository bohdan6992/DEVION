// pages/api/trades/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();
  try {
    if (req.method === "GET") {
      const { strategy_id } = req.query;
      if (strategy_id) {
        const { rows } = await client.query(
          "SELECT * FROM trades WHERE strategy_id=$1 ORDER BY trade_date DESC",
          [strategy_id]
        );
        return res.status(200).json(rows);
      }
      const { rows } = await client.query("SELECT * FROM trades ORDER BY trade_date DESC");
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      // У NextApiRequest: headers — це Record<string,string | string[] | undefined>
      const ctype = (req.headers["content-type"] as string) || "";

      let data: any = {};
      if (ctype.includes("application/json")) {
        data = req.body; // Next сам розпарсить JSON
      } else if (ctype.includes("application/x-www-form-urlencoded")) {
        data = req.body; // Next теж розпарсить
      } else {
        // multipart/form-data тут не підтримуємо (потрібен formidable/busboy)
        return res
          .status(415)
          .json({ ok: false, error: "Unsupported Content-Type. Use JSON or x-www-form-urlencoded." });
      }

      const { strategy_id, ticker, trade_date, entry_amount, result, screenshot_url } = data;

      const { rows } = await client.query(
        `INSERT INTO trades (strategy_id, ticker, trade_date, entry_amount, result, screenshot_url)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [strategy_id, ticker, trade_date, entry_amount, result, screenshot_url || null]
      );
      return res.status(201).json(rows[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } finally {
    client.release();
  }
}
