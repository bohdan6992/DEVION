// lib/tapeClient.ts

export type TapeArbMetric = "SigmaZap" | "ZapPct";
export type TapeArbSide = "Long" | "Short";
export type TapeArbStatus = "Active" | "Closed";

export type TapeArbState = {
  status?: TapeArbStatus;
  isActive?: boolean;

  dateNy?: string;
  ticker: string;
  benchTicker?: string;

  side?: TapeArbSide;

  startMinuteIdx?: number;
  peakMinuteIdx?: number;
  endMinuteIdx?: number;

  lastMinuteIdx?: number;

  startDev?: number;
  peakDev?: number;
  peakDevAbs?: number;
  endDev?: number;
  lastDev?: number;

  rating?: number | null;
  total?: number | null;

  tierBp?: number | null;
  beta?: number | null;
  hedgeNotional?: number | null;

  stockEntryPct?: number | null;
  stockExitPct?: number | null;

  benchEntryPct?: number | null;
  benchExitPct?: number | null;

  stockPnlUsd?: number | null;
  hedgePnlUsd?: number | null;
  totalPnlUsd?: number | null;
};

export type TapeArbSnapshot = {
  dateNy: string;
  lastMinute: number;
  active: TapeArbState[];
  closed: TapeArbState[];
};

// ========================
// NEW: Raw tape (minute rows)
// ========================

export type TapeMinuteRow = Record<string, any>;

export type TapeMinuteResponse =
  | { ok?: boolean; rows?: TapeMinuteRow[] }
  | TapeMinuteRow[];

export type TapeDaysResponse = { ok?: boolean; days?: string[] } | string[];

/**
 * IMPORTANT:
 * We keep request keys in camelCase for JSON.
 * Also: some backends bind POST /api/tape/query from query-string (not body) by mistake.
 * To be resilient we:
 *  - send only defined fields (no nulls)
 *  - on 400, fallback to form-url-encoded POST
 */
export type TapeQueryRequest = {
  dateNy: string;
  minuteFrom?: number;
  minuteTo?: number;
  tickers?: string[];
  minZapPct?: number;
  minSigmaZap?: number;
  limit?: number;
  offset?: number;
};

const BASE = (process.env.NEXT_PUBLIC_BRIDGE_API || "").replace(/\/+$/, "");

function url(path: string) {
  return BASE ? `${BASE}${path}` : path;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(url(path), { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${path}\n${txt}`);
  }
  return (await res.json()) as T;
}

function compactBody(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    // avoid NaN / Infinity
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    // avoid empty arrays
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

async function postJson<T>(path: string, body: any): Promise<T> {
  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${path}\n${txt}`);
  }

  return (await res.json()) as T;
}

async function postForm<T>(path: string, body: Record<string, any>): Promise<T> {
  // form fallback: supports backends that bind POST from query/form instead of body
  const form = new URLSearchParams();

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;

    if (Array.isArray(v)) {
      // common patterns: tickers=AAPL&tickers=MSFT
      for (const it of v) form.append(k, String(it));
    } else {
      form.set(k, String(v));
    }
  }

  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${path}\n${txt}`);
  }

  return (await res.json()) as T;
}

function normalizeDaysPayload(x: TapeDaysResponse): string[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object" && Array.isArray((x as any).days)) return (x as any).days;
  return [];
}

function normalizeRowsPayload(x: TapeMinuteResponse): TapeMinuteRow[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object" && Array.isArray((x as any).rows)) return (x as any).rows;
  return [];
}

export const tapeClient = {
  // ========================
  // Existing: tape arbitrage
  // ========================
  snapshot(dateNy: string) {
    return getJson<TapeArbSnapshot>(`/api/tape/arbitrage/snapshot?dateNy=${encodeURIComponent(dateNy)}`);
  },
  active(dateNy: string) {
    return getJson<TapeArbState[]>(`/api/tape/arbitrage/active?dateNy=${encodeURIComponent(dateNy)}`);
  },
  closed(dateNy: string) {
    return getJson<TapeArbState[]>(`/api/tape/arbitrage/closed?dateNy=${encodeURIComponent(dateNy)}`);
  },

  // SSE (arbitrage stream)
  sseUrl() {
    return url(`/api/tape/stream`);
  },

  // ========================
  // NEW: raw tape endpoints
  // ========================

  async availableDays(): Promise<string[]> {
    const x = await getJson<TapeDaysResponse>(`/api/tape/available-days`);
    return normalizeDaysPayload(x);
  },

  // NOTE: backend may not have this endpoint. Prefer query().
  async minute(dateNy: string, minuteIdx: number): Promise<TapeMinuteRow[]> {
    const x = await getJson<TapeMinuteResponse>(
      `/api/tape/minute?dateNy=${encodeURIComponent(dateNy)}&minuteIdx=${minuteIdx}`
    );
    return normalizeRowsPayload(x);
  },

  // POST /api/tape/query (range + filters)
  // Resilient: sends compact JSON; on 400 falls back to form POST.
  async query(req: TapeQueryRequest): Promise<TapeMinuteRow[]> {
    const body = compactBody(req as any);

    try {
      const x = await postJson<TapeMinuteResponse>(`/api/tape/query`, body);
      return normalizeRowsPayload(x);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // fallback only for typical binding/validation failures
      if (msg.includes("400") || msg.toLowerCase().includes("bad request")) {
        const x = await postForm<TapeMinuteResponse>(`/api/tape/query`, body);
        return normalizeRowsPayload(x);
      }
      throw e;
    }
  },
};
