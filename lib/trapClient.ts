// lib/trapClient.ts
import { FullFieldName } from "./fullFields";

export const DEFAULT_TRAP_URL = "http://localhost:5197";

/**
 * Optional bridge override:
 * - https://your-vercel.app/?bridge=http://localhost:5197
 * - or persist in localStorage
 */
const LS_BRIDGE_KEY = "bridgeBaseUrl";

export type TrapErrorType = "NOT_RUNNING" | "HTTP_ERROR" | "BAD_JSON";

export type TrapError = {
  type: TrapErrorType;
  message: string;
  status?: number;
};

// one row full-quotes
export type FullQuotesRow = {
  ticker: string;
} & {
  [K in FullFieldName]: string | number | null;
};

/* ============================= small utils ============================= */

function safeTrimBase(v: any) {
  return String(v ?? "").trim().replace(/\/+$/, "");
}

function isPlainObject(x: any): x is Record<string, any> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function toStr(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
}

function tryParseJsonText(s: string): any | null {
  try {
    const t = (s ?? "").trim();
    if (!t) return null;
    if (!(t.startsWith("{") || t.startsWith("["))) return null;
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractApiErrorMessage(textOrJson: any, fallback: string) {
  try {
    if (textOrJson == null) return fallback;

    if (typeof textOrJson === "object") {
      const msg =
        (textOrJson as any).message ||
        (textOrJson as any).error ||
        (textOrJson as any).title ||
        (textOrJson as any).detail;

      const type = (textOrJson as any).type
        ? ` (${String((textOrJson as any).type)})`
        : "";
      const path = (textOrJson as any).path
        ? ` @ ${String((textOrJson as any).path)}`
        : "";

      if (msg) return `${String(msg)}${type}${path}`.trim();
      return fallback;
    }

    const s = String(textOrJson);
    return s.trim() ? s : fallback;
  } catch {
    return fallback;
  }
}

/* ============================= bridge base resolution ============================= */

function readBridgeFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const b = u.searchParams.get("bridge");
    if (!b) return null;
    const clean = safeTrimBase(b);
    if (!clean) return null;

    // persist and remove from URL
    localStorage.setItem(LS_BRIDGE_KEY, clean);
    u.searchParams.delete("bridge");
    window.history.replaceState({}, "", u.toString());

    return clean;
  } catch {
    return null;
  }
}

function readBridgeFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LS_BRIDGE_KEY);
    const clean = safeTrimBase(v);
    return clean || null;
  } catch {
    return null;
  }
}

/**
 * Main rule:
 * - Browser → localhost allowed
 * - Server/Vercel → never localhost; use env only
 */
function getBridgeBase() {
  // Browser: query override > localStorage override > default localhost
  if (typeof window !== "undefined") {
    const fromQuery = readBridgeFromQuery();
    if (fromQuery) return fromQuery;

    const fromStorage = readBridgeFromStorage();
    if (fromStorage) return fromStorage;

    return safeTrimBase(DEFAULT_TRAP_URL);
  }

  // Server-side: env only
  const envBase =
    process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ||
    process.env.NEXT_PUBLIC_TRAP_URL ||
    "";

  return safeTrimBase(envBase);
}

/* ============================= core fetch ============================= */

async function fetchBridgeJson<T = any>(path: string): Promise<T> {
  const base = getBridgeBase();
  const url = `${base}${path}`;

  try {
    if (!base) {
      throw <TrapError>{
        type: "NOT_RUNNING",
        message:
          "Bridge base URL is empty on server. Use client-side fetch or set NEXT_PUBLIC_TRADING_BRIDGE_URL.",
      };
    }

    const res = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
    });

    if (!res.ok) {
      const ct = res.headers.get("content-type") || "";
      let bodyText = "";
      let bodyJson: any = null;

      if (ct.includes("application/json")) {
        bodyJson = await res.json().catch(() => null);
      } else {
        bodyText = await res.text().catch(() => "");
        bodyJson = tryParseJsonText(bodyText);
      }

      throw <TrapError>{
        type: "HTTP_ERROR",
        status: res.status,
        message: extractApiErrorMessage(
          bodyJson ?? bodyText,
          `HTTP ${res.status}`
        ),
      };
    }

    try {
      return (await res.json()) as T;
    } catch (e: any) {
      throw <TrapError>{
        type: "BAD_JSON",
        message: e?.message || "Bad JSON",
      };
    }
  } catch (e: any) {
    if (e?.type) throw e;

    throw <TrapError>{
      type: "NOT_RUNNING",
      message: "TRAP не запущений або недоступний на цьому пристрої",
    };
  }
}

function buildQuery(q?: Record<string, any>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    p.set(k, s);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Flatten row that may have Extras/extras and mixed casing of core fields.
 * Useful for matrix pages to not miss columns.
 */
export function flattenWithExtras(item: any): Record<string, string> {
  if (!isPlainObject(item)) return {};

  const extras = (item as any).Extras ?? (item as any).extras ?? {};
  const out: Record<string, string> = {};

  // copy direct fields first (excluding Extras container itself)
  for (const [k, v] of Object.entries(item)) {
    if (k === "Extras" || k === "extras") continue;
    out[String(k)] = toStr(v);
  }

  // then flatten extras on top (extras wins)
  if (isPlainObject(extras)) {
    for (const [k, v] of Object.entries(extras)) out[String(k)] = toStr(v);
  }

  // normalize ticker if present
  const t = out.ticker || out.Ticker || "";
  if (t) {
    out.ticker = String(t).trim().toUpperCase();
    out.Ticker = out.ticker;
  }

  return out;
}

/* ============================= /api/health ============================= */

export async function getHealth() {
  return fetchBridgeJson(`/api/health`);
}

/* ============================= /api/quotes ============================= */

export async function getTrapQuotes() {
  return fetchBridgeJson("/api/quotes");
}

/* ============================= legacy: /api/strategy/{name}/stats (CSV rows) ============================= */

export async function getStrategyStats(strategy: string) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };
  return fetchBridgeJson<any[]>(`/api/strategy/${encodeURIComponent(s)}/stats`);
}

/* ============================= STRATEGY CONTRACT (universal endpoints) ============================= */

export type StrategySummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  count: number;
  header?: string[];
  items: Array<Record<string, any>>;
};

export type StrategyTickerResponse = {
  ok?: boolean;
  format?: "jsonl" | "json";
  ticker?: string;
  item: any;
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
};

export type StrategyBestParamsResponse = {
  ok: boolean;
  format?: "jsonl" | "json";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  ticker: string;
  item: Record<string, any> | null;
};

export type StrategySignalsResponse = {
  ok: boolean;
  strategy: string;
  cls?: string;
  type?: string;
  mode?: string;
  offset?: number;
  limit?: number;
  total?: number;
  returned: number;
  items: any[];
};

export async function getStrategySummary(
  strategy: string,
  params?: { q?: string }
) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };

  const qs = buildQuery({ q: params?.q });

  return fetchBridgeJson<StrategySummaryResponse>(
    `/api/strategy/${encodeURIComponent(s)}/summary${qs}`
  );
}

export async function getStrategyTicker(strategy: string, ticker: string) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };

  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<StrategyTickerResponse>(
    `/api/strategy/${encodeURIComponent(s)}/ticker/${encodeURIComponent(t)}`
  );
}

export async function getStrategyBestParams(strategy: string, ticker: string) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };

  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<StrategyBestParamsResponse>(
    `/api/strategy/${encodeURIComponent(s)}/best-params/${encodeURIComponent(t)}`
  );
}

export async function getStrategySignals(
  strategy: string,
  opts?: {
    cls?: string;
    type?: string;
    mode?: string; // all|top
    tickers?: string;
    minRate?: number | string;
    minTotal?: number | string;
    topN?: number | string;
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };

  const qs = buildQuery({
    cls: opts?.cls,
    type: opts?.type,
    mode: opts?.mode,
    tickers: opts?.tickers,
    minRate: opts?.minRate,
    minTotal: opts?.minTotal,
    topN: opts?.topN,
    limit: opts?.limit,
    offset: opts?.offset,
    dateFrom: opts?.dateFrom,
    dateTo: opts?.dateTo,
  });

  return fetchBridgeJson<StrategySignalsResponse>(
    `/api/strategy/${encodeURIComponent(s)}/signals${qs}`
  );
}

/* ============================= ARBITRAGE (files-based endpoints) ============================= */

export type ArbitrageSummaryRow = Record<string, any>;

export type ArbitrageSummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  count: number;
  header?: string[];
  items: Array<{
    ticker?: string;
    Ticker?: string;
    bench?: string;
    Bench?: string;
    corr?: string;
    Corr?: string;
    beta?: string;
    Beta?: string;
    sig?: string;
    Sig?: string;
    extras?: Record<string, string>;
    Extras?: Record<string, string>;
    [k: string]: any;
  }>;
};

export async function getArbitrageSummary(
  q?: string
): Promise<ArbitrageSummaryResponse> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return fetchBridgeJson<ArbitrageSummaryResponse>(`/api/arbitrage/summary${qs}`);
}

/**
 * Backward compatible list: returns flat rows with string values (extras flattened)
 */
export async function getArbitrageList(
  q?: string
): Promise<Record<string, string>[]> {
  const json = await getArbitrageSummary(q);
  const items = Array.isArray(json?.items) ? json.items : [];

  return items.map((r) => {
    const flat = flattenWithExtras(r);
    // normalize core meta keys to lower-case ones UI expects
    const out: Record<string, string> = {
      ticker: flat.ticker || flat.Ticker || "",
      bench: flat.bench || flat.Bench || "",
      corr: flat.corr || flat.Corr || "",
      beta: flat.beta || flat.Beta || "",
      sig: flat.sig || flat.Sig || flat.sigma || "",
    };

    // include the rest
    for (const [k, v] of Object.entries(flat)) {
      if (k in out) continue;
      out[k] = v ?? "";
    }

    return out;
  });
}

export type ArbitrageTickerStats = Record<string, any>;

export type ArbitrageTickerResponse = {
  ok?: boolean;
  format?: "jsonl";
  ticker?: string;
  item: any;
  updatedAt?: string | null;
};

export async function getArbitrageTicker(
  ticker: string
): Promise<ArbitrageTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };
  return fetchBridgeJson<ArbitrageTickerResponse>(
    `/api/arbitrage/ticker/${encodeURIComponent(t)}`
  );
}

export async function getArbitrageStatsByTicker(
  ticker: string
): Promise<ArbitrageTickerResponse> {
  return getArbitrageTicker(ticker);
}

export type ArbitrageBestParamsResponse = {
  ok: boolean;
  format?: "jsonl";
  updatedAt?: string | null;
  ticker: string;
  item: Record<string, any> | null;
};

export async function getArbitrageBestParamsByTicker(
  ticker: string
): Promise<ArbitrageBestParamsResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<ArbitrageBestParamsResponse>(
    `/api/arbitrage/best-params/${encodeURIComponent(t)}`
  );
}

export type ArbitrageSignalsQuery = {
  tickers?: string; // csv
  minRate?: number | string;
  minTotal?: number | string;
  topN?: number | string;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type ArbitrageSignalsClass =
  | "ark"
  | "print"
  | "open"
  | "intra"
  | "global"
  | "blue"
  | "post";
export type ArbitrageSignalsType = "any" | "hard" | "soft";
export type ArbitrageSignalsMode = "all" | "top";

export type ArbitrageSignalsResponse = {
  ok: boolean;
  cls: ArbitrageSignalsClass;
  type: ArbitrageSignalsType;
  mode: ArbitrageSignalsMode;
  offset?: number;
  limit?: number;
  total?: number;
  returned: number;
  items: any[];
};

export async function getArbitrageSignals(
  cls: ArbitrageSignalsClass,
  type: ArbitrageSignalsType,
  mode: ArbitrageSignalsMode,
  query?: ArbitrageSignalsQuery
): Promise<ArbitrageSignalsResponse> {
  const qs = buildQuery({
    tickers: query?.tickers,
    minRate: query?.minRate,
    minTotal: query?.minTotal,
    topN: query?.topN,
    limit: query?.limit,
    offset: query?.offset,
  });

  return fetchBridgeJson<ArbitrageSignalsResponse>(
    `/api/arbitrage/signals/${encodeURIComponent(cls)}/${encodeURIComponent(
      type
    )}/${encodeURIComponent(mode)}${qs}`
  );
}

// backwards-compatible alias
export const getArbTicker = getArbitrageTicker;

/* ============================= OPENDOOR (files-based endpoints) ============================= */

export type OpendoorSummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  count: number;
  header?: string[];
  items: Array<Record<string, any>>;
};

/**
 * /api/opendoor/summary
 * example: http://localhost:5197/api/opendoor/summary?q=
 */
export async function getOpendoorSummary(
  params?: { q?: string }
): Promise<OpendoorSummaryResponse> {
  const qs = buildQuery({ q: params?.q });
  return fetchBridgeJson<OpendoorSummaryResponse>(`/api/opendoor/summary${qs}`);
}

/** /api/opendoor/ticker/{ticker} (onefile.jsonl row) */
export type OpendoorTickerResponse = {
  ok?: boolean;
  format?: "jsonl";
  ticker?: string;
  item: any;
  updatedAt?: string | null;
};

export async function getOpendoorTicker(
  ticker: string
): Promise<OpendoorTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<OpendoorTickerResponse>(
    `/api/opendoor/ticker/${encodeURIComponent(t)}`
  );
}

/** /api/opendoor/best-params/{ticker} */
export type OpendoorBestParamsResponse = {
  ok: boolean;
  format?: "json" | "jsonl";
  updatedAt?: string | null;
  ticker: string;
  item: Record<string, any> | null;
};

export async function getOpendoorBestParamsByTicker(
  ticker: string
): Promise<OpendoorBestParamsResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<OpendoorBestParamsResponse>(
    `/api/opendoor/best-params/${encodeURIComponent(t)}`
  );
}

/**
 * ✅ OpenDoor Signals (files-based)
 * Endpoint:
 *   /api/opendoor/signals/{cls}/{type}/{mode}?minRate=&minTotal=&limit=&offset=&tickers=
 */
export type OpendoorSignalsResponse = {
  ok: boolean;
  cls?: string;
  type?: string;
  mode?: string;
  offset?: number;
  limit?: number;
  total?: number;
  returned: number;
  items: any[];
};

export async function getOpendoorSignals(opts?: {
  cls?: string; // e.g. glob|5m|10m...
  type?: string; // any|up|down
  mode?: string; // all|top
  tickers?: string; // csv
  minRate?: number | string;
  minTotal?: number | string;
  limit?: number | string;
  offset?: number | string;
}): Promise<OpendoorSignalsResponse> {
  const qs = buildQuery({
    minRate: opts?.minRate,
    minTotal: opts?.minTotal,
    limit: opts?.limit,
    offset: opts?.offset,
    tickers: opts?.tickers,
  });

  const cls = encodeURIComponent(opts?.cls ?? "glob");
  const type = encodeURIComponent(opts?.type ?? "any");
  const mode = encodeURIComponent(opts?.mode ?? "all");

  return fetchBridgeJson<OpendoorSignalsResponse>(
    `/api/opendoor/signals/${cls}/${type}/${mode}${qs}`
  );
}

/**
 * Flat list helper: returns array rows with string values.
 * ✅ Extras/extras are flattened (so matrix pages don’t miss columns)
 */
export async function getOpendoorList(params?: {
  q?: string;
}): Promise<Record<string, string>[]> {
  const json = await getOpendoorSummary(params);
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((r) => flattenWithExtras(r));
}

/**
 * ✅ Stable aliases for UI naming (OpenDoor vs opendoor vs Opendoor)
 */
export const getOpenDoorSummary = getOpendoorSummary;
export const getOpenDoorTicker = getOpendoorTicker;
export const getOpenDoorBestParamsByTicker = getOpendoorBestParamsByTicker;
export const getOpenDoorList = getOpendoorList;
export const getOpenDoorSignals = getOpendoorSignals;

// backward compatible (typo in older code)
export const getOpenoorSummary = getOpendoorSummary;

/* ============================= CHRONO (files-based endpoints) ============================= */

export type ChronoSummaryRow = Record<string, any>;

export type ChronoSummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  count: number;
  header?: string[];
  items: Array<Record<string, any>>;
};

/**
 * /api/chrono/summary
 */
export async function getChronoSummary(params?: {
  q?: string;
  window?: string;
}): Promise<ChronoSummaryResponse> {
  const qs = buildQuery({
    q: params?.q,
    window: params?.window,
  });
  return fetchBridgeJson<ChronoSummaryResponse>(`/api/chrono/summary${qs}`);
}

/**
 * Flat list helper: returns flat rows; Extras/extras also flattened if backend ever adds it.
 */
export async function getChronoList(params?: {
  q?: string;
  window?: string;
}): Promise<Record<string, string>[]> {
  const json = await getChronoSummary(params);
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((r) => flattenWithExtras(r));
}

/** /api/chrono/ticker/{ticker} */
export type ChronoTickerResponse = {
  ok?: boolean;
  format?: "jsonl";
  ticker?: string;
  item: any;
  updatedAt?: string | null;
};

export async function getChronoTicker(
  ticker: string
): Promise<ChronoTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<ChronoTickerResponse>(
    `/api/chrono/ticker/${encodeURIComponent(t)}`
  );
}

/** /api/chrono/best-params/{ticker} */
export type ChronoBestParamsResponse = {
  ok: boolean;
  format?: "jsonl";
  updatedAt?: string | null;
  ticker: string;
  item: Record<string, any> | null;
};

export async function getChronoBestParamsByTicker(
  ticker: string
): Promise<ChronoBestParamsResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<ChronoBestParamsResponse>(
    `/api/chrono/best-params/${encodeURIComponent(t)}`
  );
}

/* ============================= /api/universe-quotes ============================= */

export async function getUniverseQuotes() {
  return fetchBridgeJson(`/api/universe-quotes`);
}

/* ============================= /api/full-quotes ============================= */

type FullQuotesResponse = {
  elapsedMs: number;
  universeTickers: number;
  returnedTickers: number;
  items: Record<string, FullQuotesRow>;
  fieldsCount?: number;
  fieldsUsed?: string[];
  capturedAt?: string;
};

export async function getFullQuotes(opts?: {
  tickers?: string[];
  fields?: string[];
  preset?: "lite";
}): Promise<FullQuotesResponse> {
  const p = new URLSearchParams();
  if (opts?.tickers?.length) p.set("tickers", opts.tickers.join(","));
  if (opts?.fields?.length) p.set("fields", opts.fields.join(","));
  if (opts?.preset) p.set("preset", opts.preset);

  const qs = p.toString();
  return fetchBridgeJson<FullQuotesResponse>(
    `/api/full-quotes${qs ? `?${qs}` : ""}`
  );
}

// keep backward compatible signature
export async function getFullQuotesLegacy(tickers?: string[]) {
  return getFullQuotes({ tickers });
}

/* ============================= bridge controls (optional UI settings) ============================= */

export function setBridgeBaseUrl(url: string) {
  if (typeof window === "undefined") return;
  const clean = safeTrimBase(url);
  if (!clean) return;
  try {
    localStorage.setItem(LS_BRIDGE_KEY, clean);
  } catch {}
}

export function clearBridgeBaseUrl() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_BRIDGE_KEY);
  } catch {}
}
