"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { OptionType, ScoredContract, SignalFlag } from "@/lib/insider/types";

const FLAG_STYLES: Record<SignalFlag, string> = {
  "VOL/OI": "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  "Z-SCORE": "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  "OTM-PREM": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  "SHORT-OTM": "bg-red-500/15 text-red-300 border border-red-500/30",
  "HIGH-IV": "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
};

type SortKey = "anomalyScore" | "totalPremiumUsd" | "volume" | "daysToExp" | "strikePctOtm";

type Props = {
  contracts: ScoredContract[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  cachedAt?: string;
  onRefresh?: () => void;
  onSelectContract?: (contract: ScoredContract) => void;
  selectedContractSymbol?: string | null;
};

function FlagBadge({ flag }: { flag: SignalFlag }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${FLAG_STYLES[flag]}`}>
      {flag}
    </span>
  );
}

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`h-2 w-2 rounded-full ${
            index < score
              ? score >= 4
                ? "bg-red-400"
                : score >= 3
                  ? "bg-amber-400"
                  : "bg-blue-400"
              : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

function PremiumCell({ value }: { value: number }) {
  const display =
    value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(2)}M`
      : value >= 1_000
        ? `$${(value / 1_000).toFixed(0)}K`
        : `$${value.toFixed(0)}`;

  const tone =
    value >= 1_000_000 ? "text-red-300 font-semibold" :
    value >= 500_000 ? "text-amber-300 font-medium" :
    "text-white/70";

  return <span className={`font-mono text-sm ${tone}`}>{display}</span>;
}

function useSorted(data: ScoredContract[], key: SortKey, asc: boolean) {
  return useMemo(
    () =>
      [...data].sort((a, b) => {
        const diff = a[key] - b[key];
        return asc ? diff : -diff;
      }),
    [asc, data, key]
  );
}

export default function SignalsTable({
  contracts,
  isLoading,
  isError,
  errorMessage,
  cachedAt,
  onRefresh,
  onSelectContract,
  selectedContractSymbol,
}: Props) {
  const [filterType, setFilterType] = useState<OptionType | "all">("all");
  const [filterScore, setFilterScore] = useState(2);
  const [filterFlag, setFilterFlag] = useState<SignalFlag | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("anomalyScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      contracts.filter((contract) => {
        if (filterType !== "all" && contract.optType !== filterType) return false;
        if (contract.anomalyScore < filterScore) return false;
        if (filterFlag !== "all" && !contract.flags.includes(filterFlag)) return false;
        if (search && !contract.ticker.toUpperCase().includes(search.toUpperCase())) return false;
        return true;
      }),
    [contracts, filterFlag, filterScore, filterType, search]
  );

  const sorted = useSorted(filtered, sortKey, sortAsc);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((value) => !value);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortIcon({ sort }: { sort: SortKey }) {
    if (sortKey !== sort) return <ChevronUp size={12} className="text-white/20" />;
    return sortAsc ? <ChevronUp size={12} className="text-blue-400" /> : <ChevronDown size={12} className="text-blue-400" />;
  }

  const fmtDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  };

  const fmtCacheTime = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Ticker..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-28 rounded-lg border border-white/[0.05] bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-blue-500/25 focus:outline-none"
        />

        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {(["all", "call", "put"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                filterType === type
                  ? type === "call"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : type === "put"
                      ? "bg-red-500/20 text-red-300"
                      : "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {type === "all" ? "All" : type.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-white/40" />
          <span className="text-xs text-white/40">Score &gt;=</span>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              onClick={() => setFilterScore(score)}
              className={`h-7 w-7 rounded-md text-xs font-mono transition-all ${
                filterScore === score
                  ? "border border-blue-500/50 bg-blue-500/30 text-blue-300"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              {score}
            </button>
          ))}
        </div>

        <select
          value={filterFlag}
          onChange={(event) => setFilterFlag(event.target.value as SignalFlag | "all")}
          className="rounded-lg border border-white/[0.05] bg-white/[0.04] px-2 py-1.5 text-xs text-white/70 focus:border-blue-500/25 focus:outline-none"
        >
          <option value="all">All flags</option>
          {(["VOL/OI", "Z-SCORE", "OTM-PREM", "SHORT-OTM", "HIGH-IV"] as SignalFlag[]).map((flag) => (
            <option key={flag} value={flag}>
              {flag}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {cachedAt ? <span className="text-xs text-white/25">Updated {fmtCacheTime(cachedAt)}</span> : null}
          {onRefresh ? (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.05] bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.05] bg-white/[0.03]">
                {[
                  { label: "Ticker", key: null },
                  { label: "Type", key: null },
                  { label: "Strike", key: null },
                  { label: "Exp", key: "daysToExp" as SortKey },
                  { label: "OTM %", key: "strikePctOtm" as SortKey },
                  { label: "Volume", key: "volume" as SortKey },
                  { label: "Premium", key: "totalPremiumUsd" as SortKey },
                  { label: "IV", key: null },
                  { label: "Score", key: "anomalyScore" as SortKey },
                  { label: "Flags", key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-white/40 ${key ? "cursor-pointer hover:text-white/70" : ""}`}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {key ? <SortIcon sort={key} /> : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-white/30">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={16} className="animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : null}

              {isError ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-red-400">
                      <AlertTriangle size={16} />
                      {errorMessage || "Failed to load data"}
                    </div>
                  </td>
                </tr>
              ) : null}

              {!isLoading && !isError && sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-white/25">
                    No contracts match the current filters
                  </td>
                </tr>
              ) : null}

              <AnimatePresence initial={false}>
                {sorted.map((contract, index) => (
                  <motion.tr
                    key={contract.contractSymbol || `${contract.ticker}-${contract.strike}-${contract.expiration}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, delay: index * 0.02 }}
                    onClick={() => onSelectContract?.(contract)}
                    className={`border-b border-white/[0.04] transition-colors ${
                      onSelectContract ? "cursor-pointer" : ""
                    } ${
                      selectedContractSymbol === contract.contractSymbol
                        ? "bg-blue-500/[0.08]"
                        : "hover:bg-white/[0.025]"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-white">{contract.ticker}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          contract.optType === "call"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {contract.optType === "call" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {contract.optType.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-white/80">${contract.strike.toFixed(contract.strike >= 100 ? 0 : 2)}</td>
                    <td className="px-4 py-3 text-white/60">
                      <span>{fmtDate(contract.expiration)}</span>
                      <span
                        className={`ml-1.5 text-xs ${
                          contract.daysToExp <= 7
                            ? "text-red-400"
                            : contract.daysToExp <= 14
                              ? "text-amber-400"
                              : "text-white/30"
                        }`}
                      >
                        ({contract.daysToExp}d)
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 font-mono text-sm ${
                        contract.strikePctOtm >= 10
                          ? "text-red-400"
                          : contract.strikePctOtm >= 5
                            ? "text-amber-400"
                            : "text-white/50"
                      }`}
                    >
                      {contract.strikePctOtm >= 0 ? "+" : ""}
                      {contract.strikePctOtm.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 font-mono text-white/70">{contract.volume.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <PremiumCell value={contract.totalPremiumUsd} />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-white/50">
                      {(contract.impliedVolatility * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3">
                      <ScoreDots score={contract.anomalyScore} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contract.flags.map((flag) => (
                          <FlagBadge key={flag} flag={flag} />
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && sorted.length > 0 ? (
        <p className="text-right text-xs text-white/25">
          {sorted.length} contracts shown, {contracts.length} total
        </p>
      ) : null}
    </div>
  );
}
