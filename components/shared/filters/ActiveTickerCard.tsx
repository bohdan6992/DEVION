"use client";

import React from "react";

/**
 * The active-ticker card: the strip under the filter toolbar that names the selected ticker and
 * its headline stats, with the IGN/APP/PIN buttons and the expand/collapse controls.
 *
 * Shared by Sonar, Scanner and Stream. The stats are passed as a LIST rather than as named props
 * because the three surfaces know different things about a ticker — Sonar has the rating pair,
 * Stream has the live decision row, Scanner has the episode's static block. A fixed set of props
 * would have forced every surface to fake the fields it cannot fill.
 *
 * The expanded body is `children`: it is genuinely surface-specific (Sonar renders a 9-column live
 * snapshot grid), and pretending otherwise would push a giant conditional in here.
 */

export type ActiveTickerStat = {
  label: string;
  /** Already formatted. The card does no numeric formatting — surfaces disagree on precision. */
  value: React.ReactNode;
  /** Renders in the surface's accent colour rather than the default zinc. */
  accent?: boolean;
};

export type ActiveTickerListActions = {
  inIgnore: boolean;
  inApply: boolean;
  pinned: boolean;
  onToggleIgnore: () => void;
  onToggleApply: () => void;
  onTogglePin: () => void;
};

export type ActiveTickerCardProps = {
  ticker: string | null;
  stats: ActiveTickerStat[];
  loading?: boolean;
  error?: string | null;
  /** Omit on a surface with no ticker lists — the three buttons then do not render at all. */
  lists?: ActiveTickerListActions | null;
  /** Omit to hide the EXPAND/MINI button. */
  expanded?: { value: boolean; onToggle: () => void } | null;
  /** Omit to hide the eye button. */
  collapsed?: { value: boolean; onToggle: () => void } | null;
  accentLineClass?: string;
  accentTextClass?: string;
  /** The expanded body, rendered below the strip when `collapsed` is false or absent. */
  children?: React.ReactNode;
};

const BUTTON_BASE =
  "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
const BUTTON_IDLE = "border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.05]";
const BUTTON_DISABLED = "border-white/10 text-zinc-600 opacity-50 cursor-not-allowed";

function ListButton({
  label,
  active,
  activeClass,
  disabled,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={[BUTTON_BASE, disabled ? BUTTON_DISABLED : active ? activeClass : BUTTON_IDLE].join(" ")}
    >
      {label}
    </button>
  );
}

export default function ActiveTickerCard({
  ticker,
  stats,
  loading,
  error,
  lists,
  expanded,
  collapsed,
  accentLineClass = "bg-white/20",
  accentTextClass = "text-zinc-200",
  children,
}: ActiveTickerCardProps) {
  const disabled = !ticker;

  return (
    <div className="relative overflow-hidden border border-white/10 rounded-2xl bg-black/40 animate-in fade-in zoom-in-95 duration-300">
      <div className={`absolute inset-y-0 left-0 w-px ${accentLineClass}`} />
      <div className="relative flex flex-col gap-3 px-4 py-3 border-b border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex flex-col gap-2 lg:justify-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-lg leading-none font-mono font-semibold tracking-[0.08em] text-white">
              {ticker ?? "-"}
            </span>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
              {stats.map((stat) => (
                <span key={stat.label}>
                  {stat.label}: <span className={stat.accent ? accentTextClass : "text-zinc-200"}>{stat.value}</span>
                </span>
              ))}
            </div>
          </div>

          {loading && (
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500 animate-pulse">
              loading data stream...
            </div>
          )}
          {error && (
            <div className="w-fit text-[11px] text-rose-300 font-mono bg-rose-500/10 px-2 py-1 border border-rose-500/20">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
          {lists && (
            <>
              <ListButton
                label="IGN"
                active={lists.inIgnore}
                activeClass="border-rose-500/35 bg-rose-500/12 text-rose-300"
                disabled={disabled}
                title={lists.inIgnore ? "Remove ticker from Ignore List" : "Add ticker to Ignore List"}
                onClick={lists.onToggleIgnore}
              />
              <ListButton
                label="APP"
                active={lists.inApply}
                activeClass="border-[#6ee7b7]/35 bg-[#6ee7b7]/12 text-[#6ee7b7]"
                disabled={disabled}
                title={lists.inApply ? "Remove ticker from Apply Only List" : "Add ticker to Apply Only List"}
                onClick={lists.onToggleApply}
              />
              <ListButton
                label="PIN"
                active={lists.pinned}
                activeClass="border-violet-500/35 bg-violet-500/12 text-violet-200"
                disabled={disabled}
                title={lists.pinned ? "Remove ticker from Pin List" : "Add ticker to Pin List"}
                onClick={lists.onTogglePin}
              />
            </>
          )}

          {expanded && (
            <button type="button" onClick={expanded.onToggle} className={`${BUTTON_BASE} ${BUTTON_IDLE}`}>
              {expanded.value ? "MINI" : "EXPAND"}
            </button>
          )}

          {collapsed && (
            <button
              type="button"
              onClick={collapsed.onToggle}
              title={collapsed.value ? "Show Panel" : "Collapse Panel"}
              className="inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-[10px] font-mono text-zinc-300 hover:bg-white/[0.05] transition-colors group"
            >
              {collapsed.value ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-rose-400 transition-colors">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {(!collapsed || !collapsed.value) && children}
    </div>
  );
}
