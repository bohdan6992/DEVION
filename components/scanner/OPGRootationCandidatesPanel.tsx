"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import { fetchOPGRootationCandidates, type OPGRootationCandidateRow } from "@/lib/opgRootation/liveParamsClient";

/**
 * OPG•Rootation's live candidate list — the operator's own ask (2026-11-04, narrowed 2026-11-05): at
 * 09:30+, see ONLY the tickers that have ALREADY cleared their own coral/mint/silver move% threshold
 * against the 09:30 anchor — not every pending candidate, just the ones that would fire right now —
 * AND ONLY while GAP% is still empty (the official opening print hasn't landed yet). A row with no
 * known Anchor930 yet (09:30 itself has not happened, nothing to compute a move% from) never reaches
 * this list at all — GetCandidatesSnapshot itself skips any ticker without a settled anchor, so
 * "before 9:30, nothing shows" falls out of that for free, no separate check needed here. Once a
 * ticker's GAP% becomes known it drops off this list (it is no longer a "watch" situation — it fires
 * through the normal trigger path, visible as "awaiting fill"/"filled" elsewhere). Shared by
 * OPGRootationScanner.tsx (which also covers the Stream page, since pages/opg-rootation/stream.tsx
 * embeds that same component) and OPGRootationSonar.tsx, so the two never drift into two different
 * tables. Polls GET /api/stream/opgrootation/candidates (OPGRootationEntryTriggerService's own
 * GetCandidatesSnapshot, which returns every anchored candidate regardless of GapKnown/threshold) —
 * the GAP%-empty + threshold-cleared filter is applied here, client-side.
 */
export default function OPGRootationCandidatesPanel() {
  const [allRows, setAllRows] = useState<OPGRootationCandidateRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    // 1s — matches OPGRootationEntryTriggerService's own SignalCheckInterval (narrowed 2s -> 1s the
    // same day, operator's own instruction: GAP%/move% read every second like every other realtime
    // column). Only one subscriber ever uses the "opgrootation-candidates" channel key, so this
    // interval is this panel's alone to set.
    const unsubscribe = subscribeSharedPoll("opgrootation-candidates", fetchOPGRootationCandidates, 1_000, (value) => {
      setAllRows(Array.isArray(value) ? value : []);
      setUpdatedAt(Date.now());
    });
    return unsubscribe;
  }, []);

  // "лише ті які пройшли поріг" (the operator's own instruction, 2026-11-05) — this panel is
  // specifically "what would fire right now if the window allowed it", not a general candidate dump.
  const rows = allRows
    .filter((r) => !r.gapKnown && r.meetsThreshold)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  if (rows.length === 0) {
    return null; // nothing still pending open right now (outside the window, or every tracked
    // candidate has already settled its GAP%)
  }

  const fmtPrice = (v: number | null) => (v == null ? "—" : v.toFixed(2));
  const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/50 p-3 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-zinc-500">
          OPG•ROOTATION LIVE CANDIDATES
        </span>
        <span className="text-[9px] font-mono text-zinc-600">
          {updatedAt ? `updated ${new Date(updatedAt).toLocaleTimeString()}` : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="text-zinc-500 text-[10px] uppercase">
              <th className="text-left px-2 py-1">Ticker</th>
              <th className="text-right px-2 py-1">09:30</th>
              <th className="text-right px-2 py-1">Now</th>
              <th className="text-right px-2 py-1">Move%</th>
              <th className="text-center px-2 py-1">Side</th>
              <th className="text-center px-2 py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // The operator's own specific ask: every row here already has GAP% empty (filtered
              // above) — highlight the ones that have ALSO already cleared their own threshold.
              return (
                <tr
                  key={r.ticker}
                  className={clsx(
                    "border-t border-white/5",
                    r.meetsThreshold && "bg-violet-500/10"
                  )}
                  title={r.meetsThreshold ? "GAP% ще не з'явився, але рух уже за порогом" : undefined}
                >
                  <td className="px-2 py-1 text-left text-zinc-200">{r.ticker}</td>
                  <td className="px-2 py-1 text-right text-zinc-400">{fmtPrice(r.anchor930)}</td>
                  <td className="px-2 py-1 text-right text-zinc-200">{fmtPrice(r.currentPrice)}</td>
                  <td
                    className={clsx(
                      "px-2 py-1 text-right",
                      r.movePct == null
                        ? "text-zinc-600"
                        : r.movePct > 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    )}
                  >
                    {fmtPct(r.movePct)}
                  </td>
                  <td className="px-2 py-1 text-center text-zinc-400">{r.side ?? "—"}</td>
                  <td className="px-2 py-1 text-center text-[10px] uppercase text-zinc-400">
                    {r.fired ? (r.awaitingFill ? "awaiting fill" : "filled") : r.meetsThreshold ? "ready" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
