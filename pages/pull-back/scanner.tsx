import dynamic from "next/dynamic";

const PullBackScanner = dynamic(
  () => import("@/components/scanner/PullBackScanner"),
  { ssr: false }
);

export default function PullBackScannerPage() {
  return <PullBackScanner />;
}
