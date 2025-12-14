// pages/api/earnings/today.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

type EarningsItem = {
  date: string;
  ticker: string;
  company: string;
  sector: string;
  time: string; // "BMO" | "AMC" | "HH:MM"
};

function kyivToday(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = fmt.formatToParts(now);
  const y = p.find(v => v.type === "year")?.value ?? "1970";
  const m = p.find(v => v.type === "month")?.value ?? "01";
  const d = p.find(v => v.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

// приймаємо кілька форматів і повертаємо YYYY-MM-DD
function normalizeDate(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // DD.MM.YYYY
  const m1 = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  // YYYY.MM.DD
  const m2 = t.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function orderKey(timeRaw: string) {
  const t = (timeRaw ?? "").toString().trim().toUpperCase();
  if (t === "BMO") return "00:00";
  if (t === "AMC") return "99:99";
  // HH:MM
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  return "50:00";
}

function readAllEarnings(): { items: EarningsItem[]; sources: string[] } {
  const baseDir = path.join(process.cwd(), "data");
  const items: EarningsItem[] = [];
  const sources: string[] = [];

  // 1) data/earnings.json (якщо є)
  const mainFile = path.join(baseDir, "earnings.json");
  if (fs.existsSync(mainFile)) {
    try {
      const raw = fs.readFileSync(mainFile, "utf8");
      const parsed = JSON.parse(raw);
      const arr: any[] = Array.isArray(parsed) ? parsed : parsed?.items ?? [];
      arr.forEach((r, i) => {
        const date = normalizeDate(String(r.date ?? ""));
        if (!date) return;
        items.push({
          date,
          ticker: String(r.ticker ?? "").trim(),
          company: String(r.company ?? "").trim(),
          sector: String(r.sector ?? "").trim(),
          time: String(r.time ?? "").trim(),
        });
      });
      sources.push("earnings.json");
    } catch {}
  }

  // 2) усі файли в data/earnings/*.json
  const subDir = path.join(baseDir, "earnings");
  if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
    const files = fs.readdirSync(subDir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const full = path.join(subDir, f);
        const raw = fs.readFileSync(full, "utf8");
        const parsed = JSON.parse(raw);
        const arr: any[] = Array.isArray(parsed) ? parsed : parsed?.items ?? [];
        arr.forEach((r, i) => {
          const date = normalizeDate(String(r.date ?? ""));
          if (!date) return;
          items.push({
            date,
            ticker: String(r.ticker ?? "").trim(),
            company: String(r.company ?? "").trim(),
            sector: String(r.sector ?? "").trim(),
            time: String(r.time ?? "").trim(),
          });
        });
        sources.push(`earnings/${f}`);
      } catch {}
    }
  }

  return { items, sources };
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { items, sources } = readAllEarnings();

    const today = (typeof req.query.date === "string" && req.query.date) || kyivToday();

    const filtered = items
      .filter(x => x.date === today)
      .sort((a, b) => orderKey(a.time).localeCompare(orderKey(b.time)) || a.ticker.localeCompare(b.ticker));

    const debug = req.query.debug === "1";
    res.status(200).json(
      debug
        ? { date: today, countAll: items.length, sources, itemsToday: filtered }
        : { date: today, items: filtered }
    );
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Unable to read earnings data" });
  }
}
