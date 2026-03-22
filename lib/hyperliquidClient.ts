const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export type HyperliquidUserFill = {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string;
  time?: number;
  dir?: string;
  closedPnl?: string;
  hash?: string;
  oid?: number | string;
  crossed?: boolean;
  fee?: string;
  feeToken?: string;
  tid?: number | string;
  [key: string]: unknown;
};

export type HyperliquidInfoRequest =
  | { type: "meta" }
  | { type: "metaAndAssetCtxs" }
  | { type: "allMids" }
  | {
      type: "userFillsByTime";
      user: string;
      startTime: number;
      endTime?: number;
      aggregateByTime?: boolean;
    }
  | { type: string; [key: string]: unknown };

export async function postHyperliquidInfo<T = unknown>(
  body: HyperliquidInfoRequest,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${HYPERLIQUID_INFO_URL}\n${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export const hyperliquidClient = {
  info: postHyperliquidInfo,
  meta: () => postHyperliquidInfo({ type: "meta" }),
  metaAndAssetCtxs: () => postHyperliquidInfo({ type: "metaAndAssetCtxs" }),
  allMids: () => postHyperliquidInfo({ type: "allMids" }),
  userFillsByTime: (user: string, startTime: number, endTime?: number, aggregateByTime = true) =>
    postHyperliquidInfo<HyperliquidUserFill[]>({
      type: "userFillsByTime",
      user,
      startTime,
      endTime,
      aggregateByTime,
    }),
};
