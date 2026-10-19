import React from "react";
import clsx from "clsx";
import { GlassCard } from "../../shared/ui";
import { IDENTITY_YELLOW_HEX, SCANNER_CORAL_HEX, SCANNER_MINT_HEX } from "../../shared/styles";
import { clampInt, formatDilutionStepValue, formatScannerSizeValue, normalizeScannerSizeValue, stepDilutionStepValue, stepScannerSizeValue } from "../../../../lib/scanner/format";
import type { ScannerFilterBag } from "../../../../lib/scanner/filterState";
import type { PaperArbCloseMode, PaperArbDilutionMode, PaperArbPnlMode, PaperArbPriceMode, PaperArbSizingMode, TabKey } from "../../../../lib/scanner/types";
import type { StreamAutomationConfig } from "../../../stream/streamEngine";
import type { DirectionBalanceState } from "../../../../lib/arbitrage/directionBalanceClient";
import type { ScheduledStartStatus } from "../../../../lib/scanner/useScheduledStartArm";

/**
 * THESE FOUR GROUPS DESCRIBE THE BACKTEST'S ARITHMETIC, NOT THE LIVE ORDER.
 *
 * HEDGED/RAWONLY picks which P&L number a replayed row reports, PRINT/BIDASK which price it is
 * marked at, and USD/TIER + SIZE how much notional it assumed. The stream sends a TradingApp
 * HOTKEY: the order intent carries no price and no quantity at all (see streamEngine's intent
 * builder, where sizeValue reaches nothing but the log line), so the size actually traded is
 * whatever that hotkey is configured for inside TradingApp. Left visible because the same toolbar
 * drives the scanner, where every one of them is load-bearing — but said out loud here, because a
 * SIZE box on a live panel reads like an instruction.
 */
const BACKTEST_ONLY_TITLE =
  "Backtest only — the stream sends a TradingApp hotkey, which carries no price and no size. " +
  "The traded quantity comes from that hotkey's own configuration in TradingApp.";

/**
 * Arbitrage only (2026-10): PRINT/BIDASK stopped being backtest-only decoration there. It now also
 * picks which field the STREAM's own deviation is measured on (LstPrcLstCls vs bid/ask, both the
 * scanner's and the live gate's threshold) and which physical keys an entry sends — PRINT fires
 * plain F1/F2 (F3/F4 before 04:00 NY), no Ctrl; BIDASK keeps Ctrl+F1/F2. So on Arbitrage's own
 * stream shell this group must NOT dim with the rest of the backtest-only ones.
 */
const PRICE_MODE_LIVE_TITLE =
  "Live, not just backtest: PRINT measures the deviation off LstPrcLstCls and sends plain F1/F2 " +
  "(F3/F4 before 04:00 NY), no Ctrl. BIDASK measures bid/ask per side and sends Ctrl+F1/F2.";

const backtestOnlyGroupClass = (isStreamOnlyShell: boolean, extra?: string) =>
  clsx("flex h-7 items-center rounded-lg bg-black/20", extra, isStreamOnlyShell && "opacity-50");

/**
 * A two-option toggle pair (ACTIVE/PASSIVE, HEDGED/RAWONLY, PRINT/BIDASK, USD/TIER,
 * UNDILUTED/DILUTED): whichever side is active shows its full label and a fixed colour by
 * POSITION, not by identity — first option active = gold, second = silver, regardless of theme.
 * The inactive side collapses to its first two letters. Text colour is left alone (twotone-gold/
 * twotone-silver only touch background/border/shadow) — only the fill changes on toggle.
 */
function TwoTonePairButtons<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: readonly [{ key: T; label: string }, { key: T; label: string }];
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <>
      {options.map((m, i) => {
        const isActive = active === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            className={clsx(
              "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
              isActive
                ? i === 0
                  ? "twotone-gold"
                  : "twotone-silver"
                : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
            )}
          >
            {isActive ? m.label : m.label.slice(0, 2)}
          </button>
        );
      })}
    </>
  );
}

/**
 * The execution-settings card (the `order-2` row): sizing, dilution, close mode,
 * P&L and price mode, min hold, the stream start/cutoff steppers and the two log
 * downloads. Identical for every strategy.
 */
/**
 * The direction auto-balance switch (Arbitrage only). The bridge decides; this is the switch, the
 * trigger ratio, and the bridge's report of what it has done.
 */
export type DirectionBalanceControl = {
  enabled: boolean;
  /** Majority : minority BP that counts as skewed - 2 means twice the notional on one side. */
  ratio: number;
  onToggle: () => void;
  onRatio: (value: number) => void;
  /**
   * Absolute trigger in BP; 0 = off. When above 0 it replaces the ratio rule: any difference of at
   * least this much between the two sides is a skew (15 against 14 included), and the book counts as
   * balanced only once the difference is back under it. See DirectionBalanceSettings.MinGapBp.
   */
  minGapBp: number;
  onMinGapBp: (value: number) => void;
  /**
   * HEDGED mode: on a skew, send real QQQ orders (buy/sell) to close the BP gap directly instead of
   * lowering the starved side's entry threshold. Only matters while `enabled` is true, and only
   * takes effect at that episode's OWN trigger — flipping it mid-episode changes nothing until the
   * next one (see the bridge's own DirectionBalancer doc comment).
   */
  hedged: boolean;
  onToggleHedged: () => void;
  status: DirectionBalanceState | null;
};

/**
 * SAVE mode (Arbitrage only): the operator's own hourly maintenance switch on the bridge. See
 * SaveModeButton's own doc comment for the mechanism. Independent of BALANCE/HEDGED above — SAVE
 * never touches QQQ or a threshold, so there is nothing for the two switches to collide over.
 */
export type SaveModeControl = {
  enabled: boolean;
  onToggle: () => void;
};

export type ExecutionSettingsPanelProps = {
  /** What the bridge holds for this strategy's scheduled START; shown beside the START stepper. */
  scheduledStart?: ScheduledStartStatus | null;
  filters: ScannerFilterBag;
  tab: TabKey;
  isStreamOnlyShell: boolean;
  applyDilutionMode: (mode: PaperArbDilutionMode) => void;
  applyDilutionStep: (value: number) => void;
  applyMaxAdds: (value: number) => void;
  applyAddDelayMinutes: (value: number) => void;
  effectiveStreamAutomationConfig: StreamAutomationConfig;
  onStreamAutomationConfigChange?: (patch: Partial<StreamAutomationConfig>) => void;
  streamFilterPassLogCount: number;
  filteredEpisodes: unknown[];
  downloadEpisodesLog: () => void;
  downloadStreamFilterPassLog: () => void;
  /**
   * Arbitrage only: PRINT/BIDASK also drives the live stream (deviation field + entry keys), not
   * just the backtest, so its group must stay fully lit on the stream shell instead of dimming with
   * the other three (still backtest-only) pairs. False for every other strategy.
   */
  priceModeAffectsLive?: boolean;
  /**
   * PullBack only (for now): the glyph of the unit its threshold strip is currently set to - "%",
   * "σ", "α", "γ", "τ", "λ". PullBack's add STEP is scaled server-side by the same
   * per-ticker number as its entry floor, so "0.5" in this box means half a sigma, not half a
   * percentage point, and the box has to say which. Left undefined by every other strategy, whose
   * step is flat percentage points - then the control renders exactly as before.
   */
  dilutionStepUnitLabel?: string;
};

function BalanceRatioInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const [text, setText] = React.useState(String(value));

  React.useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n) && n >= 1.1) onChange(n);
  };
  const bump = (dir: 1 | -1) => {
    const next = Math.max(1.1, +((Number.isFinite(value) ? value : 2) + dir * 0.5).toFixed(2));
    setText(String(next));
    onChange(next);
  };

  return (
    <div className="group relative h-8 w-11 overflow-hidden rounded-md">
      <input
        type="number"
        inputMode="decimal"
        min={1.1}
        step={0.5}
        value={text}
        disabled={disabled}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onBlur={() => setText(String(value))}
        aria-label="Balance trigger ratio"
        className="center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99] disabled:opacity-40 accent-text"
      />
      <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(1)}
          className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          aria-label="Increase balance trigger ratio"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-1)}
          className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          aria-label="Decrease balance trigger ratio"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

/**
 * One HH:MM control: two spinner inputs (hour, minute) in a single h-7 pill, no caption - the
 * meaning lives in the pill's own title and the colour (START mint, ENTRY yellow, CUTOFF coral).
 * Same arrow-column pattern as every other spinner here (hover/focus only, flush right).
 */
function TimePill({
  title, ariaLabel, color, value, fallbackHour, onChange,
}: {
  title: string;
  ariaLabel: string;
  color: string;
  value: string;
  fallbackHour: string;
  onChange: (next: string) => void;
}) {
  const [hRaw, mRaw] = value.split(":");
  const h = hRaw ?? fallbackHour;
  const m = mRaw ?? "00";
  const setH = (n: number) => onChange(`${String(Math.max(0, Math.min(23, n))).padStart(2, "0")}:${m}`);
  const setM = (n: number) => onChange(`${h}:${String(Math.max(0, Math.min(59, n))).padStart(2, "0")}`);
  const inputClass = "center-spin w-full h-8 bg-transparent border-0 !pl-0.5 !pr-4 text-[10px] font-mono font-bold tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all";
  const arrowsClass = "absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity";
  const upClass = "flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors";
  const downClass = "flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors";
  const hNum = Number(h);
  const mNum = Number(m);

  return (
    <div className="flex h-7 items-center gap-0.5 pl-2 pr-0 rounded-lg bg-black/20" title={title}>
      <div className="group relative h-8 w-8 overflow-hidden rounded-md">
        <input
          type="number" inputMode="numeric" min={0} max={23} step={1}
          value={hNum}
          onChange={(e) => setH(clampInt(e.target.value, 0))}
          aria-label={`${ariaLabel} hour`}
          className={inputClass}
          style={{ color }}
        />
        <div className={arrowsClass}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setH(hNum + 1)} className={upClass} aria-label={`Increase ${ariaLabel} hour`}>▲</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setH(hNum - 1)} className={downClass} aria-label={`Decrease ${ariaLabel} hour`}>▼</button>
        </div>
      </div>
      <span className="text-[10px] font-mono text-zinc-500 select-none">:</span>
      <div className="group relative h-8 w-8 overflow-hidden rounded-md">
        <input
          type="number" inputMode="numeric" min={0} max={59} step={5}
          value={mNum}
          onChange={(e) => setM(clampInt(e.target.value, 0))}
          aria-label={`${ariaLabel} minute`}
          className={inputClass}
          style={{ color }}
        />
        <div className={arrowsClass}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setM(mNum + 5)} className={upClass} aria-label={`Increase ${ariaLabel} minute`}>▲</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setM(mNum - 5)} className={downClass} aria-label={`Decrease ${ariaLabel} minute`}>▼</button>
        </div>
      </div>
    </div>
  );
}

function BalanceGapInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const [text, setText] = React.useState(String(value));

  React.useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) onChange(n);
  };
  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, (Number.isFinite(value) ? value : 0) + dir * 500);
    setText(String(next));
    onChange(next);
  };

  return (
    <div className="group relative h-8 w-14 overflow-hidden rounded-md">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={500}
        value={text}
        disabled={disabled}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onBlur={() => setText(String(value))}
        aria-label="Balance minimum gap in BP"
        className="center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99] disabled:opacity-40 accent-text"
      />
      <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(1)}
          className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          aria-label="Increase balance minimum gap"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-1)}
          className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          aria-label="Decrease balance minimum gap"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

const fmtAdj = (v: number) => (v > 0 ? `−${(+v.toFixed(2)).toString()}` : "0");
const fmtBp = (v: number) => Math.round(v).toLocaleString("en-US");

function balanceTitle(status: DirectionBalanceState | null, hedged: boolean): string {
  const base = hedged
    ? "AUTO BALANCE — HEDGED. Every 10 minutes the bridge sums its own open positions' BPUsed by side (not a position count — a ticker scaled into several times weighs more than a single-shot one). If one side's BP holds at least 10,000 and outnumbers the other's by the trigger ratio, the bridge sends real QQQ orders — SELL when longs are the majority, BUY when shorts are — one order per 1,000 BP of the gap. The book is then re-checked EVERY MINUTE and the hedge is grown (never partially unwound) if the gap grows, until the smaller side reaches 90% of the larger one — then the whole hedge is unwound with the opposite order, the same count, and 10-minute trigger checks resume. Switching it off (or a new trading day) unwinds an open hedge the same way. An episode's mode is fixed at its own trigger; flipping this switch mid-episode only changes the NEXT one."
    : "AUTO BALANCE. Every 10 minutes the bridge sums its own open positions' BPUsed by side (not a position count — a ticker scaled into several times weighs more than a single-shot one). If one side's BP holds at least 10,000 and outnumbers the other's by the trigger ratio (e.g. 14,000 : 6,000 at ratio 2), the entry threshold of the SIDE THAT IS SHORT OF BP is lowered by 0.1 (in the current ZAP unit). From then on the book is re-checked EVERY MINUTE and the threshold keeps coming down by 0.1 (never below 0.2) until the smaller side has reached 90% of the larger one. Then both thresholds go back to the toolbar values and the 10-minute trigger checks resume. The toolbar thresholds themselves are never rewritten; switching it off takes every lowering away.";
  if (!status) return base;
  const next = status.nextCheckUtc ? new Date(status.nextCheckUtc).toLocaleTimeString() : "-";
  const phase = status.phase === "balancing" ? "BALANCING (checked every minute)" : "watching (trigger check every 10 min)";
  const action = status.hedgedEpisode
    ? `QQQ hedge: ${status.hedgeOrdersOut} order(s) open${status.hedgeSide ? ` (manufacturing ${status.hedgeSide})` : ""}.`
    : `Short threshold ${fmtAdj(status.shortAdjust)}, long threshold ${fmtAdj(status.longAdjust)}.`;
  return `${base}\n\nNow: ${phase}. ${action} Last check saw ${fmtBp(status.lastLongsBp)} long / ${fmtBp(status.lastShortsBp)} short BP: ${status.lastAction || "-"}${status.lastReason ? ` (${status.lastReason})` : ""}. Next check ${next}.`;
}

/** "in 3h 12m" / "in 42m" from an ISO instant; empty when it is not in the future. */
function untilLabel(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `in ${h}h ${String(m).padStart(2, "0")}m` : `in ${m}m`;
}

function scheduledStartTitle(status: ScheduledStartStatus | null | undefined): string {
  const base =
    "SCHEDULED START. The bridge starts this strategy at START (New York time) even if this tab is closed, asleep or reloaded, and even if the bridge itself was restarted meanwhile: the schedule is saved on disk. If the bridge was down through START it still starts as soon as it is back, as long as the START..CUTOFF session is still running; if the whole session is over it does not start and says \"missed\".";
  if (!status) return base;
  const armed = status.armedAtUtc
    ? `\n\nArmed: starts ${new Date(status.armedAtUtc).toLocaleString()} (${status.startNyTime ?? "START"} NY).`
    : "\n\nNothing armed (the strategy is stopped, or already inside its START..CUTOFF session).";
  const last = status.lastOutcome
    ? `\nLast scheduled start: ${status.lastOutcome}${status.lastAtUtc ? ` at ${new Date(status.lastAtUtc).toLocaleString()}` : ""}.`
    : "";
  return base + armed + last;
}

/**
 * The BALANCE/HEDGED mode pair, the RATIO box and the state chip. Not part of the toolbar card any
 * more: the Arbitrage page renders it in the header row opposite the auto-start buttons (crosshair,
 * book, lock, START AUTO), right-aligned - see ArbitrageScanner. Same pill styling as before, one
 * h-7 row.
 *
 * BALANCE and HEDGED are mutually exclusive MODES of one switch, not two independent toggles — at
 * most one is ever active (`directionBalance.enabled` is true for either; `.hedged` picks which).
 * Pressing the currently active one turns the whole thing off; pressing the other one switches
 * straight to it. Both buttons stay clickable regardless of the current state — see
 * ArbitrageScanner's own `toggleBalanceMode`/`toggleHedgedMode` for the exact rule.
 */
export function DirectionBalanceControls({ directionBalance }: { directionBalance: DirectionBalanceControl }) {
  const title = balanceTitle(directionBalance.status, directionBalance.hedged);
  const hedgeLive = directionBalance.status?.hedgedEpisode ?? false;
  const balanceActive = directionBalance.enabled && !directionBalance.hedged;
  const hedgedActive = directionBalance.enabled && directionBalance.hedged;
  return (
    <>
      <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20" title={title}>
        <button
          type="button"
          aria-pressed={balanceActive}
          onClick={directionBalance.onToggle}
          title="On a skew, lower the starved side's own entry threshold. Press again to turn it off."
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            balanceActive
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          BALANCE
        </button>
        {/* The OTHER mode of the same switch, not a second switch of its own — clicking it while
            BALANCE is active switches straight to HEDGED (and back again switches straight back);
            clicking whichever one is currently active turns everything off. An episode's mode is
            fixed at its own trigger (see DirectionBalancer's own doc comment), so the CHIP below
            keeps showing whatever mode the CURRENT episode actually started in, even for a moment
            after this button itself has already moved on to the next one. */}
        <button
          type="button"
          aria-pressed={hedgedActive}
          onClick={directionBalance.onToggleHedged}
          title="On a skew, send real QQQ buy/sell orders to close the BP gap directly instead of lowering a threshold. Takes effect at the next episode's own trigger. Press again to turn it off."
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            hedgedActive
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          HEDGED
        </button>
      </div>

      <div
        className={clsx("flex h-7 items-center gap-1 pl-2 pr-0 rounded-lg bg-black/20", !directionBalance.enabled && "opacity-60")}
        title="Trigger ratio: how many times more BP one side must hold than the other before the balance acts. 2 = twice the notional on one side."
      >
        <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">RATIO</span>
        <BalanceRatioInput value={directionBalance.ratio} onChange={directionBalance.onRatio} disabled={!directionBalance.enabled} />
        <span
          className="flex h-8 items-center pl-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wide"
          title="MIN GAP (BP). 0 = off, the RATIO decides. Above 0 it replaces the ratio: any difference of at least this many BP between longs and shorts counts as a skew (15 against 14 included), and the balance works until the difference is back UNDER it - i.e. to ~0. HEDGED sends QQQ in whole orders of 1,000 BP, so use 1,000 or more there."
        >
          GAP
        </span>
        <BalanceGapInput value={directionBalance.minGapBp} onChange={directionBalance.onMinGapBp} disabled={!directionBalance.enabled} />
        {directionBalance.enabled && (
          <span
            className="flex h-8 items-center gap-1.5 pr-2 text-[10px] font-mono tabular-nums select-none"
            title={title}
          >
            {hedgeLive ? (
              // HEDGED episode in force: the QQQ order count, coral/mint by direction (sell/short = coral, buy/long = mint — sign, not identity).
              <span className={directionBalance.status?.hedgeSide === "short" ? "text-rose-400/80" : "text-emerald-400/80"}>
                QQQ {directionBalance.status?.hedgeSide === "short" ? "−" : "+"}{directionBalance.status?.hedgeOrdersOut ?? 0}
              </span>
            ) : (
              <>
                <span className="text-emerald-400/80">S {directionBalance.status ? fmtAdj(directionBalance.status.shortAdjust) : "·"}</span>
                <span className="text-rose-400/80">L {directionBalance.status ? fmtAdj(directionBalance.status.longAdjust) : "·"}</span>
              </>
            )}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * SAVE, next to BALANCE/HEDGED/RATIO in the Arbitrage header row (ArbitrageScanner). Every hour on
 * the bridge: Ctrl+Q cancels any limit still unfilled (real for PRINT mode's limit entries, a no-op
 * the rest of the time — sent anyway since the switch does not know which mode is live), then any
 * position still awaiting its fill is forgotten so the ordinary entry path re-sends it next tick if
 * it is still signalling.
 *
 * Independent of BALANCE/HEDGED: SAVE never touches QQQ or a threshold, so the two switches may both
 * be on at once. Caesar-aware on the bridge — Ctrl+Q is global, so the hourly cycle stands itself
 * down for the hour whenever another strategy is also running, rather than cancel its orders too.
 */
const SAVE_MODE_TITLE =
  "SAVE MODE. Every hour, at a RANDOM minute 1-5 past the hour, a new draw every hour (e.g. 01:03, 02:05, 03:03 - never the bare :00): Ctrl+Q cancels any limit order still unfilled, then any position still awaiting its fill is forgotten so it is re-sent if still signalling. Independent of BALANCE/HEDGED (neither touches QQQ or a threshold) — stands down for the hour if another strategy is also running, since Ctrl+Q is global.";

export function SaveModeButton({ saveMode }: { saveMode: SaveModeControl }) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20" title={SAVE_MODE_TITLE}>
      <button
        type="button"
        aria-pressed={saveMode.enabled}
        onClick={saveMode.onToggle}
        className={clsx(
          "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
          saveMode.enabled
            ? "accent-soft"
            : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
        )}
      >
        SAVE
      </button>
    </div>
  );
}

export default function ExecutionSettingsPanel({
  scheduledStart,
  filters,
  tab,
  isStreamOnlyShell,
  applyDilutionMode,
  applyDilutionStep,
  applyMaxAdds,
  applyAddDelayMinutes,
  effectiveStreamAutomationConfig,
  onStreamAutomationConfigChange,
  streamFilterPassLogCount,
  filteredEpisodes,
  downloadEpisodesLog,
  downloadStreamFilterPassLog,
  priceModeAffectsLive = false,
  dilutionStepUnitLabel,
}: ExecutionSettingsPanelProps) {
  const {
    addDelayMinutes,
    closeMode,
    dilutionMode,
    dilutionStep,
    maxAdds,
    minHoldCandles,
    pnlMode,
    preStartTime,
    priceMode,
    setCloseMode,
    setEntryStopTime,
    setMinHoldCandles,
    setPnlMode,
    setPreStartTime,
    setPriceMode,
    setSizeValue,
    setSizingMode,
    setStartCutoffTime,
    sizeValue,
    sizingMode,
    startCutoffTime,
  } = filters;

  // ENTRY defaults to CUTOFF when unset — that is the original single-time behaviour, and it keeps
  // the field showing a real value instead of a blank the user has to guess at.
  const entryStopValue = effectiveStreamAutomationConfig.entryStopTime || startCutoffTime;

  return (
<GlassCard className="order-2 p-3">
  <div className="flex flex-wrap items-center gap-3">
    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20">
      <TwoTonePairButtons
        options={[
          { key: "Active", label: "ACTIVE" },
          { key: "Passive", label: "PASSIVE" },
        ] as const}
        active={closeMode}
        onSelect={(key) => setCloseMode(key as PaperArbCloseMode)}
      />
    </div>

    <div className={backtestOnlyGroupClass(isStreamOnlyShell, "gap-0.5")} title={BACKTEST_ONLY_TITLE}>
      <TwoTonePairButtons
        options={[
          { key: "Hedged", label: "HEDGED" },
          { key: "RawOnly", label: "RAWONLY" },
        ] as const}
        active={pnlMode}
        onSelect={(key) => setPnlMode(key as PaperArbPnlMode)}
      />
    </div>

    <div
      className={backtestOnlyGroupClass(isStreamOnlyShell && !priceModeAffectsLive, "gap-0.5")}
      title={priceModeAffectsLive ? PRICE_MODE_LIVE_TITLE : BACKTEST_ONLY_TITLE}
    >
      <TwoTonePairButtons
        options={[
          { key: "LastPrint", label: "PRINT" },
          { key: "BidAsk", label: "BIDASK" },
        ] as const}
        active={priceMode}
        onSelect={(key) => setPriceMode(key as PaperArbPriceMode)}
      />
    </div>

    <div className={backtestOnlyGroupClass(isStreamOnlyShell, "gap-0.5")} title={BACKTEST_ONLY_TITLE}>
      <TwoTonePairButtons
        options={[
          { key: "Notional", label: "USD" },
          { key: "Tier", label: "TIER" },
        ] as const}
        active={sizingMode}
        onSelect={(key) => {
          const nextMode = key as PaperArbSizingMode;
          setSizingMode(nextMode);
          setSizeValue((current) =>
            nextMode === "Tier"
              ? 1
              : normalizeScannerSizeValue(nextMode, current)
          );
        }}
      />
    </div>

    <div className={backtestOnlyGroupClass(isStreamOnlyShell, "pl-3 pr-0")} title={BACKTEST_ONLY_TITLE}>
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
        {sizingMode === "Notional" ? "SIZE" : "TIERS"}
      </span>
      <div className="group relative h-7 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={sizingMode === "Tier" ? 1 : 1000}
          step={sizingMode === "Tier" ? 1 : 1000}
          value={formatScannerSizeValue(sizingMode, sizeValue)}
          onChange={(e) => setSizeValue(normalizeScannerSizeValue(sizingMode, Number(e.target.value)))}
          className={clsx("center-spin h-7 w-full bg-transparent border-0 !pl-2 !pr-4 text-[10px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSizeValue((v) => stepScannerSizeValue(sizingMode, v, 1))}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={sizingMode === "Tier" ? "Increase tier count" : "Increase size"}
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSizeValue((v) => stepScannerSizeValue(sizingMode, v, -1))}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={sizingMode === "Tier" ? "Decrease tier count" : "Decrease size"}
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20">
      <TwoTonePairButtons
        options={[
          { key: "Diluted", label: "DILUTED" },
          { key: "Undiluted", label: "UNDILUTED" },
        ] as const}
        active={dilutionMode}
        onSelect={(key) => applyDilutionMode(key as PaperArbDilutionMode)}
      />
    </div>


    <div
      className="flex h-7 items-center justify-center px-1 rounded-lg bg-black/20"
      title={dilutionStepUnitLabel
        ? `STEP — how far apart each add rung sits, in ${dilutionStepUnitLabel} — the unit the threshold strip is set to. Resolved per ticker server-side, exactly like the entry floor.`
        : "STEP — how far apart each add rung sits, in the dilution ladder's own unit."}
    >
      {dilutionStepUnitLabel ? (
        <span className="pl-1.5 pr-0.5 text-[10px] font-mono font-bold leading-none text-amber-300/60" style={{ textTransform: "none" }}>
          {dilutionStepUnitLabel}
        </span>
      ) : null}
      <div className="group relative h-7 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="decimal"
          min={0.1}
          step={0.1}
          value={formatDilutionStepValue(dilutionStep)}
          onChange={(e) => applyDilutionStep(Number(e.target.value))}
          disabled={dilutionMode !== "Diluted"}
          className={clsx(
            "center-spin h-7 w-full bg-transparent border-0 !pl-2 !pr-4 text-[10px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none transition-all disabled:opacity-40",
            "text-amber-300"
          )}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyDilutionStep(stepDilutionStepValue(dilutionStep, 1))}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Increase dilution step"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyDilutionStep(stepDilutionStepValue(dilutionStep, -1))}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Decrease dilution step"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center justify-center px-1 rounded-lg bg-black/20" title="MAXADD — the most adds a single position may take before the ladder stops.">
      <div className="group relative h-7 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={9}
          step={1}
          value={maxAdds}
          onChange={(e) => applyMaxAdds(Number(e.target.value))}
          disabled={dilutionMode !== "Diluted"}
          className={clsx(
            "center-spin h-7 w-full bg-transparent border-0 !pl-2 !pr-4 text-[10px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none transition-all disabled:opacity-40",
            "text-sky-300"
          )}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMaxAdds(maxAdds + 1)}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Increase max additions"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMaxAdds(maxAdds - 1)}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Decrease max additions"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center justify-center px-1 rounded-lg bg-black/20" title="DELAY — minutes to wait after a rung qualifies before the add is actually sent.">
      <div className="group relative h-7 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          step={1}
          value={addDelayMinutes}
          onChange={(e) => applyAddDelayMinutes(Number(e.target.value))}
          disabled={dilutionMode !== "Diluted"}
          className={clsx(
            "center-spin h-7 w-full bg-transparent border-0 !pl-2 !pr-4 text-[10px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none transition-all disabled:opacity-40",
            "text-violet-300"
          )}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAddDelayMinutes(addDelayMinutes + 1)}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Increase add delay minutes"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAddDelayMinutes(addDelayMinutes - 1)}
            disabled={dilutionMode !== "Diluted"}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Decrease add delay minutes"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <div
      className="flex h-7 items-center gap-1 pl-2 pr-0 rounded-lg bg-black/20"
      title="MINHOLD — скільки хвилин поспіль умова має триматись, щоб їй повірили. Одне й те саме число гейтить ВХІД (підтвердження розходження) і ВИХІД (підтвердження збіжності). 0 і 1 означають одне: підтверджено на самому барі, без очікування."
    >
      <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MINHOLD</span>
      <div className="group relative h-8 w-11 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={180}
          step={1}
          value={minHoldCandles}
          onChange={(e) => setMinHoldCandles(Math.max(0, Math.min(180, clampInt(e.target.value, 0))))}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMinHoldCandles((v) => Math.max(0, Math.min(180, Math.trunc(v + 1))))}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase min hold"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMinHoldCandles((v) => Math.max(0, Math.min(180, Math.trunc(v - 1))))}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease min hold"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center gap-1 pl-2 pr-0 rounded-lg bg-black/20">
      <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">DELAY</span>
      <div className="group relative h-8 w-11 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
          step={1}
          value={effectiveStreamAutomationConfig.queueDelayMinSeconds}
          onChange={(e) => {
            const nextMin = Math.max(0, Math.min(600, clampInt(e.target.value, 0)));
            const nextMax = Math.max(nextMin, effectiveStreamAutomationConfig.queueDelayMaxSeconds);
            onStreamAutomationConfigChange?.({
              queueDelayMinSeconds: nextMin,
              queueDelayMaxSeconds: nextMax,
            });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const nextMin = Math.max(0, Math.min(600, Math.trunc(effectiveStreamAutomationConfig.queueDelayMinSeconds + 1)));
              const nextMax = Math.max(nextMin, effectiveStreamAutomationConfig.queueDelayMaxSeconds);
              onStreamAutomationConfigChange?.({
                queueDelayMinSeconds: nextMin,
                queueDelayMaxSeconds: nextMax,
              });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase delay min seconds"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const nextMin = Math.max(0, Math.min(600, Math.trunc(effectiveStreamAutomationConfig.queueDelayMinSeconds - 1)));
              onStreamAutomationConfigChange?.({
                queueDelayMinSeconds: nextMin,
                queueDelayMaxSeconds: Math.max(nextMin, effectiveStreamAutomationConfig.queueDelayMaxSeconds),
              });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease delay min seconds"
          >
            ▼
          </button>
        </div>
      </div>
      <span className="flex h-7 items-center justify-center text-[10px] font-mono text-zinc-600">-</span>
      <div className="group relative h-8 w-11 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
          step={1}
          value={effectiveStreamAutomationConfig.queueDelayMaxSeconds}
          onChange={(e) => {
            const nextMax = Math.max(0, Math.min(600, clampInt(e.target.value, 0)));
            const nextMin = Math.min(effectiveStreamAutomationConfig.queueDelayMinSeconds, nextMax);
            onStreamAutomationConfigChange?.({
              queueDelayMinSeconds: nextMin,
              queueDelayMaxSeconds: nextMax,
            });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const nextMax = Math.max(0, Math.min(600, Math.trunc(effectiveStreamAutomationConfig.queueDelayMaxSeconds + 1)));
              onStreamAutomationConfigChange?.({
                queueDelayMaxSeconds: nextMax,
              });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase delay max seconds"
          >
            ▲
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const nextMax = Math.max(0, Math.min(600, Math.trunc(effectiveStreamAutomationConfig.queueDelayMaxSeconds - 1)));
              const nextMin = Math.min(effectiveStreamAutomationConfig.queueDelayMinSeconds, nextMax);
              onStreamAutomationConfigChange?.({
                queueDelayMinSeconds: nextMin,
                queueDelayMaxSeconds: nextMax,
              });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease delay max seconds"
          >
            ▼
          </button>
        </div>
      </div>
      <span className="flex h-8 items-center pr-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">SEC</span>
    </div>

    {scheduledStart && (scheduledStart.armedAtUtc || scheduledStart.lastOutcome) && (
      <span
        className={clsx(
          "inline-flex h-7 items-center whitespace-nowrap text-[10px] font-mono font-bold uppercase leading-none",
          scheduledStart.armedAtUtc
            ? "text-amber-300/90"
            : scheduledStart.lastOutcome?.startsWith("missed")
              ? "text-rose-300/90"
              : "text-zinc-500",
        )}
        title={scheduledStartTitle(scheduledStart)}
      >
        {scheduledStart.armedAtUtc
          ? `armed ${untilLabel(scheduledStart.armedAtUtc)}`.trim()
          : scheduledStart.lastOutcome?.startsWith("missed")
            ? "start missed"
            : scheduledStart.lastOutcome?.startsWith("started")
              ? "started"
              : ""}
      </span>
    )}

    <div className="flex-1" />

    {tab === "episodes" && !isStreamOnlyShell && filteredEpisodes.length > 0 && (
      <button
        type="button"
        onClick={downloadEpisodesLog}
        className="flex h-7 items-center gap-1.5 px-2.5 rounded-lg bg-black/20 text-[10px] font-mono text-zinc-400 uppercase hover:text-white hover:bg-white/5 transition-all border border-transparent"
        title={`Download ${filteredEpisodes.length} episodes as JSONL`}
      >
        ↓ LOG
      </button>
    )}

    <TimePill
      title="START: position-taking begins at this time, for every class (classes only select ratings, they impose no time window of their own). START later than CUTOFF means an overnight session: start tonight, stop tomorrow morning."
      ariaLabel="start"
      color={SCANNER_MINT_HEX}
      value={preStartTime}
      fallbackHour="21"
      onChange={(next) => {
        setPreStartTime(next);
        onStreamAutomationConfigChange?.({ preStartTime: next });
      }}
    />

    <TimePill
      title="ENTRY STOP: after this time no NEW positions are taken, and the bridge print-closes the book. Leave equal to CUTOFF to stop entries at the close; set it earlier (e.g. 09:25 vs a 10:00 close) to give the dispatch queue time to flush."
      ariaLabel="entry stop"
      color={IDENTITY_YELLOW_HEX}
      value={entryStopValue}
      fallbackHour="09"
      onChange={(next) => {
        setEntryStopTime(next);
        onStreamAutomationConfigChange?.({ entryStopTime: next });
      }}
    />

    <TimePill
      title="CUTOFF: end of the START..CUTOFF session. It is also the ENTRY STOP whenever ENTRY is left unset; the scheduled start uses it to know when a session is over."
      ariaLabel="cutoff"
      color={SCANNER_CORAL_HEX}
      value={startCutoffTime}
      fallbackHour="09"
      onChange={(next) => {
        setStartCutoffTime(next);
        onStreamAutomationConfigChange?.({ startCutoffTime: next });
      }}
    />

  </div>
</GlassCard>
  );
}
