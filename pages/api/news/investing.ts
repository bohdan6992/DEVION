import type { NextApiRequest, NextApiResponse } from "next";
import { fetchInvestingNews } from "@/lib/rss/investing";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const feedParams = (Array.isArray(req.query.feed) ? req.query.feed : [req.query.feed])
      .filter(Boolean) as string[];
    const news = await fetchInvestingNews(feedParams.length ? feedParams : undefined);

    // ТОП N (за замовчуванням 40) — можна задати ?limit=20
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 40)));
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300"); // 5 хв + S-W-R
    res.status(200).json({ items: news.slice(0, limit) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch Investing RSS" });
  }
}
