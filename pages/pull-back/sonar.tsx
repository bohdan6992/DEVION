import dynamic from "next/dynamic";

const PullBackSonar = dynamic(
  () => import("@/components/sonar/PullBackSonar"),
  { ssr: false }
);

export default function PullBackSonarPage() {
  return <PullBackSonar />;
}
