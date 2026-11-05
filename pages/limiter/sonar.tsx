import dynamic from "next/dynamic";

// LIMITER's own SONAR page (2026-11-02, the operator's own instruction) — LimiterSonar.tsx is no
// longer just SpreadometerSonar.tsx's twin, it is this entry's own titled surface ("LIMITER•SONAR"),
// with a violet %/σ/γ/α unit group matching ARBITRAGE's own zapMode pill set (minus Δ, which has no
// analog on this screen — see LimiterSonar.tsx's own comment on lstPrcLstClsUnit). STREAM/SCANNER
// still share pages/spreadometer/* — only SONAR got its own route back.
const LimiterSonar = dynamic(
  () => import("@/components/sonar/LimiterSonar"),
  { ssr: false }
);

export default function LimiterSonarPage() {
  return <LimiterSonar />;
}
