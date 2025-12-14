// components/NewsBoard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Newspaper, Search, Filter, RefreshCw, Clock, ExternalLink } from "lucide-react";

/* -------- LOGIC HELPERS -------- */

function inTimeZone(date: Date, timeZone: string) {
  const inv = new Date(date.toLocaleString("en-US", { timeZone }));
  const diff = date.getTime() - inv.getTime();
  return new Date(date.getTime() - diff);
}

function prevBusinessDayNY(d: Date) {
  const x = new Date(d);
  do {
    x.setDate(x.getDate() - 1);
  } while (x.getDay() === 0 || x.getDay() === 6);
  return x;
}

function minutesSinceLastCloseNY(now = new Date()): number {
  const nyNow = inTimeZone(now, "America/New_York");
  let lastClose = new Date(nyNow);
  lastClose.setHours(16, 0, 0, 0);

  const isWeekend = nyNow.getDay() === 0 || nyNow.getDay() === 6;
  if (isWeekend || nyNow < lastClose) {
    const prev = prevBusinessDayNY(nyNow);
    lastClose = new Date(prev);
    lastClose.setHours(16, 0, 0, 0);
  }
  const diffMs = nyNow.getTime() - lastClose.getTime();
  return Math.max(1, Math.round(diffMs / 60000));
}

/* -------- TYPES -------- */
type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  tickers?: string[];
  sentiment?: number;
};

/* -------- UI COMPONENTS -------- */

const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" | "cyan" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    cyan: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

export default function NewsBoard({
  title = "NEWS FEED",
  limit = 300,
  defaultTickers = "",
  auto = true,
  className = "",
}: {
  title?: string;
  limit?: number;
  defaultTickers?: string;
  auto?: boolean;
  className?: string;
}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [q, setQ] = useState("");
  const [tickersStr, setTickersStr] = useState(defaultTickers);
  const [onlyWithTickers, setOnlyWithTickers] = useState(false);

  const [useLastClose, setUseLastClose] = useState(true);
  const [sinceMinutesManual, setSinceMinutesManual] = useState(360);
  const sinceMinutes = useLastClose ? minutesSinceLastCloseNY() : sinceMinutesManual;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isAuto, setIsAuto] = useState(auto);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("sinceMinutes", String(sinceMinutes));
    if (q.trim()) p.set("q", q.trim());

    const cleaned = tickersStr
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (cleaned.length) p.set("tickers", cleaned.join(","));
    if (onlyWithTickers) p.set("requireTickers", "1");

    return p.toString();
  }, [limit, sinceMinutes, q, tickersStr, onlyWithTickers]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/news?${params}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      if (!data || !Array.isArray(data.items)) throw new Error("Invalid API shape");
      setItems(data.items);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [params]);

  useEffect(() => {
    if (!isAuto) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [isAuto, params]);

  const sinceLabel = useLastClose ? "Since Close" : `${sinceMinutes}m Ago`;

  return (
    <section className={`w-full h-full min-h-[500px] ${className}`}>
      {/* Deep Space Glass Card */}
      <div className="relative w-full h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl flex flex-col group">
        
        {/* Hover Gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />

        {/* --- HEADER --- */}
        <header className="relative z-10 p-6 pb-4 border-b border-white/[0.04] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
                <Newspaper size={18} className="text-zinc-200" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  {title}
                  <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)] animate-pulse" />
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{sinceLabel}</span>
                </div>
              </div>
            </div>
            <TerminalBadge icon={Filter} color="cyan">{items.length} ITEMS</TerminalBadge>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[200px]">
               <Search size={14} className="text-zinc-500" />
               <input
                 placeholder="Search titles..."
                 value={q}
                 onChange={(e) => setQ(e.target.value)}
                 className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-zinc-600 font-medium"
               />
            </div>
            
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 min-w-[140px]">
               <span className="text-zinc-500 font-mono text-[10px]">$</span>
               <input
                 placeholder="AAPL, TSLA..."
                 value={tickersStr}
                 onChange={(e) => setTickersStr(e.target.value)}
                 className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-zinc-600 font-mono uppercase"
               />
            </div>

            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] cursor-pointer hover:bg-white/[0.05] transition-colors">
              <input type="checkbox" checked={onlyWithTickers} onChange={(e) => setOnlyWithTickers(e.target.checked)} className="accent-blue-500" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Tickers Only</span>
            </label>

            <button 
              onClick={load} 
              disabled={loading}
              className="p-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {/* --- CONTENT LIST --- */}
        <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a]/40 p-2 space-y-1">
          {err && (
            <div className="mx-4 mt-4 p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-mono text-center">
              ⚠ {err}
            </div>
          )}

          {!loading && !items.length && !err && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 opacity-50 gap-2">
               <Newspaper size={32} strokeWidth={1} />
               <span className="text-xs font-mono">NO NEWS FOUND</span>
            </div>
          )}

          {items.map((n) => (
            <NewsRow key={n.id} item={n} />
          ))}
        </div>

      </div>

      {/* Global Scrollbar Style */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}</style>
    </section>
  );
}

/* --- SUB-COMPONENT: NEWS ROW --- */
function NewsRow({ item }: { item: NewsItem }) {
  const sentimentColor = tone(item.sentiment);
  const sentVal = sentLabel(item.sentiment);
  
  return (
    <a 
      href={item.link} 
      target="_blank" 
      rel="noreferrer" 
      className="group relative flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/[0.03] transition-all duration-200"
    >
      {/* Sentiment Bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-r ${sentimentColor.bg}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
           <span className={`text-[9px] font-bold px-1.5 rounded border ${sentimentColor.badge} font-mono`}>
             {sentVal}
           </span>
           <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate max-w-[100px]">
             {item.source}
           </span>
           <span className="text-[10px] text-zinc-600 font-mono flex items-center gap-1">
             <Clock size={10} /> {timeAgo(item.pubDate)}
           </span>
        </div>
        
        <h4 className="text-sm font-medium text-zinc-300 leading-snug group-hover:text-white transition-colors line-clamp-2">
          {item.title}
        </h4>

        {item.tickers && item.tickers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.tickers.slice(0, 6).map((t) => (
              <span key={t} className="text-[9px] font-bold text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center pr-2">
         <ExternalLink size={14} className="text-zinc-500 group-hover:text-blue-400" />
      </div>
    </a>
  );
}

/* --- HELPERS --- */
function tone(s?: number) {
  if (typeof s !== "number") return { bg: "bg-zinc-600", badge: "border-zinc-700 text-zinc-500 bg-zinc-500/10" };
  if (s > 0.15) return { bg: "bg-emerald-500", badge: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" };
  if (s < -0.15) return { bg: "bg-rose-500", badge: "border-rose-500/30 text-rose-400 bg-rose-500/10" };
  return { bg: "bg-blue-500", badge: "border-blue-500/30 text-blue-400 bg-blue-500/10" };
}

function sentLabel(s?: number) {
  if (typeof s !== "number") return "N/A";
  const v = Math.round(s * 100) / 100;
  return v > 0 ? `+${v}` : `${v}`;
}

function timeAgo(iso: string) {
  const dt = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - dt);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}