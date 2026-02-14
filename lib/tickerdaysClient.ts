// lib/tickerdaysClient.ts
import { bridgeUrl } from "@/lib/bridgeBase";

export type TickerdaysAck = {
  requestId: string;
  status: number; // 2 running, 3 done, 4 error, 5 cancelled (per backend)
};

export type TickerdaysStatus = {
  requestId: string;
  status: number;
  progress?: number | null; // 0..1
  message?: string | null;
};

export type TickerdaysReportRequest = {
  startDateNy: string; // "YYYY-MM-DD"
  endDateNy: string; // "YYYY-MM-DD"

  tickers: string[];

  fetchDataMode?: number; // 1/2/...
  filters?: {
    pricePercFilters?: Array<{
      dayIndex?: number; // MVP: 0
      isAbsChange?: boolean;
      pricePercChange?: number; // e.g. 1.0
      side?: number; // 0 any, 1 pos, 2 neg
      timeStart?: number; // window id
      timeEnd?: number; // window id
    }>;
    volatilityFilters?: any[];
    volumeFilters?: any[];
    moneyTradedFilters?: any[];
    reportFilter?: { dayIndex?: number; reportFilterType?: number };
  };

  additionalPriceData?: boolean;
  additionalVolumeData?: boolean;
  additionalPriceDataWithParams?: boolean;
};

export type TickerdaysResult = {
  meta?: {
    startDateNy?: string;
    endDateNy?: string;
    tickers?: string[];
    fetchDataMode?: number;
    [k: string]: any;
  };
  days?: any[];
  intraday?: Record<string, any[]>;
  performance?: {
    trades?: any[];
    summary?: any[];
    [k: string]: any;
  };
  [k: string]: any;
};

export type TickerdaysWindow = {
  id: number;
  label: string;
};

function clip(s: string, max = 2000) {
  if (!s) return s;
  const x = s.trim();
  return x.length > max ? x.slice(0, max) + " …" : x;
}

async function readError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    try {
      const j: any = await res.json();
      const msg =
        j?.error ??
        j?.message ??
        j?.title ??
        j?.detail ??
        (typeof j === "string" ? j : null);

      if (msg) return clip(String(msg));
      return clip(JSON.stringify(j));
    } catch {
      // fallthrough
    }
  }

  try {
    const t = await res.text();
    return clip(t);
  } catch {
    return "";
  }
}

async function fetchJson<T>(absUrl: string, init?: RequestInit): Promise<T> {
  const res = await fetch(absUrl, init);

  if (!res.ok) {
    const err = await readError(res);
    throw new Error(`${absUrl} failed: ${res.status}${err ? ` • ${err}` : ""}`);
  }

  return (await res.json()) as T;
}

export async function postTickerdaysReport(body: TickerdaysReportRequest): Promise<TickerdaysAck> {
  return fetchJson<TickerdaysAck>(bridgeUrl("/api/tickerdays/report"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getTickerdaysStatus(requestId: string): Promise<TickerdaysStatus> {
  return fetchJson<TickerdaysStatus>(bridgeUrl(`/api/tickerdays/status/${encodeURIComponent(requestId)}`), {
    method: "GET",
  });
}

export async function getTickerdaysResult(requestId: string): Promise<TickerdaysResult> {
  return fetchJson<TickerdaysResult>(bridgeUrl(`/api/tickerdays/result/${encodeURIComponent(requestId)}`), {
    method: "GET",
  });
}

export async function postTickerdaysCancel(requestId: string): Promise<any> {
  return fetchJson<any>(bridgeUrl(`/api/tickerdays/cancel/${encodeURIComponent(requestId)}`), {
    method: "POST",
  });
}

/**
 * Windows list for Tickerdays mode (selectors in SIFTER)
 * GET /api/tickerdays/windows -> [{id,label}]
 */
export async function getTickerdaysWindows(): Promise<TickerdaysWindow[]> {
  return fetchJson<TickerdaysWindow[]>(bridgeUrl("/api/tickerdays/windows"), {
    method: "GET",
  });
}