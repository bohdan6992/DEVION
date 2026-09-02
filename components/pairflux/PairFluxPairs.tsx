"use client";

/**
 * PairFlux pairs table — the first surface that actually shows PairFlux data.
 *
 * Scope, deliberately narrow: this reads /api/paper/pairflux/ratings, which is the only PairFlux
 * endpoint with data behind it. It is NOT the ported scanner. The forked ArbitrageScanner still
 * calls /episodes/search, /active, /analytics, /optimizer/ranges and /scope/evaluate, none of which
 * exist for PairFlux because there is no tape engine for a pair spread yet — so that fork renders
 * a toolbar and then 404s on every data call. This component exists so the strategy is usable and
 * verifiable before that port lands.
 *
 * Row model is the one decided for the strategy: a TICKER with an attached PARTNER. Each published
 * pair is indexed under both legs, so the mirrored direction is present too and marked.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPairFluxRatings,
  fetchPairFluxStatus,
  type PairFluxClass,
  type PairFluxRow,
  type PairFluxStatus,
} from "../../lib/pairflux/client";
import { GlassCard, GlassInput, GlassSelect } from "../scanner/shared/ui";

const CLASSES: Array<{ value: PairFluxClass; label: string }> = [
  { value: "intra", label: "INTRA" },
  { value: "pre", label: "PRE" },
  { value: "open", label: "OPEN" },
];

const SORTS = [
  { value: "convPerDay", label: "Циклів/день" },
  { value: "rateLb", label: "Rate LB" },
  { value: "rate", label: "Rate" },
  { value: "total", label: "Епізодів" },
  { value: "capMean", label: "Cap mean" },
] as const;

function num(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}
function pct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;
}

/** Green above the gate, amber near it, muted below — the rating is the whole point of the row. */
function rateClass(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "text-white/30";
  if (v >= 0.5) return "text-emerald-300";
  if (v >= 0.3) return "text-amber-300";
  return "text-white/40";
}

export default function PairFluxPairs() {
  const [cls, setCls] = useState<PairFluxClass>("intra");
  const [minRate, setMinRate] = useState("0.3");
  const [minTotal, setMinTotal] = useState("3");
  const [bench, setBench] = useState("");
  const [includeInverted, setIncludeInverted] = useState(true);
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("convPerDay");
  const [limit, setLimit] = useState("300");

  const [rows, setRows] = useState<PairFluxRow[]>([]);
  const [totalMatched, setTotalMatched] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [status, setStatus] = useState<PairFluxStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPairFluxStatus()
      .then((s) => { if (alive) setStatus(s); })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPairFluxRatings({
        cls,
        bench: bench.trim().toUpperCase() || undefined,
        minRate: minRate.trim() === "" ? undefined : Number(minRate),
        minTotal: minTotal.trim() === "" ? undefined : Number(minTotal),
        includeInverted,
        sort,
        limit: Math.max(1, Number(limit) || 300),
      });
      setRows(res.rows ?? []);
      setTotalMatched(res.totalMatched ?? res.count ?? 0);
      setMissing(res.missingColumns ?? []);
      if (!res.ok && res.error) setError(res.error);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setRows([]);
      setTotalMatched(null);
    } finally {
      setLoading(false);
    }
  }, [cls, bench, minRate, minTotal, includeInverted, sort, limit]);

  useEffect(() => { void load(); }, [load]);

  // A missing column is not a zero. Say which ones are absent so a blank column reads as "the
  // published build predates this metric" rather than "these pairs score nothing".
  const missingNote = useMemo(() => {
    if (missing.length === 0) return null;
    const fields = Array.from(new Set(missing.map((m) => m.replace(/^(PRE|OPEN|INTRA)_/, ""))));
    return fields.join(", ");
  }, [missing]);

  return (
    <div className="min-h-screen w-full bg-[#07070a] px-4 py-5 text-white/90">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-[15px] font-bold tracking-[0.22em] text-sky-300">
            PAIRFLUX · PAIRS
          </h1>
          <span className="font-mono text-[10px] tracking-[0.14em] text-white/35">
            {status
              ? status.ok
                ? `${status.pairs.toLocaleString()} пар · ${status.tickers.toLocaleString()} тікерів`
                : "рейтинги не опубліковані"
              : "…"}
          </span>
          {totalMatched !== null && (
            <span className="font-mono text-[10px] tracking-[0.14em] text-white/35">
              · знайдено {totalMatched.toLocaleString()}, показано {rows.length.toLocaleString()}
            </span>
          )}
        </header>

        {status && !status.ok && status.note && (
          <GlassCard className="border-amber-400/20 bg-amber-400/[0.04] px-4 py-3">
            <div className="font-mono text-[11px] text-amber-200/80">{status.note}</div>
          </GlassCard>
        )}

        {missingNote && (
          <GlassCard className="border-sky-400/20 bg-sky-400/[0.04] px-4 py-3">
            <div className="font-mono text-[11px] text-sky-200/80">
              Опублікований білд не має колонок: <b>{missingNote}</b> — вони показані як «—», а не як нуль.
            </div>
          </GlassCard>
        )}

        <GlassCard className="px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="КЛАС">
              <GlassSelect
                value={cls}
                onChange={(e) => setCls(e.target.value as PairFluxClass)}
                options={CLASSES.map((c) => ({ value: c.value, label: c.label }))}
              />
            </Field>
            <Field label="MIN RATE">
              <GlassInput value={minRate} onChange={(e: any) => setMinRate(e.target.value)} className="w-[74px]" />
            </Field>
            <Field label="MIN TOTAL">
              <GlassInput value={minTotal} onChange={(e: any) => setMinTotal(e.target.value)} className="w-[74px]" />
            </Field>
            <Field label="BENCH">
              <GlassInput value={bench} onChange={(e: any) => setBench(e.target.value)} className="w-[92px]" placeholder="усі" />
            </Field>
            <Field label="СОРТ">
              <GlassSelect
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                options={SORTS.map((x) => ({ value: x.value, label: x.label }))}
              />
            </Field>
            <Field label="ЛІМІТ">
              <GlassInput value={limit} onChange={(e: any) => setLimit(e.target.value)} className="w-[74px]" />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 pb-[6px] font-mono text-[10px] tracking-[0.14em] text-white/50">
              <input
                type="checkbox"
                checked={includeInverted}
                onChange={(e) => setIncludeInverted(e.target.checked)}
                className="accent-sky-400"
              />
              ДЗЕРКАЛЬНІ
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-[10px] border border-sky-400/25 bg-sky-400/10 px-4 py-[7px] font-mono text-[10px] font-bold tracking-[0.16em] text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
            >
              {loading ? "…" : "ОНОВИТИ"}
            </button>
          </div>
        </GlassCard>

        {error && (
          <GlassCard className="border-rose-400/25 bg-rose-400/[0.05] px-4 py-3">
            <div className="font-mono text-[11px] text-rose-200/85">{error}</div>
          </GlassCard>
        )}

        <GlassCard className="overflow-hidden p-0">
          <div className="max-h-[72vh] overflow-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#0b0b10]">
                <tr className="text-left tracking-[0.12em] text-white/35">
                  <Th>ТІКЕР</Th><Th>ПАРА</Th><Th>BENCH</Th>
                  <Th right>ЕПІЗ.</Th><Th right>ЗВЕД.</Th><Th right>RATE</Th><Th right>LB</Th>
                  <Th right>WIN</Th><Th right>ЦИКЛ/Д</Th><Th right>CAP</Th>
                  <Th right>α pp</Th><Th right>σ pp</Th><Th right>БАРІВ</Th><Th right>CORR</Th><Th right>BETA</Th>
                  <Th right>LONG</Th><Th right>SHORT</Th><Th right>ДНІВ</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.ticker}/${r.partner}/${r.cls}/${i}`}
                    className="border-t border-white/[0.04] hover:bg-white/[0.03]"
                  >
                    <Td className="font-bold text-white/85">{r.ticker}</Td>
                    <Td>
                      <span className="text-sky-300/90">{r.partner}</span>
                      {r.inverted && (
                        <span
                          title="Дзеркальний рядок: long/short поміняні, beta = 1/beta (оцінка)"
                          className="ml-1 text-[9px] text-white/25"
                        >
                          ⇄
                        </span>
                      )}
                    </Td>
                    <Td className="text-white/40">{r.bench || "—"}</Td>
                    <Td right>{r.total}</Td>
                    <Td right className="text-white/60">{r.converged}</Td>
                    <Td right className={rateClass(r.rate)}>{pct(r.rate)}</Td>
                    <Td right className="text-white/45">{pct(r.rateLb)}</Td>
                    <Td right className="text-white/45">{pct(r.winRate)}</Td>
                    <Td right className="text-white/70">{num(r.convPerDay)}</Td>
                    <Td
                      right
                      className={
                        r.capMean === null ? "text-white/30"
                          : r.capMean >= 0 ? "text-emerald-300/80" : "text-rose-300/80"
                      }
                    >
                      {num(r.capMean)}
                    </Td>
                    <Td right className="text-white/45">{num(r.alpha)}</Td>
                    {/* sigma is null when the pair never clears the convergence bar at any
                        level — a real answer, not missing data */}
                    <Td right className="text-white/45">{num(r.sigma)}</Td>
                    <Td right className="text-white/45">{num(r.medianBars, 0)}</Td>
                    <Td right className="text-white/45">{num(r.corr, 3)}</Td>
                    <Td right className="text-white/45">{num(r.beta, 3)}</Td>
                    <Td right className="text-white/40">{r.longTotal}</Td>
                    <Td right className="text-white/40">{r.shortTotal}</Td>
                    <Td right className="text-white/30">{r.nDays}</Td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={18} className="px-4 py-10 text-center text-[11px] text-white/30">
                      Нічого не знайдено за цими порогами.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] tracking-[0.18em] text-white/30">{label}</span>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-2.5 py-2 text-[9px] font-semibold ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children, right, className = "",
}: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-2.5 py-[5px] ${right ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}
