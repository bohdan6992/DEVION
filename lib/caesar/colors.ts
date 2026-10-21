import {
  CLO_HEDGE_BRIDGE_ID, CLO_HEDGE_COLOR,
  ARBITRAGE_HEDGE_BRIDGE_ID, ARBITRAGE_HEDGE_COLOR,
} from "@/lib/caesar/hedge";
import {
  IDENTITY_LAVENDER_HEX,
  IDENTITY_ORANGE_HEX,
  IDENTITY_YELLOW_HEX,
} from "@/components/scanner/shared/styles";

/**
 * Strategy IDENTITY colours — single source of truth, shared by CaesarCharts (the donut/lines
 * themselves) and CaesarPositions (the strategy cards' own title colour), so a card and its chart
 * line are provably the same colour rather than two independently-computed palettes that happen
 * to agree today (2026-10-21, the operator's own instruction: colour the card titles to match).
 *
 * Deliberately excludes mint/emerald and coral/rose — those two are reserved app-wide for
 * POSITIVE/NEGATIVE (or long/short), see SOFT_LOSS_* in components/scanner/shared/styles.ts and
 * pnlTone(). A strategy assigned one of those by coincidence of palette order would read as "this
 * strategy is good/bad" in any chart that also shows a signed total nearby, which is not what the
 * colour is there to say. Lavender / orange / cyan / yellow / blue, in that order; OTHER is the
 * fold-over past five strategies.
 */
export const SERIES = [IDENTITY_LAVENDER_HEX, IDENTITY_ORANGE_HEX, "#22d3ee", IDENTITY_YELLOW_HEX, "#60a5fa"] as const;
export const OTHER = "#818cf8";

/**
 * The OVERNIGHT category's own colour family (Day Two, Reversal, Continuum, MorLaunch Basket —
 * see LiveStrategy.holdsOvernight): strategies that enter at the close and are still held after
 * the 21:00 roll. Fuchsia and a pale orchid — neither is in SERIES, and neither is the mint/coral
 * pair reserved for positive/negative, so "magenta" reads as "carried overnight" everywhere.
 */
export const OVERNIGHT_SERIES = ["#e879f9", "#f5d0fe"] as const;
export const MAX_SERIES = SERIES.length;

export type ColorableInstance = { instanceId: string; overnight?: boolean };

/**
 * One colour per strategy instance, assigned in order WITHIN its own category (regular vs
 * overnight) — adding or removing one strategy never repaints the survivors; past the category's
 * own palette length, a strategy folds into OTHER rather than inventing a hue. Each hedge class
 * keeps its own fixed colour and never takes a SERIES slot.
 *
 * Order-dependent on `instances`: every caller must build this from the SAME instances array to
 * agree on which colour is whose. Callers that need a colour STABLE across segment/allDay view
 * changes (CaesarPositions always does; CaesarCharts should too) build this once from the full
 * registry-ordered instance list (CaesarSchedule's own `positionInstances`), never from a
 * segment-scoped subset — a subset's own iteration order shifts with the plan, which would repaint
 * survivors exactly what this function's own ordering rule exists to prevent.
 */
export function buildColorByInstance(instances: readonly ColorableInstance[]): Map<string, string> {
  const map = new Map<string, string>();
  let regular = 0;
  let overnight = 0;
  for (const inst of instances) {
    if (inst.instanceId === CLO_HEDGE_BRIDGE_ID) {
      map.set(inst.instanceId, CLO_HEDGE_COLOR);
    } else if (inst.instanceId === ARBITRAGE_HEDGE_BRIDGE_ID) {
      map.set(inst.instanceId, ARBITRAGE_HEDGE_COLOR);
    } else if (inst.overnight) {
      map.set(inst.instanceId, overnight < OVERNIGHT_SERIES.length ? OVERNIGHT_SERIES[overnight] : OTHER);
      overnight += 1;
    } else {
      map.set(inst.instanceId, regular < MAX_SERIES ? SERIES[regular] : OTHER);
      regular += 1;
    }
  }
  return map;
}
