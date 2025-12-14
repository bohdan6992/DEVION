// pages/signals/[strategy].tsx
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React from "react";

const BridgeArbitrageSignals = dynamic(
  () => import("@/components/terminals/BridgeArbitrageSignals"),
  {
    ssr: false,
    loading: () => null, // важливо: щоб не було різного fallback HTML
  }
);

export default function StrategySignalsPage() {
  const router = useRouter();

  // На SSR query немає. На CSR теж спочатку може бути порожньо.
  if (!router.isReady) return null;

  const strategy = String(router.query.strategy ?? "").toLowerCase();
  if (strategy !== "arbitrage") return null;

  // Додаємо Suspense boundary, щоб прибрати “outside of a Suspense boundary”
  return (
    <main className="w-full">
      <React.Suspense fallback={null}>
        <BridgeArbitrageSignals />
      </React.Suspense>
    </main>
  );
}
