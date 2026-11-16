import dynamic from "next/dynamic";

// Client-only: the page reads localStorage for its toolbar state and talks to the bridge from the
// browser, so there is nothing useful to render on the server.
const OPGRideScout = dynamic(() => import("@/components/opgRideScout/OPGRideScout"), { ssr: false });

export default function OPGRideScoutPage() {
  return <OPGRideScout />;
}
