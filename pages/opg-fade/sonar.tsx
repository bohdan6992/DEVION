import dynamic from "next/dynamic";

const OPGFadeSonar = dynamic(
  () => import("@/components/sonar/OPGFadeSonar"),
  { ssr: false }
);

export default function OPGFadeSonarPage() {
  return <OPGFadeSonar />;
}
