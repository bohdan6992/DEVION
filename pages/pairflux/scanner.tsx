import dynamic from "next/dynamic";

const PairFluxScanner = dynamic(() => import("@/components/scanner/PairFluxScanner"), { ssr: false });

export default function PairFluxScannerPage() {
  return <PairFluxScanner />;
}
