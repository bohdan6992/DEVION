import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("arbitrage")!;

const ArbitrageStream = dynamic(
  () => import("@/components/stream/ArbitrageStream"),
  { ssr: false }
);

export default function Page() {
  // strategyPriority is the tie-breaker the bridge uses when this strategy and another one want
  // the same ticker at the same minute boundary — HIGHER WINS. It comes from the registry, which
  // rejects duplicate priorities at module load, so distinctness is enforced rather than asked for
  // in a comment.
  return <ArbitrageStream strategyPriority={STRATEGY.priority} />;
}
