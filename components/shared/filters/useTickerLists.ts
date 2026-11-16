"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The IGNORE / APPLY-ONLY / PIN ticker lists behind the header's IGN/APP/PIN group.
 *
 * Every Sonar grew its own copy of this: three Sets, three drafts, three localStorage keys, a CSV
 * import per list and ~150 lines of drawer markup. The Scout pages now show the same group, and a
 * ninth copy is how `styles.ts`'s README says these things start to drift. One hook, one storage
 * convention, one parser.
 *
 * `storagePrefix` keys the three lists per page, so OPG-Fade's Scout and its Sonar do not share a
 * list by accident — they are different questions ("hide this from my research table" vs "never
 * trade this today") even when they hold the same tickers.
 */

export type ListMode = "off" | "ignore" | "apply" | "pin";

/** Free text -> tickers. Commas, whitespace and newlines all separate; case is normalised up. */
export function parseTickersFromFreeText(text: string): string[] {
  return Array.from(
    new Set(
      String(text ?? "")
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && s.length <= 12)
    )
  );
}

/**
 * A CSV import takes the FIRST column of every line and skips a header row that does not look like
 * a ticker — the same shape the Sonars' own importers use. A file that is really a plain list (one
 * ticker per line) parses identically, which is what people actually paste.
 */
export function parseTickersFromCsv(text: string): string[] {
  const out: string[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const first = line.split(/[,;\t]/)[0]?.trim().toUpperCase() ?? "";
    if (!first || first.length > 12) continue;
    if (!/^[A-Z][A-Z0-9.\-]*$/.test(first)) continue;
    out.push(first);
  }
  return Array.from(new Set(out));
}

function load(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set(); // private mode, or someone hand-edited the value
  }
}

function save(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* private mode — the list still works for this session */
  }
}

export type TickerLists = ReturnType<typeof useTickerLists>;

export function useTickerLists(storagePrefix: string) {
  const KEYS = useMemo(
    () => ({
      ignore: `${storagePrefix}:ignore`,
      apply: `${storagePrefix}:apply`,
      pin: `${storagePrefix}:pin`,
      mode: `${storagePrefix}:listMode`,
    }),
    [storagePrefix]
  );

  const [listMode, setListMode] = useState<ListMode>("off");
  const [ignoreSet, setIgnoreSet] = useState<Set<string>>(new Set());
  const [applySet, setApplySet] = useState<Set<string>>(new Set());
  const [pinSet, setPinSet] = useState<Set<string>>(new Set());

  const [showIgnore, setShowIgnore] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const [ignoreDraft, setIgnoreDraft] = useState("");
  const [applyDraft, setApplyDraft] = useState("");
  const [pinDraft, setPinDraft] = useState("");

  const ignoreFileRef = useRef<HTMLInputElement | null>(null);
  const applyFileRef = useRef<HTMLInputElement | null>(null);
  const pinFileRef = useRef<HTMLInputElement | null>(null);

  // Restore once on mount. Deliberately NOT in the same effect as the writers below: a write-on-
  // change effect that also reads would clear the lists on first paint.
  useEffect(() => {
    setIgnoreSet(load(KEYS.ignore));
    setApplySet(load(KEYS.apply));
    setPinSet(load(KEYS.pin));
    try {
      const m = window.localStorage.getItem(KEYS.mode);
      if (m === "ignore" || m === "apply" || m === "pin" || m === "off") setListMode(m);
    } catch {
      /* ignore */
    }
  }, [KEYS]);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEYS.mode, listMode);
    } catch {
      /* ignore */
    }
  }, [KEYS, listMode]);

  const mutate = useCallback(
    (which: "ignore" | "apply" | "pin", next: (prev: Set<string>) => Set<string>) => {
      const setter = which === "ignore" ? setIgnoreSet : which === "apply" ? setApplySet : setPinSet;
      const key = which === "ignore" ? KEYS.ignore : which === "apply" ? KEYS.apply : KEYS.pin;
      setter((prev) => {
        const out = next(prev);
        save(key, out);
        return out;
      });
    },
    [KEYS]
  );

  const add = useCallback(
    (which: "ignore" | "apply" | "pin", tickers: string[]) => {
      if (!tickers.length) return;
      mutate(which, (prev) => new Set([...prev, ...tickers]));
    },
    [mutate]
  );
  const remove = useCallback(
    (which: "ignore" | "apply" | "pin", ticker: string) => mutate(which, (prev) => {
      const out = new Set(prev);
      out.delete(ticker);
      return out;
    }),
    [mutate]
  );
  const clear = useCallback((which: "ignore" | "apply" | "pin") => mutate(which, () => new Set()), [mutate]);

  const onFile = useCallback(
    (which: "ignore" | "apply" | "pin") => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // so picking the same file twice still fires
      if (!file) return;
      try {
        add(which, parseTickersFromCsv(await file.text()));
      } catch {
        /* unreadable file — the list is unchanged, which is the safe outcome */
      }
    },
    [add]
  );

  /**
   * The one place the lists become a decision.
   *   IGNORE — drop these.
   *   APPLY  — keep ONLY these (an empty apply list means no constraint, not "show nothing").
   *   PIN    — show everything; the caller sorts pinned first.
   * Only the ACTIVE mode's list applies, which is what the header's three-way group selects.
   */
  const allows = useCallback(
    (ticker: string): boolean => {
      if (listMode === "ignore") return !ignoreSet.has(ticker);
      if (listMode === "apply") return applySet.size === 0 || applySet.has(ticker);
      return true;
    },
    [listMode, ignoreSet, applySet]
  );

  /** -1 / 0 so a caller can put it first in its own comparator while PIN is the active mode. */
  const pinRank = useCallback(
    (ticker: string): number => (listMode === "pin" && pinSet.has(ticker) ? -1 : 0),
    [listMode, pinSet]
  );

  return {
    listMode, setListMode,
    ignoreSet, applySet, pinSet,
    showIgnore, setShowIgnore, showApply, setShowApply, showPin, setShowPin,
    ignoreDraft, setIgnoreDraft, applyDraft, setApplyDraft, pinDraft, setPinDraft,
    ignoreFileRef, applyFileRef, pinFileRef,
    add, remove, clear, onFile,
    allows, pinRank,
    setModeIgnore: useCallback(() => setListMode((m) => (m === "ignore" ? "off" : "ignore")), []),
    setModeApply: useCallback(() => setListMode((m) => (m === "apply" ? "off" : "apply")), []),
    setModePin: useCallback(() => setListMode((m) => (m === "pin" ? "off" : "pin")), []),
  };
}
