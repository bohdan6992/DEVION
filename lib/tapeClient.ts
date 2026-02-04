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
// Raw tape (minute rows)
// ========================

export type TapeMinuteRow = Record<string, any>;

export type TapeMinuteResponse =
  | { ok?: boolean; rows?: TapeMinuteRow[] }
  | TapeMinuteRow[];

export type TapeDaysResponse = { ok?: boolean; days?: string[] } | string[];

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

// ------------------------
// Base URL resolution (like trapClient)
// ------------------------

const DEFAULT_LOCAL = "http://localhost:5197";

function isBrowser() {
  return typeof window !== "undefined";
}

function stripTrailingSlashes(x: string) {
  return (x || "").replace(/\/+$/, "");
}

function readBridgeFromLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const u = new URL(window.location.href);
    // support ?bridge=http://localhost:5197
    const v = u.searchParams.get("bridge");
    return v ? stripTrailingSlashes(v) : null;
  } catch {
    return null;
  }
}

function readBridgeFromStorage(): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem("bridgeApiBase");
    return v ? stripTrailingSlashes(v) : null;
  } catch {
    return null;
  }
}

function writeBridgeToStorage(v: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem("bridgeApiBase", stripTrailingSlashes(v));
  } catch {
    // ignore
  }
}

function getBaseUrl(): string {
  // 1) Explicit env override (works for browser builds too)
  const envBase = stripTrailingSlashes(process.env.NEXT_PUBLIC_BRIDGE_API || "");
  if (envBase) return envBase;

  // 2) Browser-only: allow ?bridge= and localStorage, fallback to localhost
  if (isBrowser()) {
    const fromUrl = readBridgeFromLocation();
    if (fromUrl) {
      writeBridgeToStorage(fromUrl);
      return fromUrl;
    }
    const fromLs = readBridgeFromStorage();
    if (fromLs) return fromLs;
    return DEFAULT_LOCAL;
  }

  // 3) Server/SSR: NO localhost fallback (prevents Vercel from trying to call itself)
  // Return empty -> caller will throw a useful error if used on server.
  return "";
}

function url(path: string) {
  const base = getBaseUrl();
  if (!base) {
    throw new Error(
      "TapeClient: base URL is not set on the server. " +
        "Use client-side fetch (browser) or set NEXT_PUBLIC_BRIDGE_API to a public URL."
    );
  }
  return `${base}${path}`;
}

// ------------------------
// HTTP helpers
// ------------------------

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
    if (typeof v === "number" && !Number.isFinite(v)) continue;
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
  const form = new URLSearchParams();

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;

    if (Array.isArray(v)) {
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

// ------------------------
// Client
// ------------------------

export const tapeClient = {
  // tape arbitrage
  snapshot(dateNy: string) {
    return getJson<TapeArbSnapshot>(`/api/tape/arbitrage/snapshot?dateNy=${encodeURIComponent(dateNy)}`);
  },
  active(dateNy: string) {
    return getJson<TapeArbState[]>(`/api/tape/arbitrage/active?dateNy=${encodeURIComponent(dateNy)}`);
  },
  closed(dateNy: string) {
    return getJson<TapeArbState[]>(`/api/tape/arbitrage/closed?dateNy=${encodeURIComponent(dateNy)}`);
  },

  // SSE
  sseUrl() {
    // For EventSource you need absolute URL
    return url(`/api/tape/stream`);
  },

  // raw tape
  async availableDays(): Promise<string[]> {
    const x = await getJson<TapeDaysResponse>(`/api/tape/available-days`);
    return normalizeDaysPayload(x);
  },

  async minute(dateNy: string, minuteIdx: number): Promise<TapeMinuteRow[]> {
    const x = await getJson<TapeMinuteResponse>(
      `/api/tape/minute?dateNy=${encodeURIComponent(dateNy)}&minuteIdx=${minuteIdx}`
    );
    return normalizeRowsPayload(x);
  },

  async query(req: TapeQueryRequest): Promise<TapeMinuteRow[]> {
    const body = compactBody(req as any);

    try {
      const x = await postJson<TapeMinuteResponse>(`/api/tape/query`, body);
      return normalizeRowsPayload(x);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("400") || msg.toLowerCase().includes("bad request")) {
        const x = await postForm<TapeMinuteResponse>(`/api/tape/query`, body);
        return normalizeRowsPayload(x);
      }
      throw e;
    }
  },
};
