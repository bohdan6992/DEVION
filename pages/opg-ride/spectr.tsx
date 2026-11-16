import dynamic from "next/dynamic";

// Client-only: the page reads the bridge's published scout meta from the browser, so there is
// nothing useful to render on the server.
const OPGRideSpectr = dynamic(() => import("@/components/spectr/OPGRideSpectr"), { ssr: false });

export default function OPGRideSpectrPage() {
  return <OPGRideSpectr />;
}
