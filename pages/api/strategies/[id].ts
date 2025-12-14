import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const client = await pool.connect();
  try {
    if (req.method === "GET") {
      const { rows } = await client.query("SELECT * FROM strategies WHERE id=$1", [id]);
      if (!rows.length) return res.status(404).json({ error:"Not found" });
      res.status(200).json(rows[0]);
    } else if (req.method === "PUT") {
      const { name, description, icon } = req.body;
      const { rows } = await client.query(
        "UPDATE strategies SET name=$1, description=$2, icon=$3 WHERE id=$4 RETURNING *",
        [name, description, icon, id]
      );
      res.status(200).json(rows[0]);
    } else if (req.method === "DELETE") {
      await client.query("DELETE FROM strategies WHERE id=$1", [id]);
      res.status(204).end();
    } else {
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } finally {
    client.release();
  }
}
