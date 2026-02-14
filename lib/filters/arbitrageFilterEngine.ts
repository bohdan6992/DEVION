import type { ArbitrageFilterConfigV1, MinMax, ReportMode, ZapMode } from "@/lib/filters/arbitrageFilterConfigV1";

type AnyRow = Record<string, any>;

function normUpperList(xs?: string[]): string[] {
  if (!xs) return [];
  return xs.map(s => (s ?? "").trim().toUpperCase()).filter(Boolean);
}

function toBoolReport(v: ReportMode | string | undefined): boolean | null {
  const x = (v ?? "ALL").toString().toUpperCase();
  if (x === "ALL") return null;
  if (x === "YES") return true;
  if (x === "NO") return false;
  return null;
}

function passMinMax(x: any, mm?: MinMax): boolean {
  if (!mm) return true;
  if (x === undefined || x === null || Number.isNaN(x)) return false;

  const v = Number(x);
  if (mm.min !== undefined && mm.min !== null && v < mm.min) return false;
  if (mm.max !== undefined && mm.max !== null && v > mm.max) return false;
  return true;
}

function includesNeedle(hay: string | undefined | null, needle: string | undefined | null): boolean {
  const n = (needle ?? "").trim().toLowerCase();
  if (!n) return true;
  const h = (hay ?? "").toLowerCase();
  return h.includes(n);
}

/**
 * Apply arbitrage-style filters to rows.
 * rows can be from live sonar, or from scaner backtest inputs, as long as fields exist.
 */
export function applyArbitrageFilters(rows: AnyRow[], cfg: ArbitrageFilterConfigV1): AnyRow[] {
  const bounds = cfg.bounds ?? {};
  const exclude = cfg.exclude ?? {};
  const include = cfg.include ?? {};
  const multi = cfg.multi ?? {};
  const reportMode = toBoolReport(cfg.report?.hasReport);
  const equityNeedle = (cfg.equityType ?? "").trim();

  const listMode = cfg.lists?.mode ?? "off";
  const ignoreSet = new Set(normUpperList(cfg.lists?.ignore));
  const applySet = new Set(normUpperList(cfg.lists?.apply));
  const pinnedSet = new Set(normUpperList(cfg.lists?.pinned));

  const activeMode = cfg.activity?.mode ?? "off";

  const countryEnabled = !!multi.countries?.enabled;
  const exchangeEnabled = !!multi.exchanges?.enabled;
  const sectorEnabled = !!multi.sectors?.enabled;

  const selCountries = new Set(normUpperList(multi.countries?.values));
  const selExchanges = new Set(normUpperList(multi.exchanges?.values));
  const selSectors = new Set(normUpperList(multi.sectors?.values));

  const zapMode: ZapMode = cfg.zap?.mode ?? "off";
  const zapBase = Number(cfg.zap?.thresholdAbs ?? 0);
  const zapThr = Math.max(0.3, isFinite(zapBase) ? zapBase : 0);
  const sigThr = Math.max(0.05, isFinite(zapBase) ? zapBase : 0);

  return rows.filter((r) => {
    const t = String(r.Ticker ?? r.ticker ?? "").trim().toUpperCase();
    if (!t) return false;

    // listMode
    if (listMode === "ignore" && ignoreSet.has(t)) return false;
    if (listMode === "apply" && applySet.size > 0 && !applySet.has(t)) return false;
    if (listMode === "pin" && pinnedSet.size > 0 && !pinnedSet.has(t)) return false;

    // activeMode (PositionBp != 0)
    const posBp = Number(r.PositionBp ?? r.positionBp ?? 0);
    const isActive = posBp !== 0;
    if (activeMode === "onlyActive" && !isActive) return false;
    if (activeMode === "onlyInactive" && isActive) return false;

    // include flags
    if (include.usaOnly) {
      const c = String(r.Country ?? r.country ?? "").trim().toUpperCase();
      // in the terminal it was "USA" check — keep same semantics
      if (c !== "USA") return false;
    }
    if (include.chinaOnly) {
      const c = String(r.Country ?? r.country ?? "").trim().toUpperCase();
      // heuristic: your terminal checks "China/Hong Kong". Keep flexible:
      if (!(c.includes("CHINA") || c.includes("HONG"))) return false;
    }

    // multi selects
    if (countryEnabled && selCountries.size > 0) {
      const c = String(r.Country ?? r.country ?? "").trim().toUpperCase();
      if (!selCountries.has(c)) return false;
    }
    if (exchangeEnabled && selExchanges.size > 0) {
      const e = String(r.Exchange ?? r.exchange ?? "").trim().toUpperCase();
      if (!selExchanges.has(e)) return false;
    }
    if (sectorEnabled && selSectors.size > 0) {
      const s = String(r.SectorL3 ?? r.sectorL3 ?? r.Sector ?? r.sector ?? "").trim().toUpperCase();
      if (!selSectors.has(s)) return false;
    }

    // exclude flags
    if (exclude.dividend) {
      const hasDiv = !!(r.HasDividend ?? r.hasDividend);
      if (hasDiv) return false;
    }
    if (exclude.news) {
      const cnt = Number(r.LstClsNewsCnt ?? r.newsCount ?? r.NewsCount ?? 0);
      if (cnt > 0) return false;
    }
    if (exclude.ptp) {
      const isPTP = !!(r.IsPTP ?? r.isPTP);
      if (isPTP) return false;
    }
    if (exclude.ssr) {
      const isSSR = !!(r.IsSSR ?? r.isSSR);
      if (isSSR) return false;
    }
    if (exclude.report) {
      const hasRep = !!(r.HasReport ?? r.hasReport);
      if (hasRep) return false;
    }
    if (exclude.etf) {
      const isEtf = !!(r.IsETF ?? r.isETF);
      if (isEtf) return false;
    }
    if (exclude.crap) {
      const lastClose = Number(r.LstCls ?? r.LastClose ?? r.lastClose ?? 0);
      if (lastClose < 5) return false;
    }

    // report tri-state
    if (reportMode !== null) {
      const hasRep = !!(r.HasReport ?? r.hasReport);
      if (hasRep !== reportMode) return false;
    }

    // equity type substring
    if (equityNeedle) {
      const et = String(r.EquityType ?? r.equityType ?? "").trim();
      if (!includesNeedle(et, equityNeedle)) return false;
    }

    // numeric bounds
    for (const [k, mm] of Object.entries(bounds)) {
      const v = (r as any)[k];
      if (!passMinMax(v, mm as MinMax)) return false;
    }

    // ZAP / SigmaZAP logic
    // We assume row can have: Zap, SigmaZap (or zap/sigmaZap), and Direction "up"/"down" or +1/-1.
    if (zapMode !== "off") {
      const dirRaw = (r.Direction ?? r.direction ?? "").toString().toLowerCase();
      const isDown = dirRaw === "down" || dirRaw === "short" || dirRaw === "-1";
      const isUp = dirRaw === "up" || dirRaw === "long" || dirRaw === "1";

      const zapVal = Number(r.Zap ?? r.zap ?? 0);
      const sigVal = Number(r.SigmaZap ?? r.sigmaZap ?? r.SigZap ?? 0);

      if (zapMode === "zap") {
        if (isDown) {
          if (!(zapVal <= -zapThr)) return false;
        } else if (isUp) {
          if (!(zapVal >= zapThr)) return false;
        } else {
          // if direction unknown, keep row (or drop). Terminal uses direction; we keep to avoid over-dropping.
        }
      }

      if (zapMode === "sigma") {
        if (isDown) {
          if (!(sigVal <= -sigThr)) return false;
        } else if (isUp) {
          if (!(sigVal >= sigThr)) return false;
        }
      }
    }

    return true;
  });
}