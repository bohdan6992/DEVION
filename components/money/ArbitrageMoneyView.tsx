"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import type {
  MoneyActionLogEntry,
  MainWindowDataSnapshot,
  MarketMakerBookSnapshot,
  MoneyAutomationConfig,
  MoneyDecisionRow,
  MoneyManualOrderAction,
  MoneyOrderIntent,
  MoneyPosition,
  TradingAppExecutionSnapshot,
} from "./moneyEngine";

type MoneyTabKey = "active" | "episodes" | "analytics";
type MoneyViewMode = "money" | "auto" | "money-auto-tab";

type ArbitrageMoneyViewProps = {
  tab: MoneyTabKey;
  moneySignalsCount: number;
  moneyDecisions: MoneyDecisionRow[];
  moneyPositions: MoneyPosition[];
  moneyActionLog: MoneyActionLogEntry[];
  moneyOrderIntents: MoneyOrderIntent[];
  moneyAutoEnabled: boolean;
  moneySessionStartedAt: number | null;
  moneySessionStoppedAt: number | null;
  moneySentOrdersCount: number;
  onSetAutoEnabled: (enabled: boolean) => void;
  executionSnapshot: TradingAppExecutionSnapshot | null;
  bookSnapshot: MarketMakerBookSnapshot | null;
  mainWindowSnapshot: MainWindowDataSnapshot | null;
  manualExecutionBusy: boolean;
  onSubmitManualOrders: (tickersText: string, action: MoneyManualOrderAction) => Promise<void>;
  onCaptureTickerPoint: () => Promise<void>;
  onCaptureTickerPointDelayed: (delayMs?: number) => Promise<void>;
  onClearTickerPoint: () => Promise<void>;
  onTogglePanicOff: (enabled: boolean) => Promise<void>;
  onClearExecutionQueue: () => Promise<void>;
  onResetAutomationState: () => void;
  onForceRefresh: () => Promise<void>;
  updatedLabel: string | null;
  listModeLabel: string;
  automationConfig: MoneyAutomationConfig;
  onAutomationConfigChange: (patch: Partial<MoneyAutomationConfig>) => void;
  accentActiveSoftClass: string;
  accentActiveTextClass: string;
  viewMode?: MoneyViewMode;
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
const MONEY_BID_MINT = "#7ef7d4";
const MONEY_BID_MINT_SOFT = "rgba(126, 247, 212, 0.10)";
const MONEY_BID_MINT_PANEL = "rgba(126, 247, 212, 0.04)";
const MONEY_READY_GREEN = "#63e6be";
const MONEY_READY_GREEN_SOFT = "rgba(99, 230, 190, 0.12)";
const MONEY_READY_GREEN_BORDER = "rgba(99, 230, 190, 0.22)";
const MONEY_ALERT_RED = "#f38ba8";
const MONEY_ALERT_RED_SOFT = "rgba(243, 139, 168, 0.12)";
const MONEY_ALERT_RED_BORDER = "rgba(243, 139, 168, 0.24)";

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
    const sorted = MAIN_WINDOW_FIELD_ORDER.map((label) => {
      const matchIndex = canonicalFields.findIndex((field, index) => !used.has(index) && normalizeMainWindowFieldKey(field.heading) === normalizeMainWindowFieldKey(label));
      if (matchIndex < 0) return null;
      used.add(matchIndex);
      return canonicalFields[matchIndex];
    }).filter((field): field is NonNullable<typeof field> => field !== null);
    const remainder = canonicalFields.filter((_, index) => !used.has(index));
    return [...sorted, ...remainder];
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
                style={{
                  color: control.state === "RED" ? MONEY_ALERT_RED : MONEY_READY_GREEN,
                  border: `1px solid ${control.state === "RED" ? MONEY_ALERT_RED_BORDER : MONEY_READY_GREEN_BORDER}`,
                  backgroundColor: control.state === "RED" ? MONEY_ALERT_RED_SOFT : MONEY_READY_GREEN_SOFT,
                }}
              >
                {control.label}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          {orderedFields.length ? (
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {orderedFields.map((field, index) => (
                <div
                  key={`${field.heading}|${field.value}|${index}`}
                  className={clsx(
                    "flex items-center justify-between gap-3 border-b border-white/5 py-1.5 font-mono",
                    index % 2 === 0 ? "text-zinc-200" : "text-zinc-300",
                  )}
                >
                  <div className="truncate text-[11px] leading-none text-emerald-300">{field.heading || "-"}</div>
                  <div className="shrink-0 text-right text-[14px] leading-none text-zinc-100">{field.value || "0"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[11px] font-mono text-zinc-500">
              {executionMessage || "No main window data captured yet."}
            </div>
          )}
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
              style={{ borderBottom: `1px solid ${MONEY_BID_MINT_SOFT}` }}
            >
              <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: MONEY_BID_MINT }}>Bids</div>
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
                  <div className="text-[11px] font-mono text-right" style={{ color: MONEY_BID_MINT }}>{num(bid?.price ?? null, 2)}</div>
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

function MoneyDecisionTable({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: Array<{
    ticker: string;
    benchmark: string;
    side: "Long" | "Short";
    signal: number | null;
    spread: number | null;
    netEdge: number | null;
    status: MoneyDecisionRow["status"] | MoneyPosition["status"];
  }>;
  emptyMessage: string;
}) {
  return (
    <div className="scanner-panel-surface overflow-auto rounded-xl bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-3 bg-[#0a0a0a]/40 px-3 py-2 backdrop-blur-xl">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-500">
          {title}
        </div>
        <div className="text-[10px] font-mono uppercase text-zinc-500">
          {intn(rows.length)}
        </div>
      </div>
      <table className="min-w-[880px] w-full text-xs font-mono">
        <thead className="sticky top-0 z-10 bg-[#0a0a0a]/55 text-zinc-300 backdrop-blur-xl">
          <tr>
            <th className="text-left p-2.5">Ticker</th>
            <th className="text-left p-2.5">Bench</th>
            <th className="text-left p-2.5">Side</th>
            <th className="text-right p-2.5">Signal</th>
            <th className="text-right p-2.5">Spread</th>
            <th className="text-right p-2.5">Net Edge</th>
            <th className="text-left p-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${title}|${row.ticker}|${i}`}
              className={clsx(
                "transition-colors",
                i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                "hover:bg-white/[0.03]"
              )}
            >
              <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
              <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
              <td className="p-2.5"><SideBadge side={row.side} /></td>
              <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</td>
              <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.spread, 3)}</td>
              <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</td>
              <td className="p-2.5"><MoneyStatusBadge status={row.status} /></td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-zinc-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MoneyActionLogTable({ rows }: { rows: MoneyActionLogEntry[] }) {
  return (
    <div className="scanner-panel-surface flex h-[284px] flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-4 px-3 py-3">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-500">
            Log
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-mono uppercase text-zinc-400">
          {intn(rows.length)} rows
        </div>
      </div>
      <div className="border-t border-white/[0.06]" />
      <div className="flex-1 overflow-y-auto overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table className="min-w-[880px] w-full text-xs font-mono">
        <thead className="sticky top-0 z-10 bg-[#0a0a0a]/45 text-zinc-300 backdrop-blur-xl">
          <tr>
            <th className="text-left p-2.5">Time</th>
            <th className="text-left p-2.5">Ticker</th>
            <th className="text-left p-2.5">Bench</th>
            <th className="text-left p-2.5">Side</th>
            <th className="text-left p-2.5">Action</th>
            <th className="text-right p-2.5">Deviation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className={clsx(
                "transition-colors",
                i % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent",
                "hover:bg-white/[0.03]"
              )}
            >
              <td className="p-2.5 text-zinc-400">{formatActionLogTime(row.at)}</td>
              <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
              <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
              <td className="p-2.5"><SideBadge side={row.side} /></td>
              <td className="p-2.5">
                <span className={clsx(
                  "inline-flex rounded-md px-2 py-1 text-[10px] font-mono font-bold uppercase border",
                  row.kind === "CLOSE"
                    ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                    : row.kind === "ADD"
                      ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                )}>
                  {row.kind}
                </span>
              </td>
              <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.deviation, 2)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-zinc-500">
                No MONEY actions recorded for today yet.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}

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

function MoneyStatusBadge({ status }: { status: MoneyDecisionRow["status"] | MoneyPosition["status"] }) {
  const isGreenStatus = status === "ENTRY_READY" || status === "OPEN";
  const className =
    isGreenStatus
      ? ""
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
        color: MONEY_READY_GREEN,
        backgroundColor: MONEY_READY_GREEN_SOFT,
        borderColor: MONEY_READY_GREEN_BORDER,
      } : undefined}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

const MONEY_ICON_BUTTON =
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

export default function ArbitrageMoneyView({
  tab,
  moneySignalsCount,
  moneyDecisions,
  moneyPositions,
  moneyActionLog,
  moneyOrderIntents,
  moneyAutoEnabled,
  moneySessionStartedAt,
  moneySessionStoppedAt,
  moneySentOrdersCount,
  onSetAutoEnabled,
  executionSnapshot,
  bookSnapshot,
  mainWindowSnapshot,
  manualExecutionBusy,
  onSubmitManualOrders,
  onCaptureTickerPoint,
  onCaptureTickerPointDelayed,
  onClearTickerPoint,
  onTogglePanicOff,
  onClearExecutionQueue,
  onResetAutomationState,
  onForceRefresh,
  updatedLabel,
  listModeLabel,
  automationConfig,
  onAutomationConfigChange,
  accentActiveSoftClass,
  accentActiveTextClass,
  viewMode = "money",
  automationLaunchEnabled = true,
  entryCutoffActive = true,
  hideAutomationButtons = false,
}: ArbitrageMoneyViewProps) {
  const [manualTickers, setManualTickers] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [automationStartLocked, setAutomationStartLocked] = useState(false);
  const queuedIntentsCount = moneyOrderIntents.filter((x) => x.status === "QUEUED").length;
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
  const printStartMinutes = timeToMinutes(automationConfig.printStartTime, 9 * 60 + 20);
  const entryWindowClosed = entryCutoffActive && nowMinutes >= printStartMinutes;
  const isAutoView = viewMode === "auto";
  const isMoneyAutoTab = viewMode === "money-auto-tab";
  const showAutomationWorkspace = isAutoView || (isMoneyAutoTab && tab === "analytics");
  const automationRunning = moneyAutoEnabled && strategyModeEnabled && !panicOff;
  const automationControlAllowed = automationLaunchEnabled && showAutomationWorkspace;
  const decisionByTicker = new Map(moneyDecisions.map((row) => [row.ticker, row]));
  const activeDecisionRows = (() => {
    const rows = new Map<string, {
      ticker: string;
      benchmark: string;
      side: "Long" | "Short";
      signal: number | null;
      spread: number | null;
      netEdge: number | null;
      status: MoneyDecisionRow["status"] | MoneyPosition["status"];
    }>();

    for (const position of moneyPositions) {
      if (position.status === "CLOSED") continue;
      const isPendingUnsentEntry =
        position.entryDispatchedAt == null &&
        position.lastConfirmedActiveAt == null &&
        (position.pendingIntent === "ENTER_LONG_AGGRESSIVE" || position.pendingIntent === "ENTER_SHORT_AGGRESSIVE");
      if (isPendingUnsentEntry) continue;
      const decision = decisionByTicker.get(position.ticker);
      const signal = decision?.signal ?? position.lastSignal ?? position.entrySignal;
      const spread = decision?.spread ?? position.spread;
      const netEdge = decision?.netEdge ?? (signal != null ? Math.max(0, Math.abs(signal) - Math.max(0, spread ?? 0)) : null);
      rows.set(position.ticker, {
        ticker: position.ticker,
        benchmark: decision?.benchmark ?? position.benchmark,
        side: decision?.side ?? position.side,
        signal,
        spread,
        netEdge,
        status: position.status,
      });
    }

    return Array.from(rows.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
  })();
  const activeTickers = new Set(activeDecisionRows.map((row) => row.ticker));
  const signalDecisionRows = moneyDecisions.filter((row) => !activeTickers.has(row.ticker));
  const entryReadyCount = signalDecisionRows.filter((x) => x.status === "ENTRY_READY").length;
  const openCount = moneyPositions.filter((x) =>
    x.status === "OPEN" &&
    (
      x.entryDispatchedAt != null ||
      x.lastConfirmedActiveAt != null ||
      (x.pendingIntent !== "ENTER_LONG_AGGRESSIVE" && x.pendingIntent !== "ENTER_SHORT_AGGRESSIVE")
    )
  ).length;
  const exitBlockedCount = moneyPositions.filter((x) => x.status === "EXIT_BLOCKED").length;
  const closedCount = moneyPositions.filter((x) => x.status === "CLOSED").length;
  const blockedEdgeCount = signalDecisionRows.filter((x) => x.status === "BLOCKED_EDGE").length;
  const runtimeLabel = useMemo(
    () => formatRuntime(moneySessionStartedAt, moneySessionStoppedAt),
    [moneySessionStartedAt, moneySessionStoppedAt, updatedLabel]
  );

  const toggleAutomationRun = async () => {
    if (!automationControlAllowed) return;
    if (automationStartLocked) return;
    if (automationRunning) {
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
        if (moneyAutoEnabled) {
          onSetAutoEnabled(false);
        }
        onResetAutomationState();
      }
      return;
    }

    onResetAutomationState();
    await onTogglePanicOff(false);
    if (!strategyModeEnabled) {
      onAutomationConfigChange({ strategyModeEnabled: true });
    }
    if (!moneyAutoEnabled) {
      onSetAutoEnabled(true);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await onForceRefresh();
  };

  const submitManual = async (action: MoneyManualOrderAction) => {
    try {
      setManualError(null);
      await onSubmitManualOrders(manualTickers, action);
    } catch (error: any) {
      setManualError(error?.message ?? String(error));
    }
  };

  if (tab === "analytics") {
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
                    className={MONEY_ICON_BUTTON}
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
              <MetricCard label="QUEUED ORDERS" value={intn(queuedIntentsCount)} valueClassName="text-sky-300" />
              <MetricCard label="LIST MODE" value={listModeLabel} />
              <MetricCard label="UPDATED" value={updatedLabel ?? "-"} />
              <MetricCard label="SENT ORDERS" value={intn(moneySentOrdersCount)} />
              <MetricCard label="RUN TIME" value={runtimeLabel} />
              <MetricCard label="AUTO MODE" value={automationRunning ? "ON" : "OFF"} valueClassName={automationRunning ? accentActiveTextClass : "text-zinc-400"} />
              <MetricCard label="BLOCKED EDGE" value={intn(blockedEdgeCount)} valueClassName="text-amber-200" />
              <MetricCard label="EXIT BLOCKED" value={intn(exitBlockedCount)} valueClassName="text-amber-200" />
              <MetricCard label="CLOSED" value={intn(closedCount)} />
            </div>
            <MoneyActionLogTable rows={moneyActionLog} />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <MoneyDecisionTable
              title="ACTIVE"
              rows={activeDecisionRows}
              emptyMessage="No active MONEY situations yet."
            />
            <MoneyDecisionTable
              title="SIGNALS"
              rows={signalDecisionRows}
              emptyMessage="No filtered signals waiting in MONEY."
            />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="FILTERED SIGNALS" value={intn(moneySignalsCount)} />
        <MetricCard label="LIST MODE" value={listModeLabel} />
        <MetricCard label="ENTRY READY" value={intn(entryReadyCount)} valueClassName={accentActiveTextClass} />
        <MetricCard label="QUEUED ORDERS" value={intn(queuedIntentsCount)} valueClassName="text-sky-300" />
        <MetricCard label="BEST ASK" value={num(bestAsk, 2)} valueClassName="text-rose-200" />
        <MetricCard label="BOOK SPREAD" value={num(bookSpread, 2)} valueClassName="text-sky-300" />
      </div>
    );
  }

  if (tab === "episodes") {
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

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="OPEN" value={intn(openCount)} />
          <MetricCard label="EXIT BLOCKED" value={intn(exitBlockedCount)} valueClassName="text-amber-200" />
          <MetricCard label="CLOSED" value={intn(closedCount)} />
          <MetricCard label="BEST BID" value={num(bestBid, 2)} valueClassName="text-emerald-300" />
        </div>
        <div className="scanner-panel-surface overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <table className="min-w-[1120px] w-full text-xs font-mono">
            <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/55 text-zinc-400 backdrop-blur-xl">
              <tr>
                <th className="text-left p-2.5">Ticker</th>
                <th className="text-left p-2.5">Bench</th>
                <th className="text-left p-2.5">Side</th>
                <th className="text-right p-2.5">Entry Sig</th>
                <th className="text-right p-2.5">Last Sig</th>
                <th className="text-right p-2.5">Spread</th>
                <th className="text-left p-2.5">Status</th>
                <th className="text-left p-2.5">Reason</th>
              </tr>
            </thead>
            <tbody>
              {moneyPositions.map((row, i) => (
                <tr key={`${row.ticker}|position|${i}`} className={clsx("border-t border-white/5 transition-colors", i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent", "hover:bg-white/[0.03]")}>
                  <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
                  <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
                  <td className="p-2.5"><SideBadge side={row.side} /></td>
                  <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.entrySignal, 2)}</td>
                  <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.lastSignal, 2)}</td>
                  <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.spread, 3)}</td>
                  <td className="p-2.5"><MoneyStatusBadge status={row.status} /></td>
                  <td className="p-2.5 text-zinc-400">{row.reason}</td>
                </tr>
              ))}
              {!moneyPositions.length && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    No virtual positions yet. Enable AUTO and let MONEY monitor filtered SONAR signals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label={isAutoView ? "ACTIVE SIGNALS" : "SONAR SIGNALS"} value={intn(moneySignalsCount)} />
          <MetricCard label="ENTRY READY" value={intn(entryReadyCount)} valueClassName={accentActiveTextClass} />
          <MetricCard label="OPEN POSITIONS" value={intn(openCount)} />
          <MetricCard label="AUTO MODE" value={moneyAutoEnabled ? "ON" : "OFF"} valueClassName={moneyAutoEnabled ? "text-emerald-300" : "text-zinc-400"} />
          <MetricCard label="BEST BID" value={num(bestBid, 2)} valueClassName="text-emerald-300" />
          <MetricCard label="BEST ASK" value={num(bestAsk, 2)} valueClassName="text-rose-200" />
      </div>

      <div className="scanner-panel-surface rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{isAutoView ? "AUTO ENGINE | SONAR automation workspace" : "MONEY ENGINE | filtered SONAR signals"}</div>
          {automationControlAllowed ? (
            <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
              <button
                type="button"
                onClick={() => onAutomationConfigChange({ strategyModeEnabled: !strategyModeEnabled })}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  strategyModeEnabled ? accentActiveSoftClass : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                SONAR MODE {strategyModeEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => onSetAutoEnabled(!moneyAutoEnabled)}
                className={clsx(
                  "inline-flex h-7 items-center justify-center px-3 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
                  moneyAutoEnabled ? accentActiveSoftClass : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                AUTO {moneyAutoEnabled ? "ON" : "OFF"}
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
            ? `SONAR mode watches live SONAR situations, enters after MINHOLD seconds, scales by STEP up to MAXADD, exits below ${num(automationConfig.endSignalThreshold, 2)} in ACTIVE, and prints everything at ${automationConfig.printStartTime}.`
            : "SONAR mode is off. AUTO keeps using the legacy MONEY intent builder."}
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
              onChange={(e) => onAutomationConfigChange({ hedgeMode: e.target.value as MoneyAutomationConfig["hedgeMode"] })}
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
              onChange={(e) => onAutomationConfigChange({ scaleMode: e.target.value as MoneyAutomationConfig["scaleMode"] })}
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
              onChange={(e) => onAutomationConfigChange({ exitMode: e.target.value as MoneyAutomationConfig["exitMode"] })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            >
              <option value="normalize">Normalize</option>
              <option value="print">Print</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Print Start</div>
            <input
              type="time"
              value={automationConfig.printStartTime}
              onChange={(e) => onAutomationConfigChange({ printStartTime: e.target.value })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Print Close</div>
            <input
              type="time"
              value={automationConfig.printCloseTime}
              onChange={(e) => onAutomationConfigChange({ printCloseTime: e.target.value })}
              className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-mono text-zinc-200 outline-none"
            />
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
            {moneyDecisions.map((row, i) => (
              <tr key={`${row.ticker}|money|${i}`} className={clsx("border-t border-white/5 transition-colors", i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent", "hover:bg-white/[0.03]")}>
                <td className="p-2.5 text-zinc-100 font-semibold">{row.ticker}</td>
                <td className="p-2.5 text-zinc-400">{row.benchmark}</td>
                <td className="p-2.5"><SideBadge side={row.side} /></td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.signal, 2)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.spread, 3)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.safePrice, 3)}</td>
                <td className="p-2.5 text-right tabular-nums text-zinc-200">{num(row.netEdge, 3)}</td>
                <td className="p-2.5"><MoneyStatusBadge status={row.status} /></td>
                <td className="p-2.5 text-zinc-400">{row.reason}</td>
              </tr>
            ))}
            {!moneyDecisions.length && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-zinc-500">
                  No MONEY candidates yet. Current MONEY filters are applied to live SONAR signals.
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
            {moneyOrderIntents.map((row, i) => (
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
            {!moneyOrderIntents.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  No order intents yet. When AUTO is enabled, MONEY will stage executable intents here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
