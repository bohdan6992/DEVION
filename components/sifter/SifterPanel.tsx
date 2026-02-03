"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSifter } from "./SifterProvider";
import type { SifterDayRow } from "@/lib/sifterClient";
import { setSifterHandoff } from "@/lib/sifterHandoff";

function fmt(n: any, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  const x = Number(n);
  return x.toFixed(digits);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function SifterPanel() {
  const { state, actions } = useSifter();
  const router = useRouter();

  const metricKey = state.metric;

  // unified rows (quick rows OR tickerdays days mapped to same shape)
  const rows: SifterDayRow[] = useMemo(() => {
    if (state.runMode === "tickerdays") {
      const days = (state.tdResult?.days ?? []) as any[];
      return days.map((d) => ({
        dateNy: d.dateNy ?? d.DateNy ?? "",
        ticker: d.ticker ?? d.Ticker ?? "",
        gapPct: d.gapPct ?? d.GapPct ?? null,
        clsToClsPct: d.clsToClsPct ?? d.ClsToClsPct ?? null,
        marketCapM: d.marketCapM ?? d.MarketCapM ?? null,
        sectorL3: d.sectorL3 ?? d.SectorL3 ?? null,
        exchange: d.exchange ?? d.Exchange ?? null,
        adv: d.adv20 ?? d.Adv20 ?? d.adv ?? null,

        // optional alias
        // @ts-ignore
        pctChange: d.pctChange ?? d.PctChange ?? null,
      })) as any;
    }
    return state.rows;
  }, [state.runMode, state.rows, state.tdResult]);

  const perf = useMemo(() => {
    const vals: number[] = [];
    const byTicker = new Map<string, { sum: number; n: number; wins: number }>();

    for (const r of rows) {
      const vRaw = (r as any)[metricKey];
      if (vRaw === null || vRaw === undefined || Number.isNaN(vRaw)) continue;
      let v = Number(vRaw);

      // short = invert
      if (state.perfSide === "short") v = -v;

      vals.push(v);

      const t = r.ticker;
      const cur = byTicker.get(t) ?? { sum: 0, n: 0, wins: 0 };
      cur.sum += v;
      cur.n += 1;
      if (v > 0) cur.wins += 1;
      byTicker.set(t, cur);
    }

    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length ? sum / vals.length : 0;
    const med = median(vals);
    const winRate = vals.length ? vals.filter((v) => v > 0).length / vals.length : 0;

    const sorted = [...rows].slice().sort((a, b) => a.dateNy.localeCompare(b.dateNy));
    let eq = 0;
    const curve: { dateNy: string; eq: number }[] = [];
    for (const r of sorted) {
      const vRaw = (r as any)[metricKey];
      if (vRaw === null || vRaw === undefined || Number.isNaN(vRaw)) continue;
      let v = Number(vRaw);
      if (state.perfSide === "short") v = -v;
      eq += v;
      curve.push({ dateNy: r.dateNy, eq });
    }

    const breakdown = [...byTicker.entries()]
      .map(([ticker, s]) => ({
        ticker,
        sum: s.sum,
        avg: s.n ? s.sum / s.n : 0,
        n: s.n,
        win: s.n ? s.wins / s.n : 0,
      }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 30);

    return { sum, avg, med, winRate, curve, breakdown, n: vals.length };
  }, [rows, metricKey, state.perfSide]);

  const openTape = (r: SifterDayRow) => {
    setSifterHandoff({
      dateNy: r.dateNy,
      ticker: r.ticker,
      minuteFrom: state.minuteFrom,
      minuteTo: state.minuteTo,
      metric: state.metric,
    });
    router.push("/tape");
  };

  const isTickerdays = state.runMode === "tickerdays";
  const loading = isTickerdays ? state.tdStatus === 2 : state.loading; // Running=2
  const err = isTickerdays ? state.tdError : state.error;

  return (
    <div className="h-full flex flex-col text-white/90">
      {/* Filters */}
      <div className="p-3 border-b border-white/10">
        <div className="grid grid-cols-12 gap-2 items-end">
          {/* Mode toggle */}
          <div className="col-span-2">
            <label className="text-xs text-white/60">Mode</label>
            <div className="flex gap-2">
              <button
                className={`px-2 py-1 rounded-lg border border-white/10 text-xs ${
                  state.runMode === "quick" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => actions.set("runMode", "quick" as any)}
              >
                Quick
              </button>
              <button
                className={`px-2 py-1 rounded-lg border border-white/10 text-xs ${
                  state.runMode === "tickerdays" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => actions.set("runMode", "tickerdays" as any)}
              >
                TickerDays
              </button>
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">From</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.fromDateNy}
              onChange={(e) => actions.set("fromDateNy", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/60">To</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.toDateNy}
              onChange={(e) => actions.set("toDateNy", e.target.value)}
            />
          </div>
          <div className="col-span-3">
            <label className="text-xs text-white/60">Tickers</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              placeholder="AAPL,MSFT"
              value={state.tickersText}
              onChange={(e) => actions.set("tickersText", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/60">SectorL3</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              placeholder="Technology"
              value={state.sectorL3 ?? ""}
              onChange={(e) => actions.set("sectorL3", e.target.value || null)}
            />
          </div>

          <div className="col-span-1">
            <label className="text-xs text-white/60">MC min (M)</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.minMarketCapM ?? ""}
              onChange={(e) => actions.set("minMarketCapM", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-white/60">MC max (M)</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.maxMarketCapM ?? ""}
              onChange={(e) => actions.set("maxMarketCapM", e.target.value ? Number(e.target.value) : null)}
            />
          </div>

          {/* Run + Cancel */}
          <div className="col-span-1 flex justify-end gap-2">
            {isTickerdays && state.tdRequestId ? (
              <button
                className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-white/10 text-sm"
                onClick={actions.cancelTickerdays}
                disabled={!loading}
                title="Cancel running job"
              >
                Cancel
              </button>
            ) : null}

            <button
              className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/20 border border-white/10 text-sm"
              onClick={isTickerdays ? actions.runTickerdays : actions.runDays}
              disabled={loading}
            >
              {loading ? "Loading…" : "Run"}
            </button>
          </div>

          {/* Quick minute inputs (still used for Tape handoff) */}
          <div className="col-span-2">
            <label className="text-xs text-white/60">Minute from</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.minuteFrom}
              onChange={(e) => actions.set("minuteFrom", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/60">Minute to</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.minuteTo}
              onChange={(e) => actions.set("minuteTo", e.target.value)}
            />
          </div>

          {/* Tickerdays window selector (Ids) */}
          <div className="col-span-2">
            <label className="text-xs text-white/60">Window start (id)</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.windowStartId ?? 0}
              onChange={(e) => actions.set("windowStartId", Number(e.target.value))}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/60">Window end (id)</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              value={state.windowEndId ?? 4}
              onChange={(e) => actions.set("windowEndId", Number(e.target.value))}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Metric</label>
            <input
              className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10"
              placeholder="GapPct / ClsToClsPct / pctChange / SigmaZapS"
              value={state.metric}
              onChange={(e) => actions.set("metric", e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Perf side</label>
            <div className="flex gap-2">
              <button
                className={`px-2 py-1 rounded-lg border border-white/10 text-xs ${
                  state.perfSide === "long" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => actions.set("perfSide", "long")}
              >
                Long
              </button>
              <button
                className={`px-2 py-1 rounded-lg border border-white/10 text-xs ${
                  state.perfSide === "short" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => actions.set("perfSide", "short")}
              >
                Short
              </button>
            </div>
          </div>

          <div className="col-span-4">
            {err ? (
              <div className="text-xs text-red-300">{err}</div>
            ) : (
              <div className="text-xs text-white/50">
                Rows: {rows.length}
                {isTickerdays && state.tdRequestId ? (
                  <span className="ml-2 text-white/40">job: {state.tdRequestId.slice(0, 8)}…</span>
                ) : null}
              </div>
            )}

            {/* Tickerdays progress */}
            {isTickerdays ? (
              <div className="mt-1">
                <div className="text-[11px] text-white/50">
                  {state.tdMessage ?? ""} • {fmt((state.tdProgress ?? 0) * 100, 0)}%
                </div>
                <div className="h-1.5 rounded bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-white/30"
                    style={{ width: `${Math.max(0, Math.min(1, state.tdProgress ?? 0)) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/60 backdrop-blur border-b border-white/10">
            <tr className="text-white/70">
              <th className="text-left p-2">dateNy</th>
              <th className="text-left p-2">ticker</th>
              <th className="text-right p-2">gapPct</th>
              <th className="text-right p-2">clsToClsPct</th>
              <th className="text-right p-2">MC(M)</th>
              <th className="text-left p-2">sector</th>
              <th className="text-left p-2">exchange</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.dateNy}|${r.ticker}`;
              const selected = state.selectedKey === key;

              const g = r.gapPct ?? null;
              const c = r.clsToClsPct ?? null;

              const gCls = g === null ? "" : g >= 0 ? "text-green-300" : "text-red-300";
              const cCls = c === null ? "" : c >= 0 ? "text-green-300" : "text-red-300";

              return (
                <tr
                  key={key}
                  className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${selected ? "bg-white/10" : ""}`}
                  onClick={() => {
                    actions.selectRow(r.dateNy, r.ticker);
                    openTape(r);
                  }}
                >
                  <td className="p-2">{r.dateNy}</td>
                  <td className="p-2 font-semibold">{r.ticker}</td>
                  <td className={`p-2 text-right ${gCls}`}>{fmt(r.gapPct, 2)}</td>
                  <td className={`p-2 text-right ${cCls}`}>{fmt(r.clsToClsPct, 2)}</td>
                  <td className="p-2 text-right">{fmt(r.marketCapM, 0)}</td>
                  <td className="p-2">{r.sectorL3 ?? ""}</td>
                  <td className="p-2">{r.exchange ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Trade performance bottom panel */}
      <div className="p-3 border-t border-white/10 bg-black/40">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/70">
            Perf on <span className="font-semibold text-white/90">{metricKey}</span> ({state.perfSide}) • N={perf.n}
          </div>
          <div className="flex gap-3 text-xs">
            <div>
              Sum: <span className="font-semibold">{fmt(perf.sum, 2)}</span>
            </div>
            <div>
              Avg: <span className="font-semibold">{fmt(perf.avg, 2)}</span>
            </div>
            <div>
              Med: <span className="font-semibold">{fmt(perf.med, 2)}</span>
            </div>
            <div>
              Win%: <span className="font-semibold">{fmt(perf.winRate * 100, 1)}%</span>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-12 gap-2">
          <div className="col-span-6 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-xs text-white/70 mb-1">Equity curve (simple)</div>
            <div className="text-[11px] text-white/60">
              {perf.curve.slice(-8).map((p) => (
                <span key={p.dateNy} className="inline-block mr-3">
                  {p.dateNy}: <span className="text-white/85">{fmt(p.eq, 2)}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="col-span-6 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-xs text-white/70 mb-1">Top tickers (by sum)</div>
            <div className="text-[11px] text-white/60">
              {perf.breakdown.slice(0, 10).map((b) => (
                <span key={b.ticker} className="inline-block mr-3">
                  {b.ticker}: <span className="text-white/85">{fmt(b.sum, 2)}</span> (n={b.n}, win={fmt(b.win * 100, 0)}%)
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
