import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
  LabelList,
} from "recharts";
import { useUi } from "@/components/UiProvider";

/* ===================== SINGLE SOURCE OF TRUTH ===================== */
const STRATEGY_CATALOG: Record<string, { title: string; description?: string; icon?: string }> = {
  breakout: { title: "Breakout", description: "Momentum breakout через рівні / діапазони.", icon: "📈" },
  pumpAndDump: { title: "Pump & Dump", description: "Імпульсний зліт і різкий скид.", icon: "🚀" },
  reversal: { title: "Reversal", description: "Розворот після екстремуму / перевищення.", icon: "🧭" },
  earnings: { title: "Earnings", description: "Рухи після звітності / PEAD-логіка.", icon: "🧳" },
  gap: { title: "Gap Play", description: "Гепи та реакція на open.", icon: "⛳️" },
  pullback: { title: "Pullback", description: "Відкат у тренді до ключової зони.", icon: "🪝" },
  vwapBounce: { title: "VWAP Bounce", description: "Відскок/відбій від VWAP.", icon: "〰️" },
  uptickRule: { title: "Uptick Rule", description: "Падіння -10%+ та реакція post/next day.", icon: "🛡️" },
  quartalDep: { title: "Quartal Dep", description: "Квартальні залежності та календарні патерни.", icon: "📅" },
  dayTwo: { title: "Day Two", description: "День 2 — продовження/відкат після імпульсу.", icon: "2️⃣" },
  arbitrage: { title: "ArbitRage", description: "Відхилення vs bench і нормалізація (sigma/zap).", icon: "🧮" },
  openDoor: { title: "Open Door", description: "Сигнали на open: імпульс, fail, bounce.", icon: "🚪" },
  rLine: { title: "R-Line", description: "Робота з лініями ризику/рівнями R.", icon: "📏" },
  intraDance: { title: "Intra Dance", description: "Інтра-рухи та “танець” усередині дня.", icon: "🩰" },
  morningLounch: { title: "Morning Lounch", description: "Ранковий імпульс і continuation.", icon: "🌅" },
  coupleDating: { title: "Couple Dating", description: "Парні залежності: SPY/QQQ, XLF/SPY тощо.", icon: "💞" },
  volumeArrival: { title: "Volume Arrival", description: "Прихід об’єму і реакція ціни.", icon: "📊" },
  latePrint: { title: "Late Print", description: "Пізні принти та after-effects.", icon: "🕯️" },
  chrono: { title: "ChronoFlow", description: "Часові потоки й ймовірнісні вікна.", icon: "⏳" },
};

/* ============================= types ============================= */
type Strategy = {
  id: number;
  key?: string | null;
  name: string;
  description: string | null;
  icon: string | null;
};

type Trade = {
  id: number;
  strategy_id: number;
  ticker: string;
  trade_date: string;
  entry_amount: number | null;
  result: number | null;
  screenshot_url: string | null;
  _res?: number;
};

// Deep Space System Colors (Enhanced for Neon Look)
const COLORS = {
  bg: "#020202", // Slightly darker
  grid: "rgba(255, 255, 255, 0.03)",
  success: "#10b981",
  danger: "#f43f5e",
  info: "#8b5cf6",
  accent: "#06b6d4",
  textMuted: "#52525b",
  textMain: "#e4e4e7",
};

function normalizeKey(q: unknown): string | null {
  if (!q) return null;
  if (Array.isArray(q)) return q[0] ? String(q[0]) : null;
  return String(q);
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}

export default function PerformPage() {
  const router = useRouter();
  const rawKey = (router.query as any)?.key;
  const key = normalizeKey(rawKey);
  useUi();

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageErr, setPageErr] = useState<string | null>(null);

  const catalog = useMemo(() => {
    if (!key) return null;
    return STRATEGY_CATALOG[key] ?? null;
  }, [key]);

  const headerTitle = catalog?.title ?? (key ? prettifyKey(key) : "Perform");
  const headerDesc =
    catalog?.description ?? "Performance dashboard for this strategy — log trades and track results.";

  /* ===================== load strategy + trades ===================== */
  useEffect(() => {
    if (!key) return;

    const ac = new AbortController();

    (async () => {
      try {
        setPageErr(null);
        setStrategy(null);
        setTrades([]);

        const ensuredRes = await fetch("/api/strategies/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            key,
            name: headerTitle,
            description: headerDesc ?? null,
            icon: catalog?.icon ?? null,
          }),
        });

        if (!ensuredRes.ok) {
          const txt = await ensuredRes.text().catch(() => "");
          throw new Error(txt || `ensure failed: HTTP ${ensuredRes.status}`);
        }

        const ensured = (await ensuredRes.json()) as Strategy;
        setStrategy(ensured);

        const tradesRes = await fetch(`/api/trades?strategy_id=${ensured.id}`, { signal: ac.signal });

        if (!tradesRes.ok) {
          const txt = await tradesRes.text().catch(() => "");
          throw new Error(txt || `trades failed: HTTP ${tradesRes.status}`);
        }

        const t = (await tradesRes.json()) as Trade[];
        setTrades(Array.isArray(t) ? t : []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setPageErr(e?.message || "Failed to load perform page");
      }
    })();

    return () => ac.abort();
  }, [key, headerTitle, headerDesc, catalog?.icon]);

  /* ============================ computed ============================ */

  const dayMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trades) {
      const d = new Date(t.trade_date);
      const dayKey = isNaN(d.getTime()) ? String(t.trade_date).slice(0, 10) : d.toISOString().slice(0, 10);
      m.set(dayKey, (m.get(dayKey) ?? 0) + Number(t.result ?? 0));
    }
    return m;
  }, [trades]);

  const equityData = useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
    );
    let acc = 0;
    return sorted.map((t) => {
      const res = Number(t.result ?? 0);
      acc += res;
      return { date: new Date(t.trade_date).toISOString(), equity: acc };
    });
  }, [trades]);

  const stats = useMemo(() => {
      const res = trades.map((t) => Number(t.result ?? 0));
      const sum = res.reduce((a, b) => a + b, 0);
      const count = res.length;
      
      // Arrays for calculation
      const pos = res.filter((x) => x > 0);
      const neg = res.filter((x) => x < 0);

      // Basic Counts
      const wins = pos.length;
      const losses = neg.length;
      const winRate = count ? (wins / count) * 100 : 0;

      // Averages
      const avgWinTrade = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0;
      const avgLossTradeAbs = neg.length ? Math.abs(neg.reduce((a, b) => a + b, 0) / neg.length) : 0; // absolute value
      const avgLossTrade = neg.length ? neg.reduce((a, b) => a + b, 0) / neg.length : 0; // real value (negative)

      // Extremes
      const maxWin = pos.length ? Math.max(...pos) : 0;
      const maxLoss = neg.length ? Math.min(...neg) : 0;

      // Volume & ROI
      const totalVolume = trades.reduce((acc, t) => acc + (t.entry_amount || 0), 0);
      const roi = totalVolume > 0 ? (sum / totalVolume) * 100 : 0;
      const avgPosition = count ? totalVolume / count : 0;

      // Ratios
      const riskProfitRatio = avgLossTradeAbs ? avgWinTrade / avgLossTradeAbs : 0;
      const profitFactor = avgLossTradeAbs * losses ? (avgWinTrade * wins) / (avgLossTradeAbs * losses) : 0;
      const expectancy = count ? sum / count : 0;

      // Daily Stats
      const dayPnls = [...dayMap.values()];
      const avgDay = dayPnls.length ? dayPnls.reduce((a, b) => a + b, 0) / dayPnls.length : 0;

      return {
        count,
        wins,
        losses,
        winRate,
        sum,
        totalVolume,
        roi,
        avgPosition,
        maxWin,
        maxLoss,
        avgTrade: expectancy,
        avgDay,
        avgWinTrade,
        avgLossTrade, // negative number
        avgLossTradeAbs, // positive number
        riskProfitRatio,
        profitFactor,
      };
    }, [trades, dayMap]);

  const topTrades = useMemo(() => {
    if (!trades.length) return { winners: [] as Trade[], losers: [] as Trade[] };

    const normalized = trades
      .map((t) => ({ ...t, _res: Number(t.result ?? 0) }))
      .filter((t) => Number.isFinite(t._res) && t._res !== 0);

    const winners = [...normalized]
      .filter((t) => (t._res ?? 0) > 0)
      .sort((a, b) => (b._res ?? 0) - (a._res ?? 0))
      .slice(0, 5) as Trade[];

    const losers = [...normalized]
      .filter((t) => (t._res ?? 0) < 0)
      .sort((a, b) => (a._res ?? 0) - (b._res ?? 0))
      .slice(0, 5) as Trade[];

    return { winners, losers };
  }, [trades]);

  const pieData = useMemo(
    () => [
      { name: "Win", value: stats.wins },
      { name: "Loss", value: stats.losses },
    ],
    [stats.wins, stats.losses]
  );

  const barData = useMemo(() => trades.map((t) => ({ ...t, result: Number(t.result ?? 0) })), [trades]);

  const rpBars = useMemo(
    () => [
      { name: "Avg Win", value: Math.max(0, stats.avgWinTrade), kind: "win" as const },
      { name: "Avg Loss", value: Math.max(0, stats.avgLossTradeAbs), kind: "loss" as const },
    ],
    [stats.avgWinTrade, stats.avgLossTradeAbs]
  );

  const heat = useMemo(() => buildHeatmap(dayMap, 12), [dayMap]);

  const weekdayRows = useMemo(() => {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const sums = new Array(7).fill(0);
    const cnts = new Array(7).fill(0);

    for (const [k, v] of dayMap.entries()) {
      const d = new Date(k);
      if (isNaN(d.getTime())) continue;
      const wd = d.getDay(); // 0 Sun..6 Sat
      const monFirst = wd === 0 ? 6 : wd - 1; // Mon=0..Sun=6
      sums[monFirst] += v;
      cnts[monFirst] += 1;
    }

    return names.map((n, i) => ({ name: n, value: sums[i], count: cnts[i] }));
  }, [dayMap]);

  const bestDay = useMemo(() => {
    let best = { label: "—", value: 0 };
    let init = false;
    for (const [k, v] of dayMap.entries()) {
      if (!init) {
        best = { label: k, value: v };
        init = true;
        continue;
      }
      if (v > best.value) best = { label: k, value: v };
    }
    return init ? best : { label: "—", value: 0 };
  }, [dayMap]);

  const worstDay = useMemo(() => {
    let worst = { label: "—", value: 0 };
    let init = false;
    for (const [k, v] of dayMap.entries()) {
      if (!init) {
        worst = { label: k, value: v };
        init = true;
        continue;
      }
      if (v < worst.value) worst = { label: k, value: v };
    }
    return init ? worst : { label: "—", value: 0 };
  }, [dayMap]);

  const bestStreak = useMemo(() => {
    const days = [...dayMap.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => a.k.localeCompare(b.k));

    let bestLen = 0,
      bestSum = 0;
    let curLen = 0,
      curSum = 0;

    for (const d of days) {
      if (d.v > 0) {
        curLen += 1;
        curSum += d.v;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestSum = curSum;
        } else if (curLen === bestLen && curSum > bestSum) {
          bestSum = curSum;
        }
      } else {
        curLen = 0;
        curSum = 0;
      }
    }

    return { label: bestLen ? `${bestLen} days` : "—", value: bestSum };
  }, [dayMap]);

  const currentStreak = useMemo(() => {
    const days = [...dayMap.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => a.k.localeCompare(b.k));

    if (!days.length) return { label: "—", sub: "", tone: "neutral" as const };

    let i = days.length - 1;
    const lastSign = days[i].v === 0 ? 0 : days[i].v > 0 ? 1 : -1;

    let len = 0;
    let sum = 0;
    while (i >= 0) {
      const s = days[i].v === 0 ? 0 : days[i].v > 0 ? 1 : -1;
      if (s !== lastSign) break;
      len += 1;
      sum += days[i].v;
      i -= 1;
    }

    return {
      label: lastSign > 0 ? `Win x${len}` : lastSign < 0 ? `Loss x${len}` : `Flat x${len}`,
      sub: fmtSmall(sum),
      tone: lastSign > 0 ? ("win" as const) : lastSign < 0 ? ("loss" as const) : ("neutral" as const),
    };
  }, [dayMap]);

  const insights = useMemo(() => {
    const byWd = computeWeekdayAverages(dayMap);
    const best = pickBestWeekday(byWd);
    const worst = pickWorstWeekday(byWd);
    const streak = bestPositiveStreak(dayMap);
    return { bestWeekday: best, worstWeekday: worst, bestStreak: streak };
  }, [dayMap]);

  const extraHeader = useMemo(() => {
    const eq = equityData.map((x) => Number(x.equity ?? 0));
    let peak = -Infinity;
    let maxDD = 0;
    for (const v of eq) {
      peak = Math.max(peak, v);
      maxDD = Math.min(maxDD, v - peak);
    }

    const days = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const dayVals = days.map(([, v]) => v);
    const activeDays = dayVals.filter((v) => v !== 0).length;
    const mean = dayVals.length ? dayVals.reduce((a, b) => a + b, 0) / dayVals.length : 0;
    const variance =
      dayVals.length > 1
        ? dayVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (dayVals.length - 1)
        : 0;
    const stdev = Math.sqrt(Math.max(variance, 0));
    const sharpeLike = stdev ? mean / stdev : 0;

    const tradesPerDay = dayVals.length ? trades.length / dayVals.length : 0;

    const lastDay = days.length ? days[days.length - 1] : null;
    const lastDayPnl = lastDay ? lastDay[1] : 0;
    const lastDayLabel = lastDay ? lastDay[0] : "—";

    return {
      maxDD,
      sharpeLike,
      activeDays,
      tradesPerDay,
      lastDayPnl,
      lastDayLabel,
    };
  }, [equityData, dayMap, trades.length]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!strategy?.id) return;

    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const payload = {
        strategy_id: Number(strategy.id),
        ticker: String(fd.get("ticker") || "").toUpperCase(),
        trade_date: String(fd.get("trade_date") || ""),
        entry_amount: fd.get("entry_amount") ? Number(fd.get("entry_amount")) : null,
        result: fd.get("result") ? Number(fd.get("result")) : null,
        screenshot_url: String(fd.get("screenshot_url") || "") || null,
      };

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Помилка: " + (err.error || res.statusText));
        return;
      }

      (e.target as HTMLFormElement).reset();
      const t = await fetch(`/api/trades?strategy_id=${strategy.id}`).then((r) => r.json());
      setTrades(Array.isArray(t) ? t : []);
    } finally {
      setBusy(false);
    }
  }

  if (pageErr) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center text-zinc-500 font-mono">
        <div className="max-w-xl p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl">
          <div className="text-rose-400 font-bold mb-2 tracking-widest uppercase text-xs">System Error</div>
          <div className="text-zinc-400 text-sm whitespace-pre-wrap font-mono">{pageErr}</div>
          <button
            onClick={() => router.reload()}
            className="mt-4 h-[36px] px-4 rounded border border-white/10 text-zinc-300 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
          >
            Reboot
          </button>
        </div>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">
        Initializing Strategy Core...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-200 font-sans selection:bg-emerald-500/20 selection:text-emerald-200 pb-20 overflow-x-hidden">
      {/* Background Ambience - Slightly darker and deeper */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[20%] w-[900px] h-[900px] bg-emerald-500/5 blur-[150px] rounded-full mix-blend-screen opacity-60" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[700px] h-[700px] bg-indigo-500/5 blur-[150px] rounded-full mix-blend-screen opacity-60" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.04] mix-blend-overlay" />
        {/* Subtle grid lines for HUD effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 pt-8 pb-6">
        {/* BACK (outside header) */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => {
              window.location.href = "http://localhost:3000/signals";
            }}
            className="
              h-[32px] px-3 rounded
              bg-white/[0.02] border border-white/[0.08]
              text-zinc-400 font-mono text-[10px] font-bold uppercase tracking-[0.2em]
              hover:bg-white/[0.05] hover:text-zinc-200 hover:border-white/[0.15]
              transition-all
            "
          >
            ← Returns
          </button>

          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono text-zinc-500">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/5 bg-black/20 backdrop-blur-sm">
                <span className="opacity-50 uppercase tracking-wider">Last PNL</span>
                <span className={`font-bold ${extraHeader.lastDayPnl >= 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]"}`}>
                   {fmtSmall(extraHeader.lastDayPnl)}
                </span>
             </div>
             <div className="px-2 opacity-50">{extraHeader.lastDayLabel}</div>
          </div>
        </div>

        {/* HEADER */}
{/* HEADER: RESTRUCTURED BENTO GRID */}
        <section className="mb-8">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 auto-rows-[minmax(0,fr)]">
            
            {/* 1. IDENTITY CARD + NET PROFIT (Col 4) */}
            <div className="xl:col-span-4 rounded-3xl bg-[#080808] border border-white/[0.06] p-6 flex flex-col relative overflow-hidden group min-h-[320px]">
               {/* Background FX */}
               <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />
               <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
               
               {/* Header Info */}
               <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-5">
                     <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl text-zinc-200 shadow-inner">
                        {catalog?.icon ?? "💠"}
                     </div>
                     <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                           Strategy
                        </span>
                        <h1 className="text-2xl font-bold text-white tracking-tight">{strategy.name}</h1>
                     </div>
                  </div>
                  <p className="text-zinc-400 text-xs leading-relaxed font-mono pl-1 mb-8 border-l border-white/10 h-[40px] line-clamp-2">
                     {strategy.description || headerDesc}
                  </p>
               </div>

               {/* NET PROFIT (Moved Here) */}
               <div className="mt-auto relative z-10 bg-black/20 rounded-2xl p-5 border border-white/5 backdrop-blur-sm">
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1">Total Net Profit</div>
                  <div className={`text-5xl font-bold tracking-tighter font-mono ${stats.sum >= 0 ? "text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "text-rose-400"}`}>
                     {fmt(stats.sum)}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                     <div className="px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-[10px] font-mono text-zinc-400">
                        {stats.count} Trades
                     </div>
                     <div className={`text-xs font-mono font-bold ${stats.roi >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        ROI {stats.roi > 0 ? "+" : ""}{stats.roi.toFixed(1)}%
                     </div>
                  </div>
               </div>
            </div>

            {/* 2. THE ENGINE: TECHNICAL METRICS (Col 5) */}
            <div className="xl:col-span-5 grid grid-cols-2 gap-3">
               {/* 6 Metrics in a 2x3 Grid */}
               <BentoMetric label="Profit Factor" value={fmtRatio(stats.profitFactor)} icon="PF" />
               <BentoMetric label="Expectancy" value={fmt(stats.avgTrade)} tone={stats.avgTrade >= 0 ? "emerald" : "rose"} icon="EX" />
               
               <BentoMetric label="Sharpe Ratio" value={fmtRatio(extraHeader.sharpeLike)} icon="SR" />
               <BentoMetric label="Daily Avg" value={fmt(stats.avgDay)} tone={stats.avgDay >= 0 ? "emerald" : "rose"} icon="DA" />
               
               <BentoMetric label="Max Drawdown" value={fmtSmall(extraHeader.maxDD)} tone="rose" icon="DD" />
               <BentoMetric label="Volume" value={fmtSmall(stats.totalVolume)} sub="Total" icon="VOL" />
            </div>

            {/* 3. TRADE STATS: EXTREMES & AVERAGES (Col 3) */}
            <div className="xl:col-span-3 rounded-3xl bg-[#080808] border border-white/[0.06] p-6 flex flex-col relative overflow-hidden">
               <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-2">
                  <span className="w-1 h-1 bg-white/50 rounded-full" />
                  Trade Statistics
               </div>

               <div className="flex-1 flex flex-col justify-between gap-4">
                  <TradeStatRow label="Max Win" value={fmt(stats.maxWin)} type="win" />
                  <TradeStatRow label="Max Loss" value={fmt(stats.maxLoss)} type="loss" />
                  
                  <div className="w-full h-px bg-white/5 my-1" /> {/* Divider */}
                  
                  <TradeStatRow label="Avg Win" value={fmt(stats.avgWinTrade)} type="win" muted />
                  <TradeStatRow label="Avg Loss" value={fmt(stats.avgLossTrade)} type="loss" muted />
               </div>
               
               {/* Mini Win Rate Bar at bottom of stats */}
               <div className="mt-6 pt-4 border-t border-white/5">
                   <div className="flex justify-between text-[9px] font-mono text-zinc-500 mb-1">
                      <span>Win Rate</span>
                      <span>{stats.winRate.toFixed(1)}%</span>
                   </div>
                   <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${stats.winRate > 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${stats.winRate}%`}} />
                   </div>
               </div>
            </div>

          </div>

          {/* INSIGHTS (Merged below) */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
             <BentoInsight 
               label="Weakest Link" 
               val={insights.worstWeekday ? insights.worstWeekday.label : "—"} 
               sub={insights.worstWeekday ? fmtSmall(insights.worstWeekday.avg) : "No data"}
               tone="rose"
             />
             <BentoInsight 
               label="Power Day" 
               val={insights.bestWeekday ? insights.bestWeekday.label : "—"} 
               sub={insights.bestWeekday ? fmtSmall(insights.bestWeekday.avg) : "No data"}
               tone="emerald"
             />
             <BentoInsight 
               label="Active Streak" 
               val={currentStreak.label} 
               sub={currentStreak.sub}
               tone={currentStreak.tone === 'win' ? 'emerald' : currentStreak.tone === 'loss' ? 'rose' : 'zinc'}
             />
          </div>
        </section>


        {/* MAIN EQUITY CHART */}
        <section className="mb-8">
          <GlassCard title="EQUITY TRAJECTORY">
            <div className="h-[360px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.3} />
                      <stop offset="90%" stopColor={COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                    <filter id="neonGlow" height="200%" width="200%" x="-50%" y="-50%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fill: COLORS.textMuted, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                  />
                  <Tooltip content={<GlassTooltip />} cursor={{ stroke: COLORS.accent, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />

                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={COLORS.accent}
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                    filter="url(#neonGlow)"
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </section>

        {/* SECONDARY CHARTS */}
        <section className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* 1. DISTRIBUTION */}
          <GlassCard title="PNL DISTRIBUTION">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="winBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={COLORS.success} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="lossBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.danger} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={COLORS.danger} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <YAxis
                    tick={{ fill: COLORS.textMuted, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<GlassTooltip />} />

                  <Bar dataKey="result" radius={[2, 2, 2, 2]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.result >= 0 ? "url(#winBar)" : "url(#lossBar)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* 2. WIN RATIO */}
          <GlassCard title="WIN RATIO">
            <div className="h-[250px] w-full mt-4 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <filter id="glowPie" height="200%" width="200%" x="-50%" y="-50%">
                       <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                       <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                       </feMerge>
                    </filter>
                  </defs>

                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={85}
                    stroke="#0a0a0a"
                    strokeWidth={5}
                    paddingAngle={3}
                  >
                    <Cell fill={COLORS.success} filter="url(#glowPie)" stroke="none" />
                    <Cell fill={COLORS.danger} filter="url(#glowPie)" stroke="none" />
                  </Pie>

                  <Tooltip content={<GlassTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-bold tracking-tighter text-zinc-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                  {stats.winRate.toFixed(0)}<span className="text-lg text-zinc-600">%</span>
                </span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mt-1">Win Rate</span>
              </div>
            </div>
          </GlassCard>

          {/* 3. RISK REWARD */}
          <GlassCard title="AVG R:R RATIO">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rpBars} layout="vertical" barCategoryGap={25} margin={{ top: 0, right: 40, left: 40, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip cursor={{ fill: "transparent" }} content={<GlassTooltip />} />

                  <Bar
                    dataKey="value"
                    barSize={20}
                    radius={[0, 4, 4, 0]}
                    background={{ fill: "rgba(255,255,255,0.02)", radius: 4 }}
                  >
                    {rpBars.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.kind === "win" ? "url(#winBar)" : "url(#lossBar)"} />
                    ))}

                    <LabelList
                      dataKey="name"
                      position="top"
                      offset={8}
                      style={{ fill: COLORS.textMuted, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1px" }}
                    />
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: number) => fmt(v)}
                      style={{ fill: "#fff", fontSize: 11, fontWeight: "bold", fontFamily: "monospace" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </section>

        {/* ✅ HEATMAP */}
        <section className="mb-8">
          <GlassCard title="TEMPORAL HEATMAP" className="!p-0">
            <div className="p-6">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-8 items-stretch">
                {/* LEFT */}
                <div className="min-w-0">
                  <HeatmapGrid heat={heat} />
                </div>

                {/* RIGHT */}
                <div className="flex flex-col gap-4">
                  <MiniPanel title="WEEKDAY ANALYTICS">
                    <WeekdayBars rows={weekdayRows} />
                  </MiniPanel>

                  <MiniPanel title="EXTREMES">
                    <div className="grid grid-cols-2 gap-3">
                      <MiniKPI label="Best Day" value={bestDay.label} sub={fmt(bestDay.value)} tone="win" />
                      <MiniKPI label="Worst Day" value={worstDay.label} sub={fmt(worstDay.value)} tone="loss" />
                    </div>
                  </MiniPanel>

                  <MiniPanel title="MOMENTUM">
                    <div className="grid grid-cols-2 gap-3">
                      <MiniKPI label="Best Streak" value={bestStreak.label} sub={fmt(bestStreak.value)} tone="win" />
                      <MiniKPI label="Current" value={currentStreak.label} sub={currentStreak.sub} tone={currentStreak.tone} />
                    </div>
                  </MiniPanel>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* LISTS */}
        <section className="grid md:grid-cols-2 gap-6 mb-8">
          <GlassCard title="TOP WINNERS">
            <div className="flex flex-col gap-2 mt-4">
              {topTrades.winners.length ? topTrades.winners.map((t) => <TradeRow key={t.id} trade={t} type="win" />) : <EmptyState text="No wins recorded" />}
            </div>
          </GlassCard>

          <GlassCard title="TOP DRAW DOWNS">
            <div className="flex flex-col gap-2 mt-4">
              {topTrades.losers.length ? topTrades.losers.map((t) => <TradeRow key={t.id} trade={t} type="loss" />) : <EmptyState text="No losses recorded" />}
            </div>
          </GlassCard>
        </section>

        {/* FORM */}
        <section className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-[#0a0a0a]/80 border border-white/[0.08] backdrop-blur-xl rounded-xl p-6 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)]"
          >
            <h3 className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               Manual Entry Protocol
            </h3>
            <form onSubmit={onAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <GlassInput
                name="ticker"
                placeholder="TICKER"
                required
                onChange={(e) => (((e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase()))}
              />
              <GlassInput name="trade_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              <GlassInput name="entry_amount" placeholder="ENTRY $" type="number" step="any" />
              <GlassInput name="result" placeholder="P&L $" type="number" step="any" />
              <GlassInput name="screenshot_url" placeholder="EVIDENCE URL" className="md:col-span-3" />
              <button
                disabled={busy}
                className="h-[42px] md:col-span-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all disabled:opacity-50 active:translate-y-[1px]"
              >
                {busy ? "PROCESSING..." : "COMMIT ENTRY"}
              </button>
            </form>
          </motion.div>
        </section>

        {/* RECENT */}
        <section className="pb-20">
          <GlassCard title="RECENT ACTIVITY STREAM">
            <div className="flex flex-col gap-2 mt-4">
              {trades.map((t) => (
                <div
                  key={t.id}
                  className="group relative flex items-center justify-between p-3.5 rounded bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 rounded-[4px] text-[10px] font-mono font-bold uppercase border ${
                        Number(t.result) >= 0
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]"
                      }`}
                    >
                      {t.ticker}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 font-mono tracking-wide">{fmtDate(t.trade_date)}</span>
                      {t.entry_amount && (
                        <span className="text-[9px] text-zinc-600 font-mono uppercase">
                          In: {fmt(Number(t.entry_amount))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <span className={`font-mono text-sm font-bold tracking-tight ${Number(t.result) >= 0 ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "text-rose-400 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"}`}>
                      {fmt(Number(t.result))}
                    </span>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.screenshot_url && (
                        <a
                          href={t.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          if (!confirm("Confirm Deletion?")) return;
                          await fetch(`/api/trades/${t.id}`, { method: "DELETE" });
                          const res = await fetch(`/api/trades?strategy_id=${strategy.id}`);
                          setTrades(await res.json());
                        }}
                        className="p-1.5 text-zinc-600 hover:text-rose-400 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!trades.length && <EmptyState text="NO DATA IN STREAM" />}
            </div>
          </GlassCard>
        </section>
      </div>
    </div>
  );
}

/* ==================== UI COMPONENTS ==================== */

function GlassCard({ children, title, className = "" }: { children: React.ReactNode; title: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`relative bg-[#080808]/60 border border-white/[0.06] backdrop-blur-xl rounded-xl shadow-xl overflow-hidden flex flex-col ${className}`}
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
      <div className="flex items-center gap-2 mb-2 px-6 pt-5">
        <div className="w-1.5 h-1.5 rounded-sm bg-accent-500/50 shadow-[0_0_8px_currentColor] text-indigo-400" />
        <h3 className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500 font-semibold">{title}</h3>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </motion.div>
  );
}

/* ==================== NEW COMPONENTS ==================== */

// For the 2x2 Grid in Middle Column
function PrimaryStatCard({ label, value, tone, muted }: { label: string; value: string; tone: "emerald" | "rose"; muted?: boolean }) {
   return (
      <div className="bg-[#050505] p-4 flex flex-col justify-center hover:bg-[#0a0a0a] transition-colors relative overflow-hidden group">
         {/* Subtle highlight line on hover */}
         <div className={`absolute top-0 left-0 w-1 h-full ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'} opacity-0 group-hover:opacity-100 transition-opacity`} />
         
         <div className="text-[8px] font-mono uppercase tracking-widest text-zinc-600 mb-1 group-hover:text-zinc-500">{label}</div>
         <div className={`text-lg font-bold font-mono tracking-tight ${muted 
            ? (tone === 'emerald' ? 'text-emerald-500/70' : 'text-rose-500/70') 
            : (tone === 'emerald' ? 'text-emerald-400' : 'text-rose-400')
         }`}>
            {value}
         </div>
      </div>
   )
}

// For the Right Column List
function SecondaryStatRow({ label, value, tone }: { label: string; value: string; tone?: "rose" | "emerald" }) {
   let color = "text-zinc-200";
   if (tone === "rose") color = "text-rose-400";
   if (tone === "emerald") color = "text-emerald-400";

   return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors rounded">
         <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-500">{label}</span>
         <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
      </div>
   )
}

// Reuse InsightRow from previous step (no changes needed if you have it, otherwise here it is)
function InsightRow({ label, val, sub, tone }: { label: string; val: string; sub: string; tone: "emerald" | "rose" | "zinc" }) {
   const colors = {
      emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
      rose: "text-rose-400 border-rose-500/20 bg-rose-500/5",
      zinc: "text-zinc-300 border-white/10 bg-white/5"
   };

   return (
      <div className={`flex items-center justify-between p-4 rounded-xl border ${colors[tone]} relative overflow-hidden bg-black/40`}>
         <div className="flex flex-col z-10">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</span>
            <span className={`text-lg font-bold font-mono ${tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-zinc-200'}`}>{val}</span>
         </div>
         <div className="text-[10px] font-mono text-zinc-400 bg-black/60 px-2 py-1 rounded border border-white/5 z-10">
            {sub}
         </div>
         {/* Texture */}
         <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%,transparent_100%)] bg-[size:12px_12px] opacity-20" />
      </div>
   )
}

function HeaderPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "win" | "loss" | "neutral";
}) {
  const cls =
    tone === "win"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "loss"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
      : "border-white/10 bg-white/[0.02] text-zinc-300";

  return (
    <div className={`px-3 py-1.5 rounded border ${cls} flex items-center gap-2 shadow-sm`}>
      <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-60">{label}</span>
      <span className="text-[10px] font-mono font-bold tracking-wide">{value}</span>
    </div>
  );
}

function TradeRow({ trade, type }: { trade: Trade; type: "win" | "loss" }) {
  const isWin = type === "win";
  return (
    <div
      className={`
      flex items-center justify-between p-3 rounded border backdrop-blur-sm transition-all hover:scale-[1.01] cursor-default
      ${
        isWin
          ? "bg-emerald-500/[0.03] border-emerald-500/10 hover:border-emerald-500/20 hover:bg-emerald-500/[0.06]"
          : "bg-rose-500/[0.03] border-rose-500/10 hover:border-rose-500/20 hover:bg-rose-500/[0.06]"
      }
    `}
    >
      <div className="flex items-center gap-3">
        <div className={`w-1 h-6 rounded-full ${isWin ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500 shadow-[0_0_8px_#f43f5e]"} opacity-80`} />
        <div>
          <div className="font-bold text-xs text-zinc-200 tracking-wider font-mono">{trade.ticker}</div>
          <div className="text-[9px] font-mono text-zinc-500 uppercase">{fmtDate(trade.trade_date)}</div>
        </div>
      </div>
      <div className={`font-mono text-xs font-bold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
        {fmt(Number(trade.result))}
      </div>
    </div>
  );
}

function GlassInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`
        bg-black/40 border border-white/10 rounded px-4 py-2.5 
        text-xs text-emerald-100 placeholder-zinc-700 font-mono tracking-wide
        focus:outline-none focus:border-emerald-500/50 focus:bg-black/60 focus:shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]
        transition-all w-full
        ${props.className || ""}
      `}
    />
  );
}

function GlassTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#050505]/90 border border-white/10 backdrop-blur-md p-3 rounded shadow-[0_0_20px_-5px_rgba(0,0,0,0.8)]">
        {label && <p className="text-[9px] font-mono text-zinc-500 mb-2 uppercase tracking-widest">{label}</p>}
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-3 text-[10px] font-mono mb-1 last:mb-0">
            <span className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]" style={{ background: p.fill || p.stroke || p.color }} />
            <span className="text-zinc-400 uppercase">{p.name}:</span>
            <span className="text-white font-bold tracking-wide">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-4 text-center text-[9px] font-mono text-zinc-700 uppercase tracking-widest border border-dashed border-white/5 rounded bg-white/[0.01]">
      {text}
    </div>
  );
}

/* ==================== HEATMAP ==================== */

/* ==================== UPDATED HEATMAP (TALLER + WEEKLY METRICS) ==================== */

function HeatmapGrid({
  heat,
}: {
  heat: {
    weeks: { cells: { date: string; value: number; level: number }[] }[];
    min: number;
    max: number;
    legend: { label: string; cls: string }[];
    weekdayLabels: string[];
  };
}) {
  const weeksCount = heat.weeks.length || 12;

  return (
    <div className="w-full flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            TEMPORAL FLUX [{weeksCount} WEEKS]
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <LegendDot cls="bg-rose-500/40" label="NEG" />
          <LegendDot cls="bg-white/[0.05]" label="NULL" />
          <LegendDot cls="bg-emerald-500/40" label="POS" />
        </div>
      </div>

      {/* Main Grid Container */}
      <div className="flex-1 rounded-xl border border-white/[0.04] bg-black/30 backdrop-blur-md p-6 shadow-inner w-full">
        
        <div className="flex w-full gap-4">
          {/* 1. Labels Column */}
          <div className="flex flex-col gap-2 pt-[1px] w-12 shrink-0">
            {heat.weekdayLabels.map((w) => (
              <WeekdayPill key={w} label={w} />
            ))}
            {/* Label for the new metric row */}
            <div className="h-11 flex items-center justify-center mt-2 border-t border-white/5">
               <span className="text-[9px] font-mono text-zinc-600 font-bold">NET</span>
            </div>
          </div>

          {/* 2. Grid Area */}
          <div className="flex-1 min-w-0 relative">
            <div 
              className="grid w-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${weeksCount}, minmax(0, 1fr))`,
              }}
            >
              {heat.weeks.map((w, wi) => {
                // Calculate weekly total for the bottom metric
                const weeklyNet = w.cells.reduce((acc, c) => acc + c.value, 0);
                const isPos = weeklyNet > 0;
                const isNeg = weeklyNet < 0;
                const intensity = Math.min(Math.abs(weeklyNet) / (Math.abs(heat.max) * 3), 1); // rough scaling

                return (
                  <div key={wi} className="contents">
                    <div className="flex flex-col gap-2 w-full">
                      {/* Days Grid */}
                      {w.cells.map((c, ci) => (
                        <div
                          key={ci}
                          title={`${c.date} • ${fmtSmall(c.value)}`}
                          className={`
                            w-full h-11 
                            rounded-[3px] border border-white/5
                            ${heatCellClass(c.level)}
                            transition-all duration-300
                            hover:scale-[1.05] hover:z-20 hover:border-white/40 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]
                            relative group
                          `}
                        >
                           {/* Hover Value */}
                           <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white/90 pointer-events-none transition-opacity">
                              {fmtSmall(c.value)}
                           </div>
                        </div>
                      ))}

                      {/* == NEW METRIC: Weekly Net Bar == */}
                      <div className="h-11 mt-2 border-t border-white/5 flex items-center justify-center relative group">
                        {weeklyNet !== 0 && (
                          <div 
                            className={`w-full rounded-[2px] transition-all ${isPos ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{ 
                              height: `${Math.max(15, intensity * 100)}%`, // min height 15%
                              opacity: 0.3 + (intensity * 0.7)
                            }}
                          />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className={`text-[8px] font-mono font-bold ${isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-zinc-600'}`}>
                                {fmtSmall(weeklyNet)}
                            </span>
                        </div>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-6 flex items-center justify-between text-[9px] font-mono text-zinc-600 border-t border-white/5 pt-3">
           <div>DATA DENSITY: HIGH</div>
           <div className="flex gap-4">
              <span className="text-zinc-500">RANGE:</span>
              <span className="text-rose-400">{fmtSmall(heat.min)}</span>
              <span className="text-zinc-700">...</span>
              <span className="text-emerald-400">{fmtSmall(heat.max)}</span>
           </div>
        </div>
      </div>
    </div>
  );
}

function WeekdayPill({ label }: { label: string }) {
  const map: Record<string, { short: string; tone: string }> = {
    Mon: { short: "M", tone: "border-white/5 bg-white/[0.02] text-zinc-400" },
    Tue: { short: "T", tone: "border-white/5 bg-white/[0.02] text-zinc-400" },
    Wed: { short: "W", tone: "border-white/5 bg-white/[0.02] text-zinc-400" },
    Thu: { short: "T", tone: "border-white/5 bg-white/[0.02] text-zinc-400" },
    Fri: { short: "F", tone: "border-white/5 bg-white/[0.02] text-zinc-400" },
    Sat: { short: "S", tone: "border-white/5 bg-white/[0.01] text-zinc-600" },
    Sun: { short: "S", tone: "border-white/5 bg-white/[0.01] text-zinc-600" },
  };

  const cfg = map[label] ?? { short: label[0] ?? "?", tone: "border-white/10 bg-white/[0.03] text-zinc-200" };

  // Increased height to h-11 to match cells
  return (
    <div className="h-11 flex items-center justify-center"> 
      <div className={`w-full h-full rounded border ${cfg.tone} flex items-center justify-center hover:bg-white/[0.05] transition-colors cursor-default`}>
        <span className="text-[10px] font-mono font-bold">{cfg.short}</span>
      </div>
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-sm ${cls}`} />
      <span className="text-[9px] font-mono text-zinc-500 uppercase">{label}</span>
    </div>
  );
}

function heatCellClass(level: number) {
  if (level >= 3) return "bg-emerald-500 shadow-[0_0_8px_inset_rgba(16,185,129,0.5)]";
  if (level === 2) return "bg-emerald-500/60 shadow-[0_0_4px_inset_rgba(16,185,129,0.3)]";
  if (level === 1) return "bg-emerald-500/20";
  if (level === 0) return "bg-white/[0.02]";
  if (level === -1) return "bg-rose-500/20";
  if (level === -2) return "bg-rose-500/60 shadow-[0_0_4px_inset_rgba(244,63,94,0.3)]";
  return "bg-rose-500 shadow-[0_0_8px_inset_rgba(244,63,94,0.5)]";
}

function buildHeatmap(dayMap: Map<string, number>, weeks: number) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const days = weeks * 7;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const all: { date: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const v = dayMap.get(iso) ?? 0;
    all.push({ date: iso, value: v });
  }

  const vals = all.map((x) => x.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;

  // percentile scaling to avoid "one huge day dominates"
  const abs = vals.map((v) => Math.abs(v)).sort((a, b) => a - b);
  const p = abs.length ? abs[Math.floor(abs.length * 0.9)] : 0;
  const maxAbs = Math.max(p, 1);

  const quant = (v: number) => {
    const a = Math.abs(v);
    const s = v === 0 ? 0 : v > 0 ? 1 : -1;
    const r = a / maxAbs;
    if (r >= 0.85) return 3 * s;
    if (r >= 0.55) return 2 * s;
    if (r >= 0.25) return 1 * s;
    return 0;
  };

  const weeksArr: { cells: { date: string; value: number; level: number }[] }[] = [];
  for (let w = 0; w < weeks; w++) {
    const slice = all.slice(w * 7, w * 7 + 7);
    const ordered = reorderToMonFirst(slice);
    weeksArr.push({ cells: ordered.map((x) => ({ ...x, level: quant(x.value) })) });
  }

  const legend = [
    { label: "Loss", cls: "bg-rose-400/40" },
    { label: "Flat", cls: "bg-white/[0.05]" },
    { label: "Win", cls: "bg-emerald-400/40" },
  ];

  return { weeks: weeksArr, min, max, legend, weekdayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };
}

function reorderToMonFirst(slice: { date: string; value: number }[]) {
  const out: { date: string; value: number }[] = new Array(7).fill(null as any);
  for (const x of slice) {
    const d = new Date(x.date);
    const wd = d.getDay(); // 0 Sun..6 Sat
    const monFirst = wd === 0 ? 6 : wd - 1;
    out[monFirst] = x;
  }
  if (out.some((v) => !v)) return slice;
  return out;
}

/* ==================== 🧠 INSIGHTS ==================== */

function computeWeekdayAverages(dayMap: Map<string, number>) {
  const sums = new Array(7).fill(0);
  const cnts = new Array(7).fill(0);

  for (const [date, v] of dayMap.entries()) {
    const d = new Date(date);
    if (isNaN(d.getTime())) continue;
    const wd = d.getDay();
    sums[wd] += v;
    cnts[wd] += 1;
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels.map((label, i) => ({
    label,
    avg: cnts[i] ? sums[i] / cnts[i] : 0,
    total: cnts[i],
  }));
}

function pickBestWeekday(arr: { label: string; avg: number; total: number }[]) {
  const eligible = arr.filter((x) => x.total > 0);
  if (!eligible.length) return null;
  return eligible.slice().sort((a, b) => b.avg - a.avg)[0];
}

function pickWorstWeekday(arr: { label: string; avg: number; total: number }[]) {
  const eligible = arr.filter((x) => x.total > 0);
  if (!eligible.length) return null;
  return eligible.slice().sort((a, b) => a.avg - b.avg)[0];
}

function bestPositiveStreak(dayMap: Map<string, number>) {
  const keys = [...dayMap.keys()].sort();
  if (!keys.length) return null;

  let best = { len: 0, sum: 0, from: "", to: "" };
  let cur = { len: 0, sum: 0, from: "", to: "" };

  const isNextDay = (a: string, b: string) => {
    const da = new Date(a);
    const db = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
    da.setDate(da.getDate() + 1);
    return da.toISOString().slice(0, 10) === b;
  };

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = dayMap.get(k) ?? 0;

    const prev = i > 0 ? keys[i - 1] : null;
    const contiguous = prev ? isNextDay(prev, k) : false;

    if (v > 0) {
      if (!cur.len || !contiguous) cur = { len: 1, sum: v, from: k, to: k };
      else {
        cur.len += 1;
        cur.sum += v;
        cur.to = k;
      }
      if (cur.len > best.len || (cur.len === best.len && cur.sum > best.sum)) best = { ...cur };
    } else {
      cur = { len: 0, sum: 0, from: "", to: "" };
    }
  }

  return best.len ? best : null;
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4 overflow-hidden shadow-sm">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
      <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">{title}</div>
      {children}
    </div>
  );
}

function MiniKPI({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "win" | "loss" | "neutral";
}) {
  const toneCls = tone === "win" ? "text-emerald-300 drop-shadow-[0_0_5px_rgba(16,185,129,0.3)]" : tone === "loss" ? "text-rose-300 drop-shadow-[0_0_5px_rgba(244,63,94,0.3)]" : "text-zinc-200";
  return (
    <div className="rounded border border-white/5 bg-white/[0.01] p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-bold font-mono ${toneCls}`}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function WeekdayBars({ rows }: { rows: { name: string; value: number; count: number }[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = Math.round((Math.abs(r.value) / maxAbs) * 100);
        const isPos = r.value >= 0;
        
        return (
          <div key={r.name} className="flex items-center gap-3">
            {/* Label */}
            <div className="w-10 text-[9px] font-mono text-zinc-500 uppercase">{r.name}</div>
            
            {/* Bar Track */}
            <div className="flex-1 h-1.5 rounded-sm bg-white/[0.05] overflow-hidden">
              {/* The Bar: Removed shadows, used solid colors for a clean look */}
              <div 
                className={`h-full rounded-sm ${isPos ? "bg-emerald-500" : "bg-rose-500"}`} 
                style={{ width: `${pct}%` }} 
              />
            </div>
            
            {/* Value */}
            <div className={`w-[92px] text-right text-[9px] font-mono ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
              {fmtSmall(r.value)}
            </div>
          </div>
        );
      })}
      <div className="pt-2 text-[8px] font-mono text-zinc-600 uppercase tracking-wide border-t border-white/5 mt-1">
        Volume Weighted
      </div>
    </div>
  );
}

/* ==================== HELPERS ==================== */
function fmt(n: number) {
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "" : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtSmall(n: number) {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "" : "-";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtRatio(n: number) {
  if (!isFinite(n) || n === 0) return "—";
  return `${n.toFixed(2)}`;
}

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? String(s).slice(0, 10) : d.toISOString().slice(0, 10);
}

function prettifyKey(k: string) {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/* ==================== FINAL BENTO COMPONENTS ==================== */

// Component for the Center Grid (6 items)
function BentoMetric({ label, value, tone, icon, sub }: { label: string; value: string; tone?: "emerald" | "rose"; icon: string; sub?: string }) {
   let color = "text-zinc-200";
   if (tone === "emerald") color = "text-emerald-400";
   if (tone === "rose") color = "text-rose-400";

   return (
      <div className="bg-[#080808] border border-white/[0.04] rounded-2xl p-4 flex flex-col justify-between hover:bg-white/[0.02] transition-colors group relative overflow-hidden">
         <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 group-hover:text-zinc-500">{label}</span>
            <span className="text-[8px] font-bold text-zinc-700 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{icon}</span>
         </div>
         <div className="flex items-baseline gap-1">
            <span className={`text-lg font-bold font-mono tracking-tight ${color}`}>{value}</span>
            {sub && <span className="text-[9px] text-zinc-600 font-mono">{sub}</span>}
         </div>
         {/* Glow Effect */}
         <div className={`absolute bottom-0 left-0 w-full h-[1px] ${tone === 'emerald' ? 'bg-emerald-500/50' : tone === 'rose' ? 'bg-rose-500/50' : 'bg-transparent'} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
   )
}

// Component for the Right Column (4 items)
function TradeStatRow({ label, value, type, muted }: { label: string; value: string; type: "win" | "loss"; muted?: boolean }) {
   const isWin = type === "win";
   const baseColor = isWin ? "text-emerald-400" : "text-rose-400";
   const color = muted ? (isWin ? "text-emerald-500/60" : "text-rose-500/60") : baseColor;
   const bg = isWin ? "bg-emerald-500/10" : "bg-rose-500/10";
   const border = isWin ? "border-emerald-500/20" : "border-rose-500/20";

   return (
      <div className="flex items-center justify-between group">
         <div className="flex items-center gap-3">
             <div className={`w-1.5 h-1.5 rounded-full ${isWin ? "bg-emerald-500" : "bg-rose-500"} ${muted ? 'opacity-40' : 'opacity-100'}`} />
             <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">{label}</span>
         </div>
         <div className={`px-2 py-1 rounded-[4px] border ${muted ? 'border-transparent bg-transparent' : `${border} ${bg}`} text-xs font-mono font-bold ${color}`}>
            {value}
         </div>
      </div>
   )
}

// Reuse BentoInsight from previous step
function BentoInsight({ label, val, sub, tone }: { label: string; val: string; sub: string; tone: "emerald" | "rose" | "zinc" }) {
   const styles = {
      emerald: "bg-emerald-500/[0.03] border-emerald-500/10 hover:border-emerald-500/30",
      rose: "bg-rose-500/[0.03] border-rose-500/10 hover:border-rose-500/30",
      zinc: "bg-zinc-500/[0.03] border-white/5 hover:border-white/10"
   };
   const textColors = {
      emerald: "text-emerald-400",
      rose: "text-rose-400",
      zinc: "text-zinc-300"
   };
   return (
      <div className={`p-4 rounded-2xl border ${styles[tone]} transition-all flex items-center justify-between`}>
         <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
            <div className={`text-lg font-bold font-mono ${textColors[tone]}`}>{val}</div>
         </div>
         <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-zinc-400">
            {sub}
         </div>
      </div>
   )
}