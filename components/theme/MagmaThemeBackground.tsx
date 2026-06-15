"use client";

import React, { useEffect, useRef } from "react";

const VS_SOURCE = `#version 300 es
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FS_SOURCE = `#version 300 es
  precision highp float;
  out vec4 fragColor;

  uniform vec2 u_resolution;
  uniform float u_time;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; ++i) {
      v += a * noise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k * (1.0 / 6.0);
  }

  float sdCircle(vec2 p, float r) {
    return length(p) - r;
  }

  float map(vec2 p, float t) {
    float d = 1e5;

    float bottomPool = p.y + 0.95 + sin(p.x * 1.5 + t * 0.4) * 0.12 * cos(p.x * 0.8) * 0.8;
    d = smin(d, bottomPool, 0.45);

    float topPool = -p.y + 0.95 + cos(p.x * 1.3 - t * 0.3) * 0.08;
    d = smin(d, topPool, 0.4);

    vec2 c1 = vec2(sin(t * 0.25) * 0.25, cos(t * 0.4) * 0.3);
    d = smin(d, sdCircle(p - c1, 0.28), 0.42);

    vec2 c2 = vec2(0.35 + cos(t * 0.3) * 0.15, sin(t * 0.5) * 0.4 + 0.2);
    d = smin(d, sdCircle(p - c2, 0.22), 0.42);

    vec2 c3 = vec2(-0.4 + sin(t * 0.35 + 1.5) * 0.12, cos(t * 0.3) * 0.4 - 0.2);
    d = smin(d, sdCircle(p - c3, 0.24), 0.42);

    float y4 = mod(t * 0.14 + 0.5, 2.4) - 1.2;
    vec2 c4 = vec2(-0.22 + sin(t * 0.8) * 0.08, y4);
    d = smin(d, sdCircle(p - c4, 0.16), 0.38);

    float y5 = mod(-t * 0.11 + 1.8, 2.4) - 1.2;
    vec2 c5 = vec2(0.2 + cos(t * 0.6) * 0.1, y5);
    d = smin(d, sdCircle(p - c5, 0.18), 0.38);

    float y_s1 = mod(t * 0.26 + 0.2, 2.4) - 1.2;
    vec2 s1 = vec2(-0.35 + sin(t * 1.4) * 0.06, y_s1);
    d = smin(d, sdCircle(p - s1, 0.06), 0.25);

    float y_s2 = mod(-t * 0.22 + 1.1, 2.4) - 1.2;
    vec2 s2 = vec2(0.38 + cos(t * 1.1) * 0.05, y_s2);
    d = smin(d, sdCircle(p - s2, 0.05), 0.25);

    vec2 s3 = c1 + vec2(cos(t * 1.6) * 0.36, sin(t * 1.6) * 0.36);
    d = smin(d, sdCircle(p - s3, 0.045), 0.2);

    vec2 s4 = vec2(sin(t * 0.7) * 0.45, cos(t * 0.8) * 0.15);
    d = smin(d, sdCircle(p - s4, 0.07), 0.28);

    float y_s5 = mod(t * 0.32 + 0.8, 2.4) - 1.2;
    vec2 s5 = vec2(0.02 + sin(t * 1.8) * 0.04, y_s5);
    d = smin(d, sdCircle(p - s5, 0.055), 0.24);

    vec2 s6 = c2 + vec2(sin(-t * 2.0) * 0.28, cos(-t * 2.0) * 0.28);
    d = smin(d, sdCircle(p - s6, 0.04), 0.18);

    return d;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
    float t = u_time * 0.5;

    vec2 warp = vec2(
      fbm(uv * 1.8 + vec2(0.0, t * 0.12)),
      fbm(uv * 1.8 + vec2(t * 0.08, 2.0))
    );
    vec2 warpedUV = uv + warp * 0.24;

    float d = map(warpedUV, t);

    vec3 col_bg_bottom = vec3(0.05, 0.02, 0.12);
    vec3 col_bg_top    = vec3(0.01, 0.0,  0.04);
    vec3 bg = mix(col_bg_bottom, col_bg_top, uv.y * 0.5 + 0.5);

    float bgCloud = fbm(uv * 1.2 - vec2(0.0, t * 0.03));
    bg += vec3(0.18, 0.02, 0.38) * bgCloud * 0.45;

    float colorGrad = (uv.y + 1.0) * 0.5;
    vec3 col_core_bottom = vec3(1.0, 0.0,  0.38);
    vec3 col_core_top    = vec3(1.0, 0.55, 0.0);
    vec3 waxCore = mix(col_core_bottom, col_core_top, colorGrad + sin(t * 0.4) * 0.12);
    waxCore = mix(waxCore, vec3(1.0, 0.92, 0.3), smoothstep(0.18, 0.0, abs(d + 0.22)));

    float glow = 1.0 / (1.0 + max(d, 0.0) * 16.0);
    glow = pow(glow, 2.2);
    vec3 glowColor = mix(vec3(1.0, 0.0, 0.45), vec3(1.0, 0.4, 0.0), colorGrad);

    vec3 finalColor = bg;
    float edge = smoothstep(0.015, -0.015, d);
    finalColor = mix(finalColor, waxCore, edge);
    finalColor += glowColor * glow * 1.25;

    float vignette = 1.0 - dot(uv * 0.75, uv * 0.75) * 0.3;
    finalColor *= max(vignette, 0.45);
    finalColor = pow(finalColor, vec3(0.92));

    fragColor = vec4(finalColor, 1.0);
  }
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function MagmaThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2");
    if (!gl) return;

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

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

    const startTime = performance.now();

    function resize() {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    resize();
    window.addEventListener("resize", resize);

    function render() {
      if (!gl || !canvas) return;
      gl.useProgram(program);
      const elapsed = (performance.now() - startTime) / 1000;
      gl.uniform1f(timeLoc, elapsed);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
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
      }}
    />
  );
}
