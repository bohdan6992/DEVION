// components/MarketMood.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Activity, Gauge, BarChart2 } from "lucide-react";

/* --- TYPES --- */
type Driver = {
  key: string;
  label: string;
  value: number; // -1..+1
  note?: string;
};

type MoodPayload = {
  ts: string;
  score: number; // -100..+100
  drivers: Driver[];
};

/* --- HELPERS --- */
function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/* --- UI COMPONENT: Terminal Badge --- */
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "amber" | "violet" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
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
export default function MarketMood({
  fetchUrl = "/api/mood",
  refreshMs = 60_000,
}: {
  fetchUrl?: string;
  refreshMs?: number;
}) {
  const [data, setData] = useState<MoodPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function load() {
    try {
      setErr(null);
      if (!data) setLoading(true);
      
      const r = await fetch(fetchUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: MoodPayload = await r.json();
      setData(j);
    } catch (e: any) {
      if(!data) setErr(e?.message || "Data unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [fetchUrl, refreshMs]);

  /* --- LOGIC --- */
  const score = clamp(data?.score ?? 0, -100, 100);
  
  const sentiment = useMemo(() => {
    if (score >= 60) return { label: "EXTREME GREED", color: "#34d399" }; // Emerald 400
    if (score >= 20) return { label: "GREED",         color: "#86efac" }; // Emerald 300
    if (score > -20) return { label: "NEUTRAL",       color: "#60a5fa" }; // Blue 400
    if (score > -60) return { label: "FEAR",          color: "#f87171" }; // Red 400
    return { label: "EXTREME FEAR", color: "#ef4444" }; // Red 500
  }, [score]);

  const timeString = mounted && data?.ts 
    ? new Date(data.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) 
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
              <Gauge size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                MARKET MOOD
                <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Sentiment Gauge</span>
              </div>
            </div>
          </div>
          <TerminalBadge icon={Activity} color="zinc">{timeString}</TerminalBadge>
        </header>

        {/* --- CONTENT --- */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.04] bg-[#0a0a0a]/40">
          
          {/* LEFT: GAUGE */}
          <div className="flex flex-col items-center justify-center p-6">
             <div className="relative w-[180px] h-[100px]">
                <MoodGauge score={score} color={sentiment.color} />
             </div>
             <div className="mt-2 text-center">
                <div className="text-4xl font-black text-white tracking-tighter drop-shadow-md tabular-nums">
                   {Math.round(score)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] mt-1" style={{ color: sentiment.color }}>
                   {sentiment.label}
                </div>
             </div>
          </div>

          {/* RIGHT: DRIVERS */}
          <div className="flex flex-col p-6 overflow-hidden">
             <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Core Drivers</span>
             </div>

             <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto pr-2 custom-scrollbar">
               {loading && !data ? <SkeletonDrivers /> : (
                 data?.drivers?.map((d) => <DriverBar key={d.key} driver={d} />)
               )}
               {err && <div className="col-span-2 text-xs text-rose-400 font-mono text-center pt-4">{err}</div>}
             </div>
          </div>

        </div>
      </div>
    </section>
  );
}

/* --- SUB-COMPONENTS --- */

function DriverBar({ driver }: { driver: Driver }) {
  const val = Math.round(driver.value * 100);
  const isPos = driver.value >= 0;
  const barColor = isPos ? '#34d399' : '#f87171'; // Emerald vs Red
  const widthPct = Math.min(Math.abs(driver.value) * 100, 100);

  return (
    <div className="flex flex-col gap-1.5">
       <div className="flex justify-between items-end text-[10px]">
          <span className="font-medium text-zinc-400">{driver.label}</span>
          <span className="font-mono font-bold" style={{ color: barColor }}>
             {isPos ? "+" : ""}{val}
          </span>
       </div>
       
       <div className="h-1.5 w-full bg-white/5 rounded-full relative overflow-hidden">
          {/* Zero Line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/20 z-10" />
          
          {/* Bar */}
          <div 
            className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
            style={{
               background: barColor,
               width: `${widthPct / 2}%`,
               left: isPos ? '50%' : `calc(50% - ${widthPct / 2}%)`,
               boxShadow: `0 0 8px ${barColor}40`
            }}
          />
       </div>
    </div>
  );
}

function MoodGauge({ score, color }: { score: number; color: string }) {
  // SVG Arc Math
  const radius = 80;
  const cx = 90; 
  const cy = 90;
  
  // Convert -100..100 to 0..1
  const pct = (score + 100) / 200; 
  const startAngle = -Math.PI; 
  const endAngle = -Math.PI + (Math.PI * pct);

  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);

  const d = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;

  return (
    <svg viewBox="0 0 180 100" className="w-full h-full overflow-visible">
       {/* Background Track */}
       <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
       
       {/* Active Arc */}
       <path 
         d={d} 
         fill="none" 
         stroke={color} 
         strokeWidth="12" 
         strokeLinecap="round" 
         className="transition-all duration-700 ease-out"
         style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
       />
       
       {/* Needle (Optional, or just use the arc end) */}
       <circle cx={x2} cy={y2} r="4" fill="white" className="transition-all duration-700 ease-out" />
    </svg>
  );
}

function SkeletonDrivers() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
           <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
           <div className="h-1.5 w-full bg-white/5 rounded-full" />
        </div>
      ))}
    </>
  );
}