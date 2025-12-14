// components/signals/LiveStrategyTiles.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Activity, BarChart2, Zap } from "lucide-react";

import { STRATEGY_BY_KEY } from "@/lib/strategyCatalog";

/* ============================= types ============================= */

type TileUi = {
  key: string;
  hint?: string;
  hot?: boolean;
  score: number;
  maxScore: number;
  tickers: { t: string; s: number }[];
  accent?: [string, string];
  spark?: number[];
};

type Tile = TileUi & {
  title: string;
  icon: string;
  description?: string;
};

/* ============================= UI data (no titles/icons here) ============================= */

// ChronoFlow UI telemetry (name/icon береться з каталогу)
const chronoFlowUi: TileUi = {
  key: "chrono",
  score: 13,
  maxScore: 18,
  tickers: [
    { t: "NVDA", s: 91 },
    { t: "ETH", s: 85 },
    { t: "SOL", s: 78 },
  ],
  spark: [30, 28, 35, 42, 38, 45, 55, 60, 58, 65],
  hot: true,
};

const rawUi: TileUi[] = [
  {
    key: "breakout",
    score: 18,
    maxScore: 20,
    tickers: [
      { t: "META", s: 88 },
      { t: "AAPL", s: 78 },
      { t: "PLTR", s: 61 },
    ],
    spark: [12, 18, 25, 40, 55, 62, 70, 78, 82, 90],
  },
  {
    key: "pumpAndDump",
    score: 14,
    maxScore: 24,
    tickers: [
      { t: "NFLX", s: 72 },
      { t: "META", s: 66 },
      { t: "AMZN", s: 63 },
    ],
    spark: [8, 14, 14, 22, 18, 28, 34, 31, 36, 42],
  },
  {
    key: "reversal",
    score: 14,
    maxScore: 16,
    tickers: [
      { t: "AMD", s: 93 },
      { t: "SPY", s: 70 },
      { t: "AAPL", s: 69 },
    ],
    spark: [10, 8, 9, 12, 18, 22, 24, 26, 24, 28],
  },
  {
    key: "earnings",
    score: 12,
    maxScore: 12,
    tickers: [
      { t: "COIN", s: 80 },
      { t: "INTC", s: 77 },
      { t: "ARKK", s: 68 },
    ],
    spark: [60, 62, 61, 64, 66, 72, 75, 80, 86, 90],
  },
  {
    key: "gap",
    score: 10,
    maxScore: 18,
    tickers: [
      { t: "SPY", s: 91 },
      { t: "AVGO", s: 86 },
      { t: "SMCI", s: 79 },
    ],
    spark: [20, 26, 32, 40, 44, 50, 52, 48, 55, 61],
  },
  {
    key: "pullback",
    score: 8,
    maxScore: 14,
    tickers: [
      { t: "XLE", s: 90 },
      { t: "AMD", s: 77 },
      { t: "GOOGL", s: 76 },
    ],
    spark: [18, 15, 16, 14, 12, 16, 18, 22, 20, 26],
  },
  {
    key: "vwapBounce",
    score: 6,
    maxScore: 15,
    tickers: [
      { t: "TSLA", s: 98 },
      { t: "COIN", s: 77 },
      { t: "NVDA", s: 63 },
    ],
    spark: [8, 12, 10, 11, 16, 14, 18, 20, 22, 24],
  },
  {
    key: "uptickRule",
    score: 9,
    maxScore: 18,
    tickers: [
      { t: "TQQQ", s: 82 },
      { t: "SOXL", s: 75 },
      { t: "RIOT", s: 68 },
    ],
    spark: [10, 14, 18, 26, 30, 34, 40, 44, 48, 52],
  },
  {
    key: "quartalDep",
    score: 7,
    maxScore: 16,
    tickers: [
      { t: "MSFT", s: 84 },
      { t: "AAPL", s: 79 },
      { t: "NVDA", s: 72 },
    ],
    spark: [12, 15, 18, 20, 24, 28, 32, 36, 40, 45],
  },
  {
    key: "dayTwo",
    score: 11,
    maxScore: 18,
    tickers: [
      { t: "SPY", s: 88 },
      { t: "QQQ", s: 81 },
      { t: "META", s: 74 },
    ],
    spark: [18, 20, 24, 30, 36, 40, 44, 48, 52, 58],
  },
  {
    key: "arbitrage",
    score: 5,
    maxScore: 14,
    tickers: [
      { t: "GLD", s: 77 },
      { t: "SLV", s: 71 },
      { t: "FXE", s: 66 },
    ],
    spark: [10, 11, 13, 15, 17, 18, 20, 22, 23, 25],
  },
  {
    key: "openDoor",
    score: 6,
    maxScore: 15,
    tickers: [
      { t: "SHOP", s: 83 },
      { t: "COIN", s: 78 },
      { t: "U", s: 69 },
    ],
    spark: [8, 12, 16, 18, 22, 24, 26, 30, 32, 35],
  },
  {
    key: "rLine",
    score: 7,
    maxScore: 17,
    tickers: [
      { t: "SPY", s: 92 },
      { t: "IWM", s: 80 },
      { t: "DIA", s: 74 },
    ],
    spark: [14, 18, 20, 24, 28, 32, 34, 36, 40, 44],
  },
  {
    key: "intraDance",
    score: 8,
    maxScore: 18,
    tickers: [
      { t: "AMD", s: 88 },
      { t: "NVDA", s: 82 },
      { t: "TSLA", s: 79 },
    ],
    spark: [16, 18, 22, 26, 30, 34, 36, 38, 42, 48],
  },
  {
    key: "morningLounch",
    score: 10,
    maxScore: 20,
    tickers: [
      { t: "SPY", s: 90 },
      { t: "QQQ", s: 85 },
      { t: "ARKK", s: 72 },
    ],
    spark: [20, 24, 28, 34, 40, 44, 48, 52, 56, 60],
  },
  {
    key: "coupleDating",
    score: 4,
    maxScore: 12,
    tickers: [
      { t: "SPY/QQQ", s: 81 },
      { t: "XLF/SPY", s: 73 },
      { t: "IWM/QQQ", s: 69 },
    ],
    spark: [10, 12, 13, 15, 17, 18, 19, 21, 22, 24],
  },
  {
    key: "volumeArrival",
    score: 9,
    maxScore: 18,
    tickers: [
      { t: "NVDA", s: 93 },
      { t: "TSLA", s: 88 },
      { t: "SMCI", s: 82 },
    ],
    spark: [18, 22, 26, 32, 38, 44, 46, 50, 54, 60],
  },
  {
    key: "latePrint",
    score: 6,
    maxScore: 16,
    tickers: [
      { t: "SPY", s: 87 },
      { t: "QQQ", s: 80 },
      { t: "XLK", s: 74 },
    ],
    spark: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
  },
];

/* ============================= UI helpers ============================= */

const getColorTheme = (key: string) => {
  const themes: Record<string, { hex: string; text: string; bg: string; border: string }> = {
    breakout: { hex: "#34d399", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    pumpAndDump: { hex: "#fb7185", text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
    reversal: { hex: "#60a5fa", text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    earnings: { hex: "#fbbf24", text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    gap: { hex: "#a78bfa", text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
    uptickRule: { hex: "#2dd4bf", text: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
    volumeArrival: { hex: "#f472b6", text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
    chrono: { hex: "#22d3ee", text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    arbitrage: { hex: "#fca5a5", text: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/20" },
    default: { hex: "#a1a1aa", text: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  };
  return themes[key] || themes.default;
};

function Sparkline({ data, colorHex }: { data?: number[]; colorHex: string }) {
  if (!data?.length) return null;

  const w = 140;
  const h = 45;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 10) - 5;
      return `${x},${y}`;
    })
    .join(" ");

  const fillPoints = `${points} ${w},${h} 0,${h}`;

  return (
    <div className="relative h-[45px] w-[140px] opacity-90 mix-blend-screen pointer-events-none">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`grad-${colorHex.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.3" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#grad-${colorHex.replace("#", "")})`} />
        <polyline points={points} fill="none" stroke={colorHex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const ActionButton = ({
  icon: Icon,
  label,
  href,
  themeHex,
}: {
  icon: any;
  label: string;
  href: string;
  themeHex: string;
}) => {
  return (
    <Link
      href={href}
      className="
        group/btn flex flex-col items-center justify-center flex-1 
        w-full border-b border-white/5 last:border-b-0
        hover:bg-white/[0.03] transition-colors relative overflow-hidden
      "
    >
      <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-10 transition-opacity" style={{ backgroundColor: themeHex }} />
      <Icon size={14} className="mb-1 text-zinc-400 group-hover/btn:text-white transition-colors" />
      <span className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-wider group-hover/btn:text-white transition-colors">
        {label}
      </span>
    </Link>
  );
};

function StrategyCard({ data }: { data: Tile }) {
  const theme = getColorTheme(data.key);
  const percent = Math.min(100, Math.round((data.score / data.maxScore) * 100));

  return (
    <div
      className="
        group relative isolate flex flex-row 
        overflow-hidden rounded-2xl
        border border-white/5 bg-zinc-900/60 
        backdrop-blur-md h-full min-h-[160px]
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:border-white/10
        hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]
      "
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(400px circle at top left, ${theme.hex}15, transparent 60%)` }}
      />

      {/* LEFT */}
      <div className="flex-1 p-5 flex flex-col relative">
        <Link href={`/signals/${data.key}`} className="absolute inset-0 z-0" aria-label="Go to signals" />

        <div className="flex items-start justify-between mb-4 relative z-10 pointer-events-none">
          <div className="flex items-center gap-3">
            <div
              className={`
                flex h-10 w-10 items-center justify-center 
                rounded-xl text-xl 
                shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]
                ring-1 ring-inset ring-white/5
                ${theme.bg}
              `}
            >
              {data.icon}
            </div>

            <div className="flex flex-col">
              <h3 className="text-[14px] font-bold text-zinc-100 leading-tight group-hover:text-white transition-colors">
                {data.title}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-medium text-zinc-500">Cap: {data.maxScore}</span>
                {data.hot && (
                  <span className="inline-flex items-center rounded-sm bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400 ring-1 ring-inset ring-red-500/20 animate-pulse">
                    HOT
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={`text-xs font-bold font-mono ${theme.text} opacity-90`}>{percent}%</div>
        </div>

        <div className="flex flex-wrap gap-2 mb-auto relative z-10 pointer-events-none">
          {data.tickers.slice(0, 3).map((t) => (
            <div
              key={t.t}
              className="
                flex items-center gap-1.5 px-2 py-1 
                rounded-md border border-white/5 bg-white/[0.02]
                text-[10px] text-zinc-300
              "
            >
              <span className="font-semibold text-zinc-100">{t.t}</span>
              <span className={`h-1 w-1 rounded-full ${theme.bg.replace("/10", "")} opacity-80`} />
              <span className="opacity-50 font-mono">{t.s}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-end justify-between relative z-10 pointer-events-none">
          <div>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Setups</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tracking-tighter shadow-black drop-shadow-sm">{data.score}</span>
              <span className="text-xs font-medium text-zinc-600">/ {data.maxScore}</span>
            </div>
          </div>

          <div className="absolute right-[-10px] bottom-[-10px]">
            <Sparkline data={data.spark} colorHex={theme.hex} />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-800/50">
          <div
            className="h-full shadow-[0_0_8px_currentColor] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%`, backgroundColor: theme.hex, color: theme.hex }}
          />
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-[60px] flex flex-col border-l border-white/5 bg-black/20 backdrop-blur-xl z-20">
        <ActionButton icon={Zap} label="SGN" href={`/signals/${data.key}`} themeHex={theme.hex} />
        <ActionButton icon={BarChart2} label="STS" href={`/stats/${data.key}`} themeHex={theme.hex} />
        <ActionButton icon={Activity} label="PRF" href={`/perform/${data.key}`} themeHex={theme.hex} />
      </div>
    </div>
  );
}

/* ============================= main ============================= */

function buildTile(ui: TileUi): Tile {
  const meta = STRATEGY_BY_KEY[ui.key];
  return {
    ...ui,
    title: meta?.name ?? ui.key,
    icon: (meta?.icon as string) ?? "✨",
    description: meta?.description ?? "",
  };
}

export default function LiveStrategyTiles() {
  // ✅ автосинхронізація БД з каталогом (один раз при вході на сторінку)
  useEffect(() => {
    fetch("/api/strategies/seed", { method: "POST" }).catch(() => {});
  }, []);

  const { featured, others } = useMemo(() => {
    const allUi = [chronoFlowUi, ...rawUi];

    // Будуємо плитки з єдиного джерела (catalog) + UI telemetry
    const all = allUi.map(buildTile);

    const arbitrage = all.find((s) => s.key === "arbitrage");
    const chrono = all.find((s) => s.key === "chrono");

    const rest = all.filter((s) => s.key !== "arbitrage" && s.key !== "chrono");

    const featuredList: Tile[] = [];
    if (arbitrage) featuredList.push(arbitrage);
    if (chrono) featuredList.push(chrono);

    return { featured: featuredList, others: rest };
  }, []);

  return (
    <section className="w-full py-6">
      {/* FEATURED */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Featured Streams</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {featured.map((s) => (
            <StrategyCard key={s.key} data={s} />
          ))}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="flex items-center gap-4 mb-6 px-1 opacity-50">
        <div className="h-px bg-zinc-800 flex-1" />
        <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">Active Strategies</span>
        <div className="h-px bg-zinc-800 flex-1" />
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-fr">
        {others.map((s) => (
          <StrategyCard key={s.key} data={s} />
        ))}
      </div>
    </section>
  );
}
