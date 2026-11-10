#!/usr/bin/env node
/**
 * Pulls the US earnings calendar (Nasdaq public API, no key) for the current quarter and writes it to
 * data/earnings/nasdaq.json — a file /api/earnings/today and /api/earnings/range already read.
 *
 *   node scripts/fetch-earnings.mjs                    # current quarter, market cap >= $50B
 *   node scripts/fetch-earnings.mjs --min-cap 10e9     # lower the cap filter
 *   node scripts/fetch-earnings.mjs --from 2026-11-01 --to 2026-12-31
 *
 * Always kept regardless of cap: tickers listed in data/earnings-watchlist.json (a plain JSON array,
 * e.g. ["AAPL","NVDA","OPEN"]). Created on first need; absent file = no extras.
 *
 * Safe to re-run: days that fetch successfully are replaced, days that fail keep their previous rows,
 * and nothing is written if every request failed (so a network outage never wipes the file).
 * /api/earnings/range spawns this automatically when the file is older than 6 hours.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "earnings", "nasdaq.json");
const WATCH = path.join(ROOT, "data", "earnings-watchlist.json");

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const now = new Date();
const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
const from = new Date(`${arg("from", ymd(qStart))}T00:00:00`);
const to = new Date(`${arg("to", ymd(qEnd))}T00:00:00`);
const minCap = Number(arg("min-cap", "50e9"));

let watch = new Set();
try {
  watch = new Set(JSON.parse(fs.readFileSync(WATCH, "utf8")).map((t) => String(t).toUpperCase()));
} catch { /* optional */ }

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

const TIME = { "time-pre-market": "BMO", "time-after-hours": "AMC" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseCap = (s) => Number(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;

async function fetchDay(date) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, { headers: HEADERS, signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rows = j?.data?.rows;
      if (rows === null || rows === undefined) return []; // weekend / holiday: valid "nothing"
      if (!Array.isArray(rows)) throw new Error("unexpected shape");
      return rows;
    } catch (e) {
      if (attempt === 3) { console.warn(`  ${date}: failed (${e.message})`); return null; }
      await sleep(600 * attempt);
    }
  }
  return null;
}

// existing rows, so a failed day keeps what it had
let prev = [];
try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")).items ?? []; } catch { /* first run */ }

const days = [];
for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
  if (d.getDay() !== 0 && d.getDay() !== 6) days.push(ymd(d));
}
console.log(`Earnings ${days[0]} → ${days[days.length - 1]} (${days.length} weekdays), cap ≥ ${(minCap / 1e9).toFixed(0)}B, watchlist ${watch.size}`);

const fetched = new Map(); // date -> rows | null
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < days.length) {
    const date = days[cursor++];
    fetched.set(date, await fetchDay(date));
    await sleep(150);
  }
}));

const ok = [...fetched.values()].filter((v) => v !== null).length;
if (ok === 0) {
  console.error("Every request failed — keeping the existing file untouched.");
  process.exit(1);
}

const daySet = new Set(days);
const items = prev.filter((x) => !(daySet.has(x.date) && fetched.get(x.date) !== null && fetched.get(x.date) !== undefined));
for (const [date, rows] of fetched) {
  if (!rows) continue;
  for (const r of rows) {
    const ticker = String(r.symbol ?? "").trim().toUpperCase();
    const cap = parseCap(r.marketCap);
    if (!ticker || (cap < minCap && !watch.has(ticker))) continue;
    items.push({
      date,
      ticker,
      company: String(r.name ?? "").trim(),
      sector: "",
      time: TIME[r.time] ?? "",
      marketCap: cap,
      epsForecast: r.epsForecast ?? "",
    });
  }
}
items.sort((a, b) => a.date.localeCompare(b.date) || b.marketCap - a.marketCap);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: "nasdaq", items }, null, 2));
console.log(`Wrote ${items.length} earnings to ${path.relative(ROOT, OUT)} (${ok}/${days.length} days fetched)`);
