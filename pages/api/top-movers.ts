import type { NextApiRequest, NextApiResponse } from "next";

/** Розбити масив на шматки по N елементів */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Забираємо котирування з Yahoo Finance для переданих тикерів */
async function fetchFromYahoo(tickers: string[]) {
  const batches = chunk(tickers, 50); // безпечною порцією
  const all: any[] = [];

  for (const batch of batches) {
    const symbols = encodeURIComponent(batch.join(","));
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;

    const r = await fetch(url, {
      // невеликий таймаут через AbortController
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!r.ok) {
      // пропускаємо пачку, але не валимо весь запит
      continue;
    }
    const json = await r.json().catch(() => null);
    const res: any[] = json?.quoteResponse?.result || [];
    all.push(...res);
  }

  // Нормалізація під наш формат
  const rows = all
    .map((q) => {
      const last =
        Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice);
      const prev = Number(q.regularMarketPreviousClose);
      const volume = Number(q.regularMarketVolume ?? q.postMarketVolume ?? 0);
      const ticker = String(q.symbol || "").toUpperCase();

      if (!ticker || !Number.isFinite(last) || !Number.isFinite(prev) || prev === 0)
        return null;

      return {
        ticker,
        last,
        prev,
        volume,
        chgPct: ((last - prev) / prev) * 100,
      };
    })
    .filter(Boolean) as Array<{
      ticker: string;
      last: number;
      prev: number;
      volume: number;
      chgPct: number;
    }>;

  return rows;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    universe = "AAPL,MSFT,TSLA,NVDA,QQQ,SPY,AMD,META,NFLX,GOOGL",
    limit = "5",
  } = req.query;

  const tickers = String(universe)
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const lim = Math.max(1, Math.min(50, Number(limit) || 5));

  try {
    const rows = await fetchFromYahoo(tickers);

    const gainers = [...rows].sort((a, b) => b.chgPct - a.chgPct).slice(0, lim);
    const losers = [...rows].sort((a, b) => a.chgPct - b.chgPct).slice(0, lim);

    res.status(200).json({
      ts: new Date().toISOString(),
      source: "yahoo",
      universe: tickers.join(","),
      limit: lim,
      gainers,
      losers,
      err: null,
    });
  } catch (e: any) {
    res.status(200).json({
      ts: new Date().toISOString(),
      source: "yahoo",
      universe: tickers.join(","),
      limit: lim,
      gainers: [],
      losers: [],
      err: e?.message || "Failed to fetch from Yahoo Finance",
    });
  }
}
