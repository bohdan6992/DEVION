import dynamic from "next/dynamic";

const OpenDoorScanner = dynamic(
  () => import("@/components/scanner/OpenDoorScanner"),
  { ssr: false }
);

export default function OpenDoorScannerPage() {
  return <OpenDoorScanner />;
}
