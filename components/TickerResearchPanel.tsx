// components/TickerResearchPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { Search, BarChart2, Info, FileText, Activity, ArrowRight, X } from "lucide-react";

/* ===================== LOGIC: THEME & UTILS ===================== */
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

// Exchange Map logic
const KNOWN_EXCH: Record<string, "NASDAQ" | "NYSE" | "AMEX"> = {
  TSLA: "NASDAQ", AAPL: "NASDAQ", MSFT: "NASDAQ", NVDA: "NASDAQ",
  META: "NASDAQ", AMZN: "NASDAQ", GOOGL: "NASDAQ", GOOG: "NASDAQ",
  AMD: "NASDAQ", NFLX: "NASDAQ", INTC: "NASDAQ",
  "BRK.B": "NYSE", "BRK.A": "NYSE", JPM: "NYSE", V: "NYSE", KO: "NYSE",
  DIS: "NYSE", BA: "NYSE", XOM: "NYSE", CVX: "NYSE",
  SPY: "AMEX", QQQ: "AMEX", DIA: "AMEX", IWM: "AMEX",
  XLK: "AMEX", XLF: "AMEX", XLE: "AMEX", XLY: "AMEX", XLP: "AMEX",
  XLI: "AMEX", XLV: "AMEX", XLB: "AMEX", XLU: "AMEX", XLC: "AMEX",
};
const ETF_SET = new Set(["SPY","QQQ","DIA","IWM","XLK","XLF","XLE","XLY","XLP","XLI","XLV","XLB","XLU","XLC"]);

function normalizeSymbol(rawInput: string): { symbol: string; autoFixed?: string } {
  const raw = (rawInput || "").trim().toUpperCase();
  if (!raw) return { symbol: "NASDAQ:TSLA" }; 

  if (raw.includes(":")) {
    const [ex, tk] = raw.split(":");
    if (KNOWN_EXCH[tk] && KNOWN_EXCH[tk] !== (ex as any)) {
      const fixed = `${KNOWN_EXCH[tk]}:${tk}`;
      return { symbol: fixed, autoFixed: `Corrected: ${ex} → ${KNOWN_EXCH[tk]}` };
    }
    return { symbol: `${ex}:${tk}` };
  }
  if (KNOWN_EXCH[raw]) return { symbol: `${KNOWN_EXCH[raw]}:${raw}` };
  if (ETF_SET.has(raw)) return { symbol: `AMEX:${raw}` };
  return { symbol: `${raw.length <= 5 ? "NASDAQ" : "NYSE"}:${raw}` };
}

/* ===================== UI COMPONENTS ===================== */

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

/* ===================== TRADINGVIEW EMBED LOGIC ===================== */

function buildAdvancedChartSrc(params: any) {
  const { symbol, interval = "60", range = "12M", theme, locale = "uk", frameElementId, backgroundColor } = params;
  const u = new URL("https://s.tradingview.com/widgetembed/");
  
  // === ВИПРАВЛЕННЯ МАСШТАБУВАННЯ ===
  // Замість ширини/висоти використовуємо autosize
  u.searchParams.set("autosize", "1"); 
  
  u.searchParams.set("frameElementId", frameElementId);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("interval", interval);
  u.searchParams.set("range", range);
  u.searchParams.set("theme", theme);
  u.searchParams.set("style", "1");
  u.searchParams.set("timezone", "Etc/UTC");
  u.searchParams.set("locale", locale);
  u.searchParams.set("withdateranges", "1");
  u.searchParams.set("hide_side_toolbar", "0");
  u.searchParams.set("hide_top_toolbar", "0");
  u.searchParams.set("allow_symbol_change", "1");
  u.searchParams.set("save_image", "0");
  u.searchParams.set("details", "1");
  
  if (backgroundColor) {
     u.searchParams.set("backgroundColor", backgroundColor);
     u.searchParams.set("toolbar_bg", backgroundColor);
  }
  
  u.searchParams.set("studies", JSON.stringify(["MASimple@tv-basicstudies","RSI@tv-basicstudies"]));
  return u.toString();
}

function TVEmbed({ endpoint, payload, theme, style, title, minHeight, icon: Icon }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const iframeIdRef = useRef(`tv_iframe_${Math.random().toString(36).slice(2)}`);
  const isDark = theme === "dark";

  useEffect(() => {
    if (endpoint === "advanced-chart") return;
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    // Важливо: для скриптових віджетів теж ставимо 100%
    container.style.width = "100%";
    container.style.height = "100%";
    host.appendChild(container);

    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${endpoint}.js`;
    script.async = true;
    script.innerHTML = JSON.stringify(payload);
    host.appendChild(script);

    return () => { if(host) host.innerHTML = ""; };
  }, [endpoint, JSON.stringify(payload), theme]);

  const iframeSrc = endpoint === "advanced-chart" 
    ? buildAdvancedChartSrc({ ...payload, frameElementId: iframeIdRef.current }) 
    : "";

  return (
    <div className={`
      relative w-full overflow-hidden rounded-xl border transition-colors duration-300 flex flex-col
      ${isDark ? "bg-[#0a0a0a] border-white/[0.04]" : "bg-white border-zinc-200"}
    `} style={{ height: minHeight || "auto", minHeight: minHeight }}>
      
      {title && (
        <div className={`
          flex items-center gap-2 px-4 py-2 border-b text-xs font-bold uppercase tracking-wider shrink-0
          ${isDark ? "border-white/[0.04] text-zinc-500 bg-[#0a0a0a]" : "border-zinc-100 text-zinc-400 bg-zinc-50"}
        `}>
          {Icon && <Icon size={12} />}
          {title}
        </div>
      )}

      <div 
        ref={ref} 
        className="tradingview-widget-container flex-1 relative z-10 w-full h-full" 
        style={style}
      >
        {endpoint === "advanced-chart" && (
          <iframe
            id={iframeIdRef.current}
            title="TradingView Chart"
            src={iframeSrc}
            style={{ width: "100%", height: "100%", border: "0", display: "block" }}
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */

export default function TickerResearchPanel({
  initial = "TSLA",
  locale = "uk",
}: {
  initial?: string;
  locale?: string;
}) {
  const { theme } = useUi();
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

  const widgetBgColor = isDark ? "#0a0a0a" : "#ffffff";
  const colorTheme = isDark ? "dark" : "light";
  
  // Logic
  const [input, setInput] = useState(initial);
  const [hint, setHint] = useState("");
  const { symbol: normalizedInitial } = normalizeSymbol(initial);
  const [symbol, setSymbol] = useState(normalizedInitial);

  const commitSymbol = (val?: string) => {
    const { symbol: ns, autoFixed } = normalizeSymbol(val ?? input);
    setSymbol(ns);
    setHint(autoFixed || "");
  };

  const quick = ["SPY","QQQ","NVDA","TSLA","AAPL","AMD","BTCUSD"];

  // === Payloads ===
  
  const miniOverviewPayload = useMemo(() => ({
    symbol, 
    dateRange: "12M", 
    chartType: "area", 
    colorTheme, 
    width: "100%", 
    height: "100%", 
    locale, 
    autosize: true,
    isTransparent: false,
    backgroundColor: widgetBgColor
  }), [symbol, colorTheme, locale, widgetBgColor]);

  const symbolInfoPayload = useMemo(() => ({
    symbol, 
    colorTheme, 
    locale, 
    width: "100%", 
    isTransparent: false, 
    backgroundColor: widgetBgColor
  }), [symbol, colorTheme, locale, widgetBgColor]);

  const profilePayload = useMemo(() => ({
    symbol, 
    colorTheme, 
    width: "100%", 
    height: "100%", 
    locale, 
    isTransparent: false, 
    backgroundColor: widgetBgColor
  }), [symbol, colorTheme, locale, widgetBgColor]);

  const advancedChartPayload = useMemo(() => ({
    symbol, 
    theme: colorTheme, 
    locale, 
    backgroundColor: widgetBgColor,
    toolbar_bg: widgetBgColor 
  }), [symbol, colorTheme, locale, widgetBgColor]);

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6">
       <div className={`
        relative w-full overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col transition-colors duration-300
        ${isDark 
          ? "bg-[#0a0a0a]/80 border-white/[0.06]" 
          : "bg-white border-zinc-200 shadow-zinc-200/50"
        }
      `}>
         {/* Hover Glow */}
         {isDark && (
          <>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />
          </>
        )}

        {/* --- HEADER --- */}
        <header className={`
          relative z-10 flex flex-col gap-6 p-6 border-b 
          ${isDark ? "border-white/[0.04]" : "border-zinc-100"}
        `}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div className="flex items-center gap-3">
                <div className={`
                  relative flex items-center justify-center w-10 h-10 rounded-xl border shadow-inner transition-colors
                  ${isDark ? "bg-gradient-to-b from-zinc-800 to-zinc-900 border-white/5" : "bg-white border-zinc-200 shadow-zinc-100"}
                `}>
                  <Search size={18} className={isDark ? "text-zinc-200" : "text-zinc-600"} />
                </div>
                <div>
                  <h2 className={`text-lg font-bold tracking-tight flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                    TICKER RESEARCH
                    <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)] animate-pulse" />
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Deep Dive Analysis</span>
                  </div>
                </div>
             </div>

             {/* Search */}
             <div className="flex items-center gap-2 w-full md:w-auto">
               <div className={`
                 flex items-center gap-2 px-3 py-2 rounded-lg border w-full md:w-[280px]
                 ${isDark ? "bg-black/40 border-white/10 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-900"}
               `}>
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitSymbol()}
                    placeholder="Enter ticker (e.g. TSLA)"
                    className="bg-transparent border-none outline-none text-sm font-bold w-full placeholder:text-zinc-500 uppercase"
                  />
                  {input && (
                    <button onClick={() => { setInput(""); }} className="text-zinc-500 hover:text-zinc-300">
                      <X size={14} />
                    </button>
                  )}
               </div>
               <button 
                  onClick={() => commitSymbol()}
                  className={`
                    p-2 rounded-lg border transition-all
                    ${isDark 
                      ? "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20" 
                      : "bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100"}
                  `}
                >
                  <ArrowRight size={18} />
               </button>
             </div>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-2">
             <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 py-1 mr-2">Trending:</span>
             {quick.map((t) => (
                <button 
                  key={t}
                  onClick={() => { setInput(t); commitSymbol(t); }}
                  className={`
                    text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all
                    ${symbol === normalizeSymbol(t).symbol
                       ? isDark 
                         ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" 
                         : "bg-emerald-100 border-emerald-200 text-emerald-700"
                       : isDark 
                         ? "bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:border-zinc-600" 
                         : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                    }
                  `}
                >
                  {t}
                </button>
             ))}
          </div>
          
          {hint && <div className="text-xs text-amber-500/80 font-mono mt-[-10px]">ⓘ {hint}</div>}
        </header>

        {/* --- CONTENT --- */}
        <div className={`p-6 space-y-6 relative z-10 ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}>
            
            {/* 1. Main Chart (Full Width) */}
            <div className="w-full">
               <TVEmbed 
                 endpoint="advanced-chart" 
                 payload={advancedChartPayload} 
                 theme={colorTheme} 
                 title="Advanced Chart"
                 icon={Activity}
                 minHeight={600}
               />
            </div>

            {/* 2. Middle Row: Info & Price Action */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Key Stats */}
               <TVEmbed 
                 endpoint="symbol-info" 
                 payload={symbolInfoPayload} 
                 theme={colorTheme}
                 title="Key Statistics"
                 icon={Info}
                 minHeight={200}
               />
               
               {/* Mini Chart */}
               <TVEmbed 
                 endpoint="mini-symbol-overview" 
                 payload={miniOverviewPayload} 
                 theme={colorTheme}
                 title="Price Action (12M)"
                 icon={BarChart2}
                 minHeight={200}
               />
            </div>

            {/* 3. Bottom: Company Profile */}
            <div>
               <TVEmbed 
                  endpoint="symbol-profile" 
                  payload={profilePayload} 
                  theme={colorTheme}
                  title="Company Profile"
                  icon={FileText}
                  minHeight={300}
               />
            </div>

        </div>

      </div>
    </section>
  );
}