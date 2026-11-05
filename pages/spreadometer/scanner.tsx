import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

// Explicit nav props (2026-11-02): SpreadometerScanner.tsx's own internal STRATEGY is still keyed
// "limiter" (defineScannerStrategy({ key: "limiter" }) — it genuinely describes the shared paper/
// backtest engine both pages' Scanner tab uses), so its DEFAULT nav hrefs now point at /limiter/* —
// correct for pages/limiter/scanner.tsx, wrong here. Passing these three explicitly keeps this page's
// own SONAR/STREAM nav buttons on /spreadometer/*, same fix already applied to
// SpreadometerSonar.tsx's own SONAR_NAV and pages/spreadometer/stream.tsx's own explicit props.
const STRATEGY = getLiveStrategy("spreadometer")!;

const SpreadometerScanner = dynamic(
  () => import("@/components/scanner/SpreadometerScanner"),
  { ssr: false }
);

export default function SpreadometerScannerPage() {
  return (
    <SpreadometerScanner
      navStreamHref={STRATEGY.nav.stream}
      navScannerHref={STRATEGY.nav.scanner}
      navSonarHref={STRATEGY.nav.sonar}
    />
  );
}
