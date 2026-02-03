import React from "react";

type Props = React.SVGProps<SVGSVGElement> & { glow?: boolean };

const CommonStyles = () => (
  <style>{`
    @keyframes icon-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-1.2px); } }
    @keyframes icon-pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes icon-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes icon-dash { to { stroke-dashoffset: 0; } }
    @keyframes icon-terminal { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    .anim-float { animation: icon-float 3s ease-in-out infinite; }
    .anim-pulse { animation: icon-pulse-subtle 2s ease-in-out infinite; }
    .anim-spin { animation: icon-spin-slow 10s linear infinite; transform-origin: center; }
    .anim-terminal { animation: icon-terminal 1s step-end infinite; }
  `}</style>
);

// 1. Terminal - Чистий код, без зайвих ліній зверху
export function IconCode({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 10l2.5 2L8 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="anim-terminal" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 2. Shield - Покращена форма, тонкі лінії безпеки
export function IconSecurity({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 7.5c-2.5 0-3.5 1-3.5 1s0 2.5 0 3.5c0 2.5 3.5 4.5 3.5 4.5s3.5-2 3.5-4.5c0-1 0-3.5 0-3.5s-1-1-3.5-1z" 
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="anim-float" />
      <circle cx="12" cy="11.5" r="0.6" fill="currentColor" className="anim-pulse" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 3. Nodes - Тонкі зв'язки, без напливів
export function IconNodes({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="15.5" cy="15.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="15.5" cy="8.5" r="0.8" fill="currentColor" strokeOpacity="0.4" className="anim-pulse" />
      <path d="M10 8.5h4M15.5 10v4M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.3" strokeLinecap="round" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 4. Energy - Більш гостра та динамічна блискавка
export function IconEnergy({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 7l-4 5.5h5L10 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="anim-float" />
      <path d="M7 6.5a8 8 0 0110 0" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="2 2" className="anim-spin" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 5. Analytics - Чіткі стовпчики та тонка лінія тренду
export function IconChart({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 16v-3.5M12 16V9M16.5 16v-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.5 9.5l3 2.5 3.5-3 2.5 2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" className="anim-pulse" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 6. Layers - Тонкі паралельні пласти
export function IconLayers({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 9l5 2.5 5-2.5-5-2.5-5 2.5z" stroke="currentColor" strokeWidth="1.2" className="anim-float" />
      <path d="M7 12.5l5 2.5 5-2.5M7 16l5 2.5 5-2.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.4" strokeLinecap="round" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 7. Aim/Focus - Більш точні перехрестя (замість Gear)
export function IconSettings({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 3" className="anim-spin" />
      <path d="M12 8v-1M12 17v-1M8 12H7m10 0h-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" className="anim-pulse" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}

// 8. Cloud - Чиста геометрія без перетину ліній
export function IconCloud({ glow = false, ...p }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <CommonStyles />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 14h8.5a2.5 2.5 0 000-5c-.3 0-.6 0-.9.1a3.5 3.5 0 00-6.6.9 2.5 2.5 0 00-1 4z" 
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="anim-float" />
      <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="2 1" />
      {glow && <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2.8" strokeOpacity="0.2" />}
    </svg>
  );
}