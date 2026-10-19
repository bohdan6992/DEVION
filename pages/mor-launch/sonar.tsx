import dynamic from "next/dynamic";

const MorLaunchSonar = dynamic(
  () => import("@/components/sonar/MorLaunchSonar"),
  { ssr: false }
);

export default function MorLaunchSonarPage() {
  return <MorLaunchSonar />;
}
