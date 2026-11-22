"use client";

import React from "react";
import clsx from "clsx";
import { GlassSelect } from "../../shared/ui";
import { TOOLBAR_BUTTON_ACTIVE } from "../../../shared/filters/styles";
import { deleteSharedFilterLocalPreset, getSharedFilterLocalPreset, listSharedFilterLocalPresets } from "../../../../lib/presets/sharedFilterLocalPresets";
import { isSharedFilterPreset } from "../../../../lib/presets/sharedFilterPreset";
import type { ScannerFilterBag } from "../../../../lib/scanner/filterState";

/**
 * The control card under a scanner's filter rows: the strategy's OWN class/mode buttons on the left
 * (`children` - the only part that differs between scanners), then the PRESET bar (pick / SAVE / DEL) and
 * the eye that shows or hides the shared min-max boxes.
 *
 * Why this exists (the operator's own question, 2026-11-22: "can you make one shared element for all
 * scanners, changing only some details?"): the preset bar (5.6 KB of JSX) and the eye were pasted into 20
 * scanners and were byte-identical in 18 of them - measured with a TypeScript-AST comparison, not by eye. So a
 * change like "make this card smaller" had to be made 20 times, and the first version of it was made once.
 * Everything that is per-scanner stays in the caller: the class buttons (`children`) and the three functions
 * that know how THAT scanner's filters serialise into a preset.
 *
 * The state (`scannerPresets`, the busy / save-mode / draft flags, `showSharedMinMax`) comes in through
 * `filters` - it already lives in useScannerFilters, the same bag ExecutionSettingsPanel takes. Only the
 * selected preset id is scanner-local state, so it is passed on its own.
 *
 * The card is p-0.5 / rounded-xl: 3px from the h-7 controls on every side, the same inset every filter group
 * has (FILTER_GROUP_BASE) - the operator's own instruction, 2026-11-22.
 */
export default function ScannerControlCard({
  children,
  filters,
  presetId: scannerPresetId,
  setPresetId: setScannerPresetId,
  saveCurrentScannerPreset,
  applyScannerPreset,
  clearScannerSharedFilters,
}: {
  /** The strategy's own class / mode buttons - rendered at the left edge. */
  children?: React.ReactNode;
  filters: ScannerFilterBag;
  presetId: string;
  setPresetId: (id: string) => void;
  /** Serialise THIS scanner's current filters into a preset under `name`. */
  saveCurrentScannerPreset: (name: string) => unknown;
  /** Apply a preset to THIS scanner's filters; true when it was applied. */
  applyScannerPreset: (preset: any) => boolean;
  /** Reset THIS scanner's shared filters (the NONE entry of the preset list). */
  clearScannerSharedFilters: () => void;
}) {
  const {
    scannerPresets,
    setScannerPresets,
    scannerPresetBusy,
    setScannerPresetBusy,
    scannerPresetSaveMode,
    setScannerPresetSaveMode,
    scannerPresetDraftName,
    setScannerPresetDraftName,
    setScannerPresetStatus,
    showSharedMinMax,
    setShowSharedMinMax,
  } = filters;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0a0a0a]/50 p-0.5 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-[#0a0a0a]/70">
      {children}

      <div className="flex-1" />

      <div className="flex h-7 items-center gap-2 pl-3 pr-2 rounded-lg bg-black/20">
        <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">PRESET</span>
        {scannerPresetSaveMode ? (
          <input
            type="text"
            value={scannerPresetDraftName}
            onChange={(e) => setScannerPresetDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!scannerPresetBusy) void saveCurrentScannerPreset(scannerPresetDraftName);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setScannerPresetSaveMode(false);
                setScannerPresetDraftName("");
              }
            }}
            autoFocus
            placeholder="NAME..."
            className="h-7 min-w-[112px] bg-transparent border-0 text-[10px] font-mono uppercase text-zinc-300 placeholder:text-zinc-600 outline-none focus:outline-none"
          />
        ) : (
          <GlassSelect
            value={scannerPresetId}
            onChange={async (e) => {
              const nextId = e.target.value;
              setScannerPresetId(nextId);
              if (!nextId) {
                clearScannerSharedFilters();
                return;
              }
              if (scannerPresetBusy || scannerPresetSaveMode) return;
              setScannerPresetBusy(true);
              try {
                const preset = getSharedFilterLocalPreset(nextId);
                if (preset && applyScannerPreset(preset)) return;
                const fallbackPreset = scannerPresets.find((x) => x.id === nextId);
                if (fallbackPreset && applyScannerPreset(fallbackPreset)) return;
                setScannerPresetStatus("Apply failed");
              } catch {
                setScannerPresetStatus("Apply failed");
              } finally {
                setScannerPresetBusy(false);
              }
            }}
            options={[
              { value: "", label: "NONE" },
              ...scannerPresets.map((preset) => ({
                value: preset.id,
                label: preset.name.toUpperCase(),
              })),
            ]}
            compact
            panelOffsetX={-42}
            panelWidth={124}
            className="w-[92px] !h-7 !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (scannerPresetSaveMode) {
              if (!scannerPresetBusy) void saveCurrentScannerPreset(scannerPresetDraftName);
              return;
            }
            setScannerPresetSaveMode(true);
            setScannerPresetDraftName("");
          }}
          disabled={scannerPresetBusy}
          className={clsx(
            "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
            scannerPresetBusy
              ? "border-transparent text-zinc-600"
              : scannerPresetSaveMode
                ? TOOLBAR_BUTTON_ACTIVE
                : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          SAVE
        </button>
        <button
          type="button"
          onClick={() => {
            if (!scannerPresetId || scannerPresetBusy || scannerPresetSaveMode) return;
            const ok = deleteSharedFilterLocalPreset(scannerPresetId);
            if (!ok) {
              setScannerPresetStatus("Delete failed");
              return;
            }
            const items = listSharedFilterLocalPresets().filter((x) => {
              if (x.scope !== "BOTH") return false;
              try {
                return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
              } catch {
                return false;
              }
            });
            setScannerPresets(items);
            setScannerPresetId(items[0]?.id ?? "");
            setScannerPresetStatus("Deleted");
          }}
          disabled={!scannerPresetId || scannerPresetBusy || scannerPresetSaveMode}
          className={clsx(
            "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
            scannerPresetId && !scannerPresetBusy && !scannerPresetSaveMode
              ? "border-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              : "border-transparent text-zinc-600"
          )}
        >
          DEL
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowSharedMinMax((v) => !v)}
        className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
        title={showSharedMinMax ? "Hide shared filters" : "Show shared filters"}
      >
        {showSharedMinMax ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="group-hover:text-rose-400 transition-colors"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        )}
      </button>
    </div>
  );
}
