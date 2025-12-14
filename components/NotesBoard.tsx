"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/components/UiProvider";

type Note = {
  id: string;
  text: string;
  created: string;
  pinned?: boolean;
};

const LS_KEY_V2 = "tt_notes_v2";
const LS_KEY_OLD = "tt_notes";

export default function NotesBoard() {
  const { theme } = useUi(); // Використовуємо тему якщо треба, але стиль буде Dark Premium
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // === Init / Migration ===
  useEffect(() => {
    try {
      const savedV2 = localStorage.getItem(LS_KEY_V2);
      if (savedV2) {
        setNotes(JSON.parse(savedV2));
        return;
      }
      const savedOld = localStorage.getItem(LS_KEY_OLD);
      if (savedOld) {
        const migrated: Note[] = JSON.parse(savedOld);
        setNotes(migrated);
        localStorage.setItem(LS_KEY_V2, JSON.stringify(migrated));
      }
    } catch {}
  }, []);

  // === Auto-save ===
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_V2, JSON.stringify(notes));
    } catch {}
  }, [notes]);

  // === Logic ===
  const addNote = () => {
    const t = text.trim();
    if (!t) return;
    const newNote: Note = {
      id: Math.random().toString(36).slice(2),
      text: t,
      created: new Date().toISOString(),
      pinned: false,
    };
    setNotes((p) => [newNote, ...p]);
    setText("");
    
    // Анімація скролу до верху списку
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  };

  const removeNote = (id: string) => {
    setNotes((p) => p.filter((n) => n.id !== id));
  };

  const togglePin = (id: string) => {
    setNotes((p) =>
      p.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      addNote();
    }
  };

  const sorted = useMemo(() => {
    const arr = [...notes];
    arr.sort((a, b) => {
      // Спочатку закріплені
      if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }
      // Потім новіші
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });
    return arr;
  }, [notes]);

  const visible = useMemo(() => {
    return filter === "pinned" ? sorted.filter((n) => n.pinned) : sorted;
  }, [sorted, filter]);

  return (
    <section className="wrap">
      {/* HEADER */}
      <header className="head">
        <div className="title-group">
          <span className="dot" />
          <h2 className="title">TRADING NOTES</h2>
          <span className="count-badge">{notes.length}</span>
        </div>

        <div className="filters">
          <button
            onClick={() => setFilter("all")}
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
          >
            ALL
          </button>
          <div className="v-sep" />
          <button
            onClick={() => setFilter("pinned")}
            className={`filter-btn ${filter === "pinned" ? "active" : ""}`}
          >
            PINNED
          </button>
        </div>
      </header>

      {/* INPUT AREA */}
      <div className="input-area">
        <input
          ref={inputRef}
          type="text"
          className="main-input"
          placeholder="Type your strategy or idea... (Ctrl + Enter to save)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="input-actions">
          {text && (
            <button className="icon-btn clear" onClick={() => setText("")} title="Clear">
              ✕
            </button>
          )}
          <button className="action-btn" onClick={addNote}>
            ADD NOTE
          </button>
        </div>
      </div>

      {/* LIST AREA */}
      <div className="notes-container">
        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p className="empty-text">
              {filter === "pinned" 
                ? "No pinned notes yet." 
                : "No notes recorded. Capture your thoughts above."}
            </p>
          </div>
        ) : (
          <ul className="notes-grid" ref={listRef}>
            {visible.map((n) => (
              <li key={n.id} className={`note-card ${n.pinned ? "pinned" : ""}`}>
                <div className="card-content">
                  <p className="note-text">{n.text}</p>
                  <div className="note-meta">
                    <span className="date">
                      {new Date(n.created).toLocaleString("uk-UA", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                    {n.pinned && <span className="pin-label">PINNED</span>}
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    className={`tool-btn pin ${n.pinned ? "active" : ""}`}
                    onClick={() => togglePin(n.id)}
                    title={n.pinned ? "Unpin" : "Pin"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                  </button>
                  <button
                    className="tool-btn delete"
                    onClick={() => removeNote(n.id)}
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style jsx>{`
        /* === GLOBAL VARS (Dark Premium) === */
        .wrap {
          --bg-glass: rgba(13, 13, 16, 0.85);
          --border: rgba(255, 255, 255, 0.08);
          --text: #ededed;
          --text-dim: #888888;
          --accent: #38bdf8; /* Cyan */
          --accent-glow: rgba(56, 189, 248, 0.3);
          --gold: #fbbf24;
          --red: #ef4444;
          --input-bg: rgba(0, 0, 0, 0.3);

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
          
          font-family: 'Inter', -apple-system, sans-serif;
          color: var(--text);
          box-shadow: 0 24px 48px -12px rgba(0,0,0,0.5);
          margin-bottom: 20px;
        }

        /* === HEADER === */
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dot {
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent);
          animation: pulse 2s infinite;
        }

        .title {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.05em;
          color: #fff;
          margin: 0;
        }

        .count-badge {
          background: rgba(255,255,255,0.1);
          color: var(--text-dim);
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(255,255,255,0.03);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .filter-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .filter-btn:hover { color: #fff; }
        .filter-btn.active {
          background: rgba(255,255,255,0.1);
          color: #fff;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .v-sep { width: 1px; height: 12px; background: var(--border); margin: 0 4px; }

        /* === INPUT AREA === */
        .input-area {
          display: flex;
          gap: 12px;
          background: var(--input-bg);
          border: 1px solid var(--border);
          padding: 8px;
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .input-area:focus-within {
          border-color: rgba(56, 189, 248, 0.5);
          box-shadow: 0 0 15px rgba(56, 189, 248, 0.1);
        }

        .main-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;
          padding: 8px;
          outline: none;
          font-family: inherit;
        }
        .main-input::placeholder { color: rgba(255,255,255,0.3); }

        .input-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .icon-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          width: 24px; height: 24px;
          display: grid; place-items: center;
          border-radius: 50%;
          transition: all 0.2s;
        }
        .icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

        .action-btn {
          background: var(--accent);
          color: #000;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'JetBrains Mono', monospace;
        }
        .action-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 0 10px var(--accent-glow);
        }

        /* === NOTES GRID === */
        .notes-container {
          min-height: 120px;
        }

        .notes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .note-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .note-card:hover {
          background: rgba(255,255,255,0.04);
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
          border-color: rgba(255,255,255,0.15);
        }

        /* PINNED STYLE */
        .note-card.pinned {
          border-color: rgba(251, 191, 36, 0.4); /* Gold border */
          background: linear-gradient(to bottom right, rgba(251, 191, 36, 0.05), rgba(0,0,0,0));
        }
        .note-card.pinned:hover {
          border-color: var(--gold);
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.15);
        }

        .card-content { display: flex; flex-direction: column; gap: 8px; }

        .note-text {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
          color: #eee;
          word-break: break-word;
        }

        .note-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .date {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--text-dim);
        }

        .pin-label {
          font-size: 9px;
          font-weight: 800;
          color: var(--gold);
          background: rgba(251, 191, 36, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }

        .card-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 10px;
          margin-top: auto;
        }

        .tool-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-dim);
          width: 28px; height: 28px;
          display: grid; place-items: center;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tool-btn:hover {
          background: rgba(255,255,255,0.05);
          border-color: var(--border);
          color: #fff;
        }
        .tool-btn.pin.active { color: var(--gold); }
        .tool-btn.pin:hover { color: var(--gold); background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.2); }
        .tool-btn.delete:hover { color: var(--red); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); }

        /* EMPTY STATE */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
          opacity: 0.6;
          border: 1px dashed var(--border);
          border-radius: 12px;
          background: rgba(255,255,255,0.01);
        }
        .empty-icon { font-size: 32px; margin-bottom: 10px; opacity: 0.5; }
        .empty-text { font-size: 13px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }

        @keyframes pulse {
          0% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0.5; transform: scale(1); }
        }

        @media (max-width: 600px) {
          .head { flex-direction: column; align-items: flex-start; gap: 12px; }
          .filters { width: 100%; justify-content: space-between; }
          .filter-btn { flex: 1; }
          .notes-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}