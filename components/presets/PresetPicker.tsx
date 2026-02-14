"use client";

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { PresetDto, PresetScope } from "@/types/presets";
import { listPresets, createPreset, updatePreset, deletePreset } from "@/lib/presets/presetsApi";

type Props = {
  kind?: string;
  scope?: PresetScope | "BOTH";
  valueId?: string | null;
  onChangeId?: (id: string | null, preset?: PresetDto | null) => void;
  getCurrentConfigJson: () => string;
  onApplyPresetJson?: (presetJson: string, preset: PresetDto) => void;
};

export default function PresetPicker({
  kind = "ARBITRAGE",
  scope = "BOTH",
  valueId,
  onChangeId,
  getCurrentConfigJson,
  onApplyPresetJson,
}: Props) {
  const [items, setItems] = useState<PresetDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(valueId ?? "");
  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  const [newName, setNewName] = useState("");
  const canUpdate = !!selected;

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listPresets({ kind, scope });
      setItems(data);
      if (selectedId && !data.some((x) => x.id === selectedId)) {
        setSelectedId("");
        onChangeId?.(null, null);
      }
    } catch (e: any) {
      setErr(e?.message ?? "ERR_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [kind, scope]);

  useEffect(() => {
    setSelectedId(valueId ?? "");
  }, [valueId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    const p = items.find((x) => x.id === id) ?? null;
    onChangeId?.(id || null, p);
  }

  async function handleSaveNew() {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    setErr(null);
    try {
      const dto = await createPreset({
        kind,
        scope,
        name,
        configJson: getCurrentConfigJson(),
      });
      setNewName("");
      await reload();
      setSelectedId(dto.id);
      onChangeId?.(dto.id, dto);
    } catch (e: any) {
      setErr(e?.message ?? "ERR_CREATE_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSelected() {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    try {
      const dto = await updatePreset(selected.id, {
        kind,
        scope: selected.scope as any,
        name: selected.name,
        configJson: getCurrentConfigJson(),
      });
      await reload();
      setSelectedId(dto.id);
      onChangeId?.(dto.id, dto);
    } catch (e: any) {
      setErr(e?.message ?? "ERR_UPDATE_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selected) return;
    if (!confirm(`CONFIRM_DELETE: "${selected.name}"?`)) return;
    setLoading(true);
    setErr(null);
    try {
      await deletePreset(selected.id, kind);
      await reload();
      setSelectedId("");
      onChangeId?.(null, null);
    } catch (e: any) {
      setErr(e?.message ?? "ERR_DELETE_FAILED");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!selected) return;
    onApplyPresetJson?.(selected.configJson, selected);
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-4 shadow-2xl transition-all hover:border-neutral-700">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">
          Configuration Presets
        </div>
        <button
          className="text-[9px] font-mono text-neutral-500 hover:text-emerald-500 flex items-center gap-1 transition-colors disabled:opacity-30"
          onClick={reload}
          disabled={loading}
        >
          <span className={clsx(loading && "animate-spin")}>↻</span> [REFRESH]
        </button>
      </div>

      {err && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-2 rounded text-[10px] font-mono text-rose-500 flex items-center gap-2">
          <span className="font-bold">!</span> {err}
        </div>
      )}

      {/* SELECTION & APPLY */}
      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight px-1">
          Select stored profile
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              value={selectedId}
              onChange={(e) => handleSelect(e.target.value)}
              disabled={loading}
            >
              <option value="">(NULL_PRESET)</option>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            className="px-4 py-2 rounded bg-emerald-500/10 border border-emerald-500/50 text-[10px] font-bold text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all disabled:opacity-20 disabled:grayscale"
            onClick={handleApply}
            disabled={!selected || loading}
          >
            APPLY_CFG
          </button>
        </div>
      </div>

      {/* SAVE NEW SECTION */}
      <div className="space-y-2 pt-2 border-t border-neutral-800/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="md:col-span-2 relative">
            <input
              className="w-full bg-black border border-neutral-800 rounded px-2 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/50 placeholder:text-neutral-700 transition-colors"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ENTRY_NAME..."
              disabled={loading}
            />
          </div>
          <button
            className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all disabled:opacity-40"
            onClick={handleSaveNew}
            disabled={loading || !newName.trim()}
          >
            SAVE_AS_NEW
          </button>
        </div>
      </div>

      {/* MANAGEMENT BUTTONS */}
      <div className="flex gap-2">
        <button
          className="flex-1 px-3 py-2 rounded border border-neutral-800 text-[10px] font-bold text-neutral-500 hover:border-neutral-600 hover:text-neutral-200 transition-all disabled:opacity-20"
          onClick={handleUpdateSelected}
          disabled={loading || !canUpdate}
        >
          OVERWRITE_SELECTED
        </button>

        <button
          className="px-3 py-2 rounded border border-rose-500/20 text-[10px] font-bold text-rose-500/60 hover:border-rose-500 hover:text-rose-500 transition-all disabled:opacity-20"
          onClick={handleDeleteSelected}
          disabled={loading || !canUpdate}
        >
          DELETE
        </button>
      </div>

      {/* FOOTER METADATA */}
      {selected && (
        <div className="pt-2 flex items-center gap-2 border-t border-neutral-800/30">
          <span className="text-emerald-500 font-mono text-[10px]">&gt;</span>
          <div className="text-[9px] font-mono text-neutral-600 uppercase tracking-tight">
            Last modified: {new Date(selected.updatedUtc).toLocaleString()} | ID: {selected.id.slice(0, 8)}
          </div>
        </div>
      )}
    </div>
  );
}