import dynamic from "next/dynamic";

const LimiterScanner = dynamic(
  () => import("@/components/scanner/LimiterScanner"),
  { ssr: false }
);

export default function LimiterScannerPage() {
  return <LimiterScanner />;
}
