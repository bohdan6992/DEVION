import dynamic from "next/dynamic";

const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

export default function OpenDoorStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix="stream.opendoor"
      // Distinct priority from the Arbitrage stream so a ticker both strategies want has a
      // deterministic winner. Equal priorities would fall back to whichever HTTP claim landed
      // first, i.e. network jitter.
      strategyPriority={50}
      headerTitle="OPEN DOOR STREAM"
      navStreamHref="/opendoor/stream"
      navScannerHref="/opendoor/scanner"
      navSonarHref="/opendoor/sonar"
    />
  );
}
