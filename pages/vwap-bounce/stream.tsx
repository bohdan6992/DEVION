import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("vwapbounce")!;

// The stream SHELL is shared; the scanner inside it is OPG•Continuum's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// / — see VWAPBounceScanner.tsx's own note next to that
// prop). Same arrangement as pages/opg-reversal/stream.tsx.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const VWAPBounceScanner = dynamic(() => import("@/components/scanner/VWAPBounceScanner"), { ssr: false });

export default function VWAPBounceStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="VWAP•BOUNCE STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={VWAPBounceScanner}
    />
  );
}
