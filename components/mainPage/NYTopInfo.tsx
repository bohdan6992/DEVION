// components/NYTopInfo.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import OnThisDayFacts from "@/components/OnThisDayFacts";
import { AppDock } from "@/components/nav/AppDock";
import { Calendar, Activity } from "lucide-react";

// --- LOGIC HELPER ---
function getNYParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    h: parseInt(m.hour, 10),
    m: parseInt(m.minute, 10),
    s: parseInt(m.second, 10),
  };
}

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

    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    setDateStr(f.format(new Date()));

    const tick = () => {
      const { h, m, s } = getNYParts();

      const secDeg = s * 6;
      const minDeg = m * 6 + s * 0.1;
      const hourDeg = (h % 12) * 30 + m * 0.5;

      if (secondRef.current) secondRef.current.style.transform = `rotate(${secDeg}deg)`;
      if (minuteRef.current) minuteRef.current.style.transform = `rotate(${minDeg}deg)`;
      if (hourRef.current) hourRef.current.style.transform = `rotate(${hourDeg}deg)`;

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

// ... (початок коду без змін)

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />

        {/* Dock stays top-right */}
        <div className="absolute top-4 right-4 z-10 hidden md:flex">
          <AppDock />
        </div>

        {/* ЗМІНА: lg:grid-cols-[auto_1fr] дозволяє правій частині "притиснутися" до годинника */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr]">
          
          {/* --- LEFT: CLOCK --- */}
          {/* ЗМІНА: Прибрано justify-center, додано border-r для візуального розділення */}
          <div className="p-6 lg:p-8 flex items-center border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            <div className="flex items-center gap-6 lg:gap-8">
              {/* ANALOG */}
              <div className="relative w-[110px] h-[110px] lg:w-[130px] lg:h-[130px] shrink-0">
                <div className="absolute inset-0 rounded-full border border-white/5 bg-black/40 shadow-inner" />
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
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
                  <line ref={hourRef} x1="50" y1="50" x2="50" y2="30" className="stroke-white stroke-[3px] stroke-linecap-round" style={{ transformOrigin: "50px 50px" }} />
                  <line ref={minuteRef} x1="50" y1="50" x2="50" y2="22" className="stroke-emerald-400 stroke-[2px] stroke-linecap-round" style={{ transformOrigin: "50px 50px" }} />
                  <line ref={secondRef} x1="50" y1="60" x2="50" y2="15" className="stroke-rose-500 stroke-[1px]" style={{ transformOrigin: "50px 50px" }} />
                  <circle cx="50" cy="50" r="2.5" className="fill-zinc-200" />
                </svg>
              </div>

              {/* DIGITAL */}
              <div className="flex flex-col whitespace-nowrap">
                <div className="flex items-baseline font-mono text-5xl lg:text-7xl font-bold tracking-tighter text-white leading-none tabular-nums">
                  <span ref={hRef}>--</span>
                  <span className="mx-1 text-zinc-600 animate-pulse">:</span>
                  <span ref={mRef}>--</span>
                  <span className="mx-1 text-zinc-700 text-2xl lg:text-4xl">:</span>
                  <span ref={sRef} className="text-2xl lg:text-4xl text-emerald-400">--</span>
                </div>
                <div className="flex items-center gap-2 mt-3 text-[10px] lg:text-xs font-mono font-medium text-zinc-500 tracking-wider">
                  <Calendar size={12} className="text-zinc-600" />
                  <span className="capitalize">{dateStr}</span>
                </div>
              </div>
            </div>
          </div>

          {/* --- RIGHT: FACTS --- */}
          {/* ЗМІНА: Тепер займає весь вільний простір (1fr) */}
          <div className="p-6 lg:p-8 flex flex-col overflow-hidden relative min-h-[160px]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <Activity size={100} className="text-emerald-500 blur-[40px]" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div
                className="
                  text-sm lg:text-[15px] text-zinc-400 leading-relaxed font-sans
                  [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-3
                  [&_li]:pl-3 [&_li]:border-l-[2px] [&_li]:border-zinc-800/50 [&_li]:transition-all
                  [&_li:hover]:border-emerald-500/50 [&_li:hover]:text-zinc-200 [&_li:hover]:bg-white/[0.01]
                  [&_strong]:text-emerald-400/80 [&_strong]:font-mono [&_strong]:text-[11px] [&_strong]:mr-2
                "
              >
                <OnThisDayFacts tz="America/New_York" lang="uk" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* ... (решта коду без змін) */}

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
