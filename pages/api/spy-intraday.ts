// pages/api/spy-intraday.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Ok = { s: "ok"; symbol: string; tz?: string; candles: Candle[] };
type Err = { s: "err"; message: string };
type Payload = Ok | Err;

// ⚠️ Саме default-експорт ФУНКЦІЇ (для pages/api)
export default async function spyIntraday(
  req: NextApiRequest,
  res: NextApiResponse<Payload>
) {
  try {
    const symbol = (req.query.symbol as string) || "SPY";

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?` +
      `range=1d&interval=1m&includePrePost=true&corsDomain=finance.yahoo.com`;

    const r = await fetch(url, { headers: { "User-Agent": "TradingTool SPY Chart" } });
    if (!r.ok) throw new Error(`Upstream ${r.status}`);
    const data = await r.json();

    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0] ?? {};
    const opens: number[] = q.open ?? [];
    const highs: number[] = q.high ?? [];
    const lows: number[] = q.low ?? [];
    const closes: number[] = q.close ?? [];
    const vols: number[] = q.volume ?? [];

    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
      if ([o, h, l, c].some(v => typeof v !== "number" || Number.isNaN(v))) continue;
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: vols[i] });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ s: "ok", symbol, tz: result?.meta?.exchangeTimezoneName, candles });
  } catch (e: any) {
    return res.status(200).json({ s: "err", message: e?.message || "failed" });
  }
}
