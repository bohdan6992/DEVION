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
 * This hook is deliberately READ-ONLY. The Sonar owns the writes, together with the hydration
 * guards and restore-race handling that go with them; a second writer would fight it. Scanner and
 * Stream observe, and follow the selection live — `storage` covers other tabs, and the Sonar's own
 * tab is covered by polling, since `storage` does not fire in the tab that wrote the value.
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
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(sync, POLL_MS);
    return () => {
      window.removeEventListener("storage", onStorage);
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

/** Live fields for the active ticker, so Scanner and Stream can fill the card without a tape read. */
export function useActiveTickerSnapshot(ticker: string | null): ActiveTickerSnapshot {
  const [state, setState] = useState<ActiveTickerSnapshot>({ fields: null, loading: false, error: null });

  useEffect(() => {
    const tk = (ticker ?? "").trim().toUpperCase();
    if (!tk) {
      setState({ fields: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch(bridgeUrl(`/api/live/snapshot?tickers=${encodeURIComponent(tk)}&fields=${encodeURIComponent(CARD_FIELDS)}`))
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
        setState({ fields: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return state;
}
