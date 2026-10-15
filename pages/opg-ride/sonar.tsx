import dynamic from "next/dynamic";

const OPGRideSonar = dynamic(
  () => import("@/components/sonar/OPGRideSonar"),
  { ssr: false }
);

export default function OPGRideSonarPage() {
  return <OPGRideSonar />;
}
