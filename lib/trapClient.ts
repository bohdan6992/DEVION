// lib/trapClient.ts
import { FullFieldName } from "./fullFields";

export const DEFAULT_TRAP_URL = "http://localhost:5197";

/**
 * Якщо захочеш дозволити людям змінювати адресу моста:
 * https://your-vercel.app/?bridge=http://localhost:5197
 * або зберігати її в localStorage.
 *
 * За замовчуванням НЕ потрібне — але не заважає.
 */
const LS_BRIDGE_KEY = "bridgeBaseUrl";

export type TrapErrorType = "NOT_RUNNING" | "HTTP_ERROR" | "BAD_JSON";

export type TrapError = {
  type: TrapErrorType;
  message: string;
  status?: number;
};

// один рядок full-quotes
export type FullQuotesRow = {
  ticker: string;
} & {
  [K in FullFieldName]: string | number | null;
};

function safeTrimBase(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function readBridgeFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const b = u.searchParams.get("bridge");
    if (!b) return null;
    const clean = safeTrimBase(b);
    if (!clean) return null;

    // збережемо і приберемо з URL (щоб не світити)
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
 * Головне правило:
 * - Browser → можна localhost (кожен запускає міст у себе)
 * - Server/Vercel → ніколи localhost
 */
function getBridgeBase() {
  // ✅ Browser: беремо override (query/storage) або localhost за замовчуванням
  if (typeof window !== "undefined") {
    const fromQuery = readBridgeFromQuery();
    if (fromQuery) return fromQuery;

    const fromStorage = readBridgeFromStorage();
    if (fromStorage) return fromStorage;

    return safeTrimBase(DEFAULT_TRAP_URL);
  }

  // ✅ Server (SSR/build): лише env (якщо раптом є server-side consumer)
  const envBase =
    process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ||
    process.env.NEXT_PUBLIC_TRAP_URL ||
    "";

  return safeTrimBase(envBase);
}

function extractApiErrorMessage(textOrJson: any, fallback: string) {
  try {
    if (textOrJson == null) return fallback;

    // if json object
    if (typeof textOrJson === "object") {
      const msg =
        (textOrJson as any).message ||
        (textOrJson as any).error ||
        (textOrJson as any).title ||
        (textOrJson as any).detail;
      const type = (textOrJson as any).type ? ` (${(textOrJson as any).type})` : "";
      const path = (textOrJson as any).path ? ` @ ${(textOrJson as any).path}` : "";
      if (msg) return `${String(msg)}${type}${path}`.trim();
      return fallback;
    }

    // plain text
    const s = String(textOrJson);
    if (!s.trim()) return fallback;
    return s;
  } catch {
    return fallback;
  }
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

/**
 * Універсальний запит до TradingBridgeApi
 */
async function fetchBridgeJson<T = any>(path: string): Promise<T> {
  const base = getBridgeBase();
  const url = `${base}${path}`;

  try {
    // ⚠️ якщо base пустий (SSR без env) — одразу нормальна помилка
    if (!base) {
      throw <TrapError>{
        type: "NOT_RUNNING",
        message: "Bridge base URL is empty on server. Use client-side fetch or set env.",
      };
    }

    const res = await fetch(url, {
      cache: "no-store",
      // credentials не треба, але не заважає CORS
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
        message: extractApiErrorMessage(bodyJson ?? bodyText, `HTTP ${res.status}`),
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

    // Типовий випадок: міст не запущений / порт не доступний / CORS
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

/* ========= /api/health ========= */

export async function getHealth() {
  return fetchBridgeJson(`/api/health`);
}

/* ========= /api/quotes ========= */

export async function getTrapQuotes() {
  return fetchBridgeJson("/api/quotes");
}

/* ========= /api/strategy/{name}/stats (legacy; CSV) ========= */

export async function getStrategyStats(strategy: string) {
  const s = (strategy ?? "").trim();
  if (!s) throw <TrapError>{ type: "BAD_JSON", message: "Strategy is empty" };
  return fetchBridgeJson<any[]>(`/api/strategy/${encodeURIComponent(s)}/stats`);
}

/* ========= ARBITRAGE (files-based endpoints) ========= */

/** summary row (new server returns typed SummaryRow, but we keep flexible) */
export type ArbitrageSummaryRow = Record<string, any>;

/** aligned with Program.cs:
 * { ok, format:"csv", updatedAt, count, header, items }
 */
export type ArbitrageSummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null; // backend uses updatedAt
  updatedAtUtc?: string | null; // compatibility
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

/** /api/arbitrage/summary */
export async function getArbitrageSummary(q?: string): Promise<ArbitrageSummaryResponse> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return fetchBridgeJson<ArbitrageSummaryResponse>(`/api/arbitrage/summary${qs}`);
}

/**
 * Backward compatible for list UI:
 * return array of flat rows with string values
 */
export async function getArbitrageList(q?: string): Promise<Record<string, string>[]> {
  const json = await getArbitrageSummary(q);
  const items = Array.isArray(json?.items) ? json.items : [];

  return items.map((r) => {
    const extras = (r as any).Extras ?? (r as any).extras ?? {};
    const ticker = (r as any).Ticker ?? (r as any).ticker ?? "";
    const bench = (r as any).Bench ?? (r as any).bench ?? "";
    const corr = (r as any).Corr ?? (r as any).corr ?? "";
    const beta = (r as any).Beta ?? (r as any).beta ?? "";
    const sig = (r as any).Sig ?? (r as any).sig ?? "";

    const out: Record<string, string> = {
      ticker: String(ticker ?? ""),
      bench: String(bench ?? ""),
      corr: String(corr ?? ""),
      beta: String(beta ?? ""),
      sig: String(sig ?? ""),
    };

    for (const [k, v] of Object.entries(extras ?? {})) {
      out[String(k)] = v != null ? String(v) : "";
    }

    return out;
  });
}

/** /api/arbitrage/ticker/{ticker} */
export type ArbitrageTickerStats = Record<string, any>;

export type ArbitrageTickerResponse = {
  ok?: boolean;
  format?: "jsonl";
  ticker?: string;
  item: any;
  updatedAt?: string | null; // backend: updatedAt
};

export async function getArbitrageTicker(ticker: string): Promise<ArbitrageTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };
  return fetchBridgeJson<ArbitrageTickerResponse>(`/api/arbitrage/ticker/${encodeURIComponent(t)}`);
}

/** alias for old UI code */
export async function getArbitrageStatsByTicker(ticker: string): Promise<ArbitrageTickerResponse> {
  return getArbitrageTicker(ticker);
}

/** /api/arbitrage/best-params/{ticker} */
export type ArbitrageBestParamsResponse = {
  ok: boolean;
  format?: "jsonl";
  updatedAt?: string | null; // backend: updatedAt
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

/** /api/arbitrage/signals/{cls}/{type}/{mode} */
export type ArbitrageSignalsQuery = {
  tickers?: string; // csv
  minRate?: number | string;
  minTotal?: number | string;
  topN?: number | string;

  // backend supports these
  limit?: number;
  offset?: number;

  // kept for future; backend currently ignores
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

/* ========= CHRONO (files-based endpoints, аналогічно arbitrage) ========= */

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

export async function getChronoList(params?: {
  q?: string;
  window?: string;
}): Promise<Record<string, string>[]> {
  const json = await getChronoSummary(params);
  const items = Array.isArray(json?.items) ? json.items : [];

  return items.map((r) => {
    const out: Record<string, string> = {};
    const ticker = (r as any).Ticker ?? (r as any).ticker ?? "";
    const window = (r as any).Window ?? (r as any).window ?? "";

    if (ticker != null) out.ticker = String(ticker);
    if (window != null) out.window = String(window);

    for (const [k, v] of Object.entries(r)) {
      if (k === "ticker" || k === "Ticker" || k === "window" || k === "Window") continue;
      out[k] = v != null ? String(v) : "";
    }

    return out;
  });
}

/** /api/chrono/ticker/{ticker} */
export type ChronoTickerResponse = {
  ok?: boolean;
  format?: "jsonl";
  ticker?: string;
  item: any;
  updatedAt?: string | null;
};

export async function getChronoTicker(ticker: string): Promise<ChronoTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };

  return fetchBridgeJson<ChronoTickerResponse>(`/api/chrono/ticker/${encodeURIComponent(t)}`);
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

/* ========= /api/universe-quotes ========= */

export async function getUniverseQuotes() {
  return fetchBridgeJson(`/api/universe-quotes`);
}

/* ========= /api/full-quotes ========= */

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
  return fetchBridgeJson<FullQuotesResponse>(`/api/full-quotes${qs ? `?${qs}` : ""}`);
}

// keep backward compatible signature
export async function getFullQuotesLegacy(tickers?: string[]) {
  return getFullQuotes({ tickers });
}

/**
 * (Optional) утиліта для UI: дозволити вручну встановити bridge url
 * наприклад з settings-сторінки.
 */
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
