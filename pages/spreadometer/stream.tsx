import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

// The REAL automation (SpreadometerServerStrategy.cs) — not the "limiter" entry, which is a
// separate, still-Sonar-only surface sharing these same pages (see registry.ts's own comment on
// both entries). Switched from "limiter" to "spreadometer" 2026-11-01 alongside the route/title
// rename below, so the priority badge and localStorage prefix this page uses finally match the
// strategy it is actually titled after.
const STRATEGY = getLiveStrategy("spreadometer")!;

// Same arrangement as pages/launch-evening/stream.tsx: the stream SHELL is shared
// (OpenDoorStreamPageContainer), the scanner inside it is Limiter's own (LimiterScanner — the
// component file keeps its original name; only the route and the displayed title renamed to
// Spreadometer, 2026-11-01).
const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

const LimiterScanner = dynamic(() => import("@/components/scanner/LimiterScanner"), { ssr: false });

export default function SpreadometerStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      strategyPriority={STRATEGY.priority}
      headerTitle="SPREADOMETER•STREAM"
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
      ScannerComponent={LimiterScanner}
    />
  );
}
