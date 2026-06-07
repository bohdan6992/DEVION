"use client";

import { useEffect, useState } from "react";

const ASSETS = [
  { ticker: "SPY",     tv: "AMEX:SPY",          name: "S&P 500 ETF"  },
  { ticker: "QQQ",     tv: "NASDAQ:QQQ",         name: "Nasdaq ETF"   },
  { ticker: "AAPL",    tv: "NASDAQ:AAPL",        name: "Apple"        },
  { ticker: "NVDA",    tv: "NASDAQ:NVDA",        name: "NVIDIA"       },
  { ticker: "TSLA",    tv: "NASDAQ:TSLA",        name: "Tesla"        },
  { ticker: "MSFT",    tv: "NASDAQ:MSFT",        name: "Microsoft"    },
  { ticker: "AMD",     tv: "NASDAQ:AMD",         name: "AMD"          },
  { ticker: "META",    tv: "NASDAQ:META",        name: "Meta"         },
  { ticker: "BTC-USD", tv: "BINANCE:BTCUSDT",   name: "Bitcoin"      },
  { ticker: "ETH-USD", tv: "BINANCE:ETHUSDT",   name: "Ethereum"     },
];

type Quote = { ticker: string; price: number; bid: number; ask: number; chgPct: number; chg: number };

function fmtP(n: number) {
  if (!n) return "—";
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MiniChart({ tv }: { tv: string }) {
  const cfg = JSON.stringify({
    symbol: tv, width: "100%", height: 90, locale: "en",
    dateRange: "1D", colorTheme: "dark", isTransparent: true,
    autosize: true, chartOnly: true,
  });
  return (
    <iframe
      key={tv}
      src={`https://www.tradingview-widget.com/embed-widget/mini-symbol-overview/?locale=en#${encodeURIComponent(cfg)}`}
      title={`mini-${tv}`}
      className="w-full border-0 block"
      style={{ height: 90 }}
      loading="lazy"
      scrolling="no"
    />
  );
}

function ChangeBar({ pct }: { pct: number }) {
  const abs = Math.min(Math.abs(pct), 5);
  const w   = (abs / 5) * 100;
  return (
    <div className="h-0.5 rounded-full w-full mt-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${w}%`, background: pct >= 0 ? "#10b981" : "#f43f5e" }}
      />
    </div>
  );
}

export default function AssetCards() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/yahoo-quotes?tickers=${ASSETS.map(a => a.ticker).join(",")}`);
        const j = await r.json();
        if (j.data?.length) setQuotes(j.data);
      } catch {}
    };
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  const qmap = new Map(quotes.map(q => [q.ticker, q]));

  return (
    <div
      className="w-full"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="max-w-[1800px] mx-auto px-6 py-5">

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-4 w-0.5 rounded-full" style={{ background: "#3b82f6" }}/>
            <span className="text-[10.5px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
              Markets Overview
            </span>
          </div>
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.15)" }}>
            Yahoo Finance · TradingView · 20s
          </span>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-5 xl:grid-cols-10 gap-2.5">
          {ASSETS.map(({ ticker, tv, name }) => {
            const q   = qmap.get(ticker);
            const up  = (q?.chgPct ?? 0) >= 0;
            const col = up ? "#34d399" : "#fb7185";

            return (
              <div
                key={ticker}
                className="rounded-xl overflow-hidden flex flex-col transition-all duration-200 cursor-pointer group"
                style={{
                  background: "rgba(255,255,255,0.028)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.13)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.028)";
                  (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                {/* Top info */}
                <div className="px-2.5 pt-2.5 pb-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono font-bold text-[12px]" style={{ color: "rgba(255,255,255,0.88)" }}>
                        {ticker.replace("-USD", "")}
                      </div>
                      <div className="text-[8px] mt-0.5 leading-none" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {name}
                      </div>
                    </div>
                    <span className="font-mono text-[9.5px] font-semibold" style={{ color: col }}>
                      {q ? `${up ? "+" : ""}${q.chgPct.toFixed(2)}%` : ""}
                    </span>
                  </div>
                  {q && <ChangeBar pct={q.chgPct} />}
                </div>

                {/* Mini chart */}
                <div className="flex-1" style={{ minHeight: 90 }}>
                  <MiniChart tv={tv} />
                </div>

                {/* Price + bid/ask */}
                <div
                  className="px-2.5 py-2 flex items-end justify-between"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="font-mono font-bold text-[13px] tabular-nums" style={{ color: "rgba(255,255,255,0.9)" }}>
                    {q ? `$${fmtP(q.price)}` : <span style={{ color: "rgba(255,255,255,0.18)" }}>—</span>}
                  </span>
                  {q?.bid && q?.ask ? (
                    <div className="text-right leading-none space-y-0.5">
                      <div className="font-mono text-[8px] tabular-nums" style={{ color: "#34d399" }}>
                        B&thinsp;{fmtP(q.bid)}
                      </div>
                      <div className="font-mono text-[8px] tabular-nums" style={{ color: "#fb7185" }}>
                        A&thinsp;{fmtP(q.ask)}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
