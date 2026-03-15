"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";

type Props = {
  height?: number;
  locale?: string;
};

// --- LOGIC: Theme Detection ---
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

export default function BenchmarksTable({
  height = 500,
  locale = "uk",
}: Props) {
  const { theme } = useUi();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 1. Стейт теми
  const [isDark, setIsDark] = useState(true);

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

  // 2. Payload
  const payload = useMemo(() => {
    // #0a0a0a - це колір фону нашої картки в темному режимі. 
    // Ми ставимо його фоном віджета, щоб він виглядав прозорим.
    const bgColor = isDark ? "#0a0a0a" : "#ffffff";

    return {
      width: "100%",
      height: "100%",
      symbolsGroups: [
        {
          name: "US Indices",
          symbols: [
            { name: "AMEX:SPY", displayName: "S&P 500" },
            { name: "NASDAQ:QQQ", displayName: "Nasdaq 100" },
            { name: "AMEX:IWM", displayName: "Russell 2000" },
            { name: "AMEX:DIA", displayName: "Dow Jones" },
          ],
        },
        {
          name: "Sectors",
          symbols: [
            { name: "AMEX:XLF", displayName: "Financials" },
            { name: "AMEX:XLE", displayName: "Energy" },
            { name: "AMEX:XLK", displayName: "Technology" },
            { name: "AMEX:SMH", displayName: "Semis" },
          ],
        },
        {
          name: "Commodities & FX",
          symbols: [
            { name: "TVC:GOLD", displayName: "Gold" },
            { name: "TVC:USOIL", displayName: "Crude Oil" },
            { name: "FX:EURUSD", displayName: "EUR/USD" },
            { name: "FX:USDJPY", displayName: "USD/JPY" },
          ],
        },
        {
          name: "Crypto",
          symbols: [
            { name: "BINANCE:BTCUSDT", displayName: "Bitcoin" },
            { name: "BINANCE:ETHUSDT", displayName: "Ethereum" },
            { name: "BINANCE:SOLUSDT", displayName: "Solana" },
          ],
        },
      ],
      showSymbolLogo: true,
      isTransparent: false, // Вимикаємо прозорість для стабільності
      colorTheme: isDark ? "dark" : "light",
      backgroundColor: bgColor,
      locale: locale,
      largeChartUrl: "", // Можна додати URL, якщо треба клікати
    };
  }, [isDark, locale]);

  // 3. Script Injection
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    root.innerHTML = "";
    
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";
    root.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js";
    script.type = "text/javascript";
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
             ref={containerRef} 
             key={isDark ? "dark-bench" : "light-bench"}
           />
        </div>

      </div>
    </section>
  );
}





