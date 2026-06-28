import dynamic from "next/dynamic";

const StreamPageContainer = dynamic(
  () => import("@/components/stream/StreamPageContainer"),
  { ssr: false }
);

export default function OpenDoorStreamPage() {
  return (
    <StreamPageContainer
      lsKeyPrefix="stream.opendoor"
      headerTitle="OPEN DOOR STREAM"
      navStreamHref="/opendoor/stream"
      navScannerHref="/opendoor/scanner"
      navSonarHref="/opendoor/sonar"
    />
  );
}
