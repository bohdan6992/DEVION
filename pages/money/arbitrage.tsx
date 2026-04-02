import dynamic from "next/dynamic";

const ArbitrageMoney = dynamic(
  () => import("@/components/money/ArbitrageMoney"),
  { ssr: false }
);

export default function Page() {
  return <ArbitrageMoney />;
}
