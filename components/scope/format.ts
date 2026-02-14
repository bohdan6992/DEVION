export function fmt(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    // integers
    if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
    // small numbers
    if (Math.abs(v) < 1) return v.toFixed(4);
    // normal
    return v.toFixed(3);
  }
  return String(v);
}

export function labelize(k: string): string {
  // keep keys like W/L, bat% as-is
  if (k.includes("/") || k.includes("%")) return k;
  return k.replace(/_/g, " ");
}
