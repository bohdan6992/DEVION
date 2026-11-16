import dynamic from "next/dynamic";

const PullBackSpectr = dynamic(() => import("@/components/spectr/PullBackSpectr"), { ssr: false });

export default function PullBackSpectrPage() {
  return <PullBackSpectr />;
}
