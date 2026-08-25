import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("daytwo")!;

// The stream SHELL is shared with OpenDoor, but the scanner inside it is Day Two's: that is what
// carries the rule — POST1..BLUE3 exit classes, the 15:50-15:55 entry window, and Day Two's own
// ratings file. Before this the page drove OpenDoorScanner, so the Day Two stream traded OpenDoor's
// rule under a Day Two title.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const DayTwoScanner = dynamic(() => import("@/components/scanner/DayTwoScanner"), { ssr: false });

export default function DayTwoStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="DAYTWO STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={DayTwoScanner}
    />
  );
}
