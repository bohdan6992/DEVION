"use client";

import React from "react";
import clsx from "clsx";

/**
 * The ACTIVE / INACTIVE / ALL strip's look: the four class strings `FilterRatingRow` takes and the
 * icon each of its three buttons draws.
 *
 * Every Sonar carried a byte-identical copy of these six class literals plus a ~60-line
 * `renderSonarActiveFilterIcon` — twenty copies, verified identical by hash on 2026-11-14. They had
 * not drifted yet, which is the only reason this could be lifted out cleanly; the Scout pages now
 * render the same strip, and a twenty-first copy is exactly how `styles.ts`'s own README says these
 * things start to diverge.
 *
 * The two inputs are the caller's theme state, not defaults here: `accentButtonClass` is the
 * per-strategy accent the surrounding page already computed, and the light theme is a page-level
 * flag. Everything else is fixed.
 */
export type ActiveStripClasses = {
  stripClass: string;
  buttonBaseClass: string;
  buttonActiveClass: string;
  buttonInactiveClass: string;
  iconClass: string;
  activeIconClass: string;
};

export function activeStripClasses(isLightTheme: boolean, accentButtonClass: string): ActiveStripClasses {
  return {
    stripClass: "flex items-center gap-1.5 self-start",
    buttonBaseClass:
      "inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[11px] font-mono font-bold uppercase leading-none transition-all",
    buttonActiveClass: accentButtonClass,
    buttonInactiveClass: isLightTheme
      ? "border border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.05]"
      : "border border-transparent text-[#8b8d97] hover:text-[#cfd1d8] hover:bg-white/[0.03]",
    iconClass: isLightTheme ? "text-slate-400" : "text-[#8f919b]",
    activeIconClass: "text-current",
  };
}

const SVG = {
  "aria-hidden": true as const,
  width: "12",
  height: "12",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * -> the `renderActiveIcon` callback `FilterRatingRow` expects. A lightning bolt for ACTIVE, a
 * struck-through bell for INACTIVE, bars for ALL — unchanged from the Sonars' own copy.
 */
export function makeActiveStripIcon(c: ActiveStripClasses) {
  return function renderActiveStripIcon(kind: "active" | "inactive" | "all", active: boolean): React.ReactNode {
    const className = clsx("shrink-0", active ? c.activeIconClass : c.iconClass);
    switch (kind) {
      case "active":
        return (
          <svg {...SVG} className={className}>
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
          </svg>
        );
      case "inactive":
        return (
          <svg {...SVG} className={className}>
            <path d="M4 4l16 16" />
            <path d="M10.6 10.6A2 2 0 0 0 14 12V7a3 3 0 0 0-6 0v10a3 3 0 0 0 5.1 2.1" />
          </svg>
        );
      default:
        return (
          <svg {...SVG} className={className}>
            <path d="M5 20V10" />
            <path d="M12 20V4" />
            <path d="M19 20v-7" />
          </svg>
        );
    }
  };
}
