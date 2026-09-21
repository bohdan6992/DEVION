"use client";

import { useSyncExternalStore } from "react";
import { normalizeSignal } from "@/lib/signals/signal";
import { subscribeToStreamSse } from "@/components/stream/streamSseHub";
import { buildSignalsStreamUrl } from "@/lib/signals/url";

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
  private seenTickers = new Set<string>();
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

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

  private applySignals(signals: Array<ReturnType<typeof normalizeSignal>>) {
    // This runs on EVERY hub message, which since the SSE-hub consolidation means every diff —
    // several times a minute rather than once per snapshot, which is all this store used to see.
    // The full extraction below is ~8 string operations per signal over 5000 signals plus three
    // sorts, and it ran on the Scanner's main thread every time.
    //
    // Country, exchange and sector are STATIC per ticker, so as long as the ticker set is
    // unchanged the answer cannot have changed and none of that work is needed.
    let sameSet = signals.length === this.seenTickers.size;
    if (sameSet) {
      for (const signal of signals) {
        const t = (signal as any)?.ticker;
        if (!t || !this.seenTickers.has(t)) { sameSet = false; break; }
      }
    }
    if (sameSet) return;

    this.seenTickers = new Set(
      signals.map((signal) => (signal as any)?.ticker).filter(Boolean) as string[]
    );

    const c = new Set<string>();
    const e = new Set<string>();
    const s = new Set<string>();

    for (const signal of signals) {
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
      // "ark" folded into "pre" in v13 (ArbitrageFilesService.NormalizeRatingClass); this stream is
      // only used for its country/exchange/sector universe, so any surviving class works equally.
      cls: "pre",
      type: "any",
      mode: "all",
      ratingMode: "SESSION",
      zapMode: "sigma",
      minRate: 0,
      minTotal: 1,
      limit: 5000,
      includeAll: true,
    });

    // Through the shared hub, not a private EventSource. This store lives inside the Scanner,
    // which the Stream page renders — so a stream tab used to hold this connection PLUS the
    // engine's, to the same endpoint. The hub also merges diffs, which this store never did: it
    // only ever listened to "snapshot", so between snapshots its country/exchange/sector lists
    // went stale even though the feed was sending updates.
    this.unsubscribe = subscribeToStreamSse(url, (state) => {
      this.applySignals(state.signals);
    });
  }

  private disconnect() {
    this.seenTickers = new Set();
    this.unsubscribe?.();
    this.unsubscribe = null;
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
