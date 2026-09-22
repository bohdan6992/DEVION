import dynamic from "next/dynamic";

const ReversalSonar = dynamic(
  () => import("@/components/sonar/ReversalSonar"),
  { ssr: false }
);

export default function ReversalSonarPage() {
  return <ReversalSonar />;
}
