import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "events.json");

type EventItem = {
  id: string; title: string; date: string;
  time?: string; ticker?: string; tags?: string[];
  rank?: "S"|"A"|"B"|"F"|"N"; note?: string; link?: string;
};

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
  const { id } = req.query;
  const all = await readAll();
  const idx = all.findIndex((x) => x.id === id);

  if (req.method === "PUT") {
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    all[idx] = { ...all[idx], ...(req.body || {}) };
    await writeAll(all);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    all.splice(idx, 1);
    await writeAll(all);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).end("Method Not Allowed");
}
