import { bridgeUrl } from "../bridgeBase";

/**
 * The whole-PRE-segment QQQ direction hedge — moved off ArbitrageScanner.tsx onto Caesar's own
 * control bar, 2026-11-05 (the operator's own instruction). The bridge sums long/short BP across
 * every ACTIVE PRE strategy's combined book (ARBITRAGE, MORLAUNCH, MORLAUNCHBASKET, SPREADOMETER,
 * REVERSAL, CONTINUUM — deduped by physical ticker, never by TrackedPosition) and, on a skew, sends
 * real QQQ orders. Classic threshold-lowering mode is gone entirely — this control is always HEDGED.
 * See SegmentDirectionBalanceService.cs/SegmentDirectionBalanceSettingsService.cs on the bridge.
 */
export type SegmentDirectionBalanceParams = {
  enabled: boolean;
  ratio: number;
  minGapBp: number;
  checkIntervalMinutes: number;
  updatedAtUtc?: string | null;
};

const DEFAULT_PARAMS: SegmentDirectionBalanceParams = {
  enabled: false,
  ratio: 2.0,
  minGapBp: 0,
  checkIntervalMinutes: 10,
};

/** Mirrors DirectionBalanceSnapshot (DirectionBalancer.cs) plus which strategies were actually
 * counted on the last check — SegmentDirectionBalanceSnapshot on the bridge. */
export type SegmentDirectionBalanceStatus = {
  enabled: boolean;
  phase: "watching" | "balancing" | string;
  hedgedEpisode: boolean;
  hedgeSide: "short" | "long" | null;
  hedgeOrdersOut: number;
  lastLongsBp: number;
  lastShortsBp: number;
  lastCheckUtc: string | null;
  nextCheckUtc: string | null;
  lastAction: string;
  lastReason: string;
  activeStrategyIds: string[];
  trackedTickerCount: number;
};

const DEFAULT_STATUS: SegmentDirectionBalanceStatus = {
  enabled: false,
  phase: "watching",
  hedgedEpisode: false,
  hedgeSide: null,
  hedgeOrdersOut: 0,
  lastLongsBp: 0,
  lastShortsBp: 0,
  lastCheckUtc: null,
  nextCheckUtc: null,
  lastAction: "",
  lastReason: "",
  activeStrategyIds: [],
  trackedTickerCount: 0,
};

export async function fetchSegmentDirectionBalanceParams(): Promise<SegmentDirectionBalanceParams> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/segment-balance/params"), { cache: "no-store" });
    if (!response.ok) return DEFAULT_PARAMS;
    const json = await response.json().catch(() => null);
    const p = json?.params;
    if (!p || typeof p !== "object") return DEFAULT_PARAMS;
    return {
      enabled: Boolean(p.enabled),
      ratio: Number(p.ratio) || DEFAULT_PARAMS.ratio,
      minGapBp: Number(p.minGapBp) || 0,
      checkIntervalMinutes: Number(p.checkIntervalMinutes) || DEFAULT_PARAMS.checkIntervalMinutes,
      updatedAtUtc: p.updatedAtUtc ?? null,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function pushSegmentDirectionBalanceParams(
  params: Pick<SegmentDirectionBalanceParams, "enabled" | "ratio" | "minGapBp" | "checkIntervalMinutes">,
): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/segment-balance/params"), {
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

export async function fetchSegmentDirectionBalanceStatus(): Promise<SegmentDirectionBalanceStatus> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/segment-balance/status"), { cache: "no-store" });
    if (!response.ok) return DEFAULT_STATUS;
    const json = await response.json().catch(() => null);
    const s = json?.status;
    const balance = s?.balance;
    if (!s || typeof s !== "object" || !balance || typeof balance !== "object") return DEFAULT_STATUS;
    return {
      enabled: Boolean(balance.enabled),
      phase: balance.phase ?? "watching",
      hedgedEpisode: Boolean(balance.hedgedEpisode),
      hedgeSide: balance.hedgeSide === "short" || balance.hedgeSide === "long" ? balance.hedgeSide : null,
      hedgeOrdersOut: Number(balance.hedgeOrdersOut) || 0,
      lastLongsBp: Number(balance.lastLongsBp) || 0,
      lastShortsBp: Number(balance.lastShortsBp) || 0,
      lastCheckUtc: balance.lastCheckUtc ?? null,
      nextCheckUtc: balance.nextCheckUtc ?? null,
      lastAction: balance.lastAction ?? "",
      lastReason: balance.lastReason ?? "",
      activeStrategyIds: Array.isArray(s.activeStrategyIds) ? s.activeStrategyIds : [],
      trackedTickerCount: Number(s.trackedTickerCount) || 0,
    };
  } catch {
    return DEFAULT_STATUS;
  }
}
