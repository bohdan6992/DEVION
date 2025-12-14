// pages/signals/[strategy].tsx
"use client";

import { useRouter } from "next/router";
import BridgeArbitrageSignals from "@/components/terminals/BridgeArbitrageSignals";

export default function StrategySignalsPage() {
  const { query } = useRouter();
  const strategy = String(query.strategy ?? "").toLowerCase();

  // Якщо це не арбітраж, повертаємо null (або порожній фрагмент),
  // оскільки ви просили прибрати текстові пояснення про відсутність стратегії.
  if (strategy !== "arbitrage") {
    return null; 
  }

  return (
    <main className="w-full">
      <BridgeArbitrageSignals />
    </main>
  );
}