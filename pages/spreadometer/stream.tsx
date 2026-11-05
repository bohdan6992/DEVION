import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

// The REAL automation (SpreadometerServerStrategy.cs) — not the "limiter" entry, which is a
// separate, still-Sonar-only surface sharing these same pages (see registry.ts's own comment on
// both entries). Switched from "limiter" to "spreadometer" 2026-11-01 alongside the route/title
// rename below, so the priority badge and localStorage prefix this page uses finally match the
// strategy it is actually titled after.
const STRATEGY = getLiveStrategy("spreadometer")!;

// Same arrangement as pages/launch-evening/stream.tsx: the stream SHELL is shared
// (OpenDoorStreamPageContainer), the scanner inside it is SpreadometerScanner (renamed from
// LimiterScanner.tsx 2026-11-02, the operator's own instruction — the component still drives
// Limiter's own paper/backtest engine underneath, which both the "limiter" and "spreadometer"
// catalog entries share; see SpreadometerScanner.tsx's own header comment).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const SpreadometerScanner = dynamic(() => import("@/components/scanner/SpreadometerScanner"), { ssr: false });

export default function SpreadometerStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="SPREADOMETER•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={SpreadometerScanner}
    />
  );
}
