"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { Calendar, Globe, BarChart3, Activity } from "lucide-react";

type Props = {
  height?: number;
  locale?: string;
  importance?: Array<0 | 1 | 2>;
};

// --- LOGIC: Theme Detection (Відновлено з оригіналу) ---
const DARK_THEMES = new Set([
  "dark", "neon", "matrix", "solaris", "cyberpunk",
  "oceanic", "sakura", "asher", "inferno", "aurora",
  "desert", "midnight", "forest", "candy", "monochrome",
]);

function themeIsDark(name?: string | null) {
  if (!name) return false;
  const v = name.toLowerCase().trim();
  if (v.includes("dark")) return true;
  return DARK_THEMES.has(v);
}

// --- UI COMPONENT: Terminal Badge ---
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

export default function EconomicCalendarUS({
  height = 500,
  locale = "uk",
  importance = [1, 2],
}: Props) {
  const { theme } = useUi();
  const boxRef = useRef<HTMLDivElement>(null);
  
  // 1. Ініціалізація теми (Відновлено)
  const [isDark, setIsDark] = useState<boolean>(true);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document === "undefined") return;
      const el = document.documentElement;
      const attr = el.getAttribute("data-theme");
      setIsDark(themeIsDark(attr) || themeIsDark(theme));
    };
    checkTheme();
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [theme]);

  // 2. Конфігурація віджета (Відновлено оригінальну логіку кольорів)
  const payload = useMemo(() => {
    // Якщо тема темна - використовуємо #0a0a0a (під стиль Deep Space) або #131722 (стандарт TV)
    // Якщо світла - #ffffff
    const bgColor = isDark ? "#0a0a0a" : "#ffffff";

    return {
      colorTheme: isDark ? "dark" : "light",
      isTransparent: false, // Вимикаємо прозорість для стабільності на світлій темі
      width: "100%",
      height: "100%",
      locale,
      importanceFilter: importance.join(","),
      country: "us",
      displayMode: "compact",
      backgroundColor: bgColor,
    };
  }, [isDark, locale, importance]);

  // 3. Ін'єкція скрипта
  useEffect(() => {
    const root = boxRef.current;
    if (!root) return;

    root.innerHTML = "";
    
    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    container.style.width = "100%";
    container.style.height = "100%";
    root.appendChild(container);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.async = true;
    script.innerHTML = JSON.stringify(payload);
    
    root.appendChild(script);

    return () => {
      if (root) root.innerHTML = "";
    };
  }, [payload]);

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6" style={{ height }}>
      {/* 
        Адаптивний контейнер:
        isDark -> Deep Space Glass (#0a0a0a)
        !isDark -> Clean Light Glass (#ffffff)
      */}
      <div className={`
        relative w-full h-full overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col group transition-colors duration-300
        ${isDark 
          ? "bg-[#0a0a0a]/80 border-white/[0.06]" 
          : "bg-white border-zinc-200 shadow-zinc-200/50"
        }
      `}>
        
        {/* Hover Effects (Only visible in dark mode for nebula feel) */}
        {isDark && (
          <>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />
          </>
        )}

        {/* --- HEADER --- */}
        <header className={`
          relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border-b 
          ${isDark 
            ? "border-white/[0.04] bg-gradient-to-r from-white/[0.02] to-transparent" 
            : "border-zinc-100 bg-zinc-50/50"
          }
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              relative flex items-center justify-center w-10 h-10 rounded-xl border shadow-inner transition-colors
              ${isDark 
                ? "bg-gradient-to-b from-zinc-800 to-zinc-900 border-white/5" 
                : "bg-white border-zinc-200 shadow-zinc-100"
              }
            `}>
              <Calendar size={18} className={isDark ? "text-zinc-200" : "text-zinc-600"} />
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                ECONOMIC CALENDAR
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Events Tracker</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
             <TerminalBadge icon={Globe} color="zinc">US MARKET</TerminalBadge>
             <TerminalBadge icon={BarChart3} color="emerald">HIGH IMPACT</TerminalBadge>
          </div>
        </header>

        {/* --- WIDGET CONTENT --- */}
        <div className={`relative flex-1 min-h-0 ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}>
           {/* Placeholder Icon */}
           <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <Activity size={100} className="text-zinc-500" />
           </div>

           {/* Widget Wrapper */}
           <div 
             className="tradingview-widget-container relative z-10 h-full w-full" 
             ref={boxRef} 
             // KEY змінюється при зміні теми, щоб React повністю перемалював div і скрипт заново завантажився
             key={isDark ? "dark-cal" : "light-cal"}
           />
           
           {/* Fade Mask (Адаптивна до фону) */}
           <div 
             className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-20"
             style={{ 
               background: `linear-gradient(to top, ${isDark ? '#0a0a0a' : '#ffffff'}, transparent)` 
             }}
           />
        </div>

      </div>
    </section>
  );
}