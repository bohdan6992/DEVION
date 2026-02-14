"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";

import PresetPicker from "@/components/presets/PresetPicker";
import type { ArbitrageFilterConfigV1 } from "@/lib/filters/arbitrageFilterConfigV1";

import ListModePanel from "@/components/filters/ListModePanel";
import ActivityPanel from "@/components/filters/ActivityPanel";
import BoundsPanel from "@/components/filters/BoundsPanel";
import ExcludeIncludePanel from "@/components/filters/ExcludeIncludePanel";
import ZapPanel from "@/components/filters/ZapPanel";
import ReportEquityPanel from "@/components/filters/ReportEquityPanel";
import MultiSelectPanel from "@/components/filters/MultiSelectPanel";
import { backendUrl } from "@/lib/backend";

type ScanerRunResult = {
  summary?: {
    days?: number;
    trades?: number;
    winRate?: number;
    pnlTotal?: number;
    avgPnl?: number;
  };
  trades?: Array<{
    ticker: string;
    dateNy: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
  }>;
  notes?: string[];
};

function safeParseConfig(json: string): ArbitrageFilterConfigV1 | null {
  try {
    const obj = JSON.parse(json);
    if (!obj || obj.version !== 1) return null;
    return obj as ArbitrageFilterConfigV1;
  } catch {
    return null;
  }
}

const defaultConfig: ArbitrageFilterConfigV1 = {
  version: 1,
  lists: { mode: "off" },
  activity: { mode: "off" },
  report: { hasReport: "ALL" },
  zap: { mode: "off", thresholdAbs: 0.3 },
};

export default function ScanerTerminal() {
  const [cfg, setCfg] = useState<ArbitrageFilterConfigV1>(defaultConfig);

  const [fromNy, setFromNy] = useState("2026-02-01");
  const [toNy, setToNy] = useState("2026-02-07");
  const [tickersCsv, setTickersCsv] = useState("");
  const [maxDays, setMaxDays] = useState(30);

  const [holdMinutes, setHoldMinutes] = useState(10);
  const [slippageBps, setSlippageBps] = useState(2);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ScanerRunResult | null>(null);

  const [showAdvancedJson, setShowAdvancedJson] = useState(false);

  const tickers = useMemo(
    () =>
      tickersCsv
        .split(/[,\s]+/g)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [tickersCsv]
  );

  function getCurrentConfigJson() {
    return JSON.stringify(cfg);
  }

  async function runScaner() {
    setLoading(true);
    setErr(null);
    setResult(null);

    try {
      const body = {
        fromDateNy: fromNy,
        toDateNy: toNy,
        maxDays,
        tickers,
        filterConfigJson: getCurrentConfigJson(),
        paper: { holdMinutes, slippageBps },
      };
    
      const res = await fetch(backendUrl(`/api/scaner/run`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`SCAN_ERR: ${res.status} ${t}`);
      }

      const data = (await res.json()) as ScanerRunResult;
      setResult(data);
    } catch (e: any) {
      setErr(e?.message ?? "EXECUTION_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-300 p-4 font-sans selection:bg-emerald-500/30">
      {/* TOP NAV */}
      <div className="flex items-center justify-between mb-6 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-black font-black italic">
            A
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tighter text-white">SCANER_TERMINAL</h1>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Backtest Engine v2.4</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-neutral-400">SERVER_ONLINE</span>
          </div>
          <div className="text-neutral-600">NY_TIME: {new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: CONTROLS */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* CORE PARAMETERS */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 space-y-4">
            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] border-b border-neutral-800 pb-2">
              Runtime Parameters
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Field label="From (NY)">
                <input type="date" className="input-terminal" value={fromNy} onChange={(e) => setFromNy(e.target.value)} disabled={loading} />
              </Field>
              <Field label="To (NY)">
                <input type="date" className="input-terminal" value={toNy} onChange={(e) => setToNy(e.target.value)} disabled={loading} />
              </Field>
            </div>

            <Field label="Tickers (CSV/Whitelist)">
              <input 
                className="input-terminal" 
                value={tickersCsv} 
                onChange={(e) => setTickersCsv(e.target.value)} 
                placeholder="ALL_AVAILABLE" 
                disabled={loading} 
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Max Days">
                <input type="number" className="input-terminal" value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))} disabled={loading} />
              </Field>
              <Field label="Hold (m)">
                <input type="number" className="input-terminal" value={holdMinutes} onChange={(e) => setHoldMinutes(Number(e.target.value))} disabled={loading} />
              </Field>
              <Field label="Slip (bps)">
                <input type="number" className="input-terminal" value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))} disabled={loading} />
              </Field>
            </div>

            <button
              className={clsx(
                "w-full py-3 rounded font-bold text-xs tracking-widest transition-all",
                loading 
                  ? "bg-neutral-800 text-neutral-500 cursor-wait" 
                  : "bg-emerald-600 text-black hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              )}
              onClick={runScaner}
              disabled={loading}
            >
              {loading ? "INITIALIZING_SCAN..." : "EXECUTE_SCANNER"}
            </button>

            {err && (
              <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-[10px] font-mono text-rose-500 animate-shake">
                &gt; SYSTEM_ERR: {err}
              </div>
            )}
          </div>

          {/* PRESETS */}
          <PresetPicker
            kind="ARBITRAGE"
            scope="BOTH"
            getCurrentConfigJson={getCurrentConfigJson}
            onApplyPresetJson={(json) => {
              const parsed = safeParseConfig(json);
              if (!parsed) return alert("VERSION_MISMATCH");
              setCfg(parsed);
            }}
          />

          {/* FILTERS STACK */}
          <div className="space-y-4">
            <ListModePanel cfg={cfg} setCfg={setCfg} />
            <ActivityPanel cfg={cfg} setCfg={setCfg} />
            <ZapPanel cfg={cfg} setCfg={setCfg} />
            <ReportEquityPanel cfg={cfg} setCfg={setCfg} />
            
            <div className="grid grid-cols-1 gap-4">
                <MultiSelectPanel cfg={cfg} setCfg={setCfg} kind="countries" label="Geography" />
                <MultiSelectPanel cfg={cfg} setCfg={setCfg} kind="exchanges" label="Markets" />
            </div>

            {/* ADVANCED */}
            <div className="bg-neutral-900/20 border border-neutral-800 rounded-xl p-3">
              <button
                className="text-[10px] font-mono text-neutral-600 hover:text-neutral-400 underline decoration-dotted"
                onClick={() => setShowAdvancedJson(!showAdvancedJson)}
              >
                {showAdvancedJson ? "// HIDE_RAW_DATA" : "// VIEW_CONFIG_JSON"}
              </button>
              {showAdvancedJson && (
                <textarea
                  className="mt-3 w-full h-48 bg-black/60 border border-neutral-800 rounded p-2 font-mono text-[10px] text-emerald-500/80 outline-none"
                  value={JSON.stringify(cfg, null, 2)}
                  onChange={(e) => {
                    const parsed = safeParseConfig(e.target.value);
                    if (parsed) setCfg(parsed);
                  }}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULTS */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 min-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4">
              <div className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Output / Trade Log</div>
              <div className="text-[9px] font-mono text-neutral-500 italic">Total Items: {result?.trades?.length ?? 0}</div>
            </div>

            {!result && !loading && (
              <div className="flex-1 flex flex-col items-center justify-center opacity-20 grayscale">
                 <div className="text-4xl mb-2">⌬</div>
                 <p className="font-mono text-xs uppercase tracking-widest text-center">
                    Awaiting scan command...<br/>
                    <span className="text-[10px]">Configure filters and press EXECUTE</span>
                 </p>
              </div>
            )}

            {result?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Days" value={result.summary.days} />
                <StatCard label="Execution Count" value={result.summary.trades} />
                <StatCard label="Win Probability" value={fmtPct(result.summary.winRate)} highlight={Number(result.summary.winRate) > 0.5} />
                <StatCard label="Net PnL" value={fmtNum(result.summary.pnlTotal)} highlight={Number(result.summary.pnlTotal) > 0} />
              </div>
            )}

            {result?.notes?.length ? (
              <div className="mb-6 p-3 bg-blue-500/5 border border-blue-500/20 rounded">
                <div className="text-[10px] font-bold text-blue-400 uppercase mb-2">Engine Notes:</div>
                <div className="space-y-1">
                   {result.notes.map((n, i) => (
                     <div key={i} className="text-[11px] font-mono text-neutral-400 flex gap-2">
                        <span className="text-blue-500 opacity-50">→</span> {n}
                     </div>
                   ))}
                </div>
              </div>
            ) : null}

            <div className="flex-1 overflow-auto rounded border border-neutral-800 bg-black/20">
              <table className="w-full text-left border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 bg-neutral-900 text-neutral-500 border-b border-neutral-800">
                  <tr>
                    <th className="p-2 font-bold uppercase tracking-tighter">Timestamp</th>
                    <th className="p-2 font-bold uppercase tracking-tighter">Ticker</th>
                    <th className="p-2 font-bold uppercase tracking-tighter text-center">Dir</th>
                    <th className="p-2 font-bold uppercase tracking-tighter text-right">Entry</th>
                    <th className="p-2 font-bold uppercase tracking-tighter text-right">Exit</th>
                    <th className="p-2 font-bold uppercase tracking-tighter text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {result?.trades?.map((t, idx) => (
                    <tr key={idx} className="hover:bg-neutral-800/30 transition-colors group">
                      <td className="p-2 text-neutral-500">{t.dateNy}</td>
                      <td className="p-2 text-emerald-500 font-bold tracking-widest">{t.ticker}</td>
                      <td className="p-2 text-center">
                         <span className={clsx(
                           "px-1 rounded-[2px] text-[9px] font-bold",
                           t.side === "LONG" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                         )}>{t.side}</span>
                      </td>
                      <td className="p-2 text-right text-neutral-400">{t.entryPrice.toFixed(3)}</td>
                      <td className="p-2 text-right text-neutral-400">{t.exitPrice.toFixed(3)}</td>
                      <td className={clsx(
                        "p-2 text-right font-bold",
                        t.pnl > 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {t.pnl > 0 && "+"}{t.pnl.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                  {result && result.trades?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-neutral-700 italic font-mono uppercase tracking-widest">
                        // zero_results_returned
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx global>{`
        .input-terminal {
          @apply w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs font-mono text-neutral-200 outline-none focus:border-emerald-500/50 transition-all;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] font-bold text-neutral-600 uppercase tracking-tight ml-1">{label}</div>
      {children}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={clsx(
      "border border-neutral-800 rounded-lg p-3 bg-black/40",
      highlight && "border-emerald-500/30"
    )}>
      <div className="text-[9px] font-mono text-neutral-600 uppercase">{label}</div>
      <div className={clsx("text-lg font-mono font-bold tracking-tighter", highlight ? "text-emerald-500" : "text-white")}>
        {value}
      </div>
    </div>
  );
}

function fmtPct(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return "0.00";
  return n.toFixed(2);
}