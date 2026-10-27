import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("limiter")!;

// Same arrangement as pages/launch-evening/stream.tsx: the stream SHELL is shared
// (OpenDoorStreamPageContainer), the scanner inside it is Limiter's own. No entry/exit logic is
// defined for Limiter yet (operator's own answer, 2026-10-27: "ще не відомо"), so there is no
// LimiterServerStrategy and nothing opened here can send an order — this page exists so the nav
// icon on Caesar has somewhere real to go, same as every other catalog-only strategy's Stream tab.
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
