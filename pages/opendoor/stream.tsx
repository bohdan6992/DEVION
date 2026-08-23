import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opendoor")!;

const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

export default function OpenDoorStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      // Distinct priority from the Arbitrage stream so a ticker both strategies want has a
      // deterministic winner. Equal priorities would fall back to whichever HTTP claim landed
      // first, i.e. network jitter.
      strategyPriority={STRATEGY.priority}
      headerTitle="OPEN DOOR STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
    />
  );
}
