// components/NYTopInfo.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import OnThisDayFacts from "@/components/OnThisDayFacts";
import { Clock, MapPin, Calendar, Activity } from "lucide-react";

// --- LOGIC HELPER ---
function getNYParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    h: parseInt(m.hour, 10),
    m: parseInt(m.minute, 10),
    s: parseInt(m.second, 10),
  };
}

// --- UI COMPONENTS ---

const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" }) => {
  const colors = {
    zinc: "bg-zinc-800/40 text-zinc-400 border-zinc-700/50",
    emerald: "bg-emerald-950/30 text-emerald-400 border-emerald-500/20",
    violet: "bg-violet-950/30 text-violet-400 border-violet-500/20",
  };
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

export default function NYTopInfo() {
  const [mounted, setMounted] = useState(false);
  const [dateStr, setDateStr] = useState("");
  
  const hourRef = useRef<SVGLineElement>(null);
  const minuteRef = useRef<SVGLineElement>(null);
  const secondRef = useRef<SVGLineElement>(null);
  
  const hRef = useRef<HTMLSpanElement>(null);
  const mRef = useRef<HTMLSpanElement>(null);
  const sRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);

    // 1. ЗМІНЕНО: Локаль на 'en-US' для дати англійською
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    setDateStr(f.format(new Date()));

    const tick = () => {
      const { h, m, s } = getNYParts();

      // Update Analog
      const secDeg = s * 6;
      const minDeg = m * 6 + s * 0.1;
      const hourDeg = (h % 12) * 30 + m * 0.5;

      if (secondRef.current) secondRef.current.style.transform = `rotate(${secDeg}deg)`;
      if (minuteRef.current) minuteRef.current.style.transform = `rotate(${minDeg}deg)`;
      if (hourRef.current)   hourRef.current.style.transform = `rotate(${hourDeg}deg)`;

      // Update Digital
      if (hRef.current) hRef.current.textContent = String(h).padStart(2, "0");
      if (mRef.current) mRef.current.textContent = String(m).padStart(2, "0");
      if (sRef.current) sRef.current.textContent = String(s).padStart(2, "0");
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full max-w-[1400px] mx-auto h-[200px] rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 animate-pulse" />
    );
  }

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6">
      {/* Glass Card Container */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1px_1fr]">
          
          {/* --- LEFT: CLOCK MODULE --- */}
          <div className="p-6 flex flex-col justify-center min-w-[340px] bg-gradient-to-r from-white/[0.02] to-transparent">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.04]">
              <div className="flex items-center gap-2 text-white">
                <MapPin size={16} className="text-emerald-400" />
                <span className="text-sm font-bold tracking-tight">NEW YORK, USA</span>
              </div>
              <TerminalBadge color="zinc">EST / UTC-5</TerminalBadge>
            </div>

            <div className="flex items-center gap-8">
              {/* ANALOG CLOCK */}
              <div className="relative w-[100px] h-[100px] shrink-0">
                <div className="absolute inset-0 rounded-full border border-white/5 bg-black/40 shadow-inner" />
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
                  {/* Dial Marks */}
                  <g>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <line 
                        key={i} 
                        x1="50" y1="8" x2="50" y2={i % 3 === 0 ? "14" : "10"} 
                        transform={`rotate(${i * 30}, 50, 50)`} 
                        className={i % 3 === 0 ? "stroke-zinc-500 stroke-[2px]" : "stroke-zinc-800 stroke-[1px]"} 
                      />
                    ))}
                  </g>
                  
                  {/* 2. ВИПРАВЛЕНО: transformOrigin для стрілок */}
                  {/* Hour */}
                  <line 
                    ref={hourRef} 
                    x1="50" y1="50" x2="50" y2="30" 
                    className="stroke-white stroke-[3px] stroke-linecap-round shadow-sm"
                    style={{ transformOrigin: "50px 50px" }} 
                  />
                  {/* Minute */}
                  <line 
                    ref={minuteRef} 
                    x1="50" y1="50" x2="50" y2="22" 
                    className="stroke-emerald-400 stroke-[2px] stroke-linecap-round shadow-sm"
                    style={{ transformOrigin: "50px 50px" }}
                  />
                  {/* Second */}
                  <line 
                    ref={secondRef} 
                    x1="50" y1="60" x2="50" y2="15" 
                    className="stroke-rose-500 stroke-[1px]"
                    style={{ transformOrigin: "50px 50px" }}
                  />
                  
                  {/* Center Dot */}
                  <circle cx="50" cy="50" r="2.5" className="fill-zinc-200" />
                  <circle cx="50" cy="50" r="1" className="fill-black" />
                </svg>
              </div>

              {/* DIGITAL CLOCK */}
              <div className="flex flex-col">
                <div className="flex items-baseline font-mono text-5xl font-bold tracking-tighter text-white leading-none tabular-nums">
                  <span ref={hRef}>--</span>
                  <span className="mx-0.5 text-zinc-600 animate-pulse">:</span>
                  <span ref={mRef}>--</span>
                  <span className="mx-0.5 text-zinc-700 text-2xl">:</span>
                  <span ref={sRef} className="text-2xl text-emerald-400">--</span>
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs font-mono font-medium text-zinc-500 uppercase tracking-wider">
                  <Calendar size={12} className="text-zinc-600" />
                  <span className="capitalize">{dateStr}</span>
                </div>
              </div>
            </div>
          </div>

          {/* --- DIVIDER --- */}
          <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
          <div className="lg:hidden h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

          {/* --- RIGHT: INFO MODULE --- */}
          <div className="p-6 flex flex-col overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                <Activity size={100} className="text-emerald-500 blur-[40px]" />
             </div>

            <div className="flex items-center gap-3 mb-4 pb-2">
              <div className="p-1.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <Clock size={16} />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Historical Feed</span>
                <span className="block text-xs font-medium text-zinc-300">On This Day</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 max-h-[140px] custom-scrollbar">
              <div className="
                text-sm text-zinc-400 leading-relaxed font-sans
                [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-3
                [&_li]:pl-3 [&_li]:border-l-[2px] [&_li]:border-zinc-800 [&_li]:transition-all
                [&_li:hover]:border-emerald-500 [&_li:hover]:text-zinc-200 [&_li:hover]:bg-white/[0.02]
                [&_strong]:text-emerald-400 [&_strong]:font-mono [&_strong]:text-xs [&_strong]:mr-2
              ">
                <OnThisDayFacts tz="America/New_York" lang="uk" />
              </div>
            </div>
          </div>

        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </section>
  );
}