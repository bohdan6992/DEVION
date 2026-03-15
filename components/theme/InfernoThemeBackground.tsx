"use client";

import React, { CSSProperties, useMemo } from "react";
import { useUi } from "@/components/UiProvider";

type InfernoParticle = {
  id: number;
  x: number;
  size: number;
  speed: number;
  delay: number;
  opacity: number;
  blur: string;
  isSpark: boolean;
  drift: number;
  flickerSpeed: number;
};

type InfernoFlame = {
  id: number;
  left: string;
  height: string;
  duration: number;
  delay: number;
  width: string;
  hueShift: number;
};

export default function InfernoThemeBackground() {
  const { theme } = useUi();

  const particles = useMemo<InfernoParticle[]>(() => {
    return Array.from({ length: 800 }).map((_, i) => {
      const depth = Math.random();
      const isForeground = Math.random() > 0.88;
      const isSpark = Math.random() > 0.4;

      return {
        id: i,
        x: Math.random() * 100,
        size: isForeground ? depth * 5 + 3 : depth * 2 + 0.5,
        speed: depth * 10 + 4,
        delay: Math.random() * 40,
        opacity: isForeground ? 0.25 : depth * 0.8 + 0.2,
        blur: isForeground ? "4px" : "0px",
        isSpark,
        drift: (Math.random() - 0.5) * 220,
        flickerSpeed: 0.8 + Math.random() * 3,
      };
    });
  }, []);

  const flames = useMemo<InfernoFlame[]>(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: `${i * 2.0 + Math.random() * 2}%`,
      height: `${25 + Math.random() * 20}%`,
      duration: 3 + Math.random() * 2.5,
      delay: Math.random() * -15,
      width: `${10 + Math.random() * 15}%`,
      hueShift: Math.floor(Math.random() * 12),
    }));
  }, []);

  if (theme !== "inferno") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none bg-[#020000]"
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(255,40,0,0.35)_0%,transparent_70%)] animate-inferno-ambient-pulse" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_100%,rgba(255,100,0,0.1)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_100%,rgba(255,100,0,0.1)_0%,transparent_40%)]" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 h-full">
        <div className="inferno-heat-refraction absolute inset-0 mix-blend-screen">
          {flames.map((flame) => (
            <div
              key={flame.id}
              className="animate-inferno-flame-dynamic absolute bottom-[-3%] rounded-[45%_45%_20%_20%]"
              style={{
                left: flame.left,
                width: flame.width,
                height: flame.height,
                background:
                  "linear-gradient(to top, #fff 0%, #ffef7d 15%, #ff8c00 45%, #e62e00 80%, transparent 100%)",
                filter: `blur(10px) hue-rotate(${flame.hueShift}deg) brightness(1.3)`,
                opacity: 0.85,
                animationDuration: `${flame.duration}s`,
                animationDelay: `${flame.delay}s`,
                transformOrigin: "bottom center",
              }}
            />
          ))}
        </div>

        <div className="absolute bottom-[-15px] z-20 h-40 w-full bg-gradient-to-t from-orange-700/50 via-red-950/20 to-transparent blur-[80px]" />
        <div className="absolute bottom-0 z-[25] h-10 w-full bg-white/10 blur-xl" />
      </div>

      <div className="absolute inset-0 z-30">
        {particles.map((particle) => {
          const style = {
            left: `${particle.x}%`,
            bottom: "-2%",
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            opacity: particle.opacity,
            filter: `blur(${particle.blur})`,
            animation: `inferno-rise-complex ${particle.speed}s cubic-bezier(0.15, 0.8, 0.25, 1) infinite, inferno-flicker-ember ${particle.flickerSpeed}s ease-in-out infinite`,
            animationDelay: `-${particle.delay}s`,
            "--drift-x": `${particle.drift}px`,
          } as CSSProperties & { ["--drift-x"]: string };

          return (
            <div
              key={particle.id}
              className={`absolute rounded-full ${
                particle.isSpark ? "bg-orange-300 shadow-[0_0_12px_#ffcc00]" : "bg-red-950/40"
              }`}
              style={style}
            />
          );
        })}
      </div>

      <div className="absolute inset-0 z-40 opacity-50 mix-blend-overlay">
        <svg width="100%" height="100%">
          <filter id="inferno-heat-haze-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="2" seed="1">
              <animate
                attributeName="baseFrequency"
                dur="25s"
                values="0.01 0.03; 0.015 0.05; 0.01 0.03"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="35" />
          </filter>
          <rect width="100%" height="100%" filter="url(#inferno-heat-haze-filter)" fill="transparent" />
        </svg>
      </div>

      <div className="absolute inset-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-transparent opacity-95" />
        <div className="absolute inset-0 shadow-[inset_0_0_25vw_rgba(0,0,0,1)]" />
      </div>

      <style jsx>{`
        @keyframes inferno-rise-complex {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          85% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-120vh) translateX(var(--drift-x)) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes inferno-flicker-ember {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(2.5);
          }
        }

        @keyframes inferno-flame-dynamic {
          0%,
          100% {
            transform: scaleY(1) skewX(0.5deg) scaleX(1);
            opacity: 0.8;
          }
          25% {
            transform: scaleY(1.15) skewX(-1deg) scaleX(0.98);
            opacity: 0.95;
          }
          75% {
            transform: scaleY(0.9) skewX(0.5deg) scaleX(1.05);
            opacity: 0.8;
          }
        }

        @keyframes inferno-ambient-pulse {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(1);
          }
          50% {
            opacity: 0.75;
            transform: scale(1.02);
          }
        }

        .inferno-heat-refraction {
          filter: url(#inferno-heat-haze-filter);
        }
      `}</style>
    </div>
  );
}
