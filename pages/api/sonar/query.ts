import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!BACKEND) {
    res.status(500).json({ message: "BACKEND_URL is not configured" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const url = new URL("/api/sonar/query", BACKEND);

  const upstream = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
    } as any,
    body: JSON.stringify(req.body),
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