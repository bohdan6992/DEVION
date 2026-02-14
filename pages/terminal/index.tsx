import dynamic from "next/dynamic";

const UniversalSignalsTerminal = dynamic(
  () => import("@/components/terminals/UniversalSignalsTerminal"),
  { ssr: false }
);

export default function TerminalPage() {
  return <UniversalSignalsTerminal />;
}