"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MessageSquare, Twitter } from "lucide-react";
import { SiReddit } from "react-icons/si";

type Source = "twitter" | "reddit";

type Post = {
  id: string;
  author: string;
  text: string;
  time: string;
  upvotes?: number;
  context?: "positive" | "negative" | "neutral";
};

type Props = {
  initialSource?: Source;
  initialQuery?: string;
  limit?: number;
  refreshMs?: number;
  demoMode?: boolean;
};

// Демо-дані для фолбеку
function makeFallback(source: Source, query: string): Post[] {
  const q = (query || "AAPL").split(/\s+/)[0];
  const now = Date.now();
  const t = (ms: number) =>
    new Date(now - ms).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  return [
    {
      id: "fb-1",
      author: source === "twitter" ? "@FinTwitGuru" : "r/WallStreetBets",
      text:
        source === "twitter"
          ? `$${q} breakout imminent. Volume is spiking 3x average. Watching $205 level closely. 🚀`
          : `YOLO'd my savings into ${q} calls. Chart looks bullish, fundamentals are solid.`,
      time: t(5 * 60 * 1000),
      upvotes: 420,
      context: "positive",
    },
    {
      id: "fb-2",
      author: source === "twitter" ? "@BearTrap" : "r/Investing",
      text:
        source === "twitter"
          ? `Shorting ${q} here. RSI overbought on 4h timeframe. Expecting a pullback.`
          : `Deep dive analysis on ${q}'s latest earnings report. Margins are tightening.`,
      time: t(12 * 60 * 1000),
      upvotes: 69,
      context: "negative",
    },
    {
      id: "fb-3",
      author: source === "twitter" ? "@MarketWatch" : "r/Stocks",
      text:
        source === "twitter"
          ? `${q} consolidating around the VWAP. Waiting for clear direction.`
          : `Discussion: What are your thoughts on ${q}'s new product line?`,
      time: t(25 * 60 * 1000),
      upvotes: 112,
      context: "neutral",
    },
  ];
}

export default function SocialFeedWidget({
  initialSource = "twitter",
  initialQuery = "AAPL OR NVDA OR SPY",
  limit = 24,
  refreshMs = 120000,
  demoMode = false,
}: Props) {
  const [source, setSource] = useState<Source>(initialSource);
  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      if (demoMode) {
        setPosts(makeFallback(source, query));
        return;
      }

      const url = `/api/social?source=${source}&q=${encodeURIComponent(query)}&limit=${limit}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      const items = Array.isArray(data?.items) ? (data.items as Post[]) : [];
      if (items.length === 0) {
        setPosts(makeFallback(source, query));
      } else {
        setPosts(items);
      }
    } catch {
      setPosts(makeFallback(source, query));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, refreshMs);
    return () => clearInterval(t);
  }, [source, query, demoMode]);

  const applyQuery = () => {
    const v = inputValue.trim();
    if (!v) return;
    setQuery(v);
  };

  const sentimentColor = (c?: string) => {
    if (c === "positive") return "var(--green)";
    if (c === "negative") return "var(--red)";
    return "var(--text-dim)";
  };

  return (
    <section className="social-wrap">
      {/* HEADER */}
      <header className="social-head">
        <div className="title-group">
          <div className={`source-icon ${source}`}>
            {source === "twitter" ? <Twitter size={18} /> : <SiReddit size={18} />}
          </div>
          <h2 className="title">SOCIAL PULSE</h2>
          <span className="count-badge">{posts.length}</span>
        </div>

        <div className="source-switch">
          <button
            type="button"
            onClick={() => setSource("twitter")}
            className={`switch-btn ${source === "twitter" ? "active twitter" : ""}`}
          >
            TWITTER
          </button>
          <div className="v-sep" />
          <button
            type="button"
            onClick={() => setSource("reddit")}
            className={`switch-btn ${source === "reddit" ? "active reddit" : ""}`}
          >
            REDDIT
          </button>
        </div>
      </header>

      {/* SEARCH BAR */}
      <div className="search-bar">
        <div className="input-wrap">
          <span className="search-icon">🔍</span>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="search-input"
            placeholder="Search tickers (e.g. $AAPL)"
            onKeyDown={(e) => e.key === "Enter" && applyQuery()}
          />
        </div>
        <button className="apply-btn" onClick={applyQuery}>
          UPDATE
        </button>
      </div>

      {/* FEED CONTENT */}
      <div className="feed-container">
        {loading ? (
          <div className="feed-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="post-card skeleton" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <span>No discussions found for this query.</span>
          </div>
        ) : (
          <div className="feed-grid">
            {posts.map((p) => (
              <div 
                key={p.id} 
                className="post-card"
                style={{ "--sentiment": sentimentColor(p.context) } as React.CSSProperties}
              >
                <div className="card-header">
                  <span className="author">{p.author}</span>
                  <span className="time">{p.time}</span>
                </div>
                
                <p className="post-text">
                  {p.text}
                </p>

                <div className="card-footer">
                  <div className="sentiment-badge" style={{ color: sentimentColor(p.context) }}>
                    <span className="dot" style={{ background: sentimentColor(p.context) }} />
                    {p.context?.toUpperCase() || "NEUTRAL"}
                  </div>
                  
                  {typeof p.upvotes === "number" && (
                    <div className="votes">
                      <span>▲</span> {p.upvotes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        /* === GLOBAL VARS (Dark Premium) === */
        .social-wrap {
          --bg-glass: rgba(13, 13, 16, 0.85);
          --border: rgba(255, 255, 255, 0.08);
          --text: #ededed;
          --text-dim: #888888;
          --accent: #38bdf8;
          --twitter: #0ea5e9;
          --reddit: #ff4500;
          --green: #10b981;
          --red: #ef4444;

          width: 100%;
          box-sizing: border-box;

          background: var(--bg-glass);
          backdrop-filter: blur(24px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          
          font-family: 'Inter', sans-serif;
          color: var(--text);
          box-shadow: 0 24px 48px -12px rgba(0,0,0,0.5);
          margin-top: 20px;
        }

        /* === HEADER === */
        .social-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .title-group { display: flex; align-items: center; gap: 12px; }
        
        .source-icon {
          width: 32px; height: 32px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
        }
        .source-icon.twitter { color: var(--twitter); box-shadow: 0 0 15px rgba(14, 165, 233, 0.2); }
        .source-icon.reddit { color: var(--reddit); box-shadow: 0 0 15px rgba(255, 69, 0, 0.2); }

        .title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 16px; font-weight: 800; color: #fff; margin: 0;
          letter-spacing: 0.05em;
        }

        .count-badge {
          font-size: 11px; font-weight: 700;
          background: rgba(255,255,255,0.1);
          color: var(--text-dim);
          padding: 2px 8px; border-radius: 10px;
        }

        /* === SWITCH === */
        .source-switch {
          display: flex; align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: 8px; padding: 4px;
        }
        .v-sep { width: 1px; height: 12px; background: var(--border); margin: 0 2px; }

        .switch-btn {
          background: transparent; border: none;
          color: var(--text-dim); font-size: 11px; font-weight: 700;
          padding: 6px 12px; cursor: pointer; border-radius: 6px;
          transition: all 0.2s;
        }
        .switch-btn:hover { color: #fff; }
        .switch-btn.active { background: rgba(255,255,255,0.1); color: #fff; }
        .switch-btn.active.twitter { color: var(--twitter); }
        .switch-btn.active.reddit { color: var(--reddit); }

        /* === SEARCH BAR === */
        .search-bar {
          display: flex; gap: 8px;
        }
        .input-wrap {
          flex: 1; display: flex; align-items: center; gap: 10px;
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border);
          border-radius: 8px; padding: 0 12px;
          transition: border-color 0.2s;
        }
        .input-wrap:focus-within { border-color: var(--accent); }
        .search-icon { opacity: 0.5; font-size: 14px; }
        
        .search-input {
          flex: 1; height: 36px; background: transparent; border: none;
          color: #fff; font-size: 13px; outline: none;
          font-family: 'JetBrains Mono', monospace;
        }
        .search-input::placeholder { color: rgba(255,255,255,0.3); }

        .apply-btn {
          background: var(--accent);
          color: #000; border: none;
          padding: 0 16px; border-radius: 8px;
          font-size: 12px; font-weight: 800;
          cursor: pointer; transition: all 0.2s;
          font-family: 'JetBrains Mono', monospace;
        }
        .apply-btn:hover { filter: brightness(1.1); box-shadow: 0 0 10px rgba(56, 189, 248, 0.4); }

        /* === FEED GRID === */
        .feed-container { min-height: 200px; }
        .feed-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .post-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-left: 3px solid var(--sentiment);
          border-radius: 12px;
          padding: 16px;
          display: flex; flex-direction: column; gap: 10px;
          transition: all 0.2s;
        }
        .post-card:hover {
          background: rgba(255,255,255,0.04);
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
          border-top-color: rgba(255,255,255,0.1);
          border-right-color: rgba(255,255,255,0.1);
          border-bottom-color: rgba(255,255,255,0.1);
        }

        .card-header { display: flex; justify-content: space-between; align-items: baseline; }
        .author { font-weight: 700; font-size: 13px; color: #fff; }
        .time { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }

        .post-text {
          margin: 0; font-size: 13px; line-height: 1.5;
          color: #ddd; flex: 1;
        }

        .card-footer {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 4px; padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .sentiment-badge {
          font-size: 10px; font-weight: 800;
          display: flex; align-items: center; gap: 6px;
          padding: 4px 8px; border-radius: 4px;
          background: rgba(255,255,255,0.03);
        }
        .dot { width: 6px; height: 6px; border-radius: 50%; }

        .votes {
          font-size: 11px; font-weight: 700; color: var(--text-dim);
          display: flex; align-items: center; gap: 4px;
        }

        /* EMPTY STATE */
        .empty-state {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px; border: 1px dashed var(--border); border-radius: 12px;
          color: var(--text-dim); gap: 12px;
        }
        .empty-icon { font-size: 32px; opacity: 0.5; }

        /* SKELETON */
        .skeleton {
          height: 140px;
          border-radius: 12px;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.02) 0%,
            rgba(255,255,255,0.05) 50%,
            rgba(255,255,255,0.02) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        @media (max-width: 600px) {
          .social-head { flex-direction: column; align-items: flex-start; gap: 12px; }
          .source-switch { width: 100%; justify-content: space-between; }
          .switch-btn { flex: 1; }
          .feed-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}