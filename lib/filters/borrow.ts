/**
 * Borrow availability, from the feed's `B5ETB` column.
 *
 * Three values observed live: YES (1086), NO (420), ITB (68). The ITB button drops "ITB" rows, the
 * HARD button drops "NO" rows; "YES" survives both, so pressing both still leaves the freely
 * borrowable names.
 *
 * The field arrives spelled differently depending on the surface: the live signal DTO carries the
 * tape row verbatim under `Meta` with the feed's own casing (`B5ETB`), while the Scanner reads a
 * serialized C# DTO where `B5Etb` camel-cases to `b5Etb`. Property access in JS is case-sensitive,
 * so a filter that probes one spelling silently rejects nothing on the other surface — which is
 * how ITB/HARD came to be dead on the Scanner. One reader, every spelling.
 */

const KEYS = ["b5etb", "b5_etb", "etb"];

export function readBorrowStatus(row: any): string {
  if (row == null) return "";

  for (const container of [row, row.meta, row.Meta]) {
    if (!container || typeof container !== "object") continue;
    for (const key of Object.keys(container)) {
      if (!KEYS.includes(key.toLowerCase())) continue;
      const value = container[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text.toUpperCase();
    }
  }

  return "";
}

/**
 * True when the row must be dropped by the ITB/HARD toggles.
 *
 * A row with NO borrow status is dropped too: "unknown" is not "freely borrowable", and the bridge
 * (`SonarSignalFilter`) already rejects it — the rule is absolute across every surface.
 */
export function rowExcludedByBorrow(row: any, excludeItb: boolean, excludeHard: boolean): boolean {
  if (!excludeItb && !excludeHard) return false;
  const status = readBorrowStatus(row);
  if (!status) return true;
  if (excludeItb && status === "ITB") return true;
  if (excludeHard && status === "NO") return true;
  return false;
}
