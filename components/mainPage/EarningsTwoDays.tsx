// components/EarningsTwoDays.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DollarSign, Sun, Moon, Calendar, Loader2 } from "lucide-react";

/* --- TYPES --- */
type Item = { date: string; ticker: string; sector: string; time: string };
type ApiResp = { date: string; items: Item[] };

/* --- HELPERS --- */
function kyivDateShift(days: number): string {
  const base = new Date(Date.now() + days * 86400000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = fmt.formatToParts(base);
  const y = p.find(x => x.type === "year")?.value ?? "1970";
  const m = p.find(x => x.type === "month")?.value ?? "01";
  const d = p.find(x => x.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

// "2023-10-25" -> "Oct 25"
function formatPrettyDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- UI COMPONENT: Terminal Badge ---
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "amber" | "violet" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

/* --- MAIN COMPONENT --- */
export default function EarningsTwoDays() {
  const [today, setToday] = useState<ApiResp | null>(null);
  const [tom, setTom] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);

  const d0 = useMemo(() => kyivDateShift(0), []);
  const d1 = useMemo(() => kyivDateShift(1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rT, rTm] = await Promise.all([
          fetch(`/api/earnings/today?date=${d0}`),
          fetch(`/api/earnings/today?date=${d1}`),
        ]);
        const [jT, jTm] = (await Promise.all([rT.json(), rTm.json()])) as [ApiResp, ApiResp];
        if (!alive) return;
        setToday(jT); 
        setTom(jTm);
      } catch {
        if (!alive) return;
        setToday({ date: d0, items: [] });
        setTom({ date: d1, items: [] });
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [d0, d1]);

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
              <DollarSign size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                EARNINGS REPORTS
                <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Corporate Calendar</span>
              </div>
            </div>
          </div>
          <TerminalBadge icon={Calendar} color="zinc">48H LOOKAHEAD</TerminalBadge>
        </header>

        {/* --- CONTENT (GRID) --- */}
        <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.04] bg-[#0a0a0a]/40">
          
          {/* TODAY COL */}
          <DayColumn 
            title="Today" 
            date={d0} 
            items={today?.items} 
            loading={loading} 
            isActive 
          />

          {/* TOMORROW COL */}
          <DayColumn 
            title="Tomorrow" 
            date={d1} 
            items={tom?.items} 
            loading={loading} 
          />

        </div>
      </div>
    </section>
  );
}

/* --- SUB-COMPONENT: DAY COLUMN --- */
function DayColumn({ title, date, items, loading, isActive }: { title: string; date: string; items?: Item[]; loading: boolean; isActive?: boolean }) {
  return (
    <div className={`flex flex-col p-4 overflow-hidden ${isActive ? 'bg-gradient-to-b from-amber-500/[0.02] to-transparent' : ''}`}>
       <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <span className={`flex h-1.5 w-1.5 rounded-full ${isActive ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]' : 'bg-zinc-600'}`} />
             <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-amber-200' : 'text-zinc-500'}`}>{title}</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600">{formatPrettyDate(date)}</span>
       </div>
       
       <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-1">
          {loading ? <SkeletonRows /> : (
            items && items.length > 0 ? items.map((r, i) => <EarningRow key={`${r.ticker}-${i}`} row={r} />) : <EmptyState />
          )}
       </div>
    </div>
  );
}

/* --- SUB-COMPONENT: EARNING ROW --- */
function EarningRow({ row }: { row: Item }) {
  const isPre = row.time.toUpperCase() === "BMO";
  const TimeIcon = isPre ? Sun : Moon;
  const timeColor = isPre ? "text-amber-400" : "text-violet-400";
  const badgeClass = isPre ? "bg-amber-500/10 border-amber-500/20" : "bg-violet-500/10 border-violet-500/20";

  return (
    <div className="group flex items-center justify-between p-2.5 rounded-lg border border-white/[0.02] bg-white/[0.01] hover:bg-white/[0.04] transition-all duration-200">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
           <span className="text-sm font-bold text-white tracking-wide group-hover:text-zinc-200 transition-colors">
             {row.ticker}
           </span>
           <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeClass} ${timeColor} flex items-center gap-1`}>
              <TimeIcon size={8} /> {isPre ? 'PRE' : 'POST'}
           </span>
        </div>
        <span className="text-[10px] font-medium text-zinc-500 truncate mt-0.5" title={row.sector}>
          {row.sector}
        </span>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-10 w-full rounded-lg bg-white/[0.02] animate-pulse border border-white/[0.02]" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
      <Calendar size={24} className="opacity-20 mb-2" />
      <span className="text-[10px] uppercase tracking-widest">No Reports</span>
    </div>
  );
}