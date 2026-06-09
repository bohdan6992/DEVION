"use client";

import { useSyncExternalStore } from "react";
import { normalizeSignal, buildSignalsStreamUrl } from "../sonar/ArbitrageSonar";

export type TapeMeta = {
  countries: string[];
  exchanges: string[];
  sectors: string[];
};

const EMPTY: TapeMeta = { countries: [], exchanges: [], sectors: [] };

function extractMeta(signal: ReturnType<typeof normalizeSignal>): { country: string; exchange: string; sector: string } {
  if (!signal) return { country: "", exchange: "", sector: "" };
  const raw = signal as any;
  const meta = raw?.meta ?? raw?.Meta ?? null;
  const country = String(raw?.country ?? raw?.Country ?? meta?.country ?? meta?.Country ?? "").trim().toUpperCase();
  const exchange = String(raw?.exchange ?? raw?.Exchange ?? meta?.exchange ?? meta?.Exchange ?? "").trim().toUpperCase();
  const sector = String(raw?.sectorL3 ?? raw?.SectorL3 ?? raw?.sector ?? raw?.Sector ?? meta?.sectorL3 ?? meta?.SectorL3 ?? meta?.sector ?? meta?.Sector ?? "").trim();
  return { country, exchange, sector };
}

class TapeMetaStore {
  private meta: TapeMeta = EMPTY;
  private listeners = new Set<() => void>();
  private source: EventSource | null = null;

  getMeta(): TapeMeta {
    return this.meta;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  };

  private applyPayload(payload: any) {
    const rawItems: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

    const c = new Set<string>();
    const e = new Set<string>();
    const s = new Set<string>();

    for (const raw of rawItems) {
      const signal = normalizeSignal(raw);
      if (!signal) continue;
      const { country, exchange, sector } = extractMeta(signal);
      if (country) c.add(country);
      if (exchange) e.add(exchange);
      if (sector) s.add(sector);
    }

    const next: TapeMeta = {
      countries: Array.from(c).sort(),
      exchanges: Array.from(e).sort(),
      sectors: Array.from(s).sort(),
    };

    if (
      next.countries.join(",") === this.meta.countries.join(",") &&
      next.exchanges.join(",") === this.meta.exchanges.join(",") &&
      next.sectors.join(",") === this.meta.sectors.join(",")
    ) return;

    this.meta = next;
    this.listeners.forEach((l) => l());
  }

  private connect() {
    if (typeof window === "undefined") return;
    this.disconnect();

    const url = buildSignalsStreamUrl({
      cls: "ark",
      type: "any",
      mode: "all",
      ratingMode: "SESSION",
      zapMode: "sigma",
      minRate: 0,
      minTotal: 1,
      limit: 5000,
      includeAll: true,
    });

    this.source = new EventSource(url);

    const handle = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(String(event.data));
        this.applyPayload(payload);
      } catch {}
    };

    this.source.onmessage = handle;
    this.source.addEventListener("snapshot", handle as EventListener);
  }

  private disconnect() {
    this.source?.close();
    this.source = null;
  }
}

export const tapeMetaStore = new TapeMetaStore();

export function useTapeMeta(): TapeMeta {
  return useSyncExternalStore(
    tapeMetaStore.subscribe,
    () => tapeMetaStore.getMeta(),
    () => EMPTY
  );
}
