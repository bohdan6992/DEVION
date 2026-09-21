import React from "react";
import Link from "next/link";
import clsx from "clsx";
import { GlitchTitle } from "../../../ui/GlitchTitle";
import type { PaperListMode, PrimaryPanelKey } from "../../../../lib/scanner/types";

/**
 * The header shared by Scanner AND Sonar: title, STREAM/SCANNER/SONAR nav, the IGN/APP/PIN
 * list-mode group and the RUN button. Identical for every strategy, so prop names match the
 * identifiers the scanner components already use and the markup is unchanged.
 *
 * The Sonars carried their own 215-line copy of this, which had drifted: no icons beside the nav
 * labels, and a boxed refresh button instead of the bare one. `primaryPanel` accepts "sonar" so
 * the third link can be the current page.
 */
export type ScannerHeaderProps = {
  scannerShellTitle: string;
  headerNavGroupClass: string;
  headerNavInactiveClass: string;
  navStreamHref: string;
  navScannerHref: string;
  navSonarHref: string;
  /** Renders a fourth SCOUT link when set; only Arbitrage has a Scout page. */
  navScoutHref?: string;
  /** "sonar" marks the third link as the current page; the Scanner never passes it. */
  primaryPanel: PrimaryPanelKey | "sonar";
  listMode: PaperListMode;
  ignCount: number;
  appCount: number;
  pinCount: number;
  showIgnore: boolean;
  showApply: boolean;
  showPin: boolean;
  setShowIgnore: (v: boolean) => void;
  setShowApply: (v: boolean) => void;
  setShowPin: (v: boolean) => void;
  setShowAdvanced: (v: boolean) => void;
  setModeIgnore: () => void;
  setModeApply: () => void;
  setModePin: () => void;
  canRun: boolean;
  run: () => void;
  variantString: string;
  /** Spins the RUN icon while a fetch is in flight. The Sonar uses it for its reconnect. */
  busy?: boolean;
};

export default function ScannerHeader({
  scannerShellTitle,
  headerNavGroupClass,
  headerNavInactiveClass,
  navStreamHref,
  navScannerHref,
  navSonarHref,
  navScoutHref,
  primaryPanel,
  listMode,
  ignCount,
  appCount,
  pinCount,
  showIgnore,
  showApply,
  showPin,
  setShowIgnore,
  setShowApply,
  setShowPin,
  setShowAdvanced,
  setModeIgnore,
  setModeApply,
  setModePin,
  canRun,
  run,
  variantString,
  busy = false,
}: ScannerHeaderProps) {
  return (
    <header className="scanner-header-surface bg-[#0a0a0a]/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
      <div className="flex items-center gap-3">
        <GlitchTitle text={scannerShellTitle} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className={headerNavGroupClass}>
          <Link
            href={navStreamHref}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5",
              primaryPanel === "stream"
                ? "accent-soft"
                : headerNavInactiveClass
            )}
            title={primaryPanel === "stream" ? "STREAM (current)" : "Open STREAM"}
          >
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            STREAM
          </Link>
          <Link
            href={navScannerHref}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5",
              primaryPanel === "scanner"
                ? "accent-soft"
                : headerNavInactiveClass
            )}
            title={primaryPanel === "scanner" ? "SCANNER (current)" : "Open SCANNER"}
          >
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            SCANNER
          </Link>
          <Link
            href={navSonarHref}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5",
              primaryPanel === "sonar" ? "accent-soft" : headerNavInactiveClass
            )}
            title={primaryPanel === "sonar" ? "SONAR (current)" : "Open SONAR"}
          >
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            SONAR
          </Link>
          {navScoutHref && (
            <Link
              href={navScoutHref}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border flex items-center gap-1.5",
                headerNavInactiveClass
              )}
              title="Open SCOUT"
            >
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
              </svg>
              SCOUT
            </Link>
          )}
        </div>

        <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20">
          <div
            className={clsx(
              "flex items-stretch overflow-hidden rounded-lg border transition-all",
              listMode === "ignore" ? "border-rose-500/30 bg-rose-500/12" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <button
              type="button"
              onClick={() => {
                setModeIgnore();
                setShowAdvanced(true);
              }}
              className={clsx(
                "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                listMode === "ignore" ? "text-rose-300" : "text-zinc-300"
              )}
              title="LIST MODE: IGNORE"
            >
              <span className="tracking-wide">IGN</span>
              {ignCount > 0 && <span className="opacity-70">({ignCount})</span>}
            </button>
            <div className="w-px bg-white/10" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !showIgnore;
                setShowIgnore(next);
                if (next) setShowAdvanced(true);
              }}
              className={clsx(
                "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                showIgnore ? "text-rose-300" : "text-zinc-400 hover:text-white"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showIgnore ? "" : "opacity-80"}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          <div
            className={clsx(
              "flex items-stretch overflow-hidden rounded-lg border transition-all",
              listMode === "apply" ? "border-emerald-500/25 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <button
              type="button"
              onClick={() => {
                setModeApply();
                setShowAdvanced(true);
              }}
              className={clsx(
                "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                listMode === "apply" ? "text-emerald-300" : "text-zinc-300"
              )}
              title="LIST MODE: APPLY"
            >
              <span className="tracking-wide">APP</span>
              {appCount > 0 && <span className="opacity-70">({appCount})</span>}
            </button>
            <div className="w-px bg-white/10" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !showApply;
                setShowApply(next);
                if (next) setShowAdvanced(true);
              }}
              className={clsx(
                "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                showApply ? "text-emerald-300" : "text-zinc-400 hover:text-white"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showApply ? "" : "opacity-80"}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          <div
            className={clsx(
              "flex items-stretch overflow-hidden rounded-lg border transition-all",
              listMode === "pin" ? "border-violet-400/30 bg-violet-400/12" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <button
              type="button"
              onClick={() => {
                setModePin();
                setShowAdvanced(true);
              }}
              className={clsx(
                "px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-2",
                listMode === "pin" ? "text-violet-200" : "text-zinc-300"
              )}
              title="LIST MODE: PIN"
            >
              <span className="tracking-wide">PIN</span>
              {pinCount > 0 && <span className="opacity-70">({pinCount})</span>}
            </button>
            <div className="w-px bg-white/10" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !showPin;
                setShowPin(next);
                if (next) setShowAdvanced(true);
              }}
              className={clsx(
                "px-2.5 py-1.5 flex items-center justify-center transition-colors group",
                showPin ? "text-violet-300" : "text-zinc-400 hover:text-white"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showPin ? "" : "opacity-80"}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className={clsx(
            "h-7 w-7 flex items-center justify-center rounded-full transition-all active:scale-95",
            canRun
              ? "accent-text hover:opacity-80"
              : "text-zinc-600 cursor-not-allowed"
          )}
          title={variantString}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={busy ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>

      </div>
    </header>
  );
}
