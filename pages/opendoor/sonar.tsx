import dynamic from "next/dynamic";

const OpenDoorSonar = dynamic(
  () => import("@/components/sonar/OpenDoorSonar"),
  { ssr: false }
);

export default function OpenDoorSonarPage() {
  return <OpenDoorSonar />;
}
