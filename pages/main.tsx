"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import dynamic from "next/dynamic";
import { useUi } from "@/components/UiProvider";
import Link from "next/link";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { Activity, BarChart2, Zap } from "lucide-react";
import { IconSonar, IconScanner, IconScope, IconSwagger, IconSpectr, IconSwift } from "@/components/nav/AppIcons";

const QuarterCalendar = dynamic(() => import("@/components/mainPage/QuarterCalendar"), { ssr: false });
const MarketPulse    = dynamic(() => import("@/components/mainPage/MarketPulse"),     { ssr: false });
const SonarScan      = dynamic(() => import("@/components/mainPage/SonarScan"),       { ssr: false });
const AssetCards     = dynamic(() => import("@/components/mainPage/AssetCards"),       { ssr: false });
const BenchmarkStrip = dynamic(() => import("@/components/mainPage/BenchmarksStrip"), { ssr: false });
const GlitchArtPanel  = dynamic(() => import("@/components/mainPage/GlitchArtPanel"),   { ssr: false });

/* ─────────────────────────────────────────────────────────
   THEME ACCENT PALETTE
───────────────────────────────────────────────────────── */
type ThemeAccent = {
  hex: string;      // primary accent color
  hex2: string;     // secondary (gradient end)
  rgb: string;      // "r,g,b"
  bokeh: string[];  // bokeh circle colors (2-3)
  muted: string;    // muted text color
};

function getAccent(theme: string, isDark: boolean): ThemeAccent {
  if (!isDark) {
    return { hex: "#6d28d9", hex2: "#a855f7", rgb: "109,40,217", bokeh: ["rgba(109,40,217,0.07)", "rgba(139,92,246,0.05)", "rgba(196,181,253,0.08)"], muted: "rgba(0,0,0,0.35)" };
  }
  switch (theme) {
    case "sparkle":  return { hex: "#f5d200", hex2: "#ff8800", rgb: "245,210,0",   bokeh: ["rgba(245,210,0,0.07)",   "rgba(200,160,0,0.04)",  "rgba(255,220,50,0.05)"],  muted: "rgba(245,210,0,0.35)"   };
    case "inferno":  return { hex: "#fb923c", hex2: "#ef4444", rgb: "251,146,60",  bokeh: ["rgba(251,80,20,0.07)",   "rgba(200,60,0,0.05)",   "rgba(255,140,60,0.04)"],  muted: "rgba(251,146,60,0.35)"  };
    case "matrix":   return { hex: "#00ff41", hex2: "#00aa20", rgb: "0,255,65",    bokeh: ["rgba(0,255,65,0.06)",    "rgba(0,180,40,0.04)",   "rgba(0,220,60,0.05)"],    muted: "rgba(0,255,65,0.35)"    };
    case "neon":     return { hex: "#d946ef", hex2: "#7c3aed", rgb: "217,70,239",  bokeh: ["rgba(217,70,239,0.07)",  "rgba(150,0,200,0.05)",  "rgba(240,120,255,0.04)"], muted: "rgba(217,70,239,0.35)"  };
    case "space":    return { hex: "#38bdf8", hex2: "#0066ff", rgb: "56,189,248",  bokeh: ["rgba(56,189,248,0.07)",  "rgba(14,116,189,0.05)", "rgba(100,200,255,0.04)"], muted: "rgba(56,189,248,0.35)"  };
    case "rain":     return { hex: "#e2e8f0", hex2: "#94a3b8", rgb: "226,232,240", bokeh: ["rgba(226,232,240,0.05)", "rgba(148,163,184,0.04)","rgba(200,210,220,0.04)"], muted: "rgba(226,232,240,0.3)"  };
    case "asher":    return { hex: "#d4d4d8", hex2: "#71717a", rgb: "212,212,216", bokeh: ["rgba(212,212,216,0.05)", "rgba(160,160,170,0.04)","rgba(180,180,190,0.04)"], muted: "rgba(212,212,216,0.3)"  };
    case "oceanic":  return { hex: "#22d3ee", hex2: "#0891b2", rgb: "34,211,238",  bokeh: ["rgba(34,211,238,0.07)",  "rgba(8,145,178,0.05)",  "rgba(80,220,250,0.04)"],  muted: "rgba(34,211,238,0.35)"  };
    default:         return { hex: "#00f0ff", hex2: "#0066ff", rgb: "0,240,255",   bokeh: ["rgba(0,240,255,0.06)",   "rgba(0,100,200,0.04)",  "rgba(0,200,255,0.04)"],   muted: "rgba(0,240,255,0.3)"    };
  }
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function fmtP(n: number) {
  if (!n) return "—";
  if (n >= 100_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 10_000)  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)     return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

type Quote = {
  ticker: string; price: number; chgPct: number;
  bid: number; ask: number; chg: number;
};

const HERO_TICKERS = ["SPY", "QQQ", "NVDA", "TSLA", "BTC-USD", "ETH-USD", "MSFT", "AMD"];

/* ─────────────────────────────────────────────────────────
   CHART LINES FIELD — анімовані scrolling графіки на фоні
───────────────────────────────────────────────────────── */
function ChartLinesField({ accent }: { accent: ThemeAccent }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const BUFFER = 340;

    type ChartLine = {
      data:       number[];
      acc:        number;      // fractional scroll accumulator
      baseY:      number;      // 0-1 relative vertical center
      amplitude:  number;      // fraction of canvas height
      speed:      number;      // data points / second
      trend:      number;      // upward bias per step
      volatility: number;      // noise amplitude
      color:      string;      // rgba prefix, e.g. "rgba(52,211,153,"
      lineAlpha:  number;
      fillAlpha:  number;
      lineWidth:  number;
    };

    // richer color palette — accent, emerald, sky, violet, rose, amber
    const colorDefs = [
      `rgba(${accent.rgb},`,
      "rgba(52,211,153,",
      "rgba(56,189,248,",
      `rgba(${accent.rgb},`,
      "rgba(251,113,133,",
      "rgba(167,139,250,",
      "rgba(52,211,153,",
      `rgba(${accent.rgb},`,
      "rgba(251,191,36,",
    ];

    const generateSeed = (len: number, vol: number, trend: number): number[] => {
      const d = [50];
      for (let i = 1; i < len; i++) {
        let v = d[i - 1] + (Math.random() - 0.46) * vol + trend;
        if (Math.random() < 0.045) v -= vol * 2.6;
        d.push(Math.max(10, Math.min(90, v)));
      }
      return d;
    };

    let lines: ChartLine[] = [];

    const initLines = () => {
      lines = Array.from({ length: 6 }, (_, i) => {
        const vol   = 2.2 + Math.random() * 3.0;
        const trend = 0.04 + Math.random() * 0.08;
        return {
          data:       generateSeed(BUFFER, vol, trend),
          acc:        0,
          baseY:      0.06 + (i / 8) * 0.88,
          amplitude:  0.07 + Math.random() * 0.07,
          speed:      12 + Math.random() * 18,
          trend,
          volatility: vol,
          color:      colorDefs[i % colorDefs.length],
          lineAlpha:  0.18 + Math.random() * 0.14,
          fillAlpha:  0.055 + Math.random() * 0.055,
          lineWidth:  1.0 + Math.random() * 0.8,
        };
      });
    };
    initLines();
    window.addEventListener("resize", initLines);

    const addPoint = (line: ChartLine) => {
      const last = line.data[line.data.length - 1];
      let v = last + (Math.random() - 0.44) * line.volatility + line.trend;
      if (Math.random() < 0.04) v -= line.volatility * 2.8;
      v = Math.max(10, Math.min(90, v));
      line.data.push(v);
      if (line.data.length > BUFFER) line.data.shift();
    };

    let raf: number;
    let lastTs = 0;

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((ts - lastTs) / 1000, 0.05); // cap at 50ms
      lastTs = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const line of lines) {
        // time-based scroll
        line.acc += line.speed * dt;
        while (line.acc >= 1) { addPoint(line); line.acc -= 1; }

        const W = canvas.width;
        const H = canvas.height;
        const cy = line.baseY * H;
        const ha = line.amplitude * H;

        const mn = Math.min(...line.data);
        const mx = Math.max(...line.data);
        const rng = mx - mn || 1;

        // map to canvas coords
        const N = line.data.length;
        const xs = line.data.map((_, i) => (i / (N - 1)) * W);
        const ys = line.data.map(v  => cy + ((v - mn) / rng - 0.5) * ha * 2);

        if (N < 4) continue;

        // ── smooth bezier path ──
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < N; i++) {
          const cpx = xs[i - 1] + (xs[i] - xs[i - 1]) * 0.5;
          ctx.bezierCurveTo(cpx, ys[i - 1], cpx, ys[i], xs[i], ys[i]);
        }

        // gradient fill below line
        const fillGrad = ctx.createLinearGradient(0, cy - ha, 0, cy + ha);
        fillGrad.addColorStop(0,   line.color + line.fillAlpha + ")");
        fillGrad.addColorStop(0.7, line.color + (line.fillAlpha * 0.3) + ")");
        fillGrad.addColorStop(1,   line.color + "0)");

        ctx.lineTo(xs[N - 1], cy + ha * 1.5);
        ctx.lineTo(xs[0],     cy + ha * 1.5);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // stroke line with glow
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < N; i++) {
          const cpx = xs[i - 1] + (xs[i] - xs[i - 1]) * 0.5;
          ctx.bezierCurveTo(cpx, ys[i - 1], cpx, ys[i], xs[i], ys[i]);
        }
        ctx.strokeStyle = line.color + line.lineAlpha + ")";
        ctx.lineWidth   = line.lineWidth;
        ctx.shadowColor = line.color + (line.lineAlpha * 2.5) + ")";
        ctx.shadowBlur  = 8;
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // live tip dot — right edge with glow
        const lx = xs[N - 1];
        const ly = ys[N - 1];
        const dotAlpha = line.lineAlpha * 3.2;
        ctx.shadowColor = line.color + Math.min(dotAlpha, 0.9) + ")";
        ctx.shadowBlur  = 12;
        // outer glow ring
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = line.color + (dotAlpha * 0.2) + ")";
        ctx.fill();
        // inner dot
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = line.color + Math.min(dotAlpha, 0.95) + ")";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", initLines);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent.hex]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/* ─────────────────────────────────────────────────────────
   TICKER FIELD — ринкові котирування літають по фону
───────────────────────────────────────────────────────── */
function TickerField({ accent, quotes }: { accent: ThemeAccent; quotes: Quote[] }) {
  const ref      = useRef<HTMLCanvasElement>(null);
  const quotesRef = useRef(quotes);
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    type Particle = {
      x: number; y: number;
      vx: number; vy: number;
      label: string;
      fontSize: number;
      alpha: number;
      targetAlpha: number;
      phase: number;
      fadeSpeed: number;
      color: string;
    };

    const UP_COL   = "rgba(52,211,153,";   // #34d399
    const DOWN_COL = "rgba(251,113,133,";  // #fb7185
    const ACC_COL  = `rgba(${accent.rgb},`;

    const makeLabel = (): { text: string; color: string } => {
      const qs = quotesRef.current;
      if (!qs.length) {
        const n = (Math.random() * 9999 + 10).toFixed(2);
        return { text: n, color: ACC_COL };
      }
      const q  = qs[Math.floor(Math.random() * qs.length)];
      const up = q.chgPct >= 0;
      const col = up ? UP_COL : DOWN_COL;
      if (Math.random() < 0.55) return { text: fmtP(q.price), color: ACC_COL };
      return { text: `${up ? "+" : ""}${q.chgPct.toFixed(2)}%`, color: col };
    };

    let particles: Particle[] = [];

    const spawn = (): Particle => {
      const { text, color } = makeLabel();
      return {
        x: Math.random() * canvas.width,
        y: -24,
        vx: (Math.random() - 0.5) * 0.25,   // tiny horizontal drift
        vy: 0.55 + Math.random() * 0.85,     // fall straight down
        label: text,
        fontSize: 10 + Math.floor(Math.random() * 5),
        alpha: 0,
        targetAlpha: 0.10 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
        fadeSpeed: 0.006 + Math.random() * 0.006,
        color,
      };
    };

    const seed = () => {
      particles = Array.from({ length: 70 }, () => {
        const p = spawn();
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
        p.alpha = Math.random() * 0.18;
        return p;
      });
    };
    seed();
    window.addEventListener("resize", seed);

    let raf: number;
    let t = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.012;

      // respawn when below screen
      particles = particles.map(p => {
        if (p.y > canvas.height + 30) return spawn();
        return p;
      });

      ctx.textBaseline = "middle";

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.alpha < p.targetAlpha) p.alpha = Math.min(p.alpha + p.fadeSpeed, p.targetAlpha);
        else p.alpha = Math.max(p.alpha - p.fadeSpeed * 0.3, 0);

        const pulse = 0.9 + 0.1 * Math.sin(t * 1.4 + p.phase);

        ctx.font = `700 ${p.fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = p.color + (p.alpha * pulse).toFixed(3) + ")";
        ctx.fillText(p.label, p.x, p.y);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", seed);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent.hex]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/* ─────────────────────────────────────────────────────────
   SESSION BADGE
───────────────────────────────────────────────────────── */
function SessionBadge({ accent }: { accent: ThemeAccent }) {
  const [session, setSession] = useState<"OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED">("CLOSED");

  useEffect(() => {
    const check = () => {
      const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const m  = ny.getHours() * 60 + ny.getMinutes();
      const d  = ny.getDay();
      if (d === 0 || d === 6) { setSession("CLOSED");      return; }
      if (m < 4 * 60)         { setSession("CLOSED");      return; }
      if (m < 9 * 60 + 30)    { setSession("PRE-MARKET");  return; }
      if (m < 16 * 60)        { setSession("OPEN");        return; }
      if (m < 20 * 60)        { setSession("AFTER-HOURS"); return; }
      setSession("CLOSED");
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const cols = {
    "OPEN":        { dot: "#10b981", text: "#34d399", bg: "rgba(16,185,129,0.08)",  bdr: "rgba(16,185,129,0.22)" },
    "PRE-MARKET":  { dot: "#f59e0b", text: "#fbbf24", bg: "rgba(245,158,11,0.08)",  bdr: "rgba(245,158,11,0.22)" },
    "AFTER-HOURS": { dot: "#8b5cf6", text: "#a78bfa", bg: "rgba(139,92,246,0.08)",  bdr: "rgba(139,92,246,0.22)" },
    "CLOSED":      { dot: "#4b5563", text: "#6b7280", bg: "rgba(75,85,99,0.07)",    bdr: "rgba(75,85,99,0.16)"   },
  }[session];

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded"
      style={{ background: cols.bg, border: `1px solid ${cols.bdr}` }}>
      <span className="main-status-dot" style={{ background: cols.dot, color: cols.dot }} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: cols.text }}>
        {session}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ANALOG CLOCK SVG
───────────────────────────────────────────────────────── */
function AnalogClock({ accent, size = 110 }: { accent: ThemeAccent; size?: number }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const s  = time.getSeconds();
  const m  = time.getMinutes() + s / 60;
  const h  = (time.getHours() % 12) + m / 60;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;

  const hand = (angle: number, len: number) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + len * Math.cos(rad), y: cy + len * Math.sin(rad) };
  };

  const hTip = hand(h  * 30,  r * 0.52);
  const mTip = hand(m  * 6,   r * 0.70);
  const sTip = hand(s  * 6,   r * 0.78);
  const sTail = hand(s * 6 + 180, r * 0.18);

  // tick marks
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const a = (i * 6 - 90) * (Math.PI / 180);
    const r1 = major ? r - 3   : r - 2;
    const r2 = major ? r - 8.5 : r - 5.5;
    return {
      x1: cx + r1 * Math.cos(a), y1: cy + r1 * Math.sin(a),
      x2: cx + r2 * Math.cos(a), y2: cy + r2 * Math.sin(a),
      major,
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* outer ring double */}
      <circle cx={cx} cy={cy} r={r}     fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={r - 3} fill="rgba(255,255,255,0.015)" />

      {/* inner ring */}
      <circle cx={cx} cy={cy} r={r - 5} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />

      {/* ticks — all white */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={t.major ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.18)"}
          strokeWidth={t.major ? 2 : 0.8}
          strokeLinecap="round" />
      ))}

      {/* hour hand — thick, white */}
      <line x1={cx} y1={cy} x2={hTip.x} y2={hTip.y}
        stroke="rgba(255,255,255,0.92)" strokeWidth={3.2} strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))" }} />

      {/* minute hand — thinner, white */}
      <line x1={cx} y1={cy} x2={mTip.x} y2={mTip.y}
        stroke="rgba(255,255,255,0.72)" strokeWidth={1.8} strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 3px rgba(255,255,255,0.35))" }} />

      {/* second hand + tail */}
      <line x1={sTail.x} y1={sTail.y} x2={sTip.x} y2={sTip.y}
        stroke={accent.hex} strokeWidth={1} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${accent.hex}bb)` }} />

      {/* center dot */}
      <circle cx={cx} cy={cy} r={2.5} fill={accent.hex}
        style={{ filter: `drop-shadow(0 0 4px ${accent.hex})` }} />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────
   CLOCK WIDGET  (redesigned)
───────────────────────────────────────────────────────── */
function ClockWidget({ accent }: { accent: ThemeAccent }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const hh  = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss  = pad(now.getSeconds());
  const DAYS   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const dayName  = DAYS[now.getDay()];
  const monthStr = MONTHS[now.getMonth()];
  const dateNum  = now.getDate();
  const year     = now.getFullYear();

  const ny    = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const nyStr = `${pad(ny.getHours())}:${pad(ny.getMinutes())}`;

  const nyM   = ny.getHours() * 60 + ny.getMinutes();
  const nyDay = ny.getDay();
  const isOpen = nyDay > 0 && nyDay < 6 && nyM >= 570 && nyM < 960;
  const isPre  = nyDay > 0 && nyDay < 6 && nyM >= 240 && nyM < 570;
  const sessionCol  = isOpen ? "#10b981" : isPre ? "#f59e0b" : "#6b7280";
  const sessionLabel = isOpen ? "OPEN" : isPre ? "PRE" : "CLOSED";

  const mono = "'JetBrains Mono', monospace";
  const sans = "'Space Grotesk', 'Inter', sans-serif";
  const fg   = "rgba(255,255,255,0.92)";

  return (
    <div className="flex flex-col justify-center shrink-0 gap-2">
      {/* HH : MM */}
      <div className="flex items-end" style={{ fontFamily: mono, lineHeight: 1 }}>
        <span style={{
          fontSize: 58, fontWeight: 900, letterSpacing: "-0.05em",
          color: "rgba(255,255,255,0.95)",
          textShadow: `0 0 40px rgba(255,255,255,0.08)`,
        }}>
          {hh}
        </span>
        <span style={{
          fontSize: 44, fontWeight: 900, letterSpacing: "-0.05em",
          color: `rgba(${accent.rgb},0.35)`,
          margin: "0 2px 6px",
        }}>:</span>
        <span style={{
          fontSize: 58, fontWeight: 900, letterSpacing: "-0.05em",
          color: "rgba(255,255,255,0.95)",
          textShadow: `0 0 40px rgba(255,255,255,0.08)`,
        }}>
          {min}
        </span>
        <span style={{
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
          color: accent.hex,
          marginLeft: 5, marginBottom: 8,
          textShadow: `0 0 20px ${accent.hex}cc`,
        }}>
          :{ss}
        </span>
      </div>

      {/* Date row */}
      <div className="flex items-center gap-2">
        <div style={{ width: 18, height: 1, background: `rgba(${accent.rgb},0.35)`, borderRadius: 1 }} />
        <span style={{
          fontFamily: sans, fontSize: 9, fontWeight: 600,
          letterSpacing: "0.22em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.28)",
        }}>
          {dayName},&nbsp;{monthStr}&nbsp;{dateNum},&nbsp;{year}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ON THIS DAY WIDGET  (Ukrainian Wikipedia — redesigned)
───────────────────────────────────────────────────────── */
type HistoryEvent = { year: number; text: string; emoji?: string };

function OnThisDayWidget({ accent }: { accent: ThemeAccent }) {
  const [events,  setEvents]  = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/onthisday?lang=uk&tz=America/New_York")
      .then(r => r.json())
      .then(j => {
        const raw: any[] = j.items ?? [];
        setEvents(
          raw
            .filter(e => e.text && e.year != null)
            .slice(0, 2)
            .map(e => ({ year: Number(e.year), text: String(e.text), emoji: e.emoji }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const d        = new Date();
  const MONTHS   = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const monthStr = MONTHS[d.getMonth()];
  const dateNum  = d.getDate();
  const mono     = "'JetBrains Mono', monospace";
  const sans     = "'Space Grotesk', 'Inter', sans-serif";

  return (
    <div className="flex flex-col justify-center shrink-0 gap-2" style={{ width: 320 }}>
      {loading ? (
        <span style={{ fontFamily: mono, fontSize: 8, color: `rgba(${accent.rgb},0.4)` }}>
          завантаження<span className="centurion-cursor">▌</span>
        </span>
      ) : events.length === 0 ? (
        <span style={{ fontFamily: mono, fontSize: 8, color: `rgba(${accent.rgb},0.3)` }}>немає подій</span>
      ) : (
        events.map((ev, i) => (
          <div key={i} className="flex flex-col gap-0.5"
            style={i > 0 ? { paddingTop: 6, borderTop: `1px solid rgba(${accent.rgb},0.08)` } : {}}>

            <div className="flex items-center gap-2">
              <span style={{
                fontFamily: mono, fontSize: 15, fontWeight: 900,
                color: accent.hex, lineHeight: 1,
                textShadow: `0 0 16px ${accent.hex}66`,
                letterSpacing: "-0.02em",
              }}>
                {ev.year}
              </span>
              {ev.emoji && <span style={{ fontSize: 13, opacity: 0.7 }}>{ev.emoji}</span>}
            </div>
            <span style={{
              fontFamily: sans, fontSize: 11.5, fontWeight: 400,
              color: "rgba(255,255,255,0.65)", lineHeight: 1.5,
            }}>
              {ev.text.length > 100 ? ev.text.slice(0, 100) + "…" : ev.text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   HERO GLITCH OVERLAY  (canvas screen-tear + noise bands)
───────────────────────────────────────────────────────── */
function HeroGlitchOverlay({ accent }: { accent: ThemeAccent }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.width;
    const H = () => canvas.height;

    // Parse accent hex → rgb for canvas
    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "");
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    };
    const ac = hexToRgb(accent.hex);

    /* ── draw one glitch frame ── */
    const glitchFrame = () => {
      ctx.clearRect(0, 0, W(), H());
      const intensity = Math.random();

      // 1. horizontal slice tears (2–5 bands)
      const numSlices = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numSlices; i++) {
        const y    = Math.random() * H();
        const h    = 1 + Math.random() * 14;
        const offX = (Math.random() - 0.5) * 28;
        const a    = 0.04 + Math.random() * 0.1;

        // colored displacement band
        ctx.fillStyle = Math.random() > 0.5
          ? `rgba(${ac.r},${ac.g},${ac.b},${a})`
          : Math.random() > 0.5
            ? `rgba(255,30,60,${a})`
            : `rgba(0,230,255,${a})`;
        ctx.fillRect(offX, y, W(), h);
      }

      // 2. noise blocks (random static patches)
      if (intensity > 0.4) {
        const numBlocks = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numBlocks; i++) {
          const bx = Math.random() * W() * 0.8;
          const by = Math.random() * H();
          const bw = 20 + Math.random() * 120;
          const bh = 2 + Math.random() * 8;
          const imgData = ctx.createImageData(Math.floor(bw), Math.floor(bh));
          for (let p = 0; p < imgData.data.length; p += 4) {
            const v = Math.random() * 255;
            imgData.data[p]   = v;
            imgData.data[p+1] = v;
            imgData.data[p+2] = v;
            imgData.data[p+3] = Math.random() * 60;
          }
          ctx.putImageData(imgData, bx, by);
        }
      }

      // 3. full-screen RGB tint flash (rare)
      if (intensity > 0.82) {
        const tintR = Math.random() > 0.5;
        ctx.fillStyle = tintR
          ? "rgba(255,0,40,0.04)"
          : `rgba(${ac.r},${ac.g},${ac.b},0.05)`;
        ctx.fillRect(0, 0, W(), H());
      }

      // 4. thin bright scanline sweep
      const sy = Math.random() * H();
      const lg = ctx.createLinearGradient(0, sy - 1, 0, sy + 1);
      lg.addColorStop(0,   "transparent");
      lg.addColorStop(0.5, `rgba(${ac.r},${ac.g},${ac.b},0.35)`);
      lg.addColorStop(1,   "transparent");
      ctx.fillStyle = lg;
      ctx.fillRect(0, sy - 1, W(), 2);
    };

    const clearFrame = () => ctx.clearRect(0, 0, W(), H());

    /* ── burst scheduler ── */
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleBurst = () => {
      timeoutId = setTimeout(() => {
        // 1–4 rapid flashes
        const flashes = 1 + Math.floor(Math.random() * 4);
        let delay = 0;
        for (let i = 0; i < flashes; i++) {
          setTimeout(glitchFrame, delay);
          setTimeout(clearFrame,  delay + 55 + Math.random() * 60);
          delay += 110 + Math.random() * 90;
        }
        scheduleBurst();
      }, 1800 + Math.random() * 3500);
    };
    scheduleBurst();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent.hex]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 15 }}
    />
  );
}

/* ─────────────────────────────────────────────────────────
   GLITCH TITLE  (character corruption + RGB layers)
───────────────────────────────────────────────────────── */
const GLITCH_CHARS = "▓░█▒@#%&!?01<>|/\\[]{}~^*∆Ω∑≠±";
const BASE_TITLE   = "CENTURION";

function GlitchTitle({ accent }: { accent: ThemeAccent }) {
  const [letters, setLetters] = useState(BASE_TITLE.split(""));
  const [rgbShift, setRgbShift] = useState(false);
  const [phase,    setPhase]    = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;

    const schedule = () => {
      t = setTimeout(() => {
        const burstLen = 1 + Math.floor(Math.random() * 3);
        let d = 0;
        for (let b = 0; b < burstLen; b++) {
          // corrupt
          setTimeout(() => {
            setRgbShift(true);
            setPhase(Math.random() > 0.5 ? 1 : 2);
            setLetters(BASE_TITLE.split("").map((ch, i) => {
              if (Math.random() < 0.35)
                return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
              return ch;
            }));
          }, d);
          // restore
          setTimeout(() => {
            setRgbShift(false);
            setLetters(BASE_TITLE.split(""));
          }, d + 70 + Math.random() * 80);
          d += 140 + Math.random() * 100;
        }
        schedule();
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);

  const G = "#ff2244";
  const C = "#00eeff";
  const shiftX = phase === 1 ? 5 : 4;

  return (
    <div className="relative" style={{ lineHeight: 1, userSelect: "none" }}>
      {/* RGB ghost R — shifted left */}
      {rgbShift && (
        <div className="absolute inset-0 pointer-events-none flex items-center"
          style={{ transform: `translateX(-${shiftX}px) translateY(1px)`, mixBlendMode: "screen" }}>
          <span style={{
            fontFamily: "'Bebas Neue','Rajdhani',system-ui,sans-serif",
            fontSize: "clamp(52px,5.8vw,96px)", fontWeight: 700, letterSpacing: "0.06em",
            color: G, opacity: 0.55,
          }}>
            {letters.join("")}
          </span>
        </div>
      )}

      {/* RGB ghost C — shifted right */}
      {rgbShift && (
        <div className="absolute inset-0 pointer-events-none flex items-center"
          style={{ transform: `translateX(${shiftX}px) translateY(-1px)`, mixBlendMode: "screen" }}>
          <span style={{
            fontFamily: "'Bebas Neue','Rajdhani',system-ui,sans-serif",
            fontSize: "clamp(52px,5.8vw,96px)", fontWeight: 700, letterSpacing: "0.06em",
            color: C, opacity: 0.38,
          }}>
            {letters.join("")}
          </span>
        </div>
      )}

      {/* Main text */}
      <h1 style={{
        fontFamily: "'Bebas Neue','Rajdhani',system-ui,sans-serif",
        fontSize: "clamp(52px,5.8vw,96px)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        lineHeight: 1,
        margin: 0,
        color: rgbShift ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.94)",
        textShadow: rgbShift
          ? `0 0 30px ${accent.hex}55, 2px 0 0 ${G}33, -2px 0 0 ${C}33`
          : `0 0 50px ${accent.hex}22, 0 1px 0 rgba(0,0,0,0.5)`,
        transition: rgbShift ? "none" : "text-shadow 0.3s ease",
        filter: rgbShift ? `drop-shadow(0 0 6px ${accent.hex}88)` : "none",
      }}>
        {letters.map((ch, i) => (
          <span key={i} style={{
            color: rgbShift && ch !== BASE_TITLE[i] ? accent.hex : undefined,
            display: "inline-block",
            transition: "none",
          }}>
            {ch}
          </span>
        ))}
      </h1>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   QUICK NAV BUTTONS
───────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/terminal", label: "Sonar",   color: "#34d399", Icon: IconSonar,   external: false },
  { href: "/scaner",   label: "Scaner",  color: "#22d3ee", Icon: IconScanner, external: false },
  { href: "/scope",    label: "Scope",   color: "#818cf8", Icon: IconScope,   external: false },
  { href: "http://localhost:5197/swagger", label: "Swagger", color: "#fbbf24", Icon: IconSwagger, external: true },
  { href: "/tape",     label: "Spectr",  color: "#a78bfa", Icon: IconSpectr,  external: false },
  { href: "/sifter",   label: "Swift",   color: "#fb7185", Icon: IconSwift,   external: false },
];

function QuickNavButtons({ accent }: { accent: ThemeAccent }) {
  return (
    <div className="flex flex-row gap-2">
      {NAV_ITEMS.map(({ href, label, color, Icon, external }) => (
        <Link key={href} href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="group relative flex flex-col items-center justify-center gap-2 rounded-[16px] overflow-hidden transition-all duration-300"
          style={{ width: 72, height: 62, background: "rgba(10,10,10,0.55)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `${color}12` }} />
          <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `linear-gradient(90deg,transparent,${color}66,transparent)` }} />
          <Icon className="relative z-10 h-[22px] w-[22px] transition-all duration-300 group-hover:scale-110" style={{ color }} />
          <span className="relative z-10 font-mono text-[6px] font-bold tracking-[0.15em] uppercase"
            style={{ color: "rgba(255,255,255,0.22)" }}>{label}</span>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SCROLLING TICKER STRIP
───────────────────────────────────────────────────────── */
function TickerStrip({ quotes, accent }: { quotes: Quote[]; accent: ThemeAccent }) {
  if (!quotes.length) return null;
  /* 4 copies → animate -25% for perfect seamless loop */
  const quad = [...quotes, ...quotes, ...quotes, ...quotes];

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 42 }}>
      <div style={{ display: "flex", alignItems: "center", height: "100%", width: "max-content", animation: "main-ticker-scroll-anim 55s linear infinite", willChange: "transform" }}>
        {quad.map((q, i) => {
          const up  = q.chgPct >= 0;
          const col = up ? "#34d399" : "#fb7185";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, padding: "0 20px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: accent.muted, textTransform: "uppercase" }}>
                {q.ticker.replace("-USD", "")}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                ${fmtP(q.price)}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600, color: col }}>
                {up ? "▲" : "▼"}&thinsp;{Math.abs(q.chgPct).toFixed(2)}%
              </span>
              <span style={{ color: `rgba(${accent.rgb},0.12)`, fontSize: 6 }}>◆</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SECTION DIVIDER
───────────────────────────────────────────────────────── */
function SectionLabel({ children, sub, accent }: { children: React.ReactNode; sub?: string; accent: ThemeAccent }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -10 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.45 }}
      className="flex items-center gap-2.5 mb-4"
    >
      <div className="w-[2px] h-4 rounded-full" style={{ background: accent.hex, boxShadow: `0 0 8px ${accent.hex}55` }} />
      <div>
        <div style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>
          {children}
        </div>
        {sub && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: accent.muted, marginTop: 1 }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   STRATEGY CARDS  (uses STRATEGY_CATALOG data)
───────────────────────────────────────────────────────── */
const STRATEGY_COLORS: Record<string, { hex: string; bg: string; border: string }> = {
  arbitrage:   { hex: "#818cf8", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.2)"  },
  pumpAndDump: { hex: "#fb7185", bg: "rgba(251,113,133,0.08)", border: "rgba(251,113,133,0.2)" },
  breakout:    { hex: "#34d399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)"  },
  opendoor:    { hex: "#fb923c", bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)"  },
  reversal:    { hex: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)"  },
  earnings:    { hex: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.2)"  },
  gap:         { hex: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
  chrono:      { hex: "#22d3ee", bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.2)"  },
  powerHour:   { hex: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.2)"  },
};
const DEFAULT_COL = { hex: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.15)" };

type StrategyTile = {
  key: string; name: string; icon: string;
  score: number; maxScore: number;
  spark: number[];
};

function buildTiles(): StrategyTile[] {
  return STRATEGY_CATALOG.slice(0, 6).map(s => ({
    key:      s.key,
    name:     s.name,
    icon:     s.icon || "✨",
    score:    Math.floor(Math.random() * 14) + 4,
    maxScore: 20,
    spark:    Array.from({ length: 10 }, () => Math.floor(Math.random() * 100)),
  }));
}

function StrategyCards({ accent }: { accent: ThemeAccent }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [tiles] = useState<StrategyTile[]>(buildTiles);

  const TICKERS = [
    { t: "MOA", s: 92 }, { t: "ETH", s: 88 }, { t: "BTC", s: 76 },
  ];

  return (
    <motion.div
        ref={ref}
        className="w-full h-full grid grid-cols-3 gap-3"
        initial="hidden"
        animate={inView ? "show" : "hidden"}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      >
        {tiles.map((tile) => {
          const col   = STRATEGY_COLORS[tile.key] ?? DEFAULT_COL;
          const pct   = Math.round((tile.score / tile.maxScore) * 100);

          return (
            <motion.div
              key={tile.key}
              variants={{
                hidden: { opacity: 0, y: 18 },
                show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="relative rounded-[20px] overflow-hidden group flex flex-row"
              style={{
                background: "rgba(10,10,10,0.55)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(12px)",
                minHeight: 180,
              }}
            >
              {/* Content */}
              <div className="flex-1 flex flex-col p-5 relative min-w-0">
                <Link href={`/signals/${tile.key}`} className="absolute inset-0 z-0" />

                {/* Header */}
                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl text-xl shrink-0"
                      style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                      {tile.icon}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>
                        {tile.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 rounded font-mono text-[8px] font-bold uppercase"
                          style={{ background: col.bg, border: `1px solid ${col.border}`, color: col.hex }}>
                          LIVE V4
                        </span>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 99, padding: "2px 8px" }}>
                    {pct}%
                  </span>
                </div>

                {/* Ticker chips */}
                <div className="flex items-center gap-1.5 mb-auto relative z-10">
                  {TICKERS.map(t => (
                    <div key={t.t} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: "rgba(10,10,10,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: "0.05em" }}>{t.t}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{t.s}</span>
                    </div>
                  ))}
                </div>

                {/* Score + sparkline */}
                <div className="flex items-end justify-between mt-4 mb-5 relative z-10">
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 2 }}>
                      SIGNAL DENSITY
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 36, fontWeight: 900, color: "rgba(255,255,255,0.9)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                        {tile.score}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "rgba(255,255,255,0.25)", fontWeight: 700 }}>
                        / {tile.maxScore}
                      </span>
                    </div>
                  </div>

                  {/* Mini sparkline */}
                  <div style={{ width: 100, height: 36, opacity: 0.18 }} className="group-hover:opacity-40 transition-opacity duration-500">
                    <svg viewBox="0 0 100 36" className="w-full h-full overflow-visible">
                      <polyline
                        points={tile.spark.map((v, i) => `${(i / 9) * 100},${36 - (v / 100) * 28 - 2}`).join(" ")}
                        fill="none" stroke={col.hex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="absolute bottom-0 left-5 right-[65px] h-[3px] rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full relative"
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${pct}%` } : { width: 0 }}
                    transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                    style={{ background: col.hex, boxShadow: `0 0 10px ${col.hex}66` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                      style={{ background: col.hex, filter: "blur(1px)", boxShadow: `0 0 8px ${col.hex}` }} />
                  </motion.div>
                </div>
              </div>

              {/* Sidebar buttons */}
              <div className="w-[52px] shrink-0 flex flex-col border-l rounded-r-[20px] overflow-hidden"
                style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(13,13,15,0.9)" }}>
                <Link href={`/signals/${tile.key}`}
                  className="flex-1 flex flex-col items-center justify-center border-b hover:bg-white/[0.06] transition-all group/btn"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <Zap size={14} className="text-zinc-600 group-hover/btn:text-orange-400 transition-colors" />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em", marginTop: 3 }}>SGN</span>
                </Link>
                <Link href={`/stats/${tile.key}`}
                  className="flex-1 flex flex-col items-center justify-center border-b hover:bg-white/[0.06] transition-all group/btn"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <BarChart2 size={14} className="text-zinc-600 group-hover/btn:text-violet-400 transition-colors" />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em", marginTop: 3 }}>STS</span>
                </Link>
                <Link href={`/perform/${tile.key}`}
                  className="flex-1 flex flex-col items-center justify-center hover:bg-white/[0.06] transition-all group/btn">
                  <Activity size={14} className="text-zinc-600 group-hover/btn:text-emerald-400 transition-colors" />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em", marginTop: 3 }}>PRF</span>
                </Link>
              </div>
            </motion.div>
          );
        })}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   CENTURION HELMET SVG
───────────────────────────────────────────────────────── */
function HelmetSvg({ accentHex = "#00f0ff", secondaryHex }: { color?: string; transparent?: boolean; accentHex?: string; secondaryHex?: string }) {
  const sec = secondaryHex ?? accentHex;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      width="100%" height="100%"
      style={{ "--logo-color": accentHex, "--logo-color-secondary": sec, overflow: "visible" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="cen-dyn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="var(--logo-color)" />
          <stop offset="100%" stopColor="var(--logo-color-secondary)" />
        </linearGradient>
        <filter id="cen-neon" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.5" result="blur1" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#cen-neon)" stroke="url(#cen-dyn-grad)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="4.5" d="M 183 238 L 140 195 L 180 150 L 210 185 M 210 170 L 195 110 L 245 80 L 252 150 M 262 142 L 270 55 L 325 55 L 308 142 M 322 147 L 350 78 L 402 105 L 355 168 M 367 182 L 428 152 L 452 205 L 372 232" />
        <path strokeWidth="3"   d="M 172 178 L 158 165 L 182 135 L 198 152 M 225 140 L 218 100 L 243 85 L 245 125 M 285 130 L 288 75 L 310 75 L 302 130 M 340 142 L 358 100 L 385 115 L 355 150 M 382 195 L 418 175 L 430 198 L 388 212" />
        <path strokeWidth="5"   d="M 210 300 C 180 150, 400 170, 365 315" />
        <path strokeWidth="3"   d="M 218 285 C 195 165, 380 185, 352 298" />
        <path strokeWidth="5"   d="M 200 348 L 255 240 L 315 292 L 255 315 Z" />
        <path strokeWidth="4"   d="M 212 332 L 255 255 L 298 292" />
        <path strokeWidth="3.5" d="M 255 255 L 255 315" />
        <path strokeWidth="4.5" d="M 215 375 L 210 495 L 255 450 L 310 450 L 360 380" />
        <path strokeWidth="4"   d="M 228 385 L 225 475 L 252 435 L 298 435 L 340 378" />
        <path strokeWidth="5"   d="M 270 345 L 270 410 C 270 435, 295 435, 295 410 L 295 345" />
        <path strokeWidth="3"   d="M 240 395 L 240 425" />
        <path strokeWidth="3"   d="M 320 395 L 320 420" />
        <path strokeWidth="2.5" d="M 255 450 L 255 495 L 282 470" />
      </g>
    </svg>
  );
}

function CenturionHelmetGlitch({ accent, size = 88 }: { accent: ThemeAccent; size?: number }) {
  const [glitch, setGlitch] = useState(false);
  const [phase,  setPhase]  = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        // random glitch burst: 1-3 flashes
        const flashes = Math.floor(Math.random() * 3) + 1;
        let delay = 0;
        for (let i = 0; i < flashes; i++) {
          setTimeout(() => { setGlitch(true);  setPhase(Math.random() > 0.5 ? 1 : 2); }, delay);
          setTimeout(() => { setGlitch(false); }, delay + 90 + Math.random() * 60);
          delay += 160 + Math.random() * 80;
        }
        schedule();
      }, 2400 + Math.random() * 3800);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  // Glitch secondary colors: channel-split
  const glitchR = "#ff2244";
  const glitchC = "#00eeff";

  return (
    <div className="relative select-none" style={{ width: size, height: size, flexShrink: 0 }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,240,255,0.12) 0%, transparent 70%)`,
          filter: "blur(10px)",
          animation: "main-helm-glow 3.5s ease-in-out infinite",
        }}
      />

      {/* Glitch layer R */}
      {glitch && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translateX(${phase === 1 ? -5 : -3}px)`,
            opacity: 0.5, mixBlendMode: "screen",
            filter: "hue-rotate(180deg) saturate(2)",
          }}>
          <HelmetSvg accentHex={accent.hex} secondaryHex={accent.hex2} />
        </div>
      )}

      {/* Glitch layer C */}
      {glitch && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translateX(${phase === 1 ? 5 : 3}px)`,
            opacity: 0.35, mixBlendMode: "screen",
            filter: "hue-rotate(90deg) saturate(3)",
          }}>
          <HelmetSvg accentHex={accent.hex} secondaryHex={accent.hex2} />
        </div>
      )}

      {/* Scan line */}
      {glitch && (
        <div className="absolute left-0 right-0 pointer-events-none z-10"
          style={{
            height: 2, top: `${25 + Math.random() * 45}%`,
            background: "linear-gradient(90deg, transparent, rgba(0,240,255,0.7), transparent)",
          }}
        />
      )}

      {/* Main */}
      <div className="absolute inset-0"
        style={{
          filter: glitch
            ? `drop-shadow(0 0 12px ${accent.hex}cc) brightness(1.4)`
            : `drop-shadow(0 0 8px ${accent.hex}66)`,
          transition: glitch ? "none" : "filter 0.4s ease",
        }}>
        <HelmetSvg accentHex={accent.hex} secondaryHex={accent.hex2} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────── */

export default function MainPage() {
  const { theme, isDark } = useUi();
  const accent = getAccent(theme, isDark);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clock,  setClock]  = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/yahoo-quotes?tickers=${HERO_TICKERS.join(",")}`);
        const j = await r.json();
        if (j.data?.length) { setQuotes(j.data); setLoaded(true); }
      } catch {}
    };
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "America/New_York", hour12: false,
      }) + " ET");
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);


  return (
    <div className="min-h-screen">

      {/* ══════════════════════════════════════
          HERO — compact command-center style
      ══════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden pb-6" style={{ borderRadius: "0 0 24px 24px" }}>

        {/* Dark overlay — same tone as strategy cards */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(8,8,10,0.72)", backdropFilter: "blur(2px)" }} />

        {/* Chart lines — scrolling background charts */}
        <ChartLinesField accent={accent} />

        {/* Floating market tickers */}
        <TickerField accent={accent} quotes={quotes} />

        {/* Subtle dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(rgba(${accent.rgb},0.04) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }} />

        {/* Scan beam */}
        <div className="absolute left-0 right-0 pointer-events-none main-scan-beam"
          style={{ height: 140 }} />

        {/* Glitch overlay */}
        <HeroGlitchOverlay accent={accent} />

        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{
          background: `linear-gradient(90deg,transparent,${accent.hex}40 30%,${accent.hex}30 70%,transparent)`,
        }} />

        {/* ── content ── */}
        <div className="relative z-20 max-w-[1800px] mx-auto px-6 pt-10 pb-5">

          {/* ROW 1: Title ↔ Clock + History */}
          <div className="flex items-center justify-between gap-6 mb-4">

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-5 flex-1"
            >
              <GlitchTitle accent={accent} />
            </motion.div>

            <motion.div
              className="hidden xl:flex flex-row items-center gap-6 shrink-0"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <ClockWidget accent={accent} />
              <div style={{
                width: 1, alignSelf: "stretch",
                background: `linear-gradient(180deg, transparent, rgba(${accent.rgb},0.25) 30%, rgba(${accent.rgb},0.25) 70%, transparent)`,
              }} />
              <OnThisDayWidget accent={accent} />
            </motion.div>
          </div>

          {/* ROW 2: Market Pulse (left) + QuickNavButtons (right) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="pt-3 flex items-end gap-4"
            style={{ borderTop: `1px solid rgba(${accent.rgb},0.07)` }}
          >
            <div className="flex-1 min-w-0">
              <MarketPulse accent={accent} noHeader />
            </div>
            <div className="shrink-0 pb-0.5">
              <QuickNavButtons accent={accent} />
            </div>
          </motion.div>
        </div>

        {/* ── Ticker strip — bottom of hero ── */}
        <div className="relative w-full z-20"
          style={{
            height: 44,
            background: "rgba(10,10,10,0.55)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* edge fades — same bg as strip */}
          <div className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
            style={{ background: "linear-gradient(90deg, rgba(10,10,10,0.85), transparent)" }} />
          <div className="absolute inset-y-0 right-0 w-32 z-10 pointer-events-none"
            style={{ background: "linear-gradient(-90deg, rgba(10,10,10,0.85), transparent)" }} />

          {/* accent top line */}
          <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${accent.hex}22 30%, ${accent.hex}16 70%, transparent)` }} />

          <AnimatePresence>
            {loaded ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
                className="w-full h-full flex items-center">
                <TickerStrip quotes={quotes} accent={accent} />
              </motion.div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.3em", color: `rgba(${accent.rgb},0.25)`, textTransform: "uppercase" }}>
                  ЗАВАНТАЖЕННЯ<span className="centurion-cursor">▌</span>
                </span>
              </div>
            )}
          </AnimatePresence>
        </div>

      </section>

      {/* ══════════════════════════════════════
          MARKET CARDS + GLITCH ART PANEL
      ══════════════════════════════════════ */}
      <div className="pt-2 pb-4">
        <div className="px-6 mb-3">
          <SectionLabel accent={accent} sub="Live V4 · Strategy Engine · Signal Density">
            Active Strategies
          </SectionLabel>
        </div>
        <div className="grid grid-cols-4 gap-3 items-stretch">
          <div>
            <GlitchArtPanel accent={accent} />
          </div>
          <div className="col-span-3">
            <StrategyCards accent={accent} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          SIGNAL MAP
      ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="pt-2 pb-4"
        style={{ borderTop: `1px solid rgba(${accent.rgb},0.06)` }}
      >
        <div className="px-6 mb-3">
          <SectionLabel accent={accent} sub="Live V4 · Sonar Engine · Situation Density">
            Signal Map
          </SectionLabel>
        </div>
        <SonarScan accent={accent} />
      </motion.div>

      {/* ══════════════════════════════════════
          QUARTERLY CALENDAR
      ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55 }}
        style={{ borderTop: `1px solid rgba(${accent.rgb},0.07)` }}
      >
        <div className="px-6 pt-4 mb-3">
          <SectionLabel accent={accent} sub="Q2 2026 · Scheduled Catalysts · Earnings & Events">
            Quarterly Calendar
          </SectionLabel>
        </div>
        <QuarterCalendar events={[]} accent={accent} />
      </motion.div>

      {/* ══════════════════════════════════════
          ASSET CARDS
      ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        style={{ borderTop: `1px solid rgba(${accent.rgb},0.06)` }}
      >
        <div className="max-w-[1800px] mx-auto px-6 pt-6 pb-1">
          <SectionLabel accent={accent} sub="Yahoo Finance · Mini Charts · 20s refresh">
            Markets Overview
          </SectionLabel>
        </div>
        <AssetCards />
      </motion.div>

      {/* ══════════════════════════════════════
          BENCHMARKS
      ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="px-6 py-5 max-w-[1800px] mx-auto"
      >
        <BenchmarkStrip height={48} locale="en" />
      </motion.div>

      <div className="h-16" />
    </div>
  );
}
