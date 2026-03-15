"use client";

import React, { useMemo } from "react";
import { useUi } from "@/components/UiProvider";

type NeonStar = {
  id: number;
  top: string;
  left: string;
  size: number;
  duration: number;
};

type NeonGlitchLine = {
  id: number;
  delay: number;
  duration: number;
  top: string;
};

export default function NeonThemeBackground() {
  const { theme } = useUi();

  const stars = useMemo<NeonStar[]>(() => {
    return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 65}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 0.5,
      duration: 2 + Math.random() * 3,
    }));
  }, []);

  const glitchLines = useMemo<NeonGlitchLine[]>(() => {
    return Array.from({ length: 4 }).map((_, i) => ({
      id: i,
      delay: i * 1.5,
      duration: 3 + Math.random() * 2,
      top: `${20 + i * 20}%`,
    }));
  }, []);

  if (theme !== "neon") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 min-h-screen w-full overflow-hidden select-none bg-[#0d0221]"
    >
      <div className="absolute inset-0 z-50 opacity-[0.08] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {glitchLines.map((line) => (
        <div
          key={line.id}
          className="animate-neon-vhs-scan absolute inset-x-0 z-[45] h-[2px] bg-cyan-400/20"
          style={{
            top: line.top,
            animationDelay: `${line.delay}s`,
            animationDuration: `${line.duration}s`,
          }}
        />
      ))}

      <div className="absolute left-1/2 top-[15%] z-10 h-[350px] w-[350px] -translate-x-1/2 overflow-hidden rounded-full">
        <div className="animate-neon-sun-glow relative h-full w-full bg-gradient-to-b from-[#ff00ff] via-[#ff00aa] to-[#ffcc00] shadow-[0_0_120px_rgba(255,0,150,0.4)]">
          <div className="animate-neon-sun-lines absolute inset-0 flex h-[200%] w-full flex-col justify-around py-4">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="w-full bg-[#0d0221]"
                style={{
                  height: `${2 + (i % 5) * 2}px`,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        {stars.map((star) => (
          <div
            key={star.id}
            className="animate-neon-star-flicker absolute rounded-full bg-white opacity-40"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDuration: `${star.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 h-[45%] [perspective:800px]">
        <div
          className="animate-neon-grid-flow absolute inset-0 h-[300%] w-full origin-top bg-[linear-gradient(to_right,rgba(0,255,255,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,255,255,0.3)_2px,transparent_2px)] bg-[size:80px_80px]"
          style={{
            transform: "rotateX(70deg)",
            maskImage: "linear-gradient(to bottom, transparent, black 40%)",
          }}
        />
        <div className="animate-neon-horizon-pulse absolute top-0 z-30 h-[2px] w-full bg-fuchsia-500 shadow-[0_0_30px_#ff00ff]" />
      </div>

      <div className="absolute inset-0 z-40 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_4px]" />

      <div className="absolute inset-0 z-[60] shadow-[inset_0_0_20vw_rgba(0,0,0,0.9)]" />

      <style jsx>{`
        @keyframes neon-grid-flow {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 0 80px;
          }
        }

        @keyframes neon-sun-glow {
          0%,
          100% {
            filter: brightness(1) drop-shadow(0 0 20px rgba(255, 0, 255, 0.4));
          }
          50% {
            filter: brightness(1.2) drop-shadow(0 0 40px rgba(255, 0, 255, 0.6));
          }
        }

        @keyframes neon-sun-lines {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-50%);
          }
        }

        @keyframes neon-star-flicker {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.2);
          }
        }

        @keyframes neon-vhs-scan {
          0% {
            transform: translateY(-10vh);
            opacity: 0;
          }
          10%,
          90% {
            opacity: 0.3;
          }
          100% {
            transform: translateY(110vh);
            opacity: 0;
          }
        }

        @keyframes neon-horizon-pulse {
          0%,
          100% {
            opacity: 0.5;
            box-shadow: 0 0 20px #ff00ff;
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 40px #ff00ff;
          }
        }

        .animate-neon-grid-flow {
          animation: neon-grid-flow 1s linear infinite;
        }

        .animate-neon-sun-glow {
          animation: neon-sun-glow 4s ease-in-out infinite;
        }

        .animate-neon-sun-lines {
          animation: neon-sun-lines 10s linear infinite;
        }

        .animate-neon-star-flicker {
          animation: neon-star-flicker 3s ease-in-out infinite;
        }

        .animate-neon-vhs-scan {
          animation-name: neon-vhs-scan;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .animate-neon-horizon-pulse {
          animation: neon-horizon-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
