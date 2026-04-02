import { useEffect, useMemo, useState, type ElementType } from "react";
import Head from "next/head";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bookmark,
  BookmarkCheck,
  CircleDot,
  Eye,
  ListTree,
  Orbit,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";
import ActorScorecard from "@/components/insider/ActorScorecard";
import FlowChart from "@/components/insider/FlowChart";
import SignalsTable from "@/components/insider/SignalsTable";
import type { MatchedContract, ScoredContract } from "@/lib/insider/types";
import {
  useActorProfiles,
  useMatchedContracts,
  usePutCallFlow,
  useScanSummary,
  useSignals,
} from "@/lib/insider/useOptionsData";

type Tab = "signals" | "tracked" | "actors" | "flow";

type TrackedStatus = "new" | "watching" | "invalidated";

type TrackedItem = {
  contractSymbol: string;
  ticker: string;
  optType: ScoredContract["optType"];
  expiration: string;
  strike: number;
  totalPremiumUsd: number;
  anomalyScore: number;
  trackedAt: string;
  status: TrackedStatus;
  note: string;
};

const TABS: Array<{ id: Tab; label: string; icon: ElementType }> = [
  { id: "signals", label: "Signals", icon: Zap },
  { id: "tracked", label: "Tracked", icon: BookmarkCheck },
  { id: "actors", label: "Actors", icon: Users },
  { id: "flow", label: "P/C Flow", icon: BarChart2 },
];

const DEMO_SCANNED_AT = "2026-03-26T10:15:00.000Z";
const INSIDER_TRACKED_LS_KEY = "tradingtool.insider.tracked";
const TRACKED_STATUS_ORDER: TrackedStatus[] = ["new", "watching", "invalidated"];

function fmtMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtDateTime(value?: string) {
  if (!value) return "No sync";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function signalTone(score: number) {
  if (score >= 5) return "Critical";
  if (score >= 4) return "Aggressive";
  if (score >= 3) return "Strong";
  return "Watch";
}

function trackedStatusTone(status: TrackedStatus) {
  if (status === "watching") {
    return "border-blue-500/18 bg-blue-500/[0.10] text-blue-300";
  }
  if (status === "invalidated") {
    return "border-red-500/18 bg-red-500/[0.10] text-red-300";
  }
  return "border-emerald-500/18 bg-emerald-500/[0.10] text-emerald-300";
}

function fmtPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function titleCase(value: string | null | undefined) {
  if (!value) return "No event";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function eventSourceTone(source: MatchedContract["eventSource"]) {
  if (source === "explicit") return "border-emerald-500/18 bg-emerald-500/[0.10] text-emerald-300";
  if (source === "calendar") return "border-blue-500/18 bg-blue-500/[0.10] text-blue-300";
  return "border-amber-500/18 bg-amber-500/[0.10] text-amber-300";
}

function eventSourceLabel(source: MatchedContract["eventSource"]) {
  if (source === "explicit") return "History";
  if (source === "calendar") return "Calendar";
  return "Inferred";
}

function confidenceTone(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "border-emerald-500/18 bg-emerald-500/[0.10] text-emerald-300";
  if (confidence === "medium") return "border-blue-500/18 bg-blue-500/[0.10] text-blue-300";
  return "border-amber-500/18 bg-amber-500/[0.10] text-amber-300";
}

function StatusPill({
  live,
  label,
  value,
}: {
  live: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex h-7 items-center gap-2 rounded-lg border border-white/[0.05] bg-black/20 px-3 text-[10px] font-mono font-bold uppercase tracking-wide">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span className="text-white/40">{label}</span>
      <span className={live ? "text-emerald-300" : "text-amber-300"}>{value}</span>
    </div>
  );
}

function RelatedContractsPanel({
  selected,
  related,
  onSelect,
}: {
  selected: ScoredContract | null;
  related: ScoredContract[];
  onSelect: (contract: ScoredContract) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-3 flex items-center gap-2">
        <ListTree size={15} className="text-violet-300" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
          Related contracts
        </span>
      </div>

      {!selected || !related.length ? (
        <div className="text-sm text-white/35">No related contracts for this ticker in the current slice.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          {related.map((contract) => (
            <button
              key={contract.contractSymbol}
              onClick={() => onSelect(contract)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                selected.contractSymbol === contract.contractSymbol
                  ? "border-blue-500/18 bg-blue-500/[0.08]"
                  : "border-white/[0.05] bg-black/10 hover:border-white/[0.08] hover:bg-white/[0.03]"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white">{contract.optType.toUpperCase()}</span>
                  <span className="text-xs text-white/35">{fmtExpiry(contract.expiration)}</span>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Strike ${contract.strike.toFixed(contract.strike >= 100 ? 0 : 2)} · OTM {contract.strikePctOtm.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-white">{fmtMoney(contract.totalPremiumUsd)}</div>
                <div className="mt-1 text-[10px] uppercase text-blue-300">{signalTone(contract.anomalyScore)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackedContractsPanel({
  items,
  activeSymbol,
  onOpen,
  onRemove,
  onStatusChange,
  onNoteChange,
}: {
  items: TrackedItem[];
  activeSymbol: string | null;
  onOpen: (item: TrackedItem) => void;
  onRemove: (item: TrackedItem) => void;
  onStatusChange: (item: TrackedItem, status: TrackedStatus) => void;
  onNoteChange: (item: TrackedItem, note: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <BookmarkCheck size={16} className="text-blue-300" />
          Track contracts from the signal detail card to build a working watchlist here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-3 flex items-center gap-2">
        <BookmarkCheck size={15} className="text-blue-300" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
          Tracked contracts
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.contractSymbol}
            className={`rounded-xl border px-3 py-3 transition-all ${
              activeSymbol === item.contractSymbol
                ? "border-blue-500/18 bg-blue-500/[0.08]"
                : "border-white/[0.05] bg-black/10"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white">{item.ticker}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                      item.optType === "call"
                        ? "bg-emerald-500/12 text-emerald-300"
                        : "bg-red-500/12 text-red-300"
                    }`}
                  >
                    {item.optType}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/35">
                  {fmtExpiry(item.expiration)} · ${item.strike.toFixed(item.strike >= 100 ? 0 : 2)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-white">{fmtMoney(item.totalPremiumUsd)}</div>
                <div className="mt-1 text-[10px] uppercase text-blue-300">{signalTone(item.anomalyScore)}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wide text-white/25">
                Added {fmtDateTime(item.trackedAt)}
              </span>
              <span
                className={`rounded-lg border px-2 py-1 text-[10px] font-mono font-bold uppercase ${trackedStatusTone(item.status)}`}
              >
                {item.status}
              </span>
            </div>

            <div className="mt-3 flex h-7 items-center gap-2 rounded-lg bg-black/20">
              {TRACKED_STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusChange(item, status)}
                  className={`rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-all ${
                    item.status === status
                      ? trackedStatusTone(status)
                      : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <textarea
              value={item.note}
              onChange={(event) => onNoteChange(item, event.target.value)}
              placeholder="Why this contract matters..."
              className="mt-3 min-h-[74px] w-full resize-none rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-blue-500/20 focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpen(item)}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono font-bold uppercase text-white/70 transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  Open
                </button>
                <button
                  onClick={() => onRemove(item)}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono font-bold uppercase text-white/45 transition-all hover:border-red-500/15 hover:bg-red-500/[0.07] hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventEdgePanel({
  match,
  actorEdge,
  }: {
    match: MatchedContract | null;
    actorEdge: {
      trades: number;
      wins: number;
      winRate: number;
      avgReturnT5: number;
      events: number;
      confidence: "high" | "medium" | "low";
    } | null;
  }) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-amber-300" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
          Event edge
        </span>
      </div>

      {!match ? (
        <div className="text-sm text-white/35">
          No matched event history for this contract yet. Once a signal lines up with an earnings, macro, FDA or product catalyst, it will show up here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wide text-white/35">Catalyst</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {titleCase(match.eventType)} · {match.eventDate ? fmtExpiry(match.eventDate) : "TBD"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-lg border border-white/[0.05] bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono uppercase text-white/70">
                    {match.daysBeforeEvent ?? "-"}d before
                  </span>
                  <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono uppercase ${eventSourceTone(match.eventSource)}`}>
                    {eventSourceLabel(match.eventSource)}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/45">
              <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                <div>T+1</div>
                <div className="mt-1 font-mono text-white">{fmtPct(match.returnT1)}</div>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                <div>T+5</div>
                <div className="mt-1 font-mono text-white">{fmtPct(match.returnT5)}</div>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                <div>T+10</div>
                <div className="mt-1 font-mono text-white">{fmtPct(match.returnT10)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
              <div className="text-xs font-mono uppercase tracking-wide text-white/35">Behavioral actor</div>
              {!actorEdge ? (
                <div className="mt-2 text-sm text-white/35">
                  {match.eventSource === "inferred"
                    ? "Catalyst was inferred from the current setup. Add historical matched outcomes to convert this into a measured actor profile."
                    : "Not enough repeat history yet."}
                </div>
              ) : (
              <>
                  <div className="mt-2 text-sm text-white">
                    Repeat pattern on <span className="font-mono">{match.ticker}</span> {match.optType.toUpperCase()} around {titleCase(match.eventType)} setups.
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/45">
                    <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                    <div>Win rate</div>
                    <div className="mt-1 font-mono text-white">{actorEdge.winRate.toFixed(0)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                    <div>Event trades</div>
                    <div className="mt-1 font-mono text-white">{actorEdge.events}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                    <div>Total samples</div>
                    <div className="mt-1 font-mono text-white">{actorEdge.trades}</div>
                  </div>
                    <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                      <div>Avg T+5</div>
                      <div className="mt-1 font-mono text-white">{fmtPct(actorEdge.avgReturnT5)}</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                      <div>Confidence</div>
                      <div className="mt-1">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase ${confidenceTone(actorEdge.confidence)}`}>
                          {actorEdge.confidence}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventSetupsPanel({
  matches,
  onSelect,
}: {
  matches: MatchedContract[];
  onSelect: (contract: MatchedContract) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={15} className="text-blue-300" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
          Pre-event setups
        </span>
      </div>

      {!matches.length ? (
        <div className="text-sm text-white/35">No event-linked contracts in the current dataset.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {matches.map((match) => (
            <button
              key={match.contractSymbol}
              onClick={() => onSelect(match)}
              className="flex items-start justify-between rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3 text-left transition-all hover:border-white/[0.08] hover:bg-white/[0.03]"
            >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">{match.ticker}</span>
                    <span className="text-[10px] font-mono uppercase text-white/35">{match.optType}</span>
                    <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono uppercase text-white/55">
                      {titleCase(match.eventType)}
                    </span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase ${eventSourceTone(match.eventSource)}`}>
                      {eventSourceLabel(match.eventSource)}
                    </span>
                  </div>
                <div className="mt-1 text-xs text-white/35">
                  {match.daysBeforeEvent ?? "-"}d before · {match.eventDate ? fmtExpiry(match.eventDate) : "No date"} · premium {fmtMoney(match.totalPremiumUsd)}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-xs ${match.isCorrect ? "text-emerald-300" : "text-red-300"}`}>
                  {match.isCorrect ? "Hit" : "Miss"}
                </div>
                <div className="mt-1 text-[10px] uppercase text-white/45">T+5 {fmtPct(match.returnT5)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniSignalChart({ selected, related }: { selected: ScoredContract | null; related: ScoredContract[] }) {
  const [metric, setMetric] = useState<"premium" | "score" | "ratio">("premium");
  const [range, setRange] = useState<"top6" | "all">("top6");

  const chartData = useMemo(() => {
    if (!selected) return [];
    const slice = range === "top6" ? related.slice(0, 6) : related;
    return slice.map((contract) => ({
      key: `${contract.optType.toUpperCase()} ${contract.strike}`,
      premium: Math.round(contract.totalPremiumUsd / 1000),
      score: contract.anomalyScore,
      ratio: Number(contract.volOiRatio.toFixed(2)),
      active: contract.contractSymbol === selected.contractSymbol,
    }));
  }, [range, related, selected]);

  const chartTitle =
    metric === "premium" ? "Ticker premium map" :
    metric === "score" ? "Ticker anomaly map" :
    "Ticker volume/OI map";

  const yTickFormatter = (value: number) =>
    metric === "premium" ? `${value}K` : value.toFixed(metric === "score" ? 0 : 1);

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-3 flex items-center gap-2">
        <BarChart2 size={15} className="text-cyan-300" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
          {chartTitle}
        </span>
      </div>

      {chartData.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
            {([
              ["premium", "Premium"],
              ["score", "Score"],
              ["ratio", "Vol/OI"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMetric(value)}
                className={`rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-all ${
                  metric === value
                    ? "border-blue-500/20 bg-blue-500/[0.10] text-blue-300"
                    : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
            {([
              ["top6", "Top 6"],
              ["all", "All"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-all ${
                  range === value
                    ? "border-blue-500/20 bg-blue-500/[0.10] text-blue-300"
                    : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!chartData.length ? (
        <div className="text-sm text-white/35">Chart appears once a contract is selected.</div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={yTickFormatter}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { premium: number; score: number; ratio: number };
                  return (
                    <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-xs shadow-xl">
                      <div className="font-mono font-bold text-white">{label}</div>
                      <div className="mt-2 flex justify-between gap-4 text-white/70">
                        <span>Premium</span>
                        <span className="font-mono text-white">${row.premium}K</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-4 text-white/70">
                        <span>Score</span>
                        <span className="font-mono text-white">{row.score}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-4 text-white/70">
                        <span>Vol/OI</span>
                        <span className="font-mono text-white">{row.ratio.toFixed(2)}x</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={42}>
                {chartData.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.active ? "#60a5fa" : row.score >= 4 ? "#f59e0b" : "#475569"}
                    fillOpacity={row.active ? 0.95 : 0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function DetailCard({
  contract,
  related,
  onSelectRelated,
  isTracked,
  onToggleTracked,
}: {
  contract: ScoredContract | null;
  related: ScoredContract[];
  onSelectRelated: (contract: ScoredContract) => void;
  isTracked: boolean;
  onToggleTracked: (contract: ScoredContract) => void;
}) {
  if (!contract) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Orbit size={16} className="text-blue-300" />
          Select a contract to inspect strike, premium, IV and anomaly flags.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-bold text-white">{contract.ticker}</span>
              <span
                className={`rounded-md px-2 py-1 text-[10px] font-mono font-bold uppercase ${
                  contract.optType === "call"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300"
                }`}
              >
                {contract.optType}
              </span>
              <span className="rounded-md bg-blue-500/15 px-2 py-1 text-[10px] font-mono font-bold uppercase text-blue-300">
                {signalTone(contract.anomalyScore)}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/35">
              {contract.contractSymbol} · expires {contract.expiration}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <button
              onClick={() => onToggleTracked(contract)}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-mono font-bold uppercase tracking-wide transition-all ${
                isTracked
                  ? "border-blue-500/18 bg-blue-500/[0.10] text-blue-300"
                  : "border-white/[0.05] bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {isTracked ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              {isTracked ? "Tracked" : "Track signal"}
            </button>

            <div className="grid grid-cols-2 gap-2 text-xs text-white/50 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.04] bg-black/20 p-3">
                <div>Premium</div>
                <div className="mt-1 font-mono text-sm text-white">{fmtMoney(contract.totalPremiumUsd)}</div>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-black/20 p-3">
                <div>Volume/OI</div>
                <div className="mt-1 font-mono text-sm text-white">{contract.volOiRatio.toFixed(2)}x</div>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-black/20 p-3">
                <div>IV percentile</div>
                <div className="mt-1 font-mono text-sm text-white">{contract.ivPercentile.toFixed(1)}%</div>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-black/20 p-3">
                <div>Z-score</div>
                <div className="mt-1 font-mono text-sm text-white">{contract.volumeZscore.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">Strike</div>
            <div className="mt-1 font-mono text-white">${contract.strike.toFixed(contract.strike >= 100 ? 0 : 2)}</div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">OTM</div>
            <div className="mt-1 font-mono text-white">{contract.strikePctOtm.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">Days to exp</div>
            <div className="mt-1 font-mono text-white">{contract.daysToExp}d</div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">Bid / Ask</div>
            <div className="mt-1 font-mono text-white">
              {contract.bid.toFixed(2)} / {contract.ask.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">Last</div>
            <div className="mt-1 font-mono text-white">{contract.lastPrice.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
            <div className="text-white/35">Volume</div>
            <div className="mt-1 font-mono text-white">{contract.volume.toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contract.flags.map((flag) => (
            <span
              key={flag}
            className="rounded-lg border border-white/[0.05] bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono uppercase text-white/75"
            >
              {flag}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <MiniSignalChart selected={contract} related={related} />
        <RelatedContractsPanel selected={contract} related={related} onSelect={onSelectRelated} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${
        accent
          ? "border-blue-500/12 bg-blue-500/[0.05] hover:border-blue-500/20"
          : "border-white/[0.05] bg-black/20 hover:border-white/[0.08]"
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className="text-xs uppercase tracking-wider text-white/35">{label}</span>
        <Icon size={15} className={accent ? "text-blue-400" : "text-white/25"} />
      </div>
      <p className={`font-mono text-2xl font-bold ${accent ? "text-blue-300" : "text-white"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/30">{sub}</p> : null}
    </motion.div>
  );
}

export default function InsiderPage() {
  const [tab, setTab] = useState<Tab>("signals");
  const [minScore, setMinScore] = useState(2);
  const [minPremium, setMinPremium] = useState(50_000);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);

  const {
    signals,
    isLoading: signalsLoading,
    isError: signalsError,
    errorMessage: signalsErrorMessage,
    cachedAt,
    refresh,
  } = useSignals(minScore, minPremium);
  const {
    actors,
    isLoading: actorsLoading,
    isError: actorsError,
    errorMessage: actorsErrorMessage,
  } = useActorProfiles();
  const {
    pcFlow,
    isLoading: pcLoading,
    isError: pcError,
    errorMessage: pcErrorMessage,
  } = usePutCallFlow();
  const {
    matched,
    isError: matchedError,
    errorMessage: matchedErrorMessage,
  } = useMatchedContracts();
  const { summary, errorMessage: summaryErrorMessage } = useScanSummary();

  const demoMode = summary?.scannedAt === DEMO_SCANNED_AT;
  const liveMode = !demoMode;
  const smartCount = actors.filter((actor) => actor.isSmartMoney).length;
  const topPremium = useMemo(
    () => signals.reduce((max, contract) => Math.max(max, contract.totalPremiumUsd), 0),
    [signals]
  );
  const selectedContract = useMemo(
    () => signals.find((contract) => contract.contractSymbol === selectedSymbol) ?? signals[0] ?? null,
    [selectedSymbol, signals]
  );
  const relatedContracts = useMemo(() => {
    if (!selectedContract) return [];
    return signals
      .filter((contract) => contract.ticker === selectedContract.ticker)
      .sort((a, b) => b.totalPremiumUsd - a.totalPremiumUsd);
  }, [selectedContract, signals]);
  const trackedSymbols = useMemo(
    () => new Set(trackedItems.map((item) => item.contractSymbol)),
    [trackedItems]
  );
  const trackedCounts = useMemo(
    () =>
      TRACKED_STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = trackedItems.filter((item) => item.status === status).length;
          return acc;
        },
        { new: 0, watching: 0, invalidated: 0 } as Record<TrackedStatus, number>
      ),
    [trackedItems]
  );
  const selectedMatch = useMemo(
    () => matched.find((item) => item.contractSymbol === selectedContract?.contractSymbol) ?? null,
    [matched, selectedContract]
  );
  const preEventMatches = useMemo(
    () =>
      matched
        .filter((item) => item.daysBeforeEvent != null && item.daysBeforeEvent <= 7)
        .sort((a, b) => {
          const sourceRank = (item: MatchedContract) =>
            item.eventSource === "explicit" ? 0 : item.eventSource === "calendar" ? 1 : 2;
          const sourceDiff = sourceRank(a) - sourceRank(b);
          if (sourceDiff !== 0) return sourceDiff;
          const dayDiff = (a.daysBeforeEvent ?? 999) - (b.daysBeforeEvent ?? 999);
          return dayDiff !== 0 ? dayDiff : b.totalPremiumUsd - a.totalPremiumUsd;
        }),
    [matched]
  );
  const eventAccuracy = useMemo(() => {
    const decided = matched.filter((item) => item.isCorrect != null);
    if (!decided.length) return { wins: 0, total: 0, pct: 0 };
    const wins = decided.filter((item) => item.isCorrect).length;
    return { wins, total: decided.length, pct: (wins / decided.length) * 100 };
  }, [matched]);
  const actorEdgeBySymbol = useMemo(() => {
    const byKey = new Map<string, MatchedContract[]>();
    for (const item of matched) {
      const key = `${item.ticker}:${item.optType}:${item.eventType ?? "unknown"}`;
      const list = byKey.get(key) ?? [];
      list.push(item);
      byKey.set(key, list);
    }

    return byKey;
  }, [matched]);
  const selectedActorEdge = useMemo(() => {
    if (!selectedMatch) return null;
    if (selectedMatch.eventSource === "inferred") return null;
    const key = `${selectedMatch.ticker}:${selectedMatch.optType}:${selectedMatch.eventType ?? "unknown"}`;
    const samples = actorEdgeBySymbol.get(key) ?? [];
    const trusted = samples.filter((item) => item.eventSource !== "inferred");
    const decided = trusted.filter((item) => item.isCorrect != null);
    if (!decided.length) return null;
    const wins = decided.filter((item) => item.isCorrect).length;
    const avgReturnT5 =
      decided.reduce((sum, item) => sum + (item.returnT5 ?? 0), 0) / decided.length;
    const confidence: "high" | "medium" | "low" =
      selectedMatch.eventSource === "explicit" && decided.length >= 4
        ? "high"
        : decided.length >= 2
          ? "medium"
          : "low";
    return {
      trades: trusted.length,
      wins,
      winRate: (wins / decided.length) * 100,
      avgReturnT5,
      events: trusted.filter((item) => item.daysBeforeEvent != null && item.daysBeforeEvent <= 7).length,
      confidence,
    };
  }, [actorEdgeBySymbol, selectedMatch]);
  const trackedContracts = useMemo(
    () =>
      trackedItems
        .map((item) => signals.find((contract) => contract.contractSymbol === item.contractSymbol))
        .filter((item): item is ScoredContract => Boolean(item)),
    [signals, trackedItems]
  );

  useEffect(() => {
    if (!signals.length) {
      setSelectedSymbol(null);
      return;
    }
    if (!selectedSymbol || !signals.some((contract) => contract.contractSymbol === selectedSymbol)) {
      setSelectedSymbol(signals[0].contractSymbol);
    }
  }, [selectedSymbol, signals]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INSIDER_TRACKED_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TrackedItem>[];
      if (Array.isArray(parsed)) {
        setTrackedItems(
          parsed
            .filter((item): item is Partial<TrackedItem> & Pick<TrackedItem, "contractSymbol" | "ticker" | "optType" | "expiration" | "strike" | "totalPremiumUsd" | "anomalyScore" | "trackedAt"> =>
              Boolean(
                item.contractSymbol &&
                  item.ticker &&
                  item.optType &&
                  item.expiration &&
                  typeof item.strike === "number" &&
                  typeof item.totalPremiumUsd === "number" &&
                  typeof item.anomalyScore === "number" &&
                  item.trackedAt
              )
            )
            .map((item) => ({
              contractSymbol: item.contractSymbol,
              ticker: item.ticker,
              optType: item.optType,
              expiration: item.expiration,
              strike: item.strike,
              totalPremiumUsd: item.totalPremiumUsd,
              anomalyScore: item.anomalyScore,
              trackedAt: item.trackedAt,
              status: item.status ?? "new",
              note: item.note ?? "",
            }))
        );
      }
    } catch {
      setTrackedItems([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INSIDER_TRACKED_LS_KEY, JSON.stringify(trackedItems));
  }, [trackedItems]);

  function toggleTracked(contract: ScoredContract) {
    setTrackedItems((current) => {
      const exists = current.some((item) => item.contractSymbol === contract.contractSymbol);
      if (exists) {
        return current.filter((item) => item.contractSymbol !== contract.contractSymbol);
      }
      return [
        {
          contractSymbol: contract.contractSymbol,
          ticker: contract.ticker,
          optType: contract.optType,
          expiration: contract.expiration,
          strike: contract.strike,
          totalPremiumUsd: contract.totalPremiumUsd,
          anomalyScore: contract.anomalyScore,
          trackedAt: new Date().toISOString(),
          status: "new",
          note: "",
        },
        ...current,
      ];
    });
  }

  function openTrackedItem(item: TrackedItem) {
    setSelectedSymbol(item.contractSymbol);
    setTab("signals");
  }

  function updateTrackedItem(
    contractSymbol: string,
    updater: (item: TrackedItem) => TrackedItem
  ) {
    setTrackedItems((current) =>
      current.map((item) => (item.contractSymbol === contractSymbol ? updater(item) : item))
    );
  }

  return (
    <>
      <Head>
        <title>Insider Flow | TradingTool</title>
      </Head>

      <main className="min-h-screen px-6 pb-10 pt-[92px] lg:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2.5">
                <Eye size={20} className="text-blue-400" />
                <h1 className="text-2xl font-semibold tracking-tight text-white">Insider Options Flow</h1>
              </div>
              <p className="text-sm text-white/35">
                Research page for unusual options activity, repeat actors, and put/call flow shifts.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill live={liveMode} label="Mode" value={liveMode ? "Live" : "Demo"} />
                <StatusPill live={liveMode} label="Last sync" value={fmtDateTime(summary?.scannedAt || cachedAt)} />
                <StatusPill live label="Top premium" value={topPremium ? fmtMoney(topPremium) : "No flow"} />
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 lg:items-end">
              <button
                onClick={() => refresh()}
                disabled={signalsLoading}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw size={13} className={signalsLoading ? "animate-spin" : ""} />
                Retry live fetch
              </button>
              {!liveMode ? (
                <p className="text-right text-xs text-amber-300/75">
                  Demo dataset active while the live options source is unavailable.
                </p>
              ) : null}
            </div>
          </div>

          {signalsError || summaryErrorMessage ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/12 bg-red-500/[0.05] px-4 py-3 text-sm text-red-200">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-400" />
              <div>
                <div className="font-medium text-red-300">Live signal feed is currently unavailable.</div>
                <div className="mt-1 text-red-200/70">
                  {signalsErrorMessage || summaryErrorMessage || "The page is showing the fallback research dataset."}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            <StatCard
              label="Total contracts"
              value={summary?.totalContracts?.toLocaleString() ?? "-"}
              icon={Activity}
            />
            <StatCard
              label="Flagged"
              value={summary?.flaggedContracts?.toLocaleString() ?? signals.length}
              sub="score >= 2"
              icon={Zap}
              accent
            />
            <StatCard
              label="Smart money"
              value={smartCount || summary?.smartMoneyActors || "-"}
              sub="win rate >= 60%"
              icon={TrendingUp}
            />
            <StatCard
              label="P/C skews"
              value={pcFlow.filter((item) => item.signal !== "BALANCED").length || "-"}
              sub="ratio > 3x"
              icon={BarChart2}
            />
            <StatCard
              label="Tracked"
              value={trackedItems.length}
              sub="saved locally"
              icon={BookmarkCheck}
            />
            <StatCard
              label="Pre-event"
              value={preEventMatches.length}
              sub="within 7d of catalyst"
              icon={AlertTriangle}
            />
            <StatCard
              label="Event hit rate"
              value={eventAccuracy.total ? `${eventAccuracy.pct.toFixed(0)}%` : "-"}
              sub={eventAccuracy.total ? `${eventAccuracy.wins}/${eventAccuracy.total} correct` : "no outcomes yet"}
              icon={Sparkles}
            />
          </div>

          <div className="mb-6 flex w-fit gap-1 rounded-xl bg-white/4 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  tab === id ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {tab === "signals" ? (
            <motion.div key="signals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {matchedError ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/12 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
                  <AlertTriangle size={16} />
                  {matchedErrorMessage || "Event matching is unavailable right now."}
                </div>
              ) : null}
              <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles size={15} className="text-blue-300" />
                    <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
                      Signal controls
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <span>Min score:</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((score) => (
                          <button
                            key={score}
                            onClick={() => setMinScore(score)}
                            className={`h-7 w-7 rounded-md font-mono transition-all ${
                              minScore === score
                                ? "border border-blue-500/40 bg-blue-500/25 text-blue-300"
                                : "text-white/30 hover:text-white/60"
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <span>Min premium:</span>
                      <div className="flex gap-1">
                        {[
                          { label: "$10K", value: 10_000 },
                          { label: "$50K", value: 50_000 },
                          { label: "$100K", value: 100_000 },
                          { label: "$500K", value: 500_000 },
                        ].map((item) => (
                          <button
                            key={item.value}
                            onClick={() => setMinPremium(item.value)}
                            className={`h-7 rounded-md px-2.5 text-xs font-mono transition-all ${
                              minPremium === item.value
                                ? "border border-blue-500/40 bg-blue-500/25 text-blue-300"
                                : "text-white/30 hover:text-white/60"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="mb-2 flex items-center gap-2">
                    <CircleDot size={15} className="text-emerald-300" />
                    <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
                      Selected signal
                    </span>
                  </div>
                  <div className="text-sm text-white">
                    {selectedContract ? (
                      <>
                        <span className="font-mono font-bold">{selectedContract.ticker}</span>{" "}
                        <span className="text-white/40">{selectedContract.optType.toUpperCase()}</span>
                      </>
                    ) : (
                      "No signal selected"
                    )}
                  </div>
                  <div className="mt-1 text-xs text-white/35">
                    Click any contract row below to inspect its details and nearby flow.
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <DetailCard
                  contract={selectedContract}
                  related={relatedContracts}
                  onSelectRelated={(contract) => setSelectedSymbol(contract.contractSymbol)}
                  isTracked={selectedContract ? trackedSymbols.has(selectedContract.contractSymbol) : false}
                  onToggleTracked={toggleTracked}
                />
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <EventEdgePanel match={selectedMatch} actorEdge={selectedActorEdge} />
                <EventSetupsPanel
                  matches={preEventMatches.slice(0, 6)}
                  onSelect={(contract) => setSelectedSymbol(contract.contractSymbol)}
                />
              </div>

              <div className="mb-4 border-b border-white/6 pb-4 text-xs text-white/35">
                {signals.length
                  ? "Inspect unusual contracts, compare premium concentration, and branch into other contracts on the same ticker."
                  : "No contracts returned for the current settings."}
              </div>

              <SignalsTable
                contracts={signals}
                isLoading={signalsLoading}
                isError={signalsError}
                errorMessage={signalsErrorMessage}
                cachedAt={cachedAt}
                onRefresh={refresh}
                onSelectContract={(contract) => setSelectedSymbol(contract.contractSymbol)}
                selectedContractSymbol={selectedContract?.contractSymbol ?? null}
              />
            </motion.div>
          ) : null}

          {tab === "tracked" ? (
            <motion.div key="tracked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <div className="mb-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="text-sm text-white/55">
                  Save contracts that look interesting, then reopen them later from one place while you work through the signal board.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TRACKED_STATUS_ORDER.map((status) => (
                    <StatusPill
                      key={status}
                      live={status !== "invalidated"}
                      label={status}
                      value={String(trackedCounts[status])}
                    />
                  ))}
                </div>
              </div>
              <TrackedContractsPanel
                items={trackedItems}
                activeSymbol={selectedContract?.contractSymbol ?? null}
                onOpen={openTrackedItem}
                onStatusChange={(item, status) =>
                  updateTrackedItem(item.contractSymbol, (current) => ({ ...current, status }))
                }
                onNoteChange={(item, note) =>
                  updateTrackedItem(item.contractSymbol, (current) => ({ ...current, note }))
                }
                onRemove={(item) =>
                  setTrackedItems((current) =>
                    current.filter((entry) => entry.contractSymbol !== item.contractSymbol)
                  )
                }
              />
              {trackedContracts.length ? (
                <div className="mt-4">
                  <SignalsTable
                    contracts={trackedContracts}
                    onSelectContract={(contract) => setSelectedSymbol(contract.contractSymbol)}
                    selectedContractSymbol={selectedContract?.contractSymbol ?? null}
                  />
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {tab === "actors" ? (
            <motion.div key="actors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {actorsError ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/12 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
                  <AlertTriangle size={16} />
                  {actorsErrorMessage || "Actor profiles are unavailable right now."}
                </div>
              ) : null}
              <ActorScorecard actors={actors} isLoading={actorsLoading} />
            </motion.div>
          ) : null}

          {tab === "flow" ? (
            <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {pcError ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/12 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
                  <AlertTriangle size={16} />
                  {pcErrorMessage || "Put/call flow is unavailable right now."}
                </div>
              ) : null}
              <FlowChart data={pcFlow} isLoading={pcLoading} />
            </motion.div>
          ) : null}
        </div>
      </main>
    </>
  );
}
