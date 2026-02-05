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
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer Shape (Tech Box) */}
    <path 
      d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z" 
      className="fill-white/[0.1]" 
      stroke="currentColor" 
      strokeWidth="1.5"
    />
    {/* Abstract Bolt / Signal Path */}
    <path 
      d="M13 7L11.8 10.6H15L11 17L12.2 13.4H9L13 7Z" 
      className="fill-emerald-500"
      stroke="none"
    />
  </svg>
);

type Item = { key: string; label: string; disabled?: boolean };

/* --- DROPDOWN (Deep Space Style) --- */
function Dropdown({
  value,
  onChange,
  items,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Item[];
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeItem = items.find((i) => i.key === value);

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
              ? "bg-white/[0.08] border-white/20 text-white shadow-[0_0_15px_-5px_rgba(255,255,255,0.1)]"
              : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
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
          absolute top-[calc(100%+6px)] right-0 min-w-[140px]
          bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/[0.08]
          rounded-xl p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]
          transition-all duration-200 origin-top-right
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
                  ? "bg-emerald-500/10 text-emerald-400 font-bold"
                  : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
              }
            `}
          >
            <span>{i.label}</span>
            {i.key === value && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TopBar() {
  const router = typeof window !== 'undefined' ? (window as any).next?.router || { pathname: '/' } : { pathname: '/' };
  const { theme, setTheme, lang, setLang } = useUi();

  const nav = [
    { href: "/signals", label: "Strategies" },
    { href: "/news", label: "Market" },
    { href: "/guide", label: "Explorer" },
    { href: "/sifter", label: "Sifter" }, // ⬅️ ДОДАНО
    { href: "/tape", label: "Tape" },
    { href: "/sonar", label: "Sonar" },
  ];

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(href + "/");

  return (
    <>
      <header className="fixed top-0 z-[100] w-full h-[72px] border-b border-white/[0.06] bg-[#030303]/80 backdrop-blur-xl">
        {/* Top Ambient Line */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

        <div className="relative w-full max-w-[1600px] h-full mx-auto px-6 lg:px-8 flex items-center justify-between">
          
          {/* 1. BRAND */}
          <Link href="/" className="flex items-center gap-3 group">
            
            {/* ICON CONTAINER */}
            <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.01] border border-white/[0.08] transition-all duration-300 group-hover:border-emerald-500/30 group-hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]">
              <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity text-white">
                 <BrandLogo />
              </div>
              {/* Inner Glow */}
              <div className="absolute inset-0 rounded-xl bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
            </div>
            
            {/* TEXT */}
            <div className="flex flex-col justify-center h-10">
              <span className="font-sans font-bold text-2xl text-white leading-none tracking-tight group-hover:text-emerald-50 transition-colors">
                Devi<span className="text-emerald-500">ON</span>
              </span>
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
                        ? "bg-white/[0.06] opacity-100 border border-white/[0.04]" 
                        : "bg-white/[0.0] opacity-0 group-hover:bg-white/[0.02] group-hover:opacity-100"
                      }
                    `} 
                  />
                  
                  {/* Active Glow Indicator (Bottom) */}
                  {active && (
                     <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-emerald-500 shadow-[0_0_10px_#10b981] rounded-t-full" />
                  )}

                  {/* Text Label */}
                  <span 
                    className={`
                      relative z-10 text-xs font-mono uppercase tracking-[0.15em] font-bold
                      ${active 
                        ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                        : "text-zinc-500 group-hover:text-zinc-200"
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
                { key: "dark", label: "Dark" },
                { key: "light", label: "Light" },
                { key: "neon", label: "Neon" },
              ]}
              icon={<ThemeIcon />}
            />
            
            <div className="w-[1px] h-5 bg-white/[0.08]" />
            
            <Dropdown
              value={lang}
              onChange={(v: any) => setLang(v)}
              items={[
                { key: "UA", label: "UA" },
                { key: "EN", label: "EN" },
              ]}
              icon={<LangIcon />}
            />
          </div>
        </div>
      </header>
      
      <div className="relative w-full h-[72px]" />
    </>
  );
}
