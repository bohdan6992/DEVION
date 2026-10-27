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
};

type RulesResponse = {
  rules?: { entryStopMinutes?: number; sessionStartMinutes?: number | null };
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
