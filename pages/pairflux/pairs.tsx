import dynamic from "next/dynamic";

// The working PairFlux surface. /pairflux/scanner still renders the forked Arbitrage scanner, which
// 404s on every data call until its endpoints are ported — this page is what actually shows pairs.
const PairFluxPairs = dynamic(() => import("@/components/pairflux/PairFluxPairs"), { ssr: false });

export default function PairFluxPairsPage() {
  return <PairFluxPairs />;
}
