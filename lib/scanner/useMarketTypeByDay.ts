import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api";

/**
 * Day -> market type for the days the given rows were traded on (GET /api/market-type/days), for SCOPE's
 * MARKET TYPE group. Fetched once per distinct date range, kept in a REF as well as state: the optimizer
 * builders that read it are `useCallback`s built on demand by the run button, and a ref lets them see the
 * newest map without every scanner having to thread it through their dependency lists.
 */
export function useMarketTypeByDay(rows: ReadonlyArray<{ dateNy?: string | null }>) {
  const ref = useRef<Record<string, string>>({});
  const [, bump] = useState(0);
  const loadedRange = useRef("");

  let lo = "";
  let hi = "";
  for (const r of rows) {
    const d = String(r.dateNy ?? "").slice(0, 10);
    if (!d) continue;
    if (!lo || d < lo) lo = d;
    if (!hi || d > hi) hi = d;
  }
  const rangeKey = lo ? `${lo}|${hi}` : "";

  useEffect(() => {
    if (!rangeKey || loadedRange.current === rangeKey) return;
    loadedRange.current = rangeKey;
    let dead = false;
    apiGet<any>(`/api/market-type/days?dateFrom=${lo}&dateTo=${hi}`)
      .then((j) => {
        if (dead || !j?.byDay || typeof j.byDay !== "object") return;
        ref.current = { ...ref.current, ...(j.byDay as Record<string, string>) };
        bump((n) => n + 1);
      })
      .catch(() => {
        loadedRange.current = ""; // let the next change of range retry
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  return ref;
}
