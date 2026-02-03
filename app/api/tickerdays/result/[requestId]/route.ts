import { NextResponse } from "next/server";
import { getBridgeBaseUrl } from "@/lib/bridgeEnv";

export async function GET(_req: Request, ctx: { params: { requestId: string } }) {
  const base = getBridgeBaseUrl();
  const url = `${base}/api/tickerdays/result/${encodeURIComponent(ctx.params.requestId)}`;

  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const text = await r.text();

  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
  });
}
