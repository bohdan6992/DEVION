import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openfade")!;

const OpenFadeScanner = dynamic(() => import("@/components/scanner/OpenFadeScaner"), { ssr: false });

export default function OpenFadeScannerPage() {
  return <OpenFadeScanner />;
}
