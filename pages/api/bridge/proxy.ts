import type { NextApiRequest, NextApiResponse } from "next";

const LOCAL_BRIDGE = "http://localhost:5197";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  const path = typeof rawPath === "string" ? rawPath : "";
  if (!path.startsWith("/api/")) {
    res.status(400).json({ ok: false, error: "Invalid bridge path" });
    return;
  }

  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD" && req.body != null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${LOCAL_BRIDGE}${path}`, {
      method,
      headers: req.headers["content-type"] ? { "Content-Type": String(req.headers["content-type"]) } : undefined,
      body: hasBody ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : undefined,
      signal: controller.signal,
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status).send(payload);
  } catch (error: any) {
    res.status(502).json({ ok: false, error: error?.message ?? "Bridge proxy failed" });
  } finally {
    clearTimeout(timeout);
  }
}
