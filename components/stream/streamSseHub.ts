"use client";

import { normalizeSignal, type ArbitrageSignal } from "../sonar/ArbitrageSonar";

/**
 * Refcounted SSE fan-out.
 *
 * Every strategy instance needs the same live signal feed. Opening one EventSource per instance
 * means N copies of the identical byte stream, N JSON parses of the same payload every tick, and
 * N connections against the broker — all to produce N identical arrays. Worse, browsers cap
 * concurrent connections per origin, so enough instances would starve unrelated requests.
 *
 * This hub keeps ONE connection per distinct URL and fans the parsed result out to every
 * subscriber. Instances whose filters produce the same stream URL share transparently; instances
 * with genuinely different URLs (different class/thresholds) still get their own connection,
 * which is correct — they are different queries.
 *
 * The parsed signal array is shared by reference. Subscribers MUST treat it as immutable and
 * derive their own filtered copies — the engine already does exactly that.
 *
 * Scope note: this shares within one browser tab. Separate tabs are separate processes and
 * cannot share a connection without a SharedWorker; that is a deliberate non-goal here, since
 * the broker sends diffs and the per-tab cost is one connection, not one per strategy.
 */
export type StreamSseState = {
  signals: ArbitrageSignal[];
  connected: boolean;
  lastMessageAt: number;
};

type StreamSseListener = (state: StreamSseState) => void;

type StreamSseChannel = {
  url: string;
  source: EventSource | null;
  signals: ArbitrageSignal[];
  byTicker: Map<string, ArbitrageSignal>;
  connected: boolean;
  lastMessageAt: number;
  listeners: Set<StreamSseListener>;
};

const channels = new Map<string, StreamSseChannel>();

function emit(channel: StreamSseChannel): void {
  const state: StreamSseState = {
    signals: channel.signals,
    connected: channel.connected,
    lastMessageAt: channel.lastMessageAt,
  };
  channel.listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // one bad subscriber must not stop the others from receiving live data
    }
  });
}

function applySnapshotPayload(channel: StreamSseChannel, payload: any): void {
  const rawItems: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  const normalized = rawItems.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[];
  channel.byTicker = new Map(normalized.map((row) => [row.ticker, row] as const));
  channel.signals = normalized;
  channel.lastMessageAt = Date.now();
  emit(channel);
}

function applyDiffPayload(channel: StreamSseChannel, payload: any): void {
  const added = Array.isArray(payload?.added) ? payload.added : [];
  const updated = Array.isArray(payload?.updated) ? payload.updated : [];
  const removed = Array.isArray(payload?.removed) ? payload.removed : [];

  for (const ticker of removed) {
    const key = String(ticker ?? "").trim().toUpperCase();
    if (key) channel.byTicker.delete(key);
  }
  for (const row of added.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[]) {
    channel.byTicker.set(row.ticker, row);
  }
  for (const row of updated.map(normalizeSignal).filter(Boolean) as ArbitrageSignal[]) {
    channel.byTicker.set(row.ticker, row);
  }

  // New array identity on every diff so subscribers can rely on reference equality to detect
  // "nothing changed" — the engine's sameSignalList check depends on this.
  channel.signals = Array.from(channel.byTicker.values());
  channel.lastMessageAt = Date.now();
  emit(channel);
}

function openChannel(channel: StreamSseChannel): void {
  if (channel.source || typeof window === "undefined") return;

  const source = new EventSource(channel.url);
  channel.source = source;

  const handleSnapshot = (event: MessageEvent<string>) => {
    try {
      applySnapshotPayload(channel, JSON.parse(String(event.data)));
    } catch {
      // malformed payload — keep the previous snapshot rather than blanking live state
    }
  };
  const handleDiff = (event: MessageEvent<string>) => {
    try {
      applyDiffPayload(channel, JSON.parse(String(event.data)));
    } catch {
      // malformed payload — keep the previous snapshot
    }
  };

  source.onmessage = handleSnapshot;
  source.addEventListener("snapshot", handleSnapshot as EventListener);
  source.addEventListener("diff", handleDiff as EventListener);
  source.onopen = () => {
    channel.connected = true;
    emit(channel);
  };
  source.onerror = () => {
    // EventSource reconnects on its own; what matters is that subscribers can SEE the gap.
    // Without this flag the signal array just freezes at its last values and automation would
    // keep deciding on dead data with nothing indicating anything is wrong.
    channel.connected = false;
    emit(channel);
  };
}

function closeChannel(channel: StreamSseChannel): void {
  channel.source?.close();
  channel.source = null;
  channel.connected = false;
}

/**
 * Subscribes to `url`, opening the connection if this is the first subscriber. The listener is
 * called immediately with the current state so a late joiner does not wait for the next tick.
 * Returns an unsubscribe that closes the connection once the last subscriber leaves.
 */
export function subscribeToStreamSse(url: string, listener: StreamSseListener): () => void {
  let channel = channels.get(url);
  if (!channel) {
    channel = {
      url,
      source: null,
      signals: [],
      byTicker: new Map(),
      connected: false,
      lastMessageAt: 0,
      listeners: new Set(),
    };
    channels.set(url, channel);
  }

  const target = channel;
  target.listeners.add(listener);
  openChannel(target);

  // Replay current state so a subscriber joining an already-open channel starts with data instead
  // of an empty array until the broker next sends something. Skipped for a channel that has never
  // connected and has no data yet: replaying `connected: false` there is not a disconnect, it is
  // just "not opened yet", and subscribers that track connection transitions would log a spurious
  // drop on every mount.
  if (target.connected || target.lastMessageAt > 0) {
    listener({
      signals: target.signals,
      connected: target.connected,
      lastMessageAt: target.lastMessageAt,
    });
  }

  return () => {
    target.listeners.delete(listener);
    if (target.listeners.size > 0) return;
    closeChannel(target);
    channels.delete(url);
  };
}

export function getStreamSseState(url: string): StreamSseState | null {
  const channel = channels.get(url);
  if (!channel) return null;
  return {
    signals: channel.signals,
    connected: channel.connected,
    lastMessageAt: channel.lastMessageAt,
  };
}

/** Diagnostics: which feeds are open and how many strategies each one serves. */
export function listStreamSseChannels(): Array<{ url: string; subscribers: number; connected: boolean }> {
  return Array.from(channels.values()).map((channel) => ({
    url: channel.url,
    subscribers: channel.listeners.size,
    connected: channel.connected,
  }));
}
