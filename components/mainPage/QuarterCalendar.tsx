"use client";

import React, { useMemo } from "react";
import { Clock } from "lucide-react";

export type Rank = "S" | "A" | "B" | "F" | "N";
export type EventItem = {
  id: string; title: string; date: string;
  time?: string; ticker?: string; tags?: string[];
  rank?: Rank; note?: string; link?: string;
};

type Accent = { hex: string; rgb: string };
type Props  = { events: EventItem[]; accent?: Accent };

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS   = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const RANK_COLOR: Record<Rank, string> = {
  S: "#fbbf24", A: "#a78bfa", B: "#38bdf8", F: "#fb7185", N: "#52525b",
};

const AGENDA_LABELS = ["Yesterday", "Today", "Tomorrow"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function getQuarterBounds(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);
  return { start: new Date(d.getFullYear(), q * 3, 1), year: d.getFullYear(), q: q + 1 };
}

function getMonthMatrix(y: number, m: number) {
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  const startW = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startW; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const BORDER   = "rgba(255,255,255,0.07)";
const BG_CARD  = "rgba(10,10,10,0.55)";
const BG_CELL  = "rgba(255,255,255,0.02)";
const BG_DAY   = "rgba(13,13,15,0.9)";   // like strategy card sidebar buttons
const MONO     = "'JetBrains Mono', monospace";
const SANS     = "'Space Grotesk', 'Inter', sans-serif";

export default function QuarterCalendar({ events, accent }: Props) {
  const accentHex = accent?.hex ?? "#00f0ff";
  const accentRgb = accent?.rgb ?? "0,240,255";

  const { start, year, q } = useMemo(() => getQuarterBounds(), []);
  const months = [start.getMonth(), start.getMonth() + 1, start.getMonth() + 2];

  const byDate = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) || []), e]);
    return m;
  }, [events]);

  const today  = new Date();
  const kToday = ymd(today);
  const kKeys  = [
    ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)),
    kToday,
    ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
  ];

  return (
    <div className="grid grid-cols-3 gap-3 pb-4">
      {months.map((m, mi) => {
        const weeks = getMonthMatrix(year, m);
        const label = MONTHS[(m % 12 + 12) % 12];
        const agendaLabel = AGENDA_LABELS[mi];
        const agendaItems = byDate.get(kKeys[mi]) || [];
        const isToday = mi === 1;

        return (
          <div key={m}
            className="rounded-[20px] overflow-hidden flex flex-col"
            style={{ background: BG_CARD, border: `1px solid ${BORDER}`, backdropFilter: "blur(12px)" }}
          >
            {/* ── Month header ── */}
            <div className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span style={{
                fontFamily: MONO, fontSize: 11, fontWeight: 800,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.75)",
              }}>
                {label}
              </span>
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.28)", background: BG_CELL,
                border: `1px solid ${BORDER}`, borderRadius: 6, padding: "2px 8px",
              }}>
                {year}
              </span>
            </div>

            {/* ── Calendar grid ── */}
            <div className="p-4 flex-1">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-2">
                {WEEKDAYS.map(w => (
                  <div key={w} style={{
                    fontFamily: MONO, fontSize: 8, fontWeight: 600,
                    color: "rgba(255,255,255,0.22)", textAlign: "center",
                  }}>{w}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((d, i) => {
                  if (!d) return <div key={`e-${m}-${i}`} className="aspect-square" />;
                  const key       = ymd(d);
                  const evs       = byDate.get(key) || [];
                  const isTodayCell = key === kToday;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const rankColor = evs[0] ? RANK_COLOR[evs[0].rank || "N"] : null;

                  return (
                    <div key={key}
                      className="relative aspect-square rounded-md flex items-center justify-center"
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: isTodayCell ? 800 : 500,
                        color: isTodayCell
                          ? "#fff"
                          : isWeekend
                            ? "rgba(255,255,255,0.22)"
                            : "rgba(255,255,255,0.55)",
                        background: isTodayCell
                          ? `rgba(${accentRgb},0.18)`
                          : BG_DAY,
                        border: isTodayCell
                          ? `1px solid rgba(${accentRgb},0.35)`
                          : "none",
                        boxShadow: isTodayCell
                          ? `0 0 10px rgba(${accentRgb},0.1), inset 0 0 0 1px rgba(${accentRgb},0.15)`
                          : "none",
                      }}
                      title={evs.slice(0, 3).map(e => `${e.ticker || ""} ${e.title}`.trim()).join(" | ")}
                    >
                      {d.getDate()}
                      {rankColor && (
                        <span className="absolute bottom-1 h-[5px] w-[5px] rounded-full"
                          style={{ background: rankColor, boxShadow: `0 0 4px ${rankColor}99` }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Agenda ── */}
            <div className="px-4 pb-4"
              style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{
                  fontFamily: MONO, fontSize: 8, fontWeight: 700,
                  letterSpacing: "0.22em", textTransform: "uppercase",
                  color: isToday ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)",
                }}>
                  {agendaLabel}
                </span>
                {isToday && (
                  <span className="h-1.5 w-1.5 rounded-full"
                    style={{ background: accentHex, boxShadow: `0 0 6px ${accentHex}` }} />
                )}
              </div>

              {agendaItems.length === 0 ? (
                <div className="flex items-center justify-center rounded-xl"
                  style={{
                    height: 56, fontFamily: MONO, fontSize: 10,
                    color: "rgba(255,255,255,0.18)",
                    background: BG_DAY,
                  }}>
                  No events
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {agendaItems.slice(0, 3).map(e => (
                    <div key={e.id} className="rounded-xl px-3 py-2"
                      style={{ background: BG_DAY }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {e.ticker && (
                            <span className="shrink-0 rounded px-1.5 py-0.5"
                              style={{
                                fontFamily: MONO, fontSize: 8, fontWeight: 700,
                                color: "rgba(255,255,255,0.65)",
                                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                              }}>
                              {e.ticker}
                            </span>
                          )}
                          <span className="truncate" style={{ fontFamily: SANS, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                            {e.title}
                          </span>
                        </div>
                        {e.time && (
                          <span className="shrink-0 flex items-center gap-1"
                            style={{ fontFamily: MONO, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                            <Clock size={8} />
                            {e.time}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
