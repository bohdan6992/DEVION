"use client";

import React, { useMemo, useRef, useState } from "react";
import { useSifter } from "./SifterProvider";
import { SifterPanel } from "./SifterPanel";

type Pt = { x: number; y: number };

export function SifterDock() {
  const { state, actions } = useSifter();
  const [pos, setPos] = useState<Pt>({ x: 24, y: 84 });
  const dragRef = useRef<{ start: Pt; origin: Pt; active: boolean } | null>(null);

  const visible = state.mode === "docked" && !state.isPopout;
  const style = useMemo(() => ({
    position: "fixed" as const,
    left: pos.x,
    top: pos.y,
    width: 1020,
    height: 720,
    zIndex: 60,
  }), [pos]);

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-sifter-drag]")) return;

    dragRef.current = {
      active: true,
      start: { x: e.clientX, y: e.clientY },
      origin: { ...pos },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    setPos({ x: Math.max(8, d.origin.x + dx), y: Math.max(8, d.origin.y + dy) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.active = false;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="pointer-events-auto rounded-2xl shadow-2xl border border-white/10 bg-black/70 backdrop-blur-xl overflow-hidden"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              data-sifter-drag
              className="w-8 h-6 rounded-lg bg-white/10 hover:bg-white/15 cursor-grab active:cursor-grabbing"
              title="Drag"
            />
            <div className="text-sm font-semibold text-white/90">
              Sifter
              <span className="ml-2 text-xs font-normal text-white/60">minute tape screener</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80"
              onClick={actions.openPopout}
              title="Pop-out"
            >
              Pop-out
            </button>
            <button
              className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80"
              onClick={actions.close}
              title="Close"
            >
              Close
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-44px)]">
          <SifterPanel />
        </div>
      </div>
    </div>
  );
}
