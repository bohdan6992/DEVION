"use client";

import { useEffect, useState } from "react";
import { bridgeUrl } from "@/lib/bridgeBase";
import { LIVE_STRATEGY_LIST } from "@/lib/strategies/registry";

/**
 * The active ticker, shared across Sonar, Scanner and Stream.
 *
 * The Sonar already persists its active-panel selection to localStorage under a PER-STRATEGY key
 * (`bridge.arb.activePanel.v1` / `bridge.opendoor.activePanel.v1`). That key is the natural source
 * for the other two surfaces: "active" means the same ticker whichever page you are on, and no new
 * selection UX has to be invented for Scanner or Stream.
 *
 * Reading is the common case: Scanner and Stream follow the selection live — `storage` covers
 * other tabs, and the writer's own tab is covered by polling plus the event below, since `storage`
 * does not fire in the tab that wrote the value.
 *
 * Writing is available through setActiveTicker, so a click on any surface can make a ticker
 * active, the way clicking a row in Arbitrage Sonar does. The Sonar keeps its own copy of the
 * selection in component state and rewrites the key when that state changes, so while a Sonar is
 * mounted IN ANOTHER TAB it can still win a race and restore its own ticker. That is pre-existing
 * and only bites with two tabs open on the same strategy.
 */

/**
 * Any strategy key from the registry. Deliberately `string` and not a union: this hook used to
 * declare `"arbitrage" | "opendoor"` alongside a hand-written key map, so a third strategy meant
 * editing a filter utility that has nothing to do with strategies. An unknown key simply has no
 * selection, which is the truthful answer.
 */
export type ActiveTickerStrategy = string;

/** Derived from each strategy's own Sonar storage namespace — never written out a second time. */
const STORAGE_KEYS: Record<string, string> = Object.fromEntries(
  LIVE_STRATEGY_LIST.map((s) => [s.key, `${s.storage.sonarPrefix}.activePanel.v1`])
);

export type ActiveTickerSelection = {
  ticker: string | null;
  visible: boolean;
  collapsed: boolean;
  mode: "mini" | "expanded";
};

const EMPTY: ActiveTickerSelection = { ticker: null, visible: false, collapsed: true, mode: "mini" };

function readSelection(strategy: ActiveTickerStrategy): ActiveTickerSelection {
  if (typeof window === "undefined") return EMPTY;
  try {
    const key = STORAGE_KEYS[strategy];
    if (!key) return EMPTY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    const ticker =
      typeof parsed?.activeTicker === "string" && parsed.activeTicker.trim()
        ? parsed.activeTicker.trim().toUpperCase()
        : null;
    return {
      ticker,
      visible: typeof parsed?.visible === "boolean" ? parsed.visible : true,
      collapsed: typeof parsed?.collapsed === "boolean" ? parsed.collapsed : true,
      mode: parsed?.mode === "expanded" ? "expanded" : "mini",
    };
  } catch {
    return EMPTY;
  }
}

function sameSelection(a: ActiveTickerSelection, b: ActiveTickerSelection): boolean {
  return a.ticker === b.ticker && a.visible === b.visible && a.collapsed === b.collapsed && a.mode === b.mode;
}

/**
 * Same-tab notification. `storage` fires only in OTHER tabs, so without this a click would wait up
 * to POLL_MS for the strip to catch up — long enough to read as "the click did nothing".
 */
const ACTIVE_TICKER_EVENT = "axion:active-ticker";

/**
 * Make `ticker` the active one for `strategy`, exactly as clicking a row in the Sonar does:
 * the ticker is stored and the panel is made visible. Everything else in the stored object
 * (collapsed, mode) is preserved — this sets a selection, it does not reset the panel's shape.
 *
 * A null or blank ticker clears the selection.
 */
export function setActiveTicker(strategy: ActiveTickerStrategy, ticker: string | null): void {
  if (typeof window === "undefined") return;
  const key = STORAGE_KEYS[strategy];
  if (!key) return;

  const next = (ticker ?? "").trim().toUpperCase() || null;
  try {
    let parsed: any = {};
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) parsed = JSON.parse(raw) ?? {};
    } catch {
      parsed = {};
    }
    window.localStorage.setItem(key, JSON.stringify({ ...parsed, activeTicker: next, visible: true }));
  } catch {
    // A full or blocked localStorage must not break the click; the strip simply will not follow.
    return;
  }
  window.dispatchEvent(new CustomEvent(ACTIVE_TICKER_EVENT, { detail: strategy }));
}

/** Poll interval for same-tab changes. Cheap: one localStorage read and a shallow compare. */
const POLL_MS = 1000;

export function useActiveTickerSelection(strategy: ActiveTickerStrategy): ActiveTickerSelection {
  const [selection, setSelection] = useState<ActiveTickerSelection>(EMPTY);

  useEffect(() => {
    const sync = () => {
      const next = readSelection(strategy);
      setSelection((prev) => (sameSelection(prev, next) ? prev : next));
    };
    sync();

    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEYS[strategy]) sync();
    };
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail == null || detail === strategy) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_TICKER_EVENT, onLocal);
    const timer = window.setInterval(sync, POLL_MS);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_TICKER_EVENT, onLocal);
      window.clearInterval(timer);
    };
  }, [strategy]);

  return selection;
}

/** Headline fields for the card. Kept short — this is the strip, not the expanded grid. */
const CARD_FIELDS = [
  "Exchange",
  "Bench",
  "Beta",
  "Sig",
  "SpreadBid%",
  "LstPrcLstClsΔ%",
].join(",");

export type ActiveTickerSnapshot = {
  fields: Record<string, any> | null;
  loading: boolean;
  error: string | null;
};

/** How often the card re-reads its fields. Deliberately slower than the selection strip's own
 *  POLL_MS: the selection has to feel instant on a click, while these are quote-ish values that
 *  nobody reads faster than this, and every scanner page holds one of these cards. */
const SNAPSHOT_POLL_MS = 2000;
/** Shorter than the poll interval, so a hung request can never overlap the next tick. */
const SNAPSHOT_TIMEOUT_MS = 1500;

/**
 * Live fields for the active ticker, so Scanner and Stream can fill the card without a tape read.
 *
 * IT POLLS, AND IT SURVIVES A FAILED FETCH. Both of those were missing and both were visible:
 *
 *   * The effect depended only on [ticker], so exactly ONE request was made per selection. If the
 *     bridge happened to be down or restarting at that instant - or simply had not finished
 *     starting - the card showed "Failed to fetch" and stayed that way forever, on every strategy,
 *     until the ticker was changed or the page reloaded. That is what made it look permanently
 *     broken rather than temporarily unavailable.
 *   * Even on success nothing ever refreshed, so a card advertising LIVE fields was frozen at
 *     whatever the values were the moment the ticker was first clicked.
 *
 * A failure now keeps the LAST GOOD fields on screen instead of blanking them, and the error is
 * reported only while there is nothing to show - otherwise a one-off blip would wipe a card that
 * is about to refill 2 seconds later. The error clears itself on the next success, so recovery
 * needs no interaction.
 *
 * Polling pauses while the tab is hidden: a background tab hammering the bridge once every two
 * seconds, on every open scanner, is load nobody asked for.
 */
export function useActiveTickerSnapshot(ticker: string | null): ActiveTickerSnapshot {
  const [state, setState] = useState<ActiveTickerSnapshot>({ fields: null, loading: false, error: null });

  useEffect(() => {
    const tk = (ticker ?? "").trim().toUpperCase();
    if (!tk) {
      setState({ fields: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    let inFlight = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const load = () => {
      // One request at a time: a slow bridge must not queue a backlog that then all lands at once.
      if (cancelled || inFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;

      // A HARD TIMEOUT, because this endpoint can HANG rather than fail. It reads live quotes out
      // of TradingApp, and a bridge whose market-data side is not up (a ToolsOnly instance, or one
      // still starting) accepts the connection and then never answers. Without this the single
      // in-flight request would never settle, the `inFlight` guard would block every later tick,
      // and the card would be wedged for good - the exact failure the polling was added to end.
      const ctl = new AbortController();
      const killer = window.setTimeout(() => ctl.abort(), SNAPSHOT_TIMEOUT_MS);

      fetch(bridgeUrl(`/api/live/snapshot?tickers=${encodeURIComponent(tk)}&fields=${encodeURIComponent(CARD_FIELDS)}`),
            { signal: ctl.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          const item = Array.isArray(data?.items) ? data.items[0] : null;
          setState({ fields: item?.Fields ?? item?.fields ?? null, loading: false, error: null });
        })
        .catch((e) => {
          if (cancelled) return;
          const msg = e instanceof Error
            ? (e.name === "AbortError" ? "bridge not responding" : e.message)
            : String(e);
          setState((prev) => ({
            // keep what we had; a blip must not blank a card that refills on the next tick
            fields: prev.fields,
            loading: false,
            error: prev.fields ? null : msg,
          }));
        })
        .finally(() => {
          window.clearTimeout(killer);
          inFlight = false;
        });
    };

    load();
    const timer = window.setInterval(load, SNAPSHOT_POLL_MS);
    // A tab that comes back should refill immediately rather than wait out the interval.
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ticker]);

  return state;
}
