"use client";

import React, { useMemo, useState, useCallback } from "react";
import clsx from "clsx";

import PresetPicker from "@/components/presets/PresetPicker";
import type { ArbitrageFilterConfigV1 } from "@/lib/filters/arbitrageFilterConfigV1";
import { applyArbitrageFilters } from "@/lib/filters/arbitrageFilterEngine";

// Панелі фільтрів
import ListModePanel from "@/components/filters/ListModePanel";
import ActivityPanel from "@/components/filters/ActivityPanel";
import BoundsPanel from "@/components/filters/BoundsPanel";
import ExcludeIncludePanel from "@/components/filters/ExcludeIncludePanel";
import ZapPanel from "@/components/filters/ZapPanel";
import ReportEquityPanel from "@/components/filters/ReportEquityPanel";
import MultiSelectPanel from "@/components/filters/MultiSelectPanel";

type SonarItem = Record<string, any>;
type SonarResponse = { items?: SonarItem[]; total?: number };

const defaultConfig: ArbitrageFilterConfigV1 = {
  version: 1,
  lists: { mode: "off" },
  activity: { mode: "off" },
  report: { hasReport: "ALL" },
  zap: { mode: "off", thresholdAbs: 0.3 },
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

// --- UI Sub-components ---
const SectionHeader = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => (
  <div className="mb-3">
    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
      {title}
    </div>
    {subtitle && (
      <div className="text-[10px] text-neutral-500 font-mono italic leading-none mt-0.5">
        {subtitle}
      </div>
    )}
  </div>
);

const TerminalInput = ({ label, ...props }: any) => (
  <div className="flex flex-col gap-1">
    <label className="text-[9px] font-bold text-neutral-600 uppercase ml-1">
      {label}
    </label>
    <input
      {...props}
      className="bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500/50 transition-all font-mono placeholder:text-neutral-800"
    />
  </div>
);

function asUpperTickers(csv: string) {
  return csv
    .split(/[,\s]+/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickRowField(row: any, ...keys: string[]) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export default function UniversalSignalsTerminal() {
  const [cfg, setCfg] = useState<ArbitrageFilterConfigV1>(defaultConfig);
  const [raw, setRaw] = useState<SonarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tickersCsv, setTickersCsv] = useState("");
  const [limit, setLimit] = useState(200);
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);

  // Реактивна фільтрація локального буфера
  const filtered = useMemo(() => applyArbitrageFilters(raw, cfg), [raw, cfg]);

  const canQuery = useMemo(() => {
    if (loading) return false;
    if (!Number.isFinite(limit) || limit <= 0) return false;
    return true;
  }, [loading, limit]);

  const loadLive = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const tickers = asUpperTickers(tickersCsv);

      const body = {
        tickers,
        fieldsCsv: "FULL",
        limit,
        offset: 0,
        overlays: { arbitrage: { enabled: true } },
      };

      const res = await fetch(`/api/sonar/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`QUERY_FAILED: ${res.status} ${t}`.trim());
      }

      const data: SonarResponse = await res.json();
      setRaw(data.items ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "NET_LAYER_ERROR");
    } finally {
      setLoading(false);
    }
  }, [tickersCsv, limit]);

  const lastSync = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
    // ok: не критично, цей рядок суто декоративний (рендериться при маунті)
    []
  );

  const bufferLabel = useMemo(() => {
    const total = raw.length;
    const shown = filtered.length;
    return { total, shown };
  }, [raw.length, filtered.length]);

  return (
    <div className="min-h-screen bg-black text-neutral-300 font-sans p-4 lg:p-6 flex flex-col gap-6 selection:bg-emerald-500/30">
      {/* HEADER: SYSTEM STATUS */}
      <div className="flex flex-none items-end justify-between border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase">
              Universal{" "}
              <span className="text-emerald-500 italic font-light">Sonar</span>
            </h1>
          </div>
          <div className="text-[9px] text-neutral-600 font-mono uppercase tracking-[0.3em]">
            Real-time Signal Ingestion Layer &bull; Node_v1.0.4
          </div>
        </div>

        <div className="flex gap-8 font-mono text-right">
          <div className="space-y-0.5">
            <span className="block text-[8px] text-neutral-600 uppercase font-bold">
              Data Buffer
            </span>
            <span className="text-xs text-white">
              {bufferLabel.shown}{" "}
              <span className="text-neutral-600 text-[10px]">/</span>{" "}
              {bufferLabel.total}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="block text-[8px] text-neutral-600 uppercase font-bold">
              Network
            </span>
            <span
              className={clsx(
                "text-xs font-bold",
                loading ? "text-amber-500 animate-pulse" : "text-emerald-500"
              )}
            >
              {loading ? "FETCHING" : "STABLE"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* LEFT COLUMN: CONTROL & FILTERS */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {/* FETCH MODULE */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 space-y-4 shadow-sm">
            <SectionHeader
              title="Ingest Control"
              subtitle="Live stream query params"
            />

            <div className="space-y-3">
              <TerminalInput
                label="Ticker Filter"
                placeholder="ANY_SYMBOL"
                value={tickersCsv}
                onChange={(e: any) => setTickersCsv(e.target.value)}
                disabled={loading}
              />
              <TerminalInput
                label="Row Limit"
                type="number"
                value={limit}
                onChange={(e: any) => setLimit(Number(e.target.value))}
                disabled={loading}
                min={1}
              />
            </div>

            <button
              onClick={loadLive}
              disabled={!canQuery}
              className={clsx(
                "w-full py-2.5 rounded font-black text-[10px] uppercase tracking-widest transition-all border",
                !canQuery
                  ? "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed"
                  : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500 hover:text-black shadow-lg shadow-emerald-900/10"
              )}
            >
              {loading ? "Executing_Sequence..." : "Execute_Query"}
            </button>

            {err && (
              <div className="bg-rose-500/5 border border-rose-500/20 p-2 rounded text-[10px] font-mono text-rose-500 tracking-tighter uppercase italic">
                &gt; ERR: {err}
              </div>
            )}
          </div>

          {/* PRESETS */}
          <PresetPicker
            kind="ARBITRAGE"
            scope="SONAR"
            getCurrentConfigJson={() => JSON.stringify(cfg)}
            onApplyPresetJson={(json) => {
              const parsed = safeParseConfig(json);
              if (parsed) setCfg(parsed);
            }}
          />

          {/* FILTERS STACK */}
          <div className="space-y-2 border-t border-neutral-800 pt-4">
            <SectionHeader
              title="Logic Overlays"
              subtitle="Applied to local buffer"
            />
            <div className="space-y-2">
              <ListModePanel cfg={cfg} setCfg={setCfg} />
              <ActivityPanel cfg={cfg} setCfg={setCfg} />

              {/* використай усі імпорти */}
              <BoundsPanel cfg={cfg} setCfg={setCfg} />
              <ExcludeIncludePanel cfg={cfg} setCfg={setCfg} />

              <ZapPanel cfg={cfg} setCfg={setCfg} />
              <ReportEquityPanel cfg={cfg} setCfg={setCfg} />
              <MultiSelectPanel
                cfg={cfg}
                setCfg={setCfg}
                kind="countries"
                label="Geography"
              />
              <MultiSelectPanel
                cfg={cfg}
                setCfg={setCfg}
                kind="exchanges"
                label="Markets"
              />
            </div>
          </div>

          {/* RAW JSON TOGGLE */}
          <div className="pt-4 mt-auto">
            <button
              onClick={() => setShowAdvancedJson(!showAdvancedJson)}
              className="text-[9px] font-mono text-neutral-700 hover:text-neutral-500 uppercase tracking-tighter"
            >
              {showAdvancedJson ? "// Close_Source" : "// View_Raw_JSON"}
            </button>

            {showAdvancedJson && (
              <textarea
                className="mt-2 w-full h-40 bg-black border border-neutral-800 rounded p-2 font-mono text-[9px] text-emerald-600 focus:outline-none"
                value={JSON.stringify(cfg, null, 2)}
                onChange={(e) => {
                  // тепер не readOnly — можна правити руками, але лише валідний v1 пропускаємо
                  const parsed = safeParseConfig(e.target.value);
                  if (parsed) setCfg(parsed);
                }}
                spellCheck={false}
              />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SIGNAL MONITOR */}
        <div className="lg:col-span-8 xl:col-span-9 bg-neutral-900/20 border border-neutral-800 rounded-xl overflow-hidden flex flex-col shadow-2xl">
          <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-black/40">
            <SectionHeader
              title="Signal Buffer"
              subtitle="Active arbitrage monitoring"
            />
            <div className="text-[10px] font-mono text-neutral-600 bg-black px-2 py-1 rounded border border-neutral-800">
              BUFFER_REACTIVE_SYNC:{" "}
              <span className="text-emerald-500">ON</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead className="sticky top-0 bg-neutral-950 z-10 border-b border-neutral-800">
                <tr className="text-left text-neutral-600 uppercase">
                  <th className="p-3 font-bold text-[9px]">Ticker</th>
                  <th className="p-3 font-bold text-[9px] text-center">Dir</th>
                  <th className="p-3 font-bold text-[9px] text-right text-emerald-500/50 italic">
                    Zap
                  </th>
                  <th className="p-3 font-bold text-[9px] text-right">
                    SigmaZap
                  </th>
                  <th className="p-3 font-bold text-[9px] text-right">ADV20</th>
                  <th className="p-3 font-bold text-[9px] text-right text-neutral-500 underline decoration-neutral-800">
                    Spread
                  </th>
                  <th className="p-3 font-bold text-[9px] text-right">
                    MktCap M
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-900">
                {filtered.map((r, idx) => {
                  const ticker = String(
                    pickRowField(r, "Ticker", "ticker") ?? "—"
                  );

                  const dirRaw = String(
                    pickRowField(r, "Direction", "direction") ?? "—"
                  );
                  const isLong =
                    dirRaw.toUpperCase().includes("LONG") ||
                    dirRaw.toUpperCase() === "L";

                  const zap = num(pickRowField(r, "Zap", "zap"), 0);
                  const sigmaZap = num(
                    pickRowField(r, "SigmaZap", "sigmaZap"),
                    0
                  );
                  const adv20 = num(pickRowField(r, "ADV20", "adv20"), 0);
                  const spread = num(pickRowField(r, "Spread", "spread"), 0);
                  const mktCapM = num(
                    pickRowField(r, "MarketCapM", "marketCapM"),
                    0
                  );

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-emerald-500/[0.03] group transition-colors"
                    >
                      <td className="p-3 font-bold text-neutral-200 group-hover:text-emerald-400">
                        {ticker}
                      </td>

                      <td className="p-3 text-center">
                        <span
                          className={clsx(
                            "px-1.5 py-0.5 rounded-[2px] text-[8px] font-black tracking-tighter",
                            isLong
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-rose-500/10 text-rose-500"
                          )}
                        >
                          {dirRaw}
                        </span>
                      </td>

                      <td className="p-3 text-right text-emerald-500 font-bold">
                        {zap.toFixed(3)}
                      </td>
                      <td className="p-3 text-right text-neutral-300">
                        {sigmaZap.toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-neutral-500">
                        {Math.round(adv20).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-neutral-600">
                        {spread.toFixed(3)}
                      </td>
                      <td className="p-3 text-right text-neutral-600">
                        {mktCapM.toFixed(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-32 opacity-20 grayscale scale-90">
                <div className="text-6xl mb-4 text-emerald-500">⌬</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-center leading-loose">
                  Buffer_Empty
                  <br />
                  Waiting_for_signal_match
                </div>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-neutral-800 bg-black/60 flex justify-between items-center">
            <div className="text-[8px] font-mono text-neutral-700 uppercase italic">
              * Execution node: primary-us-east-1
            </div>
            <div className="text-[8px] font-mono text-neutral-700 uppercase">
              Last Sync: {lastSync}
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL SCROLLBAR STYLES */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #222;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
      `}</style>
    </div>
  );
}