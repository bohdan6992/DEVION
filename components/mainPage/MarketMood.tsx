// components/MarketMood.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Gauge } from "lucide-react";

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
    if (score >= 60) return { label: "EXTREME GREED", color: "rgba(255,255,255,0.88)" };
    if (score >= 20) return { label: "GREED",         color: "rgba(255,255,255,0.84)" };
    if (score > -20) return { label: "NEUTRAL",       color: "rgba(255,255,255,0.8)" };
    if (score > -60) return { label: "FEAR",          color: "rgba(255,255,255,0.76)" };
    return { label: "EXTREME FEAR", color: "rgba(255,255,255,0.72)" };
  }, [score]);

  const timeString = mounted && data?.ts 
    ? new Date(data.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) 
    : "--:--";

  return (
    <section className="w-full h-full min-h-[300px]">
      <div className="w-full h-full rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md shadow-[0_14px_44px_-28px_rgba(0,0,0,0.75)] flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/15 bg-white/5">
              <Gauge size={16} className="text-[var(--dash-text-main)]" />
            </div>
            <div>
              <h2 className="text-[22px] leading-none font-semibold tracking-tight text-[var(--dash-text-main)]">Market Mood</h2>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--dash-text-muted)]">Sentiment Gauge</p>
            </div>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[var(--dash-text-muted)]">{timeString}</span>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[230px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/10">
          <div className="flex flex-col items-center justify-center p-6">
             <div className="relative w-[170px] h-[96px]">
                <MoodGauge score={score} color={sentiment.color} />
             </div>
             <div className="mt-2 text-center">
                <div className="text-4xl font-semibold text-[var(--dash-text-main)] tracking-tight tabular-nums">
                   {Math.round(score)}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mt-1" style={{ color: sentiment.color }}>
                   {sentiment.label}
                </div>
             </div>
          </div>

          <div className="flex flex-col p-5 overflow-hidden">
             <span className="mb-4 text-[10px] font-mono font-semibold text-[var(--dash-text-muted)] uppercase tracking-[0.2em]">Core Drivers</span>
             <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto pr-2 custom-scrollbar">
               {loading && !data ? <SkeletonDrivers /> : (
                 data?.drivers?.map((d) => <DriverBar key={d.key} driver={d} />)
               )}
               {err && <div className="col-span-2 text-xs text-rose-400/90 font-mono text-center pt-4">{err}</div>}
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
  const barColor = isPos ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.56)";
  const widthPct = Math.min(Math.abs(driver.value) * 100, 100);

  return (
    <div className="flex flex-col gap-1.5">
       <div className="flex justify-between items-end text-[10px]">
          <span className="font-medium text-[var(--dash-text-muted)]">{driver.label}</span>
          <span className="font-mono font-bold" style={{ color: barColor }}>
             {isPos ? "+" : ""}{val}
          </span>
       </div>
       
       <div className="h-1.5 w-full bg-white/10 rounded-full relative overflow-hidden">
          {/* Zero Line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/25 z-10" />
          
          {/* Bar */}
          <div 
            className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
             style={{
               background: barColor,
               width: `${widthPct / 2}%`,
               left: isPos ? '50%' : `calc(50% - ${widthPct / 2}%)`,
               boxShadow: "none"
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
       <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" strokeLinecap="round" />
       
       {/* Active Arc */}
       <path 
         d={d} 
         fill="none" 
         stroke={color} 
         strokeWidth="12" 
         strokeLinecap="round" 
         className="transition-all duration-700 ease-out"
         style={{ filter: "none" }}
       />
       
       {/* Needle (Optional, or just use the arc end) */}
       <circle cx={x2} cy={y2} r="3.5" fill="white" className="transition-all duration-700 ease-out" />
    </svg>
  );
}

function SkeletonDrivers() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
           <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
           <div className="h-1.5 w-full bg-white/10 rounded-full" />
        </div>
      ))}
    </>
  );
}


