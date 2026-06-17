"use client";

import { useEffect, useRef } from "react";

const BG     = "#fff1f3";
const SHADOW = "rgba(210,95,115,0.08)";

const FEATHER_TEMPLATES = [
  { base: "#fff5f6", mid: "#ffa3b5", tip: "#f45c7a" },
  { base: "#ffffff", mid: "#ffb3c6", tip: "#ff4d6d" },
  { base: "#fff0f2", mid: "#ffccd5", tip: "#ff758f" },
  { base: "#fff9fa", mid: "#ffb5a7", tip: "#fec5bb" },
];

interface FeatherTemplate { base: string; mid: string; tip: string; }

function lerpColor(a: string, b: string, amount: number): string {
  const ah = parseInt(a.replace(/#/g, ""), 16);
  const ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const bh = parseInt(b.replace(/#/g, ""), 16);
  const br = bh >> 16, bg2 = (bh >> 8) & 0xff, bb = bh & 0xff;
  return `rgb(${Math.round(ar + amount * (br - ar))},${Math.round(ag + amount * (bg2 - ag))},${Math.round(ab + amount * (bb - ab))})`;
}

function createFeatherTexture(template: FeatherTemplate): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  const W = 240, H = 480;
  offscreen.width = W; offscreen.height = H;
  const oc = offscreen.getContext("2d")!;

  const cx = W / 2, startY = H - 60, endY = 50;
  const length = startY - endY;
  const curveAmount = (Math.random() - 0.5) * 20;

  const shaft = (t: number) => {
    const x = cx + Math.sin(t * Math.PI) * curveAmount;
    const y = startY - t * length;
    return { x, y, angle: Math.atan2(-1, curveAmount * Math.PI * Math.cos(t * Math.PI) / length) };
  };

  oc.globalCompositeOperation = "source-over";
  for (let i = 0; i < 800; i++) {
    const t = i / 800;
    const pt = shaft(t);
    let barbLen = Math.sin(t * Math.PI) * 75;
    if (t < 0.2) barbLen = t * 5 * 75;
    const color = t < 0.25
      ? lerpColor(template.base, template.mid, t / 0.25)
      : lerpColor(template.mid, template.tip, (t - 0.25) / 0.75);
    oc.strokeStyle = color;
    oc.globalAlpha = 0.35 + (1 - t) * 0.25;
    for (const side of [-1, 1] as const) {
      oc.lineWidth = 0.6 + Math.random() * 0.4;
      oc.beginPath();
      oc.moveTo(pt.x, pt.y);
      const ba = pt.angle + (0.3 + (1 - t) * 0.4) * side;
      oc.quadraticCurveTo(
        pt.x + Math.sin(ba) * (barbLen * 0.5) * side,
        pt.y + Math.cos(ba) * (barbLen * 0.5),
        pt.x + Math.sin(ba + 0.1 * side) * barbLen * side,
        pt.y + Math.cos(ba + 0.1 * side) * barbLen - 12 * (1 - t),
      );
      oc.stroke();
    }
  }

  oc.globalAlpha = 0.4;
  for (let i = 0; i < 180; i++) {
    const pt = shaft(Math.random() * 0.15);
    const fl = 25 + Math.random() * 30;
    const a = Math.random() * Math.PI * 2;
    oc.strokeStyle = template.base;
    oc.lineWidth = 0.5;
    oc.beginPath();
    oc.moveTo(pt.x, pt.y);
    oc.quadraticCurveTo(
      pt.x + Math.cos(a) * fl * 0.5, pt.y + Math.sin(a) * fl * 0.5,
      pt.x + Math.cos(a + (Math.random() - 0.5) * 1.5) * fl,
      pt.y + Math.sin(a + (Math.random() - 0.5) * 1.5) * fl,
    );
    oc.stroke();
  }

  oc.globalAlpha = 0.8;
  oc.lineWidth = 2.5;
  oc.strokeStyle = "rgba(255,255,255,0.9)";
  oc.beginPath();
  const s0 = shaft(0);
  oc.moveTo(s0.x, s0.y + 15);
  for (let i = 0; i <= 100; i++) { const p = shaft(i / 100); oc.lineTo(p.x, p.y); }
  oc.stroke();
  oc.lineWidth = 1.0;
  oc.strokeStyle = "rgba(180,80,100,0.35)";
  oc.stroke();

  return offscreen;
}

class FallingFeather {
  x = 0; y = 0; scale = 1;
  texture: HTMLCanvasElement;
  speedY = 0; speedX = 0;
  angle = 0; rotSpeed = 0;
  flutterAngle = 0; flutterSpeed = 0;
  waveOffset = 0;

  constructor(private textures: HTMLCanvasElement[], isInitial = false) {
    this.texture = textures[0];
    this.reset(isInitial);
  }

  reset(isInitial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    this.scale = 0.35 + Math.random() * 0.75;
    this.texture = this.textures[Math.floor(Math.random() * this.textures.length)];
    this.x = Math.random() * W;
    this.y = isInitial ? Math.random() * (H + 300) - 150 : -480 * this.scale;
    this.speedY = (0.45 + Math.random() * 0.4) * this.scale * 1.5;
    this.speedX = (0.2 + Math.random() * 0.35) * this.scale;
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.006;
    this.flutterAngle = Math.random() * Math.PI * 2;
    this.flutterSpeed = 0.008 + Math.random() * 0.012;
    this.waveOffset = Math.random() * 100;
  }

  update(time: number) {
    const W = window.innerWidth, H = window.innerHeight;
    this.y += this.speedY;
    this.x += Math.sin(time * 0.012 + this.waveOffset) * this.speedX;
    this.angle += this.rotSpeed + Math.sin(time * 0.004 + this.waveOffset) * 0.001;
    this.flutterAngle += this.flutterSpeed;
    if (this.y > H + 100 || this.x < -180 || this.x > W + 180) this.reset(false);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(this.scale * Math.cos(this.flutterAngle), this.scale);
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 12 * this.scale;
    ctx.shadowOffsetX = 4 * this.scale * (Math.cos(this.flutterAngle) >= 0 ? 1 : -1);
    ctx.shadowOffsetY = 8 * this.scale;
    ctx.drawImage(this.texture, -120, -240, 240, 480);
    ctx.restore();
  }
}

export default function FlamingoThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    let feathers: FallingFeather[] = [];
    let textures: HTMLCanvasElement[] = [];
    let time = 0;
    let raf = 0;

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);

      textures = FEATHER_TEMPLATES.map(t => createFeatherTexture(t));

      const density = (window.innerWidth * window.innerHeight) / 22000;
      const count = Math.min(38, Math.max(16, Math.floor(density)));
      feathers = Array.from({ length: count }, () => new FallingFeather(textures, true));
    };

    const loop = () => {
      time += 0.5;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      for (const f of feathers) f.update(time);
      feathers.sort((a, b) => a.scale - b.scale);
      for (const f of feathers) f.draw(ctx);
      raf = requestAnimationFrame(loop);
    };

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(init, 250); };
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
          mixBlendMode: "multiply", opacity: 0.16,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
}
