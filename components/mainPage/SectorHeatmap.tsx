"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { Grid3X3, Filter, SlidersHorizontal, RefreshCw, ChevronDown } from "lucide-react";

/* ===================== LOGIC: THEME ===================== */
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

/* ===================== TYPES ===================== */
type DataSource = "SPX500" | "NASDAQ100" | "DOWJONES" | "RUSSELL2000" | "WORLD";
type Grouping = "sector" | "country" | "no_group";
type SizeBy = "market_cap_basic" | "number_of_employees" | "price_earnings_ttm" | "dividend_yield_recent";
type ColorBy = "change" | "Perf.W" | "Perf.1M" | "Perf.3M" | "Perf.6M" | "Perf.YTD" | "relative_volume_10d_calc" | "Volatility.D" | "gap";

type Props = {
  height?: number;
  locale?: string;
  defaultDataSource?: DataSource;
  defaultGrouping?: Grouping;
  defaultSizeBy?: SizeBy;
  defaultColorBy?: ColorBy;
  tooltip?: boolean;
};

/* ===================== UI: Terminal Badge & Select ===================== */

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

function Select<T extends string>({ label, value, onChange, options, isDark }: { label: string; value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[]; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold uppercase transition-all
          ${isDark 
            ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-zinc-300" 
            : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700"
          }
          ${open ? "border-cyan-500/50 ring-1 ring-cyan-500/20" : ""}
        `}
      >
        <span className="text-zinc-500 font-mono tracking-widest text-[9px]">{label}:</span>
        <span>{selectedLabel}</span>
        <ChevronDown size={10} className={`opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`
          absolute top-[calc(100%+4px)] left-0 min-w-[140px] z-50 rounded-lg border p-1 shadow-2xl backdrop-blur-xl max-h-[240px] overflow-y-auto
          ${isDark ? "bg-[#0a0a0a]/95 border-white/10" : "bg-white/95 border-zinc-200"}
        `}>
          {options.map((o) => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`
                px-3 py-2 rounded-md text-[11px] font-medium cursor-pointer transition-colors
                ${o.value === value 
                  ? isDark ? "bg-cyan-500/20 text-cyan-400" : "bg-cyan-100 text-cyan-700"
                  : isDark ? "text-zinc-400 hover:bg-white/5 hover:text-white" : "text-zinc-600 hover:bg-zinc-100"
                }
              `}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */

export default function SectorHeatmap({
  height = 600,
  locale = "uk",
  defaultDataSource = "SPX500",
  defaultGrouping = "sector",
  defaultSizeBy = "market_cap_basic",
  defaultColorBy = "change",
  tooltip = true,
}: Props) {
  const { theme } = useUi();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [dataSource, setDataSource] = useState<DataSource>(defaultDataSource);
  const [grouping, setGrouping] = useState<Grouping>(defaultGrouping);
  const [sizeBy, setSizeBy] = useState<SizeBy>(defaultSizeBy);
  const [colorBy, setColorBy] = useState<ColorBy>(defaultColorBy);
  const [isDark, setIsDark] = useState(true);

  // Theme Sync
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

  // Widget Logic
  const payload = useMemo(() => ({
    exchanges: [],
    dataSource,
    grouping,
    blockSize: sizeBy,
    blockColor: colorBy,
    locale,
    symbolUrl: "",
    colorTheme: isDark ? "dark" : "light",
    hasTopBar: false,
    isDataSetEnabled: false,
    isZoomEnabled: true,
    hasSymbolTooltip: Boolean(tooltip),
    width: "100%",
    height: "100%",
  }), [dataSource, grouping, sizeBy, colorBy, locale, isDark, tooltip]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    root.appendChild(inner);

    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    s.type = "text/javascript";
    s.async = true;
    s.innerHTML = JSON.stringify(payload);
    root.appendChild(s);

    return () => { if (root) root.innerHTML = ""; };
  }, [payload]);

  // Options Data
  const DS = [
    { value: "SPX500", label: "S&P 500" },
    { value: "NASDAQ100", label: "Nasdaq 100" },
    { value: "DOWJONES", label: "Dow Jones" },
    { value: "RUSSELL2000", label: "Russell 2000" },
    { value: "WORLD", label: "Global Markets" },
  ] as const;

  const GROUPS = [
    { value: "sector", label: "Sectors" },
    { value: "country", label: "Countries" },
    { value: "no_group", label: "None" },
  ] as const;

  const SIZE = [
    { value: "market_cap_basic", label: "Market Cap" },
    { value: "number_of_employees", label: "Employees" },
    { value: "price_earnings_ttm", label: "P/E Ratio" },
    { value: "dividend_yield_recent", label: "Div Yield" },
  ] as const;

  const COLORS = [
    { value: "change", label: "Change 1D" },
    { value: "Perf.W", label: "1 Week" },
    { value: "Perf.1M", label: "1 Month" },
    { value: "Perf.3M", label: "3 Months" },
    { value: "Perf.6M", label: "6 Months" },
    { value: "Perf.YTD", label: "YTD" },
    { value: "relative_volume_10d_calc", label: "Rel Volume" },
    { value: "Volatility.D", label: "Volatility" },
  ] as const;

  return (
    <section className="w-full max-w-[1400px] mx-auto mb-6" style={{ height }}>
      {/* Deep Space Glass Container */}
      <div className={`
        relative w-full h-full overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col group transition-colors duration-300
        ${isDark 
          ? "bg-[#0a0a0a]/80 border-white/[0.06]" 
          : "bg-white border-zinc-200 shadow-zinc-200/50"
        }
      `}>
        
        {/* Hover Gradient (Dark Mode) */}
        {isDark && (
          <>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />
          </>
        )}

        {/* --- HEADER --- */}
        <header className={`
          relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-6 border-b 
          ${isDark 
            ? "border-white/[0.04] bg-gradient-to-r from-white/[0.02] to-transparent" 
            : "border-zinc-100 bg-zinc-50/50"
          }
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              relative flex items-center justify-center w-10 h-10 rounded-xl border shadow-inner transition-colors
              ${isDark ? "bg-gradient-to-b from-zinc-800 to-zinc-900 border-white/5" : "bg-white border-zinc-200 shadow-zinc-100"}
            `}>
              <Grid3X3 size={18} className={isDark ? "text-zinc-200" : "text-zinc-600"} />
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                MARKET HEATMAP
                <span className="flex h-1.5 w-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)] animate-pulse" />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Cross-Sector Analysis</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
             <Select label="INDEX" value={dataSource} onChange={setDataSource as any} options={DS} isDark={isDark} />
             
             <div className={`w-px h-6 mx-2 ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
             
             <div className="flex items-center gap-2">
                <Select label="GROUP" value={grouping} onChange={setGrouping as any} options={GROUPS} isDark={isDark} />
                <Select label="SIZE" value={sizeBy} onChange={setSizeBy as any} options={SIZE} isDark={isDark} />
                <Select label="COLOR" value={colorBy} onChange={setColorBy as any} options={COLORS} isDark={isDark} />
             </div>

             <button
               onClick={() => setColorBy((c) => c)} // Force refresh
               className={`
                 p-2 rounded-lg border transition-all ml-2
                 ${isDark 
                   ? "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10" 
                   : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
                 }
               `}
               title="Refresh Data"
             >
               <RefreshCw size={14} />
             </button>
          </div>
        </header>

        {/* --- WIDGET CONTENT --- */}
        <div className={`relative flex-1 min-h-0 ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}>
           <div 
             className="tradingview-widget-container relative z-10 h-full w-full" 
             ref={containerRef} 
           />
        </div>

      </div>
    </section>
  );
}