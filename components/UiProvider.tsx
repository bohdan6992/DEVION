"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";

export type ThemeKey =
  | "light" | "dark" | "neon" | "pastel"
  | "solaris" | "cyberpunk" | "oceanic" | "sakura" | "matrix" | "asher" | "inferno"
  | "sparkle" | "desert" | "midnight" | "forest" | "candy" | "monochrome" | "space";

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

function normalizeThemeKey(theme?: string | null): ThemeKey {
  const value = (theme || "").toLowerCase().trim();
  if (value === "sparkle" || value === "aurora") return "sparkle";
  if (
    value === "light" || value === "dark" || value === "neon" || value === "pastel" ||
    value === "solaris" || value === "cyberpunk" || value === "oceanic" || value === "sakura" ||
    value === "matrix" || value === "asher" || value === "inferno" || value === "desert" ||
    value === "midnight" || value === "forest" || value === "candy" || value === "monochrome" ||
    value === "space"
  ) {
    return value as ThemeKey;
  }
  return "light";
}

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
    const t = normalizeThemeKey(Cookies.get("tt-theme"));
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
