import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opgcontinuum")!;

// The stream SHELL is shared; the scanner inside it is OPG•Continuum's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// OPGContinuumEnterLong/OPGContinuumEnterShort — see OPGContinuumScanner.tsx's own note next to that
// prop). Same arrangement as pages/opg-reversal/stream.tsx.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OPGContinuumScanner = dynamic(() => import("@/components/scanner/OPGContinuumScanner"), { ssr: false });

export default function OPGContinuumStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPG•CONTINUUM STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OPGContinuumScanner}
    />
  );
}
