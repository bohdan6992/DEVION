/**
 * PullBack Scout/Spectr — wire types.
 *
 * UNLIKE every sibling family (Reversal, the OPG family, MorLaunch, LaunchEvening), PullBack's
 * published file carries NO per-trade columnar log — PullBackRatingsService's own doc comment says
 * so explicitly ("the parser already produces the final table - there is no columnar-to-row
 * rebuild step... because PullBack's file is row-shaped to begin with"). There is therefore no
 * `/scout/trades` endpoint and no SliceWire/Slice type here: what you see in `meta` is the whole of
 * what exists, which is also why PullBackScout.tsx cannot offer a Scout in the sibling sense
 * (no threshold-tunable trade log to recompute an equity curve from).
 *
 * The other real difference (see PullBackRatingsTypes.cs's own header on the bridge): ALPHA and
 * GAMMA are PER CLASS, not per ticker and not per (class, sign) — a ticker carries ONE levels entry
 * per class (T0430/T0500/T0530), each already holding BOTH signs' alpha/gamma inside it. GAMMA here
 * is the MAXIMUM EXCURSION the stack made between that class and 09:30 (large, not a qualifying
 * entry level like the OPG family's). The separate `ratings` object IS per (class, sign), same
 * shape as every sibling's realised win/pnl cell.
 *
 * SIGN -> SIDE: checked PullBackGate.cs directly — `isLong = d < 0`, pos=SHORT / neg=LONG, the SAME
 * convention as MorLaunch/OPG-Fade/OPG-Reversal/OPG-Rootation.
 */

export type PullBackClass = "T0430" | "T0500" | "T0530";
export type PullBackSign = "pos" | "neg";
export type PullBackSide = "short" | "long" | "both";

export const PULLBACK_CLASSES: PullBackClass[] = ["T0430", "T0500", "T0530"];

export type PullBackLevelsWire = {
  ap?: number | null; an?: number | null;
  apn?: number; ann?: number;
  gp?: number | null; gn?: number | null;
  gpP90?: number | null; gnP90?: number | null;
  gN?: number;
};

export type PullBackRatingCellWire = {
  total: number; wins: number;
  winRate?: number | null; winRateLb?: number | null;
  meanPnl?: number | null; medianPnl?: number | null; pnlLb?: number | null;
};

export type PullBackMetaWire = {
  ok: boolean;
  meta: {
    version: string | null;
    generatedAt: string | null;
    mostRecentSession: string | null;
    sessionsSeen: number;
    minDev: number;
    classes: PullBackClass[];
  };
  tickers: Array<{
    t: string;
    sigma?: number | null;
    lambda?: number | null;
    lambdaN?: number;
    /** keyed by class — alpha/gamma pos+neg pairs INSIDE one entry, not split by sign. */
    levels?: Partial<Record<PullBackClass, PullBackLevelsWire>>;
    /** keyed by class — {p,n} realised win/pnl cells. */
    ratings?: Partial<Record<PullBackClass, { p?: PullBackRatingCellWire; n?: PullBackRatingCellWire }>>;
    etf?: boolean | null;
    country?: string | null;
    sector?: string | null;
    exchange?: string | null;
    ptp?: boolean | null;
    ssrOut?: boolean | null;
    crap?: boolean | null;
    rep?: boolean | null;
    etb?: string | null;
    news?: boolean | null;
  }>;
};

export type PullBackLevels = {
  alphaPos: number | null; alphaNeg: number | null;
  alphaNPos: number; alphaNNeg: number;
  gammaPos: number | null; gammaNeg: number | null;
  gammaPosP90: number | null; gammaNegP90: number | null;
  gammaN: number;
};

export type PullBackRatingCell = {
  total: number; wins: number;
  winRate: number | null; winRateLb: number | null;
  meanPnl: number | null; medianPnl: number | null; pnlLb: number | null;
};

export type PullBackTicker = {
  t: string;
  sigma: number | null;
  lambda: number | null;
  lambdaN: number;
  /** one entry per class, always present for all 3 classes (missing levels decode to all-null). */
  levels: Record<PullBackClass, PullBackLevels>;
  rating: Record<PullBackClass, { pos: PullBackRatingCell | null; neg: PullBackRatingCell | null }>;
  etf: boolean | null;
  country: string | null;
  sector: string | null;
  exchange: string | null;
  ptp: boolean | null;
  ssrOut: boolean | null;
  crap: boolean | null;
  rep: boolean | null;
  etb: string | null;
  news: boolean | null;
};

export type PullBackMeta = {
  generatedAt: string | null;
  mostRecentSession: string | null;
  minDev: number;
  sessionsSeen: number;
  tickers: PullBackTicker[];
};
