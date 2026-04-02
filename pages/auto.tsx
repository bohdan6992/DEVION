import dynamic from "next/dynamic";

const ArbitrageAuto = dynamic(
  () => import("@/components/auto/ArbitrageAuto"),
  { ssr: false }
);

export default function AutoPage() {
  return <ArbitrageAuto />;
}
