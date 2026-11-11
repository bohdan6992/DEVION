// @ts-nocheck — pasted as-is from plain JS (untyped refs/handlers); kept unchanged on purpose
"use client";

import React, { useEffect, useRef } from "react";

// Вершинний шейдер
const VS_SOURCE = `#version 300 es
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Фрагментний шейдер: плавні чорні розводи без суцільних плям
const FS_SOURCE = `#version 300 es
  precision highp float;
  out vec4 fragColor;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  // Псевдовипадковий генератор
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Градієнтний шум
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Фрактальний шум (FBM)
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.52), sin(0.52), -sin(0.52), cos(0.52));
    for (int i = 0; i < 5; ++i) {
      v += a * noise(p);
      p = rot * p * 2.08 + vec2(12.3, 45.6);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 mouseNorm = (u_mouse - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    // Швидкість збережена (0.60), тон піднято у світлішу гаму
    const float SPEED = 0.60;
    const float GREY_TONE = 0.89;

    vec2 p = uv * 1.9;
    float t = u_time * 0.04 * SPEED;

    // М'який та делікатний вплив курсора
    float mouseDist = length(uv - mouseNorm);
    float mouseWave = exp(-mouseDist * 4.5) * 0.07;
    p += normalize(uv - mouseNorm + 0.0001) * mouseWave;

    // Каскадна деформація простору для плавних розводів
    vec2 q = vec2(
      fbm(p + vec2(0.0, 0.0) + t * 0.15),
      fbm(p + vec2(4.3, 2.7) - t * 0.12)
    );

    vec2 r = vec2(
      fbm(p + 3.2 * q + vec2(1.8 - t * 0.3, 6.4 + t * 0.2)),
      fbm(p + 3.2 * q + vec2(7.2 + t * 0.25, 2.1 - t * 0.2))
    );

    float fluid = fbm(p + 3.6 * r);

    // Макро-зонування: створює локальні скупчення глибокої темної туші
    float macroZone = fbm(p * 0.55 + vec2(3.1, 7.8) - t * 0.06);
    float darkCluster = smoothstep(0.25, 0.68, macroZone + 0.35 * length(r));

    // Розводи туші
    float wash = smoothstep(0.28, 0.78, fluid);
    float folds = 1.0 - smoothstep(0.02, 0.18, abs(fluid - 0.48));
    float detailFibers = 1.0 - smoothstep(0.01, 0.12, abs(dot(q, r) - 0.20));

    // Густина чорнила: у темних скупченнях туш згущується до насиченого чорного,
    // тоді як в інших зонах залишається напівпрозорою та світлою
    float baseInk = wash * 0.55 + folds * 0.45 + detailFibers * 0.30;
    float inkDensity = mix(baseInk * 0.22, baseInk * 1.35, darkCluster);
    inkDensity = clamp(inkDensity, 0.0, 1.0);
    inkDensity = pow(inkDensity, 1.35);

    // Світліше сіре матове полотно
    vec3 baseGrey = vec3(GREY_TONE * 0.88, GREY_TONE * 0.89, GREY_TONE * 0.91);
    float grain = (hash(gl_FragCoord.xy + fract(u_time * 0.001)) - 0.5) * 0.025;
    vec3 backgroundColor = clamp(baseGrey + grain, 0.0, 1.0);

    // Глибокі чорні відтінки туші
    vec3 inkColor = vec3(0.038, 0.040, 0.045);
    vec3 inkDeepCore = vec3(0.008, 0.008, 0.012);

    vec3 finalColor = mix(backgroundColor, inkColor, inkDensity);
    finalColor = mix(finalColor, inkDeepCore, smoothstep(0.45, 0.90, inkDensity) * darkCluster);

    // Делікатна, світліша віньєтка
    float vignette = 1.0 - dot(uv * 0.60, uv * 0.60) * 0.10;
    finalColor *= max(vignette, 0.80);

    fragColor = vec4(finalColor, 1.0);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function InkBlotsBackground() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });

    if (!gl) {
      console.warn("WebGL 2 не підтримується.");
      return;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    const posLoc = gl.getAttribLocation(program, "position");
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resLoc = gl.getUniformLocation(program, "u_resolution");
    const mouseLoc = gl.getUniformLocation(program, "u_mouse");

    const startTime = performance.now();

    const handleResize = () => {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const handleMouseMove = (e) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      mouseRef.current.targetX = e.clientX * dpr;
      mouseRef.current.targetY = (window.innerHeight - e.clientY) * dpr;
    };

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        mouseRef.current.targetX = e.touches[0].clientX * dpr;
        mouseRef.current.targetY = (window.innerHeight - e.touches[0].clientY) * dpr;
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    // Початкова позиція в центрі
    const initialDpr = Math.min(window.devicePixelRatio || 1, 2);
    mouseRef.current.x = (window.innerWidth / 2) * initialDpr;
    mouseRef.current.y = (window.innerHeight / 2) * initialDpr;
    mouseRef.current.targetX = mouseRef.current.x;
    mouseRef.current.targetY = mouseRef.current.y;

    const render = () => {
      if (!gl || !canvas) return;

      // Дуже плавна, повільна інерція курсору
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.03;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.03;

      gl.useProgram(program);
      const elapsed = (performance.now() - startTime) / 1000;

      gl.uniform1f(timeLoc, elapsed);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform2f(mouseLoc, mouseRef.current.x, mouseRef.current.y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundColor: "#dadde1",
      }}
    />
  );
}
