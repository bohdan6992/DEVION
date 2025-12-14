import type { NextApiRequest, NextApiResponse } from "next";

// ВАЖЛИВО: працюємо у nodejs runtime, не Edge
export const config = { api: { bodyParser: false, externalResolver: true }, runtime: "nodejs" } as any;

function toItemsReddit(xml: string) {
  // дуже простий XML-парс без залежностей
  const items: any[] = [];
  const re = /<entry>[\s\S]*?<\/entry>/g;
  const titleRe = /<title>([\s\S]*?)<\/title>/;
  const linkRe = /<link.*?href="([^"]+)"/;
  const dateRe = /<updated>([^<]+)<\/updated>/;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const title = (titleRe.exec(block)?.[1] || "").trim();
    const link = linkRe.exec(block)?.[1] || "#";
    const pubDate = dateRe.exec(block)?.[1] || new Date().toISOString();
    if (title) items.push({ id: link, title, link, pubDate, source: "reddit" });
  }
  return items;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const source = (req.query.source as string) || "reddit";
    const q = (req.query.q as string) || "AAPL OR NVDA OR SPY";
    const limit = Math.min(Number(req.query.limit || 24), 100);

    if (source === "reddit") {
      const u = new URL("https://www.reddit.com/search.rss");
      u.searchParams.set("q", q);
      u.searchParams.set("sort", "new");
      const r = await fetch(u.toString(), {
        headers: {
          // Reddit часом блокує дефолтний UA
          "User-Agent": "TradingTool/1.0 (https://example.com)",
          "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        },
        // краще без кешу, бо фід живий
        cache: "no-store",
      });
      const xml = await r.text();
      if (!r.ok) return res.status(r.status).json({ error: `upstream ${r.status}`, raw: xml });
      const items = toItemsReddit(xml).slice(0, limit);
      return res.status(200).json({ items });
    }

    // заглушка для "twitter" (поки без токенів)
    if (source === "twitter") {
      return res.status(200).json({ items: [] });
    }

    return res.status(400).json({ error: "unknown source" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
