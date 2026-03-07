import { useMemo } from "react";
import { useUi } from "@/components/UiProvider";

type Slice = { z: number; opacity: number; stroke: number };

const DEPTH = 18;
const STEP = 5;
const DARK_DEPTH = 28;
const DARK_STEP = 5.4;

const DOLLAR_PATH =
  "M130 64 L130 196 " +
  "M160 84 C150 68 112 68 100 86 " +
  "C88 106 106 122 130 129 " +
  "C154 136 172 152 160 172 " +
  "C147 191 111 193 96 180 " +
  "M100 84 L160 84 " +
  "M96 180 L160 180";

const FLAMINGO_PATH =
  "M98 192 " +
  "C110 178 118 164 122 150 " +
  "C126 134 122 119 112 108 " +
  "C103 98 96 84 99 72 " +
  "C102 62 113 57 123 61 " +
  "C131 64 137 72 139 81 " +
  "C141 92 136 103 128 111 " +
  "C142 114 155 122 162 136 " +
  "C170 151 169 166 160 178 " +
  "C151 190 137 197 122 197 " +
  "M122 197 L138 197 " +
  "M138 197 C146 197 152 203 152 212 " +
  "M116 166 C126 168 137 167 146 162 " +
  "M118 148 C126 150 134 149 141 145 " +
  "M126 111 C132 103 136 94 136 85 " +
  "M136 85 C147 84 156 80 162 72 " +
  "M162 72 C156 70 150 70 144 72 " +
  "M102 192 L96 210 " +
  "M138 196 L134 213";

const MOON_PATH =
  "M156 84 " +
  "C136 76 114 80 100 96 " +
  "C86 112 83 136 94 156 " +
  "C106 178 128 188 150 184 " +
  "C138 178 128 168 122 156 " +
  "C112 137 113 114 126 98 " +
  "C134 88 145 83 156 84 " +
  "M118 114 C122 112 126 113 129 116 " +
  "M112 134 C117 131 122 132 125 136 " +
  "M126 149 C130 146 135 147 138 151";

const BITCOIN_PATH =
  "M114 76 L114 190 " +
  "M146 76 L146 190 " +
  "M108 90 L160 90 C174 90 183 98 183 111 C183 124 174 132 160 132 L108 132 " +
  "M108 132 L165 132 C181 132 191 142 191 158 C191 174 180 186 162 186 L108 186";

const ROBOT_PATH =
  "M112 64 L148 64 L154 74 L154 104 L106 104 L106 74 Z " +
  "M118 80 L126 80 M134 80 L142 80 " +
  "M116 94 L144 94 " +
  "M90 112 L170 112 L176 124 L176 164 L84 164 L84 124 Z " +
  "M84 124 L58 124 L46 132 L46 142 L84 142 " +
  "M176 124 L202 124 L214 132 L214 142 L176 142 " +
  "M96 116 L96 160 M110 116 L110 160 M150 116 L150 160 M164 116 L164 160 " +
  "M98 164 L122 164 L120 204 L98 204 Z " +
  "M138 164 L162 164 L160 204 L138 204 Z " +
  "M104 204 L98 220 M154 204 L160 220 " +
  "M128 52 L128 64 M132 52 L132 64";

const STAR_PATH =
  "M130 68 " +
  "L146 110 " +
  "L192 112 " +
  "L156 140 " +
  "L170 184 " +
  "L130 158 " +
  "L90 184 " +
  "L104 140 " +
  "L68 112 " +
  "L114 110 Z";

export default function ThemeDollarSpinner() {
  const { theme } = useUi();
  const isLight = theme === "light";
  const isNeon = theme === "neon";
  const isDark = theme === "dark";
  const isSpace = theme === "space";
  const isAurora = theme === "aurora";
  const modelPath = isNeon
    ? FLAMINGO_PATH
    : isLight
      ? STAR_PATH
    : isSpace
      ? MOON_PATH
      : isAurora
        ? BITCOIN_PATH
        : isDark
          ? ROBOT_PATH
          : DOLLAR_PATH;
  const mainStroke = isNeon
    ? "#d946ef"
    : isLight
      ? "#facc15"
    : isSpace
      ? "var(--dash-accent)"
      : isAurora
        ? "var(--dash-accent)"
      : isDark
        ? "rgba(209,250,229,0.92)"
        : "#22c55e";
  const glowShadow = isNeon
    ? "rgba(217, 70, 239, 0.4)"
    : isLight
      ? "rgba(250, 204, 21, 0.44)"
    : isSpace
      ? "var(--dash-accent-shadow)"
      : isAurora
        ? "var(--dash-accent-shadow)"
      : isDark
        ? "rgba(209, 250, 229, 0.42)"
        : "rgba(34, 197, 94, 0.38)";
  const depthCount = isDark ? DARK_DEPTH : DEPTH;
  const depthStep = isDark ? DARK_STEP : STEP;

  const slices = useMemo<Slice[]>(() => {
    const mid = (depthCount - 1) / 2;
      return Array.from({ length: depthCount }, (_, i) => {
        const dist = Math.abs(i - mid) / mid;
        return {
          z: (i - mid) * depthStep,
          opacity: isDark ? 0.18 + (1 - dist) * 0.74 : 0.22 + (1 - dist) * 0.7,
          stroke: isDark ? 2.4 + (1 - dist) * 3.8 : 2.8 + (1 - dist) * 3.2,
        };
      });
    }, [depthCount, depthStep, isDark]);

  return (
    <section className={`dollar-3d-shell rounded-2xl h-full w-full p-0 ${isLight ? "light-model" : ""} ${isNeon ? "neon-model" : ""} ${isSpace ? "space-model" : ""} ${isAurora ? "aurora-model" : ""} ${isDark ? "dark-model" : ""}`}>
      <div className="dollar-3d-stage">
        <div className="dollar-3d-rotor">
          <div className="wire-cube" aria-hidden="true">
            <span className="cube-face face-front" />
            <span className="cube-face face-back" />
            <span className="cube-face face-left" />
            <span className="cube-face face-right" />
            <span className="cube-face face-top" />
            <span className="cube-face face-bottom" />
          </div>

          <div className="dollar-stack" aria-hidden="true">
            {slices.map((slice, idx) => (
              <svg
                key={idx}
                viewBox="0 0 260 260"
                className="dollar-slice"
                style={{
                  transform: `translate3d(-50%, -50%, ${slice.z}px)`,
                  opacity: slice.opacity,
                }}
              >
                <path d={modelPath} fill="none" stroke={mainStroke} strokeWidth={slice.stroke} strokeLinecap="square" strokeLinejoin="bevel" />
              </svg>
            ))}
          </div>
        </div>
        <div className="dollar-3d-rotor rotor-counter" aria-hidden="true">
          <div className="wire-cube wire-cube-thin">
            <span className="cube-face face-front" />
            <span className="cube-face face-back" />
            <span className="cube-face face-left" />
            <span className="cube-face face-right" />
            <span className="cube-face face-top" />
            <span className="cube-face face-bottom" />
          </div>
        </div>
      </div>

      <style jsx>{`
        .dollar-3d-shell {
          background: transparent;
          height: 100%;
          width: 100%;
        }

        .dollar-3d-stage {
          min-height: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          perspective: 1400px;
          perspective-origin: center;
          overflow: hidden;
        }

        .dollar-3d-rotor {
          position: relative;
          width: min(90%, 640px);
          aspect-ratio: 1 / 1;
          transform-style: preserve-3d;
          animation: rotateModel 16s cubic-bezier(0.42, 0, 0.2, 1) infinite;
        }

        .rotor-counter {
          position: absolute;
          width: min(90%, 640px);
          aspect-ratio: 1 / 1;
          animation: rotateCounter 13.5s linear infinite;
          opacity: 0.55;
        }

        .dollar-stack {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
        }

        .dollar-slice {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(88%, 650px);
          height: min(88%, 650px);
          filter: drop-shadow(0 0 10px ${glowShadow});
        }

        .wire-cube {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          transform-style: preserve-3d;
          pointer-events: none;
        }

        .wire-cube-thin .cube-face {
          width: 236px;
          height: 236px;
          border-width: 1.2px;
          border-color: rgba(52, 211, 153, 0.24);
          box-shadow: 0 0 18px rgba(34, 197, 94, 0.16);
        }

        .dollar-3d-shell.space-model .wire-cube-thin .cube-face {
          border-color: color-mix(in oklab, var(--dash-accent-border) 72%, transparent);
          box-shadow: 0 0 18px color-mix(in oklab, var(--dash-accent-shadow) 58%, transparent);
        }

        .dollar-3d-shell.light-model .wire-cube-thin .cube-face {
          border-color: rgba(250, 204, 21, 0.32);
          box-shadow: 0 0 18px rgba(250, 204, 21, 0.2);
        }

        .dollar-3d-shell.aurora-model .wire-cube-thin .cube-face {
          border-color: color-mix(in oklab, var(--dash-accent-border) 70%, transparent);
          box-shadow: 0 0 18px color-mix(in oklab, var(--dash-accent-shadow) 52%, transparent);
        }

        .dollar-3d-shell.dark-model .wire-cube-thin .cube-face {
          border-color: rgba(209, 250, 229, 0.32);
          box-shadow: 0 0 18px rgba(209, 250, 229, 0.16);
        }

        .cube-face {
          position: absolute;
          width: min(74%, 560px);
          height: min(74%, 560px);
          border: 2.6px solid rgba(34, 197, 94, 0.46);
          box-shadow:
            0 0 24px rgba(34, 197, 94, 0.24),
            inset 0 0 0 1px rgba(134, 239, 172, 0.22);
          backface-visibility: hidden;
        }

        .dollar-3d-shell.neon-model .cube-face {
          border-color: rgba(217, 70, 239, 0.5);
          box-shadow:
            0 0 24px rgba(217, 70, 239, 0.26),
            inset 0 0 0 1px rgba(232, 121, 249, 0.24);
        }

        .dollar-3d-shell.space-model .cube-face {
          border-color: color-mix(in oklab, var(--dash-accent-border) 88%, transparent);
          box-shadow:
            0 0 24px color-mix(in oklab, var(--dash-accent-shadow) 64%, transparent),
            inset 0 0 0 1px color-mix(in oklab, var(--dash-accent-border) 54%, transparent);
        }

        .dollar-3d-shell.light-model .cube-face {
          border-color: rgba(250, 204, 21, 0.46);
          box-shadow:
            0 0 24px rgba(250, 204, 21, 0.24),
            inset 0 0 0 1px rgba(253, 224, 71, 0.24);
        }

        .dollar-3d-shell.aurora-model .cube-face {
          border-color: color-mix(in oklab, var(--dash-accent-border) 86%, transparent);
          box-shadow:
            0 0 24px color-mix(in oklab, var(--dash-accent-shadow) 58%, transparent),
            inset 0 0 0 1px color-mix(in oklab, var(--dash-accent-border) 52%, transparent);
        }

        .dollar-3d-shell.dark-model .cube-face {
          border-color: rgba(209, 250, 229, 0.46);
          box-shadow:
            0 0 26px rgba(209, 250, 229, 0.2),
            inset 0 0 0 1px rgba(255, 255, 255, 0.16);
        }

        .cube-face::before,
        .cube-face::after {
          content: "";
          position: absolute;
          inset: 10px;
          pointer-events: none;
        }

        .cube-face::before {
          border-top: 1.6px solid rgba(134, 239, 172, 0.28);
          transform: skewX(-22deg);
          transform-origin: top left;
        }

        .cube-face::after {
          border-left: 1.6px solid rgba(134, 239, 172, 0.24);
          transform: skewY(-22deg);
          transform-origin: top left;
        }

        .dollar-3d-shell.neon-model .cube-face::before {
          border-top-color: rgba(244, 114, 182, 0.3);
        }

        .dollar-3d-shell.light-model .cube-face::before {
          border-top-color: rgba(250, 204, 21, 0.28);
        }

        .dollar-3d-shell.neon-model .cube-face::after {
          border-left-color: rgba(232, 121, 249, 0.3);
        }

        .dollar-3d-shell.light-model .cube-face::after {
          border-left-color: rgba(250, 204, 21, 0.24);
        }

        .dollar-3d-shell.space-model .cube-face::before {
          border-top-color: color-mix(in oklab, var(--dash-accent-border) 70%, transparent);
        }

        .dollar-3d-shell.aurora-model .cube-face::before {
          border-top-color: color-mix(in oklab, var(--dash-accent-border) 66%, transparent);
        }

        .dollar-3d-shell.dark-model .cube-face::before {
          border-top-color: rgba(209, 250, 229, 0.22);
        }

        .dollar-3d-shell.space-model .cube-face::after {
          border-left-color: color-mix(in oklab, var(--dash-accent-border) 60%, transparent);
        }

        .dollar-3d-shell.aurora-model .cube-face::after {
          border-left-color: color-mix(in oklab, var(--dash-accent-border) 56%, transparent);
        }

        .dollar-3d-shell.dark-model .cube-face::after {
          border-left-color: rgba(209, 250, 229, 0.2);
        }

        .dollar-3d-shell.space-model .dollar-3d-rotor {
          animation: rotateMoon 18s cubic-bezier(0.42, 0, 0.2, 1) infinite;
        }

        .dollar-3d-shell.space-model .rotor-counter {
          animation: rotateMoonCounter 14.5s linear infinite;
          opacity: 0.42;
        }

        .dollar-3d-shell.space-model .dollar-slice {
          animation: moonGlow 4.2s ease-in-out infinite;
        }

        .dollar-3d-shell.aurora-model .dollar-3d-rotor {
          animation: rotateBitcoin 17s cubic-bezier(0.42, 0, 0.2, 1) infinite;
        }

        .dollar-3d-shell.aurora-model .rotor-counter {
          animation: rotateBitcoinCounter 13.8s linear infinite;
          opacity: 0.48;
        }

        .dollar-3d-shell.aurora-model .dollar-slice {
          animation: bitcoinPulse 3.2s ease-in-out infinite;
        }

        .dollar-3d-shell.dark-model .dollar-3d-rotor {
          animation: rotateRobot 18s cubic-bezier(0.42, 0, 0.2, 1) infinite;
        }

        .dollar-3d-shell.dark-model .rotor-counter {
          animation: rotateRobotCounter 14.5s linear infinite;
          opacity: 0.66;
        }

        .dollar-3d-shell.dark-model .dollar-slice {
          animation: robotPulse 3.6s ease-in-out infinite;
        }

        .face-front { transform: translateZ(40px); }
        .face-back { transform: translateZ(-40px); }
        .face-left { transform: rotateY(90deg) translateZ(170px); }
        .face-right { transform: rotateY(90deg) translateZ(-170px); }
        .face-top { transform: rotateX(90deg) translateZ(170px); }
        .face-bottom { transform: rotateX(90deg) translateZ(-170px); }

        @keyframes rotateModel {
          0% { transform: rotateX(-20deg) rotateY(0deg) rotateZ(6deg); }
          16% { transform: rotateX(-20deg) rotateY(6deg) rotateZ(6deg); }
          50% { transform: rotateX(-14deg) rotateY(180deg) rotateZ(0deg); }
          84% { transform: rotateX(-20deg) rotateY(354deg) rotateZ(6deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg) rotateZ(6deg); }
        }

        @keyframes rotateCounter {
          0% { transform: rotateX(18deg) rotateY(360deg) rotateZ(-8deg); }
          50% { transform: rotateX(24deg) rotateY(180deg) rotateZ(0deg); }
          100% { transform: rotateX(18deg) rotateY(0deg) rotateZ(-8deg); }
        }

        @keyframes rotateMoon {
          0% { transform: rotateX(-18deg) rotateY(0deg) rotateZ(3deg); }
          16% { transform: rotateX(-18deg) rotateY(6deg) rotateZ(3deg); }
          50% { transform: rotateX(-12deg) rotateY(180deg) rotateZ(-3deg); }
          84% { transform: rotateX(-18deg) rotateY(354deg) rotateZ(3deg); }
          100% { transform: rotateX(-18deg) rotateY(360deg) rotateZ(3deg); }
        }

        @keyframes rotateMoonCounter {
          0% { transform: rotateX(16deg) rotateY(360deg) rotateZ(-5deg); }
          50% { transform: rotateX(20deg) rotateY(180deg) rotateZ(2deg); }
          100% { transform: rotateX(16deg) rotateY(0deg) rotateZ(-5deg); }
        }

        @keyframes rotateBitcoin {
          0% { transform: rotateX(-16deg) rotateY(0deg) rotateZ(2deg); }
          16% { transform: rotateX(-16deg) rotateY(8deg) rotateZ(2deg); }
          50% { transform: rotateX(-11deg) rotateY(180deg) rotateZ(-2deg); }
          84% { transform: rotateX(-16deg) rotateY(352deg) rotateZ(2deg); }
          100% { transform: rotateX(-16deg) rotateY(360deg) rotateZ(2deg); }
        }

        @keyframes rotateBitcoinCounter {
          0% { transform: rotateX(15deg) rotateY(360deg) rotateZ(-4deg); }
          50% { transform: rotateX(19deg) rotateY(180deg) rotateZ(1deg); }
          100% { transform: rotateX(15deg) rotateY(0deg) rotateZ(-4deg); }
        }

        @keyframes rotateRobot {
          0% { transform: rotateX(-18deg) rotateY(0deg) rotateZ(0deg); }
          16% { transform: rotateX(-18deg) rotateY(6deg) rotateZ(0deg); }
          50% { transform: rotateX(-12deg) rotateY(180deg) rotateZ(0deg); }
          84% { transform: rotateX(-18deg) rotateY(354deg) rotateZ(0deg); }
          100% { transform: rotateX(-18deg) rotateY(360deg) rotateZ(0deg); }
        }

        @keyframes rotateRobotCounter {
          0% { transform: rotateX(12deg) rotateY(360deg) rotateZ(0deg); }
          50% { transform: rotateX(18deg) rotateY(180deg) rotateZ(0deg); }
          100% { transform: rotateX(12deg) rotateY(0deg) rotateZ(0deg); }
        }

        @keyframes robotPulse {
          0% { filter: drop-shadow(0 0 7px rgba(209, 250, 229, 0.36)); }
          50% { filter: drop-shadow(0 0 14px rgba(209, 250, 229, 0.52)); }
          100% { filter: drop-shadow(0 0 7px rgba(209, 250, 229, 0.36)); }
        }

        @keyframes moonGlow {
          0% { filter: drop-shadow(0 0 8px var(--dash-accent-shadow)); }
          50% { filter: drop-shadow(0 0 16px var(--dash-accent-shadow)); }
          100% { filter: drop-shadow(0 0 8px var(--dash-accent-shadow)); }
        }

        @keyframes bitcoinPulse {
          0% { filter: drop-shadow(0 0 8px var(--dash-accent-shadow)); }
          50% { filter: drop-shadow(0 0 14px var(--dash-accent-shadow)); }
          100% { filter: drop-shadow(0 0 8px var(--dash-accent-shadow)); }
        }

        @media (max-width: 980px) {
          .dollar-3d-stage {
            min-height: 360px;
          }

          .dollar-3d-rotor {
            width: min(95%, 480px);
          }

          .rotor-counter {
            width: min(95%, 480px);
          }

          .face-front { transform: translateZ(30px); }
          .face-back { transform: translateZ(-30px); }
          .face-left { transform: rotateY(90deg) translateZ(130px); }
          .face-right { transform: rotateY(90deg) translateZ(-130px); }
          .face-top { transform: rotateX(90deg) translateZ(130px); }
          .face-bottom { transform: rotateX(90deg) translateZ(-130px); }
        }
      `}</style>
    </section>
  );
}
