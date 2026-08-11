"use client";

import clsx from "clsx";
import React, { useMemo } from "react";
import { downloadEpisodesCsv } from "../../../lib/scanner/csv";
import { minuteIdxToClockLabel, num } from "../../../lib/scanner/format";
import type { PaperArbClosedDto, PaperArbPriceMode, ScannerLogContext } from "../../../lib/scanner/types";
import { SideBadge } from "./ui";

export function ScannerAnalyticsLogImpl({
  rows,
  priceMode,
  context,
}: {
  rows: PaperArbClosedDto[];
  priceMode: PaperArbPriceMode;
  context: ScannerLogContext;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.startMinuteIdx - a.startMinuteIdx), [rows]);

  function fmtTime(tsNy: string | null | undefined): string {
    if (!tsNy) return "—";
    const m = tsNy.match(/(\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : tsNy;
  }

  function fmtDateLabel(dateValue: string | null | undefined): string {
    if (!dateValue) return "—";
    const m = String(dateValue).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(dateValue);
    return `${m[2]}/${m[3]}`;
  }

  function fmtPct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function buildDecisionContext(): string {
    return [
      `session=${context.session}`,
      `band=${context.ruleBand}`,
      `metric=${context.metric}`,
      `close=${context.closeMode}`,
      `price=${context.priceMode}`,
      `pnl=${context.pnlMode}`,
    ].join(" | ");
  }

  function buildGateContext(entryPct: number | null | undefined, exitPct: number | null | undefined): string {
    return [
      `start>=${context.startAbs.toFixed(2)}`,
      `start<=${context.startAbsMax || "-"}`,
      `end<=${context.endAbs.toFixed(2)}`,
      `hold>=${context.minHoldCandles}m`,
      `tick=${fmtPct(entryPct)}`,
      `bench=${fmtPct(exitPct)}`,
    ].join(" | ");
  }

  function buildScaleContext(entryCount: number, addsCount: number): string {
    return [
      `mode=${context.dilutionMode}`,
      `step=${context.dilutionStep.toFixed(2)}`,
      `max=${context.maxAdds}`,
      `entries=${entryCount}`,
      `adds=${addsCount}`,
    ].join(" | ");
  }

  function buildExecContext(): string {
    return [
      `scope=${context.scopeMode}`,
      `top=${context.scopeMode === "ALL" ? "ALL" : context.topN}`,
      `offset=${context.offset}`,
      `zap=${context.zapMode}`,
    ].join(" | ");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Scanner Analytics Log</span>
          <span className="text-[10px] font-mono text-zinc-600">{rows.length} entries</span>
        </div>
        <button
          type="button"
          onClick={() => downloadEpisodesCsv(rows, `scanner-analytics-log-${new Date().toISOString().slice(0, 10)}.csv`, priceMode, context)}
          className="flex h-7 items-center gap-1.5 px-2.5 rounded-lg bg-black/20 text-[10px] font-mono text-zinc-400 uppercase hover:text-white hover:bg-white/5 transition-all border border-transparent"
        >
          ↓ CSV
        </button>
      </div>

      <style jsx global>{`
        .scanner-analytics-log-table th, .scanner-analytics-log-table td { padding: 3px 5px !important; }
      `}</style>
      <div className="scanner-panel-surface overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <table className="scanner-analytics-log-table min-w-[2600px] w-full text-[10px] font-mono">
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/80 text-zinc-500 backdrop-blur-xl">
            <tr>
              <th className="text-left text-violet-400">Date</th>
              <th className="text-left">Time</th>
              <th className="text-left">AddTimes</th>
              <th className="text-left">Addσ</th>
              <th className="text-left">Event</th>
              <th className="text-left text-rose-400" title="How episode closed: Active/WindowEnd/EndOfDay/Print">CloseMode</th>
              <th className="text-left">Ticker</th>
              <th className="text-left">Bench</th>
              <th className="text-left">Side</th>
              <th className="text-left text-cyan-300">DecisionCtx</th>
              <th className="text-right text-violet-400">σStart</th>
              <th className="text-right text-violet-300">σPeak</th>
              <th className="text-right text-violet-300">σEnd</th>
              <th className="text-right text-rose-300" title="Opposite-side σ at close — the actual cover trigger value">ExitσAbs</th>
              <th className="text-right">Tick%</th>
              <th className="text-right">Bench%</th>
              <th className="text-right text-sky-400">Corr</th>
              <th className="text-right text-sky-400">Beta</th>
              <th className="text-right text-sky-300">σHist</th>
              <th className="text-right text-amber-400">Rating</th>
              <th className="text-right text-amber-300">Total</th>
              <th className="text-right">StartBar</th>
              <th className="text-right">BarHold</th>
              <th className="text-right">MinHold</th>
              <th className="text-left text-sky-300">GateCtx</th>
              <th className="text-left text-fuchsia-300">ScaleCtx</th>
              <th className="text-left text-emerald-300">ExecCtx</th>
              <th className="text-left">Filters</th>
              <th className="text-left">Reason</th>
              <th className="text-right text-emerald-400">P&amp;L</th>
              <th className="text-left">PeakTime</th>
              <th className="text-left">EndTime</th>
              <th className="text-right">Entries</th>
              <th className="text-right">Adds</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isBidAsk = priceMode === "BidAsk";
              const isLong = r.side === "Long";
              // Entry: Long pays ask, Short receives bid
              const entryPct = isBidAsk
                ? (isLong ? (r.startAskPct ?? r.lstPrcLstClsPct) : (r.startBidPct ?? r.lstPrcLstClsPct))
                : r.lstPrcLstClsPct;
              // Exit: Long receives bid, Short pays ask
              const exitPct = isBidAsk
                ? (isLong ? (r.endBidPct ?? r.endLstPrcLstClsPct) : (r.endAskPct ?? r.endLstPrcLstClsPct))
                : r.endLstPrcLstClsPct;
              const holdMin = r.endMinuteIdx - r.startMinuteIdx;
              const pnl = r.totalPnlUsd ?? null;
              const entryCount = Number.isFinite(r.entryCount ?? NaN) ? Math.max(1, Math.trunc(r.entryCount as number)) : 1;
              const addsCount = Math.max(0, entryCount - 1);
              const addMinuteIdxs = (r.entryMinuteIdxs ?? []).slice(1);
              const addMetricsAbs = (r.entryMetricAbs ?? r.entryMetrics ?? []).slice(1);
              const addTimesLabel = addMinuteIdxs.length
                ? addMinuteIdxs.map((idx) => minuteIdxToClockLabel(idx)).join(" | ")
                : "—";
              const addSigmasLabel = addMetricsAbs.length
                ? addMetricsAbs.map((value) => value == null || !Number.isFinite(value) ? "-" : `${Number(value).toFixed(2)}σ`).join(" | ")
                : "—";
              const filtersLabel = `entries=${entryCount} | adds=${addsCount} | spread=${num(r.spreadBidPct, 4)}`;
              const decisionCtx = buildDecisionContext();
              const gateCtx = buildGateContext(entryPct, exitPct);
              const scaleCtx = buildScaleContext(entryCount, addsCount);
              const execCtx = buildExecContext();
              const closeModeStr = r.closeMode ?? "—";
              const closeModeColor =
                r.closeMode === "Active" ? "text-rose-400 border-rose-500/40 bg-rose-500/10" :
                r.closeMode === "Passive" ? "text-amber-400 border-amber-500/40 bg-amber-500/10" :
                "text-zinc-400 border-zinc-500/30 bg-zinc-500/10";
              const exitSigmaAbs = r.exitMetricAbs != null ? Math.abs(r.exitMetricAbs) : null;
              const startBar = minuteIdxToClockLabel(r.startMinuteIdx);
              const barHold = Number.isFinite(holdMin) ? `${holdMin}m` : "—";
              return (
                <tr key={r.episodeId ?? i} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.025]">
                  <td className="text-zinc-600 whitespace-nowrap">{fmtDateLabel(r.dateNy ?? r.date ?? r.tradeDateNy ?? "—")}</td>
                  <td className="text-zinc-500 whitespace-nowrap">{fmtTime(r.startTsNy)}</td>
                  <td className="text-zinc-500 max-w-[160px] truncate" title={addTimesLabel}>{addTimesLabel}</td>
                  <td className="text-zinc-500 max-w-[180px] truncate" title={addSigmasLabel}>{addSigmasLabel}</td>
                  <td>
                    <span className={clsx(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
                    )}>EPISODE</span>
                  </td>
                  <td>
                    <span className={clsx("inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono font-bold border", closeModeColor)}>{closeModeStr}</span>
                  </td>
                  <td className="text-zinc-100 font-semibold">{r.ticker}</td>
                  <td className="text-zinc-400">{r.benchTicker}</td>
                  <td><SideBadge side={r.side} /></td>
                  <td className="text-cyan-200 max-w-[220px] truncate" title={decisionCtx}>{decisionCtx}</td>
                  <td className="text-right tabular-nums text-violet-300">{num(r.startMetric, 2)}</td>
                  <td className="text-right tabular-nums text-violet-200">{num(r.peakMetricAbs ?? r.peakMetric, 2)}</td>
                  <td className="text-right tabular-nums text-violet-200">{num(r.endMetricAbs ?? r.endMetric, 2)}</td>
                  <td className={clsx("text-right tabular-nums font-semibold", exitSigmaAbs != null && r.closeMode === "Active" ? "text-rose-300" : "text-zinc-600")}>
                    {exitSigmaAbs != null ? exitSigmaAbs.toFixed(2) : "·"}
                  </td>
                  <td className={clsx("text-right tabular-nums", entryPct != null && entryPct < 0 ? "text-rose-300" : "text-emerald-300")}>{fmtPct(entryPct)}</td>
                  <td className={clsx("text-right tabular-nums", exitPct != null && exitPct < 0 ? "text-rose-200" : "text-emerald-200")}>{fmtPct(exitPct)}</td>
                  <td className="text-right tabular-nums text-sky-300">{num(r.corr, 2)}</td>
                  <td className="text-right tabular-nums text-sky-300">{num(r.beta, 2)}</td>
                  <td className="text-right tabular-nums text-sky-200">{num(r.sigma, 2)}</td>
                  <td className="text-right tabular-nums text-amber-300">{r.rating != null ? r.rating.toFixed(1) : "—"}</td>
                  <td className="text-right tabular-nums text-amber-200">{r.ratingTotal ?? "—"}</td>
                  <td className="text-right tabular-nums text-zinc-500 whitespace-nowrap">{startBar}</td>
                  <td className="text-right tabular-nums text-zinc-400">{barHold}</td>
                  <td className="text-right tabular-nums text-zinc-500">{context?.minHoldCandles ?? r.minHoldCandles ?? "—"}</td>
                  <td className="text-sky-200 max-w-[220px] truncate" title={gateCtx}>{gateCtx}</td>
                  <td className="text-fuchsia-200 max-w-[220px] truncate" title={scaleCtx}>{scaleCtx}</td>
                  <td className="text-emerald-200 max-w-[220px] truncate" title={execCtx}>{execCtx}</td>
                  <td className="text-zinc-500 max-w-[160px] truncate">{filtersLabel}</td>
                  <td className="text-zinc-500 max-w-[180px] truncate">{r.closeMode ?? "—"}</td>
                  <td className={clsx(
                    "text-right tabular-nums font-semibold",
                    pnl != null && pnl > 0 ? "text-emerald-400" : pnl != null && pnl < 0 ? "text-rose-300" : "text-zinc-400"
                  )}>{num(pnl, 2)}</td>
                  <td className="text-zinc-500 whitespace-nowrap">{fmtTime(r.peakTsNy)}</td>
                  <td className="text-zinc-500 whitespace-nowrap">{fmtTime(r.endTsNy)}</td>
                  <td className="text-right tabular-nums text-zinc-500">{entryCount}</td>
                  <td className="text-right tabular-nums text-sky-300">{addsCount}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={35} className="px-4 py-10 text-center text-zinc-600">
                  No analytics trades yet. Run Analytics for a date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const ScannerAnalyticsLog = React.memo(ScannerAnalyticsLogImpl);
