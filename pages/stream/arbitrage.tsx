import dynamic from "next/dynamic";

const ArbitrageStream = dynamic(
  () => import("@/components/stream/ArbitrageStream"),
  { ssr: false }
);

export default function Page() {
  // strategyPriority is the tie-breaker the bridge uses when this strategy and another one want
  // the same ticker at the same minute boundary — HIGHER WINS. Keep it distinct from every other
  // stream page (OpenDoor is 50).
  return <ArbitrageStream strategyPriority={100} />;
}
