// pages/_app.tsx
import type { AppProps, AppContext } from "next/app";
import App from "next/app";
import Script from "next/script";
import Head from "next/head";
import { useEffect } from "react";

// Порядок імпортів стилів важливий
import "@/styles/themes.css";

import "@/styles/layout.css";
import "@/styles/globals.css";

// Масштабування полотна
import { useAutoScale } from "@/hooks/useAutoScale";

// UI / TopBar
import UiProvider from "@/components/UiProvider";
import TopBarMaybe from "@/components/TopBar";
const SafeTopBar: React.FC = (TopBarMaybe as any) || (() => null);

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
  // Масштабуємо “полотно” і тримаємо змінні :root в синхроні
  useAutoScale({
    baseWidth: 1920,
    targetId: "app-scale",
    headerSelector: ".tt-topbar",
  });

  // Увімкнути zoom-mode для ширинних оверрайдів
  useEffect(() => {
    document.body.classList.add("zoom-mode");
    return () => document.body.classList.remove("zoom-mode");
  }, []);

  // Синхрон класу .dark з data-theme
  useEffect(() => {
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
  }, [initialTheme]);

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

      {/* TradingView */}
      <Script
        id="tv-js"
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />

      <UiProvider initialTheme={initialTheme} initialLang={initialLang}>
        {/* fixed topbar — ВАЖЛИВО: не всередині #app-scale */}
        <SafeTopBar />

        {/* ✅ Прокладка, що гарантує відступ під fixed-топбаром */}
        <div id="tt-offset" aria-hidden="true" />

        {/* Масштабоване «полотно» */}
        <div id="app-scale">
          <Component {...pageProps} />
        </div>
      </UiProvider>

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
