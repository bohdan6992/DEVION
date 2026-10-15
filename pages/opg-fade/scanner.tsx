import dynamic from "next/dynamic";

const OPGFadeScanner = dynamic(
  () => import("@/components/scanner/OPGFadeScanner"),
  { ssr: false }
);

export default function OPGFadeScannerPage() {
  return <OPGFadeScanner />;
}
