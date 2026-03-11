import dynamic from "next/dynamic";

const UniversalSignalsTerminal = dynamic(
  () => import("@/components/sonar/UniversalSignalsTerminal"),
  { ssr: false }
);

export default function TerminalPage() {
  return <UniversalSignalsTerminal />;
}
