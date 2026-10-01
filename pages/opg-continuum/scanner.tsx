import dynamic from "next/dynamic";

const OPGContinuumScanner = dynamic(
  () => import("@/components/scanner/OPGContinuumScanner"),
  { ssr: false }
);

export default function OPGContinuumScannerPage() {
  return <OPGContinuumScanner />;
}
