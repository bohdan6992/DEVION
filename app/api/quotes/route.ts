// app/api/quotes/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const BRIDGE_URL = (process.env.AXI_BASE_URL || "http://localhost:5197").replace(/\/$/, "");

const DEFAULT_TICKERS =
  "META,AAPL,AMZN,NFLX,PLTR,AMD,QQQ,SPY,SMH,IBIT,XLF,KRE,XLE,IWM,KWEB,ETHA";
const DEFAULT_FIELDS =
  "Bid,Ask,Spread,BidSize,AskSize,VWAP,Exchange,ADV90,ATR14,ImbExch,ImbARCA,LstCls,TOpen,PreMhVolNF,VolNFFromLstCls";

/* ====== anti-race + soft cache ====== */
let inflight: Promise<Record<string, Record<string, unknown>>> | null = null;
let lastOk: { at: number; data: Record<string, Record<string, unknown>> } | null = null;
const SOFT_CACHE_MS = 1500;

async function fetchFromBridge(
  req: Request
): Promise<Record<string, Record<string, unknown>>> {
  const url = new URL(req.url);
  const tickers = url.searchParams.get("tickers") || DEFAULT_TICKERS;
  const fields = url.searchParams.get("fields") || DEFAULT_FIELDS;

  const bridgeUrl = `${BRIDGE_URL}/api/live/snapshot?tickers=${encodeURIComponent(tickers)}&fields=${encodeURIComponent(fields)}`;

  const resp = await fetch(bridgeUrl, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`bridge ${resp.status}: ${body.slice(0, 500)}`);
  }

  const json = await resp.json();

  // Transform {ok, items: [{ticker, fields}]} → {TICKER: {field: value}}
  const result: Record<string, Record<string, unknown>> = {};
  for (const item of json.items ?? []) {
    if (item?.ticker) result[item.ticker] = item.fields ?? {};
  }
  return result;
}

export async function GET(req: Request) {
  // Only used locally — production data comes from TradingApp/TRAP on the local device.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "quotes-api-disabled-in-production",
        message:
          "This endpoint is only used locally. In production get data directly from TradingApp/TRAP on the local device.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = Date.now();
  if (lastOk && now - lastOk.at < SOFT_CACHE_MS) {
    return NextResponse.json(lastOk.data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (inflight) {
    try {
      const data = await inflight;
      return NextResponse.json(data, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {}
  }

  try {
    inflight = fetchFromBridge(req).finally(() => (inflight = null));
    const data = await inflight;
    lastOk = { at: Date.now(), data };
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: msg, when: new Date().toISOString(), bridge: BRIDGE_URL },
      { status: 500 }
    );
  }
}
