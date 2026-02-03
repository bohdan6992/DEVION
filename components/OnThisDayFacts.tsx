// components/OnThisDayFacts.tsx
import React, { useEffect, useMemo, useState } from "react";

type Item = { year: number; text: string; emoji?: string; source?: string };
type ApiResponse = { items?: Item[] };

type Props = {
  tz?: string;
  lang?: string;
  date?: string;
  mmdd?: string;
  className?: string;
  limit?: number;
};

export default function OnThisDayFacts({
  tz = "America/New_York",
  lang = "uk",
  date,
  mmdd,
  className = "",
  limit = 5,
}: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [currentDisplayDate, setCurrentDisplayDate] = useState<string>("");

  useEffect(() => {
    const d = new Date();
    if (date) {
      const parts = date.split("-");
      setCurrentDisplayDate(`${parts[1]}-${parts[2]}`);
    } else {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        month: "short",
        day: "numeric",
      });
      setCurrentDisplayDate(formatter.format(d).toUpperCase());
    }
  }, [date, tz]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ tz, lang });
    if (date) p.set("date", date);
    if (mmdd) p.set("mmdd", mmdd);
    return `/api/onthisday?${p.toString()}`;
  }, [tz, lang, date, mmdd]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(query);
        if (!r.ok) throw new Error(String(r.status));
        const data: ApiResponse = await r.json();
        if (!alive) return;
        setItems((data.items ?? []).slice(0, limit));
      } catch {
        try {
          const mod = await import("@/data/onthisday.json");
          const factsData: any = mod.default || mod;
          const key =
            mmdd ||
            (() => {
              const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                month: "2-digit",
                day: "2-digit",
              }).formatToParts(new Date());
              const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
              return `${m.month}-${m.day}`;
            })();
          const raw = (factsData[key] || []) as any[];
          const list: Item[] = raw.map((f) => ({
            year: f.year,
            text: (f.i18n?.[lang] ?? f.text ?? f.i18n?.uk ?? "").trim(),
            emoji: f.emoji,
            source: f.source || undefined,
          }));
          list.sort((a, b) => b.year - a.year);
          if (!alive) return;
          setItems(list.slice(0, limit));
        } catch {
          if (!alive) return;
          setItems([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, tz, lang, limit, mmdd]);

  // Loading Skeleton (Minimal)
  if (!items) {
    return (
      <div className={`h-full w-full flex flex-col ${className}`}>
        <div className="h-6 w-40 bg-white/5 rounded mb-8 animate-pulse" />
        <div className="space-y-10">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-6 animate-pulse">
              <div className="w-[2px] h-full bg-white/5 mx-2" />
              <div className="flex-1 space-y-3">
                <div className="w-20 h-4 bg-white/5 rounded" />
                <div className="w-full h-4 bg-white/5 rounded opacity-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full w-full ${className}`}>
      {/* Minimal Internal Header: Just the Date */}
      <div className="flex items-center gap-3 mb-1">
        <div className="relative flex h- w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
        </div>
        <div className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-[0.2em]">
          {currentDisplayDate || "TODAY"}
        </div>
      </div>

      {/* Timeline List */}
      <div className="relative border-l border-white/[0.08] ml-2 space-y-5 pb-2">
        {items.length > 0 ? (
          items.map((f, i) => (
            <div key={i} className="relative pl-6 group">
              {/* Timeline Dot with Glow */}
              <div className="absolute -left-[6px] top-2.5 h-[10px] w-[10px] rounded-full bg-zinc-700 ring-2 ring-[#030303] group-hover:bg-emerald-400 group-hover:scale-125 group-hover:shadow-[0_0_14px_#34d399] transition-all duration-300 z-10" />

              {/* Year & Emoji */}
              <div className="flex items-center gap-3 mb-">
                <span className="text-lg font-bold font-mono text-emerald-400/90 group-hover:text-emerald-300 transition-colors">
                  {f.year}
                </span>
                {f.emoji && (
                  <span className="text-lg opacity-70 grayscale group-hover:grayscale-0 transition-all">
                    {f.emoji}
                  </span>
                )}
              </div>

              {/* Text Content */}
              <p className="text-[18px] leading-[1.45] text-zinc-300 font-mono group-hover:text-zinc-100 transition-colors line-clamp-3">
                {f.text}
              </p>

              {/* Source Link */}
              {f.source && (
                <a
                  href={f.source}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity text-base text-zinc-500 hover:text-emerald-300 uppercase tracking-widest font-mono"
                >
                  <span>SRC</span>
                  <span className="text-base">↗</span>
                </a>
              )}
            </div>
          ))
        ) : (
          <div className="pl-10 pt-4">
            <span className="text-lg font-mono text-zinc-500 uppercase tracking-widest">No data available</span>
          </div>
        )}

        {/* Fading bottom line */}
        <div className="absolute bottom-0 left-[-1px] w-[2px] h-14 bg-gradient-to-b from-white/[0.08] to-transparent" />
      </div>
    </div>
  );
}
