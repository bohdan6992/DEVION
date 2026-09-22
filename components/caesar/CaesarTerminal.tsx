"use client";

/**
 * Caesar's own log: every action the bridge's engine actually decided on, in order, with why.
 *
 * Replaces the old terminal, which read four BROWSER-LOCAL stores (log/position/orderIntent/
 * decision) that have been empty since every strategy moved server-side — "No engine hosted on
 * this segment" was never a real state, it was this reading stores nothing writes to any more.
 *
 * The bridge already keeps exactly this list for itself — ServerStrategyRunner.Record, exposed as
 * `recentIntents` on GET api/stream/caesar/engine — every intent that reached arbitration and
 * where it ended up: dispatched for real, recorded in shadow, stood down because a browser tab
 * still owned the strategy, or lost its ticker to arbitration/pair-completeness. Both `reason`
 * (why the strategy wanted to do this) and `outcome` (what actually happened to it, and why) ride
 * on every line, so this reads WHAT Caesar did and WHY without re-deriving a second copy of
 * anything from a store that no longer exists.
 *
 * WHAT IS NOT HERE. A candidate blocked by spread or net edge never becomes an intent at all — it
 * is a signal-screen verdict (see CaesarBridgeDecisions' own Signals table), not an action. This
 * is a log of what Caesar DID or decided not to, not why a name never qualified in the first
 * place. And it is a recent window, not the whole day's archive: the bridge caps it
 * (RecentIntentLimit, 200) the same way a terminal scrollback caps itself — the entry-count chart
 * elsewhere (GET api/stream/caesar/entries) is the durable, whole-day source for "how many."
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { bridgeUrl, fetchWithTimeout } from "@/lib/bridgeBase";
import { subscribeSharedPoll } from "@/lib/caesar/sharedPoll";
import CaesarPanel, { CAESAR_PILL, CAESAR_PILL_IDLE, CAESAR_PILL_ON } from "./CaesarPanel";

export type CaesarTerminalProps = {
  /** The segment the plan is currently on, purely for the header. */
  segment: string | null;
};

/** One of ServerStrategyRunner's own ServerStrategyIntentRecord, as the engine status returns it. */
type IntentRecord = {
  atUtc: string;
  minuteIdx: number;
  strategyId: string;
  ticker: string;
  action: string;
  side: string | null;
  reason: string | null;
  priority: number;
  dispatched: boolean;
  outcome: string;
  /**
   * The identical (strategyId, ticker, action, outcome, reason) repeating tick after tick collapses
   * into this one record instead of one line per tick — a persistent block (a priority conflict
   * that outlives the other side's whole position, say) otherwise floods the 200-line window with
   * one identical line per minute for hours (operator-reported, 2026-09-17: AAOI blocked once a
   * minute for 2+ hours). 1 means this hasn't repeated; atUtc is when the run STARTED, lastAtUtc is
   * its most recent tick.
   */
  repeatCount: number;
  lastAtUtc: string;
};

type EngineStatusResponse = { ok: boolean; engine: { recentIntents: IntentRecord[] } };

const POLL_MS = 3_000;

function timeStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour12: false });
}

/** Drop the "stream." prefix every bridge strategy id carries — the label reads the same without it. */
function shortId(strategyId: string): string {
  return strategyId.replace(/^stream\./, "");
}

/** Tone per action, so the eye finds an EXIT without reading it. */
const ACTION_TONE: Record<string, string> = {
  entry: "text-emerald-300",
  add: "text-sky-300",
  exit: "text-amber-300",
  // HEDGED mode's own QQQ orders — logged under the "hedge" strategy category (see the bridge's
  // ServerStrategyRunner.Record), not the strategy that triggered them, so this line's own tone
  // needs to read as neither an entry nor an exit: a third thing.
  hedge: "text-fuchsia-300",
};

function outcomeBadge(i: IntentRecord): { text: string; tone: string } {
  if (i.dispatched) return { text: "dispatched", tone: "text-emerald-400" };
  if (i.outcome === "shadow") return { text: "shadow", tone: "text-zinc-500" };
  return { text: "blocked", tone: "text-rose-300" };
}

export default function CaesarTerminal({ segment }: CaesarTerminalProps) {
  const [intents, setIntents] = useState<IntentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchEngine = () =>
      fetchWithTimeout(bridgeUrl("/api/stream/caesar/engine"), { cache: "no-store" })
        .then((res) => res.json() as Promise<EngineStatusResponse>)
        .then((body) => body.engine?.recentIntents ?? []);
    const unsubscribe = subscribeSharedPoll("bridge-engine-status", fetchEngine, POLL_MS, (value, err) => {
      if (!alive) return;
      if (err) { setError(err); return; }
      setError(null);
      if (value) setIntents(value);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Whichever strategies actually appear in the feed — not a fixed list, so a strategy the plan
  // has never touched today does not clutter the filter row with a pill that never does anything.
  const strategyIds = useMemo(
    () => Array.from(new Set(intents.map((i) => i.strategyId))).sort(),
    [intents],
  );

  const shown = useMemo(
    () => (filter ? intents.filter((i) => i.strategyId === filter) : intents),
    [intents, filter],
  );

  // Stick to the bottom while following, the way a terminal does.
  useEffect(() => {
    if (!follow || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shown.length, follow]);

  const totals = useMemo(() => {
    let dispatched = 0, shadow = 0, blocked = 0;
    for (const i of intents) {
      if (i.dispatched) dispatched += 1;
      else if (i.outcome === "shadow") shadow += 1;
      else blocked += 1;
    }
    return { dispatched, shadow, blocked };
  }, [intents]);

  return (
    <CaesarPanel
      title="Caesar log"
      subtitle={segment ? `${segment} segment` : "outside every segment"}
      accent="#c98500"
      meta={
        <span className="font-mono text-[10px] tracking-wide text-zinc-700">
          every entry / add / exit the engine decided on, and why
        </span>
      }
      right={
        <>
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={CAESAR_PILL + (filter === null ? CAESAR_PILL_ON : CAESAR_PILL_IDLE)}
          >
            All
          </button>
          {strategyIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(filter === id ? null : id)}
              className={CAESAR_PILL + (filter === id ? CAESAR_PILL_ON : CAESAR_PILL_IDLE)}
            >
              {shortId(id)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFollow((v) => !v)}
            className={
              CAESAR_PILL +
              (follow
                ? " border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
                : " text-zinc-600 hover:bg-white/5 hover:text-zinc-400")
            }
            title="Keep the newest line in view"
          >
            {follow ? "● follow" : "○ follow"}
          </button>
        </>
      }
    >
      {error && (
        <div className="mx-3 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 font-mono text-[11px] text-rose-200">
          bridge unreachable — {error}
        </div>
      )}

      {/* ---- the feed ---- */}
      <div
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (!atBottom && follow) setFollow(false);
        }}
        className="h-[320px] overflow-auto border-t border-white/[0.05] bg-black/40 px-3 py-2"
      >
        {shown.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[11px] text-zinc-700">
            {error
              ? "—"
              : "Nothing decided yet — a line appears the moment the engine arbitrates an entry, add or exit for any strategy."}
          </div>
        ) : (
          shown.map((i, idx) => {
            const badge = outcomeBadge(i);
            // The outcome string itself only carries real information beyond the badge when it is
            // NOT dispatched/shadow — a ticker collision, a withdrawn pair, a browser tab still
            // owning the strategy. Shown ahead of the strategy's own reason, since "why not" is
            // the more urgent question on a line like that.
            const detail = i.dispatched || i.outcome === "shadow"
              ? i.reason ?? ""
              : [i.outcome, i.reason].filter(Boolean).join(" — ");
            const repeated = i.repeatCount > 1;
            return (
              <div
                key={`${i.atUtc}-${i.strategyId}-${i.ticker}-${idx}`}
                className="flex items-baseline gap-2 whitespace-nowrap py-[1px] font-mono text-[11px] leading-[1.35]"
              >
                <span
                  className="text-zinc-600"
                  title={repeated ? `since ${timeStr(i.atUtc)}, still true as of ${timeStr(i.lastAtUtc)}` : undefined}
                >
                  {timeStr(repeated ? i.lastAtUtc : i.atUtc)}
                </span>
                <span className="w-[74px] shrink-0 truncate text-zinc-500">{shortId(i.strategyId)}</span>
                <span className={"w-[46px] shrink-0 " + (ACTION_TONE[i.action] ?? "text-zinc-300")}>
                  {i.action}
                </span>
                <span className="w-[62px] shrink-0 font-bold text-zinc-200">{i.ticker}</span>
                <span
                  className={
                    "w-[46px] shrink-0 " + (i.side === "Short" ? "text-rose-300/80" : "text-emerald-300/80")
                  }
                >
                  {i.side ?? ""}
                </span>
                <span className={"w-[80px] shrink-0 " + badge.tone}>{badge.text}</span>
                {repeated && (
                  <span
                    className="w-[76px] shrink-0 text-amber-300/70"
                    title={`Unchanged since ${timeStr(i.atUtc)} — collapsed from ${i.repeatCount} identical ticks.`}
                  >
                    ×{i.repeatCount} since {timeStr(i.atUtc)}
                  </span>
                )}
                <span className="truncate text-zinc-600" title={detail}>{detail}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.05] bg-black/20 px-3 py-2 font-mono text-[10px] text-white/30">
        <span>
          {shown.length} line{shown.length === 1 ? "" : "s"}
          {filter ? ` · ${shortId(filter)} only` : ""} · every strategy on one clock
        </span>
        <span>
          dispatched {totals.dispatched} · shadow {totals.shadow} · blocked {totals.blocked}
        </span>
      </div>
    </CaesarPanel>
  );
}
