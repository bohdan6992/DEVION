import dynamic from "next/dynamic";

const StretchFadeScanner = dynamic(
  () => import("@/components/scanner/STRETCHFadeScanner"),
  { ssr: false }
);

export default function StretchFadeScannerPage() {
  return <StretchFadeScanner />;
}
