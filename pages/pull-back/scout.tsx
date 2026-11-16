import dynamic from "next/dynamic";

const PullBackScout = dynamic(() => import("@/components/pullBackScout/PullBackScout"), { ssr: false });

export default function PullBackScoutPage() {
  return <PullBackScout />;
}
