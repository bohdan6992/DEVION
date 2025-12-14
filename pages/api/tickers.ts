import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

function parseCsvTickers(csv: string): string[] {
  const out: string[] = [];
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const [tickerRaw] = ln.split(";");
    if (!tickerRaw) continue;
    const t = tickerRaw.trim().replace(/^"|"$/g, "");
    if (!t || t.toLowerCase() === "ticker") continue; // пропускаємо заголовок
    out.push(t.toUpperCase());
  }
  return Array.from(new Set(out)).filter(Boolean);
}

// Примітивний кеш, щоб не читати файл щоразу:
let TICKERS_CACHE: string[] | null = null;
let TICKERS_MTIME = 0;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const p = path.join(process.cwd(), "data", "ticker_bench_.csv");
    const st = fs.statSync(p);
    if (!TICKERS_CACHE || st.mtimeMs !== TICKERS_MTIME) {
      const csv = fs.readFileSync(p, "utf8");
      TICKERS_CACHE = parseCsvTickers(csv);
      TICKERS_MTIME = st.mtimeMs;
    }

    // опційний ?limit=200
    const limit = Math.max(0, parseInt(String(req.query.limit ?? ""), 10) || 0);
    const payload = limit > 0 ? TICKERS_CACHE!.slice(0, limit) : TICKERS_CACHE!;

    res.status(200).json({ ok: true, count: payload.length, tickers: payload });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
