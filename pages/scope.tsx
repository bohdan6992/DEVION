import React, { useMemo, useState } from "react";
import ScopeDashboard from "@/components/scope/ScopeDashboard";
import ScopeForm, { ScopeFormValue } from "@/components/scope/ScopeForm";
import TickerSummaryTable from "@/components/scope/TickerSummaryTable";
import TickerSelector from "@/components/scope/TickerSelector";
import { buildLocalPayloadsFromRows } from "@/components/scope/localCharts";
import {
  postScopeCharts,
  postScopeEvents,
  ScopeChartsRequest,
  ScopeChartsResponse,
  ScopeEventRow,
} from "@/lib/scopeApi";

export default function ScopePage() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ScopeChartsResponse | null>(null);
  const [eventRows, setEventRows] = useState<ScopeEventRow[] | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  async function run(v: ScopeFormValue) {
    setError(null);
    setResp(null);
    setEventRows(null);
    setSelectedTicker("ALL");
    setLoading(true);

    try {
      const req: ScopeChartsRequest = {
        events: {
        dateFromNy: v.dateFromNy,
        dateToNy: v.dateToNy,
        tickers: v.tickers,
        entryMinuteIdx: v.entryMinuteIdx,
        exitMode: v.exitMode,
        exitMinuteIdx: v.exitMinuteIdx,
        includeColumns: v.includeColumns,
        },

        charts: [
          { id: "perf", kind: "Performance", field: "trade" },
          { id: "dist", kind: "Distribution", field: "trade" },
          { id: "cs", kind: "Cumsum", field: "trade" },
          {
            id: "bins",
            kind: "Bins",
            field: "trade",
            xField: "move_1000",
            binningMode: "Quantiles",
            quantiles: 5,
          },
        ],
      };

      // 1) aggregate charts (бекенд)
      const r = await postScopeCharts(req);
      setResp(r);
      if (!r.ok) {
        setError(r.error ?? "Charts request failed");
        return;
      }

      // 2) events rows (для per-ticker і локальних графіків)
      const er = await postScopeEvents(req.events);
      if (!er.ok) {
        setError(er.error ?? "Events request failed");
        return;
      }
      setEventRows(er.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const r of eventRows ?? []) set.add(r.ticker);
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [eventRows]);

  const displayPayloads = useMemo(() => {
    if (!resp?.ok) return null;

    // ALL -> бекенд payloads
    if (selectedTicker === "ALL") return resp.payloads ?? null;

    // ticker -> локально з eventRows
    const rows = (eventRows ?? []).filter((r) => r.ticker === selectedTicker);
    return buildLocalPayloadsFromRows(rows, { binSize: 0.05, quantiles: 5 });
  }, [resp, eventRows, selectedTicker]);

  return (
    <main className="min-h-screen px-6 lg:px-10 pt-[92px] pb-10">
      <div className="max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-white text-2xl font-semibold tracking-tight">SCOPE</h1>
          <div className="text-zinc-400 text-sm mt-1">
            POST <span className="font-mono">/api/scope/charts</span> (exitMode: <span className="font-mono">Move1000</span>)
          </div>
        </div>

        <ScopeForm
          loading={loading}
          initial={{
            dateFromNy: 20260203,
            dateToNy: 20260206,
            tickers: ["SPY"],
            entryMinuteIdx: 570,
            exitMode: "Move1000",
            includeColumns: ["move_1000"],
          }}
          onRun={run}
        />

        <section className="mt-6">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {eventRows && eventRows.length > 0 && (
            <>
              <TickerSummaryTable rows={eventRows} />
              <TickerSelector tickers={tickers} value={selectedTicker} onChange={setSelectedTicker} />
            </>
          )}

          {displayPayloads && <ScopeDashboard payloads={displayPayloads} />}
        </section>
      </div>
    </main>
  );
}
