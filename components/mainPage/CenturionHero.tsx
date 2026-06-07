"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════════
   MATRIX RAIN CANVAS
═══════════════════════════════════════════════ */
function MatrixRain() {
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

    const SZ    = 13;
    const CHARS = "01アイウエオSIGNALBIDASKDATAFEED><[]|#@$!?∆Ω∑≠";
    let   drops: number[] = [];

    const reset = () => {
      drops = Array(Math.floor(canvas.width / SZ))
        .fill(0)
        .map(() => Math.random() * -60);
    };
    reset();
    window.addEventListener("resize", reset);

    let raf: number;
    let last = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 55) return;
      last = ts;

      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${SZ}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * SZ;
        const head = Math.random() > 0.96;
        ctx.fillStyle = head
          ? "rgba(200,255,220,0.88)"
          : `rgba(0,${Math.floor(140 + Math.random() * 115)},${Math.floor(28 + Math.random() * 36)},${0.07 + Math.random() * 0.14})`;
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * SZ, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.6 + Math.random() * 0.4;
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", reset);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.2 }}
    />
  );
}

/* ═══════════════════════════════════════════════
   PROPER ROMAN CENTURION HELMET (GALEA)
   Transverse crest = centurion badge of rank
═══════════════════════════════════════════════ */
function CenturionHelmet() {
  return (
    <svg
      viewBox="0 0 200 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full centurion-helm-glow"
    >
      {/* ── TRANSVERSE CREST (left→right, centurion signature) ── */}
      {/* Bristle tops */}
      {[10,22,34,46,58,78,100,122,142,154,166,178,190].map((x, i) => (
        <rect key={i} x={x-4} y={0} width={8} height={6} rx={2}
          fill="currentColor" opacity={0.52}/>
      ))}
      {/* Main crest bar */}
      <rect x="3" y="5" width="194" height="22" rx="11" fill="currentColor"/>
      {/* Crest sheen */}
      <rect x="5" y="6" width="190" height="9" rx="5" fill="white" opacity="0.12"/>
      {/* Crest bottom edge glow */}
      <rect x="3" y="24" width="194" height="3" rx="1" fill="currentColor" opacity="0.35"/>

      {/* ── CREST PILLAR ── */}
      <rect x="90" y="26" width="20" height="34" rx="4" fill="currentColor" opacity="0.88"/>
      <rect x="93" y="27" width="6" height="32" rx="2" fill="white" opacity="0.08"/>

      {/* ── BOWL / DOME ── */}
      <path d="M 20 124 Q 20 50 100 46 Q 180 50 180 124 Z" fill="currentColor"/>
      {/* Dome highlight sweep */}
      <path d="M 36 82 Q 60 56 100 53 Q 140 56 164 82"
        stroke="white" strokeWidth="2" fill="none" opacity="0.12"/>
      {/* Horizontal bands */}
      <path d="M 26 96  Q 100 91  174 96"  stroke="white" strokeWidth="1"   fill="none" opacity="0.08"/>
      <path d="M 22 110 Q 100 105 178 110" stroke="white" strokeWidth="0.8" fill="none" opacity="0.06"/>
      {/* Center crest-ridge on dome */}
      <line x1="100" y1="47" x2="100" y2="124" stroke="black" strokeWidth="3" opacity="0.18"/>

      {/* ── FACE OPENING (dark cutout) ── */}
      <path
        d="M 38 94 L 38 124 L 162 124 L 162 94
           Q 162 72 100 68 Q 38 72 38 94 Z"
        fill="black" opacity="0.93"/>

      {/* ── EYE VISOR RIDGE ── */}
      <line x1="38" y1="94" x2="162" y2="94"
        stroke="currentColor" strokeWidth="4.5" opacity="0.88"/>
      {/* Visor inner shadow */}
      <line x1="40" y1="99" x2="160" y2="99"
        stroke="black" strokeWidth="2" opacity="0.5"/>

      {/* ── LEFT CHEEK GUARD ── */}
      <path
        d="M 20 124 Q 7 150 11 168
           Q 16 180 31 174
           Q 47 167 49 150 L 52 124 Z"
        fill="currentColor" opacity="0.88"/>
      {/* Left cheek detail */}
      <path d="M 22 142 Q 35 150 50 147"
        stroke="white" strokeWidth="0.8" fill="none" opacity="0.1"/>

      {/* ── RIGHT CHEEK GUARD ── */}
      <path
        d="M 180 124 Q 193 150 189 168
           Q 184 180 169 174
           Q 153 167 151 150 L 148 124 Z"
        fill="currentColor" opacity="0.88"/>
      <path d="M 178 142 Q 165 150 150 147"
        stroke="white" strokeWidth="0.8" fill="none" opacity="0.1"/>

      {/* ── NECK GUARD ── */}
      <path
        d="M 20 124 L 180 124 L 185 146 L 154 158 L 100 162 L 46 158 L 15 146 Z"
        fill="currentColor" opacity="0.8"/>
      {/* Neck guard top seam */}
      <line x1="18" y1="142" x2="182" y2="142"
        stroke="white" strokeWidth="0.8" opacity="0.1"/>
      {/* Rivets */}
      {[38, 64, 100, 136, 162].map((x, i) => (
        <circle key={i} cx={x} cy={151} r={2.8}
          fill="black" opacity={0.45}/>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   DATA
═══════════════════════════════════════════════ */
const BOOT = [
  "> INITIALIZING CENTURION TACTICAL SYSTEM v2.1.0",
  "> ESTABLISHING SECURE CHANNEL .......... [AES-256]",
  "> LOADING MULTI-FEED DATA ENGINE ........ [OK]",
  "> CONNECTING YAHOO FINANCE BRIDGE ....... [OK]",
  "> CONNECTING TRADINGVIEW DATAFEED ....... [OK]",
  "> SCANNING DARKPOOL SIGNAL MATRICES ..... [OK]",
  "> CLEARANCE LEVEL: ██████  ACCESS GRANTED",
  "> ALL SYSTEMS NOMINAL. INTELLIGENCE ONLINE.",
];

const TITLE = "CENTURION";

const STATUSES = [
  { label: "YAHOO FEED",    col: "#00ff41" },
  { label: "TV CHARTS",     col: "#00d4ff" },
  { label: "SIGNAL LOCK",   col: "#ff3030" },
  { label: "DARKPOOL SCAN", col: "#ffd700" },
];

/* ═══════════════════════════════════════════════
   HERO COMPONENT
═══════════════════════════════════════════════ */
export default function CenturionHero() {
  const [lines,    setLines]    = useState(0);
  const [letters,  setLetters]  = useState(0);
  const [glitch,   setGlitch]   = useState(false);
  const [badge,    setBadge]    = useState(false);
  const [clock,    setClock]    = useState("");
  const sysId = useRef(Math.random().toString(16).slice(2, 10).toUpperCase());

  /* boot */
  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    BOOT.forEach((_, i) =>
      ts.push(setTimeout(() => setLines(i + 1), 200 + i * 320))
    );
    const titleAt = 200 + BOOT.length * 320 + 260;
    ts.push(
      setTimeout(() => {
        TITLE.split("").forEach((_, i) =>
          ts.push(setTimeout(() => setLetters(i + 1), i * 78 + 40))
        );
      }, titleAt)
    );
    ts.push(setTimeout(() => setBadge(true), titleAt + 1100));
    return () => ts.forEach(clearTimeout);
  }, []);

  /* glitch pulse */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 170);
        next();
      }, 2800 + Math.random() * 4200);
    };
    next();
    return () => clearTimeout(t);
  }, []);

  /* clock */
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toISOString().replace("T", " ").slice(0, 22) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const G = "#00ff41";
  const R = "#ff2a2a";
  const C = "#00eeff";

  return (
    <section
      className="relative w-full min-h-[660px] overflow-hidden flex flex-col items-center justify-center py-14 select-none"
      style={{ background: "#000" }}
    >
      {/* Matrix rain */}
      <MatrixRain />

      {/* Dot matrix */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle, rgba(0,255,65,0.055) 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }}/>

      {/* CRT scanlines */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px)",
      }}/>

      {/* Vignette + red corner burns */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background: `
          radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.88) 100%),
          radial-gradient(ellipse 60% 40% at top left,  rgba(60,0,0,0.22) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at top right, rgba(60,0,0,0.22) 0%, transparent 60%),
          radial-gradient(ellipse 60% 30% at bottom left,  rgba(0,20,0,0.3) 0%, transparent 60%),
          radial-gradient(ellipse 60% 30% at bottom right, rgba(0,20,0,0.3) 0%, transparent 60%)
        `,
      }}/>

      {/* Moving scan beam */}
      <div className="absolute left-0 right-0 pointer-events-none z-10 centurion-scanline" style={{
        height: 120,
        background: "linear-gradient(180deg, transparent 0%, rgba(0,255,65,0.025) 50%, transparent 100%)",
      }}/>

      {/* Top border: red-green-red */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-20" style={{
        background: `linear-gradient(90deg, transparent, ${R}55 20%, ${G}88 50%, ${R}55 80%, transparent)`,
      }}/>

      {/* ── CONTENT ── */}
      <div className="relative z-30 flex flex-col items-center gap-7 w-full max-w-[860px] mx-auto px-6">

        {/* Top bar: clock + restricted badge */}
        <div className="self-stretch flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.28em] uppercase"
            style={{ color: "rgba(0,255,65,0.42)" }}>
            {clock}&nbsp;<span className="centurion-cursor">█</span>
          </span>

          <AnimatePresence>
            {badge && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-3 py-1 font-mono text-[8px] tracking-[0.28em] uppercase"
                style={{
                  border: `1px solid ${R}44`,
                  background: `${R}0d`,
                  color: `${R}bb`,
                }}
              >
                <span className="centurion-status-dot" style={{
                  display:"inline-block", width:5, height:5,
                  borderRadius:"50%", background:R, color:R,
                }}/>
                RESTRICTED · CLEARANCE ALPHA
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* HELMET */}
        <motion.div
          initial={{ opacity: 0, scale: 0.3, y: -16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{ width: 180, height: 198, color: G }}
        >
          <CenturionHelmet />
        </motion.div>

        {/* CENTURION TITLE with chromatic glitch */}
        <div className="relative flex flex-col items-center gap-2">

          {/* RGB ghost layers (glitch) */}
          {glitch && (
            <>
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ transform:"translateX(-5px)", opacity:0.6 }}>
                <span style={{ fontSize:"clamp(52px,6.4vw,96px)", fontFamily:"'JetBrains Mono','Courier New',monospace", fontWeight:900, letterSpacing:"0.17em", color:R, lineHeight:1 }}>
                  {TITLE}
                </span>
              </div>
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ transform:"translateX(5px)", opacity:0.4 }}>
                <span style={{ fontSize:"clamp(52px,6.4vw,96px)", fontFamily:"'JetBrains Mono','Courier New',monospace", fontWeight:900, letterSpacing:"0.17em", color:C, lineHeight:1 }}>
                  {TITLE}
                </span>
              </div>
            </>
          )}

          {/* Main letters */}
          <div className="flex items-end" style={{ minHeight:"clamp(52px,6.4vw,96px)", gap:2 }}>
            {TITLE.split("").map((ch, i) => (
              <motion.span
                key={i}
                initial={{ opacity:0, y:-24, rotateX:-90 }}
                animate={i < letters ? { opacity:1, y:0, rotateX:0 } : { opacity:0 }}
                transition={{ duration:0.25, ease:"backOut" }}
                style={{
                  fontSize: "clamp(52px,6.4vw,96px)",
                  fontFamily: "'JetBrains Mono','Courier New',monospace",
                  fontWeight: 900,
                  color: G,
                  textShadow: `0 0 14px ${G}88, 0 0 30px ${G}44, 0 0 60px ${G}20`,
                  letterSpacing: "0.17em",
                  display: "inline-block",
                  lineHeight: 1,
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>

          {/* Subtitle */}
          <AnimatePresence>
            {letters >= TITLE.length && (
              <motion.p
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                transition={{ delay:0.35, duration:1.4 }}
                className="font-mono text-[10px] tracking-[0.65em] uppercase m-0"
                style={{ color:"rgba(255,175,35,0.58)" }}
              >
                TACTICAL TRADING INTELLIGENCE SYSTEM
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* BOOT TERMINAL */}
        <div
          className="self-stretch font-mono text-[11px] leading-[1.75]"
          style={{
            border: `1px solid rgba(0,255,65,0.13)`,
            borderLeft: `3px solid ${G}55`,
            background: "rgba(0,4,1,0.72)",
            backdropFilter: "blur(6px)",
            padding: "14px 16px",
            boxShadow: `0 0 40px rgba(0,255,65,0.03) inset, 0 0 0 1px rgba(255,0,0,0.04)`,
          }}
        >
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 mb-3 pb-2"
            style={{ borderBottom:"1px solid rgba(0,255,65,0.07)" }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:R,           display:"inline-block", opacity:0.7 }}/>
            <span style={{ width:8, height:8, borderRadius:"50%", background:"#ffd700",   display:"inline-block", opacity:0.5 }}/>
            <span style={{ width:8, height:8, borderRadius:"50%", background:G,           display:"inline-block", opacity:0.4 }}/>
            <span className="ml-3 text-[8px] tracking-widest uppercase"
              style={{ color:"rgba(0,255,65,0.28)" }}>
              CENTURION/TACTICAL — INIT SEQUENCE
            </span>
            <span className="ml-auto text-[8px]" style={{ color:"rgba(0,255,65,0.18)" }}>
              {sysId.current}
            </span>
          </div>

          {/* Lines */}
          {BOOT.slice(0, lines).map((ln, i) => (
            <div
              key={i}
              style={{
                color: i === lines - 1 ? G : "rgba(0,255,65,0.3)",
                textShadow: i === lines - 1 ? `0 0 8px ${G}55` : "none",
              }}
            >
              {ln}
              {i === lines - 1 && <span className="centurion-cursor ml-1">▌</span>}
            </div>
          ))}
          {lines === 0 && (
            <div style={{ color:"rgba(0,255,65,0.3)" }}>
              &gt; <span className="centurion-cursor">▌</span>
            </div>
          )}
        </div>

        {/* STATUS INDICATORS */}
        <div className="self-stretch flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6">
            {STATUSES.map(({ label, col }) => (
              <div
                key={label}
                className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase"
                style={{ color:`${col}66` }}
              >
                <span className="centurion-status-dot" style={{
                  display:"inline-block", width:6, height:6,
                  borderRadius:"50%", background:col, color:col,
                }}/>
                {label}
              </div>
            ))}
          </div>
          <div className="font-mono text-[8px] tracking-widest" style={{ color:"rgba(0,255,65,0.18)" }}>
            SESS·{sysId.current}
          </div>
        </div>
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-30" style={{
        background: `linear-gradient(90deg, transparent, ${G}2a 50%, transparent)`,
      }}/>
    </section>
  );
}
