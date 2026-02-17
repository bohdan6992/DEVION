import dynamic from "next/dynamic";

const PaperArbitrageTapePage = dynamic(
  () => import("@/components/paper/ArbitrageTapePage"),
  { ssr: false }
);

export default function Page() {
  return <PaperArbitrageTapePage />;
}