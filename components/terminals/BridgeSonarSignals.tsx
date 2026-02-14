"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backendUrl } from "@/lib/backend";

type SonarRow = {
  ticker: string;

  bench?: string;
  beta?: number | null;
  sigma?: number | null;

  zapS?: number | null;
  zapL?: number | null;
  zapSsigma?: number | null;
  zapLsigma?: number | null;

  shortCandidate?: boolean;
  longCandidate?: boolean;
  hasInputs?: boolean;

  // первинна перевірка: звідки взяли значення
  src: {
    bench?: string;
    beta?: string;
    sigma?: string;
    zapS?: string;
    zapL?: string;
    zapSsigma?: string;
    zapLsigma?: string;
    hasInputs?: string;
    shortCandidate?: string;
    longCandidate?: string;
  };

  // діагностика
  keysTop: string[];
  raw: any;
};

const isObj = (x: any) => x !== null && typeof x === "object" && !Array.isArray(x);

function pickBenchLabel(b: any): string | undefined {
  if (!b) return undefined;
  if (typeof b === "string") return b;
  if (isObj(b)) return (b.ticker ?? b.symbol ?? b.name ?? b.code ?? "NONE")?.toString();
  return undefined;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null | undefined, digits = 2) {
  return v == null ? "—" : v.toFixed(digits);
}

function pct(v: number | null | undefined, digits = 2) {
  return v == null ? "—" : `${v.toFixed(digits)}%`;
}

type Found<T> = { value: T; path: string } | null;

/**
 * Пошук поля по декількох можливих шляхах.
 * Дає "primary check": значення + шлях звідки взяли.
 */
function findFirst<T>(root: any, paths: string[], map: (v: any) => T): Found<T> {
  for (const p of paths) {
    const parts = p.split(".");
    let cur: any = root;
    let ok = true;
    for (const k of parts) {
      if (!cur) {
        ok = false;
        break;
      }
      cur = cur[k];
    }
    if (!ok) continue;
    const mapped = map(cur);
    // accept even false/0 but reject undefined/null if that matters in map
    // here map handles nullability
    if (mapped !== (undefined as any)) {
      return { value: mapped, path: p };
    }
  }
  return null;
}

function extractItems(j: any): any[] {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.items)) return j.items;
  if (Array.isArray(j?.rows)) return j.rows;
  if (isObj(j) && (j.ticker || j.live || j.sonar || j.arbitrage || j.overlays)) return [j];
  return [];
}

/**
 * SONAR DTO може бути у різних формах.
 * Ми не “вгадуємо”, а робимо первинну перевірку:
 * - шукаємо zap* в кількох можливих namespace: sonar/arbitrage/overlays/live/calc/signals
 */
function normalize(x: any): SonarRow {
  const keysTop = isObj(x) ? Object.keys(x).slice(0, 24) : [];
  const benchLabel = pickBenchLabel(x?.bench);

  // bench
  const benchFound = findFirst<string | undefined>(
    x,
    ["bench.ticker", "bench.symbol", "bench.name", "bench", "meta.bench", "best.bench"],
    (v) => pickBenchLabel(v)
  );

  // beta / sigma (часто лежать в bench або meta/best)
  const betaFound = findFirst<number | null>(
    x,
    ["bench.beta", "meta.beta", "best.beta", "beta", "live.beta"],
    (v) => toNum(v)
  );
  const sigmaFound = findFirst<number | null>(
    x,
    ["bench.sigma", "meta.sigma", "best.sigma", "sigma", "live.sigma", "live.sig"],
    (v) => toNum(v)
  );

  // zap fields: шукаємо у кількох місцях
  const zapSFound = findFirst<number | null>(
    x,
    [
      "sonar.zapS",
      "arbitrage.zapS",
      "overlays.arbitrage.zapS",
      "signals.arbitrage.zapS",
      "calc.arbitrage.zapS",
      "live.zapS",
      "live.sonar.zapS",
      "live.arbitrage.zapS",
    ],
    (v) => toNum(v)
  );

  const zapLFound = findFirst<number | null>(
    x,
    [
      "sonar.zapL",
      "arbitrage.zapL",
      "overlays.arbitrage.zapL",
      "signals.arbitrage.zapL",
      "calc.arbitrage.zapL",
      "live.zapL",
      "live.sonar.zapL",
      "live.arbitrage.zapL",
    ],
    (v) => toNum(v)
  );

  const zapSsigmaFound = findFirst<number | null>(
    x,
    [
      "sonar.zapSsigma",
      "sonar.sigmaZapS",
      "arbitrage.zapSsigma",
      "arbitrage.sigmaZapS",
      "overlays.arbitrage.zapSsigma",
      "overlays.arbitrage.sigmaZapS",
      "signals.arbitrage.zapSsigma",
      "calc.arbitrage.zapSsigma",
      "live.zapSsigma",
      "live.sigmaZapS",
      "live.sonar.zapSsigma",
      "live.arbitrage.zapSsigma",
    ],
    (v) => toNum(v)
  );

  const zapLsigmaFound = findFirst<number | null>(
    x,
    [
      "sonar.zapLsigma",
      "sonar.sigmaZapL",
      "arbitrage.zapLsigma",
      "arbitrage.sigmaZapL",
      "overlays.arbitrage.zapLsigma",
      "overlays.arbitrage.sigmaZapL",
      "signals.arbitrage.zapLsigma",
      "calc.arbitrage.zapLsigma",
      "live.zapLsigma",
      "live.sigmaZapL",
      "live.sonar.zapLsigma",
      "live.arbitrage.zapLsigma",
    ],
    (v) => toNum(v)
  );

  const shortCandFound = findFirst<boolean>(
    x,
    [
      "sonar.shortCandidate",
      "arbitrage.shortCandidate",
      "overlays.arbitrage.shortCandidate",
      "signals.arbitrage.shortCandidate",
      "calc.arbitrage.shortCandidate",
      "live.shortCandidate",
      "live.sonar.shortCandidate",
      "live.arbitrage.shortCandidate",
    ],
    (v) => !!v
  );

  const longCandFound = findFirst<boolean>(
    x,
    [
      "sonar.longCandidate",
      "arbitrage.longCandidate",
      "overlays.arbitrage.longCandidate",
      "signals.arbitrage.longCandidate",
      "calc.arbitrage.longCandidate",
      "live.longCandidate",
      "live.sonar.longCandidate",
      "live.arbitrage.longCandidate",
    ],
    (v) => !!v
  );

  // hasInputs: або поле є, або інференс з zap
  const hasInputsFound =
    findFirst<boolean>(
      x,
      [
        "sonar.hasInputs",
        "arbitrage.hasInputs",
        "overlays.arbitrage.hasInputs",
        "signals.arbitrage.hasInputs",
        "calc.arbitrage.hasInputs",
        "live.hasInputs",
      ],
      (v) => !!v
    ) ??
    (zapSFound || zapLFound || zapSsigmaFound || zapLsigmaFound
      ? { value: true, path: "inferred(from zap fields)" }
      : { value: false, path: "inferred(no zap fields)" });

  const ticker = String(x?.ticker ?? x?.Ticker ?? "").trim();

  return {
    ticker,
    bench: benchFound?.value ?? benchLabel ?? "NONE",
    beta: betaFound?.value ?? null,
    sigma: sigmaFound?.value ?? null,
    zapS: zapSFound?.value ?? null,
    zapL: zapLFound?.value ?? null,
    zapSsigma: zapSsigmaFound?.value ?? null,
    zapLsigma: zapLsigmaFound?.value ?? null,
    shortCandidate: shortCandFound?.value ?? false,
    longCandidate: longCandFound?.value ?? false,
    hasInputs: hasInputsFound?.value ?? false,
    src: {
      bench: benchFound?.path,
      beta: betaFound?.path,
      sigma: sigmaFound?.path,
      zapS: zapSFound?.path,
      zapL: zapLFound?.path,
      zapSsigma: zapSsigmaFound?.path,
      zapLsigma: zapLsigmaFound?.path,
      shortCandidate: shortCandFound?.path,
      longCandidate: longCandFound?.path,
      hasInputs: hasInputsFound?.path,
    },
    keysTop,
    raw: x,
  };
}

export default function BridgeSonarSignals() {
  const [rows, setRows] = useState<SonarRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const [debug, setDebug] = useState(false);
  const [sample, setSample] = useState<SonarRow | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // payload без фільтрів
  const payload = useMemo(
    () => ({
      tickers: "",
      limit: 300,
      offset: 0,
      overlays: {
        arbitrage: {
          enabled: true,
          filterEnabled: false,
          requireBench: false,
          side: "both",
        },
      },
    }),
    []
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(backendUrl("/api/sonar/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}${t ? `: ${t}` : ""}`);
      }

      const j = await r.json();
      const items = extractItems(j).map(normalize).filter((x) => !!x.ticker);

      // сортування як terminal: найсильніші sigmaZap зверху
      items.sort((a, b) => {
        const av = Math.max(Math.abs(a.zapSsigma ?? 0), Math.abs(a.zapLsigma ?? 0));
        const bv = Math.max(Math.abs(b.zapSsigma ?? 0), Math.abs(b.zapLsigma ?? 0));
        return bv - av;
      });

      setRows(items);
      setSample(items[0] ?? null);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error(e);
      setRows([]);
      setSample(null);
      setErr(e?.message ?? "Request failed");
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } finally {
      setLoading(false);
    }
  }, [payload]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  return (
    <div className="w-full text-zinc-200 selection:bg-emerald-500/30 selection:text-white">
      <div className="max-w-[1920px] mx-auto space-y-4">
        {/* ===== Header (same terminal vibe) ===== */}
        <header className="bg-[#0a0a0a]/60 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={["w-2.5 h-2.5 rounded-full border border-white/10", loading ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"].join(" ")} />
              <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                SONAR TERMINAL
              </h1>
              <div className="flex gap-2 ml-4">
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">
                  ZAP
                </span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 uppercase">
                  SIGMAZAP
                </span>
                <span className="px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-mono text-emerald-400 uppercase">
                  ALL
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              <span>{updatedAt ? `UPDATED ${updatedAt}` : "CONNECTING..."}</span>
              <span className="text-zinc-700 mx-1">•</span>
              <span className="opacity-70">limit 300 • universe</span>
              {err && (
                <>
                  <span className="text-zinc-700 mx-1">•</span>
                  <span className="text-rose-300">{err}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#0a0a0a]/40 p-1 rounded-xl border border-white/[0.04]">
            <button
              type="button"
              onClick={() => setDebug((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10"
              title="Toggle debug"
            >
              {debug ? "DEBUG ON" : "DEBUG OFF"}
            </button>

            <button
              type="button"
              onClick={load}
              className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all border bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/15"
              title="Refresh"
            >
              {loading ? "LOADING" : "REFRESH"}
            </button>
          </div>
        </header>

        {/* ===== Debug panel (primary check: sources & raw) ===== */}
        {debug && (
          <div className="bg-[#0a0a0a]/55 backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-xl p-4">
            <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
              Primary check (field sources)
            </div>

            {!sample ? (
              <div className="text-sm text-zinc-500">No sample row.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-white/10 rounded-xl p-3">
                  <div className="text-xs font-mono text-zinc-400 mb-2">
                    Sample: <span className="text-zinc-200">{sample.ticker}</span>
                  </div>

                  <div className="text-xs font-mono text-zinc-500 space-y-1">
                    <div>bench = <span className="text-zinc-200">{sample.bench}</span> <span className="text-zinc-600">({sample.src.bench ?? "—"})</span></div>
                    <div>beta  = <span className="text-zinc-200">{fmt(sample.beta)}</span> <span className="text-zinc-600">({sample.src.beta ?? "—"})</span></div>
                    <div>sigma = <span className="text-zinc-200">{fmt(sample.sigma)}</span> <span className="text-zinc-600">({sample.src.sigma ?? "—"})</span></div>
                    <div>zapS  = <span className="text-zinc-200">{pct(sample.zapS)}</span> <span className="text-zinc-600">({sample.src.zapS ?? "—"})</span></div>
                    <div>zapL  = <span className="text-zinc-200">{pct(sample.zapL)}</span> <span className="text-zinc-600">({sample.src.zapL ?? "—"})</span></div>
                    <div>zapSσ = <span className="text-zinc-200">{fmt(sample.zapSsigma)}</span> <span className="text-zinc-600">({sample.src.zapSsigma ?? "—"})</span></div>
                    <div>zapLσ = <span className="text-zinc-200">{fmt(sample.zapLsigma)}</span> <span className="text-zinc-600">({sample.src.zapLsigma ?? "—"})</span></div>
                    <div>hasInputs = <span className="text-zinc-200">{String(sample.hasInputs)}</span> <span className="text-zinc-600">({sample.src.hasInputs ?? "—"})</span></div>
                    <div>short = <span className="text-zinc-200">{String(sample.shortCandidate)}</span> <span className="text-zinc-600">({sample.src.shortCandidate ?? "—"})</span></div>
                    <div>long  = <span className="text-zinc-200">{String(sample.longCandidate)}</span> <span className="text-zinc-600">({sample.src.longCandidate ?? "—"})</span></div>
                  </div>

                  <div className="mt-3 text-[10px] font-mono text-zinc-500">
                    top keys: {sample.keysTop.join(", ")}
                  </div>
                </div>

                <div className="border border-white/10 rounded-xl p-3 overflow-auto">
                  <div className="text-xs font-mono text-zinc-400 mb-2">Raw JSON (sample)</div>
                  <pre className="text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap">
                    {JSON.stringify(sample.raw, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== Table ===== */}
        <div className="bg-[#0a0a0a]/55 backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="text-zinc-400 border-b border-white/10">
                <tr className="text-[11px] font-mono uppercase tracking-wider">
                  <th className="p-3 text-left">Ticker</th>
                  <th className="p-3 text-left">Bench</th>
                  <th className="p-3 text-right">β</th>
                  <th className="p-3 text-right">σ</th>
                  <th className="p-3 text-right">ZapS%</th>
                  <th className="p-3 text-right">ZapL%</th>
                  <th className="p-3 text-right">ZapS/σ</th>
                  <th className="p-3 text-right">ZapL/σ</th>
                  <th className="p-3 text-center">Side</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const isShort = !!r.shortCandidate;
                  const isLong = !!r.longCandidate;

                  return (
                    <tr
                      key={r.ticker}
                      className={[
                        "border-b border-white/5",
                        isShort ? "bg-rose-500/10" : "",
                        isLong ? "bg-emerald-500/10" : "",
                      ].join(" ")}
                    >
                      <td className="p-3 font-mono text-zinc-100">{r.ticker}</td>
                      <td className="p-3 text-zinc-200">{r.bench ?? "—"}</td>
                      <td className="p-3 text-right">{fmt(r.beta)}</td>
                      <td className="p-3 text-right">{fmt(r.sigma)}</td>
                      <td className="p-3 text-right">{pct(r.zapS)}</td>
                      <td className="p-3 text-right">{pct(r.zapL)}</td>
                      <td className="p-3 text-right">{fmt(r.zapSsigma)}</td>
                      <td className="p-3 text-right">{fmt(r.zapLsigma)}</td>
                      <td className="p-3 text-center">
                        {!r.hasInputs ? (
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">no data</span>
                        ) : isShort ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-rose-500/20 border border-rose-500/25 text-rose-200 uppercase">
                            SHORT
                          </span>
                        ) : isLong ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/20 border border-emerald-500/25 text-emerald-200 uppercase">
                            LONG
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-zinc-500">
                      No SONAR data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-[10px] font-mono text-zinc-500 border-t border-white/5">
            Primary-check enabled: toggle DEBUG to see field source paths and raw JSON for a sample row.
          </div>
        </div>
      </div>
    </div>
  );
}
