"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PutCallImbalance } from "@/lib/insider/types";

type Props = {
  data: PutCallImbalance[];
  isLoading?: boolean;
};

const SIGNAL_COLOR: Record<PutCallImbalance["signal"], string> = {
  PUT_HEAVY: "#f87171",
  CALL_HEAVY: "#34d399",
  BALANCED: "#60a5fa",
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Partial<PutCallImbalance> & { call?: number; put?: number; ticker?: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const callVolume = Number(item.callVolume ?? item.call ?? 0);
  const putVolume = Number(item.putVolume ?? item.put ?? 0);
  const pcRatio =
    item.pcRatio != null
      ? Number(item.pcRatio)
      : callVolume > 0
        ? putVolume / callVolume
        : 0;

  let signal: PutCallImbalance["signal"] = "BALANCED";
  if (item.signal === "PUT_HEAVY" || item.signal === "CALL_HEAVY" || item.signal === "BALANCED") {
    signal = item.signal;
  } else if (pcRatio >= 3) {
    signal = "PUT_HEAVY";
  } else if (putVolume > 0 && callVolume / putVolume >= 3) {
    signal = "CALL_HEAVY";
  }

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-xs shadow-xl">
      <p className="mb-2 font-mono font-bold text-white">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-emerald-400">Call vol</span>
          <span className="font-mono text-white">{callVolume.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-400">Put vol</span>
          <span className="font-mono text-white">{putVolume.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-white/10 pt-1">
          <span className="text-white/50">P/C ratio</span>
          <span
            className={`font-mono font-semibold ${
              signal === "PUT_HEAVY"
                ? "text-red-400"
                : signal === "CALL_HEAVY"
                  ? "text-emerald-400"
                  : "text-blue-400"
            }`}
          >
            {pcRatio.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PcRatioChart({ data }: { data: PutCallImbalance[] }) {
  const chartData = data.slice(0, 15).map((item) => ({
    ...item,
    pcRatioCapped: Math.min(item.pcRatio === Infinity ? 5 : item.pcRatio, 5),
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="ticker"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={1} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="pcRatioCapped" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((item) => (
              <Cell key={item.ticker} fill={SIGNAL_COLOR[item.signal]} fillOpacity={0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedVolumeChart({ data }: { data: PutCallImbalance[] }) {
  const chartData = data.slice(0, 12).map((item) => ({
    ticker: item.ticker,
    call: item.callVolume,
    put: item.putVolume,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barSize={28}>
          <XAxis
            dataKey="ticker"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value))}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="call" stackId="a" fill="#34d399" fillOpacity={0.7} />
          <Bar dataKey="put" stackId="a" fill="#f87171" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function FlowChart({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-xl bg-white/3" />;
  }

  if (!data.length) {
    return <div className="flex h-56 items-center justify-center text-sm text-white/25">No put/call flow data yet</div>;
  }

  const putHeavy = data.filter((item) => item.signal === "PUT_HEAVY");
  const callHeavy = data.filter((item) => item.signal === "CALL_HEAVY");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {putHeavy.map((item) => (
          <div key={item.ticker} className="flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1">
            <span className="font-mono text-xs font-semibold text-red-400">{item.ticker}</span>
            <span className="text-[10px] text-red-400/70">P/C {item.pcRatio.toFixed(1)}</span>
          </div>
        ))}
        {callHeavy.map((item) => (
          <div key={item.ticker} className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1">
            <span className="font-mono text-xs font-semibold text-emerald-400">{item.ticker}</span>
            <span className="text-[10px] text-emerald-400/70">
              C/P {(item.pcRatio > 0 ? 1 / item.pcRatio : 0).toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/30">Put/call ratio</p>
          <PcRatioChart data={data} />
          <p className="mt-1 text-center text-xs text-white/20">Line marks neutral ratio 1.0</p>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/30">Call vs put volume</p>
          <StackedVolumeChart data={data} />
          <div className="mt-1 flex justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
              <span className="text-[10px] text-white/30">Call</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/70" />
              <span className="text-[10px] text-white/30">Put</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
