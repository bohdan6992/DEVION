"use client";

/**
 * What the Market Maker bind currently IS, under the engines it affects.
 *
 * The ACTION moved to the toolbar under the timeline (see CaesarControlBar) — binding is a
 * pre-flight step you do once, next to START, not something you go looking for three panels down.
 * What stays here is the detail that belongs beside the engines: which window is bound, what the
 * main window is, and the fact that one bind covers every mounted strategy.
 *
 * The only control left is "bind now", and it is here rather than in the bar on purpose: clicked
 * from a browser it binds THE BROWSER, because BindForegroundWindow takes whatever is in the
 * foreground when the request lands. It is useful from a keyboard shortcut or a second machine,
 * which is exactly the kind of thing that belongs in the detail panel and not on the main row.
 *
 * State comes from `useMarketMakerWindow`, the same hook the toolbar reads, so the two can never
 * disagree about whether a window is bound.
 */

import React from "react";

import { useMarketMakerWindow } from "./useMarketMakerWindow";

export default function CaesarWindowBinding() {
  const mm = useMarketMakerWindow();

  return (
    /* Recessed rather than framed: this is a strip inside the engines panel, not a panel of its
       own, and a second border here was what made the section read as boxes-in-boxes. */
    <div className="border-t border-white/[0.05] bg-black/20 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={
                "h-1.5 w-1.5 shrink-0 rounded-full " +
                (mm.isBound
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]")
              }
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Market Maker window
            </span>
          </div>
          <div
            className={
              "mt-1 truncate pl-3.5 font-mono text-[11px] " +
              (mm.isBound ? "text-emerald-300" : "text-amber-300")
            }
          >
            {mm.error
              ? `bridge unreachable — ${mm.error}`
              : mm.isBound
                ? mm.boundTitle || "bound (no title)"
                : "not bound — hotkeys will go to whatever window has focus"}
          </div>
          <div className="mt-0.5 truncate pl-3.5 font-mono text-[10px] text-zinc-600">
            main window: {mm.mainTitle || "—"}
          </div>
        </div>

        <button
          type="button"
          disabled={mm.busy != null}
          onClick={() => void mm.bindNow()}
          className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
          title="Binds the foreground window immediately — which, clicked from here, is this browser. Use the crosshair under the timeline instead; this one is for a keyboard shortcut or a second machine."
        >
          Bind now
        </button>
      </div>

      <div className="mt-2 font-mono text-[10px] leading-relaxed text-white/25">
        One bound window for the whole bridge, shared by every mounted engine — binding it binds it
        for both strategies, and clearing clears it for both. Connect and disconnect it with the
        crosshair in the toolbar under the timeline.
      </div>
    </div>
  );
}
