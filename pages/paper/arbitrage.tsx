import dynamic from "next/dynamic";

const ArbitrageScanner = dynamic(
  () => import("@/components/scanner/ArbitrageScanner"),
  { ssr: false }
);

export default function Page() {
  return <ArbitrageScanner initialPrimaryPanel="scanner" />;
}
