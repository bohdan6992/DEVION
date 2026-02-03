"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { 
  IconCode, 
  IconSecurity, 
  IconNodes, 
  IconEnergy, 
  IconChart, 
  IconLayers, 
  IconSettings, 
  IconCloud 
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
  { key: "code", href: "/code", label: "Terminal", Icon: IconCode, accent: "green" },
  { key: "security", href: "/security", label: "Security", Icon: IconSecurity, accent: "blue" },
  { key: "nodes", href: "/nodes", label: "Network", Icon: IconNodes, accent: "violet" },
  { key: "energy", href: "/energy", label: "Power", Icon: IconEnergy, accent: "orange" },
  { key: "chart", href: "/chart", label: "Analytics", Icon: IconChart, accent: "rose" },
  { key: "layers", href: "/layers", label: "Database", Icon: IconLayers, accent: "amber" },
  { key: "settings", href: "/settings", label: "Settings", Icon: IconSettings, accent: "cyan" },
  { key: "cloud", href: "/cloud", label: "Cloud", Icon: IconCloud, accent: "indigo" },
];

function accentClasses(accent: AccentColor, active: boolean) {
  const map: Record<AccentColor, { ring: string; glow: string; icon: string; dot: string }> = {
    green: { ring: "ring-emerald-400/40", glow: "hover:shadow-[0_0_30px_rgba(52,211,153,0.3)]", icon: active ? "text-emerald-300" : "text-emerald-300/80", dot: "bg-emerald-400" },
    violet: { ring: "ring-violet-400/40", glow: "hover:shadow-[0_0_30px_rgba(167,139,250,0.3)]", icon: active ? "text-violet-300" : "text-violet-300/80", dot: "bg-violet-400" },
    blue: { ring: "ring-sky-400/40", glow: "hover:shadow-[0_0_30px_rgba(56,189,248,0.3)]", icon: active ? "text-sky-300" : "text-sky-300/80", dot: "bg-sky-400" },
    orange: { ring: "ring-orange-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,146,60,0.3)]", icon: active ? "text-orange-300" : "text-orange-300/80", dot: "bg-orange-400" },
    rose: { ring: "ring-rose-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,113,133,0.3)]", icon: active ? "text-rose-300" : "text-rose-300/80", dot: "bg-rose-400" },
    amber: { ring: "ring-amber-400/40", glow: "hover:shadow-[0_0_30px_rgba(251,191,36,0.3)]", icon: active ? "text-amber-300" : "text-amber-300/80", dot: "bg-amber-400" },
    cyan: { ring: "ring-cyan-400/40", glow: "hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]", icon: active ? "text-cyan-300" : "text-cyan-300/80", dot: "bg-cyan-400" },
    indigo: { ring: "ring-indigo-400/40", glow: "hover:shadow-[0_0_30px_rgba(129,140,248,0.3)]", icon: active ? "text-indigo-300" : "text-indigo-300/80", dot: "bg-indigo-400" },
  };
  return map[accent];
}

export function AppDock() {
  const pathname = usePathname() ?? "";

  return (
    // Збільшили внутрішній відступ (p-4) та заокруглення
    <div className="p-5 bg-black/40 backdrop-blur-3xl rounded-[32px] border border-white/10 w-fit mx-auto shadow-2xl">
      {/* gap-4 створює такий самий відступ між рядами, як і між іконками */}
      <div className="grid grid-cols-4 gap-4">
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const a = accentClasses(it.accent, active);
          const Icon = it.Icon;

          return (
            <Link
              key={it.key}
              href={it.href}
              className="group relative focus:outline-none"
            >
              <div
                className={clsx(
                  "h-[72px] w-[72px] rounded-[20px]", // Значно збільшено розмір кнопки
                  "bg-white/[0.03] border border-white/10",
                  "flex items-center justify-center",
                  "transition-all duration-300 ease-out",
                  "hover:bg-white/[0.08] hover:border-white/20 hover:scale-[1.04]",
                  a.glow,
                  active && clsx("ring-2", a.ring, "bg-white/[0.12] border-white/40")
                )}
              >
                {/* Іконка тепер майже на всю кнопку (54px) */}
                <Icon 
                  className={clsx("h-[54px] w-[54px] transition-colors duration-300", a.icon)} 
                  glow={active} 
                />
              </div>

              {/* Активний індикатор */}
              {active && (
                <div className={clsx(
                  "absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-5 rounded-full",
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