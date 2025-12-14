import { useRouter } from "next/router";
import ArbitrageTickerStats from "@/components/cards/ArbitrageTickerStats";
import ChronoFlow from "@/components/cards/ChronoFlow";

export default function TickerStatsPage() {
  const router = useRouter();

  const rawStrategy = String(router.query.strategy ?? "").toLowerCase();
  const strategy = rawStrategy === "chrono" ? "chronoflow" : rawStrategy; // ✅ alias
  const ticker = String(router.query.ticker ?? "").trim();

  if (!router.isReady) return null;

  if (strategy === "arbitrage") {
    return <ArbitrageTickerStats ticker={ticker} />;
  }

  if (strategy === "chronoflow") {
    return <ChronoFlow ticker={ticker} />;
  }

  return (
    <main className="page">
      <div className="p-6 rounded-xl border bg-[var(--card-bg)]">
        Поки підтримуються тільки стратегії <b>arbitrage</b> та <b>chronoflow</b>.
      </div>
    </main>
  );
}
