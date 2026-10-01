import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opgreversal")!;

// The stream SHELL is shared; the scanner inside it is OPG•Reversal's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// OPGReversalEnterLong/OPGReversalEnterShort — see OPGReversalScanner.tsx's own note next to that
// prop). Same arrangement as pages/reversal/stream.tsx/pages/continuum/stream.tsx — this page did
// not exist before the OPGReversalServerStrategy pass (lib/strategies/registry.ts declared
// nav.stream="/opg-reversal/stream" with nothing behind it).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OPGReversalScanner = dynamic(() => import("@/components/scanner/OPGReversalScanner"), { ssr: false });

export default function OPGReversalStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPG•REVERSAL STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OPGReversalScanner}
    />
  );
}
