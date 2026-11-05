import { bridgeUrl } from "../bridgeBase";

/**
 * LIMITER's own basket macro's one live knob (2026-11-02, the operator's own instruction): PERIOD —
 * how often this cycle repeats, in minutes, step 5 — same shape and meaning as
 * lib/spreadometer/liveParamsClient.ts's own periodMinutes, just for a DIFFERENT, independent
 * strategy (LimiterServerStrategy, not SpreadometerServerStrategy — the operator's own instruction:
 * "LIMITER SPREADOMETER це дві різних стратегії не об'єднуй їх"). No maxBpUsed here on purpose: that
 * cap is shared with SPREADOMETER's, one setting, edited only from lib/spreadometer/liveParamsClient.ts.
 *
 * Deliberately a NEW FILE, not lib/limiter/liveParamsClient.ts (that one is a dead, unrelated client
 * for an older MIN DEV/ExitClass toolbar shape, pointed at /api/stream/limiter/params — reusing that
 * exact route for this would make its own dead push suddenly hit a real endpoint with the wrong JSON
 * body). This one targets /api/stream/limiter/basket/params instead.
 */
export type LimiterBasketLiveParams = {
  periodMinutes: number;
  updatedAtUtc?: string | null;
};

const DEFAULT_PARAMS: LimiterBasketLiveParams = { periodMinutes: 30 };

export async function getLimiterBasketLiveParams(): Promise<LimiterBasketLiveParams> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/limiter/basket/params"), { cache: "no-store" });
    if (!response.ok) return DEFAULT_PARAMS;
    const json = await response.json().catch(() => null);
    const p = json?.params;
    if (!p || typeof p !== "object") return DEFAULT_PARAMS;
    return {
      periodMinutes: Number(p.periodMinutes) || DEFAULT_PARAMS.periodMinutes,
      updatedAtUtc: p.updatedAtUtc ?? null,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function pushLimiterBasketLiveParams(params: Pick<LimiterBasketLiveParams, "periodMinutes">): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/limiter/basket/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    return false;
  }
}
