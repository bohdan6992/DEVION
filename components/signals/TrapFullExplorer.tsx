"use client";

import { useEffect, useMemo, useState } from "react";
import { getFullQuotes, FullQuotesRow } from "@/lib/trapClient";
import { FULL_FIELDS, FullFieldName } from "@/lib/fullFields";

type FetchStatus = "idle" | "loading" | "ok" | "error";
type FilterMode =
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "gte"
  | "lte"
  | "between";

type FilterSort = {
  id: number;
  field: FullFieldName | "ticker";
  mode: FilterMode;
  value: string;
  value2?: string;
  sortDir: "asc" | "desc" | null;
};

// Відповідає тому, що лежить у items (без ticker всередині value)
type FullQuotesApiRow = Omit<FullQuotesRow, "ticker">;

let filterIdCounter = 1;

const MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "contains", label: "CONTAINS" },
  { value: "not_contains", label: "!CONTAINS" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "between", label: "BETWEEN" },
];

type OpenDropdown =
  | { id: number; kind: "field" }
  | { id: number; kind: "mode" }
  | null;

export default function TrapFullExplorer() {
  const [data, setData] = useState<{
    elapsedMs: number;
    universeTickers: number;
    returnedTickers: number;
    items: Record<string, FullQuotesApiRow>;
  } | null>(null);

  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterSort[]>([
    {
      id: filterIdCounter++,
      field: "ticker",
      mode: "contains",
      value: "",
      sortDir: null,
    },
  ]);

  // Стан дропдаунів
  const [openDrop, setOpenDrop] = useState<OpenDropdown>(null);
  const [fieldQueryMap, setFieldQueryMap] = useState<Record<number, string>>({});

  const setFieldQuery = (id: number, v: string) =>
    setFieldQueryMap((p) => ({ ...p, [id]: v }));
  const getFieldQuery = (id: number) => fieldQueryMap[id] ?? "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setStatus("loading");
        setError(null);
        const json = await getFullQuotes();
        if (!cancelled) {
          setData(json as any);
          setStatus("ok");
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setError(e?.message ?? "Fetch error");
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const rows: FullQuotesRow[] = useMemo(() => {
    if (!data?.items) return [];
    return Object.entries(data.items).map(([ticker, fields]) => ({
      ticker,
      ...(fields as FullQuotesApiRow),
    }));
  }, [data]);

  const allFields: (FullFieldName | "ticker")[] = useMemo(
    () => ["ticker", ...FULL_FIELDS],
    []
  );

  const visibleFields: (FullFieldName | "ticker")[] = useMemo(() => {
    const set = new Set<FullFieldName | "ticker">();
    set.add("ticker");
    for (const f of filters) set.add(f.field);
    return Array.from(set);
  }, [filters]);

  const isNumericMode = (mode: FilterMode) =>
    mode === "gte" || mode === "lte" || mode === "between";

  const filterFieldsByPrefix = (id: number) => {
    const q = getFieldQuery(id).trim().toLowerCase();
    if (!q) return allFields;
    return allFields.filter((x) => String(x).toLowerCase().startsWith(q));
  };

  const filteredSortedRows = useMemo(() => {
    let result = [...rows];

    for (const f of filters) {
      const { field, mode, value, value2 } = f;
      const v = value.trim();
      const v2 = value2?.trim();

      if (!field) continue;

      if (mode === "between") {
        if (!v || !v2) continue;
      } else {
        if (!v) continue;
      }

      result = result.filter((row) => {
        const raw = row[field];
        if (raw == null) return false;

        if (!isNumericMode(mode)) {
          const s = String(raw).trim().toLowerCase();
          const val = v.trim().toLowerCase();
          if (mode === "contains") return s.includes(val);
          if (mode === "not_contains") return !s.includes(val);
          if (mode === "eq") return s === val;
          if (mode === "neq") return s !== val;
          return true;
        }

        const num = Number(raw);
        if (Number.isNaN(num)) return false;
        const from = v ? Number(v.replace(",", ".")) : undefined;
        const to = v2 ? Number(v2.replace(",", ".")) : undefined;

        if (mode === "gte") return from !== undefined && !Number.isNaN(from) && num >= from;
        if (mode === "lte") return from !== undefined && !Number.isNaN(from) && num <= from;
        if (mode === "between")
          return (
            from !== undefined &&
            !Number.isNaN(from) &&
            to !== undefined &&
            !Number.isNaN(to) &&
            num >= from &&
            num <= to
          );
        return true;
      });
    }

    const sortFilter = filters.find((f) => f.sortDir !== null);
    if (sortFilter) {
      const { field, sortDir } = sortFilter;
      result.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        const na = Number(av);
        const nb = Number(bv);
        let cmp = 0;
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          cmp = na === nb ? 0 : na < nb ? -1 : 1;
        } else {
          const sa = String(av ?? "");
          const sb = String(bv ?? "");
          cmp = sa.localeCompare(sb);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, filters]);

  const updateFilterField = (id: number, field: FullFieldName | "ticker") =>
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, field } : f)));

  const updateFilterMode = (id: number, mode: FilterMode) =>
    setFilters((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, mode, value2: mode === "between" ? f.value2 : undefined }
          : f
      )
    );

  const updateFilterValue = (id: number, value: string) =>
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));

  const updateFilterValue2 = (id: number, value2: string) =>
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, value2 } : f)));

  const toggleSort = (id: number) => {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        if (f.sortDir === null) return { ...f, sortDir: "asc" };
        if (f.sortDir === "asc") return { ...f, sortDir: "desc" };
        return { ...f, sortDir: null };
      })
    );
  };

  const addFilter = () =>
    setFilters((prev) => [
      ...prev,
      {
        id: filterIdCounter++,
        field: "ticker",
        mode: "contains",
        value: "",
        sortDir: null,
      },
    ]);

  const removeFilter = (id: number) =>
    setFilters((prev) => (prev.length <= 1 ? prev : prev.filter((f) => f.id !== id)));

  const exportCsv = () => {
    if (!filteredSortedRows.length) return;
    const cols = visibleFields as string[];
    const lines = [
      cols.join(","),
      ...filteredSortedRows.map((row) =>
        cols
          .map((c) => {
            const v = (row as any)[c];
            const s = v == null ? "" : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trap_full_quotes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const isOpen = (id: number, kind: "field" | "mode") =>
    openDrop?.id === id && openDrop.kind === kind;

  return (
    <section className="trap-wrap">
      
      {/* HEADER */}
      <header className="trap-head">
        <div className="title-group">
          <span className="dot" />
          <h2 className="title">TRAP EXPLORER</h2>
        </div>
        <div className="meta">
          FULL MARKET DATA ACCESS
        </div>
      </header>

      {/* CONTROLS AREA */}
      <div className="controls-area">
        <div className="filters-list">
          {filters.map((f, idx) => (
            <div key={f.id} className="filter-pill">
              
              {/* Field Select */}
              <div className="dropdown-container field">
                <button
                  type="button"
                  className={`dropdown-btn ${isOpen(f.id, "field") ? "active" : ""}`}
                  onClick={() => {
                    const willOpen = !isOpen(f.id, "field");
                    setOpenDrop(willOpen ? { id: f.id, kind: "field" } : null);
                    if (willOpen) setFieldQuery(f.id, "");
                  }}
                >
                  <span className="icon">⚡</span>
                  <span className="text">{f.field}</span>
                  <span className="chevron">▾</span>
                </button>

                {isOpen(f.id, "field") && (
                  <div className="dropdown-menu">
                    <div className="search-wrap">
                      <input
                        autoFocus
                        className="search-input"
                        placeholder="Search field..."
                        value={getFieldQuery(f.id)}
                        onChange={(e) => setFieldQuery(f.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setOpenDrop(null);
                            setFieldQuery(f.id, "");
                          }
                          if (e.key === "Enter") {
                            const list = filterFieldsByPrefix(f.id);
                            if (list.length) {
                              updateFilterField(f.id, list[0]);
                              setOpenDrop(null);
                              setFieldQuery(f.id, "");
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="list-wrap">
                      {filterFieldsByPrefix(f.id).map((fld) => (
                        <div
                          key={fld}
                          className="list-item"
                          onClick={() => {
                            updateFilterField(f.id, fld);
                            setOpenDrop(null);
                            setFieldQuery(f.id, "");
                          }}
                        >
                          {fld}
                        </div>
                      ))}
                      {filterFieldsByPrefix(f.id).length === 0 && (
                        <div className="empty-msg">No matches</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Select */}
              <div className="dropdown-container mode">
                <button
                  type="button"
                  className={`dropdown-btn ${isOpen(f.id, "mode") ? "active" : ""}`}
                  onClick={() =>
                    setOpenDrop(isOpen(f.id, "mode") ? null : { id: f.id, kind: "mode" })
                  }
                >
                  <span className="text">
                    {MODE_OPTIONS.find((m) => m.value === f.mode)?.label ?? f.mode}
                  </span>
                  <span className="chevron">▾</span>
                </button>

                {isOpen(f.id, "mode") && (
                  <div className="dropdown-menu">
                    {MODE_OPTIONS.map((m) => (
                      <div
                        key={m.value}
                        className="list-item"
                        onClick={() => {
                          updateFilterMode(f.id, m.value);
                          setOpenDrop(null);
                        }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Value Input */}
              <div className="inputs-group">
                <input
                  className="value-input"
                  placeholder={isNumericMode(f.mode) ? "0.00" : "text"}
                  value={f.value}
                  onChange={(e) => updateFilterValue(f.id, e.target.value)}
                />
                {f.mode === "between" && (
                  <>
                    <span className="sep">–</span>
                    <input
                      className="value-input"
                      placeholder="max"
                      value={f.value2 ?? ""}
                      onChange={(e) => updateFilterValue2(f.id, e.target.value)}
                    />
                  </>
                )}
              </div>

              {/* Sort Toggle */}
              <button
                type="button"
                onClick={() => toggleSort(f.id)}
                className={`icon-btn sort ${f.sortDir ? "active" : ""}`}
                title="Sort"
              >
                {f.sortDir === "asc" ? "↑" : f.sortDir === "desc" ? "↓" : "⇅"}
              </button>

              {/* Remove */}
              {filters.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFilter(f.id)}
                  className="icon-btn delete"
                  title="Remove Filter"
                >
                  ✕
                </button>
              )}

              {/* Add New (Only on last) */}
              {idx === filters.length - 1 && (
                <button
                  type="button"
                  onClick={addFilter}
                  className="icon-btn add"
                  title="Add Filter"
                >
                  +
                </button>
              )}
            </div>
          ))}
        </div>

        {/* INFO BAR */}
        <div className="info-bar">
          <div className="status-group">
            {status === "loading" && <span className="status loading">SYNCING...</span>}
            {status === "error" && <span className="status error">ERR: {error}</span>}
            {data && (
              <>
                <div className="stat-item">
                  <span className="lbl">UNIVERSE:</span>
                  <span className="val">{data.universeTickers.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span className="lbl">FETCHED:</span>
                  <span className="val">{data.returnedTickers.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span className="lbl">TIME:</span>
                  <span className="val">{data.elapsedMs.toFixed(0)}ms</span>
                </div>
              </>
            )}
          </div>
          
          <button onClick={exportCsv} className="export-btn" disabled={!filteredSortedRows.length}>
            DOWNLOAD CSV
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-viewport">
        <table className="data-table">
          <thead>
            <tr>
              {visibleFields.map((fld) => (
                <th key={fld}>{fld}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSortedRows.map((row, idx) => (
              <tr key={row.ticker ?? idx}>
                {visibleFields.map((fld) => (
                  <td key={fld}>
                    {row[fld] != null ? String(row[fld]) : <span className="nil">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {filteredSortedRows.length === 0 && status === "ok" && (
              <tr>
                <td colSpan={visibleFields.length} className="empty-row">
                  No data matches your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        /* === VARS (Dark Premium) === */
        .trap-wrap {
          --bg-glass: rgba(13, 13, 16, 0.85);
          --border: rgba(255, 255, 255, 0.08);
          --text: #ededed;
          --text-dim: #888888;
          --accent: #38bdf8;
          --green: #10b981;
          --red: #ef4444;
          --pill-bg: rgba(255, 255, 255, 0.03);
          
          width: 100%;
          box-sizing: border-box;

          background: var(--bg-glass);
          backdrop-filter: blur(24px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          
          font-family: 'JetBrains Mono', monospace;
          color: var(--text);
          box-shadow: 0 24px 48px -12px rgba(0,0,0,0.5);
          margin-top: 40px;
        }

        /* === HEADER === */
        .trap-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .title-group { display: flex; align-items: center; gap: 10px; }
        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 10px var(--accent);
          animation: pulse 2s infinite;
        }
        .title { font-size: 16px; font-weight: 800; color: #fff; letter-spacing: 0.05em; margin: 0; }
        .meta { font-size: 11px; font-weight: 700; color: var(--text-dim); }

        /* === CONTROLS === */
        .controls-area { display: flex; flex-direction: column; gap: 12px; }
        .filters-list { display: flex; flex-wrap: wrap; gap: 8px; }

        .filter-pill {
          display: flex; align-items: center; gap: 8px;
          background: var(--pill-bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 4px 8px;
          transition: border-color 0.2s;
        }
        .filter-pill:hover { border-color: rgba(255,255,255,0.2); }

        /* DROPDOWNS */
        .dropdown-container { position: relative; }
        .dropdown-container.field { width: 140px; }
        .dropdown-container.mode { width: 100px; }
        
        .dropdown-btn {
          display: flex; align-items: center; gap: 6px;
          width: 100%; height: 28px;
          background: transparent; border: none;
          color: #fff; font-size: 12px; font-family: inherit;
          cursor: pointer; padding: 0 4px; border-radius: 4px;
        }
        .dropdown-btn:hover { background: rgba(255,255,255,0.05); }
        .dropdown-btn.active { color: var(--accent); }
        .dropdown-btn .icon { opacity: 0.7; }
        .dropdown-btn .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left; }
        .dropdown-btn .chevron { opacity: 0.5; font-size: 10px; }

        .dropdown-menu {
          position: absolute; top: 34px; left: 0; z-index: 50;
          width: 100%; min-width: 160px;
          background: #18181b; border: 1px solid var(--border);
          border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          overflow: hidden; padding: 4px;
        }
        .search-wrap { padding: 4px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
        .search-input {
          width: 100%; background: transparent; border: none;
          color: #fff; font-size: 11px; outline: none; font-family: inherit;
        }
        .list-wrap { max-height: 200px; overflow-y: auto; }
        .list-item {
          padding: 6px 8px; font-size: 12px; color: var(--text-dim);
          cursor: pointer; border-radius: 4px;
        }
        .list-item:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .empty-msg { padding: 8px; font-size: 11px; color: var(--text-dim); text-align: center; }

        /* INPUTS */
        .inputs-group { display: flex; align-items: center; gap: 4px; }
        .value-input {
          background: rgba(0,0,0,0.3); border: 1px solid var(--border);
          border-radius: 4px; height: 28px; width: 80px;
          color: var(--accent); font-size: 12px; padding: 0 8px;
          outline: none; font-family: inherit;
        }
        .value-input:focus { border-color: var(--accent); }
        .sep { color: var(--text-dim); }

        /* ICON BUTTONS */
        .icon-btn {
          width: 24px; height: 24px; display: grid; place-items: center;
          background: transparent; border: none; border-radius: 4px;
          color: var(--text-dim); cursor: pointer; transition: all 0.2s;
        }
        .icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .icon-btn.sort.active { color: var(--accent); font-weight: bold; }
        .icon-btn.delete:hover { color: var(--red); background: rgba(239, 68, 68, 0.1); }
        .icon-btn.add { color: var(--green); }
        .icon-btn.add:hover { background: rgba(16, 185, 129, 0.1); }

        /* INFO BAR */
        .info-bar {
          display: flex; justify-content: space-between; align-items: center;
          background: rgba(255,255,255,0.02); padding: 8px 12px;
          border-radius: 8px; border: 1px solid var(--border);
          flex-wrap: wrap; gap: 10px;
        }
        .status-group { display: flex; gap: 16px; font-size: 11px; }
        .stat-item { display: flex; gap: 6px; }
        .lbl { color: var(--text-dim); font-weight: 700; }
        .val { color: #fff; }
        .status.loading { color: var(--accent); animation: pulse 1s infinite; }
        .status.error { color: var(--red); }

        .export-btn {
          background: transparent; border: 1px solid var(--border);
          color: #fff; font-size: 11px; font-weight: 700;
          padding: 6px 12px; border-radius: 6px; cursor: pointer;
          transition: all 0.2s;
        }
        .export-btn:hover:not(:disabled) { background: rgba(255,255,255,0.05); border-color: #fff; }
        .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* === TABLE === */
        .table-viewport {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: auto;
          max-height: 500px;
          background: rgba(0,0,0,0.2);
        }
        .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .data-table th {
          position: sticky; top: 0; z-index: 10;
          background: #18181b; /* Solid bg for sticky header */
          text-align: left; padding: 10px 12px;
          color: var(--text-dim); font-weight: 700;
          border-bottom: 1px solid var(--border);
        }
        .data-table td {
          padding: 8px 12px;
          color: #fff; border-bottom: 1px solid rgba(255,255,255,0.03);
          white-space: nowrap;
        }
        .data-table tr:hover td { background: rgba(255,255,255,0.03); }
        .nil { color: var(--text-dim); opacity: 0.5; }
        .empty-row { text-align: center; padding: 24px; color: var(--text-dim); font-style: italic; }

        @keyframes pulse {
          0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; }
        }

        @media (max-width: 768px) {
          .filters-list { flex-direction: column; }
          .filter-pill { width: 100%; flex-wrap: wrap; }
          .dropdown-container { flex: 1; }
          .info-bar { flex-direction: column; align-items: flex-start; }
          .export-btn { width: 100%; }
        }
      `}</style>
    </section>
  );
}