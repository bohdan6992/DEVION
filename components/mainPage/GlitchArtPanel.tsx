"use client";

import { useEffect, useRef } from "react";

type ThemeAccent = { hex: string; hex2: string; rgb: string };

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export default function GlitchArtPanel({ accent }: { accent: ThemeAccent }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  useEffect(() => { accentRef.current = accent; }, [accent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    // ── shape generators ──────────────────────────────────
    function getPointsForChar(char: string, fontSize: number) {
      const pts: { x: number; y: number }[] = [];
      const off = document.createElement("canvas");
      const oc  = off.getContext("2d")!;
      off.width = 300; off.height = 300;
      oc.font = `bold ${fontSize}px 'Fira Code', monospace, sans-serif`;
      oc.fillStyle = "white";
      oc.textBaseline = "middle";
      oc.textAlign = "center";
      oc.fillText(char, 150, 150);
      const d = oc.getImageData(0, 0, 300, 300).data;
      for (let y = 0; y < 300; y += 3)
        for (let x = 0; x < 300; x += 3)
          if (d[(y * 300 + x) * 4] > 128) pts.push({ x, y });
      return pts;
    }

    function getPointsForSkull() {
      const pts: { x: number; y: number }[] = [];
      const off = document.createElement("canvas");
      const oc  = off.getContext("2d")!;
      off.width = 300; off.height = 300;
      oc.fillStyle = "white";
      function drawBone(x1: number, y1: number, x2: number, y2: number) {
        oc.strokeStyle = "white"; oc.lineWidth = 12;
        oc.beginPath(); oc.moveTo(x1, y1); oc.lineTo(x2, y2); oc.stroke();
        oc.beginPath();
        [x1 - 5, x1 + 5, x1].forEach((ax, i) => {
          oc.arc(ax, i < 2 ? y1 : y1 - 5, 10, 0, Math.PI * 2);
        });
        [x2 - 5, x2 + 5, x2].forEach((ax, i) => {
          oc.arc(ax, i < 2 ? y2 : y2 + 5, 10, 0, Math.PI * 2);
        });
        oc.fill();
      }
      drawBone(65, 65, 235, 235); drawBone(235, 65, 65, 235);
      oc.fillStyle = "white";
      oc.beginPath();
      oc.arc(150, 125, 52, Math.PI * 0.95, Math.PI * 2.05);
      oc.bezierCurveTo(202, 172, 185, 175, 180, 192);
      oc.lineTo(172, 212); oc.lineTo(128, 212); oc.lineTo(120, 192);
      oc.bezierCurveTo(115, 175, 98, 172, 98, 125);
      oc.closePath(); oc.fill();
      oc.fillStyle = "black";
      [[112,122,142,132,136,152,114,144],[188,122,158,132,164,152,186,144]].forEach(([x1,y1,x2,y2,x3,y3,x4,y4]) => {
        oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.lineTo(x3,y3); oc.lineTo(x4,y4); oc.closePath(); oc.fill();
      });
      oc.beginPath(); oc.moveTo(150,154); oc.lineTo(158,172); oc.lineTo(142,172); oc.closePath(); oc.fill();
      oc.strokeStyle = "black"; oc.lineWidth = 3;
      oc.beginPath(); oc.moveTo(132,202); oc.lineTo(168,202); oc.stroke();
      [138,144,150,156,162].forEach(tx => { oc.beginPath(); oc.moveTo(tx,194); oc.lineTo(tx,210); oc.stroke(); });
      oc.lineWidth = 2;
      oc.beginPath(); oc.moveTo(150,75); oc.lineTo(145,88); oc.lineTo(153,98); oc.stroke();
      const d = oc.getImageData(0, 0, 300, 300).data;
      for (let y = 0; y < 300; y += 3)
        for (let x = 0; x < 300; x += 3)
          if (d[(y * 300 + x) * 4] > 128) pts.push({ x, y });
      return pts;
    }

    function getPointsForHelmet() {
      const pts: { x: number; y: number }[] = [];
      const off = document.createElement("canvas");
      const oc  = off.getContext("2d")!;
      off.width = 300; off.height = 300;
      oc.strokeStyle = "white"; oc.lineWidth = 3.5;
      let si = 0;
      for (let a = Math.PI * 1.05; a <= Math.PI * 1.95; a += 0.01) {
        if (++si % 11 >= 7) continue;
        const wave = Math.sin(a * 24) * 3;
        const r1 = 64 + wave, r2 = 104 + Math.cos(a * 2) * 4;
        oc.beginPath();
        oc.moveTo(150 + Math.cos(a) * r1, 155 + Math.sin(a) * r1);
        oc.lineTo(150 + Math.cos(a) * r2, 155 + Math.sin(a) * r2);
        oc.stroke();
      }
      oc.fillStyle = "white";
      oc.beginPath();
      oc.arc(150, 155, 65, Math.PI * 1.08, Math.PI * 1.92, false);
      oc.arc(150, 155, 59, Math.PI * 1.92, Math.PI * 1.08, true);
      oc.closePath(); oc.fill();
      oc.beginPath(); oc.moveTo(125,85); oc.lineTo(175,85); oc.lineTo(165,105); oc.lineTo(135,105); oc.closePath(); oc.fill();
      oc.fillRect(146, 105, 8, 40);
      oc.beginPath(); oc.arc(150, 145, 52, Math.PI, 0); oc.fill();
      oc.beginPath();
      oc.moveTo(98,145); oc.lineTo(92,200); oc.lineTo(110,245); oc.lineTo(134,215);
      oc.lineTo(143,200); oc.lineTo(146,235); oc.lineTo(154,235); oc.lineTo(157,200);
      oc.lineTo(166,215); oc.lineTo(190,245); oc.lineTo(208,200); oc.lineTo(202,145);
      oc.closePath(); oc.fill();
      oc.fillRect(94, 136, 112, 12);
      oc.strokeStyle = "black"; oc.lineWidth = 2;
      oc.beginPath(); oc.moveTo(96,142); oc.lineTo(204,142); oc.stroke();
      oc.fillStyle = "black";
      [[114,195,3,15],[121,198,3,12],[128,201,3,9],[183,195,3,15],[176,198,3,12],[169,201,3,9]].forEach(([x,y,w,h]) => oc.fillRect(x,y,w,h));
      [[110,158,142,166,136,178,110,170],[190,158,158,166,164,178,190,170]].forEach(([x1,y1,x2,y2,x3,y3,x4,y4]) => {
        oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.lineTo(x3,y3); oc.lineTo(x4,y4); oc.closePath(); oc.fill();
      });
      oc.fillStyle = "black";
      oc.beginPath(); oc.moveTo(150,114); oc.lineTo(155,122); oc.lineTo(150,130); oc.lineTo(145,122); oc.closePath(); oc.fill();
      oc.beginPath(); oc.arc(104,142,2.5,0,Math.PI*2); oc.arc(196,142,2.5,0,Math.PI*2); oc.fill();
      const d = oc.getImageData(0, 0, 300, 300).data;
      for (let y = 0; y < 300; y += 3)
        for (let x = 0; x < 300; x += 3)
          if (d[(y * 300 + x) * 4] > 128) pts.push({ x, y });
      return pts;
    }

    function normalize(points: { x: number; y: number }[]) {
      if (!points.length) return points;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
      const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
      const scale = 1.65 / (maxY - minY);
      return points.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
    }

    function pad(pts: { x: number; y: number }[], n: number) {
      const r = [...pts];
      while (r.length < n) { const p = pts[Math.floor(Math.random() * pts.length)]; r.push({ x: p.x + (Math.random() - .5) * .04, y: p.y + (Math.random() - .5) * .04 }); }
      return r;
    }

    const dollarPts  = normalize(getPointsForChar("$", 260));
    const skullPts   = normalize(getPointsForSkull());
    const helmetPts  = normalize(getPointsForHelmet());
    const N = Math.max(dollarPts.length, skullPts.length, helmetPts.length, 1600);
    const dollar  = pad(dollarPts,  N);
    const skull   = pad(skullPts,   N);
    const helmet  = pad(helmetPts,  N);

    // ── state ──────────────────────────────────────────────
    let state: "assembling" | "stable" | "exploding" | "dispersed" = "assembling";
    let shape: "dollar" | "skull" | "helmet" = "dollar";
    let timer = 0;

    // ── particles ─────────────────────────────────────────
    type P = { x: number; y: number; vx: number; vy: number; char: string; alpha: number; bright: boolean; glitchSpeed: number };
    const CHARS = ["$","1","0","Ø","₿","☠","♦","¥","€"];
    const particles: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0, vy: 0,
      char: CHARS[Math.floor(Math.random() * CHARS.length)],
      alpha: Math.random() * 0.6 + 0.4,
      bright: Math.random() > 0.85,
      glitchSpeed: Math.random() * 0.02 + 0.005,
    }));

    let raf: number;
    let globalT = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      globalT = Date.now() * 0.1;
      timer++;

      // cycle
      if (state === "stable"    && timer >= 100) { state = "exploding"; timer = 0; }
      if (state === "exploding" && timer >= 10)  { state = "dispersed"; timer = 0; }
      if (state === "dispersed" && timer >= 90)  {
        shape = shape === "dollar" ? "skull" : shape === "skull" ? "helmet" : "dollar";
        state = "assembling"; timer = 0;
      }
      if (state === "assembling" && timer >= 40) { state = "stable"; timer = 0; }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width  >> 1;
      const cy = canvas.height >> 1;
      const sc = Math.min(canvas.width, canvas.height) * 0.35;
      const targets = shape === "dollar" ? dollar : shape === "skull" ? skull : helmet;

      const ac = hexToRgb(accentRef.current.hex);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (Math.random() < 0.02) p.char = CHARS[Math.floor(Math.random() * CHARS.length)];

        const tgt = targets[i] || { x: 0, y: 0 };
        const tx  = cx + tgt.x * sc;
        const ty  = cy + tgt.y * sc;

        if (state === "stable") {
          const ang = globalT * p.glitchSpeed * 15;
          p.x += (tx + Math.sin(ang) * 1.5 - p.x) * 0.2;
          p.y += (ty + Math.cos(ang) * 1.5 - p.y) * 0.2;
          p.vx = p.vy = 0;
        } else if (state === "exploding") {
          if (p.vx === 0 && p.vy === 0) {
            const dx = p.x - cx, dy = p.y - cy;
            const d = Math.sqrt(dx*dx + dy*dy) || 1;
            const f = 320 / d + Math.random() * 25;
            p.vx = dx/d*f + (Math.random()-.5)*12;
            p.vy = dy/d*f + (Math.random()-.5)*12;
          }
          p.x += p.vx; p.y += p.vy; p.vx *= 0.86; p.vy *= 0.86;
        } else if (state === "dispersed") {
          p.vx += (Math.random()-.5)*.4; p.vy += (Math.random()-.5)*.4;
          p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94;
        } else {
          const dx = tx - p.x, dy = ty - p.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          const sp = Math.min(0.45, 25/(d+1)) + 0.09;
          p.vx = dx*sp; p.vy = dy*sp;
          p.x += p.vx; p.y += p.vy;
        }

        let fa = state === "stable"
          ? p.alpha * (0.75 + Math.sin(globalT * 0.05 + i * 0.1) * 0.25)
          : p.alpha;

        ctx.font = "12px 'Fira Code', monospace";
        if (p.bright) {
          ctx.shadowColor = accentRef.current.hex;
          ctx.shadowBlur  = 8;
          ctx.fillStyle   = `rgba(${Math.min(ac.r+80,255)},${Math.min(ac.g+80,255)},${Math.min(ac.b+80,255)},${fa})`;
        } else {
          ctx.shadowBlur  = 0;
          ctx.fillStyle   = `rgba(${ac.r},${ac.g},${ac.b},${fa})`;
        }
        ctx.fillText(p.char, p.x, p.y);
      }

      ctx.shadowBlur = 0;

      // horizontal glitch
      if (Math.random() < 0.04) {
        const sy = Math.random() * canvas.height;
        const sh = Math.random() * 50 + 10;
        const ox = (Math.random() - .5) * 40;
        ctx.drawImage(canvas, 0, sy, canvas.width, sh, ox, sy, canvas.width, sh);
      }
    };

    raf = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  // accent changes are handled via accentRef, no need to restart
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="relative overflow-hidden w-full h-full"
      style={{
        background: "rgba(10,10,10,0.55)",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        minHeight: 380,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ background: "transparent" }} />
    </div>
  );
}
