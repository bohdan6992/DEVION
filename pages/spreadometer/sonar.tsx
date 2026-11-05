import dynamic from "next/dynamic";

const SpreadometerSonar = dynamic(
  () => import("@/components/sonar/SpreadometerSonar"),
  { ssr: false }
);

export default function SpreadometerSonarPage() {
  return <SpreadometerSonar />;
}
