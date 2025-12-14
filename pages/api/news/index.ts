import type { NextApiRequest, NextApiResponse } from "next";

/* ============== Типи ============== */
export type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;     // ISO
  source: string;      // "Reuters" | "Bloomberg" | ...
  tickers?: string[];
  sentiment?: number;  // -1..1
};

/* ============== Ваги/налаштування ============== */
const UA = process.env.SEC_USER_AGENT || "TradingTool/1.0 (+https://example.com)";
const PROVIDER_WEIGHTS: Record<string, number> = {
  AlphaVantage: 1.0,
  Marketaux: 0.9,
  Finnhub: 0.9,
  SEC: 1.1,
  MarketWatch: 0.7,
  Yahoo: 0.6,
  Reuters: 1.15,
  Bloomberg: 1.15,
};
const SOURCE_WEIGHTS: Record<string, number> = {
  "sec.gov": 1.1,
  "reuters.com": 1.1,
  "bloomberg.com": 1.1,
  "marketwatch.com": 0.8,
  "finance.yahoo.com": 0.7,
};

/* ============== Утиліти ============== */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function domainOf(u?: string): string {
  try {
    return new URL(u || "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function canonicalId(link: string, title: string, source: string) {
  const d = domainOf(link) || source.toLowerCase().trim();
  const t = title.toLowerCase().replace(/\s+/g, " ").trim();
  return `${d}::${t}`;
}
function iso(d: any) {
  try {
    const x = new Date(d);
    return isNaN(x.getTime()) ? new Date().toISOString() : x.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

/** Декодування HTML-ентіті (&#x2019; → ’ тощо) */
function decodeEntities(s: string = ""): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/* Швидкий локальний “сентимент”, якщо від провайдера немає */
const POS = [
  "beat", "beats", "surge", "soar", "rally", "gain",
  "upgrade", "bullish", "record", "strong", "robust", "outperform"
];
const NEG = [
  "miss", "plunge", "slump", "drop", "fall", "cut",
  "downgrade", "bearish", "warn", "bankruptcy", "default", "recession"
];
function quickSentiment(title: string) {
  const s = title.toLowerCase();
  let sc = 0;
  for (const w of POS) if (s.includes(w)) sc += 1;
  for (const w of NEG) if (s.includes(w)) sc -= 1;
  return clamp(sc / 6, -1, 1);
}

/* ============== RSS/Atom парсер ============== */
function parseXmlItems(xml: string): { title: string; link: string; pubDate?: string }[] {
  const out: { title: string; link: string; pubDate?: string }[] = [];

  // RSS
  const rss = xml.split(/<item[\s>]/i).slice(1);
  for (const chunk of rss) {
    const rawTitle = (chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const rawLink = (chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const title = decodeEntities(rawTitle);
    const link = decodeEntities(rawLink);
    const pubDate = (chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    if (title && link) out.push({ title, link, pubDate });
  }

  if (!out.length) {
    // Atom
    const entries = xml.split(/<entry[\s>]/i).slice(1);
    for (const chunk of entries) {
      const rawTitle = (chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
        .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      const rawLink = (chunk.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "").trim();
      const title = decodeEntities(rawTitle);
      const link = decodeEntities(rawLink);
      const pubDate = (chunk.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] || "").trim();
      if (title && link) out.push({ title, link, pubDate });
    }
  }

  return out;
}

/* ============== Провайдери ============== */

// AlphaVantage
async function fromAlphaVantage({
  limit, tickers, topics,
}: { limit: number; tickers?: string[]; topics?: string[]; }): Promise<NewsItem[]> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return [];
  const p = new URLSearchParams({ function: "NEWS_SENTIMENT", sort: "LATEST", limit: String(Math.min(limit, 100)) });
  if (tickers?.length) p.set("tickers", tickers.slice(0, 50).join(","));
  if (topics?.length) p.set("topics", topics.join(","));
  const data = await fetchJSON(`https://www.alphavantage.co/query?${p}&apikey=${key}`);
  const feed: any[] = Array.isArray(data?.feed) ? data.feed : [];
  return feed.map((it) => {
    const s = Number(it?.overall_sentiment_score ?? 0);
    const ts = String(it?.time_published || "");
    const when = ts && /^\d{8}T\d{6}/.test(ts)
      ? iso(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`)
      : iso(Date.now());
    const tix = Array.isArray(it?.ticker_sentiment)
      ? it.ticker_sentiment.map((x: any) => String(x.ticker)).filter(Boolean)
      : [];

    return {
      id: String(it?.uuid || canonicalId(it?.url || "", it?.title || "", it?.source || "AlphaVantage")),
      title: decodeEntities(String(it?.title || "")),
      link: String(it?.url || ""),
      pubDate: when,
      source: String(it?.source || "AlphaVantage"),
      tickers: tix,
      sentiment: clamp(Number.isFinite(s) ? s : 0, -1, 1),
    } as NewsItem;
  });
}

// Marketaux
async function fromMarketaux({ limit, tickers }: { limit: number; tickers?: string[]; }): Promise<NewsItem[]> {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) return [];
  const p = new URLSearchParams({
    languages: "en",
    countries: "us",
    limit: String(Math.min(limit, 50)),
    filter_entities: "true",
    published_after: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  });
  if (tickers?.length) p.set("symbols", tickers.slice(0, 50).join(","));
  const data = await fetchJSON(`https://api.marketaux.com/v1/news/all?${p}&api_token=${key}`);
  const arr: any[] = Array.isArray(data?.data) ? data.data : [];
  return arr.map((it) => ({
    id: String(it?.uuid || canonicalId(it?.url || "", it?.title || "", it?.source || "Marketaux")),
    title: decodeEntities(String(it?.title || "")),
    link: String(it?.url || ""),
    pubDate: iso(it?.published_at || Date.now()),
    source: String(it?.source || "Marketaux"),
    tickers: Array.isArray(it?.entities)
      ? it.entities.map((e: any) => String(e?.symbol || e?.name || "")).filter(Boolean)
      : undefined,
    sentiment: typeof it?.sentiment === "number" ? clamp(it.sentiment, -1, 1) : undefined,
  }));
}

// Finnhub
async function fromFinnhub({ limit }: { limit: number; }): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  const data = await fetchJSON(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
  const arr: any[] = Array.isArray(data) ? data : [];
  return arr.slice(0, limit).map((it) => ({
    id: String(it?.id || canonicalId(it?.url || "", it?.headline || "", it?.source || "Finnhub")),
    title: decodeEntities(String(it?.headline || "")),
    link: String(it?.url || ""),
    pubDate: iso((it?.datetime ?? 0) * 1000),
    source: String(it?.source || "Finnhub"),
    tickers: undefined,
    sentiment: undefined,
  }));
}

// SEC
async function fromSEC({ limit }: { limit: number; }): Promise<NewsItem[]> {
  const xml = await fetchText(
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    { headers: { "User-Agent": UA, "Accept": "application/atom+xml" } },
    15000
  );
  return parseXmlItems(xml).slice(0, limit).map((it) => ({
    id: canonicalId(it.link, it.title, "SEC"),
    title: it.title,
    link: it.link,
    pubDate: iso(it.pubDate || Date.now()),
    source: "SEC",
  }));
}

// MarketWatch
async function fromMarketWatch({ limit }: { limit: number; }): Promise<NewsItem[]> {
  const xml = await fetchText(
    "https://feeds.marketwatch.com/marketwatch/topstories/",
    { headers: { "User-Agent": UA, "Accept": "application/rss+xml" } }
  );
  return parseXmlItems(xml).slice(0, limit).map((it) => ({
    id: canonicalId(it.link, it.title, "MarketWatch"),
    title: it.title,
    link: it.link,
    pubDate: iso(it.pubDate || Date.now()),
    source: "MarketWatch",
  }));
}

// Yahoo (резерв)
async function fromYahoo({ limit }: { limit: number; }): Promise<NewsItem[]> {
  const xml = await fetchText(
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
    { headers: { "User-Agent": UA, "Accept": "application/rss+xml" } }
  );
  return parseXmlItems(xml).slice(0, limit).map((it) => ({
    id: canonicalId(it.link, it.title, "Yahoo"),
    title: it.title,
    link: it.link,
    pubDate: iso(it.pubDate || Date.now()),
    source: "Yahoo",
  }));
}

/* Reuters — залежить від вашої ліцензії/API
   Працює або через OAuth2 (client_credentials), або через x-api-key. */
async function fromReuters({
  limit, query, tickers,
}: { limit: number; query?: string; tickers?: string[]; }): Promise<NewsItem[]> {
  const BASE = process.env.REUTERS_BASE_URL;
  const API_KEY = process.env.REUTERS_API_KEY;
  const OAUTH = process.env.REUTERS_OAUTH_TOKEN_URL &&
    process.env.REUTERS_CLIENT_ID && process.env.REUTERS_CLIENT_SECRET;

  if (!BASE || (!API_KEY && !OAUTH)) return []; // немає доступу — пропускаємо

  // Отримати токен якщо треба
  let headers: Record<string, string> = { Accept: "application/json" };
  if (OAUTH) {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.REUTERS_CLIENT_ID!,
      client_secret: process.env.REUTERS_CLIENT_SECRET!,
    });
    const tok = await fetchJSON(process.env.REUTERS_OAUTH_TOKEN_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    headers["Authorization"] = `Bearer ${tok.access_token}`;
  } else if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }

  const p = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
  if (query) p.set("q", query);
  const url = `${BASE.replace(/\/+$/, "")}/news?${p.toString()}`;

  try {
    const data: any = await fetchJSON(url, { headers }, 15000);
    const arr: any[] = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
      ? data.data
      : [];
    return arr.slice(0, limit)
      .map((it) => ({
        id: String(it?.id || canonicalId(it?.url || it?.link || "", it?.title || it?.headline || "", "Reuters")),
        title: decodeEntities(String(it?.title || it?.headline || "")),
        link: String(it?.url || it?.link || ""),
        pubDate: iso(it?.published_at || it?.published || it?.date || Date.now()),
        source: "Reuters",
        tickers: Array.isArray(it?.tickers) ? it.tickers.map((t: any) => String(t)).filter(Boolean) : undefined,
        sentiment: typeof it?.sentiment === "number" ? clamp(it.sentiment, -1, 1) : undefined,
      }))
      .filter((n) => n.title && n.link);
  } catch {
    return [];
  }
}

/* Bloomberg — через внутрішній проксі (BLPAPI/Enterprise News) */
async function fromBloombergProxy({
  limit, query, tickers,
}: { limit: number; query?: string; tickers?: string[]; }): Promise<NewsItem[]> {
  const URL = process.env.BLOOMBERG_PROXY_URL;
  if (!URL) return [];
  const p = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
  if (query) p.set("q", query);
  if (tickers?.length) p.set("tickers", tickers.slice(0, 50).join(","));
  try {
    const data = await fetchJSON(`${URL}?${p.toString()}`, {
      headers: {
        Accept: "application/json",
        Authorization: process.env.BLOOMBERG_PROXY_TOKEN ? `Bearer ${process.env.BLOOMBERG_PROXY_TOKEN}` : "",
      },
    });
    const arr: any[] = Array.isArray(data?.items) ? data.items : [];
    return arr.slice(0, limit)
      .map((it) => ({
        id: String(it?.id || canonicalId(it?.link || "", it?.title || "", "Bloomberg")),
        title: decodeEntities(String(it?.title || "")),
        link: String(it?.link || ""),
        pubDate: iso(it?.pubDate || Date.now()),
        source: "Bloomberg",
        tickers: Array.isArray(it?.tickers) ? it.tickers.map((t: any) => String(t)).filter(Boolean) : undefined,
        sentiment: typeof it?.sentiment === "number" ? clamp(it.sentiment, -1, 1) : undefined,
      }))
      .filter((n) => n.title && n.link);
  } catch {
    return [];
  }
}

/* ============== Агрегація/фільтри/сортування ============== */
function rankScore(n: NewsItem, now = Date.now(), userTickers: string[] = []): number {
  const ageMin = (now - new Date(n.pubDate).getTime()) / 60000;
  const recency = Math.exp(-ageMin / 180); // ~3h half-life
  const provW = PROVIDER_WEIGHTS[n.source] ?? 0.8;
  const srcW = SOURCE_WEIGHTS[domainOf(n.link)] ?? 0.8;
  const senti = typeof n.sentiment === "number" ? 0.2 * Math.abs(n.sentiment) : 0;
  const tick = n.tickers?.some((t) => userTickers.includes(t)) ? 0.3 : 0;
  return recency * (0.7 + 0.2 * provW + 0.1 * srcW) + senti + tick;
}
function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const it of items) {
    const key = canonicalId(it.link, it.title, it.source);
    if (!seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

/* ============== Проста in-memory cache ============== */
const memoryCache = new Map<string, { ts: number; data: NewsItem[] }>();
const TTL = 60_000;

/* ============== Handler ============== */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    limit: limitStr = "80",
    q = "",
    tickers: tickersStr = "",
    sources: sourcesStr = "",
    sinceMinutes = "",
  } = req.query as Record<string, string>;

  const limit = Math.max(1, Math.min(300, parseInt(limitStr || "80", 10)));
  const tickers = tickersStr
    ? tickersStr.split(",").map((s) => s.trim().toUpperCase()).slice(0, 50)
    : [];
  const sourcesFilter = new Set(
    (sourcesStr ? sourcesStr.split(",").map((s) => s.trim()) : []).filter(Boolean)
  );

  const cacheKey = JSON.stringify({ limit, q, tickers, sources: [...sourcesFilter].sort(), sinceMinutes });
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && now - cached.ts < TTL) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
    return res.status(200).json({ s: "ok", items: cached.data });
  }

  try {
    const jobs: Promise<NewsItem[]>[] = [
      fromReuters({ limit: 80, query: q, tickers }),
      fromBloombergProxy({ limit: 80, query: q, tickers }),
      fromAlphaVantage({
        limit: 80,
        tickers,
        topics: ["earnings", "ipo", "mergers_and_acquisitions", "financial_markets"],
      }),
      fromMarketaux({ limit: 60, tickers }),
      fromFinnhub({ limit: 60 }),
      fromSEC({ limit: 60 }),
      fromMarketWatch({ limit: 50 }),
      fromYahoo({ limit: 40 }),
    ];

    const settled = await Promise.allSettled(jobs);
    const all: NewsItem[] = [];
    for (const s of settled) if (s.status === "fulfilled" && Array.isArray(s.value)) all.push(...s.value);

    // Fallback
    if (all.length < 10) {
      await sleep(800);
      try { all.push(...(await fromMarketWatch({ limit: 40 }))); } catch {}
      try { all.push(...(await fromYahoo({ limit: 30 }))); } catch {}
    }

    // sentiment-fallback
    for (const it of all) if (typeof it.sentiment !== "number") it.sentiment = quickSentiment(it.title);

    // фільтри
    let filtered = all;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filtered = filtered.filter((n) => re.test(n.title) || re.test(n.source) || re.test(n.link));
    }
    if (tickers.length) {
      filtered = filtered.filter((n) => n.tickers?.some((t) => tickers.includes(t)));
    }
    if (sourcesFilter.size) {
      filtered = filtered.filter(
        (n) => sourcesFilter.has(n.source) || sourcesFilter.has(domainOf(n.link))
      );
    }
    if (sinceMinutes) {
      const m = parseInt(sinceMinutes, 10);
      if (Number.isFinite(m) && m > 0) {
        const thr = Date.now() - m * 60000;
        filtered = filtered.filter((n) => new Date(n.pubDate).getTime() >= thr);
      }
    }

    const unique = dedupe(filtered);
    unique.sort((a, b) => rankScore(b, now, tickers) - rankScore(a, now, tickers));
    const result = unique.slice(0, limit);

    memoryCache.set(cacheKey, { ts: now, data: result });
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
    res.status(200).json({ s: "ok", items: result });
  } catch (e: any) {
    console.error("[/api/news] fail", e?.message || e);
    res.status(200).json({ s: "ok", items: [], note: "partial or empty due to upstream error" });
  }
}
