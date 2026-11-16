import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("stretchride")!;

// The stream SHELL is shared; the scanner inside it is STRETCH•RIDE's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring. Same arrangement as
// pages/stretch-fade/stream.tsx.
//
// NOTE there is deliberately NO components/stream/StretchRideStream.tsx behind this page. Every
// per-strategy *Stream.tsx in this repo except ArbitrageStream/PairFluxStream is an unimported copy
// of OpenDoorStream's view — 15 of the 19 are dead files. The stream view a strategy actually gets
// is OpenDoorStreamView, mounted by OpenDoorStreamPageContainer below.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const StretchRideScanner = dynamic(() => import("@/components/scanner/STRETCHRideScanner"), { ssr: false });

export default function StretchRideStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="STRETCH•RIDE•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={StretchRideScanner}
    />
  );
}
