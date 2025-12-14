import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "events.json");
const TZ = "Europe/Kyiv";

type EventItem = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm (optional)
  ticker?: string;
  tags?: string[];
  rank?: "S" | "A" | "B" | "F" | "N";
  note?: string;
  link?: string;
};

function getQuarterBounds(d = new Date()) {
  // Поточний квартал у часовій зоні Києва
  const local = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  ); // робимо "зріз" дня в TZ

  const month = local.getMonth(); // 0..11
  const q = Math.floor(month / 3); // 0..3
  const startMonth = q * 3;
  const start = new Date(local.getFullYear(), startMonth, 1);
  const end = new Date(local.getFullYear(), startMonth + 3, 0); // останній день кварталу
  return { start, end, q: q + 1, year: local.getFullYear() };
}

async function readAll(): Promise<EventItem[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const json = JSON.parse(raw || "{}");
    return json.events || [];
  } catch {
    return [];
  }
}

async function writeAll(events: EventItem[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ events }, null, 2), "utf-8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const all = await readAll();
    const { start, end } = getQuarterBounds();

    const inQuarter = all.filter((e) => {
      const d = new Date(e.date + "T00:00:00");
      return d >= start && d <= end;
    });

    return res.status(200).json({ items: inQuarter });
  }

  if (req.method === "POST") {
    // додаємо подію
    try {
      const body = req.body as Partial<EventItem>;
      if (!body?.id || !body?.title || !body?.date) {
        return res.status(400).json({ error: "id, title, date — обов’язкові" });
      }
      const all = await readAll();
      if (all.some((x) => x.id === body.id)) {
        return res.status(409).json({ error: "Подія з таким id вже існує" });
      }
      all.push(body as EventItem);
      await writeAll(all);
      return res.status(201).json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Write failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method Not Allowed");
}
