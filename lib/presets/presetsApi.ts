import type { PresetDto, PresetUpsertRequestDto } from "@/types/presets";
import { bridgeUrl } from "@/lib/bridgeBase";

type ListParams = {
  kind?: string;
  scope?: string;
};

function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function listPresets(params: ListParams = {}): Promise<PresetDto[]> {
  const kind = params.kind ?? "ARBITRAGE";
  const scope = params.scope ?? "BOTH";

  const res = await fetch(bridgeUrl(`/api/presets${qs({ kind, scope })}`), {
    credentials: "include",
  });

  if (!res.ok) throw new Error(`listPresets failed: ${res.status}`);
  return res.json();
}

export async function getPreset(id: string, kind: string = "ARBITRAGE"): Promise<PresetDto> {
  const res = await fetch(bridgeUrl(`/api/presets/${encodeURIComponent(id)}${qs({ kind })}`), {
    credentials: "include",
  });

  if (!res.ok) throw new Error(`getPreset failed: ${res.status}`);
  return res.json();
}

export async function createPreset(payload: PresetUpsertRequestDto): Promise<PresetDto> {
  const res = await fetch(bridgeUrl(`/api/presets`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`createPreset failed: ${res.status} ${txt}`);
  }

  return res.json();
}

export async function updatePreset(id: string, payload: PresetUpsertRequestDto): Promise<PresetDto> {
  const kind = (payload as any)?.kind ?? "ARBITRAGE";

  const res = await fetch(bridgeUrl(`/api/presets/${encodeURIComponent(id)}${qs({ kind })}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`updatePreset failed: ${res.status} ${txt}`);
  }

  return res.json();
}

export async function deletePreset(id: string, kind: string = "ARBITRAGE"): Promise<void> {
  const res = await fetch(bridgeUrl(`/api/presets/${encodeURIComponent(id)}${qs({ kind })}`), {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) throw new Error(`deletePreset failed: ${res.status}`);
}