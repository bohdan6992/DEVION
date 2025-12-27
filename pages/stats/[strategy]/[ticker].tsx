import { useRouter } from "next/router";

import ArbitrageTickerStats from "@/components/cards/ArbitrageTickerStats";
import ChronoFlow from "@/components/cards/ChronoFlow";
import OpenDoor from "@/components/cards/OpenDoor";

export default function TickerStatsPage() {
  const router = useRouter();

  const rawStrategy = String(router.query.strategy ?? "").toLowerCase();
  const strategy = rawStrategy === "chrono" ? "chronoflow" : rawStrategy; // ✅ alias
  const ticker = String(router.query.ticker ?? "").trim().toUpperCase();

  if (!router.isReady) return null;

  if (strategy === "arbitrage") {
    return <ArbitrageTickerStats ticker={ticker} />;
  }

  if (strategy === "chronoflow") {
    return <ChronoFlow ticker={ticker} />;
  }

  // ✅ NEW: opendoor personal card
  if (strategy === "opendoor") {
    return <OpenDoor ticker={ticker} />;
  }

  return (
    <main className="page">
      <div className="p-6 rounded-xl border bg-[var(--card-bg)]">
        Поки підтримуються тільки стратегії{" "}
        <b>arbitrage</b>, <b>chronoflow</b> та <b>opendoor</b>.
      </div>
    </main>
  );
}
