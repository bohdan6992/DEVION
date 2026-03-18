"use client";

import React, { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
  blinkSpeed: number;
  blinkDir: number;
  color: string;
};

type Nebula = {
  x: number;
  y: number;
  r: number;
  color: string;
};

type Comet = {
  active: boolean;
  x: number;
  y: number;
  speed: number;
  angle: number;
  len: number;
  opacity: number;
};

type StarCluster = {
  stars: Star[];
};

const BG_COLOR = "#010103";
const STAR_COLORS = ["#ffffff", "#eef2ff", "#d0e0ff", "#f0f4ff", "#b0c4ff"];
const NEBULA_COLORS = [
  "rgba(0, 60, 255, 0.06)",
  "rgba(0, 20, 150, 0.05)",
  "rgba(70, 0, 200, 0.04)",
  "rgba(0, 100, 255, 0.03)",
];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function createStar(width: number, height: number, cluster = false, x?: number, y?: number): Star {
  const z = Math.random();
  return {
    x: x ?? Math.random() * width,
    y: y ?? Math.random() * height,
    z,
    size: cluster ? Math.random() * 0.7 * z : Math.random() * 1.4 * z,
    opacity: Math.random() * 0.7 + 0.3,
    blinkSpeed: Math.random() * 0.015 + 0.002,
    blinkDir: Math.random() > 0.5 ? 1 : -1,
    color: pickRandom(STAR_COLORS),
  };
}

function createNebula(width: number, height: number): Nebula {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 500 + 300,
    color: pickRandom(NEBULA_COLORS),
  };
}

function createComet(width: number, height: number): Comet {
  const active = Math.random() <= 0.003;
  return {
    active,
    x: Math.random() * width,
    y: Math.random() * (height / 2),
    speed: Math.random() * 8 + 10,
    angle: Math.PI / 4 + Math.random() * 0.3,
    len: Math.random() * 120 + 80,
    opacity: 1,
  };
}

function resetComet(comet: Comet, width: number, height: number) {
  if (Math.random() > 0.003 && !comet.active) return;
  comet.active = true;
  comet.x = Math.random() * width;
  comet.y = Math.random() * (height / 2);
  comet.speed = Math.random() * 8 + 10;
  comet.angle = Math.PI / 4 + Math.random() * 0.3;
  comet.len = Math.random() * 120 + 80;
  comet.opacity = 1;
}

function createCluster(width: number, height: number): StarCluster {
  const centerX = Math.random() * width;
  const centerY = Math.random() * height;
  const starCount = Math.floor(Math.random() * 50 + 40);
  const radius = Math.random() * 120 + 60;
  const stars: Star[] = [];

  for (let i = 0; i < starCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 2) * radius;
    const x = centerX + Math.cos(angle) * d;
    const y = centerY + Math.sin(angle) * d;
    stars.push(createStar(width, height, true, x, y));
  }

  return { stars };
}

export default function SpaceThemeBackground() {
  const spaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const spaceCanvas = spaceCanvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!spaceCanvas || !fxCanvas) return;

    const sCtx = spaceCanvas.getContext("2d");
    const fCtx = fxCanvas.getContext("2d");
    if (!sCtx || !fCtx) return;

    let width = 0;
    let height = 0;
    let animationId = 0;
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    let comets: Comet[] = [];
    let clusters: StarCluster[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      spaceCanvas.width = width;
      spaceCanvas.height = height;
      fxCanvas.width = width;
      fxCanvas.height = height;
      spaceCanvas.style.width = `${width}px`;
      spaceCanvas.style.height = `${height}px`;
      fxCanvas.style.width = `${width}px`;
      fxCanvas.style.height = `${height}px`;

      stars = Array.from({ length: 900 }, () => createStar(width, height));
      nebulae = Array.from({ length: 12 }, () => createNebula(width, height));
      comets = Array.from({ length: 3 }, () => createComet(width, height));
      clusters = Array.from({ length: Math.floor(Math.random() * 4 + 6) }, () => createCluster(width, height));
    };

    const updateStar = (star: Star) => {
      star.opacity += star.blinkSpeed * star.blinkDir;
      if (star.opacity > 1 || star.opacity < 0.2) star.blinkDir *= -1;
    };

    const drawStar = (star: Star) => {
      sCtx.fillStyle = star.color;
      sCtx.globalAlpha = star.opacity * star.z;
      sCtx.beginPath();
      sCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      sCtx.fill();

      if (star.z > 0.8 && star.opacity > 0.8) {
        sCtx.shadowBlur = 5;
        sCtx.shadowColor = star.color;
        sCtx.fill();
        sCtx.shadowBlur = 0;
      }
    };

    const drawNebula = (nebula: Nebula) => {
      const grad = sCtx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.r);
      grad.addColorStop(0, nebula.color);
      grad.addColorStop(0.5, nebula.color.replace("0.", "0.01"));
      grad.addColorStop(1, "transparent");
      sCtx.globalAlpha = 1;
      sCtx.fillStyle = grad;
      sCtx.beginPath();
      sCtx.arc(nebula.x, nebula.y, nebula.r, 0, Math.PI * 2);
      sCtx.fill();
    };

    const updateComet = (comet: Comet) => {
      if (!comet.active) {
        resetComet(comet, width, height);
        return;
      }

      comet.x += Math.cos(comet.angle) * comet.speed;
      comet.y += Math.sin(comet.angle) * comet.speed;
      comet.opacity -= 0.012;

      if (comet.opacity <= 0 || comet.x > width || comet.y > height) {
        comet.active = false;
      }
    };

    const drawComet = (comet: Comet) => {
      if (!comet.active) return;

      fCtx.save();
      fCtx.globalAlpha = comet.opacity;
      const grad = fCtx.createLinearGradient(
        comet.x,
        comet.y,
        comet.x - Math.cos(comet.angle) * comet.len,
        comet.y - Math.sin(comet.angle) * comet.len
      );
      grad.addColorStop(0, "rgba(200, 240, 255, 0.9)");
      grad.addColorStop(0.2, "rgba(0, 100, 255, 0.5)");
      grad.addColorStop(1, "transparent");

      fCtx.strokeStyle = grad;
      fCtx.lineWidth = 2;
      fCtx.lineCap = "round";
      fCtx.shadowBlur = 10;
      fCtx.shadowColor = "rgba(0, 150, 255, 0.5)";
      fCtx.beginPath();
      fCtx.moveTo(comet.x, comet.y);
      fCtx.lineTo(
        comet.x - Math.cos(comet.angle) * comet.len,
        comet.y - Math.sin(comet.angle) * comet.len
      );
      fCtx.stroke();
      fCtx.restore();
    };

    const render = () => {
      sCtx.fillStyle = BG_COLOR;
      sCtx.globalAlpha = 1;
      sCtx.fillRect(0, 0, width, height);

      sCtx.globalCompositeOperation = "screen";
      for (const nebula of nebulae) drawNebula(nebula);
      sCtx.globalCompositeOperation = "source-over";

      for (const star of stars) {
        updateStar(star);
        drawStar(star);
      }

      for (const cluster of clusters) {
        for (const star of cluster.stars) {
          updateStar(star);
          drawStar(star);
        }
      }

      fCtx.clearRect(0, 0, width, height);
      for (const comet of comets) {
        updateComet(comet);
        drawComet(comet);
      }

      animationId = window.requestAnimationFrame(render);
    };

    resize();
    render();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundColor: BG_COLOR }}
        aria-hidden="true"
      />
      <canvas
        ref={spaceCanvasRef}
        className="pointer-events-none fixed inset-0 z-0 block"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(0, 50, 150, 0.08) 0%, transparent 70%)",
          animation: "space-pulse-glow 10s ease-in-out infinite alternate",
        }}
        aria-hidden="true"
      />
      <canvas
        ref={fxCanvasRef}
        className="pointer-events-none fixed inset-0 z-0 block"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(circle, transparent 30%, rgba(0,0,0,0.9) 100%)",
        }}
        aria-hidden="true"
      />
      <style jsx>{`
        @keyframes space-pulse-glow {
          from {
            opacity: 0.4;
            transform: scale(1);
          }
          to {
            opacity: 1;
            transform: scale(1.1);
          }
        }
      `}</style>
    </>
  );
}
