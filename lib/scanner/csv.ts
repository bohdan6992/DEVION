import { minuteIdxToClockLabel, num } from "./format";
import type { PaperArbClosedDto, PaperArbPriceMode, ScannerLogContext } from "./types";

export function downloadEpisodesCsv(
  rows: PaperArbClosedDto[],
  filename?: string,
  priceMode: PaperArbPriceMode = "LastPrint",
  context?: ScannerLogContext | null
): void {
  const HEADERS = [
    "date","ticker","bench","side",
    "startTime","peakTime","endTime",
    "addTimes","addSigmas","addThresholds",
    "event",
    "decisionContext","gateContext","scaleContext","execContext",
    "startSigma","peakSigma","endSigma",
    "bidPct","askPct","benchBidPct",
    "tickPct","benchPct",
    "startSigmaAbs","peakSigmaAbs","endSigmaAbs","exitSigmaAbs",
    "holdCandles","holdSec","entryCount","addsCount","dilutionStep","maxAdds","minHoldCandles","filtersOk","reason","closeMode",
    "totalPnlUsd","rawPnlUsd","hedgedPnlUsd",
    "positionNotionalUsd","tierBp","corr","beta","stockSigma",
    "rating","ratingTotal",
    "spread","vwap","lstCls","yCls",
    "country","exchange","sectorL3",
  ];
  const cell = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const f4 = (v: number | null | undefined): string => v == null ? "" : v.toFixed(4);
  const f2 = (v: number | null | undefined): string => v == null ? "" : v.toFixed(2);
  const lines: string[] = [HEADERS.join(",")];
  for (const r of rows) {
    const dateKey = r.dateNy ?? r.date ?? r.day ?? r.tradeDate ?? r.sessionDate ?? "";
    const entryCount = Number.isFinite(r.entryCount ?? NaN) ? Math.max(1, Math.trunc(r.entryCount as number)) : 1;
    const addsCount = Math.max(0, entryCount - 1);
    const addMinuteIdxs = (r.entryMinuteIdxs ?? []).slice(1);
    const addMetricsAbs = (r.entryMetricAbs ?? r.entryMetrics ?? []).slice(1);
    const addTimes = addMinuteIdxs.map((idx) => minuteIdxToClockLabel(idx)).join(" | ");
    const addSigmas = addMetricsAbs
      .map((value) => value == null || !Number.isFinite(value) ? "-" : Number(value).toFixed(4))
      .join(" | ");
    const startSigmaAbs = r.startMetricAbs ?? 0;
    const dilutionStep = context?.dilutionStep ?? 0;
    const addThresholds = addMinuteIdxs.length > 0 && dilutionStep > 0
      ? addMinuteIdxs.map((_, i) => (startSigmaAbs + (i + 1) * dilutionStep).toFixed(4)).join(" | ")
      : "";
    const isLong = r.side === "Long";
    const entryPct = priceMode === "BidAsk"
      ? (isLong ? (r.startAskPct ?? r.lstPrcLstClsPct) : (r.startBidPct ?? r.lstPrcLstClsPct))
      : r.lstPrcLstClsPct;
    const exitPct = priceMode === "BidAsk"
      ? (isLong ? (r.endBidPct ?? r.endLstPrcLstClsPct) : (r.endAskPct ?? r.endLstPrcLstClsPct))
      : r.endLstPrcLstClsPct;
    const filtersOk = `entries=${entryCount} | adds=${addsCount} | spread=${num(r.spreadBidPct, 4)}`;
    const decisionContext = context
      ? [
          `session=${context.session}`,
          `band=${context.ruleBand}`,
          `metric=${context.metric}`,
          `close=${context.closeMode}`,
          `price=${context.priceMode}`,
          `pnl=${context.pnlMode}`,
        ].join(" | ")
      : "";
    const gateContext = context
      ? [
          context.startAbsNeg != null
            ? `start+>=${context.startAbs.toFixed(2)} | start->=${context.startAbsNeg.toFixed(2)}`
            : `start>=${context.startAbs.toFixed(2)}`,
          `start<=${context.startAbsMax || "-"}`,
          `end<=${context.endAbs.toFixed(2)}`,
          `hold>=${context.minHoldCandles}m`,
          `tick=${f4(entryPct) || "-"}`,
          `bench=${f4(exitPct) || "-"}`,
        ].join(" | ")
      : "";
    const addThresholdsList = addThresholds.length > 0 ? addThresholds : "-";
    const scaleContext = context
      ? [
          `mode=${context.dilutionMode}`,
          `entryσ=${f4(r.startMetric)}`,
          `add@=${addThresholdsList}`,
          `step=${context.dilutionStep.toFixed(3)}`,
          `max=${context.maxAdds}`,
          `entries=${entryCount}`,
        ].join(" | ")
      : "";
    const execContext = context
      ? [
          `scope=${context.scopeMode}`,
          `top=${context.scopeMode === "ALL" ? "ALL" : context.topN}`,
          `offset=${context.offset}`,
          `zap=${context.zapMode}`,
        ].join(" | ")
      : "";
    lines.push([
      cell(dateKey),
      cell(r.ticker),
      cell(r.benchTicker),
      cell(r.side),
      cell(minuteIdxToClockLabel(r.startMinuteIdx)),
      cell(minuteIdxToClockLabel(r.peakMinuteIdx)),
      cell(minuteIdxToClockLabel(r.endMinuteIdx)),
      cell(addTimes),
      cell(addSigmas),
      cell(addThresholds),
      "EPISODE",
      cell(decisionContext),
      cell(gateContext),
      cell(scaleContext),
      cell(execContext),
      f4(r.startMetric),
      f4(r.peakMetric),
      f4(r.endMetric),
      f4(r.startBidPct),
      f4(r.startAskPct),
      f4(r.startBenchLstPrcLstClsPct),
      f4(entryPct),
      f4(exitPct),
      f4(r.startMetricAbs),
      f4(r.peakMetricAbs),
      f4(r.endMetricAbs),
      f4(r.exitMetricAbs),
      r.endMinuteIdx != null && r.startMinuteIdx != null ? String(r.endMinuteIdx - r.startMinuteIdx) : "",
      r.endMinuteIdx != null && r.startMinuteIdx != null ? String((r.endMinuteIdx - r.startMinuteIdx) * 60) : "",
      entryCount,
      addsCount,
      context != null ? context.dilutionStep.toFixed(3) : "",
      context != null ? String(context.maxAdds) : "",
      context != null ? String(context.minHoldCandles) : (r.minHoldCandles != null ? String(r.minHoldCandles) : ""),
      cell(filtersOk),
      cell(r.closeMode ?? ""),   // reason
      cell(r.closeMode ?? ""),   // closeMode (fixes column alignment — was missing)
      f2(r.totalPnlUsd),
      f2(r.rawPnlUsd),
      f2(r.hedgedPnlUsd),
      f2(r.positionNotionalUsd),
      f4(r.tierBp),
      f4(r.corr),
      f4(r.beta),
      f4(r.sigma),
      f4(r.rating),
      f4(r.ratingTotal),
      f4(r.spreadBidPct),
      f4(r.vwap),
      f4(r.lstCls),
      f4(r.yCls),
      cell(r.country ?? ""),
      cell(r.exchange ?? ""),
      cell(r.sectorL3 ?? ""),
    ].join(","));
  }
  const csv = lines.join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `scanner-episodes-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
