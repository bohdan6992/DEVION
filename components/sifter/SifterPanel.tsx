"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSifter } from "./SifterProvider";
import type { SifterDayRow } from "@/lib/sifterClient";
import { setSifterHandoff } from "@/lib/sifterHandoff";
import clsx from "clsx";

// --- Utilities ---
const toNum = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isNaN(x) || !Number.isFinite(x) ? null : x;
};

const fmt = (n: any, digits = 2) => {
  const x = toNum(n);
  return x === null ? "—" : x.toFixed(digits);
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

// --- Sub-Components ---
const GlassInput = ({ label, ...props }: any) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono ml-1">
      {label}
    </label>
    <input
      {...props}
      className="bg-[#0a0a0a]/40 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-200 
                 focus:outline-none focus:border-emerald-500/40 focus:bg-[#0a0a0a]/80 transition-all font-mono"
    />
  </div>
);

const MetricCard = ({ label, value, colorClass = "text-zinc-200" }: any) => (
  <div className="bg-[#0a0a0a]/40 border border-white/[0.06] rounded-xl p-3 backdrop-blur-md">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">{label}</div>
    <div className={clsx("text-lg font-bold tabular-nums", colorClass)}>{value}</div>
  </div>
);

export function SifterPanel() {
  const { state, actions } = useSifter();
  const router = useRouter();
  const metricKey = state.metric;

  // Logic: Rows Mapping
  const rows: SifterDayRow[] = useMemo(() => {
    if (state.runMode === "tickerdays") {
      const days = (state.tdResult?.days ?? []) as any[];
      return days.map((d) => ({
        dateNy: (d.dateNy ?? d.DateNy ?? "").toString(),
        ticker: (d.ticker ?? d.Ticker ?? "").toString(),
        gapPct: d.gapPct ?? d.GapPct ?? null,
        clsToClsPct: d.clsToClsPct ?? d.ClsToClsPct ?? null,
        marketCapM: d.marketCapM ?? d.MarketCapM ?? null,
        sectorL3: d.sectorL3 ?? d.SectorL3 ?? null,
        exchange: d.exchange ?? d.Exchange ?? null,
        adv: d.adv20 ?? d.Adv20 ?? d.adv ?? null,
        pctChange: d.pctChange ?? d.PctChange ?? null,
      })).filter(r => r.dateNy && r.ticker) as any;
    }
    return state.rows;
  }, [state.runMode, state.rows, state.tdResult]);

  // Logic: Performance
  const perf = useMemo(() => {
    const byTicker = new Map<string, { sum: number; n: number; wins: number }>();
    const vals: number[] = [];
    const readMetric = (r: SifterDayRow): number | null => {
      const x = toNum((r as any)[metricKey]);
      if (x === null) return null;
      return state.perfSide === "short" ? -x : x;
    };

    for (const r of rows) {
      const v = readMetric(r);
      if (v === null) continue;
      vals.push(v);
      const cur = byTicker.get(r.ticker) ?? { sum: 0, n: 0, wins: 0 };
      cur.sum += v; cur.n += 1; if (v > 0) cur.wins += 1;
      byTicker.set(r.ticker, cur);
    }

    const sum = vals.reduce((a, b) => a + b, 0);
    const curve: any[] = [];
    let eq = 0;
    [...rows].sort((a, b) => a.dateNy.localeCompare(b.dateNy)).forEach(r => {
      const v = readMetric(r);
      if (v !== null) { eq += v; curve.push({ dateNy: r.dateNy, eq }); }
    });

    return {
      sum, n: vals.length, avg: vals.length ? sum / vals.length : 0,
      med: median(vals), winRate: vals.length ? vals.filter(v => v > 0).length / vals.length : 0,
      curve, breakdown: [...byTicker.entries()].map(([ticker, s]) => ({
        ticker, sum: s.sum, n: s.n, win: s.wins / s.n
      })).sort((a, b) => b.sum - a.sum).slice(0, 15)
    };
  }, [rows, metricKey, state.perfSide]);

  const loading = state.runMode === "tickerdays" ? state.tdStatus === 2 : state.loading;
  const err = state.runMode === "tickerdays" ? state.tdError : state.error;

  return (
    <div className="h-full flex flex-col bg-[#030303] selection:bg-emerald-500/30 relative overflow-hidden">
      {/* Background Nebulas */}
      <div className="fixed -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[150px] pointer-events-none" />
      <div className="fixed -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-violet-500/10 blur-[150px] pointer-events-none" />

      {/* 1. Header & Filters */}
      <div className="p-4 bg-[#0a0a0a]/40 border-b border-white/[0.06] backdrop-blur-xl z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 tracking-tighter">
            Sifter Analysis
          </h2>
          <div className="flex gap-2">
            {loading && (
              <button onClick={actions.cancelTickerdays} className="px-4 py-1.5 rounded-lg bg-rose-950/30 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold uppercase hover:bg-rose-950/50 transition-all">
                Cancel Job
              </button>
            )}
            <button 
              onClick={state.runMode === "tickerdays" ? actions.runTickerdays : actions.runDays}
              disabled={loading}
              className="px-6 py-1.5 rounded-lg bg-emerald-500 text-black text-[10px] font-mono font-bold uppercase hover:bg-emerald-400 transition-all disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]"
            >
              {loading ? "Processing..." : "Execute Run"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-1 flex flex-col gap-1">
             <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono ml-1">Mode</label>
             <div className="flex bg-[#0a0a0a]/60 p-1 rounded-lg border border-white/[0.06]">
                {["quick", "tickerdays"].map(m => (
                  <button key={m} onClick={() => actions.set("runMode", m as any)} className={clsx("flex-1 py-1 text-[10px] font-mono uppercase rounded-md transition-all", state.runMode === m ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}>
                    {m}
                  </button>
                ))}
             </div>
          </div>
          <GlassInput label="From Date" value={state.fromDateNy} onChange={(e: any) => actions.set("fromDateNy", e.target.value)} />
          <GlassInput label="To Date" value={state.toDateNy} onChange={(e: any) => actions.set("toDateNy", e.target.value)} />
          <div className="col-span-2">
             <GlassInput label="Tickers (CSV)" placeholder="AAPL, TSLA..." value={state.tickersText} onChange={(e: any) => actions.set("tickersText", e.target.value)} />
          </div>
          <GlassInput label="Sector L3" value={state.sectorL3 ?? ""} onChange={(e: any) => actions.set("sectorL3", e.target.value || null)} />
        </div>

        {/* Progress Bar for TickerDays */}
        {state.runMode === "tickerdays" && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
              <span>{state.tdMessage || "Ready"}</span>
              <span>{fmt((state.tdProgress ?? 0) * 100, 0)}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_#10b981]" style={{ width: `${(state.tdProgress ?? 0) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Content (Table) */}
      <div className="flex-1 overflow-auto z-10 custom-scrollbar">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-[#030303]/80 backdrop-blur-xl border-b border-white/[0.06] z-20">
            <tr className="text-zinc-500 uppercase tracking-widest text-[10px]">
              <th className="text-left p-4 font-medium">Date (NY)</th>
              <th className="text-left p-4 font-medium">Ticker</th>
              <th className="text-right p-4 font-medium">Gap %</th>
              <th className="text-right p-4 font-medium">C2C %</th>
              <th className="text-right p-4 font-medium">Mkt Cap (M)</th>
              <th className="text-left p-4 font-medium">Sector</th>
              <th className="text-left p-4 font-medium">Exchange</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {rows.map((r) => {
              const key = `${r.dateNy}|${r.ticker}`;
              const g = toNum(r.gapPct);
              const c = toNum(r.clsToClsPct);
              return (
                <tr key={key} onClick={() => { actions.selectRow(r.dateNy, r.ticker); setSifterHandoff({ ...state, dateNy: r.dateNy, ticker: r.ticker }); router.push("/tape"); }}
                    className="group hover:bg-white/[0.03] cursor-pointer transition-colors tabular-nums">
                  <td className="p-4 text-zinc-400">{r.dateNy}</td>
                  <td className="p-4 text-white font-bold group-hover:text-emerald-400 transition-colors">{r.ticker}</td>
                  <td className={clsx("p-4 text-right", g! >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmt(r.gapPct)}%</td>
                  <td className={clsx("p-4 text-right", c! >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmt(r.clsToClsPct)}%</td>
                  <td className="p-4 text-right text-zinc-300">{fmt(r.marketCapM, 0)}</td>
                  <td className="p-4 text-zinc-500 uppercase text-[10px]">{r.sectorL3}</td>
                  <td className="p-4 text-zinc-500">{r.exchange}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. Footer Performance Panel */}
      <div className="p-4 bg-[#0a0a0a]/80 border-t border-white/[0.1] backdrop-blur-2xl z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="grid grid-cols-4 gap-4 mb-4">
          <MetricCard label="Total PnL Sum" value={`${fmt(perf.sum)}%`} colorClass={perf.sum >= 0 ? "text-emerald-400" : "text-rose-400"} />
          <MetricCard label="Average Trade" value={`${fmt(perf.avg)}%`} />
          <MetricCard label="Median" value={`${fmt(perf.med)}%`} />
          <MetricCard label="Win Rate" value={`${fmt(perf.winRate * 100, 1)}%`} colorClass="text-cyan-400" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#0a0a0a]/40 border border-white/[0.06] rounded-xl p-3">
            <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">Recent Equity Path</h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {perf.curve.slice(-6).map((p, i) => (
                <div key={i} className="flex flex-col items-center bg-white/[0.03] border border-white/[0.05] rounded-lg p-2 min-w-[80px]">
                  <span className="text-[9px] text-zinc-600 font-mono">{p.dateNy}</span>
                  <span className={clsx("text-xs font-bold font-mono", p.eq >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmt(p.eq, 1)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#0a0a0a]/40 border border-white/[0.06] rounded-xl p-3">
            <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">Alpha Leaders (Top Sum)</h4>
            <div className="flex flex-wrap gap-2">
              {perf.breakdown.slice(0, 5).map(b => (
                <div key={b.ticker} className="px-2 py-1 bg-emerald-950/20 border border-emerald-500/20 rounded-md">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">{b.ticker}</span>
                  <span className="ml-2 text-[10px] font-mono text-emerald-200/60">+{fmt(b.sum, 1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}