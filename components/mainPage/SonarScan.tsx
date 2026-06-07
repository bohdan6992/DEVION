"use client";

import { useEffect, useRef, useState } from "react";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";

type Accent = { hex: string; hex2: string; rgb: string; muted: string };

const MONO = "'JetBrains Mono', monospace";

const MOCK_COUNTS: Record<string, number> = {
  arbitrage:   31, breakout:    24, pumpAndDump: 18,
  gap:         14, reversal:    11, earnings:     7,
  opendoor:     5, chrono:       3, powerHour:    2,
};

const STRATEGY_COLORS: Record<string, string> = {
  arbitrage:   "#818cf8", pumpAndDump: "#fb7185", breakout:  "#34d399",
  opendoor:    "#fb923c", reversal:    "#60a5fa", earnings:  "#fbbf24",
  gap:         "#a78bfa", chrono:      "#22d3ee", powerHour: "#f97316",
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/* ─── Canvas ─── */
function MapCanvas({ accent, strategies }: {
  accent: Accent;
  strategies: { key: string; name: string; icon: string; count: number; color: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sync = () => { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);

    const PAD  = { top: 28, right: 28, bottom: 62, left: 52 };
    const N    = strategies.length;
    const maxC = Math.max(...strategies.map(s => s.count));
    const SEGS = 18; // LED segments per bar

    type Bar = typeof strategies[0] & {
      phase:   number;
      speed:   number;
      current: number;
      target:  number;
      // rising data particles
      particles: { y: number; alpha: number; speed: number }[];
      glitchTimer: number;
      glitching:   boolean;
    };

    const bars: Bar[] = strategies.map(s => ({
      ...s,
      phase:   Math.random() * Math.PI * 2,
      speed:   0.5 + Math.random() * 0.6,
      current: 0,
      target:  s.count / maxC,
      particles: Array.from({ length: 4 }, () => ({
        y:     Math.random(),
        alpha: Math.random() * 0.6,
        speed: 0.15 + Math.random() * 0.25,
      })),
      glitchTimer: 2 + Math.random() * 6,
      glitching:   false,
    }));

    let scanX   = 0;
    let scanDir = 1;
    let time    = 0;
    let raf: number;
    let lastTs  = 0;

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      time  += dt;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top  - PAD.bottom;
      const baseY = PAD.top + plotH;

      /* ── background scanlines ── */
      for (let y = PAD.top; y < baseY; y += 4) {
        ctx.fillStyle = `rgba(0,0,0,0.18)`;
        ctx.fillRect(PAD.left, y, plotW, 1);
      }

      /* ── HUD corner brackets ── */
      const bLen = 16, bT = 1.5;
      ctx.strokeStyle = `rgba(${accent.rgb},0.45)`;
      ctx.lineWidth   = bT;
      // top-left
      ctx.beginPath();
      ctx.moveTo(PAD.left, PAD.top + bLen); ctx.lineTo(PAD.left, PAD.top); ctx.lineTo(PAD.left + bLen, PAD.top);
      ctx.stroke();
      // top-right
      ctx.beginPath();
      ctx.moveTo(PAD.left + plotW - bLen, PAD.top); ctx.lineTo(PAD.left + plotW, PAD.top); ctx.lineTo(PAD.left + plotW, PAD.top + bLen);
      ctx.stroke();
      // bottom-left
      ctx.beginPath();
      ctx.moveTo(PAD.left, baseY - bLen); ctx.lineTo(PAD.left, baseY); ctx.lineTo(PAD.left + bLen, baseY);
      ctx.stroke();
      // bottom-right
      ctx.beginPath();
      ctx.moveTo(PAD.left + plotW - bLen, baseY); ctx.lineTo(PAD.left + plotW, baseY); ctx.lineTo(PAD.left + plotW, baseY - bLen);
      ctx.stroke();

      /* ── grid ── */
      const gridRows = 5;
      ctx.setLineDash([2, 8]);
      for (let r = 0; r <= gridRows; r++) {
        const y = PAD.top + (r / gridRows) * plotH;
        ctx.strokeStyle = r === gridRows
          ? `rgba(${accent.rgb},0.3)`
          : `rgba(${accent.rgb},0.07)`;
        ctx.lineWidth = r === gridRows ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
      }
      ctx.setLineDash([]);

      /* ── Y axis ── */
      ctx.strokeStyle = `rgba(${accent.rgb},0.35)`;
      ctx.lineWidth   = 1;
      ctx.shadowColor = accent.hex;
      ctx.shadowBlur  = 4;
      ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, baseY); ctx.stroke();
      ctx.shadowBlur  = 0;

      /* ── Y ticks ── */
      ctx.font      = `700 7.5px ${MONO}`;
      ctx.textAlign = "right";
      for (let r = 0; r <= gridRows; r++) {
        const val = Math.round(maxC * (gridRows - r) / gridRows);
        const y   = PAD.top + (r / gridRows) * plotH;
        ctx.fillStyle = `rgba(${accent.rgb},0.45)`;
        ctx.fillText(String(val), PAD.left - 6, y + 3);
        ctx.strokeStyle = `rgba(${accent.rgb},0.25)`;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left - 4, y); ctx.lineTo(PAD.left, y); ctx.stroke();
      }

      /* ── Y label ── */
      ctx.save();
      ctx.font      = `700 7px ${MONO}`;
      ctx.fillStyle = `rgba(${accent.rgb},0.22)`;
      ctx.textAlign = "center";
      ctx.translate(13, PAD.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("SITUATIONS", 0, 0);
      ctx.restore();

      /* ── bars ── */
      const slotW = plotW / N;
      const barW  = Math.max(10, Math.min(slotW * 0.52, 42));
      const segH  = (plotH / SEGS) * 0.72;
      const segGap = (plotH / SEGS) * 0.28;

      for (let i = 0; i < N; i++) {
        const bar = bars[i];
        bar.phase   += bar.speed * dt;
        bar.current += (bar.target - bar.current) * Math.min(dt * 2.8, 0.16);

        // glitch
        bar.glitchTimer -= dt;
        if (bar.glitchTimer <= 0) {
          bar.glitching   = true;
          bar.glitchTimer = 4 + Math.random() * 8;
          setTimeout(() => { bar.glitching = false; }, 80 + Math.random() * 120);
        }

        const cx = PAD.left + slotW * i + slotW / 2;
        const bx = cx - barW / 2;

        // scan proximity
        const scanDist = Math.abs(scanX - cx) / (slotW * 0.8);
        const scanGlow = Math.max(0, 1 - scanDist);

        const [r, g, b] = hexToRgb(bar.color);
        const filledSegs = Math.round(bar.current * SEGS);

        /* ── LED segments ── */
        for (let s = 0; s < SEGS; s++) {
          const segFrac = (SEGS - 1 - s) / (SEGS - 1); // 0=bottom, 1=top
          const sy = baseY - (s + 1) * (segH + segGap) + segGap / 2;
          const filled = s < filledSegs;

          if (filled) {
            // brightness: top segments brighter
            const bright = 0.5 + segFrac * 0.5;
            // pulse
            const pulse = 1 + 0.08 * Math.sin(bar.phase * 2 + s * 0.3);
            const alpha = (bright * pulse + scanGlow * 0.2) * (bar.glitching && Math.random() > 0.5 ? 0.3 : 1);

            // segment fill
            const segGrad = ctx.createLinearGradient(bx, sy, bx + barW, sy);
            segGrad.addColorStop(0,   `rgba(${r},${g},${b},${(alpha * 0.6).toFixed(3)})`);
            segGrad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
            segGrad.addColorStop(1,   `rgba(${r},${g},${b},${(alpha * 0.6).toFixed(3)})`);

            ctx.fillStyle   = segGrad;
            ctx.shadowColor = bar.color;
            ctx.shadowBlur  = 6 + scanGlow * 12 + (s === filledSegs - 1 ? 8 : 0);
            ctx.beginPath();
            ctx.roundRect(bx, sy, barW, segH, 1.5);
            ctx.fill();
            ctx.shadowBlur = 0;

            // top segment bright flare
            if (s === filledSegs - 1) {
              ctx.fillStyle   = `rgba(255,255,255,${(0.55 + scanGlow * 0.3).toFixed(2)})`;
              ctx.shadowColor = bar.color;
              ctx.shadowBlur  = 14 + scanGlow * 16;
              ctx.fillRect(bx + 2, sy, barW - 4, 1.5);
              ctx.shadowBlur = 0;
            }
          } else {
            // dim empty segment
            ctx.fillStyle = `rgba(${r},${g},${b},0.05)`;
            ctx.beginPath();
            ctx.roundRect(bx, sy, barW, segH, 1.5);
            ctx.fill();
          }
        }

        /* ── rising data particles (inside bar) ── */
        const barH = bar.current * plotH;
        for (const p of bar.particles) {
          p.y -= p.speed * dt;
          if (p.y < 0) { p.y = 1; p.alpha = 0.3 + Math.random() * 0.5; }
          const py    = baseY - p.y * barH;
          const alpha = p.alpha * (0.5 + 0.5 * Math.sin(time * 3 + p.y * 10));
          ctx.fillStyle   = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.shadowColor = bar.color;
          ctx.shadowBlur  = 4;
          ctx.beginPath(); ctx.arc(cx, py, 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }

        /* ── floor glow ── */
        const fg = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, slotW * 0.7);
        fg.addColorStop(0, `rgba(${r},${g},${b},${(0.18 + scanGlow * 0.14).toFixed(2)})`);
        fg.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = fg;
        ctx.fillRect(PAD.left + slotW * i, baseY - 6, slotW, 6);

        /* ── count label ── */
        const topY = baseY - barH - 10;
        ctx.font    = `900 10px ${MONO}`;
        ctx.textAlign = "center";
        ctx.fillStyle   = bar.glitching
          ? `rgba(255,255,255,0.9)`
          : `rgba(${r},${g},${b},${(0.75 + scanGlow * 0.25).toFixed(2)})`;
        ctx.shadowColor = bar.color;
        ctx.shadowBlur  = 6 + scanGlow * 12;
        ctx.fillText(String(bar.count), cx, topY);
        ctx.shadowBlur = 0;

        /* ── name label ── */
        ctx.font      = `700 6.5px ${MONO}`;
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + scanGlow * 0.5).toFixed(2)})`;
        ctx.shadowColor = bar.color;
        ctx.shadowBlur  = scanGlow * 8;
        ctx.fillText(bar.name.slice(0, 9).toUpperCase(), cx, baseY + 14);
        ctx.shadowBlur = 0;

        /* ── icon ── */
        ctx.font      = `12px serif`;
        ctx.fillStyle = `rgba(255,255,255,${(0.45 + scanGlow * 0.45).toFixed(2)})`;
        ctx.fillText(bar.icon, cx, baseY + 32);

        /* ── slot divider ── */
        if (i > 0) {
          ctx.strokeStyle = `rgba(${accent.rgb},0.06)`;
          ctx.lineWidth   = 1;
          ctx.setLineDash([2, 6]);
          ctx.beginPath(); ctx.moveTo(PAD.left + slotW * i, PAD.top + 4); ctx.lineTo(PAD.left + slotW * i, baseY - 4); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      /* ── scan line ── */
      const scanSpeed = plotW * 0.25;
      scanX += scanSpeed * dt * scanDir;
      if (scanX > PAD.left + plotW + 30) { scanX = PAD.left + plotW; scanDir = -1; }
      if (scanX < PAD.left - 30)          { scanX = PAD.left;          scanDir =  1; }

      // trail
      const trailLen = 100;
      const trailDir = scanDir > 0 ? -1 : 1;
      const trail    = ctx.createLinearGradient(scanX + trailDir * trailLen, 0, scanX, 0);
      trail.addColorStop(0, `rgba(${accent.rgb},0)`);
      trail.addColorStop(1, `rgba(${accent.rgb},0.1)`);
      ctx.fillStyle = trail;
      ctx.fillRect(
        Math.min(scanX, scanX + trailDir * trailLen),
        PAD.top, trailLen, plotH
      );

      // line glow
      const lineG = ctx.createLinearGradient(0, PAD.top, 0, baseY);
      lineG.addColorStop(0,   `rgba(${accent.rgb},1)`);
      lineG.addColorStop(0.5, `rgba(${accent.rgb},0.7)`);
      lineG.addColorStop(1,   `rgba(${accent.rgb},0.15)`);
      ctx.strokeStyle = lineG;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = accent.hex;
      ctx.shadowBlur  = 16;
      ctx.beginPath(); ctx.moveTo(scanX, PAD.top); ctx.lineTo(scanX, baseY); ctx.stroke();
      ctx.shadowBlur  = 0;

      // scan tip cross
      const cross = 5;
      ctx.strokeStyle = `rgba(255,255,255,0.8)`;
      ctx.lineWidth   = 1;
      ctx.shadowColor = accent.hex;
      ctx.shadowBlur  = 10;
      ctx.beginPath(); ctx.moveTo(scanX - cross, baseY); ctx.lineTo(scanX + cross, baseY); ctx.stroke();
      ctx.beginPath(); ctx.arc(scanX, baseY, 2.5, 0, Math.PI * 2); ctx.fillStyle = accent.hex; ctx.fill();
      ctx.shadowBlur  = 0;

      /* ── bottom X axis line ── */
      ctx.strokeStyle = `rgba(${accent.rgb},0.3)`;
      ctx.lineWidth   = 1;
      ctx.shadowColor = accent.hex;
      ctx.shadowBlur  = 3;
      ctx.beginPath(); ctx.moveTo(PAD.left, baseY); ctx.lineTo(PAD.left + plotW, baseY); ctx.stroke();
      ctx.shadowBlur  = 0;
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent.hex, strategies.length]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

/* ─── Main ─── */
export default function SonarScan({ accent }: { accent: Accent }) {
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setScanning(s => !s), 3400);
    return () => clearInterval(t);
  }, []);

  const strategies = STRATEGY_CATALOG.map(s => ({
    key:   s.key,
    name:  s.name,
    icon:  s.icon || "◆",
    count: MOCK_COUNTS[s.key] ?? Math.floor(Math.random() * 15 + 1),
    color: STRATEGY_COLORS[s.key] ?? "#94a3b8",
  })).sort((a, b) => b.count - a.count);

  const total = strategies.reduce((sum, s) => sum + s.count, 0);

  return (
    <div style={{
      position:     "relative",
      width:        "100%",
      height:       280,
      background:   "rgba(4,4,7,0.75)",
      borderTop:    `1px solid rgba(${accent.rgb},0.08)`,
      borderBottom: `1px solid rgba(${accent.rgb},0.08)`,
      overflow:     "hidden",
    }}>
      <MapCanvas accent={accent} strategies={strategies} />

      {/* status badge */}
      <div className="absolute top-2 right-4 flex items-center gap-1.5 z-10"
        style={{ pointerEvents: "none" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900,
          color: accent.hex, textShadow: `0 0 16px ${accent.hex}` }}>
          {total}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 7.5, color: "rgba(255,255,255,0.18)" }}>signals ·</span>
        <span style={{ width: 5, height: 5, borderRadius: "50%",
          background: scanning ? accent.hex : "rgba(255,255,255,0.1)",
          boxShadow:  scanning ? `0 0 8px ${accent.hex}` : "none",
          transition: "all 0.4s" }} />
        <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700,
          letterSpacing: "0.18em", textTransform: "uppercase",
          color: scanning ? accent.hex : "rgba(255,255,255,0.15)",
          textShadow: scanning ? `0 0 8px ${accent.hex}` : "none",
          transition: "all 0.4s" }}>
          {scanning ? "LIVE" : "IDLE"}
        </span>
      </div>
    </div>
  );
}
