"use client";

import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

/**
 * Which rating table judges each replayed day - TABLE (ASOF / EXPO / LIVE), FROZEN (the snowflake) and
 * CORE - as ONE icon menu beside the RATE button, instead of two capsules of words.
 *
 * (The operator's own instruction, 2026-11-22: "біля кнопки RATE ... вибір типу, замороженого, core, теж
 * через іконку".) A first version also drew the chosen icons INSIDE the RATE button; the operator then asked
 * for those to come out and for RATE to be a plain on/off button (amber / gray, always the word "RATE"). So
 * the only sign of a non-default choice now is this trigger lighting up amber - ASOF + not frozen + no CORE
 * is the DEFAULT and leaves it dark. LIVE (which flatters the past) and CORE (which measured no edge) are
 * the two worth noticing, and the tooltip of each menu entry says what it is.
 *
 * The menu is drawn through a portal, positioned from the trigger's rect with INLINE position/z-index:
 * the toolbar sits in a backdrop-blurred card (its own stacking context, so a child popover would be
 * painted UNDER the cards that follow it) and themes.css forces `position: relative; z-index: 1` on every
 * direct child of <body>, which beats utility classes.
 *
 * The text of each tooltip is the one the old capsules carried, unchanged - the measurements it quotes
 * (CORE: 65 sessions, per-ticker persistence corr +0.006) are the reason CORE is off by default.
 */
export type RatingMode = "live" | "asof" | "asofew";

const SVG = {
  "aria-hidden": true as const,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconFn = (size: number) => React.ReactNode;

// ASOF: a clock with a rewind arrow - judged from what was known BEFORE the day.
const IconAsOf: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);
// EXPO: an exponential decay curve - recent weeks weigh more, old ones fade.
const IconExpo: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <path d="M3 5c5 0 7 12 18 14" />
    <path d="M3 21h18" />
  </svg>
);
// LIVE: a broadcast dot with rings - today's published table.
const IconLive: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <circle cx="12" cy="12" r="2" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </svg>
);
// FROZEN: a snowflake - every day judged as of itself.
const IconFrozen: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
    <path d="m9.5 4 2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />
  </svg>
);
// CORE: a target - only the consistently-good centre of the universe.
const IconCore: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" />
  </svg>
);
const IconOptions: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
    <path d="M14 2v4M8 10v4M16 18v4" />
  </svg>
);

const MODES: ReadonlyArray<{ key: RatingMode; icon: IconFn; tone: string; on: string; title: string }> = [
  {
    key: "asof",
    icon: IconAsOf,
    tone: "text-[#6ee7b7]/70 hover:text-[#6ee7b7]",
    on: "border-[#6ee7b7]/50 bg-[#6ee7b7]/15 text-[#6ee7b7]",
    title:
      "ASOF — each replayed day is judged ONLY by trades dated before it, recomputed from the published trade log. No look-ahead, and a day's result never changes again. Default.",
  },
  {
    key: "asofew",
    icon: IconExpo,
    tone: "text-violet-300/70 hover:text-violet-200",
    on: "border-violet-400/50 bg-violet-500/15 text-violet-200",
    title:
      "EXPO — AS-OF exponential: the same situations AS-OF counts, rated differently. Sessions are grouped into blocks of 5; every trade inside a block weighs the same, and each block back from the replayed day weighs half as much every 4 blocks (1.00 / 0.84 / 0.71 / 0.59 / 0.50 / ... ~0.13 at three months). Fresh weeks carry the rate; the situation count, MINTOTAL and the evidence needed for gamma are untouched, and the day's own result never leaks in.",
  },
  {
    key: "live",
    icon: IconLive,
    tone: "text-[#f3a6b2]/70 hover:text-[#f3a6b2]",
    on: "border-[#f3a6b2]/50 bg-[#f3a6b2]/15 text-[#f3a6b2]",
    title:
      "LIVE — TODAY's ratings applied to every replayed day. Answers 'what would today's knowledge have done' — and is why a losing day can later show as positive. Not a record of what happened.",
  },
];

const MODE_BY_KEY = Object.fromEntries(MODES.map((m) => [m.key, m])) as Record<RatingMode, (typeof MODES)[number]>;

const FROZEN_TITLE = {
  on: "FROZEN on — every day is judged as of ITSELF. LIVE reads the snapshot taken that morning; ASOF and EXPO cut the trade log at each day, so nothing a day could not have known reaches it. Click for one table over the whole range.",
  off: "FROZEN off — one table for the whole range. LIVE is today's published file, ASOF the whole trade log, EXPO the whole log weighted toward its newest session. Click to measure each day as of itself.",
};
const CORE_TITLE = {
  on: "CORE on — only the consistently-good tickers (depth + breadth + positive in every trailing window + shrunk LB > 0, sticky once in), rebuilt as of each day. NOTE: measured on 65 sessions this list showed NO edge — per-ticker persistence is corr +0.006 and tighter screening came out worse. The stability is real, the edge is not. Click for the full universe.",
  off: "CORE off — every ticker the rating mode admits. Click to restrict to the consistently-good list of tickers that have performed well CONSISTENTLY, not merely on average.",
};

const NARROW_TITLE = {
  on: "NRRW — a situation counts as successful when the deviation at the class close is SMALLER than it was at entry (it narrowed), instead of having to normalise fully. Click for the published NORM rule.",
  off: "NORM — the published rule: (hard + soft) / total, i.e. the event had to normalise. Click to score instead on whether the deviation narrowed (NRRW).",
};
// NRRW: two arrows closing in on each other.
const IconNarrow: IconFn = (s) => (
  <svg {...SVG} width={s} height={s} className="shrink-0">
    <path d="M3 5l6 7-6 7M21 5l-6 7 6 7" />
  </svg>
);

const PANEL_W = 196;

export function RatingModeMenu({
  mode,
  setMode,
  frozen,
  setFrozen,
  core,
  setCore,
  narrow,
  setNarrow,
}: {
  mode: RatingMode;
  setMode: (m: RatingMode) => void;
  frozen: boolean;
  setFrozen: (v: boolean) => void;
  core: boolean;
  setCore: (v: boolean) => void;
  /** Arbitrage only: the second, independent success rule (NRRW = the deviation must have SHRUNK, instead of
   *  normalised). Omit both and the menu has no such entry. */
  narrow?: boolean;
  setNarrow?: (v: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.max(8, Math.min(window.innerWidth - PANEL_W - 8, r.left)),
      top: r.bottom + 8,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (panelRef.current?.contains(t) || btnRef.current?.contains(t))) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, place]);

  const dirty = mode !== "asof" || frozen || core || !!narrow;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Rating options: table (ASOF / EXPO / LIVE), FROZEN, CORE"
        title="Rating options — which table judges each day (ASOF / EXPO / LIVE), FROZEN (each day as of itself) and CORE (only the consistently-good tickers). What is chosen shows as icons next to RATE."
        className={clsx(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
          open || dirty
            ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
            : "border-transparent bg-black/20 text-zinc-400 hover:bg-white/5 hover:text-white"
        )}
      >
        {IconOptions(14)}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/90 p-2.5 shadow-xl backdrop-blur-xl"
              style={{
                position: "fixed",
                zIndex: 2147482000,
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                width: PANEL_W,
                visibility: pos ? "visible" : "hidden",
              }}
            >
              <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-500">Table</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === m.key}
                    aria-label={m.key === "asofew" ? "EXPO" : m.key.toUpperCase()}
                    title={m.title}
                    onClick={() => setMode(m.key)}
                    className={clsx(
                      "inline-flex h-8 flex-1 items-center justify-center rounded-lg border transition-all",
                      mode === m.key ? m.on : clsx("border-transparent hover:bg-white/5", m.tone)
                    )}
                  >
                    {m.icon(16)}
                  </button>
                ))}
              </div>

              <div className="mt-2.5 text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-500">Options</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={frozen}
                  aria-label="FROZEN"
                  title={frozen ? FROZEN_TITLE.on : FROZEN_TITLE.off}
                  onClick={() => setFrozen(!frozen)}
                  className={clsx(
                    "inline-flex h-8 flex-1 items-center justify-center rounded-lg border transition-all",
                    frozen
                      ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
                      : "border-transparent text-sky-300/70 hover:bg-white/5 hover:text-sky-200"
                  )}
                >
                  {IconFrozen(16)}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={core}
                  aria-label="CORE"
                  title={core ? CORE_TITLE.on : CORE_TITLE.off}
                  onClick={() => setCore(!core)}
                  className={clsx(
                    "inline-flex h-8 flex-1 items-center justify-center rounded-lg border transition-all",
                    core
                      ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                      : "border-transparent text-amber-300/70 hover:bg-white/5 hover:text-amber-200"
                  )}
                >
                  {IconCore(16)}
                </button>
                {setNarrow ? (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!!narrow}
                    aria-label="NRRW"
                    title={narrow ? NARROW_TITLE.on : NARROW_TITLE.off}
                    onClick={() => setNarrow(!narrow)}
                    className={clsx(
                      "inline-flex h-8 flex-1 items-center justify-center rounded-lg border transition-all",
                      narrow
                        ? "border-lime-400/50 bg-lime-500/15 text-lime-200"
                        : "border-transparent text-lime-300/70 hover:bg-white/5 hover:text-lime-200"
                    )}
                  >
                    {IconNarrow(16)}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/**
 * State behind RatingModeMenu for a scanner that has no rating-table state of its own: which table judges
 * each day (ASOF by default), FROZEN (each day as of itself) and CORE. The three are sent to the bridge as
 * `ratingsMode` / `ratingsFrozen` / `coreOnly` (PaperStrategyRequest), and are part of that strategy's
 * variant key, so flipping one can never be answered from a day built under another.
 */
export function useRatingModes() {
  const [ratingsMode, setRatingsMode] = React.useState<RatingMode>("asof");
  const [ratingsFrozen, setRatingsFrozen] = React.useState(false);
  const [coreOnly, setCoreOnly] = React.useState(false);
  return { ratingsMode, setRatingsMode, ratingsFrozen, setRatingsFrozen, coreOnly, setCoreOnly };
}
