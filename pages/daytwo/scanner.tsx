import dynamic from "next/dynamic";

const DayTwoScanner = dynamic(
  () => import("@/components/scanner/DayTwoScanner"),
  { ssr: false }
);

export default function DayTwoScannerPage() {
  return <DayTwoScanner />;
}
