import dynamic from "next/dynamic";

const StretchRideScanner = dynamic(
  () => import("@/components/scanner/STRETCHRideScanner"),
  { ssr: false }
);

export default function StretchRideScannerPage() {
  return <StretchRideScanner />;
}
