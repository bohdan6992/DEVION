// pages/signals/[strategy].tsx
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React from "react";

const ArbitrageSonar = dynamic(
  () => import("@/components/sonar/ArbitrageSonar"),
  { ssr: false, loading: () => null }
);

const OpenDoorTerminal = dynamic(
  () => import("@/components/sonar/1111"),
  { ssr: false, loading: () => null }
);

export default function StrategySignalsPage() {
  const router = useRouter();
  if (!router.isReady) return null;

  const strategy = String(router.query.strategy ?? "").toLowerCase();

  return (
    <main className="w-full">
      <React.Suspense fallback={null}>
        {strategy === "arbitrage" ? (
          <ArbitrageSonar />
        ) : strategy === "opendoor" ? (
          <OpenDoorTerminal />
        ) : null}
      </React.Suspense>
    </main>
  );
}
