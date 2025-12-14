import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const client = await pool.connect();
  try {
    const out: any[] = [];

    for (const s of STRATEGY_CATALOG) {
      const { rows } = await client.query(
        `
        INSERT INTO strategies (key, name, description, icon)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          icon = EXCLUDED.icon
        RETURNING *;
        `,
        [s.key, s.name, s.description, s.icon ?? null]
      );
      out.push(rows[0]);
    }

    return res.status(200).json({ items: out, count: out.length });
  } finally {
    client.release();
  }
}
