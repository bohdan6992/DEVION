"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { 
  IconSonar, 
  IconScanner, 
  IconScope, 
  IconSwagger, 
  IconSpectr, 
  IconSwift 
} from "./AppIcons"; 

type AccentColor = "green" | "violet" | "blue" | "orange" | "rose" | "amber" | "cyan" | "indigo";

type DockItem = {
  key: string;
  href: string;
  label: string;
  Icon: React.ComponentType<any>;
  accent: AccentColor;
};

const ITEMS: DockItem[] = [
  { key: "sonar", href: "/sonar", label: "Sonar", Icon: IconSonar, accent: "green" },
  { key: "scanner", href: "/scanner", label: "Scanner", Icon: IconScanner, accent: "cyan" },
  { key: "scope", href: "/scope", label: "Scope", Icon: IconScope, accent: "indigo" },
  // Пряме посилання на локальний Swagger
  { key: "swagger", href: "http://localhost:5197/swagger", label: "Swagger", Icon: IconSwagger, accent: "amber" },
  { key: "spectr", href: "/tape", label: "Spectr", Icon: IconSpectr, accent: "violet" },
  { key: "swift", href: "/sifter", label: "Swift", Icon: IconSwift, accent: "rose" },
];

function accentClasses(accent: AccentColor, active: boolean) {
  const map: Record<AccentColor, { ring: string; glow: string; icon: string; dot: string; text: string }> = {
    green: { ring: "ring-emerald-400/40", glow: "hover:shadow-[0_0_30px_rgba(52,211,153,0.2)]", icon: active ? "text-emerald-300" : "text-emerald-300/60", dot: "bg-emerald-400", text: "text-emerald-400" },
    violet: { ring: "ring-violet-400/40", glow: "hover:shadow-[0_0_30px_rgba(167,139,250,0.2)]", icon: active ? "text-violet-300" : "text-violet-300/60", dot: "bg-violet-400", text: "text-violet-400" },
    blue: { ring: "ring-sky-400/40", glow: "hover:shadow-[0_0_30px_rgba(56,189,248,0.2)]", icon: active ? "text-sky-300" : "text-sky-300/60", dot: "bg-sky-400", text: "text-sky-400" },
    orange: { ring: "ring-orange-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,146,60,0.2)]", icon: active ? "text-orange-300" : "text-orange-300/60", dot: "bg-orange-400", text: "text-orange-400" },
    rose: { ring: "ring-rose-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,113,133,0.2)]", icon: active ? "text-rose-300" : "text-rose-300/60", dot: "bg-rose-400", text: "text-rose-400" },
    amber: { ring: "ring-amber-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,191,36,0.2)]", icon: active ? "text-amber-300" : "text-amber-300/60", dot: "bg-amber-400", text: "text-amber-400" },
    cyan: { ring: "ring-cyan-400/40", glow: "hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]", icon: active ? "text-cyan-300" : "text-cyan-300/60", dot: "bg-cyan-400", text: "text-cyan-400" },
    indigo: { ring: "ring-indigo-400/40", glow: "hover:shadow-[0_0_30px_rgba(129,140,248,0.2)]", icon: active ? "text-indigo-300" : "text-indigo-300/60", dot: "bg-indigo-400", text: "text-indigo-400" },
  };
  return map[accent];
}

export function AppDock() {
  const pathname = usePathname() ?? "";

  return (
    <div className="p-4 w-fit mx-auto">
      <div className="grid grid-cols-3 gap-6">
        {ITEMS.map((it) => {
          const isExternal = it.href.startsWith("http");
          const active = !isExternal && (pathname === it.href || pathname.startsWith(it.href + "/"));
          const a = accentClasses(it.accent, active);
          const Icon = it.Icon;

          return (
            <Link
              key={it.key}
              href={it.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="group relative flex flex-col items-center focus:outline-none"
            >
              {/* Tooltip */}
              <span className={clsx(
                "absolute -top-8 scale-90 opacity-0 transition-all duration-200 ease-out",
                "group-hover:opacity-100 group-hover:scale-100 group-hover:-translate-y-0.5",
                "px-2.5 py-0.5 rounded-full bg-zinc-900/90 border border-white/10 backdrop-blur-sm",
                "text-[9px] font-bold tracking-[0.15em] uppercase pointer-events-none z-50 shadow-2xl",
                a.text
              )}>
                {it.label}
              </span>

              {/* Icon Square */}
              <div
                className={clsx(
                  "h-[76px] w-[76px] rounded-[22px]",
                  "bg-white/[0.03] border border-white/10",
                  "flex items-center justify-center relative",
                  "transition-all duration-300 ease-out",
                  "hover:bg-white/[0.08] hover:border-white/20 hover:scale-[1.03]",
                  a.glow,
                  active && clsx("ring-2", a.ring, "bg-white/[0.1] border-white/30")
                )}
              >
                <Icon 
                  className={clsx("h-[42px] w-[42px] transition-all duration-300", a.icon)} 
                  glow={active} 
                />
              </div>

              {/* Active Dot */}
              {active && (
                <div className={clsx(
                  "absolute -bottom-2.5 h-1 w-1.5 rounded-full shadow-[0_0_10px_currentColor]",
                  a.dot
                )} />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}