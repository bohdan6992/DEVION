"use client";

import clsx from "clsx";
import AutoSizer from "react-virtualized-auto-sizer";
import { List, type RowComponentProps } from "react-window";
import React, { memo, useDeferredValue, useMemo, useState } from "react";
import { useStreamActionLogRows } from "./streamActionLogStore";
import { getStreamDecisionRow, useStreamDecisionIds, useStreamDecisionRow, useStreamDecisionVersion } from "./streamDecisionStore";
import { useStreamExecutionSnapshot } from "./streamExecutionStore";
import { useStreamOrderIntentMeta, useStreamOrderIntentRows } from "./streamOrderIntentStore";
import { useStreamBookSnapshotState, useStreamMainWindowSnapshotState } from "./streamOcrStores";
import { useStreamActiveDecisionRows, useStreamPositionMeta, useStreamPositionRows } from "./streamPositionStore";
import { useStreamUpdatedAt } from "./streamUpdatedAtStore";
import { streamLogStore, downloadStreamLog, useStreamLogEntries } from "./streamLogStore";
import type {
  StreamActionLogEntry,
  MainWindowDataSnapshot,
  MarketMakerBookSnapshot,
  StreamAutomationConfig,
  StreamDecisionRow,
  StreamManualOrderAction,
  TradingAppExecutionSnapshot,
} from "./streamEngine";

type StreamTabKey = "active" | "episodes" | "analytics";
type StreamViewMode = "stream" | "auto" | "stream-auto-tab";

type StreamDecisionTableRow = {
  ticker: string;
  benchmark: string;
  side: "Long" | "Short";
  signal: number | null;
  spread: number | null;
  spreadBidPct: number | null;
  netEdge: number | null;
  status: StreamDecisionRow["status"] | "PENDING_ENTRY" | "OPEN" | "EXIT_BLOCKED" | "CLOSED" | "PRINT_PENDING";
};

type ArbitrageStreamViewProps = {
  tab: StreamTabKey;
  streamSignalsCount: number;
  streamAutoEnabled: boolean;
  streamSessionStartedAt: number | null;
  streamSessionStoppedAt: number | null;
  streamSentOrdersCount: number;
  onSetAutoEnabled: (enabled: boolean) => void;
  manualExecutionBusy: boolean;
  onSubmitManualOrders: (tickersText: string, action: StreamManualOrderAction) => Promise<void>;
  onCaptureTickerPoint: () => Promise<void>;
  onCaptureTickerPointDelayed: (delayMs?: number) => Promise<void>;
  onClearTickerPoint: () => Promise<void>;
  onTogglePanicOff: (enabled: boolean) => Promise<void>;
  onStartAutomation?: () => Promise<void>;
  onClearExecutionQueue: () => Promise<void>;
  onResetAutomationState: () => void;
  onDismissActivePositions?: (tickers: string[]) => void;
  onForceRefresh: () => Promise<void>;
  listModeLabel: string;
  automationConfig: StreamAutomationConfig;
  onAutomationConfigChange: (patch: Partial<StreamAutomationConfig>) => void;
  accentActiveSoftClass: string;
  accentActiveTextClass: string;
  viewMode?: StreamViewMode;
  automationLaunchEnabled?: boolean;
  entryCutoffActive?: boolean;
  hideAutomationButtons?: boolean;
};

function BookLevelsCard({
  label,
  levels,
  accentClass,
}: {
  label: string;
  levels: MarketMakerBookSnapshot["bidLevels"] | MarketMakerBookSnapshot["askLevels"];
  accentClass: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{label}</div>
      <div className="mt-3 space-y-2">
        {levels.length ? levels.map((level, index) => (
          <div key={`${label}|${index}|${level.exchange}|${level.price}`} className="flex items-center justify-between gap-3 text-[11px] font-mono">
            <span className="text-zinc-500">{level.exchange || "BOOK"}</span>
            <span className={accentClass}>{num(level.price, 2)}</span>
            <span className="text-zinc-300">{intn(level.size)}</span>
          </div>
        )) : (
          <div className="text-[11px] font-mono text-zinc-500">No levels captured.</div>
        )}
      </div>
    </div>
  );
}

const MAIN_WINDOW_FIELD_ORDER = [
  "TotalBPUsed",
  "TotalShortBPUsed",
  "TotalLongBPUsed",
  "TotalOpenPnL",
  "TotalClosedPnL",
  "LongPosLtClsA%",
  "ShortPosStClsA%",
  "LstPrcTotalPnL",
  "BPLeft",
];
const STREAM_BID_MINT = "#7ef7d4";
const STREAM_BID_MINT_SOFT = "rgba(126, 247, 212, 0.10)";
const STREAM_BID_MINT_PANEL = "rgba(126, 247, 212, 0.04)";
const STREAM_READY_GREEN = "#63e6be";
const STREAM_READY_GREEN_SOFT = "rgba(99, 230, 190, 0.12)";
const STREAM_READY_GREEN_BORDER = "rgba(99, 230, 190, 0.22)";
const STREAM_ALERT_RED = "#f38ba8";
const STREAM_ALERT_RED_SOFT = "rgba(243, 139, 168, 0.12)";
const STREAM_ALERT_RED_BORDER = "rgba(243, 139, 168, 0.24)";

function normalizeMainWindowFieldKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9%]+/g, "").toLowerCase();
}

function canonicalMainWindowHeading(value: string): string {
  const normalized = normalizeMainWindowFieldKey(value);
  const exactMatch = MAIN_WINDOW_FIELD_ORDER.find((label) => normalizeMainWindowFieldKey(label) === normalized);
  if (exactMatch) {
    return exactMatch;
  }
  const fuzzyMatch = MAIN_WINDOW_FIELD_ORDER.find((label) => {
    const normalizedLabel = normalizeMainWindowFieldKey(label);
    return normalized.includes(normalizedLabel) || normalizedLabel.includes(normalized);
  });
  return fuzzyMatch ?? value;
}

function extractMainWindowControls(snapshot: MainWindowDataSnapshot | null): Array<{ label: string; state: "GREEN" | "RED" | "UNKNOWN" }> {
  if (Array.isArray(snapshot?.controls) && snapshot.controls.length) {
    return snapshot.controls
      .map((control) => {
        const state: "GREEN" | "RED" | "UNKNOWN" =
          control.state === "GREEN" || control.state === "RED" ? control.state : "UNKNOWN";
        return {
          label: String(control.label ?? "").trim().toUpperCase(),
          state,
        };
      })
      .filter((control) => control.label === "MD" || control.label === "NW" || control.label === "EX");
  }

  const sourceLines = [
    ...(Array.isArray(snapshot?.ocrLines) ? snapshot.ocrLines : []),
    ...String(snapshot?.ocrText ?? "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean),
  ];
  const seen = new Set<string>();
  const controls: Array<{ label: string; state: "GREEN" | "RED" | "UNKNOWN" }> = [];
  sourceLines.forEach((line) => {
    line
      .split(/\s+/g)
      .map((token) => token.replace(/[^a-zA-Z]/g, "").toUpperCase())
      .filter((token) => token === "MD" || token === "NW" || token === "EX")
      .forEach((token) => {
        if (seen.has(token)) return;
        seen.add(token);
        controls.push({ label: token, state: "UNKNOWN" });
      });
  });
  return controls;
}

function MainWindowBookSplitCard({
  mainWindowBound,
  mainWindowSnapshot,
  executionMessage,
  bookSnapshot,
}: {
  mainWindowBound: TradingAppExecutionSnapshot["mainWindow"];
  mainWindowSnapshot: MainWindowDataSnapshot | null;
  executionMessage?: string | null;
  bookSnapshot: MarketMakerBookSnapshot | null;
}) {
  const orderedFields = (() => {
    const rawFields = Array.isArray(mainWindowSnapshot?.fields) ? mainWindowSnapshot.fields : [];
    const canonicalFields = rawFields.map((field) => ({
      ...field,
      heading: canonicalMainWindowHeading(field.heading),
    }));
    const used = new Set<number>();
    return MAIN_WINDOW_FIELD_ORDER.map((label) => {
      const matchIndex = canonicalFields.findIndex(
        (field, index) => !used.has(index) && normalizeMainWindowFieldKey(field.heading) === normalizeMainWindowFieldKey(label),
      );
      if (matchIndex >= 0) {
        used.add(matchIndex);
        return { heading: label, value: canonicalFields[matchIndex].value, rawLine: canonicalFields[matchIndex].rawLine };
      }
      return { heading: label, value: null as string | null, rawLine: "" };
    });
  })();
  const mainWindowControls = extractMainWindowControls(mainWindowSnapshot);
  const bookRows = Array.from({ length: 5 }, (_, index) => ({
    level: index + 1,
    bid: bookSnapshot?.bidLevels?.[index] ?? null,
    ask: bookSnapshot?.askLevels?.[index] ?? null,
  }));

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Main Window</div>
          <div className="flex items-center gap-1.5">
            {mainWindowControls.map((control) => (
              <div
                key={control.label}
                className="flex h-7 w-7 items-center justify-center rounded-md font-mono text-[10px] font-bold uppercase leading-none"
                style={
                  control.state === "RED"
                    ? { color: STREAM_ALERT_RED, border: `1px solid ${STREAM_ALERT_RED_BORDER}`, backgroundColor: STREAM_ALERT_RED_SOFT }
                    : control.state === "GREEN"
                      ? { color: STREAM_READY_GREEN, border: `1px solid ${STREAM_READY_GREEN}`, backgroundColor: "rgba(99,230,190,0.22)", boxShadow: `0 0 8px rgba(99,230,190,0.35)` }
                      : { color: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(0,0,0,0.3)" }
                }
              >
                {control.label}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
            {orderedFields.map((field, index) => (
              <div
                key={`${field.heading}|${index}`}
                className={clsx(
                  "flex items-center justify-between gap-3 border-b border-white/5 py-1.5 font-mono",
                  index % 2 === 0 ? "text-zinc-200" : "text-zinc-300",
                )}
              >
                <div className="truncate text-[11px] leading-none text-emerald-300">{field.heading}</div>
                <div className={clsx("shrink-0 text-right text-[14px] leading-none", field.value ? "text-zinc-100" : "text-zinc-600")}>
                  {field.value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex h-full flex-col rounded-xl border border-white/10 bg-black/20">
        <div className="grid h-full flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
          <div
            className="flex h-full flex-col rounded-xl px-4 py-4"
            style={{ border: `1px solid rgba(126, 247, 212, 0.09)`, backgroundColor: "rgba(126, 247, 212, 0.036)" }}
          >
            <div
              className="flex items-center justify-between gap-3 pb-2"
              style={{ borderBottom: `1px solid ${STREAM_BID_MINT_SOFT}` }}
            >
              <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: STREAM_BID_MINT }}>Bids</div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">5 Levels</div>
            </div>
            <div className="mt-2 flex-1 space-y-1.5">
              {bookRows.map(({ level, bid }, index) => (
                <div
                  key={`book-bid-${level}`}
                  className={clsx(
                    "grid grid-cols-[34px_minmax(0,1fr)_72px_64px] items-center gap-3 rounded-md px-2 py-1.5",
                    index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
                  )}
                >
                  <div className="text-[10px] font-mono text-zinc-500">L{level}</div>
                  <div className="text-[11px] font-mono text-zinc-500 truncate">{bid?.exchange || "-"}</div>
                  <div className="text-[11px] font-mono text-right" style={{ color: STREAM_BID_MINT }}>{num(bid?.price ?? null, 2)}</div>
                  <div className="text-[11px] font-mono text-right text-zinc-300">{intn(bid?.size ?? null)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex h-full flex-col rounded-xl border border-[rgba(244,63,94,0.09)] bg-[rgba(244,63,94,0.027)] px-4 py-4">
            <div className="flex items-center justify-between gap-3 border-b border-rose-500/10 pb-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-rose-200">Asks</div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">5 Levels</div>
            </div>
            <div className="mt-2 flex-1 space-y-1.5">
              {bookRows.map(({ level, ask }, index) => (
                <div
                  key={`book-ask-${level}`}
                  className={clsx(
                    "grid grid-cols-[34px_minmax(0,1fr)_72px_64px] items-center gap-3 rounded-md px-2 py-1.5",
                    index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
                  )}
                >
                  <div className="text-[10px] font-mono text-zinc-500">L{level}</div>
                  <div className="text-[11px] font-mono text-zinc-500 truncate">{ask?.exchange || "-"}</div>
                  <div className="text-[11px] font-mono text-right text-rose-200">{num(ask?.price ?? null, 2)}</div>
                  <div className="text-[11px] font-mono text-right text-zinc-300">{intn(ask?.size ?? null)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function intn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Math.trunc(value).toLocaleString("en-US");
}

function timeToMinutes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
  return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
}

function formatActionLogTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "-";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatRuntime(startedAt: number | null, stoppedAt: number | null): string {
  if (!startedAt || !Number.isFinite(startedAt)) return "-";
  const end = stoppedAt && Number.isFinite(stoppedAt) ? stoppedAt : Date.now();
  const elapsedMs = Math.max(0, end - startedAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="scanner-panel-surface border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] rounded-2xl p-3">
      <div className="flex items-center justify-between gap-4 h-full">
        <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{label}</div>
        <div className={clsx("flex items-center justify-end text-base md:text-xl font-semibold font-mono text-right text-zinc-200", valueClassName)}>
          {value}
        </div>
      </div>
    </div>
  );
}

const STREAM_DECISION_TABLE_MIN_WIDTH = 880;
const STREAM_DECISION_ROW_HEIGHT = 57;
const STREAM_DECISION_VIRTUAL_THRESHOLD = 240;

function StreamDecisionVirtualRow({
  ariaAttributes,
  index,
  style,
  rows,
}: RowComponentProps<{ rows: StreamDecisionTableRow[] }>) {
  const row = rows[index];
  if (!row) return <div style={style} />;

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={clsx(
        "grid grid-cols-[148px_120px_116px_1fr_1fr_1fr_172px] items-center gap-0 border-t border-white/5 px-0 text-xs font-mono transition-colors",
        index % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
        "hover:bg-white/[0.03]"
      )}
    >
      <div className="px-2.5 text-zinc-100 font-semibold">{row.ticker}</div>
      <div className="px-2.5 text-zinc-400">{row.benchmark}</div>
      <div className="px-2.5"><SideBadge side={row.side} /></div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.spreadBidPct, 3)}</div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</div>
      <div className="px-2.5"><StreamStatusBadge status={row.status} /></div>
    </div>
  );
}

function StreamDecisionStoreVirtualRow({
  ariaAttributes,
  index,
  style,
  rowIds,
}: RowComponentProps<{ rowIds: string[] }>) {
  const rowId = rowIds[index];
  const row = useStreamDecisionRow(rowId);
  if (!row) return <div style={style} />;

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={clsx(
        "grid grid-cols-[148px_120px_116px_1fr_1fr_1fr_172px] items-center gap-0 border-t border-white/5 px-0 text-xs font-mono transition-colors",
        index % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
        "hover:bg-white/[0.03]"
      )}
    >
      <div className="px-2.5 text-zinc-100 font-semibold">{row.ticker}</div>
      <div className="px-2.5 text-zinc-400">{row.benchmark}</div>
      <div className="px-2.5"><SideBadge side={row.side} /></div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.spreadBidPct, 3)}</div>
      <div className="px-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</div>
      <div className="px-2.5"><StreamStatusBadge status={row.status} /></div>
    </div>
  );
}

const StreamDecisionTable = memo(function StreamDecisionTable({
  title,
  rows,
  emptyMessage,
  onDismissTicker,
  onDismissAll,
}: {
  title: string;
  rows: StreamDecisionTableRow[];
  emptyMessage: string;
  onDismissTicker?: (ticker: string) => void;
  onDismissAll?: () => void;
}) {
  const useVirtualRows = rows.length > STREAM_DECISION_VIRTUAL_THRESHOLD;
  const hasDismiss = !!onDismissTicker;
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: hasDismiss
      ? "148px 120px 116px 1fr 1fr 1fr 172px 36px"
      : "148px 120px 116px 1fr 1fr 1fr 172px",
  };

  return (
    <div className="scanner-panel-surface overflow-auto rounded-xl bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-3 bg-[#0a0a0a]/40 px-3 py-2 backdrop-blur-xl">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-500">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {onDismissAll && rows.length > 0 && (
            <button
              onClick={onDismissAll}
              className="rounded px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors border border-white/10"
            >
              Reset All
            </button>
          )}
          <div className="text-[10px] font-mono uppercase text-zinc-500">
            {intn(rows.length)}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div
          className="min-w-[880px]"
          style={{ minWidth: STREAM_DECISION_TABLE_MIN_WIDTH }}
        >
          <div
            className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-xs font-mono text-zinc-300 backdrop-blur-xl"
            style={gridStyle}
          >
            <div className="p-2.5 text-left">Ticker</div>
            <div className="p-2.5 text-left">Bench</div>
            <div className="p-2.5 text-left">Side</div>
            <div className="p-2.5 text-right">Signal</div>
            <div className="p-2.5 text-right">SpreadBid%</div>
            <div className="p-2.5 text-right">Net Edge</div>
            <div className="p-2.5 text-left">Status</div>
            {hasDismiss && <div className="p-2.5" />}
          </div>

          {!rows.length ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">
              {emptyMessage}
            </div>
          ) : useVirtualRows ? (
            <div className="h-[540px]">
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    rowComponent={StreamDecisionVirtualRow}
                    rowCount={rows.length}
                    rowHeight={STREAM_DECISION_ROW_HEIGHT}
                    rowProps={{ rows }}
                    overscanCount={8}
                    style={{ width: Math.max(width, STREAM_DECISION_TABLE_MIN_WIDTH), height }}
                  />
                )}
              </AutoSizer>
            </div>
          ) : (
            <div className="text-xs font-mono">
              {rows.map((row, i) => (
                <div
                  key={`${title}|${row.ticker}|${i}`}
                  className={clsx(
                    "items-center border-t border-white/5 transition-colors",
                    i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                    "hover:bg-white/[0.03]"
                  )}
                  style={gridStyle}
                >
                  <div className="px-2.5 py-2.5 text-zinc-100 font-semibold">{row.ticker}</div>
                  <div className="px-2.5 py-2.5 text-zinc-400">{row.benchmark}</div>
                  <div className="px-2.5 py-2.5"><SideBadge side={row.side} /></div>
                  <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</div>
                  <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.spreadBidPct, 3)}</div>
                  <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</div>
                  <div className="px-2.5 py-2.5"><StreamStatusBadge status={row.status} /></div>
                  {hasDismiss && (
                    <div className="flex items-center justify-center px-1">
                      <button
                        onClick={() => onDismissTicker!(row.ticker)}
                        className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors leading-none"
                        title={`Reset ${row.ticker}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const StreamSignalsDecisionTable = memo(function StreamSignalsDecisionTable({
  title,
  rowIds,
  emptyMessage,
}: {
  title: string;
  rowIds: string[];
  emptyMessage: string;
}) {
  const deferredRowIds = useDeferredValue(rowIds);
  const useVirtualRows = deferredRowIds.length > STREAM_DECISION_VIRTUAL_THRESHOLD;

  return (
    <div className="scanner-panel-surface overflow-auto rounded-xl bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-3 bg-[#0a0a0a]/40 px-3 py-2 backdrop-blur-xl">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-500">
          {title}
        </div>
        <div className="text-[10px] font-mono uppercase text-zinc-500">
          {intn(deferredRowIds.length)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div
          className="min-w-[880px]"
          style={{ minWidth: STREAM_DECISION_TABLE_MIN_WIDTH }}
        >
          <div className="sticky top-0 z-10 grid grid-cols-[148px_120px_116px_1fr_1fr_1fr_172px] bg-[#0a0a0a]/55 text-xs font-mono text-zinc-300 backdrop-blur-xl">
            <div className="p-2.5 text-left">Ticker</div>
            <div className="p-2.5 text-left">Bench</div>
            <div className="p-2.5 text-left">Side</div>
            <div className="p-2.5 text-right">Signal</div>
            <div className="p-2.5 text-right">SpreadBid%</div>
            <div className="p-2.5 text-right">Net Edge</div>
            <div className="p-2.5 text-left">Status</div>
          </div>

          {!deferredRowIds.length ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">
              {emptyMessage}
            </div>
          ) : useVirtualRows ? (
            <div className="h-[540px]">
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    rowComponent={StreamDecisionStoreVirtualRow}
                    rowCount={deferredRowIds.length}
                    rowHeight={STREAM_DECISION_ROW_HEIGHT}
                    rowProps={{ rowIds: deferredRowIds }}
                    overscanCount={8}
                    style={{ width: Math.max(width, STREAM_DECISION_TABLE_MIN_WIDTH), height }}
                  />
                )}
              </AutoSizer>
            </div>
          ) : (
            <div className="text-xs font-mono">
              {deferredRowIds.map((id, i) => {
                const row = getStreamDecisionRow(id);
                if (!row) return null;
                return (
                  <div
                    key={`${title}|${row.ticker}|${i}`}
                    className={clsx(
                      "grid grid-cols-[148px_120px_116px_1fr_1fr_1fr_172px] items-center border-t border-white/5 transition-colors",
                      i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                      "hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="px-2.5 py-2.5 text-zinc-100 font-semibold">{row.ticker}</div>
                    <div className="px-2.5 py-2.5 text-zinc-400">{row.benchmark}</div>
                    <div className="px-2.5 py-2.5"><SideBadge side={row.side} /></div>
                    <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</div>
                    <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.spreadBidPct, 3)}</div>
                    <div className="px-2.5 py-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</div>
                    <div className="px-2.5 py-2.5"><StreamStatusBadge status={row.status} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function actionLogLabel(row: StreamActionLogEntry): string {
  if (row.kind === "ADD") {
    const n = row.sequence != null ? row.sequence - 1 : "?";
    return `ADD #${n}`;
  }
  if (row.kind === "CLOSE") {
    const adds = row.entryCount != null && row.entryCount > 1 ? `×${row.entryCount}` : "";
    return adds ? `CLOSE${adds}` : "CLOSE";
  }
  return "ENTRY";
}

function actionLogTxtRow(row: StreamActionLogEntry): string {
  const sinceOrHold = row.kind === "ADD"
    ? (row.sinceLastMs != null ? fmtDuration(row.sinceLastMs) + (row.delayRequiredMs != null ? `/req ${Math.floor(row.delayRequiredMs / 60_000)}m` : "") : "—")
    : row.kind === "CLOSE"
      ? (row.holdMs != null ? `held ${fmtDuration(row.holdMs)}` : "—")
      : "—";
  const threshold = row.kind === "ADD" && row.addThreshold != null ? `${row.addThreshold.toFixed(3)}σ` : "—";
  return [
    formatActionLogTime(row.at).padEnd(10),
    row.ticker.padEnd(8),
    row.benchmark.padEnd(6),
    row.side.padEnd(6),
    actionLogLabel(row).padEnd(9),
    (row.deviation != null ? row.deviation.toFixed(4) : "—").padEnd(10),
    sinceOrHold.padEnd(14),
    threshold.padEnd(10),
    (row.filtersOk ?? "—").slice(0, 30).padEnd(32),
    row.reason ?? "—",
  ].join(" | ");
}

const StreamActionLogTable = memo(function StreamActionLogTable({ rows }: { rows: StreamActionLogEntry[] }) {
  const structuredLogEntries = useStreamLogEntries();

  const handleDownloadCsv = () => {
    const entries = streamLogStore.getEntries();
    if (entries.length === 0) return;
    downloadStreamLog(entries);
  };

  const handleDownload = () => {
    const latestCtx = structuredLogEntries[0] ?? null;
    const ctxLine = latestCtx
      ? `CTX: session=${latestCtx.session ?? "-"} | ruleBand=${latestCtx.ruleBand ?? "-"} | signalClass=${latestCtx.signalClass ?? "-"} | ratingMode=${latestCtx.ratingMode ?? "-"} | ratingType=${latestCtx.ratingType ?? "-"}`
      : null;
    const header = ["Time".padEnd(10), "Ticker".padEnd(8), "Bench".padEnd(6), "Side".padEnd(6), "Action".padEnd(9), "σ".padEnd(10), "Since/Hold".padEnd(14), "Threshold".padEnd(10), "Filters".padEnd(32), "Reason"].join(" | ");
    const lines: string[] = [
      "=== STREAM ORDER LOG ===",
      `Generated: ${new Date().toLocaleString("en-US", { hour12: false })}`,
      `Total entries: ${rows.length}`,
      ...(ctxLine ? [ctxLine] : []),
      "",
      header,
      "-".repeat(130),
      ...rows.map(actionLogTxtRow),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stream-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="scanner-panel-surface flex h-[320px] flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-4 px-3 py-3">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-500">
            Order Log
          </div>
        </div>
        <div className="flex items-center gap-2">
          {structuredLogEntries.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-950/30 px-3 py-1.5 text-[10px] font-mono uppercase text-sky-400 hover:bg-sky-500/20 hover:text-sky-200 transition-colors"
              title="Download detailed CSV log (sigma, zap%, hold time, filters)"
            >
              CSV
            </button>
          )}
          {rows.length > 0 && (
            <button
              onClick={handleDownload}
              className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-mono uppercase text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
              title="Download log as text file"
            >
              TXT
            </button>
          )}
          <div className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-mono uppercase text-zinc-400">
            {intn(rows.length)} rows
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06]" />
      <div className="flex-1 overflow-y-auto overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table className="min-w-[1480px] w-full text-xs font-mono">
          <thead className="sticky top-0 z-10 bg-[#0a0a0a]/45 text-zinc-500 backdrop-blur-xl">
            <tr>
              <th className="text-left p-2.5 whitespace-nowrap font-normal">Time</th>
              <th className="text-left p-2.5 whitespace-nowrap font-normal">Ticker</th>
              <th className="text-left p-2.5 whitespace-nowrap font-normal">Bench</th>
              <th className="text-left p-2.5 whitespace-nowrap font-normal">Side</th>
              <th className="text-left p-2.5 whitespace-nowrap font-normal">Action</th>
              <th className="text-right p-2.5 whitespace-nowrap font-normal text-violet-500">σ</th>
              <th className="text-right p-2.5 whitespace-nowrap font-normal text-sky-600">Since / Hold</th>
              <th className="text-right p-2.5 whitespace-nowrap font-normal text-sky-600">Threshold</th>
              <th className="text-left p-2.5 whitespace-nowrap font-normal text-amber-600">Filters</th>
              <th className="text-left p-2.5 w-full font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isAdd = row.kind === "ADD";
              const isClose = row.kind === "CLOSE";
              const addNum = isAdd && row.sequence != null ? row.sequence - 1 : null;
              const hasDelay = isAdd && (row.delayRequiredMs ?? 0) > 0;
              const delayOk = !hasDelay || (row.sinceLastMs != null && row.sinceLastMs >= (row.delayRequiredMs ?? 0));
              const sinceCell = isAdd
                ? (() => {
                    if (row.sinceLastMs == null) return { text: "—", sub: "", cls: "text-zinc-600" };
                    const elapsed = fmtDuration(row.sinceLastMs);
                    const reqMin = row.delayRequiredMs != null ? Math.floor(row.delayRequiredMs / 60_000) : 0;
                    const sub = reqMin > 0 ? `req ${reqMin}m` : "no delay";
                    const cls = reqMin === 0 ? "text-zinc-500" : delayOk ? "text-emerald-400" : "text-amber-400";
                    return { text: elapsed, sub, cls };
                  })()
                : isClose
                  ? { text: row.holdMs != null ? fmtDuration(row.holdMs) : "—", sub: "held", cls: "text-teal-400" }
                  : { text: "—", sub: "", cls: "text-zinc-600" };
              return (
                <tr
                  key={row.id}
                  className={clsx(
                    "transition-colors",
                    i % 2 === 0 ? "bg-white/[0.012]" : "bg-transparent",
                    "hover:bg-white/[0.025]"
                  )}
                >
                  <td className="p-2.5 text-zinc-500 whitespace-nowrap tabular-nums">{formatActionLogTime(row.at)}</td>
                  <td className="p-2.5 text-zinc-100 font-semibold whitespace-nowrap">{row.ticker}</td>
                  <td className="p-2.5 text-zinc-500 whitespace-nowrap">{row.benchmark}</td>
                  <td className="p-2.5 whitespace-nowrap"><SideBadge side={row.side} /></td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className={clsx(
                      "inline-flex rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase border tracking-wide",
                      isClose
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                        : isAdd
                          ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    )}>
                      {isAdd && addNum != null ? `ADD #${addNum}` : isClose && row.entryCount != null && row.entryCount > 1 ? `CLOSE ×${row.entryCount}` : row.kind}
                    </span>
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-violet-300 whitespace-nowrap">{num(row.deviation, 4)}</td>
                  <td className="p-2.5 text-right whitespace-nowrap tabular-nums">
                    {sinceCell.text !== "—" ? (
                      <span className="flex flex-col items-end leading-tight gap-px">
                        <span className={sinceCell.cls}>{sinceCell.text}</span>
                        {sinceCell.sub ? <span className="text-[9px] text-zinc-600">{sinceCell.sub}</span> : null}
                      </span>
                    ) : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-sky-400 whitespace-nowrap">
                    {isAdd && row.addThreshold != null ? `${row.addThreshold.toFixed(3)}σ` : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="p-2.5 text-amber-600/80 max-w-[200px] truncate text-[10px]" title={row.filtersOk}>{row.filtersOk || <span className="text-zinc-700">—</span>}</td>
                  <td className="p-2.5 text-zinc-500 w-full max-w-[200px] truncate" title={row.reason}>{row.reason ?? "—"}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-zinc-600">
                  No STREAM actions recorded for today yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function SideBadge({ side }: { side: "Long" | "Short" }) {
  const colorClass = side === "Long"
    ? "bg-[#6ee7b7]/10 text-[#6ee7b7] border-[#6ee7b7]/20"
    : "border-[rgba(243,166,178,0.22)] bg-[rgba(243,166,178,0.10)] text-[#f3a6b2]";

  return (
    <span className={clsx("px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap", colorClass)}>
      {side}
    </span>
  );
}

function StreamStatusBadge({ status }: { status: StreamDecisionRow["status"] | "PENDING_ENTRY" | "OPEN" | "EXIT_BLOCKED" | "CLOSED" | "PRINT_PENDING" }) {
  const isGreenStatus = status === "ENTRY_READY" || status === "OPEN";
  const className =
    isGreenStatus
      ? ""
      : status === "PENDING_ENTRY"
        ? "border-white/10 bg-white/[0.04] text-zinc-400"
      : status === "BLOCKED_SPREAD"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
        : status === "BLOCKED_EDGE"
          ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
        : status === "PRINT_PENDING"
          ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
        : status === "EXIT_BLOCKED"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/[0.04] text-zinc-300";

  return (
    <span
      className={clsx("inline-flex rounded-md px-2 py-1 text-[10px] font-mono font-bold uppercase border", className)}
      style={isGreenStatus ? {
        color: STREAM_READY_GREEN,
        backgroundColor: STREAM_READY_GREEN_SOFT,
        borderColor: STREAM_READY_GREEN_BORDER,
      } : undefined}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

const STREAM_ICON_BUTTON =
  "scanner-eye-button inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-zinc-300 transition-colors hover:bg-white/[0.08] group";

function LockToggleIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {open ? (
        <>
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      )}
    </svg>
  );
}

function fmt2(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}
function fmt3(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(3);
}
function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function SimEventBadge({ event, betaMode }: { event: string; betaMode: boolean }) {
  const base = "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider";
  const color =
    event === "ENTRY" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
    event === "ADD"   ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" :
    event === "EXIT" || event === "EXIT_PRINT" || event === "CLOSE_ALL" ?
      "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
      "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30";
  return (
    <span className={clsx(base, color)}>
      {betaMode && <span className="mr-1 opacity-60">β</span>}
      {event}
    </span>
  );
}

function computeStreamExitPnl(entries: ReturnType<typeof useStreamLogEntries>, exitEntry: ReturnType<typeof useStreamLogEntries>[number]): number | null {
  const isLong = exitEntry.side === "Long";
  const exitPricePct = isLong ? exitEntry.bidPct : exitEntry.askPct;
  if (exitPricePct == null) return null;

  let totalPnl = 0;
  let foundAny = false;
  const exitIdx = entries.indexOf(exitEntry);

  for (let i = exitIdx - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.ticker !== exitEntry.ticker) continue;
    if (e.event === "EXIT" || e.event === "EXIT_PRINT" || e.event === "CLOSE_ALL") break;
    if ((e.event === "ENTRY" || e.event === "ADD") && e.notionalUsd != null) {
      const entryPricePct = isLong ? e.askPct : e.bidPct;
      if (entryPricePct == null) continue;
      const entryFactor = 1 + entryPricePct / 100;
      const exitFactor = 1 + exitPricePct / 100;
      if (entryFactor <= 0 || exitFactor <= 0) continue;
      const returnFrac = isLong ? exitFactor / entryFactor - 1 : entryFactor / exitFactor - 1;
      totalPnl += e.notionalUsd * returnFrac;
      foundAny = true;
    }
  }

  return foundAny ? totalPnl : null;
}

export function StreamSimLog() {
  const entries = useStreamLogEntries();
  const reversed = useMemo(() => [...entries].reverse(), [entries]);

  function fmtDate(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }

  function buildDecisionContext(e: (typeof entries)[number]): string {
    return [
      `session=${e.session ?? "-"}`,
      `band=${e.ruleBand ?? "-"}`,
      `class=${e.signalClass ?? "-"}`,
      `mode=${e.ratingMode ?? "-"}`,
      `type=${e.ratingType ?? "-"}`,
    ].join(" | ");
  }

  function buildGateContext(e: (typeof entries)[number], tickPct: number | null, benchPct: number | null): string {
    return [
      `tick=${fmtPct(tickPct)}`,
      `bench=${fmtPct(benchPct)}`,
      `edge=${e.netEdge != null ? e.netEdge.toFixed(3) : "-"}`,
      `spread=${e.spread != null ? e.spread.toFixed(3) : "-"}`,
      `hold>=${e.minHoldMinutes != null ? `${e.minHoldMinutes}m` : "-"}`,
      `qualified=${e.qualifiedAtStr ?? "-"}`,
    ].join(" | ");
  }

  function buildScaleContext(e: (typeof entries)[number]): string {
    return [
      `seq=${e.sequence}`,
      `entryσ=${fmt2(e.entrySignal)}`,
      `add@=${fmt2(e.addThreshold)}`,
      `step=${fmt2(e.dilutionStep)}`,
      `max=${e.maxAdds ?? "-"}`,
    ].join(" | ");
  }

  function buildExecContext(e: (typeof entries)[number]): string {
    return [
      `exit=${e.exitMode}`,
      `hedge=${e.hedgeMode}`,
      `scale=${e.scaleMode}`,
      `usd=${e.notionalUsd != null ? e.notionalUsd.toFixed(0) : "-"}`,
      `beta=${e.betaMode ? "on" : "off"}`,
    ].join(" | ");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Simulation Log</span>
          <span className="text-[10px] font-mono text-zinc-600">{entries.length} entries</span>
        </div>
        <button
          type="button"
          onClick={() => downloadStreamLog(entries)}
          className="flex h-7 items-center gap-1.5 px-2.5 rounded-lg bg-black/20 text-[10px] font-mono text-zinc-400 uppercase hover:text-white hover:bg-white/5 transition-all border border-transparent"
        >
          ↓ CSV
        </button>
      </div>

      <style jsx global>{`
        .stream-log-table th, .stream-log-table td { padding: 3px 5px !important; }
      `}</style>
      <div className="scanner-panel-surface overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <table className="stream-log-table min-w-[2280px] w-full text-[10px] font-mono">
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/80 text-zinc-500 backdrop-blur-xl">
            <tr>
              <th className="text-left text-violet-400">Date</th>
              <th className="text-left">Time</th>
              <th className="text-left">Event</th>
              <th className="text-left">Ticker</th>
              <th className="text-left">Bench</th>
              <th className="text-left">Side</th>
              <th className="text-left text-cyan-300">DecisionCtx</th>
              <th className="text-right text-violet-400">σZap</th>
              <th className="text-right text-violet-300">ZAPL</th>
              <th className="text-right text-violet-300">ZAPS</th>
              <th className="text-right">Tick%</th>
              <th className="text-right">Bench%</th>
              <th className="text-right text-sky-400">Corr</th>
              <th className="text-right text-sky-400">Beta</th>
              <th className="text-right text-sky-300">σHist</th>
              <th className="text-right text-amber-400">Rating</th>
              <th className="text-right text-amber-300">Total</th>
              <th className="text-right">Hold</th>
              <th className="text-right">MinHold</th>
              <th className="text-left text-sky-300">GateCtx</th>
              <th className="text-left text-fuchsia-300">ScaleCtx</th>
              <th className="text-left text-emerald-300">ExecCtx</th>
              <th className="text-left">Filters</th>
              <th className="text-left">Reason</th>
              <th className="text-right text-emerald-400">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {reversed.map((e) => {
              const isBeta = e.betaMode;
              const isFailed = e.status === "FAILED";
              const isExit = e.event === "EXIT" || e.event === "EXIT_PRINT" || e.event === "CLOSE_ALL";
              const rowCls = clsx(
                "border-t border-white/[0.04] transition-colors hover:bg-white/[0.025]",
                isBeta && "opacity-80",
                isFailed && "opacity-40 line-through"
              );
              const tickPct = e.side === "Long" ? e.askPct : e.bidPct;
              const benchPct = e.side === "Long" ? e.benchAskPct : e.benchBidPct;
              const pnl = isExit ? computeStreamExitPnl(entries, e) : null;
              const decisionCtx = buildDecisionContext(e);
              const gateCtx = buildGateContext(e, tickPct, benchPct);
              const scaleCtx = buildScaleContext(e);
              const execCtx = buildExecContext(e);
              return (
                <tr key={e.seq} className={rowCls}>
                  <td className="text-zinc-600 whitespace-nowrap">{fmtDate(e.ts)}</td>
                  <td className="text-zinc-500 whitespace-nowrap">{e.timeStr}</td>
                  <td><SimEventBadge event={e.event} betaMode={isBeta} /></td>
                  <td className="text-zinc-100 font-semibold">{e.ticker}</td>
                  <td className="text-zinc-400">{e.benchmark}</td>
                  <td><SideBadge side={e.side} /></td>
                  <td className="text-cyan-200 max-w-[220px] truncate" title={decisionCtx}>{decisionCtx}</td>
                  <td className="text-right tabular-nums text-violet-300">{fmt2(e.sigmaZap)}</td>
                  <td className="text-right tabular-nums text-violet-200">{fmt2(e.zapLsigma)}</td>
                  <td className="text-right tabular-nums text-violet-200">{fmt2(e.zapSsigma)}</td>
                  <td className={clsx("text-right tabular-nums", tickPct != null && tickPct < 0 ? "text-rose-300" : "text-emerald-300")}>{fmtPct(tickPct)}</td>
                  <td className={clsx("text-right tabular-nums", benchPct != null && benchPct < 0 ? "text-rose-200" : "text-emerald-200")}>{fmtPct(benchPct)}</td>
                  <td className="text-right tabular-nums text-sky-300">{fmt2(e.corr)}</td>
                  <td className="text-right tabular-nums text-sky-300">{fmt2(e.beta)}</td>
                  <td className="text-right tabular-nums text-sky-200">{fmt2(e.stockSigma)}</td>
                  <td className="text-right tabular-nums text-amber-300">{e.rating != null ? e.rating.toFixed(1) : "—"}</td>
                  <td className="text-right tabular-nums text-amber-200">{e.ratingTotal ?? "—"}</td>
                  <td className="text-right tabular-nums text-zinc-400">{fmtMs(e.holdMs)}</td>
                  <td className="text-right tabular-nums text-zinc-500">{e.minHoldMinutes != null ? `${e.minHoldMinutes}m` : "—"}</td>
                  <td className="text-sky-200 max-w-[220px] truncate" title={gateCtx}>{gateCtx}</td>
                  <td className="text-fuchsia-200 max-w-[220px] truncate" title={scaleCtx}>{scaleCtx}</td>
                  <td className="text-emerald-200 max-w-[220px] truncate" title={execCtx}>{execCtx}</td>
                  <td className="text-zinc-500 max-w-[160px] truncate">{e.filtersOk || "—"}</td>
                  <td className="text-zinc-500 max-w-[180px] truncate">{e.reason}</td>
                  <td className={clsx(
                    "px-2.5 py-1.5 text-right tabular-nums font-semibold",
                    pnl != null && pnl > 0 ? "text-emerald-300" : pnl != null && pnl < 0 ? "text-rose-300" : "text-zinc-600"
                  )}>
                    {pnl != null ? (pnl >= 0 ? "+" : "") + pnl.toFixed(0) : "—"}
                  </td>
                </tr>
              );
            })}
            {!entries.length && (
              <tr>
                <td colSpan={25} className="px-4 py-10 text-center text-zinc-600">
                  No entries yet. Enable AUTO (or BETA mode) and let STREAM run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ArbitrageStreamView({
  tab,
  streamSignalsCount,
  streamAutoEnabled,
  streamSessionStartedAt,
  streamSessionStoppedAt,
  streamSentOrdersCount,
  onSetAutoEnabled,
  manualExecutionBusy,
  onSubmitManualOrders,
  onCaptureTickerPoint,
  onCaptureTickerPointDelayed,
  onClearTickerPoint,
  onTogglePanicOff,
  onStartAutomation,
  onClearExecutionQueue,
  onResetAutomationState,
  onDismissActivePositions,
  onForceRefresh,
  listModeLabel,
  automationConfig,
  onAutomationConfigChange,
  accentActiveSoftClass,
  accentActiveTextClass,
  viewMode = "stream",
  automationLaunchEnabled = true,
  entryCutoffActive = true,
  hideAutomationButtons = false,
}: ArbitrageStreamViewProps) {
  const [manualTickers, setManualTickers] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [automationStartLocked, setAutomationStartLocked] = useState(false);
  const streamUpdatedAt = useStreamUpdatedAt();
  const updatedLabel = streamUpdatedAt ? new Date(streamUpdatedAt).toLocaleTimeString("en-US", { hour12: false }) : null;
  const streamActionLog = useStreamActionLogRows();
  const streamOrderIntents = useStreamOrderIntentRows();
  const streamOrderIntentMeta = useStreamOrderIntentMeta();
  const executionSnapshot = useStreamExecutionSnapshot();
  const streamPositions = useStreamPositionRows();
  const activeDecisionRows = useStreamActiveDecisionRows();
  const streamPositionMeta = useStreamPositionMeta();
  const bookSnapshotState = useStreamBookSnapshotState();
  const mainWindowSnapshotState = useStreamMainWindowSnapshotState();
  const bookSnapshot = bookSnapshotState.snapshot;
  const mainWindowSnapshot = mainWindowSnapshotState.snapshot;
  const queuedIntentsCount = streamOrderIntentMeta.queuedCount;
  const boundWindow = executionSnapshot?.boundWindow ?? null;
  const executionQueueCount = executionSnapshot?.queue?.length ?? 0;
  const executionCurrent = executionSnapshot?.current ?? null;
  const panicOff = executionSnapshot?.panicOff ?? false;
  const tickerPoint = boundWindow?.tickerPoint ?? null;
  const delayRangeLabel = automationConfig.queueDelayMinSeconds > 0 || automationConfig.queueDelayMaxSeconds > 0
    ? `${num(automationConfig.queueDelayMinSeconds, 0)}-${num(automationConfig.queueDelayMaxSeconds, 0)}s`
    : "OFF";
  const bestBid = bookSnapshot?.bestBid ?? null;
  const bestAsk = bookSnapshot?.bestAsk ?? null;
  const bookSpread = bestBid != null && bestAsk != null ? Math.max(0, bestAsk - bestBid) : null;
  const topBid = bookSnapshot?.bidLevels?.[0] ?? null;
  const topAsk = bookSnapshot?.askLevels?.[0] ?? null;
  const strategyModeEnabled = automationConfig.strategyModeEnabled;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startCutoffMinutes = timeToMinutes(automationConfig.startCutoffTime, 9 * 60 + 20);
  const entryWindowClosed = entryCutoffActive && nowMinutes >= startCutoffMinutes;
  const isAutoView = viewMode === "auto";
  const isStreamAutoTab = viewMode === "stream-auto-tab";
  const showAutomationWorkspace = isAutoView || (isStreamAutoTab && (tab === "analytics" || tab === "episodes"));
  const automationRunning = streamAutoEnabled && strategyModeEnabled && !panicOff;
  const automationControlAllowed = automationLaunchEnabled && showAutomationWorkspace;
  const streamDecisionIds = useStreamDecisionIds();
  const streamDecisionVersion = useStreamDecisionVersion();
  const streamDecisionRowsSnapshot = useMemo(
    () => streamDecisionIds
      .map((id) => getStreamDecisionRow(id))
      .filter((row): row is NonNullable<typeof row> => row !== null),
    [streamDecisionIds, streamDecisionVersion]
  );
  const activeTickers = useMemo(
    () => new Set(activeDecisionRows.map((row) => row.ticker)),
    [activeDecisionRows]
  );
  const signalDecisionIds = useMemo(
    () => streamDecisionIds.filter((id) => !activeTickers.has(id)),
    [activeTickers, streamDecisionIds]
  );
  const entryReadyCount = useMemo(
    () => signalDecisionIds.reduce((count, id) => {
      return getStreamDecisionRow(id)?.status === "ENTRY_READY" ? count + 1 : count;
    }, 0),
    [streamDecisionVersion, signalDecisionIds]
  );
  const openCount = streamPositionMeta.openCount;
  const maxOpenPositions = Math.max(1, automationConfig.maxOpenPositions ?? 1);
  const openCapReached = openCount >= maxOpenPositions;
  const entryCapBlockingNewOrders =
    automationRunning &&
    openCapReached &&
    entryReadyCount > 0 &&
    queuedIntentsCount === 0;
  const exitBlockedCount = streamPositionMeta.exitBlockedCount;
  const closedCount = streamPositionMeta.closedCount;
  const blockedEdgeCount = useMemo(
    () => signalDecisionIds.reduce((count, id) => {
      return getStreamDecisionRow(id)?.status === "BLOCKED_EDGE" ? count + 1 : count;
    }, 0),
    [streamDecisionVersion, signalDecisionIds]
  );
  const runtimeLabel = useMemo(
    () => formatRuntime(streamSessionStartedAt, streamSessionStoppedAt),
    [streamSessionStartedAt, streamSessionStoppedAt, updatedLabel]
  );

  const setAutomationRunning = async (nextRunning: boolean) => {
    if (!automationControlAllowed) return;
    if (automationStartLocked && nextRunning) return;
    if (nextRunning === automationRunning) return;

    if (!nextRunning) {
      try {
        await onTogglePanicOff(true);
      } finally {
        try {
          await onClearExecutionQueue();
        } catch {
          // queue cleanup is best-effort; local stop still must happen
        }
        if (strategyModeEnabled) {
          onAutomationConfigChange({ strategyModeEnabled: false });
        }
        if (streamAutoEnabled) {
          onSetAutoEnabled(false);
        }
        onResetAutomationState();
      }
      return;
    }

    onResetAutomationState();
    if (onStartAutomation) {
      await onStartAutomation();
    } else {
      await onTogglePanicOff(false);
    }
    if (!strategyModeEnabled) {
      onAutomationConfigChange({ strategyModeEnabled: true });
    }
    if (!streamAutoEnabled) {
      onSetAutoEnabled(true);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await onForceRefresh();
  };

  const toggleAutomationRun = async () => {
    await setAutomationRunning(!automationRunning);
  };

  const submitManual = async (action: StreamManualOrderAction) => {
    try {
      setManualError(null);
      await onSubmitManualOrders(manualTickers, action);
    } catch (error: any) {
      setManualError(error?.message ?? String(error));
    }
  };

  if (tab === "analytics" || (isStreamAutoTab && tab === "episodes")) {
    if (showAutomationWorkspace) {
      return (
        <div className="space-y-3">
          {!hideAutomationButtons && (
            <div className="flex items-center gap-2">
              {automationControlAllowed ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAutomationStartLocked((prev) => !prev)}
                    className={STREAM_ICON_BUTTON}
                    title={automationStartLocked ? "Unlock auto start" : "Lock auto start"}
                    aria-label={automationStartLocked ? "Unlock auto start" : "Lock auto start"}
                  >
                    <LockToggleIcon
                      open={automationStartLocked}
                      className="text-zinc-300 group-hover:text-white transition-colors"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleAutomationRun()}
                    disabled={automationStartLocked && !automationRunning}
                    className={clsx(
                      "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                      automationRunning
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                        : accentActiveSoftClass,
                      automationStartLocked && !automationRunning && "cursor-not-allowed opacity-40"
                    )}
                  >
                    {automationRunning ? "STOP AUTO" : automationStartLocked ? "START LOCKED" : "START AUTO"}
                  </button>
                </>
              ) : (
                <span className="inline-flex h-7 items-center justify-center rounded-lg border border-white/10 px-3 text-[10px] font-mono font-bold uppercase text-zinc-500">
                  AUTO LOCKED
                </span>
              )}
            </div>
          )}
          {entryCapBlockingNewOrders ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.24em] text-amber-200">
                Entry Cap Reached
              </div>
              <div className="mt-1 text-[11px] font-mono text-amber-100/90">
                AUTO is running, but new entries are paused because open positions reached the limit:
                {" "}
                {intn(openCount)}/{intn(maxOpenPositions)}.
              </div>
            </div>
          ) : null}
          <MainWindowBookSplitCard
            mainWindowBound={executionSnapshot?.mainWindow ?? null}
            mainWindowSnapshot={mainWindowSnapshot}
            executionMessage={executionCurrent?.message}
            bookSnapshot={bookSnapshot}
          />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="ACTIVE SITUATIONS" value={intn(activeDecisionRows.length)} />
              <MetricCard label="ENTRY READY" value={intn(entryReadyCount)} valueClassName={accentActiveTextClass} />
              <MetricCard label="OPEN POSITIONS" value={intn(openCount)} />
              <MetricCard
                label="OPEN CAP"
                value={`${intn(openCount)}/${intn(maxOpenPositions)}`}
                valueClassName={openCapReached ? "text-amber-200" : "text-zinc-300"}
              />
              <MetricCard label="QUEUED ORDERS" value={intn(queuedIntentsCount)} valueClassName="text-sky-300" />
              <MetricCard label="LIST MODE" value={listModeLabel} />
              <MetricCard label="UPDATED" value={updatedLabel ?? "-"} />
              <MetricCard label="SENT ORDERS" value={intn(streamSentOrdersCount)} />
              <MetricCard label="RUN TIME" value={runtimeLabel} />
              <MetricCard label="AUTO MODE" value={automationRunning ? "ON" : "OFF"} valueClassName={automationRunning ? accentActiveTextClass : "text-zinc-400"} />
              <MetricCard label="BLOCKED EDGE" value={intn(blockedEdgeCount)} valueClassName="text-amber-200" />
              <MetricCard label="EXIT BLOCKED" value={intn(exitBlockedCount)} valueClassName="text-amber-200" />
              <MetricCard label="CLOSED" value={intn(closedCount)} />
            </div>
            <StreamActionLogTable rows={streamActionLog} />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <StreamDecisionTable
              title="ACTIVE"
              rows={activeDecisionRows}
              emptyMessage="No active STREAM situations yet."
              onDismissTicker={onDismissActivePositions ? (ticker) => onDismissActivePositions([ticker]) : undefined}
              onDismissAll={onDismissActivePositions && activeDecisionRows.length > 0 ? () => onDismissActivePositions(activeDecisionRows.map((r) => r.ticker)) : undefined}
            />
            <StreamSignalsDecisionTable
              title="SIGNALS"
              rowIds={signalDecisionIds}
              emptyMessage="No filtered signals waiting in STREAM."
            />
          </div>
          <StreamSimLog />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="FILTERED SIGNALS" value={intn(streamSignalsCount)} />
        <MetricCard label="LIST MODE" value={listModeLabel} />
        <MetricCard label="ENTRY READY" value={intn(entryReadyCount)} valueClassName={accentActiveTextClass} />
        <MetricCard label="QUEUED ORDERS" value={intn(queuedIntentsCount)} valueClassName="text-sky-300" />
        <MetricCard label="BEST ASK" value={num(bestAsk, 2)} valueClassName="text-rose-200" />
        <MetricCard label="BOOK SPREAD" value={num(bookSpread, 2)} valueClassName="text-sky-300" />
      </div>
    );
  }

  if (tab === "episodes" && !isStreamAutoTab) {
    if (isAutoView) {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="BEST BID" value={num(bestBid, 2)} valueClassName="text-emerald-300" />
            <MetricCard label="BEST ASK" value={num(bestAsk, 2)} valueClassName="text-rose-200" />
            <MetricCard label="BOOK SPREAD" value={num(bookSpread, 2)} valueClassName="text-sky-300" />
            <MetricCard label="TOP BID SIZE" value={intn(topBid?.size ?? null)} />
            <MetricCard label="TOP ASK SIZE" value={intn(topAsk?.size ?? null)} />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <BookLevelsCard label="BID LEVELS" levels={bookSnapshot?.bidLevels ?? []} accentClass="text-emerald-300" />
            <BookLevelsCard label="ASK LEVELS" levels={bookSnapshot?.askLevels ?? []} accentClass="text-rose-200" />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Book Snapshot</div>
            <div className="mt-2 text-[11px] font-mono text-zinc-400">
              {bookSnapshot?.windowTitle || "No Market Maker book window bound."}
            </div>
            <div className="mt-1 text-[11px] font-mono text-zinc-500">
              Captured {bookSnapshot?.capturedAtUtc ?? "-"}
            </div>
          </div>
        </div>
      );
    }

    return <StreamSimLog />;
  }

  return (
    <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label={isAutoView ? "ACTIVE SIGNALS" : "SONAR SIGNALS"} value={intn(streamSignalsCount)} />
          <MetricCard label="ENTRY READY" value={intn(entryReadyCount)} valueClassName={accentActiveTextClass} />
          <MetricCard label="OPEN POSITIONS" value={intn(openCount)} />
          <MetricCard label="AUTO MODE" value={streamAutoEnabled ? "ON" : "OFF"} valueClassName={streamAutoEnabled ? "text-emerald-300" : "text-zinc-400"} />
          <MetricCard label="BEST BID" value={num(bestBid, 2)} valueClassName="text-emerald-300" />
          <MetricCard label="BEST ASK" value={num(bestAsk, 2)} valueClassName="text-rose-200" />
      </div>

      <div className="scanner-panel-surface rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{isAutoView ? "AUTO ENGINE | SONAR automation workspace" : "STREAM ENGINE | filtered SONAR signals"}</div>
          {automationControlAllowed ? (
            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              <button
                type="button"
                onClick={() => void setAutomationRunning(!(strategyModeEnabled && streamAutoEnabled && !panicOff))}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  strategyModeEnabled ? accentActiveSoftClass : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                SONAR MODE {strategyModeEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => void setAutomationRunning(!(streamAutoEnabled && strategyModeEnabled && !panicOff))}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  streamAutoEnabled ? accentActiveSoftClass : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                AUTO {streamAutoEnabled ? "ON" : "OFF"}
              </button>
            </div>
          ) : (
            <div className="inline-flex h-7 items-center justify-center rounded-lg border border-white/10 px-3 text-[10px] font-mono font-bold uppercase text-zinc-500">
              AUTO PAGE ONLY
            </div>
          )}
        </div>
        <div className="mt-2 text-[11px] font-mono text-zinc-500">
          {strategyModeEnabled
            ? `SONAR mode watches live SONAR situations, enters after MINHOLD minutes, scales by STEP up to MAXADD, exits below ${num(automationConfig.endSignalThreshold, 2)} in ACTIVE, and cuts off (Ctrl+Q then Ctrl+O) at ${automationConfig.startCutoffTime}.`
            : "SONAR mode is off. AUTO keeps using the legacy STREAM intent builder."}
        </div>
        {isAutoView && (
          <div className="mt-3">
            <MainWindowBookSplitCard
              mainWindowBound={executionSnapshot?.mainWindow ?? null}
              mainWindowSnapshot={mainWindowSnapshot}
              executionMessage={executionCurrent?.message}
              bookSnapshot={bookSnapshot}
            />
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Target Window</div>
                <div className={clsx("mt-1 text-sm font-mono", boundWindow?.isBound ? "text-emerald-300" : "text-amber-200")}>
                  {boundWindow?.isBound ? "DETECTED" : "NOT FOUND"}
                </div>
                <div className="mt-1 text-[11px] font-mono text-zinc-500 break-all">
                  {boundWindow?.title || executionCurrent?.message || "Waiting for Market Maker Window."}
                </div>
                <div className="mt-1 text-[11px] font-mono text-zinc-500">
                  {tickerPoint?.isSet
                    ? `Ticker Pt ${tickerPoint.relativeX}, ${tickerPoint.relativeY}`
                    : "Ticker point not captured | expected: Market Maker Window"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => void onCaptureTickerPointDelayed(3000)}
                  className={clsx("px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border", accentActiveSoftClass)}
                >
                  Capture 3s
                </button>
                <button
                  type="button"
                  onClick={() => void onCaptureTickerPoint()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                >
                  Capture Now
                </button>
                <button
                  type="button"
                  onClick={() => void onClearTickerPoint()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                >
                  Clear Pt
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Execution Queue</div>
            <div className="mt-1 text-sm font-mono text-zinc-200">{intn(executionQueueCount)}</div>
            <div className="mt-1 text-[11px] font-mono text-zinc-500">
              {executionCurrent
                ? `${executionCurrent.ticker} | ${executionCurrent.status}${executionCurrent.appliedDelayMs ? ` | ${num(executionCurrent.appliedDelayMs / 1000, 2)}s` : ""}`
                : `No active execution | delay ${delayRangeLabel}`}
            </div>
            {executionCurrent?.note && (
              <div className="mt-1 text-[10px] font-mono text-amber-300">
                {executionCurrent.note}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Live Book</div>
            <div className="mt-1 text-sm font-mono text-zinc-200">
              {bestBid != null || bestAsk != null ? `${num(bestBid, 2)} x ${num(bestAsk, 2)}` : "No book snapshot"}
            </div>
            <div className="mt-1 text-[11px] font-mono text-zinc-500">
              {topBid && topAsk
                ? `${intn(topBid.size)} ${topBid.exchange} | ${intn(topAsk.size)} ${topAsk.exchange}`
                : "Waiting for top-of-book"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Kill Switch</div>
                <div className={clsx("mt-1 text-sm font-mono", panicOff ? "text-rose-300" : "text-emerald-300")}>
                  {panicOff ? "PANIC OFF" : "ARMED"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onTogglePanicOff(!panicOff)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
                  panicOff ? "border-transparent text-zinc-400 hover:text-white hover:bg-white/5" : "border-rose-500/20 bg-rose-500/10 text-rose-300"
                )}
              >
                {panicOff ? "Resume" : "Panic Off"}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Manual Orders</div>
              <div className="mt-1 text-[11px] font-mono text-zinc-500">Enter one or more tickers separated by spaces.</div>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              Delay {delayRangeLabel}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center">
            <input
              type="text"
              value={manualTickers}
              onChange={(e) => setManualTickers(e.target.value.toUpperCase())}
              placeholder="AAPL NVDA TSLA"
              className="h-9 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-mono uppercase tracking-wide text-zinc-200 outline-none focus:border-white/20"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={manualExecutionBusy}
                onClick={() => void submitManual("buy")}
                className={clsx("px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border", accentActiveSoftClass, manualExecutionBusy && "opacity-60")}
              >
                Buy
              </button>
              <button
                type="button"
                disabled={manualExecutionBusy}
                onClick={() => void submitManual("sell")}
                className={clsx("px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5", manualExecutionBusy && "opacity-60")}
              >
                Sell
              </button>
              <button
                type="button"
                disabled={manualExecutionBusy}
                onClick={() => void submitManual("cover")}
                className={clsx("px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border border-transparent text-zinc-400 hover:text-white hover:bg-white/5", manualExecutionBusy && "opacity-60")}
              >
                Cover
              </button>
            </div>
          </div>
          <div className="mt-2 text-[11px] font-mono text-zinc-500">
            {manualExecutionBusy
              ? "Queueing manual orders..."
              : manualError || "BUY uses long entry, SELL uses short entry, COVER uses active exit for the entered tickers."}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Min Net Edge</div>
            <input
              type="number"
              min={0}
              step={0.01}
              value={automationConfig.minNetEdge}
              onChange={(e) => onAutomationConfigChange({ minNetEdge: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none focus:border-white/20"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Max Open</div>
            <input
              type="number"
              min={1}
              step={1}
              value={automationConfig.maxOpenPositions}
              onChange={(e) => onAutomationConfigChange({ maxOpenPositions: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none focus:border-white/20"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Delay Min Sec</div>
            <input
              type="number"
              min={0}
              step={1}
              value={automationConfig.queueDelayMinSeconds}
              onChange={(e) => onAutomationConfigChange({ queueDelayMinSeconds: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none focus:border-white/20"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Delay Max Sec</div>
            <input
              type="number"
              min={0}
              step={1}
              value={automationConfig.queueDelayMaxSeconds}
              onChange={(e) => onAutomationConfigChange({ queueDelayMaxSeconds: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none focus:border-white/20"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Blocked Edge</div>
            <div className="mt-1 text-sm font-mono text-rose-300">{intn(blockedEdgeCount)}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Hedge Mode</div>
            <select
              value={automationConfig.hedgeMode}
              onChange={(e) => onAutomationConfigChange({ hedgeMode: e.target.value as StreamAutomationConfig["hedgeMode"] })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            >
              <option value="hedged">Hedged</option>
              <option value="unhedged">Unhedged</option>
            </select>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Scale Mode</div>
            <select
              value={automationConfig.scaleMode}
              onChange={(e) => onAutomationConfigChange({ scaleMode: e.target.value as StreamAutomationConfig["scaleMode"] })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            >
              <option value="single">Single</option>
              <option value="scale_in">Scale In</option>
            </select>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Exit Mode</div>
            <select
              value={automationConfig.exitMode}
              onChange={(e) => onAutomationConfigChange({ exitMode: e.target.value as StreamAutomationConfig["exitMode"] })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            >
              <option value="normalize">Normalize</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Cutoff</div>
            {/* Read-only mirror of the CUTOFF stepper (toolbar DELAY/CUTOFF control) — that
                stepper is the single source of truth (drives local startCutoffTime state, which
                effectiveStreamAutomationConfig always uses regardless of any override). An
                editable field here would write to the override only, which the engine ignores. */}
            <div className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 flex items-center text-sm font-mono text-zinc-200">
              {automationConfig.startCutoffTime}
            </div>
          </div>
          <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">No Spread Exit</div>
              <div className="mt-1 text-xs font-mono text-zinc-400">Block bad exits when spread is hostile</div>
            </div>
            <input
              type="checkbox"
              checked={automationConfig.noSpreadExit}
              onChange={(e) => onAutomationConfigChange({ noSpreadExit: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-black/30"
            />
          </label>

          {tab === "episodes" && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-amber-400">β BETA MODE</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">LOCKED ON</span>
                </div>
                <div className="mt-1 text-xs font-mono text-zinc-400">SIMULATOR always simulates — no real orders sent.</div>
              </div>
              <input type="checkbox" checked disabled className="h-4 w-4 rounded border-amber-500/40 bg-black/30 accent-amber-500 cursor-not-allowed opacity-60" />
            </div>
          )}
        </div>
      </div>

      <div className="scanner-panel-surface overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <table className="min-w-[1280px] w-full text-xs font-mono">
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
            <tr>
              <th className="text-left p-2.5">Ticker</th>
              <th className="text-left p-2.5">Bench</th>
              <th className="text-left p-2.5">Side</th>
              <th className="text-right p-2.5">Signal</th>
              <th className="text-right p-2.5">Spread</th>
              <th className="text-right p-2.5">Safe Px</th>
              <th className="text-right p-2.5">Net Edge</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {streamDecisionRowsSnapshot.map((row, i) => (
              <tr key={`${row.ticker}|stream|${i}`} className={clsx("border-t border-white/5 transition-colors", i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent", "hover:bg-white/[0.03]")}>
                <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
                <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
                <td className="p-2.5"><SideBadge side={row.side} /></td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.spreadBidPct, 3)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.safePrice, 3)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</td>
                <td className="p-2.5"><StreamStatusBadge status={row.status} /></td>
                <td className="p-2.5 text-zinc-400">{row.reason}</td>
              </tr>
            ))}
            {!streamDecisionRowsSnapshot.length && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-zinc-500">
                  No STREAM candidates yet. Current STREAM filters are applied to live SONAR signals.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="scanner-panel-surface overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <table className="min-w-[1280px] w-full text-xs font-mono">
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
            <tr>
              <th className="text-left p-2.5">Ticker</th>
              <th className="text-left p-2.5">Bench</th>
              <th className="text-left p-2.5">Side</th>
              <th className="text-left p-2.5">Intent</th>
              <th className="text-left p-2.5">Price Ref</th>
              <th className="text-left p-2.5">Queue</th>
              <th className="text-left p-2.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {streamOrderIntents.map((row, i) => (
              <tr key={row.id ?? `${row.ticker}|intent|${i}`} className={clsx("border-t border-white/5 transition-colors", i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent", "hover:bg-white/[0.03]")}>
                <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
                <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
                <td className="p-2.5"><SideBadge side={row.side} /></td>
                <td className="p-2.5 text-zinc-200">{row.intent}</td>
                <td className="p-2.5 text-zinc-300">{row.priceRef}</td>
                <td className="p-2.5">
                  <span className={clsx(
                    "inline-flex rounded-md px-2 py-1 text-[10px] font-mono font-bold uppercase border",
                    row.status === "QUEUED"
                      ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                      : "border-rose-500/20 bg-rose-500/10 text-rose-300"
                  )}>
                    {row.status}
                  </span>
                </td>
                <td className="p-2.5 text-zinc-400">{row.reason}</td>
              </tr>
            ))}
            {!streamOrderIntents.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  No order intents yet. When AUTO is enabled, STREAM will stage executable intents here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
