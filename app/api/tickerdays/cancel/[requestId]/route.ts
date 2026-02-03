import { NextResponse } from "next/server";
import { getBridgeBaseUrl } from "@/lib/bridgeEnv";

export async function POST(_req: Request, ctx: { params: { requestId: string } }) {
  const base = getBridgeBaseUrl();
  const url = `${base}/api/tickerdays/cancel/${encodeURIComponent(ctx.params.requestId)}`;

  const r = await fetch(url, { method: "POST", cache: "no-store" });
  const text = await r.text();

  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
  });
}
