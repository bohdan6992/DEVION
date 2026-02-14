// components/sifter/SifterProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SifterDayRow, SifterDaysRequest } from "@/lib/sifterClient";
import { postSifterDays } from "@/lib/sifterClient";

import type { TickerdaysAck, TickerdaysReportRequest, TickerdaysResult, TickerdaysStatus } from "@/lib/tickerdaysClient";
import { postTickerdaysReport, getTickerdaysStatus, getTickerdaysResult, postTickerdaysCancel } from "@/lib/tickerdaysClient";

type SifterMode = "closed" | "docked";
type RunMode = "quick" | "tickerdays";

export type SifterState = {
  mode: SifterMode;
  isPopout: boolean;

  runMode: RunMode;

  // filters (shared)
  fromDateNy: string;
  toDateNy: string;
  tickersText: string; // "AAPL,MSFT"
  sectorL3: string | null;
  minMarketCapM: number | null;
  maxMarketCapM: number | null;

  // day metric filters (quick mode)
  minGapPct: number | null;
  maxGapPct: number | null;
  minClsToClsPct: number | null;
  maxClsToClsPct: number | null;

  // minute window research (UI-ready)
  minuteFrom: string; // "09:31"
  minuteTo: string; // "10:15"
  metric: string; // "GapPct" | "ClsToClsPct" | "SigmaZapS" | ...

  // tickerdays selected window ids (backend window IDs)
  windowStartId: number;
  windowEndId: number;

  // results (quick mode)
  loading: boolean;
  error: string | null;
  rows: SifterDayRow[];

  // perf settings
  perfSide: "long" | "short";
  selectedKey: string | null;

  // tickerdays job state
  tdRequestId: string | null;
  tdStatus: number | null; // 2 running, 3 done, 4 error, 5 cancelled
  tdProgress: number;
  tdMessage: string | null;

  tdLoading: boolean;
  tdError: string | null;

  tdResult: TickerdaysResult | null;
};

type SifterActions = {
  toggleDock(): void;
  close(): void;
  openPopout(): void;

  set<K extends keyof SifterState>(key: K, value: SifterState[K]): void;

  setRunMode(mode: RunMode): void;

  runDays(): Promise<void>;
  runTickerdays(): Promise<void>;
  cancelTickerdays(): Promise<void>;

  selectRow(dateNy: string, ticker: string): void;
};

const SifterCtx = createContext<{ state: SifterState; actions: SifterActions } | null>(null);

const STORAGE_KEY = "sifter.state.v2";
const BC_NAME = "sifter";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeTickers(text: string): string[] | null {
  const parts = text
    .split(/[,\s]+/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function buildTickerdaysRequest(state: SifterState): TickerdaysReportRequest {
  return {
    startDateNy: state.fromDateNy,
    endDateNy: state.toDateNy,
    tickers: normalizeTickers(state.tickersText) ?? [],
    fetchDataMode: 2,
    filters: {
      pricePercFilters: [
        {
          dayIndex: 0,
          isAbsChange: true,
          pricePercChange: 1.0,
          side: 0,
          timeStart: state.windowStartId,
          timeEnd: state.windowEndId,
        },
      ],
      volatilityFilters: [],
      volumeFilters: [],
      moneyTradedFilters: [],
      reportFilter: { dayIndex: 0, reportFilterType: 0 },
    },
    additionalPriceData: true,
    additionalVolumeData: true,
    additionalPriceDataWithParams: false,
  };
}

export function SifterProvider({
  children,
  initialIsPopout,
}: {
  children: React.ReactNode;
  initialIsPopout?: boolean;
}) {
  const pollRef = useRef<number | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // ✅ stateRef fixes stale closure issues in async actions
  const stateRef = useRef<SifterState | null>(null);

  const [state, setState] = useState<SifterState>(() => {
    const fromStorage = safeJsonParse<Partial<SifterState>>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    );

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const today = `${yyyy}-${mm}-${dd}`;

    return {
      mode: "closed",
      isPopout: Boolean(initialIsPopout),

      runMode: (fromStorage?.runMode as RunMode) ?? "quick",

      fromDateNy: fromStorage?.fromDateNy ?? today,
      toDateNy: fromStorage?.toDateNy ?? today,
      tickersText: fromStorage?.tickersText ?? "",
      sectorL3: fromStorage?.sectorL3 ?? null,
      minMarketCapM: fromStorage?.minMarketCapM ?? null,
      maxMarketCapM: fromStorage?.maxMarketCapM ?? null,

      minGapPct: fromStorage?.minGapPct ?? null,
      maxGapPct: fromStorage?.maxGapPct ?? null,
      minClsToClsPct: fromStorage?.minClsToClsPct ?? null,
      maxClsToClsPct: fromStorage?.maxClsToClsPct ?? null,

      minuteFrom: fromStorage?.minuteFrom ?? "09:31",
      minuteTo: fromStorage?.minuteTo ?? "10:15",
      metric: fromStorage?.metric ?? "GapPct",

      // ✅ safer defaults (backend windows often have 0..4; keep your prior intent)
      windowStartId: typeof fromStorage?.windowStartId === "number" ? (fromStorage as any).windowStartId : 0,
      windowEndId: typeof fromStorage?.windowEndId === "number" ? (fromStorage as any).windowEndId : 1,

      loading: false,
      error: null,
      rows: Array.isArray(fromStorage?.rows) ? (fromStorage?.rows as any) : [],

      perfSide: fromStorage?.perfSide ?? "long",
      selectedKey: fromStorage?.selectedKey ?? null,

      tdRequestId: fromStorage?.tdRequestId ?? null,
      tdStatus: fromStorage?.tdStatus ?? null,
      tdProgress: typeof fromStorage?.tdProgress === "number" ? fromStorage.tdProgress : 0,
      tdMessage: fromStorage?.tdMessage ?? null,

      tdLoading: false,
      tdError: null,
      tdResult: null,
    };
  });

  // keep ref synced
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const stopPoll = () => {
    if (typeof window === "undefined") return;
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const syncToOthers = (patch: Partial<SifterState>) => {
    try {
      bcRef.current?.postMessage({ type: "SYNC_STATE", payload: patch });
    } catch {}
    try {
      const current = safeJsonParse<any>(localStorage.getItem(STORAGE_KEY)) ?? {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
    } catch {}
  };

  // Persist (avoid huge payloads)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const toStore: Partial<SifterState> = {
      ...state,
      rows: state.rows,
      tdResult: null,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  }, [state]);

  // BroadcastChannel + storage sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.type !== "SYNC_STATE") return;
        setState((prev) => ({ ...prev, ...msg.payload, error: null, tdError: null }));
      };
    } catch {
      // ignore
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const incoming = safeJsonParse<Partial<SifterState>>(e.newValue);
      if (!incoming) return;
      setState((prev) => ({ ...prev, ...incoming, error: null, tdError: null }));
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (bc) bc.close();
      bcRef.current = null;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPoll = (requestId: string) => {
    stopPoll();

    pollRef.current = window.setInterval(async () => {
      try {
        const st: TickerdaysStatus = await getTickerdaysStatus(requestId);

        setState((prev) => {
          const next: Partial<SifterState> = {
            tdRequestId: requestId,
            tdStatus: st.status,
            tdProgress: st.progress ?? 0,
            tdMessage: st.message ?? null,
            tdLoading: st.status === 2,
          };
          syncToOthers(next);
          return { ...prev, ...next };
        });

        if (st.status === 3) {
          stopPoll();
          const res: TickerdaysResult = await getTickerdaysResult(requestId);

          setState((prev) => {
            const next: Partial<SifterState> = {
              tdStatus: 3,
              tdProgress: 1,
              tdLoading: false,
              tdError: null,
              tdResult: res,
            };
            syncToOthers(next);
            return { ...prev, ...next };
          });
        }

        if (st.status === 4 || st.status === 5) {
          stopPoll();
          setState((prev) => {
            const next: Partial<SifterState> = {
              tdLoading: false,
              tdError: st.message ?? (st.status === 5 ? "Cancelled" : "Error"),
            };
            syncToOthers(next);
            return { ...prev, ...next };
          });
        }
      } catch (e: any) {
        stopPoll();
        setState((prev) => {
          const next: Partial<SifterState> = {
            tdLoading: false,
            tdError: e?.message ?? "Tickerdays status error",
          };
          syncToOthers(next);
          return { ...prev, ...next };
        });
      }
    }, 700);
  };

  const actions: SifterActions = useMemo(
    () => ({
      toggleDock() {
        setState((prev) => {
          const nextMode: SifterMode = prev.mode === "docked" ? "closed" : "docked";
          syncToOthers({ mode: nextMode });
          return { ...prev, mode: nextMode };
        });
      },
      close() {
        setState((prev) => {
          syncToOthers({ mode: "closed" });
          return { ...prev, mode: "closed" };
        });
      },
      openPopout() {
        if (typeof window === "undefined") return;
        const url = `/sifter?popout=1`;
        const w = window.open(url, "SifterPopout", "popup=yes,width=1100,height=780");
        if (w) w.focus();

        // ✅ do NOT broadcast whole state (can overwrite other tab with stale values)
        syncToOthers({ mode: "docked" });
      },

      set(key, value) {
        setState((prev) => {
          syncToOthers({ [key]: value } as any);
          return { ...prev, [key]: value } as any;
        });
      },

      setRunMode(mode) {
        setState((prev) => {
          syncToOthers({ runMode: mode });
          return { ...prev, runMode: mode };
        });
      },

      async runDays() {
        const cur = stateRef.current;
        if (!cur) return;

        setState((prev) => ({ ...prev, loading: true, error: null }));

        const req: SifterDaysRequest = {
          fromDateNy: cur.fromDateNy,
          toDateNy: cur.toDateNy,
          tickers: normalizeTickers(cur.tickersText),
          sectorL3: cur.sectorL3,
          minMarketCapM: cur.minMarketCapM,
          maxMarketCapM: cur.maxMarketCapM,
          minGapPct: cur.minGapPct,
          maxGapPct: cur.maxGapPct,
          minClsToClsPct: cur.minClsToClsPct,
          maxClsToClsPct: cur.maxClsToClsPct,
        };

        try {
          const res = await postSifterDays(req);
          const rows = Array.isArray(res?.rows) ? res.rows : [];

          setState((prev) => {
            const next = { ...prev, loading: false, rows, error: null };
            syncToOthers({ loading: false, rows, error: null });
            return next;
          });
        } catch (e: any) {
          setState((prev) => {
            const msg = e?.message ?? "Error";
            syncToOthers({ loading: false, error: msg });
            return { ...prev, loading: false, error: msg };
          });
        }
      },

      async runTickerdays() {
        const cur = stateRef.current;
        if (!cur) return;

        // cancel previous running job
        if (cur.tdRequestId && cur.tdStatus === 2) {
          try {
            await postTickerdaysCancel(cur.tdRequestId);
          } catch {}
        }
        stopPoll();

        const req = buildTickerdaysRequest(cur);
        if (!req.tickers.length) {
          setState((prev) => ({ ...prev, tdError: "tickers required" }));
          return;
        }

        setState((prev) => {
          const next: Partial<SifterState> = {
            tdLoading: true,
            tdError: null,
            tdResult: null,
            tdProgress: 0,
            tdMessage: "Starting…",
          };
          syncToOthers(next);
          return { ...prev, ...next };
        });

        try {
          const ack: TickerdaysAck = await postTickerdaysReport(req);

          setState((prev) => {
            const next: Partial<SifterState> = {
              tdRequestId: ack.requestId,
              tdStatus: ack.status,
              tdLoading: true,
              tdProgress: 0,
              tdMessage: "Queued…",
            };
            syncToOthers(next);
            return { ...prev, ...next };
          });

          startPoll(ack.requestId);
        } catch (e: any) {
          setState((prev) => {
            const next: Partial<SifterState> = {
              tdLoading: false,
              tdError: e?.message ?? "Tickerdays create failed",
            };
            syncToOthers(next);
            return { ...prev, ...next };
          });
        }
      },

      async cancelTickerdays() {
        const cur = stateRef.current;
        if (!cur?.tdRequestId) return;

        try {
          await postTickerdaysCancel(cur.tdRequestId);
        } catch {}

        stopPoll();
        setState((prev) => {
          const next: Partial<SifterState> = {
            tdStatus: 5,
            tdLoading: false,
            tdMessage: "Cancelled",
          };
          syncToOthers(next);
          return { ...prev, ...next };
        });
      },

      selectRow(dateNy, ticker) {
        const key = `${dateNy}|${ticker}`;
        setState((prev) => {
          syncToOthers({ selectedKey: key });
          return { ...prev, selectedKey: key };
        });
      },
    }),
    []
  );

  return <SifterCtx.Provider value={{ state, actions }}>{children}</SifterCtx.Provider>;
}

export function useSifter() {
  const v = useContext(SifterCtx);
  if (!v) throw new Error("useSifter must be used inside SifterProvider");
  return v;
}
