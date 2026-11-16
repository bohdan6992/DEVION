import dynamic from "next/dynamic";

const StretchFadeSonar = dynamic(
  () => import("@/components/sonar/STRETCHFadeSonar"),
  { ssr: false }
);

export default function StretchFadeSonarPage() {
  return <StretchFadeSonar />;
}
