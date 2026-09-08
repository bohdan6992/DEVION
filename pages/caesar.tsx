// pages/caesar.tsx
import dynamic from "next/dynamic";
import Head from "next/head";
import React from "react";

// The schedule reads its plan from localStorage and paints a NY "now" marker, so there is nothing
// meaningful to render on the server.
const CaesarSchedule = dynamic(() => import("@/components/caesar/CaesarSchedule"), { ssr: false });

/**
 * The engines Caesar has to host itself, plus the window binding, the positions terminal and the
 * live feed. Arbitrage and PairFlux have no bridge-side engine, so this tab is where their
 * decisions are made.
 *
 * LOADED LOUDLY. `dynamic` with ssr:false renders NOTHING while the chunk is in flight and, if the
 * import rejects, renders nothing for ever — no overlay, no console entry, just a page that ends
 * early. That is indistinguishable from "the feature was never added", which is exactly how this
 * section looked when it was in fact failing to load. So the pending and failed states are both
 * given something to show.
 */
const CaesarRunners = dynamic(
  () =>
    import("@/components/caesar/CaesarRunners").catch((err) => {
      console.error("[caesar] runners chunk failed to load", err);
      return {
        default: function CaesarRunnersLoadError() {
          return (
            <section className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3 py-3 backdrop-blur-xl">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-rose-200">
                Live engines failed to load
              </div>
              <div className="mt-1 font-mono text-[11px] text-rose-200/70">
                The chunk did not load, so no strategy is being hosted by this tab. See the browser
                console for the reason. Nothing below this point is running.
              </div>
            </section>
          );
        },
      };
    }),
  {
    ssr: false,
    loading: () => (
      <section className="mt-3 rounded-xl border border-white/[0.07] bg-[#0a0a0a]/75 px-3 py-3 backdrop-blur-xl">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          Live engines · loading…
        </div>
      </section>
    ),
  },
);

export default function CaesarPage() {
  return (
    <>
      <Head>
        <title>Caesar · Trading day plan</title>
      </Head>
      <main className="w-full">
        <CaesarSchedule />
        {/* Same container as the schedule above, so the two read as one page rather than two. */}
        <div className="mx-auto w-full max-w-[1720px] px-6 pb-10 lg:px-10">
          <CaesarRunners />
        </div>
      </main>
    </>
  );
}
