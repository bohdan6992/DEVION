import dynamic from "next/dynamic";

// Client-only: the page reads the bridge's published scout meta from the browser, so there is
// nothing useful to render on the server.
const ArbitrageSpectr = dynamic(() => import("@/components/spectr/ArbitrageSpectr"), { ssr: false });

export default function ArbitrageSpectrPage() {
  return <ArbitrageSpectr />;
}
