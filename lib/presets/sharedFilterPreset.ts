export const SHARED_FILTER_PRESET_KIND = "ARBITRAGE_SHARED_FILTERS";
export const SHARED_FILTER_PRESET_API_KIND = "ARBITRAGE";

export type SharedFilterPresetMode = "on" | "off";

export const SHARED_FILTER_PRESET_FIELDS = [
  { key: "corr", scannerMin: "minCorr", scannerMax: "maxCorr", sonarMode: "Corr", sonarMin: "corrMin", sonarMax: "corrMax" },
  { key: "beta", scannerMin: "minBeta", scannerMax: "maxBeta", sonarMode: "Beta", sonarMin: "betaMin", sonarMax: "betaMax" },
  { key: "sigma", scannerMin: "minSigma", scannerMax: "maxSigma", sonarMode: "Sigma", sonarMin: "sigmaMin", sonarMax: "sigmaMax" },
  { key: "adv20", scannerMin: "minAdv20", scannerMax: "maxAdv20", sonarMode: "ADV20", sonarMin: "adv20Min", sonarMax: "adv20Max" },
  { key: "adv20nf", scannerMin: "minAdv20NF", scannerMax: "maxAdv20NF", sonarMode: "ADV20NF", sonarMin: "adv20NFMin", sonarMax: "adv20NFMax" },
  { key: "adv90", scannerMin: "minAdv90", scannerMax: "maxAdv90", sonarMode: "ADV90", sonarMin: "adv90Min", sonarMax: "adv90Max" },
  { key: "adv90nf", scannerMin: "minAdv90NF", scannerMax: "maxAdv90NF", sonarMode: "ADV90NF", sonarMin: "adv90NFMin", sonarMax: "adv90NFMax" },
  { key: "avpremhv", scannerMin: "minAvPreMhv", scannerMax: "maxAvPreMhv", sonarMode: "AvPreMhv", sonarMin: "avPreMhvMin", sonarMax: "avPreMhvMax" },
  { key: "roundlot", scannerMin: "minRoundLot", scannerMax: "maxRoundLot", sonarMode: "RoundLot", sonarMin: "roundLotMin", sonarMax: "roundLotMax" },
  { key: "vwap", scannerMin: "minVWAP", scannerMax: "maxVWAP", sonarMode: "VWAP", sonarMin: "vwapMin", sonarMax: "vwapMax" },
  { key: "spread", scannerMin: "minSpread", scannerMax: "maxSpread", sonarMode: "Spread", sonarMin: "spreadMin", sonarMax: "spreadMax" },
  { key: "lstprcl", scannerMin: "minLstPrcL", scannerMax: "maxLstPrcL", sonarMode: "LstPrcL", sonarMin: "lstPrcLMin", sonarMax: "lstPrcLMax" },
  { key: "lstcls", scannerMin: "minLstCls", scannerMax: "maxLstCls", sonarMode: "LstCls", sonarMin: "lstClsMin", sonarMax: "lstClsMax" },
  { key: "ycls", scannerMin: "minYCls", scannerMax: "maxYCls", sonarMode: "YCls", sonarMin: "yClsMin", sonarMax: "yClsMax" },
  { key: "tcls", scannerMin: "minTCls", scannerMax: "maxTCls", sonarMode: "TCls", sonarMin: "tClsMin", sonarMax: "tClsMax" },
  { key: "clstocls", scannerMin: "minClsToClsPct", scannerMax: "maxClsToClsPct", sonarMode: "ClsToClsPct", sonarMin: "clsToClsPctMin", sonarMax: "clsToClsPctMax" },
  { key: "lo", scannerMin: "minLo", scannerMax: "maxLo", sonarMode: "Lo", sonarMin: "loMin", sonarMax: "loMax" },
  { key: "lstclsnewscnt", scannerMin: "minLstClsNewsCnt", scannerMax: "maxLstClsNewsCnt", sonarMode: "LstClsNewsCnt", sonarMin: "lstClsNewsCntMin", sonarMax: "lstClsNewsCntMax" },
  { key: "marketcapm", scannerMin: "minMarketCapM", scannerMax: "maxMarketCapM", sonarMode: "MarketCapM", sonarMin: "marketCapMMin", sonarMax: "marketCapMMax" },
  { key: "premhvolnf", scannerMin: "minPreMktVolNF", scannerMax: "maxPreMktVolNF", sonarMode: "PreMhVolNF", sonarMin: "preMhVolNFMin", sonarMax: "preMhVolNFMax" },
  { key: "volnffromlstcls", scannerMin: "minVolNFfromLstCls", scannerMax: "maxVolNFfromLstCls", sonarMode: "VolNFfromLstCls", sonarMin: "volNFfromLstClsMin", sonarMax: "volNFfromLstClsMax" },
  { key: "avpostmhvol90nf", scannerMin: "minAvPostMhVol90NF", scannerMax: "maxAvPostMhVol90NF", sonarMode: "AvPostMhVol90NF", sonarMin: "avPostMhVol90NFMin", sonarMax: "avPostMhVol90NFMax" },
  { key: "avpremhvol90nf", scannerMin: "minAvPreMhVol90NF", scannerMax: "maxAvPreMhVol90NF", sonarMode: "AvPreMhVol90NF", sonarMin: "avPreMhVol90NFMin", sonarMax: "avPreMhVol90NFMax" },
  { key: "avpremhvalue20nf", scannerMin: "minAvPreMhValue20NF", scannerMax: "maxAvPreMhValue20NF", sonarMode: "AvPreMhValue20NF", sonarMin: "avPreMhValue20NFMin", sonarMax: "avPreMhValue20NFMax" },
  { key: "avpremhvalue90nf", scannerMin: "minAvPreMhValue90NF", scannerMax: "maxAvPreMhValue90NF", sonarMode: "AvPreMhValue90NF", sonarMin: "avPreMhValue90NFMin", sonarMax: "avPreMhValue90NFMax" },
  { key: "avgdailyvalue20", scannerMin: "minAvgDailyValue20", scannerMax: "maxAvgDailyValue20", sonarMode: "AvgDailyValue20", sonarMin: "avgDailyValue20Min", sonarMax: "avgDailyValue20Max" },
  { key: "avgdailyvalue90", scannerMin: "minAvgDailyValue90", scannerMax: "maxAvgDailyValue90", sonarMode: "AvgDailyValue90", sonarMin: "avgDailyValue90Min", sonarMax: "avgDailyValue90Max" },
  { key: "volatility20", scannerMin: "minVolatility20", scannerMax: "maxVolatility20", sonarMode: "Volatility20", sonarMin: "volatility20Min", sonarMax: "volatility20Max" },
  { key: "volatility90", scannerMin: "minVolatility90", scannerMax: "maxVolatility90", sonarMode: "Volatility90", sonarMin: "volatility90Min", sonarMax: "volatility90Max" },
  { key: "premhmdv20nf", scannerMin: "minPreMhMDV20NF", scannerMax: "maxPreMhMDV20NF", sonarMode: "PreMhMDV20NF", sonarMin: "preMhMDV20NFMin", sonarMax: "preMhMDV20NFMax" },
  { key: "premhmdv90nf", scannerMin: "minPreMhMDV90NF", scannerMax: "maxPreMhMDV90NF", sonarMode: "PreMhMDV90NF", sonarMin: "preMhMDV90NFMin", sonarMax: "preMhMDV90NFMax" },
  { key: "volrel", scannerMin: "minVolRel", scannerMax: "maxVolRel", sonarMode: "VolRel", sonarMin: "volRelMin", sonarMax: "volRelMax" },
  { key: "premhbidlstprc", scannerMin: "minPreMhBidLstPrcPct", scannerMax: "maxPreMhBidLstPrcPct", sonarMode: "PreMhBidLstPrcPct", sonarMin: "preMhBidLstPrcPctMin", sonarMax: "preMhBidLstPrcPctMax" },
  { key: "premhlolstprc", scannerMin: "minPreMhLoLstPrcPct", scannerMax: "maxPreMhLoLstPrcPct", sonarMode: "PreMhLoLstPrcPct", sonarMin: "preMhLoLstPrcPctMin", sonarMax: "preMhLoLstPrcPctMax" },
  { key: "premhhilstcls", scannerMin: "minPreMhHiLstClsPct", scannerMax: "maxPreMhHiLstClsPct", sonarMode: "PreMhHiLstClsPct", sonarMin: "preMhHiLstClsPctMin", sonarMax: "preMhHiLstClsPctMax" },
  { key: "premhlolstcls", scannerMin: "minPreMhLoLstClsPct", scannerMax: "maxPreMhLoLstClsPct", sonarMode: "PreMhLoLstClsPct", sonarMin: "preMhLoLstClsPctMin", sonarMax: "preMhLoLstClsPctMax" },
  { key: "lstprclstcls", scannerMin: "minLstPrcLstClsPct", scannerMax: "maxLstPrcLstClsPct", sonarMode: "LstPrcLstClsPct", sonarMin: "lstPrcLstClsPctMin", sonarMax: "lstPrcLstClsPctMax" },
  { key: "imbexch925", scannerMin: "minImbExch925", scannerMax: "maxImbExch925", sonarMode: "ImbExch925", sonarMin: "imbExch925Min", sonarMax: "imbExch925Max" },
  { key: "imbexch1555", scannerMin: "minImbExch1555", scannerMax: "maxImbExch1555", sonarMode: "ImbExch1555", sonarMin: "imbExch1555Min", sonarMax: "imbExch1555Max" },
] as const;

export type SharedFilterPresetKey = typeof SHARED_FILTER_PRESET_FIELDS[number]["key"];

export type SharedFilterPreset = {
  version: 1;
  presetType: "shared-filters";
  filters: Partial<Record<SharedFilterPresetKey, {
    mode: SharedFilterPresetMode;
    min: string;
    max: string;
  }>>;
};

export function isSharedFilterPreset(value: any): value is SharedFilterPreset {
  return value?.presetType === "shared-filters" && value?.filters && typeof value.filters === "object";
}
