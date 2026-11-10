"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";

export type Rank = "S" | "A" | "B" | "F" | "N";
export type EventItem = {
  id: string; title: string; date: string;
  time?: string; ticker?: string; tags?: string[];
  rank?: Rank; note?: string; link?: string;
};

type Accent = { hex: string; rgb: string };
type Props  = { events: EventItem[]; accent?: Accent };

/* GOLD belongs to earnings reports ONLY: nothing else (categories, swatches, stars, rank colours) may be
   gold. Stored colours that are gold-ish are remapped on load so old saves can't leak it back in. */
const GOLD = "#f5b800";
const GOLDISH = new Set(["#fbbf24", "#f59e0b", "#facc15", "#eab308", "#f5b800", "#fde047", "#fcd34d"]);
const NOT_GOLD = "#fb923c";
const safeColor = (c: string) => (GOLDISH.has(String(c).toLowerCase()) ? NOT_GOLD : c);
const isReport = (e: EventItem) => !!e.tags?.includes("report");
const extColor = (e: EventItem) => (isReport(e) ? GOLD : RANK_COLOR[e.rank || "N"]);
const MAX_REPORTS = 6;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS   = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const RANK_COLOR: Record<Rank, string> = {
  S: "#fb923c", A: "#a78bfa", B: "#38bdf8", F: "#fb7185", N: "#52525b",
};


/* ─── User events ───
   Quarterly recurrence: an event is stored as (position of the month inside the quarter, day), NOT as
   a calendar date. Nov 14 = 2nd month of the quarter, day 14, so it shows on Feb 14, May 14, Aug 14 and
   Nov 14 every year. A day past the end of a shorter month (e.g. 31 in a 30-day month) lands on that
   month's last day instead of silently disappearing. Persisted in this browser's localStorage. */
export type UserEvent = {
  id: string; title: string; category: string; color: string;
  pos: 0 | 1 | 2; day: number;
};

const CATEGORIES: { key: string; color: string }[] = [
  { key: "Dividend", color: "#34d399" },
  { key: "Macro",    color: "#38bdf8" },
  { key: "Deadline", color: "#fb7185" },
  { key: "Meeting",  color: "#a78bfa" },
  { key: "Reminder", color: "#e879f9" },
  { key: "Other",    color: "#94a3b8" },
];
const SWATCHES = ["#e879f9", "#fb923c", "#fb7185", "#f472b6", "#a78bfa", "#38bdf8", "#22d3ee", "#34d399", "#a3e635", "#94a3b8"];
const STORAGE_KEY = "centurion.calendar.events.v1";
const MARKS_KEY   = "centurion.calendar.stars.v1";

/* A starred day fills its whole cell with the star's colour. Recurs quarterly exactly like events. */
export type DayMark = { pos: 0 | 1 | 2; day: number; color: string };
const markMatches = (k: DayMark, d: Date) =>
  k.pos === d.getMonth() % 3 && Math.min(k.day, daysIn(d.getFullYear(), d.getMonth())) === d.getDate();

function loadMarks(): DayMark[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKS_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((k) => k && [0, 1, 2].includes(k.pos) && k.day >= 1 && k.day <= 31 && typeof k.color === "string")
          .map((k) => ({ ...k, color: safeColor(k.color) }))
      : [];
  } catch { return []; }
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const matchesDate = (e: UserEvent, d: Date) =>
  e.pos === d.getMonth() % 3 && Math.min(e.day, daysIn(d.getFullYear(), d.getMonth())) === d.getDate();

function loadUserEvents(): UserEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((e) => e && typeof e.id === "string" && typeof e.title === "string"
          && [0, 1, 2].includes(e.pos) && e.day >= 1 && e.day <= 31)
          .map((e) => ({ ...e, color: safeColor(e.color) }))
      : [];
  } catch { return []; }
}

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
  const accentRgb = accent?.rgb ?? "0,240,255";

  const { start, year } = useMemo(() => getQuarterBounds(), []);
  const months = [start.getMonth(), start.getMonth() + 1, start.getMonth() + 2];

  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [marks, setMarks] = useState<DayMark[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Date | null>(null);
  const [hover, setHover] = useState<{ rect: DOMRect; d: Date } | null>(null);

  useEffect(() => { setUserEvents(loadUserEvents()); setMarks(loadMarks()); setLoaded(true); }, []);
  useEffect(() => {
    if (!loaded) return; // never overwrite saved events with the initial empty list
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userEvents)); } catch {}
  }, [userEvents, loaded]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch {}
  }, [marks, loaded]);

  const markFor = (d: Date) => marks.find((k) => markMatches(k, d));
  const setMark = (d: Date, color: string | null) =>
    setMarks((p) => {
      const rest = p.filter((k) => !markMatches(k, d));
      return color ? [...rest, { pos: (d.getMonth() % 3) as 0 | 1 | 2, day: d.getDate(), color }] : rest;
    });

  const userFor = (d: Date) => userEvents.filter((e) => matchesDate(e, d));

  // Earnings pulled from the internet (scripts/fetch-earnings.mjs via /api/earnings/range). Re-read every
  // 30 min; the API itself re-runs the script when its file is older than 6h.
  const [earnings, setEarnings] = useState<EventItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = new Date();
        const a = new Date(q.getFullYear(), Math.floor(q.getMonth() / 3) * 3, 1);
        const b = new Date(a.getFullYear(), a.getMonth() + 3, 0);
        const r = await fetch(`/api/earnings/range?from=${ymd(a)}&to=${ymd(b)}`);
        const j = await r.json();
        if (alive && Array.isArray(j.items)) setEarnings(j.items);
      } catch { /* keep last */ }
    };
    load();
    const t = setInterval(load, 30 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const e of [...events, ...earnings]) m.set(e.date, [...(m.get(e.date) || []), e]);
    return m;
  }, [events, earnings]);

  const kToday = ymd(new Date());

  return (
    <div className="grid grid-cols-3 gap-3 pb-4">
      {months.map((m) => {
        const weeks = getMonthMatrix(year, m);
        const label = MONTHS[(m % 12 + 12) % 12];
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
                  const ue = userFor(d);
                  // Right half of the cell: reports (gold, rightmost column), dividends just left of them.
                  const reports = evs.filter(isReport).slice(0, MAX_REPORTS);
                  const divs = ue.filter((u) => u.category === "Dividend").map((u) => u.color).slice(0, MAX_REPORTS);
                  // Everything else stays in the left half, bottom row.
                  const others = [
                    ...evs.filter((e) => !isReport(e)).map((e) => RANK_COLOR[e.rank || "N"]),
                    ...ue.filter((u) => u.category !== "Dividend").map((u) => u.color),
                  ];
                  const star = markFor(d)?.color;

                  return (
                    <div key={key}
                      className="relative aspect-square rounded-md cursor-pointer transition hover:brightness-125"
                      onClick={() => { setHover(null); setEditing(d); }}
                      onMouseEnter={(ev) => setHover({ rect: ev.currentTarget.getBoundingClientRect(), d })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        fontFamily: MONO,
                        fontSize: 14,
                        fontWeight: isTodayCell || star ? 800 : 600,
                        color: star
                          ? "#0a0a0a"
                          : isTodayCell
                            ? "#fff"
                            : isWeekend
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(255,255,255,0.65)",
                        background: star
                          ? star
                          : isTodayCell
                            ? `rgba(${accentRgb},0.18)`
                            : BG_DAY,
                        border: isTodayCell
                          ? `1px solid rgba(${accentRgb},0.35)`
                          : "none",
                        boxShadow: isTodayCell
                          ? `0 0 10px rgba(${accentRgb},0.1), inset 0 0 0 1px rgba(${accentRgb},0.15)`
                          : "none",
                      }}
                    >
                      <span className="absolute left-2 top-1.5 leading-none">{d.getDate()}</span>
                      {others.length > 0 && (
                        <span className="absolute left-2 bottom-1.5 flex items-center gap-[3px]">
                          {others.slice(0, 4).map((c, di) => (
                            <span key={di} className="h-[10px] w-[10px] rounded-full"
                              style={{ background: c, boxShadow: `0 0 5px ${c}99`, border: "1px solid rgba(0,0,0,0.45)" }} />
                          ))}
                          {others.length > 4 && (
                            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, lineHeight: 1, color: star ? "#0a0a0a" : "rgba(255,255,255,0.6)" }}>
                              +{others.length - 4}
                            </span>
                          )}
                        </span>
                      )}
                      {divs.length > 0 && (
                        <span className="absolute bottom-1.5 flex flex-col-reverse items-center gap-[2px]" style={{ right: 20 }}>
                          {divs.map((c, di) => (
                            <span key={di} className="h-[10px] w-[10px] rounded-full"
                              style={{ background: c, boxShadow: `0 0 5px ${c}99`, border: "1px solid rgba(0,0,0,0.45)" }} />
                          ))}
                        </span>
                      )}
                      {reports.length > 0 && (
                        <span className="absolute right-1.5 bottom-1.5 flex flex-col-reverse items-center gap-[2px]">
                          {reports.map((e) => (
                            <span key={e.id} className="h-[10px] w-[10px] rounded-full"
                              style={{ background: GOLD, boxShadow: `0 0 6px ${GOLD}`, border: "1px solid rgba(0,0,0,0.45)" }} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        );
      })}

      {/* ── Hover popup (portal: escapes the card's overflow/backdrop-filter and any transformed ancestor) ── */}
      {hover && typeof document !== "undefined" && (() => {
        const list = [
          ...(byDate.get(ymd(hover.d)) || []).map((e) => ({
            id: e.id, color: extColor(e), title: `${e.ticker || ""} ${e.title}`.trim(), category: "",
          })),
          ...userFor(hover.d).map((u) => ({ id: u.id, color: u.color, title: u.title, category: u.category })),
        ];
        const below = hover.rect.top < 200;
        const left = Math.min(Math.max(hover.rect.left + hover.rect.width / 2, 130), window.innerWidth - 130);
        return createPortal(
          <div className="pointer-events-none fixed z-[1000] rounded-xl px-3.5 py-2.5"
            style={{
              left,
              top: below ? hover.rect.bottom + 8 : hover.rect.top - 8,
              transform: below ? "translateX(-50%)" : "translate(-50%,-100%)",
              background: "rgba(6,6,8,0.96)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)",
              boxShadow: "0 10px 32px rgba(0,0,0,0.65)", width: 240,
            }}>
            <div className="mb-1.5" style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.55)", textTransform: "uppercase",
            }}>
              {hover.d.getDate()} {MONTHS[hover.d.getMonth()]}
            </div>
            {list.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>No events · click to add</div>
            ) : list.map((it) => (
              <div key={it.id} className="flex items-center gap-2 py-[3px]">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: it.color, boxShadow: `0 0 5px ${it.color}99` }} />
                <span className="truncate" style={{ fontFamily: SANS, fontSize: 12, color: "rgba(255,255,255,0.88)" }}>{it.title}</span>
                {it.category && (
                  <span className="ml-auto pl-2 shrink-0" style={{
                    fontFamily: MONO, fontSize: 8, color: "rgba(255,255,255,0.4)",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>{it.category}</span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        );
      })()}

      {editing && typeof document !== "undefined" && createPortal(
        <EventEditor
          date={editing}
          events={userFor(editing)}
          star={markFor(editing)?.color ?? null}
          onStar={(c) => setMark(editing, c)}
          onClose={() => setEditing(null)}
          onAdd={(title, category, color) =>
            setUserEvents((p) => [...p, {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              title, category, color,
              pos: (editing.getMonth() % 3) as 0 | 1 | 2, day: editing.getDate(),
            }])}
          onDelete={(id) => setUserEvents((p) => p.filter((e) => e.id !== id))}
        />,
        document.body,
      )}
    </div>
  );
}

function EventEditor({ date, events, star, onStar, onClose, onAdd, onDelete }: {
  date: Date; events: UserEvent[]; star: string | null; onStar: (c: string | null) => void; onClose: () => void;
  onAdd: (title: string, category: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [color, setColor] = useState(CATEGORIES[0].color);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pos = date.getMonth() % 3;
  const repeats = [0, 1, 2, 3].map((k) => MONTHS[(pos + 3 * k) % 12]).join(" · ");
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, category, color);
    setTitle("");
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }} onMouseDown={onClose}>
      <div className="rounded-2xl p-5" onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 360, background: "rgba(10,10,12,0.97)", border: `1px solid ${BORDER}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)", fontFamily: MONO,
        }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", color: "rgba(255,255,255,0.8)" }}>
            {date.getDate()} {MONTHS[date.getMonth()]}
          </span>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.4)" }}><X size={14} /></button>
        </div>
        <div className="mb-4" style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
          Repeats every quarter on day {date.getDate()}: {repeats}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Star size={14} style={{ color: star ?? "rgba(255,255,255,0.35)", fill: star ?? "none" }} />
          <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)" }}>DAY</span>
          <div className="flex items-center gap-1.5 ml-1">
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => onStar(star === c ? null : c)} aria-label={`Star ${c}`}
                className="h-4 w-4 rounded-md"
                style={{ background: c, outline: star === c ? "2px solid #fff" : "none", outlineOffset: 2 }} />
            ))}
          </div>
          {star && (
            <button onClick={() => onStar(null)} title="Remove star" className="ml-auto" style={{ color: "rgba(255,255,255,0.4)" }}>
              <X size={12} />
            </button>
          )}
        </div>

        {events.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: BG_DAY }}>
                <span className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: e.color, boxShadow: `0 0 4px ${e.color}99` }} />
                <span className="truncate" style={{ fontFamily: SANS, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{e.title}</span>
                <span className="ml-auto shrink-0" style={{
                  fontSize: 8, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em",
                }}>{e.category}</span>
                <button onClick={() => onDelete(e.id)} title="Delete" style={{ color: "rgba(255,255,255,0.35)" }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Event title"
          className="w-full rounded-lg px-3 py-2 mb-3 outline-none"
          style={{
            background: BG_DAY, border: `1px solid ${BORDER}`,
            color: "rgba(255,255,255,0.85)", fontFamily: SANS, fontSize: 12,
          }}
        />

        <div className="flex flex-wrap gap-1.5 mb-3">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => { setCategory(c.key); setColor(c.color); }}
              className="rounded-md px-2.5 h-7 uppercase"
              style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color: category === c.key ? "#fff" : "rgba(255,255,255,0.45)",
                background: category === c.key ? "rgba(255,255,255,0.08)" : "transparent",
                border: `1px solid ${category === c.key ? "rgba(255,255,255,0.25)" : BORDER}`,
              }}>
              {c.key}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          {SWATCHES.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={c}
              className="h-5 w-5 rounded-full"
              style={{
                background: c, outline: color === c ? "2px solid #fff" : "none",
                outlineOffset: 2, boxShadow: `0 0 6px ${c}66`,
              }} />
          ))}
        </div>

        <button onClick={submit} disabled={!title.trim()}
          className="w-full h-8 rounded-lg uppercase"
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.15em",
            background: title.trim() ? color : "rgba(255,255,255,0.05)",
            color: title.trim() ? "#0a0a0a" : "rgba(255,255,255,0.25)",
          }}>
          Add event
        </button>
      </div>
    </div>
  );
}
