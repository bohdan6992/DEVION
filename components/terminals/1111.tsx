// components/terminals/OpenDoorTerminal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getOpendoorSignals } from "@/lib/trapClient";

type RateCell = { rate: number; total: number };
type Ratings = Record<string, Record<string, RateCell>>;

type Row = {
  ticker: string;
  ratings?: Ratings; // ratings[windowKey][typeKey] -> {rate,total}
  best_ranges?: any;
  [k: string]: any;
};

const WINDOWS = ["glob", "5m", "10m", "15m", "20m", "30m"] as const;
const TYPES = ["any", "up", "down"] as const;
const MODES = ["all", "top"] as const;

function clampInt(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function fmtRate(x?: number) {
  if (typeof x !== "number" || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(0) + "%";
}

function parseTickers(input: string) {
  const t = input
    .split(/[,\s]+/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(t));
}

export default function OpenDoorTerminal() {
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]>("glob");
  const [typeKey, setTypeKey] = useState<(typeof TYPES)[number]>("any");
  const [mode, setMode] = useState<(typeof MODES)[number]>("all");

  const [minRate, setMinRate] = useState<number>(0.3);
  const [minTotal, setMinTotal] = useState<number>(3);
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const [tickersText, setTickersText] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const tickers = useMemo(() => parseTickers(tickersText), [tickersText]);

  // purely for display/debug (not the source of truth)
  const debugUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("minRate", String(minRate));
    qs.set("minTotal", String(minTotal));
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    if (tickers.length) qs.set("tickers", tickers.join(","));
    return `/api/opendoor/signals/${windowKey}/${typeKey}/${mode}?${qs.toString()}`;
  }, [windowKey, typeKey, mode, minRate, minTotal, limit, offset, tickers]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const data = await getOpendoorSignals({
          cls: windowKey,
          type: typeKey,
          mode,
          minRate,
          minTotal,
          limit,
          offset,
          tickers: tickers.length ? tickers.join(",") : undefined,
        });

        const items: Row[] = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) setRows(items);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setErr(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [windowKey, typeKey, mode, minRate, minTotal, limit, offset, tickers]);

  const canPrev = offset > 0;
  const canNext = rows.length === limit; // heuristic

  return (
    <div className="w-full px-6 py-6">
      <div className="mb-4">
        <div className="text-lg font-semibold text-zinc-100">OpenDoor Signals</div>
        <div className="text-xs text-zinc-500">{debugUrl}</div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-xs text-zinc-400">Class</div>
          <select
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            value={windowKey}
            onChange={(e) => {
              setOffset(0);
              setWindowKey(e.target.value as any);
            }}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-xs text-zinc-400">Type</div>
          <select
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            value={typeKey}
            onChange={(e) => {
              setOffset(0);
              setTypeKey(e.target.value as any);
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-xs text-zinc-400">Mode</div>
          <select
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            value={mode}
            onChange={(e) => {
              setOffset(0);
              setMode(e.target.value as any);
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[260px] flex-1">
          <div className="mb-1 text-xs text-zinc-400">Tickers</div>
          <input
            className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            value={tickersText}
            onChange={(e) => {
              setOffset(0);
              setTickersText(e.target.value);
            }}
            placeholder="AAPL або AAPL,MSFT"
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-zinc-400">minRate</div>
          <input
            className="h-9 w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            type="number"
            step="0.01"
            value={minRate}
            onChange={(e) => setMinRate(Number(e.target.value))}
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-zinc-400">minTotal</div>
          <input
            className="h-9 w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            type="number"
            step="1"
            value={minTotal}
            onChange={(e) => setMinTotal(clampInt(Number(e.target.value), 0, 1_000_000))}
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-zinc-400">limit</div>
          <input
            className="h-9 w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            type="number"
            step="1"
            value={limit}
            onChange={(e) => {
              setOffset(0);
              setLimit(clampInt(Number(e.target.value), 1, 1000));
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 disabled:opacity-50"
            disabled={!canPrev}
            onClick={() => setOffset((v) => Math.max(0, v - limit))}
          >
            Prev
          </button>
          <div className="pb-1 text-xs text-zinc-500">offset {offset}</div>
          <button
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 disabled:opacity-50"
            disabled={!canNext}
            onClick={() => setOffset((v) => v + limit)}
          >
            Next
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-3 whitespace-pre-wrap rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead className="sticky top-0 bg-zinc-950">
              <tr>
                <th className="sticky left-0 z-10 border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs font-semibold text-zinc-200">
                  Ticker
                </th>

                {WINDOWS.map((w) => (
                  <th
                    key={w}
                    className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-zinc-200"
                  >
                    <div className="flex items-center gap-2">
                      <span>{w}</span>
                      <span className="text-[10px] font-medium text-zinc-500">{typeKey}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-zinc-400" colSpan={1 + WINDOWS.length}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-zinc-500" colSpan={1 + WINDOWS.length}>
                    No rows
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.ticker} className="hover:bg-zinc-900/40">
                    <td className="sticky left-0 z-10 border-b border-zinc-900 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100">
                      {r.ticker}
                    </td>

                    {WINDOWS.map((w) => {
                      const cell = r.ratings?.[w]?.[typeKey] as RateCell | undefined;
                      return (
                        <td key={w} className="border-b border-zinc-900 px-3 py-2 text-sm text-zinc-200">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold">{fmtRate(cell?.rate)}</span>
                            <span className="text-xs text-zinc-500">{cell?.total ?? "—"}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
