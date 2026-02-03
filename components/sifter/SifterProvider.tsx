// components/sifter/SifterProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SifterDayRow, SifterDaysRequest } from "@/lib/sifterClient";
import { postSifterDays } from "@/lib/sifterClient";

import type {
  TickerdaysAck,
  TickerdaysReportRequest,
  TickerdaysResult,
  TickerdaysStatus,
} from "@/lib/tickerdaysClient";
import {
  postTickerdaysReport,
  getTickerdaysStatus,
  getTickerdaysResult,
  postTickerdaysCancel,
} from "@/lib/tickerdaysClient";

type SifterMode = "closed" | "docked";
type RunMode = "quick" | "tickerdays";

export type SifterState = {
  mode: SifterMode;
  isPopout: boolean;

  // run mode
  runMode: RunMode;

  // filters (shared)
  fromDateNy: string;
  toDateNy: string;
  tickersText: string;      // "AAPL,MSFT"
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
  minuteTo: string;   // "10:15"
  metric: string;     // "GapPct" | "ClsToClsPct" | "SigmaZapS" | ...

  // tickerdays selected window ids (backend window IDs)
  windowStartId: number;
  windowEndId: number;

  // results (quick mode)
  loading: boolean;
  error: string | null;
  rows: SifterDayRow[];

  // perf settings
  perfSide: "long" | "short"; // short = invert
  selectedKey: string | null; // `${dateNy}|${ticker}`

  // tickerdays job state
  tdRequestId: string | null;
  tdStatus: number | null;      // 2 running, 3 done, 4 error, 5 cancelled
  tdProgress: number;           // 0..1
  tdMessage: string | null;

  tdLoading: boolean;
  tdError: string | null;

  // tickerdays result
  tdResult: TickerdaysResult | null;
};

type SifterActions = {
  toggleDock(): void;
  close(): void;
  openPopout(): void;

  set<K extends keyof SifterState>(key: K, value: SifterState[K]): void;

  setRunMode(mode: RunMode): void;

  runDays(): Promise<void>;           // quick
  runTickerdays(): Promise<void>;     // job
  cancelTickerdays(): Promise<void>;

  selectRow(dateNy: string, ticker: string): void;
};

const SifterCtx = createContext<{ state: SifterState; actions: SifterActions } | null>(null);

const STORAGE_KEY = "sifter.state.v2";
const BC_NAME = "sifter";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function normalizeTickers(text: string): string[] | null {
  const parts = text
    .split(/[,\s]+/g)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function buildTickerdaysRequest(state: SifterState): TickerdaysReportRequest {
  // Map the selected backend window ids into the pricePercFilter timeStart/timeEnd
  // (backend TickerdaysBuilder expects window ids for timeStart/timeEnd)
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

  const [state, setState] = useState<SifterState>(() => {
    const fromStorage = safeJsonParse<Partial<SifterState>>(typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);

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

      // default window ids (match backend config; safe defaults)
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

      // By default, don't restore the full tdResult from storage (could be huge).
      // If you want to restore it, set tdResult here from storage.
      tdResult: null,
    };
  });

  const bcRef = useRef<BroadcastChannel | null>(null);

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

  // Persist
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Avoid persisting huge payloads by default:
    const toStore: Partial<SifterState> = {
      ...state,
      rows: state.rows,
      tdResult: null, // keep storage light; toggle if you want full restore
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
        setState(prev => ({ ...prev, ...msg.payload, error: null, tdError: null }));
      };
    } catch {
      // ignore
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const incoming = safeJsonParse<Partial<SifterState>>(e.newValue);
      if (!incoming) return;
      setState(prev => ({ ...prev, ...incoming, error: null, tdError: null }));
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

  // Poll helper
  const startPoll = (requestId: string) => {
    stopPoll();

    pollRef.current = window.setInterval(async () => {
      try {
        const st: TickerdaysStatus = await getTickerdaysStatus(requestId);

        // update running status
        setState(prev => {
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

          setState(prev => {
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
          setState(prev => {
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
        setState(prev => {
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

  const actions: SifterActions = useMemo(() => ({
    toggleDock() {
      setState(prev => {
        const nextMode: SifterMode = prev.mode === "docked" ? "closed" : "docked";
        const next = { ...prev, mode: nextMode };
        syncToOthers({ mode: nextMode });
        return next;
      });
    },
    close() {
      setState(prev => {
        const next = { ...prev, mode: "closed" as const };
        syncToOthers({ mode: "closed" });
        return next;
      });
    },
    openPopout() {
      if (typeof window === "undefined") return;
      const url = `/sifter?popout=1`;
      const w = window.open(url, "SifterPopout", "popup=yes,width=1100,height=780");
      if (w) w.focus();
      syncToOthers({ ...state, mode: "docked" });
    },
    set(key, value) {
      setState(prev => {
        const next = { ...prev, [key]: value };
        syncToOthers({ [key]: value } as any);
        return next;
      });
    },

    setRunMode(mode) {
      setState(prev => {
        const next = { ...prev, runMode: mode };
        syncToOthers({ runMode: mode });
        return next;
      });
    },

    async runDays() {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const req: SifterDaysRequest = {
        fromDateNy: state.fromDateNy,
        toDateNy: state.toDateNy,
        tickers: normalizeTickers(state.tickersText),
        sectorL3: state.sectorL3,
        minMarketCapM: state.minMarketCapM,
        maxMarketCapM: state.maxMarketCapM,
        minGapPct: state.minGapPct,
        maxGapPct: state.maxGapPct,
        minClsToClsPct: state.minClsToClsPct,
        maxClsToClsPct: state.maxClsToClsPct,
      };

      try {
        const res = await postSifterDays(req);
        setState(prev => {
          const next = { ...prev, loading: false, rows: res.rows ?? [] };
          syncToOthers({ loading: false, rows: next.rows });
          return next;
        });
      } catch (e: any) {
        setState(prev => ({ ...prev, loading: false, error: e?.message ?? "Error" }));
      }
    },

    async runTickerdays() {
      // replace policy: cancel previous running job
      if (state.tdRequestId && state.tdStatus === 2) {
        try { await postTickerdaysCancel(state.tdRequestId); } catch {}
      }
      stopPoll();

      const req = buildTickerdaysRequest(state);
      if (!req.tickers.length) {
        setState(prev => ({ ...prev, tdError: "tickers required" }));
        return;
      }

      setState(prev => {
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

        setState(prev => {
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
        setState(prev => {
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
      if (!state.tdRequestId) return;
      try { await postTickerdaysCancel(state.tdRequestId); } catch {}
      stopPoll();
      setState(prev => {
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
      setState(prev => {
        const next = { ...prev, selectedKey: key };
        syncToOthers({ selectedKey: key });
        return next;
      });
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state]);

  return <SifterCtx.Provider value={{ state, actions }}>{children}</SifterCtx.Provider>;
}

export function useSifter() {
  const v = useContext(SifterCtx);
  if (!v) throw new Error("useSifter must be used inside SifterProvider");
  return v;
}
