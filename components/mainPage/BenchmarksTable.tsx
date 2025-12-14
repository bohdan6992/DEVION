"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { LineChart, Globe, Activity, TrendingUp } from "lucide-react";

type Props = {
  height?: number;
  locale?: string;
};

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

// --- UI COMPONENT: Terminal Badge ---
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" | "cyan" }) => {
  const colors = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    cyan: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

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
    <section className="w-full max-w-[1400px] mx-auto mb-6" style={{ height }}>
      {/* 
        Container (Deep Space Glass)
      */}
      <div className={`
        relative w-full h-full overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col group transition-colors duration-300
        ${isDark 
          ? "bg-[#0a0a0a]/80 border-white/[0.06]" 
          : "bg-white border-zinc-200 shadow-zinc-200/50"
        }
      `}>
        
        {/* Hover Effects (Dark mode only) */}
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
              <LineChart size={18} className={isDark ? "text-zinc-200" : "text-zinc-600"} />
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                GLOBAL MARKETS
                <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Live Quotes</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
             <TerminalBadge icon={Globe} color="zinc">MULTI-ASSET</TerminalBadge>
             <TerminalBadge icon={TrendingUp} color="cyan">REAL-TIME</TerminalBadge>
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
             ref={containerRef} 
             // Перестворюємо при зміні теми
             key={isDark ? "dark-bench" : "light-bench"}
           />
           
           {/* Fade Mask (Адаптивна) - для плавного зникнення списку внизу */}
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