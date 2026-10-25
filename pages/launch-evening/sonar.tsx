import dynamic from "next/dynamic";

const LaunchEveningSonar = dynamic(
  () => import("@/components/sonar/LaunchEveningSonar"),
  { ssr: false }
);

export default function LaunchEveningSonarPage() {
  return <LaunchEveningSonar />;
}
