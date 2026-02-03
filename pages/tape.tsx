"use client";

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { tapeClient, TapeMinuteRow } from "@/lib/tapeClient";

function toTickersList(s: string): string[] {
  return s
    .split(/[,\s]+/g)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

const DEFAULT_COLS = [
  "Ticker",
  "MinuteNy",
  "MinuteIdx",
  "Band",
  "Bid",
  "Ask",
  "Mid",
  "Spread",
  "SpreadBps",
  "BidPct",
  "AskPct",
  "LstPrcLstClsPct",
  "LstPrcTOpenPct",
  "TOpen",
  "TCls",
  "VWAP",
  "Hi",
  "Lo",
  "ATR14",
  "Vol",
  "PreMktVolNF",
  "Adv20",
  "Adv90",
  "BenchTicker",
  "BenchBidPct",
  "BenchAskPct",
  "ZapPctS",
  "ZapPctL",
  "SigmaZapS",
  "SigmaZapL",
  "Beta",
  "Sigma",
  "MarketCapM",
  "Exchange",
  "SectorL3",
] as const;

type ViewMode = "Default" | "AllKeys";

function getVal(row: any, key: string) {
  if (!row) return undefined;

  // exact
  if (key in row) return row[key];

  // camelCase
  const camel = key.charAt(0).toLowerCase() + key.slice(1);
  if (camel in row) return row[camel];

  // lower
  const lower = key.toLowerCase();
  if (lower in row) return row[lower];

  return undefined;
}


function fmt(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(0);
    if (abs >= 100) return v.toFixed(2);
    if (abs >= 10) return v.toFixed(3);
    return v.toFixed(4);
  }
  if (typeof v === "boolean") return v ? "YES" : "NO";
  const s = String(v);
  return s.length ? s : "—";
}

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export default function TapePage() {
  const [days, setDays] = useState<string[]>([]);
  const [dateNy, setDateNy] = useState<string>("");
  const [minuteIdx, setMinuteIdx] = useState<number>(986);
  const [tickers, setTickers] = useState<string>("");
  const [minSigmaZap, setMinSigmaZap] = useState<string>("");
  const [minZapPct, setMinZapPct] = useState<string>("");
  const [limit, setLimit] = useState<number>(0);
  const [mode, setMode] = useState<ViewMode>("Default");

  const [rows, setRows] = useState<TapeMinuteRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const d = await tapeClient.availableDays();
        setDays(d);
        if (!dateNy && d.length) setDateNy(d[d.length - 1]);
      } catch (e: any) {
        setErr(e?.message ?? "failed to load available days");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildCols(list: TapeMinuteRow[]): string[] {
    const keys = new Set<string>();
    for (const r of list.slice(0, 600)) Object.keys(r || {}).forEach((k) => keys.add(k));

    const base = ["Ticker", "MinuteNy", "MinuteIdx", "Band"];

    if (mode === "Default") {
      // keep DEFAULT_COLS order, but show only present
      const presentOrdered = DEFAULT_COLS.filter((c) => keys.has(c as string)).map(String);

      // if nothing discovered yet (empty rows), still show base
      if (presentOrdered.length === 0) return base;

      // ensure base first, then rest in DEFAULT order
      const basePresent = base.filter((b) => presentOrdered.includes(b));
      const rest = presentOrdered.filter((x) => !base.includes(x));
      return [...basePresent, ...rest];
    }

    const rest = [...keys].filter((c) => !base.includes(c)).sort();
    return [...base, ...rest];
  }

  async function loadMinute() {
    if (!dateNy) return;
    setLoading(true);
    setErr("");

    try {
      const t = tickers.trim();
      const s1 = minSigmaZap.trim();
      const s2 = minZapPct.trim();

      const hasFilters =
        t.length || s1.length || s2.length || (limit && limit > 0);

      let got: TapeMinuteRow[] = [];

      if (!hasFilters) {
        // Prefer minute endpoint if exists; fallback to query if backend doesn't have it.
        try {
          got = await tapeClient.minute(dateNy, minuteIdx);
        } catch (e: any) {
          const req: any = { dateNy, minuteFrom: minuteIdx, minuteTo: minuteIdx };
          got = await tapeClient.query(req);
        }
      } else {
        const req: any = { dateNy, minuteFrom: minuteIdx, minuteTo: minuteIdx };

        if (t.length) req.tickers = toTickersList(t);

        if (s1.length) {
          const v = Number(s1);
          if (Number.isFinite(v)) req.minSigmaZap = v;
        }

        if (s2.length) {
          const v = Number(s2);
          if (Number.isFinite(v)) req.minZapPct = v;
        }

        if (limit && limit > 0) req.limit = limit;

        got = await tapeClient.query(req);
      }

      setRows(got);
      setCols(buildCols(got));
    } catch (e: any) {
      setErr(e?.message ?? "failed to load minute");
      setRows([]);
      setCols([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (dateNy) loadMinute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateNy, minuteIdx, mode]);

  const header = useMemo(() => cols, [cols]);
  const colW = 140;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[1700px] mx-auto px-6 pt-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tape <span className="text-emerald-400">Explorer</span>
            </h1>
            <div className="text-xs text-zinc-400 mt-1">
              Raw minute rows from <span className="text-zinc-200">/api/tape</span>
            </div>
          </div>

          <button
            onClick={loadMinute}
            className={clsx(
              "h-9 px-4 rounded-lg text-xs font-mono uppercase tracking-widest border transition",
              loading
                ? "bg-white/[0.04] border-white/[0.06] text-zinc-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15"
            )}
            disabled={loading}
          >
            {loading ? "Loading..." : "Reload"}
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-3 mb-4">
          <div className="lg:col-span-2">
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Date (NY)
            </label>
            <select
              value={dateNy}
              onChange={(e) => setDateNy(e.target.value)}
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              MinuteIdx
            </label>
            <input
              type="number"
              value={minuteIdx}
              onChange={(e) => setMinuteIdx(Number(e.target.value))}
              min={0}
              max={1199}
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Tickers (AAPL,MSFT)
            </label>
            <input
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="optional"
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Min SigmaZap
            </label>
            <input
              value={minSigmaZap}
              onChange={(e) => setMinSigmaZap(e.target.value)}
              placeholder="optional"
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Min ZapPct
            </label>
            <input
              value={minZapPct}
              onChange={(e) => setMinZapPct(e.target.value)}
              placeholder="optional"
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Limit
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min={0}
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1">
              Cols
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ViewMode)}
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 text-sm"
            >
              <option value="Default">Default</option>
              <option value="AllKeys">All keys</option>
            </select>
          </div>
        </div>

        {err ? (
          <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-sm whitespace-pre-wrap">
            {err}
          </div>
        ) : null}

        {/* Table (no react-window) */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-400">
              Rows: <span className="text-zinc-200">{rows.length}</span>
            </div>
            <div className="text-xs text-zinc-500">Horizontal scroll for more columns</div>
          </div>

          <div className="h-[72vh] overflow-auto">
            <div style={{ minWidth: Math.max(header.length * colW, 800) }}>
              {/* header */}
              <div className="sticky top-0 z-10 flex text-[10px] font-mono uppercase tracking-widest text-zinc-400 bg-black/80 backdrop-blur border-b border-white/[0.06]">
                {header.map((c) => (
                  <div
                    key={c}
                    className="px-3 py-2 border-r border-white/[0.04] flex items-center"
                    style={{ width: colW }}
                  >
                    {c}
                  </div>
                ))}
              </div>

              {/* rows */}
              {rows.map((r, i) => {
                const key = `${(r as any)?.Ticker ?? "row"}-${(r as any)?.MinuteIdx ?? minuteIdx}-${i}`;
                return (
                  <div
                    key={key}
                    className={clsx("flex text-xs", i % 2 ? "bg-white/[0.01]" : "bg-transparent")}
                  >
                    {header.map((c) => {
                    const v = getVal(r, c);

                    const colored =
                        c.includes("SigmaZap") ||
                        c.includes("ZapPct") ||
                        c.includes("LstPrc") ||
                        c.includes("BidPct") ||
                        c.includes("AskPct");

                    const isNeg = colored && isFiniteNumber(v) && v < 0;
                    const isPos = colored && isFiniteNumber(v) && v > 0;

                    return (
                        <div
                        key={c}
                        className={clsx(
                            "px-3 py-2 border-r border-white/[0.04] truncate",
                            isPos && "text-emerald-300",
                            isNeg && "text-red-300",
                            !isPos && !isNeg && "text-zinc-200"
                        )}
                        style={{ width: colW }}
                        title={v === null || v === undefined ? "" : String(v)}
                        >
                        {fmt(v)}
                        </div>
                    );
                    })}

                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
