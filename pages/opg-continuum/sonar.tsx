import dynamic from "next/dynamic";

const OPGContinuumSonar = dynamic(
  () => import("@/components/sonar/OPGContinuumSonar"),
  { ssr: false }
);

export default function OPGContinuumSonarPage() {
  return <OPGContinuumSonar />;
}
