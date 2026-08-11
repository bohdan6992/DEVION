export type ScannerAccent = {
  selection: string;
  dot: string;
  activeButton: string;
  activeText: string;
  activeBorder: string;
  activeSoft: string;
  buttonBorder: string;
  outlineButton: string;
};

export function getScannerAccent(theme?: string | null): ScannerAccent {
  switch (theme) {
    case "light":
      return {
        selection: "selection:bg-violet-400/30",
        dot: "bg-violet-600",
        activeButton: "border border-violet-400/55 text-violet-900 shadow-[0_0_12px_rgba(139,92,246,0.12)] bg-violet-200/55",
        activeText: "text-violet-900",
        activeBorder: "border-violet-400/28 bg-violet-200/30",
        activeSoft: "bg-violet-200/55 text-violet-900 border-violet-400/30 shadow-[0_0_10px_-3px_rgba(139,92,246,0.12)]",
        buttonBorder: "border-violet-400/30",
        outlineButton: "border-violet-300/55 text-violet-900 hover:bg-violet-200/40 shadow-[0_0_10px_rgba(139,92,246,0.06)]",
      };
    case "sparkle":
      return {
        selection: "selection:bg-yellow-200/35",
        dot: "bg-yellow-200",
        activeButton: "border border-yellow-200/70 text-yellow-200 shadow-[0_0_12px_rgba(254,240,138,0.18)] bg-yellow-200/8",
        activeText: "text-yellow-200",
        activeBorder: "border-yellow-200/28 bg-yellow-200/[0.05]",
        activeSoft: "bg-yellow-200/10 text-yellow-200 border-yellow-200/25 shadow-[0_0_10px_-3px_rgba(254,240,138,0.16)]",
        buttonBorder: "border-yellow-200/18",
        outlineButton: "border-yellow-200/35 text-yellow-200 hover:bg-yellow-200/10 shadow-[0_0_10px_rgba(254,240,138,0.08)]",
      };
    case "inferno":
      return {
        selection: "selection:bg-orange-300/35",
        dot: "bg-orange-300",
        activeButton: "border border-orange-300/80 text-orange-100 shadow-[0_0_16px_rgba(249,115,22,0.26)] bg-red-500/12",
        activeText: "text-orange-100",
        activeBorder: "border-orange-300/35 bg-red-500/[0.08]",
        activeSoft: "bg-red-500/14 text-orange-100 border-orange-300/35 shadow-[0_0_14px_-3px_rgba(249,115,22,0.22)]",
        buttonBorder: "border-orange-300/26",
        outlineButton: "border-orange-300/55 text-orange-100 hover:bg-red-500/14 shadow-[0_0_14px_rgba(249,115,22,0.14)]",
      };
    case "asher":
    case "rain":
      return {
        selection: "selection:bg-yellow-600/25",
        dot: "bg-[#c2b465]",
        activeButton: "border border-[#c2b465]/45 text-[#c2b465] shadow-[0_0_10px_rgba(194,180,101,0.18)] bg-[#c2b465]/10",
        activeText: "text-[#c2b465]",
        activeBorder: "border-[#c2b465]/25 bg-[#c2b465]/[0.05]",
        activeSoft: "bg-[#c2b465]/10 text-[#c2b465] border-[#c2b465]/20 shadow-[0_0_10px_-3px_rgba(194,180,101,0.16)]",
        buttonBorder: "border-[#c2b465]/18",
        outlineButton: "border-[#c2b465]/30 text-[#c2b465] hover:bg-[#c2b465]/10 shadow-[0_0_10px_rgba(194,180,101,0.10)]",
      };
    case "neon":
      return {
        selection: "selection:bg-fuchsia-500/30",
        dot: "bg-fuchsia-500",
        activeButton: "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.3)] bg-fuchsia-500/10",
        activeText: "text-fuchsia-300",
        activeBorder: "border-fuchsia-500/30 bg-fuchsia-500/[0.05]",
        activeSoft: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20 shadow-[0_0_10px_-3px_rgba(217,70,239,0.2)]",
        buttonBorder: "border-fuchsia-500/20",
        outlineButton: "border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10 shadow-[0_0_10px_rgba(217,70,239,0.1)]",
      };
    case "space":
      return {
        selection: "selection:bg-sky-500/30",
        dot: "bg-sky-400",
        activeButton: "border border-sky-400 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.3)] bg-sky-400/10",
        activeText: "text-sky-200",
        activeBorder: "border-sky-400/30 bg-sky-400/[0.05]",
        activeSoft: "bg-sky-400/10 text-sky-200 border-sky-400/20 shadow-[0_0_10px_-3px_rgba(56,189,248,0.2)]",
        buttonBorder: "border-sky-400/20",
        outlineButton: "border-sky-400/50 text-sky-300 hover:bg-sky-400/10 shadow-[0_0_10px_rgba(56,189,248,0.1)]",
      };
    case "magma":
      return {
        selection: "selection:bg-rose-500/30",
        dot: "bg-rose-400",
        activeButton: "border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(255,82,72,0.32)] bg-rose-500/10",
        activeText: "text-rose-200",
        activeBorder: "border-rose-400/30 bg-rose-500/[0.06]",
        activeSoft: "bg-rose-500/10 text-rose-200 border-rose-400/25 shadow-[0_0_10px_-3px_rgba(255,82,72,0.22)]",
        buttonBorder: "border-rose-400/22",
        outlineButton: "border-rose-400/50 text-rose-200 hover:bg-rose-500/10 shadow-[0_0_12px_rgba(255,82,72,0.12)]",
      };
    case "mercury":
      return {
        selection: "selection:bg-slate-200/25",
        dot: "bg-slate-200",
        activeButton: "border border-slate-200/65 text-slate-100 shadow-[0_0_12px_rgba(212,216,228,0.28)] bg-slate-200/12",
        activeText: "text-slate-100",
        activeBorder: "border-slate-200/30 bg-slate-200/[0.06]",
        activeSoft: "bg-slate-200/12 text-slate-100 border-slate-200/24 shadow-[0_0_10px_-3px_rgba(212,216,228,0.22)]",
        buttonBorder: "border-slate-200/22",
        outlineButton: "border-slate-200/50 text-slate-100 hover:bg-slate-200/12 shadow-[0_0_10px_rgba(212,216,228,0.12)]",
      };
    case "oceanic":
      return {
        selection: "accent-selection",
        dot: "accent-dot",
        activeButton: "accent-soft",
        activeText: "accent-text",
        activeBorder: "accent-panel-soft",
        activeSoft: "accent-soft",
        buttonBorder: "border-cyan-500/20",
        outlineButton: "accent-outline",
      };
    case "khaki":
      return {
        selection: "accent-selection",
        dot: "accent-dot",
        activeButton: "accent-soft",
        activeText: "accent-text",
        activeBorder: "accent-panel-soft",
        activeSoft: "accent-soft",
        buttonBorder: "border-[#8a9a52]/20",
        outlineButton: "accent-outline",
      };
    case "zebra":
      return {
        selection: "selection:bg-zinc-900/20",
        dot: "bg-zinc-900",
        activeButton: "border border-zinc-900/30 text-zinc-900 bg-zinc-900/8 shadow-none",
        activeText: "text-zinc-900",
        activeBorder: "border-zinc-900/15 bg-zinc-900/[0.04]",
        activeSoft: "bg-zinc-900/8 text-zinc-900 border-zinc-900/20 shadow-none",
        buttonBorder: "border-zinc-900/18",
        outlineButton: "border-zinc-900/30 text-zinc-900 hover:bg-zinc-900/8 shadow-none",
      };
    case "flamingo":
      return {
        selection: "accent-selection",
        dot: "accent-dot",
        activeButton: "accent-soft",
        activeText: "accent-text",
        activeBorder: "accent-panel-soft",
        activeSoft: "accent-soft",
        buttonBorder: "border-rose-400/22",
        outlineButton: "accent-outline",
      };
    case "money":
      return {
        selection: "accent-selection",
        dot: "accent-dot",
        activeButton: "accent-soft",
        activeText: "accent-text",
        activeBorder: "accent-panel-soft",
        activeSoft: "accent-soft",
        buttonBorder: "border-yellow-500/22",
        outlineButton: "accent-outline",
      };
    case "matrix":
      return {
        selection: "accent-selection",
        dot: "accent-dot",
        activeButton: "accent-soft",
        activeText: "accent-text",
        activeBorder: "accent-panel-soft",
        activeSoft: "accent-soft",
        buttonBorder: "border-[#34a863]/22",
        outlineButton: "accent-outline",
      };
    default:
      return {
        selection: "selection:bg-zinc-200/24",
        dot: "bg-zinc-300",
        activeButton: "border border-zinc-300 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.18)] bg-zinc-200/10",
        activeText: "text-zinc-200",
        activeBorder: "border-zinc-300/30 bg-zinc-200/[0.05]",
        activeSoft: "bg-zinc-200/10 text-zinc-200 border-zinc-300/20 shadow-[0_0_10px_-3px_rgba(212,212,216,0.12)]",
        buttonBorder: "border-zinc-300/20",
        outlineButton: "border-zinc-300/50 text-zinc-200 hover:bg-zinc-200/10 shadow-[0_0_10px_rgba(212,212,216,0.08)]",
      };
  }
}

export function getScannerHeaderButtonActiveClass(theme?: string | null): string {
  if (theme === "sparkle") return "border border-yellow-200/70 text-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.2)] bg-yellow-200/10";
  if (theme === "inferno") return "border border-orange-300/80 text-orange-100 shadow-[0_0_14px_rgba(249,115,22,0.26)] bg-red-500/14";
  if (theme === "asher") return "border border-zinc-300/45 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.12)] bg-zinc-200/10";
  if (theme === "rain") return "border border-[#c2b465]/45 text-[#c2b465] shadow-[0_0_10px_rgba(194,180,101,0.18)] bg-[#c2b465]/10";
  if (theme === "light") return "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.28)] bg-fuchsia-500/10";
  if (theme === "neon") return "border border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.28)] bg-fuchsia-500/10";
  if (theme === "space") return "border border-sky-500 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.28)] bg-sky-500/10";
  if (theme === "magma") return "border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(255,82,72,0.28)] bg-rose-500/10";
  if (theme === "mercury") return "border border-slate-200/55 text-slate-100 shadow-[0_0_12px_rgba(212,216,228,0.24)] bg-slate-200/12";
  if (theme === "oceanic") return "accent-soft";
  return "border border-zinc-300 text-zinc-200 shadow-[0_0_10px_rgba(212,212,216,0.18)] bg-zinc-200/10";
}

export const slug = (s: string) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

export type MsColor = "amber" | "emerald" | "rose" | "cyan" | "fuchsia" | "zinc";

export const getSonarPrimaryMsColor = (theme?: string | null): MsColor => {
  if (theme === "sparkle") return "amber";
  if (theme === "asher") return "zinc";
  if (theme === "rain") return "amber";
  if (theme === "inferno") return "amber";
  if (theme === "light") return "fuchsia";
  if (theme === "neon") return "fuchsia";
  if (theme === "space") return "cyan";
  if (theme === "magma") return "rose";
  if (theme === "mercury") return "zinc";
  if (theme === "oceanic") return "cyan";
  if (theme === "khaki") return "amber";
  if (theme === "zebra") return "zinc";
  if (theme === "flamingo") return "rose";
  if (theme === "money") return "amber";
  if (theme === "matrix") return "emerald";
  return "emerald";
};

export const resolveAccentMsColor = (theme: string | null | undefined, color: MsColor): MsColor =>
  color === "emerald" ? getSonarPrimaryMsColor(theme) : color;

export const MSF = {
  amber: {
    activeItem: "bg-yellow-300/20 text-yellow-100",
    inactiveItem: "text-yellow-200/80 hover:bg-yellow-200/10 hover:text-yellow-100",
    chipActive: "bg-yellow-300 text-[#221400] border-transparent shadow-[0_0_16px_rgba(253,224,71,0.38)]",
    chipInactive: "text-yellow-200 border-yellow-200/0 hover:bg-yellow-200/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-yellow-200/30",
    boxChecked: "bg-yellow-300 border-transparent",
  },
  zinc: {
    activeItem: "bg-zinc-200/16 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-zinc-200 text-[#111111] border-transparent shadow-[0_0_16px_rgba(212,212,216,0.24)]",
    chipInactive: "text-zinc-200 border-zinc-200/0 hover:bg-zinc-200/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-zinc-200/20",
    boxChecked: "bg-zinc-200 border-transparent",
  },
  emerald: {
    activeItem: "bg-emerald-500/20 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-emerald-500 text-white border-transparent shadow-[0_0_16px_rgba(16,185,129,0.36)]",
    chipInactive: "text-emerald-500 border-emerald-500/0 hover:bg-emerald-500/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-emerald-500/20",
    boxChecked: "bg-emerald-500 border-transparent",
  },
  rose: {
    activeItem: "bg-rose-500/20 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-rose-500 text-white border-transparent shadow-[0_0_16px_rgba(244,63,94,0.42)]",
    chipInactive: "text-rose-500 border-rose-500/0 hover:bg-rose-500/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-rose-500/20",
    boxChecked: "bg-rose-500 border-transparent",
  },
  cyan: {
    activeItem: "bg-sky-500/15 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-sky-400 text-white border-transparent shadow-[0_0_16px_rgba(56,189,248,0.34)]",
    chipInactive: "text-sky-300 border-sky-400/0 hover:bg-sky-400/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-sky-400/20",
    boxChecked: "bg-sky-400 border-transparent",
  },
  fuchsia: {
    activeItem: "bg-fuchsia-500/15 text-white",
    inactiveItem: "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
    chipActive: "bg-fuchsia-400 text-white border-transparent shadow-[0_0_16px_rgba(232,121,249,0.34)]",
    chipInactive: "text-fuchsia-300 border-fuchsia-400/0 hover:bg-fuchsia-400/10",
    arrow: "text-zinc-500 hover:text-zinc-300",
    divider: "bg-fuchsia-400/20",
    boxChecked: "bg-fuchsia-400 border-transparent",
  },
} as const;

export const getSonarAccent = (theme?: string | null) => {
  if (theme === "inferno") {
    return { text: "text-orange-100" };
  }
  const primary = getSonarPrimaryMsColor(theme);
  if (primary === "amber") return { text: "text-yellow-200" };
  if (primary === "zinc") return { text: "text-zinc-200" };
  if (primary === "fuchsia") return { text: "text-fuchsia-300" };
  if (primary === "cyan") return { text: "text-sky-300" };
  return { text: "text-zinc-200" };
};
