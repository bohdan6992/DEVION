import dynamic from "next/dynamic";

const OpenDoorStreamPageContainer = dynamic(
  () => import("@/components/stream/OpenDoorStreamPageContainer"),
  { ssr: false }
);

export default function OpenDoorStreamPage() {
  return (
    <OpenDoorStreamPageContainer
      lsKeyPrefix="stream.opendoor"
      headerTitle="OPEN DOOR STREAM"
      navStreamHref="/opendoor/stream"
      navScannerHref="/opendoor/scanner"
      navSonarHref="/opendoor/sonar"
    />
  );
}
