// lib/bridgeBase.ts

const DEFAULT_LOCAL = "http://localhost:5197";

function isBrowser() {
  return typeof window !== "undefined";
}

function stripTrailingSlashes(x: string) {
  return (x || "").replace(/\/+$/, "");
}

function sanitizeBridgeBase(x: string | null | undefined): string | null {
  const raw = (x ?? "").trim();
  if (!raw) return null;

  const s = stripTrailingSlashes(raw);

  // Must be absolute URL and only http/https
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // normalize: remove trailing slashes already done
    return stripTrailingSlashes(u.toString());
  } catch {
    return null;
  }
}

function readBridgeFromLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("bridge");
    return sanitizeBridgeBase(v);
  } catch {
    return null;
  }
}

function readBridgeFromStorage(): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem("bridgeApiBase");
    return sanitizeBridgeBase(v);
  } catch {
    return null;
  }
}

function writeBridgeToStorage(v: string) {
  if (!isBrowser()) return;
  const s = sanitizeBridgeBase(v);
  if (!s) return;
  try {
    window.localStorage.setItem("bridgeApiBase", s);
  } catch {}
}

export function getBridgeBaseUrl(): string {
  // 1) env override (public tunnel etc.)
  const envBase = sanitizeBridgeBase(process.env.NEXT_PUBLIC_BRIDGE_API);
  if (envBase) return envBase;

  // 2) browser: ?bridge= -> localStorage -> DEFAULT_LOCAL (✅ як у Tape)
  if (isBrowser()) {
    const fromUrl = readBridgeFromLocation();
    if (fromUrl) {
      writeBridgeToStorage(fromUrl);
      return fromUrl;
    }
    const fromLs = readBridgeFromStorage();
    if (fromLs) return fromLs;

    // DEFAULT_LOCAL should also be valid (http://localhost:5197)
    return sanitizeBridgeBase(DEFAULT_LOCAL) || DEFAULT_LOCAL;
  }

  // 3) SSR/server: no localhost fallback
  return "";
}

export function bridgeUrl(path: string) {
  const base = getBridgeBaseUrl();
  if (!base) {
    throw new Error(
      "BridgeClient: base URL is not set on the server. " +
        "Use client-side fetch (browser) or set NEXT_PUBLIC_BRIDGE_API to a public URL."
    );
  }

  // normalize path
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${stripTrailingSlashes(base)}${p}`;
}