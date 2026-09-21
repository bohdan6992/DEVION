import dynamic from "next/dynamic";

// Client-only: the page reads localStorage for its toolbar state and talks to the bridge from the
// browser, so there is nothing useful to render on the server.
const ArbitrageScout = dynamic(() => import("@/components/scout/ArbitrageScout"), { ssr: false });

export default function ArbitrageScoutPage() {
  return <ArbitrageScout />;
}
