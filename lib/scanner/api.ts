import { getToken } from "@/lib/authClient";
import { bridgeUrl } from "@/lib/bridgeBase";
import type { ProblemDetails } from "./types";

// =========================
// API base (Tape/Scope style)
// =========================
export function apiUrl(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/")) pathAndQuery = `/${pathAndQuery}`;
  return bridgeUrl(pathAndQuery);
}

export function buildPaperQuery(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === "") continue;
        sp.append(k, String(item));
      }
      continue;
    }
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export async function parseProblemDetailsSafe(res: Response): Promise<ProblemDetails | null> {
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = (await res.json()) as any;
      if (j && (j.title || j.detail || j.status)) return j as ProblemDetails;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function apiGet<T>(pathAndQuery: string): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(pathAndQuery);
  const res = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const pd = await parseProblemDetailsSafe(res);
    const txt = pd
      ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
      : await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(path);
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const pd = await parseProblemDetailsSafe(res);
    const txt = pd
      ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
      : await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

export async function apiPostWithTimeout<T>(path: string, body: any, timeoutMs: number): Promise<T> {
  const token = getToken();
  const fullUrl = apiUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const pd = await parseProblemDetailsSafe(res);
      const txt = pd
        ? `${pd.title ?? res.statusText}${pd.detail ? ` :: ${pd.detail}` : ""}`
        : await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} for ${fullUrl}${txt ? ` :: ${txt}` : ""}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function normalizeDaysPayload(j: any): string[] {
  if (Array.isArray(j)) return j.filter((d): d is string => typeof d === "string");
  if (j && Array.isArray(j.days)) return j.days.filter((d: unknown): d is string => typeof d === "string");
  if (j && Array.isArray(j.value)) return j.value.filter((d: unknown): d is string => typeof d === "string");
  return [];
}

// Release-style priority:
// 1. non-empty tape days
// 2. all tape days
// 3. legacy paper arbitrage days
/**
 * Trading days, from the first endpoint that answers with a non-empty list. `strategyDaysEndpoint`
 * is the per-strategy fallback (`/api/paper/<strategy>/days`) tried after the shared tape ones.
 */
export async function loadDaysApi(strategyDaysEndpoint: string): Promise<string[]> {
  const endpoints = [
    "/api/tape/available-nonempty-days",
    "/api/tape/available-days",
    strategyDaysEndpoint,
  ];

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      const payload = await apiGet<any>(endpoint);
      const days = normalizeDaysPayload(payload);
      if (days.length) return days;
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  return [];
}

// Accept either:
// - { ok, rows: T[] }
// - T[]
export function normalizeRows<T>(j: any): T[] {
  if (Array.isArray(j)) return j as T[];
  if (j && Array.isArray(j.rows)) return j.rows as T[];
  if (j && Array.isArray(j.items)) return j.items as T[];
  return [];
}

/**
 * Rows from an episodes response, with `best_params` put back on each row.
 *
 * `best_params` is per-TICKER data but was historically embedded in every row, where it accounted
 * for ~86% of the bytes — one day of Arbitrage episodes is 67 MB, mostly the same few hundred blobs
 * repeated thousands of times. Sending `includeBestParams: false` gets `{ items, bestParamsByTicker }`
 * instead, and this reattaches it.
 *
 * The reattached value is a SHARED REFERENCE, not a copy: every row of a ticker points at the one
 * object, so the tab holds a few hundred blobs rather than one per row, and code that reads
 * `row.best_params` keeps working untouched.
 *
 * Falls through to plain `normalizeRows` when the payload has no side map — so this is safe against
 * a bridge that predates the flag, which simply ignores it and returns the old embedded shape.
 */
export function normalizeRowsWithBestParams<T>(j: any): T[] {
  const rows = normalizeRows<T>(j);
  const byTicker = j?.bestParamsByTicker;
  if (!byTicker || typeof byTicker !== "object") return rows;

  for (const row of rows as Array<Record<string, any>>) {
    if (row?.best_params != null) continue;
    const ticker = String(row?.ticker ?? "").trim();
    if (!ticker) continue;
    const shared = byTicker[ticker] ?? byTicker[ticker.toUpperCase()];
    if (shared !== undefined) row.best_params = shared;
  }

  return rows;
}

export const EPISODES_SEARCH_CACHE_TTL_MS = 12_000;

export const EPISODES_SEARCH_CACHE_MAX = 24;
