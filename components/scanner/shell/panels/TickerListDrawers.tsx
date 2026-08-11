import React from "react";
import clsx from "clsx";
import { GlassCard } from "../../shared/ui";

/**
 * The IGN / APP / PIN ticker-list drawers: three textareas with CSV import,
 * clear and counts. Shared verbatim by every strategy.
 */
export type TickerListDrawersProps = {
  showIgnore: boolean;
  showApply: boolean;
  showPin: boolean;
  ignoreTickersText: string;
  tickersText: string;
  benchTickersText: string;
  setIgnoreTickersText: (v: string) => void;
  setTickersText: (v: string) => void;
  setBenchTickersText: (v: string) => void;
  ignoreFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  applyFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  pinFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onIgnoreFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onApplyFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPinFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function TickerListDrawers({
  showIgnore,
  showApply,
  showPin,
  ignoreTickersText,
  tickersText,
  benchTickersText,
  setIgnoreTickersText,
  setTickersText,
  setBenchTickersText,
  ignoreFileInputRef,
  applyFileInputRef,
  pinFileInputRef,
  onIgnoreFileSelected,
  onApplyFileSelected,
  onPinFileSelected,
}: TickerListDrawersProps) {
  return (
    <GlassCard className="p-3 border-white/[0.08] bg-[#05070b]/95">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {showIgnore && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-rose-300">
                IGNORE TICKERS
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => ignoreFileInputRef.current?.click()}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                >
                  IMPORT CSV
                </button>
                <button
                  type="button"
                  onClick={() => setIgnoreTickersText("")}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                >
                  CLR
                </button>
              </div>
            </div>
            <textarea
              value={ignoreTickersText}
              onChange={(e) => setIgnoreTickersText(e.target.value.toUpperCase())}
              rows={4}
              placeholder="AAPL, TSLA, NVDA"
              className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500/45 font-mono"
            />
            <input
              ref={ignoreFileInputRef}
              type="file"
              accept=".csv"
              onChange={onIgnoreFileSelected}
              className="hidden"
            />
          </div>
        )}

        {showApply && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-emerald-300">
                APPLY TICKERS
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyFileInputRef.current?.click()}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                >
                  IMPORT CSV
                </button>
                <button
                  type="button"
                  onClick={() => setTickersText("")}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                >
                  CLR
                </button>
              </div>
            </div>
            <textarea
              value={tickersText}
              onChange={(e) => setTickersText(e.target.value.toUpperCase())}
              rows={4}
              placeholder="AAPL, TSLA, NVDA"
              className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 font-mono"
            />
            <input
              ref={applyFileInputRef}
              type="file"
              accept=".csv"
              onChange={onApplyFileSelected}
              className="hidden"
            />
          </div>
        )}

        {showPin && (
          <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-violet-200">
                PIN TICKERS
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pinFileInputRef.current?.click()}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
                >
                  IMPORT CSV
                </button>
                <button
                  type="button"
                  onClick={() => setBenchTickersText("")}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                >
                  CLR
                </button>
              </div>
            </div>
            <textarea
              value={benchTickersText}
              onChange={(e) => setBenchTickersText(e.target.value.toUpperCase())}
              rows={4}
              placeholder="AAPL, TSLA, NVDA"
              className="w-full resize-y bg-black/20 border border-white/10 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-400/45 font-mono"
            />
            <input
              ref={pinFileInputRef}
              type="file"
              accept=".csv"
              onChange={onPinFileSelected}
              className="hidden"
            />
          </div>
        )}
      </div>
    </GlassCard>
  );
}
