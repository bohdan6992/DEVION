import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("launchevening")!;

// The stream SHELL is shared; the scanner inside it is Evening Launch's own (the morning twin's arrangement,
// pages/mor-launch/stream.tsx). Worth knowing while this page is open: LaunchEveningLiveEngine is STATEFUL - its
// signal is a one-minute move, so it only knows anything once it has been polled through a previous minute
// (LaunchEveningMoveMemory). Having this page (or the Sonar) open before 15:50 is what lets the first minute fire.
// There is no LaunchEveningServerStrategy, so nothing opened here can send an order.
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const LaunchEveningScanner = dynamic(() => import("@/components/scanner/LaunchEveningScanner"), { ssr: false });

export default function LaunchEveningStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="LAUNCH•EVENING•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={LaunchEveningScanner}
    />
  );
}
