import type { ArbitrageFilterConfigV1, MinMax, ReportMode, ZapMode } from "@/lib/filters/arbitrageFilterConfigV1";
import { parseReportDateAffectsTodaySession, rowReportClassification } from "@/lib/filters/reportTiming";

type AnyRow = Record<string, any>;

const BOUND_ALIASES: Partial<Record<string, string[]>> = {
  ADV20: ["ADV20", "adv20", "Adv20"],
  ADV20NF: ["ADV20NF", "adv20NF", "Adv20NF"],
  ADV90: ["ADV90", "adv90", "Adv90", "avg90", "Avg90"],
  ADV90NF: ["ADV90NF", "adv90NF", "Adv90NF"],
  AvPreMhv: ["AvPreMhv", "avPreMhv", "AvPreMh", "avPreMh", "avPreMhv"],
  RoundLot: ["RoundLot", "roundLot"],
  VWAP: ["VWAP", "vwap"],
  SpreadBidPct: ["SpreadBid%", "spreadBidPct", "SpreadBidPct", "Spread", "spread"],
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
  PreMhBidLstPrcPct: ["PreMhHiLstPrcΔ%", "PreMhHiLstPrcPct", "preMhHiLstPrcPct", "PreMhBidLstPrcΔ%", "PreMhBidLstPrcPct", "preMhBidLstPrcPct"],
  PreMhLoLstPrcPct: ["PreMhLoLstPrcΔ%", "PreMhLoLstPrcPct", "preMhLoLstPrcPct"],
  PreMhHiLstClsPct: ["PreMhHiLstClsΔ%", "PreMhHiLstClsPct", "preMhHiLstClsPct"],
  PreMhLoLstClsPct: ["PreMhLoLstClsΔ%", "PreMhLoLstClsPct", "preMhLoLstClsPct"],
  LstPrcLstClsPct: ["LstPrcLstClsΔ%", "LstPrcLstClsPct", "lstPrcLstClsPct", "LstPrcLstClsDeltaPct"],
  ImbExch925: ["ImbExch9:25", "ImbExch925", "imbExch925"],
  ImbExch1555: ["ImbExch15:55", "ImbExch1555", "imbExch1555"],
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

function readRowBool(value: any): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off", "-", "null", "undefined"].includes(s)) return false;
  return null;
}

function parseReportTextAsToday(value: any): boolean | null {
  const byDate = parseReportDateAffectsTodaySession(value);
  if (byDate != null) return byDate;

  const normalized = readRowBool(value);
  if (normalized != null) return normalized;
  return null;
}

/** true / false, or null when the row carries no report field at all (unknown => rejected). */
function readTodayReportBool(row: AnyRow): boolean | null {
  return rowReportClassification(row, null);
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

function getField(row: AnyRow, key: string): any {
  const v = row[key];
  if (v !== undefined && v !== null && v !== "") return v;
  return row.meta?.[key];
}

function getBoundValue(row: AnyRow, key: string): any {
  const aliases = BOUND_ALIASES[key];
  const sources = aliases && aliases.length > 0 ? aliases : [key];
  for (const alias of sources) {
    const value = row[alias];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  for (const alias of sources) {
    const value = row.meta?.[alias];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
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
    // THE RULE, on every filter here: a row that lacks the field the filter reads is REJECTED.
    // News and dividend are the only exceptions - the feed carries them only when there is one.
    const posRaw = getField(r, "PositionBp") ?? getField(r, "positionBp");
    const posBp = posRaw == null || posRaw === "" ? NaN : Number(posRaw);
    if (activeMode !== "off" && !isFinite(posBp)) return false;
    const isActive = isFinite(posBp) && posBp !== 0;
    if (activeMode === "onlyActive" && !isActive) return false;
    if (activeMode === "onlyInactive" && isActive) return false;

    // include flags
    if (include.usaOnly) {
      const c = getField(r, "Country") ?? getField(r, "country");
      if (c == null || String(c).trim() === "") return false;
      const cu = String(c).trim().toUpperCase();
      const isUsa = cu === "USA" || cu === "US" || cu.startsWith("UNITED STATES");
      if (!isUsa) return false;
    }
    if (include.chinaOnly) {
      const c = getField(r, "Country") ?? getField(r, "country");
      if (c == null || String(c).trim() === "") return false;
      const cu = String(c).trim().toUpperCase();
      if (!(cu.includes("CHINA") || cu.includes("HONG"))) return false;
    }

    // multi selects
    if (countryEnabled && selCountries.size > 0) {
      const cv = getField(r, "Country") ?? getField(r, "country");
      if (cv == null || String(cv).trim() === "") return false;
      const c = String(cv).trim().toUpperCase();
      // Normalize "UNITED STATES" → "USA" for matching
      const cn = (c === "UNITED STATES" || c.startsWith("UNITED STATES ")) ? "USA" : c;
      if (!selCountries.has(cn) && !selCountries.has(c)) return false;
    }
    if (exchangeEnabled && selExchanges.size > 0) {
      const e = String(r.exchange ?? r.Exchange ?? "").trim().toUpperCase();
      if (!selExchanges.has(e)) return false;
    }
    if (sectorEnabled && selSectors.size > 0) {
      const s = String(getField(r, "SectorL3") ?? getField(r, "sectorL3") ?? getField(r, "Sector") ?? getField(r, "sector") ?? "").trim().toUpperCase();
      if (!selSectors.has(s)) return false;
    }

    // exclude flags
    // These mirror the tape (TapeWriter + PaperFilters), so the scanner and the live views judge
    // the same ticker the same way. Two rules run through all of them:
    //   * a flag that is ABSENT does not pass a filter that is switched on — `!!undefined` used to
    //     read "unknown" as "definitely not", which is how a row the scanner dropped stayed
    //     visible here;
    //   * values are parsed with readRowBool rather than JS truthiness, so the string "NO" is
    //     false instead of true.
    // News is the deliberate exception: the tape writes it only when there IS news, so a missing
    // count really means "none" (PaperFilters.ExcludeFlagAbsentMeansNo).
    if (exclude.dividend) {
      // Parsed, not truthy: a raw "0" or "-" used to read as TRUE here and false on the server.
      if (readRowBool(r.HasDividend ?? r.hasDividend ?? r.Dividend ?? r.dividend) === true) return false;
    }
    if (exclude.news) {
      // NewsCnt first, then LstClsNewsCnt — the order TapeWriter derives HasNews from.
      const cnt = Number(
        getField(r, "NewsCnt") ?? getField(r, "newsCnt") ??
        getField(r, "LstClsNewsCnt") ?? getField(r, "newsCount") ??
        getField(r, "NewsCount") ?? getField(r, "news") ?? getField(r, "News") ?? 0
      );
      if (isFinite(cnt) && cnt > 0) return false;
    }
    if (exclude.ptp) {
      if (readRowBool(r.isPtp ?? r.IsPTP ?? r.isPTP) !== false) return false;
    }
    if (exclude.ssr) {
      if (readRowBool(r.isSsr ?? r.IsSSR ?? r.isSSR) !== false) return false;
    }
    if (exclude.report) {
      // Only a row KNOWN not to report survives; no report field is unknown, so it goes too.
      if (readTodayReportBool(r) !== false) return false;
    }
    if (exclude.etf) {
      // EquityType has no counterpart in the tape; it can only exclude MORE, never let an ETF
      // through that the scanner would have dropped, so it stays.
      const eqt = String(getField(r, "EquityType") ?? getField(r, "equityType") ?? "").toLowerCase();
      if (eqt && eqt.includes("etf")) return false;
      if (readRowBool(r.isEtf ?? r.IsETF ?? r.isETF ?? r.etf ?? r.ETF ?? r.IsEtf) !== false) return false;
    }
    if (exclude.crap) {
      // YCls, not LstCls: TapeWriter switched to yesterday's close because the running LstCls is
      // null pre-market, which silently disabled this filter there. Unknown now rejects, so the
      // rule holds before a close exists.
      const yCls = Number(getField(r, "YCls") ?? getField(r, "yCls") ?? getField(r, "YClose") ?? NaN);
      const isCrap = isFinite(yCls) ? yCls < 5 : null;
      if (isCrap !== false) return false;
    }

    // report tri-state
    if (reportMode !== null) {
      const hasRep = readTodayReportBool(r);
      if (hasRep == null || hasRep !== reportMode) return false;
    }

    // equity type substring
    if (equityNeedle) {
      const et = String(getField(r, "EquityType") ?? getField(r, "equityType") ?? "").trim();
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

      // No direction, or no reading to compare, is unknown - rejected (used to be kept "to avoid
      // over-dropping", and a missing reading defaulted to 0).
      if (!isDown && !isUp) return false;
      const rawZap = zapMode === "zap" ? (r.Zap ?? r.zap) : (r.SigmaZap ?? r.sigmaZap ?? r.SigZap);
      const val = rawZap == null || rawZap === "" ? NaN : Number(rawZap);
      if (!isFinite(val)) return false;
      const thr = zapMode === "zap" ? zapThr : sigThr;
      if (isDown && !(val <= -thr)) return false;
      if (isUp && !(val >= thr)) return false;
    }

    return true;
  });
}
