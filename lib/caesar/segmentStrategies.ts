import { CLO_HEDGE_KEY, ARBITRAGE_HEDGE_KEY } from "@/lib/caesar/hedge";

/**
 * Which strategies show under each Caesar segment tab — the operator's own explicit mapping,
 * 2026-10-21, shared by CaesarPositions.tsx's own strategy cards AND CaesarSchedule.tsx's own
 * chartInstances (the donut, PNL OVER TIME, AVERAGE TRADE and arrivals charts in CaesarCharts),
 * so the two can never disagree about which segment a strategy belongs to.
 *
 * Earlier attempts had the donut/charts read the LIVE Caesar plan's own per-segment assignment
 * (`plan[segmentKey]`) instead of this list — which repeatedly disagreed with what the cards
 * showed, because CLO Reversal/Continuum settle by the SAME 09:35 checkpoint Arbitrage/Morning
 * Launch do, but are plan-assigned to POST (their own entry is sent the evening before — see
 * CaesarPlanReversalEarlyEnableTests' own doc comment on the bridge), not PRE. Reading the live
 * plan for the donut meant POST's own `instances` never included Reversal/Continuum at all, so
 * ownersByTicker (CaesarCharts.tsx) could never find their real open positions and read them as
 * UNCLAIMED (the operator's own bug report, 2026-10-21: 24 of 25 open tickers read UNCLAIMED on
 * POST despite CLO•REVERSAL/CLO•CONTINUUM's own cards showing 7 and 17 open). The SAME class of
 * bug then recurred for OPG under OPEN. One explicit list, one import on each side, settles both.
 *
 * PRE shows everything genuinely active on it, hedges included; OPEN shows only the OPG family;
 * INTRA shows nothing; POST shows CLO (and its own hedge) plus LAUNCH•EVENING's basket (its
 * 15:58 send is armed early by CaesarPlanService.EarlyEnableFloorMinuteIdx, like CLO's own).
 */
export const SEGMENT_STRATEGY_KEYS: Partial<Record<string, readonly string[]>> = {
  pre: ["arbitrage", "morlaunch", "morlaunchbasket", "limiterbasket", "reversal", "continuum", ARBITRAGE_HEDGE_KEY, CLO_HEDGE_KEY],
  open: ["opgreversal", "opgcontinuum", "opgfade", "opgride"],
  intra: [],
  post: ["reversal", "continuum", "launcheveningbasket", CLO_HEDGE_KEY],
};
