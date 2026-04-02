import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type {
  ActorProfile,
  MatchedContract,
  OptionType,
  PutCallImbalance,
  ScanSummary,
  ScoredContract,
  SignalFlag,
} from "@/lib/insider/types";

const execFileAsync = promisify(execFile);

export const INSIDER_DATA_DIR = path.join(process.cwd(), "data", "insider");
export const INSIDER_SCRIPTS_DIR = path.join(process.cwd(), "scripts", "insider");

const DEMO_NOW = "2026-03-26T10:15:00.000Z";

const DEMO_FLAGGED_CONTRACTS: ScoredContract[] = [
  {
    ticker: "NVDA",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "call",
    strike: 980,
    strikePctOtm: 8.4,
    currentPrice: 904.1,
    lastPrice: 21.8,
    bid: 21.4,
    ask: 22.2,
    volume: 6480,
    openInterest: 980,
    impliedVolatility: 0.61,
    inTheMoney: false,
    contractSymbol: "NVDA260417C00980000",
    volOiRatio: 6.61,
    volumeZscore: 3.8,
    totalPremiumUsd: 14126400,
    ivPercentile: 97.2,
    anomalyScore: 4,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "HIGH-IV"],
  },
  {
    ticker: "TSLA",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-03",
    daysToExp: 8,
    optType: "put",
    strike: 150,
    strikePctOtm: 11.9,
    currentPrice: 170.2,
    lastPrice: 6.55,
    bid: 6.4,
    ask: 6.7,
    volume: 9320,
    openInterest: 1880,
    impliedVolatility: 0.72,
    inTheMoney: false,
    contractSymbol: "TSLA260403P00150000",
    volOiRatio: 4.96,
    volumeZscore: 4.1,
    totalPremiumUsd: 6104600,
    ivPercentile: 95.6,
    anomalyScore: 5,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "SHORT-OTM", "HIGH-IV"],
  },
  {
    ticker: "AAPL",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "call",
    strike: 245,
    strikePctOtm: 6.3,
    currentPrice: 230.4,
    lastPrice: 4.8,
    bid: 4.7,
    ask: 4.95,
    volume: 5400,
    openInterest: 1300,
    impliedVolatility: 0.34,
    inTheMoney: false,
    contractSymbol: "AAPL260417C00245000",
    volOiRatio: 4.15,
    volumeZscore: 3.2,
    totalPremiumUsd: 2592000,
    ivPercentile: 90.4,
    anomalyScore: 4,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "HIGH-IV"],
  },
  {
    ticker: "SPY",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-10",
    daysToExp: 15,
    optType: "put",
    strike: 495,
    strikePctOtm: 5.7,
    currentPrice: 524.8,
    lastPrice: 5.15,
    bid: 5.0,
    ask: 5.25,
    volume: 12040,
    openInterest: 3040,
    impliedVolatility: 0.23,
    inTheMoney: false,
    contractSymbol: "SPY260410P00495000",
    volOiRatio: 3.96,
    volumeZscore: 3.6,
    totalPremiumUsd: 6200600,
    ivPercentile: 88.2,
    anomalyScore: 3,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM"],
  },
  {
    ticker: "AMD",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "call",
    strike: 178,
    strikePctOtm: 7.1,
    currentPrice: 166.2,
    lastPrice: 3.45,
    bid: 3.35,
    ask: 3.55,
    volume: 4880,
    openInterest: 900,
    impliedVolatility: 0.49,
    inTheMoney: false,
    contractSymbol: "AMD260417C00178000",
    volOiRatio: 5.42,
    volumeZscore: 3.4,
    totalPremiumUsd: 1683600,
    ivPercentile: 91.8,
    anomalyScore: 4,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "HIGH-IV"],
  },
  {
    ticker: "META",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-03",
    daysToExp: 8,
    optType: "call",
    strike: 640,
    strikePctOtm: 5.9,
    currentPrice: 604.3,
    lastPrice: 8.1,
    bid: 7.95,
    ask: 8.3,
    volume: 2110,
    openInterest: 320,
    impliedVolatility: 0.41,
    inTheMoney: false,
    contractSymbol: "META260403C00640000",
    volOiRatio: 6.59,
    volumeZscore: 3.1,
    totalPremiumUsd: 1709100,
    ivPercentile: 89.5,
    anomalyScore: 4,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "SHORT-OTM"],
  },
  {
    ticker: "PLTR",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-10",
    daysToExp: 15,
    optType: "call",
    strike: 41,
    strikePctOtm: 9.6,
    currentPrice: 37.4,
    lastPrice: 1.12,
    bid: 1.08,
    ask: 1.15,
    volume: 14250,
    openInterest: 2210,
    impliedVolatility: 0.67,
    inTheMoney: false,
    contractSymbol: "PLTR260410C00041000",
    volOiRatio: 6.45,
    volumeZscore: 4.3,
    totalPremiumUsd: 1596000,
    ivPercentile: 98.4,
    anomalyScore: 5,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM", "SHORT-OTM", "HIGH-IV"],
  },
  {
    ticker: "QQQ",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "put",
    strike: 420,
    strikePctOtm: 6.0,
    currentPrice: 446.9,
    lastPrice: 4.2,
    bid: 4.1,
    ask: 4.3,
    volume: 6010,
    openInterest: 1420,
    impliedVolatility: 0.27,
    inTheMoney: false,
    contractSymbol: "QQQ260417P00420000",
    volOiRatio: 4.23,
    volumeZscore: 3.0,
    totalPremiumUsd: 2524200,
    ivPercentile: 84.1,
    anomalyScore: 3,
    flags: ["VOL/OI", "Z-SCORE", "OTM-PREM"],
  },
];

const DEMO_EXTRA_SCORED_CONTRACTS: ScoredContract[] = [
  {
    ticker: "MSFT",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "call",
    strike: 470,
    strikePctOtm: 4.2,
    currentPrice: 451.1,
    lastPrice: 7.4,
    bid: 7.2,
    ask: 7.55,
    volume: 1260,
    openInterest: 900,
    impliedVolatility: 0.28,
    inTheMoney: false,
    contractSymbol: "MSFT260417C00470000",
    volOiRatio: 1.4,
    volumeZscore: 1.9,
    totalPremiumUsd: 932400,
    ivPercentile: 76.4,
    anomalyScore: 1,
    flags: ["OTM-PREM"],
  },
  {
    ticker: "AMZN",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-10",
    daysToExp: 15,
    optType: "put",
    strike: 165,
    strikePctOtm: 3.2,
    currentPrice: 170.4,
    lastPrice: 2.15,
    bid: 2.08,
    ask: 2.22,
    volume: 1540,
    openInterest: 2010,
    impliedVolatility: 0.31,
    inTheMoney: false,
    contractSymbol: "AMZN260410P00165000",
    volOiRatio: 0.77,
    volumeZscore: 1.3,
    totalPremiumUsd: 331100,
    ivPercentile: 64.2,
    anomalyScore: 0,
    flags: [],
  },
  {
    ticker: "GOOGL",
    fetchDate: DEMO_NOW,
    expiration: "2026-04-17",
    daysToExp: 22,
    optType: "call",
    strike: 195,
    strikePctOtm: 5.4,
    currentPrice: 185.0,
    lastPrice: 2.9,
    bid: 2.8,
    ask: 3.0,
    volume: 2110,
    openInterest: 1800,
    impliedVolatility: 0.29,
    inTheMoney: false,
    contractSymbol: "GOOGL260417C00195000",
    volOiRatio: 1.17,
    volumeZscore: 2.1,
    totalPremiumUsd: 611900,
    ivPercentile: 72.0,
    anomalyScore: 1,
    flags: ["OTM-PREM"],
  },
];

const DEMO_ACTOR_PROFILES: ActorProfile[] = [
  {
    ticker: "NVDA",
    optType: "call",
    trades: 6,
    wins: 4,
    winRatePct: 66.7,
    avgReturnT5: 9.4,
    sharpe: 1.82,
    totalPremiumUsd: 22800000,
    avgAnomalyScore: 4.2,
    tradesNearEvent: 2,
    isSmartMoney: true,
  },
  {
    ticker: "TSLA",
    optType: "put",
    trades: 5,
    wins: 3,
    winRatePct: 60.0,
    avgReturnT5: 7.1,
    sharpe: 1.24,
    totalPremiumUsd: 14800000,
    avgAnomalyScore: 4.0,
    tradesNearEvent: 3,
    isSmartMoney: true,
  },
  {
    ticker: "PLTR",
    optType: "call",
    trades: 4,
    wins: 2,
    winRatePct: 50.0,
    avgReturnT5: 4.6,
    sharpe: 0.74,
    totalPremiumUsd: 7100000,
    avgAnomalyScore: 4.1,
    tradesNearEvent: 1,
    isSmartMoney: false,
  },
  {
    ticker: "AAPL",
    optType: "call",
    trades: 3,
    wins: 2,
    winRatePct: 66.7,
    avgReturnT5: 5.1,
    sharpe: 0.92,
    totalPremiumUsd: 5600000,
    avgAnomalyScore: 3.8,
    tradesNearEvent: 0,
    isSmartMoney: false,
  },
  {
    ticker: "SPY",
    optType: "put",
    trades: 5,
    wins: 2,
    winRatePct: 40.0,
    avgReturnT5: 2.3,
    sharpe: 0.31,
    totalPremiumUsd: 9800000,
    avgAnomalyScore: 3.1,
    tradesNearEvent: 2,
    isSmartMoney: false,
  },
];

const DEMO_MATCHED_CONTRACTS: MatchedContract[] = [
  {
    ...DEMO_FLAGGED_CONTRACTS[0],
    eventType: "earnings",
    eventDate: "2026-03-31",
    eventSource: "explicit",
    daysBeforeEvent: 5,
    returnT1: 2.6,
    returnT5: 11.8,
    returnT10: 15.4,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[1],
    eventType: "delivery",
    eventDate: "2026-03-28",
    eventSource: "explicit",
    daysBeforeEvent: 2,
    returnT1: 5.1,
    returnT5: 14.2,
    returnT10: 18.7,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[2],
    eventType: "earnings",
    eventDate: "2026-04-02",
    eventSource: "explicit",
    daysBeforeEvent: 7,
    returnT1: -1.8,
    returnT5: 3.2,
    returnT10: 4.4,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[3],
    eventType: "macro",
    eventDate: "2026-03-27",
    eventSource: "explicit",
    daysBeforeEvent: 1,
    returnT1: 1.4,
    returnT5: -2.1,
    returnT10: -3.9,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[4],
    eventType: "product",
    eventDate: "2026-04-01",
    eventSource: "explicit",
    daysBeforeEvent: 6,
    returnT1: -3.2,
    returnT5: -7.4,
    returnT10: -9.1,
    isCorrect: false,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[5],
    eventType: "antitrust",
    eventDate: "2026-03-29",
    eventSource: "explicit",
    daysBeforeEvent: 3,
    returnT1: 0.9,
    returnT5: 5.7,
    returnT10: 9.3,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[6],
    eventType: "government",
    eventDate: "2026-04-03",
    eventSource: "explicit",
    daysBeforeEvent: 8,
    returnT1: 3.8,
    returnT5: 9.9,
    returnT10: 13.6,
    isCorrect: true,
  },
  {
    ...DEMO_FLAGGED_CONTRACTS[7],
    eventType: "macro",
    eventDate: "2026-03-27",
    eventSource: "explicit",
    daysBeforeEvent: 1,
    returnT1: -0.8,
    returnT5: 2.6,
    returnT10: 3.3,
    isCorrect: false,
  },
];

function toNumber(value: string | undefined): number {
  const normalized = (value ?? "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function readCsvRows(filePath: string): Array<Record<string, string>> {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });
    return row;
  });
}

function parseFlags(value: string | undefined): SignalFlag[] {
  return (value ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item): item is SignalFlag =>
        item === "VOL/OI" ||
        item === "Z-SCORE" ||
        item === "OTM-PREM" ||
        item === "SHORT-OTM" ||
        item === "HIGH-IV"
    );
}

function parseOptionType(value: string | undefined): OptionType {
  return String(value).toLowerCase() === "put" ? "put" : "call";
}

function differenceInDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type LocalCatalyst = {
  ticker: string;
  date: string;
  eventType: string;
};

function readLocalCatalysts(): LocalCatalyst[] {
  const filePath = path.join(process.cwd(), "data", "events.json");
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as {
      events?: Array<{ ticker?: string; date?: string; tags?: string[] }>;
    };

    return (parsed.events ?? [])
      .filter((item) => item.ticker && item.date)
      .map((item) => ({
        ticker: String(item.ticker).toUpperCase(),
        date: String(item.date),
        eventType: item.tags?.[0] || "event",
      }));
  } catch {
    return [];
  }
}

function inferEventType(contract: ScoredContract) {
  if (contract.ticker === "SPY" || contract.ticker === "QQQ") return "macro";
  if (contract.optType === "put" && contract.daysToExp <= 10) return "risk-event";
  if (contract.flags.includes("HIGH-IV")) return "earnings";
  if (contract.flags.includes("SHORT-OTM")) return "product";
  return "earnings-window";
}

function inferMatchedContracts(source: ScoredContract[], explicit: MatchedContract[]) {
  const catalysts = readLocalCatalysts();
  const explicitSymbols = new Set(explicit.map((item) => item.contractSymbol));

  return source
    .filter((contract) => !explicitSymbols.has(contract.contractSymbol))
    .map((contract) => {
      const fetchDay = contract.fetchDate ? contract.fetchDate.slice(0, 10) : DEMO_NOW.slice(0, 10);
      const bestCatalyst = catalysts
        .filter((item) => item.ticker === contract.ticker)
        .map((item) => ({
          ...item,
          daysBeforeEvent: differenceInDays(fetchDay, item.date),
        }))
        .filter((item) => item.daysBeforeEvent != null && item.daysBeforeEvent >= 0 && item.daysBeforeEvent <= 14)
        .sort((a, b) => (a.daysBeforeEvent ?? 999) - (b.daysBeforeEvent ?? 999))[0];

      const inferredDays = Math.max(1, Math.min(contract.daysToExp, contract.flags.includes("SHORT-OTM") ? 3 : 7));
      const eventDate = bestCatalyst?.date ?? addDays(fetchDay, inferredDays);
      const eventType = bestCatalyst?.eventType ?? inferEventType(contract);
      const daysBeforeEvent = bestCatalyst?.daysBeforeEvent ?? differenceInDays(fetchDay, eventDate);

        return {
          ...contract,
          eventType,
          eventDate,
          eventSource: bestCatalyst ? "calendar" : "inferred",
          daysBeforeEvent,
          returnT1: null,
        returnT5: null,
        returnT10: null,
        isCorrect: null,
      } satisfies MatchedContract;
    });
}

export function ensureInsiderDataDir() {
  fs.mkdirSync(INSIDER_DATA_DIR, { recursive: true });
}

export function getInsiderFilePath(fileName: string) {
  return path.join(INSIDER_DATA_DIR, fileName);
}

function hasUsableFile(fileName: string) {
  const filePath = getInsiderFilePath(fileName);
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 8;
}

export function readFlaggedContracts(): ScoredContract[] {
  const rows = readCsvRows(getInsiderFilePath("options_flagged.csv"));
  if (!rows.length) {
    return DEMO_FLAGGED_CONTRACTS;
  }

  return rows.map((row) => ({
    ticker: row.ticker ?? "",
    fetchDate: row.fetch_date ?? "",
    expiration: row.expiration ?? "",
    daysToExp: toNumber(row.days_to_exp),
    optType: parseOptionType(row.opt_type),
    strike: toNumber(row.strike),
    strikePctOtm: toNumber(row.strike_pct_otm),
    currentPrice: toNumber(row.current_price),
    lastPrice: toNumber(row.lastPrice ?? row.last_price),
    bid: toNumber(row.bid),
    ask: toNumber(row.ask),
    volume: toNumber(row.volume),
    openInterest: toNumber(row.openInterest ?? row.open_interest),
    impliedVolatility: toNumber(row.impliedVolatility ?? row.implied_volatility),
    inTheMoney: toBoolean(row.inTheMoney ?? row.in_the_money),
    contractSymbol: row.contractSymbol ?? row.contract_symbol ?? "",
    volOiRatio: toNumber(row.vol_oi_ratio),
    volumeZscore: toNumber(row.volume_zscore),
    totalPremiumUsd: toNumber(row.total_premium_usd),
    ivPercentile: toNumber(row.iv_percentile),
    anomalyScore: toNumber(row.anomaly_score),
    flags: parseFlags(row.flags),
  }));
}

export function readScoredContracts(): ScoredContract[] {
  const rows = readCsvRows(getInsiderFilePath("options_scored.csv"));
  if (!rows.length) {
    return [...DEMO_FLAGGED_CONTRACTS, ...DEMO_EXTRA_SCORED_CONTRACTS];
  }

  return rows.map((row) => ({
    ticker: row.ticker ?? "",
    fetchDate: row.fetch_date ?? "",
    expiration: row.expiration ?? "",
    daysToExp: toNumber(row.days_to_exp),
    optType: parseOptionType(row.opt_type),
    strike: toNumber(row.strike),
    strikePctOtm: toNumber(row.strike_pct_otm),
    currentPrice: toNumber(row.current_price),
    lastPrice: toNumber(row.lastPrice ?? row.last_price),
    bid: toNumber(row.bid),
    ask: toNumber(row.ask),
    volume: toNumber(row.volume),
    openInterest: toNumber(row.openInterest ?? row.open_interest),
    impliedVolatility: toNumber(row.impliedVolatility ?? row.implied_volatility),
    inTheMoney: toBoolean(row.inTheMoney ?? row.in_the_money),
    contractSymbol: row.contractSymbol ?? row.contract_symbol ?? "",
    volOiRatio: toNumber(row.vol_oi_ratio),
    volumeZscore: toNumber(row.volume_zscore),
    totalPremiumUsd: toNumber(row.total_premium_usd),
    ivPercentile: toNumber(row.iv_percentile),
    anomalyScore: toNumber(row.anomaly_score),
    flags: parseFlags(row.flags),
  }));
}

export function readActorProfiles(): ActorProfile[] {
  const rows = readCsvRows(getInsiderFilePath("actor_profiles.csv"));
  if (!rows.length) {
    return DEMO_ACTOR_PROFILES;
  }

  return rows.map((row) => ({
    ticker: row.ticker ?? "",
    optType: parseOptionType(row.opt_type),
    trades: toNumber(row.trades),
    wins: toNumber(row.wins),
    winRatePct: toNumber(row.win_rate_pct),
    avgReturnT5: toNumber(row.avg_return_T5 ?? row.avg_return_t5),
    sharpe: toNumber(row.sharpe),
    totalPremiumUsd: toNumber(row.total_premium_usd),
    avgAnomalyScore: toNumber(row.avg_anomaly_score),
    tradesNearEvent: toNumber(row.trades_near_event),
    isSmartMoney: toBoolean(row.is_smart_money),
  }));
}

export function readMatchedContracts(): MatchedContract[] {
  const rows = readCsvRows(getInsiderFilePath("matched_contracts.csv"));
  const explicit: MatchedContract[] = rows.map((row) => ({
    ticker: row.ticker ?? "",
    fetchDate: row.fetch_date ?? "",
    expiration: row.expiration ?? "",
    daysToExp: toNumber(row.days_to_exp),
    optType: parseOptionType(row.opt_type),
    strike: toNumber(row.strike),
    strikePctOtm: toNumber(row.strike_pct_otm),
    currentPrice: toNumber(row.current_price),
    lastPrice: toNumber(row.lastPrice ?? row.last_price),
    bid: toNumber(row.bid),
    ask: toNumber(row.ask),
    volume: toNumber(row.volume),
    openInterest: toNumber(row.openInterest ?? row.open_interest),
    impliedVolatility: toNumber(row.impliedVolatility ?? row.implied_volatility),
    inTheMoney: toBoolean(row.inTheMoney ?? row.in_the_money),
    contractSymbol: row.contractSymbol ?? row.contract_symbol ?? "",
    volOiRatio: toNumber(row.vol_oi_ratio),
    volumeZscore: toNumber(row.volume_zscore),
    totalPremiumUsd: toNumber(row.total_premium_usd),
    ivPercentile: toNumber(row.iv_percentile),
    anomalyScore: toNumber(row.anomaly_score),
      flags: parseFlags(row.flags),
      eventType: row.event_type || null,
      eventDate: row.event_date || null,
      eventSource: "explicit" as const,
      daysBeforeEvent: row.days_before_event ? toNumber(row.days_before_event) : null,
    returnT1: row.return_t1 ? toNumber(row.return_t1) : null,
    returnT5: row.return_t5 ? toNumber(row.return_t5) : null,
    returnT10: row.return_t10 ? toNumber(row.return_t10) : null,
    isCorrect: row.is_correct ? toBoolean(row.is_correct) : null,
    }));

  if (!rows.length) {
    const fallbackSource = readFlaggedContracts();
    return [...DEMO_MATCHED_CONTRACTS, ...inferMatchedContracts(fallbackSource, DEMO_MATCHED_CONTRACTS)];
  }

  return [...explicit, ...inferMatchedContracts(readFlaggedContracts(), explicit)];
}

export function computePutCallFlow(): PutCallImbalance[] {
  const rows = readScoredContracts();
  const byTicker = new Map<string, { call: number; put: number }>();

  for (const row of rows) {
    if (!byTicker.has(row.ticker)) {
      byTicker.set(row.ticker, { call: 0, put: 0 });
    }

    const item = byTicker.get(row.ticker)!;
    if (row.optType === "call") item.call += row.volume;
    else item.put += row.volume;
  }

  return [...byTicker.entries()]
    .map(([ticker, item]) => {
      const pcRatio = item.call > 0 ? Number((item.put / item.call).toFixed(3)) : 999;
      let signal: PutCallImbalance["signal"] = "BALANCED";
      if (pcRatio >= 3) signal = "PUT_HEAVY";
      else if (item.put > 0 && item.call / item.put >= 3) signal = "CALL_HEAVY";

      return {
        ticker,
        callVolume: item.call,
        putVolume: item.put,
        pcRatio,
        signal,
      };
    })
    .sort((a, b) => b.callVolume + b.putVolume - (a.callVolume + a.putVolume));
}

export function buildScanSummary(): ScanSummary {
  const flagged = readFlaggedContracts();
  const scored = readScoredContracts();
  const actors = readActorProfiles();
  const flaggedPath = getInsiderFilePath("options_flagged.csv");
  const hasLiveData = hasUsableFile("options_flagged.csv") || hasUsableFile("options_scored.csv");

  return {
    scannedAt: hasLiveData && fs.existsSync(flaggedPath)
      ? fs.statSync(flaggedPath).mtime.toISOString()
      : DEMO_NOW,
    totalContracts: scored.length,
    flaggedContracts: flagged.length,
    smartMoneyActors: actors.filter((actor) => actor.isSmartMoney).length,
    topSignals: flagged.slice(0, 5),
    putCallImbalances: computePutCallFlow().slice(0, 10),
  };
}

export async function maybeRunInsiderPipeline() {
  ensureInsiderDataDir();

  const python = process.env.PYTHON_BIN || "python";
  const scripts = [
    "options_fetcher.py",
    "anomaly_detector.py",
    "actor_profiler.py",
  ];

  const missingScript = scripts.find(
    (script) => !fs.existsSync(path.join(INSIDER_SCRIPTS_DIR, script))
  );
  if (missingScript) {
    return false;
  }

  for (const script of scripts) {
    await execFileAsync(python, [path.join(INSIDER_SCRIPTS_DIR, script)], {
      cwd: INSIDER_DATA_DIR,
      timeout: 120_000,
    });
  }

  return true;
}
