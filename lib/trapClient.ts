// lib/trapClient.ts
import { FullFieldName } from "./fullFields";

export const DEFAULT_TRAP_URL = "http://localhost:5197";

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

function getBridgeBase() {
  // allow both NEXT_PUBLIC_TRADING_BRIDGE_URL and legacy NEXT_PUBLIC_TRAP_URL
  return (
    process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ||
    process.env.NEXT_PUBLIC_TRAP_URL ||
    DEFAULT_TRAP_URL
  );
}

function extractApiErrorMessage(textOrJson: any, fallback: string) {
  try {
    if (textOrJson == null) return fallback;

    // if json object
    if (typeof textOrJson === "object") {
      const msg =
        textOrJson.message ||
        textOrJson.error ||
        textOrJson.title ||
        textOrJson.detail;
      const type = textOrJson.type ? ` (${textOrJson.type})` : "";
      const path = textOrJson.path ? ` @ ${textOrJson.path}` : "";
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

/**
 * Універсальний запит до TradingBridgeApi
 */
async function fetchBridgeJson<T = any>(path: string): Promise<T> {
  const base = getBridgeBase();

  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });

    if (!res.ok) {
      const ct = res.headers.get("content-type") || "";
      let bodyText = "";
      let bodyJson: any = null;

      if (ct.includes("application/json")) {
        bodyJson = await res.json().catch(() => null);
      } else {
        bodyText = await res.text().catch(() => "");
        // sometimes APIs return json as text
        if (bodyText?.trim()?.startsWith("{")) {
          bodyJson = JSON.parse(bodyText);
        }
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
  updatedAt?: string | null;      // ✅ backend uses updatedAt
  updatedAtUtc?: string | null;   // ✅ keep compatibility if you had older code
  count: number;
  header?: string[];              // ✅ backend returns header
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
export async function getArbitrageSummary(
  q?: string
): Promise<ArbitrageSummaryResponse> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return fetchBridgeJson<ArbitrageSummaryResponse>(
    `/api/arbitrage/summary${qs}`
  );
}

/**
 * Backward compatible for list UI:
 * return array of flat rows with string values
 */
export async function getArbitrageList(
  q?: string
): Promise<Record<string, string>[]> {
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

    for (const [k, v] of Object.entries(extras ?? {}))
      out[String(k)] = v != null ? String(v) : "";

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

export async function getArbitrageTicker(
  ticker: string
): Promise<ArbitrageTickerResponse> {
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t) throw <TrapError>{ type: "BAD_JSON", message: "Ticker is empty" };
  return fetchBridgeJson<ArbitrageTickerResponse>(
    `/api/arbitrage/ticker/${encodeURIComponent(t)}`
  );
}

/** alias for old UI code */
export async function getArbitrageStatsByTicker(
  ticker: string
): Promise<ArbitrageTickerResponse> {
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

  // ✅ backend supports these (Program.cs uses them)
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
  // ✅ send params backend understands today
  const qs = buildQuery({
    tickers: query?.tickers,
    minRate: query?.minRate,
    minTotal: query?.minTotal,
    topN: query?.topN,
    limit: query?.limit,
    offset: query?.offset,
    // dateFrom/dateTo intentionally omitted unless you later implement on backend
  });

  return fetchBridgeJson<ArbitrageSignalsResponse>(
    `/api/arbitrage/signals/${encodeURIComponent(
      cls
    )}/${encodeURIComponent(type)}/${encodeURIComponent(mode)}${qs}`
  );
}

// backwards-compatible alias (for your component import error)
export const getArbTicker = getArbitrageTicker;

/* ========= CHRONO (files-based endpoints, аналогічно arbitrage) ========= */

/** summary row for chrono windows */
export type ChronoSummaryRow = Record<string, any>;

export type ChronoSummaryResponse = {
  ok: boolean;
  format: "csv";
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  count: number;
  header?: string[];
  // items можуть містити ticker, window, n_up, n_down, ratios, extras...
  items: Array<Record<string, any>>;
};

/**
 * /api/chrono/summary
 * q — фільтр по тікеру (як у arbitrage)
 * window — опційний фільтр по назві вікна (OPEN / EARLY_BLUE / ...), якщо ти це додаси у backend
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
 * Зручний helper для UI:
 * розгортає items у список з plain-string полями.
 * Залишає тикер+window в явних полях, решту кладе як extras.
 */
export async function getChronoList(params?: {
  q?: string;
  window?: string;
}): Promise<Record<string, string>[]> {
  const json = await getChronoSummary(params);
  const items = Array.isArray(json?.items) ? json.items : [];

  return items.map((r) => {
    const out: Record<string, string> = {};

    // базові поля
    const ticker = (r as any).Ticker ?? (r as any).ticker ?? "";
    const window = (r as any).Window ?? (r as any).window ?? "";

    if (ticker != null) out.ticker = String(ticker);
    if (window != null) out.window = String(window);

    // решту колонок перекладаємо як is
    for (const [k, v] of Object.entries(r)) {
      if (k === "ticker" || k === "Ticker" || k === "window" || k === "Window")
        continue;
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
  item: any; // onefile.jsonl запис по тікеру (усі вікна + метрики)
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

/**
 * Якщо передаєш tickers → список обмежений.
 * Якщо tickers не передаєш → бере всіх з universe.csv
 * fields/preset supported server-side (see Program.cs)
 */
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
