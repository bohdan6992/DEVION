import { bridgeUrl } from "../bridgeBase";
import type { ArbitrageFilterConfigV1 } from "../filters/arbitrageFilterConfigV1";
import type { StreamAutomationConfig } from "../../components/stream/streamEngine";
import type { SonarExactFilterSnapshot } from "../../components/sonar/ArbitrageSonar";

/**
 * The Arbitrage toolbar, pushed to the bridge so the server engine trades what the page shows.
 *
 * Same split, and the same reason, as OpenDoor's own client: the page owns editing these, the
 * bridge owns acting on them. A setting that lives only in a tab leaves the engine guessing the
 * moment the tab closes — and guessing means trading a different strategy from the tuned one.
 *
 * The shape mirrors ArbitrageLiveParams on the bridge. Enum-ish fields are sent with the names the
 * C# side declares ("Ignore", "OnlyActive", "Sigma"), not the page's own lower-case spellings, so
 * neither end has to guess at the other's casing.
 */
export type ArbitrageLiveParams = {
  endSignalThreshold: number;
  minHoldMinutes: number;
  maxAdds: number;
  dilutionStep: number;
  addDelayMinutes: number;
  scaleMode: "single" | "scale_in";
  exitExecutionMode: "active" | "passive";
  noSpreadExit: boolean;
  maxSpread: number | null;
  minNetEdge: number;
  addMaxDeviation: number | null;
  maxOpenPositions: number;
  entryCutoffEnabled: boolean;
  entryStopTime: string | null;
  startCutoffTime: string | null;
  sessionStartTime: string | null;
  signalsClass: string;
  signalsType: string;
  signalsMode: string;
  signalsMinRate: number;
  signalsMinTotal: number;
  filters: ArbitrageServerFilters | null;
  sonar: ArbitrageServerSonarFilters | null;
  /**
   * The direction auto-balance switch. The bridge acts on it: every few minutes it counts its book by
   * side and lowers the entry threshold of the under-represented one. Null/disabled = it never
   * touches a threshold.
   */
  autoBalance: { enabled: boolean; ratio: number } | null;
  source: string;
};

type Bound = { min?: number | null; max?: number | null };

export type ArbitrageServerFilters = {
  listMode: "Off" | "Ignore" | "Apply" | "Pin";
  ignore: string[];
  apply: string[];
  pinned: string[];
  activity: "Off" | "OnlyActive" | "OnlyInactive";
  usaOnly: boolean;
  chinaOnly: boolean;
  countries: string[];
  exchanges: string[];
  sectors: string[];
  excludeDividend: boolean;
  excludeNews: boolean;
  excludePtp: boolean;
  excludeSsr: boolean;
  excludeReport: boolean;
  excludeEtf: boolean;
  excludeCrap: boolean;
  hasReport: boolean | null;
  equityType: string | null;
  bounds: Record<string, Bound>;
  zapMode: "Off" | "Zap" | "Sigma";
  zapThreshold: number;
};

export type ArbitrageServerSonarFilters = {
  skipRating: boolean;
  skipZapThreshold: boolean;
  listMode: "Off" | "Ignore" | "Apply" | "Pin";
  ignore: string[];
  apply: string[];
  pinned: string[];
  activity: "Off" | "OnlyActive" | "OnlyInactive";
  topMode: boolean;
  /** Only the sigma leg of TOP is enforced live (SonarFilterConfig.TopSigmaOn) — bench/time are not wired server-side yet. */
  topSigmaOn: boolean;
  corr: Bound | null;
  beta: Bound | null;
  sigma: Bound | null;
  bounds: Record<string, Bound>;
  excludeDividend: boolean;
  excludeNews: boolean;
  excludePtp: boolean;
  excludeSsr: boolean;
  excludeReport: boolean;
  excludeEtf: boolean;
  excludeCrap: boolean;
  excludeItb: boolean;
  excludeHardToBorrow: boolean;
  excludeCorr: boolean;
  corrExcluded: string[];
  includeUsa: boolean;
  includeChina: boolean;
  countries: string[];
  countryMode: "Off" | "Include" | "Exclude";
  exchanges: string[];
  exchangeMode: "Off" | "Include" | "Exclude";
  sectors: string[];
  sectorMode: "Off" | "Include" | "Exclude";
  report: "All" | "Yes" | "No";
  equityType: string | null;
  zapMode: "Off" | "Zap" | "Sigma" | "Delta";
  zapShowAbs: number;
  /** Separate threshold for NEGATIVE deviations (a Long entry); null = the same as zapShowAbs. */
  zapShowAbsNeg: number | null;
};

const upper = (values?: Iterable<string> | null): string[] =>
  Array.from(values ?? []).map((v) => String(v).trim().toUpperCase()).filter(Boolean);

/**
 * `Number(null)` and `Number("")` are BOTH `0` in JS — a finite number, not NaN. Reading either as
 * "unset" the naive way (`Number.isFinite(n) ? n : null`) instead turns every untouched min/max box
 * into a live `{min:0, max:0}` bound, rejecting almost every row (a real ticker's Corr/Beta/ADV20/
 * etc. is essentially never exactly 0). Null/undefined/blank must short-circuit to "unset" BEFORE
 * the numeric parse, same as the client's own `toNum` in lib/signals/signal.ts.
 */
const num = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const bound = (min: unknown, max: unknown): Bound | null => {
  const lo = num(min);
  const hi = num(max);
  return lo == null && hi == null ? null : { min: lo, max: hi };
};

const listMode = (mode?: string): ArbitrageServerFilters["listMode"] =>
  mode === "ignore" ? "Ignore" : mode === "apply" ? "Apply" : mode === "pin" ? "Pin" : "Off";

const activity = (mode?: string): ArbitrageServerFilters["activity"] =>
  mode === "onlyActive" ? "OnlyActive" : mode === "onlyInactive" ? "OnlyInactive" : "Off";

const selection = (mode?: string): "Off" | "Include" | "Exclude" =>
  mode === "include" ? "Include" : mode === "exclude" ? "Exclude" : "Off";

/** ALL / YES / NO, or a plain boolean on older saved shapes. */
const reportTriState = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "YES") return true;
  if (s === "NO") return false;
  return null;
};

export function toArbitrageServerFilters(cfg: ArbitrageFilterConfigV1): ArbitrageServerFilters {
  const bounds: Record<string, Bound> = {};
  for (const [key, mm] of Object.entries(cfg.bounds ?? {})) {
    const b = bound((mm as Bound | undefined)?.min, (mm as Bound | undefined)?.max);
    if (b) bounds[key] = b;
  }

  // A multi-select that is switched OFF sends nothing rather than its values: the bridge treats a
  // non-empty selection as a filter, so sending hidden values would filter on something the
  // toolbar is not showing.
  const multi = (sel?: { enabled?: boolean; values?: string[] }) =>
    sel?.enabled ? upper(sel.values) : [];

  return {
    listMode: listMode(cfg.lists?.mode),
    ignore: upper(cfg.lists?.ignore),
    apply: upper(cfg.lists?.apply),
    pinned: upper(cfg.lists?.pinned),
    activity: activity(cfg.activity?.mode),
    usaOnly: !!cfg.include?.usaOnly,
    chinaOnly: !!cfg.include?.chinaOnly,
    countries: multi(cfg.multi?.countries),
    exchanges: multi(cfg.multi?.exchanges),
    sectors: multi(cfg.multi?.sectors),
    excludeDividend: !!cfg.exclude?.dividend,
    excludeNews: !!cfg.exclude?.news,
    excludePtp: !!cfg.exclude?.ptp,
    excludeSsr: !!cfg.exclude?.ssr,
    excludeReport: !!cfg.exclude?.report,
    excludeEtf: !!cfg.exclude?.etf,
    excludeCrap: !!cfg.exclude?.crap,
    hasReport: reportTriState(cfg.report?.hasReport),
    equityType: cfg.equityType?.trim() || null,
    bounds,
    zapMode: cfg.zap?.mode === "zap" ? "Zap" : cfg.zap?.mode === "sigma" ? "Sigma" : "Off",
    zapThreshold: num(cfg.zap?.thresholdAbs) ?? 0,
  };
}

export function toArbitrageServerSonarFilters(f: SonarExactFilterSnapshot): ArbitrageServerSonarFilters {
  const bounds: Record<string, Bound> = {};
  for (const [key, mm] of Object.entries(f.bounds ?? {})) {
    const b = bound((mm as Bound | undefined)?.min, (mm as Bound | undefined)?.max);
    if (b) bounds[key] = b;
  }

  return {
    skipRating: !!f.skipArbitrageRating,
    skipZapThreshold: !!f.skipArbitrageZapThreshold,
    listMode: listMode(f.listMode),
    ignore: upper(f.ignoreSet),
    apply: upper(f.applySet),
    pinned: upper(Object.keys(f.pinMap ?? {})),
    activity: activity(f.activeMode),
    topMode: !!f.topMode,
    topSigmaOn: !!f.topSigmaOn,
    corr: bound(f.corrMin, f.corrMax),
    beta: bound(f.betaMin, f.betaMax),
    sigma: bound(f.sigmaMin, f.sigmaMax),
    bounds,
    excludeDividend: !!f.excludeDividend,
    excludeNews: !!f.excludeNews,
    excludePtp: !!f.excludePTP,
    excludeSsr: !!f.excludeSSR,
    excludeReport: !!f.excludeReport,
    excludeEtf: !!f.excludeETF,
    excludeCrap: !!f.excludeCrap,
    excludeItb: !!f.excludeItb,
    excludeHardToBorrow: !!f.excludeHard,
    excludeCorr: !!f.excludeCorr,
    corrExcluded: upper(f.corrExcluded),
    includeUsa: !!f.includeUSA,
    includeChina: !!f.includeChina,
    countries: upper(f.selCountries),
    countryMode: selection(f.countryEnabled),
    exchanges: upper(f.selExchanges),
    exchangeMode: selection(f.exchangeEnabled),
    sectors: upper(f.selSectors),
    sectorMode: selection(f.sectorEnabled),
    report: f.filterReport === "YES" ? "Yes" : f.filterReport === "NO" ? "No" : "All",
    equityType: f.equityType?.trim() || null,
    zapMode:
      f.zapMode === "zap" ? "Zap" :
      f.zapMode === "delta" ? "Delta" :
      f.zapMode === "off" ? "Off" : "Sigma",
    zapShowAbs: num(f.zapShowAbs) ?? 0,
    zapShowAbsNeg: num(f.zapShowAbsNeg),
  };
}

export function toArbitrageLiveParams(args: {
  automation: StreamAutomationConfig;
  filters: ArbitrageFilterConfigV1;
  sonar?: SonarExactFilterSnapshot | null;
  maxSpread?: unknown;
  addMaxDeviation?: unknown;
  signalsClass: string;
  signalsType: string;
  signalsMinRate: number;
  signalsMinTotal: number;
  autoBalance?: { enabled: boolean; ratio: number } | null;
  source: string;
}): ArbitrageLiveParams {
  const a = args.automation;
  return {
    endSignalThreshold: num(a.endSignalThreshold) ?? 0,
    minHoldMinutes: num(a.minHoldMinutes) ?? 0,
    maxAdds: num(a.maxAdds) ?? 0,
    dilutionStep: num(a.dilutionStep) ?? 0,
    addDelayMinutes: num(a.addDelayMinutes) ?? 0,
    scaleMode: a.scaleMode === "scale_in" ? "scale_in" : "single",
    exitExecutionMode: a.exitExecutionMode === "passive" ? "passive" : "active",
    noSpreadExit: a.noSpreadExit !== false,
    maxSpread: num(args.maxSpread),
    minNetEdge: num(a.minNetEdge) ?? 0,
    addMaxDeviation: num(args.addMaxDeviation),
    maxOpenPositions: num(a.maxOpenPositions) ?? 0,
    entryCutoffEnabled: true,
    // Kept apart on purpose: entries stop at the first, everything closes at the second.
    entryStopTime: a.entryStopTime?.trim() || null,
    startCutoffTime: a.startCutoffTime?.trim() || null,
    sessionStartTime: (a as { preStartTime?: string }).preStartTime?.trim() || null,
    signalsClass: args.signalsClass,
    signalsType: args.signalsType,
    signalsMode: "all",
    signalsMinRate: num(args.signalsMinRate) ?? 0,
    signalsMinTotal: num(args.signalsMinTotal) ?? 0,
    // The page runs EITHER Sonar or the toolbar set, never both — the bridge expects the same.
    filters: args.sonar ? null : toArbitrageServerFilters(args.filters),
    sonar: args.sonar ? toArbitrageServerSonarFilters(args.sonar) : null,
    autoBalance: args.autoBalance ? { enabled: !!args.autoBalance.enabled, ratio: num(args.autoBalance.ratio) ?? 2 } : null,
    source: args.source,
  };
}

export async function pushArbitrageLiveParams(params: ArbitrageLiveParams): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl("/api/stream/arbitrage/params"), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({}));
    return json?.ok !== false;
  } catch {
    // Best-effort, like the OpenDoor client: the bridge keeps whatever it last received and the
    // toolbar is unaffected.
    return false;
  }
}
