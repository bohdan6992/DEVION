import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("reversal")!;

// The stream SHELL is shared; the scanner inside it is Reversal's, because that is what carries the
// rule, the ratings and the live-dispatch wiring (entryIntentTypes: ReversalEnterLong/ReversalEnterShort
// — see ReversalScanner.tsx's own note next to that prop). See pages/daytwo/stream.tsx and
// pages/openfade/stream.tsx for the same arrangement; this page did not exist before the
// ReversalServerStrategy pass (lib/strategies/registry.ts declared nav.stream="/reversal/stream"
// with nothing behind it).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const ReversalScanner = dynamic(() => import("@/components/scanner/ReversalScanner"), { ssr: false });

export default function ReversalStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="REVERSAL STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={ReversalScanner}
    />
  );
}
