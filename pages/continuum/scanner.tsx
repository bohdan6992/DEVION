import dynamic from "next/dynamic";

const ContinuumScanner = dynamic(
  () => import("@/components/scanner/ContinuumScanner"),
  { ssr: false }
);

export default function ContinuumScannerPage() {
  return <ContinuumScanner />;
}
