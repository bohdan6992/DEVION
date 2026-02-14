import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND = process.env.BACKEND_URL || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!BACKEND) {
    console.error("BACKEND_URL is not configured (server runtime)");
    return res.status(500).json({ message: "BACKEND_URL is not configured" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const url = new URL("/api/scaner/run", BACKEND);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (req.headers.authorization) headers["Authorization"] = String(req.headers.authorization);
  if (req.headers.cookie) headers["Cookie"] = String(req.headers.cookie);

  const upstream = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(req.body ?? {}),
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