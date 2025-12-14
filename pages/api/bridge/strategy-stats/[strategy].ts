import type { NextApiRequest, NextApiResponse } from "next";

const BRIDGE_URL =
  process.env.TRADING_BRIDGE_URL ?? "http://localhost:5197";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const strategy = req.query.strategy;

  if (!strategy || Array.isArray(strategy)) {
    res.status(400).json({
      error: "Invalid strategy",
      type: "BAD_REQUEST",
    });
    return;
  }

  const ticker =
    typeof req.query.ticker === "string" ? req.query.ticker : undefined;

  const url = new URL(
    `${BRIDGE_URL}/api/strategy/${encodeURIComponent(strategy)}/stats`
  );

  if (ticker) url.searchParams.set("ticker", ticker);

  try {
    const upstream = await fetch(url.toString(), { cache: "no-store" });
    const data = await upstream.json();

    res.status(upstream.status).json(data);
  } catch (err: any) {
    res.status(500).json({
      error: err?.message ?? "Bridge Error",
      type: "BRIDGE_ERROR",
    });
  }
}
