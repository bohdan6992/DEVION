import dynamic from "next/dynamic";

// Client-only: the page reads the bridge's published scout meta from the browser, so there is
// nothing useful to render on the server.
const StretchFadeSpectr = dynamic(() => import("@/components/spectr/StretchFadeSpectr"), { ssr: false });

export default function StretchFadeSpectrPage() {
  return <StretchFadeSpectr />;
}
