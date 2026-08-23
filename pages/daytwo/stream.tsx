import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("daytwo")!;

// Day Two has no stream container of its own yet: its Scanner is still a copy of OpenDoor's, and so
// is the stream panel inside it. This page therefore drives the SAME container as OpenDoor, but with
// Day Two's registry values — its own storage prefix, its own priority and its own nav — so the two
// streams never share state or arbitrate tickers as one. Swap the import when Day Two gets a
// container of its own; nothing else here changes.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

export default function DayTwoStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="DAYTWO STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
    />
  );
}
