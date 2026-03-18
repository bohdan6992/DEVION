"use client";

import React, { useEffect, useRef } from "react";

type RainDrop = {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
  opacity: number;
  thickness: number;
};

type TrailDrop = {
  x: number;
  y: number;
  r: number;
  life: number;
};

type WindowDrop = {
  x: number;
  y: number;
  r: number;
  v: number;
  accel: number;
  stretch: number;
  pause: number;
  trail: TrailDrop[];
};

const BG_COLOR = "#040406";
const WIND_ANGLE = 0.15;

function createRainDrop(width: number, height: number): RainDrop {
  const z = Math.random();
  return {
    x: Math.random() * (width + 400) - 200,
    y: Math.random() * height - height,
    z,
    speed: z * 35 + 30,
    len: z * 70 + 50,
    opacity: z * 0.15 + 0.03,
    thickness: z * 2 + 0.5,
  };
}

function createWindowDrop(width: number, height: number): WindowDrop {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 6 + 2,
    v: 0,
    accel: Math.random() * 0.008 + 0.004,
    stretch: 1,
    pause: Math.random() * 100,
    trail: [],
  };
}

export default function RainThemeBackground() {
  const rainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windowCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const rainCanvas = rainCanvasRef.current;
    const windowCanvas = windowCanvasRef.current;
    if (!rainCanvas || !windowCanvas) return;

    const rCtx = rainCanvas.getContext("2d");
    const wCtx = windowCanvas.getContext("2d");
    if (!rCtx || !wCtx) return;

    let width = 0;
    let height = 0;
    let beamPos = -0.5;
    let animationId = 0;
    let raindrops: RainDrop[] = [];
    let windowDrops: WindowDrop[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      rainCanvas.width = width;
      rainCanvas.height = height;
      windowCanvas.width = width;
      windowCanvas.height = height;

      rainCanvas.style.width = `${width}px`;
      rainCanvas.style.height = `${height}px`;
      windowCanvas.style.width = `${width}px`;
      windowCanvas.style.height = `${height}px`;

      raindrops = Array.from({ length: 1200 }, () => createRainDrop(width, height));
      windowDrops = Array.from({ length: 140 }, () => createWindowDrop(width, height));
    };

    const drawBeam = () => {
      beamPos += 0.0015;
      if (beamPos > 1.3) beamPos = -0.5;

      const beamX = beamPos * width;
      const grad = rCtx.createLinearGradient(beamX, 0, beamX + width * 0.5, 0);
      grad.addColorStop(0, "rgba(255, 245, 220, 0)");
      grad.addColorStop(0.5, "rgba(255, 245, 220, 0.05)");
      grad.addColorStop(1, "rgba(255, 245, 220, 0)");

      rCtx.fillStyle = grad;
      rCtx.fillRect(0, 0, width, height);
    };

    const updateRainDrop = (drop: RainDrop) => {
      drop.y += drop.speed;
      drop.x += drop.speed * WIND_ANGLE;

      if (drop.y > height) {
        drop.y = -drop.len;
        drop.x = Math.random() * (width + 400) - 200;
      }
    };

    const drawRainDrop = (drop: RainDrop) => {
      rCtx.strokeStyle = `rgba(180, 210, 240, ${drop.opacity})`;
      rCtx.lineWidth = drop.thickness;
      rCtx.lineCap = "round";
      rCtx.beginPath();
      rCtx.moveTo(drop.x, drop.y);
      rCtx.lineTo(drop.x + drop.len * WIND_ANGLE, drop.y + drop.len);
      rCtx.stroke();
    };

    const updateWindowDrop = (drop: WindowDrop) => {
      if (drop.pause > 0) {
        drop.pause -= 1;
        return;
      }

      drop.v += drop.accel;
      if (Math.random() > 0.985) drop.v += Math.random() * 1.5;
      drop.v *= 0.97;
      drop.y += drop.v;
      drop.stretch = 1 + drop.v * 0.15;
      drop.x += Math.sin(drop.y * 0.03) * (drop.v * 0.1);

      if (Math.random() > 0.4) {
        drop.trail.push({ x: drop.x, y: drop.y, r: drop.r * 0.8, life: 1 });
      }

      for (const trail of drop.trail) {
        trail.life -= 0.015;
      }
      drop.trail = drop.trail.filter((trail) => trail.life > 0);

      if (drop.y > height + 60) {
        drop.y = -60;
        drop.x = Math.random() * width;
        drop.v = 0;
        drop.pause = Math.random() * 180;
        drop.trail = [];
      }
    };

    const drawWindowDrop = (drop: WindowDrop) => {
      for (const trail of drop.trail) {
        wCtx.beginPath();
        wCtx.arc(trail.x, trail.y, trail.r, 0, Math.PI * 2);
        wCtx.fillStyle = `rgba(200, 220, 255, ${trail.life * 0.02})`;
        wCtx.fill();
      }

      wCtx.save();
      wCtx.translate(drop.x, drop.y);

      const beamCenterX = (beamPos + 0.2) * width;
      const distToBeam = Math.abs(drop.x - beamCenterX);
      const beamIntensity = Math.max(0, 1 - distToBeam / (width * 0.25));

      wCtx.beginPath();
      wCtx.ellipse(0, 0, drop.r, drop.r * drop.stretch, 0, 0, Math.PI * 2);

      const g = wCtx.createRadialGradient(-drop.r * 0.2, -drop.r * 0.2, 0, 0, 0, drop.r * drop.stretch);
      const alphaBase = 0.2 + beamIntensity * 0.4;
      g.addColorStop(0, `rgba(255, 255, 255, ${alphaBase})`);
      g.addColorStop(0.5, `rgba(160, 180, 220, ${0.05 + beamIntensity * 0.1})`);
      g.addColorStop(1, `rgba(255, 255, 255, ${0.05 + beamIntensity * 0.1})`);

      wCtx.fillStyle = g;
      wCtx.fill();

      wCtx.beginPath();
      wCtx.arc(-drop.r * 0.3, -drop.r * 0.3 * drop.stretch, drop.r * 0.4, 0, Math.PI * 2);
      wCtx.fillStyle = `rgba(255, 255, 255, ${0.2 + beamIntensity * 0.4})`;
      wCtx.fill();

      wCtx.restore();
    };

    const render = () => {
      rCtx.fillStyle = "rgba(4, 4, 6, 0.4)";
      rCtx.fillRect(0, 0, width, height);

      drawBeam();
      for (const drop of raindrops) {
        updateRainDrop(drop);
        drawRainDrop(drop);
      }

      wCtx.clearRect(0, 0, width, height);
      for (const drop of windowDrops) {
        updateWindowDrop(drop);
        drawWindowDrop(drop);
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
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "rgba(10, 15, 30, 0.2)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(circle, transparent 10%, rgba(0,0,0,0.9) 100%)",
        }}
        aria-hidden="true"
      />
      <canvas
        ref={rainCanvasRef}
        className="pointer-events-none fixed inset-0 z-0 block"
        style={{ filter: "blur(10px)" }}
        aria-hidden="true"
      />
      <canvas
        ref={windowCanvasRef}
        className="pointer-events-none fixed inset-0 z-0 block"
        style={{ filter: "blur(2.5px)" }}
        aria-hidden="true"
      />
    </>
  );
}
