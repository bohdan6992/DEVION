// pages/caesar.tsx
import dynamic from "next/dynamic";
import Head from "next/head";
import React from "react";

// The schedule reads its plan from localStorage and paints a NY "now" marker, so there is nothing
// meaningful to render on the server.
const CaesarSchedule = dynamic(() => import("@/components/caesar/CaesarSchedule"), { ssr: false });

export default function CaesarPage() {
  return (
    <>
      <Head>
        <title>Caesar · Trading day plan</title>
      </Head>
      <main className="w-full">
        <CaesarSchedule />
      </main>
    </>
  );
}
