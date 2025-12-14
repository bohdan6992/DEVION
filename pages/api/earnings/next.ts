// pages/api/earnings/next.ts
import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const tickers = (req.query.tickers as string)?.split(",") || [];
  const limit = Number(req.query.limit || 5);

  const now = Date.now();
  const sample = tickers.length ? tickers : ["AAPL", "NVDA", "MSFT", "AMZN", "META"];

  const items = sample.slice(0, limit).map((t, i) => ({
    ticker: t,
    company: `${t} Corp.`,
    datetime: new Date(now + (i + 1) * 36e5 * 6).toISOString(), // кожні 6 год
    when: i % 2 === 0 ? "amc" : "bmo",
    period: "Q4 FY25",
  }));

  res.status(200).json({ items });
}
