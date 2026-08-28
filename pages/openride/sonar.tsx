import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openride")!;

const OpenRideSonar = dynamic(() => import("@/components/sonar/OpenRideSonar"), { ssr: false });

export default function OpenRideSonarPage() {
  return <OpenRideSonar />;
}
