import { getLiveStrategyByBridgeId } from "@/lib/strategies/registry";

/**
 * CLO Reversal/Continuum's own TQQQ hedge (ReversalContinuumEntryHedgeService) and Arbitrage's own
 * QQQ hedge (DirectionBalancer) are each a Caesar CLASS of their own, not a registered strategy —
 * neither is one of its strategy's own positions, so each is tracked under its own bridge id
 * (ServerStrategyRunner.ResolveHedgeStrategyId), and positions, closed owners, the P&L-over-time
 * series and the arrivals log all attribute their own ticker (TQQQ / QQQ) to their own class.
 *
 * TWO DISTINCT CLASSES, not one shared "hedge" bucket (operator's own instruction, 2026-10-20) — the
 * two hedges are unrelated: different strategies, different tickers, different sizing. Collapsing
 * them hid which one was actually firing.
 */
export const CLO_HEDGE_BRIDGE_ID = "stream.hedge.clo";
export const ARBITRAGE_HEDGE_BRIDGE_ID = "stream.hedge.arbitrage";
export const CLO_HEDGE_KEY = "clo-hedge";
export const ARBITRAGE_HEDGE_KEY = "arbitrage-hedge";
export const CLO_HEDGE_COLOR = "#34d399"; // the old single hedge bucket's own colour, kept for CLO's
export const ARBITRAGE_HEDGE_COLOR = "#60a5fa";

export const CLO_HEDGE_INSTANCE = { key: CLO_HEDGE_KEY, instanceId: CLO_HEDGE_BRIDGE_ID, priority: 0 } as const;
export const ARBITRAGE_HEDGE_INSTANCE = { key: ARBITRAGE_HEDGE_KEY, instanceId: ARBITRAGE_HEDGE_BRIDGE_ID, priority: 0 } as const;

/** Every hedge instance, for the places that used to splice in one HEDGE_INSTANCE and now need both. */
export const HEDGE_INSTANCES = [CLO_HEDGE_INSTANCE, ARBITRAGE_HEDGE_INSTANCE] as const;

/** The bridge's own fallback id for a hedge ticker that is neither QQQ nor TQQQ (none exists today —
 * see ServerStrategyRunner.HedgeStrategyId's own doc comment). Kept only so a future third hedge
 * ticker fails visibly (falls through to "unclaimed" below) rather than silently matching one of
 * the two real classes. */
export const HEDGE_BRIDGE_ID = "stream.hedge";

/** Bridge id -> the class key a claim/card is filed under (a strategy's key, CLO_HEDGE_KEY, or
 * ARBITRAGE_HEDGE_KEY). */
export function resolveClassByBridgeId(bridgeStrategyId: string | null | undefined): { key: string } | undefined {
  const id = (bridgeStrategyId ?? "").trim().toLowerCase();
  if (id === CLO_HEDGE_BRIDGE_ID) return { key: CLO_HEDGE_KEY };
  if (id === ARBITRAGE_HEDGE_BRIDGE_ID) return { key: ARBITRAGE_HEDGE_KEY };
  const s = getLiveStrategyByBridgeId(bridgeStrategyId);
  return s ? { key: s.key } : undefined;
}
