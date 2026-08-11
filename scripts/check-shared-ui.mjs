#!/usr/bin/env node
/**
 * Guards the shared toolbar/header components against re-forking.
 *
 * Sonar, Scanner and Stream render the same filter toolbar, the same min/max grid and the same
 * header. Every one of those started as a copy-paste, and every copy silently drifted: two
 * different active-pill styles for the same buttons, a min/max card that lost the zero-coverage
 * state on one surface, a MultiSelectFilter still calling a theme helper the others had dropped.
 * None of it was visible until someone compared two screenshots.
 *
 * The failure mode that matters is not "the code is duplicated" — it is "a filter was added to
 * three surfaces and forgotten on the fourth", which looks like a filter that silently passes
 * everything. So this checks the seams, not the style.
 *
 * Run: npm run check:ui   (also wired into `npm run lint`)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

/** The four toolbar surfaces. */
const SURFACES = [
  "components/sonar/ArbitrageSonar.tsx",
  "components/sonar/OpenDoorSonar.tsx",
  "components/scanner/ArbitrageScanner.tsx",
  "components/scanner/OpenDoorScanner.tsx",
];

const STREAMS = ["components/stream/ArbitrageStreamView.tsx", "components/stream/OpenDoorStream.tsx"];

/**
 * Components a surface must IMPORT, never declare. Re-declaring one is how every past divergence
 * began, and the copy always looks harmless on the day it is made.
 */
const OWNED_COMPONENTS = {
  FilterFlagsRow: "components/shared/filters/FilterFlagsRow.tsx",
  FilterRatingRow: "components/shared/filters/FilterRatingRow.tsx",
  ActiveTickerCard: "components/shared/filters/ActiveTickerCard.tsx",
  ScannerHeader: "components/scanner/shell/panels/ScannerHeader.tsx",
  MinMaxRow: "components/scanner/shared/ui.tsx",
  MultiSelectFilter: "components/scanner/shared/ui.tsx",
  MinMax: "components/scanner/shared/ui.tsx",
};

/**
 * Class strings that must come from the shared style module. A literal copy is a divergence
 * waiting to happen — the Scanner's ZAP group sat two shades darker than the Sonar's for exactly
 * this reason. Keyed by the constant that should be used instead.
 */
const OWNED_CLASS_STRINGS = [
  {
    constant: "TOOLBAR_BUTTON_BASE",
    text: "inline-flex h-7 items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase leading-none transition-all border",
  },
  { constant: "FILTER_GROUP_BASE", text: "inline-flex items-center gap-2 rounded-xl border p-1.5" },
  {
    constant: "FILTER_PILL",
    text: "inline-flex h-7 items-center justify-center rounded-lg border px-3 py-0 text-[10px] font-mono font-bold uppercase leading-none transition-all",
  },
  { constant: "FILTER_GROUP_TONES.zap.group", text: "border-violet-500/30 bg-violet-500/10" },
];

/** Files allowed to contain those literals — the definitions themselves. */
const STYLE_SOURCES = ["components/shared/filters/styles.ts"];

/**
 * Controls still duplicated, with the number of definitions that exist today. The check fails when
 * a count GROWS, so known debt does not block work but new forks do. Lower a number here when you
 * unify one; never raise one.
 */
const DUPLICATION_RATCHET = {
  GlassSelect: 3,
  SingleSelectFilter: 2,
  FilterButton: 2,
};

const SEARCHED_FOR_DUPES = [
  ...SURFACES,
  "components/scanner/shared/ui.tsx",
  "components/scanner/shell/panels/ScannerHeader.tsx",
];

const errors = [];
const notes = [];

function declaresComponent(source, name) {
  const patterns = [
    new RegExp(`^\\s*(export\\s+)?const\\s+${name}\\s*[:=]`, "m"),
    new RegExp(`^\\s*(export\\s+)?function\\s+${name}\\s*[<(]`, "m"),
  ];
  return patterns.some((re) => re.test(source));
}

// ---- 1. No surface re-declares a shared component -------------------------------------------
for (const file of [...SURFACES, ...STREAMS]) {
  if (!existsSync(join(ROOT, file))) continue;
  const source = read(file);
  for (const [name, home] of Object.entries(OWNED_COMPONENTS)) {
    if (declaresComponent(source, name)) {
      errors.push(`${file}: declares \`${name}\`, which is owned by ${home}. Import it instead.`);
    }
  }
}

// ---- 2. Every toolbar surface actually uses the shared row -----------------------------------
for (const file of SURFACES) {
  const source = read(file);
  if (!/from\s+["'][^"']*shared\/filters\/FilterFlagsRow["']/.test(source)) {
    errors.push(`${file}: does not import FilterFlagsRow. The filter row must not be hand-rolled.`);
  }
}

// ---- 3. Shared class strings are not copied out ----------------------------------------------
const CLASS_SCAN = [...SURFACES, ...STREAMS, "components/scanner/shared/ui.tsx"];
for (const file of CLASS_SCAN) {
  if (!existsSync(join(ROOT, file))) continue;
  if (STYLE_SOURCES.includes(file)) continue;
  const source = read(file);
  for (const { constant, text } of OWNED_CLASS_STRINGS) {
    if (source.includes(text)) {
      errors.push(`${file}: inlines the "${constant}" class string. Import the constant from components/shared/filters/styles.`);
    }
  }
}

// ---- 4. Duplication ratchet -------------------------------------------------------------------
for (const [name, allowed] of Object.entries(DUPLICATION_RATCHET)) {
  let found = 0;
  for (const file of SEARCHED_FOR_DUPES) {
    if (!existsSync(join(ROOT, file))) continue;
    if (declaresComponent(read(file), name)) found += 1;
  }
  if (found > allowed) {
    errors.push(`\`${name}\` now has ${found} definitions (was ${allowed}). Unify it or update DUPLICATION_RATCHET deliberately.`);
  } else if (found < allowed) {
    notes.push(`\`${name}\` is down to ${found} definitions (ratchet says ${allowed}) — lower it in ${rel(fileURLToPath(import.meta.url))}.`);
  } else if (found > 1) {
    notes.push(`\`${name}\`: ${found} definitions, known debt.`);
  }
}

// ---- report -----------------------------------------------------------------------------------
for (const note of notes) console.log(`note: ${note}`);

if (errors.length) {
  console.error(`\nshared-ui check failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nSee components/shared/filters/README.md for what belongs where.\n");
  process.exit(1);
}

console.log(`shared-ui check passed (${SURFACES.length} surfaces, ${Object.keys(OWNED_COMPONENTS).length} shared components).`);
