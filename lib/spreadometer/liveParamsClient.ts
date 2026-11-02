import { bridgeUrl } from "../bridgeBase";

/**
 * SPREADOMETER's own two live knobs (2026-11-01, the operator's own instruction): PERIOD — how
 * often the half-hour basket cycle actually repeats, in minutes, step 5 (was a fixed 30) — and MAX
 * BPUSED — how much BP a ticker may already carry before the basket stops offering it again (was a
 * hardcoded 4000, SpreadometerLiveParamsService.cs's own doc comment). Mirrors the bridge's own
 * SpreadometerLiveParams shape (camelCase, same JSON serializer settings every other live-params
 * service here uses).
 */
export type SpreadometerLiveParams = {
  periodMinutes: number;
  maxBpUsed: number;
  updatedAtUtc?: string | null;
};

const DEFAULT_PARAMS: SpreadometerLiveParams = { periodMinutes: 30, maxBpUsed: 4000 };

export async function getSpreadometerLiveParams(): Promise<SpreadometerLiveParams> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/spreadometer/params"), { cache: "no-store" });
    if (!response.ok) return DEFAULT_PARAMS;
    const json = await response.json().catch(() => null);
    const p = json?.params;
    if (!p || typeof p !== "object") return DEFAULT_PARAMS;
    return {
      periodMinutes: Number(p.periodMinutes) || DEFAULT_PARAMS.periodMinutes,
      maxBpUsed: Number(p.maxBpUsed) || 0,
      updatedAtUtc: p.updatedAtUtc ?? null,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function pushSpreadometerLiveParams(params: Pick<SpreadometerLiveParams, "periodMinutes" | "maxBpUsed">): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/spreadometer/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    // Best-effort, like every other live-params push here: the bridge keeps whatever it last
    // received and the toolbar is unaffected.
    return false;
  }
}
