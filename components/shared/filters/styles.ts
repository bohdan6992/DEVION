/**
 * Styling for the filter toolbar shared by Sonar, Scanner and Stream.
 *
 * These were three separate copies of the same three strings (one per Sonar, plus the Scanner's
 * own inline variants). They live here now so a change to the toolbar's look lands on every
 * surface at once, which is the whole point of the shared row.
 */

export const FILTER_GROUP_BASE = "inline-flex items-center gap-2 rounded-xl border p-1.5";

export const FILTER_PILL =
  "inline-flex h-7 items-center justify-center rounded-lg border px-3 py-0 text-[10px] font-mono font-bold uppercase leading-none transition-all";

export const FILTER_INPUT =
  "h-7 rounded-lg border px-3 py-0 text-[11px] font-mono text-center tabular-nums leading-none transition-all focus:outline-none";

/** Per-group colouring. Keyed by the group's role, not by its colour, so the palette can move. */
export const FILTER_GROUP_TONES = {
  exclude: {
    group: "border-rose-500/20 bg-rose-500/[0.06]",
    on: "bg-rose-500 text-white border-transparent shadow-[0_0_16px_rgba(244,63,94,0.42)]",
    off: "bg-transparent border-transparent text-rose-500 hover:bg-rose-500/10",
  },
  report: {
    group: "border-pink-500/25 bg-pink-500/[0.07]",
    on: "bg-pink-500 text-white border-transparent shadow-[0_0_16px_rgba(236,72,153,0.42)]",
    off: "bg-transparent border-transparent text-pink-400 hover:bg-pink-500/10",
  },
  region: {
    group: "border-[rgba(6,78,59,0.55)] bg-[rgba(6,78,59,0.18)]",
    on: "bg-[rgba(16,185,129,0.95)] text-white border-transparent shadow-[0_0_16px_rgba(16,185,129,0.36)]",
    off: "bg-transparent border-transparent text-[#34d399] hover:bg-[rgba(16,185,129,0.10)]",
  },
  select: {
    group: "border-yellow-200/20 bg-yellow-200/[0.06]",
    on: "",
    off: "",
  },
  sort: {
    group: "border-sky-500/20 bg-sky-500/[0.06]",
    on: "",
    off: "",
  },
  zap: {
    group: "border-violet-500/20 bg-violet-500/[0.06]",
    on: "bg-violet-500 text-white border-transparent shadow-[0_0_16px_rgba(139,92,246,0.36)]",
    off: "bg-transparent border-transparent text-violet-300/70 hover:bg-violet-500/10 hover:text-violet-200",
  },
} as const;

export type FilterGroupRole = keyof typeof FILTER_GROUP_TONES;

/**
 * Toolbar toggle: the class/mode/type pills (GLOB…POST, ALL/TOP, ANY/HARD/SOFT).
 *
 * Deliberately the SAME look as the STREAM/SCANNER/SONAR nav — a neutral base with `accent-soft`
 * for the active one. It lived as four copies with two different active styles (`accent-chip` on
 * one surface, `accent-soft` on the other), which is why the same row read differently depending
 * on the page.
 */
export const TOOLBAR_BUTTON_BASE =
  "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border";
export const TOOLBAR_BUTTON_ACTIVE = "accent-soft";
export const TOOLBAR_BUTTON_INACTIVE =
  "border-transparent text-zinc-400 hover:text-white hover:bg-white/5";

/** Convenience for the common `active ? … : …` call sites. */
export function toolbarButtonClass(active: boolean): string {
  return `${TOOLBAR_BUTTON_BASE} ${active ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE}`;
}
