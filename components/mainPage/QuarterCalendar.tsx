// components/QuarterCalendar.tsx
"use client";

import React, { useMemo } from "react";
import { Calendar, Clock, Layers, Activity, Star } from "lucide-react";

/* ===================== TYPES ===================== */
export type Rank = "S" | "A" | "B" | "F" | "N";
export type EventItem = {
  id: string;
  title: string;
  date: string;
  time?: string;
  ticker?: string;
  tags?: string[];
  rank?: Rank;
  note?: string;
  link?: string;
};

type Props = { events: EventItem[] };

/* ===================== LOGIC & CONFIG ===================== */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Styles for Ranks (Tailwind classes)
const RANK_STYLES: Record<Rank, string> = {
  S: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  A: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  B: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  F: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  N: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

const getRankStyle = (r?: Rank) => (r ? RANK_STYLES[r] : RANK_STYLES.N);
const getRankDotColor = (r?: Rank) => {
  switch (r) {
    case 'S': return 'bg-amber-400';
    case 'A': return 'bg-violet-400';
    case 'B': return 'bg-blue-400';
    case 'F': return 'bg-rose-400';
    default: return 'bg-zinc-500';
  }
};

/* ===================== UTILS ===================== */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getQuarterBounds(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);
  const startMonth = q * 3;
  return { start: new Date(d.getFullYear(), startMonth, 1), year: d.getFullYear(), q: q + 1 };
}

function getMonthMatrix(y: number, m: number) {
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const startW = (first.getDay() + 6) % 7; // Mon=0

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startW; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ===================== UI COMPONENTS ===================== */

const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" | "cyan" }) => {
  const colors: Record<string, string> = {
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

/* ===================== MAIN COMPONENT ===================== */

export default function QuarterCalendar({ events }: Props) {
  const { start, year, q } = useMemo(() => getQuarterBounds(), []);
  const months = [start.getMonth(), start.getMonth() + 1, start.getMonth() + 2];

  const byDate = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) || []), e]);
    return m;
  }, [events]);

  const today = new Date();
  const kToday = ymd(today);
  const kYest = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const kTomo = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  const todayEvents = byDate.get(kToday) || [];
  const yestEvents = byDate.get(kYest) || [];
  const tomoEvents = byDate.get(kTomo) || [];

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6">
      {/* Deep Space Glass Container */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl flex flex-col group">
        
        {/* Hover Gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />

        {/* --- HEADER --- */}
        <header className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
              <Calendar size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                QUARTERLY EVENTS
                <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Scheduled Catalysts</span>
              </div>
            </div>
          </div>
          <TerminalBadge icon={Layers} color="violet">Q{q} • {year}</TerminalBadge>
        </header>

        {/* --- GRID OF MONTHS --- */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-white/[0.04] border-b border-white/[0.04]">
          {months.map((m) => {
            const weeks = getMonthMatrix(year, m);
            const label = MONTHS[(m % 12 + 12) % 12];
            
            return (
              <div key={m} className="p-6 bg-[#0a0a0a]/40">
                <div className="text-center mb-4">
                  <span className="text-xs font-bold text-zinc-300 tracking-[0.2em]">{label}</span>
                </div>

                <div className="grid grid-cols-7 text-center mb-2">
                  {WEEKDAYS.map(w => (
                    <div key={w} className="text-[9px] font-mono font-bold text-zinc-600">{w}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {weeks.flat().map((d, i) => {
                    if (!d) return <div key={`empty-${i}`} className="aspect-square" />;
                    
                    const key = ymd(d);
                    const evs = byDate.get(key) || [];
                    const isToday = key === kToday;
                    const hasEvents = evs.length > 0;
                    const topEvent = evs[0];
                    const dotColor = hasEvents ? getRankDotColor(topEvent.rank) : "bg-transparent";
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                    // Tooltip data
                    const tooltipText = evs.map(e => `${e.ticker ? e.ticker : ''} ${e.title}`).join('\n');

                    return (
                      <div
                        key={key}
                        className={`
                          group/day relative aspect-square flex flex-col items-center justify-center rounded-lg border transition-all duration-200
                          ${isToday 
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.15)]" 
                            : isWeekend 
                              ? "border-transparent bg-white/[0.01] text-zinc-600"
                              : "border-white/[0.03] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:border-white/10"
                          }
                          ${hasEvents && !isToday ? "hover:border-zinc-500/30" : ""}
                        `}
                        title={tooltipText}
                      >
                        <span className={`text-[10px] font-mono ${isToday ? "font-bold" : ""}`}>
                          {d.getDate()}
                        </span>
                        
                        {hasEvents && (
                          <span className={`mt-1 h-1 w-1 rounded-full ${dotColor} shadow-[0_0_4px_currentColor]`} />
                        )}
                        
                        {/* CSS Tooltip for Quick Glance */}
                        {hasEvents && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/day:block w-max max-w-[150px] z-50">
                            <div className="bg-black/90 border border-white/10 text-white text-[9px] p-2 rounded shadow-xl backdrop-blur-md">
                              {evs.slice(0, 3).map((e, idx) => (
                                <div key={idx} className="truncate">
                                  {e.ticker && <span className="font-bold text-zinc-400 mr-1">{e.ticker}</span>}
                                  {e.title}
                                </div>
                              ))}
                              {evs.length > 3 && <div className="text-zinc-500 italic">+{evs.length - 3} more</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* --- AGENDA SECTION (Footer) --- */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.04] bg-[#0a0a0a]/60">
          <AgendaColumn label="YESTERDAY" items={yestEvents} />
          <AgendaColumn label="TODAY" items={todayEvents} isToday />
          <AgendaColumn label="TOMORROW" items={tomoEvents} />
        </div>

      </div>
    </section>
  );
}

/* ===================== SUB-COMPONENTS ===================== */

function AgendaColumn({ label, items, isToday }: { label: string; items: EventItem[]; isToday?: boolean }) {
  return (
    <div className={`
      flex flex-col p-4 min-h-[160px]
      ${isToday ? "bg-gradient-to-b from-cyan-900/5 to-transparent" : ""}
    `}>
      <div className="flex items-center justify-between mb-4">
        <span className={`text-[10px] font-bold tracking-widest ${isToday ? "text-cyan-400" : "text-zinc-500"}`}>
          {label}
        </span>
        {isToday && (
          <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.8)] animate-pulse" />
        )}
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-zinc-700 gap-2 opacity-50">
            <Activity size={14} />
            <span className="text-[10px] font-mono italic">No events</span>
          </div>
        ) : (
          items.map(e => (
            <div 
              key={e.id} 
              className={`
                group flex items-start gap-3 p-2 rounded-lg border transition-all duration-200
                ${getRankStyle(e.rank)}
                border-opacity-30 bg-opacity-5 hover:bg-opacity-10
              `}
            >
              {/* Rank Indicator */}
              <div className={`mt-0.5 w-1 h-8 rounded-full ${getRankDotColor(e.rank)} opacity-50 group-hover:opacity-100 transition-opacity`} />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {e.ticker && (
                    <span className="text-[9px] font-black tracking-wide bg-black/20 px-1.5 py-0.5 rounded text-white/90 font-mono">
                      {e.ticker}
                    </span>
                  )}
                  {e.time && (
                    <div className="flex items-center gap-1 text-[9px] text-white/50 font-mono">
                      <Clock size={8} /> {e.time}
                    </div>
                  )}
                </div>
                <div className="text-[11px] font-medium leading-tight text-zinc-200 truncate group-hover:whitespace-normal transition-all">
                  {e.title}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}