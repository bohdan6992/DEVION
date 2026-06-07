"use client";

import { useEffect, useRef, useState } from "react";

/* ── Ticker config ── */
const TICKERS = [
  { ticker: "SPY",     tvSymbol: "AMEX:SPY",          label: "S&P 500 ETF" },
  { ticker: "QQQ",     tvSymbol: "NASDAQ:QQQ",         label: "Nasdaq ETF" },
  { ticker: "AAPL",    tvSymbol: "NASDAQ:AAPL",        label: "Apple" },
  { ticker: "NVDA",    tvSymbol: "NASDAQ:NVDA",        label: "NVIDIA" },
  { ticker: "TSLA",    tvSymbol: "NASDAQ:TSLA",        label: "Tesla" },
  { ticker: "MSFT",    tvSymbol: "NASDAQ:MSFT",        label: "Microsoft" },
  { ticker: "AMD",     tvSymbol: "NASDAQ:AMD",         label: "AMD" },
  { ticker: "META",    tvSymbol: "NASDAQ:META",        label: "Meta" },
  { ticker: "BTC-USD", tvSymbol: "BINANCE:BTCUSDT",   label: "Bitcoin" },
  { ticker: "ETH-USD", tvSymbol: "BINANCE:ETHUSDT",   label: "Ethereum" },
];

const REFRESH_SEC = 12;

type Quote = {
  ticker: string;
  name: string;
  price: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  spread: number;
  spreadPct: number;
  chgPct: number;
  chg: number;
  volume: number;
  marketState: string;
};

/* ── Formatters ── */
function fmtPrice(n: number) {
  if (n <= 0) return "—";
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? String(n) : "—";
}

/* ── Mini TradingView chart ── */
function MiniChart({ symbol }: { symbol: string }) {
  const cfg = {
    symbol,
    width: "100%",
    height: 130,
    locale: "en",
    dateRange: "1D",
    colorTheme: "dark",
    isTransparent: true,
    autosize: true,
    chartOnly: true,
  };
  const src = `https://www.tradingview-widget.com/embed-widget/mini-symbol-overview/?locale=en#${encodeURIComponent(
    JSON.stringify(cfg)
  )}`;

  return (
    <iframe
      key={symbol}
      src={src}
      title={`chart-${symbol}`}
      className="w-full border-0 block"
      style={{ height: 130 }}
      loading="lazy"
      scrolling="no"
    />
  );
}

/* ── Single ticker card ── */
function Card({ q, tvSymbol }: { q: Quote; tvSymbol: string }) {
  const up = q.chgPct >= 0;
  const isPrePost = q.marketState !== "REGULAR";

  return (
    <div
      className="relative overflow-hidden rounded-xl flex flex-col transition-all duration-300 group"
      style={{
        background: "linear-gradient(160deg, rgba(0,8,2,0.9) 0%, rgba(0,4,1,0.95) 100%)",
        border: "1px solid rgba(0,255,65,0.12)",
        boxShadow: "0 0 0 transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(0,255,65,0.35)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px rgba(0,255,65,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(0,255,65,0.12)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 transparent";
      }}
    >
      {/* scanline texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-start justify-between px-4 pt-3 pb-2"
        style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}
      >
        <div>
          <div
            className="font-mono font-black text-base tracking-wider"
            style={{ color: "#00ff41" }}
          >
            {q.ticker.replace("-USD", "")}
          </div>
          <div
            className="font-mono text-[9px] tracking-widest uppercase truncate max-w-[110px] mt-0.5"
            style={{ color: "rgba(0,255,65,0.35)" }}
          >
            {q.name || "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            className="font-mono text-xs font-bold"
            style={{ color: up ? "#00ff41" : "#ff4040" }}
          >
            {up ? "+" : ""}
            {q.chgPct.toFixed(2)}%
          </span>
          {isPrePost && (
            <span
              className="font-mono text-[8px] tracking-widest"
              style={{ color: "rgba(255,200,50,0.6)" }}
            >
              {q.marketState}
            </span>
          )}
        </div>
      </div>

      {/* Price + bid/ask */}
      <div className="relative z-10 px-4 py-3 font-mono space-y-3">
        {/* Main price */}
        <div
          className="text-xl font-bold tabular-nums"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          ${fmtPrice(q.price)}
        </div>

        {/* Bid / Ask */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
          <div>
            <div
              className="text-[8px] tracking-[0.2em] uppercase mb-0.5"
              style={{ color: "rgba(0,255,65,0.4)" }}
            >
              BID
            </div>
            <span
              className="font-bold tabular-nums"
              style={{ color: "#00ff41" }}
            >
              ${fmtPrice(q.bid)}
            </span>
            {q.bidSize > 0 && (
              <span
                className="ml-1 text-[8px]"
                style={{ color: "rgba(0,255,65,0.3)" }}
              >
                ×{q.bidSize}
              </span>
            )}
          </div>
          <div>
            <div
              className="text-[8px] tracking-[0.2em] uppercase mb-0.5"
              style={{ color: "rgba(255,64,64,0.5)" }}
            >
              ASK
            </div>
            <span
              className="font-bold tabular-nums"
              style={{ color: "#ff6060" }}
            >
              ${fmtPrice(q.ask)}
            </span>
            {q.askSize > 0 && (
              <span
                className="ml-1 text-[8px]"
                style={{ color: "rgba(255,64,64,0.3)" }}
              >
                ×{q.askSize}
              </span>
            )}
          </div>
          <div>
            <div
              className="text-[8px] tracking-[0.2em] uppercase mb-0.5"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              SPREAD
            </div>
            <span
              className="tabular-nums"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {q.spread > 0 ? `$${fmtPrice(q.spread)}` : "—"}
            </span>
          </div>
          <div>
            <div
              className="text-[8px] tracking-[0.2em] uppercase mb-0.5"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              VOLUME
            </div>
            <span
              className="tabular-nums"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {fmtVol(q.volume)}
            </span>
          </div>
        </div>
      </div>

      {/* TradingView chart */}
      <div className="relative z-10 overflow-hidden flex-1">
        <MiniChart symbol={tvSymbol} />
      </div>

      {/* Source footer */}
      <div
        className="relative z-10 flex items-center gap-2 px-4 py-2"
        style={{ borderTop: "1px solid rgba(0,255,65,0.06)" }}
      >
        <span
          className="centurion-status-dot"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#00ff41",
            color: "#00ff41",
          }}
        />
        <span
          className="font-mono text-[8px] tracking-[0.2em] uppercase"
          style={{ color: "rgba(0,255,65,0.35)" }}
        >
          YAHOO · LIVE
        </span>
        <span
          className="ml-auto font-mono text-[8px] tracking-[0.15em]"
          style={{ color: "rgba(0,255,65,0.2)" }}
        >
          TV·CHART
        </span>
      </div>
    </div>
  );
}

/* ── Skeleton placeholder ── */
function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-4 min-h-[320px] flex flex-col gap-3 animate-pulse"
      style={{
        background: "rgba(0,8,2,0.7)",
        border: "1px solid rgba(0,255,65,0.07)",
      }}
    >
      <div className="h-4 rounded" style={{ background: "rgba(0,255,65,0.08)" }} />
      <div className="h-7 w-2/3 rounded" style={{ background: "rgba(0,255,65,0.05)" }} />
      <div className="h-3 rounded" style={{ background: "rgba(0,255,65,0.04)" }} />
      <div className="h-3 w-3/4 rounded" style={{ background: "rgba(0,255,65,0.04)" }} />
      <div className="flex-1 rounded" style={{ background: "rgba(0,255,65,0.03)" }} />
    </div>
  );
}

/* ── Main component ── */
export default function BidAskGrid() {
  const [quotes, setQuotes]       = useState<Quote[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastTs, setLastTs]       = useState("");
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const [err, setErr]             = useState<string | null>(null);

  const fetchQuotes = async () => {
    try {
      const sym = TICKERS.map((t) => t.ticker).join(",");
      const r   = await fetch(`/api/yahoo-quotes?tickers=${sym}`);
      const json = await r.json();
      if (json.data?.length) {
        setQuotes(json.data);
        setErr(null);
      } else if (json.err) {
        setErr(json.err);
      }
      setLastTs(new Date().toISOString().slice(11, 19) + " UTC");
    } catch (e: any) {
      setErr(e?.message ?? "fetch error");
    } finally {
      setLoading(false);
    }
  };

  /* initial + interval */
  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, REFRESH_SEC * 1000);
    return () => clearInterval(id);
  }, []);

  /* countdown */
  useEffect(() => {
    setCountdown(REFRESH_SEC);
    const id = setInterval(
      () => setCountdown((p) => (p <= 1 ? REFRESH_SEC : p - 1)),
      1000
    );
    return () => clearInterval(id);
  }, [lastTs]);

  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  return (
    <section
      className="w-full py-8"
      style={{
        background:
          "linear-gradient(180deg, rgba(0,6,1,1) 0%, rgba(0,0,0,1) 100%)",
      }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 px-6 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-4">
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: "#00ff41", boxShadow: "0 0 10px #00ff41" }}
          />
          <h2
            className="font-mono font-black text-sm tracking-[0.3em] uppercase"
            style={{ color: "#00ff41" }}
          >
            LIVE BID / ASK FEEDS
          </h2>
          <span
            className="font-mono text-[9px] tracking-widest uppercase"
            style={{ color: "rgba(0,255,65,0.3)" }}
          >
            SOURCE: YAHOO · TRADINGVIEW
          </span>
        </div>

        <div
          className="flex items-center gap-5 font-mono text-[9px] tracking-widest uppercase"
          style={{ color: "rgba(0,255,65,0.4)" }}
        >
          {err && (
            <span style={{ color: "#ff6060" }}>ERR: {err.slice(0, 40)}</span>
          )}
          {lastTs && <span>UPDATED {lastTs}</span>}
          <span style={{ color: "rgba(0,255,65,0.6)" }}>
            REFRESH {countdown}s
          </span>
          <button
            onClick={() => { fetchQuotes(); setCountdown(REFRESH_SEC); }}
            className="px-3 py-1 rounded font-mono text-[9px] tracking-widest uppercase transition-all"
            style={{
              border: "1px solid rgba(0,255,65,0.2)",
              background: "rgba(0,255,65,0.04)",
              color: "rgba(0,255,65,0.6)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,65,0.1)";
              (e.currentTarget as HTMLButtonElement).style.color = "#00ff41";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,65,0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(0,255,65,0.6)";
            }}
          >
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3 px-6 max-w-[1800px] mx-auto">
        {TICKERS.map(({ ticker, tvSymbol }) => {
          const q = quoteMap.get(ticker);
          return loading || !q ? (
            <SkeletonCard key={ticker} />
          ) : (
            <Card key={ticker} q={q} tvSymbol={tvSymbol} />
          );
        })}
      </div>

      {/* Divider glow */}
      <div
        className="mt-8 h-px mx-6"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(0,255,65,0.2) 50%, transparent)",
        }}
      />
    </section>
  );
}
