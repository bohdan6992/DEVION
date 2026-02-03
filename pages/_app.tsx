// pages/_app.tsx
import type { AppProps, AppContext } from "next/app";
import App from "next/app";
import Script from "next/script";
import Head from "next/head";
import React, { useEffect } from "react";

import "@/styles/themes.css";
import "@/styles/layout.css";
import "@/styles/globals.css";

import { useAutoScale } from "@/hooks/useAutoScale";
import UiProvider from "@/components/UiProvider";
import TopBarMaybe from "@/components/TopBar";

// 🔽 ДОДАНО: Sifter
import { SifterProvider } from "@/components/sifter/SifterProvider";
import { SifterDock } from "@/components/sifter/SifterDock";

// краще так, без дивних типів
const SafeTopBar = (TopBarMaybe as any) ?? (() => null);

type ThemeKey =
  | "light" | "dark" | "neon" | "pastel"
  | "solaris" | "cyberpunk" | "oceanic" | "sakura" | "matrix" | "asher" | "inferno"
  | "aurora" | "desert" | "midnight" | "forest" | "candy" | "monochrome";
type LangKey = "UA" | "EN" | "UK";

type MyAppProps = AppProps & {
  initialTheme?: ThemeKey;
  initialLang?: LangKey;
};

export default function MyApp({
  Component,
  pageProps,
  initialTheme = "light",
  initialLang = "UA",
}: MyAppProps) {
  // ✅ ключ: перший клієнтський рендер має не відрізнятись від SSR
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // ці хуки хай працюють тільки на клієнті, після mount
  useAutoScale({
    baseWidth: 1920,
    targetId: "app-scale",
    headerSelector: ".tt-topbar",
  });

  useEffect(() => {
    if (!mounted) return;
    document.body.classList.add("zoom-mode");
    return () => document.body.classList.remove("zoom-mode");
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const darkThemes = new Set([
      "dark","neon","cyberpunk","solaris","sakura","oceanic",
      "matrix","asher","inferno","aurora","desert","midnight",
      "forest","candy","monochrome",
    ]);
    const apply = () => {
      const t = (root.getAttribute("data-theme") || String(initialTheme)) as ThemeKey;
      root.classList.toggle("dark", darkThemes.has(t));
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [mounted, initialTheme]);

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="dark light" />
      </Head>

      {/* Ініціалізація теми ДО гідрації */}
      <Script id="tt-theme-init" strategy="beforeInteractive">{`
        (function(){
          try{
            var m = document.cookie.match(/(?:^|; )tt-theme=([^;]+)/);
            var cookieTheme = m ? decodeURIComponent(m[1]) : "";
            var lsTheme = ""; try { lsTheme = localStorage.getItem("tt-theme") || ""; } catch {}
            var theme = cookieTheme || lsTheme || ${JSON.stringify(initialTheme)};
            var darkSet = new Set([
              "dark","neon","cyberpunk","solaris","sakura","oceanic",
              "matrix","asher","inferno","aurora","desert","midnight",
              "forest","candy","monochrome"
            ]);
            var root = document.documentElement;
            if(!theme){
              var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
              theme = prefersDark ? "dark" : "light";
            }
            root.setAttribute("data-theme", theme);
            root.classList.toggle("dark", darkSet.has(theme));
          }catch(e){}
        })();
      `}</Script>

      <Script
        id="tv-js"
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />

      {/* ✅ оце прибирає hydration mismatch */}
      {!mounted ? null : (
        <UiProvider initialTheme={initialTheme} initialLang={initialLang}>
          {/* 🔽 Sifter живе всередині UiProvider, щоб мати той самий контекст теми */}
          <SifterProvider>
            <SafeTopBar />
            <div id="tt-offset" aria-hidden="true" />
            <div id="app-scale">
              <Component {...pageProps} />
            </div>

            {/* 🔽 Docked overlay, доступний на всіх сторінках */}
            <SifterDock />
          </SifterProvider>
        </UiProvider>
      )}
    </>
  );
}

// SSR: дефолтні тема/мова з cookie
import { parse as parseCookie } from "cookie";
MyApp.getInitialProps = async (appCtx: AppContext) => {
  const appProps = await App.getInitialProps(appCtx);
  const cookieStr = appCtx.ctx.req?.headers?.cookie ?? "";
  const parsed = cookieStr ? parseCookie(cookieStr) : {};
  const initialTheme = (parsed["tt-theme"] as ThemeKey) || "light";
  const initialLang  = (parsed["tt-lang"]  as LangKey)  || "UA";
  return { ...appProps, initialTheme, initialLang };
};
