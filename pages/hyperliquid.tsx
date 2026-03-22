import { useMemo, useState } from "react";

import { postHyperliquidInfo, type HyperliquidUserFill } from "@/lib/hyperliquidClient";
import { useUi } from "@/components/UiProvider";

const DEMO_USER = "0x31ca8395cf837de08b24da3f660e77761dfb974b";
const PUBLIC_WALLET_LIST = [
  "0x393d0b87ed38fc779fd9611144ae649ba6082109",
  "0x24de6b77e8bc31c40aa452926daa6bbab7a71b0f",
  "0x488d2a9b70cc18ef66057a48ab3d59da1c59fe08",
  "0xe44bd27c9f10fa2f89fdb3ab4b4f0e460da29ea8",
  "0x05cafe987297448f21a3c7ae0ae815fddecac655",
  "0x179f3d11483dafe616d56b32c4ce2562faabbbbb",
  "0x90b38c5728f184c87ef46479cf7b402d7b98b98a",
  "0x85530f0ff6496c72a619f37a60f3c1a59077737f",
  "0xa5b0edf6b55128e0ddae8e51ac538c3188401d41",
  "0xe6111266afdcdf0b1fe8505028cc1f7419d798a7",
  "0xefd3ab65915e35105caa462442c9ecc1346728df",
].join("\n");
const DEFAULT_COIN = "BTC";
const DEFAULT_INTERVAL = "1h";
const DEFAULT_TOKEN_INDEX = 0;

type PresetMode = "market" | "coin" | "wallet" | "walletDate" | "walletOid" | "token";
type FillDirectionFilter = "all" | "long" | "short";
type FillSortMode = "timeDesc" | "volumeDesc" | "volumeAsc";
type WalletTaggedFill = HyperliquidUserFill & { wallet?: string };
type WalletScanFill = HyperliquidUserFill & { wallet: string };
type ActiveDaySummary = {
  date: string;
  wallets: number;
  fills: number;
  totalNotional: number;
  topWallet: string;
  topWalletNotional: number;
};
type ActiveDaysScanResult = {
  kind: "activeDaysScan";
  rows: ActiveDaySummary[];
  scannedDays: number;
};
type WorkingWalletsResult = {
  kind: "workingWallets";
  rows: Array<{ wallet: string; fills: number }>;
  scannedWallets: number;
};
type WalletAnalysisTradeRow = {
  time: string;
  asset: string;
  side: string;
  size: string;
  value: string;
  price: string;
  fee: string;
  pnl: string;
};
type WalletAnalysisResult = {
  kind: "walletAnalysis";
  wallet: string;
  openOrders: number;
  totalTrades: number;
  winRate: string;
  realizedPnl: string;
  avgTradeValue: string;
  volume24h: string;
  volume7d: string;
  volume30d: string;
  volumeAll: string;
  style: string;
  bias: string;
  topCoins: string;
  lastTrade: string;
  tradeHistory: WalletAnalysisTradeRow[];
};

function getThemeAccent(theme?: string | null) {
  switch (theme) {
    case "sparkle":
      return {
        selection: "selection:bg-yellow-200/35",
        text: "text-yellow-200",
        softText: "text-yellow-100",
        panel: "border-yellow-200/10 bg-yellow-200/[0.03]",
        active: "border-yellow-200/25 bg-yellow-200/10 text-yellow-200 shadow-[0_0_10px_-3px_rgba(254,240,138,0.16)]",
        focus: "focus:border-yellow-200/35",
      };
    case "inferno":
      return {
        selection: "selection:bg-orange-300/35",
        text: "text-orange-200",
        softText: "text-orange-100",
        panel: "border-orange-300/10 bg-red-500/[0.04]",
        active: "border-orange-300/35 bg-red-500/14 text-orange-100 shadow-[0_0_14px_-3px_rgba(249,115,22,0.22)]",
        focus: "focus:border-orange-300/40",
      };
    case "light":
    case "neon":
      return {
        selection: "selection:bg-fuchsia-500/30",
        text: "text-fuchsia-300",
        softText: "text-fuchsia-200",
        panel: "border-fuchsia-500/10 bg-fuchsia-500/[0.035]",
        active: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_0_10px_-3px_rgba(217,70,239,0.2)]",
        focus: "focus:border-fuchsia-500/35",
      };
    case "space":
      return {
        selection: "selection:bg-sky-500/30",
        text: "text-sky-300",
        softText: "text-sky-200",
        panel: "border-sky-400/10 bg-sky-400/[0.035]",
        active: "border-sky-400/20 bg-sky-400/10 text-sky-200 shadow-[0_0_10px_-3px_rgba(56,189,248,0.2)]",
        focus: "focus:border-sky-400/35",
      };
    default:
      return {
        selection: "selection:bg-zinc-200/24",
        text: "text-zinc-200",
        softText: "text-zinc-100",
        panel: "border-white/5 bg-white/[0.02]",
        active: "border-zinc-300/20 bg-zinc-200/10 text-zinc-200 shadow-[0_0_10px_-3px_rgba(212,212,216,0.12)]",
        focus: "focus:border-white/12",
      };
  }
}

type PresetDef = {
  id: string;
  label: string;
  description: string;
  mode: PresetMode;
  buildRequest: (ctx: {
    wallet: string;
    dateRange: { start: number; end: number } | null;
    coin: string;
    interval: string;
    oid: number;
    token: number;
  }) => Record<string, unknown>;
};

const PRESET_GROUPS: Array<{ title: string; presets: PresetDef[] }> = [
  {
    title: "MARKET",
    presets: [
      {
        id: "meta",
        label: "META",
        description: "Universe metadata",
        mode: "market",
        buildRequest: () => ({ type: "meta" }),
      },
      {
        id: "allMids",
        label: "ALL MIDS",
        description: "Current mid prices",
        mode: "market",
        buildRequest: () => ({ type: "allMids" }),
      },
      {
        id: "l2Book",
        label: "L2 BOOK",
        description: "Order book snapshot",
        mode: "coin",
        buildRequest: ({ coin }) => ({ type: "l2Book", coin, nSigFigs: 5 }),
      },
      {
        id: "candleSnapshot",
        label: "CANDLES",
        description: "Candle history for selected UTC day",
        mode: "walletDate",
        buildRequest: ({ coin, interval, dateRange }) => ({
          type: "candleSnapshot",
          req: {
            coin,
            interval,
            startTime: dateRange?.start,
            endTime: dateRange?.end,
          },
        }),
      },
      {
        id: "allBorrowLendReserveStates",
        label: "BL RESERVES",
        description: "All borrow/lend reserve states",
        mode: "market",
        buildRequest: () => ({ type: "allBorrowLendReserveStates" }),
      },
      {
        id: "borrowLendReserveState",
        label: "BL RESERVE",
        description: "Borrow/lend reserve state by token",
        mode: "token",
        buildRequest: ({ token }) => ({ type: "borrowLendReserveState", token }),
      },
      {
        id: "alignedQuoteTokenInfo",
        label: "QUOTE TOKEN",
        description: "Aligned quote token status",
        mode: "token",
        buildRequest: ({ token }) => ({ type: "alignedQuoteTokenInfo", token }),
      },
    ],
  },
  {
    title: "TRADING",
    presets: [
      {
        id: "openOrders",
        label: "OPEN ORDERS",
        description: "Live open orders",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "openOrders", user: wallet }),
      },
      {
        id: "frontendOpenOrders",
        label: "FRONTEND O/O",
        description: "Open orders with frontend info",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "frontendOpenOrders", user: wallet }),
      },
      {
        id: "userFills",
        label: "LATEST FILLS",
        description: "Most recent fills",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userFills", user: wallet, aggregateByTime: true }),
      },
      {
        id: "walletAnalysis",
        label: "ANALYSIS",
        description: "Wallet performance profile",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userFills", user: wallet, aggregateByTime: true }),
      },
      {
        id: "userFillsByTime",
        label: "FILLS BY TIME",
        description: "Fills for selected UTC day",
        mode: "walletDate",
        buildRequest: ({ wallet, dateRange }) => ({
          type: "userFillsByTime",
          user: wallet,
          startTime: dateRange?.start,
          endTime: dateRange?.end,
          aggregateByTime: true,
        }),
      },
      {
        id: "historicalOrders",
        label: "HIST ORDERS",
        description: "Recent historical orders",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "historicalOrders", user: wallet }),
      },
      {
        id: "userTwapSliceFills",
        label: "TWAP FILLS",
        description: "Recent TWAP slice fills",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userTwapSliceFills", user: wallet }),
      },
      {
        id: "orderStatus",
        label: "ORDER STATUS",
        description: "Lookup order by oid",
        mode: "walletOid",
        buildRequest: ({ wallet, oid }) => ({ type: "orderStatus", user: wallet, oid }),
      },
      {
        id: "userRateLimit",
        label: "RATE LIMIT",
        description: "User rate limit state",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userRateLimit", user: wallet }),
      },
    ],
  },
  {
    title: "ACCOUNT",
    presets: [
      {
        id: "subAccounts",
        label: "SUB ACCOUNTS",
        description: "Wallet subaccounts",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "subAccounts", user: wallet }),
      },
      {
        id: "userRole",
        label: "ROLE",
        description: "Wallet role",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userRole", user: wallet }),
      },
      {
        id: "approvedBuilders",
        label: "BUILDERS",
        description: "Approved builders for wallet",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "approvedBuilders", user: wallet }),
      },
      {
        id: "portfolio",
        label: "PORTFOLIO",
        description: "Portfolio history windows",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "portfolio", user: wallet }),
      },
      {
        id: "referral",
        label: "REFERRAL",
        description: "Referral information",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "referral", user: wallet }),
      },
      {
        id: "userFees",
        label: "FEES",
        description: "Fee schedule and daily volumes",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userFees", user: wallet }),
      },
      {
        id: "userVaultEquities",
        label: "VAULTS",
        description: "Vault deposits and equity records",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userVaultEquities", user: wallet }),
      },
    ],
  },
  {
    title: "STAKING",
    presets: [
      {
        id: "delegations",
        label: "DELEGATIONS",
        description: "Staking delegations",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "delegations", user: wallet }),
      },
      {
        id: "delegatorSummary",
        label: "STAKE SUM",
        description: "Delegator staking summary",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "delegatorSummary", user: wallet }),
      },
      {
        id: "delegatorHistory",
        label: "STAKE HIST",
        description: "Delegator staking history",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "delegatorHistory", user: wallet }),
      },
      {
        id: "delegatorRewards",
        label: "REWARDS",
        description: "Delegator rewards",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "delegatorRewards", user: wallet }),
      },
    ],
  },
  {
    title: "SYSTEM",
    presets: [
      {
        id: "borrowLendUserState",
        label: "BL USER",
        description: "Borrow/lend state for wallet",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "borrowLendUserState", user: wallet }),
      },
      {
        id: "userDexAbstraction",
        label: "DEX ABS",
        description: "HIP-3 DEX abstraction state",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userDexAbstraction", user: wallet }),
      },
      {
        id: "userAbstraction",
        label: "ABS",
        description: "User abstraction state",
        mode: "wallet",
        buildRequest: ({ wallet }) => ({ type: "userAbstraction", user: wallet }),
      },
    ],
  },
];

const ALL_PRESETS = PRESET_GROUPS.flatMap((group) => group.presets);
const DEFAULT_PRESET = ALL_PRESETS.find((preset) => preset.id === "userFills") ?? ALL_PRESETS[0];

function parseWallets(input: string) {
  return input
    .split(/[\s,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toUtcDayRange(dateText: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const end = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  return { start, end };
}

function formatDateOnlyUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatTs(ms: number | null | undefined) {
  if (!ms) return "-";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function extractDisplayRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function getColumns(rows: Array<Record<string, unknown>>, preferred: string[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }
  const ordered = preferred.filter((key) => keys.has(key));
  const rest = [...keys].filter((key) => !ordered.includes(key)).slice(0, 8);
  return [...ordered, ...rest];
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : formatNumber(value, 6);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderColoredCell(column: string, value: unknown) {
  const text = formatCell(value);
  const upper = text.toUpperCase();

  if (column === "side" || column === "dir") {
    const isBuy = upper === "BUY" || upper.includes("LONG");
    const isSell = upper === "SELL" || upper.includes("SHORT");
    if (isBuy || isSell) {
      return (
        <span
          className={
            isBuy
              ? "inline-flex rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
              : "inline-flex rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-rose-300"
          }
        >
          {text}
        </span>
      );
    }
  }

  if (column === "coin") {
    return <span className="text-zinc-100">{text}</span>;
  }

  if (column === "time" || column === "timestamp" || column === "date") {
    return <span className="text-zinc-300">{text}</span>;
  }

  if (column === "notional" || column === "totalNotional" || column === "topWalletNotional") {
    return <span className="text-cyan-300">{text}</span>;
  }

  if (column === "pnl") {
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric) && numeric !== 0) {
      return <span className={numeric > 0 ? "text-emerald-300" : "text-rose-300"}>{text}</span>;
    }
  }

  if (column === "wallet" || column === "topWallet") {
    return <span className="text-zinc-100 break-all">{text}</span>;
  }

  return <span className="break-all">{text}</span>;
}

function summarizeSeries(series: unknown) {
  if (!Array.isArray(series) || series.length === 0) {
    return { points: 0, last: "-" };
  }
  const points = series.length;
  const lastEntry = series[series.length - 1];
  if (Array.isArray(lastEntry) && lastEntry.length > 1) {
    return { points, last: formatCell(lastEntry[1]) };
  }
  return { points, last: formatCell(lastEntry) };
}

function matchesFillDirection(fill: HyperliquidUserFill, direction: FillDirectionFilter) {
  if (direction === "all") return true;
  const dir = String(fill.dir ?? "").toLowerCase();
  const side = String(fill.side ?? "").toUpperCase();
  if (direction === "long") {
    return dir.includes("long") || side === "B";
  }
  return dir.includes("short") || side === "A";
}

function formatOrderSide(value: unknown) {
  const side = String(value ?? "").toUpperCase();
  if (side === "B") return "BUY";
  if (side === "A") return "SELL";
  return side || "-";
}

function getFillSide(fill: HyperliquidUserFill) {
  const dir = String(fill.dir ?? "").toLowerCase();
  const side = String(fill.side ?? "").toUpperCase();
  if (dir.includes("long") || side === "B") return "BUY";
  if (dir.includes("short") || side === "A") return "SELL";
  return side || "-";
}

function hoursAgoLabel(ms: number | null | undefined) {
  if (!ms) return "-";
  const diffHours = Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
  if (diffHours < 1) return "<1h ago";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function TableCard({
  title,
  subtitle,
  columns,
  rows,
}: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
      <div className="flex h-10 flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02] px-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-200">{title}</div>
        {subtitle ? <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{subtitle}</div> : null}
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-left">
          <thead className="bg-white/[0.02]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-zinc-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="px-4 py-8 text-center font-mono text-[12px] text-zinc-500">
                  No rows
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="text-[12px] text-zinc-200">
                  {columns.map((column) => (
                    <td key={`${index}-${column}`} className="px-4 py-3 font-mono align-top">
                      {renderColoredCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeyValueCard({ title, entries }: { title: string; entries: Array<[string, unknown]> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
      <div className="border-b border-white/5 bg-white/[0.02] px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-200">
        {title}
      </div>
      <div className="divide-y divide-white/10">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-3 text-[12px]">
            <div className="font-mono uppercase tracking-[0.18em] text-zinc-500">{key}</div>
            <div className="font-mono text-zinc-200 break-all">{formatCell(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  accentClass = "text-zinc-100",
}: {
  title: string;
  value: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      <div className={`mt-2 text-[18px] font-mono ${accentClass}`}>{value}</div>
    </div>
  );
}

function ResponseView({
  presetId,
  response,
  fillDirection,
  fillSort,
}: {
  presetId: string;
  response: unknown;
  fillDirection: FillDirectionFilter;
  fillSort: FillSortMode;
}) {
  if (response === null || response === undefined) {
    return (
      <div className="rounded-2xl border border-dashed border-white/5 bg-black/20 px-4 py-12 text-center font-mono text-[12px] text-zinc-500">
        Choose a preset and run a request.
      </div>
    );
  }

  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as ActiveDaysScanResult).kind === "activeDaysScan"
  ) {
    const scan = response as ActiveDaysScanResult;
    const rows = scan.rows.map((row) => ({
      date: row.date,
      wallets: row.wallets,
      fills: row.fills,
      totalNotional: formatUsd(row.totalNotional),
      topWallet: row.topWallet,
      topWalletNotional: formatUsd(row.topWalletNotional),
    }));

    return (
      <TableCard
        title="Active Days"
        subtitle={`${scan.rows.length} active days in last ${scan.scannedDays} days`}
        columns={["date", "wallets", "fills", "totalNotional", "topWallet", "topWalletNotional"]}
        rows={rows}
      />
    );
  }

  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as WorkingWalletsResult).kind === "workingWallets"
  ) {
    const scan = response as WorkingWalletsResult;
    return (
      <TableCard
        title="Working Wallets"
        subtitle={`${scan.rows.length} of ${scan.scannedWallets} wallets returned fills`}
        columns={["wallet", "fills"]}
        rows={scan.rows}
      />
    );
  }

  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as WalletAnalysisResult).kind === "walletAnalysis"
  ) {
    const analysis = response as WalletAnalysisResult;
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-200">Trading Performance</div>
            <div className="grid gap-3">
              <MetricCard title="Wallet" value={analysis.wallet} accentClass="text-zinc-100 text-[13px]" />
              <MetricCard title="Win Rate" value={analysis.winRate} accentClass="text-emerald-300" />
              <MetricCard title="Realized PnL" value={analysis.realizedPnl} accentClass={analysis.realizedPnl.startsWith("-") ? "text-rose-300" : "text-emerald-300"} />
              <MetricCard title="Total Trades" value={String(analysis.totalTrades)} />
              <MetricCard title="Open Orders" value={String(analysis.openOrders)} />
              <MetricCard title="Avg Trade Value" value={analysis.avgTradeValue} accentClass="text-cyan-300" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-200">Volume</div>
            <div className="grid gap-3">
              <MetricCard title="24h Volume" value={analysis.volume24h} accentClass="text-cyan-300" />
              <MetricCard title="7d Volume" value={analysis.volume7d} accentClass="text-cyan-300" />
              <MetricCard title="30d Volume" value={analysis.volume30d} accentClass="text-cyan-300" />
              <MetricCard title="All-Time Volume" value={analysis.volumeAll} accentClass="text-cyan-300" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-200">Trading Style</div>
            <div className="grid gap-3">
              <MetricCard title="Style" value={analysis.style} accentClass={analysis.style === "Active" ? "text-emerald-300" : "text-zinc-200"} />
              <MetricCard title="Bias" value={analysis.bias} accentClass={analysis.bias === "Long" ? "text-emerald-300" : analysis.bias === "Short" ? "text-rose-300" : "text-zinc-200"} />
              <MetricCard title="Top Coins" value={analysis.topCoins} accentClass="text-zinc-100 text-[13px]" />
              <MetricCard title="Last Trade" value={analysis.lastTrade} accentClass="text-zinc-100" />
            </div>
          </div>
        </div>

        <TableCard
          title="Trade History"
          subtitle={`${analysis.tradeHistory.length} recent trades`}
          columns={["time", "asset", "side", "size", "value", "price", "fee", "pnl"]}
          rows={analysis.tradeHistory}
        />
      </div>
    );
  }

  if (presetId === "allMids" && response && typeof response === "object" && !Array.isArray(response)) {
    const rows = Object.entries(response as Record<string, unknown>)
      .map(([coin, mid]) => ({
        coin,
        mid: typeof mid === "string" || typeof mid === "number" ? Number(mid) : mid,
      }))
      .sort((a, b) => Number(b.mid ?? 0) - Number(a.mid ?? 0));

    return <TableCard title="All Mid Prices" subtitle={`${rows.length} symbols`} columns={["coin", "mid"]} rows={rows} />;
  }

  if (presetId === "meta" && response && typeof response === "object" && !Array.isArray(response)) {
    const meta = response as { universe?: Array<Record<string, unknown>> };
    const universe = extractDisplayRows(meta.universe ?? []);
    if (universe.length) {
      return (
        <TableCard
          title="Universe Metadata"
          subtitle={`${universe.length} assets`}
          columns={getColumns(universe, ["name", "maxLeverage", "szDecimals", "onlyIsolated", "isDelisted"])}
          rows={universe}
        />
      );
    }
  }

  if (presetId === "l2Book" && response && typeof response === "object" && !Array.isArray(response)) {
    const payload = response as { levels?: unknown[] };
    const levels = Array.isArray(payload.levels) ? payload.levels : [];
    const bids = extractDisplayRows(Array.isArray(levels[0]) ? (levels[0] as unknown[]) : []);
    const asks = extractDisplayRows(Array.isArray(levels[1]) ? (levels[1] as unknown[]) : []);

    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <TableCard title="Order Book Bids" subtitle={`${bids.length} levels`} columns={getColumns(bids, ["px", "sz", "n"])} rows={bids} />
        <TableCard title="Order Book Asks" subtitle={`${asks.length} levels`} columns={getColumns(asks, ["px", "sz", "n"])} rows={asks} />
      </div>
    );
  }

  if (presetId === "candleSnapshot" && Array.isArray(response)) {
    const rows = extractDisplayRows(response);
    return (
      <TableCard
        title="Candles"
        subtitle={`${rows.length} rows`}
        columns={getColumns(rows, ["t", "T", "o", "h", "l", "c", "v", "n"])}
        rows={rows}
      />
    );
  }

  if (["userFills", "userFillsByTime", "userTwapSliceFills"].includes(presetId) && Array.isArray(response)) {
    const rows = (response as WalletTaggedFill[])
      .filter((fill) => matchesFillDirection(fill, fillDirection))
      .map((fill) => {
        const px = Number(fill.px ?? 0);
        const sz = Number(fill.sz ?? 0);
        const notionalValue = px && sz ? px * sz : 0;
        return {
          time: formatTs(fill.time),
          timeValue: Number(fill.time ?? 0),
          wallet: fill.wallet,
          coin: fill.coin,
          dir: fill.dir,
          side: fill.side,
          px: fill.px,
          sz: fill.sz,
          notionalValue,
          notional: notionalValue ? formatUsd(notionalValue) : "-",
          pnl: fill.closedPnl,
          fee: fill.fee,
          oid: fill.oid,
        };
      })
      .sort((a, b) => {
        if (fillSort === "volumeDesc") return b.notionalValue - a.notionalValue;
        if (fillSort === "volumeAsc") return a.notionalValue - b.notionalValue;
        return b.timeValue - a.timeValue;
      })
      .map(({ timeValue: _timeValue, notionalValue: _notionalValue, ...row }) => row);

    const hasWalletColumn = rows.some((row) => Boolean(row.wallet));
    const walletsWithEntries = hasWalletColumn ? new Set(rows.map((row) => row.wallet).filter(Boolean)).size : 0;

    return (
      <TableCard
        title={hasWalletColumn ? "Wallet Day Entries" : "User Fills"}
        subtitle={hasWalletColumn ? `${walletsWithEntries} wallets · ${rows.length} fills` : `${rows.length} fills`}
        columns={hasWalletColumn ? ["wallet", "time", "coin", "dir", "side", "px", "sz", "notional", "pnl", "fee", "oid"] : ["time", "coin", "dir", "side", "px", "sz", "notional", "pnl", "fee", "oid"]}
        rows={rows}
      />
    );
  }

  if (["openOrders", "frontendOpenOrders", "historicalOrders"].includes(presetId) && Array.isArray(response)) {
    const rows = extractDisplayRows(response).map((row) => ({
      ...row,
      side: formatOrderSide(row.side),
      timestamp: formatTs(Number(row.timestamp ?? row.time ?? 0)),
    }));
    return (
      <TableCard
        title="Orders"
        subtitle={`${rows.length} rows`}
        columns={getColumns(rows, ["coin", "side", "sz", "origSz", "limitPx", "oid", "timestamp", "orderType", "triggerPx", "isPositionTpsl"])}
        rows={rows}
      />
    );
  }

  if (presetId === "subAccounts" && Array.isArray(response)) {
    const rows = (response as Array<Record<string, unknown>>).map((item) => {
      const ch = (item.clearinghouseState ?? {}) as Record<string, unknown>;
      const marginSummary = (ch.marginSummary ?? {}) as Record<string, unknown>;
      return {
        name: item.name,
        subAccountUser: item.subAccountUser,
        master: item.master,
        accountValue: marginSummary.accountValue,
        totalRawUsd: marginSummary.totalRawUsd,
        withdrawable: ch.withdrawable,
        time: formatTs(Number(ch.time ?? 0)),
      };
    });
    return (
      <TableCard
        title="Sub Accounts"
        subtitle={`${rows.length} rows`}
        columns={getColumns(rows, ["name", "subAccountUser", "master", "accountValue", "totalRawUsd", "withdrawable", "time"])}
        rows={rows}
      />
    );
  }

  if (presetId === "portfolio" && Array.isArray(response)) {
    const rows = response
      .filter((entry): entry is [string, Record<string, unknown>] => Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string" && typeof entry[1] === "object" && entry[1] !== null)
      .map(([period, stats]) => {
        const accountValue = summarizeSeries(stats.accountValueHistory);
        const pnl = summarizeSeries(stats.pnlHistory);
        return {
          period,
          vlm: stats.vlm,
          accountPoints: accountValue.points,
          lastAccountValue: accountValue.last,
          pnlPoints: pnl.points,
          lastPnl: pnl.last,
        };
      });

    return <TableCard title="Portfolio Windows" subtitle={`${rows.length} ranges`} columns={["period", "vlm", "accountPoints", "lastAccountValue", "pnlPoints", "lastPnl"]} rows={rows} />;
  }

  if (presetId === "referral" && response && typeof response === "object" && !Array.isArray(response)) {
    const payload = response as Record<string, unknown>;
    const referrerState = (payload.referrerState ?? {}) as Record<string, unknown>;
    const data = (referrerState.data ?? {}) as Record<string, unknown>;
    const states = extractDisplayRows(data.referralStates ?? []);
    return (
      <div className="grid gap-4">
        <KeyValueCard
          title="Referral Summary"
          entries={[
            ["cumVlm", payload.cumVlm],
            ["unclaimedRewards", payload.unclaimedRewards],
            ["claimedRewards", payload.claimedRewards],
            ["builderRewards", payload.builderRewards],
            ["referredBy", payload.referredBy],
          ]}
        />
        {states.length ? (
          <TableCard
            title="Referral States"
            subtitle={`${states.length} referrals`}
            columns={getColumns(states, ["user", "timeJoined", "cumVlm", "cumRewardedFeesSinceReferred", "cumFeesRewardedToReferrer"])}
            rows={states}
          />
        ) : null}
      </div>
    );
  }

  if (presetId === "userFees" && response && typeof response === "object" && !Array.isArray(response)) {
    const payload = response as Record<string, unknown>;
    const dailyRows = extractDisplayRows(payload.dailyUserVlm ?? []);
    return (
      <div className="grid gap-4">
        <KeyValueCard
          title="Fee Summary"
          entries={[
            ["userCrossRate", payload.userCrossRate],
            ["userAddRate", payload.userAddRate],
            ["userSpotCrossRate", payload.userSpotCrossRate],
            ["userSpotAddRate", payload.userSpotAddRate],
            ["activeReferralDiscount", payload.activeReferralDiscount],
            ["activeStakingDiscount", payload.activeStakingDiscount],
          ]}
        />
        <TableCard
          title="Daily User Volume"
          subtitle={`${dailyRows.length} days`}
          columns={getColumns(dailyRows, ["date", "userCross", "userAdd", "exchange"])}
          rows={dailyRows}
        />
      </div>
    );
  }

  if (["delegations", "delegatorHistory", "delegatorRewards", "userVaultEquities"].includes(presetId) && Array.isArray(response)) {
    const rows = extractDisplayRows(response);
    return (
      <TableCard
        title="History"
        subtitle={`${rows.length} rows`}
        columns={getColumns(rows, ["time", "validator", "amount", "delegated", "reward", "vaultAddress", "name"])}
        rows={rows}
      />
    );
  }

  if (presetId === "approvedBuilders" && response && typeof response === "object" && !Array.isArray(response)) {
    const rows = Object.entries(response as Record<string, unknown>).map(([builder, fee]) => ({ builder, fee }));
    return <TableCard title="Approved Builders" subtitle={`${rows.length} builders`} columns={["builder", "fee"]} rows={rows} />;
  }

  if (presetId === "allBorrowLendReserveStates") {
    if (Array.isArray(response)) {
      const rows = extractDisplayRows(response);
      return <TableCard title="Borrow/Lend Reserves" subtitle={`${rows.length} rows`} columns={getColumns(rows, ["token", "name", "totalSupplied", "totalBorrowed", "rate"])} rows={rows} />;
    }
    if (response && typeof response === "object") {
      const rows = Object.entries(response as Record<string, unknown>).map(([token, state]) => ({ token, state }));
      return <TableCard title="Borrow/Lend Reserves" subtitle={`${rows.length} rows`} columns={["token", "state"]} rows={rows} />;
    }
  }

  if (
    [
      "delegatorSummary",
      "userRateLimit",
      "orderStatus",
      "borrowLendUserState",
      "userDexAbstraction",
      "userAbstraction",
      "alignedQuoteTokenInfo",
      "borrowLendReserveState",
    ].includes(presetId) &&
    response &&
    typeof response === "object" &&
    !Array.isArray(response)
  ) {
    return <KeyValueCard title="Response Summary" entries={Object.entries(response as Record<string, unknown>)} />;
  }

  if (presetId === "userRole") {
    if (typeof response === "string") {
      return <KeyValueCard title="User Role" entries={[["role", response]]} />;
    }
    if (response && typeof response === "object" && !Array.isArray(response)) {
      return <KeyValueCard title="User Role" entries={Object.entries(response as Record<string, unknown>)} />;
    }
  }

  if (Array.isArray(response)) {
    const rows = extractDisplayRows(response);
    if (rows.length) {
      return <TableCard title="Response Table" subtitle={`${rows.length} rows`} columns={getColumns(rows, [])} rows={rows} />;
    }
  }

  if (response && typeof response === "object") {
    return <KeyValueCard title="Response Summary" entries={Object.entries(response as Record<string, unknown>)} />;
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4 font-mono text-[12px] text-zinc-200">
      {String(response)}
    </div>
  );
}

export default function HyperliquidPage() {
  const { theme } = useUi();
  const accent = getThemeAccent(theme);
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESET.id);
  const [walletsText, setWalletsText] = useState(DEMO_USER);
  const [dateText, setDateText] = useState(() => new Date().toISOString().slice(0, 10));
  const [coin, setCoin] = useState(DEFAULT_COIN);
  const [interval, setInterval] = useState(DEFAULT_INTERVAL);
  const [oidText, setOidText] = useState("1");
  const [tokenText, setTokenText] = useState(String(DEFAULT_TOKEN_INDEX));
  const [fillDirection, setFillDirection] = useState<FillDirectionFilter>("all");
  const [fillSort, setFillSort] = useState<FillSortMode>("volumeDesc");
  const [responseData, setResponseData] = useState<unknown>(null);
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);

  const parsedWallets = useMemo(() => parseWallets(walletsText), [walletsText]);
  const primaryWallet = parsedWallets[0] ?? DEMO_USER;
  const dateRange = useMemo(() => toUtcDayRange(dateText), [dateText]);
  const activePreset = ALL_PRESETS.find((preset) => preset.id === activePresetId) ?? DEFAULT_PRESET;
  const oid = Number(oidText);
  const token = Number(tokenText);

  const canRun = useMemo(() => {
    if (activePreset.mode === "wallet" || activePreset.mode === "walletDate" || activePreset.mode === "walletOid") {
      if (!parsedWallets.length) return false;
    }
    if (activePreset.mode === "walletDate" && !dateRange) return false;
    if (activePreset.mode === "walletOid" && !Number.isFinite(oid)) return false;
    if (activePreset.mode === "token" && !Number.isFinite(token)) return false;
    return true;
  }, [activePreset.mode, dateRange, oid, parsedWallets.length, token]);

  async function runRequest() {
    if (!canRun) return;

    setLoading(true);
    setErrorText("");
    try {
      if (activePreset.id === "walletAnalysis") {
        const [fills, openOrders] = await Promise.all([
          postHyperliquidInfo<HyperliquidUserFill[]>(
            {
              type: "userFills",
              user: primaryWallet,
              aggregateByTime: true,
            } as any
          ),
          postHyperliquidInfo<Record<string, unknown>[]>(
            {
              type: "openOrders",
              user: primaryWallet,
            } as any
          ),
        ]);

        const allFills = (fills ?? []).slice().sort((a, b) => Number(b.time ?? 0) - Number(a.time ?? 0));
        const now = Date.now();
        const volumeForWindow = (ms: number) =>
          allFills.reduce((sum, fill) => {
            const time = Number(fill.time ?? 0);
            if (ms !== Number.POSITIVE_INFINITY && now - time > ms) return sum;
            const px = Number(fill.px ?? 0);
            const sz = Number(fill.sz ?? 0);
            const value = px * sz;
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0);

        const closedPnlFills = allFills.filter((fill) => Number(fill.closedPnl ?? 0) !== 0);
        const wins = closedPnlFills.filter((fill) => Number(fill.closedPnl ?? 0) > 0).length;
        const totalClosed = closedPnlFills.length;
        const realizedPnl = allFills.reduce((sum, fill) => sum + Number(fill.closedPnl ?? 0), 0);
        const avgTradeValue =
          allFills.length > 0
            ? allFills.reduce((sum, fill) => {
                const px = Number(fill.px ?? 0);
                const sz = Number(fill.sz ?? 0);
                const value = px * sz;
                return sum + (Number.isFinite(value) ? value : 0);
              }, 0) / allFills.length
            : 0;

        const sideNotional = allFills.reduce<{ buy: number; sell: number }>(
          (acc, fill) => {
            const px = Number(fill.px ?? 0);
            const sz = Number(fill.sz ?? 0);
            const value = Number.isFinite(px * sz) ? px * sz : 0;
            const side = getFillSide(fill);
            if (side === "BUY") acc.buy += value;
            if (side === "SELL") acc.sell += value;
            return acc;
          },
          { buy: 0, sell: 0 }
        );

        const coinNotional = new Map<string, number>();
        for (const fill of allFills) {
          const coin = String(fill.coin ?? "-");
          const px = Number(fill.px ?? 0);
          const sz = Number(fill.sz ?? 0);
          const value = Number.isFinite(px * sz) ? px * sz : 0;
          coinNotional.set(coin, (coinNotional.get(coin) ?? 0) + value);
        }

        const topCoins = [...coinNotional.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([coin]) => coin)
          .join(", ") || "-";

        const analysis: WalletAnalysisResult = {
          kind: "walletAnalysis",
          wallet: primaryWallet,
          openOrders: (openOrders ?? []).length,
          totalTrades: allFills.length,
          winRate: totalClosed > 0 ? `${formatNumber((wins / totalClosed) * 100, 1)}%` : "-",
          realizedPnl: formatUsd(realizedPnl),
          avgTradeValue: formatUsd(avgTradeValue),
          volume24h: formatUsd(volumeForWindow(24 * 60 * 60 * 1000)),
          volume7d: formatUsd(volumeForWindow(7 * 24 * 60 * 60 * 1000)),
          volume30d: formatUsd(volumeForWindow(30 * 24 * 60 * 60 * 1000)),
          volumeAll: formatUsd(volumeForWindow(Number.POSITIVE_INFINITY)),
          style: Number(openOrders?.length ?? 0) > 0 || (allFills[0]?.time ? now - Number(allFills[0].time) < 24 * 60 * 60 * 1000 : false) ? "Active" : "Passive",
          bias:
            sideNotional.buy > sideNotional.sell * 1.15
              ? "Long"
              : sideNotional.sell > sideNotional.buy * 1.15
                ? "Short"
                : "Mixed",
          topCoins,
          lastTrade: hoursAgoLabel(Number(allFills[0]?.time ?? 0)),
          tradeHistory: allFills.slice(0, 100).map((fill) => {
            const px = Number(fill.px ?? 0);
            const sz = Number(fill.sz ?? 0);
            const value = Number.isFinite(px * sz) ? px * sz : 0;
            return {
              time: formatTs(fill.time),
              asset: String(fill.coin ?? "-"),
              side: getFillSide(fill),
              size: formatNumber(sz, 4),
              value: formatUsd(value),
              price: formatNumber(px, 6),
              fee: formatUsd(Number(fill.fee ?? 0)),
              pnl: Number(fill.closedPnl ?? 0) === 0 ? "-" : formatUsd(Number(fill.closedPnl ?? 0)),
            };
          }),
        };

        setResponseData(analysis);
        return;
      }

      if (activePreset.id === "userFillsByTime" && parsedWallets.length > 1 && dateRange) {
        const settled = await Promise.allSettled(
          parsedWallets.map(async (wallet) => {
            const fills = await postHyperliquidInfo<HyperliquidUserFill[]>({
              type: "userFillsByTime",
              user: wallet,
              startTime: dateRange.start,
              endTime: dateRange.end,
              aggregateByTime: true,
            } as any);
            return (fills ?? [])
              .filter((fill) => String(fill.dir ?? "").startsWith("Open "))
              .map((fill) => ({ ...fill, wallet }));
          })
        );

        const failures = settled.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
        if (failures.length) {
          setErrorText(String(failures[0].reason?.message ?? failures[0].reason ?? "Wallet scan failed"));
        }

        const merged: WalletScanFill[] = [];
        for (const item of settled) {
          if (item.status === "fulfilled") {
            merged.push(...item.value);
          }
        }

        setResponseData(merged);
        return;
      }

      const request = activePreset.buildRequest({
        wallet: primaryWallet,
        dateRange,
        coin: coin.trim().toUpperCase() || DEFAULT_COIN,
        interval: interval.trim() || DEFAULT_INTERVAL,
        oid,
        token,
      });
      const data = await postHyperliquidInfo(request as any);
      setResponseData(data);
    } catch (error: any) {
      setResponseData(null);
      setErrorText(error?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function findActiveDays() {
    if (activePreset.id !== "userFillsByTime" || parsedWallets.length === 0 || !dateRange) return;

    setLoading(true);
    setErrorText("");
    try {
      const scanDays = 30;
      const rows: ActiveDaySummary[] = [];

      for (let offset = 0; offset < scanDays; offset += 1) {
        const start = dateRange.start - offset * 24 * 60 * 60 * 1000;
        const end = start + 24 * 60 * 60 * 1000 - 1;
        const settled = await Promise.allSettled(
          parsedWallets.map(async (wallet) => {
            const fills = await postHyperliquidInfo<HyperliquidUserFill[]>({
              type: "userFillsByTime",
              user: wallet,
              startTime: start,
              endTime: end,
              aggregateByTime: true,
            } as any);

            const openingFills = (fills ?? []).filter(
              (fill) => String(fill.dir ?? "").startsWith("Open ") && matchesFillDirection(fill, fillDirection)
            );
            const totalNotional = openingFills.reduce((sum, fill) => {
              const px = Number(fill.px ?? 0);
              const sz = Number(fill.sz ?? 0);
              return sum + (Number.isFinite(px * sz) ? px * sz : 0);
            }, 0);

            return { wallet, fills: openingFills.length, totalNotional };
          })
        );

        const perWallet = settled
          .filter((item): item is PromiseFulfilledResult<{ wallet: string; fills: number; totalNotional: number }> => item.status === "fulfilled")
          .map((item) => item.value)
          .filter((item) => item.fills > 0);

        if (perWallet.length > 0) {
          const sortedWallets = [...perWallet].sort((a, b) => b.totalNotional - a.totalNotional);
          rows.push({
            date: formatDateOnlyUtc(start),
            wallets: perWallet.length,
            fills: perWallet.reduce((sum, item) => sum + item.fills, 0),
            totalNotional: perWallet.reduce((sum, item) => sum + item.totalNotional, 0),
            topWallet: sortedWallets[0]?.wallet ?? "-",
            topWalletNotional: sortedWallets[0]?.totalNotional ?? 0,
          });
        }
      }

      setResponseData({
        kind: "activeDaysScan",
        rows,
        scannedDays: 30,
      } satisfies ActiveDaysScanResult);
    } catch (error: any) {
      setResponseData(null);
      setErrorText(error?.message ?? "Active day scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function findWorkingWallets() {
    if (parsedWallets.length === 0) return;

    setLoading(true);
    setErrorText("");
    try {
      const settled = await Promise.allSettled(
        parsedWallets.map(async (wallet) => {
          const fills = await postHyperliquidInfo<HyperliquidUserFill[]>({
            type: "userFills",
            user: wallet,
            aggregateByTime: true,
          } as any);
          return {
            wallet,
            fills: (fills ?? []).length,
          };
        })
      );

      const rows = settled
        .filter((item): item is PromiseFulfilledResult<{ wallet: string; fills: number }> => item.status === "fulfilled")
        .map((item) => item.value)
        .filter((item) => item.fills > 0)
        .sort((a, b) => b.fills - a.fills);

      if (rows.length > 0) {
        setWalletsText(rows.map((row) => row.wallet).join("\n"));
      }

      setResponseData({
        kind: "workingWallets",
        rows,
        scannedWallets: parsedWallets.length,
      } satisfies WorkingWalletsResult);
    } catch (error: any) {
      setResponseData(null);
      setErrorText(error?.message ?? "Working wallet scan failed");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setActivePresetId(DEFAULT_PRESET.id);
    setWalletsText(DEMO_USER);
    setDateText(new Date().toISOString().slice(0, 10));
    setCoin(DEFAULT_COIN);
    setInterval(DEFAULT_INTERVAL);
    setOidText("1");
    setTokenText(String(DEFAULT_TOKEN_INDEX));
    setFillDirection("all");
    setFillSort("volumeDesc");
    setResponseData(null);
    setErrorText("");
  }

  return (
    <div className={`min-h-screen bg-transparent text-zinc-100 ${accent.selection} selection:text-white`}>
      <main className="mx-auto flex max-w-[1650px] flex-col gap-4 px-4 py-4">
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-black/30 backdrop-blur-[2px]">
          <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
            <div className="max-w-3xl">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.24em] text-zinc-500">Hyperliquid</div>
              <h1 className="mt-2 text-lg font-semibold uppercase tracking-[0.18em] text-white">Info Browser</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Trading, account, staking, borrow/lend and wallet-day trade views in the `ARBITRAGE SCANNER` control style.
              </p>
            </div>

            <div className="rounded-lg border border-white/5 bg-black/30 px-4 py-3 text-right">
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">Endpoint</div>
              <div className={`mt-1 text-[12px] font-mono ${accent.text}`}>POST /info</div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-black/30 backdrop-blur-[2px]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">Request Builder</div>
          </div>

          <div className="space-y-5 px-5 py-5">
            {PRESET_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">{group.title}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {group.presets.map((preset) => {
                    const active = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setActivePresetId(preset.id)}
                        title={preset.description}
                        className={
                          active
                            ? `inline-flex h-7 items-center justify-center rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none transition-all ${accent.active}`
                            : "inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                        }
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.72fr_0.72fr_0.78fr]">
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Wallets</span>
                <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                  <button
                    type="button"
                    onClick={() => setWalletsText(PUBLIC_WALLET_LIST)}
                    className={`inline-flex h-7 items-center justify-center rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none transition-all ${accent.active}`}
                  >
                    Top Wallets
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletsText(DEMO_USER)}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletsText("")}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                  >
                    Clear
                  </button>
                </div>
                <textarea
                  value={walletsText}
                  onChange={(e) => setWalletsText(e.target.value)}
                  placeholder={"0x...\n0x..."}
                  spellCheck={false}
                  className={`min-h-[112px] rounded-2xl border border-white/5 bg-black/30 px-4 py-3 font-mono text-[12px] leading-6 text-zinc-100 outline-none transition-colors ${accent.focus}`}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Date UTC</span>
                <input
                  type="date"
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value)}
                  className={`h-12 rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-[12px] text-zinc-100 outline-none transition-colors ${accent.focus}`}
                />
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">
                  Used by fills and candles
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Coin / Interval</span>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={coin}
                    onChange={(e) => setCoin(e.target.value.toUpperCase())}
                    className={`h-12 rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-[12px] text-zinc-100 outline-none transition-colors ${accent.focus}`}
                  />
                  <input
                    type="text"
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className={`h-12 rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-[12px] text-zinc-100 outline-none transition-colors ${accent.focus}`}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Token / OID</span>
                <div className="space-y-2">
                  <input
                    type="number"
                    value={tokenText}
                    onChange={(e) => setTokenText(e.target.value)}
                    className={`h-12 rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-[12px] text-zinc-100 outline-none transition-colors ${accent.focus}`}
                  />
                  <input
                    type="number"
                    value={oidText}
                    onChange={(e) => setOidText(e.target.value)}
                    className={`h-12 rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-[12px] text-zinc-100 outline-none transition-colors ${accent.focus}`}
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Direction</span>
                <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                  {[
                    { key: "all", label: "ALL" },
                    { key: "long", label: "LONG" },
                    { key: "short", label: "SHORT" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFillDirection(item.key as FillDirectionFilter)}
                      className={
                        fillDirection === item.key
                          ? `inline-flex h-7 items-center justify-center rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none transition-all ${accent.active}`
                          : "inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Sort</span>
                <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
                  {[
                    { key: "volumeDesc", label: "VOL DESC" },
                    { key: "volumeAsc", label: "VOL ASC" },
                    { key: "timeDesc", label: "LATEST" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFillSort(item.key as FillSortMode)}
                      className={
                        fillSort === item.key
                          ? `inline-flex h-7 items-center justify-center rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none transition-all ${accent.active}`
                          : "inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr_220px]">
              <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Active Request</div>
                <div className="mt-2 text-sm text-zinc-200">{activePreset.description}</div>
                <div className={`mt-3 font-mono text-[12px] break-all ${accent.text}`}>
                  {activePreset.mode === "wallet" || activePreset.mode === "walletDate" || activePreset.mode === "walletOid"
                    ? primaryWallet
                    : activePreset.mode === "coin"
                      ? coin.trim().toUpperCase() || DEFAULT_COIN
                      : activePreset.mode === "token"
                        ? `Token ${Number.isFinite(token) ? token : "-"}`
                        : "No wallet required"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Input Notes</div>
                <div className="mt-2 space-y-1 font-mono text-[11px] text-zinc-400">
                  <div>Only the first wallet is used for single-user endpoints.</div>
                  <div>`FILLS BY TIME` scans all wallets in the list and shows only opening trades.</div>
                  <div>`Find Working Wallets` keeps only wallets that return non-empty `LATEST FILLS`.</div>
                  <div>`Find Active Days` checks the last 30 UTC days from the selected date.</div>
                  <div>`Token` is used by quote-token and borrow/lend reserve queries.</div>
                  <div>`OID` is used only for `ORDER STATUS`.</div>
                  <div>`Direction` and `Sort` apply to fills tables, especially day view.</div>
                </div>
              </div>

              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20 self-end">
                <button
                  type="button"
                  onClick={() => void findWorkingWallets()}
                  disabled={loading || parsedWallets.length === 0}
                  className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Find Working Wallets
                </button>
                <button
                  type="button"
                  onClick={() => void findActiveDays()}
                  disabled={loading || activePresetId !== "userFillsByTime" || parsedWallets.length === 0 || !dateRange}
                  className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Find Active Days
                </button>
                <button
                  type="button"
                  onClick={() => void runRequest()}
                  disabled={loading || !canRun}
                  className={`inline-flex h-7 items-center justify-center rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none transition-all disabled:cursor-not-allowed disabled:opacity-50 ${accent.active}`}
                >
                  {loading ? "Loading" : "Run"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-[10px] font-mono font-bold uppercase leading-none text-zinc-400 transition-all hover:text-white hover:bg-white/5"
                >
                  Reset
                </button>
              </div>
            </div>

            {errorText ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 font-mono text-[12px] leading-6 text-red-200">
                {errorText}
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-black/30 backdrop-blur-[2px]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">Response</div>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
              {loading
                ? `Waiting for ${activePreset.label}...`
                : responseData
                  ? `${activePreset.label} response received`
                  : "No response yet"}
            </div>

            <ResponseView
              presetId={activePresetId}
              response={responseData}
              fillDirection={fillDirection}
              fillSort={fillSort}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
