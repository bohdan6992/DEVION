import dynamic from "next/dynamic";

const ReversalScanner = dynamic(
  () => import("@/components/scanner/ReversalScanner"),
  { ssr: false }
);

export default function ReversalScannerPage() {
  return <ReversalScanner />;
}
