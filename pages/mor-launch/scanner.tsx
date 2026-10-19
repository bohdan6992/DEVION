import dynamic from "next/dynamic";

const MorLaunchScanner = dynamic(
  () => import("@/components/scanner/MorLaunchScanner"),
  { ssr: false }
);

export default function MorLaunchScannerPage() {
  return <MorLaunchScanner />;
}
