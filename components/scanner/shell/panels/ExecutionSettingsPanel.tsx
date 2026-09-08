import React from "react";
import clsx from "clsx";
import { GlassCard } from "../../shared/ui";
import { clampInt, formatDilutionStepValue, formatScannerSizeValue, normalizeScannerSizeValue, stepDilutionStepValue, stepScannerSizeValue } from "../../../../lib/scanner/format";
import type { ScannerFilterBag } from "../../../../lib/scanner/filterState";
import type { PaperArbCloseMode, PaperArbDilutionMode, PaperArbPnlMode, PaperArbPriceMode, PaperArbSizingMode, TabKey } from "../../../../lib/scanner/types";
import type { StreamAutomationConfig } from "../../../stream/streamEngine";

/**
 * The execution-settings card (the `order-2` row): sizing, dilution, close mode,
 * P&L and price mode, min hold, the stream start/cutoff steppers and the two log
 * downloads. Identical for every strategy.
 */
export type ExecutionSettingsPanelProps = {
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
};

export default function ExecutionSettingsPanel({
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
      {[
        { key: "Active", label: "ACTIVE" },
        { key: "Passive", label: "PASSIVE" },
      ].map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setCloseMode(m.key as PaperArbCloseMode)}
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            closeMode === m.key
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>

    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20">
      {[
        { key: "Hedged", label: "HEDGED" },
        { key: "RawOnly", label: "RAWONLY" },
      ].map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setPnlMode(m.key as PaperArbPnlMode)}
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            pnlMode === m.key
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>

    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20">
      {[
        { key: "LastPrint", label: "PRINT" },
        { key: "BidAsk", label: "BIDASK" },
      ].map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setPriceMode(m.key as PaperArbPriceMode)}
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            priceMode === m.key
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>

    <div className="flex h-7 items-center gap-0.5 rounded-lg bg-black/20">
      {[
        { key: "Notional", label: "USD" },
        { key: "Tier", label: "TIER" },
      ].map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => {
            const nextMode = m.key as PaperArbSizingMode;
            setSizingMode(nextMode);
            setSizeValue((current) =>
              nextMode === "Tier"
                ? 1
                : normalizeScannerSizeValue(nextMode, current)
            );
          }}
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            sizingMode === m.key
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>

    <div className="flex h-7 items-center pl-3 pr-0 rounded-lg bg-black/20">
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
      {[
        { key: "Undiluted", label: "UNDILUTED" },
        { key: "Diluted", label: "DILUTED" },
      ].map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => applyDilutionMode(m.key as PaperArbDilutionMode)}
          className={clsx(
            "px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border",
            dilutionMode === m.key
              ? "accent-soft"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>

    <div className="flex h-7 items-center pl-3 pr-0 rounded-lg bg-black/20">
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">STEP</span>
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
            "accent-text"
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

    <div className="flex h-7 items-center pl-3 pr-0 rounded-lg bg-black/20">
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MAXADD</span>
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
            "accent-text"
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

    <div className="flex h-7 items-center pl-3 pr-0 rounded-lg bg-black/20">
      <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">DELAY</span>
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
            "accent-text"
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
      className="flex h-7 items-center gap-2 pl-3 pr-0 rounded-lg bg-black/20"
      title="MINHOLD — скільки хвилин поспіль умова має триматись, щоб їй повірили. Одне й те саме число гейтить ВХІД (підтвердження розходження) і ВИХІД (підтвердження збіжності). 0 і 1 означають одне: підтверджено на самому барі, без очікування."
    >
      <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">MINHOLD</span>
      <div className="group relative h-8 w-14 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={180}
          step={1}
          value={minHoldCandles}
          onChange={(e) => setMinHoldCandles(Math.max(0, Math.min(180, clampInt(e.target.value, 0))))}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
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

    <div className="flex h-7 items-center gap-1 pl-3 pr-0 rounded-lg bg-black/20">
      <span className="flex h-8 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">DELAY</span>
      <div className="group relative h-8 w-14 overflow-hidden rounded-md">
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
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
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
      <div className="group relative h-8 w-14 overflow-hidden rounded-md">
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
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-2 !pr-5 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all active:scale-[0.99]", "accent-text")}
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
      <span className="flex h-8 items-center pr-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">SEC</span>
    </div>

    <div className="flex h-7 items-center gap-1 pl-3 pr-0 rounded-lg bg-black/20" title="Position-taking begins at this time, for every class (classes only select ratings, they impose no time window of their own). START later than CUTOFF means an overnight session: start tonight, stop tomorrow morning.">
      <span className="flex h-8 items-center pr-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">START</span>
      {/* Hour stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={23}
          step={1}
          value={Number(preStartTime.split(":")[0] ?? "21")}
          onChange={(e) => {
            const h = Math.max(0, Math.min(23, clampInt(e.target.value, 0)));
            const m = preStartTime.split(":")[1] ?? "00";
            const nextPreStartTime = `${String(h).padStart(2, "0")}:${m}`;
            setPreStartTime(nextPreStartTime);
            onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(preStartTime.split(":")[0] ?? "21") + 1));
              const m = preStartTime.split(":")[1] ?? "00";
              const nextPreStartTime = `${String(h).padStart(2, "0")}:${m}`;
              setPreStartTime(nextPreStartTime);
              onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase pre-session start hour"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(preStartTime.split(":")[0] ?? "21") - 1));
              const m = preStartTime.split(":")[1] ?? "00";
              const nextPreStartTime = `${String(h).padStart(2, "0")}:${m}`;
              setPreStartTime(nextPreStartTime);
              onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease pre-session start hour"
          >▼</button>
        </div>
      </div>
      <span className="text-[11px] font-mono text-zinc-500 select-none">:</span>
      {/* Minute stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={5}
          value={Number(preStartTime.split(":")[1] ?? "00")}
          onChange={(e) => {
            const m = Math.max(0, Math.min(59, clampInt(e.target.value, 0)));
            const h = preStartTime.split(":")[0] ?? "21";
            const nextPreStartTime = `${h}:${String(m).padStart(2, "0")}`;
            setPreStartTime(nextPreStartTime);
            onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(preStartTime.split(":")[1] ?? "00") + 5));
              const h = preStartTime.split(":")[0] ?? "21";
              const nextPreStartTime = `${h}:${String(m).padStart(2, "0")}`;
              setPreStartTime(nextPreStartTime);
              onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase pre-session start minute"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(preStartTime.split(":")[1] ?? "00") - 5));
              const h = preStartTime.split(":")[0] ?? "21";
              const nextPreStartTime = `${h}:${String(m).padStart(2, "0")}`;
              setPreStartTime(nextPreStartTime);
              onStreamAutomationConfigChange?.({ preStartTime: nextPreStartTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease pre-session start minute"
          >▼</button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center gap-1 pl-3 pr-0 rounded-lg bg-black/20" title="New entries stop at this time.">
      <span className="flex h-8 items-center pr-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">CUTOFF</span>
      {/* Hour stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={23}
          step={1}
          value={Number(startCutoffTime.split(":")[0] ?? "9")}
          onChange={(e) => {
            const h = Math.max(0, Math.min(23, clampInt(e.target.value, 0)));
            const m = startCutoffTime.split(":")[1] ?? "00";
            const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
            setStartCutoffTime(nextCutoffTime);
            onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(startCutoffTime.split(":")[0] ?? "9") + 1));
              const m = startCutoffTime.split(":")[1] ?? "00";
              const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase cutoff hour"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(startCutoffTime.split(":")[0] ?? "9") - 1));
              const m = startCutoffTime.split(":")[1] ?? "00";
              const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease cutoff hour"
          >▼</button>
        </div>
      </div>
      <span className="text-[11px] font-mono text-zinc-500 select-none">:</span>
      {/* Minute stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={5}
          value={Number(startCutoffTime.split(":")[1] ?? "20")}
          onChange={(e) => {
            const m = Math.max(0, Math.min(59, clampInt(e.target.value, 0)));
            const h = startCutoffTime.split(":")[0] ?? "09";
            const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
            setStartCutoffTime(nextCutoffTime);
            onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(startCutoffTime.split(":")[1] ?? "20") + 5));
              const h = startCutoffTime.split(":")[0] ?? "09";
              const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase cutoff minute"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(startCutoffTime.split(":")[1] ?? "20") - 5));
              const h = startCutoffTime.split(":")[0] ?? "09";
              const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ startCutoffTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease cutoff minute"
          >▼</button>
        </div>
      </div>
    </div>

    <div className="flex h-7 items-center gap-1 pl-3 pr-0 rounded-lg bg-black/20" title="ENTRY STOP: after this time no NEW positions are taken. Leave equal to CUTOFF to stop entries at the close; set it earlier (e.g. 09:25 vs a 10:00 close) to give the dispatch queue time to flush.">
      <span className="flex h-8 items-center pr-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">ENTRY</span>
      {/* Hour stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={23}
          step={1}
          value={Number(entryStopValue.split(":")[0] ?? "9")}
          onChange={(e) => {
            const h = Math.max(0, Math.min(23, clampInt(e.target.value, 0)));
            const m = entryStopValue.split(":")[1] ?? "00";
            const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
            setStartCutoffTime(nextCutoffTime);
            onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(entryStopValue.split(":")[0] ?? "9") + 1));
              const m = entryStopValue.split(":")[1] ?? "00";
              const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase cutoff hour"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = Math.max(0, Math.min(23, Number(entryStopValue.split(":")[0] ?? "9") - 1));
              const m = entryStopValue.split(":")[1] ?? "00";
              const nextCutoffTime = `${String(h).padStart(2, "0")}:${m}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease cutoff hour"
          >▼</button>
        </div>
      </div>
      <span className="text-[11px] font-mono text-zinc-500 select-none">:</span>
      {/* Minute stepper */}
      <div className="group relative h-8 w-9 overflow-hidden rounded-md">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={5}
          value={Number(entryStopValue.split(":")[1] ?? "20")}
          onChange={(e) => {
            const m = Math.max(0, Math.min(59, clampInt(e.target.value, 0)));
            const h = entryStopValue.split(":")[0] ?? "09";
            const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
            setStartCutoffTime(nextCutoffTime);
            onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
          }}
          className={clsx("center-spin w-full h-8 bg-transparent border-0 !pl-1 !pr-4 text-[11px] font-mono tabular-nums text-center placeholder-zinc-700 focus:outline-none focus:bg-black/10 transition-all", "accent-text")}
        />
        <div className="absolute right-0 top-0 bottom-0 w-4 border-l border-white/10 bg-transparent flex flex-col opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(entryStopValue.split(":")[1] ?? "20") + 5));
              const h = entryStopValue.split(":")[0] ?? "09";
              const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Increase cutoff minute"
          >▲</button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const m = Math.max(0, Math.min(59, Number(entryStopValue.split(":")[1] ?? "20") - 5));
              const h = entryStopValue.split(":")[0] ?? "09";
              const nextCutoffTime = `${h}:${String(m).padStart(2, "0")}`;
              setStartCutoffTime(nextCutoffTime);
              onStreamAutomationConfigChange?.({ entryStopTime: nextCutoffTime });
            }}
            className="flex flex-1 items-center justify-center border-t border-white/5 text-[8px] leading-none text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Decrease cutoff minute"
          >▼</button>
        </div>
      </div>
    </div>

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

  </div>
</GlassCard>
  );
}
