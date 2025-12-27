"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getOpendoorTicker } from "@/lib/trapClient";
import { 
  ArrowLeft, RefreshCw, Zap, Box, Layers, 
  Target, Clock, Activity, TrendingUp, ChevronRight 
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Line, Bar, Area
} from "recharts";

/* ============================= Helpers ============================= */

const sortClasses = (classesArr: any[]) => {
  const getWeight = (cls: string) => {
    const c = cls.toLowerCase();
    if (c === "glob") return -1;
    const match = c.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
  };
  return [...classesArr].sort((a, b) => getWeight(a.cls) - getWeight(b.cls));
};

const fmtNum = (v: any, d = 3) => {
  const n = parseFloat(v);
  return isNaN(n) ? "—" : n.toFixed(d);
};

const fmtPct = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
};

/* ============================= UI Components ============================= */

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0a0a0a]/60 border border-white/[0.06] backdrop-blur-md rounded-2xl shadow-xl hover:border-white/[0.12] hover:bg-[#0a0a0a]/80 transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "emerald" | "rose" | "violet" | "cyan" }) {
  const styles = {
    default: "bg-zinc-900/40 text-zinc-400 border-zinc-500/20",
    emerald: "bg-emerald-950/30 text-emerald-400 border-emerald-500/20",
    rose: "bg-rose-950/30 text-rose-400 border-rose-500/20",
    violet: "bg-violet-950/30 text-violet-400 border-violet-500/20",
    cyan: "bg-cyan-950/30 text-cyan-400 border-cyan-500/20",
  };
  return (
    <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase border tracking-widest ${styles[variant]}`}>
      {children}
    </span>
  );
}

function StatBox({ label, value, subValue, variant = "default" }: any) {
  return (
    <div className="p-4 flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-mono font-bold text-zinc-200 tabular-nums tracking-tighter">{value}</span>
        {subValue && <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tighter">{subValue}</span>}
      </div>
    </div>
  );
}

const GlassTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#050505]/90 border border-white/10 backdrop-blur-xl p-3 rounded-xl shadow-2xl ring-1 ring-white/10">
      <p className="font-mono text-[10px] font-black text-zinc-500 mb-2 border-b border-white/5 pb-1 uppercase tracking-widest">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex justify-between gap-8 items-center">
            <span className="font-mono text-[10px] uppercase tracking-tighter font-medium" style={{ color: entry.color || entry.stroke }}>{entry.name}</span>
            <span className="font-mono text-[10px] text-white font-bold tabular-nums">
              {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================= Chart Core ============================= */

function TerminalChart({ data, type, id }: { data: any[], type: 'rates' | 'move' | 'delta', id: string }) {
  const gradientId = `grad-${type}-${id}`;
  
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: -35 }}>
          <defs>
            <linearGradient id={`${gradientId}-up`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id={`${gradientId}-dn`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#52525b", fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#52525b", fontSize: 9, fontFamily: 'monospace' }} />
          <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          
          {type === 'rates' && (
            <>
              <Bar dataKey="upRate" name="Up Prob" stackId="a" fill={`url(#${gradientId}-up)`} stroke="#10b981" strokeWidth={1} radius={[2, 2, 0, 0]} />
              <Bar dataKey="dnRate" name="Down Prob" stackId="a" fill={`url(#${gradientId}-dn)`} stroke="#f43f5e" strokeWidth={1} radius={[0, 0, 2, 2]} />
            </>
          )}

          {type === 'move' && (
            <>
              <Line type="monotone" dataKey="upMean" name="Mean Up" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="upMed" name="Med Up" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.5} />
              <Line type="monotone" dataKey="dnMean" name="Mean Dn" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="dnMed" name="Med Dn" stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.5} />
            </>
          )}

          {type === 'delta' && (
            <>
              <Bar dataKey="sdUpSum" name="Sum Δ Up" stackId="b" fill="#10b981" fillOpacity={0.1} stroke="#10b981" strokeWidth={0.5} />
              <Bar dataKey="sdDnSum" name="Sum Δ Dn" stackId="b" fill="#f43f5e" fillOpacity={0.1} stroke="#f43f5e" strokeWidth={0.5} />
              <Line type="step" dataKey="sdUpMed" name="Med Δ Up" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="step" dataKey="sdDnMed" name="Med Δ Dn" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================= Heatmap Core ============================= */

function HeatmapTerminal({ title, hm, valueKey }: any) {
  const xEdges = hm?.x_edges || [];
  const yEdges = hm?.y_edges || [];
  const nX = xEdges.length - 1;
  const nY = yEdges.length - 1;

  const gridData = useMemo(() => {
    if (!nX || !nY) return [];
    const matrix = Array.from({ length: nY }, () => Array(nX).fill(null));
    hm.cells?.forEach((c: any) => {
      const xi = xEdges.indexOf(c.x_from);
      const yi = yEdges.indexOf(c.y_from);
      if (xi !== -1 && yi !== -1) matrix[yi][xi] = c[valueKey];
    });
    return matrix.flat();
  }, [hm, valueKey, nX, nY, xEdges, yEdges]);

  return (
    <div className="flex-1 min-w-[140px] space-y-3">
      <div className="font-mono text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1 border-l-2 border-white/10">{title}</div>
      <div className="grid gap-[2px] p-1 bg-white/[0.02] rounded-lg border border-white/[0.04]" style={{ gridTemplateColumns: `repeat(${nX}, minmax(0, 1fr))` }}>
        {gridData.map((v, i) => {
          const intensity = v === null ? 0 : Math.min(1, 0.2 + Math.abs(v) * 5);
          const bg = v === null ? 'rgba(255,255,255,0.02)' : (v >= 0 ? `rgba(16, 185, 129, ${intensity})` : `rgba(244, 63, 94, ${intensity})`);
          return (
            <div key={i} className="aspect-square rounded-[1px] transition-all hover:ring-1 hover:ring-white/40" 
                 style={{ background: bg }} 
                 title={fmtNum(v)} 
            />
          );
        })}
      </div>
    </div>
  );
}

/* ============================= Main Page ============================= */

export default function OpenDoor({ ticker: tickerProp }: { ticker: string }) {
  const tickerFromProp = String(tickerProp ?? "").trim().toUpperCase();
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    async function load() {
      if (!tickerFromProp) return;
      setLoading(true);
      try {
        const res = await getOpendoorTicker(tickerFromProp);
        setItem(res?.item);
      } catch (e) {} finally { setLoading(false); }
    }
    load();
  }, [tickerFromProp]);

  const sortedClasses = useMemo(() => {
    if (!item?.classes) return [];
    const entries = Object.entries(item.classes).map(([cls, data]: any) => ({ cls, ...data }));
    return sortClasses(entries);
  }, [item]);

  return (
    <div className="min-h-screen bg-[#030303] selection:bg-emerald-500/30 selection:text-white text-zinc-400 font-sans p-6 md:p-12 relative overflow-hidden">
      
      {/* Background Nebulas */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="fixed inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none" />

      <div className="relative max-w-[1440px] mx-auto space-y-16">
        
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 pb-12 border-b border-white/[0.06]">
          <div className="space-y-4">
            <Link href="/stats/opendoor" className="group font-mono text-[10px] font-black text-zinc-500 hover:text-white flex items-center gap-2 tracking-[0.3em] transition-all">
              <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" /> TERMINAL_INDEX
            </Link>
            <div className="space-y-1">
              <h1 className="text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 leading-none">
                {tickerFromProp}
              </h1>
              <div className="flex gap-3 items-center">
                <Badge variant="cyan">Engine v4.0.2</Badge>
                <div className="w-1 h-1 rounded-full bg-zinc-800" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Deep Space Analytics Terminal</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <GlassCard className="flex divide-x divide-white/[0.06]">
                <StatBox label="Global Sample" value={item?.classes?.glob?.stats?.total || "0"} />
                <StatBox label="Reliability" value="99.2%" subValue="Score" />
             </GlassCard>
             <Link href={`/signals/opendoor?tickers=${tickerFromProp}`} className="bg-emerald-500 text-black h-16 px-10 rounded-2xl text-[11px] font-black flex items-center gap-3 hover:bg-emerald-400 transition-all uppercase tracking-widest shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] hover:scale-[1.02]">
               <Zap size={14} fill="black" /> Active Signals
             </Link>
          </div>
        </header>

        {loading ? (
          <div className="h-[40vh] flex flex-col items-center justify-center gap-6">
            <RefreshCw className="animate-spin text-emerald-500/40" size={48} />
            <p className="font-mono text-[10px] font-black tracking-[0.5em] text-zinc-600 animate-pulse uppercase">Syncing Terminal Stream</p>
          </div>
        ) : (
          <div className="space-y-40">
            {sortedClasses.map((c: any) => (
              <section key={c.cls} className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                
                {/* Section Header */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-8">
                  <div className="min-w-[200px] space-y-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${c.cls === 'glob' ? 'bg-violet-500' : 'bg-emerald-500'} shadow-lg`} />
                        <h2 className="text-4xl font-bold text-white tracking-tighter uppercase">{c.cls}</h2>
                    </div>
                    <Badge variant={c.cls === 'glob' ? 'violet' : 'emerald'}>
                      {c.cls === 'glob' ? 'Master Data Frame' : `Intraday Segment ${c.cls}`}
                    </Badge>
                  </div>
                  
                  <GlassCard className="flex-1 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.06]">
                    <StatBox label="Probability Up" value={fmtPct(c.stats?.up_rate)} variant="emerald" />
                    <StatBox label="Probability Dn" value={fmtPct(c.stats?.down_rate)} variant="rose" />
                    <StatBox label="Mean Movement" value={fmtNum(c.stats?.mean_move, 4)} />
                    <StatBox label="Stack Delta" value={fmtNum(c.stats?.mean_stack_delta, 4)} />
                  </GlassCard>
                </div>

                {/* Grid 1: Bins 1D */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {['stack', 'bench', 'dev_sig'].map((feat) => {
                    const binsData = c.bins_1d?.[feat]?.bins?.map((b: any) => ({
                      label: `${b.from.toFixed(1)}`,
                      upRate: b.up_rate, dnRate: b.down_rate,
                      upMean: b.up?.mean, upMed: b.up?.median,
                      dnMean: b.down?.mean, dnMed: b.down?.median,
                      sdUpSum: b.stack_delta?.up?.sum, sdDnSum: b.stack_delta?.down?.sum,
                      sdUpMed: b.stack_delta?.up?.median, sdDnMed: b.stack_delta?.down?.median
                    })) || [];
                    return (
                      <GlassCard key={feat} className="p-8 space-y-10">
                        <div className="flex justify-between items-center border-b border-white/[0.06] pb-4">
                           <div className="flex items-center gap-3">
                              <Box size={14} className="text-emerald-500/60" />
                              <span className="font-mono text-[11px] font-bold text-zinc-200 uppercase tracking-widest">{feat} bins</span>
                           </div>
                           <span className="font-mono text-[9px] text-zinc-600 tracking-tighter">SEG_ID: {feat.toUpperCase()}</span>
                        </div>

                        <div className="space-y-12">
                          <div className="space-y-3">
                             <p className="font-mono text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Activity size={10} className="text-cyan-400" /> Directional Bias
                             </p>
                             <TerminalChart data={binsData} type="rates" id={`${c.cls}-${feat}`} />
                          </div>
                          <div className="space-y-3">
                             <p className="font-mono text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <TrendingUp size={10} className="text-amber-400" /> Mean/Med Move
                             </p>
                             <TerminalChart data={binsData} type="move" id={`${c.cls}-${feat}`} />
                          </div>
                          <div className="space-y-3">
                             <p className="font-mono text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Target size={10} className="text-violet-400" /> Delta Force
                             </p>
                             <TerminalChart data={binsData} type="delta" id={`${c.cls}-${feat}`} />
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>

                {/* Grid 2: Heatmaps */}
                <GlassCard className="p-8 space-y-10">
                    <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
                        <Layers size={14} className="text-violet-500/60" />
                        <span className="font-mono text-[11px] font-bold text-zinc-200 uppercase tracking-widest">Cross-Correlation Matrices</span>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                        <div className="space-y-8">
                            <div className="font-mono text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-white/[0.03] p-2 rounded inline-block">Variable: Average Move Magnitude</div>
                            <div className="flex flex-wrap md:flex-nowrap gap-6">
                                <HeatmapTerminal title="Stack × Bench" hm={c.heatmaps?.stack_vs_bench} valueKey="avg_move" />
                                <HeatmapTerminal title="Stack × Dev" hm={c.heatmaps?.stack_vs_dev} valueKey="avg_move" />
                                <HeatmapTerminal title="Bench × Dev" hm={c.heatmaps?.bench_vs_dev} valueKey="avg_move" />
                            </div>
                        </div>
                        <div className="space-y-8">
                            <div className="font-mono text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-white/[0.03] p-2 rounded inline-block">Variable: Avg Stack Δ Velocity</div>
                            <div className="flex flex-wrap md:flex-nowrap gap-6">
                                <HeatmapTerminal title="Stack × Bench" hm={c.heatmaps?.stack_vs_bench} valueKey="avg_stack_delta" />
                                <HeatmapTerminal title="Stack × Dev" hm={c.heatmaps?.stack_vs_dev} valueKey="avg_stack_delta" />
                                <HeatmapTerminal title="Bench × Dev" hm={c.heatmaps?.bench_vs_dev} valueKey="avg_stack_delta" />
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* Grid 3: Peaks (Master Only) */}
                {c.cls === 'glob' && c.glob_peak_time && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <GlassCard className="p-8 hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)]">
                        <div className="flex items-center gap-3 mb-8">
                          <Clock className="text-emerald-500" size={16} />
                          <span className="font-mono text-[11px] font-bold text-white uppercase tracking-widest">Temporal Density (Up Peaks)</span>
                        </div>
                        <div className="h-44">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(c.glob_peak_time.up_peak).map(([t, n]) => ({ t, n }))}>
                                  <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="2 4" vertical={false} />
                                  <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{fontSize: 8, fill: '#3f3f46', fontFamily: 'monospace'}} />
                                  <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(16,185,129,0.05)' }} />
                                  <Bar dataKey="n" name="Occurrence" fill="#10b981" fillOpacity={0.2} stroke="#10b981" strokeWidth={1} barSize={6} radius={[2, 2, 0, 0]} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </GlassCard>
                     
                     <GlassCard className="p-8 hover:shadow-[0_0_40px_-10px_rgba(244,63,94,0.1)]">
                        <div className="flex items-center gap-3 mb-8">
                          <Clock className="text-rose-500" size={16} />
                          <span className="font-mono text-[11px] font-bold text-white uppercase tracking-widest">Temporal Density (Down Peaks)</span>
                        </div>
                        <div className="h-44">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(c.glob_peak_time.down_peak).map(([t, n]) => ({ t, n }))}>
                                  <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="2 4" vertical={false} />
                                  <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{fontSize: 8, fill: '#3f3f46', fontFamily: 'monospace'}} />
                                  <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(244,63,94,0.05)' }} />
                                  <Bar dataKey="n" name="Occurrence" fill="#f43f5e" fillOpacity={0.2} stroke="#f43f5e" strokeWidth={1} barSize={6} radius={[2, 2, 0, 0]} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </GlassCard>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* Footer Terminal ID */}
        <footer className="pt-24 pb-12 opacity-20 flex justify-between items-center border-t border-white/[0.06]">
            <div className="font-mono text-[9px] tracking-[0.4em] uppercase">System_Auth: {Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
            <div className="font-mono text-[9px] tracking-[0.4em] uppercase">Deep_Space_Terminal_v4.2.0</div>
        </footer>
      </div>
    </div>
  );
}