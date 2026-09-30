import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("continuum")!;

// Mirrors pages/reversal/stream.tsx exactly — see that file's own comment for why the stream SHELL
// is shared and the scanner inside it carries the rule/ratings/live-dispatch wiring
// (entryIntentTypes: ContinuumEnterLong/ContinuumEnterShort, bound to Ctrl+F5/Ctrl+F6 2026-09-30 —
// same chord as Day Two/Reversal, see TradingAppOrderIntentType.ContinuumEnterLong/Short's own doc
// comment).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const ContinuumScanner = dynamic(() => import("@/components/scanner/ContinuumScanner"), { ssr: false });

export default function ContinuumStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="CONTINUUM STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={ContinuumScanner}
    />
  );
}
