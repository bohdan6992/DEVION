import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openfade")!;

// The stream SHELL is shared; the scanner inside it is OpenFade's, because that is what carries the
// rule and the ratings. See pages/daytwo/stream.tsx for the same arrangement.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OpenFadeScanner = dynamic(() => import("@/components/scanner/OpenFadeScaner"), { ssr: false });

export default function OpenFadeStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPENFADE STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OpenFadeScanner}
    />
  );
}
