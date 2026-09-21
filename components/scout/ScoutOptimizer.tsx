"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { GlassCard } from "../scanner/shared/ui";
import { SOFT_LOSS_TEXT_CLASS } from "../scanner/shared/styles";
import { TOOLBAR_BUTTON_ACTIVE, TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE } from "../shared/filters/styles";
import SpinnerInput from "./SpinnerInput";
import type { OptConfig, OptObjective, OptResult, OptProgress } from "../../lib/scout/optimizeCore";
import type { ScoutBound } from "../../lib/scout/types";

/**
 * "BEST SETTINGS" panel, shared by both Scouts. One press runs the search over the trades the page is
 * showing (class, side, window, ETF/country/sector, cap all as selected) and lists the best setting
 * found for each entry unit, next to the CURRENT settings scored the same way; APPLY writes one into
 * the toolbar. The search itself is lib/scout/optimizeCore.ts - this file is only the surface.
 *
 * VALIDATE (on by default, single window only): the search sees only the OLDEST 70% of the window's days and the
 * table then shows the same setting on the NEWEST 30%, which it never saw - TEST P&L and HOLD (test avg / train avg).
 * STABLE: share of one-step-away settings that keep >= 80% of the score (a plateau vs a needle).
 *
 * WINDOW: `SELECTED` scores the window on screen; `ALL WINDOWS` finds one setting that does well on
 * every window (5/20/40/65D) together, and the table then shows each window's own P&L.
 */
export type OptOutcome = { results: OptResult[]; current: OptResult; scopeTrades: number };
type Shown = OptOutcome & { key: string; multi: boolean; validate: boolean };

export type ScoutOptimizerProps = {
  /** bumped by the page's BEST SETTINGS button; every change starts a run */
  runSeq: number;
  /** changes whenever anything the search reads changes - a result from another scope is marked stale */
  scopeKey: string;
  /** the same without the window: an ALL WINDOWS result does not depend on which window is on screen */
  scopeKeyAll: string;
  /** the window on screen, for the SELECTED button's label */
  windowDays: number;
  ready: boolean;
  run: (o: { objective: OptObjective; minTrades: number; multi: boolean; validate: boolean; onProgress: OptProgress; cancelled: () => boolean }) => Promise<OptOutcome>;
  /** label for an entry unit key, e.g. "σ" */
  unitLabel: (key: string) => string;
  onApply: (cfg: OptConfig) => void;
  onClose: () => void;
};

const OBJECTIVES: Array<{ key: OptObjective; label: string; title: string }> = [
  { key: "pnl", label: "TOTAL P&L", title: "Maximise the total P&L in dollars" },
  { key: "avg", label: "AVG / TRADE", title: "Maximise the average P&L per trade (thin slices win this one - keep MIN TRADES honest)" },
  { key: "pf", label: "PROFIT FACTOR", title: "Maximise gross wins / gross losses" },
];

const usd = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : ""}$${s}`;
};
const usd2 = (v: number) => (Number.isFinite(v) ? `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}` : "—");
const tone = (v: number) => (!Number.isFinite(v) || v === 0 ? "text-zinc-400" : v > 0 ? "text-[#6ee7b7]" : SOFT_LOSS_TEXT_CLASS);

function bound(b: ScoutBound): string {
  if (b.min !== null && b.max !== null) return `${b.min}–${b.max}`;
  if (b.min !== null) return `≥ ${b.min}`;
  if (b.max !== null) return `≤ ${b.max}`;
  return "—";
}

/** test average per trade as a share of the training average; NaN when it cannot be said */
function hold(r: OptResult): number {
  if (!r.test || !(r.avgUsd > 0) || !Number.isFinite(r.test.avgUsd)) return NaN;
  return r.test.avgUsd / r.avgUsd;
}
const holdText = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—");
const holdTone = (v: number) => (!Number.isFinite(v) ? "text-zinc-500" : v >= 0.6 ? "text-[#6ee7b7]" : v >= 0.2 ? "text-amber-300" : SOFT_LOSS_TEXT_CLASS);
const stableTone = (r: OptResult) => (!r.stability ? "text-zinc-500" : r.stability.share >= 0.75 ? "text-[#6ee7b7]" : r.stability.share >= 0.4 ? "text-amber-300" : SOFT_LOSS_TEXT_CLASS);

export default function ScoutOptimizer({ runSeq, scopeKey, scopeKeyAll, windowDays, ready, run, unitLabel, onApply, onClose }: ScoutOptimizerProps) {
  const [objective, setObjective] = useState<OptObjective>("pnl");
  const [minTrades, setMinTrades] = useState(50);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [multi, setMulti] = useState(false);
  const [validate, setValidate] = useState(true);
  const [outcome, setOutcome] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  const start = useCallback(() => {
    const my = ++token.current;
    setBusy(true);
    setError(null);
    setProgress(0);
    // a frame first, so the "running" state paints before the (synchronous) table build blocks the thread
    setTimeout(() => {
      run({
        objective,
        minTrades,
        multi,
        validate: validate && !multi,
        onProgress: (d, t) => { if (my === token.current) setProgress(d / t); },
        cancelled: () => my !== token.current,
      })
        .then((o) => { if (my === token.current) setOutcome({ ...o, key: multi ? scopeKeyAll : scopeKey, multi, validate: validate && !multi }); })
        .catch((e) => { if (my === token.current) setError(String(e?.message ?? e)); })
        .finally(() => { if (my === token.current) setBusy(false); });
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, objective, minTrades, multi, validate, scopeKey, scopeKeyAll]);

  // BEST SETTINGS pressed (or the data arrived after it was pressed)
  useEffect(() => {
    if (runSeq > 0 && ready) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSeq, ready]);
  useEffect(() => () => { token.current++; }, []);
  // switching SELECTED <-> ALL WINDOWS, or VALIDATE on/off, re-runs once a run has been asked for
  const firstMulti = useRef(true);
  useEffect(() => {
    if (firstMulti.current) { firstMulti.current = false; return; }
    if (runSeq > 0 && ready) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, validate]);

  const stale = !!outcome && outcome.key !== (outcome.multi ? scopeKeyAll : scopeKey);
  const multiCols = !!outcome && outcome.multi && outcome.current.windows.length > 1;
  const hasTest = !!outcome && outcome.validate && !!outcome.current.test;
  const testDays = outcome?.current.test?.days ?? 0;
  const headDays = outcome ? outcome.current.windows[outcome.current.windows.length - 1]?.days : windowDays;
  const rows: Array<{ tag: string; r: OptResult; isCurrent: boolean }> = [];
  if (outcome) {
    rows.push({ tag: "CURRENT", r: outcome.current, isCurrent: true });
    outcome.results.forEach((r, i) => rows.push({ tag: `#${i + 1}`, r, isCurrent: false }));
  }
  const cell = "whitespace-nowrap px-2.5 py-[5px] text-right";

  return (
    <GlassCard hoverable={false} className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] accent-text">BEST SETTINGS</span>
        <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
          {OBJECTIVES.map((o) => (
            <button key={o.key} type="button" title={o.title} onClick={() => setObjective(o.key)}
              className={clsx(TOOLBAR_BUTTON_BASE, objective === o.key ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20" title="Which window(s) a setting is judged on">
          <button type="button" onClick={() => setMulti(false)} disabled={busy} className={clsx(TOOLBAR_BUTTON_BASE, !multi ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
            title="Best setting for the window on screen only">
            {windowDays}D ONLY
          </button>
          <button type="button" onClick={() => setMulti(true)} disabled={busy} className={clsx(TOOLBAR_BUTTON_BASE, multi ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE)}
            title="One setting that does well on 5D, 20D, 40D and 65D together (mean of the per-day results; each window must keep its share of MIN TRADES)">
            ALL WINDOWS
          </button>
        </div>
        <button type="button" onClick={() => setValidate((v) => !v)} disabled={busy || multi}
          className={clsx(TOOLBAR_BUTTON_BASE, validate && !multi ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE, multi && "opacity-40 cursor-not-allowed")}
          title={multi ? "Validation holds out the newest days of ONE window - not available across ALL WINDOWS" : "Search on the OLDEST 70% of the window's days and report the setting on the NEWEST 30%, which it never saw"}>
          VALIDATE 70/30
        </button>
        <SpinnerInput label="MIN TRADES" ariaLabel="min trades" title="A setting that leaves fewer trades than this (in the training days when VALIDATE is on) is not considered - the guard against a lucky handful"
          value={minTrades} onChange={(v) => setMinTrades(Math.max(1, Math.trunc(v)))} step={10} min={1} decimals={0} widthClass="w-16" />
        <button type="button" onClick={start} disabled={busy || !ready} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE, (busy || !ready) && "opacity-50 cursor-not-allowed")}>
          {busy ? `SEARCHING ${Math.round(progress * 100)}%` : "RUN AGAIN"}
        </button>
        <button type="button" onClick={onClose} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_INACTIVE, "ml-auto")} title="Close the panel">✕</button>
      </div>

      {error && <div className="font-mono text-[11px] text-rose-300">Search failed: {error}</div>}
      {stale && !busy && (
        <div className="font-mono text-[11px] text-amber-200/90">The scope (class / side / window / filters) changed since this run — press RUN AGAIN.</div>
      )}
      {outcome && outcome.results.length === 0 && !busy && (
        <div className="font-mono text-[11px] text-amber-200/90">
          No setting keeps at least {minTrades} trades in this scope ({outcome.scopeTrades.toLocaleString("en-US")} trades pass the class / side / window / ETF / country / sector / cap gates). Lower MIN TRADES or widen the scope.
        </div>
      )}

      {outcome && outcome.results.length > 0 && (
        <div className={clsx("overflow-x-auto", stale && "opacity-50")}>
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr className="tracking-[0.12em] text-zinc-500">
                {["", "UNIT", "START", "TO", "ρ", "β", "σ", "α", "MINRATE", "MINTOTAL", `${hasTest ? "TRAIN " : ""}TRADES ${headDays}D`, `${hasTest ? "TRAIN " : ""}P&L ${headDays}D`, "AVG", "WIN", "PF", ...(hasTest ? [`TEST TRADES ${testDays}D`, `TEST P&L ${testDays}D`, "HOLD"] : multiCols ? outcome.current.windows.map((w) => `P&L ${w.days}D`) : ["OLDER ½", "NEWER ½"]), "STABLE", ""].map((h, i) => (
                  <th key={i} className={clsx("px-2.5 py-2 text-[9px] font-semibold whitespace-nowrap", i < 2 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tag, r, isCurrent }) => {
                const c = r.config;
                const dim = isCurrent ? "text-zinc-500" : "text-zinc-300";
                return (
                  <tr key={tag} className={clsx("border-t border-white/[0.04]", isCurrent && "bg-white/[0.02]")}>
                    <td className={clsx(cell, "text-left font-bold", isCurrent ? "text-zinc-500" : "accent-text")}>{tag}</td>
                    <td className={clsx(cell, "text-left font-bold", dim)}>{unitLabel(c.unit)}</td>
                    <td className={clsx(cell, dim)}>{c.start > 0 ? c.start : "—"}</td>
                    <td className={clsx(cell, dim)}>{c.to > 0 && c.to > c.start ? c.to : "—"}</td>
                    <td className={clsx(cell, dim)}>{bound(c.corr)}</td>
                    <td className={clsx(cell, dim)}>{bound(c.beta)}</td>
                    <td className={clsx(cell, dim)}>{bound(c.sigma)}</td>
                    <td className={clsx(cell, dim)}>{bound(c.alpha)}</td>
                    <td className={clsx(cell, dim)}>{c.minRate > 0 ? c.minRate : "—"}</td>
                    <td className={clsx(cell, dim)}>{c.minTotal > 0 ? c.minTotal : "—"}</td>
                    <td className={clsx(cell, dim)}>{r.n.toLocaleString("en-US")}</td>
                    <td className={clsx(cell, "font-bold", tone(r.pnlUsd))}>{usd(r.pnlUsd)}</td>
                    <td className={clsx(cell, tone(r.avgUsd))}>{usd2(r.avgUsd)}</td>
                    <td className={clsx(cell, dim)}>{Number.isFinite(r.winRate) ? `${(r.winRate * 100).toFixed(1)}%` : "—"}</td>
                    <td className={clsx(cell, dim)}>{r.profitFactor === Infinity ? "∞" : Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : "—"}</td>
                    {hasTest && r.test ? (
                      <>
                        <td className={clsx(cell, dim)}>{r.test.n.toLocaleString("en-US")}</td>
                        <td className={clsx(cell, "font-bold", tone(r.test.pnlUsd))}>{usd(r.test.pnlUsd)}</td>
                        <td className={clsx(cell, holdTone(hold(r)))} title="test average per trade / train average per trade">{holdText(hold(r))}</td>
                      </>
                    ) : multiCols ? (
                      r.windows.map((w) => (
                        <td key={w.days} className={clsx(cell, tone(w.pnlUsd))} title={`${w.n.toLocaleString("en-US")} trades in the last ${w.days} sessions`}>{usd(w.pnlUsd)}</td>
                      ))
                    ) : (
                      <>
                        <td className={clsx(cell, tone(r.half1Usd))} title={`${r.half1N} trades`}>{usd(r.half1Usd)}</td>
                        <td className={clsx(cell, tone(r.half2Usd))} title={`${r.half2N} trades`}>{usd(r.half2Usd)}</td>
                      </>
                    )}
                    <td className={clsx(cell, stableTone(r))} title={r.stability ? `${r.stability.neighbours} neighbouring settings tried; the weakest kept ${(r.stability.worst * 100).toFixed(0)}% of the score` : "no active setting to nudge"}>
                      {r.stability ? `${Math.round(r.stability.share * 100)}%` : "—"}
                    </td>
                    <td className={cell}>
                      {!isCurrent && (
                        <button type="button" onClick={() => onApply(c)} className={clsx(TOOLBAR_BUTTON_BASE, TOOLBAR_BUTTON_ACTIVE)} title="Write this setting into the toolbar">APPLY</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
            {multiCols
              ? "ALL WINDOWS: the score is the mean of the per-day results over the windows, so a setting must earn on the short ones too - but the windows are nested, so they are not independent evidence. Read the per-window P&L: a red window is where it does not hold. "
              : hasTest
                ? `TRAIN columns are the oldest days the search tuned on; TEST columns are the newest ${testDays} days it never saw. HOLD = test average per trade / train average: near or above 100% means the edge carried over, far below (or red) means it was fitted to noise. APPLY puts the setting on the WHOLE window, so the page shows train + test together. `
                : "Chosen on the very trades it is scored on, so read OLDER ½ / NEWER ½ before trusting a row: a setting whose gain sits in only one half is a fit to noise, not an edge. "}
            STABLE = share of one-step-away settings that keep at least 80% of the score: high is a plateau, low is a needle that only these exact thresholds hit. 
            One best setting per entry unit; found by coordinate search, so a good local optimum, not a proven global one.
          </div>
        </div>
      )}
    </GlassCard>
  );
}
