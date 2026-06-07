import type { NextApiRequest, NextApiResponse } from "next";

const DEFAULT_TICKERS = [
  "SPY", "QQQ", "AAPL", "NVDA", "TSLA", "BTC-USD", "MSFT", "AMD", "ETH-USD", "META",
];

/* ─── Crumb cache (server-side, survives between requests in dev) ─── */
let _session: { crumb: string; cookie: string; at: number } | null = null;
const CRUMB_TTL_MS = 50 * 60 * 1000; // 50 min

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "application/json, text/plain, */*",
  Referer: "https://finance.yahoo.com/",
};

async function getSession(): Promise<{ crumb: string; cookie: string }> {
  const now = Date.now();
  if (_session && now - _session.at < CRUMB_TTL_MS) {
    return { crumb: _session.crumb, cookie: _session.cookie };
  }

  /* 1. Hit Yahoo Finance to get initial consent cookie (A1 / A3) */
  let rawCookie = "";
  try {
    const init = await fetch("https://fc.yahoo.com", {
      headers: BASE_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });
    rawCookie = init.headers.get("set-cookie") ?? "";
  } catch {
    /* fc.yahoo.com sometimes doesn't respond — continue anyway */
  }

  /* Extract just A1= or A3= from the cookie header */
  const cookieStr = (rawCookie.match(/A[13]=[^;]+/) || [])[0] ?? "";

  /* 2. Fetch crumb */
  const crumbRes = await fetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: {
        ...BASE_HEADERS,
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
      cache: "no-store",
    }
  );
  const crumb = (await crumbRes.text()).trim();

  _session = { crumb, cookie: cookieStr, at: Date.now() };
  return { crumb, cookie: cookieStr };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tickers } = req.query;
  const symbols = String(tickers || DEFAULT_TICKERS.join(","))
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    const { crumb, cookie } = await getSession();

    const encoded = encodeURIComponent(symbols.join(","));
    const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encoded}${crumbParam}`;

    const fetchHeaders: Record<string, string> = { ...BASE_HEADERS };
    if (cookie) fetchHeaders["Cookie"] = cookie;

    const r = await fetch(url, { headers: fetchHeaders, cache: "no-store" });

    if (!r.ok) {
      /* Crumb might be stale — invalidate and retry once */
      _session = null;
      throw new Error(`Yahoo HTTP ${r.status}`);
    }

    const json = await r.json();
    const result: any[] = json?.quoteResponse?.result ?? [];

    const data = result.map((q) => {
      const price =
        Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice) || 0;
      const bid = Number(q.bid) || 0;
      const ask = Number(q.ask) || 0;
      const spread = ask > 0 && bid > 0 ? Math.max(0, ask - bid) : 0;

      return {
        ticker: String(q.symbol ?? "").toUpperCase(),
        name: String(q.shortName ?? q.longName ?? ""),
        price,
        bid,
        ask,
        bidSize: Number(q.bidSize) || 0,
        askSize: Number(q.askSize) || 0,
        spread,
        spreadPct: ask > 0 ? (spread / ask) * 100 : 0,
        chgPct: Number(q.regularMarketChangePercent) || 0,
        chg: Number(q.regularMarketChange) || 0,
        volume: Number(q.regularMarketVolume) || 0,
        marketState: String(q.marketState ?? "CLOSED"),
      };
    });

    res.status(200).json({ ts: new Date().toISOString(), source: "yahoo", data, err: null });
  } catch (e: any) {
    res.status(200).json({
      ts: new Date().toISOString(),
      source: "yahoo",
      data: [],
      err: e?.message ?? "Failed",
    });
  }
}
