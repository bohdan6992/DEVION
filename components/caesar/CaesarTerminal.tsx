"use client";

/**
 * What Caesar is doing, as it does it.
 *
 * The schedule above says what SHOULD run. This says what IS running: how many signals each hosted
 * engine is looking at, how many it has latched, what it has sent, and what came back. Everything
 * here is read from the engines' own stores — the same ones the stream pages render — so nothing is
 * re-derived and nothing can disagree with the strategy's own view of itself.
 *
 * FEED. One merged, time-ordered stream tagged by strategy. Two engines producing two separate
 * logs is exactly the thing that makes a two-strategy day hard to follow: the question is almost
 * never "what did PairFlux do" but "what happened at 09:21:14", and that only has an answer if both
 * are on one clock.
 *
 * A dispatch is the only thing worth a line. Polls, ticks and unchanged snapshots are not events;
 * printing them would bury the four lines a day that matter under thousands that do not.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStreamStores } from "@/components/stream/streamStoreRegistry";
import type { StreamLogEntry } from "@/components/stream/streamLogStore";
import CaesarPanel, { CAESAR_PILL, CAESAR_PILL_IDLE, CAESAR_PILL_ON } from "./CaesarPanel";

export type CaesarTerminalProps = {
  instances: readonly { key: string; instanceId: string; priority: number }[];
  /** The segment the plan is currently on, purely for the header. */
  segment: string | null;
};

type Line = { strategyKey: string; entry: StreamLogEntry };

type Counters = {
  signals: number;
  decisions: number;
  positions: number;
  open: number;
  /**
   * SENT, NOT YET CONFIRMED.
   *
   * The gap this closes: an entry is dispatched, `sent` goes up, and the position sits in
   * PENDING_ENTRY with `entryDispatchedAt` set until the TradingApp queue reports the item as
   * Sent/Completed (`hasExecutionDispatchConfirmation`) — normally within one 2.5s status poll.
   * `open` does not count it, by design, because the broker has not confirmed it. Without this
   * number the operator reads "sent 1 · open 0" as an order that went nowhere, when it is an
   * order in flight.
   */
  pending: number;
  intents: number;
  blocked: number;
  sent: number;
  failed: number;
  /**
   * Why the decisions are not orders.
   *
   * "queued 0" is the question this answers. A decision that is ENTRY_READY is waiting only on the
   * minute boundary; one that is BLOCKED_SPREAD or BLOCKED_EDGE will never dispatch at the current
   * settings, and knowing which of the two it is names the setting to change.
   */
  ready: number;
  blockedSpread: number;
  blockedEdge: number;
  otherStatus: number;
  /** The most common blocking reason, verbatim from the engine. */
  topReason: string | null;
};

const EMPTY: Counters = {
  signals: 0, decisions: 0, positions: 0, open: 0, pending: 0, intents: 0, blocked: 0, sent: 0, failed: 0,
  ready: 0, blockedSpread: 0, blockedEdge: 0, otherStatus: 0, topReason: null,
};

/** Tone per event, so the eye finds a FAILED line without reading it. */
const EVENT_TONE: Record<string, string> = {
  ENTRY: "text-emerald-300",
  ADD: "text-sky-300",
  EXIT: "text-amber-300",
  EXIT_PRINT: "text-amber-200",
  CLOSE_ALL: "text-rose-300",
};

const STATUS_TONE: Record<string, string> = {
  SENT: "text-emerald-400",
  FAILED: "text-rose-400",
  SIMULATED: "text-zinc-500",
};

function num(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function CaesarTerminal({ instances, segment }: CaesarTerminalProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [counters, setCounters] = useState<Record<string, Counters>>({});
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const instanceKey = instances.map((i) => `${i.key}:${i.instanceId}`).join(",");

  // Subscribed imperatively: the hosted set changes with the segment, and a hook cannot be called
  // in a loop over a list whose length moves.
  const recompute = useCallback(() => {
    const nextLines: Line[] = [];
    const nextCounters: Record<string, Counters> = {};

    for (const inst of instances) {
      const stores = getStreamStores(inst.instanceId);
      for (const entry of stores.log.getEntries()) {
        nextLines.push({ strategyKey: inst.key, entry });
      }

      const positions = stores.position.getRows();
      const intents = stores.orderIntent.getRows();
      const log = stores.log.getEntries();

      // Read every decision's own verdict. The store is keyed by id, so this walks the ids it
      // already gave us rather than keeping a second copy of the rows.
      const ids = stores.decision.getIds();
      let ready = 0, blockedSpread = 0, blockedEdge = 0, otherStatus = 0;
      const reasons = new Map<string, number>();
      for (const id of ids) {
        const row = stores.decision.getRow(id);
        if (!row) continue;
        if (row.status === "ENTRY_READY") ready += 1;
        else if (row.status === "BLOCKED_SPREAD") blockedSpread += 1;
        else if (row.status === "BLOCKED_EDGE") blockedEdge += 1;
        else otherStatus += 1;
        if (row.status !== "ENTRY_READY" && row.reason) {
          reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
        }
      }
      let topReason: string | null = null;
      let topCount = 0;
      for (const [reason, n] of reasons) {
        if (n > topCount) { topCount = n; topReason = reason; }
      }

      nextCounters[inst.key] = {
        ready, blockedSpread, blockedEdge, otherStatus, topReason,
        signals: stores.signal.getMeta().totalCount,
        decisions: ids.length,
        positions: positions.length,
        // The STORE's count, not a fourth definition of "open". `status === "OPEN"` — what this
        // used to filter on — silently dropped PRINT_PENDING and EXIT_BLOCKED, so Caesar reported
        // fewer open positions than the strategy's own header did for the same engine. The store's
        // `countsAsOpen` is the predicate the stream page renders, so now they cannot disagree.
        open: stores.position.getMeta().openCount,
        pending: positions.filter((p) => p.status === "PENDING_ENTRY" && p.entryDispatchedAt != null).length,
        intents: intents.filter((i) => i.status === "QUEUED").length,
        blocked: intents.filter((i) => i.status === "BLOCKED").length,
        sent: log.filter((l) => l.status === "SENT").length,
        failed: log.filter((l) => l.status === "FAILED").length,
      };
    }

    // One clock across both engines. seq breaks ties inside the same millisecond.
    nextLines.sort((a, b) => a.entry.ts - b.entry.ts || a.entry.seq - b.entry.seq);
    setLines(nextLines);
    setCounters(nextCounters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey]);

  useEffect(() => {
    recompute();
    const unsubs: Array<() => void> = [];
    for (const inst of instances) {
      const s = getStreamStores(inst.instanceId);
      unsubs.push(s.log.subscribe(recompute));
      unsubs.push(s.position.subscribe(recompute));
      unsubs.push(s.orderIntent.subscribe(recompute));
      unsubs.push(s.signal.subscribe(recompute));
      unsubs.push(s.decision.subscribeToIds(recompute));
    }
    // The decision store changes without its id list changing (a row updates in place), and the
    // signal count moves on every snapshot — a slow poll keeps the counters honest without
    // subscribing to every row.
    const id = window.setInterval(recompute, 3000);
    return () => { for (const u of unsubs) u(); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey, recompute]);

  const shown = useMemo(
    () => (filter ? lines.filter((l) => l.strategyKey === filter) : lines),
    [lines, filter],
  );

  // Stick to the bottom while following, the way a terminal does.
  useEffect(() => {
    if (!follow || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shown.length, follow]);

  const totals = useMemo(() => {
    const t = { ...EMPTY };
    for (const c of Object.values(counters)) {
      t.signals += c.signals; t.decisions += c.decisions; t.positions += c.positions;
      t.open += c.open; t.pending += c.pending; t.intents += c.intents; t.blocked += c.blocked;
      t.sent += c.sent; t.failed += c.failed;
    }
    return t;
  }, [counters]);

  return (
    <CaesarPanel
      title="Caesar terminal"
      subtitle={segment ? `${segment} segment` : "outside every segment"}
      accent="#c98500"
      meta={
        /* The shape of the pipeline, so the eight numbers below read as stages, not a grid. */
        <span className="font-mono text-[10px] tracking-wide text-zinc-700">
          sig <span className="text-zinc-800">→</span> dec{" "}
          <span className="text-zinc-800">→</span> queued <span className="text-zinc-800">→</span> sent{" "}
          <span className="text-zinc-800">→</span> pend <span className="text-zinc-800">→</span> open
          <span className="ml-2 text-zinc-800">(hover any label)</span>
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
          {instances.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => setFilter(filter === i.key ? null : i.key)}
              className={CAESAR_PILL + (filter === i.key ? CAESAR_PILL_ON : CAESAR_PILL_IDLE)}
            >
              {i.key}
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
      {/* ---- live counters, per strategy ---- */}
      <div className="flex flex-wrap gap-2 px-3 py-3">
        {instances.length === 0 ? (
          <span className="font-mono text-[11px] text-zinc-600">
            No engine hosted on this segment — nothing to report.
          </span>
        ) : (
          instances.map((i) => {
            const c = counters[i.key] ?? EMPTY;
            return (
              <div
                key={i.key}
                className="min-w-[230px] flex-1 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">
                    {i.key}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-600">#{i.priority}</span>
                </div>
                {/*
                  THREE ROWS OF THREE, and the order is the pipeline itself:

                    sig -> dec -> queued      a signal becomes a candidate, a candidate an intent
                    sent -> pend -> open      the intent goes out, waits for the broker, lands
                    failed / blocked / pos    everything that stopped, and the running total

                  The middle row is the one that gets misread without `pend`: "sent 3 / open 0" is
                  three orders in flight for the next couple of seconds, not three that vanished.
                */}
                <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 font-mono text-[10px]">
                  <Stat
                    label="sig"
                    value={c.signals}
                    tone="text-sky-300"
                    hint="SIGNALS — live rows this engine is watching, after the server's own filters. The raw input; most of these will never be traded."
                  />
                  <Stat
                    label="dec"
                    value={c.decisions}
                    tone="text-violet-300"
                    hint="DECISIONS — signals that passed this strategy's gate and the toolbar filters, so they are candidates. Not orders yet: they still have to hold past the minute boundary."
                  />
                  <Stat
                    label="queued"
                    value={c.intents}
                    tone="text-amber-300"
                    hint="QUEUED — order intents built and waiting to be sent to the bridge. A number that sits here is a dispatch loop that is not draining."
                  />
                  <Stat
                    label="sent"
                    value={c.sent}
                    tone="text-emerald-400"
                    hint="SENT — orders the bridge accepted today. This is the one that means money moved."
                  />
                  <Stat
                    label="pend"
                    value={c.pending}
                    tone={c.pending ? "text-amber-200" : "text-zinc-600"}
                    hint="IN FLIGHT — sent, and waiting for the TradingApp queue to report the order as Sent/Completed. It becomes OPEN on the next status poll (2.5s). This is the answer to 'sent went up but open did not' — the order is on its way, not stuck."
                  />
                  <Stat
                    label="open"
                    value={c.open}
                    tone="text-emerald-300"
                    hint="OPEN — positions the engine holds and the broker has confirmed. Counted with the strategy's own predicate, so this always matches the number its stream page shows."
                  />
                  <Stat
                    label="failed"
                    value={c.failed}
                    tone={c.failed ? "text-rose-400" : "text-zinc-600"}
                    hint="FAILED — dispatches the bridge rejected or that errored. Anything above zero wants looking at."
                  />
                  <Stat
                    label="blocked"
                    value={c.blocked}
                    tone={c.blocked ? "text-rose-300" : "text-zinc-600"}
                    hint="BLOCKED — intents held back on purpose: spread too wide, net edge below the floor, or the ticker lost arbitration to a higher-priority strategy."
                  />
                  <Stat
                    label="pos"
                    value={c.positions}
                    tone="text-zinc-400"
                    hint="POSITIONS — every position the engine is tracking, including ones already closed today. Always >= open."
                  />
                </div>

                {/*
                  WHY THERE IS NO ORDER. The line above says how many candidates exist; this says
                  what is standing between them and a dispatch, which is the only part that tells
                  you what to change.
                */}
                {c.decisions > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-white/[0.05] pt-1.5 font-mono text-[10px]">
                    <Stat
                      label="ready"
                      value={c.ready}
                      tone="text-emerald-300"
                      hint="ENTRY_READY — passes every check. Waiting only for the minute boundary and its hold window, then it becomes a queued order."
                    />
                    <Stat
                      label="spread"
                      value={c.blockedSpread}
                      tone={c.blockedSpread ? "text-rose-300" : "text-zinc-700"}
                      hint="BLOCKED_SPREAD — the quoted spread is wider than the MAX SPREAD setting. Raise it, or accept that these never trade."
                    />
                    <Stat
                      label="edge"
                      value={c.blockedEdge}
                      tone={c.blockedEdge ? "text-rose-300" : "text-zinc-700"}
                      hint="BLOCKED_EDGE — net edge is below MIN NET EDGE. The signal is real but too small to pay for the spread."
                    />
                    {c.otherStatus > 0 && (
                      <Stat
                        label="other"
                        value={c.otherStatus}
                        tone="text-amber-300"
                        hint="HOLD / EXIT_BLOCKED — already in a position, or an exit that cannot be taken yet."
                      />
                    )}
                    {c.topReason && (
                      <span className="truncate text-zinc-600" title={c.topReason}>
                        · {c.topReason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ---- the feed ---- */}
      <div
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (!atBottom && follow) setFollow(false);
        }}
        className="h-[280px] overflow-auto border-t border-white/[0.05] bg-black/40 px-3 py-2"
      >
        {shown.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] text-zinc-700">
            No dispatches yet. Polls and ticks are not events — a line appears when an order is sent.
          </div>
        ) : (
          shown.map((l) => {
            const e = l.entry;
            return (
              <div
                key={`${l.strategyKey}-${e.seq}`}
                className="flex items-baseline gap-2 whitespace-nowrap py-[1px] font-mono text-[11px] leading-[1.35]"
              >
                <span className="text-zinc-600">{e.timeStr}</span>
                <span className="w-[64px] shrink-0 truncate text-zinc-500">{l.strategyKey}</span>
                <span className={"w-[80px] shrink-0 " + (EVENT_TONE[e.event] ?? "text-zinc-300")}>
                  {e.event}
                </span>
                <span className={"w-[74px] shrink-0 " + (STATUS_TONE[e.status] ?? "text-zinc-400")}>
                  {e.status}
                </span>
                <span className="w-[62px] shrink-0 font-bold text-zinc-200">{e.ticker}</span>
                <span
                  className={
                    "w-[46px] shrink-0 " + (e.side === "Short" ? "text-rose-300/80" : "text-emerald-300/80")
                  }
                >
                  {e.side}
                </span>
                <span className="w-[58px] shrink-0 text-zinc-600">{e.benchmark}</span>
                {e.isHedge && <span className="text-sky-400/70">hedge</span>}
                {e.latchBounces > 0 && (
                  <span className="text-amber-400/60" title="signal dropped and recovered before dispatch">
                    ×{e.latchBounces}
                  </span>
                )}
                {e.exitSigmaAbs != null && (
                  <span className="text-amber-300/60">σ{num(e.exitSigmaAbs)}</span>
                )}
                <span className="truncate text-zinc-600">{e.intentId ?? ""}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.05] bg-black/20 px-3 py-2 font-mono text-[10px] text-white/30">
        <span>
          {shown.length} line{shown.length === 1 ? "" : "s"}
          {filter ? ` · ${filter} only` : ""} · both engines on one clock
        </span>
        <span>
          sent {totals.sent} · failed {totals.failed} · queued {totals.intents} · blocked {totals.blocked}
        </span>
      </div>
    </CaesarPanel>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: string;
  hint: string;
}) {
  return (
    <div className="flex cursor-help items-baseline gap-1" title={hint}>
      <span className="text-zinc-600 decoration-zinc-700 decoration-dotted underline-offset-2 hover:underline">
        {label}
      </span>
      <span className={"tabular-nums " + (value ? tone : "text-zinc-700")}>{value}</span>
    </div>
  );
}
