"use client";

import { useEffect, useState } from "react";

const TV_MAP: Record<string, string> = {
  "SPY":     "AMEX:SPY",
  "QQQ":     "NASDAQ:QQQ",
  "AAPL":    "NASDAQ:AAPL",
  "NVDA":    "NASDAQ:NVDA",
  "TSLA":    "NASDAQ:TSLA",
  "MSFT":    "NASDAQ:MSFT",
  "AMD":     "NASDAQ:AMD",
  "META":    "NASDAQ:META",
  "BTC-USD": "BINANCE:BTCUSDT",
  "ETH-USD": "BINANCE:ETHUSDT",
};

const TABS    = ["SPY", "QQQ", "AAPL", "NVDA", "BTC-USD"];
const WATCH   = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META", "BTC-USD", "ETH-USD"];

type Quote = {
  ticker: string; name: string; price: number;
  bid: number; ask: number; spread: number;
  chgPct: number; chg: number; volume: number;
};

function fmtP(n: number) {
  if (!n) return "—";
  if (n >= 100_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 10_000)  return n.toLocaleString("en-US", { minimumFractionDigits: 0,  maximumFractionDigits: 0 });
  if (n >= 100)     return n.toLocaleString("en-US", { minimumFractionDigits: 2,  maximumFractionDigits: 2 });
  return              n.toLocaleString("en-US", { minimumFractionDigits: 2,  maximumFractionDigits: 3 });
}

function fmtV(n: number) {
  if (!n) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function TVAdvanced({ symbol, interval = "5" }: { symbol: string; interval?: string }) {
  const cfg = {
    symbol: TV_MAP[symbol] ?? symbol,
    interval,
    timezone: "America/New_York",
    theme: "dark",
    style: "1",
    locale: "en",
    backgroundColor: "#07080e",
    gridColor: "rgba(255,255,255,0.03)",
    enable_publishing: false,
    allow_symbol_change: false,
    calendar: false,
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    save_image: false,
    support_host: "https://www.tradingview.com",
  };
  return (
    <iframe
      key={symbol}
      src={`https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(cfg))}`}
      title={`tv-${symbol}`}
      className="w-full h-full border-0 block"
      loading="eager"
      scrolling="no"
    />
  );
}

const INTERVALS = [
  { label: "1m",  val: "1"  },
  { label: "5m",  val: "5"  },
  { label: "15m", val: "15" },
  { label: "1H",  val: "60" },
  { label: "1D",  val: "D"  },
];

export default function TradingCenter() {
  const [sym,      setSym]      = useState("SPY");
  const [interval, setIntervalVal] = useState("5");
  const [quotes,   setQuotes]   = useState<Quote[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [ts,       setTs]       = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/yahoo-quotes?tickers=${WATCH.join(",")}`);
        const j = await r.json();
        if (j.data?.length) {
          setQuotes(j.data);
          setTs(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" }) + " ET");
        }
      } catch {} finally { setLoading(false); }
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const qmap   = new Map(quotes.map(q => [q.ticker, q]));
  const active = qmap.get(sym);

  return (
    <div
      className="flex max-w-[1800px] mx-auto"
      style={{ height: 600, borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* ── LEFT: Chart ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>

        {/* Tab bar */}
        <div
          className="flex items-center gap-1 px-4 py-2 shrink-0"
          style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Symbol tabs */}
          <div className="flex items-center gap-1 flex-1">
            {TABS.map(s => {
              const q   = qmap.get(s);
              const up  = (q?.chgPct ?? 0) >= 0;
              const act = s === sym;
              return (
                <button
                  key={s}
                  onClick={() => setSym(s)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all"
                  style={{
                    background: act ? "rgba(255,255,255,0.08)" : "transparent",
                    border: `1px solid ${act ? "rgba(255,255,255,0.12)" : "transparent"}`,
                  }}
                >
                  <span className="font-mono text-[11px] font-bold" style={{ color: act ? "#fff" : "rgba(255,255,255,0.4)" }}>
                    {s.replace("-USD", "")}
                  </span>
                  {q && (
                    <span className="font-mono text-[10px] font-semibold" style={{ color: up ? "#34d399" : "#fb7185" }}>
                      {up ? "+" : ""}{q.chgPct.toFixed(2)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Interval selector */}
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {INTERVALS.map(({ label, val }) => (
              <button
                key={val}
                onClick={() => setIntervalVal(val)}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all"
                style={{
                  background: interval === val ? "rgba(255,255,255,0.1)" : "transparent",
                  color: interval === val ? "#fff" : "rgba(255,255,255,0.35)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart iframe */}
        <div className="flex-1">
          <TVAdvanced symbol={sym} interval={interval} />
        </div>
      </div>

      {/* ── RIGHT: Watchlist ── */}
      <div
        className="w-[280px] shrink-0 flex flex-col"
        style={{ background: "rgba(0,0,0,0.25)" }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
            Watchlist
          </span>
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.18)" }}>
            {loading ? "loading…" : ts}
          </span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {WATCH.map(s => {
            const q   = qmap.get(s);
            const up  = (q?.chgPct ?? 0) >= 0;
            const act = s === sym;
            return (
              <button
                key={s}
                onClick={() => setSym(s)}
                className="w-full flex items-center justify-between px-4 py-2.5 transition-all text-left group"
                style={{
                  background: act ? "rgba(59,130,246,0.07)" : "transparent",
                  borderLeft: `2px solid ${act ? "#3b82f6" : "transparent"}`,
                  borderBottom: "1px solid rgba(255,255,255,0.035)",
                }}
                onMouseEnter={e => { if (!act) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                onMouseLeave={e => { if (!act) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="font-mono text-[12px] font-bold"
                    style={{ color: act ? "#60a5fa" : "rgba(255,255,255,0.82)" }}
                  >
                    {s.replace("-USD", "")}
                  </span>
                  <span className="text-[9px] truncate max-w-[110px]" style={{ color: "rgba(255,255,255,0.24)" }}>
                    {q?.name || "·"}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className="font-mono text-[12px] font-semibold tabular-nums"
                    style={{ color: q ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)" }}
                  >
                    {q ? `$${fmtP(q.price)}` : "—"}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: up ? "#34d399" : "#fb7185" }}>
                    {q ? `${up ? "+" : ""}${q.chgPct.toFixed(2)}%` : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bid / Ask detail */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}
        >
          {active ? (
            <>
              <div className="text-[8.5px] font-semibold tracking-widest uppercase mb-2.5"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                {sym.replace("-USD","")} · Quote Detail
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>BID</div>
                  <div className="font-mono text-[13px] font-bold" style={{ color: "#34d399" }}>
                    {active.bid > 0 ? `$${fmtP(active.bid)}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>ASK</div>
                  <div className="font-mono text-[13px] font-bold" style={{ color: "#fb7185" }}>
                    {active.ask > 0 ? `$${fmtP(active.ask)}` : "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 flex flex-col gap-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] tracking-wide" style={{ color: "rgba(255,255,255,0.22)" }}>Spread</span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {active.spread > 0 ? `$${fmtP(active.spread)}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] tracking-wide" style={{ color: "rgba(255,255,255,0.22)" }}>Volume</span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {fmtV(active.volume)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] tracking-wide" style={{ color: "rgba(255,255,255,0.22)" }}>Day Chg</span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: (active.chg ?? 0) >= 0 ? "#34d399" : "#fb7185" }}>
                    {active.chg ? `${active.chg >= 0 ? "+" : ""}$${fmtP(Math.abs(active.chg))}` : "—"}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-20 flex items-center justify-center text-[9px] tracking-widest"
              style={{ color: "rgba(255,255,255,0.15)" }}>
              SELECT ASSET
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
