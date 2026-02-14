export type ExitMode = "Move1000" | "Close" | "MinuteIdx";

export type ScopeEventsRequest = {
  dateFromNy: number;
  dateToNy: number;
  tickers: string[];
  entryMinuteIdx: number;
  exitMode: ExitMode;
  exitMinuteIdx?: number;
  includeColumns?: string[];
};

export type ScopeChartsRequest = {
  events: ScopeEventsRequest;
  charts: Array<
    | { id: string; kind: "Performance"; field: string }
    | { id: string; kind: "Distribution"; field: string }
    | { id: string; kind: "Cumsum"; field: string }
    | {
        id: string;
        kind: "Bins";
        field: string;
        xField: string;
        binningMode: "Quantiles" | "Fixed";
        quantiles?: number;
        binSize?: number;
      }
  >;
};

export type ScopeChartsResponse = {
  ok: boolean;
  payloads?: Record<string, any>;
  error?: string;
};

export type ScopeEventRow = {
  dateNy: number;
  ticker: string;
  entryPct: number;
  exitPct: number;
  trade: number;
  features?: Record<string, number>;
};

export type ScopeEventsResponse = {
  ok: boolean;
  rows?: ScopeEventRow[];
  error?: string;
};

function pickErrorMessage(json: any, text: string, status: number): string {
  const msg =
    (json && (json.error || json.message || json.title || json.detail)) ||
    (typeof json === "string" ? json : null) ||
    (text ? text.slice(0, 2000) : null) ||
    `HTTP ${status}`;

  return String(msg);
}

async function postJson<T>(url: string, bodyObj: any): Promise<{ ok: boolean; status: number; text: string; json: any | null; parsed: T | null }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });

  const text = await r.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response
  }

  return { ok: r.ok, status: r.status, text, json, parsed: (json ?? null) as T | null };
}

export async function postScopeCharts(req: ScopeChartsRequest): Promise<ScopeChartsResponse> {
  const res = await postJson<ScopeChartsResponse>("/api/scope/charts", req);

  if (!res.ok) {
    return {
      ok: false,
      error: pickErrorMessage(res.json, res.text, res.status),
      payloads: (res.json as any)?.payloads,
    };
  }

  return (res.parsed ?? { ok: true }) as ScopeChartsResponse;
}

export async function postScopeEvents(req: ScopeEventsRequest): Promise<ScopeEventsResponse> {
  const res = await postJson<ScopeEventsResponse>("/api/scope/events", req);

  if (!res.ok) {
    return {
      ok: false,
      error: pickErrorMessage(res.json, res.text, res.status),
    };
  }

  return (res.parsed ?? { ok: true }) as ScopeEventsResponse;
}

// "SPY, AAPL" -> ["SPY","AAPL"]
export function parseTickers(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
