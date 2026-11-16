import dynamic from "next/dynamic";

// Client-only: the page reads the bridge's published scout meta from the browser, so there is
// nothing useful to render on the server.
const ReversalSpectr = dynamic(() => import("@/components/spectr/ReversalSpectr"), { ssr: false });

export default function ReversalSpectrPage() {
  return <ReversalSpectr />;
}
