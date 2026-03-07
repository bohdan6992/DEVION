"use client";

import React, { useMemo } from "react";
import { Calendar, Clock } from "lucide-react";
import { useUi } from "@/components/UiProvider";

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

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const RANK_DOT: Record<Rank, string> = {
  S: "bg-amber-400",
  A: "bg-violet-400",
  B: "bg-sky-400",
  F: "bg-rose-400",
  N: "bg-zinc-500",
};

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
  const startW = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startW; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function QuarterCalendar({ events }: Props) {
  const { isDark } = useUi();
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

  return (
    <section className="w-full max-w-[1400px] mx-auto">
      <div
        className="rounded-2xl border backdrop-blur-md overflow-hidden"
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.58)" : "rgba(255, 255, 255, 0.94)",
          borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)",
        }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{
            backgroundColor: isDark ? "rgba(0, 0, 0, 0.44)" : "rgba(255, 255, 255, 0.82)",
            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-9 w-9 rounded-lg border flex items-center justify-center ${isDark ? "border-white/15 bg-white/[0.03]" : "border-zinc-300 bg-white"}`}>
              <Calendar size={16} className={isDark ? "text-white/85" : "text-zinc-700"} />
            </div>
            <div className="min-w-0">
              <h2 className={`text-base font-semibold tracking-tight truncate ${isDark ? "text-white" : "text-zinc-900"}`}>Quarterly Events</h2>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${isDark ? "text-white/50" : "text-zinc-500"}`}>Scheduled catalysts</p>
            </div>
          </div>
          <div className={`shrink-0 px-2.5 py-1 rounded-md border text-[10px] font-mono font-semibold tracking-wider ${isDark ? "border-white/15 bg-white/[0.03] text-white/75" : "border-zinc-300 bg-white text-zinc-700"}`}>
            Q{q} / {year}
          </div>
        </header>

        <div
          className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/10 border-b"
          style={{ borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.1)" }}
        >
          {months.map((m) => {
            const weeks = getMonthMatrix(year, m);
            const label = MONTHS[(m % 12 + 12) % 12];
            return (
              <div key={m} className="p-4" style={{ backgroundColor: isDark ? "rgba(0, 0, 0, 0.22)" : "rgba(249, 250, 251, 0.75)" }}>
                <div className={`mb-3 text-center text-[11px] font-mono tracking-[0.2em] ${isDark ? "text-white/70" : "text-zinc-700"}`}>{label}</div>
                <div className="grid grid-cols-7 mb-2 text-center">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className={`text-[9px] font-mono ${isDark ? "text-white/35" : "text-zinc-500"}`}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weeks.flat().map((d, i) => {
                    if (!d) return <div key={`empty-${i}`} className="aspect-square" />;

                    const key = ymd(d);
                    const evs = byDate.get(key) || [];
                    const isToday = key === kToday;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const rank = evs[0]?.rank || "N";

                    return (
                      <div
                        key={key}
                        className={[
                          "relative aspect-square rounded-md border flex items-center justify-center text-[10px] font-mono transition-colors",
                          isDark
                            ? (isToday ? "border-white/45 bg-white/[0.08] text-white" : "border-white/8 bg-white/[0.02] text-white/70")
                            : (isToday ? "border-zinc-700/50 bg-zinc-900/[0.08] text-zinc-900" : "border-zinc-300/80 bg-white/85 text-zinc-700"),
                          isWeekend && !isToday ? (isDark ? "text-white/40" : "text-zinc-400") : "",
                          evs.length > 0 && !isToday ? (isDark ? "hover:bg-white/[0.06]" : "hover:bg-zinc-100") : "",
                        ].join(" ")}
                        title={evs.slice(0, 3).map((e) => `${e.ticker || ""} ${e.title}`.trim()).join(" | ")}
                      >
                        {d.getDate()}
                        {evs.length > 0 && (
                          <span className={`absolute bottom-1 h-1 w-1 rounded-full ${RANK_DOT[rank]}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/10" style={{ borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.1)" }}>
          <AgendaColumn label="Yesterday" items={byDate.get(kYest) || []} isDark={isDark} />
          <AgendaColumn label="Today" items={byDate.get(kToday) || []} isToday isDark={isDark} />
          <AgendaColumn label="Tomorrow" items={byDate.get(kTomo) || []} isDark={isDark} />
        </div>
      </div>
    </section>
  );
}

function AgendaColumn({ label, items, isToday, isDark }: { label: string; items: EventItem[]; isToday?: boolean; isDark: boolean }) {
  return (
    <div className={`p-4 min-h-[170px] ${isToday ? (isDark ? "bg-white/[0.02]" : "bg-zinc-100/60") : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-[10px] uppercase tracking-[0.18em] ${isToday ? (isDark ? "text-white" : "text-zinc-900") : (isDark ? "text-white/55" : "text-zinc-500")}`}>{label}</span>
        {isToday && <span className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-white/85" : "bg-zinc-700"}`} />}
      </div>

      {items.length === 0 ? (
        <div className={`h-[110px] rounded-lg border text-[11px] font-mono flex items-center justify-center ${isDark ? "border-white/10 bg-white/[0.02] text-white/35" : "border-zinc-300 bg-white text-zinc-500"}`}>
          No events
        </div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 6).map((e) => (
            <div key={e.id} className={`rounded-lg border px-3 py-2 ${isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-300 bg-white/90"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  {e.ticker && (
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold ${isDark ? "border-white/15 bg-white/[0.03] text-white/80" : "border-zinc-300 bg-white text-zinc-700"}`}>
                      {e.ticker}
                    </span>
                  )}
                  <p className={`truncate text-[11px] ${isDark ? "text-white/85" : "text-zinc-800"}`}>{e.title}</p>
                </div>
                {e.time && (
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-mono ${isDark ? "text-white/55" : "text-zinc-500"}`}>
                    <Clock size={9} />
                    {e.time}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
