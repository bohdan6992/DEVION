/**
 * The live signal: its shape, the field pickers that read a bridge payload, and the one function
 * that turns that payload into a signal.
 *
 * This code lived inside ArbitrageSonar.tsx, which made a 6k-line strategy COMPONENT the de-facto
 * signal library for the whole app: streamEngine, streamSseHub, streamSignalStore and the
 * Scanner's tapeMetaStore all imported it from there. OpenDoorSonar carried a byte-identical
 * second copy, so the OpenDoor Sonar normalised through its own and the OpenDoor Stream through
 * Arbitrage's — two code paths for one decision. Both copies were verified identical before the
 * move (whitespace-insensitive diff, per block); this is that code, unchanged.
 *
 * Moving it also breaks the import cycle that stopped the Sonars from using the refcounted SSE
 * hub: the hub needs normalizeSignal, and could not take it from a component that would then have
 * to import the hub back.
 *
 * The type is still called ArbitrageSignal because every consumer names it that. It is not
 * Arbitrage-specific — OpenDoor signals use the same shape.
 */

export type ArbitrageSignal = {
  strategy?: string;
  ticker: string;

  benchmark?: string;
  betaBucket?: string | null;
  direction?: "up" | "down" | "none";
  sig?: number | null;

  "BidLstClsΔ%"?: number | string | null;
  "AskLstClsΔ%"?: number | string | null;
  BidLstClsDeltaPct?: number | string | null;
  AskLstClsDeltaPct?: number | string | null;
  Bid?: number | string | null;
  Ask?: number | string | null;

  zapS?: number | null;
  zapSsigma?: number | null;
  zapL?: number | null;
  zapLsigma?: number | null;

  shortCandidate?: boolean;
  longCandidate?: boolean;

  bidStock?: number | null;
  askStock?: number | null;
  bidBench?: number | null;
  askBench?: number | null;

  account?: string;
  Account?: string;

  country?: string;
  Country?: string;
  exchange?: string;
  Exchange?: string;
  sector?: string;
  Sector?: string;

  company?: string;
  Company?: string;
  SectorL3?: string;

  vol?: number | string;
  Vol?: number | string;
  spread?: number | string;
  Spread?: number | string;
  lstClose?: number | string;
  lastClose?: number | string;
  close?: number | string;

  isPTP?: any;
  IsPTP?: any;
  ptp?: any;
  PTP?: any;
  isSSR?: any;
  IsSSR?: any;
  ssr?: any;
  SSR?: any;

  report?: any;
  Report?: any;

  isStaticFallback?: boolean;
  IsStaticFallback?: boolean;

  active?: any;
  Active?: any;
  isActive?: any;
  IsActive?: any;

  avg90?: number | string;
  Avg90?: number | string;
  avPreMh?: number | string;
  AvPreMh?: number | string;

  news?: number | string;
  News?: number | string;
  newsCount?: number | string;
  NewsCount?: number | string;

  kind?: "hard" | "soft" | "any";

  // normalized helpers (internal)
  _bestRating?: number | null;
  _bestTotal?: number | null;
  _bestHard?: number | null;
  _bestSoft?: number | null;
  _reportBool?: boolean | null;
  _newsCount?: number;
  _isPTP?: boolean | null;
  _isSSR?: boolean | null;
  _isActive?: boolean | null;

  [k: string]: any;
};

export const toNum = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/\u2212/g, "-")
    .replace(/[%\s]/g, "")
    .replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

export const toBool = (v: any): boolean | null => {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
};

export const hasValue = (v: any): boolean => {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s.length > 0 && !["false", "0", "no", "null", "undefined"].includes(s);
};

export function normalizeTicker(raw: string): string | null {
  const tk = (raw || "").trim().toUpperCase().replace(/"/g, "");
  if (!tk) return null;
  if (!/^[A-Z0-9.\-]+$/.test(tk)) return null;
  return tk;
}

export const getMeta = (d: any) => d?.meta ?? d?.Meta ?? null;
export const getBestObj = (d: any) => d?.best ?? d?.Best ?? null;

export const pick = (obj: any, keys: string[]) => {
  if (!obj || typeof obj !== "object") return undefined;
  const isUsableValue = (value: any) => {
    if (value === undefined || value === null) return false;
    if (typeof value !== "string") return true;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed === "-" || trimmed === "—") return false;
    return true;
  };
  for (const k of keys) {
    const v = obj?.[k];
    if (isUsableValue(v)) return v;
  }
  const normalizeFieldKey = (value: string) =>
    value
      .normalize("NFKD")
      .replaceAll("Δ", " delta ")
      .replace(/Δ|∆/g, " delta ")
      .replace(/%/g, " percent ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => {
        if (token === "delta" || token === "percent" || token === "pct" || token === "pcnt") return "pct";
        return token;
      })
      .filter((token, index, arr) => !(token === "pct" && arr[index - 1] === "pct"))
      .join("");

  const keyMap = new Map<string, any>();
  for (const [rawKey, rawValue] of Object.entries(obj)) {
    if (!isUsableValue(rawValue)) continue;
    const normalized = normalizeFieldKey(String(rawKey));
    if (!keyMap.has(normalized)) keyMap.set(normalized, rawValue);
  }

  for (const k of keys) {
    const normalized = normalizeFieldKey(k);
    if (keyMap.has(normalized)) return keyMap.get(normalized);
  }
  return undefined;
};

export const pickAny = (d: any, keys: string[]) => {
  const meta = getMeta(d);
  const v1 = pick(d, keys);
  if (v1 !== undefined) return v1;
  const v2 = pick(meta, keys);
  if (v2 !== undefined) return v2;
  return undefined;
};

export const getStrAny = (d: any, keys: string[], fallback = "") => String(pickAny(d, keys) ?? fallback).trim();
export const getNumAny = (d: any, keys: string[]) => toNum(pickAny(d, keys));
export const getBoolAny = (d: any, keys: string[]) => toBool(pickAny(d, keys));

export const numSpreadBidPct = (s: any) => getNumAny(s, ["SpreadBid%", "spreadBidPct", "SpreadBidPct", "Spread", "spread"]);
export const numLastClose = (s: any) =>
  getNumAny(s, ["LstCls", "lstCls", "lstclose", "lstClose", "lastClose", "LastClose", "lastclose", "YCls", "yCls", "YClose", "yClose", "TCls", "tCls", "TClose", "tClose", "close", "Close"]);

export const numAvPreMh = (s: any) => getNumAny(s, ["avPreMh", "AvPreMh", "avPreMhv", "AvPreMhv", "PreMhVol", "preMhVol"]);
export const numMarketCapM = (s: any) => getNumAny(s, ["marketCapM", "MarketCapM", "market_cap_m", "market_cap", "MarketCap"]);
export const PRE_MH_VOL_NF_KEYS = ["preMktVolNF", "PreMktVolNF", "preMhVolNF", "PreMhVolNF", "pre_mkt_vol_nf", "premktVolNF", "PremktVolNF"];
export const VOL_NF_FROM_LST_CLS_KEYS = ["VolNFFromLstCls", "volNFFromLstCls", "volnffromlstcls", "VolNFfromLstCls", "volNFfromLstCls", "vol_nf_from_lst_cls"];
export const numPreMktVolNF = (s: any) =>
  getNumAny(s, PRE_MH_VOL_NF_KEYS);
export const numVWAP = (s: any) => getNumAny(s, ["vwap", "VWAP"]);
export const numRoundLot = (s: any) => getNumAny(s, ["roundLot", "RoundLot"]);
export const numADV20 = (s: any) => getNumAny(s, ["adv20", "ADV20", "Adv20"]);
export const numADV20NF = (s: any) => getNumAny(s, ["adv20NF", "ADV20NF", "Adv20NF"]);
export const numADV90 = (s: any) => getNumAny(s, ["adv90", "ADV90", "Adv90", "avg90", "Avg90"]);
export const numADV90NF = (s: any) => getNumAny(s, ["adv90NF", "ADV90NF", "Adv90NF"]);
export const numLstPrcL = (s: any) => getNumAny(s, ["lstPrcL", "LstPrcL", "lastPriceL", "LastPriceL", "lstPrc", "LstPrc"]);
export const numYCls = (s: any) => getNumAny(s, ["yCls", "YCls", "yClose", "YClose"]);
export const numTCls = (s: any) => getNumAny(s, ["tCls", "TCls", "tClose", "TClose"]);
export const numClsToClsPct = (s: any) =>
  getNumAny(s, ["ClsToCls%", "clsToCls%", "clsToClsPct", "ClsToClsPct", "ClsToClsPcnt", "clsToClsPcnt"]);
export const numLo = (s: any) => getNumAny(s, ["lo", "Lo", "low", "Low"]);
export const numLstClsNewsCnt = (s: any) => getNumAny(s, ["LstClsNewsCnt", "lstClsNewsCnt", "lstClsNewsCount", "LstClsNewsCount"]);
export const numVolRel = (s: any) => getNumAny(s, ["VolRel", "volRel", "vol_rel"]);
export const AV_PRE_MH_VOL_90_NF_KEYS = ["AvPreMhVol90NF", "avPreMhVol90NF", "avpremhvol90nf", "av_pre_mh_vol_90_nf"];
export const AV_PRE_MH_VALUE_20_NF_KEYS = ["AvPreMhValue20NF", "avPreMhValue20NF", "avpremhvalue20nf", "av_pre_mh_value_20_nf"];
export const AV_PRE_MH_VALUE_90_NF_KEYS = ["AvPreMhValue90NF", "avPreMhValue90NF", "avpremhvalue90nf", "av_pre_mh_value_90_nf"];
export const AVG_DAILY_VALUE_20_KEYS = ["AvgDailyValue20", "avgDailyValue20", "avgdailyvalue20", "avg_daily_value_20"];
export const AVG_DAILY_VALUE_90_KEYS = ["AvgDailyValue90", "avgDailyValue90", "avgdailyvalue90", "avg_daily_value_90"];
export const VOLATILITY_20_KEYS = ["Volatility20", "volatility20", "volatility_20", "Volatility20%", "volatility20%", "Volatility20Pct", "volatility20Pct", "volatility20pct"];
export const VOLATILITY_90_KEYS = ["Volatility90", "volatility90", "volatility_90", "Volatility90%", "volatility90%", "Volatility90Pct", "volatility90Pct", "volatility90pct"];
export const PRE_MH_MDV_20_NF_KEYS = ["PreMhMDV20NF", "preMhMDV20NF", "premhmdv20nf", "pre_mh_mdv_20_nf", "PreMktMDV20NF", "preMktMDV20NF"];
export const PRE_MH_MDV_90_NF_KEYS = ["PreMhMDV90NF", "preMhMDV90NF", "premhmdv90nf", "pre_mh_mdv_90_nf", "PreMktMDV90NF", "preMktMDV90NF"];
export const numPreMhBidLstPrcPct = (s: any) =>
  getNumAny(s, ["PreMhHiLstPrcΔ%", "PreMhHiLstPrcÎ”%", "PreMhHiLstPrcPct", "preMhHiLstPrcPct", "PreMhBidLstPrcΔ%", "PreMhBidLstPrcÎ”%", "PreMhBidLstPrcPct", "preMhBidLstPrcPct"]);
export const numPreMhLoLstPrcPct = (s: any) =>
  getNumAny(s, ["PreMhLoLstPrcΔ%", "PreMhLoLstPrcÎ”%", "PreMhLoLstPrcPct", "preMhLoLstPrcPct"]);
export const numPreMhHiLstClsPct = (s: any) =>
  getNumAny(s, ["PreMhHiLstClsΔ%", "PreMhHiLstClsÎ”%", "PreMhHiLstClsPct", "preMhHiLstClsPct"]);
export const numPreMhLoLstClsPct = (s: any) =>
  getNumAny(s, ["PreMhLoLstClsΔ%", "PreMhLoLstClsÎ”%", "PreMhLoLstClsPct", "preMhLoLstClsPct"]);
export const numLstPrcLstClsPct = (s: any) =>
  getNumAny(s, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsPct", "lstPrcLstClsPct"]);
export const numImbExch925 = (s: any) => getNumAny(s, ["ImbExch9:25", "ImbExch925", "imbExch925"]);
export const numImbExch1555 = (s: any) => getNumAny(s, ["ImbExch15:55", "ImbExch1555", "imbExch1555"]);
export const numLstPrcLstClsPctSafe = (s: any) =>
  getNumAny(s, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsÃŽâ€%", "LstPrcLstClsPct", "LstPrcLstClsDeltaPct", "lstPrcLstClsPct"]);
export const numAvPostMhVol90NF = (s: any) =>
  getNumAny(s, ["AvPostMhVol90NF", "avPostMhVol90NF"]);
export const deriveValueFromPrice = (volumeLike: number | null, priceLike: number | null) =>
  volumeLike != null && priceLike != null ? volumeLike * priceLike : null;
export const numAvPreMhVol90NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VOL_90_NF_KEYS) ?? numAvPreMh(s);
export const numAvPreMhValue20NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VALUE_20_NF_KEYS);
export const numAvPreMhValue90NF = (s: any) =>
  getNumAny(s, AV_PRE_MH_VALUE_90_NF_KEYS) ?? deriveValueFromPrice(numAvPreMhVol90NF(s), numLastClose(s));
export const numAvgDailyValue20 = (s: any) =>
  getNumAny(s, AVG_DAILY_VALUE_20_KEYS) ?? deriveValueFromPrice(numADV20NF(s), numLastClose(s));
export const numAvgDailyValue90 = (s: any) =>
  getNumAny(s, AVG_DAILY_VALUE_90_KEYS) ?? deriveValueFromPrice(numADV90NF(s), numLastClose(s));
export const numVolatility20 = (s: any) =>
  getNumAny(s, VOLATILITY_20_KEYS);
export const numVolatility90 = (s: any) =>
  getNumAny(s, VOLATILITY_90_KEYS);
export const numPreMhMDV20NF = (s: any) =>
  getNumAny(s, PRE_MH_MDV_20_NF_KEYS);
export const numPreMhMDV90NF = (s: any) =>
  getNumAny(s, PRE_MH_MDV_90_NF_KEYS);

export const numVolNFfromLstCls = (s: any) => getNumAny(s, VOL_NF_FROM_LST_CLS_KEYS);

export function normalizeSignal(raw: any): ArbitrageSignal | null {
  if (!raw) return null;

  const ticker = normalizeTicker(String(raw.ticker ?? raw.Ticker ?? ""));
  if (!ticker) return null;

  const meta = raw?.meta ?? raw?.Meta ?? null;

  const benchmark = String(raw.benchmark ?? raw.Benchmark ?? raw.bench ?? raw.Bench ?? meta?.bench ?? meta?.benchmark ?? "UNKNOWN").toUpperCase();
  const betaBucket =
    raw.betaBucket ?? raw.BetaBucket ?? raw.beta_bucket ?? raw.beta_bucket_str ?? meta?.betaBucket ?? meta?.BetaBucket ?? null;

  const sideStr = String(raw.side ?? raw.Side ?? raw.dir ?? raw.Dir ?? raw.direction ?? raw.Direction ?? "")
    .toLowerCase()
    .trim();

  let direction: "up" | "down" | "none" = "none";
  if (sideStr.includes("short") || sideStr === "s" || sideStr === "sell" || sideStr === "down") direction = "down";
  else if (sideStr.includes("long") || sideStr === "l" || sideStr === "buy" || sideStr === "up") direction = "up";
  else {
    const dirRaw = String(raw.direction ?? raw.Direction ?? meta?.direction ?? meta?.Direction ?? "")
      .trim()
      .toLowerCase();
    if (dirRaw === "up" || dirRaw === "long" || dirRaw === "buy") direction = "up";
    else if (dirRaw === "down" || dirRaw === "short" || dirRaw === "sell") direction = "down";
  }

  const sig =
    (typeof raw.sig === "number" ? raw.sig : null) ??
    (typeof raw.sigma === "number" ? raw.sigma : null) ??
    (typeof raw.devSigma === "number" ? raw.devSigma : null) ??
    (typeof raw.dev_sigma === "number" ? raw.dev_sigma : null) ??
    null;

  const zapS = typeof raw.zapS === "number" ? raw.zapS : typeof raw.zap_s === "number" ? raw.zap_s : null;
  const zapL = typeof raw.zapL === "number" ? raw.zapL : typeof raw.zap_l === "number" ? raw.zap_l : null;

  const kindStr = String(raw.type ?? raw.Type ?? raw.kind ?? raw.Kind ?? raw.normType ?? "")
    .toLowerCase()
    .trim();
  const kind: "hard" | "soft" | "any" = kindStr.includes("hard") ? "hard" : kindStr.includes("soft") ? "soft" : "any";

  const shortCandidate = !!(raw.shortCandidate ?? raw.ShortCandidate ?? raw.isShort ?? raw.short ?? false);
  const longCandidate = !!(raw.longCandidate ?? raw.LongCandidate ?? raw.isLong ?? raw.long ?? false);
  if (direction === "none") {
    if (shortCandidate && !longCandidate) direction = "down";
    else if (longCandidate && !shortCandidate) direction = "up";
  }

  const bidStock = toNum(raw.bidStock ?? meta?.bidStock);
  const askStock = toNum(raw.askStock ?? meta?.askStock);
  const bidBench = toNum(raw.bidBench ?? meta?.bidBench);
  const askBench = toNum(raw.askBench ?? meta?.askBench);

  const zapSsigma = toNum(raw.zapSsigma ?? meta?.zapSsigma);
  const zapLsigma = toNum(raw.zapLsigma ?? meta?.zapLsigma);

  const best = raw?.best ?? raw?.Best ?? null;

  const _bestRating = toNum(best?.rating ?? best?.Rating);
  const _bestTotal = toNum(best?.total ?? best?.Total);
  const _bestHard = toNum(best?.hard ?? best?.Hard);
  const _bestSoft = toNum(best?.soft ?? best?.Soft);

  const _reportBool = (() => {
    const s = String(meta?.report ?? raw?.report ?? raw?.Report ?? "").trim().toLowerCase();
    if (["yes", "y", "true", "1"].includes(s)) return true;
    if (["no", "n", "false", "0"].includes(s)) return false;
    return null;
  })();

  // The feed sends `meta.NewsCnt` / `meta.LstClsNewsCnt` — capitalised. Only the camel-case
  // spellings were read here, so this was 0 for every signal and the NEWS toggle removed nothing
  // on any live surface, while the scanner (TapeWriter: HasNews = (NewsCnt ?? LstClsNewsCnt) > 0)
  // removed every name with news. Same precedence as the tape now: today's count, then since close.
  const _newsCount =
    toNum(
      meta?.NewsCnt ?? meta?.newsCnt ?? meta?.newsCount ?? meta?.news ??
      raw?.NewsCnt ?? raw?.newsCnt ?? raw?.news ?? raw?.newsCount ?? raw?.NewsCount ??
      meta?.LstClsNewsCnt ?? meta?.lstClsNewsCnt ?? raw?.LstClsNewsCnt,
    ) ?? 0;

  const _isPTP = toBool(raw?.isPtp ?? raw?.isPTP ?? raw?.IsPTP ?? meta?.isPtp ?? meta?.isPTP ?? meta?.IsPTP);
  const _isSSR = toBool(raw?.isSsr ?? raw?.isSSR ?? raw?.IsSSR ?? meta?.isSsr ?? meta?.isSSR ?? meta?.IsSSR);
  const _isActive = toBool(raw?.active ?? raw?.isActive ?? raw?.IsActive ?? meta?.active ?? meta?.isActive ?? meta?.IsActive);
  const _positionBp = toNum(
    raw?.PositionBp ??
    raw?.positionBp ??
    raw?.position_bp ??
    raw?.posBp ??
    raw?.PosBp ??
    meta?.PositionBp ??
    meta?.positionBp ??
    meta?.position_bp ??
    meta?.posBp ??
    meta?.PosBp ??
    raw?.PositionBpAbs ??
    raw?.positionBpAbs ??
    meta?.PositionBpAbs ??
    meta?.positionBpAbs
  );

  const canonical = { ...raw, meta };
  const volRel = numVolRel(canonical);
  const preMhVolNF = numPreMktVolNF(canonical);
  const volNFfromLstCls = numVolNFfromLstCls(canonical);
  const avPostMhVol90NF = numAvPostMhVol90NF(canonical);
  const avPreMhVol90NF = numAvPreMhVol90NF(canonical);
  const avPreMhValue20NF = numAvPreMhValue20NF(canonical);
  const avPreMhValue90NF = numAvPreMhValue90NF(canonical);
  const avgDailyValue20 = numAvgDailyValue20(canonical);
  const avgDailyValue90 = numAvgDailyValue90(canonical);
  const volatility20 = numVolatility20(canonical);
  const volatility90 = numVolatility90(canonical);
  const preMhMDV20NF = numPreMhMDV20NF(canonical);
  const preMhMDV90NF = numPreMhMDV90NF(canonical);
  const preMhBidLstPrcPct = getNumAny(canonical, ["PreMhHiLstPrcΔ%", "PreMhHiLstPrcÎ”%", "PreMhHiLstPrcPct", "preMhHiLstPrcPct", "PreMhBidLstPrcΔ%", "PreMhBidLstPrcÎ”%", "PreMhBidLstPrcPct", "preMhBidLstPrcPct"]);
  const preMhLoLstPrcPct = getNumAny(canonical, ["PreMhLoLstPrcΔ%", "PreMhLoLstPrcÎ”%", "PreMhLoLstPrcPct", "preMhLoLstPrcPct"]);
  const preMhHiLstClsPct = getNumAny(canonical, ["PreMhHiLstClsΔ%", "PreMhHiLstClsÎ”%", "PreMhHiLstClsPct", "preMhHiLstClsPct"]);
  const preMhLoLstClsPct = getNumAny(canonical, ["PreMhLoLstClsΔ%", "PreMhLoLstClsÎ”%", "PreMhLoLstClsPct", "preMhLoLstClsPct"]);
  const lstPrcLstClsPct = getNumAny(canonical, ["LstPrcLstClsΔ%", "LstPrcLstClsÎ”%", "LstPrcLstClsPct", "LstPrcLstClsDeltaPct", "lstPrcLstClsPct"]);
  const imbExch925 = getNumAny(canonical, ["ImbExch9:25", "ImbExch925", "imbExch925"]);
  const imbExch1555 = getNumAny(canonical, ["ImbExch15:55", "ImbExch1555", "imbExch1555"]);

  // make sure these exist at top-level for filters/options
  const country = raw?.country ?? raw?.Country ?? meta?.country ?? meta?.Country ?? undefined;
  const exchange = raw?.exchange ?? raw?.Exchange ?? meta?.exchange ?? meta?.Exchange ?? undefined;
  const sector = raw?.sector ?? raw?.Sector ?? meta?.sector ?? meta?.Sector ?? meta?.sectorL3 ?? meta?.SectorL3 ?? undefined;

  return {
    ...raw,
    meta,

    ticker,
    benchmark,
    betaBucket: betaBucket == null ? null : String(betaBucket),
    direction,
    sig,
    zapS,
    zapSsigma,
    zapL,
    zapLsigma,
    shortCandidate,
    longCandidate,
    kind,
    bidStock,
    askStock,
    bidBench,
    askBench,
    PositionBp: _positionBp,
    positionBp: _positionBp,

    country,
    exchange,
    sector,
    PreMktVolNF: preMhVolNF,
    PreMhVolNF: preMhVolNF,
    VolNFfromLstCls: volNFfromLstCls,
    VolRel: volRel,
    AvPostMhVol90NF: avPostMhVol90NF,
    AvPreMhVol90NF: avPreMhVol90NF,
    AvPreMhValue20NF: avPreMhValue20NF,
    AvPreMhValue90NF: avPreMhValue90NF,
    AvgDailyValue20: avgDailyValue20,
    AvgDailyValue90: avgDailyValue90,
    Volatility20: volatility20,
    Volatility90: volatility90,
    PreMhMDV20NF: preMhMDV20NF,
    PreMhMDV90NF: preMhMDV90NF,
    PreMhBidLstPrcPct: preMhBidLstPrcPct,
    PreMhLoLstPrcPct: preMhLoLstPrcPct,
    PreMhHiLstClsPct: preMhHiLstClsPct,
    PreMhLoLstClsPct: preMhLoLstClsPct,
    LstPrcLstClsPct: lstPrcLstClsPct,
    ImbExch925: imbExch925,
    ImbExch1555: imbExch1555,

    _bestRating,
    _bestTotal,
    _bestHard,
    _bestSoft,
    _reportBool,
    _newsCount,
    _isPTP,
    _isSSR,
    _isActive,
    isStaticFallback: !!(raw.isStaticFallback ?? raw.IsStaticFallback ?? false),
  };
}
