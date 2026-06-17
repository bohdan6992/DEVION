"use client";

import { useEffect, useRef } from "react";

const SYMBOLS =
  "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ" +
  "ΨΩΦΞΘΛΣ" +
  "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ" +
  "0123456789+*-%&@#$≠≈∞√";

const BG      = "#010a04";
const PRIMARY = "#2d6a40";   // muted forest green trail
const HEAD    = "#4ea866";   // muted brighter green head
const GLOW    = "rgba(45,106,64,0.50)";

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

class MatrixCell {
  x: number; y: number; char: string;
  baseOpacity: number; opacity: number; isHead: boolean;

  constructor(x: number, y: number) {
    this.x = x; this.y = y;
    this.char = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    this.baseOpacity = 0.03 + Math.random() * 0.13;
    this.opacity = this.baseOpacity;
    this.isHead = false;
  }

  update() {
    this.opacity *= 0.92;
    if (this.opacity < this.baseOpacity) this.opacity = this.baseOpacity;
    if (Math.random() < 0.002) this.char = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0.01) return;
    if (this.isHead) {
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = 10;
      ctx.fillStyle = hexToRgba(HEAD, this.opacity);
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = hexToRgba(PRIMARY, this.opacity);
    }
    ctx.fillText(this.char, this.x, this.y);
  }
}

class Sweep {
  col: number; y: number; speed: number; length: number;
  private cols: number; private rows: number;

  constructor(cols: number, rows: number, randomY = false) {
    this.cols = cols; this.rows = rows;
    this.col = Math.floor(Math.random() * cols);
    this.y = randomY ? Math.random() * rows : -Math.random() * 20 - 5;
    this.speed = Math.random() * 0.3 + 0.15;
    this.length = Math.floor(Math.random() * 15 + 8);
  }

  update() {
    this.y += this.speed;
    if (this.y - this.length > this.rows) {
      this.col = Math.floor(Math.random() * this.cols);
      this.y = -Math.random() * 15 - 5;
      this.speed = Math.random() * 0.3 + 0.15;
      this.length = Math.floor(Math.random() * 15 + 8);
    }
  }
}

const FONT_SIZE = 15;

export default function MatrixThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    let grid: MatrixCell[] = [];
    let sweeps: Sweep[] = [];
    let cols = 0, rows = 0;
    let raf = 0;

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.font = `bold ${FONT_SIZE}px 'Fira Code', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      cols = Math.floor(canvas.width / FONT_SIZE) + 1;
      rows = Math.floor(canvas.height / FONT_SIZE) + 1;
      grid = [];
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++)
          grid.push(new MatrixCell(c * FONT_SIZE + FONT_SIZE / 2, r * FONT_SIZE + FONT_SIZE / 2));
      sweeps = Array.from({ length: Math.floor(cols * 0.25) }, () => new Sweep(cols, rows, true));
    };

    const loop = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const cell of grid) { cell.isHead = false; cell.update(); }

      for (const sw of sweeps) {
        sw.update();
        const headRow = Math.floor(sw.y);
        for (let j = 0; j < sw.length; j++) {
          const r = headRow - j;
          if (r < 0 || r >= rows) continue;
          const cell = grid[sw.col * rows + r];
          if (!cell) continue;
          const intensity = 1 - j / sw.length;
          if (intensity > cell.opacity) cell.opacity = intensity;
          if (j === 0) cell.isHead = true;
        }
      }

      for (const cell of grid) cell.draw(ctx);
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
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 0, display: "block" }}
    />
  );
}
