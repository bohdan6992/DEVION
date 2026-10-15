import dynamic from "next/dynamic";

const OPGRideScanner = dynamic(
  () => import("@/components/scanner/OPGRideScanner"),
  { ssr: false }
);

export default function OPGRideScannerPage() {
  return <OPGRideScanner />;
}
