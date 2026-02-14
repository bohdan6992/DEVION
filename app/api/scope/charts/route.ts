import { NextResponse } from "next/server";
import { getBridgeBaseUrl } from "@/lib/bridgeEnv";

export async function POST(req: Request) {
  const base = getBridgeBaseUrl() || "http://localhost:5197";
  const url = `${base}/api/scope/charts`;

  const body = await req.text();

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
  });
}
