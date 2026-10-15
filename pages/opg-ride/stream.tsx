import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opgride")!;

// The stream SHELL is shared; the scanner inside it is OPG•Ride's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// OPGRideEnterLong/OPGRideEnterShort — see OPGRideScanner.tsx's own note next to that
// prop). Same arrangement as pages/reversal/stream.tsx/pages/continuum/stream.tsx — this page did
// not exist before the OPGRideServerStrategy pass (lib/strategies/registry.ts declared
// nav.stream="/opg-ride/stream" with nothing behind it).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OPGRideScanner = dynamic(() => import("@/components/scanner/OPGRideScanner"), { ssr: false });

export default function OPGRideStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPG•RIDE STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OPGRideScanner}
    />
  );
}
