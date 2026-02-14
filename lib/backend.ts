export const BACKEND_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");

export function backendUrl(path: string) {
  if (!BACKEND_BASE) throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
  return `${BACKEND_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}