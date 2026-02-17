// lib/paperClient.ts
import { getToken, clearToken } from "./authClient";
import { bridgeUrl } from "./bridgeBase";

export type PaperDirection = "Long" | "Short" | string;

export type PaperEpisode = {
  episodeId: string;
  ticker: string;
  direction: PaperDirection;
  openedClass?: string;
  openedTimeNy?: string;
  exitReason?: string | null;
  exitTimeNy?: string | null;
  lastZapSigma?: number | null;
  peakAbsZapSigma?: number | null;
  entryZapSigma?: number | null;
  entryTimeNy?: string | null;
  [key: string]: any;
};

export type PaperObservation = {
  tsNy: string;
  zapSigma?: number | null;
  absZapSigma?: number | null;
  [key: string]: any;
};

// ✅ нормалізатор: приймає або масив, або {items:[]}, або {data:[]}, або {episodes:[]}
function pickArray<T>(x: any): T[] {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== "object") return [];
  const candidates = ["items", "data", "episodes", "observations", "rows", "result"];
  for (const k of candidates) {
    if (Array.isArray((x as any)[k])) return (x as any)[k];
  }
  return [];
}

async function httpGet<T>(path: string): Promise<T> {
  const token = getToken();
  const url = bridgeUrl(path);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP 401 Unauthorized: ${text || "Missing/expired token"}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

export const paperClient = {
  async active(strategy: string): Promise<PaperEpisode[]> {
    const raw = await httpGet<any>(`/api/paper/${encodeURIComponent(strategy)}/active`);
    return pickArray<PaperEpisode>(raw);
  },

  async episodes(strategy: string, dateNy: string): Promise<PaperEpisode[]> {
    const raw = await httpGet<any>(
      `/api/paper/${encodeURIComponent(strategy)}/episodes?date=${encodeURIComponent(dateNy)}`
    );
    return pickArray<PaperEpisode>(raw);
  },

  async observations(strategy: string, dateNy: string, episodeId: string): Promise<PaperObservation[]> {
    const raw = await httpGet<any>(
      `/api/paper/${encodeURIComponent(strategy)}/observations?date=${encodeURIComponent(
        dateNy
      )}&episodeId=${encodeURIComponent(episodeId)}`
    );
    return pickArray<PaperObservation>(raw);
  },
};