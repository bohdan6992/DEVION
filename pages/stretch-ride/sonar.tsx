import dynamic from "next/dynamic";

const StretchRideSonar = dynamic(
  () => import("@/components/sonar/STRETCHRideSonar"),
  { ssr: false }
);

export default function StretchRideSonarPage() {
  return <StretchRideSonar />;
}
