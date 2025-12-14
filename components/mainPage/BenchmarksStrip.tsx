"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { Activity } from "lucide-react";

// --- LOGIC: Theme Detection ---
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

export default function BenchmarksStrip({
  height = 54, // Трохи зменшив висоту для компактності стрічки
  locale = "uk",
}: {
  height?: number;
  locale?: string;
}) {
  const { theme } = useUi();
  const [isDark, setIsDark] = useState<boolean>(true);

  // 1. Theme Effect
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

  // 2. URL Generator
  const iframeSrc = useMemo(() => {
    // В Deep Space стилі фон або #0a0a0a, або білий
    const bgColor = isDark ? "#0a0a0a" : "#ffffff";

    const symbols = [
      { proName: "TVC:USOIL", title: "WTI" },
      { proName: "TVC:UKOIL", title: "Brent" },
      { proName: "TVC:GOLD", title: "Gold" },
      { proName: "TVC:SILVER", title: "Silver" },
      { proName: "FX:EURUSD", title: "EUR/USD" },
      { proName: "FX:USDJPY", title: "USD/JPY" },
      { proName: "BINANCE:BTCUSDT", title: "BTC" },
      { proName: "BINANCE:ETHUSDT", title: "ETH" },
      { proName: "SP:SPX", title: "S&P 500" },
      { proName: "NASDAQ:NDX", title: "Nasdaq 100" },
      { proName: "DJ:DJI", title: "Dow 30" },
    ];

    const payload = {
      symbols,
      showSymbolLogo: true,
      colorTheme: isDark ? "dark" : "light",
      isTransparent: false, // Вимикаємо прозорість для стабільності
      backgroundColor: bgColor,
      displayMode: "adaptive",
      locale,
    };

    const host = "https://www.tradingview-widget.com";
    return `${host}/embed-widget/ticker-tape/?locale=${encodeURIComponent(locale)}#${encodeURIComponent(JSON.stringify(payload))}`;
  }, [isDark, locale]);

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6">
      {/* 
        Container (Deep Space Glass)
        Height is fixed to create a clean strip
      */}
      <div 
        className={`
          relative w-full overflow-hidden rounded-xl border backdrop-blur-xl shadow-lg flex items-center transition-colors duration-300
          ${isDark 
            ? "bg-[#0a0a0a]/80 border-white/[0.06]" 
            : "bg-white border-zinc-200 shadow-zinc-200/50"
          }
        `}
        style={{ height }}
      >
        
        {/* Hover Gradient (Dark Mode) */}
        {isDark && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        )}

        {/* --- LEFT LABEL --- */}
        <div className={`
          relative z-10 flex items-center gap-3 px-4 h-full border-r shrink-0
          ${isDark ? "border-white/[0.06] bg-[#0a0a0a]" : "border-zinc-200 bg-zinc-50"}
        `}>
          <div className="relative flex items-center justify-center w-2 h-2">
             <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
             <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </div>
          <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            Market Tape
          </span>
        </div>

        {/* --- TAPE VIEWPORT --- */}
        <div className="relative flex-1 h-full overflow-hidden">
           
           {/* Iframe */}
           <iframe
            key={isDark ? "dark-tape" : "light-tape"}
            title="Ticker Tape"
            src={iframeSrc}
            className="w-full h-full border-0 block"
            loading="eager"
            scrolling="no"
          />

          {/* Fade Masks (Left & Right) */}
          <div 
            className="absolute top-0 bottom-0 left-0 w-8 pointer-events-none z-20"
            style={{ background: `linear-gradient(to right, ${isDark ? '#0a0a0a' : '#ffffff'}, transparent)` }}
          />
          <div 
            className="absolute top-0 bottom-0 right-0 w-8 pointer-events-none z-20"
            style={{ background: `linear-gradient(to left, ${isDark ? '#0a0a0a' : '#ffffff'}, transparent)` }}
          />

        </div>

      </div>
    </section>
  );
}