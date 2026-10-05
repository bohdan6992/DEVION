import dynamic from "next/dynamic";

const VWAPBounceScanner = dynamic(
  () => import("@/components/scanner/VWAPBounceScanner"),
  { ssr: false }
);

export default function VWAPBounceScannerPage() {
  return <VWAPBounceScanner />;
}
