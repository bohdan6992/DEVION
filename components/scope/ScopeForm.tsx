import React, { useMemo, useState } from "react";
import { ExitMode } from "@/lib/scopeApi";

export type ScopeFormValue = {
  dateFromNy: number;
  dateToNy: number;
  tickers: string[];
  entryMinuteIdx: number;
  exitMode: ExitMode;
  exitMinuteIdx?: number;
  includeColumns: string[];
};

type PresetTime = "Open" | "Close" | "Custom";

type Draft = {
  dateFrom: string; // yyyy-mm-dd
  dateTo: string;   // yyyy-mm-dd
  tickers: string;

  entryPreset: PresetTime;
  entryTime: string; // HH:mm (only for Custom)

  exitMode: ExitMode;
  exitPreset: PresetTime; // used only if exitMode=MinuteIdx
  exitTime: string;       // HH:mm (only for Custom)
  
  includeColumns: string;
};

function yyyymmddFromDateStr(s: string): number {
  return Number(s.replaceAll("-", ""));
}

function minuteIdxFromTimeStr(s: string): number {
  const [hh, mm] = s.split(":").map(Number);
  return hh * 60 + mm;
}

function timeStrFromMinuteIdx(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const PRESET_MINUTE: Record<Exclude<PresetTime, "Custom">, number> = {
  Open: 570,  // 09:30
  Close: 960 // 16:00
};

function minuteFromPreset(p: PresetTime, custom: string): number {
  if (p === "Custom") return minuteIdxFromTimeStr(custom);
  return PRESET_MINUTE[p];
}

export default function ScopeForm({
  initial,
  loading,
  onRun,
}: {
  initial: ScopeFormValue;
  loading: boolean;
  onRun: (v: ScopeFormValue) => void;
}) {
  const [d, setD] = useState<Draft>({
    dateFrom: "2026-02-03",
    dateTo: "2026-02-06",
    tickers: initial.tickers.join(","),

    entryPreset: "Open",
    entryTime: "09:30",

    exitMode: initial.exitMode,
    exitPreset: "Close",
    exitTime: "16:00",

    includeColumns: initial.includeColumns.join(","),
  });

  const parsed = useMemo(() => {
    if (!d.dateFrom || !d.dateTo) return { ok: false, value: null as any };

    const dateFromNy = yyyymmddFromDateStr(d.dateFrom);
    const dateToNy = yyyymmddFromDateStr(d.dateTo);

    const tickers = d.tickers
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const includeColumns = d.includeColumns
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const entryMinuteIdx = minuteFromPreset(d.entryPreset, d.entryTime);

    let exitMinuteIdx: number | undefined = undefined;
    if (d.exitMode === "MinuteIdx") {
      exitMinuteIdx = minuteFromPreset(d.exitPreset, d.exitTime);
    }

    const ok =
      Number.isFinite(dateFromNy) &&
      Number.isFinite(dateToNy) &&
      tickers.length > 0 &&
      Number.isFinite(entryMinuteIdx) &&
      (d.exitMode !== "MinuteIdx" || Number.isFinite(exitMinuteIdx));

    return {
      ok,
      value: {
        dateFromNy,
        dateToNy,
        tickers,
        entryMinuteIdx,
        exitMode: d.exitMode,
        exitMinuteIdx,
        includeColumns: includeColumns.length ? includeColumns : ["move_1000"],
      } as ScopeFormValue,
    };
  }, [d]);

  function run() {
    if (!parsed.ok || loading) return;
    onRun(parsed.value);
  }

  // UX: якщо перемикаємо preset — синхронізуємо time field
  function setEntryPreset(p: PresetTime) {
    setD((s) => ({
      ...s,
      entryPreset: p,
      entryTime: p === "Custom" ? s.entryTime : timeStrFromMinuteIdx(minuteFromPreset(p, s.entryTime)),
    }));
  }
  function setExitPreset(p: PresetTime) {
    setD((s) => ({
      ...s,
      exitPreset: p,
      exitTime: p === "Custom" ? s.exitTime : timeStrFromMinuteIdx(minuteFromPreset(p, s.exitTime)),
    }));
  }

  return (
    <section
      className="mt-6 grid grid-cols-1 md:grid-cols-6 gap-3"
      onKeyDown={(e) => {
        if (e.key === "Enter") run();
      }}
    >
      <Field label="dateFrom">
        <input
          type="date"
          value={d.dateFrom}
          onChange={(e) => setD((s) => ({ ...s, dateFrom: e.target.value }))}
          className="mt-2 w-full bg-transparent outline-none text-zinc-200 font-mono text-sm"
        />
      </Field>

      <Field label="dateTo">
        <input
          type="date"
          value={d.dateTo}
          onChange={(e) => setD((s) => ({ ...s, dateTo: e.target.value }))}
          className="mt-2 w-full bg-transparent outline-none text-zinc-200 font-mono text-sm"
        />
      </Field>

      <Field label="tickers">
        <input
          value={d.tickers}
          onChange={(e) => setD((s) => ({ ...s, tickers: e.target.value }))}
          className="mt-2 w-full bg-transparent outline-none text-zinc-200 font-mono text-sm"
          placeholder="SPY, AAPL"
        />
      </Field>

      {/* ENTRY */}
      <Field label="entry">
        <div className="mt-2 flex items-center gap-2">
          <select
            value={d.entryPreset}
            onChange={(e) => setEntryPreset(e.target.value as PresetTime)}
            className="bg-transparent outline-none text-zinc-200 font-mono text-sm"
          >
            <option value="Open">Open 09:30</option>
            <option value="Close">Close 16:00</option>
            <option value="Custom">Custom</option>
          </select>

          {d.entryPreset === "Custom" && (
            <input
              type="time"
              value={d.entryTime}
              onChange={(e) => setD((s) => ({ ...s, entryTime: e.target.value }))}
              className="bg-transparent outline-none text-zinc-200 font-mono text-sm"
            />
          )}
        </div>

        <div className="mt-1 text-[11px] text-zinc-500 font-mono">
          minuteIdx: {minuteFromPreset(d.entryPreset, d.entryTime)}
        </div>
      </Field>

      {/* EXIT MODE */}
      <Field label="exitMode">
        <select
          value={d.exitMode}
          onChange={(e) => setD((s) => ({ ...s, exitMode: e.target.value as ExitMode }))}
          className="mt-2 w-full bg-transparent outline-none text-zinc-200 font-mono text-sm"
        >
          <option value="Move1000">Move1000</option>
          <option value="Close">Close</option>
          <option value="MinuteIdx">MinuteIdx</option>
        </select>

        {d.exitMode === "MinuteIdx" && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={d.exitPreset}
                onChange={(e) => setExitPreset(e.target.value as PresetTime)}
                className="bg-transparent outline-none text-zinc-200 font-mono text-sm"
              >
                <option value="Open">Open 09:30</option>
                <option value="Close">Close 16:00</option>
                <option value="Custom">Custom</option>
              </select>

              {d.exitPreset === "Custom" && (
                <input
                  type="time"
                  value={d.exitTime}
                  onChange={(e) => setD((s) => ({ ...s, exitTime: e.target.value }))}
                  className="bg-transparent outline-none text-zinc-200 font-mono text-sm"
                />
              )}
            </div>

            <div className="mt-1 text-[11px] text-zinc-500 font-mono">
              exitMinuteIdx: {minuteFromPreset(d.exitPreset, d.exitTime)}
            </div>
          </>
        )}

        {d.exitMode === "Close" && (
          <div className="mt-2 text-[11px] text-zinc-500 font-mono">exit: Close (16:00)</div>
        )}
      </Field>

      <Field label="includeColumns">
        <input
          value={d.includeColumns}
          onChange={(e) => setD((s) => ({ ...s, includeColumns: e.target.value }))}
          className="mt-2 w-full bg-transparent outline-none text-zinc-200 font-mono text-sm"
          placeholder="move_1000"
        />
      </Field>

      <div className="md:col-span-6 flex items-center justify-end">
        <button
          className={`h-10 px-4 rounded-lg border text-xs uppercase tracking-widest font-bold transition-all ${
            parsed.ok && !loading
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
              : "border-white/[0.08] bg-white/[0.03] text-zinc-500 cursor-not-allowed"
          }`}
          disabled={!parsed.ok || loading}
          onClick={run}
        >
          {loading ? "Running..." : "Run"}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">{label}</div>
      {children}
    </label>
  );
}
