// hooks/useAutoScale.ts
import { useEffect } from "react";

type Options = {
  baseWidth?: number;        // базова ширина полотна (за замовч. 1920)
  targetId?: string;         // id елемента, що масштабується (#app-scale)
  headerSelector?: string;   // селектор fixed-топбара (щоб заміряти висоту)
  gapVar?: string;           // CSS-змінна з «повітрям» під баром (px)
  offsetVar?: string;        // CSS-змінна, куди покласти готовий відступ (px)
};

export function useAutoScale(opts: Options | number = {}) {
  // збережена підтримка старого виклику: useAutoScale(1920, "app-scale")
  const baseWidth =
    typeof opts === "number" ? opts : opts.baseWidth ?? 1920;
  const targetId =
    typeof opts === "number" ? "app-scale" : opts.targetId ?? "app-scale";
  const headerSelector =
    typeof opts === "number" ? ".tt-topbar" : opts.headerSelector ?? ".tt-topbar";
  const gapVar =
    typeof opts === "number" ? "--topbar-gap" : opts.gapVar ?? "--topbar-gap";
  const offsetVar =
    typeof opts === "number" ? "--topbar-offset" : opts.offsetVar ?? "--topbar-offset";

  useEffect(() => {
    const root = document.documentElement;
    const rootStyle = root.style;
    const el = document.getElementById(targetId);
    const header = document.querySelector<HTMLElement>(headerSelector);
    if (!el || !header) return;

    // допоміжна: читаємо px зі змінної (наприклад, "26px" -> 26)
    const readPxVar = (name: string) => {
      const v = getComputedStyle(root).getPropertyValue(name).trim();
      const n = parseFloat(v || "0");
      return Number.isFinite(n) ? n : 0;
    };

    // застосувати масштаб + зсув
    const applyScale = () => {
      const vw = window.innerWidth;
      const scale = Math.min(1, vw / baseWidth); // не роздуваємо > 1
      const offsetX = Math.max(0, (vw - baseWidth * scale) / 2);

      // експортуємо змінні для CSS
      rootStyle.setProperty("--base-width", String(baseWidth));
      rootStyle.setProperty("--scale", String(scale));
      rootStyle.setProperty("--offsetX", `${offsetX}px`);

      // власне трансформація полотна
      el.style.transformOrigin = "top left";
      el.style.width = `${baseWidth}px`;
      el.style.transform = `translateX(${offsetX}px) scale(${scale})`;
    };

    // виставляємо готовий відступ під топбар (px)
    const applyTopbarOffset = () => {
      // фактична видима висота fixed-топбара у css-пікселях
      const hdrH = Math.ceil(header.getBoundingClientRect().height);
      const gap = readPxVar(gapVar); // додаткове «повітря» з CSS
      rootStyle.setProperty(offsetVar, `${hdrH + gap}px`);
    };

    const applyAll = () => {
      applyScale();
      // важливо: вимір робимо після виставлення scale,
      // але header поза масштабом, тож цього достатньо
      applyTopbarOffset();
    };

    let raf: number | null = null;
    const schedule = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        applyAll();
      });
    };

    // первинний запуск
    applyAll();

    // реакція на зміну розміру/орієнтації/візуального viewport
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const vv: any = (window as any).visualViewport;
    if (vv?.addEventListener) {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
    }

    // якщо контент топбара змінює його висоту — підхопимо
    let ro: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(schedule);
      ro.observe(header);
    }

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (vv?.removeEventListener) {
        vv.removeEventListener("resize", schedule);
        vv.removeEventListener("scroll", schedule);
      }
      if (ro) ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [baseWidth, targetId, headerSelector, gapVar, offsetVar]);
}
