import dynamic from "next/dynamic";

const OPGRootationSonar = dynamic(
  () => import("@/components/sonar/OPGRootationSonar"),
  { ssr: false }
);

export default function OPGRootationSonarPage() {
  return <OPGRootationSonar />;
}
