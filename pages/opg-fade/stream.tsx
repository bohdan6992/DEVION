import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("opgfade")!;

// The stream SHELL is shared; the scanner inside it is OPG•Fade's own, because that is what
// carries the rule, the ratings and the live-dispatch wiring (entryIntentTypes:
// OPGFadeEnterLong/OPGFadeEnterShort — see OPGFadeScanner.tsx's own note next to that
// prop). Same arrangement as pages/reversal/stream.tsx/pages/continuum/stream.tsx — this page did
// not exist before the OPGFadeServerStrategy pass (lib/strategies/registry.ts declared
// nav.stream="/opg-fade/stream" with nothing behind it).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const OPGFadeScanner = dynamic(() => import("@/components/scanner/OPGFadeScanner"), { ssr: false });

export default function OPGFadeStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="OPG•FADE•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={OPGFadeScanner}
    />
  );
}
