"use client";

import { useEffect, useRef, useState } from "react";
import type { PulseTick } from "@/pages/api/market-pulse";

/* ─── Types ─── */
type Signal  = "bull" | "bear" | "neutral";
type Factor  = {
  ticker:      string;
  label:       string;
  sub:         string;
  price:       number;
  chgPct:      number;
  marketState: string;
  isPreMarket: boolean;
  score:       number;      // -2 … +2
  signal:      Signal;
  signalLabel: string;
  priceLabel:  string;
};

type Accent = { hex: string; hex2: string; rgb: string; muted: string };

/* ─── Indicator meta ─── */
const META = [
  { ticker: "^VIX",     label: "VIX",   sub: "Fear Index",    type: "vix"   },
  { ticker: "SPY",      label: "SPY",   sub: "S&P 500",       type: "index" },
  { ticker: "QQQ",      label: "QQQ",   sub: "Nasdaq 100",    type: "index" },
  { ticker: "DX-Y.NYB", label: "DXY",   sub: "US Dollar",     type: "dxy"   },
  { ticker: "GC=F",     label: "GOLD",  sub: "Gold Futures",  type: "gold"  },
  { ticker: "BTC-USD",  label: "BTC",   sub: "Bitcoin",       type: "btc"   },
  { ticker: "^TNX",     label: "10Y",   sub: "Treasury Yield",type: "yield" },
  { ticker: "CL=F",     label: "OIL",   sub: "Crude WTI",     type: "oil"   },
] as const;

/* ─── Scoring ─── */
function score(type: string, price: number, chgPct: number): number {
  const c = chgPct;
  switch (type) {
    case "vix":
      if (price < 12) return 2; if (price < 15) return 1.5;
      if (price < 18) return 1; if (price < 22) return 0;
      if (price < 28) return -1; if (price < 35) return -1.5;
      return -2;
    case "index":
      if (c > 1.5) return 2; if (c > 0.5) return 1; if (c > 0.15) return 0.5;
      if (c > -0.15) return 0; if (c > -0.5) return -0.5;
      if (c > -1.5) return -1; return -2;
    case "dxy": // inverted
      if (c < -0.5) return 1.5; if (c < -0.15) return 0.75;
      if (c < 0.15) return 0; if (c < 0.5) return -0.75;
      return -1.5;
    case "gold": // risk-off = bearish
      if (c > 1.5) return -1; if (c > 0.5) return -0.5;
      if (c > -0.5) return 0; return 0.5;
    case "btc":
      if (c > 3) return 2; if (c > 1) return 1; if (c > -1) return 0;
      if (c > -3) return -1; return -2;
    case "yield": // inverted
      if (c > 2) return -1.5; if (c > 0.5) return -0.75;
      if (c > -0.5) return 0; return 0.75;
    case "oil":
      if (Math.abs(c) < 1.5) return 0;
      if (c > 3) return -0.5; if (c > 1.5) return 0.25;
      if (c < -3) return -0.5; return -0.25;
    default: return 0;
  }
}

function getSignal(type: string, price: number, chgPct: number, s: number): { signal: Signal; label: string } {
  if (type === "vix") {
    if (price < 15) return { signal: "bull",    label: "LOW FEAR"    };
    if (price < 20) return { signal: "neutral", label: "MODERATE"    };
    if (price < 28) return { signal: "bear",    label: "HIGH FEAR"   };
    return             { signal: "bear",    label: "EXTREME FEAR" };
  }
  if (type === "dxy") {
    if (chgPct < -0.2) return { signal: "bull",    label: "WEAK $"  };
    if (chgPct >  0.2) return { signal: "bear",    label: "STRONG $" };
    return               { signal: "neutral", label: "STABLE"    };
  }
  if (type === "gold") {
    if (chgPct >  0.8) return { signal: "bear",    label: "RISK-OFF" };
    if (chgPct < -0.5) return { signal: "bull",    label: "RISK-ON"  };
    return               { signal: "neutral", label: "NEUTRAL"   };
  }
  if (type === "yield") {
    if (chgPct >  1.0) return { signal: "bear",    label: "YIELDS ↑" };
    if (chgPct < -0.5) return { signal: "bull",    label: "YIELDS ↓" };
    return               { signal: "neutral", label: "STABLE"    };
  }
  if (type === "oil") {
    if (Math.abs(chgPct) < 1.5) return { signal: "neutral", label: "STABLE"   };
    if (chgPct >  3)             return { signal: "bear",    label: "SURGE"    };
    if (chgPct >  1.5)           return { signal: "neutral", label: "RISING"   };
    if (chgPct < -3)             return { signal: "bear",    label: "SLUMP"    };
    return                              { signal: "neutral", label: "FALLING"  };
  }
  if (s >= 1)  return { signal: "bull",    label: "BULLISH"  };
  if (s <= -1) return { signal: "bear",    label: "BEARISH"  };
  return         { signal: "neutral", label: "NEUTRAL"  };
}

function formatPrice(ticker: string, price: number): string {
  if (!price) return "–";
  if (ticker === "^VIX")     return price.toFixed(2);
  if (ticker === "^TNX")     return `${price.toFixed(2)}%`;
  if (ticker === "BTC-USD")  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (ticker === "GC=F")     return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price > 1000)          return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price > 100)           return `$${price.toFixed(2)}`;
  return price.toFixed(2);
}

/* ─── Sentiment ─── */
type Sentiment = { pct: number; label: string; color: string };

function calcSentiment(factors: Factor[]): Sentiment {
  if (!factors.length) return { pct: 50, label: "NO DATA", color: "#94a3b8" };
  const total = factors.reduce((s, f) => s + f.score, 0);
  const maxAbs = factors.length * 2;
  const pct = Math.round(((total + maxAbs) / (maxAbs * 2)) * 100);
  if (pct < 20) return { pct, label: "VERY BEARISH",     color: "#ef4444" };
  if (pct < 35) return { pct, label: "BEARISH",          color: "#f97316" };
  if (pct < 44) return { pct, label: "SLIGHTLY BEARISH", color: "#fb923c" };
  if (pct < 56) return { pct, label: "NEUTRAL",          color: "#94a3b8" };
  if (pct < 65) return { pct, label: "SLIGHTLY BULLISH", color: "#86efac" };
  if (pct < 78) return { pct, label: "BULLISH",          color: "#34d399" };
  return              { pct, label: "VERY BULLISH",      color: "#10b981" };
}

/* ─── Signal colors ─── */
const SIG_COLOR: Record<Signal, string> = {
  bull:    "#34d399",
  bear:    "#fb7185",
  neutral: "#94a3b8",
};

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Space Grotesk', 'Inter', sans-serif";

/* ─── Animated sentiment bar ─── */
function SentimentBar({ sentiment, accent }: { sentiment: Sentiment; accent: Accent }) {
  const pct = sentiment.pct;
  return (
    <div className="relative h-[6px] w-full rounded-full overflow-hidden"
      style={{ background: "rgba(255,255,255,0.05)" }}>
      {/* gradient track */}
      <div className="absolute inset-y-0 left-0 right-0 rounded-full"
        style={{
          background: "linear-gradient(90deg, #ef4444 0%, #f97316 25%, #94a3b8 50%, #86efac 65%, #34d399 80%, #10b981 100%)",
          opacity: 0.25,
        }} />
      {/* fill */}
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, #ef4444, ${sentiment.color})`,
          opacity: 0.85,
        }} />
      {/* marker */}
      <div className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[10px] rounded-full transition-all duration-700"
        style={{
          left: `calc(${pct}% - 1.5px)`,
          background: sentiment.color,
          boxShadow: `0 0 8px ${sentiment.color}`,
        }} />
    </div>
  );
}

/* ─── Single factor card ─── */
function FactorCard({ f }: { f: Factor }) {
  const sigColor = SIG_COLOR[f.signal];
  const up = f.chgPct >= 0;

  return (
    <div className="rounded-[14px] flex flex-col gap-1.5 px-3 py-2.5"
      style={{
        background: "rgba(10,10,10,0.55)",
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        width: "fit-content",
        minWidth: 72,
        minHeight: 72,
      }}>
      {/* top: ticker */}
      <span style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
        {f.label}
        {f.isPreMarket && (
          <span style={{ marginLeft: 4, color: "#f59e0b", fontSize: 6, fontWeight: 700 }}>·PRE</span>
        )}
      </span>

      {/* price */}
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900,
        color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em", lineHeight: 1 }}>
        {f.priceLabel}
      </div>

      {/* bottom row: signal + change — both left */}
      <div className="flex items-center gap-2 mt-auto">
        <span className="flex items-center gap-1">
          <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
            background: sigColor, boxShadow: `0 0 4px ${sigColor}` }} />
          <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: sigColor, opacity: 0.9 }}>
            {f.signalLabel}
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
          color: f.chgPct === 0 ? "rgba(255,255,255,0.2)" : up ? "#34d399" : "#fb7185" }}>
          {f.chgPct === 0 ? "─" : `${up ? "▲" : "▼"} ${Math.abs(f.chgPct).toFixed(2)}%`}
        </span>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export default function MarketPulse({ accent, noHeader }: { accent: Accent; noHeader?: boolean }) {
  const [factors,   setFactors]   = useState<Factor[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment>({ pct: 50, label: "LOADING…", color: "#94a3b8" });
  const [lastUpd,   setLastUpd]   = useState("");
  const [error,     setError]     = useState(false);
  const [preMarket, setPreMarket] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    try {
      const r = await fetch("/api/market-pulse");
      const j = await r.json();
      if (j.err || !j.data?.length) { setError(true); return; }

      const ticks: PulseTick[] = j.data;
      const byTicker = new Map(ticks.map((t) => [t.ticker, t]));

      const fs: Factor[] = META.map((m) => {
        const t = byTicker.get(m.ticker);
        if (!t) return null;
        const s = score(m.type, t.price, t.chgPct);
        const { signal, label } = getSignal(m.type, t.price, t.chgPct, s);
        return {
          ticker:      m.ticker,
          label:       m.label,
          sub:         m.sub,
          price:       t.price,
          chgPct:      t.chgPct,
          marketState: t.marketState,
          isPreMarket: t.isPreMarket,
          score:       s,
          signal,
          signalLabel: label,
          priceLabel:  formatPrice(m.ticker, t.price),
        } as Factor;
      }).filter(Boolean) as Factor[];

      setFactors(fs);
      setSentiment(calcSentiment(fs));
      setPreMarket(fs.some((f) => f.isPreMarket));
      setLastUpd(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30_000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      {/* ── compact sentiment strip (noHeader mode) ── */}
      {noHeader && (
        <div className="flex items-center gap-3 mb-2 px-0.5">
          <span style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>
            Market Pulse
            {preMarket && <span style={{ marginLeft: 6, color: "#f59e0b", fontSize: 6.5 }}>· PRE-MKT</span>}
          </span>
          <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 9 }}>·</span>
          <div style={{ width: 60 }}>
            <SentimentBar sentiment={sentiment} accent={accent} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900,
            letterSpacing: "0.05em", color: sentiment.color,
            textShadow: `0 0 10px ${sentiment.color}88` }}>
            {sentiment.label}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>
            {sentiment.pct}%
          </span>
        </div>
      )}

      {/* ── SectionLabel-style header ── */}
      {!noHeader && <div className="px-6 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* accent bar */}
          <div className="w-[2px] h-4 rounded-full"
            style={{ background: accent.hex, boxShadow: `0 0 8px ${accent.hex}55` }} />
          <div>
            <div style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 10,
              fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.42)" }}>
              Market Pulse
            </div>
            <div style={{ fontFamily: MONO, fontSize: 7.5, color: accent.muted, marginTop: 1 }}>
              {preMarket ? "Pre-market session · " : "Live session · "}
              8 factors · 30s refresh{lastUpd ? ` · upd ${lastUpd}` : ""}
            </div>
          </div>
        </div>

        {/* sentiment badge — right side */}
        <div className="flex items-center gap-3">
          <div style={{ width: 140 }}>
            <SentimentBar sentiment={sentiment} accent={accent} />
          </div>
          <div className="flex flex-col items-end" style={{ minWidth: 110 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900,
              letterSpacing: "0.06em", color: sentiment.color,
              textShadow: `0 0 14px ${sentiment.color}99` }}>
              {sentiment.label}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600,
              color: "rgba(255,255,255,0.3)" }}>
              {sentiment.pct}%
            </span>
          </div>
        </div>
      </div>}

      {/* ── factors — compact, content-width cards ── */}
      {factors.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {factors.map((f) => (
            <FactorCard key={f.ticker} f={f} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3">
          {META.map((m) => (
            <div key={m.ticker} className="flex-1 rounded-[20px] h-[130px] animate-pulse"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      )}
    </div>
  );
}
