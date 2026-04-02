import type { ArbitrageFilterConfigV1, MinMax, ReportMode, ZapMode } from "@/lib/filters/arbitrageFilterConfigV1";

type AnyRow = Record<string, any>;

const BOUND_ALIASES: Partial<Record<string, string[]>> = {
  ADV20: ["ADV20", "adv20", "Adv20"],
  ADV20NF: ["ADV20NF", "adv20NF", "Adv20NF"],
  ADV90: ["ADV90", "adv90", "Adv90", "avg90", "Avg90"],
  ADV90NF: ["ADV90NF", "adv90NF", "Adv90NF"],
  AvPreMhv: ["AvPreMhv", "avPreMhv", "AvPreMh", "avPreMh", "avPreMhv"],
  RoundLot: ["RoundLot", "roundLot"],
  VWAP: ["VWAP", "vwap"],
  Spread: ["Spread", "spread"],
  LstPrcL: ["LstPrcL", "lstPrcL", "LastPriceL", "lastPriceL", "LstPrc", "lstPrc"],
  LstCls: ["LstCls", "lstCls", "LastClose", "lastClose", "YCls", "yCls", "YClose", "yClose", "TCls", "tCls", "TClose", "tClose", "Close", "close"],
  YCls: ["YCls", "yCls", "YClose", "yClose"],
  TCls: ["TCls", "tCls", "TClose", "tClose"],
  ClsToClsPct: ["ClsToClsPct", "clsToClsPct", "ClsToCls%", "clsToCls%", "ClsToClsPcnt", "clsToClsPcnt"],
  Lo: ["Lo", "lo", "Low", "low"],
  LstClsNewsCnt: ["LstClsNewsCnt", "lstClsNewsCnt", "LstClsNewsCount", "lstClsNewsCount"],
  MarketCapM: ["MarketCapM", "marketCapM", "market_cap_m", "market_cap", "MarketCap"],
  PreMhVolNF: ["PreMhVolNF", "preMhVolNF", "PreMktVolNF", "preMktVolNF", "pre_mkt_vol_nf", "premktVolNF", "PremktVolNF"],
  VolNFfromLstCls: ["VolNFfromLstCls", "volNFfromLstCls", "VolNFFromLstCls", "volNFFromLstCls", "volnffromlstcls", "vol_nf_from_lst_cls"],
  AvPostMhVol90NF: ["AvPostMhVol90NF", "avPostMhVol90NF"],
  AvPreMhVol90NF: ["AvPreMhVol90NF", "avPreMhVol90NF", "avpremhvol90nf", "av_pre_mh_vol_90_nf"],
  AvPreMhValue20NF: ["AvPreMhValue20NF", "avPreMhValue20NF", "avpremhvalue20nf", "av_pre_mh_value_20_nf"],
  AvPreMhValue90NF: ["AvPreMhValue90NF", "avPreMhValue90NF", "avpremhvalue90nf", "av_pre_mh_value_90_nf"],
  AvgDailyValue20: ["AvgDailyValue20", "avgDailyValue20", "avgdailyvalue20", "avg_daily_value_20"],
  AvgDailyValue90: ["AvgDailyValue90", "avgDailyValue90", "avgdailyvalue90", "avg_daily_value_90"],
  Volatility20: ["Volatility20", "volatility20", "volatility_20", "Volatility20%", "volatility20%", "Volatility20Pct", "volatility20Pct", "volatility20pct"],
  Volatility90: ["Volatility90", "volatility90", "volatility_90", "Volatility90%", "volatility90%", "Volatility90Pct", "volatility90Pct", "volatility90pct"],
  PreMhMDV20NF: ["PreMhMDV20NF", "preMhMDV20NF", "premhmdv20nf", "pre_mh_mdv_20_nf", "PreMktMDV20NF", "preMktMDV20NF"],
  PreMhMDV90NF: ["PreMhMDV90NF", "preMhMDV90NF", "premhmdv90nf", "pre_mh_mdv_90_nf", "PreMktMDV90NF", "preMktMDV90NF"],
  VolRel: ["VolRel", "volRel", "vol_rel"],
};

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

function getBoundValue(row: AnyRow, key: string): any {
  const aliases = BOUND_ALIASES[key];
  if (!aliases || aliases.length === 0) return row[key];
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return row[key];
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
      const v = getBoundValue(r, k);
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
