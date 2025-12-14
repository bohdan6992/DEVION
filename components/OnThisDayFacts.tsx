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
        const parts = date.split('-');
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
          const key = mmdd || (() => {
            const parts = new Intl.DateTimeFormat("en-US", {
              timeZone: tz, month: "2-digit", day: "2-digit"
            }).formatToParts(new Date());
            const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
            return `${m.month}-${m.day}`;
          })();
          const raw = (factsData[key] || []) as any[];
          const list: Item[] = raw.map(f => ({
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
    return () => { alive = false; };
  }, [query, tz, lang, limit, mmdd]);

  // Loading Skeleton (Minimal)
  if (!items) {
    return (
      <div className={`h-full w-full flex flex-col ${className}`}>
        <div className="h-4 w-24 bg-white/5 rounded mb-6 animate-pulse" />
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
             <div key={i} className="flex gap-4 animate-pulse">
                 <div className="w-[1px] h-full bg-white/5 mx-1.5" />
                 <div className="flex-1 space-y-2">
                    <div className="w-10 h-3 bg-white/5 rounded" />
                    <div className="w-full h-3 bg-white/5 rounded opacity-50" />
                 </div>
             </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    // Прибрав зовнішні рамки і фони, тепер це чистий контент
    <div className={`flex flex-col h-full w-full ${className}`}>
       
       {/* Minimal Internal Header: Just the Date */}
       <div className="flex items-center gap-2 mb-6">
          <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
          <div className="text-xs font-bold font-mono text-emerald-500 uppercase tracking-[0.2em]">
             {currentDisplayDate || "TODAY"}
          </div>
       </div>

       {/* Timeline List */}
       <div className="relative border-l border-white/[0.08] ml-1 space-y-6 pb-2">
          {items.length > 0 ? (
             items.map((f, i) => (
                <div key={i} className="relative pl-6 group">
                   
                   {/* Timeline Dot with Glow */}
                   <div className="absolute -left-[3px] top-1.5 h-[5px] w-[5px] rounded-full bg-zinc-700 ring-2 ring-[#030303] group-hover:bg-emerald-400 group-hover:scale-150 group-hover:shadow-[0_0_8px_#34d399] transition-all duration-300 z-10" />
                   
                   {/* Year & Emoji */}
                   <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono text-emerald-500/90 group-hover:text-emerald-400 transition-colors">
                         {f.year}
                      </span>
                      {f.emoji && <span className="text-[10px] opacity-60 grayscale group-hover:grayscale-0 transition-all">{f.emoji}</span>}
                   </div>
                   
                   {/* Text Content */}
                   <p className="text-[11px] leading-relaxed text-zinc-400 font-mono group-hover:text-zinc-200 transition-colors line-clamp-3">
                      {f.text}
                   </p>
                   
                   {/* Source Link (Hidden by default, visible on hover) */}
                   {f.source && (
                      <a 
                        href={f.source} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-zinc-600 hover:text-emerald-400 uppercase tracking-widest font-mono"
                      >
                         <span>SRC</span>
                         <span className="text-[8px]">↗</span>
                      </a>
                   )}
                </div>
             ))
          ) : (
             <div className="pl-6 pt-2">
                <span className="text-[10px] font-mono text-zinc-600 uppercase">No data available</span>
             </div>
          )}
          
          {/* Fading bottom line to suggest continuation */}
          <div className="absolute bottom-0 left-[-1px] w-[1px] h-10 bg-gradient-to-b from-white/[0.08] to-transparent" />
       </div>
    </div>
  );
}