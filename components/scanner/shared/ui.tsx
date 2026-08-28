"use client";

import clsx from "clsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUi } from "../../UiProvider";
import { normalizeSide } from "../../../lib/scanner/format";
import type { GlassSelectGroup, GlassSelectOption, ScopeChartTooltipData, SharedRangeFilterKey, SharedRangeFilterMode, TapeArbSide, TriMode } from "../../../lib/scanner/types";
import { MSF, getSonarAccent, resolveAccentMsColor, slug } from "./accent";
import type { MsColor } from "./accent";
import { SCANNER_CONTROL_SURFACE, SCANNER_PANEL_SURFACE } from "./styles";

// =========================
// DESIGN SYSTEM COMPONENTS (kept from your file)
// =========================
export function NebulaBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 bg-[#030303]">
      <div className="absolute inset-0 bg-[radial-gradient(680px_420px_at_14%_8%,rgba(16,185,129,0.2),transparent_70%),radial-gradient(720px_420px_at_88%_10%,rgba(139,92,246,0.16),transparent_72%)] blur-[150px]" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      <div
        className="absolute inset-x-0 bottom-0 h-[55vh]"
        style={{
          backgroundImage:
            "radial-gradient(68% 52% at 50% 100%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.05) 28%, rgba(0,0,0,0) 70%)",
          maskImage: "linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))",
        }}
      />
    </div>
  );
}

export function GlassCardImpl({
  children,
  className,
  glow = false,
  hoverable = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hoverable?: boolean;
}) {
  return (
    <div
      className={clsx(
        "scanner-glass-card bg-[#0a0a0a]/50 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-xl transition-all duration-300",
        hoverable ? "hover:border-white/[0.12] hover:bg-[#0a0a0a]/70" : "hover:border-white/[0.06] hover:bg-[#0a0a0a]/50",
        glow && "border-l-4 border-l-emerald-500 shadow-[0_0_30px_-10px_rgba(16,185,129,0.18)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export const GlassCard = React.memo(GlassCardImpl);

export function GlassInputImpl({
  value,
  onChange,
  placeholder,
  type = "text",
  width,
  className,
  min,
  max,
  step,
  disabled,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  width?: number | string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={{ width }}
      className={clsx(
        "scanner-glass-input bg-black/10 border border-white/5 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:bg-black/20 hover:border-white/10 hover:bg-black/20 transition-all duration-200 font-mono tabular-nums",
        className
      )}
    />
  );
}

export const GlassInput = React.memo(GlassInputImpl);

export function SummaryMetricCardImpl({
  label,
  value,
  valueClassName,
  className,
  inline = false,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <GlassCard hoverable={false} className={clsx("p-3", className)}>
      <div
        className={clsx(
          inline
            ? "h-full flex items-center justify-between gap-4"
            : "h-full flex flex-col",
        )}
      >
        <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">{label}</div>
        <div
          className={clsx(
            inline
              ? "flex items-center justify-end text-base md:text-xl font-semibold font-mono text-right"
              : "flex-1 flex items-center justify-center text-sm font-mono text-center",
            valueClassName
          )}
        >
          {value}
        </div>
      </div>
    </GlassCard>
  );
}

export const SummaryMetricCard = React.memo(SummaryMetricCardImpl);

export function GlassSelectImpl({
  value,
  onChange,
  options,
  className,
  compact = false,
  panelOffsetX = 0,
  panelWidth,
  panelAnchorRef,
  onDelete,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<GlassSelectOption | GlassSelectGroup>;
  className?: string;
  compact?: boolean;
  panelOffsetX?: number;
  panelWidth?: number;
  panelAnchorRef?: React.RefObject<HTMLDivElement | null>;
  onDelete?: (value: string) => void;
}) {
  const { theme } = useUi();
  const isLightTheme = theme === "light";
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const [pendingDeleteValue, setPendingDeleteValue] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flatOptions = useMemo(
    () =>
      options.flatMap((opt) =>
        "options" in opt ? opt.options.map((groupOption) => ({ ...groupOption, group: opt.label })) : [{ ...opt, group: null as string | null }]
      ),
    [options]
  );
  const selected = flatOptions.find((opt) => opt.value === value) ?? flatOptions.find((opt) => !opt.disabled) ?? null;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = (panelAnchorRef?.current ?? rootRef.current)?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.innerHeight || 0;
      const roomBelow = viewportHeight - rect.bottom;
      const roomAbove = rect.top;
      const nextOpenUpward = roomBelow < 360 && roomAbove > roomBelow;
      setOpenUpward(nextOpenUpward);
      setPanelStyle({
        position: "fixed",
        left: Math.max(12, rect.left + panelOffsetX),
        width: panelWidth ?? rect.width,
        top: nextOpenUpward ? undefined : Math.min(viewportHeight - 12, rect.bottom + 6),
        bottom: nextOpenUpward ? Math.max(12, viewportHeight - rect.top + 6) : undefined,
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (!rootRef.current?.contains(targetNode) && !panelRef.current?.contains(targetNode)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = panelRef.current?.querySelector<HTMLButtonElement>("[data-selected='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [open, value]);

  useEffect(() => {
    if (!open) setPendingDeleteValue(null);
  }, [open]);

  const emitChange = (nextValue: string) => {
    onChange({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={clsx("relative z-50 font-mono", open && "z-[220] isolate")}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          compact
            ? "relative flex w-full items-center gap-1.5 h-[14px] border-0 bg-transparent px-0 py-0 text-xs font-mono font-normal normal-case tracking-normal leading-none shadow-none transition-colors duration-150"
            : "relative flex w-full items-center gap-2.5 h-9 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
          open
            ? compact
              ? clsx(isLightTheme ? "text-slate-900" : "text-zinc-300", "border-transparent bg-transparent shadow-none")
              : clsx("accent-text", "border-white/10 bg-black/30 shadow-[0_0_15px_-5px_rgba(255,255,255,0.08)]")
            : compact
              ? clsx(
                  isLightTheme ? "text-slate-900 hover:text-slate-900" : "text-zinc-400 hover:text-zinc-200",
                  "border-transparent bg-transparent shadow-none"
                )
              : clsx("accent-text", SCANNER_CONTROL_SURFACE),
          className
        )}
      >
        <span className={clsx("min-w-0 flex-1 truncate text-left", compact ? "leading-none" : "")}>{selected?.label ?? value}</span>
        <span className={clsx("opacity-50 ml-1", compact && "ml-0 flex items-center self-center")}>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className={clsx(
                "z-[9999] overflow-hidden rounded-xl backdrop-blur-xl transition-all duration-200 origin-top",
                isLightTheme
                  ? "border border-slate-900/10 bg-white/95 shadow-[0_10px_32px_-12px_rgba(15,23,42,0.18)]"
                  : "border border-white/[0.08] bg-[#0a0a0a]/90 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]"
              )}
            >
              <div className="max-h-[340px] overflow-y-auto py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {options.map((opt) =>
                  "options" in opt ? (
                    <div key={`group-${opt.label}`} className="px-1.5 py-1">
                      <div className={clsx("px-2.5 pb-1.5 text-[9px] uppercase tracking-[0.18em] font-mono", isLightTheme ? "text-slate-500" : "text-zinc-500")}>
                        {opt.label}
                      </div>
                      <div className="space-y-0.5">
                        {opt.options.map((groupOption) => {
                          const isSelected = groupOption.value === value;
                          return (
                            <button
                              key={groupOption.value}
                              type="button"
                              data-selected={isSelected}
                              disabled={groupOption.disabled}
                              onClick={() => !groupOption.disabled && emitChange(groupOption.value)}
                              className={clsx(
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                                groupOption.disabled
                                  ? (isLightTheme ? "cursor-not-allowed text-slate-400" : "cursor-not-allowed text-zinc-600")
                                  : isSelected
                                    ? (isLightTheme ? "bg-slate-900/10 text-slate-900" : "accent-soft")
                                    : (isLightTheme ? "text-slate-500 hover:bg-slate-900/[0.05] hover:text-slate-900" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200")
                              )}
                              title={groupOption.disabled ? "Unavailable" : groupOption.label}
                            >
                              <span className="min-w-0 flex-1 truncate">{groupOption.label}</span>
                              {isSelected && <span className={clsx("w-1.5 h-1.5 rounded-full", "accent-dot")} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key={opt.value} className="px-1.5 py-0.5">
                      <button
                        type="button"
                        data-selected={opt.value === value}
                        disabled={opt.disabled}
                        onClick={() => {
                          if (pendingDeleteValue === opt.value) { setPendingDeleteValue(null); return; }
                          !opt.disabled && emitChange(opt.value);
                        }}
                        onContextMenu={onDelete ? (e) => { e.preventDefault(); setPendingDeleteValue(opt.value); } : undefined}
                        className={clsx(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider transition-all",
                          opt.disabled
                            ? (isLightTheme ? "cursor-not-allowed text-slate-400" : "cursor-not-allowed text-zinc-600")
                            : opt.value === value
                              ? (isLightTheme ? "bg-slate-900/10 text-slate-900" : "accent-soft")
                              : (isLightTheme ? "text-slate-500 hover:bg-slate-900/[0.05] hover:text-slate-900" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200")
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        {pendingDeleteValue === opt.value && onDelete ? (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(opt.value); setPendingDeleteValue(null); setOpen(false); }}
                            className="ml-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[11px] leading-none text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                            title={`Delete ${opt.label}`}
                          >✕</span>
                        ) : opt.value === value ? (
                          <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", "accent-dot")} />
                        ) : null}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>,
            document.body
          )
        : null}
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-0">
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1L5 5L9 1" />
        </svg>
      </div>
    </div>
  );
}

export const GlassSelect = React.memo(GlassSelectImpl);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-3 h-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M6 8L10 12L14 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MultiSelectFilter = ({
  label,
  options,
  selected,
  setSelected,
  enabled,
  toggleEnabled,
  color = "amber",
  hideArrow = false,
  onMainClick,
  panelWidth,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  enabled: TriMode;
  toggleEnabled: () => void;
  color?: MsColor;
  hideArrow?: boolean;
  onMainClick?: () => void;
  panelWidth?: number;
}) => {
  const { theme } = useUi();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const id = useMemo(() => `msf-scanner-${slug(label)}`, [label]);
  const C = MSF[resolveAccentMsColor(theme, color)];

  const toggleOption = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setSelected(next);
  };

  const recomputePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // At least 220px unless the caller asks for a specific width: option labels (sector names,
    // exchange codes) do not fit the trigger button, which is what the Sonar copy enforced.
    setPos({ left: r.left, top: r.bottom + 8, width: panelWidth ?? Math.max(220, r.width) });
  };

  useEffect(() => {
    if (!open) return;
    recomputePos();

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrap = !!wrapRef.current?.contains(target);
      const menuEl = document.getElementById(id);
      const insideMenu = !!menuEl?.contains(target);
      if (!insideWrap && !insideMenu) setOpen(false);
    };

    const onScroll = () => recomputePos();
    const onResize = () => recomputePos();

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, id]);

  const menu =
    open && pos
      ? createPortal(
          <div
            id={id}
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 999999 }}
            className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-y-auto no-scrollbar"
          >
            <div className="max-h-[340px] overflow-y-auto py-1.5 no-scrollbar">
              {options.map((opt, i) => (
                <button
                  key={opt || `na-${i}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleOption(opt)}
                  className={`text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                    selected.has(opt) ? C.activeItem : C.inactiveItem
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {selected.has(opt) ? (
                      <div className={`w-3 h-3 rounded ${C.boxChecked}`} />
                    ) : (
                      <div className="w-3 h-3 rounded border border-white/20" />
                    )}
                  </div>
                  <span className="truncate">{opt}</span>
                </button>
              ))}
              {options.length === 0 && <div className="text-[10px] text-zinc-600 px-2 py-1 text-center">No options</div>}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="relative flex h-7 items-center bg-black/20 rounded-full border border-white/5" ref={wrapRef}>
        <button
          type="button"
          onClick={toggleEnabled}
          className={clsx(
            "inline-flex h-full items-center px-3 text-[10px] font-mono font-bold uppercase transition-all rounded-l-full",
            enabled === "off" && C.chipInactive,
            enabled === "include" && "bg-yellow-400/90 text-emerald-400 border-transparent shadow-[0_0_10px_rgba(250,204,21,0.3)]",
            enabled === "exclude" && "bg-yellow-400/90 text-red-400 border-transparent shadow-[0_0_10px_rgba(250,204,21,0.3)]",
          )}
        >
          <span>{label}</span>
          {selected.size > 0 && (
            <span
              className={clsx(
                "ml-2 inline-flex min-w-5 items-center justify-center rounded-full border bg-black/25 px-1.5 py-0.5 text-[10px] font-mono leading-none",
                // `accent-text` is the CSS-variable utility that replaced getSonarAccent(); the
                // Sonar copy of this component had already moved and this one had not.
                enabled === "off" && `border-yellow-200/35 accent-text`,
                enabled === "include" && "border-emerald-400/50 text-emerald-400",
                enabled === "exclude" && "border-red-400/50 text-red-400",
              )}
            >
              {selected.size}
            </span>
          )}
        </button>

        <div className={`w-px h-4 ${C.divider}`} />

        <button
          type="button"
          onClick={() => {
            onMainClick?.();
            if (!hideArrow) setOpen((v) => !v);
          }}
          className={`inline-flex h-full min-w-[28px] items-center justify-center px-2 transition-all rounded-r-full ${C.arrow}`}
        >
          <ChevronIcon open={open} />
        </button>
      </div>

      {menu}
    </>
  );
};

/**
 * One min/max card, shared by the Scanners AND the Sonars.
 *
 * The Sonars used to carry their own copy of this card. It drifted: the copy used raw inputs with
 * `tabular-nums` while this one uses GlassInput without it, and it never gained the zero-coverage
 * state. Same control, two implementations, guaranteed to diverge again — so there is one now.
 *
 * Generic over the filter key because the two surfaces key their range modes differently (the
 * Sonar by `RangeBoundKey` like "ADV20", the Scanner by `SharedRangeFilterKey` like "adv20").
 * Typing it as `string` would have let a Sonar key reach a Scanner toggler unnoticed.
 */
export function MinMaxRowImpl<K extends string = SharedRangeFilterKey>({
  label,
  filterKey,
  minValue,
  maxValue,
  setMin,
  setMax,
  mode = "on",
  onToggleMode,
  card = false,
  clearable = false,
  placeholderMin = "min",
  placeholderMax = "max",
  zeroCoverage = false,
  onStartEditing,
  onStopEditing,
}: {
  label: string;
  filterKey?: K;
  minValue: string;
  maxValue: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  mode?: SharedRangeFilterMode;
  onToggleMode?: (key: K) => void;
  card?: boolean;
  clearable?: boolean;
  placeholderMin?: string;
  placeholderMax?: string;
  zeroCoverage?: boolean;
  /**
   * Live surfaces pass these to pause the incoming stream while a box has focus. Without it the
   * Sonar re-sorts under the cursor mid-edit, which is why its copy of this card had them.
   */
  onStartEditing?: () => void;
  onStopEditing?: () => void;
}) {
  const hasValue = Boolean((minValue ?? "").trim() || (maxValue ?? "").trim());
  const isOff = mode === "off";

  if (card) {
    return (
      <div
        onFocusCapture={onStartEditing}
        onBlurCapture={(e) => {
          if (!onStopEditing) return;
          const next = e.relatedTarget as Node | null;
          // Moving between the two inputs of the same card is not the end of editing.
          if (next && e.currentTarget.contains(next)) return;
          onStopEditing();
        }}
        className={clsx(
          "group flex flex-col gap-1 rounded-xl border p-2 transition-all",
          hasValue
            ? isOff
              ? "border-rose-500/30 bg-rose-500/[0.05]"
              : zeroCoverage
                ? "border-yellow-200/35 bg-yellow-200/[0.06]"
              : "border-[#6ee7b7]/30 bg-[#6ee7b7]/[0.05]"
            : "border-white/5 bg-[#0a0a0a]/40 hover:border-white/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className={clsx("mr-1 truncate text-[10px] font-mono uppercase tracking-widest", zeroCoverage && hasValue && !isOff ? "text-yellow-200" : "text-zinc-500")}>{label}</div>
          <div className="flex items-center gap-2">
            {zeroCoverage && hasValue && !isOff && (
              <span className="text-[10px] font-mono uppercase text-yellow-200/90" title="Current rows have 0% coverage for this field">
                0%
              </span>
            )}
            {clearable && filterKey && hasValue && onToggleMode && (
              <button
                type="button"
                onClick={() => onToggleMode(filterKey)}
                className={clsx(
                  "text-[10px] font-mono transition-colors uppercase",
                  isOff ? "text-rose-300 hover:text-rose-200" : "text-[#6ee7b7] hover:text-[#a7f3d0]"
                )}
                title={isOff ? "Stored but ignored in requests" : "Applied to requests"}
              >
                {isOff ? "OFF" : "ON"}
              </button>
            )}
            {clearable && hasValue && (
              <button
                type="button"
                onClick={() => {
                  setMin("");
                  setMax("");
                }}
                className="text-[10px] font-mono text-rose-400 hover:text-rose-300 transition-colors"
              >
                CLR
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <GlassInput
            value={minValue}
            onChange={(e) => setMin(e.target.value)}
            placeholder={placeholderMin}
            className="!h-auto w-full !rounded !border-0 hover:!border-0 focus:!border-0 focus-visible:!border-0 !ring-0 focus:!ring-0 focus-visible:!ring-0 !shadow-none !outline-none !bg-black/20 !px-1.5 !py-1 !text-center !text-[11px] !font-mono !text-zinc-200"
          />
          <GlassInput
            value={maxValue}
            onChange={(e) => setMax(e.target.value)}
            placeholder={placeholderMax}
            className="!h-auto w-full !rounded !border-0 hover:!border-0 focus:!border-0 focus-visible:!border-0 !ring-0 focus:!ring-0 focus-visible:!ring-0 !shadow-none !outline-none !bg-black/20 !px-1.5 !py-1 !text-center !text-[11px] !font-mono !text-zinc-200"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">{label}</div>
      <div className="flex gap-2">
        <GlassInput value={minValue} onChange={(e) => setMin(e.target.value)} placeholder={placeholderMin} className="w-full" />
        <GlassInput value={maxValue} onChange={(e) => setMax(e.target.value)} placeholder={placeholderMax} className="w-full" />
      </div>
    </div>
  );
}

// `as typeof` keeps the generic through memo, which otherwise widens it away.
export const MinMaxRow = React.memo(MinMaxRowImpl) as typeof MinMaxRowImpl;

export function SegmentedImpl({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  className?: string;
}) {
  const activeClass = "accent-soft";
  return (
    <div className={clsx("inline-flex rounded-xl p-1", SCANNER_PANEL_SURFACE, className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={clsx(
              "px-3 py-1.5 text-[10px] font-mono font-bold uppercase rounded-lg tracking-wide transition-all border",
              on ? activeClass : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-black/30"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const Segmented = React.memo(SegmentedImpl);

export function SideBadgeImpl({ side }: { side: TapeArbSide }) {
  const s = normalizeSide(side);
  const isLong = s.isLong === true;
  const isShort = s.isLong === false;
  const colorClass = isLong
    ? "bg-[#6ee7b7]/10 text-[#6ee7b7] border-[#6ee7b7]/20"
    : isShort
      ? "border-[rgba(243,166,178,0.22)] bg-[rgba(243,166,178,0.10)] text-[#f3a6b2]"
      : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50";

  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap",
        colorClass
      )}
    >
      {s.label}
    </span>
  );
}

export const SideBadge = React.memo(SideBadgeImpl);

export function EyeToggleIcon({ closed, className }: { closed: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {closed ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </>
      )}
    </svg>
  );
}

export function LockToggleIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {open ? (
        <>
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      )}
    </svg>
  );
}

/**
 * Depth-of-book: five stacked levels, the top one short. Deliberately not another crosshair — the
 * crosshair means "grab that window", this means "read its book", and they are now separate acts.
 */
export function BookLevelsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="14" y2="6" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="17" y2="14" />
      <line x1="4" y1="18" x2="11" y2="18" />
    </svg>
  );
}

export function CrosshairIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  );
}

export function ScopeResearchInsufficientState({
  message,
  detail = "Widen range, lower `Min N`, or reduce `Bins`.",
}: {
  message: string;
  detail?: string;
}) {
  return (
    <div className="w-full h-[520px] rounded-xl border border-white/[0.07] bg-[#0a0a0a]/40 p-5 flex items-center justify-center">
      <div className="max-w-[420px] text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-zinc-400">{message}</div>
        <div className="mt-2 text-[11px] font-mono text-zinc-500">{detail}</div>
      </div>
    </div>
  );
}

export function renderScopeChartTooltip(tooltip: ScopeChartTooltipData | null) {
  if (!tooltip) return null;
  const accentClass =
    tooltip.accent === "amber"
      ? "border-amber-400/25 shadow-[0_10px_30px_rgba(245,158,11,0.12)]"
      : tooltip.accent === "cyan"
        ? "border-cyan-400/25 shadow-[0_10px_30px_rgba(34,211,238,0.12)]"
        : tooltip.accent === "fuchsia"
          ? "border-fuchsia-400/25 shadow-[0_10px_30px_rgba(217,70,239,0.12)]"
          : "border-emerald-400/25 shadow-[0_10px_30px_rgba(16,185,129,0.12)]";
  return (
    <div
      className={clsx(
        "pointer-events-none absolute z-20 min-w-[160px] max-w-[280px] rounded-xl border bg-[#06080d]/96 px-3 py-2 backdrop-blur-xl",
        accentClass
      )}
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: "translate(-50%, -110%)",
      }}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-300">{tooltip.title}</div>
      <div className="mt-1 space-y-0.5">
        {tooltip.lines.map((line, index) => (
          <div key={`${tooltip.title}-${index}`} className="text-[11px] font-mono text-zinc-400 whitespace-nowrap">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
