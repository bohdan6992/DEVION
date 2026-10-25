import dynamic from "next/dynamic";

const LaunchEveningScanner = dynamic(
  () => import("@/components/scanner/LaunchEveningScanner"),
  { ssr: false }
);

export default function LaunchEveningScannerPage() {
  return <LaunchEveningScanner />;
}
