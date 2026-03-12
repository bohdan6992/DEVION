"use client";

import React, { useEffect, useRef } from "react";

type ThemeMode = "space" | "neon" | "dark" | "light" | "aurora" | "matrix" | null;

type Star = { x: number; y: number; size: number; opacity: number; blinkSpeed: number; color: string };
type Dust = { x: number; y: number; size: number; opacity: number; color: string };
type Nebula = { x: number; y: number; r: number; color: string };
type ShootingStar = { x: number; y: number; speed: number; opacity: number; len: number };
type NeonLaser = {
  x: number;
  y: number;
  length: number;
  speed: number;
  vx: number;
  vy: number;
  color: string;
  opacity: number;
};
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
type GoldDustParticleKind = "background" | "normal" | "foreground";
type GoldDustParticle = {
  kind: GoldDustParticleKind;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  alpha: number;
  flicker: number;
  flickerOffset: number;
};
type GoldDustClusterParticle = {
  relX: number;
  relY: number;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  alpha: number;
  flicker: number;
  flickerOffset: number;
};
type GoldDustCluster = {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
  particles: GoldDustClusterParticle[];
};
type GoldDustCloud = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  speedX: number;
  speedY: number;
  alpha: number;
};
type MatrixColumn = {
  x: number;
  y: number;
  speed: number;
  brightness: number;
};

const AURORA_BACKGROUND_COUNT = 700;
const AURORA_PARTICLE_COUNT = 300;
const AURORA_FOREGROUND_COUNT = 18;
const AURORA_CLUSTER_COUNT = 6;
const AURORA_CLUSTER_PARTICLE_COUNT = 22;
const AURORA_CLOUD_COUNT = 6;
const MATRIX_FONT_SIZE = 22;
const MATRIX_CHARS = "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NEON_LASER_COUNT = 46;
const NEON_CONNECT_DISTANCE = 205;
const NEON_MOUSE_RADIUS = 200;
const NEON_COLORS = ["#3cf6ff", "#00f7ff", "#ff48f5", "#ff2f92", "#7dffef"];
const TARGET_FRAME_MS = 1000 / 30;

function readMode(): ThemeMode {
  const theme = (document.documentElement.getAttribute("data-theme") || "").toLowerCase();
  if (theme === "space") return "space";
  if (theme === "neon") return "neon";
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (theme === "aurora") return "aurora";
  if (theme === "matrix") return "matrix";
  return null;
}

export default function ThemeStarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let animationId = 0;
    let lastFrameTime = 0;
    let running = false;
    let pageVisible = !document.hidden;
    let mode: ThemeMode = null;

    let starLayers: Star[][] = [];
    let milkyWayParticles: Dust[] = [];
    let nebulae: Nebula[] = [];
    let shootingStars: ShootingStar[] = [];

    let neonLasers: NeonLaser[] = [];

    let darkBlobs: DarkBlob[] = [];
    let lightBlobs: LightBlob[] = [];
    let auroraTime = 0;
    let auroraSpeed = 0.05;
    let auroraTargetSpeed = 0.05;
    let mouseX = width * 0.5;
    let mouseY = height * 0.5;
    let noiseCanvas: HTMLCanvasElement | null = null;
    let staticLayerCanvas: HTMLCanvasElement | null = null;
    let auroraCloudSprite: HTMLCanvasElement | null = null;
    let goldDustBackground: GoldDustParticle[] = [];
    let goldDustParticles: GoldDustParticle[] = [];
    let goldDustForeground: GoldDustParticle[] = [];
    let goldDustClusters: GoldDustCluster[] = [];
    let goldDustClouds: GoldDustCloud[] = [];
    let matrixColumns: MatrixColumn[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, mode === "dark" || mode === "light" ? 1 : 1.1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createLayerCanvas = () => {
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.floor(width));
      layer.height = Math.max(1, Math.floor(height));
      return layer;
    };

    const getLayerContext = (layer: HTMLCanvasElement | null) => {
      if (!layer) return null;
      return layer.getContext("2d");
    };

    const createSpaceScene = () => {
      nebulae = [
        { x: width * 0.2, y: height * 0.3, r: width * 0.5, color: "rgba(40, 20, 80, 0.15)" },
        { x: width * 0.8, y: height * 0.7, r: width * 0.4, color: "rgba(20, 40, 60, 0.12)" },
        { x: width * 0.5, y: height * 0.5, r: width * 0.6, color: "rgba(60, 30, 20, 0.08)" },
      ];

      milkyWayParticles = [];
      const particleCount = Math.floor(Math.max(width, height) * 0.65);
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
        const count = 110 - layer * 20;
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

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "#010103";
        layerCtx.fillRect(0, 0, width, height);

        for (const n of nebulae) {
          const g = layerCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
          g.addColorStop(0, n.color);
          g.addColorStop(1, "transparent");
          layerCtx.fillStyle = g;
          layerCtx.fillRect(0, 0, width, height);
        }

        for (const p of milkyWayParticles) {
          layerCtx.fillStyle = p.color;
          layerCtx.globalAlpha = p.opacity;
          layerCtx.beginPath();
          layerCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          layerCtx.fill();
        }
        layerCtx.globalAlpha = 1;
      }
    };

    const createNeonScene = () => {
      neonLasers = Array.from({ length: NEON_LASER_COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1.35 + 0.85;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          length: Math.random() * 110 + 36,
          speed,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)] || "#0ff",
          opacity: Math.random() * 0.3 + 0.72,
        };
      });

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "#000";
        layerCtx.fillRect(0, 0, width, height);
        const centerGlow = layerCtx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.9);
        centerGlow.addColorStop(0, "rgba(40, 10, 70, 0.12)");
        centerGlow.addColorStop(0.45, "rgba(8, 28, 60, 0.08)");
        centerGlow.addColorStop(1, "rgba(0, 0, 0, 0.12)");
        layerCtx.fillStyle = centerGlow;
        layerCtx.fillRect(0, 0, width, height);

        const sideGlow = layerCtx.createLinearGradient(0, 0, width, height);
        sideGlow.addColorStop(0, "rgba(0, 255, 255, 0.035)");
        sideGlow.addColorStop(0.5, "rgba(0, 0, 0, 0)");
        sideGlow.addColorStop(1, "rgba(255, 0, 180, 0.04)");
        layerCtx.fillStyle = sideGlow;
        layerCtx.fillRect(0, 0, width, height);
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
      staticLayerCanvas = null;
      auroraCloudSprite = null;
      darkBlobs = [];
      const colors = [
        "rgba(40, 50, 110, 0.4)",
        "rgba(30, 30, 50, 0.5)",
        "rgba(80, 40, 100, 0.2)",
        "rgba(20, 80, 90, 0.2)",
      ];
      for (let i = 0; i < 3; i += 1) {
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
      staticLayerCanvas = null;
      auroraCloudSprite = null;
      lightBlobs = [];
      const colors = [
        "rgba(255, 173, 173, 0.5)",
        "rgba(255, 214, 165, 0.5)",
        "rgba(255, 255, 186, 0.6)",
        "rgba(202, 255, 191, 0.5)",
        "rgba(155, 246, 255, 0.5)",
        "rgba(160, 196, 255, 0.5)",
        "rgba(189, 178, 255, 0.5)",
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
      const makeParticle = (kind: GoldDustParticleKind): GoldDustParticle => {
        if (kind === "background") {
          return {
            kind,
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 0.9 + 0.3,
            speedX: (Math.random() - 0.5) * 0.15,
            speedY: Math.random() * 0.15 + 0.05,
            alpha: Math.random() * 0.3 + 0.05,
            flicker: Math.random() * 0.04,
            flickerOffset: Math.random() * Math.PI,
          };
        }

        if (kind === "foreground") {
          return {
            kind,
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 5.5 + 4.5,
            speedX: (Math.random() - 0.5) * 1.2,
            speedY: Math.random() * 0.8 + 0.6,
            alpha: Math.random() * 0.15 + 0.05,
            flicker: Math.random() * 0.04,
            flickerOffset: Math.random() * Math.PI,
          };
        }

        return {
          kind,
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 3.6 + 1.4,
          speedX: (Math.random() - 0.5) * 0.35,
          speedY: Math.random() * 0.3 + 0.1,
          alpha: Math.random() * 0.45 + 0.05,
          flicker: Math.random() * 0.04,
          flickerOffset: Math.random() * Math.PI,
        };
      };

      const makeCluster = (): GoldDustCluster => {
        const cluster: GoldDustCluster = {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 150 + 100,
          speedX: (Math.random() - 0.5) * 0.25,
          speedY: (Math.random() - 0.5) * 0.2 + 0.1,
          particles: [],
        };

        for (let i = 0; i < AURORA_CLUSTER_PARTICLE_COUNT; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * cluster.radius;
          cluster.particles.push({
            relX: Math.cos(angle) * dist,
            relY: Math.sin(angle) * dist,
            x: cluster.x,
            y: cluster.y,
            size: Math.random() * 1.8 + 0.8,
            speedX: (Math.random() - 0.5) * 0.25,
            speedY: (Math.random() - 0.5) * 0.25,
            alpha: Math.random() * 0.45 + 0.05,
            flicker: Math.random() * 0.04,
            flickerOffset: Math.random() * Math.PI,
          });
        }

        return cluster;
      };

      const makeCloud = (): GoldDustCloud => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radiusX: Math.random() * 220 + 140,
        radiusY: Math.random() * 120 + 70,
        speedX: (Math.random() - 0.5) * 0.08,
        speedY: Math.random() * 0.08 + 0.03,
        alpha: Math.random() * 0.07 + 0.03,
      });

      auroraTime = 0;
      auroraSpeed = 0.05;
      auroraTargetSpeed = 0.05;
      goldDustBackground = Array.from({ length: AURORA_BACKGROUND_COUNT }, () => makeParticle("background"));
      goldDustParticles = Array.from({ length: AURORA_PARTICLE_COUNT }, () => makeParticle("normal"));
      goldDustForeground = Array.from({ length: AURORA_FOREGROUND_COUNT }, () => makeParticle("foreground"));
      goldDustClusters = Array.from({ length: AURORA_CLUSTER_COUNT }, () => makeCluster());
      goldDustClouds = Array.from({ length: AURORA_CLOUD_COUNT }, () => makeCloud());

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "#010101";
        layerCtx.fillRect(0, 0, width, height);
        const grad = layerCtx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 1.1);
        grad.addColorStop(0, "rgba(70, 50, 15, 0.3)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = grad;
        layerCtx.fillRect(0, 0, width, height);

        const bloom = layerCtx.createRadialGradient(width / 2, height / 2, width * 0.04, width / 2, height / 2, width * 0.6);
        bloom.addColorStop(0, "rgba(255, 220, 150, 0.14)");
        bloom.addColorStop(0.35, "rgba(212, 175, 55, 0.08)");
        bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = bloom;
        layerCtx.fillRect(0, 0, width, height);
      }

      auroraCloudSprite = document.createElement("canvas");
      auroraCloudSprite.width = 256;
      auroraCloudSprite.height = 256;
      const cloudCtx = auroraCloudSprite.getContext("2d");
      if (cloudCtx) {
        const bright = "255, 245, 200";
        const gold = "212, 175, 55";
        const cloudGrad = cloudCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
        cloudGrad.addColorStop(0, `rgba(${bright}, 1)`);
        cloudGrad.addColorStop(0.45, `rgba(${gold}, 0.65)`);
        cloudGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        cloudCtx.fillStyle = cloudGrad;
        cloudCtx.fillRect(0, 0, 256, 256);
      }
    };

    const createMatrixScene = () => {
      const colCount = Math.floor(width / (MATRIX_FONT_SIZE * 0.8));
      matrixColumns = [];
      for (let i = 0; i < colCount; i += 1) {
        matrixColumns.push({
          x: i * (MATRIX_FONT_SIZE * 0.9),
          y: Math.random() * -height,
          speed: Math.random() * 0.2 + 0.3,
          brightness: Math.random() * 0.5 + 0.3,
        });
      }

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "rgba(0, 2, 0, 0.12)";
        layerCtx.fillRect(0, 0, width, height);
        const grad = layerCtx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 0.7);
        grad.addColorStop(0, "rgba(0, 30, 0, 0.2)");
        grad.addColorStop(0.7, "rgba(0, 5, 0, 0.05)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = grad;
        layerCtx.fillRect(0, 0, width, height);
      }
    };

    const rebuild = () => {
      mode = readMode();
      canvas.style.display = mode ? "block" : "none";
      canvas.style.filter = mode === "dark" ? "blur(48px)" : mode === "light" ? "blur(64px)" : "none";
      canvas.style.transform = mode === "dark" ? "scale(1.04)" : mode === "light" ? "scale(1.08)" : "none";

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
      if (mode === "matrix") createMatrixScene();
      running = true;
    };

    const drawSpace = () => {
      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "#010103";
        ctx.fillRect(0, 0, width, height);
      }

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

      if (Math.random() < 0.0012 && shootingStars.length < 1) {
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
      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(0, 0, width, height);
      }

      for (const laser of neonLasers) {
        laser.x += laser.vx;
        laser.y += laser.vy;

        if (laser.x > width + 100) laser.x = -100;
        else if (laser.x < -100) laser.x = width + 100;
        if (laser.y > height + 100) laser.y = -100;
        else if (laser.y < -100) laser.y = height + 100;

        const dx = mouseX - laser.x;
        const dy = mouseY - laser.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < NEON_MOUSE_RADIUS) {
          laser.vx += (dx / dist) * 0.05;
          laser.vy += (dy / dist) * 0.05;
          const mag = Math.hypot(laser.vx, laser.vy) || 1;
          laser.vx = (laser.vx / mag) * laser.speed;
          laser.vy = (laser.vy / mag) * laser.speed;
        }

        const tailX = laser.x - laser.vx * laser.length * 0.1;
        const tailY = laser.y - laser.vy * laser.length * 0.1;
        const coreAlpha = Math.min(1, laser.opacity + 0.12);

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = laser.color;
        ctx.lineWidth = 3.2;
        ctx.lineCap = "round";
        ctx.globalAlpha = laser.opacity;
        ctx.shadowBlur = 20;
        ctx.shadowColor = laser.color;
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.lineWidth = 1.05;
        ctx.globalAlpha = coreAlpha;
        ctx.shadowBlur = 8;
        ctx.shadowColor = laser.color;
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < neonLasers.length; i += 1) {
        for (let j = i + 1; j < neonLasers.length; j += 1) {
          const a = neonLasers[i];
          const b = neonLasers[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= NEON_CONNECT_DISTANCE) continue;

          ctx.beginPath();
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 0.65;
          ctx.globalAlpha = (1 - distance / NEON_CONNECT_DISTANCE) * 0.55;
          ctx.shadowBlur = 8;
          ctx.shadowColor = a.color;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
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
      auroraTime = Date.now() * 0.1;
      auroraSpeed += (auroraTargetSpeed - auroraSpeed) * 0.08;

      const gold = "212, 175, 55";
      const bright = "255, 245, 200";
      const margin = 300;

      const drawParticle = (
        particle: GoldDustParticle | GoldDustClusterParticle,
        x: number,
        y: number,
        alphaMod: number
      ) => {
        const distToCenter = Math.abs(x - width / 2) / (width / 2);
        const lightFactor = Math.max(0, 1 - distToCenter * 1.5);
        const currentAlpha =
          particle.alpha * (0.7 + Math.sin(auroraTime * particle.flicker + particle.flickerOffset) * 0.3);
        const finalAlpha = currentAlpha * (0.2 + lightFactor * alphaMod);
        const glowStrength = particle.size >= 2.2 ? (lightFactor > 0.4 ? 4.8 : 2.8) : 0;

        if (glowStrength > 0) {
          ctx.shadowBlur = particle.size * glowStrength;
          ctx.shadowColor =
            lightFactor > 0.4
              ? `rgba(${bright}, ${Math.min(finalAlpha * 1.8, 0.75)})`
              : `rgba(${gold}, ${Math.min(finalAlpha * 1.5, 0.55)})`;
        } else {
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        }
        ctx.fillStyle =
          lightFactor > 0.4 ? `rgba(${bright}, ${finalAlpha})` : `rgba(${gold}, ${finalAlpha})`;
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      };

      const updateParticle = (particle: GoldDustParticle) => {
        particle.x += particle.speedX * (0.8 + auroraSpeed * 4);
        particle.y += particle.speedY * (0.8 + auroraSpeed * 4);
        if (particle.y > height + margin) particle.y = -margin;
        if (particle.y < -margin) particle.y = height + margin;
        if (particle.x > width + margin) particle.x = -margin;
        if (particle.x < -margin) particle.x = width + margin;
      };

      const updateCluster = (cluster: GoldDustCluster) => {
        cluster.x += cluster.speedX * (0.8 + auroraSpeed * 4);
        cluster.y += cluster.speedY * (0.8 + auroraSpeed * 4);

        if (cluster.y > height + margin) cluster.y = -margin;
        if (cluster.y < -margin) cluster.y = height + margin;
        if (cluster.x > width + margin) cluster.x = -margin;
        if (cluster.x < -margin) cluster.x = width + margin;

        const clusterDrift = 0.7 + auroraSpeed * 2.5;
        for (const particle of cluster.particles) {
          particle.relX += particle.speedX * clusterDrift;
          particle.relY += particle.speedY * clusterDrift;
          particle.x = cluster.x + particle.relX;
          particle.y = cluster.y + particle.relY;
        }
      };

      const updateCloud = (cloud: GoldDustCloud) => {
        cloud.x += cloud.speedX * (0.8 + auroraSpeed * 2.5);
        cloud.y += cloud.speedY * (0.8 + auroraSpeed * 2.5);
        if (cloud.y > height + margin) cloud.y = -margin;
        if (cloud.y < -margin) cloud.y = height + margin;
        if (cloud.x > width + margin) cloud.x = -margin;
        if (cloud.x < -margin) cloud.x = width + margin;
      };

      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "#010101";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      for (const cloud of goldDustClouds) {
        updateCloud(cloud);
        if (auroraCloudSprite) {
          ctx.save();
          ctx.globalAlpha = Math.min(cloud.alpha * 1.8, 0.22);
          ctx.drawImage(
            auroraCloudSprite,
            cloud.x - cloud.radiusX,
            cloud.y - cloud.radiusY,
            cloud.radiusX * 2,
            cloud.radiusY * 2
          );
          ctx.restore();
        }
      }

      for (const particle of goldDustBackground) {
        updateParticle(particle);
        drawParticle(particle, particle.x, particle.y, 0.5);
      }

      for (const particle of goldDustParticles) {
        updateParticle(particle);
        drawParticle(particle, particle.x, particle.y, 0.8);
      }

      for (const cluster of goldDustClusters) {
        updateCluster(cluster);
        for (const particle of cluster.particles) {
          drawParticle(particle, particle.x, particle.y, 0.8);
        }
      }

      for (const particle of goldDustForeground) {
        updateParticle(particle);
        drawParticle(particle, particle.x, particle.y, 0.5);
      }

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    };

    const drawMatrix = () => {
      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "rgba(0, 2, 0, 0.12)";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.font = `700 ${MATRIX_FONT_SIZE}px monospace`;
      ctx.shadowBlur = 0;

      for (const col of matrixColumns) {
        const text = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)] || "0";
        const greenIntensity = Math.floor(col.brightness * 150 + 50);
        ctx.fillStyle = `rgb(0, ${greenIntensity}, 0)`;
        ctx.fillText(text, col.x, col.y);

        col.y += col.speed * MATRIX_FONT_SIZE * 0.5;
        if (col.y > height + MATRIX_FONT_SIZE * 5) {
          col.y = -MATRIX_FONT_SIZE;
          col.speed = Math.random() * 0.2 + 0.3;
          col.brightness = Math.random() * 0.5 + 0.3;
        }
      }
    };

    const animate = (time: number) => {
      animationId = 0;
      if (!running) return;
      if (!pageVisible) return;
      if (time - lastFrameTime < TARGET_FRAME_MS) {
        animationId = window.requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = time;
      if (mode === "space") drawSpace();
      if (mode === "neon") drawNeon();
      if (mode === "dark") drawDark();
      if (mode === "light") drawLight();
      if (mode === "aurora") drawAurora();
      if (mode === "matrix") drawMatrix();
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
      if (mode === "matrix") createMatrixScene();
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

    const handleVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (!pageVisible) {
        if (animationId) {
          window.cancelAnimationFrame(animationId);
          animationId = 0;
        }
        return;
      }
      lastFrameTime = 0;
      if (running && !animationId) animationId = window.requestAnimationFrame(animate);
    };

    const themeObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "data-theme") {
          const wasRunning = running;
          rebuild();
          if (!wasRunning && running && pageVisible && !animationId) {
            lastFrameTime = 0;
            animationId = window.requestAnimationFrame(animate);
          }
          break;
        }
      }
    });

    rebuild();
    if (running && pageVisible) animationId = window.requestAnimationFrame(animate);

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      running = false;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
