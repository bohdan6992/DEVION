"use client";

import { useEffect, useRef } from "react";

const CAMO_W = 2560;
const CAMO_H = 1600;

const COLORS = [
  "#847c61", // base khaki
  "#ded6b8", // light tan
  "#424831", // ranger green
  "#55473d", // earth brown
  "#21231a", // dark charcoal
];

function drawBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = r * (0.3 + Math.random() * 0.4);
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.5 + Math.random() * 0.6), 0, Math.PI * 2);
  }
  ctx.fill();
}

function buildCamoTexture(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CAMO_W; c.height = CAMO_H;
  const x = c.getContext("2d")!;

  x.fillStyle = COLORS[0];
  x.fillRect(0, 0, CAMO_W, CAMO_H);

  const area = CAMO_W * CAMO_H;
  for (let i = 0; i < area / 32000; i++)
    drawBlob(x, Math.random() * CAMO_W, Math.random() * CAMO_H, Math.random() * 140 + 80, COLORS[2]);
  for (let i = 0; i < area / 24000; i++)
    drawBlob(x, Math.random() * CAMO_W, Math.random() * CAMO_H, Math.random() * 90 + 50, COLORS[3]);
  for (let i = 0; i < area / 40000; i++)
    drawBlob(x, Math.random() * CAMO_W, Math.random() * CAMO_H, Math.random() * 60 + 30, COLORS[4]);

  for (let i = 0; i < 4500; i++) {
    x.fillStyle = Math.random() > 0.4 ? COLORS[1] : COLORS[4];
    x.globalAlpha = Math.random() * 0.7 + 0.3;
    x.beginPath();
    x.arc(Math.random() * CAMO_W, Math.random() * CAMO_H, Math.random() * 3 + 1, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;

  x.strokeStyle = "rgba(0,0,0,0.08)";
  x.lineWidth = 1;
  for (let i = 0; i < 80000; i++) {
    const tx = Math.random() * CAMO_W, ty = Math.random() * CAMO_H;
    const l = Math.random() * 3 + 2;
    x.beginPath(); x.moveTo(tx, ty);
    Math.random() > 0.5 ? x.lineTo(tx + l, ty) : x.lineTo(tx, ty + l);
    x.stroke();
  }
  x.strokeStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 40000; i++) {
    const tx = Math.random() * CAMO_W, ty = Math.random() * CAMO_H;
    const l = Math.random() * 2 + 1;
    x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + l, ty); x.stroke();
  }

  const rs = 22;
  x.strokeStyle = "rgba(255,255,255,0.05)";
  x.beginPath();
  for (let px = 0; px < CAMO_W; px += rs) {
    x.moveTo(px, 0); x.lineTo(px, CAMO_H);
    x.moveTo(px + 1.5, 0); x.lineTo(px + 1.5, CAMO_H);
  }
  for (let py = 0; py < CAMO_H; py += rs) {
    x.moveTo(0, py); x.lineTo(CAMO_W, py);
    x.moveTo(0, py + 1.5); x.lineTo(CAMO_W, py + 1.5);
  }
  x.stroke();

  x.strokeStyle = "rgba(0,0,0,0.08)";
  x.beginPath();
  for (let px = 0.5; px < CAMO_W; px += rs) {
    x.moveTo(px + 3, 0); x.lineTo(px + 3, CAMO_H);
  }
  for (let py = 0; py < CAMO_H; py += rs) {
    x.moveTo(0, py + 3); x.lineTo(CAMO_W, py + 3);
  }
  x.stroke();

  return c;
}

function waveH(x: number, t: number): number {
  return (
    Math.sin(x * 0.003 - t * 1.2) * 34 +
    Math.cos(x * 0.0075 - t * 2.3) * 10 +
    Math.sin(x * 0.018 - t * 3.8) * 3
  );
}

export default function KhakiThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const camo = buildCamoTexture();
    let w = 0, h = 0;
    let raf = 0;

    const setup = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const t = time * 0.0011;

      ctx.fillStyle = "#0a0b08";
      ctx.fillRect(0, 0, w, h);

      const step = 3;
      const blX = 40, blY = 100;

      for (let x = -blX; x < w + blX; x += step) {
        const h1 = waveH(x, t);
        const nx = x + step;
        const h2 = waveH(nx, t);

        const dx1 = x + Math.sin(x * 0.003 - t * 1.2) * 18;
        const dx2 = nx + Math.sin(nx * 0.003 - t * 1.2) * 18;
        const dw = dx2 - dx1;
        const dy = -blY + h1;
        const dh = h + blY * 2;

        const rel = (x + blX) / (w + blX * 2);
        const sx = Math.max(0, Math.min(CAMO_W - step, rel * (CAMO_W - 240) + 120));

        ctx.drawImage(camo, sx, 120, step, CAMO_H - 240, dx1, dy, dw + 0.7, dh);

        const slope = (h2 - h1) / step;
        const li = slope * 5.5;
        ctx.fillStyle = li > 0
          ? `rgba(255,255,255,${Math.min(0.24, li * 0.8)})`
          : `rgba(0,0,0,${Math.min(0.58, -li * 0.9)})`;
        ctx.fillRect(dx1, dy, dw + 0.7, dh);
      }
    };

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 200); };
    window.addEventListener("resize", onResize);
    setup();
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 0, display: "block" }}
      />
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(circle at 50% 50%, transparent 25%, rgba(0,0,0,0.7) 100%)",
        }}
      />
    </>
  );
}
