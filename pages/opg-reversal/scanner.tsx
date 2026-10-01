import dynamic from "next/dynamic";

const OPGReversalScanner = dynamic(
  () => import("@/components/scanner/OPGReversalScanner"),
  { ssr: false }
);

export default function OPGReversalScannerPage() {
  return <OPGReversalScanner />;
}
