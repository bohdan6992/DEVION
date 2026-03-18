import type { PresetDto } from "@/types/presets";

const SHARED_FILTER_PRESETS_LS_KEY = "arb.shared-filter-presets.v1";
export const SHARED_FILTER_PRESETS_CHANGED_EVENT = "arb:shared-filter-presets-changed";

type SharedFilterLocalPreset = PresetDto;

function parsePresetList(raw: string | null): SharedFilterLocalPreset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.configJson === "string"
    );
  } catch {
    return [];
  }
}

function readAll(): SharedFilterLocalPreset[] {
  if (typeof window === "undefined") return [];
  return parsePresetList(window.localStorage.getItem(SHARED_FILTER_PRESETS_LS_KEY));
}

function writeAll(items: SharedFilterLocalPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHARED_FILTER_PRESETS_LS_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(SHARED_FILTER_PRESETS_CHANGED_EVENT));
}

export function listSharedFilterLocalPresets(): SharedFilterLocalPreset[] {
  return readAll().sort((a, b) => String(b.updatedUtc).localeCompare(String(a.updatedUtc)));
}

export function getSharedFilterLocalPreset(id: string): SharedFilterLocalPreset | null {
  return readAll().find((item) => item.id === id) ?? null;
}

export function saveSharedFilterLocalPreset(name: string, configJson: string): SharedFilterLocalPreset {
  const now = new Date().toISOString();
  const items = readAll();
  const existingIndex = items.findIndex((item) => item.name.trim().toUpperCase() === name.trim().toUpperCase());
  const next: SharedFilterLocalPreset = {
    id: existingIndex >= 0 ? items[existingIndex].id : `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "ARBITRAGE",
    scope: "BOTH",
    name: name.trim(),
    configJson,
    updatedUtc: now,
  };

  if (existingIndex >= 0) {
    items[existingIndex] = next;
  } else {
    items.unshift(next);
  }

  writeAll(items);
  return next;
}

export function deleteSharedFilterLocalPreset(id: string): boolean {
  const items = readAll();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  writeAll(next);
  return true;
}
