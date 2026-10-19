import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("morlaunch")!;

// The stream SHELL is shared; the scanner inside it is Morning Launch's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// MorLaunchEnterLong/MorLaunchEnterShort). Same arrangement as pages/opg-reversal/stream.tsx.
//
// Worth knowing while this page is open: MorLaunchLiveEngine is STATEFUL — its signal is a one-minute
// move, so it only knows anything once it has been polled through a previous minute
// (MorLaunchMoveMemory). This page's own polling is part of what keeps that memory warm, so having it
// open before 03:50 is what lets the first minute of the window fire.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const MorLaunchScanner = dynamic(() => import("@/components/scanner/MorLaunchScanner"), { ssr: false });

export default function MorLaunchStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="MORNING LAUNCH STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={MorLaunchScanner}
    />
  );
}
