"use client";

import { useEffect, useRef } from "react";

const BG     = "#f6f4ee";
const STRIPE = "#11100e";
const SHADOW = "rgba(17,16,14,0.05)";

interface StripePoint {
  baseX: number;
  x: number;
  y: number;
  width: number;
}

class ZebraStripe {
  index: number; total: number; xBase: number;
  leftNeighbor: ZebraStripe | null;
  stripeType: number; yStart: number; yEnd: number;
  isBranch: boolean; mergeStartProgress: number; maxWidth: number;
  pointsCount: number; waveOffset: number; waveSpeed: number;
  frequency: number; slant: number; curveIntensity: number;
  points: StripePoint[];

  constructor(xBase: number, index: number, total: number, leftNeighbor: ZebraStripe | null, h: number) {
    this.index = index; this.total = total;
    this.xBase = xBase; this.leftNeighbor = leftNeighbor;

    this.stripeType = Math.random();
    if (this.stripeType < 0.15) {
      this.yStart = -100;
      this.yEnd = h * (0.35 + Math.random() * 0.3);
    } else if (this.stripeType < 0.3) {
      this.yStart = h * (0.35 + Math.random() * 0.3);
      this.yEnd = h + 100;
    } else {
      this.yStart = -100;
      this.yEnd = h + 100;
    }

    this.isBranch = Math.random() < 0.28 && leftNeighbor !== null;
    this.mergeStartProgress = 0.35 + Math.random() * 0.3;

    const centerFactor = 1 - Math.abs((index / total) - 0.5) * 1.1;
    this.maxWidth = (28 + Math.random() * 26) * Math.max(0.5, centerFactor);

    this.pointsCount = 40;
    this.waveOffset   = Math.random() * Math.PI * 2;
    this.waveSpeed    = 0.006 + Math.random() * 0.008;
    this.frequency    = 0.003 + Math.random() * 0.003;
    this.slant        = (Math.random() - 0.5) * 110;
    this.curveIntensity = 35 + Math.random() * 45;
    this.points = [];
    this.initPoints(h);
  }

  initPoints(h: number) {
    this.points = [];
    const step = (this.yEnd - this.yStart) / (this.pointsCount - 1);
    for (let i = 0; i < this.pointsCount; i++) {
      const py = this.yStart + i * step;
      const progress = i / (this.pointsCount - 1);
      const slantOffset    = (py / h) * this.slant;
      const mainWave       = Math.sin(py * this.frequency + this.waveOffset) * this.curveIntensity;
      const detailWave     = Math.sin(py * 0.015 + this.waveOffset * 1.4) * 12;
      const globalBodyWarp = Math.sin(py * 0.002) * 60;
      let px = this.xBase + slantOffset + mainWave + detailWave + globalBodyWarp;

      if (this.isBranch && this.leftNeighbor && progress > this.mergeStartProgress) {
        const mf = (progress - this.mergeStartProgress) / (1 - this.mergeStartProgress);
        const np = this.leftNeighbor.points[i];
        if (np) px = px * (1 - mf) + (np.baseX + np.width / 2) * mf;
      }

      let wf = Math.sin(progress * Math.PI);
      if (this.stripeType < 0.15) wf = Math.sin(progress * Math.PI / 2) * (1 - progress);
      else if (this.stripeType < 0.3) wf = Math.sin(progress * Math.PI / 2) * progress;
      if (this.isBranch && progress > this.mergeStartProgress) {
        const mf = (progress - this.mergeStartProgress) / (1 - this.mergeStartProgress);
        wf *= (1 - mf * 0.4);
      }

      this.points.push({ baseX: px, x: px, y: py, width: Math.max(0.1, this.maxWidth * wf) });
    }
  }

  update(time: number) {
    for (const pt of this.points) {
      const wave = Math.sin(pt.y * 0.0022 + time * this.waveSpeed + this.waveOffset) * 12;
      pt.x += (pt.baseX + wave - pt.x) * 0.06;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const n = this.points.length;
    if (n < 3) return;
    ctx.beginPath();
    let pt = this.points[0];
    ctx.moveTo(pt.x + pt.width / 2, pt.y);
    for (let i = 1; i < n; i++) {
      pt = this.points[i];
      const pp = this.points[i - 1];
      ctx.quadraticCurveTo(pp.x + pp.width / 2, pp.y, (pt.x + pt.width / 2 + pp.x + pp.width / 2) / 2, (pt.y + pp.y) / 2);
    }
    pt = this.points[n - 1];
    ctx.lineTo(pt.x - pt.width / 2, pt.y);
    for (let i = n - 2; i >= 0; i--) {
      pt = this.points[i];
      const np = this.points[i + 1];
      ctx.quadraticCurveTo(np.x - np.width / 2, np.y, (pt.x - pt.width / 2 + np.x - np.width / 2) / 2, (pt.y + np.y) / 2);
    }
    ctx.closePath();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = STRIPE;
    ctx.fill();
  }
}

export default function ZebraThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    let stripes: ZebraStripe[] = [];
    let time = 0;
    let raf = 0;

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      const w = window.innerWidth, h = window.innerHeight;
      stripes = [];
      const spacing = 68, margin = 180;
      const cols = Math.ceil((w + margin * 2) / spacing);
      for (let i = 0; i < cols; i++) {
        const xBase = -margin + i * spacing + (Math.random() - 0.5) * 15;
        stripes.push(new ZebraStripe(xBase, i, cols, i > 0 ? stripes[i - 1] : null, h));
      }
    };

    const loop = () => {
      time += 0.5;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      for (const s of stripes) { s.update(time); s.draw(ctx); }
      raf = requestAnimationFrame(loop);
    };

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(init, 200); };
    window.addEventListener("resize", onResize);
    init();
    loop();

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
          mixBlendMode: "multiply", opacity: 0.14,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
}
