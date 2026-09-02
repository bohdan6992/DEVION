import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("pairflux")!;

// The stream SHELL is shared; the scanner inside it is PairFlux's, because that is what carries the
// pair rule and the ratings. Same arrangement as pages/openride/stream.tsx.
const PairFluxStream = dynamic(() => import("@/components/stream/PairFluxStream"), { ssr: false });

export default function PairFluxStreamPage() {
  return (
    <PairFluxStream
      instanceId={STRATEGY.bridgeStrategyId}
      strategyPriority={STRATEGY.priority}
      strategyLabel="PAIRFLUX"
      lsKeyPrefix={STRATEGY.storage.streamPrefix}
      headerTitle="PAIRFLUX STREAM"
    />
  );
}
