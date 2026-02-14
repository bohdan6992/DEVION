"use client";

import React from "react";

type Props = React.SVGProps<SVGSVGElement> & { glow?: boolean; color?: string };

const CommonStyles = () => (
  <style>{`
    @keyframes sonar-ping { 0% { transform: scale(0.4); opacity: 0.8; } 100% { transform: scale(1.2); opacity: 0; } }
    @keyframes scanner-pnl { 0% { stroke-dashoffset: 100; opacity: 0.3; } 50% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0.3; } }
    @keyframes scope-point { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } }
    @keyframes terminal-cursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes spectr-slide { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes swift-flow { 0% { transform: translateX(-10px); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateX(10px); opacity: 0; } }
    
    .anim-sonar { animation: sonar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; transform-origin: center; }
    .anim-pnl { stroke-dasharray: 100; animation: scanner-pnl 3s linear infinite; }
    .anim-scope { animation: scope-point 2s ease-in-out infinite; transform-origin: center; }
    .anim-cursor { animation: terminal-cursor 0.8s step-end infinite; }
    .anim-spectr-1 { animation: spectr-slide 4s ease-in-out infinite; }
    .anim-spectr-2 { animation: spectr-slide 4s ease-in-out infinite 0.5s; }
    .anim-swift { animation: swift-flow 1.5s linear infinite; }
  `}</style>
);

const Glow = ({ children }: { children: React.ReactNode }) => (
  <g className="opacity-40 blur-[6px]">{children}</g>
);

// 1. SONAR - Трейдингові сигнали (Імпульси)
export function IconSonar({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <CommonStyles />
      <circle cx="12" cy="12" r="9" strokeOpacity="0.1" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="6" className="anim-sonar" strokeWidth="1" />
      <path d="M12 12l4-7" strokeLinecap="round" className="animate-[spin_4s_linear_infinite] origin-center" />
      <circle cx="16" cy="5" r="1.5" fill="currentColor" stroke="none" className="anim-scope" />
      {glow && <Glow><circle cx="12" cy="12" r="6" /></Glow>}
    </svg>
  );
}

// 2. SCANNER - PnL Research (Крива прибутку)
export function IconScanner({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <CommonStyles />
      <path d="M3 16l4-3 4 5 5-10 5 4" strokeLinecap="round" strokeLinejoin="round" className="anim-pnl" />
      <path d="M3 16l4-3 4 5 5-10 5 4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" />
      <path d="M3 20h18" strokeWidth="1" strokeOpacity="0.2" />
      {glow && <Glow><path d="M3 16l4-3 4 5 5-10 5 4" /></Glow>}
    </svg>
  );
}

// 3. SCOPE - Глибокий аналіз (Сітка та метрики)
export function IconScope({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <CommonStyles />
      <rect x="4" y="4" width="16" height="16" rx="2" strokeOpacity="0.1" />
      <path d="M12 4v16M4 12h16" strokeOpacity="0.1" strokeWidth="1" />
      <circle cx="16" cy="8" r="2" strokeWidth="2" />
      <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none" className="anim-scope" />
      <path d="M4 19l4-4 3 2 9-9" strokeOpacity="0.4" strokeDasharray="2 2" />
      {glow && <Glow><circle cx="16" cy="8" r="2" /></Glow>}
    </svg>
  );
}

// 4. SWAGGER - API Terminal (Запити)
export function IconSwagger({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <CommonStyles />
      <path d="M7 8l-4 4 4 4M17 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 16l4-8" strokeOpacity="0.3" strokeLinecap="round" />
      <rect x="9" y="12" width="6" height="1" fill="currentColor" className="anim-cursor" stroke="none" />
      {glow && <Glow><path d="M7 8l-4 4 4 4M17 8l4 4-4 4" /></Glow>}
    </svg>
  );
}

// 5. SPECTR - Сховище історичних даних (Стек)
export function IconSpectr({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <CommonStyles />
      <g className="anim-spectr-1">
        <path d="M4 8l8-4 8 4-8 4-8-4z" fill="currentColor" fillOpacity="0.1" />
      </g>
      <g className="anim-spectr-2">
        <path d="M4 12l8 4 8-4" strokeOpacity="0.6" />
        <path d="M4 16l8 4 8-4" strokeOpacity="0.3" />
      </g>
      {glow && <Glow><path d="M12 4L4 8l8 4 8-4-8-4z" /></Glow>}
    </svg>
  );
}

// 6. SWIFT - Швидкий аналіз (Потік даних)
export function IconSwift({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <CommonStyles />
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.05" />
      <g className="anim-swift">
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <path d="M12 12h6" strokeOpacity="0.4" strokeWidth="1" />
      </g>
      <path d="M5 14h14" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 2" />
      {glow && <Glow><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></Glow>}
    </svg>
  );
}