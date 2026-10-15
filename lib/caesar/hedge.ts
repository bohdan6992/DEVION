import { getLiveStrategyByBridgeId } from "@/lib/strategies/registry";

/**
 * The QQQ direction-balance hedge is a Caesar CLASS of its own, not a registered strategy: the bridge
 * tracks every hedge press under this id (ServerStrategyRunner.HedgeStrategyId), so positions, closed
 * owners, the P&L-over-time series and the arrivals log all attribute QQQ to HEDGE with the same joins
 * every strategy uses.
 */
export const HEDGE_BRIDGE_ID = "stream.hedge";
export const HEDGE_KEY = "hedge";
export const HEDGE_COLOR = "#34d399";

export const HEDGE_INSTANCE = { key: HEDGE_KEY, instanceId: HEDGE_BRIDGE_ID, priority: 0 } as const;

/** Bridge id -> the class key a claim/card is filed under (a strategy's key, or HEDGE). */
export function resolveClassByBridgeId(bridgeStrategyId: string | null | undefined): { key: string } | undefined {
  if ((bridgeStrategyId ?? "").trim().toLowerCase() === HEDGE_BRIDGE_ID) return { key: HEDGE_KEY };
  const s = getLiveStrategyByBridgeId(bridgeStrategyId);
  return s ? { key: s.key } : undefined;
}
