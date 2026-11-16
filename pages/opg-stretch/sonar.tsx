import dynamic from "next/dynamic";

const OPGStretchSonar = dynamic(
  () => import("@/components/sonar/STRETCHFadeSonar"),
  { ssr: false }
);

export default function OPGStretchSonarPage() {
  return <OPGStretchSonar />;
}
