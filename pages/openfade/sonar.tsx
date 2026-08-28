import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openfade")!;

const OpenFadeSonar = dynamic(() => import("@/components/sonar/OpenFadeSonar"), { ssr: false });

export default function OpenFadeSonarPage() {
  return <OpenFadeSonar />;
}
