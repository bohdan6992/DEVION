import dynamic from "next/dynamic";
import { getLiveStrategy } from "@/lib/strategies/registry";

const STRATEGY = getLiveStrategy("openride")!;

const OpenRideScanner = dynamic(() => import("@/components/scanner/OpenRideScaner"), { ssr: false });

export default function OpenRideScannerPage() {
  return <OpenRideScanner />;
}
