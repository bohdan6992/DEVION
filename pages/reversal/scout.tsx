import dynamic from "next/dynamic";

// Client-only: the page reads localStorage for its toolbar state and talks to the bridge from the
// browser, so there is nothing useful to render on the server.
const ReversalScout = dynamic(() => import("@/components/reversalScout/ReversalScout"), { ssr: false });

export default function ReversalScoutPage() {
  return <ReversalScout />;
}
