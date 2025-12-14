import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { key, name, description, icon } = req.body || {};
  if (!key || !name) return res.status(400).json({ error: "key and name are required" });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      INSERT INTO strategies (key, name, description, icon)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, strategies.description),
        icon = COALESCE(EXCLUDED.icon, strategies.icon)
      RETURNING *;
      `,
      [key, name, description ?? null, icon ?? null]
    );

    return res.status(200).json(rows[0]); // тут є id
  } finally {
    client.release();
  }
}
