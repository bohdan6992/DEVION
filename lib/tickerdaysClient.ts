// lib/tickerdaysClient.ts

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
  // Prefer NY date strings to avoid timezone shifts
  startDateNy: string; // "YYYY-MM-DD"
  endDateNy: string;   // "YYYY-MM-DD"

  tickers: string[];

  fetchDataMode?: number; // 1/2/...
  filters?: {
    pricePercFilters?: Array<{
      dayIndex?: number; // MVP: 0
      isAbsChange?: boolean;
      pricePercChange?: number; // e.g. 1.0
      side?: number; // 0 any, 1 pos, 2 neg
      timeStart?: number; // window id
      timeEnd?: number;   // window id
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
  days?: any[]; // you can strongly type later (TickerdaysDayRowDto)
  intraday?: Record<string, any[]>; // key: "TICKER|YYYY-MM-DD" -> points[]
  performance?: {
    trades?: any[];
    summary?: any[];
    [k: string]: any;
  };
  [k: string]: any;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed: ${res.status}${text ? ` • ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export async function postTickerdaysReport(body: TickerdaysReportRequest): Promise<TickerdaysAck> {
  return fetchJson<TickerdaysAck>("/api/tickerdays/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getTickerdaysStatus(requestId: string): Promise<TickerdaysStatus> {
  return fetchJson<TickerdaysStatus>(`/api/tickerdays/status/${encodeURIComponent(requestId)}`, {
    method: "GET",
  });
}

export async function getTickerdaysResult(requestId: string): Promise<TickerdaysResult> {
  return fetchJson<TickerdaysResult>(`/api/tickerdays/result/${encodeURIComponent(requestId)}`, {
    method: "GET",
  });
}

export async function postTickerdaysCancel(requestId: string): Promise<any> {
  return fetchJson<any>(`/api/tickerdays/cancel/${encodeURIComponent(requestId)}`, {
    method: "POST",
  });
}
