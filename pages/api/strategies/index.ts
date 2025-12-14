import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();
  try {
    if (req.method === "GET") {
      const { rows } = await client.query("SELECT * FROM strategies ORDER BY id ASC");
      res.status(200).json(rows);
    } else if (req.method === "POST") {
      const { name, description, icon } = req.body;
      const { rows } = await client.query(
        "INSERT INTO strategies (name, description, icon) VALUES ($1,$2,$3) RETURNING *",
        [name, description, icon]
      );
      res.status(201).json(rows[0]);
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } finally {
    client.release();
  }
}
