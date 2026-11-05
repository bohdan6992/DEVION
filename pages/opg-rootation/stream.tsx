import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opgrootation")!;

// The stream SHELL is shared; the scanner inside it is OPG•Rootation's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// OPGRootationEnterLong/OPGRootationEnterShort — see OPGRootationScanner.tsx's own note next to that
// prop). Same arrangement as pages/opg-reversal/stream.tsx.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OPGRootationScanner = dynamic(() => import("@/components/scanner/OPGRootationScanner"), { ssr: false });

export default function OPGRootationStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPG•ROOTATION•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OPGRootationScanner}
    />
  );
}
