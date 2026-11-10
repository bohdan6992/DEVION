// pages/api/earnings/range.ts
// GET /api/earnings/range?from=YYYY-MM-DD&to=YYYY-MM-DD  ->  { items: EventItem[], updatedAt, refreshing }
// Serves data/earnings/nasdaq.json (written by scripts/fetch-earnings.mjs). When that file is missing or
// older than 6h, the script is spawned in the background (stale-while-revalidate) — the caller gets what
// is there now and the next poll gets the fresh data.
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const FILE = path.join(process.cwd(), "data", "earnings", "nasdaq.json");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch-earnings.mjs");
const STALE_MS = 6 * 3600_000;
const RETRY_MS = 15 * 60_000; // don't respawn a failing fetch more than every 15 min

let running = false;
let lastSpawn = 0;

function refreshInBackground() {
  if (running || Date.now() - lastSpawn < RETRY_MS) return;
  running = true;
  lastSpawn = Date.now();
  try {
    const child = spawn(process.execPath, [SCRIPT], { cwd: process.cwd(), stdio: "ignore", windowsHide: true });
    child.on("exit", () => { running = false; });
    child.on("error", () => { running = false; });
  } catch {
    running = false;
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const from = typeof req.query.from === "string" ? req.query.from : "0000-00-00";
  const to = typeof req.query.to === "string" ? req.query.to : "9999-99-99";

  let updatedAt: string | null = null;
  let rows: any[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    updatedAt = parsed.updatedAt ?? null;
    rows = Array.isArray(parsed.items) ? parsed.items : [];
  } catch { /* not fetched yet */ }

  const age = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Infinity;
  if (age > STALE_MS) refreshInBackground();

  const items = rows
    .filter((r) => r.date >= from && r.date <= to)
    .map((r) => ({
      id: `earn-${r.ticker}-${r.date}`,
      title: `Earnings${r.time ? ` · ${r.time}` : ""}`,
      date: r.date,
      ticker: r.ticker,
      tags: ["report"], // the calendar draws these gold; gold is reserved for them
      note: r.company,
    }));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ items, updatedAt, refreshing: running });
}
