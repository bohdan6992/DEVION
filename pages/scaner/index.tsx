import dynamic from "next/dynamic";

const ScanerTerminal = dynamic(() => import("@/components/scaner/ScanerTerminal"), { ssr: false });

export default function ScanerPage() {
  return <ScanerTerminal />;
}