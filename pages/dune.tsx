import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

type DunePerformance = "medium" | "large";

type DuneExecutionStatus = {
  execution_id: string;
  state: string;
  is_execution_finished: boolean;
  submitted_at?: string;
  execution_started_at?: string;
  execution_ended_at?: string;
  expires_at?: string;
  execution_cost_credits?: number;
  error?: {
    type?: string;
    message?: string;
    metadata?: {
      line?: number;
      column?: number;
    };
  };
  result_metadata?: {
    row_count?: number;
    total_row_count?: number;
    execution_time_millis?: number;
    pending_time_millis?: number;
  };
};

type DuneExecutionResult = DuneExecutionStatus & {
  result?: {
    rows?: Array<Record<string, unknown>>;
    metadata?: {
      column_names?: string[];
      row_count?: number;
      total_row_count?: number;
      execution_time_millis?: number;
      pending_time_millis?: number;
      total_result_set_bytes?: number;
    };
  };
  next_offset?: number;
};

const DEFAULT_SQL = `SELECT
  blockchain,
  project,
  amount_usd,
  block_time
FROM dex.trades
WHERE block_time > now() - interval '1' day
ORDER BY block_time DESC
LIMIT 25`;

async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) {
    return { payload: null, rawText: "" };
  }

  try {
    return { payload: JSON.parse(text), rawText: text };
  } catch {
    return { payload: null, rawText: text };
  }
}

function fmtDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fileTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}

const EXCEL_TEXT_COLUMN_PATTERNS = [
  "address",
  "wallet",
  "tx_hash",
  "hash",
];

function shouldForceExcelText(columnName: string) {
  const lower = columnName.toLowerCase();
  return EXCEL_TEXT_COLUMN_PATTERNS.some((pattern) => lower.includes(pattern));
}

function normalizeExcelCell(value: unknown, forceText: boolean) {
  if (value === null || value === undefined) return "";
  if (forceText) return String(value);
  return value;
}

type DateChunk = {
  label: string;
  from: string;
  to: string;
};

function quarterChunksFrom2024(): DateChunk[] {
  const chunks: DateChunk[] = [];
  const start = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
  const now = new Date();
  let cursor = new Date(start);

  while (cursor < now) {
    const quarterStartMonth = Math.floor(cursor.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(cursor.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0));
    const quarterEnd = new Date(Date.UTC(cursor.getUTCFullYear(), quarterStartMonth + 3, 1, 0, 0, 0));
    const effectiveTo = quarterEnd < now ? quarterEnd : now;

    chunks.push({
      label: `${quarterStart.getUTCFullYear()}-Q${Math.floor(quarterStartMonth / 3) + 1}`,
      from: quarterStart.toISOString().slice(0, 19).replace("T", " "),
      to: effectiveTo.toISOString().slice(0, 19).replace("T", " "),
    });

    cursor = quarterEnd;
  }

  return chunks;
}

function applyChunkPlaceholders(sourceSql: string, chunk: DateChunk) {
  return sourceSql
    .replaceAll("__DATE_FROM__", chunk.from)
    .replaceAll("__DATE_TO__", chunk.to);
}

export default function DunePage() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [performance, setPerformance] = useState<DunePerformance>("medium");
  const [executionId, setExecutionId] = useState("");
  const [status, setStatus] = useState<DuneExecutionStatus | null>(null);
  const [result, setResult] = useState<DuneExecutionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!executionId) return;
    if (!status) return;
    if (status.is_execution_finished) return;

    setIsPolling(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/dune/status?executionId=${encodeURIComponent(executionId)}`, {
          cache: "no-store",
        });
        const { payload, rawText } = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(
            payload?.error ||
            rawText ||
            `HTTP ${response.status} from /api/dune/status`
          );
        }
        if (!payload) throw new Error("Empty response from /api/dune/status.");
        setStatus(payload);
      } catch (pollError: any) {
        setError(pollError?.message ?? "Failed to poll Dune execution.");
      } finally {
        setIsPolling(false);
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [executionId, status]);

  useEffect(() => {
    if (!executionId || !status?.is_execution_finished) return;
    if (status.state !== "QUERY_STATE_COMPLETED" && status.state !== "QUERY_STATE_COMPLETED_PARTIAL") return;
    if (result?.execution_id === executionId) return;

    let active = true;

    const loadResult = async () => {
      try {
        const response = await fetch(
          `/api/dune/results?executionId=${encodeURIComponent(executionId)}&limit=100&allowPartialResults=true`,
          { cache: "no-store" }
        );
        const { payload, rawText } = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(
            payload?.error ||
            rawText ||
            `HTTP ${response.status} from /api/dune/results`
          );
        }
        if (!payload) throw new Error("Empty response from /api/dune/results.");
        if (active) setResult(payload);
      } catch (resultError: any) {
        if (active) setError(resultError?.message ?? "Failed to load Dune result.");
      }
    };

    loadResult();
    return () => {
      active = false;
    };
  }, [executionId, status, result]);

  const rows = result?.result?.rows ?? [];
  const columns = useMemo(() => {
    const explicit = result?.result?.metadata?.column_names;
    if (explicit?.length) return explicit;
    const first = rows[0];
    return first ? Object.keys(first) : [];
  }, [result, rows]);

  const handleRun = async () => {
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    setStatus(null);
    setExecutionId("");

    try {
      if (sql.includes("__DATE_FROM__") || sql.includes("__DATE_TO__")) {
        throw new Error("Run Query works only with real dates. Use Export All Chunked for SQL that contains __DATE_FROM__ and __DATE_TO__.");
      }

      const response = await fetch("/api/dune/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, performance }),
      });
      const { payload, rawText } = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          payload?.error ||
          rawText ||
          `HTTP ${response.status}`
        );
      }
      if (!payload) throw new Error("Empty response from /api/dune/execute.");

      setExecutionId(payload.execution_id);
      setStatus(payload);
    } catch (submitError: any) {
      setError(submitError?.message ?? "Failed to run Dune query.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportAllRows = async () => {
    if (!executionId) {
      setError("Run a query before exporting.");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dune/results-csv?executionId=${encodeURIComponent(executionId)}&allowPartialResults=true`,
        { cache: "no-store" }
      );
      const csvText = await response.text();
      if (!response.ok) {
        throw new Error(csvText || `HTTP ${response.status} from /api/dune/results-csv`);
      }
      if (!csvText.trim()) {
        throw new Error("No CSV data available to export.");
      }

      const XLSX = await import("xlsx");
      const workbookFromCsv = XLSX.read(csvText, { type: "string", raw: true });
      const firstSheetName = workbookFromCsv.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("CSV export did not contain a worksheet.");
      }
      const sourceSheet = workbookFromCsv.Sheets[firstSheetName];
      const csvRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sourceSheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      const headerRow = (csvRows[0] ?? []).map((value) => String(value ?? ""));
      const textColumnIndexes = new Set(
        headerRow
          .map((column, index) => (shouldForceExcelText(column) ? index : -1))
          .filter((index) => index >= 0)
      );
      const normalizedRows = csvRows.map((row) =>
        row.map((value, index) => normalizeExcelCell(value, textColumnIndexes.has(index)))
      );
      const worksheet = XLSX.utils.aoa_to_sheet(normalizedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DuneResults");

      const filename = `dune_${executionId.slice(0, 12)}_${fileTimestamp()}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (exportError: any) {
      setError(exportError?.message ?? "Failed to export results.");
    } finally {
      setIsExporting(false);
    }
  };

  const waitForExecutionResult = async (nextExecutionId: string) => {
    let latestStatus: DuneExecutionStatus | null = null;

    for (;;) {
      const statusResponse = await fetch(
        `/api/dune/status?executionId=${encodeURIComponent(nextExecutionId)}`,
        { cache: "no-store" }
      );
      const { payload, rawText } = await readJsonSafely(statusResponse);
      if (!statusResponse.ok) {
        throw new Error(payload?.error || rawText || `HTTP ${statusResponse.status} from /api/dune/status`);
      }
      if (!payload) {
        throw new Error("Empty response from /api/dune/status during chunked export.");
      }

      latestStatus = payload as DuneExecutionStatus;

      if (latestStatus.is_execution_finished) {
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }

    if (!latestStatus || (latestStatus.state !== "QUERY_STATE_COMPLETED" && latestStatus.state !== "QUERY_STATE_COMPLETED_PARTIAL")) {
      throw new Error(`Chunk execution finished with state ${latestStatus?.state ?? "UNKNOWN"}.`);
    }

    const allRows: Array<Record<string, unknown>> = [];
    let offset = 0;
    const batchSize = 1000;

    for (;;) {
      const resultResponse = await fetch(
        `/api/dune/results?executionId=${encodeURIComponent(nextExecutionId)}&limit=${batchSize}&offset=${offset}&allowPartialResults=true`,
        { cache: "no-store" }
      );
      const { payload, rawText } = await readJsonSafely(resultResponse);
      if (!resultResponse.ok) {
        throw new Error(payload?.error || rawText || `HTTP ${resultResponse.status} from /api/dune/results`);
      }
      if (!payload) {
        throw new Error("Empty response from /api/dune/results during chunked export.");
      }

      const batchRows = (payload as DuneExecutionResult).result?.rows ?? [];
      allRows.push(...batchRows);

      if (!batchRows.length || batchRows.length < batchSize) {
        break;
      }

      offset += batchRows.length;
    }

    return allRows;
  };

  const handleChunkedExport = async () => {
    if (!sql.includes("__DATE_FROM__") || !sql.includes("__DATE_TO__")) {
      setError("Chunked export needs SQL placeholders __DATE_FROM__ and __DATE_TO__ in the block_time filter.");
      return;
    }

    setIsExporting(true);
    setExportProgress("Preparing quarterly chunks...");
    setError(null);

    try {
      const chunks = quarterChunksFrom2024();
      const mergedRows: Array<Record<string, unknown>> = [];

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        setExportProgress(`Running ${chunk.label} (${i + 1}/${chunks.length})`);

        const chunkSql = applyChunkPlaceholders(sql, chunk);

        const executeResponse = await fetch("/api/dune/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: chunkSql, performance }),
        });
        const { payload, rawText } = await readJsonSafely(executeResponse);
        if (!executeResponse.ok) {
          throw new Error(payload?.error || rawText || `HTTP ${executeResponse.status} from /api/dune/execute`);
        }
        if (!payload?.execution_id) {
          throw new Error(`No execution id returned for ${chunk.label}.`);
        }

        const chunkRows = await waitForExecutionResult(payload.execution_id);
        mergedRows.push(...chunkRows);
      }

      if (!mergedRows.length) {
        throw new Error("Chunked export completed but returned no rows.");
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(mergedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DuneResults");

      const filename = `dune_chunked_${fileTimestamp()}.xlsx`;
      XLSX.writeFile(workbook, filename);
      setExportProgress(`Saved ${mergedRows.length} rows to ${filename}`);
    } catch (chunkError: any) {
      setError(chunkError?.message ?? "Failed to export chunked results.");
      setExportProgress(null);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Dune Terminal</title>
      </Head>

      <main className="min-h-screen px-6 py-8 text-white">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
          <section className="rounded-2xl border border-white/[0.06] bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-mono uppercase tracking-[0.24em] text-white/40">
                  Dune
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Run Dune SQL from this device
                </h1>
                <p className="max-w-3xl text-sm text-white/55">
                  SQL runs through your local project server, so the browser never sees
                  `DUNE_API_KEY`. Add the key to `TradingTool/.env.local`, start the app,
                  and send queries from here. For chunked full-history export, use
                  {" `__DATE_FROM__` and `__DATE_TO__` "}in your SQL date filter.
                </p>
              </div>

              <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20 px-3 text-[10px] font-mono font-bold uppercase text-white/55">
                <span className={`h-2 w-2 rounded-full ${executionId ? "bg-emerald-400" : "bg-white/25"}`} />
                <span>{executionId ? "Connected" : "Awaiting Query"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
                SQL Editor
              </div>
              <div className="flex h-7 items-center gap-2">
                <div className="flex h-7 items-center gap-2 rounded-lg bg-black/20 px-3 text-[10px] font-mono font-bold uppercase text-white/45">
                  <span>Engine</span>
                  <select
                    value={performance}
                    onChange={(event) => setPerformance(event.target.value as DunePerformance)}
                    className="bg-transparent text-white outline-none"
                  >
                    <option value="medium" className="bg-[#090909] text-white">
                      Medium
                    </option>
                    <option value="large" className="bg-[#090909] text-white">
                      Large
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isSubmitting || !sql.trim()}
                  className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent bg-emerald-500/12 px-3 text-[10px] font-mono font-bold uppercase text-emerald-300 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Running" : "Run Query"}
                </button>
              </div>
            </div>

            <textarea
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              spellCheck={false}
              className="min-h-[320px] w-full rounded-2xl border border-white/[0.06] bg-[#050505]/90 p-4 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-emerald-500/35"
            />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-white/40">
              Execution
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">Execution ID</div>
                <div className="mt-1 break-all font-mono text-[11px] text-white/80">
                  {executionId || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">State</div>
                <div className="mt-1 font-mono text-[11px] text-white/80">
                  {status?.state || "Idle"}
                  {isPolling ? " • polling" : ""}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">Submitted</div>
                <div className="mt-1 text-[12px] text-white/80">{fmtDateTime(status?.submitted_at)}</div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">Started</div>
                <div className="mt-1 text-[12px] text-white/80">{fmtDateTime(status?.execution_started_at)}</div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">Ended</div>
                <div className="mt-1 text-[12px] text-white/80">{fmtDateTime(status?.execution_ended_at)}</div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-[#050505]/70 px-3 py-2">
                <div className="text-[10px] font-mono uppercase text-white/35">Credits</div>
                <div className="mt-1 text-[12px] text-white/80">
                  {status?.execution_cost_credits ?? "—"}
                </div>
              </div>
            </div>

            {status?.error?.message ? (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-200">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-300/80">
                  Dune Error
                </div>
                <div className="mt-2 text-sm">{status.error.message}</div>
                {(status.error.metadata?.line || status.error.metadata?.column) && (
                  <div className="mt-2 text-[12px] font-mono text-rose-100/80">
                    line {status.error.metadata?.line ?? "?"}, column {status.error.metadata?.column ?? "?"}
                  </div>
                )}
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {exportProgress ? (
              <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-200">
                {exportProgress}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">
                  Results
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-mono uppercase text-white/45">
                    {result?.result?.metadata?.row_count ?? rows.length} rows loaded
                    {result?.result?.metadata?.total_row_count
                      ? ` / ${result.result.metadata.total_row_count} total`
                      : ""}
                  </div>
                  <button
                    type="button"
                    onClick={handleExportAllRows}
                    disabled={!executionId || isExporting || !rows.length}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent bg-blue-500/12 px-3 text-[10px] font-mono font-bold uppercase text-blue-300 transition-colors hover:bg-blue-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isExporting ? "Exporting" : "Export Visible"}
                  </button>
                  <button
                    type="button"
                    onClick={handleChunkedExport}
                    disabled={isExporting || isSubmitting}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-transparent bg-amber-500/12 px-3 text-[10px] font-mono font-bold uppercase text-amber-300 transition-colors hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isExporting ? "Chunking" : "Export All Chunked"}
                  </button>
                </div>
              </div>

              {!rows.length ? (
                <div className="rounded-2xl border border-white/[0.04] bg-[#050505]/80 p-6 text-sm text-white/45">
                  Run a query to see rows here.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/[0.04]">
                  <div className="max-h-[760px] overflow-auto bg-[#050505]/85">
                    <table className="min-w-full border-collapse text-left text-[12px]">
                      <thead className="sticky top-0 bg-[#090909]">
                        <tr>
                          {columns.map((column) => (
                            <th
                              key={column}
                              className="border-b border-white/[0.06] px-2 py-2 text-[9px] font-mono uppercase tracking-[0.14em] text-white/40"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={`${index}-${String(row[columns[0]] ?? index)}`} className="odd:bg-white/[0.02]">
                            {columns.map((column) => (
                              <td
                                key={`${index}-${column}`}
                                className="max-w-[260px] border-b border-white/[0.04] px-2 py-1.5 align-top font-mono text-[11px] leading-5 text-white/78"
                              >
                                {stringifyCell(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </section>
        </div>
      </main>
    </>
  );
}
