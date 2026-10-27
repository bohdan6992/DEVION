"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchWithTimeout } from "@/lib/bridgeBase";
import { apiUrl } from "./api";

/**
 * What the engine will ACTUALLY enforce for this strategy's entry-stop/session-start — not what
 * the toolbar's own START/ENTRY STOP/CUTOFF steppers are saved as. The two can disagree the moment
 * Caesar owns the strategy: ArbitrageLiveParamsService.ToStreamRules (and PairFlux's own copy)
 * overrides both with the active Caesar segment's own window whenever the plan is enabled and
 * assigns this strategy to one — "CAESAR OWNS THE CLOCK THE MOMENT IT OWNS THE STRATEGY" — so a
 * toolbar reading 09:00 can genuinely still be trading at 09:30 if that is where its segment (PRE,
 * 21:00-09:30) actually ends. Added 2026-10-26, the operator's own report: "арбітраж продовжує
 * працювати після 9" — the steppers were telling the truth about what was SAVED, never about what
 * the bridge was ACTING on, and GetRules (/api/stream/{strategy}/rules) already existed for exactly
 * this check but nothing on screen ever read it.
 */
export type EffectiveStreamRules = {
  entryStopMinutes: number | null;
  sessionStartMinutes: number | null;
  /** True exactly when the two numbers above come from an ACTIVE Caesar segment assignment, not
   *  this strategy's own standalone saved times reflected back unchanged — see
   *  StreamRules.CaesarOwnsClock's own doc comment. Lets the divergence marker (and the "push into
   *  Caesar" edit it offers) tell "Caesar is overriding this right now" apart from "the saved value
   *  just differs from what is typed," which read identically as bare numbers. */
  caesarOwnsClock: boolean;
};

type RulesResponse = {
  rules?: { entryStopMinutes?: number; sessionStartMinutes?: number | null; caesarOwnsClock?: boolean };
};

const POLL_MS = 30_000;

/** `rulesPath` is the strategy's own GetRules route, e.g. "/api/stream/arbitrage/rules". */
export function useEffectiveStreamRules(rulesPath: string | null): EffectiveStreamRules | null {
  const [rules, setRules] = useState<EffectiveStreamRules | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!rulesPath) return;
    try {
      const res = await fetchWithTimeout(apiUrl(rulesPath), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as RulesResponse | null;
      if (!aliveRef.current || !res.ok) return;
      const r = json?.rules;
      setRules(r ? {
        entryStopMinutes: typeof r.entryStopMinutes === "number" ? r.entryStopMinutes : null,
        sessionStartMinutes: typeof r.sessionStartMinutes === "number" ? r.sessionStartMinutes : null,
        caesarOwnsClock: r.caesarOwnsClock === true,
      } : null);
    } catch {
      // Display only; the next poll tries again.
    }
  }, [rulesPath]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return rules;
}

/**
 * Pushes a START ("start") or ENTRY STOP/CUTOFF ("stop") edit into whichever Caesar segment
 * assignment currently governs `strategyId` — the operator's own instruction, 2026-10-27: "я хочу
 * щоб це поле переходило і в цезар". Narrows only THAT strategy's own assignment (never the
 * segment's shared boundary — see CaesarPlanAssignment.FromMinuteIdx's own doc comment on the
 * bridge), so call this ALONGSIDE the toolbar's own standalone save, never instead of it: the
 * standalone value is still what the strategy obeys the moment no segment is active.
 *
 * Returns false (nothing applied) on any failure, AND whenever the strategy has no currently-active
 * assignment to narrow — both are silent, expected states a caller does not need to surface as an
 * error (the standalone save above already went through either way).
 */
export async function pushCaesarAssignmentWindow(
  edge: "start" | "stop",
  strategyId: string,
  minutes: number,
): Promise<boolean> {
  try {
    const path = edge === "start"
      ? "/api/stream/caesar/plan/assignment-start"
      : "/api/stream/caesar/plan/assignment-stop";
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId, minutes }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; applied?: boolean } | null;
    return res.ok && json?.applied === true;
  } catch {
    return false;
  }
}
