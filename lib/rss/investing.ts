import Parser from "rss-parser";
import type { NewsItem } from "@/types/news";

const parser = new Parser();

export const INVESTING_FEEDS: string[] = [
  // Глобальні ринки, компанії, макро
  "https://www.investing.com/rss/news_25.rss",    // Stock Market News
  "https://www.investing.com/rss/news_356.rss",   // Company News
  "https://www.investing.com/rss/news_1062.rss",  // Earnings Reports
  "https://www.investing.com/rss/news_95.rss",    // Economic Indicators
];

export const IMPORTANT_PATTERNS: RegExp[] = [
  /earnings|results|profit|revenue|guidance|outlook/i,
  /merger|acquisition|m&a|deal|buyout/i,
  /ipo|listing|delisting/i,
  /fed|ecb|rate hike|rate cut|interest rate|monetary|central bank/i,
  /inflation|cpi|ppi|jobs|unemployment|payrolls|gdp/i,
  /sanctions|tariff|geopolitics|conflict|war/i,
  /tesla|apple|microsoft|amazon|nvidia|alphabet|meta|saudi aramco|tsmc/i,
  /bankruptcy|insolvency|default|downgrade|credit rating/i,
  /guidance cut|profit warning|restatement/i,
];

export function isImportant(title: string): boolean {
  return IMPORTANT_PATTERNS.some((re) => re.test(title));
}

export function normalizeItem(i: any, source: string): NewsItem {
  return {
    id: i.guid || i.link || i.isoDate || i.pubDate || `${source}-${i.title}`,
    title: i.title?.trim() ?? "",
    link: i.link,
    pubDate: i.pubDate || i.isoDate || new Date().toISOString(),
    isoDate: i.isoDate,
    source,
    categories: (i.categories || []).map((c: any) => String(c)),
  };
}

export function dedupe(items: NewsItem[]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!map.has(key)) map.set(key, it);
  }
  return [...map.values()];
}

export async function fetchInvestingNews(feeds = INVESTING_FEEDS): Promise<NewsItem[]> {
  const results = await Promise.all(
    feeds.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);
        return (feed.items || []).map((i) => normalizeItem(i, feed.title || "Investing.com"));
      } catch {
        return [] as NewsItem[];
      }
    })
  );

  const merged = results.flat();
  const important = merged.filter((i) => isImportant(i.title));
  const unique = dedupe(important);

  unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return unique;
}
