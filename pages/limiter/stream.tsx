import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

// LIMITER's OWN automation (LimiterServerStrategy.cs) — a separate strategy from SPREADOMETER's,
// confirmed with the operator rather than merged (2026-11-02): "LIMITER SPREADOMETER це дві різних
// стратегії не об'єднуй їх". Own route, own PERIOD, own priority/storage prefix — see this entry's
// own comment in lib/strategies/registry.ts.
const STRATEGY = getLiveStrategy("limiter")!;

const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const LimiterScanner = dynamic(() => import("@/components/scanner/LimiterScanner"), { ssr: false });

export default function LimiterStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="LIMITER•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={LimiterScanner}
    />
  );
}
