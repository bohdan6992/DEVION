/**
 * Which strategies settle by PRE's own 09:35 checkpoint vs the OPG family's own 10:35 one — the
 * operator's own explicit list (2026-10-20): "CLO REVERSAL CLO CONTINUUM, ARBITRAGE, MORNING
 * LAUNCH - це ті стратегії чий тотал підбивай після 9:35 саме по closed", mirroring
 * CaesarPlanController.PreFamilyStrategyIds on the bridge, the authoritative source this list
 * tracks. A single shared export so CaesarPositions.tsx's own cards and CaesarCharts.tsx's own
 * settle-breakdown chart can never disagree about which strategy belongs to which checkpoint
 * family — the same class of bug this session already fixed once for segment membership (see
 * segmentStrategies.ts's own doc comment for the full history of that one).
 */
export const PRE_CHECKPOINT_BRIDGE_IDS = new Set([
  "stream.reversal",
  "stream.continuum",
  "stream.arbitrage",
  "stream.morlaunch",
]);

/** The OPG family's own exit classes resolve after 09:45, so this is the mirror-image checkpoint — see PRE_CHECKPOINT_BRIDGE_IDS' own doc comment. */
export const OPG_CHECKPOINT_BRIDGE_IDS = new Set([
  "stream.opgreversal",
  "stream.opgcontinuum",
  "stream.opgfade",
  "stream.opgride",
]);
