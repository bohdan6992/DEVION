import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND = process.env.BACKEND_URL || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!BACKEND) {
    console.error("BACKEND_URL is not configured (server runtime)");
    return res.status(500).json({ message: "BACKEND_URL is not configured" });
  }

  const url = new URL("/api/presets", BACKEND);
  for (const [k, v] of Object.entries(req.query)) {
    if (Array.isArray(v)) continue;
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const method = (req.method || "GET").toUpperCase();
  const isBodyMethod = method !== "GET" && method !== "HEAD";

  const headers: Record<string, string> = {};
  if (req.headers.authorization) headers["Authorization"] = String(req.headers.authorization);
  if (req.headers.cookie) headers["Cookie"] = String(req.headers.cookie);
  if (isBodyMethod) headers["Content-Type"] = "application/json";

  const upstream = await fetch(url.toString(), {
    method,
    headers,
    body: isBodyMethod ? JSON.stringify(req.body ?? {}) : undefined,
  });

  const text = await upstream.text();
  res.status(upstream.status);

  try {
    res.setHeader("Content-Type", "application/json");
    return res.send(text ? JSON.parse(text) : {});
  } catch {
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain");
    return res.send(text);
  }
}