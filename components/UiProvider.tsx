"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";

export type ThemeKey =
  | "light" | "dark" | "neon" | "pastel"
  | "solaris" | "cyberpunk" | "oceanic" | "sakura" | "matrix" | "asher" | "inferno"
  | "aurora" | "desert" | "midnight" | "forest" | "candy" | "monochrome";

export type LangKey = "UA" | "EN" | "UK";

type UIContext = {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
  lang: LangKey;
  setLang: (l: LangKey) => void;
  isDark: boolean; // <--- ДОДАНО: Єдине джерело правди
  mounted: boolean;
};

const Ctx = createContext<UIContext | null>(null);

export function useUi() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}

// Список світлих тем (всі інші будуть вважатися темними)
const LIGHT_THEMES = new Set<ThemeKey>(["light", "pastel"]);

export default function UiProvider({
  children,
  initialTheme = "light",
  initialLang = "UA",
}: {
  children: React.ReactNode;
  initialTheme?: ThemeKey;
  initialLang?: LangKey;
}) {
  const [theme, setTheme] = useState<ThemeKey>(initialTheme);
  const [lang, setLang] = useState<LangKey>(initialLang);
  const [mounted, setMounted] = useState(false);

  // Вираховуємо isDark прямо тут
  const isDark = useMemo(() => !LIGHT_THEMES.has(theme), [theme]);

  useEffect(() => {
    setMounted(true);
    const t = Cookies.get("tt-theme") as ThemeKey | undefined;
    if (t && t !== theme) setTheme(t);
    const l = Cookies.get("tt-lang") as LangKey | undefined;
    if (l && l !== lang) setLang(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    // Використовуємо те саме значення isDark
    root.classList.toggle("dark", isDark);
    Cookies.set("tt-theme", theme, { expires: 365, sameSite: "lax" });
  }, [theme, isDark, mounted]);

  useEffect(() => {
    if (!mounted) return;
    Cookies.set("tt-lang", lang, { expires: 365, sameSite: "lax" });
  }, [lang, mounted]);

  const value = useMemo(
    () => ({ 
      theme, 
      setTheme, 
      lang, 
      setLang, 
      isDark, // <--- Передаємо в контекст
      mounted 
    }),
    [theme, lang, isDark, mounted]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}