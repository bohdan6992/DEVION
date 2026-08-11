import React from "react";

/**
 * Global CSS shared verbatim by every scanner shell.
 *
 * Two separate elements because they sit at different points in the tree:
 * {@link ScannerTableStyles} is a styled-jsx global block inside the content
 * wrapper, {@link ScannerThemeStyles} is a plain style element outside it.
 */
export function ScannerTableStyles() {
  return (
    <style jsx global>{`
      .analytics-trades-table th,
      .analytics-trades-table td {
        padding: 4px 7px !important;
      }
      input.center-spin[type="number"] {
        -moz-appearance: textfield;
      }
      input.center-spin[type="number"]::-webkit-outer-spin-button,
      input.center-spin[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    `}</style>
  );
}

export function ScannerThemeStyles() {
  return (
    <style>{`
      .scanner-borderless .scanner-header-surface,
      .scanner-borderless .scanner-glass-card,
      .scanner-borderless .scanner-panel-surface,
      .scanner-borderless .scanner-control-surface,
      .scanner-borderless .scanner-eye-button {
        border-color: transparent !important;
      }
  
      .scanner-borderless .border-white\\/5,
      .scanner-borderless .border-white\\/10,
      .scanner-borderless .border-white\\/\\[0\\.04\\],
      .scanner-borderless .border-white\\/\\[0\\.06\\],
      .scanner-borderless .border-white\\/\\[0\\.07\\],
      .scanner-borderless .border-white\\/\\[0\\.08\\],
      .scanner-borderless .border-white\\/\\[0\\.12\\] {
        border-color: transparent !important;
      }
  
      .scanner-light-theme {
        color: #111827;
        color-scheme: light;
      }
  
      .scanner-light-theme .scanner-header-surface,
      .scanner-light-theme .scanner-glass-card,
      .scanner-light-theme .scanner-panel-surface,
      .scanner-light-theme .scanner-eye-button,
      .scanner-light-theme .scanner-control-surface,
      .scanner-light-theme .scanner-glass-input {
        background: rgba(255, 255, 255, 0.28) !important;
        border-color: rgba(15, 23, 42, 0.1) !important;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05) !important;
      }
  
      .scanner-light-theme button,
      .scanner-light-theme input,
      .scanner-light-theme select,
      .scanner-light-theme textarea {
        color: #111827;
      }
  
      .scanner-light-theme .bg-black\\/20,
      .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/40,
      .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/30,
      .scanner-light-theme .bg-\\[\\#0a0a0a\\]\\/60,
      .scanner-light-theme .bg-\\[\\#05070b\\]\\/95,
      .scanner-light-theme .bg-\\[\\#06070c\\]\\/90,
      .scanner-light-theme .bg-\\[\\#070707\\]\\/95,
      .scanner-light-theme .bg-\\[\\#070910\\]\\/95,
      .scanner-light-theme .bg-\\[\\#090b10\\],
      .scanner-light-theme .bg-\\[\\#090a0f\\]\\/90,
      .scanner-light-theme .bg-\\[\\#111111\\]\\/95,
      .scanner-light-theme .bg-\\[\\#05070b\\]\\/95,
      .scanner-light-theme .bg-white\\/5,
      .scanner-light-theme .bg-white\\/10,
      .scanner-light-theme .bg-white\\/\\[0\\.03\\],
      .scanner-light-theme .bg-white\\/\\[0\\.04\\] {
        background-color: rgba(255, 255, 255, 0.38) !important;
      }
  
      .scanner-light-theme [class*="bg-[linear-gradient"] {
        background: rgba(255, 255, 255, 0.38) !important;
        background-image: none !important;
      }
  
      .scanner-light-theme .border-white\\/5,
      .scanner-light-theme .border-white\\/10,
      .scanner-light-theme .border-white\\/\\[0\\.04\\],
      .scanner-light-theme .border-white\\/\\[0\\.06\\],
      .scanner-light-theme .border-white\\/\\[0\\.08\\],
      .scanner-light-theme .border-white\\/\\[0\\.12\\] {
        border-color: rgba(15, 23, 42, 0.1) !important;
      }
  
      .scanner-light-theme .scanner-glass-input {
        color: #111827 !important;
      }
  
      .scanner-light-theme .scanner-glass-input::placeholder {
        color: rgba(17, 24, 39, 0.42) !important;
      }
  
      .scanner-light-theme .text-white,
      .scanner-light-theme .text-zinc-50,
      .scanner-light-theme .text-zinc-100,
      .scanner-light-theme .text-zinc-200,
      .scanner-light-theme .text-zinc-300,
      .scanner-light-theme .text-zinc-400 {
        color: #111827 !important;
      }
  
      .scanner-light-theme .text-zinc-500,
      .scanner-light-theme .text-zinc-600,
      .scanner-light-theme .text-zinc-700 {
        color: rgba(17, 24, 39, 0.64) !important;
      }
  
      .scanner-light-theme svg text,
      .scanner-light-theme .fill-zinc-200,
      .scanner-light-theme .fill-zinc-300,
      .scanner-light-theme .fill-zinc-400,
      .scanner-light-theme .fill-zinc-500,
      .scanner-light-theme .fill-zinc-600,
      .scanner-light-theme .text-\\[9px\\].uppercase.tracking-\\[0\\.18em\\].font-mono.text-zinc-500,
      .scanner-light-theme .text-\\[10px\\].uppercase.tracking-widest.font-mono.text-zinc-500,
      .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-500,
      .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-600,
      .scanner-light-theme .text-xs.font-mono.text-zinc-500,
      .scanner-light-theme .text-zinc-400.font-normal,
      .scanner-light-theme .text-zinc-500.font-normal {
        color: #111827 !important;
        fill: #111827 !important;
      }
  
      .scanner-light-theme .hover\\:text-white:hover,
      .scanner-light-theme .hover\\:text-zinc-200:hover,
      .scanner-light-theme .hover\\:text-zinc-300:hover,
      .scanner-light-theme .hover\\:text-violet-200:hover,
      .scanner-light-theme .hover\\:text-rose-400:hover {
        color: #111827 !important;
      }
  
      .scanner-light-theme .text-violet-300,
      .scanner-light-theme .text-violet-400,
      .scanner-light-theme .text-violet-500,
      .scanner-light-theme .text-violet-600 {
        color: #4c1d95 !important;
      }
  
      .scanner-light-theme .fill-zinc-400,
      .scanner-light-theme .fill-zinc-500,
      .scanner-light-theme .fill-zinc-600 {
        fill: rgba(17, 24, 39, 0.7) !important;
      }
  
      .scanner-light-theme svg rect[fill="rgba(8,15,26,0.36)"],
      .scanner-light-theme svg rect[fill="rgba(8,15,26,0.28)"] {
        fill: rgba(255, 255, 255, 0.28) !important;
      }
  
      .scanner-light-theme svg line[stroke="rgba(255,255,255,0.06)"],
      .scanner-light-theme svg line[stroke="rgba(255,255,255,0.12)"],
      .scanner-light-theme svg line[stroke="rgba(255,255,255,0.14)"],
      .scanner-light-theme svg line[stroke="rgba(255,255,255,0.18)"] {
        stroke: rgba(15, 23, 42, 0.12) !important;
      }
  
      .scanner-light-theme svg text.fill-zinc-500,
      .scanner-light-theme svg text.fill-zinc-400,
      .scanner-light-theme svg text.fill-zinc-600 {
        fill: rgba(17, 24, 39, 0.64) !important;
      }
  
      .scanner-light-theme table thead.bg-\\[\\#111111\\]\\/95,
      .scanner-light-theme table thead.bg-\\[\\#090a0f\\]\\/90,
      .scanner-light-theme .text-xs.font-mono.text-zinc-500.bg-\\[\\#070707\\]\\/95,
      .scanner-light-theme .dark-pro-table,
      .scanner-light-theme [title="dark pro table"] {
        background: rgba(255, 255, 255, 0.38) !important;
        color: #111827 !important;
      }
  
      .scanner-light-theme .text-\\[10px\\].font-mono.text-zinc-600 {
        color: rgba(17, 24, 39, 0.52) !important;
      }
  
      .scanner-light-theme table,
      .scanner-light-theme thead,
      .scanner-light-theme tbody,
      .scanner-light-theme tr,
      .scanner-light-theme th,
      .scanner-light-theme td {
        color: #111827;
      }
  
      .scanner-light-theme .stroke-white\\/10,
      .scanner-light-theme .stroke-white\\/\\[0\\.06\\],
      .scanner-light-theme .stroke-white\\/\\[0\\.08\\] {
        stroke: rgba(15, 23, 42, 0.14) !important;
      }
  
      .scanner-light-theme .text-emerald-300,
      .scanner-light-theme .text-emerald-400 {
        color: #047857 !important;
      }
  
      .scanner-light-theme .text-rose-300,
      .scanner-light-theme .text-rose-400 {
        color: #be123c !important;
      }
  
      .scanner-light-theme .bg-violet-300\\/10,
      .scanner-light-theme .bg-violet-300\\/8,
      .scanner-light-theme .bg-violet-200\\/10 {
        background-color: rgba(221, 214, 254, 0.55) !important;
      }
  
      .scanner-light-theme .hover\\:bg-black\\/30:hover,
      .scanner-light-theme .hover\\:bg-black\\/20:hover,
      .scanner-light-theme .hover\\:bg-white\\/5:hover,
      .scanner-light-theme .hover\\:bg-white\\/10:hover,
      .scanner-light-theme .hover\\:bg-white\\/\\[0\\.03\\]:hover,
      .scanner-light-theme .hover\\:bg-white\\/\\[0\\.04\\]:hover,
      .scanner-light-theme .hover\\:bg-white\\/\\[0\\.05\\]:hover {
        background-color: rgba(255, 255, 255, 0.5) !important;
      }
    `}</style>
  );
}
