// components/NewsTicker.tsx
import React from "react";

// Типізація вхідних даних (адаптуй під свій інтерфейс новин)
interface TickerItem {
  id: string | number;
  title: string;
  link: string;
  pubDate: string | number | Date;
  source: string;
}

interface NewsTickerProps {
  items: TickerItem[];
  loading?: boolean;
}

export default function NewsTicker({ items, loading = false }: NewsTickerProps) {
  // Щоб анімація була безшовною (infinite loop), ми дублюємо список
  // Якщо новин мало, можна продублювати кілька разів
  const displayItems = [...items, ...items];

  if (!items || items.length === 0) return null;

  return (
    <div className="ticker-shell">
      {/* --- Label Label (Ліва частина) --- */}
      <div className="ticker-label">
        <div className="live-indicator">
          <span className="pulse-dot"></span>
        </div>
        <span className="label-text">MARKET FEED</span>
        <div className="v-line"></div>
      </div>

      {/* --- Рухомий рядок --- */}
      <div className={`ticker-wrapper ${loading ? "paused" : ""}`}>
        <div className="track">
          {displayItems.map((n, i) => (
            <a
              key={`${n.id}-${i}`} // Використовуємо індекс, бо id дублюються
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="ticker-item"
              title={n.title}
            >
              <span className="item-source">{n.source}</span>
              <span className="item-title">{n.title}</span>
              <span className="item-time">
                {new Date(n.pubDate).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="separator">///</span>
            </a>
          ))}
        </div>
      </div>

      <style jsx>{`
        .ticker-shell {
          /* Theme-driven tokens */
          --bg-glass: var(--dash-panel-bg);
          --border: color-mix(in oklab, var(--dash-panel-border) 86%, transparent);
          --text: var(--dash-text-main);
          --text-muted: var(--dash-text-muted);
          --accent: var(--dash-accent);
          --accent-soft: var(--dash-accent-soft);
          --accent-border: var(--dash-accent-border);
          --accent-shadow: var(--dash-accent-shadow);
          
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          height: 48px;
          background: var(--bg-glass);
          backdrop-filter: blur(24px);
          border: 1px solid var(--border);
          border-radius: 12px; /* Трохи менше скруглення для футера */
          overflow: hidden;
          box-shadow: var(--dash-panel-shadow);
          user-select: none;
        }

        /* --- ЛІВА ЧАСТИНА (LABEL) --- */
        .ticker-label {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 16px;
          height: 100%;
          background: color-mix(in oklab, var(--accent-soft) 92%, transparent);
          border-right: 1px solid var(--border);
          z-index: 2; /* Щоб текст не наїжджав при скролі */
          flex-shrink: 0;
        }

        .live-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 12px;
        }

        .pulse-dot {
          width: 6px;
          height: 6px;
          background-color: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-shadow);
          animation: pulse 2s infinite;
        }

        .label-text {
          font-family: 'JetBrains Mono', monospace; /* Технічний шрифт */
          font-size: 11px;
          font-weight: 800;
          color: var(--text);
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        /* --- ПРАВА ЧАСТИНА (SCROLL AREA) --- */
        .ticker-wrapper {
          flex: 1;
          overflow: hidden;
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
          
          /* Градієнтна маска, щоб текст плавно зникав по краях */
          mask-image: linear-gradient(
            to right, 
            transparent 0%, 
            black 20px, 
            black calc(100% - 20px), 
            transparent 100%
          );
        }

        .ticker-wrapper:hover .track {
          animation-play-state: paused;
        }

        .ticker-wrapper.paused .track {
          animation-play-state: paused;
        }

        .track {
          display: flex;
          gap: 0; /* Відступи регулюємо всередині item */
          white-space: nowrap;
          /* Анімація розрахована на 2 набори елементів. 
             Чим довший рядок, тим більше часу треба. 
             60s - це повільно і плавно. */
          animation: scroll 60s linear infinite;
          will-change: transform;
        }

        .ticker-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-right: 32px; /* Відступ між новинами */
          text-decoration: none;
          transition: opacity 0.2s;
        }

        .ticker-item:hover .item-title {
          color: var(--accent);
          text-shadow: 0 0 10px color-mix(in oklab, var(--accent-shadow) 65%, transparent);
        }

        .item-source {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--accent);
          background: color-mix(in oklab, var(--accent-soft) 92%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent-border) 75%, transparent);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .item-title {
          font-size: 13px;
          color: var(--text);
          font-weight: 500;
        }

        .item-time {
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'JetBrains Mono', monospace;
        }

        .separator {
          color: color-mix(in oklab, var(--accent-border) 70%, transparent);
          font-size: 10px;
          margin-left: 8px;
          letter-spacing: -2px;
          opacity: 0.5;
        }

        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); } 
          /* -50% працює ідеально, якщо список продубльовано рівно 1 раз */
        }

        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* Мобільна адаптація */
        @media (max-width: 640px) {
           .label-text { display: none; } /* Ховаємо текст, лишаємо тільки точку */
           .ticker-label { padding: 0 10px; }
        }
      `}</style>
    </div>
  );
}
