"use client";

import { useState } from "react";

/**
 * The strip above a stream page that is NOT sending — and, crucially, why.
 *
 * It used to say one thing for two opposite situations: "another client is hosting this strategy".
 * That is true only when the bridge answered and named a different owner. When the registration
 * call got no answer at all, nobody may be hosting — measured 2026-09-10 with the bridge's registry
 * EMPTY while this banner was on screen — and the SEND FROM HERE button merely repeated the call
 * that had just failed, so it looked broken.
 *
 * Every fetch (register, heartbeat, ticker claim/commit) goes straight from this browser tab to
 * the bridge — see fetchWithTimeout in lib/bridgeBase.ts, reverted 2026-09-11 off a same-machine
 * proxy that broke this on Vercel. So "unreachable" now means the BRIDGE itself did not answer:
 * it is down, the base URL (?bridge= / NEXT_PUBLIC_BRIDGE_API) is wrong, or its CORS policy
 * rejected this page's origin — not a dev server, which no longer sits on this path at all.
 */
export default function DispatchOwnerBanner({
  state,
  ownerClientId,
  onTakeOwnership,
}: {
  state: "owner" | "other" | "unreachable" | "pending";
  ownerClientId: string | null;
  onTakeOwnership: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (state === "owner") return null;

  const unreachable = state === "unreachable" || state === "pending";

  const press = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const ok = await onTakeOwnership();
      setFailed(!ok);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        unreachable
          ? "mb-3 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-4 py-2.5"
          : "mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5"
      }
    >
      <div className={unreachable ? "font-mono text-[11px] text-rose-200" : "font-mono text-[11px] text-amber-200"}>
        {unreachable ? (
          <>
            <span className="font-bold uppercase tracking-[0.18em]">
              {state === "pending" ? "Registering" : "Bridge not reached"}
            </span>
            <span className="ml-2 text-rose-200/70">
              {state === "pending"
                ? "registering this strategy with the bridge. This page will not send until the bridge answers."
                : "this page could not register with the bridge, so it will not send. Nobody is necessarily hosting — the bridge itself did not answer: it may be down, the base URL (?bridge= or NEXT_PUBLIC_BRIDGE_API) may be wrong, or it rejected this page's origin. Retry once that is fixed."}
            </span>
          </>
        ) : (
          <>
            <span className="font-bold uppercase tracking-[0.18em]">Settings only</span>
            <span className="ml-2 text-amber-200/70">
              another client is hosting this strategy — Caesar, normally
              {ownerClientId ? <span className="text-amber-200/50"> ({ownerClientId.slice(0, 8)})</span> : null}. Everything
              below is live and every setting you change is saved and picked up there. This page will not send.
            </span>
          </>
        )}
        {failed && (
          <span className="ml-2 font-bold text-rose-300">
            {unreachable ? "— still no answer from the bridge." : "— takeover did not stick."}
          </span>
        )}
      </div>
      {state !== "pending" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => { void press(); }}
          className={
            unreachable
              ? "shrink-0 rounded-md border border-rose-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-400/10 disabled:opacity-50"
              : "shrink-0 rounded-md border border-amber-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-200 transition-colors hover:bg-amber-400/10 disabled:opacity-50"
          }
        >
          {busy ? "…" : unreachable ? "Retry" : "Send from here"}
        </button>
      )}
    </div>
  );
}
