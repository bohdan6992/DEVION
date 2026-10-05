import dynamic from "next/dynamic";

const VWAPBounceSonar = dynamic(
  () => import("@/components/sonar/VWAPBounceSonar"),
  { ssr: false }
);

export default function VWAPBounceSonarPage() {
  return <VWAPBounceSonar />;
}
