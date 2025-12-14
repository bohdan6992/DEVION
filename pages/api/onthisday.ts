import type { NextApiRequest, NextApiResponse } from "next";
import factsData from "@/data/onthisday.json";

type Fact = {
  year: number;
  i18n?: Record<string, string>;
  text?: string;
  tags?: string[];
  emoji?: string;
  source?: string | null;
  priority?: number;
};
type FactsByDay = Record<string, Fact[]>;

function mmddFor(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.month}-${m.day}`;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const tz = (req.query.tz as string) || "America/New_York";
  const lang = (req.query.lang as string) || "uk";
  const qDate = (req.query.date as string) || ""; // YYYY-MM-DD (опц.)
  const qMMDD = (req.query.mmdd as string) || ""; // MM-DD (опц.)

  const key =
    qMMDD ||
    (qDate && `${qDate.slice(5,7)}-${qDate.slice(8,10)}`) ||
    mmddFor(new Date(), tz);

  const all = (factsData as unknown as { meta: any; [k: string]: Fact[] })[key] || [];
  const items = [...all]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.year - b.year)
    .map(f => ({
      year: f.year,
      text: f.i18n?.[lang] ?? f.text ?? f.i18n?.uk ?? "",
      tags: f.tags, emoji: f.emoji, source: f.source ?? undefined
    }));

  res.status(200).json({ key, tz, lang, count: items.length, items });
}
