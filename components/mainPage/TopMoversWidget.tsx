// components/TopMoversWidget.tsx
"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Activity, Zap, RefreshCw } from "lucide-react";

// --- TYPES ---
type Row = {
  ticker: string;
  last: number;
  prev: number;
  volume?: number;
  chgPct: number;
};

type ApiResp = {
  ts: string;
  universe: string;
  limit: number;
  gainers: Row[];
  losers: Row[];
  err?: string | null;
};

// --- UI COMPONENT: Terminal Badge ---
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "rose" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

export default function TopMoversWidget({
  universe = "AAPL,MSFT,TSLA,NVDA,QQQ,SPY,AMD,META,NFLX,GOOGL",
  limit = 5,
  refreshMs = 60_000,
}: {
  universe?: string;
  limit?: number;
  refreshMs?: number;
}) {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function load() {
    try {
      // Не вмикаємо спінер на рефреш, щоб не блимало
      if (!data) setLoading(true); 
      const url = `/api/top-movers?universe=${encodeURIComponent(universe)}&limit=${limit}`;
      const r = await fetch(url);
      const j = (await r.json()) as ApiResp;
      setData(j);
    } catch (e) {
      console.error(e);
      setData((prev) => ({
        ts: new Date().toISOString(),
        universe,
        limit,
        gainers: prev?.gainers || [],
        losers: prev?.losers || [],
        err: (e as any)?.message || "Fetch error",
      }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [universe, limit, refreshMs]);

  const gainers = Array.isArray(data?.gainers) ? data!.gainers : [];
  const losers  = Array.isArray(data?.losers)  ? data!.losers  : [];
  const err     = data?.err || null;

  const timeString = mounted && data?.ts 
    ? new Date(data.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) 
    : "--:--";

  return (
    <section className="w-full h-full min-h-[300px]">
      {/* Deep Space Glass Card */}
      <div className="relative w-full h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl flex flex-col group">
        
        {/* Hover Gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />

        {/* --- HEADER --- */}
        <header className="relative z-10 flex items-center justify-between p-6 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
              <Zap size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                MARKET MOVERS
                <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Volatility Tracker</span>
              </div>
            </div>
          </div>
          <TerminalBadge icon={RefreshCw} color="zinc">{timeString}</TerminalBadge>
        </header>

        {/* --- CONTENT --- */}
        <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.04] bg-[#0a0a0a]/40">
          
          {/* GAINERS COL */}
          <div className="flex flex-col p-4 overflow-hidden">
             <div className="flex items-center gap-2 mb-4">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Gainers</span>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                {loading && !data ? <SkeletonRows /> : (
                  gainers.length > 0 ? gainers.map(r => <MoverRow key={r.ticker} row={r} type="up" />) : <EmptyState />
                )}
             </div>
          </div>

          {/* LOSERS COL */}
          <div className="flex flex-col p-4 overflow-hidden">
             <div className="flex items-center gap-2 mb-4">
                <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#ef4444]" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Losers</span>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                {loading && !data ? <SkeletonRows /> : (
                  losers.length > 0 ? losers.map(r => <MoverRow key={r.ticker} row={r} type="down" />) : <EmptyState />
                )}
             </div>
          </div>

        </div>

        {/* Error Overlay */}
        {err && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-20">
             <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-lg text-xs font-mono">
                ERR: {err}
             </div>
          </div>
        )}

      </div>

      {/* Global Style for Scrollbar (if not present) */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}</style>
    </section>
  );
}

// --- SUB-COMPONENTS ---

function MoverRow({ row, type }: { row: Row; type: "up" | "down" }) {
  const isUp = type === "up";
  const colorClass = isUp ? "text-emerald-400" : "text-rose-400";
  const bgClass = isUp ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="group flex items-center justify-between p-2.5 rounded-lg border border-white/[0.02] bg-white/[0.01] hover:bg-white/[0.04] transition-all duration-200">
      <div className="flex flex-col">
        <span className="text-sm font-bold text-white tracking-wide group-hover:text-zinc-200 transition-colors">
          {row.ticker}
        </span>
        <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
          {row.last.toFixed(2)}
        </span>
      </div>
      
      <div className={`flex items-center gap-1 px-2 py-1 rounded border ${bgClass} ${colorClass}`}>
        <Icon size={12} strokeWidth={3} />
        <span className="text-xs font-mono font-bold tabular-nums">
          {Math.abs(row.chgPct).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 w-full rounded-lg bg-white/[0.02] animate-pulse border border-white/[0.02]" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
      <Activity size={24} className="opacity-20 mb-2" />
      <span className="text-[10px] uppercase tracking-widest">No Data Available</span>
    </div>
  );
}