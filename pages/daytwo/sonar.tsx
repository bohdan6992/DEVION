import dynamic from "next/dynamic";

const DayTwoSonar = dynamic(
  () => import("@/components/sonar/DayTwoSonar"),
  { ssr: false }
);

export default function DayTwoSonarPage() {
  return <DayTwoSonar />;
}
