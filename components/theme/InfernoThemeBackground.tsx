"use client";

import { useEffect, useRef } from "react";

const BG = "#030100";

function preRenderTextures(): HTMLCanvasElement[] {
  const textures: HTMLCanvasElement[] = [];

  const makeCanvas = (size: number) => {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    return c;
  };

  // 0 — white-hot core
  const core = makeCanvas(140);
  {
    const g = core.getContext("2d")!;
    const grad = g.createRadialGradient(70, 70, 0, 70, 70, 70);
    grad.addColorStop(0,    "rgba(255,255,255,1.0)");
    grad.addColorStop(0.20, "rgba(255,225,120,0.85)");
    grad.addColorStop(0.45, "rgba(255,120,10,0.35)");
    grad.addColorStop(0.75, "rgba(200,30,0,0.08)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 140, 140);
  }
  textures.push(core);

  // 1 — orange mid flame
  const mid = makeCanvas(140);
  {
    const g = mid.getContext("2d")!;
    const grad = g.createRadialGradient(70, 70, 0, 70, 70, 70);
    grad.addColorStop(0,    "rgba(255,130,0,0.85)");
    grad.addColorStop(0.30, "rgba(215,55,5,0.50)");
    grad.addColorStop(0.65, "rgba(140,15,0,0.12)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 140, 140);
  }
  textures.push(mid);

  // 2 — deep crimson edge
  const cool = makeCanvas(140);
  {
    const g = cool.getContext("2d")!;
    const grad = g.createRadialGradient(70, 70, 0, 70, 70, 70);
    grad.addColorStop(0,    "rgba(180,25,2,0.65)");
    grad.addColorStop(0.40, "rgba(100,8,0,0.30)");
    grad.addColorStop(0.75, "rgba(45,2,0,0.06)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 140, 140);
  }
  textures.push(cool);

  // 3 — smoke
  const smoke = makeCanvas(180);
  {
    const g = smoke.getContext("2d")!;
    const grad = g.createRadialGradient(90, 90, 0, 90, 90, 90);
    grad.addColorStop(0,    "rgba(25,18,15,0.42)");
    grad.addColorStop(0.40, "rgba(15,10,8,0.22)");
    grad.addColorStop(0.75, "rgba(8,6,6,0.06)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 180, 180);
  }
  textures.push(smoke);

  return textures;
}

interface Ember { x: number; size: number; pulseSpeed: number; pulseOffset: number; heat: number; }

function makeEmbers(w: number): Ember[] {
  const count = Math.ceil(w / 15);
  return Array.from({ length: count }, (_, i) => ({
    x: i * 15,
    size: 15 + Math.random() * 20,
    pulseSpeed: 0.01 + Math.random() * 0.02,
    pulseOffset: Math.random() * Math.PI * 2,
    heat: 0.4 + Math.random() * 0.6,
  }));
}

class FlameParticle {
  x = 0; y = 0; size = 0; maxSize = 0;
  speedY = 0; speedX = 0; life = 0; decay = 0;
  texIndex = 0; waveOffset = 0; stretch = 0;

  constructor(private textures: HTMLCanvasElement[], isInitial = false) {
    this.reset(isInitial);
  }

  reset(isInitial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    const spread = W * 0.7, center = W / 2;
    this.x = center + (Math.random() - 0.5) * spread;
    this.y = isInitial ? Math.random() * H : H + 50 + Math.random() * 40;
    const cd = Math.abs(this.x - center) / (spread / 2);
    const hf = Math.max(0.1, 1.0 - cd);
    this.size = (80 + Math.random() * 100) * hf;
    this.maxSize = this.size;
    this.speedY = (1.6 + Math.random() * 2.6) * (1.0 + hf * 0.5);
    this.speedX = (Math.random() - 0.5) * 1.8;
    this.life = 1.0;
    this.decay = 0.005 + Math.random() * 0.01;
    const r = Math.random() * hf;
    this.texIndex = r > 0.55 ? 0 : r > 0.25 ? 1 : 2;
    this.waveOffset = Math.random() * 100;
    this.stretch = 1.7 + Math.random() * 0.9;
  }

  update(time: number) {
    this.y -= this.speedY;
    this.x += this.speedX + Math.sin(this.y * 0.008 + time * 0.03 + this.waveOffset) * 1.4;
    this.life -= this.decay;
    this.size = this.maxSize * Math.max(0, this.life);
    if (this.life <= 0 || this.size < 5) this.reset(false);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1.0, this.stretch);
    ctx.globalAlpha = this.life * 0.68;
    ctx.drawImage(this.textures[this.texIndex], -this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

class SmokeParticle {
  x = 0; y = 0; size = 0; speedY = 0; speedX = 0;
  life = 0; decay = 0; waveOffset = 0;

  constructor(private tex: HTMLCanvasElement, isInitial = false) { this.reset(isInitial); }

  reset(isInitial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    this.x = Math.random() * W;
    this.y = isInitial ? Math.random() * H * 0.7 : H * 0.6 + Math.random() * H * 0.4;
    this.size = 130 + Math.random() * 160;
    this.speedY = 0.9 + Math.random() * 1.3;
    this.speedX = (Math.random() - 0.5) * 1.2;
    this.life = 1.0;
    this.decay = 0.0025 + Math.random() * 0.0035;
    this.waveOffset = Math.random() * 100;
  }

  update(time: number) {
    this.y -= this.speedY;
    this.x += this.speedX + Math.sin(time * 0.012 + this.waveOffset) * 0.8;
    this.life -= this.decay;
    this.size += 0.5;
    if (this.life <= 0 || this.y < -180) this.reset(false);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = this.life * 0.32;
    ctx.drawImage(this.tex, -this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

class SparkParticle {
  x = 0; y = 0; size = 0; speedY = 0; speedX = 0;
  life = 0; decay = 0; waveOffset = 0;

  constructor(isInitial = false) { this.reset(isInitial); }

  reset(isInitial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    this.x = Math.random() * W;
    this.y = isInitial ? Math.random() * H * 0.8 : H * 0.5 + Math.random() * H * 0.5;
    this.size = 1.0 + Math.random() * 2.2;
    this.speedY = 2.2 + Math.random() * 4.5;
    this.speedX = (Math.random() - 0.5) * 4.5;
    this.life = 1.0;
    this.decay = 0.006 + Math.random() * 0.012;
    this.waveOffset = Math.random() * 100;
  }

  update(time: number) {
    this.y -= this.speedY;
    this.x += this.speedX + Math.sin(time * 0.05 + this.waveOffset) * 2.2;
    this.life -= this.decay;
    if (this.life <= 0 || this.y < -15) this.reset(false);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    const g = Math.floor(120 + this.life * 135);
    const b = Math.floor(this.life * 80);
    ctx.fillStyle = `rgba(255,${g},${b},${this.life})`;
    ctx.shadowColor = "rgba(255,110,0,0.75)";
    ctx.shadowBlur = 5;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

class AshParticle {
  x = 0; y = 0; size = 0; speedY = 0; speedX = 0;
  angle = 0; rotSpeed = 0; life = 0;

  constructor(isInitial = false) { this.reset(isInitial); }

  reset(isInitial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    this.x = Math.random() * W;
    this.y = isInitial ? Math.random() * H : -10;
    this.size = 1.5 + Math.random() * 3.0;
    this.speedY = 0.5 + Math.random() * 0.8;
    this.speedX = (Math.random() - 0.5) * 1.5;
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.02;
    this.life = 0.4 + Math.random() * 0.6;
  }

  update() {
    this.y -= this.speedY;
    this.x += this.speedX;
    this.angle += this.rotSpeed;
    if (this.y < -20) { this.reset(false); this.y = window.innerHeight + 10; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = `rgba(35,30,28,${this.life * 0.45})`;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

export default function InfernoThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    let textures: HTMLCanvasElement[] = [];
    let embers: Ember[] = [];
    let flames: FlameParticle[] = [];
    let smokes: SmokeParticle[] = [];
    let sparks: SparkParticle[] = [];
    let ashes: AshParticle[] = [];
    let time = 0;
    let raf = 0;

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);

      textures = preRenderTextures();
      embers   = makeEmbers(window.innerWidth);

      const W = window.innerWidth;
      const numSmoke  = Math.min(30, Math.floor(W / 55));
      const numFlame  = Math.min(95, Math.floor(W / 15));
      const numSparks = Math.min(50, Math.floor(W / 30));
      const numAsh    = Math.min(25, Math.floor(W / 60));

      smokes = Array.from({ length: numSmoke  }, () => new SmokeParticle(textures[3], true));
      flames = Array.from({ length: numFlame  }, () => new FlameParticle(textures, true));
      sparks = Array.from({ length: numSparks }, () => new SparkParticle(true));
      ashes  = Array.from({ length: numAsh    }, () => new AshParticle(true));
    };

    const loop = () => {
      time += 0.5;
      const W = window.innerWidth, H = window.innerHeight;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // smoke (behind fire)
      ctx.globalCompositeOperation = "source-over";
      for (const s of smokes) { s.update(time); s.draw(ctx); }

      // fire with additive blending
      ctx.globalCompositeOperation = "lighter";

      const glow = ctx.createLinearGradient(0, H - 140, 0, H);
      glow.addColorStop(0,   "rgba(0,0,0,0)");
      glow.addColorStop(0.4, "rgba(150,30,0,0.12)");
      glow.addColorStop(1,   "rgba(245,90,0,0.32)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, H - 160, W, 160);

      for (const f of flames) { f.update(time); f.draw(ctx); }
      for (const s of sparks) { s.update(time); s.draw(ctx); }

      // embers + ash on top
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;

      for (const emb of embers) {
        const pulse = Math.sin(time * emb.pulseSpeed + emb.pulseOffset);
        const gi = 0.15 + (pulse + 1) * 0.5 * 0.75 * emb.heat;
        const eg = ctx.createRadialGradient(emb.x, H, 0, emb.x, H, emb.size);
        eg.addColorStop(0,   `rgba(255,${Math.floor(80 + gi * 100)},0,${gi * 0.85})`);
        eg.addColorStop(0.5, `rgba(140,20,2,${gi * 0.4})`);
        eg.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(emb.x, H, emb.size, 0, Math.PI, true);
        ctx.fill();
      }

      for (const a of ashes) { a.update(); a.draw(ctx); }

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
          mixBlendMode: "screen", opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.35' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
}
