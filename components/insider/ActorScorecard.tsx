"use client";

import { motion } from "framer-motion";
import { Award, TrendingDown, TrendingUp, Zap } from "lucide-react";
import type { ActorProfile } from "@/lib/insider/types";

type Props = {
  actors: ActorProfile[];
  isLoading?: boolean;
};

function WinRateRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const color = pct >= 70 ? "#34d399" : pct >= 55 ? "#fbbf24" : "#f87171";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  );
}

function ActorCard({ actor, index }: { actor: ActorProfile; index: number }) {
  const isCall = actor.optType === "call";
  const sharpeColor =
    actor.sharpe >= 1.5 ? "text-emerald-400" :
    actor.sharpe >= 0.5 ? "text-blue-400" :
    "text-white/40";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      className="relative rounded-xl border border-white/8 bg-white/3 p-4 transition-all duration-200 hover:border-white/15 hover:bg-white/5"
    >
      {actor.isSmartMoney ? (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5">
          <Award size={10} className="text-amber-400" />
          <span className="text-[10px] font-medium text-amber-400">Smart money</span>
        </div>
      ) : null}

      <div className="mb-4 flex items-start gap-3">
        <div className="relative shrink-0">
          <WinRateRing pct={actor.winRatePct} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold leading-none text-white">{actor.winRatePct.toFixed(0)}%</span>
          </div>
        </div>

        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-bold text-white">{actor.ticker}</span>
            <span
              className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                isCall ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }`}
            >
              {isCall ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {actor.optType.toUpperCase()}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/35">
            {actor.trades} trades, {actor.wins} wins
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/3 p-2.5 text-center">
          <p className="mb-1 text-[10px] text-white/35">Avg return</p>
          <p className={`font-mono text-sm font-semibold ${actor.avgReturnT5 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {actor.avgReturnT5 >= 0 ? "+" : ""}
            {actor.avgReturnT5.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg bg-white/3 p-2.5 text-center">
          <p className="mb-1 text-[10px] text-white/35">Sharpe</p>
          <p className={`font-mono text-sm font-semibold ${sharpeColor}`}>{actor.sharpe.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-white/3 p-2.5 text-center">
          <p className="mb-1 text-[10px] text-white/35">Near event</p>
          <p className={`font-mono text-sm font-semibold ${actor.tradesNearEvent > 0 ? "text-amber-400" : "text-white/40"}`}>
            {actor.tradesNearEvent}x
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2.5">
        <span className="text-xs text-white/30">Total premium</span>
        <span className="font-mono text-xs text-white/60">
          {actor.totalPremiumUsd >= 1_000_000
            ? `$${(actor.totalPremiumUsd / 1_000_000).toFixed(1)}M`
            : `$${(actor.totalPremiumUsd / 1_000).toFixed(0)}K`}
        </span>
      </div>
    </motion.div>
  );
}

export default function ActorScorecard({ actors, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-xl bg-white/3" />
        ))}
      </div>
    );
  }

  if (!actors.length) {
    return (
      <div className="py-16 text-center">
        <Zap size={32} className="mx-auto mb-3 text-white/15" />
        <p className="text-sm text-white/30">Actor profiles are not available yet</p>
        <p className="mt-1 text-xs text-white/20">Run the insider pipeline to populate actor statistics</p>
      </div>
    );
  }

  const smart = actors.filter((actor) => actor.isSmartMoney);
  const rest = actors.filter((actor) => !actor.isSmartMoney);

  return (
    <div className="flex flex-col gap-6">
      {smart.length ? (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-amber-400/70">
            Smart money ({smart.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {smart.map((actor, index) => (
              <ActorCard key={`${actor.ticker}-${actor.optType}`} actor={actor} index={index} />
            ))}
          </div>
        </div>
      ) : null}

      {rest.length ? (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-white/25">
            Others ({rest.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rest.map((actor, index) => (
              <ActorCard key={`${actor.ticker}-${actor.optType}`} actor={actor} index={smart.length + index} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
