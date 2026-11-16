"use client";

import React from "react";
import clsx from "clsx";
import type { TickerLists } from "./useTickerLists";
import { parseTickersFromFreeText } from "./useTickerLists";

/**
 * The three drawers the header's IGN/APP/PIN buttons open. Markup kept as the Sonars draw it so the
 * two surfaces read identically; the state behind it is `useTickerLists`, shared.
 */

type Which = "ignore" | "apply" | "pin";

const TONE: Record<Which, { title: string; hint: string; text: string; addBtn: string; focus: string; chip: string }> = {
  ignore: {
    title: "IGNORE LIST",
    hint: "Removed client-side when LIST MODE = IGNORE",
    text: "text-rose-400",
    addBtn: "bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30",
    focus: "focus:border-rose-500/30",
    chip: "hover:border-rose-500/50 hover:text-rose-400",
  },
  apply: {
    title: "APPLY ONLY LIST",
    hint: "Everything else is hidden when LIST MODE = APPLY",
    text: "text-[#6ee7b7]",
    addBtn: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30",
    focus: "focus:border-emerald-500/30",
    chip: "hover:border-emerald-500/50 hover:text-emerald-300",
  },
  pin: {
    title: "PIN LIST",
    hint: "Sorted to the top when LIST MODE = PIN; nothing is hidden",
    text: "text-violet-300",
    addBtn: "bg-violet-500/20 text-violet-200 border-violet-500/30 hover:bg-violet-500/30",
    focus: "focus:border-violet-500/30",
    chip: "hover:border-violet-500/50 hover:text-violet-300",
  },
};

function Panel({ which, lists, span }: { which: Which; lists: TickerLists; span: string }) {
  const t = TONE[which];
  const set = which === "ignore" ? lists.ignoreSet : which === "apply" ? lists.applySet : lists.pinSet;
  const draft = which === "ignore" ? lists.ignoreDraft : which === "apply" ? lists.applyDraft : lists.pinDraft;
  const setDraft = which === "ignore" ? lists.setIgnoreDraft : which === "apply" ? lists.setApplyDraft : lists.setPinDraft;
  const fileRef = which === "ignore" ? lists.ignoreFileRef : which === "apply" ? lists.applyFileRef : lists.pinFileRef;
  const items = React.useMemo(() => [...set].sort(), [set]);

  return (
    <div className={clsx("bg-[#0a0a0a]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col gap-4 col-span-7", span)}>
      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
        <span className={clsx("text-sm font-bold tracking-tight", t.text)}>{t.title}</span>
        <span className="text-[10px] font-mono text-zinc-500">{t.hint}</span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="TSLA, NVDA..."
        className={clsx("w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:outline-none resize-none", t.focus)}
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { lists.add(which, parseTickersFromFreeText(draft)); setDraft(""); }}
          className={clsx("px-4 py-1.5 rounded-lg border text-xs font-bold", t.addBtn)}
        >
          ADD
        </button>
        <button type="button" onClick={() => setDraft("")} className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 border border-white/10 text-xs hover:text-white">
          CLEAR
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-4 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs hover:bg-violet-500/20"
        >
          IMPORT CSV
        </button>
        {set.size > 0 && (
          <button
            type="button"
            onClick={() => lists.clear(which)}
            className="ml-auto px-4 py-1.5 rounded-lg bg-rose-900/20 text-rose-500 border border-rose-900/30 text-xs hover:bg-rose-900/40"
          >
            RESET
          </button>
        )}
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={lists.onFile(which)} className="hidden" />
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
          {items.map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => lists.remove(which, tk)}
              className={clsx("px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-zinc-400 transition-colors", t.chip)}
            >
              {tk} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TickerListPanels({ lists }: { lists: TickerLists }) {
  if (!lists.showIgnore && !lists.showApply && !lists.showPin) return null;
  return (
    <div className="grid grid-cols-7 gap-4">
      {lists.showIgnore && <Panel which="ignore" lists={lists} span="lg:col-span-3" />}
      {lists.showApply && <Panel which="apply" lists={lists} span="lg:col-span-4" />}
      {lists.showPin && <Panel which="pin" lists={lists} span="lg:col-span-3" />}
    </div>
  );
}
