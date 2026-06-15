import dynamic from "next/dynamic";

const ArbitrageStream = dynamic(
  () => import("@/components/stream/ArbitrageStream"),
  { ssr: false }
);

export default function Page() {
  return <ArbitrageStream />;
}
