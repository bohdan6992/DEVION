"use client";

import { useEffect, useState } from "react";

const GLITCH_CHARS = "▓░█▒@#%&!?01<>|/\\[]{}~^*∆Ω∑≠±";

interface GlitchTitleProps {
  text: string;
  accentHex?: string;
  fontSize?: string;
}

export function GlitchTitle({
  text,
  accentHex = "rgba(255,255,255,0.35)",
  fontSize = "clamp(22px, 2.8vw, 40px)",
}: GlitchTitleProps) {
  const [letters, setLetters] = useState(text.split(""));
  const [rgbShift, setRgbShift] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;

    const schedule = () => {
      t = setTimeout(() => {
        const burstLen = 1 + Math.floor(Math.random() * 3);
        let d = 0;
        for (let b = 0; b < burstLen; b++) {
          setTimeout(() => {
            setRgbShift(true);
            setPhase(Math.random() > 0.5 ? 1 : 2);
            setLetters(
              text.split("").map((ch) =>
                Math.random() < 0.35
                  ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
                  : ch
              )
            );
          }, d);
          setTimeout(() => {
            setRgbShift(false);
            setLetters(text.split(""));
          }, d + 70 + Math.random() * 80);
          d += 140 + Math.random() * 100;
        }
        schedule();
      }, 2200 + Math.random() * 3800);
    };

    schedule();
    return () => clearTimeout(t);
  }, [text]);

  const G = "#ff2244";
  const C = "#00eeff";
  const shiftX = phase === 1 ? 5 : 4;

  const fontStyle: React.CSSProperties = {
    fontFamily: "'Bebas Neue','Rajdhani',system-ui,sans-serif",
    fontSize,
    fontWeight: 700,
    letterSpacing: "0.06em",
    lineHeight: 1,
  };

  return (
    <div className="relative" style={{ lineHeight: 1, userSelect: "none" }}>
      {rgbShift && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center"
          style={{ transform: `translateX(-${shiftX}px) translateY(1px)`, mixBlendMode: "screen" }}
        >
          <span style={{ ...fontStyle, color: G, opacity: 0.55 }}>
            {letters.join("")}
          </span>
        </div>
      )}

      {rgbShift && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center"
          style={{ transform: `translateX(${shiftX}px) translateY(-1px)`, mixBlendMode: "screen" }}
        >
          <span style={{ ...fontStyle, color: C, opacity: 0.38 }}>
            {letters.join("")}
          </span>
        </div>
      )}

      <h1
        style={{
          ...fontStyle,
          margin: 0,
          color: rgbShift ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.94)",
          textShadow: rgbShift
            ? `0 0 30px ${accentHex}, 2px 0 0 ${G}33, -2px 0 0 ${C}33`
            : `0 0 50px ${accentHex}, 0 1px 0 rgba(0,0,0,0.5)`,
          transition: rgbShift ? "none" : "text-shadow 0.3s ease",
          filter: rgbShift ? `drop-shadow(0 0 6px ${accentHex})` : "none",
        }}
      >
        {letters.map((ch, i) => (
          <span
            key={i}
            style={{
              color: rgbShift && ch !== text[i] ? "rgba(255,255,255,0.9)" : undefined,
              display: "inline-block",
              transition: "none",
              marginRight: ch === " " ? "0.06em" : undefined,
            }}
          >
            {ch === " " ? " " : ch}
          </span>
        ))}
      </h1>
    </div>
  );
}
