import type { NextApiRequest, NextApiResponse } from "next";

const TICKERS = ["^VIX", "SPY", "QQQ", "DX-Y.NYB", "GC=F", "BTC-USD", "^TNX", "CL=F"];

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "application/json, text/plain, */*",
  Referer: "https://finance.yahoo.com/",
};

let _session: { crumb: string; cookie: string; at: number } | null = null;

async function getSession() {
  if (_session && Date.now() - _session.at < 50 * 60 * 1000) return _session;
  let rawCookie = "";
  try {
    const r = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "follow", cache: "no-store" });
    rawCookie = r.headers.get("set-cookie") ?? "";
  } catch {}
  const cookieStr = (rawCookie.match(/A[13]=[^;]+/) || [])[0] ?? "";
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...HEADERS, ...(cookieStr ? { Cookie: cookieStr } : {}) }, cache: "no-store",
  });
  const crumb = (await crumbRes.text()).trim();
  _session = { crumb, cookie: cookieStr, at: Date.now() };
  return _session;
}

export type PulseTick = {
  ticker:      string;
  price:       number;   // effective price (pre/regular/post)
  prevClose:   number;
  chgPct:      number;   // effective change % from prev close
  chgAbs:      number;
  marketState: string;   // PRE / REGULAR / POST / CLOSED
  isPreMarket: boolean;
};

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const { crumb, cookie } = await getSession();
    const encoded = encodeURIComponent(TICKERS.join(","));
    const crumbQ  = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
    const url     = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encoded}${crumbQ}`;
    const fh: Record<string, string> = { ...HEADERS };
    if (cookie) fh["Cookie"] = cookie;

    const r = await fetch(url, { headers: fh, cache: "no-store" });
    if (!r.ok) { _session = null; throw new Error(`Yahoo ${r.status}`); }

    const json   = await r.json();
    const result: any[] = json?.quoteResponse?.result ?? [];

    const data: PulseTick[] = result.map((q) => {
      const state      = String(q.marketState ?? "CLOSED").toUpperCase();
      const isPre      = state === "PRE";
      const isPost     = state === "POST" || state === "POSTPOST";
      const regPrice   = Number(q.regularMarketPrice)        || 0;
      const prePrice   = Number(q.preMarketPrice)            || 0;
      const postPrice  = Number(q.postMarketPrice)           || 0;
      const prevClose  = Number(q.regularMarketPreviousClose || q.chartPreviousClose) || regPrice;

      // Effective price: prefer pre/post if active
      const price = isPre && prePrice ? prePrice : isPost && postPrice ? postPrice : regPrice;

      // Effective change from previous close
      let chgPct = 0;
      if (isPre && prePrice && prevClose) {
        chgPct = ((prePrice - prevClose) / prevClose) * 100;
      } else if (isPost && postPrice && prevClose) {
        chgPct = ((postPrice - prevClose) / prevClose) * 100;
      } else {
        chgPct = Number(q.regularMarketChangePercent) || 0;
      }

      return {
        ticker:      String(q.symbol ?? "").toUpperCase(),
        price,
        prevClose,
        chgPct:      Math.round(chgPct * 100) / 100,
        chgAbs:      price - prevClose,
        marketState: state,
        isPreMarket: isPre,
      };
    });

    res.status(200).json({ ts: new Date().toISOString(), data, err: null });
  } catch (e: any) {
    res.status(200).json({ ts: new Date().toISOString(), data: [], err: e?.message ?? "Failed" });
  }
}
