import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openride")!;

// The stream SHELL is shared; the scanner inside it is OpenRide's, because that is what carries the
// rule and the ratings. See pages/daytwo/stream.tsx for the same arrangement.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OpenRideScanner = dynamic(() => import("@/components/scanner/OpenRideScaner"), { ssr: false });

export default function OpenRideStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPENRIDE STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OpenRideScanner}
    />
  );
}
