"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";
import type { ThemeKey, LangKey } from "@/components/UiProvider";

/* ─── vertical scroll helpers (body is scroll container) ─── */
const getScrollY  = () => document.body.scrollTop  || document.documentElement.scrollTop  || window.scrollY  || 0;
const getScrollX  = () => document.body.scrollLeft || document.documentElement.scrollLeft || window.scrollX || 0;
const getScrollH  = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
const getScrollW  = () => Math.max(document.body.scrollWidth,  document.documentElement.scrollWidth);
const getClientH  = () => window.innerHeight || document.body.clientHeight;
const getClientW  = () => window.innerWidth  || document.body.clientWidth;

const doScrollTo = (top: number, smooth = true) => {
  const t = Math.max(0, top);
  const o: ScrollToOptions = { top: t, behavior: smooth ? "smooth" : "auto" };
  try { document.body.scrollTo(o); }            catch {}
  try { document.documentElement.scrollTo(o); } catch {}
  try { window.scrollTo(o); }                   catch {}
  document.body.scrollTop = document.documentElement.scrollTop = t;
};
const doScrollToX = (left: number, smooth = true) => {
  const l = Math.max(0, left);
  const o: ScrollToOptions = { left: l, behavior: smooth ? "smooth" : "auto" };
  try { document.body.scrollTo(o); }            catch {}
  try { document.documentElement.scrollTo(o); } catch {}
  try { window.scrollTo(o); }                   catch {}
  document.body.scrollLeft = document.documentElement.scrollLeft = l;
};

const onAnyScroll = (cb: () => void) => {
  document.body.addEventListener("scroll",   cb, { passive: true });
  document.addEventListener("scroll",        cb, { passive: true });
  return () => {
    document.body.removeEventListener("scroll",  cb);
    document.removeEventListener("scroll",       cb);
  };
};

/* ─── accent ─── */
const ACCENT_MAP: Record<string, { hex: string; rgb: string }> = {
  sparkle: { hex: "#f5d200", rgb: "245,210,0"   },
  inferno: { hex: "#fb923c", rgb: "251,146,60"  },
  matrix:  { hex: "#34a863", rgb: "52,168,99"   },
  neon:    { hex: "#d946ef", rgb: "217,70,239"  },
  space:   { hex: "#38bdf8", rgb: "56,189,248"  },
  rain:    { hex: "#e2e8f0", rgb: "226,232,240" },
  asher:   { hex: "#d4d4d8", rgb: "212,212,216" },
  oceanic: { hex: "#22d3ee", rgb: "34,211,238"  },
  dark:    { hex: "#94a3b8", rgb: "148,163,184" },
  magma:   { hex: "#ff5248", rgb: "255,82,72"   },
  mercury: { hex: "#b0b6be", rgb: "176,182,190" },
  khaki:   { hex: "#8a9a52", rgb: "138,154,82"  },
  zebra:    { hex: "#11100e",  rgb: "17,16,14"    },
  flamingo: { hex: "#f45c7a",  rgb: "244,92,122"  },
  money:    { hex: "#e5a910",  rgb: "229,169,16"  },
};
const LIGHT_ACCENT   = { hex: "#6d28d9", rgb: "109,40,217" };
const DEFAULT_ACCENT = { hex: "#00f0ff", rgb: "0,240,255"  };

/* ─── catalogs ─── */
const THEMES: { key: ThemeKey; label: string; dot: string }[] = [
  { key: "sparkle", label: "Sparkle", dot: "#f5d200" },
  { key: "inferno", label: "Inferno", dot: "#fb923c" },
  { key: "neon",    label: "Neon",    dot: "#d946ef" },
  { key: "space",   label: "Space",   dot: "#38bdf8" },
  { key: "matrix",  label: "Matrix",  dot: "#34a863" },
  { key: "oceanic", label: "Oceanic", dot: "#22d3ee" },
  { key: "rain",    label: "Rain",    dot: "#e2e8f0" },
  { key: "asher",   label: "Asher",   dot: "#d4d4d8" },
  { key: "dark",    label: "Dark",    dot: "#94a3b8" },
  { key: "magma",   label: "Magma",   dot: "#ff5248" },
  { key: "mercury", label: "Mercury", dot: "#b0b6be" },
  { key: "khaki",   label: "Khaki",   dot: "#8a9a52" },
  { key: "zebra",    label: "Zebra",    dot: "#11100e" },
  { key: "flamingo", label: "Flamingo", dot: "#f45c7a" },
  { key: "money",    label: "Money",    dot: "#e5a910" },
  { key: "light",    label: "Light",    dot: "#6d28d9" },
];
const LANGS: { key: LangKey; label: string }[] = [
  { key: "UA", label: "UA" },
  { key: "EN", label: "EN" },
];

/* ─── nav ─── */
const NAV = [
  {
    href: "/main", label: "Main",
    Icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 7.5L8 2L14.5 7.5V14H10.5V10H5.5V14H1.5V7.5Z"/>
      </svg>
    ),
  },
  {
    href: "/signals", label: "Strategies",
    Icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="9" width="3" height="5" rx="0.75"/>
        <rect x="6.5" y="5.5" width="3" height="8.5" rx="0.75"/>
        <rect x="11.5" y="1.5" width="3" height="12" rx="0.75"/>
      </svg>
    ),
  },
  {
    href: "/news", label: "Market",
    Icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1.5,11 4.5,7 7,9.5 10.5,4 14.5,7.5"/>
        <line x1="1.5" y1="14" x2="14.5" y2="14"/>
      </svg>
    ),
  },
  {
    href: "/guide", label: "Explorer",
    Icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5"/>
        <line x1="11" y1="11" x2="14" y2="14"/>
        <path d="M9 5L8 8.5L4.5 9.5L6 6L9 5Z"/>
      </svg>
    ),
  },
  {
    href: "/overview", label: "Overview",
    Icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/>
        <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1"/>
        <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1"/>
        <rect x="9"   y="9"   width="5.5" height="5.5" rx="1"/>
      </svg>
    ),
  },
];

/* ─── icon components ─── */
const SlidersIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <line x1="2" y1="4"  x2="14" y2="4"/>
    <line x1="2" y1="8"  x2="14" y2="8"/>
    <line x1="2" y1="12" x2="14" y2="12"/>
    <circle cx="5.5"  cy="4"  r="1.7"/>
    <circle cx="10.5" cy="8"  r="1.7"/>
    <circle cx="6.5"  cy="12" r="1.7"/>
  </svg>
);
const GlobeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <line x1="2" y1="8" x2="14" y2="8"/>
    <path d="M8 2a10 10 0 0 1 3 6 10 10 0 0 1-3 6 10 10 0 0 1-3-6 10 10 0 0 1 3-6z"/>
  </svg>
);
const HScrollIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {/* track */}
    <line x1="1" y1="8" x2="15" y2="8" strokeOpacity="0.35" strokeWidth="3.5"/>
    {/* thumb */}
    <rect x="5" y="5.5" width="6" height="5" rx="2.5" fill="currentColor" stroke="none"/>
    {/* arrows */}
    <path d="M3 11.5 L1.5 13 L3 14.5" strokeWidth="1.4"/>
    <path d="M13 11.5 L14.5 13 L13 14.5" strokeWidth="1.4"/>
  </svg>
);
const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="14" viewBox="0 0 14 16" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 1.5h10V14L7 11 2 14V1.5z"/>
  </svg>
);
const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="14" viewBox="0 0 14 16" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 1L9.5 5.5H13L10 9.5 11 14 7 11.5 3 14 4 9.5 1 5.5H4.5L7 1Z"/>
  </svg>
);

/* ─── Tooltip ─── */
function Tip({ label, visible, rgb }: { label: string; visible: boolean; rgb: string }) {
  return (
    <div style={{
      position: "absolute", right: "calc(100% + 9px)", top: "50%",
      transform: `translateY(-50%) translateX(${visible ? 0 : 6}px)`,
      background: "rgba(6,6,8,0.93)", border: "1px solid rgba(255,255,255,0.09)",
      backdropFilter: "blur(18px)", borderRadius: 8, padding: "4px 9px",
      fontSize: 9, fontFamily: "monospace", fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase",
      color: "rgba(255,255,255,0.62)", whiteSpace: "nowrap",
      pointerEvents: "none",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.14s ease, transform 0.14s ease",
      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    }}>
      {label}
    </div>
  );
}

/* ─── Dropdown popup ─── */
function Popup({ open, accent, children }: { open: boolean; accent: { rgb: string }; children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", right: "calc(100% + 10px)", top: 0,
      background: "rgba(6,6,8,0.95)", border: "1px solid rgba(255,255,255,0.09)",
      backdropFilter: "blur(24px)", borderRadius: 14, padding: "7px 5px",
      boxShadow: `0 12px 48px rgba(0,0,0,0.65), 0 0 24px rgba(${accent.rgb},0.07)`,
      pointerEvents: open ? "auto" : "none",
      opacity: open ? 1 : 0,
      transform: open ? "translateX(0) scale(1)" : "translateX(8px) scale(0.96)",
      transformOrigin: "right center",
      transition: "opacity 0.17s ease, transform 0.17s ease",
      zIndex: 10,
    }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function PageScrollbar() {
  const router = useRouter();
  const { theme, setTheme, lang, setLang, isDark } = useUi();
  const accent = !isDark ? LIGHT_ACCENT : (ACCENT_MAP[theme] ?? DEFAULT_ACCENT);

  /* vertical scroll state */
  const [active,       setActive]       = useState(false);
  const [thumbTopPct,  setThumbTopPct]  = useState(0);
  const [thumbSizePct, setThumbSizePct] = useState(20);
  const [dragging,     setDragging]     = useState(false);
  const [atTop,        setAtTop]        = useState(true);
  const [atBottom,     setAtBottom]     = useState(false);

  /* horizontal scroll state */
  const [showH,       setShowH]       = useState(false);
  const [hThumbPct,   setHThumbPct]   = useState(0);
  const [hThumbSize,  setHThumbSize]  = useState(100);
  const [hDragging,   setHDragging]   = useState(false);
  const [hAtLeft,     setHAtLeft]     = useState(true);
  const [hAtRight,    setHAtRight]    = useState(false);

  /* bookmarks */
  const [bm1, setBm1] = useState<number | null>(null);
  const [bm2, setBm2] = useState<number | null>(null);

  /* dropdowns */
  const [openDrop, setOpenDrop] = useState<"theme" | "lang" | null>(null);
  const [hov,      setHov]      = useState<string | null>(null);
  const [hovTheme, setHovTheme] = useState<string | null>(null);
  const [hovLang,  setHovLang]  = useState<string | null>(null);

  /* refs */
  const panelRef   = useRef<HTMLDivElement>(null);
  const trackRef   = useRef<HTMLDivElement>(null);
  const hTrackRef  = useRef<HTMLDivElement>(null);
  const hideTimer  = useRef<ReturnType<typeof setTimeout>>();
  const dragY      = useRef(0);
  const dragScr    = useRef(0);
  const maxScr     = useRef(1);
  const hDragX     = useRef(0);
  const hDragScr   = useRef(0);
  const hMaxScr    = useRef(1);

  const show = useCallback(() => { clearTimeout(hideTimer.current); setActive(true); }, []);
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 2200);
  }, []);

  const updateMetrics = useCallback(() => {
    const sy = getScrollY(), winH = getClientH(), docH = getScrollH();
    const max = Math.max(1, docH - winH);
    maxScr.current = max;
    const size = Math.max(6, Math.min(100, (winH / docH) * 100));
    setThumbSizePct(size);
    setThumbTopPct(Math.min(1, sy / max) * (100 - size));
    setAtTop(sy < 2);
    setAtBottom(sy >= max - 2);
  }, []);

  const updateHMetrics = useCallback(() => {
    const sx = getScrollX(), cw = getClientW(), sw = getScrollW();
    const max = Math.max(1, sw - cw);
    hMaxScr.current = max;
    const size = Math.max(6, Math.min(100, (cw / sw) * 100));
    setHThumbSize(size);
    setHThumbPct(Math.min(1, sx / max) * (100 - size));
    setHAtLeft(sx < 2);
    setHAtRight(sx >= max - 2);
  }, []);

  useEffect(() => {
    const onScroll = () => { updateMetrics(); updateHMetrics(); show(); scheduleHide(); };
    const off = onAnyScroll(onScroll);
    window.addEventListener("resize", () => { updateMetrics(); updateHMetrics(); });
    const onMove = (e: MouseEvent) => {
      if (e.clientX > window.innerWidth - 72) { show(); scheduleHide(); }
    };
    window.addEventListener("mousemove", onMove);
    const onOut = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpenDrop(null);
    };
    document.addEventListener("mousedown", onOut);
    updateMetrics(); updateHMetrics();
    return () => {
      off();
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onOut);
      clearTimeout(hideTimer.current);
    };
  }, [updateMetrics, updateHMetrics, show, scheduleHide]);

  /* toggle horizontal scrollbar — also enable/disable overflow-x */
  const toggleHScroll = useCallback(() => {
    setShowH(prev => {
      const next = !prev;
      if (next) {
        document.body.style.overflowX = "auto";
        document.documentElement.style.overflowX = "auto";
      } else {
        document.body.style.overflowX = "";
        document.documentElement.style.overflowX = "";
        doScrollToX(0, false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (showH) updateHMetrics();
  }, [showH, updateHMetrics]);

  /* vertical track click */
  const onTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    doScrollTo(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * maxScr.current);
  }, []);

  /* horizontal track click */
  const onHTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!hTrackRef.current) return;
    const r = hTrackRef.current.getBoundingClientRect();
    doScrollToX(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * hMaxScr.current);
  }, []);

  /* vertical thumb drag */
  const onThumbDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(true); dragY.current = e.clientY; dragScr.current = getScrollY();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const h = trackRef.current.getBoundingClientRect().height;
      doScrollTo(Math.max(0, Math.min(dragScr.current + ((e.clientY - dragY.current) / h) * maxScr.current, maxScr.current)), false);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  /* horizontal thumb drag */
  const onHThumbDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setHDragging(true); hDragX.current = e.clientX; hDragScr.current = getScrollX();
  }, []);

  useEffect(() => {
    if (!hDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!hTrackRef.current) return;
      const w = hTrackRef.current.getBoundingClientRect().width;
      doScrollToX(Math.max(0, Math.min(hDragScr.current + ((e.clientX - hDragX.current) / w) * hMaxScr.current, hMaxScr.current)), false);
    };
    const onUp = () => setHDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [hDragging]);

  /* waypoints */
  const waypoints = useCallback((): number[] => {
    const pts = [0, maxScr.current];
    if (bm1 !== null) pts.push(Math.min(bm1, maxScr.current));
    if (bm2 !== null) pts.push(Math.min(bm2, maxScr.current));
    return [...new Set(pts)].sort((a, b) => a - b);
  }, [bm1, bm2]);

  const scrollUp   = useCallback(() => {
    const cur = getScrollY();
    doScrollTo([...waypoints()].reverse().find(p => p < cur - 40) ?? 0);
  }, [waypoints]);
  const scrollDown = useCallback(() => {
    const cur = getScrollY();
    doScrollTo(waypoints().find(p => p > cur + 40) ?? maxScr.current);
  }, [waypoints]);

  const bmPct = (bm: number | null) =>
    bm !== null ? Math.min(100, (bm / Math.max(1, maxScr.current)) * 100) : null;

  const isActive = active || dragging || hDragging || openDrop !== null;
  const curThemeDot = THEMES.find(t => t.key === theme)?.dot ?? accent.hex;

  /* ─── style helpers ─── */
  const W = 34;
  const pill = (lit?: boolean, disabled?: boolean): React.CSSProperties => ({
    width: W, height: W,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 10,
    background:     lit ? `rgba(${accent.rgb},0.13)` : "rgba(8,8,10,0.88)",
    border:         `1px solid ${lit ? `rgba(${accent.rgb},0.35)` : "rgba(255,255,255,0.07)"}`,
    backdropFilter: "blur(16px)",
    boxShadow:      lit ? `0 0 14px rgba(${accent.rgb},0.2)` : "none",
    color:          disabled ? "rgba(255,255,255,0.12)" : lit ? accent.hex : "rgba(255,255,255,0.45)",
    opacity:        disabled ? 0.28 : 1,
    cursor:         disabled ? "default" : "pointer",
    flexShrink: 0, transition: "all 0.17s", userSelect: "none", position: "relative",
  });

  const rowSt = (a: boolean, h: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px", borderRadius: 9, textDecoration: "none",
    background: a ? `rgba(${accent.rgb},0.12)` : h ? "rgba(255,255,255,0.04)" : "transparent",
    border: a ? `1px solid rgba(${accent.rgb},0.22)` : "1px solid transparent",
    color: a ? accent.hex : h ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.42)",
    fontSize: 10, fontFamily: "monospace", fontWeight: 700,
    letterSpacing: "0.13em", textTransform: "uppercase" as const,
    whiteSpace: "nowrap", transition: "all 0.13s", cursor: "pointer",
  });

  return (
    <>
      {/* Ambient glow */}
      <div aria-hidden style={{
        position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
        width: "50vw", height: "80vh",
        background: `radial-gradient(ellipse at 100% 50%, rgba(${accent.rgb},0.07) 0%, transparent 65%)`,
        pointerEvents: "none", zIndex: 199,
        opacity: isActive ? 1 : 0.3, transition: "opacity 0.4s ease",
      }} />

      {/* ═══ Horizontal scrollbar (bottom) ═══ */}
      <div style={{
        position: "fixed", bottom: 10, left: "50%",
        transform: `translateX(-50%) translateY(${showH ? 0 : 16}px)`,
        zIndex: 200,
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(8,8,10,0.88)",
        border: `1px solid rgba(255,255,255,0.07)`,
        backdropFilter: "blur(16px)",
        borderRadius: 14, padding: "0 10px",
        height: 32, width: "60vw", maxWidth: 900,
        boxShadow: `0 0 20px rgba(${accent.rgb},0.08), 0 8px 32px rgba(0,0,0,0.5)`,
        opacity:       showH ? 1 : 0,
        pointerEvents: showH ? "auto" : "none",
        transition:    "opacity 0.25s ease, transform 0.25s ease",
      }}>
        {/* ← */}
        <button
          onClick={() => doScrollToX(0)}
          style={{
            width: 18, height: 18, borderRadius: 5, border: "none",
            background: hAtLeft ? "transparent" : `rgba(${accent.rgb},0.1)`,
            color: hAtLeft ? "rgba(255,255,255,0.18)" : accent.hex,
            cursor: hAtLeft ? "default" : "pointer",
            fontSize: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.17s",
          }}
        >◀</button>

        {/* Track */}
        <div
          ref={hTrackRef}
          onClick={onHTrackClick}
          style={{
            flex: 1, height: 4, position: "relative",
            background: "rgba(255,255,255,0.07)", borderRadius: 4, cursor: "pointer",
          }}
        >
          <div
            onMouseDown={onHThumbDown}
            style={{
              position: "absolute", top: 0, bottom: 0,
              left:   `${hThumbPct}%`,
              width:  `${hThumbSize}%`,
              minWidth: 20,
              background:   accent.hex,
              borderRadius: 4,
              cursor:  hDragging ? "grabbing" : "grab",
              boxShadow: `0 0 12px ${accent.hex}bb, 0 0 4px ${accent.hex}`,
              transition: hDragging ? "none" : "left 0.07s linear",
            }}
          />
        </div>

        {/* → */}
        <button
          onClick={() => doScrollToX(hMaxScr.current)}
          style={{
            width: 18, height: 18, borderRadius: 5, border: "none",
            background: hAtRight ? "transparent" : `rgba(${accent.rgb},0.1)`,
            color: hAtRight ? "rgba(255,255,255,0.18)" : accent.hex,
            cursor: hAtRight ? "default" : "pointer",
            fontSize: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.17s",
          }}
        >▶</button>
      </div>

      {/* ═══ Vertical panel ═══ */}
      <div
        ref={panelRef}
        style={{
          position: "fixed", right: 8, top: "50%", transform: "translateY(-50%)",
          zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          opacity: isActive ? 1 : 0.13, transition: "opacity 0.3s ease",
          pointerEvents: "auto",
        }}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {/* Nav icons */}
        {NAV.map(({ href, label, Icon }) => {
          const here = router.pathname === href;
          return (
            <Link key={href} href={href}
              style={{ ...pill(here), textDecoration: "none" }}
              onMouseEnter={() => setHov(href)}
              onMouseLeave={() => setHov(null)}
            >
              <Icon />
              <Tip label={label} visible={hov === href} rgb={accent.rgb} />
            </Link>
          );
        })}

        {/* Divider */}
        <div style={{ width: 18, height: 1, background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />

        {/* Theme */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpenDrop(o => o === "theme" ? null : "theme")}
            style={pill(openDrop === "theme")}
            onMouseEnter={() => setHov("theme")}
            onMouseLeave={() => setHov(null)}
          >
            <SlidersIcon />
            <span style={{
              position: "absolute", bottom: 5, right: 5,
              width: 5, height: 5, borderRadius: "50%",
              background: curThemeDot, boxShadow: `0 0 5px ${curThemeDot}`,
            }} />
            <Tip label="Theme" visible={hov === "theme" && openDrop !== "theme"} rgb={accent.rgb} />
          </button>
          <Popup open={openDrop === "theme"} accent={accent}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 130 }}>
              {THEMES.map(t => (
                <button key={t.key}
                  onClick={() => { setTheme(t.key); setOpenDrop(null); }}
                  onMouseEnter={() => setHovTheme(t.key)}
                  onMouseLeave={() => setHovTheme(null)}
                  style={rowSt(theme === t.key, hovTheme === t.key)}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: t.dot, boxShadow: theme === t.key ? `0 0 7px ${t.dot}` : "none",
                  }} />
                  {t.label}
                  {theme === t.key && <span style={{ marginLeft: "auto", fontSize: 7, opacity: 0.5 }}>✓</span>}
                </button>
              ))}
            </div>
          </Popup>
        </div>

        {/* Lang */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpenDrop(o => o === "lang" ? null : "lang")}
            style={pill(openDrop === "lang")}
            onMouseEnter={() => setHov("lang")}
            onMouseLeave={() => setHov(null)}
          >
            <GlobeIcon />
            <Tip label={lang} visible={hov === "lang" && openDrop !== "lang"} rgb={accent.rgb} />
          </button>
          <Popup open={openDrop === "lang"} accent={accent}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 80 }}>
              {LANGS.map(l => (
                <button key={l.key}
                  onClick={() => { setLang(l.key); setOpenDrop(null); }}
                  onMouseEnter={() => setHovLang(l.key)}
                  onMouseLeave={() => setHovLang(null)}
                  style={rowSt(lang === l.key, hovLang === l.key)}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: lang === l.key ? accent.hex : "transparent",
                    boxShadow:  lang === l.key ? `0 0 6px ${accent.hex}` : "none",
                  }} />
                  {l.label}
                </button>
              ))}
            </div>
          </Popup>
        </div>

        {/* Divider */}
        <div style={{ width: 18, height: 1, background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />

        {/* Vertical track */}
        <div ref={trackRef} onClick={onTrackClick} style={{
          position: "relative", width: 4, height: "30vh",
          background: "rgba(255,255,255,0.07)", borderRadius: 4,
          cursor: "pointer", flexShrink: 0,
          boxShadow: `0 0 18px rgba(${accent.rgb},0.08)`,
        }}>
          <div onMouseDown={onThumbDown} style={{
            position: "absolute", left: 0, right: 0,
            top: `${thumbTopPct}%`, height: `${thumbSizePct}%`, minHeight: 18,
            background: accent.hex, borderRadius: 4,
            cursor: dragging ? "grabbing" : "grab",
            boxShadow: `0 0 14px ${accent.hex}cc, 0 0 4px ${accent.hex}, 0 0 30px rgba(${accent.rgb},0.28)`,
            transition: dragging ? "none" : "top 0.07s linear",
          }} />
          {bmPct(bm1) !== null && (
            <div style={{
              position: "absolute", left: -3, right: -3, top: `${bmPct(bm1)}%`,
              height: 2, borderRadius: 2, background: accent.hex, opacity: 0.8,
              boxShadow: `0 0 8px ${accent.hex}`, pointerEvents: "none",
            }} />
          )}
          {bmPct(bm2) !== null && (
            <div style={{
              position: "absolute", left: -5, right: -5, top: `${bmPct(bm2)}%`,
              height: 2, borderRadius: 2, background: "rgba(255,255,255,0.55)", opacity: 0.7,
              boxShadow: "0 0 6px rgba(255,255,255,0.35)", pointerEvents: "none",
            }} />
          )}
        </div>

        {/* Bookmark 1 */}
        <button
          onClick={() => setBm1(p => p !== null ? null : Math.round(getScrollY()))}
          style={pill(bm1 !== null)}
          onMouseEnter={() => setHov("bm1")} onMouseLeave={() => setHov(null)}
        >
          <BookmarkIcon filled={bm1 !== null} />
          <Tip label="Point 1" visible={hov === "bm1"} rgb={accent.rgb} />
        </button>

        {/* Bookmark 2 */}
        <button
          onClick={() => setBm2(p => p !== null ? null : Math.round(getScrollY()))}
          style={pill(bm2 !== null)}
          onMouseEnter={() => setHov("bm2")} onMouseLeave={() => setHov(null)}
        >
          <PinIcon filled={bm2 !== null} />
          <Tip label="Point 2" visible={hov === "bm2"} rgb={accent.rgb} />
        </button>

        {/* H-scroll toggle */}
        <button
          onClick={toggleHScroll}
          style={pill(showH)}
          onMouseEnter={() => setHov("hscr")} onMouseLeave={() => setHov(null)}
        >
          <HScrollIcon />
          <Tip label={showH ? "Hide X" : "H-Scroll"} visible={hov === "hscr"} rgb={accent.rgb} />
        </button>

        {/* ▲ */}
        <button
          onClick={scrollUp} style={pill(false, atTop)}
          onMouseEnter={() => setHov("up")} onMouseLeave={() => setHov(null)}
        >
          ▲
          <Tip label="Top" visible={hov === "up" && !atTop} rgb={accent.rgb} />
        </button>

        {/* ▼ */}
        <button
          onClick={scrollDown} style={pill(false, atBottom)}
          onMouseEnter={() => setHov("dn")} onMouseLeave={() => setHov(null)}
        >
          ▼
          <Tip label="Bottom" visible={hov === "dn" && !atBottom} rgb={accent.rgb} />
        </button>
      </div>
    </>
  );
}
