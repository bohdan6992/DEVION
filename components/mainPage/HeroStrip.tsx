"use client";

import { useEffect, useState } from "react";

const ASSETS = [
  { sym: "SPY",     label: "S&P 500",  tv: "AMEX:SPY" },
  { sym: "QQQ",     label: "Nasdaq",   tv: "NASDAQ:QQQ" },
  { sym: "NVDA",    label: "NVIDIA",   tv: "NASDAQ:NVDA" },
  { sym: "TSLA",    label: "Tesla",    tv: "NASDAQ:TSLA" },
  { sym: "BTC-USD", label: "Bitcoin",  tv: "BINANCE:BTCUSDT" },
  { sym: "ETH-USD", label: "Ethereum", tv: "BINANCE:ETHUSDT" },
  { sym: "MSFT",    label: "Microsoft",tv: "NASDAQ:MSFT" },
];

type Quote = { ticker: string; price: number; chgPct: number };

const BrandIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-blue-400">
    <path d="M12 2.9L18.4 5.45V11.05C18.4 15.72 15.66 19.06 12 20.75C8.34 19.06 5.6 15.72 5.6 11.05V5.45L12 2.9Z"
      stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M8.35 8.6H15.65" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M9.1 10.15H14.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.8"/>
    <path d="M12 8.6V17.35" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
    <path d="M8.55 17.2C9.5 15.95 10.68 15.25 12 15.25C13.32 15.25 14.5 15.95 15.45 17.2"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8"/>
  </svg>
);

function SessionBadge() {
  const [session, setSession] = useState<"OPEN"|"PRE-MARKET"|"AFTER-HOURS"|"CLOSED">("CLOSED");

  useEffect(() => {
    const check = () => {
      const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const m  = ny.getHours() * 60 + ny.getMinutes();
      const d  = ny.getDay();
      if (d === 0 || d === 6)      { setSession("CLOSED");       return; }
      if (m < 4 * 60)              { setSession("CLOSED");       return; }
      if (m < 9 * 60 + 30)        { setSession("PRE-MARKET");   return; }
      if (m < 16 * 60)             { setSession("OPEN");         return; }
      if (m < 20 * 60)             { setSession("AFTER-HOURS");  return; }
      setSession("CLOSED");
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const palette = {
    "OPEN":         { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  dot: "#10b981", text: "#34d399" },
    "PRE-MARKET":   { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  dot: "#f59e0b", text: "#fbbf24" },
    "AFTER-HOURS":  { bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.25)",  dot: "#8b5cf6", text: "#a78bfa" },
    "CLOSED":       { bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)",  dot: "#6b7280", text: "#9ca3af" },
  };
  const p = palette[session];

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
      <span className="centurion-status-dot" style={{ display:"inline-block", width:5, height:5, borderRadius:"50%", background:p.dot, color:p.dot }}/>
      <span className="font-mono text-[9px] font-semibold tracking-widest" style={{ color: p.text }}>
        {session}
      </span>
    </div>
  );
}

function fmt(n: number) {
  if (!n) return "—";
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1_000)  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HeroStrip() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clock,  setClock]  = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/yahoo-quotes?tickers=${ASSETS.map(a => a.sym).join(",")}`);
        const j = await r.json();
        setQuotes(j.data || []);
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "America/New_York", hour12: false,
      }) + " ET");
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const qmap = new Map(quotes.map(q => [q.ticker, q]));

  return (
    <div
      className="relative w-full"
      style={{
        background: "linear-gradient(180deg, #0c0e1c 0%, #08090f 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Subtle blue aurora */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 70% 120% at 50% -30%, rgba(59,130,246,0.12) 0%, transparent 70%)",
      }}/>

      <div className="relative max-w-[1800px] mx-auto px-6 py-4 flex items-center gap-6">

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <BrandIcon />
          <div className="leading-none">
            <div className="font-bold text-[15px] tracking-[0.22em] text-white uppercase">CENTURION</div>
            <div className="text-[8.5px] tracking-widest uppercase mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
              Market Intelligence
            </div>
          </div>
        </div>

        <div className="shrink-0 h-7 w-px" style={{ background: "rgba(255,255,255,0.07)" }}/>

        {/* Live stats */}
        <div className="flex items-center gap-5 flex-1 overflow-x-auto no-scrollbar">
          {ASSETS.map(({ sym, label }) => {
            const q   = qmap.get(sym);
            const up  = (q?.chgPct ?? 0) >= 0;
            const col = up ? "#34d399" : "#fb7185";

            return (
              <div key={sym} className="flex items-center gap-2 shrink-0">
                <span className="text-[9.5px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {label}
                </span>
                {q ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-white">
                      {sym.includes("USD") ? "$" : "$"}{fmt(q.price)}
                    </span>
                    <span className="font-mono text-[10.5px] font-semibold tabular-nums" style={{ color: col }}>
                      {up ? "▲" : "▼"}&thinsp;{Math.abs(q.chgPct).toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <span className="font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.15)" }}>· · ·</span>
                )}
                <div className="shrink-0 h-4 w-px ml-1" style={{ background: "rgba(255,255,255,0.07)" }}/>
              </div>
            );
          })}
        </div>

        {/* Right: session + clock */}
        <div className="flex items-center gap-3 shrink-0">
          <SessionBadge />
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.28)" }}>
            {clock}
          </span>
        </div>
      </div>
    </div>
  );
}
