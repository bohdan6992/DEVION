"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
// Image більше не потрібен, оскільки ми малюємо SVG кодом
import { useRouter } from "next/router";
// Переконайтеся, що шлях правильний
import { useUi } from "./UiProvider"; 

// --- ICONS ---
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform duration-300 ease-out ${open ? "rotate-180" : "rotate-0"}`}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ThemeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const LangIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>
);

// --- BRAND ICON (Custom SVG) ---
const BrandLogo = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M12 2.9L18.4 5.45V11.05C18.4 15.72 15.66 19.06 12 20.75C8.34 19.06 5.6 15.72 5.6 11.05V5.45L12 2.9Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path
      d="M8.2 8.15C8.2 6.27 9.83 4.95 12 4.95C14.17 4.95 15.8 6.27 15.8 8.15V8.55H8.2V8.15Z"
      fill="currentColor"
      opacity="0.14"
    />
    <path
      d="M8.35 8.6H15.65"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.9"
    />
    <path
      d="M9.1 10.15H14.9"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      opacity="0.82"
    />
    <path
      d="M10.2 8.6V14.65"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      opacity="0.78"
    />
    <path
      d="M13.8 8.6V14.65"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      opacity="0.78"
    />
    <path
      d="M10.2 14.8H13.8"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      opacity="0.88"
    />
    <path
      d="M12 10.2V17.35"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      opacity="0.92"
    />
    <path
      d="M8.55 17.2C9.5 15.95 10.68 15.25 12 15.25C13.32 15.25 14.5 15.95 15.45 17.2"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      opacity="0.78"
    />
  </svg>
);

type Item = { key: string; label: string; disabled?: boolean };

const getThemeDropdownAccent = (key: string, isDark: boolean) => {
  const themeKey = (key || "").toLowerCase();
  if (themeKey === "light") {
    return {
      selectedItem: isDark ? "bg-violet-500/10 text-violet-300 font-bold" : "bg-violet-100/90 text-violet-700 font-bold",
      dot: isDark ? "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.45)]" : "bg-violet-500 shadow-none",
      buttonText: isDark ? "text-violet-200" : "text-violet-700",
      buttonBorder: isDark ? "border-violet-400/20" : "border-violet-300/60",
    };
  }
  if (!isDark) {
    return {
      selectedItem: "bg-slate-100/90 text-slate-700 font-bold",
      dot: "bg-slate-500 shadow-none",
      buttonText: "text-slate-800",
      buttonBorder: "border-slate-300",
    };
  }

  switch (themeKey) {
    case "sparkle":
      return {
        selectedItem: "bg-yellow-200/10 text-yellow-200 font-bold",
        dot: "bg-yellow-200 shadow-[0_0_8px_rgba(254,240,138,0.45)]",
        buttonText: "text-yellow-200",
        buttonBorder: "border-yellow-200/20",
      };
    case "inferno":
      return {
        selectedItem: "bg-red-500/14 text-orange-100 font-bold",
        dot: "bg-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
        buttonText: "text-orange-100",
        buttonBorder: "border-orange-300/24",
      };
    case "asher":
      return {
        selectedItem: "bg-zinc-200/10 text-zinc-200 font-bold",
        dot: "bg-zinc-300 shadow-[0_0_8px_rgba(212,212,216,0.35)]",
        buttonText: "text-zinc-200",
        buttonBorder: "border-zinc-400/20",
      };
    case "rain":
      return {
        selectedItem: "bg-zinc-200/10 text-zinc-100 font-bold",
        dot: "bg-zinc-200 shadow-[0_0_10px_rgba(228,228,231,0.32)]",
        buttonText: "text-zinc-100",
        buttonBorder: "border-zinc-300/22",
      };
    case "matrix":
      return {
        selectedItem: "bg-zinc-200/10 text-zinc-200 font-bold",
        dot: "bg-zinc-300 shadow-[0_0_8px_rgba(212,212,216,0.35)]",
        buttonText: "text-zinc-200",
        buttonBorder: "border-zinc-400/20",
      };
    case "neon":
      return {
        selectedItem: "bg-fuchsia-500/10 text-fuchsia-300 font-bold",
        dot: "bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.55)]",
        buttonText: "text-fuchsia-200",
        buttonBorder: "border-fuchsia-500/20",
      };
    case "space":
      return {
        selectedItem: "bg-sky-500/10 text-sky-300 font-bold",
        dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]",
        buttonText: "text-sky-200",
        buttonBorder: "border-sky-500/20",
      };
    case "light":
      return {
        selectedItem: "bg-amber-500/10 text-amber-200 font-bold",
        dot: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.4)]",
        buttonText: "text-amber-100",
        buttonBorder: "border-amber-400/18",
      };
    default:
      return {
        selectedItem: "bg-zinc-500/10 text-zinc-200 font-bold",
        dot: "bg-zinc-300 shadow-[0_0_8px_rgba(255,255,255,0.22)]",
        buttonText: "text-zinc-100",
        buttonBorder: "border-white/12",
      };
  }
};

/* --- DROPDOWN (Deep Space Style) --- */
function Dropdown({
  value,
  onChange,
  items,
  icon,
  isDark,
  accentMode = "default",
}: {
  value: string;
  onChange: (v: string) => void;
  items: Item[];
  icon?: React.ReactNode;
  isDark: boolean;
  accentMode?: "default" | "theme";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeItem = items.find((i) => i.key === value);
  const activeAccent = accentMode === "theme" ? getThemeDropdownAccent(value, isDark) : null;

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", clickOut);
    return () => document.removeEventListener("click", clickOut);
  }, []);

  return (
    <div className="relative z-50 font-mono" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          relative flex items-center gap-2.5 h-9 px-3 rounded-lg
          border transition-all duration-300
          text-[10px] uppercase tracking-widest font-bold
          ${
            open
              ? isDark
                ? `${activeAccent?.buttonBorder ?? "border-white/20"} ${activeAccent?.buttonText ?? "text-white"} bg-white/[0.08] shadow-[0_0_15px_-5px_rgba(255,255,255,0.1)]`
                : "bg-white/85 border-slate-300 text-slate-800 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.24)]"
              : isDark
                ? `${activeAccent?.buttonBorder ?? "border-white/[0.06]"} ${activeAccent?.buttonText ?? "text-zinc-400"} bg-white/[0.02] hover:bg-white/[0.05] hover:text-zinc-200`
                : "bg-white/55 border-slate-300/70 text-slate-500 hover:bg-white/75 hover:text-slate-700"
          }
        `}
      >
        <span className="opacity-70">{icon}</span>
        <span>{activeItem?.label || value}</span>
        <span className="opacity-50 ml-1">
          <ChevronIcon open={open} />
        </span>
      </button>

      {/* Menu */}
      <div
        className={`
          absolute top-[calc(100%+6px)] left-0 w-full
          ${isDark ? "bg-[#0a0a0a]/90 border-white/[0.08]" : "bg-white/95 border-slate-300/80"}
          backdrop-blur-xl
          rounded-xl p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]
          transition-all duration-200 origin-top
          ${open ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" : "opacity-0 -translate-y-2 scale-95 pointer-events-none"}
        `}
      >
        {items.map((i) => (
          <button
            key={i.key}
            type="button"
            onClick={() => {
              onChange(i.key);
              setOpen(false);
            }}
            className={`
              w-full flex justify-between items-center px-3 py-2 rounded-lg
              text-[10px] uppercase tracking-wider font-mono transition-all
              ${
                i.key === value
                  ? isDark
                    ? accentMode === "theme"
                      ? getThemeDropdownAccent(i.key, true).selectedItem
                      : "bg-emerald-500/10 text-emerald-400 font-bold"
                    : "bg-amber-100/80 text-amber-700 font-bold"
                  : isDark
                    ? "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }
            `}
          >
            <span>{i.label}</span>
            {i.key === value && (
              <span className={`w-1.5 h-1.5 rounded-full ${accentMode === "theme" ? getThemeDropdownAccent(i.key, isDark).dot : "bg-emerald-500 shadow-[0_0_5px_#10b981]"}`} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TopBar() {
  const router = typeof window !== 'undefined' ? (window as any).next?.router || { pathname: '/' } : { pathname: '/' };
  const { theme, setTheme, lang, setLang, isDark } = useUi();
  const brandAccent = getThemeDropdownAccent(theme, isDark);

  const navAccent = (() => {
    switch ((theme || "").toLowerCase()) {
      case "sparkle":
        return {
          activeText: "text-yellow-200 drop-shadow-[0_0_8px_rgba(254,240,138,0.22)]",
          activeBg: "bg-yellow-200/10 opacity-100 border border-transparent",
          activeLine: "bg-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.45)]",
        };
      case "asher":
        return {
          activeText: "text-zinc-200 drop-shadow-[0_0_8px_rgba(212,212,216,0.18)]",
          activeBg: "bg-zinc-200/10 opacity-100 border border-transparent",
          activeLine: "bg-zinc-300 shadow-[0_0_10px_rgba(212,212,216,0.3)]",
        };
      case "matrix":
        return {
          activeText: "text-zinc-200 drop-shadow-[0_0_8px_rgba(212,212,216,0.18)]",
          activeBg: "bg-zinc-200/10 opacity-100 border border-transparent",
          activeLine: "bg-zinc-300 shadow-[0_0_10px_rgba(212,212,216,0.3)]",
        };
      case "rain":
        return {
          activeText: "text-zinc-100 drop-shadow-[0_0_8px_rgba(228,228,231,0.16)]",
          activeBg: "bg-zinc-200/10 opacity-100 border border-transparent",
          activeLine: "bg-zinc-200 shadow-[0_0_10px_rgba(228,228,231,0.28)]",
        };
      case "neon":
        return {
          activeText: "text-fuchsia-300 drop-shadow-[0_0_8px_rgba(217,70,239,0.35)]",
          activeBg: "bg-fuchsia-500/10 opacity-100 border border-transparent",
          activeLine: "bg-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.6)]",
        };
      case "space":
        return {
          activeText: "text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]",
          activeBg: "bg-sky-500/10 opacity-100 border border-transparent",
          activeLine: "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.55)]",
        };
      case "light":
        return {
          activeText: "text-violet-700",
          activeBg: "bg-violet-100/90 opacity-100 border border-violet-200/50",
          activeLine: "bg-violet-500 shadow-none",
        };
      default:
        return {
          activeText: "text-zinc-200",
          activeBg: "bg-white/[0.06] opacity-100 border border-transparent",
          activeLine: "bg-zinc-200 shadow-[0_0_10px_rgba(255,255,255,0.18)]",
        };
    }
  })();

  const nav = [
    { href: "/signals", label: "Strategies" },
    { href: "/news", label: "Market" },
    { href: "/guide", label: "Explorer" },
    { href: "/hyperliquid", label: "Hyperliquid" },
    { href: "/hyperliquid-trader", label: "HL Trader" },
  ];

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(href + "/");

  return (
    <>
      <header className={`fixed top-0 z-[100] w-full h-[72px] border-b backdrop-blur-xl ${
        isDark
          ? "border-white/[0.06] bg-[#030303]/80"
          : "border-slate-300/70 bg-[rgba(249,251,255,0.82)]"
      }`}>
        {/* Top Ambient Line */}
        <div className={`absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent to-transparent ${
          isDark ? "via-white/[0.1]" : "via-slate-300/70"
        }`} />

        <div className="relative w-full max-w-[1600px] h-full mx-auto px-6 lg:px-8 flex items-center justify-between">
          
          {/* 1. BRAND */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className={`opacity-95 group-hover:opacity-100 transition-opacity ${
              isDark ? brandAccent.buttonText : "text-slate-700"
            }`}>
              <BrandLogo />
            </div>
          </Link>

          {/* 2. NAVIGATION (CENTER) */}
          <nav className="hidden lg:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    relative px-5 py-2 rounded-lg transition-all duration-300
                    flex items-center justify-center
                    group overflow-hidden
                  `}
                >
                  {/* Background State */}
                  <div 
                    className={`
                      absolute inset-0 transition-opacity duration-300 rounded-lg
                      ${active 
                        ? isDark
                          ? navAccent.activeBg
                          : "bg-white/75 opacity-100 border border-slate-300/70"
                        : isDark
                          ? "bg-white/[0.0] opacity-0 group-hover:bg-white/[0.02] group-hover:opacity-100"
                          : "bg-white/[0.0] opacity-0 group-hover:bg-white/60 group-hover:opacity-100"
                      }
                    `} 
                  />
                  
                  {/* Active Glow Indicator (Bottom) */}
                  {active && (
                     <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] rounded-t-full ${isDark ? navAccent.activeLine : "bg-amber-500 shadow-none"}`} />
                  )}

                  {/* Text Label */}
                  <span 
                    className={`
                      relative z-10 text-xs font-mono uppercase tracking-[0.15em] font-bold
                      ${active 
                        ? isDark
                          ? navAccent.activeText
                          : "text-amber-700"
                        : isDark
                          ? "text-zinc-500 group-hover:text-zinc-200"
                          : "text-slate-500 group-hover:text-slate-700"
                      }
                      transition-colors duration-300
                    `}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* 3. ACTIONS (RIGHT) */}
          <div className="flex items-center gap-4">
            <Dropdown
              value={theme}
              onChange={(v: any) => setTheme(v)}
              items={[
                { key: "light", label: "Light" },
                { key: "sparkle", label: "SPARKLE" },
                { key: "inferno", label: "INFERNO" },
                { key: "asher", label: "ASHER" },
                { key: "rain", label: "RAIN" },
                { key: "matrix", label: "Matrix" },
                { key: "neon", label: "Neon" },
                { key: "dark", label: "Dark" },
                { key: "space", label: "Space" },
              ]}
              isDark={isDark}
              accentMode="theme"
              icon={<ThemeIcon />}
            />
            
            <div className={`w-[1px] h-5 ${isDark ? "bg-white/[0.08]" : "bg-slate-300/80"}`} />
            
            <Dropdown
              value={lang}
              onChange={(v: any) => setLang(v)}
              items={[
                { key: "UA", label: "UA" },
                { key: "EN", label: "EN" },
              ]}
              isDark={isDark}
              icon={<LangIcon />}
            />
          </div>
        </div>
      </header>
      
      <div className="relative w-full h-[72px]" />
    </>
  );
}
