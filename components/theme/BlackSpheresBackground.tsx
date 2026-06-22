"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; z: number;
  baseSize: number; size: number;
  speedX: number; speedY: number;
  wobbleSpeed: number; wobbleRange: number; angle: number;
  alpha: number; maxAlpha: number; fadeSpeed: number; isFadingIn: boolean;
  isBokeh: boolean;
}

function makeParticle(w: number, h: number, initRandomY: boolean): Particle {
  const z = Math.random() * 2.5 + 0.5;
  const baseSize = Math.random() * 0.7 + 0.2;
  const isBokeh = z < 0.8 && Math.random() > 0.5;
  let size      = baseSize / (z * 0.7);
  let maxAlpha  = (Math.random() * 0.65 + 0.45) / (z * 0.5);
  if (maxAlpha > 0.98) maxAlpha = 0.98;
  let speedX    = (Math.random() * 0.12 + 0.03) / z;
  let speedY    = (Math.random() * 0.15 + 0.05) / z;

  if (isBokeh) {
    size     = Math.random() * 4 + 3;
    maxAlpha = Math.random() * 0.14 + 0.07;
    speedX  *= 1.5;
    speedY  *= 1.5;
  }

  return {
    x: Math.random() * w,
    y: initRandomY ? Math.random() * h : (Math.random() > 0.5 ? -20 : h + 20),
    z, baseSize, size, speedX, speedY,
    wobbleSpeed: Math.random() * 0.002 + 0.001,
    wobbleRange: Math.random() * 0.3 + 0.1,
    angle: Math.random() * Math.PI * 2,
    alpha: 0, maxAlpha, fadeSpeed: Math.random() * 0.005 + 0.002,
    isFadingIn: true, isBokeh,
  };
}

function resetParticle(p: Particle, w: number, h: number): void {
  const z = Math.random() * 2.5 + 0.5;
  const baseSize = Math.random() * 0.7 + 0.2;
  const isBokeh = z < 0.8 && Math.random() > 0.5;
  let size      = baseSize / (z * 0.7);
  let maxAlpha  = (Math.random() * 0.65 + 0.45) / (z * 0.5);
  if (maxAlpha > 0.98) maxAlpha = 0.98;
  let speedX    = (Math.random() * 0.12 + 0.03) / z;
  let speedY    = (Math.random() * 0.15 + 0.05) / z;
  if (isBokeh) {
    size = Math.random() * 4 + 3; maxAlpha = Math.random() * 0.14 + 0.07;
    speedX *= 1.5; speedY *= 1.5;
  }
  p.x = Math.random() * w;
  p.y = Math.random() > 0.5 ? -20 : h + 20;
  p.z = z; p.baseSize = baseSize; p.size = size;
  p.speedX = speedX; p.speedY = speedY;
  p.wobbleSpeed = Math.random() * 0.002 + 0.001;
  p.wobbleRange = Math.random() * 0.3 + 0.1;
  p.angle = Math.random() * Math.PI * 2;
  p.alpha = 0; p.maxAlpha = maxAlpha; p.fadeSpeed = Math.random() * 0.005 + 0.002;
  p.isFadingIn = true; p.isBokeh = isBokeh;
}

export default function BlackSpheresBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let particles: Particle[] = [];
    let raf = 0;
    let w = 0, h = 0;

    const lightSource = { x: 0, y: 0, radius: 0 };

    const setup = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth; h = window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      lightSource.x = w * 0.5;
      lightSource.y = -h * 0.15;
      lightSource.radius = Math.max(w, h) * 1.1;

      const target = Math.min(1200, Math.floor((w * h) / 1200));
      while (particles.length < target) particles.push(makeParticle(w, h, true));
      if (particles.length > target) particles.splice(target);
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);

      // deep dark background with light cone from above
      const bg = ctx.createRadialGradient(
        lightSource.x, lightSource.y * 1.2, 70,
        w / 2, h / 2, Math.max(w, h) * 1.3,
      );
      bg.addColorStop(0,   "#1a1a1e");
      bg.addColorStop(0.3, "#0c0c0d");
      bg.addColorStop(0.6, "#060607");
      bg.addColorStop(1,   "#010101");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // sort back-to-front for 3-D layering
      particles.sort((a, b) => b.z - a.z);

      for (const p of particles) {
        // wobble
        p.angle += p.wobbleSpeed;
        p.x += p.speedX + Math.sin(p.angle + time * 0.0005) * p.wobbleRange;
        p.y += p.speedY + Math.cos(p.angle + time * 0.0003) * (p.wobbleRange * 0.5);

        // fade in
        if (p.isFadingIn) {
          p.alpha = Math.min(p.alpha + p.fadeSpeed, p.maxAlpha);
          if (p.alpha >= p.maxAlpha) p.isFadingIn = false;
        }

        // respawn when off-screen
        if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
          resetParticle(p, w, h);
          continue;
        }

        // lighting
        const dx = p.x - lightSource.x;
        const dy = p.y - lightSource.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let lf = 0.25;
        if (dist < lightSource.radius) lf += (1 - dist / lightSource.radius) * 1.5;
        const ca = p.alpha * lf;

        ctx.beginPath();
        if (p.isBokeh) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0,   `rgba(90,90,90,${ca})`);
          g.addColorStop(0.5, `rgba(75,75,75,${ca * 0.4})`);
          g.addColorStop(1,   "rgba(75,75,75,0)");
          ctx.fillStyle = g;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        } else if (p.z > 2.0) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
          g.addColorStop(0, `rgba(100,100,100,${ca * 1.3})`);
          g.addColorStop(1, "rgba(100,100,100,0)");
          ctx.fillStyle = g;
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = `rgba(95,95,95,${ca * 1.2})`;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 200); };
    window.addEventListener("resize", onResize);
    setup();
    raf = requestAnimationFrame(loop);

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
          background: "radial-gradient(circle at 50% 30%, transparent 25%, rgba(3,3,3,0.30) 100%)",
        }}
      />
    </>
  );
}
