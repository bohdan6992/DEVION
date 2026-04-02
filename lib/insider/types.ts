export type OptionType = "call" | "put";

export type SignalFlag =
  | "VOL/OI"
  | "Z-SCORE"
  | "OTM-PREM"
  | "SHORT-OTM"
  | "HIGH-IV";

export interface OptionContract {
  ticker: string;
  fetchDate: string;
  expiration: string;
  daysToExp: number;
  optType: OptionType;
  strike: number;
  strikePctOtm: number;
  currentPrice: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  contractSymbol: string;
}

export interface ScoredContract extends OptionContract {
  volOiRatio: number;
  volumeZscore: number;
  totalPremiumUsd: number;
  ivPercentile: number;
  anomalyScore: number;
  flags: SignalFlag[];
}

export interface MatchedContract extends ScoredContract {
  eventType: string | null;
  eventDate: string | null;
  eventSource: "explicit" | "calendar" | "inferred";
  daysBeforeEvent: number | null;
  returnT1: number | null;
  returnT5: number | null;
  returnT10: number | null;
  isCorrect: boolean | null;
}

export interface ActorProfile {
  ticker: string;
  optType: OptionType;
  trades: number;
  wins: number;
  winRatePct: number;
  avgReturnT5: number;
  sharpe: number;
  totalPremiumUsd: number;
  avgAnomalyScore: number;
  tradesNearEvent: number;
  isSmartMoney: boolean;
}

export interface PutCallImbalance {
  ticker: string;
  callVolume: number;
  putVolume: number;
  pcRatio: number;
  signal: "PUT_HEAVY" | "CALL_HEAVY" | "BALANCED";
}

export interface ScanSummary {
  scannedAt: string;
  totalContracts: number;
  flaggedContracts: number;
  smartMoneyActors: number;
  topSignals: ScoredContract[];
  putCallImbalances: PutCallImbalance[];
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  cachedAt?: string;
}
