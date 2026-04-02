import useSWR from "swr";
import type {
  ActorProfile,
  ApiResponse,
  MatchedContract,
  PutCallImbalance,
  ScanSummary,
  ScoredContract,
} from "@/lib/insider/types";

class ApiFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // ignore
    }
    throw new ApiFetchError(message, response.status);
  }
  return response.json();
};

export function useSignals(minScore = 2, minPremium = 50_000) {
  const url = `/api/options/signals?minScore=${minScore}&minPremium=${minPremium}`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<ScoredContract[]>>(
    url,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );

  return {
    signals: data?.data ?? [],
    cachedAt: data?.cachedAt,
    isLoading,
    isError: Boolean(error),
    errorMessage: error instanceof Error ? error.message : null,
    refresh: () =>
      mutate(fetcher<ApiResponse<ScoredContract[]>>(`${url}&refresh=true`), {
        revalidate: false,
      }),
  };
}

export function useActorProfiles(onlySmartMoney = false) {
  const { data, error, isLoading } = useSWR<ApiResponse<ActorProfile[]>>(
    `/api/options/actors?smartMoney=${onlySmartMoney}`,
    fetcher,
    { refreshInterval: 15 * 60 * 1000 }
  );

  return {
    actors: data?.data ?? [],
    isLoading,
    isError: Boolean(error),
    errorMessage: error instanceof Error ? error.message : null,
  };
}

export function usePutCallFlow() {
  const { data, error, isLoading } = useSWR<ApiResponse<PutCallImbalance[]>>(
    "/api/options/putcall",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );

  return {
    pcFlow: data?.data ?? [],
    isLoading,
    isError: Boolean(error),
    errorMessage: error instanceof Error ? error.message : null,
  };
}

export function useMatchedContracts() {
  const { data, error, isLoading } = useSWR<ApiResponse<MatchedContract[]>>(
    "/api/options/matched",
    fetcher,
    { refreshInterval: 15 * 60 * 1000 }
  );

  return {
    matched: data?.data ?? [],
    isLoading,
    isError: Boolean(error),
    errorMessage: error instanceof Error ? error.message : null,
  };
}

export function useScanSummary() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<ScanSummary>>(
    "/api/options/summary",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );

  return {
    summary: data?.data,
    isLoading,
    isError: Boolean(error),
    errorMessage: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
