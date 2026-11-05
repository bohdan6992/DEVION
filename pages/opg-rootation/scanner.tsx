import dynamic from "next/dynamic";

const OPGRootationScanner = dynamic(
  () => import("@/components/scanner/OPGRootationScanner"),
  { ssr: false }
);

export default function OPGRootationScannerPage() {
  return <OPGRootationScanner />;
}
