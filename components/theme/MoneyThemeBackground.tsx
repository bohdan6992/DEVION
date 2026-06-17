"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function makeBanknoteTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 240;
  const ctx = c.getContext("2d")!;

  const grad = ctx.createRadialGradient(256, 120, 50, 256, 120, 280);
  grad.addColorStop(0, "#1c503b");
  grad.addColorStop(1, "#0b2017");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 240);

  ctx.strokeStyle = "#74b395"; ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 220);
  ctx.strokeStyle = "#3e7e60"; ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 476, 204);

  ctx.fillStyle = "#9fe2c2"; ctx.font = "bold 26px serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("100", 45, 45);
  ctx.fillText("100", 467, 45);
  ctx.fillText("100", 45, 195);
  ctx.fillText("100", 467, 195);

  ctx.beginPath();
  ctx.ellipse(256, 120, 75, 95, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#0d2d20"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#74b395"; ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(256, 128, 42, 60, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#226347"; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(216, 180);
  ctx.quadraticCurveTo(256, 155, 296, 180);
  ctx.fillStyle = "#174732"; ctx.fill();

  ctx.fillStyle = "rgba(143,212,173,0.08)";
  ctx.font = "bold 130px sans-serif";
  ctx.fillText("$", 130, 120);
  ctx.fillText("$", 382, 120);

  ctx.fillStyle = "#85cbab"; ctx.font = "900 12px monospace";
  ctx.fillText("THE UNITED STATES OF AMERICA", 256, 210);
  ctx.fillText("ONE HUNDRED DOLLARS", 256, 30);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeCoinTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;

  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  grad.addColorStop(0,   "#ffe893");
  grad.addColorStop(0.4, "#e5a910");
  grad.addColorStop(0.8, "#af7d02");
  grad.addColorStop(1,   "#664500");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "#fdd145"; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(128, 128, 114, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "#ffd966"; ctx.lineWidth = 5;
  ctx.setLineDash([4, 12]);
  ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#fff0b3"; ctx.font = "bold 145px Georgia,serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("$", 128, 120);

  return new THREE.CanvasTexture(c);
}

function makeSparkleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0,   "rgba(255,246,204,1)");
  grad.addColorStop(0.2, "rgba(255,200,80,0.7)");
  grad.addColorStop(0.6, "rgba(218,165,32,0.15)");
  grad.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

export default function MoneyThemeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030b08, 0.025);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 25;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0x123524, 0.85));
    const goldLight = new THREE.DirectionalLight(0xffdf7a, 2.5);
    goldLight.position.set(15, 25, 10);
    scene.add(goldLight);
    const mintLight = new THREE.DirectionalLight(0x6effb8, 1.5);
    mintLight.position.set(-15, 15, -5);
    scene.add(mintLight);
    const fillLight = new THREE.DirectionalLight(0x081f14, 1.0);
    fillLight.position.set(0, -20, 5);
    scene.add(fillLight);

    // Textures
    const banknoteTexture = makeBanknoteTexture();
    const coinTexture     = makeCoinTexture();
    const sparkleTexture  = makeSparkleTexture();

    // Banknotes
    const banknoteGeo = new THREE.PlaneGeometry(4.3, 2.0, 4, 2);
    const banknoteMat = new THREE.MeshStandardMaterial({
      map: banknoteTexture, roughness: 0.6, metalness: 0.1,
      side: THREE.DoubleSide, transparent: true, alphaTest: 0.1,
    });

    interface BillData { mesh: THREE.Mesh; speedY: number; spinX: number; spinY: number; flutterPhase: number; flutterSpeed: number; driftX: number; }
    const bills: BillData[] = [];

    for (let i = 0; i < 65; i++) {
      const mesh = new THREE.Mesh(banknoteGeo, banknoteMat);
      mesh.position.set((Math.random() - 0.5) * 45, Math.random() * 40 - 15, (Math.random() - 0.5) * 30);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const s = 0.85 + Math.random() * 0.4;
      mesh.scale.set(s, s, s);
      scene.add(mesh);
      bills.push({
        mesh, speedY: 0.05 + Math.random() * 0.06,
        spinX: (Math.random() - 0.5) * 0.015, spinY: (Math.random() - 0.5) * 0.02,
        flutterPhase: Math.random() * 100, flutterSpeed: 0.02 + Math.random() * 0.025,
        driftX: (Math.random() - 0.5) * 0.02,
      });
    }

    // Coins
    const coinGeo  = new THREE.CylinderGeometry(0.9, 0.9, 0.15, 32);
    const coinSide = new THREE.MeshStandardMaterial({ color: 0xb58209, roughness: 0.35, metalness: 0.85 });
    const coinFace = new THREE.MeshStandardMaterial({ map: coinTexture, roughness: 0.18, metalness: 0.9, bumpMap: coinTexture, bumpScale: 0.04 });
    const coinMats = [coinSide, coinFace, coinFace];

    interface CoinData { mesh: THREE.Mesh; speedY: number; spinX: number; spinY: number; spinZ: number; wobblePhase: number; wobbleSpeed: number; }
    const coinItems: CoinData[] = [];

    for (let i = 0; i < 45; i++) {
      const mesh = new THREE.Mesh(coinGeo, coinMats);
      mesh.position.set((Math.random() - 0.5) * 45, Math.random() * 40 - 15, (Math.random() - 0.5) * 25);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const s = 0.8 + Math.random() * 0.5;
      mesh.scale.set(s, s, s);
      scene.add(mesh);
      coinItems.push({
        mesh, speedY: 0.11 + Math.random() * 0.09,
        spinX: (Math.random() - 0.5) * 0.06, spinY: (Math.random() - 0.5) * 0.06, spinZ: (Math.random() - 0.5) * 0.03,
        wobblePhase: Math.random() * 50, wobbleSpeed: 0.05 + Math.random() * 0.05,
      });
    }

    // Sparkles
    const SPARK_COUNT = 90;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT * 3; i += 3) {
      sparkPos[i]   = (Math.random() - 0.5) * 50;
      sparkPos[i+1] = (Math.random() - 0.5) * 40;
      sparkPos[i+2] = (Math.random() - 0.5) * 30;
    }
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.65, map: sparkleTexture,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Points(sparkGeo, sparkMat));

    // Animation loop
    const clock = new THREE.Clock();
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const time = clock.getElapsedTime();

      for (const b of bills) {
        b.flutterPhase += b.flutterSpeed;
        b.mesh.position.y -= b.speedY;
        b.mesh.position.x += Math.sin(b.flutterPhase) * 0.015 + b.driftX;
        b.mesh.rotation.z  = Math.sin(b.flutterPhase) * 0.35;
        b.mesh.rotation.x += b.spinX;
        b.mesh.rotation.y += b.spinY;
        if (b.mesh.position.y < -22) {
          b.mesh.position.y = 22;
          b.mesh.position.x = (Math.random() - 0.5) * 45;
          b.mesh.position.z = (Math.random() - 0.5) * 30;
          b.flutterPhase = Math.random() * 100;
        }
      }

      for (const co of coinItems) {
        co.wobblePhase += co.wobbleSpeed;
        co.mesh.position.y -= co.speedY;
        co.mesh.rotation.x += co.spinX;
        co.mesh.rotation.y += co.spinY;
        co.mesh.rotation.z += co.spinZ;
        co.mesh.position.x += Math.cos(co.wobblePhase) * 0.005;
        if (co.mesh.position.y < -22) {
          co.mesh.position.y = 22;
          co.mesh.position.x = (Math.random() - 0.5) * 45;
          co.mesh.position.z = (Math.random() - 0.5) * 25;
        }
      }

      const pos = sparkGeo.attributes.position.array as Float32Array;
      for (let i = 1; i < SPARK_COUNT * 3; i += 3) {
        pos[i] -= 0.02;
        pos[i - 1] += Math.sin(time * 0.5 + i) * 0.005;
        if (pos[i] < -20) { pos[i] = 20; pos[i - 1] = (Math.random() - 0.5) * 50; }
      }
      sparkGeo.attributes.position.needsUpdate = true;

      camera.position.x = Math.sin(time * 0.15) * 1.5;
      camera.position.y = Math.cos(time * 0.10) * 1.0;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    loop();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      banknoteTexture.dispose(); coinTexture.dispose(); sparkleTexture.dispose();
      banknoteGeo.dispose(); banknoteMat.dispose();
      coinGeo.dispose(); coinSide.dispose(); coinFace.dispose();
      sparkGeo.dispose(); sparkMat.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: "fixed", inset: 0, zIndex: 0 }}
      />
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(circle, transparent 30%, rgba(0,0,0,0.70) 100%)",
        }}
      />
    </>
  );
}
