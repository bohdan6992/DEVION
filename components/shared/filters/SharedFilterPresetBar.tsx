"use client";

import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { GlassSelect } from "../../scanner/shared/ui";
import { TOOLBAR_BUTTON_ACTIVE } from "./styles";
import { isSharedFilterPreset } from "../../../lib/presets/sharedFilterPreset";
import {
  SHARED_FILTER_PRESETS_CHANGED_EVENT,
  deleteSharedFilterLocalPreset,
  getSharedFilterLocalPreset,
  listSharedFilterLocalPresets,
  saveSharedFilterLocalPreset,
} from "../../../lib/presets/sharedFilterLocalPresets";

/**
 * The compact `PRESET <name> SAVE DEL` group that sits at the right end of the class row, plus the
 * eye that reveals the full filter panel.
 *
 * NOT `components/presets/PresetPicker` — that is the big "CONFIGURATION PRESETS" card, a different
 * control for a different place. Reaching for it here renders a panel in the middle of a toolbar
 * row, which is exactly the mistake this component exists to stop being repeated.
 *
 * The Scanner carried this as ~130 lines of inline JSX with six pieces of local state. It is the
 * same group on every surface, so it lives here: a host supplies only what is genuinely its own —
 * how to serialise its filters, how to apply them back, and how to clear them.
 */
export type SharedFilterPresetBarProps = {
  /** The host's current shared-filter values, as the preset JSON. */
  getConfigJson: () => string;
  /** Apply a stored preset. Return false if it could not be read, so the bar can say so. */
  applyConfigJson: (configJson: string) => boolean;
  /** Selecting NONE. */
  onClear: () => void;
  /** The eye: whether the host's full filter panel is open. Omit both to hide the eye. */
  showPanel?: boolean;
  setShowPanel?: (next: boolean) => void;
};

type Stored = ReturnType<typeof listSharedFilterLocalPresets>[number];

/** Only presets that are BOTH-scope and really hold shared-filter JSON belong in this list. */
function loadList(): Stored[] {
  return listSharedFilterLocalPresets().filter((x) => {
    if (x.scope !== "BOTH") return false;
    try {
      return isSharedFilterPreset(JSON.parse(x.configJson ?? "{}"));
    } catch {
      return false;
    }
  });
}

export default function SharedFilterPresetBar({
  getConfigJson,
  applyConfigJson,
  onClear,
  showPanel,
  setShowPanel,
}: SharedFilterPresetBarProps) {
  const [presets, setPresets] = useState<Stored[]>([]);
  const [presetId, setPresetId] = useState("");
  const [saveMode, setSaveMode] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setStatus] = useState("");

  const refresh = useCallback(() => setPresets(loadList()), []);

  useEffect(() => {
    refresh();
    // Another surface saving a preset must show up here without a reload: these are shared.
    window.addEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, refresh as EventListener);
    return () => window.removeEventListener(SHARED_FILTER_PRESETS_CHANGED_EVENT, refresh as EventListener);
  }, [refresh]);

  const save = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setBusy(true);
      try {
        saveSharedFilterLocalPreset(trimmed, getConfigJson());
        refresh();
        setSaveMode(false);
        setDraftName("");
        setStatus("Saved");
      } catch {
        setStatus("Save failed");
      } finally {
        setBusy(false);
      }
    },
    [getConfigJson, refresh]
  );

  const btn = "inline-flex h-7 items-center justify-center px-2 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border";

  return (
    <>
      <div className="flex h-7 items-center gap-2 pl-3 pr-2 rounded-lg bg-black/20">
        <span className="flex h-7 items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wide">PRESET</span>
        {saveMode ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy) save(draftName);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSaveMode(false);
                setDraftName("");
              }
            }}
            autoFocus
            placeholder="NAME..."
            className="h-7 min-w-[112px] bg-transparent border-0 text-[10px] font-mono uppercase text-zinc-300 placeholder:text-zinc-600 outline-none focus:outline-none"
          />
        ) : (
          <GlassSelect
            value={presetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setPresetId(nextId);
              if (!nextId) {
                onClear();
                return;
              }
              if (busy || saveMode) return;
              setBusy(true);
              try {
                const stored = getSharedFilterLocalPreset(nextId) ?? presets.find((x) => x.id === nextId);
                if (!stored || !applyConfigJson(stored.configJson ?? "{}")) setStatus("Apply failed");
              } catch {
                setStatus("Apply failed");
              } finally {
                setBusy(false);
              }
            }}
            options={[{ value: "", label: "NONE" }, ...presets.map((p) => ({ value: p.id, label: p.name.toUpperCase() }))]}
            compact
            panelOffsetX={-42}
            panelWidth={124}
            className="w-[92px] !h-7 !min-w-0 !rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-xs !leading-none !shadow-none hover:!bg-transparent hover:!border-transparent focus:!border-transparent"
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (saveMode) {
              if (!busy) save(draftName);
              return;
            }
            setSaveMode(true);
            setDraftName("");
          }}
          disabled={busy}
          className={clsx(btn, busy ? "border-transparent text-zinc-600"
            : saveMode ? TOOLBAR_BUTTON_ACTIVE
            : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5")}
        >
          SAVE
        </button>
        <button
          type="button"
          onClick={() => {
            if (!presetId || busy || saveMode) return;
            if (!deleteSharedFilterLocalPreset(presetId)) {
              setStatus("Delete failed");
              return;
            }
            const items = loadList();
            setPresets(items);
            setPresetId(items[0]?.id ?? "");
            setStatus("Deleted");
          }}
          disabled={!presetId || busy || saveMode}
          className={clsx(btn, presetId && !busy && !saveMode
            ? "border-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            : "border-transparent text-zinc-600")}
        >
          DEL
        </button>
      </div>

      {setShowPanel && (
        <button
          type="button"
          onClick={() => setShowPanel(!showPanel)}
          className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-300 hover:bg-white/10 transition-colors group"
          title={showPanel ? "Hide shared filters" : "Show shared filters"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={showPanel ? "group-hover:text-rose-400 transition-colors" : "transition-colors"}>
            {showPanel ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      )}
    </>
  );
}
