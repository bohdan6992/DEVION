"use client";

import React, { useEffect, useRef } from "react";

type ThemeMode = "space" | "neon" | "dark" | "light" | "sparkle" | "asher" | "matrix" | null;

type Star = { x: number; y: number; size: number; opacity: number; blinkSpeed: number; color: string };
type Dust = { x: number; y: number; size: number; opacity: number; color: string };
type Nebula = { x: number; y: number; r: number; color: string };
type ShootingStar = { x: number; y: number; speed: number; opacity: number; len: number };
type FallingStar = { x: number; y: number; vx: number; vy: number; opacity: number; len: number };
type PulsingSpaceStar = { x: number; y: number; size: number; phase: number; speed: number };
type NeonHex = {
  x: number;
  y: number;
  baseOpacity: number;
  currentOpacity: number;
  targetOpacity: number;
  color: string;
};
type NeonPulse = {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
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
  radius: number;
  color: string;
  vx: number;
  vy: number;
  opacity: number;
};
type LightDustParticle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
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
type AsherSmokeParticle = {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  opacity: number;
  maxOpacity: number;
  life: number;
  maxLife: number;
  angle: number;
  spin: number;
  stretch: number;
};
type AsherAshFlake = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  opacity: number;
  angle: number;
  spin: number;
  wobble: number;
};

const AURORA_BACKGROUND_COUNT = 700;
const AURORA_PARTICLE_COUNT = 300;
const AURORA_FOREGROUND_COUNT = 18;
const AURORA_CLUSTER_COUNT = 6;
const AURORA_CLUSTER_PARTICLE_COUNT = 22;
const AURORA_CLOUD_COUNT = 6;
const MATRIX_FONT_SIZE = 22;
const MATRIX_CHARS = "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const TARGET_FRAME_MS = 1000 / 30;

function readMode(): ThemeMode {
  const theme = (document.documentElement.getAttribute("data-theme") || "").toLowerCase();
  if (theme === "space") return "space";
  if (theme === "neon" || theme === "cyberpunk") return "neon";
  if (theme === "light" || theme === "pastel") return "light";
  if (theme === "sparkle") return "sparkle";
  if (theme === "asher") return "asher";
  if (theme === "matrix") return "matrix";
  if (
    theme === "dark" ||
    theme === "asher" ||
    theme === "solaris" ||
    theme === "oceanic" ||
    theme === "sakura" ||
    theme === "inferno" ||
    theme === "desert" ||
    theme === "midnight" ||
    theme === "forest" ||
    theme === "candy" ||
    theme === "monochrome"
  ) {
    return "dark";
  }
  return "dark";
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
    let pulsingSpaceStars: PulsingSpaceStar[] = [];
    let fallingStars: FallingStar[] = [];

    let neonLines: NeonHex[] = [];
    let neonConnections: NeonPulse[] = [];

    let darkBlobs: DarkBlob[] = [];
    let lightBlobs: LightBlob[] = [];
    let lightDustParticles: LightDustParticle[] = [];
    let sparkleTime = 0;
    let sparkleSpeed = 0.05;
    let sparkleTargetSpeed = 0.05;
    let mouseX = width * 0.5;
    let mouseY = height * 0.5;
    let noiseCanvas: HTMLCanvasElement | null = null;
    let staticLayerCanvas: HTMLCanvasElement | null = null;
    let sparkleCloudSprite: HTMLCanvasElement | null = null;
    let goldDustBackground: GoldDustParticle[] = [];
    let goldDustParticles: GoldDustParticle[] = [];
    let goldDustForeground: GoldDustParticle[] = [];
    let goldDustClusters: GoldDustCluster[] = [];
    let goldDustClouds: GoldDustCloud[] = [];
    let asherSmokeParticles: AsherSmokeParticle[] = [];
    let asherAshFlakes: AsherAshFlake[] = [];
    let matrixColumns: MatrixColumn[] = [];
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, mode === "dark" || mode === "light" || mode === "asher" ? 1 : 1.1);
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
      nebulae = [];
      milkyWayParticles = [];
      pulsingSpaceStars = [];
      fallingStars = [];

      const staticStars: Star[] = [];
      for (let i = 0; i < 1200; i += 1) {
        staticStars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 0.8 + 0.1,
          opacity: Math.random() * 0.5 + 0.1,
          blinkSpeed: 0,
          color: "#ffffff",
        });
      }
      starLayers = [staticStars];

      for (let i = 0; i < 25; i += 1) {
        pulsingSpaceStars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.2 + 0.5,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.03 + 0.01,
        });
      }

      const count = 5000;
      for (let i = 0; i < count; i += 1) {
        const pos = (Math.random() - 0.5) * 2200;
        const spread = (Math.random() - 0.5) * 350 * Math.exp(-(pos * pos) / 1200000);
        milkyWayParticles.push({
          x: pos,
          y: spread,
          size: Math.random() * 0.6 + 0.05,
          opacity: Math.random() * 0.4 + 0.05,
          color: Math.random() > 0.85 ? "#ffe0b0" : "#d0e0ff",
        });
      }

      shootingStars = [];

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "#010206";
        layerCtx.fillRect(0, 0, width, height);

        const ambientGrad = layerCtx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.9);
        ambientGrad.addColorStop(0, "rgba(18, 34, 92, 0.14)");
        ambientGrad.addColorStop(0.45, "rgba(8, 14, 38, 0.08)");
        ambientGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = ambientGrad;
        layerCtx.fillRect(0, 0, width, height);

        for (const p of milkyWayParticles) {
          layerCtx.save();
          layerCtx.translate(width / 2, height / 2);
          layerCtx.rotate(-Math.PI / 8);
          layerCtx.fillStyle = p.color;
          layerCtx.globalAlpha = p.opacity;
          layerCtx.beginPath();
          layerCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          layerCtx.fill();
          layerCtx.restore();
        }

        layerCtx.save();
        layerCtx.globalCompositeOperation = "screen";
        layerCtx.translate(width / 2, height / 2);
        layerCtx.rotate(-Math.PI / 8);

        const nebulaGrad = layerCtx.createRadialGradient(0, 0, 0, 0, 0, width * 0.8);
        nebulaGrad.addColorStop(0, "rgba(15, 30, 90, 0.35)");
        nebulaGrad.addColorStop(0.3, "rgba(10, 15, 40, 0.15)");
        nebulaGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.save();
        layerCtx.scale(4, 1);
        layerCtx.fillStyle = nebulaGrad;
        layerCtx.beginPath();
        layerCtx.arc(0, 0, width * 0.2, 0, Math.PI * 2);
        layerCtx.fill();
        layerCtx.restore();

        const coreGrad = layerCtx.createRadialGradient(0, 0, 0, 0, 0, 250);
        coreGrad.addColorStop(0, "rgba(255, 210, 160, 0.12)");
        coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = coreGrad;
        layerCtx.beginPath();
        layerCtx.arc(0, 0, 250, 0, Math.PI * 2);
        layerCtx.fill();
        layerCtx.restore();
      }
    };

    const createNeonScene = () => {
      const hexSize = 35;
      const hexWidth = hexSize * Math.sqrt(3);
      const hexHeight = hexSize * 2;
      const rows = Math.ceil(height / (hexHeight * 0.75)) + 1;
      const cols = Math.ceil(width / hexWidth) + 1;

      neonLines = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          let x = col * hexWidth;
          const y = row * hexHeight * 0.75;
          if (row % 2 === 1) x += hexWidth / 2;
          neonLines.push({
            x,
            y,
            baseOpacity: Math.random() * 0.04 + 0.02,
            currentOpacity: 0,
            targetOpacity: 0,
            color: Math.random() > 0.5 ? "0, 255, 255" : "180, 0, 255",
          });
        }
      }

      neonConnections = [
        {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 0,
          maxRadius: Math.random() * 500 + 300,
          speed: Math.random() * 0.8 + 0.4,
        },
        {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 0,
          maxRadius: Math.random() * 500 + 300,
          speed: Math.random() * 0.8 + 0.4,
        },
      ];

      staticLayerCanvas = createLayerCanvas();
      const layerCtx = getLayerContext(staticLayerCanvas);
      if (layerCtx) {
        layerCtx.fillStyle = "#05010a";
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
      sparkleCloudSprite = null;
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
      sparkleCloudSprite = null;
      lightBlobs = [];
      lightDustParticles = [];
      const colors = [
        "180, 150, 255",
        "210, 180, 255",
        "255, 160, 220",
        "140, 120, 240",
        "255, 200, 255",
      ];

      for (let i = 0; i < 10; i += 1) {
        const color = colors[Math.floor(Math.random() * colors.length)] || "210, 180, 255";
        const r = Math.random() * 500 + 300;
        lightBlobs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: r,
          color,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.4,
          opacity: Math.random() * 0.4 + 0.3,
        });
      }

      for (let i = 0; i < 70; i += 1) {
        lightDustParticles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2.5 + 1,
          speed: Math.random() * 0.3 + 0.1,
          opacity: Math.random() * 0.6 + 0.3,
        });
      }

      createNoise();
    };

    const createSparkleScene = () => {
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

      sparkleTime = 0;
      sparkleSpeed = 0.05;
      sparkleTargetSpeed = 0.05;
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
        bloom.addColorStop(0, "rgba(255, 244, 196, 0.14)");
        bloom.addColorStop(0.35, "rgba(254, 240, 138, 0.08)");
        bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
        layerCtx.fillStyle = bloom;
        layerCtx.fillRect(0, 0, width, height);
      }

      sparkleCloudSprite = document.createElement("canvas");
      sparkleCloudSprite.width = 256;
      sparkleCloudSprite.height = 256;
      const cloudCtx = sparkleCloudSprite.getContext("2d");
      if (cloudCtx) {
        const bright = "255, 250, 214";
        const gold = "254, 240, 138";
        const cloudGrad = cloudCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
        cloudGrad.addColorStop(0, `rgba(${bright}, 1)`);
        cloudGrad.addColorStop(0.45, `rgba(${gold}, 0.65)`);
        cloudGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        cloudCtx.fillStyle = cloudGrad;
        cloudCtx.fillRect(0, 0, 256, 256);
      }
    };

    const createAsherScene = () => {
      staticLayerCanvas = null;
      sparkleCloudSprite = null;
      darkBlobs = [];
      lightBlobs = [];
      asherSmokeParticles = Array.from({ length: 46 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 550 + 450,
        vx: (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.5) * 0.07,
        opacity: 0,
        maxOpacity: Math.random() * 0.08 + 0.04,
        life: Math.random(),
        maxLife: Math.random() * 0.0003 + 0.0001,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.0002,
        stretch: Math.random() * 2.5 + 2.0,
      }));
      asherAshFlakes = Array.from({ length: 40 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        w: Math.random() * 4 + 2,
        h: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.4) * 0.2,
        opacity: Math.random() * 0.3 + 0.1,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02,
        wobble: Math.random() * Math.PI * 2,
      }));
      createNoise();
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
      if (mode === "sparkle") createSparkleScene();
      if (mode === "asher") createAsherScene();
      if (mode === "matrix") createMatrixScene();
      running = true;
    };

    const drawSpace = () => {
      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "#010206";
        ctx.fillRect(0, 0, width, height);
      }

      for (const layer of starLayers) {
        for (const star of layer) {
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.opacity;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      for (const star of pulsingSpaceStars) {
        const opacity = 0.3 + Math.abs(Math.sin(Date.now() * 0.001 * star.speed * 60 + star.phase)) * 0.6;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (Math.random() > 0.99) {
        fallingStars.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.5,
          vx: Math.random() * 15 + 10,
          vy: Math.random() * 5 + 2,
          opacity: 1,
          len: Math.random() * 80 + 40,
        });
      }

      for (let i = fallingStars.length - 1; i >= 0; i -= 1) {
        const s = fallingStars[i];
        ctx.save();
        ctx.globalAlpha = s.opacity;
        const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 2, s.y - s.vy * 2);
        g.addColorStop(0, "rgba(255, 255, 255, 1)");
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
        ctx.stroke();
        ctx.restore();

        s.x += s.vx;
        s.y += s.vy;
        s.opacity -= 0.02;
        if (s.opacity <= 0) fallingStars.splice(i, 1);
      }

      const vignette = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.8, "rgba(0,0,0,0.3)");
      vignette.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const drawNeon = () => {
      if (staticLayerCanvas) ctx.drawImage(staticLayerCanvas, 0, 0, width, height);
      else {
        ctx.fillStyle = "#05010a";
        ctx.fillRect(0, 0, width, height);
      }

      for (const pulse of neonConnections) {
        pulse.radius += pulse.speed;
        if (pulse.radius > pulse.maxRadius) {
          pulse.x = Math.random() * width;
          pulse.y = Math.random() * height;
          pulse.radius = 0;
          pulse.maxRadius = Math.random() * 500 + 300;
          pulse.speed = Math.random() * 0.8 + 0.4;
        }
      }

      const hexSize = 35;
      for (const hex of neonLines) {
        let affected = false;
        for (const pulse of neonConnections) {
          const dx = hex.x - pulse.x;
          const dy = hex.y - pulse.y;
          const dist = Math.hypot(dx, dy);
          if (Math.abs(dist - pulse.radius) < 80) {
            hex.targetOpacity = 0.5;
            affected = true;
            break;
          }
        }
        if (!affected) hex.targetOpacity = hex.baseOpacity;
        hex.currentOpacity += (hex.targetOpacity - hex.currentOpacity) * 0.03;

        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI / 3) * i + Math.PI / 6;
          const px = hex.x + hexSize * Math.cos(angle);
          const py = hex.y + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${hex.color}, ${hex.currentOpacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (hex.currentOpacity > 0.2) {
          ctx.save();
          ctx.shadowBlur = 15;
          ctx.shadowColor = `rgba(${hex.color}, ${hex.currentOpacity})`;
          ctx.stroke();
          ctx.restore();
        }
      }

      const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
      grad.addColorStop(0, "rgba(40, 0, 80, 0.08)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
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
      ctx.fillStyle = "#f0e8ff";
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "multiply";
      for (const b of lightBlobs) {
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < -b.radius) b.x = width + b.radius;
        if (b.x > width + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = height + b.radius;
        if (b.y > height + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `rgba(${b.color}, ${b.opacity})`);
        grad.addColorStop(0.5, `rgba(${b.color}, ${b.opacity * 0.4})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      for (const p of lightDustParticles) {
        p.y -= p.speed;
        if (p.y < -10) p.y = height + 10;
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (noiseCanvas) {
        ctx.globalAlpha = 0.03;
        ctx.drawImage(noiseCanvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    };

    const drawSparkle = () => {
      sparkleTime = Date.now() * 0.1;
      sparkleSpeed += (sparkleTargetSpeed - sparkleSpeed) * 0.08;

      const gold = "254, 240, 138";
      const bright = "255, 250, 214";
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
          particle.alpha * (0.7 + Math.sin(sparkleTime * particle.flicker + particle.flickerOffset) * 0.3);
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
        particle.x += particle.speedX * (0.8 + sparkleSpeed * 4);
        particle.y += particle.speedY * (0.8 + sparkleSpeed * 4);
        if (particle.y > height + margin) particle.y = -margin;
        if (particle.y < -margin) particle.y = height + margin;
        if (particle.x > width + margin) particle.x = -margin;
        if (particle.x < -margin) particle.x = width + margin;
      };

      const updateCluster = (cluster: GoldDustCluster) => {
        cluster.x += cluster.speedX * (0.8 + sparkleSpeed * 4);
        cluster.y += cluster.speedY * (0.8 + sparkleSpeed * 4);

        if (cluster.y > height + margin) cluster.y = -margin;
        if (cluster.y < -margin) cluster.y = height + margin;
        if (cluster.x > width + margin) cluster.x = -margin;
        if (cluster.x < -margin) cluster.x = width + margin;

        const clusterDrift = 0.7 + sparkleSpeed * 2.5;
        for (const particle of cluster.particles) {
          particle.relX += particle.speedX * clusterDrift;
          particle.relY += particle.speedY * clusterDrift;
          particle.x = cluster.x + particle.relX;
          particle.y = cluster.y + particle.relY;
        }
      };

      const updateCloud = (cloud: GoldDustCloud) => {
        cloud.x += cloud.speedX * (0.8 + sparkleSpeed * 2.5);
        cloud.y += cloud.speedY * (0.8 + sparkleSpeed * 2.5);
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
        if (sparkleCloudSprite) {
          ctx.save();
          ctx.globalAlpha = Math.min(cloud.alpha * 1.8, 0.22);
          ctx.drawImage(
            sparkleCloudSprite,
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

    const drawAsher = () => {
      const baseColor = { r: 165, g: 170, b: 180 };

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#030305";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "screen";

      for (const particle of asherSmokeParticles) {
        particle.vx += Math.sin(particle.life * 10) * 0.001;
        particle.vy += Math.cos(particle.life * 10) * 0.001;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.angle += particle.spin;
        particle.life += particle.maxLife;
        particle.opacity = Math.sin(particle.life * Math.PI) * particle.maxOpacity;

        if (particle.life >= 1) {
          particle.x = Math.random() * width;
          particle.y = Math.random() * height;
          particle.size = Math.random() * 550 + 450;
          particle.vx = (Math.random() - 0.5) * 0.1;
          particle.vy = (Math.random() - 0.5) * 0.07;
          particle.opacity = 0;
          particle.maxOpacity = Math.random() * 0.08 + 0.04;
          particle.life = 0;
          particle.maxLife = Math.random() * 0.0003 + 0.0001;
          particle.angle = Math.random() * Math.PI * 2;
          particle.spin = (Math.random() - 0.5) * 0.0002;
          particle.stretch = Math.random() * 2.5 + 2.0;
        }

        if (particle.x < -particle.size * 2) particle.x = width + particle.size * 2;
        if (particle.x > width + particle.size * 2) particle.x = -particle.size * 2;
        if (particle.y < -particle.size * 2) particle.y = height + particle.size * 2;
        if (particle.y > height + particle.size * 2) particle.y = -particle.size * 2;
        if (particle.opacity <= 0) continue;

        ctx.save();
        ctx.filter = "blur(45px)";
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle);
        ctx.scale(particle.stretch, 1);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size);
        grad.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${particle.opacity})`);
        grad.addColorStop(0.5, `rgba(40, 40, 50, ${particle.opacity * 0.4})`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const flake of asherAshFlakes) {
        flake.wobble += 0.01;
        flake.angle += flake.spin;
        flake.x += flake.vx + Math.sin(flake.wobble) * 0.2;
        flake.y += flake.vy + Math.cos(flake.wobble) * 0.15;

        if (flake.x < -50) flake.x = width + 50;
        if (flake.x > width + 50) flake.x = -50;
        if (flake.y < -50) flake.y = height + 50;
        if (flake.y > height + 50) flake.y = -50;

        ctx.save();
        ctx.filter = "blur(1px)";
        ctx.translate(flake.x, flake.y);
        ctx.rotate(flake.angle);
        ctx.fillStyle = `rgba(180, 185, 195, ${flake.opacity})`;
        ctx.fillRect(-flake.w / 2, -flake.h / 2, flake.w, flake.h);
        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";

      if (noiseCanvas) {
        ctx.globalAlpha = 0.03;
        ctx.drawImage(noiseCanvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    };

    const drawMatrix = () => {
      const t = Date.now() * 0.001;
      const green = "133, 187, 101";

      ctx.fillStyle = "#0d120d";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(133, 187, 101, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      const watermarkOpacity = 0.03 + Math.sin(t * 1.2) * 0.02;
      ctx.save();
      ctx.fillStyle = `rgba(${green}, ${watermarkOpacity})`;
      ctx.textAlign = "center";
      ctx.font = "bold 300px serif";
      ctx.fillText("100", width * 0.75, height * 0.5 + 100);
      ctx.font = "bold 40px serif";
      ctx.fillText("IN GOD WE TRUST", width * 0.5, height * 0.2);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(133, 187, 101, 0.1)";
      for (let i = 0; i <= 200; i += 1) {
        const angle = (i / 200) * Math.PI * 2;
        const radius = 150 + Math.sin(angle * 12 + t * 0.8) * 10;
        const px = width * 0.5 + Math.cos(angle) * radius;
        const py = height * 0.5 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      const pyramidX = width * 0.25;
      const pyramidY = height * 0.5 + 50;
      const pyramidSize = 200;
      const levels = 13;
      const levelH = pyramidSize / levels;

      ctx.save();
      ctx.translate(pyramidX, pyramidY);
      const glow = Math.sin(t * 3) * 20 + 40;
      ctx.shadowBlur = glow;
      ctx.shadowColor = "rgba(133, 187, 101, 0.6)";
      ctx.strokeStyle = "rgba(133, 187, 101, 0.4)";
      ctx.lineWidth = 2;

      for (let i = 1; i < levels; i += 1) {
        const w = (pyramidSize * (i + 1)) / levels;
        const prevW = (pyramidSize * i) / levels;
        ctx.beginPath();
        ctx.moveTo(-w / 2, i * levelH);
        ctx.lineTo(w / 2, i * levelH);
        ctx.lineTo(prevW / 2, (i - 1) * levelH);
        ctx.lineTo(-prevW / 2, (i - 1) * levelH);
        ctx.closePath();
        ctx.stroke();

        for (let j = 0; j < i; j += 1) {
          const step = w / i;
          ctx.beginPath();
          ctx.moveTo(-w / 2 + step * j, i * levelH);
          ctx.lineTo(-w / 2 + step * j, (i - 1) * levelH);
          ctx.stroke();
        }
      }

      ctx.translate(0, -pyramidSize / levels - 10);
      ctx.beginPath();
      ctx.moveTo(-25, 20);
      ctx.lineTo(25, 20);
      ctx.lineTo(0, -20);
      ctx.closePath();
      ctx.stroke();

      ctx.shadowBlur = 15;
      ctx.shadowColor = "#85bb65";
      ctx.beginPath();
      ctx.ellipse(0, 5, 12, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(133, 187, 101, 0.8)";
      ctx.fill();

      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 15, Math.sin(angle) * 15 + 5);
        ctx.lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30 + 5);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(133, 187, 101, 0.3)";
      ctx.font = "bold 24px serif";
      ctx.fillText("FEDERAL RESERVE NOTE", width / 2, 60);

      ctx.font = "bold 120px serif";
      ctx.fillStyle = "rgba(133, 187, 101, 0.12)";
      ctx.fillText("100", 120, 140);
      ctx.fillText("100", width - 120, height - 80);

      ctx.font = "10px serif";
      ctx.fillStyle = "rgba(110, 140, 110, 0.4)";
      const microText = "THE UNITED STATES OF AMERICA 100 ANN UIT COEPTIS 100 ";
      const offset = (t * 30) % 400;
      for (let y = 100; y < height; y += 200) {
        for (let x = -offset; x < width + 400; x += 400) {
          ctx.fillText(microText, x, y);
        }
      }
      ctx.restore();

      const ribbonX = width * 0.6;
      ctx.fillStyle = "rgba(0, 70, 180, 0.15)";
      ctx.fillRect(ribbonX, 0, 50, height);
      for (let i = 0; i < 8; i += 1) {
        const y = (i * 150 + t * 72) % (height + 150) - 75;
        ctx.fillStyle = `rgba(120, 200, 255, ${0.3 + Math.sin(t * 2.4) * 0.1})`;
        ctx.font = "bold 20px serif";
        ctx.textAlign = "center";
        ctx.fillText("100", ribbonX + 25, y);
      }

      const vignette = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
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
      if (mode === "sparkle") drawSparkle();
      if (mode === "asher") drawAsher();
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
      if (mode === "sparkle") createSparkleScene();
      if (mode === "asher") createAsherScene();
      if (mode === "matrix") createMatrixScene();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseDown = () => {
      sparkleTargetSpeed = 0.15;
    };

    const handleMouseUp = () => {
      sparkleTargetSpeed = 0.05;
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
