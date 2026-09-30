import dynamic from "next/dynamic";

const ContinuumSonar = dynamic(
  () => import("@/components/sonar/ContinuumSonar"),
  { ssr: false }
);

export default function ContinuumSonarPage() {
  return <ContinuumSonar />;
}
