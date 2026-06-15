"use client";

import { useEffect, useRef } from "react";

const VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p) {
  float v=0.0,a=0.5; vec2 s=vec2(100.0);
  for(int i=0;i<4;++i){v+=a*noise(p);p=p*2.0+s;a*=0.5;}
  return v;
}
float getGodRays(vec2 uv, float t) {
  float rays=0.0; vec2 r=uv; r.y-=r.x*0.45;
  float w1=sin(r.x*2.8+t*0.25)*0.5+0.5, w2=cos(r.x*5.2-t*0.4)*0.5+0.5;
  float w3=sin(r.x*9.5+t*0.7)*0.5+0.5,  w4=cos(r.x*16.0-t*1.1)*0.5+0.5;
  rays+=pow(w1*w2,3.0)*0.60; rays+=pow(w2*w3,4.5)*0.25;
  rays+=pow(w3*w4,5.0)*0.10; rays+=pow(w1*w4,2.5)*0.05;
  rays*=noise(vec2(uv.x*15.0,t*1.5))*0.20+0.80;
  rays*=smoothstep(-1.2,0.4,uv.y);
  return rays*0.32;
}
float getCausticOctave(vec2 p, float t) {
  p.x+=t*0.08; p.y+=sin(t*0.06)*0.2;
  float n1=noise(p), n2=noise(p+vec2(1.6,2.3)-t*0.04);
  return pow(abs(sin(n1*6.28)*cos(n2*6.28)),2.0);
}
vec3 getChromaticCaustics(vec2 p, float t) {
  return vec3(getCausticOctave(p-vec2(0.006,0)*4.8,t),
              getCausticOctave(p*4.8,t),
              getCausticOctave(p+vec2(0.006,0)*4.8,t));
}
float getAbyssRidge(vec2 p) { float h=0.02; h+=sin(p.x*0.5+u_time*0.008)*0.22; h+=cos(p.x*1.1)*0.10; return p.y-h; }
float getFarRidge(vec2 p)   { float h=-0.18; h+=sin(p.x*1.1-u_time*0.015)*0.14; h+=cos(p.x*2.2)*0.06; return p.y-h; }
float getMidReefs(vec2 p)   { float h=-0.42; h+=sin(p.x*1.8+u_time*0.022)*0.09; h+=cos(p.x*3.6)*0.04; return p.y-h; }
float getSeabed(vec2 p)     { float h=-0.62; h+=sin(p.x*2.5)*0.05; h+=cos(p.x*5.5)*0.025; h+=sin(p.x*18.0)*0.005; return p.y-h; }
float drawKelp(vec2 uv, vec2 base, float height, float width, float t, float ph) {
  vec2 p=uv-base;
  if(p.y<0.0||p.y>height) return 0.0;
  float sway=sin(t*1.4+ph+p.y*3.5)*(p.y*0.16);
  float w=width*(1.0-(p.y/height)*0.6);
  return smoothstep(0.008,-0.008,abs(p.x-sway)-w);
}

void main() {
  vec2 uv=(gl_FragCoord.xy-0.5*u_resolution.xy)/u_resolution.y;
  float t=u_time;
  vec3 col_abyss=vec3(0.0005,0.002,0.007), col_surface=vec3(0.004,0.055,0.10);
  vec3 waterColor=mix(col_abyss,col_surface,uv.y*0.65+0.35);
  waterColor+=vec3(0.001,0.015,0.035)*fbm(uv*1.4-vec2(t*0.012,t*0.028));

  float dAb=getAbyssRidge(uv), dFar=getFarRidge(uv), dMid=getMidReefs(uv), dSea=getSeabed(uv);
  vec3 finalColor=waterColor;
  finalColor=mix(finalColor,mix(waterColor,vec3(0.001,0.008,0.018),0.5),smoothstep(0.24,-0.24,dAb));
  finalColor=mix(finalColor,mix(waterColor,vec3(0.002,0.014,0.030),0.65),smoothstep(0.16,-0.16,dFar));
  vec3 midColor=mix(waterColor,vec3(0.003,0.020,0.045),0.78);
  midColor+=vec3(0.005,0.025,0.045)*getChromaticCaustics(uv*0.6,t)*0.20;
  finalColor=mix(finalColor,midColor,smoothstep(0.09,-0.09,dMid));
  vec3 seaColor=mix(waterColor,vec3(0.005,0.035,0.075),0.85);
  vec3 sc=getChromaticCaustics(uv*1.1,t); seaColor+=vec3(0.03,0.13,0.20)*sc*0.70;
  seaColor+=vec3(0.012,0.05,0.09)*smoothstep(0.018,-0.018,dSea)*sc.g*0.35;
  finalColor=mix(finalColor,seaColor,smoothstep(0.03,-0.03,dSea));

  float kMid=max(drawKelp(uv,vec2(-0.6,-0.52),0.32,0.012,t,0.0),max(drawKelp(uv,vec2(-0.55,-0.54),0.28,0.010,t,0.8),drawKelp(uv,vec2(0.5,-0.46),0.25,0.011,t,1.5)));
  if(kMid>0.0) { vec3 c=mix(waterColor,vec3(0.002,0.018,0.03),0.75); c+=vec3(0.005,0.02,0.03)*getChromaticCaustics(uv*0.7,t)*0.25; finalColor=mix(finalColor,c,kMid*smoothstep(0.08,-0.08,dMid)); }
  float kFore=max(drawKelp(uv,vec2(-0.25,-0.7),0.42,0.016,t,2.2),max(drawKelp(uv,vec2(-0.18,-0.73),0.35,0.014,t,0.5),max(drawKelp(uv,vec2(0.32,-0.68),0.48,0.018,t,3.1),drawKelp(uv,vec2(0.39,-0.71),0.38,0.015,t,1.2))));
  if(kFore>0.0) { vec3 c=mix(waterColor,vec3(0.004,0.032,0.065),0.85); c+=vec3(0.02,0.10,0.15)*getChromaticCaustics(uv*1.0,t)*0.55; finalColor=mix(finalColor,c,kFore*smoothstep(0.03,-0.03,dSea)); }

  finalColor+=vec3(0.30,0.68,0.85)*getGodRays(uv,t);

  float snow=0.0;
  for(int i=0;i<35;i++){
    float fi=float(i);
    vec2 pos=vec2(sin(t*0.08+fi*1.8)*0.95+sin(fi*33.1)*0.45,mod(-t*(0.02+sin(fi*8.2)*0.01)+fi*0.07,2.4)-1.2);
    float d=length(uv-pos), sz=0.0014+sin(fi*14.5)*0.0008;
    float lit=getGodRays(pos,t), refl=0.08+0.92*smoothstep(0.02,0.18,lit);
    snow+=smoothstep(sz*7.5,0.0,d)*0.15*refl+smoothstep(sz*1.5,0.0,d)*0.85*refl;
  }
  finalColor+=vec3(0.40,0.82,0.90)*snow*0.50;
  finalColor+=(hash(uv+t*0.01)-0.5)*0.015;
  finalColor*=max(1.0-dot(uv*0.95,uv*0.95)*0.38,0.40);
  finalColor=pow(finalColor,vec3(1.02));
  fragColor=vec4(finalColor,1.0);
}
`;

export default function OceanicThemeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const loc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const start = performance.now();
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      gl.useProgram(prog);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 0, display: "block" }}
    />
  );
}
