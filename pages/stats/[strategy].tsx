import { useRouter } from "next/router";
import ArbitrageMatrix from "@/components/strategies/ArbitrageMatrix";
import ChronoMatrix from "@/components/strategies/ChronoMatrix";

function UnknownStrategyScreen({ strategy }: { strategy: string }) {
  return (
    <div className="min-h-screen bg-black text-zinc-400 flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-sm uppercase tracking-[0.2em] text-zinc-600">
          Strategy
        </div>
        <div className="text-2xl font-bold text-white">
          Unknown: <span className="text-emerald-400">{strategy || "—"}</span>
        </div>
        <p className="text-xs text-zinc-500">
          Обери доступну стратегію на дашборді.
        </p>
      </div>
    </div>
  );
}

export default function StrategySummaryPage() {
  const router = useRouter();
  const strategy = String(router.query.strategy ?? "").toLowerCase();

  if (!router.isReady) return null;

  switch (strategy) {
    case "arbitrage":
      return <ArbitrageMatrix />;

    case "chrono":
      return <ChronoMatrix />;

    default:
      return <UnknownStrategyScreen strategy={strategy} />;
  }
}
