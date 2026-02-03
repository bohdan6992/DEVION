import React from "react";
import { SifterPanel } from "@/components/sifter/SifterPanel";

export default function SifterPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Локальний хедер сторінки Sifter */}
      <div className="p-3 border-b border-white/10">
        <div className="text-sm font-semibold">Sifter</div>
        <div className="text-xs text-white/60">
          Day/Minute Screener over minute tape
        </div>
      </div>

      <div style={{ height: "calc(100vh - 56px)" }}>
        <SifterPanel />
      </div>
    </div>
  );
}
