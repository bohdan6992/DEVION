import { createDefaultScopeResearchDrafts, createScannerScopeCatalog } from "./scopeParameters";
import type { ScannerScopeCatalog } from "./scopeParameters";
import type { ScopePanelKey, ScopeResearchDraft, ScopeResearchParameterKey, ScopeResearchResultKey } from "./types";

/**
 * How a strategy contributes its own knobs to the shared scanner shell.
 *
 * Three pieces, and that is deliberately the whole contract for adding a strategy:
 *
 *   use()      owns the strategy's state (and its own localStorage keys, namespaced by the
 *              descriptor's lsKeyPrefix). Called once by the shell.
 *   applyTo()  folds that state into the request body the shell is about to POST. The shell fills
 *              in everything shared; this adds what only this strategy understands.
 *   Controls   the toolbar section rendered next to the shared controls.
 *
 * `TParams` is whatever `use()` returns — the shell never inspects it, it only hands it back to
 * `applyTo` and `Controls`.
 */
export type ScannerStrategyParams<TParams = unknown> = {
  use: () => TParams;
  applyTo: (request: Record<string, any>, params: TParams) => void;
  Controls: (props: { params: TParams }) => JSX.Element | null;
  /** Panels this strategy adds beyond the shared set, e.g. OpenDoor's 09:20 snapshot stats. */
  extraPanels?: Array<{
    id: string;
    title: string;
    Panel: (props: { params: TParams }) => JSX.Element | null;
  }>;
};

/**
 * Everything a scanner strategy varies.
 *
 * Arbitrage and OpenDoor ran as two 16k-line copies of one another; the parts that genuinely
 * differed were the API prefix, the storage/nav keys, and which research axes the strategy can
 * populate. Those are the fields below — a new strategy is a new descriptor plus whatever bespoke
 * panels it needs, not another fork of the shell.
 *
 * Rule of thumb: if a value is a *constant per strategy*, it belongs here. If it is derived from
 * the current filter state, it belongs in the shell.
 */
export type ScannerStrategy = {
  /** Stable id, also used as the default localStorage namespace. */
  id: string;
  /** Human label for headers and log lines. */
  label: string;

  api: {
    /** Prefix for the paper endpoints, e.g. `/api/paper/arbitrage`. No trailing slash. */
    base: string;
    /** Strategy fallback for the trading-day list. Defaults to `${base}/days`. */
    daysEndpoint: string;
  };

  /** localStorage key prefix for this strategy's persisted filter state. */
  lsKeyPrefix: string;

  /**
   * The minute-of-day window (NY, 0 = 00:00) in which this strategy can open or hold a position.
   * Negative values count backwards into the prior calendar day, matching TapeArbClasses.PreFrom
   * (-180 = 21:00 the evening before).
   *
   * This is the one axis on which the strategies genuinely differ — Arbitrage spans the whole
   * session, OpenDoor only ever touches 09:20 → 10:00. Everything else (classes, ratings, gates)
   * has the same shape in both; see `ratingClasses`.
   */
  tradingWindow: { fromMinuteIdx: number; toMinuteIdx: number };

  /**
   * The rating classes this strategy is rated by.
   *
   * Every strategy rates a ticker per class × direction → {rate, total} and gates on
   * minRate/minTotal; only the class taxonomy differs, and both taxonomies already share one
   * namespace (see the class-label map in ArbitrageSonar):
   *
   *   Arbitrage — session bands, read from `sigma_peak_bins[class][pos|neg]`.
   *   OpenDoor  — exit horizons, read from
   *               `<param>_<class>_best_<long|short>_<rate|total|avg_move>` in
   *               /api/opendoor/summary, where param is stack | bench | devsig.
   *
   * This is the axis a shared class selector renders. A strategy having non-session classes does
   * NOT mean it has no classes — OpenDoor's 10m/30m are as load-bearing as Arbitrage's bands.
   */
  ratingClasses: {
    /** Short name of the dimension, for UI copy — e.g. "SESSION" or "EXIT". */
    dimension: string;
    /** Class keys exactly as they appear in this strategy's ratings payload. */
    keys: readonly string[];
    /** Display label per key. */
    labels: Readonly<Record<string, string>>;
  };

  /**
   * The strategy's own knobs — the ONLY part of a scanner that is not shared.
   *
   * Everything else a scanner does (dates, ticker scope, the whole filter toolbar, rating rules,
   * sizing, dilution, scope research, the optimizer, the tables and charts) is identical across
   * strategies and lives in the shell. Arbitrage and OpenDoor proved it the hard way: they ran as
   * two 9k-line copies whose only real difference was ~16 fields.
   *
   * Leave it undefined for a strategy that adds no knobs of its own.
   */
  params?: ScannerStrategyParams;

  nav: {
    stream: string;
    scanner: string;
    sonar: string;
  };

  /** Research axes/metrics this strategy can actually produce. */
  scope: ScannerScopeCatalog;
  /** Panel defaults, already narrowed to axes present in `scope`. */
  defaultScopeDrafts: Record<ScopePanelKey, ScopeResearchDraft>;
};

export type ScannerStrategyInit = {
  id: string;
  label: string;
  apiBase: string;
  daysEndpoint?: string;
  lsKeyPrefix?: string;
  nav: ScannerStrategy["nav"];
  tradingWindow: ScannerStrategy["tradingWindow"];
  ratingClasses: ScannerStrategy["ratingClasses"];
  /** Axes this strategy never populates — dropped from every research dropdown. */
  excludeScopeParameters?: Iterable<ScopeResearchParameterKey>;
  /** Result metrics this strategy always leaves null (e.g. no hedge leg). */
  excludeScopeResults?: Iterable<ScopeResearchResultKey>;
  /** Starting axis per panel. Must be an axis that survives `excludeScopeParameters`. */
  defaultScopeAxes?: Partial<Record<ScopePanelKey, ScopeResearchParameterKey>>;
  /** The strategy's own knobs; omit for a strategy that adds none. */
  params?: ScannerStrategyParams<any>;
};

export function defineScannerStrategy(init: ScannerStrategyInit): ScannerStrategy {
  const scope = createScannerScopeCatalog({
    excludeParameters: init.excludeScopeParameters,
    excludeResults: init.excludeScopeResults,
  });

  const defaultScopeDrafts = createDefaultScopeResearchDrafts(init.defaultScopeAxes);
  // A default axis the catalog dropped would open the panel on an option the user cannot see or
  // re-select. Fail loudly at module load rather than shipping a dead dropdown.
  for (const panel of Object.keys(defaultScopeDrafts) as ScopePanelKey[]) {
    const key = defaultScopeDrafts[panel].parameterKey;
    if (!scope.parameterOptions.some((option) => option.value === key)) {
      throw new Error(
        `[scanner:${init.id}] default ${panel} axis "${key}" is excluded from this strategy's scope catalog`
      );
    }
  }

  return {
    id: init.id,
    label: init.label,
    api: {
      base: init.apiBase,
      daysEndpoint: init.daysEndpoint ?? `${init.apiBase}/days`,
    },
    lsKeyPrefix: init.lsKeyPrefix ?? init.id,
    params: init.params,
    nav: init.nav,
    tradingWindow: init.tradingWindow,
    ratingClasses: init.ratingClasses,
    scope,
    defaultScopeDrafts,
  };
}
