import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!BACKEND) {
    res.status(500).json({ message: "BACKEND_URL is not configured" });
    return;
  }

  const { id } = req.query;
  const sid = Array.isArray(id) ? id[0] : id;
  if (!sid) {
    res.status(400).json({ message: "Missing id" });
    return;
  }

  const url = new URL(`/api/presets/${encodeURIComponent(sid)}`, BACKEND);
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "id") continue;
    if (Array.isArray(v)) continue;
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
    } as any,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body),
  });

  const text = await upstream.text();
  res.status(upstream.status);

  try {
    res.setHeader("Content-Type", "application/json");
    res.send(text ? JSON.parse(text) : {});
  } catch {
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain");
    res.send(text);
  }
}