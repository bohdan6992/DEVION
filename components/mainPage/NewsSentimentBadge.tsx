// components/NewsSentimentBadge.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUi } from "@/components/UiProvider";
import { Brain, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

/* =========================================================
   LOGIC: Sentiment Analysis (Preserved from Original)
   ========================================================= */
const POS: Record<string, number> = {
  beat: 2.2, beats: 2.2, "beats-estimates": 2.4, top: 1.2, tops: 1.2,
  surge: 2.6, surges: 2.6, soar: 2.8, soars: 2.8, rally: 2.2, rallies: 2.2,
  jump: 1.8, jumps: 1.8, gain: 1.6, gains: 1.6, upgrade: 1.9, upgrades: 1.9,
  bullish: 2.2, record: 1.9, "all-time-high": 2.6, expand: 1.2, expansion: 1.2,
  outperform: 2.0, outperforms: 2.0, strong: 1.2, robust: 1.2, accelerate: 1.4,
  зростання: 1.9, зростає: 1.9, злет: 2.5, рекорд: 1.9, "оновив-рекорд": 2.6,
  підвищив: 1.6, підвищення: 1.6, "краще-очікувань": 2.2, бичачий: 2.0,
  перевищив: 1.8, прискорення: 1.4,
};

const NEG: Record<string, number> = {
  miss: -2.2, misses: -2.2, plunge: -2.8, plunges: -2.8, slump: -2.4, slumps: -2.4,
  drop: -1.7, drops: -1.7, fall: -1.6, falls: -1.6, cut: -1.7, cuts: -1.7,
  downgrade: -2.1, downgrades: -2.1, bearish: -2.2, warn: -1.8, warns: -1.8,
  bankruptcy: -3.2, default: -2.6, fear: -1.8, recession: -2.3, probe: -1.3,
  investigation: -1.6, lawsuit: -1.7,
  падає: -1.8, падіння: -1.8, обвал: -2.8, обвалився: -2.8, зниження: -1.6, знизив: -1.6,
  гірше: -1.7, гірший: -1.7, ведмежий: -2.0, дефолт: -2.6, рецесія: -2.3,
  штраф: -1.7, розслідування: -1.6,
};

const NEGATIONS = new Set(["no", "not", "без", "ні", "не", "notwithstanding"]);
const DAMPEN = new Set(["rumor", "rumors", "reportedly", "may", "might", "можливо", "чутки"]);

const PHRASES: Record<string, number> = {
  "beats estimates": 2.4, "misses estimates": -2.4, "all time high": 2.6,
  "guidance raised": 2.2, "guidance cut": -2.2, "share buyback": 1.6,
  "stock split": 1.4, "sec investigation": -1.9, "antitrust probe": -2.0,
  "краще очікувань": 2.2, "гірше очікувань": -2.2, "підвищив прогноз": 2.0, "знизив прогноз": -2.0,
};

const TICKER_RE = /\$?[A-Z]{1,5}\b/g;

function tokenize(s: string): string[] {
  return (s.toLowerCase().normalize("NFKD").match(/[a-zа-яіїє$][a-z0-9а-яіїє$\-]+/gi) ?? [])
    .map(w => w.replace(/[^\p{L}\p{N}$-]/gu, ""));
}

function scoreText(text: string) {
  const w = tokenize(text);
  let score = 0;
  const emphasis = /[A-Z]{3,}/.test(text) ? 1.1 : 1.0;
  const exclam = /!+/.test(text) ? 1.05 : 1.0;

  const grams: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const bi = [w[i], w[i + 1]].filter(Boolean).join(" ");
    const tri = [w[i], w[i + 1], w[i + 2]].filter(Boolean).join(" ");
    if (PHRASES[tri]) grams.push(tri);
    if (PHRASES[bi]) grams.push(bi);
  }
  for (const g of grams) score += PHRASES[g];

  for (let i = 0; i < w.length; i++) {
    const t = w[i];
    let val = POS[t] ?? NEG[t] ?? 0;
    if (val !== 0) {
      const prev = w.slice(Math.max(0, i - 2), i);
      if (prev.some(p => NEGATIONS.has(p))) val = -val;
      if (prev.some(p => DAMPEN.has(p))) val *= 0.8;
      score += val;
    }
    if (DAMPEN.has(t)) score *= 0.9;
  }
  return score * emphasis * exclam;
}

function normalizeScore(x: number) { return Math.tanh(x / 4.0); }

function labelFor(score: number) {
  if (score >= 0.2) return { label: "BULLISH", key: "bull" as const, color: "emerald" };
  if (score <= -0.2) return { label: "BEARISH", key: "bear" as const, color: "rose" };
  return { label: "NEUTRAL", key: "neutral" as const, color: "blue" };
}

function recencyWeight(date: Date, now = Date.now()) {
  const minutes = (now - date.getTime()) / 60000;
  const tau = (6 * 60) / Math.log(2);
  return Math.exp(-minutes / tau);
}

function useAutoFetch<T>(url: string, refreshMs: number, deps: any[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; ts: number }>({
    data: null, error: null, loading: true, ts: Date.now(),
  });

  useEffect(() => {
    let dead = false;
    let ctrl: AbortController | null = null;
    const load = async () => {
      try {
        ctrl = new AbortController();
        if (!state.data) setState(s => ({ ...s, loading: true, error: null }));
        const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (dead) return;
        setState({ data, error: null, loading: false, ts: Date.now() });
      } catch (e: any) {
        if (dead || e?.name === "AbortError") return;
        setState(s => ({ ...s, error: e?.message || "Network error", loading: false }));
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => { dead = true; ctrl?.abort(); clearInterval(t); };
  }, [url, refreshMs, ...deps]);

  return state;
}

// --- UI COMPONENT: Terminal Badge ---
const TerminalBadge = ({ children, icon: Icon, color = "zinc" }: { children: React.ReactNode, icon?: any, color?: "zinc" | "emerald" | "violet" | "cyan" | "rose" | "blue" }) => {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    cyan: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${colors[color] || colors.zinc}`}>
      {Icon && <Icon size={10} />}
      {children}
    </div>
  );
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */
export default function NewsSentimentBadge({
  fetchUrl = "/api/news/investing?limit=60",
  refreshMs = 120_000,
}: {
  fetchUrl?: string;
  refreshMs?: number;
}) {
  const { theme } = useUi();
  const { data, error, loading, ts } = useAutoFetch<{ items: any[] }>(fetchUrl, refreshMs, [theme]);
  const items = Array.isArray(data?.items) ? data!.items : [];

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const stats = useMemo(() => {
    const now = Date.now();
    let wSum = 0, sSum = 0;
    const spark: number[] = [];
    const posBag: Record<string, number> = {};
    const negBag: Record<string, number> = {};
    const tickers: Record<string, number> = {};

    const recent = items.slice(0, 40);

    for (const it of recent) {
      const title = it?.title || "";
      const t = new Date(it?.pubDate || Date.now());
      const w = recencyWeight(t, now);
      const raw = scoreText(title);
      const n = normalizeScore(raw);
      sSum += n * w;
      wSum += w;
      spark.unshift(n);

      const tokens = tokenize(title);
      for (const tk of tokens) {
        if (POS[tk]) posBag[tk] = (posBag[tk] || 0) + 1;
        if (NEG[tk]) negBag[tk] = (negBag[tk] || 0) + 1;
      }
      const possible = (title.match(TICKER_RE) || []).map((s: string) => s.replace("$", ""));
      for (const tk of possible) {
        if (tk.length < 2) continue;
        tickers[tk] = (tickers[tk] || 0) + 1;
      }
    }

    const score = wSum > 0 ? sSum / wSum : 0;
    const { label, key, color } = labelFor(score);

    const top = (bag: Record<string, number>, k = 3) =>
      Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, k).map(([w]) => w.toUpperCase());

    return { 
      score, label, key, color, spark, 
      topPos: top(posBag), 
      topNeg: top(negBag), 
      topTix: Object.entries(tickers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t.replace(/[^A-Z]/g, "").slice(0, 6)),
      count: recent.length 
    };
  }, [items, ts]);

  const pct = Math.round(((stats.score + 1) / 2) * 100); 
  const timeString = mounted ? new Date(ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  // Dynamic Styles
  const barColor = stats.key === 'bull' ? 'bg-emerald-500' : stats.key === 'bear' ? 'bg-rose-500' : 'bg-blue-500';
  const shadowColor = stats.key === 'bull' ? 'rgba(16,185,129,0.5)' : stats.key === 'bear' ? 'rgba(244,63,94,0.5)' : 'rgba(59,130,246,0.5)';

  return (
    <section className="w-full h-full min-h-[300px]">
      {/* Deep Space Glass Card */}
      <div className="relative w-full h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-xl shadow-xl flex flex-col group">
        
        {/* Hover Gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-10" />

        {/* --- HEADER --- */}
        <header className="relative z-10 flex items-center justify-between p-6 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
              <Brain size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                NEWS SENTIMENT
                <span className={`flex h-1.5 w-1.5 rounded-full ${barColor} shadow-[0_0_6px_${shadowColor}] animate-pulse`} />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">AI Analysis Engine</span>
              </div>
            </div>
          </div>
          <TerminalBadge icon={Activity} color="zinc">UPDATED {timeString}</TerminalBadge>
        </header>

        {/* --- CONTENT --- */}
        <div className="relative z-10 flex flex-col flex-1 p-6 space-y-6">
          
          {/* Main Score Display */}
          <div className="space-y-3">
             <div className="flex justify-between items-end">
                <div className={`text-3xl font-black tracking-tight leading-none ${stats.key === 'bull' ? 'text-emerald-400' : stats.key === 'bear' ? 'text-rose-400' : 'text-blue-400'}`}>
                   {stats.label}
                </div>
                <div className="text-sm font-mono font-bold text-white/50">{stats.score.toFixed(2)}</div>
             </div>
             
             {/* Progress Bar */}
             <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/20 z-10" />
                <div 
                  className={`h-full ${barColor} transition-all duration-700 ease-out`} 
                  style={{ width: `${pct}%`, boxShadow: `0 0 10px ${shadowColor}` }} 
                />
             </div>
          </div>

          {/* Chips Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Positive Drivers */}
             <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                   <TrendingUp size={10} /> Drivers (+)
                </span>
                <div className="flex flex-wrap gap-1.5">
                   {stats.topPos.length 
                     ? stats.topPos.map(w => <TerminalBadge key={w} color="emerald">{w}</TerminalBadge>) 
                     : <span className="text-xs text-zinc-600 italic">None</span>}
                </div>
             </div>

             {/* Negative Drivers */}
             <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                   <TrendingDown size={10} /> Drivers (−)
                </span>
                <div className="flex flex-wrap gap-1.5">
                   {stats.topNeg.length 
                     ? stats.topNeg.map(w => <TerminalBadge key={w} color="rose">{w}</TerminalBadge>) 
                     : <span className="text-xs text-zinc-600 italic">None</span>}
                </div>
             </div>

             {/* Tickers */}
             <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                   <Activity size={10} /> Tickers
                </span>
                <div className="flex flex-wrap gap-1.5">
                   {stats.topTix.length 
                     ? stats.topTix.map(w => <TerminalBadge key={w} color="blue">{w}</TerminalBadge>) 
                     : <span className="text-xs text-zinc-600 italic">None</span>}
                </div>
             </div>
          </div>

        </div>

        {/* Sparkline Background */}
        <div className="absolute bottom-0 left-0 right-0 h-24 opacity-10 pointer-events-none z-0">
           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 20">
              <defs>
                 <linearGradient id="gradSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                 </linearGradient>
              </defs>
              {stats.spark.length > 0 && (
                 <polyline 
                    points={stats.spark.map((v, i) => `${(i / (stats.spark.length - 1)) * 100},${10 - v * 8}`).join(" ")}
                    fill="none" 
                    stroke="white" 
                    strokeWidth="0.5" 
                    vectorEffect="non-scaling-stroke"
                 />
              )}
           </svg>
           <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
        </div>

      </div>
    </section>
  );
}