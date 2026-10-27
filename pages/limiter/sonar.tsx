import dynamic from "next/dynamic";

const LimiterSonar = dynamic(
  () => import("@/components/sonar/LimiterSonar"),
  { ssr: false }
);

export default function LimiterSonarPage() {
  return <LimiterSonar />;
}
