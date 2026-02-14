export type MinMax = { min?: number; max?: number };

export type ListMode = "off" | "ignore" | "apply" | "pin";
export type ActiveMode = "off" | "onlyActive" | "onlyInactive";
export type ReportMode = "ALL" | "YES" | "NO";
export type ZapMode = "off" | "zap" | "sigma";

export type MultiSel = {
  enabled: boolean;
  values: string[];
};

export type ArbitrageFilterConfigV1 = {
  version: 1;

  // server-ish (optional if you want to mirror source params)
  source?: {
    cls?: string;
    type?: string;
    mode?: string;
    tickers?: string[];  // normalized upper
    minRate?: number;
    minTotal?: number;
    limit?: number;
  };

  lists?: {
    mode: ListMode;
    ignore?: string[];
    apply?: string[];
    pinned?: string[];
  };

  activity?: {
    mode: ActiveMode;
  };

  bounds?: Partial<Record<
    | "ADV20"
    | "ADV20NF"
    | "ADV90"
    | "ADV90NF"
    | "AvPreMhv"
    | "RoundLot"
    | "VWAP"
    | "Spread"
    | "LstPrcL"
    | "LstCls"
    | "YCls"
    | "TCls"
    | "ClsToClsPct"
    | "Lo"
    | "LstClsNewsCnt"
    | "MarketCapM"
    | "PreMhVolNF"
    | "VolNFfromLstCls",
    MinMax
  >>;

  exclude?: {
    dividend?: boolean;
    news?: boolean;
    ptp?: boolean;
    ssr?: boolean;
    report?: boolean;
    etf?: boolean;
    crap?: boolean; // LastClose < 5
  };

  include?: {
    usaOnly?: boolean;
    chinaOnly?: boolean;
  };

  multi?: {
    countries?: MultiSel;
    exchanges?: MultiSel;
    sectors?: MultiSel;
  };

  report?: {
    hasReport?: ReportMode;
  };

  equityType?: string;

  zap?: {
    mode: ZapMode;
    thresholdAbs?: number; // zapShowAbs
    silverAbs?: number;    // display only
    goldAbs?: number;      // display only
  };
};