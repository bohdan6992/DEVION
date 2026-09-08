"use client";

/**
 * The one panel shell every Caesar section wears.
 *
 * WHY IT EXISTS. Caesar grew a section at a time, and each one invented its own frame: rounded-2xl
 * here, /50 there, /60 in the terminal, a header that was sometimes bordered and sometimes not.
 * Four frames that are ALMOST the same read as four unrelated widgets stacked on one page — the
 * eye spends its effort on the boxes instead of on what is in them.
 *
 * WHAT IT COPIES. The stream boards, exactly: one flat panel, and a title bar that is a SURFACE
 * (a darker step of the panel colour + backdrop blur) rather than a rule — so the head reads as part of the panel
 * and the body below it is the only thing with contrast. `scanner-panel-surface` is carried too,
 * because that is the class the borderless and light themes key off; without it a Caesar panel is
 * the one thing on screen that ignores those toggles.
 *
 * The accent is a 2px cap on the title bar and a dot beside the name. It is IDENTITY, not status:
 * the same section keeps the same accent whatever it is reporting.
 */

import React from "react";

export type CaesarPanelProps = {
  title: string;
  /** The quiet second line on the same row — segment, account, mode. */
  subtitle?: React.ReactNode;
  /** Hex. Colours the dot and the hairline cap. Identity of the section, never its state. */
  accent?: string;
  /** Controls that belong to the panel, right-aligned in the title bar. */
  right?: React.ReactNode;
  /** Extra bits under the title, on their own row — the terminal's pipeline legend lives here. */
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * OPAQUE ENOUGH TO BE DARK ON A LIGHT THEME. Caesar is documented as rendering on a dark surface in
 * every theme — the segment fills and the glitch title are both tuned against black — but the panel
 * is the only thing supplying that darkness, so its alpha has to hold up over a pale or gradient
 * page background, not just over the dark ones. /75 does; the /40 a stream board can afford does
 * not, because a stream board sits inside a shell that is already dark.
 */
export const CAESAR_PANEL_SURFACE =
  "scanner-panel-surface overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0a0a]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl";

export default function CaesarPanel({
  title,
  subtitle,
  accent = "#3987e5",
  right,
  meta,
  className,
  children,
}: CaesarPanelProps) {
  return (
    <section className={CAESAR_PANEL_SURFACE + (className ? ` ${className}` : "")}>
      <header
        className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-[#0a0a0a]/80 px-3 py-2 backdrop-blur-xl"
        style={{ boxShadow: `inset 0 1px 0 ${accent}1f` }}
      >
        {/* The cap: a 2px run of the accent along the top of the title bar, faded out to the right
            so it reads as a highlight rather than a border. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}00 62%)` }}
        />
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}80` }}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-300">
              {title}
            </span>
          </span>
          {subtitle != null && (
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {subtitle}
            </span>
          )}
          {meta}
        </div>
        {right != null && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * The explanatory strip at the foot of a panel. Same tone everywhere, so a paragraph of prose never
 * competes with the numbers above it.
 */
export function CaesarPanelNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-white/[0.05] bg-black/20 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/30">
      {children}
    </div>
  );
}

/** The stream boards' toolbar button, so every control on the page depresses the same way. */
export const CAESAR_PILL =
  "rounded-lg border border-transparent px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-all";

export const CAESAR_PILL_IDLE = " text-zinc-500 hover:bg-white/5 hover:text-zinc-200";
export const CAESAR_PILL_ON = " border-white/10 bg-white/10 text-zinc-100";
