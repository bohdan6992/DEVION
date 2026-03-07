"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUi } from "@/components/UiProvider";

// --- LOGIC: Theme Detection ---
const DARK_THEMES = new Set([
  "dark", "neon", "matrix", "solaris", "cyberpunk",
  "oceanic", "sakura", "asher", "inferno", "aurora",
  "desert", "midnight", "forest", "candy", "monochrome", "space",
]);

function themeIsDark(name?: string | null) {
  if (!name) return false;
  const v = name.toLowerCase().trim();
  if (v.includes("dark")) return true;
  return DARK_THEMES.has(v);
}

export default function BenchmarksStrip({
  height = 56,
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
    <section className="w-full max-w-[1400px] mx-auto">
      <div 
        className={`
          relative w-full overflow-hidden rounded-xl border backdrop-blur-md shadow-[0_12px_34px_-24px_rgba(0,0,0,0.7)] flex items-center transition-colors duration-300
          ${isDark 
            ? "bg-black/20 border-white/10" 
            : "bg-white/90 border-zinc-200"
          }
        `}
        style={{ height }}
      >
        <div className={`
          relative z-10 flex items-center gap-2 px-4 h-full border-r shrink-0
          ${isDark ? "border-white/10 bg-black/25" : "border-zinc-200 bg-zinc-50/80"}
        `}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isDark ? "bg-white/60" : "bg-zinc-500/60"}`} />
          <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.16em] ${isDark ? "text-[var(--dash-text-muted)]" : "text-zinc-500"}`}>
            Market Tape
          </span>
        </div>

        <div className="relative flex-1 h-full overflow-hidden">
           <iframe
            key={isDark ? "dark-tape" : "light-tape"}
            title="Ticker Tape"
            src={iframeSrc}
            className="w-full h-full border-0 block"
            loading="eager"
            scrolling="no"
          />

          <div 
            className="absolute top-0 bottom-0 left-0 w-8 pointer-events-none z-20"
            style={{ background: `linear-gradient(to right, ${isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.92)'}, transparent)` }}
          />
          <div 
            className="absolute top-0 bottom-0 right-0 w-8 pointer-events-none z-20"
            style={{ background: `linear-gradient(to left, ${isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.92)'}, transparent)` }}
          />
        </div>

      </div>
    </section>
  );
}





