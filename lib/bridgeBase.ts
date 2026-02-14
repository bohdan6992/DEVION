const DEFAULT_LOCAL = "http://localhost:5197";

function isBrowser() {
  return typeof window !== "undefined";
}

function stripTrailingSlashes(x: string) {
  return (x || "").replace(/\/+$/, "");
}

function readBridgeFromLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("bridge"); // same param
    return v ? stripTrailingSlashes(v) : null;
  } catch {
    return null;
  }
}

function readBridgeFromStorage(): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem("bridgeApiBase");
    return v ? stripTrailingSlashes(v) : null;
  } catch {
    return null;
  }
}

function writeBridgeToStorage(v: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem("bridgeApiBase", stripTrailingSlashes(v));
  } catch {}
}

export function getBridgeBaseUrl(): string {
  // 1) explicit env override
  const envBase = stripTrailingSlashes(process.env.NEXT_PUBLIC_BRIDGE_API || "");
  if (envBase) return envBase;

  // 2) browser: ?bridge= or localStorage else localhost
  if (isBrowser()) {
    const fromUrl = readBridgeFromLocation();
    if (fromUrl) {
      writeBridgeToStorage(fromUrl);
      return fromUrl;
    }
    const fromLs = readBridgeFromStorage();
    if (fromLs) return fromLs;
    return DEFAULT_LOCAL;
  }

  // 3) server/SSR: do not fallback to localhost
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
  return `${base}${path}`;
}