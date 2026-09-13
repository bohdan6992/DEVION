import type { OpenDoorLiveFilters } from "../opendoor/liveParamsClient";

/**
 * Maps the OpenDoor-family Sonar toolbar's bounds/exclude/list/multi-select state into
 * LiveRowFilter.cs's shape (OpenDoorLiveFilters, TS twin of LiveRowFilterConfig) — the SAME
 * mapping toArbitrageServerSonarFilters does for Arbitrage/PairFlux Sonar, just targeting the
 * OpenDoor-family's own filter engine instead of SonarFilterConfig.
 *
 * Each of the four Sonar files (OpenDoor/DayTwo/OpenFade/OpenRide) declares its own local
 * SonarExactFilterSnapshot type — structurally identical copies, not a shared import — so this
 * takes a structural subset rather than importing any one file's type.
 */
type Bound = { min?: number; max?: number };

export type OpenDoorSonarFilterSource = {
  listMode: string;
  ignoreSet: Set<string>;
  applySet: Set<string>;
  pinMap: Record<string, string>;
  activeMode: string;
  includeUSA: boolean;
  includeChina: boolean;
  selCountries: Set<string>;
  countryEnabled: "off" | "include" | "exclude";
  selExchanges: Set<string>;
  exchangeEnabled: "off" | "include" | "exclude";
  selSectors: Set<string>;
  sectorEnabled: "off" | "include" | "exclude";
  bounds: Record<string, { min?: unknown; max?: unknown } | undefined>;
  excludeDividend: boolean;
  excludeNews: boolean;
  excludePTP: boolean;
  excludeSSR: boolean;
  excludeReport: boolean;
  excludeETF: boolean;
  excludeCrap: boolean;
  filterReport: "ALL" | "YES" | "NO";
  equityType: string;
};

const upper = (values?: Iterable<string> | null): string[] =>
  Array.from(values ?? []).map((v) => String(v).trim().toUpperCase()).filter(Boolean);

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const bound = (min: unknown, max: unknown): Bound | undefined => {
  const lo = num(min);
  const hi = num(max);
  return lo == null && hi == null ? undefined : { min: lo, max: hi };
};

const listModeOf = (mode?: string): "off" | "ignore" | "apply" | "pin" =>
  mode === "ignore" ? "ignore" : mode === "apply" ? "apply" : mode === "pin" ? "pin" : "off";

const activityOf = (mode?: string): "off" | "onlyActive" | "onlyInactive" =>
  mode === "onlyActive" ? "onlyActive" : mode === "onlyInactive" ? "onlyInactive" : "off";

export function toOpenDoorSonarFilters(f: OpenDoorSonarFilterSource): OpenDoorLiveFilters {
  const bounds: Record<string, Bound> = {};
  for (const [key, mm] of Object.entries(f.bounds ?? {})) {
    const b = bound(mm?.min, mm?.max);
    if (b) bounds[key] = b;
  }

  return {
    lists: {
      mode: listModeOf(f.listMode),
      ignore: upper(f.ignoreSet),
      apply: upper(f.applySet),
      pinned: upper(Object.keys(f.pinMap ?? {})),
    },
    activityMode: activityOf(f.activeMode),
    bounds,
    exclude: {
      dividend: !!f.excludeDividend,
      news: !!f.excludeNews,
      ptp: !!f.excludePTP,
      ssr: !!f.excludeSSR,
      report: !!f.excludeReport,
      etf: !!f.excludeETF,
      crap: !!f.excludeCrap,
    },
    include: {
      usaOnly: !!f.includeUSA,
      chinaOnly: !!f.includeChina,
    },
    multi: {
      countries: { mode: f.countryEnabled, values: upper(f.selCountries) },
      exchanges: { mode: f.exchangeEnabled, values: upper(f.selExchanges) },
      sectors: { mode: f.sectorEnabled, values: upper(f.selSectors) },
    },
    reportMode: f.filterReport,
    equityType: f.equityType,
  };
}
