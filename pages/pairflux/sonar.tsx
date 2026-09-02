import dynamic from "next/dynamic";

const PairFluxSonar = dynamic(() => import("@/components/sonar/PairFluxSonar"), { ssr: false });

export default function PairFluxSonarPage() {
  return <PairFluxSonar />;
}
