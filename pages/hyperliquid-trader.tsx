import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { postHyperliquidInfo, type HyperliquidUserFill } from "@/lib/hyperliquidClient";
import { useUi } from "@/components/UiProvider";

type ChartRange = "day" | "week" | "month" | "allTime";
type TraderTab = "positions" | "openOrders" | "tradeHistory";

type WalletDetailData = {
  wallet: string;
  perpsTotalValue: number;
  unrealizedPnl: number;
  pnl30d: number;
  roi30d: number;
  marginUsed: number;
  availableMargin: number;
  winRate: string;
  sharpeRatio: string;
  maxDrawdown: string;
  totalTrades: number;
  maxLeverage: string;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  volumeAllTime: number;
  style: string;
  bias: string;
  topCoins: string;
  avgHold: string;
  lastTrade: string;
  chartSeries: Record<ChartRange, Array<{ time: number; value: number }>>;
  positions: Array<Record<string, unknown>>;
  openOrders: Array<Record<string, unknown>>;
  tradeHistory: Array<Record<string, unknown>>;
};

function coinAccent(coin: string) {
  const key = coin.toUpperCase();
  if (["BTC", "SOL", "XRP", "SUI"].includes(key)) return "bg-cyan-400";
  return "bg-rose-400";
}

const DEMO_WALLET = "0xa5b0edf6b55128e0ddae8e51ac538c3188401d41";

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function txt(value: unknown) {
  return String(value ?? "");
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function ts(ms: number | null | undefined) {
  if (!ms) return "-";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function ago(ms: number | null | undefined) {
  if (!ms) return "-";
  const hours = Math.max(0, (Date.now() - ms) / 36e5);
  if (hours < 1) return "<1h ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function metricValue(series: unknown) {
  if (!Array.isArray(series) || !series.length) return 0;
  const last = series[series.length - 1];
  return Array.isArray(last) ? num(last[1]) : 0;
}

function chartPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function MiniChart({ data }: { data: Array<{ time: number; value: number }> }) {
  const width = 1100;
  const height = 280;
  const padding = 16;
  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, 1);
  const points = data.map((d, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((d.value - min) / span) * (height - padding * 2),
  }));
  const line = chartPath(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` : "";

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/5 bg-black/20 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full">
        <defs>
          <linearGradient id="hlTraderArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(248,113,113,0.35)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0.02)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#hlTraderArea)" />
        <path d={line} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StatPair({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm text-zinc-300">
      <span className="border-b border-dashed border-white/10 pb-1 text-zinc-400">{label}</span>
      <span className={accent}>{value}</span>
    </div>
  );
}

function AvatarGlyph({ wallet }: { wallet: string }) {
  const chars = wallet.replace(/^0x/, "").slice(0, 36).split("");
  return (
    <div className="grid h-14 w-14 grid-cols-6 gap-[1px] overflow-hidden rounded-full border border-white/10 bg-black/40 p-[3px]">
      {chars.map((char, idx) => (
        <span
          key={`${char}-${idx}`}
          className={idx % 3 === 0 ? "bg-zinc-500/70" : idx % 2 === 0 ? "bg-zinc-300/60" : "bg-zinc-700/70"}
        />
      ))}
    </div>
  );
}

export default function HyperliquidTraderPage() {
  const router = useRouter();
  const { theme } = useUi();
  const [wallet, setWallet] = useState(DEMO_WALLET);
  const [activeRange, setActiveRange] = useState<ChartRange>("month");
  const [activeTab, setActiveTab] = useState<TraderTab>("positions");
  const [data, setData] = useState<WalletDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof router.query.wallet === "string" && router.query.wallet.startsWith("0x")) {
      setWallet(router.query.wallet);
    }
  }, [router.query.wallet]);

  async function loadProfile() {
    if (!wallet.trim()) return;
    setLoading(true);
    setError("");
    try {
      const user = wallet.trim();
      const [clearinghouseState, portfolio, openOrders, userFills] = await Promise.all([
        postHyperliquidInfo<Record<string, any>>({ type: "clearinghouseState", user } as any),
        postHyperliquidInfo<Array<[string, Record<string, any>]>>({ type: "portfolio", user } as any),
        postHyperliquidInfo<Array<Record<string, any>>>({ type: "openOrders", user } as any),
        postHyperliquidInfo<HyperliquidUserFill[]>({ type: "userFills", user, aggregateByTime: true } as any),
      ]);

      const periodMap = new Map((portfolio ?? []).map((entry) => [entry[0], entry[1]]));
      const monthStats = periodMap.get("month") ?? periodMap.get("perpMonth") ?? {};
      const weekStats = periodMap.get("week") ?? periodMap.get("perpWeek") ?? {};
      const dayStats = periodMap.get("day") ?? periodMap.get("perpDay") ?? {};
      const allTimeStats = periodMap.get("allTime") ?? periodMap.get("perpAllTime") ?? {};

      const positions = (clearinghouseState?.assetPositions ?? []).map((item: any) => {
        const p = item.position ?? item;
        const size = Math.abs(num(p.szi));
        const marginUsed = num(p.marginUsed);
        const unrealizedPnl = num(p.unrealizedPnl);
        const pnlPct = marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0;
        const leverage = Math.max(1, Math.round(num(p.leverage?.value ?? p.leverage ?? p.maxLeverage ?? 0)));
        return {
          coin: txt(p.coin),
          leverage: `${leverage}x`,
          size: size.toFixed(4),
          value: usd(num(p.positionValue)),
          entry: usd(num(p.entryPx)),
          mark: usd(num(p.markPx ?? p.markPxOverride ?? p.markPxOracle)),
          pnl: usd(unrealizedPnl),
          pnlPct: pnlPct === 0 ? "-" : `(${pct(pnlPct)})`,
          liqPrice: num(p.liquidationPx) > 0 ? usd(num(p.liquidationPx)) : "-",
          margin: usd(marginUsed),
          tpSl: "-",
          side: num(p.szi) >= 0 ? "LONG" : "SHORT",
        };
      });

      const fills = (userFills ?? []).slice().sort((a, b) => num(b.time) - num(a.time));
      const openOrderRows = (openOrders ?? []).map((o) => ({
        coin: txt(o.coin),
        side: txt(o.side).toUpperCase() === "B" ? "BUY" : "SELL",
        size: num(o.sz).toFixed(4),
        value: usd(num(o.sz) * num(o.limitPx)),
        entry: usd(num(o.limitPx)),
        mark: usd(num(o.limitPx)),
        pnl: "-",
        liqPrice: "-",
        margin: "-",
        tpSl: o.isPositionTpsl ? "TP/SL" : "-",
        time: ts(num(o.timestamp)),
      }));

      const tradeHistory = fills.slice(0, 150).map((fill) => ({
        time: ts(num(fill.time)),
        asset: txt(fill.coin),
        side: txt(fill.side).toUpperCase() === "B" || txt(fill.dir).includes("Long") ? "BUY" : "SELL",
        size: num(fill.sz).toFixed(4),
        value: usd(num(fill.sz) * num(fill.px)),
        price: usd(num(fill.px)),
        fee: usd(num(fill.fee)),
        pnl: num(fill.closedPnl) === 0 ? "-" : usd(num(fill.closedPnl)),
      }));

      const sideTotals = fills.reduce<{ buy: number; sell: number }>(
        (acc, fill) => {
          const value = num(fill.sz) * num(fill.px);
          const buy = txt(fill.side).toUpperCase() === "B" || txt(fill.dir).includes("Long");
          if (buy) acc.buy += value;
          else acc.sell += value;
          return acc;
        },
        { buy: 0, sell: 0 }
      );

      const coinTotals = new Map<string, number>();
      fills.forEach((fill) => {
        const coin = txt(fill.coin);
        coinTotals.set(coin, (coinTotals.get(coin) ?? 0) + num(fill.sz) * num(fill.px));
      });

      const closed = fills.filter((fill) => num(fill.closedPnl) !== 0);
      const wins = closed.filter((fill) => num(fill.closedPnl) > 0).length;
      const totalPnl30d = metricValue(monthStats.pnlHistory);
      const monthAccount = monthStats.accountValueHistory as unknown[];
      const monthStart = Array.isArray(monthAccount) && monthAccount.length ? num((monthAccount[0] as any[])[1]) : 0;

      setData({
        wallet: user,
        perpsTotalValue: num(clearinghouseState?.marginSummary?.accountValue),
        unrealizedPnl: positions.reduce((sum, p) => sum + num(String(p.pnl).replace(/[^0-9.-]/g, "")), 0),
        pnl30d: totalPnl30d,
        roi30d: monthStart > 0 ? (totalPnl30d / monthStart) * 100 : 0,
        marginUsed: num(clearinghouseState?.marginSummary?.totalMarginUsed),
        availableMargin: num(clearinghouseState?.withdrawable),
        winRate: closed.length ? `${((wins / closed.length) * 100).toFixed(1)}%` : "-",
        sharpeRatio: "-",
        maxDrawdown: "-",
        totalTrades: fills.length,
        maxLeverage: positions.length ? `${Math.max(...positions.map((p) => num(String(p.margin).replace(/[^0-9.-]/g, ""))))}` : "-",
        volume24h: num(dayStats.vlm),
        volume7d: num(weekStats.vlm),
        volume30d: num(monthStats.vlm),
        volumeAllTime: num(allTimeStats.vlm),
        style: openOrderRows.length > 0 || (fills[0]?.time ? Date.now() - num(fills[0].time) < 86400000 : false) ? "Active" : "Passive",
        bias: sideTotals.buy > sideTotals.sell * 1.15 ? "Long" : sideTotals.sell > sideTotals.buy * 1.15 ? "Short" : "Mixed",
        topCoins: [...coinTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([coin]) => coin).join(", ") || "-",
        avgHold: "-",
        lastTrade: ago(num(fills[0]?.time)),
        chartSeries: {
          day: ((dayStats.accountValueHistory ?? []) as any[]).map((p) => ({ time: num(p[0]), value: num(p[1]) })),
          week: ((weekStats.accountValueHistory ?? []) as any[]).map((p) => ({ time: num(p[0]), value: num(p[1]) })),
          month: ((monthStats.accountValueHistory ?? []) as any[]).map((p) => ({ time: num(p[0]), value: num(p[1]) })),
          allTime: ((allTimeStats.accountValueHistory ?? []) as any[]).map((p) => ({ time: num(p[0]), value: num(p[1]) })),
        },
        positions,
        openOrders: openOrderRows,
        tradeHistory,
      });
    } catch (e: any) {
      setData(null);
      setError(e?.message ?? "Profile load failed");
    } finally {
      setLoading(false);
    }
  }

  const table = useMemo(() => {
    if (!data) return [];
    if (activeTab === "positions") return data.positions;
    if (activeTab === "openOrders") return data.openOrders;
    return data.tradeHistory;
  }, [activeTab, data]);

  return (
    <div className="min-h-screen bg-transparent px-6 py-6 text-zinc-100">
      <div className="mx-auto max-w-[1320px] space-y-6">
        <div className="rounded-[30px] border border-white/5 bg-black/30 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input value={wallet} onChange={(e) => setWallet(e.target.value)} className="h-11 min-w-[380px] rounded-2xl border border-white/5 bg-black/30 px-4 font-mono text-sm outline-none" />
            <button type="button" onClick={() => void loadProfile()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-mono font-bold uppercase">Load Trader</button>
          </div>
          {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        </div>

        {data ? (
          <div className="space-y-7 rounded-[36px] border border-white/5 bg-black/30 p-6">
            <div className="text-[12px] text-zinc-500">
              <span className="text-zinc-400">Leaderboard</span>
              <span className="mx-2 text-zinc-600">›</span>
              <span className="text-white">Trader Details</span>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <AvatarGlyph wallet={data.wallet} />
                <div>
                  <div className="text-[36px] font-semibold text-white">{data.wallet.slice(0, 6)}...{data.wallet.slice(-4)}</div>
                  <div className="mt-1 font-mono text-sm text-zinc-400">{data.wallet}</div>
                  <div className="mt-8 text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">Perps Total Value</div>
                  <div className="mt-2 text-[56px] leading-none text-white">{usd(data.perpsTotalValue)}</div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-end gap-2">
                  <button type="button" className="h-10 rounded-full border border-white/10 bg-black/30 px-4 text-[11px] font-mono font-bold uppercase text-zinc-300">Share</button>
                  <button type="button" className="h-10 rounded-full border border-white/10 bg-black/30 px-4 text-[11px] font-mono font-bold uppercase text-zinc-300">Search</button>
                  <button type="button" className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[11px] font-mono font-bold uppercase text-zinc-100">Copy Trader</button>
                </div>
                <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
                  <div><div className="text-[11px] text-zinc-500">Unrealized PnL</div><div className="mt-2 text-[18px] text-cyan-300">{usd(data.unrealizedPnl)}</div></div>
                  <div><div className="text-[11px] text-zinc-500">30d PnL</div><div className="mt-2 text-[18px] text-cyan-300">{usd(data.pnl30d)} <span className="ml-2">{pct(data.roi30d)}</span></div></div>
                  <div><div className="text-[11px] text-zinc-500">Margin Used</div><div className="mt-2 text-[18px] text-white">{usd(data.marginUsed)}</div></div>
                  <div><div className="text-[11px] text-zinc-500">Available Margin</div><div className="mt-2 text-[18px] text-white">{usd(data.availableMargin)}</div></div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {(["day", "week", "month", "allTime"] as ChartRange[]).map((range) => (
                <button key={range} type="button" onClick={() => setActiveRange(range)} className={activeRange === range ? "rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white" : "rounded-full px-4 py-2 text-sm text-zinc-400"}>
                  {range === "day" ? "1 Day" : range === "week" ? "7 Days" : range === "month" ? "90 Days" : "All Time"}
                </button>
              ))}
            </div>

            <MiniChart data={data.chartSeries[activeRange]} />

            <div className="grid gap-10 xl:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold">Trading Performance</div>
                  <div className="text-[12px] text-zinc-500">30 Days</div>
                </div>
                <div className="space-y-2">
                  <StatPair label="Win Rate" value={data.winRate} />
                  <StatPair label="Sharpe Ratio" value={data.sharpeRatio} />
                  <StatPair label="Max Drawdown" value={data.maxDrawdown} />
                  <StatPair label="Total Trades" value={String(data.totalTrades)} />
                  <StatPair label="Max Leverage" value={data.maxLeverage} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-[15px] font-semibold">Volume</div>
                <div className="space-y-2">
                  <StatPair label="24h Volume" value={usd(data.volume24h)} accent="text-white" />
                  <StatPair label="7d Volume" value={usd(data.volume7d)} accent="text-white" />
                  <StatPair label="30d Volume" value={usd(data.volume30d)} accent="text-white" />
                  <StatPair label="All-Time Volume" value={usd(data.volumeAllTime)} accent="text-white" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-[15px] font-semibold">Trading Style</div>
                <div className="space-y-2">
                  <StatPair label="Style" value={data.style} accent={data.style === "Active" ? "text-cyan-300" : "text-zinc-200"} />
                  <StatPair label="Bias" value={data.bias} accent={data.bias === "Long" ? "text-emerald-300" : data.bias === "Short" ? "text-rose-300" : "text-zinc-200"} />
                  <StatPair label="Top Coins" value={data.topCoins} />
                  <StatPair label="Avg Hold" value={data.avgHold} />
                  <StatPair label="Last Trade" value={data.lastTrade} accent="text-zinc-100" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-6 border-b border-white/10 text-[14px]">
                {[
                  { key: "positions", label: `Positions (${data.positions.length})` },
                  { key: "openOrders", label: `Open Orders (${data.openOrders.length})` },
                  { key: "tradeHistory", label: "Trade History" },
                ].map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as TraderTab)} className={activeTab === tab.key ? "border-b border-white pb-3 text-white" : "pb-3 text-zinc-500"}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "positions" ? (
                <div className="overflow-hidden rounded-[24px] border border-white/5 bg-black/20">
                  <div className="overflow-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-white/[0.02]">
                        <tr>
                          {["Coin", "Size", "Value", "Entry", "Mark", "PnL", "Liq. Price", "Margin", "TP / SL"].map((key) => (
                            <th key={key} className="px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {data.positions.map((row, idx) => {
                          const isLong = String(row.side) === "LONG";
                          const pnlPositive = !String(row.pnl).startsWith("-");
                          return (
                            <tr key={idx} className="text-[13px]">
                              <td className="px-4 py-3 font-mono">
                                <div className="flex items-center gap-3">
                                  <span className={`h-8 w-[3px] rounded-full ${coinAccent(String(row.coin))}`} />
                                  <div className="flex items-center gap-2">
                                    <span className="text-[15px] text-zinc-100">{row.coin as any}</span>
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-zinc-300">{row.leverage as any}</span>
                                  </div>
                                </div>
                              </td>
                              <td className={`px-4 py-3 font-mono ${isLong ? "text-cyan-300" : "text-rose-300"}`}>{row.size as any}</td>
                              <td className="px-4 py-3 font-mono text-zinc-100">{row.value as any}</td>
                              <td className="px-4 py-3 font-mono text-zinc-100">{row.entry as any}</td>
                              <td className="px-4 py-3 font-mono text-zinc-100">{row.mark as any}</td>
                              <td className="px-4 py-3 font-mono">
                                <div className={pnlPositive ? "text-cyan-300" : "text-rose-300"}>{row.pnl as any}</div>
                                <div className={pnlPositive ? "text-cyan-300/80" : "text-rose-300/80"}>{row.pnlPct as any}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-amber-300">{row.liqPrice as any}</td>
                              <td className="px-4 py-3 font-mono text-zinc-100">{row.margin as any}</td>
                              <td className="px-4 py-3 font-mono">
                                <div className="text-cyan-300">-</div>
                                <div className="text-rose-300">{row.tpSl as any}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[24px] border border-white/5 bg-black/20">
                  <div className="overflow-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-white/[0.02]">
                        <tr>{Object.keys(table[0] ?? {}).map((key) => <th key={key} className="px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{key}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {table.map((row, idx) => (
                          <tr key={idx} className="text-[13px]">
                            {Object.entries(row).map(([key, value]) => (
                              <td
                                key={key}
                                className={
                                  key === "pnl"
                                    ? `px-4 py-3 font-mono ${String(value).startsWith("-") ? "text-rose-300" : String(value).startsWith("$") || String(value).startsWith("+") ? "text-cyan-300" : "text-zinc-400"}`
                                    : key === "side"
                                      ? `px-4 py-3 font-mono ${String(value) === "BUY" || String(value) === "LONG" ? "text-cyan-300" : "text-rose-300"}`
                                      : "px-4 py-3 font-mono text-zinc-200"
                                }
                              >
                                {value as any}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-[36px] border border-dashed border-white/5 bg-black/20 p-16 text-center text-zinc-500">{loading ? "Loading trader profile..." : "Enter a wallet and load trader details."}</div>
        )}
      </div>
    </div>
  );
}
