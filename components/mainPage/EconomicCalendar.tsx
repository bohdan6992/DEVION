"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";

type Props = {
  height?: number;
  locale?: string;
  importance?: Array<0 | 1 | 2>;
};

// --- LOGIC: Theme Detection (Відновлено з оригіналу) ---
const DARK_THEMES = new Set([
  "dark", "neon", "matrix", "solaris", "cyberpunk",
  "oceanic", "sakura", "asher", "inferno", "sparkle",
  "desert", "midnight", "forest", "candy", "monochrome", "space",
]);

function themeIsDark(name?: string | null) {
  if (!name) return false;
  const v = name.toLowerCase().trim();
  if (v.includes("dark")) return true;
  return DARK_THEMES.has(v);
}

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
    <section className="w-full max-w-[1400px] mx-auto" style={{ height }}>
      <div className={`
        w-full h-full overflow-hidden rounded-2xl border backdrop-blur-md shadow-[0_14px_44px_-28px_rgba(0,0,0,0.75)] flex flex-col transition-colors duration-300
        ${isDark 
          ? "bg-black/20 border-white/10" 
          : "bg-white/90 border-zinc-200"
        }
      `}>
        <div className={`relative flex-1 min-h-0 ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}>
           <div 
             className="tradingview-widget-container h-full w-full" 
             ref={boxRef} 
             key={isDark ? "dark-cal" : "light-cal"}
           />
        </div>

      </div>
    </section>
  );
}





