import dynamic from "next/dynamic";

const OPGReversalSonar = dynamic(
  () => import("@/components/sonar/OPGReversalSonar"),
  { ssr: false }
);

export default function OPGReversalSonarPage() {
  return <OPGReversalSonar />;
}
