"use client";

import React, { useEffect, useRef } from "react";

type ThemeMode = "space" | "neon" | "dark" | "light" | "aurora" | null;

type Star = { x: number; y: number; size: number; opacity: number; blinkSpeed: number; color: string };
type Dust = { x: number; y: number; size: number; opacity: number; color: string };
type Nebula = { x: number; y: number; r: number; color: string };
type ShootingStar = { x: number; y: number; speed: number; opacity: number; len: number };
type NeonParticle = { x: number; y: number; size: number; speedX: number; speedY: number; color: string };
type DarkBlob = {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  phase: number;
};
type LightBlob = {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  phase: number;
};
type AuroraRing = {
  z: number;
  color: string;
  rotation: number;
};

function readMode(): ThemeMode {
  const theme = (document.documentElement.getAttribute("data-theme") || "").toLowerCase();
  if (theme === "space") return "space";
  if (theme === "neon") return "neon";
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (theme === "aurora") return "aurora";
  return null;
}

export default function ThemeStarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let animationId = 0;
    let running = false;
    let mode: ThemeMode = null;

    let starLayers: Star[][] = [];
    let milkyWayParticles: Dust[] = [];
    let nebulae: Nebula[] = [];
    let shootingStars: ShootingStar[] = [];

    let gridOffset = 0;
    let neonParticles: NeonParticle[] = [];

    let darkBlobs: DarkBlob[] = [];
    let lightBlobs: LightBlob[] = [];
    let auroraRings: AuroraRing[] = [];
    let auroraTime = 0;
    let auroraSpeed = 0.05;
    let auroraTargetSpeed = 0.05;
    let glitchFlashAlpha = 0;
    let mouseX = width * 0.5;
    let mouseY = height * 0.5;
    let noiseCanvas: HTMLCanvasElement | null = null;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createSpaceScene = () => {
      nebulae = [
        { x: width * 0.2, y: height * 0.3, r: width * 0.5, color: "rgba(40, 20, 80, 0.15)" },
        { x: width * 0.8, y: height * 0.7, r: width * 0.4, color: "rgba(20, 40, 60, 0.12)" },
        { x: width * 0.5, y: height * 0.5, r: width * 0.6, color: "rgba(60, 30, 20, 0.08)" },
      ];

      milkyWayParticles = [];
      const particleCount = Math.floor(Math.max(width, height) * 1.6);
      const angle = -Math.PI / 4;
      const dustColors = ["#ffffff", "#ffd1d1", "#d1e0ff", "#fff4d1"];

      for (let i = 0; i < particleCount; i += 1) {
        const pos = (Math.random() - 0.5) * Math.max(width, height) * 1.8;
        const drift = (Math.random() - 0.5) * 250;
        const x = width / 2 + pos * Math.cos(angle) - drift * Math.sin(angle);
        const y = height / 2 + pos * Math.sin(angle) + drift * Math.cos(angle);
        milkyWayParticles.push({
          x,
          y,
          size: Math.random() * 1.2,
          opacity: Math.random() * 0.2,
          color: dustColors[Math.floor(Math.random() * dustColors.length)] || "#ffffff",
        });
      }

      starLayers = [];
      for (let layer = 0; layer < 2; layer += 1) {
        const layerStars: Star[] = [];
        const count = 250 - layer * 50;
        for (let i = 0; i < count; i += 1) {
          layerStars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: (Math.random() * 0.5 + 0.15) * (layer + 1),
            opacity: Math.random() * 0.7 + 0.2,
            blinkSpeed: 0.0005 + Math.random() * 0.0015,
            color: "#ffffff",
          });
        }
        starLayers.push(layerStars);
      }

      shootingStars = [];
    };

    const createNeonScene = () => {
      gridOffset = 0;
      neonParticles = [];
      for (let i = 0; i < 50; i += 1) {
        neonParticles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2 + 1,
          speedX: (Math.random() - 0.5) * 2,
          speedY: (Math.random() - 0.5) * 2,
          color: Math.random() > 0.5 ? "#00f2ff" : "#ff00ff",
        });
      }
    };

    const createNoise = () => {
      const n = document.createElement("canvas");
      n.width = 256;
      n.height = 256;
      const nctx = n.getContext("2d");
      if (!nctx) {
        noiseCanvas = null;
        return;
      }
      nctx.clearRect(0, 0, n.width, n.height);
      for (let i = 0; i < 3800; i += 1) {
        const x = Math.floor(Math.random() * n.width);
        const y = Math.floor(Math.random() * n.height);
        const a = Math.random() * 0.2;
        nctx.fillStyle = `rgba(255,255,255,${a})`;
        nctx.fillRect(x, y, 1, 1);
      }
      noiseCanvas = n;
    };

    const createDarkScene = () => {
      darkBlobs = [];
      const colors = [
        "rgba(40, 50, 110, 0.4)",
        "rgba(30, 30, 50, 0.5)",
        "rgba(80, 40, 100, 0.2)",
        "rgba(20, 80, 90, 0.2)",
      ];
      for (let i = 0; i < colors.length; i += 1) {
        const r = Math.random() * 400 + 300;
        darkBlobs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseRadius: r,
          radius: r,
          color: colors[i] || "rgba(40, 50, 110, 0.4)",
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          phase: Math.random() * Math.PI * 2,
        });
      }
      createNoise();
    };

    const createLightScene = () => {
      lightBlobs = [];
      const colors = [
        "rgba(255, 173, 173, 0.5)",
        "rgba(255, 214, 165, 0.5)",
        "rgba(255, 255, 186, 0.6)",
        "rgba(202, 255, 191, 0.5)",
        "rgba(155, 246, 255, 0.5)",
        "rgba(160, 196, 255, 0.5)",
        "rgba(189, 178, 255, 0.5)",
        "rgba(255, 198, 255, 0.5)",
        "rgba(144, 224, 239, 0.4)",
        "rgba(251, 234, 235, 0.6)",
      ];

      for (const color of colors) {
        const r = Math.random() * 300 + 400;
        lightBlobs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseRadius: r,
          radius: r,
          color,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
      createNoise();
    };

    const createAuroraScene = () => {
      const ringCount = 40;
      auroraTime = 0;
      auroraSpeed = 0.05;
      auroraTargetSpeed = 0.05;
      glitchFlashAlpha = 0;
      auroraRings = [];

      for (let i = 0; i < ringCount; i += 1) {
        auroraRings.push({
          z: (i / ringCount) * 2000,
          color: i % 2 === 0 ? "#00f2ff" : "#ff00c1",
          rotation: Math.random() * Math.PI * 2,
        });
      }
    };

    const rebuild = () => {
      mode = readMode();
      canvas.style.display = mode ? "block" : "none";
      canvas.style.filter = mode === "dark" ? "blur(80px)" : mode === "light" ? "blur(110px)" : "none";
      canvas.style.transform = mode === "dark" ? "scale(1.1)" : mode === "light" ? "scale(1.15)" : "none";

      if (!mode) {
        running = false;
        window.cancelAnimationFrame(animationId);
        ctx.clearRect(0, 0, width, height);
        return;
      }

      resize();
      if (mode === "space") createSpaceScene();
      if (mode === "neon") createNeonScene();
      if (mode === "dark") createDarkScene();
      if (mode === "light") createLightScene();
      if (mode === "aurora") createAuroraScene();
      running = true;
    };

    const drawSpace = () => {
      ctx.fillStyle = "#010103";
      ctx.fillRect(0, 0, width, height);

      for (const n of nebulae) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, n.color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      for (const p of milkyWayParticles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const layer of starLayers) {
        for (const star of layer) {
          star.opacity += star.blinkSpeed;
          if (star.opacity > 0.9 || star.opacity < 0.2) star.blinkSpeed *= -1;
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.opacity;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (Math.random() < 0.002 && shootingStars.length < 1) {
        shootingStars.push({
          x: Math.random() * width,
          y: Math.random() * (height / 2),
          speed: 12,
          opacity: 1,
          len: 200,
        });
      }

      for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
        const s = shootingStars[i];
        ctx.save();
        ctx.globalAlpha = s.opacity;
        const g = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y + s.len * 0.3);
        g.addColorStop(0, "rgba(255, 255, 255, 1)");
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.len, s.y + s.len * 0.3);
        ctx.stroke();
        ctx.restore();

        s.x += s.speed;
        s.y += s.speed * 0.3;
        s.opacity -= 0.015;
        if (s.opacity <= 0) shootingStars.splice(i, 1);
      }
    };

    const drawNeon = () => {
      ctx.fillStyle = "rgba(5, 5, 5, 0.2)";
      ctx.fillRect(0, 0, width, height);

      const gridSize = 60;
      gridOffset += 0.5;
      if (gridOffset >= gridSize) gridOffset = 0;

      ctx.lineWidth = 1;
      for (let x = gridOffset; x < width; x += gridSize) {
        const opacity = 0.1 + Math.sin(x * 0.01 + gridOffset * 0.05) * 0.05;
        ctx.strokeStyle = `rgba(0, 242, 255, ${opacity})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00f2ff";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = gridOffset; y < height; y += gridSize) {
        const opacity = 0.1 + Math.sin(y * 0.01 + gridOffset * 0.05) * 0.05;
        ctx.strokeStyle = `rgba(255, 0, 255, ${opacity})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff00ff";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      for (const p of neonParticles) {
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > width) p.speedX *= -1;
        if (p.y < 0 || p.y > height) p.speedY *= -1;
      }
      ctx.shadowBlur = 0;

      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.2,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const drawDark = () => {
      const t = Date.now() * 0.001;
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, width, height);

      for (const b of darkBlobs) {
        b.x += b.vx;
        b.y += b.vy;
        b.radius = b.baseRadius + Math.sin(t + b.phase) * 50;

        if (b.x < -200 || b.x > width + 200) b.vx *= -1;
        if (b.y < -200 || b.y > height + 200) b.vy *= -1;

        const dx = mouseX - b.x;
        const dy = mouseY - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 800) {
          b.x -= dx * 0.001;
          b.y -= dy * 0.001;
        }

        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        g.addColorStop(0, b.color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (noiseCanvas) {
        ctx.globalAlpha = 0.03;
        ctx.drawImage(noiseCanvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    };

    const drawLight = () => {
      const t = Date.now() * 0.001;
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(0, 0, width, height);

      for (const b of lightBlobs) {
        b.x += b.vx;
        b.y += b.vy;
        b.phase += 0.004;
        b.radius = b.baseRadius + Math.sin(b.phase + t) * 100;

        if (b.x < -width * 0.2 || b.x > width * 1.2) b.vx *= -1;
        if (b.y < -height * 0.2 || b.y > height * 1.2) b.vy *= -1;

        const dx = mouseX - b.x;
        const dy = mouseY - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1000) {
          b.x -= dx * 0.0004;
          b.y -= dy * 0.0004;
        }

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, b.color);
        grad.addColorStop(0.6, b.color.replace(", 0.6)", ", 0.2)").replace(", 0.5)", ", 0.15)"));
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7
      );
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(255,255,255,0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (noiseCanvas) {
        ctx.globalAlpha = 0.07;
        ctx.drawImage(noiseCanvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    };

    const drawAurora = () => {
      auroraTime += 0.01;
      auroraSpeed += (auroraTargetSpeed - auroraSpeed) * 0.1;

      // Long motion trail.
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, width, height);

      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const perspective = 400;

      auroraRings.sort((a, b) => b.z - a.z);

      for (const ring of auroraRings) {
        ring.z -= auroraSpeed * 500;
        if (ring.z <= 0) {
          ring.z = 2000;
          ring.rotation += 0.5;
        }

        const scale = perspective / (perspective + ring.z);
        const size = 1500 * scale;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(ring.rotation + auroraTime * 0.2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 2 * scale * 5;
        ctx.globalAlpha = Math.min(1, (2000 - ring.z) / 1000);

        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (i * Math.PI * 2) / 6;
          const px = Math.cos(angle) * size;
          const py = Math.sin(angle) * size;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        if (ring.z < 800) {
          ctx.fillStyle = ring.color;
          for (let j = 0; j < 3; j += 1) {
            const a = Math.random() * Math.PI * 2;
            const rx = Math.cos(a) * size;
            const ry = Math.sin(a) * size;
            ctx.fillRect(rx, ry, 4 * scale, 20 * scale);
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Core singularity.
      const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100);
      coreGrad.addColorStop(0, "white");
      coreGrad.addColorStop(0.2, "#00f2ff");
      coreGrad.addColorStop(1, "transparent");
      ctx.fillStyle = coreGrad;
      ctx.globalAlpha = 0.5 + Math.sin(auroraTime * 10) * 0.2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // HUD overlay (frame + corner dots).
      ctx.strokeStyle = "rgba(0, 242, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
      ctx.fillStyle = "#00f2ff";
      ctx.beginPath();
      ctx.arc(10, 10, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff00c1";
      ctx.beginPath();
      ctx.arc(width - 10, height - 10, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Random glitch flash.
      if (Math.random() > 0.995) glitchFlashAlpha = 0.1;
      if (glitchFlashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${glitchFlashAlpha})`;
        ctx.fillRect(0, 0, width, height);
        glitchFlashAlpha = Math.max(0, glitchFlashAlpha - 0.02);
      }
    };

    const animate = () => {
      if (!running) return;
      if (mode === "space") drawSpace();
      if (mode === "neon") drawNeon();
      if (mode === "dark") drawDark();
      if (mode === "light") drawLight();
      if (mode === "aurora") drawAurora();
      animationId = window.requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!mode) return;
      resize();
      if (mode === "space") createSpaceScene();
      if (mode === "neon") createNeonScene();
      if (mode === "dark") createDarkScene();
      if (mode === "light") createLightScene();
      if (mode === "aurora") createAuroraScene();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseDown = () => {
      auroraTargetSpeed = 0.15;
    };

    const handleMouseUp = () => {
      auroraTargetSpeed = 0.05;
    };

    const themeObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "data-theme") {
          const wasRunning = running;
          rebuild();
          if (!wasRunning && running) animate();
          break;
        }
      }
    });

    rebuild();
    if (running) animate();

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      running = false;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
