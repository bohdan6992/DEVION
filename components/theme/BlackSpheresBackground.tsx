"use client";

import React, { useEffect, useRef } from "react";

type Sphere = {
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const BG_COLOR = "#020203";

function createSphere(width: number, height: number): Sphere {
  const radius = Math.random() * 60 + 20;
  return {
    radius,
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
  };
}

export default function BlackSpheresBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationId = 0;
    let spheres: Sphere[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(18, Math.floor((width * height) / 30000));
      spheres = Array.from({ length: count }, () => createSphere(width, height));
    };

    const updateSphere = (sphere: Sphere) => {
      sphere.x += sphere.vx;
      sphere.y += sphere.vy;

      if (sphere.x + sphere.radius < 0) sphere.x = width + sphere.radius;
      if (sphere.x - sphere.radius > width) sphere.x = -sphere.radius;
      if (sphere.y + sphere.radius < 0) sphere.y = height + sphere.radius;
      if (sphere.y - sphere.radius > height) sphere.y = -sphere.radius;
    };

    const drawSphere = (sphere: Sphere) => {
      const gradient = ctx.createRadialGradient(
        sphere.x - sphere.radius * 0.3,
        sphere.y - sphere.radius * 0.3,
        sphere.radius * 0.1,
        sphere.x,
        sphere.y,
        sphere.radius
      );

      gradient.addColorStop(0, "#1a1a1c");
      gradient.addColorStop(0.5, "#08080a");
      gradient.addColorStop(1, BG_COLOR);

      ctx.beginPath();
      ctx.arc(sphere.x, sphere.y, sphere.radius, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(255,255,255,0.05)";
      ctx.shadowBlur = 15;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const render = () => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      for (const sphere of spheres) {
        updateSphere(sphere);
        drawSphere(sphere);
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
        className="pointer-events-none fixed z-0 rounded-full opacity-[0.05]"
        style={{
          width: "60vw",
          height: "60vw",
          top: "-20%",
          left: "-10%",
          background: "#ffffff",
          filter: "blur(120px)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed z-0 rounded-full opacity-[0.05]"
        style={{
          width: "60vw",
          height: "60vw",
          right: "-10%",
          bottom: "-10%",
          background: "#1a1a1a",
          filter: "blur(120px)",
        }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
        aria-hidden="true"
      />
    </>
  );
}
